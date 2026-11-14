// upnp.mjs - asking the home router to let one port through, the two ways routers offer: UPnP (most routers) and NAT-PMP (Apple's,
// and many others). Both are asked on the local network only; nothing outside it is contacted, and nothing here needs a password.
//   openPort({ port, lan })  ->  { ok, how, ip, port, lease } | { ok: false, why }
//   closePort(mapping)       gives the port back
// What this cannot tell: whether the port is REACHABLE from outside. A router can accept the request and still sit behind the
// provider's own shared address. shared() says when the address the router reports is not a public one.
import dgram from 'node:dgram';
import http from 'node:http';
import { sh } from './host.mjs';

const PRIVATE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/;
const CGNAT = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
export const isLan = (ip) => PRIVATE.test(String(ip));
// an address that is the provider's or the router's own, not the internet's: a phone outside cannot reach it
export const shared = (ip) =>
  CGNAT.test(String(ip))
    ? 'provider'
    : PRIVATE.test(String(ip))
      ? 'private'
      : !/^\d+\.\d+\.\d+\.\d+$/.test(String(ip)) || /^0\./.test(String(ip))
        ? 'unknown'
        : '';

// ---------- UPnP: find the router (SSDP), read what it offers, ask (SOAP) ----------
const SSDP = () => {
  const o = process.env.FO_UPNP_SSDP;
  if (o) {
    const [host, port] = o.split(':');
    return { host, port: Number(port) };
  }
  return { host: '239.255.255.250', port: 1900 };
};
function discover(ms = 2500) {
  return new Promise((ok) => {
    const found = new Set();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const to = SSDP();
    const done = () => {
      try {
        sock.close();
      } catch {
        /* closed */
      }
      ok([...found]);
    };
    sock.on('error', done);
    let soon = null;
    sock.on('message', (msg) => {
      const m = /^location:\s*(\S+)/im.exec(String(msg));
      if (m) {
        found.add(m[1]);
        if (!soon) soon = setTimeout(done, 250);
      }
    }); // a router answered: a moment for any other, then on
    sock.bind(0, () => {
      for (const st of [
        'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
        'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
        'urn:schemas-upnp-org:service:WANIPConnection:1',
      ])
        sock.send(
          'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ' +
            st +
            '\r\n\r\n',
          to.port,
          to.host,
          () => {},
        );
      setTimeout(done, ms);
    });
  });
}
const ask = (url, { method = 'GET', headers = {}, body = '', ms = 5000 } = {}) =>
  new Promise((ok) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return ok({ status: 0, text: '' });
    }
    if (u.protocol !== 'http:' || !(isLan(u.hostname) || process.env.FO_UPNP_SSDP)) return ok({ status: 0, text: '' }); // a router is on this network: an answer pointing anywhere else is not followed
    const req = http.request(
      {
        host: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method,
        headers: { ...headers, 'content-length': Buffer.byteLength(body) },
        timeout: ms,
      },
      (res) => {
        let t = '';
        res.setEncoding('utf8');
        res.on('data', (d) => {
          if (t.length < 200000) t += d;
        });
        res.on('end', () => ok({ status: res.statusCode, text: t }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => ok({ status: 0, text: '' }));
    req.end(body);
  });
const tag = (xml, name) => (new RegExp('<(?:\\w+:)?' + name + '[^>]*>([^<]*)<', 'i').exec(xml) || [])[1] || '';
let known = null; // the router found last time: asked directly while it keeps answering, looked for again when it does not
async function gateway(fresh) {
  if (known && !fresh && Date.now() - known.at < 3600000) return known;
  known = null;
  for (const loc of await discover()) {
    const d = await ask(loc);
    if (d.status !== 200) continue;
    for (const part of d.text.split(/<service>/i).slice(1)) {
      const type = tag(part, 'serviceType');
      if (!/WAN(?:IP|PPP)Connection:[12]$/.test(type)) continue;
      const base = tag(d.text, 'URLBase') || loc;
      let control;
      try {
        control = new URL(tag(part, 'controlURL'), base).href;
      } catch {
        continue;
      }
      return (known = { type, control, at: Date.now() });
    }
  }
  return null;
}
async function soap(gw, action, args = {}) {
  const body =
    '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:' +
    action +
    ' xmlns:u="' +
    gw.type +
    '">' +
    Object.entries(args)
      .map(([k, v]) => '<' + k + '>' + String(v).replace(/[<>&]/g, '') + '</' + k + '>')
      .join('') +
    '</u:' +
    action +
    '></s:Body></s:Envelope>';
  const r = await ask(gw.control, {
    method: 'POST',
    headers: { 'content-type': 'text/xml; charset="utf-8"', soapaction: '"' + gw.type + '#' + action + '"' },
    body,
  });
  return {
    ok: r.status === 200,
    text: r.text,
    code: Number(tag(r.text, 'errorCode')) || 0,
    why: tag(r.text, 'errorDescription'),
  };
}
async function viaUpnp({ port, lan, lease }) {
  let router = await gateway();
  let ext = router && (await soap(router, 'GetExternalIPAddress'));
  if (router && !ext.ok) {
    router = await gateway(true);
    ext = router && (await soap(router, 'GetExternalIPAddress'));
  } // the one remembered stopped answering: look again
  if (!router) return { ok: false, why: 'no router answered a UPnP request' };
  const ip = tag(ext.text, 'NewExternalIPAddress');
  for (let i = 0, want = port; i < 4; i++, want++) {
    let r = await soap(router, 'AddPortMapping', {
      NewRemoteHost: '',
      NewExternalPort: want,
      NewProtocol: 'TCP',
      NewInternalPort: port,
      NewInternalClient: lan,
      NewEnabled: 1,
      NewPortMappingDescription: 'Family Office',
      NewLeaseDuration: lease,
    });
    if (!r.ok && r.code === 725)
      r = await soap(router, 'AddPortMapping', {
        NewRemoteHost: '',
        NewExternalPort: want,
        NewProtocol: 'TCP',
        NewInternalPort: port,
        NewInternalClient: lan,
        NewEnabled: 1,
        NewPortMappingDescription: 'Family Office',
        NewLeaseDuration: 0,
      }); // a router that only keeps mappings with no end
    if (r.ok) return { ok: true, how: 'upnp', ip, port: want, lease, gw: router };
    if (r.code !== 718)
      return {
        ok: false,
        why: 'the router refused the request' + (r.why ? ': ' + r.why : r.code ? ' (' + r.code + ')' : ''),
      }; // 718: that outside port is taken; the next one is tried
  }
  return { ok: false, why: 'the router has that port, and the next few, in use for something else' };
}

// ---------- NAT-PMP: one small packet to the router ----------
async function routerIp() {
  if (process.env.FO_NATPMP) return process.env.FO_NATPMP;
  const r =
    process.platform === 'darwin'
      ? await sh('route', ['-n', 'get', 'default'])
      : await sh('ip', ['route', 'show', 'default']);
  return (
    (/gateway:\s*(\d+\.\d+\.\d+\.\d+)/.exec(r.out) || /default via (\d+\.\d+\.\d+\.\d+)/.exec(r.out) || [])[1] || ''
  );
}
function pmp(to, packet, ms = 1500) {
  return new Promise((ok) => {
    const [host, port] = to.split(':');
    const sock = dgram.createSocket('udp4');
    const t = setTimeout(() => {
      try {
        sock.close();
      } catch {
        /* closed */
      }
      ok(null);
    }, ms);
    sock.on('error', () => {
      clearTimeout(t);
      try {
        sock.close();
      } catch {
        /* closed */
      }
      ok(null);
    });
    sock.on('message', (m) => {
      clearTimeout(t);
      sock.close();
      ok(m);
    });
    sock.send(packet, Number(port) || 5351, host);
  });
}
async function viaPmp({ port, lease }) {
  const gw = await routerIp();
  if (!gw) return { ok: false, why: "the router's address could not be read" };
  const a = await pmp(gw, Buffer.from([0, 0]));
  if (!a || a.length < 12 || a.readUInt16BE(2) !== 0)
    return { ok: false, why: 'the router did not answer a NAT-PMP request' };
  const ip = [...a.subarray(8, 12)].join('.');
  const q = Buffer.alloc(12);
  q[1] = 2;
  q.writeUInt16BE(port, 4);
  q.writeUInt16BE(port, 6);
  q.writeUInt32BE(lease, 8);
  const m = await pmp(gw, q);
  if (!m || m.length < 16 || m.readUInt16BE(2) !== 0)
    return { ok: false, why: 'the router refused the NAT-PMP request' };
  return { ok: true, how: 'natpmp', ip, port: m.readUInt16BE(10), lease: m.readUInt32BE(12), gw };
}

export async function openPort({ port, lan, lease = 7200 }) {
  if (process.env.FO_NO_NET === '1' && !process.env.FO_UPNP_SSDP && !process.env.FO_NATPMP)
    return { ok: false, why: 'the network is not being used (offline)' };
  const u = await viaUpnp({ port, lan, lease });
  if (u.ok) return u;
  const p = await viaPmp({ port, lease });
  if (p.ok) return p;
  return { ok: false, why: u.why + ', and ' + p.why };
}
export async function closePort(m) {
  if (!m || !m.ok) return;
  if (m.how === 'upnp')
    await soap(m.gw, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: m.port, NewProtocol: 'TCP' });
  else if (m.how === 'natpmp') {
    const q = Buffer.alloc(12);
    q[1] = 2;
    q.writeUInt16BE(m.port, 4);
    await pmp(m.gw, q);
  } // a lifetime of zero gives it back
}
