// link.mjs - THE PHONE LINK: the app on this computer, reached from the customer's own phone. Off until it is switched on.
// The runner itself still answers only on 127.0.0.1. When the link is on, ONE more port listens on the network, and what it lets
// through is decided before any request is read:
//   - it speaks TLS, and both ends are known by their certificate's fingerprint, learned once at pairing. No name is trusted and
//     nobody signs anybody: the phone accepts this computer's certificate and no other, and this computer accepts a paired phone's
//     certificate and no other.
//   - a connection from a certificate that is not paired is dropped as soon as TLS says whose it is. The one exception is while a
//     PAIRING WINDOW is open (ten minutes, opened from the Remote tab): then a stranger may say the window's one-time secret, and
//     nothing else. That only puts its name and a six-digit code on the Remote tab; it is paired when the customer presses Allow.
//   - what a paired phone sends is handed to the runner on 127.0.0.1 as its own page would send it. The owner's panel and the
//     link's own controls (switch, pairing, removing a phone) are refused from a phone: those stay on the computer.
// While the link is on the runner keeps running after its page is closed (a phone may come later); the Remote tab says so.
// Getting through the home router is upnp.mjs. The phone finds the computer by two addresses it was given (this network's, and the
// router's outside one); each time it connects it is told the current ones. When they change, the Remote tab says which phones
// still hold the old ones and what each needs.
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { access, readFile, writeFile } from 'node:fs/promises';
import { fingerprint, selfSigned, b64url } from './cert.mjs';
import { closePort, isLan, openPort, shared } from './upnp.mjs';
import { PACKAGE, install, open as openOnPhone, phones } from './adb.mjs';

const WINDOW_MS = 10 * 60000;
const clean = (s, n = 40) =>
  String(s == null ? '' : s)
    .replace(/[^\w .()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
// the page a phone's browser opens when its camera reads the code: it only hands the link to the app. It holds no secret itself;
// the secret is in the part of the address a browser never sends.
const PAIR_PAGE =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pair with Family Office</title>' +
  '<body style="margin:0;padding:28px 22px;background:#05070c;color:#e9eef5;font:17px/1.5 system-ui,sans-serif"><h1 style="font-size:28px;margin:0 0 12px">Pair this phone</h1>' +
  '<p id="t">This opens the Family Office app and asks your computer to let this phone in. You then confirm it on the computer.</p>' +
  '<p><a id="go" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#34d399;color:#04251c;font-weight:700;text-decoration:none">Open the Family Office app</a></p>' +
  '<p style="color:#a3afc1;font-size:15px">If nothing opens, the app is not on this phone yet. Put it on the phone first (the Remote tab on your computer says how), then scan the code again.</p>' +
  '<script>var q=location.hash.slice(1),go=document.getElementById("go");if(!/^[A-Za-z0-9._~:%&=,-]+$/.test(q)){document.getElementById("t").textContent="This link carries no pairing code. Scan the code on the Remote tab again.";go.remove()}else go.href="intent://pair?"+q+"&h="+location.host+"#Intent;scheme=familyoffice;package=' +
  PACKAGE +
  ';end"</script></body></html>';

export function createLink({ root, stateDir, port, disk, save }) {
  const linkState = () => {
    const d = disk();
    return d.link || (d.link = { on: false, port: 0, fp: '', devices: [], addr: null });
  };
  const keyFile = path.join(stateDir, 'link.key');
  const certFile = path.join(stateDir, 'link.crt');
  const APK = process.env.FO_LINK_APK || path.join(root, 'android', 'familyoffice.apk');
  let id = null;
  let front = null;
  let pair = null;
  let timer = null;
  let mapping = null;
  let busy = false;
  const live = new Map(); // a paired phone's fingerprint -> its open connections, so removing the phone ends them at once
  const computer = () =>
    clean(
      os
        .hostname()
        .replace(/\.local$/, '')
        .replace(/-/g, ' '),
      30,
    ) || 'Your computer';
  // this computer's address on the home network: the one its traffic to the outside leaves from (asked of the system by pointing a
  // socket outward, which sends nothing), not the first one in the list, which can be a bridge to another machine or a virtual one
  const anyLan = () => {
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal && isLan(a.address)) return a.address;
    return '';
  };
  const lanIp = () =>
    new Promise((ok) => {
      if (process.env.FO_LINK_LAN) return ok(process.env.FO_LINK_LAN);
      const s = dgram.createSocket('udp4');
      const end = (v) => {
        try {
          s.close();
        } catch {
          /* closed */
        }
        ok(v);
      };
      s.on('error', () => end(anyLan()));
      s.connect(9, '203.0.113.1', () => {
        let a = '';
        try {
          a = s.address().address;
        } catch {
          /* none */
        }
        end(isLan(a) ? a : anyLan());
      });
    });

  async function identity() {
    // this computer's key and certificate: made once, kept beside the state, the key readable by this user only
    if (id) return id;
    try {
      id = { key: await readFile(keyFile, 'utf8'), cert: await readFile(certFile, 'utf8') };
      id.fp = fingerprint(id.cert);
    } catch {
      const made = selfSigned('Family Office on ' + computer());
      await writeFile(keyFile, made.key, { mode: 0o600 });
      await writeFile(certFile, made.cert);
      id = { key: made.key, cert: made.cert, fp: made.fingerprint };
    }
    linkState().fp = id.fp;
    return id;
  }

  // ---------- what a paired phone may ask: everything its own page asks, except the owner's panel and this link's controls ----------
  const answer = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const where = () => {
    const a = linkState().addr || {};
    return { lan: a.lan || '', pub: a.pub || '', name: computer() };
  };
  const inner = http.createServer((req, res) => {
    const dev = linkState().devices.find((d) => d.fp === req.socket.fp);
    if (!dev || !linkState().on) return req.socket.destroy(); // removed since it connected
    const p = new URL(req.url, 'http://x').pathname;
    dev.seen = Date.now();
    if (p === '/link/ping') return answer(res, 200, { ok: true, name: computer() });
    if (p === '/pair/state' || p === '/pair') {
      req.resume();
      return answer(res, 200, { state: 'paired' });
    } // the phone that was just let in asks how it went; one that is already paired and asks again is told so
    if (p === '/api/link/where') {
      dev.knows = { lan: where().lan, pub: where().pub };
      save();
      return answer(res, 200, where());
    }
    if (/^\/api\/(?:owner|link)(?:\/|$)/.test(p) || /^\/owner(?:[./]|$)/.test(p))
      return answer(res, 403, { error: 'That is done on the computer itself, not from a phone.' });
    const headers = { ...req.headers, host: '127.0.0.1:' + port, 'x-fo-phone': dev.id };
    delete headers.origin;
    delete headers.referer;
    const up = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on('close', () => up.destroy());
    req.pipe(up);
  });
  // ---------- what a stranger may say, and only while a pairing window is open: the window's secret, then ask how it went ----------
  const outer = http.createServer((req, res) => {
    const fingerprint = req.socket.fp;
    const p = new URL(req.url, 'http://x').pathname;
    if (!pair || Date.now() > pair.until) return req.socket.destroy();
    if (req.method === 'GET' && p === '/pair/state') {
      const w = pair.wants.find((x) => x.fp === fingerprint);
      return answer(res, 200, { state: w ? w.state : 'unknown' });
    }
    if (req.method !== 'POST' || p !== '/pair') return req.socket.destroy();
    let n = 0;
    const parts = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > 600) req.socket.destroy();
      else parts.push(c);
    });
    req.on('end', () => {
      let b = null;
      try {
        b = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        /* not ours */
      }
      if (!b || !same(b.k || '', pair.secret)) {
        if (++pair.bad >= 5) pair = null;
        return answer(res, 403, { error: 'That pairing code is not the one on the computer. Scan it again.' });
      } // five wrong tries close the window
      const code = String(
        parseInt(
          crypto
            .createHash('sha256')
            .update(id.fp + fingerprint + pair.secret)
            .digest('hex')
            .slice(0, 8),
          16,
        ) % 1000000,
      ).padStart(6, '0');
      pair.wants = [
        ...pair.wants.filter((x) => x.fp !== fingerprint),
        { fp: fingerprint, name: clean(b.name) || 'A phone', code, at: Date.now(), state: 'waiting' },
      ].slice(-6);
      answer(res, 200, { state: 'waiting', code, computer: computer() });
    });
  });

  function listen(at) {
    return new Promise((ok, reject) => {
      const secure = tls.createServer({
        key: id.key,
        cert: id.cert,
        requestCert: true,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        handshakeTimeout: 10000,
      });
      secure.on('tlsClientError', () => {});
      secure.on('secureConnection', (s) => {
        // TLS has said whose certificate this is: decide before anything is read
        s.on('error', () => {});
        const peer = s.getPeerCertificate();
        const fp = peer && peer.raw ? fingerprint(peer.raw) : '';
        if (fp && linkState().devices.some((d) => d.fp === fp)) {
          s.fp = fp;
          if (!live.has(fp)) live.set(fp, new Set());
          live.get(fp).add(s);
          s.on('close', () => live.get(fp) && live.get(fp).delete(s));
          return inner.emit('connection', s);
        }
        if (fp && pair && Date.now() < pair.until) {
          s.fp = fp;
          s.setTimeout(30000, () => s.destroy());
          return outer.emit('connection', s);
        } // a stranger gets half a minute to say its one thing
        s.destroy();
      });
      const srv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.setTimeout(15000, () => sock.destroy());
        sock.once('readable', () => {
          const first = sock.read();
          if (!first) return sock.destroy();
          sock.unshift(first);
          sock.setTimeout(0);
          if (first[0] === 0x16) return secure.emit('connection', sock); // TLS
          // not TLS: the one plain page, for a phone's browser that has just read the code, and only while a pairing window is open
          if (pair && Date.now() < pair.until && /^GET \/pair[ ?]/.test(first.toString('latin1', 0, 12)))
            return sock.end(
              'HTTP/1.1 200 OK\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: ' +
                Buffer.byteLength(PAIR_PAGE) +
                '\r\ncache-control: no-store\r\nconnection: close\r\n\r\n' +
                PAIR_PAGE,
            );
          sock.destroy();
        });
      });
      srv.once('error', reject);
      srv.listen(at, '0.0.0.0', () => {
        srv.removeListener('error', reject);
        srv.on('error', () => {});
        ok(srv);
      });
    });
  }

  // ---------- where the phone finds this computer, and noticing when that changes ----------
  const SAYS = {
    provider:
      'Your router opened the port, but your internet provider shares one address among many customers. A phone away from this Wi-Fi cannot reach this computer directly.',
    private: 'Your router opened the port, but it sits behind another router, so nothing outside reaches it.',
    unknown: 'Your router opened the port but did not say what its outside address is.',
  };
  let reaching = null; // one look at a time: a slow router must not be asked twice at once
  const reach = () =>
    reaching ||
    (reaching = look().finally(() => {
      reaching = null;
    }));
  async function look() {
    const d = linkState();
    const was = d.addr;
    const lan = await lanIp();
    const m = await openPort({ port: d.port, lan });
    mapping = m.ok ? m : null;
    const why = m.ok ? shared(m.ip) : '';
    const pub = m.ok && !why ? m.ip + ':' + m.port : '';
    d.addr = {
      lan: lan ? lan + ':' + d.port : '',
      pub,
      how: m.ok ? m.how : '',
      at: Date.now(),
      note: pub
        ? 'Opened on your router' +
          (m.how === 'upnp' ? ' (UPnP)' : ' (NAT-PMP)') +
          '. Whether it can be reached from outside is only known once a phone away from this Wi-Fi connects.'
        : m.ok
          ? SAYS[why]
          : 'Your router did not open a port (' +
            m.why +
            '). Phones work on this Wi-Fi. From outside, the port has to be opened in the router by hand: TCP ' +
            d.port +
            ' to ' +
            (lan || 'this computer') +
            '.',
    };
    if (was && (was.pub !== d.addr.pub || was.lan !== d.addr.lan))
      d.changed = { at: Date.now(), from: { lan: was.lan, pub: was.pub } };
    await save();
  }
  // a phone is BEHIND when the addresses it was last told are not the ones in use now
  const behind = (dev) => {
    const a = linkState().addr || {};
    const k = dev.knows || {};
    return k.lan !== (a.lan || '') || k.pub !== (a.pub || '');
  };
  const needs = (dev) => {
    const a = linkState().addr || {};
    const k = dev.knows || {};
    return !behind(dev) ? '' : k.pub && k.pub === a.pub ? 'open' : k.lan && k.lan === a.lan ? 'home' : 'pair';
  }; // open: it catches up the next time it connects; home: open the app once on this Wi-Fi; pair: scan the code again

  async function turn(on) {
    if (busy) throw new Error('The link is already being switched.');
    busy = true;
    try {
      const d = linkState();
      if (on && !front) {
        await identity();
        let at = Number(process.env.FO_LINK_PORT) || d.port || 47810;
        let last = null;
        for (let i = 0; i < 5 && !front; i++, at++) {
          try {
            front = await listen(at);
            d.port = at;
          } catch (e) {
            last = e;
          }
        }
        if (!front)
          throw new Error(
            'No port could be opened on this computer for the link: ' + String((last && last.message) || last),
          );
        d.on = true;
        await reach();
        timer = setInterval(() => reach().catch(() => {}), Number(process.env.FO_LINK_RECHECK_MS) || 15 * 60000);
      }
      if (!on) {
        clearInterval(timer);
        timer = null;
        pair = null;
        d.on = false;
        if (front) {
          front.close();
          front = null;
        }
        for (const set of live.values()) for (const s of set) s.destroy();
        live.clear();
        await closePort(mapping).catch(() => {});
        mapping = null;
        await save();
      }
    } finally {
      busy = false;
    }
    return status();
  }
  const params = () =>
    'k=' +
    pair.secret +
    '&f=' +
    id.fp +
    '&p=' +
    ((linkState().addr && linkState().addr.pub) || '') +
    '&n=' +
    encodeURIComponent(computer());
  function openWindow() {
    if (!linkState().on || !front) throw new Error('Switch Remote on first.');
    if (!pair || Date.now() > pair.until)
      pair = { secret: b64url(crypto.randomBytes(16)), until: Date.now() + WINDOW_MS, wants: [], bad: 0 };
    else pair.until = Date.now() + WINDOW_MS;
  }
  async function decide(fp, ok) {
    const w = pair && pair.wants.find((x) => x.fp === fp && x.state === 'waiting');
    if (!w) throw new Error('That request is no longer waiting.');
    if (!ok) {
      w.state = 'refused';
      return status();
    }
    const d = linkState();
    d.devices = [
      ...d.devices.filter((x) => x.fp !== fp),
      {
        id: b64url(crypto.randomBytes(6)),
        fp,
        name: w.name,
        at: Date.now(),
        seen: 0,
        knows: { lan: (d.addr && d.addr.lan) || '', pub: (d.addr && d.addr.pub) || '' },
      },
    ];
    w.state = 'paired';
    await save();
    return status();
  }
  async function revoke(devId) {
    const d = linkState();
    const dev = d.devices.find((x) => x.id === devId);
    if (!dev) throw new Error('That phone is not paired.');
    d.devices = d.devices.filter((x) => x !== dev);
    for (const s of live.get(dev.fp) || []) s.destroy();
    live.delete(dev.fp);
    await save();
    return status();
  }
  async function sideload(serial) {
    if (!linkState().on) throw new Error('Switch Remote on first.');
    const ph = (await phones()).list.find((x) => x.serial === serial);
    if (!ph) throw new Error('That phone is no longer plugged in.');
    if (ph.state !== 'ready') throw new Error(ph.says + '.');
    const put = await install(serial, APK);
    if (!put.ok) throw new Error(put.why);
    openWindow();
    const a = linkState().addr || {};
    const h = ph.emulator ? '10.0.2.2:' + linkState().port : a.lan; // an emulator reaches this computer at its own fixed address
    const started = await openOnPhone(serial, 'familyoffice://pair?' + params() + '&h=' + h);
    return {
      ...(await status()),
      said: started.ok
        ? 'The app is on ' +
          ph.name +
          ' and has asked to pair. Check the code on the phone against the one below, then press Allow.'
        : 'The app is on ' +
          ph.name +
          '. ' +
          started.why +
          ' Open the app on the phone and scan the code below instead.',
    };
  }
  async function status({ usb = true } = {}) {
    const d = linkState();
    const a = d.addr || {};
    const now = Date.now();
    if (pair && now > pair.until) pair = null;
    const devices = d.devices.map((x) => ({
      id: x.id,
      name: x.name,
      at: x.at,
      seen: x.seen || 0,
      needs: d.on ? needs(x) : '',
    }));
    if (d.changed && !devices.some((x) => x.needs)) {
      d.changed = null;
    } // every phone has the new addresses: nothing left to say
    return {
      on: !!d.on && !!front,
      port: d.port || 0,
      computer: computer(),
      reach: d.on ? { lan: a.lan || '', pub: a.pub || '', how: a.how || '', note: a.note || '', at: a.at || 0 } : null,
      changed: d.on && d.changed ? d.changed : null,
      devices,
      pairing: pair
        ? {
            until: pair.until,
            link: a.lan ? 'http://' + a.lan + '/pair#' + params() : '',
            wants: pair.wants
              .filter((w) => w.state === 'waiting')
              .map((w) => ({ fp: w.fp, name: w.name, code: w.code, at: w.at })),
          }
        : null,
      app: {
        built: await access(APK).then(
          () => true,
          () => false,
        ),
        package: PACKAGE,
      },
      usb: usb ? await phones() : null,
    };
  }
  return {
    status,
    turn,
    openWindow,
    decide,
    revoke,
    sideload,
    on: () => !!linkState().on,
    release: () => closePort(mapping).catch(() => {}),
    boot: async () => {
      if (linkState().on && !front)
        await turn(true).catch(() => {
          linkState().on = false;
        });
    },
  };
}
