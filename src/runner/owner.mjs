// owner.mjs - THE OWNER'S PANEL, behind /api/owner/. It exists only when the app is run from its own source folder (node server.mjs),
// never in a copy a customer installed: that copy does not ship this file, and the runner does not load it when it was started by
// the launcher. Like everything else it answers on 127.0.0.1 only, and only to its own page.
// What it does is the owner's desk work, each as one button:
//   codes        make an access or referral code (the code is shown once; only its slow hash is written to js/billing.js), list, remove
//   locks        set the Pro and Team lock addresses, and read each lock live: price, duration, keys sold, what is waiting in it,
//                and the two settings worth a warning (it can be transferred; a holder can cancel for a refund)
//   billing      switch enforcement on and off, with a warning when that would lock the owner out
//   remote       switch the Remote tab on and off for this version of the product (js/product.js)
//   wallet       which plan a wallet holds, and until when (for answering a customer)
//   bundle       build dist/, and say whether the source has changed since; with the day's counts, add the landing page's reading first
//   pin          send dist/ to Pinata as one folder and give back its IPFS address; the Pinata key is kept on this machine only
//   publish      build, pin, and work out the one ENS transaction that points the name at the new address, for the browser's wallet to sign
//   self-test    run the runner's own checks and report the count
// It edits js/billing.js in place and the running app picks the change up at once.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashCode, lockFacts, normalCode, useBilling } from './license.mjs';
import { call, encode, isAddress, keccak256, selector, uint } from './chain.mjs';

export function createOwner({ root, github, stateDir, onProduct = () => {} }) {
  // WHAT THIS VERSION SHOWS (js/product.js): read as it is on disk now, and edited in place like the plans. The runner is told at once.
  const PRODUCT_FILE = process.env.FO_PRODUCT_FILE || path.join(root, 'js', 'product.js');
  const productNow = async () =>
    (await import(pathToFileURL(PRODUCT_FILE).href + '?p=' + Date.now() + '-' + Math.random().toString(36).slice(2)))
      .PRODUCT;
  const setRemote = async (on) => {
    const src = await readFile(PRODUCT_FILE, 'utf8');
    const re = /(\n  remote: )(?:true|false)(,)/;
    if (!re.test(src))
      throw Object.assign(new Error('js/product.js is not laid out the way this panel expects.'), { status: 400 });
    await writeFile(
      PRODUCT_FILE,
      src.replace(re, (m, a, z) => a + (on ? 'true' : 'false') + z),
    );
    const now = await productNow();
    await onProduct(now);
    return now;
  };
  if (process.env.FO_PRODUCT_FILE)
    productNow()
      .then(onProduct)
      .catch(() => {
        /* an unreadable file: what the app started with stands */
      });
  const FILE = process.env.FO_BILLING_FILE || path.join(root, 'js', 'billing.js');
  const GH_FILE = process.env.FO_GITHUB_FILE || path.join(root, 'js', 'github.js');
  const ghNow = async () =>
    (await import(pathToFileURL(GH_FILE).href + '?g=' + Date.now() + '-' + Math.random().toString(36).slice(2))).GITHUB;
  // the Client ID of the owner's GitHub OAuth App (public by design; there is no secret)
  async function setClientId(id) {
    id = String(id || '').trim();
    if (id && !/^[A-Za-z0-9._-]{10,60}$/.test(id))
      throw fail(
        "That does not look like a Client ID. It is on the OAuth App's page, and looks like Iv1.0123456789abcdef or Ov23liAbCdEfGhIjKlMn.",
      );
    const src = await readFile(GH_FILE, 'utf8');
    const re = /(\n  clientId: ')[^']*(')/;
    if (!re.test(src)) throw fail('js/github.js is not laid out the way this panel expects.');
    await writeFile(
      GH_FILE,
      src.replace(re, (m, a, z) => a + id + z),
    );
    if (github) github.use(await ghNow());
  }
  let seq = 0;
  const stamp = () => '?t=' + Date.now() + '-' + ++seq; // never the same twice: two reads in one millisecond must not get the same cached copy
  const fresh = async () => (await import(pathToFileURL(FILE).href + stamp())).BILLING; // read it as it is on disk now
  if (process.env.FO_BILLING_FILE)
    fresh()
      .then(useBilling)
      .catch(() => {
        /* an unreadable file: the plans the app started with stand */
      }); // another plans file was named: the running copy follows it from the start
  const edit = async (fn) => {
    const src = await readFile(FILE, 'utf8');
    const out = fn(src);
    if (out == null) throw new Error('js/billing.js is not laid out the way this panel expects.');
    if (out !== src) {
      await writeFile(FILE, out);
      useBilling(await fresh());
    }
    return fresh();
  };
  const fail = (m, status = 400) => Object.assign(new Error(m), { status });
  const codesOf = (b) =>
    (b.codes || []).map(({ label, tier, days, until, referrer }) => ({
      label,
      tier,
      days: days || null,
      until: until || null,
      referrer: referrer || '',
    }));
  const codeLines = (src) => {
    const open = src.indexOf('  codes: [');
    const close = src.indexOf('\n  ],', open);
    return open < 0 || close < 0
      ? null
      : {
          open,
          close,
          lines: src
            .slice(open + 10, close)
            .split('\n')
            .filter((l) => l.trim()),
        };
  };
  const withLines = (src, c, lines) =>
    src.slice(0, c.open + 10) + (lines.length ? '\n' + lines.join('\n') : '') + src.slice(c.close);

  async function addCode({ tier, label, days, until, referrer, own }) {
    const b = await fresh();
    label = String(label || '').trim();
    referrer = String(referrer || '').trim();
    days = days ? Number(days) : null;
    until = String(until || '').trim() || null;
    const sold = Object.keys(b.tiers).filter((x) => x !== 'free');
    if (!sold.includes(tier))
      throw fail('Choose the tier it opens: ' + sold.map((x) => b.tiers[x].name).join(' or ') + '.');
    if (!/^[a-z0-9][a-z0-9 _-]{0,23}$/i.test(label))
      throw fail('Give it a short label you will recognise, such as launch.');
    if ((b.codes || []).some((c) => c.label === label)) throw fail('There is already a code labelled ' + label + '.');
    if (days != null && !(days > 0 && days < 3660)) throw fail('Days must be a number of days.');
    if (until && Number.isNaN(Date.parse(until))) throw fail('The end date must be a date, like 2027-01-31.');
    if (referrer && !isAddress(referrer)) throw fail('The referrer must be a wallet address.');
    let code = String(own || '').trim();
    let weak = false;
    if (code) {
      if (normalCode(code).length < 6) throw fail('A code needs at least six letters or digits.');
      weak = normalCode(code).length < 12;
    } else {
      const ABC = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
      code = [...randomBytes(20)]
        .map((x) => ABC[x % ABC.length])
        .join('')
        .match(/.{5}/g)
        .join('-');
    }
    const salt = randomBytes(16).toString('hex');
    const hash = hashCode(code, salt);
    const now = await edit((src) => {
      const c = codeLines(src);
      return (
        c &&
        withLines(src, c, [
          ...c.lines,
          "    { label: '" +
            label +
            "', tier: '" +
            tier +
            "', days: " +
            (days == null ? 'null' : days) +
            ', until: ' +
            (until ? "'" + until + "'" : 'null') +
            ", referrer: '" +
            referrer +
            "', salt: '" +
            salt +
            "', hash: '" +
            hash +
            "' },",
        ])
      );
    });
    return { code, weak, codes: codesOf(now) };
  }
  async function removeCode(label) {
    const now = await edit((src) => {
      const c = codeLines(src);
      if (!c) return null;
      const left = c.lines.filter((l) => !l.includes("label: '" + label + "'"));
      if (left.length === c.lines.length) throw fail('No code is labelled ' + label + '.');
      return withLines(src, c, left);
    });
    return { codes: codesOf(now) };
  }
  async function setLocks(given) {
    const want = Object.entries(given || {}).filter(([k]) => /^[a-z]+$/.test(k) && k !== 'free');
    for (const [k, v] of want)
      if (v != null && v !== '' && !isAddress(v)) throw fail('The ' + k + ' lock must be an address, or empty.');
    return edit((src) => {
      let out = src;
      for (const [k, v] of want) {
        if (v == null) continue;
        const re = new RegExp('(\\n    ' + k + ": \\{[^\\n]*lock: ')[^']*(')");
        if (!re.test(out)) return null;
        out = out.replace(re, (m, a, z) => a + v + z);
      }
      return out;
    });
  }
  const setEnforce = (on) =>
    edit((src) => {
      const re = /(\n  enforce: )(?:true|false)(,)/;
      return re.test(src) ? src.replace(re, (m, a, z) => a + (on ? 'true' : 'false') + z) : null;
    });

  // one lock, read live: what it sells, how it is doing, and what to look at
  async function lockReport(tier, lock, plans) {
    if (!isAddress(lock)) return { tier, lock: '', set: false };
    const rpc = plans.chain.rpc;
    const n = async (sig, ...a) => {
      try {
        return uint(await call(rpc, lock, encode(sig, ...a)));
      } catch {
        return null;
      }
    };
    const text = async (sig) => {
      try {
        const x = Buffer.from((await call(rpc, lock, encode(sig))).slice(2), 'hex');
        return x.subarray(64, 64 + Number(uint('0x' + x.subarray(32, 64).toString('hex')))).toString('utf8');
      } catch {
        return '';
      }
    };
    try {
      const facts = await lockFacts(lock, plans);
      const [name, sold, fee, refund, token] = await Promise.all([
        text('name()'),
        n('totalSupply()'),
        n('transferFeeBasisPoints()'),
        n('refundPenaltyBasisPoints()'),
        call(rpc, lock, encode('tokenAddress()')).catch(() => null),
      ]);
      let held = null;
      if (token && !/^0x0{64}$/.test(token)) {
        const erc = '0x' + token.slice(-40);
        const [bal, dec] = await Promise.all([
          call(rpc, erc, encode('balanceOf(address)', lock)).catch(() => null),
          call(rpc, erc, encode('decimals()')).catch(() => null),
        ]);
        if (bal && dec)
          held = (Number(uint(bal)) / 10 ** Number(uint(dec))).toFixed(2) + ' ' + facts.price.split(' ').pop();
      }
      const warn = [];
      if (fee != null && fee < 10000n)
        warn.push(
          'It can be transferred: the transfer fee is ' +
            Number(fee) / 100 +
            '%. For a plan that cannot change hands, turn transfers off in Unlock.',
        );
      if (refund != null && refund < 10000n)
        warn.push(
          'A holder may be able to cancel for a refund, less ' + Number(refund) / 100 + '%. Decide that on purpose.',
        );
      return {
        tier,
        lock,
        set: true,
        name,
        price: facts.price,
        days: facts.days,
        sold: sold == null ? null : Number(sold),
        held,
        warn,
        explorer: plans.chain.explorer + '/address/' + lock,
      };
    } catch (e) {
      return {
        tier,
        lock,
        set: true,
        error: 'It could not be read from ' + plans.chain.name + ': ' + String(e.message).slice(0, 120),
      };
    }
  }
  async function walletReport(address) {
    if (!isAddress(address)) throw fail('That is not a wallet address.');
    const b = await fresh();
    const out = [];
    for (const tier of Object.keys(b.tiers).reverse()) {
      const lock = (b.tiers[tier] || {}).lock;
      if (!isAddress(lock)) continue;
      let holds = false;
      let until = null;
      try {
        holds = uint(await call(b.chain.rpc, lock, encode('getHasValidKey(address)', address))) !== 0n;
        if (holds) {
          const id = uint(await call(b.chain.rpc, lock, encode('tokenOfOwnerByIndex(address,uint256)', address, 0)));
          until = Number(uint(await call(b.chain.rpc, lock, encode('keyExpirationTimestampFor(uint256)', id)))) * 1000;
        }
      } catch (e) {
        if (!holds) {
          out.push({ tier, error: String(e.message).slice(0, 100) });
          continue;
        }
      }
      out.push({ tier, holds, until });
    }
    return { address, plans: out };
  }

  // THE READING the landing page shows (js/pulse.js): the last one, how many there are, and a reading for today when one has been left
  // beside the app as pulse-today.json ({ "date": "YYYY-MM-DD", "proofsDay": n, ... }) by whatever counts them. A reading is added by
  // pulse.mjs, which is the one place that checks it; this only hands it the counts. Adding one is part of building the bundle.
  const PULSE_FILE = process.env.FO_PULSE_FILE || path.join(root, 'js', 'pulse.js');
  const TODAY_FILE = process.env.FO_PULSE_TODAY || path.join(root, 'pulse-today.json');
  async function pulseNow() {
    const m = await import(pathToFileURL(PULSE_FILE).href + stamp());
    const rs = m.PULSE.readings;
    const last = rs[rs.length - 1] || null;
    let today = null;
    try {
      const t = JSON.parse(await readFile(TODAY_FILE, 'utf8'));
      if (
        t &&
        /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
        (!last || t.date > last.date) &&
        m.KEYS.every((k) => /^\d+$/.test(String(t[k])))
      )
        today = { date: t.date, ...Object.fromEntries(m.KEYS.map((k) => [k, Number(t[k])])) };
    } catch {
      /* no file there, or it is not a reading: the counts are typed instead */
    }
    return { keys: m.KEYS, count: rs.length, last, today, file: path.basename(TODAY_FILE) };
  }
  async function addReading(r) {
    r = r || {};
    const { keys } = await pulseNow();
    const tidy = (v) => String(v == null ? '' : v).replace(/[\s,]/g, '');
    const done = await runNode(
      [
        path.join(root, '..', 'tools', 'pulse.mjs'),
        'add',
        'date=' + tidy(r.date),
        ...keys.map((k) => k + '=' + tidy(r[k])),
      ],
      20000,
    );
    if (done.code !== 0)
      throw fail((done.out.trim().split('\n').pop() || 'The reading could not be added.').slice(0, 300));
  }

  // the bundle: what is built, and whether the source has moved on since
  async function newest(dir) {
    let t = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.') || e.name === 'dist' || e.name === 'node_modules') continue;
      const f = path.join(dir, e.name);
      t = Math.max(t, e.isDirectory() ? await newest(f) : (await stat(f)).mtimeMs);
    }
    return t;
  }
  async function distInfo() {
    try {
      const f = path.join(root, '..', 'dist', 'manifest.json');
      const m = JSON.parse(await readFile(f, 'utf8'));
      const at = (await stat(f)).mtimeMs;
      let src = 0;
      for (const d of ['js', 'css', 'runner']) src = Math.max(src, await newest(path.join(root, d)));
      for (const e of await readdir(root))
        if (/\.(html|mjs|sh)$/.test(e)) src = Math.max(src, (await stat(path.join(root, e))).mtimeMs);
      return { built: true, version: m.version, files: m.files.length + 1, at, stale: src > at };
    } catch {
      return { built: false };
    }
  }
  const runNode = (args, ms) =>
    new Promise((done) => {
      let out = '';
      const c = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      const t = setTimeout(() => c.kill('SIGTERM'), ms);
      c.stdout.on('data', (d) => {
        out = (out + d).slice(-20000);
      });
      c.stderr.on('data', (d) => {
        out = (out + d).slice(-20000);
      });
      c.on('close', (code) => {
        clearTimeout(t);
        done({ code, out });
      });
    });
  let test = { running: false, at: 0, passed: null, failed: null, tail: '' };
  const startTest = () => {
    if (test.running) return test;
    test = { running: true, at: Date.now(), passed: null, failed: null, tail: '' };
    runNode([path.join(root, '..', 'tests', 'runner', 'self-test.mjs')], 15 * 60000).then((r) => {
      const lines = r.out.split('\n');
      test = {
        running: false,
        at: Date.now(),
        passed: lines.filter((l) => /^ok /.test(l)).length,
        failed: lines.filter((l) => /^FAIL /.test(l)).length,
        code: r.code,
        tail: lines
          .filter((l) => l && !/^ok /.test(l))
          .slice(-6)
          .join('\n'),
      };
    });
    return test;
  };

  // PINNING THE BUNDLE (Pinata). The owner's Pinata key (a JWT) is a SECRET: it is typed into this panel, kept in one file in the
  // app's own state folder on this machine, readable by this user only, never written into the source or the bundle, and never sent
  // back to the page (the page is told only that there is one, and its last four characters). PINATA_JWT in the environment is
  // used instead when it is set. Pinning sends dist/ exactly as it stands, as one folder (Pinata's folder upload: one "file" part
  // for each file, its name carrying the path under one folder name), and the answer is that folder's CID. When the owner's gateway
  // is given, the manifest is read back through it and must be the one that was built. Pointing a name at the address stays the
  // owner's own act. FO_PINATA_API: another address for the API, which is how the self-test stands in for Pinata.
  const PIN_API = () => (process.env.FO_PINATA_API || 'https://api.pinata.cloud').replace(/\/$/, '');
  const PIN_FILE = stateDir ? path.join(stateDir, 'owner-pinata.json') : '';
  const pinRead = async () => {
    try {
      return JSON.parse(await readFile(PIN_FILE, 'utf8'));
    } catch {
      return {};
    }
  };
  const pinWrite = async (o) => {
    if (!PIN_FILE) throw fail('This copy has nowhere of its own to keep the key.');
    await mkdir(path.dirname(PIN_FILE), { recursive: true });
    await writeFile(PIN_FILE, JSON.stringify(o, null, 1), { mode: 0o600 });
    await chmod(PIN_FILE, 0o600);
  };
  const pinKey = async () => process.env.PINATA_JWT || (await pinRead()).jwt || '';
  const pinView = async () => {
    const o = await pinRead();
    const env = !!process.env.PINATA_JWT;
    const k = env ? process.env.PINATA_JWT : o.jwt || '';
    return {
      hasKey: !!k,
      from: env ? 'env' : k ? 'saved' : '',
      ends: k ? k.slice(-4) : '',
      gateway: o.gateway || '',
      last: o.last || null,
      ens: o.ens || '',
      ensLast: o.ensLast || null,
    };
  };
  const unreached = (e) =>
    'Pinata could not be reached: ' + String((e && e.cause && e.cause.code) || (e && e.message) || e).slice(0, 120);
  async function pinTest(jwt) {
    let r;
    try {
      r = await fetch(PIN_API() + '/data/testAuthentication', {
        headers: { authorization: 'Bearer ' + jwt },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return { ok: null, why: unreached(e) };
    }
    return r.ok
      ? { ok: true }
      : {
          ok: false,
          why:
            r.status === 401 || r.status === 403
              ? 'Pinata refused that key.'
              : 'Pinata answered ' + r.status + ' when the key was tried.',
        };
  }
  const local = (g) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(g);
  async function pinSet({ jwt, gateway, ens }) {
    const pin = await pinRead();
    let note = '';
    if (ens !== undefined) {
      const n = String(ens || '')
        .trim()
        .toLowerCase();
      if (n && !ENS_NAME.test(n))
        throw fail(
          'Give the ENS name in lower-case letters, digits and hyphens, ending in .eth. A name with other characters has to be set by hand.',
        );
      pin.ens = n;
    }
    if (gateway !== undefined) {
      const g = String(gateway || '')
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (g && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(g) && !local(g))
        throw fail('A gateway is a domain, such as fun-llama-300.mypinata.cloud.');
      pin.gateway = g;
    }
    if (jwt !== undefined) {
      const k = String(jwt || '').trim();
      if (/\s/.test(k) || k.length < 10 || k.length > 4000)
        throw fail('That does not look like a Pinata key. It is the JWT shown once when you make an API key.');
      const t = await pinTest(k);
      if (t.ok === false) throw fail(t.why + ' It was not saved.');
      pin.jwt = k;
      if (t.ok === null) note = t.why + '. The key is saved, but has not been tried.';
    }
    await pinWrite(pin);
    return { ...(await pinView()), note };
  }
  async function pinForget() {
    const o = await pinRead();
    delete o.jwt;
    await pinWrite(o);
    return pinView();
  }
  async function walk(dir, base = '') {
    const out = [];
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.')) continue;
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
      else if (e.isFile()) out.push(rel);
    }
    return out;
  }
  let pinning = false;
  async function pinBundle({ stale } = {}) {
    const key = await pinKey();
    if (!key) throw fail('Give your Pinata key first.');
    const distNow = await distInfo();
    if (!distNow.built) throw fail('There is no bundle yet. Build it first.');
    if (distNow.stale && stale !== true)
      throw fail(
        'The source has changed since the bundle was built. Build it again, or pin the bundle as it stands.',
        409,
      );
    if (pinning) throw fail('A pin is already under way.', 409);
    pinning = true;
    try {
      const dist = path.join(root, '..', 'dist');
      const list = await walk(dist);
      const name = 'familyoffice-' + distNow.version;
      const form = new FormData();
      let bytes = 0;
      for (const f of list) {
        const b = await readFile(path.join(dist, f));
        bytes += b.length;
        form.append('file', new Blob([b]), name + '/' + f);
      }
      form.append('pinataMetadata', JSON.stringify({ name }));
      form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      let r;
      try {
        r = await fetch(PIN_API() + '/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + key },
          body: form,
          signal: AbortSignal.timeout(10 * 60000),
        });
      } catch (e) {
        throw fail(unreached(e), 502);
      }
      const text = await r.text();
      let j = null;
      try {
        j = JSON.parse(text);
      } catch {
        /* its own words */
      }
      if (!r.ok || !j || !j.IpfsHash) {
        const why =
          j && j.error
            ? typeof j.error === 'string'
              ? j.error
              : j.error.details || j.error.reason || JSON.stringify(j.error)
            : text;
        throw fail('Pinata did not pin it (' + r.status + '): ' + String(why).slice(0, 200), 502);
      }
      const o = await pinRead();
      const last = {
        cid: String(j.IpfsHash),
        version: distNow.version,
        files: list.length,
        bytes,
        at: Date.now(),
        again: !!j.isDuplicate,
        served: null,
      };
      if (o.gateway) {
        try {
          const g = await fetch(
            (local(o.gateway) ? 'http://' : 'https://') + o.gateway + '/ipfs/' + last.cid + '/manifest.json',
            { signal: AbortSignal.timeout(30000) },
          );
          last.served = g.ok && (await g.json()).version === distNow.version ? 'yes' : 'no';
        } catch {
          last.served = 'unreached';
        }
      }
      o.last = last;
      await pinWrite(o);
      return last;
    } finally {
      pinning = false;
    }
  }

  // THE ENS RECORD. A new bundle is a new IPFS address, so the name has to be pointed at it: one transaction, setContenthash on the
  // name's resolver, which only the account that manages the name can send. NOTHING IS SIGNED HERE. This works out what is to be
  // written, and the Owner page hands it to the wallet in the owner's own browser, which shows it and asks them to confirm:
  //   node          the name's namehash (EIP-137)
  //   contenthash   0xe301 followed by the CID's own bytes (EIP-1577: the IPFS namespace, then a version 1 CID)
  //   resolverCall  what to ask the ENS registry to learn the name's resolver;  readCall: what the resolver holds now
  //   setData       the transaction's data. Its "to" is the resolver the wallet reads from the registry, never an address from here.
  // Every selector is derived from its signature (chain.mjs), never typed in.
  const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  const ENS_NAME = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+eth$/;
  const namehash = (name) =>
    name
      .split('.')
      .reverse()
      .reduce((node, label) => keccak256(Buffer.concat([node, keccak256(Buffer.from(label))])), Buffer.alloc(32));
  const cidBytes = (cid) => {
    // a version 1 CID as it is written: "b", then its bytes in lower-case base32 with no padding
    const s = String(cid || '');
    if (!/^b[a-z2-7]{20,200}$/.test(s)) throw fail('That is not a version 1 IPFS address (they begin with "baf").');
    const A = 'abcdefghijklmnopqrstuvwxyz234567';
    const out = [];
    let bits = 0;
    let acc = 0;
    for (const ch of s.slice(1)) {
      acc = (acc << 5) | A.indexOf(ch);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 255);
        acc &= (1 << bits) - 1;
      }
    }
    if (out[0] !== 1) throw fail('That is not a version 1 IPFS address.');
    return Buffer.from(out);
  };
  function ensPlan(name, cid) {
    name = String(name || '')
      .trim()
      .toLowerCase();
    if (!name) throw fail('Give your ENS name first.');
    if (!ENS_NAME.test(name) || name.length > 255)
      throw fail('Give the ENS name in lower-case letters, digits and hyphens, ending in .eth.');
    if (!cid) throw fail('Pin the bundle first: there is no address to point the name at yet.');
    const node = namehash(name).toString('hex');
    const ch = Buffer.concat([Buffer.from([0xe3, 0x01]), cidBytes(cid)]);
    const w = (hex) => hex.padStart(64, '0');
    return {
      name,
      cid: String(cid),
      address: 'ipfs://' + cid,
      chainId: '0x1',
      registry: ENS_REGISTRY,
      node: '0x' + node,
      contenthash: '0x' + ch.toString('hex'),
      resolverCall: '0x' + selector('resolver(bytes32)') + node,
      readCall: '0x' + selector('contenthash(bytes32)') + node,
      setData:
        '0x' +
        selector('setContenthash(bytes32,bytes)') +
        node +
        w('40') +
        w(ch.length.toString(16)) +
        ch.toString('hex').padEnd(Math.ceil(ch.length / 32) * 64, '0'),
    };
  }

  // the routes. json and bodyOf are the runner's own.
  return async function owner(req, res, url, { json, bodyOf }) {
    const route = url.pathname.replace('/api/owner', '') || '/';
    const post = req.method === 'POST';
    try {
      const b = await fresh();
      const sold = Object.keys(b.tiers).filter((x) => x !== 'free');
      if (!post && route === '/state')
        return json(res, 200, {
          enforce: !!b.enforce,
          chain: b.chain.name,
          locks: Object.fromEntries(sold.map((x) => [x, b.tiers[x].lock || ''])),
          tiers: sold.map((x) => ({ id: x, name: b.tiers[x].name })),
          codes: codesOf(b),
          dist: await distInfo(),
          pin: await pinView(),
          product: await productNow().catch(() => ({ remote: true })),
          test,
          githubClientId: (await ghNow()).clientId || '',
          pulse: await pulseNow().catch(() => null),
          lockedOut: !!b.enforce && !sold.some((x) => isAddress(b.tiers[x].lock)) && !(b.codes || []).length,
        });
      if (!post && route === '/locks')
        return json(res, 200, { locks: await Promise.all(sold.map((t) => lockReport(t, b.tiers[t].lock, b))) });
      if (!post && route === '/selftest') return json(res, 200, test);
      if (!post) return json(res, 404, { error: 'not found' });
      const body = await bodyOf(req);
      if (route === '/codes') return json(res, 200, await addCode(body));
      if (route === '/codes/remove') return json(res, 200, await removeCode(String(body.label || '')));
      if (route === '/locks') {
        await setLocks(body);
        return json(res, 200, { ok: true });
      }
      if (route === '/github') {
        await setClientId(body.clientId);
        return json(res, 200, { ok: true });
      }
      if (route === '/enforce') {
        await setEnforce(body.on === true);
        return json(res, 200, { ok: true });
      }
      if (route === '/remote') return json(res, 200, { ok: true, product: await setRemote(body.on === true) });
      if (route === '/wallet') return json(res, 200, await walletReport(String(body.address || '').trim()));
      if (route === '/pulse') {
        await addReading(body);
        return json(res, 200, { ok: true, pulse: await pulseNow() });
      }
      if (route === '/bundle') {
        if (body.reading) await addReading(body.reading); // a refused reading stops here: nothing is built on counts that did not go in
        const r = await runNode([path.join(root, '..', 'tools', 'bundle.mjs')], 120000);
        return json(res, 200, {
          ok: r.code === 0,
          said: r.out.trim().split('\n').pop().slice(0, 300),
          dist: await distInfo(),
        });
      }
      if (route === '/pinata') return json(res, 200, await pinSet(body));
      if (route === '/pinata/forget') return json(res, 200, await pinForget());
      if (route === '/pin') return json(res, 200, await pinBundle(body));
      if (route === '/publish') {
        // ONE PRESS: build the bundle, pin what was just built, and hand the page what the wallet is to be asked to sign
        if (!(await pinKey())) throw fail('Give your Pinata key first.');
        if (body.reading) await addReading(body.reading);
        const r = await runNode([path.join(root, '..', 'tools', 'bundle.mjs')], 120000);
        if (r.code !== 0)
          return json(res, 200, {
            ok: false,
            said: 'The bundle did not build: ' + r.out.trim().split('\n').pop().slice(0, 300),
            dist: await distInfo(),
          });
        const last = await pinBundle({ stale: true });
        const o = await pinRead();
        return json(res, 200, {
          ok: true,
          dist: await distInfo(),
          pin: last,
          ens: o.ens ? ensPlan(o.ens, last.cid) : null,
        });
      }
      if (route === '/ens/plan') {
        const o = await pinRead();
        return json(res, 200, ensPlan(body.name || o.ens, body.cid || (o.last && o.last.cid)));
      }
      if (route === '/ens/done') {
        const o = await pinRead();
        o.ensLast = {
          name: String(body.name || o.ens || '').slice(0, 255),
          cid: String(body.cid || '').slice(0, 120),
          tx: /^0x[0-9a-f]{64}$/i.test(String(body.tx || '')) ? String(body.tx) : '',
          at: Date.now(),
        };
        await pinWrite(o);
        return json(res, 200, await pinView());
      }
      if (route === '/selftest') return json(res, 202, startTest());
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      return json(res, e.status || 400, { error: String(e.message || e).slice(0, 300) });
    }
  };
}
