// myfamilyoffice.mjs - the one command that starts Family Office on your own machine. The site serves it next to the pages, so the address you
// read about the product at is also everything needed to run it:
// myfamilyoffice.sh runs it, after making sure there is a Node.js to run it with:
//   curl -fsSL https://<the site>/myfamilyoffice.sh | sh -s https://<the site>/
//   sh ~/.familyoffice/app/myfamilyoffice.sh             (any time after that; it checks the site for a newer copy, and runs offline if it cannot)
// What it does, in order, and nothing else:
//   1. reads the site's manifest.json: every file of the app with its SHA-256
//   2. fetches the files this machine does not already have, and REFUSES to start if any one does not match the manifest
//   3. starts the app's own server on 127.0.0.1 (only this machine can reach it) and opens it in your browser
// The server stops by itself when the app is closed: it watches for an open page, and exits when there has been none for a short while.
// It installs nothing else. The model engine, the agent and Claude Code are each installed later, only when you press the button for them.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const say = (t) => console.log('Family Office: ' + t);
const die = (t) => {
  console.error('Family Office: ' + t);
  process.exit(1);
};
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17))
  die(
    'this needs Node 18.17 or newer, and this is ' +
      process.versions.node +
      '. Get it at https://nodejs.org, then run the command again.',
  );

const HOME = process.env.FO_HOME || path.join(os.homedir(), '.familyoffice');
const APP = path.join(HOME, 'app');
const STATE = path.join(HOME, 'state');
const SOURCE = path.join(HOME, 'source.txt');
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]|[a-z0-9-]+(\.[a-z0-9-]+)*\.localhost)$/i;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
// a name under .localhost always means this machine, but only browsers and curl know that: for Node, say so (and IPv4, where a local test site listens)
const reach = (url) => {
  const u = new URL(url);
  if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost')) u.hostname = '127.0.0.1';
  return u.href;
};
const get = async (url) => {
  const r = await fetch(reach(url), { signal: AbortSignal.timeout(30000), redirect: 'follow' });
  if (!r.ok) throw new Error(url + ' answered ' + r.status);
  return Buffer.from(await r.arrayBuffer());
};
const read = async (f) => {
  try {
    return await readFile(f);
  } catch {
    return null;
  }
};

// the site this app comes from: given on the command line the first time, remembered after that
async function sourceOf() {
  let s = process.argv[2] || String((await read(SOURCE)) || '').trim();
  if (!s) return null;
  if (!s.endsWith('/')) s += '/';
  let u;
  try {
    u = new URL(s);
  } catch {
    die('that is not an address: ' + s);
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.test(u.hostname)))
    die('the app is only fetched over https (or from this machine): ' + s);
  return u.href;
}

// fetch what changed, verify ALL of it, and only then write any of it: a failed check leaves the installed copy exactly as it was
async function install(base, onStep = () => {}) {
  const man = JSON.parse((await get(base + 'manifest.json')).toString('utf8'));
  if (man.app !== 'familyoffice' || !Array.isArray(man.files) || !man.files.length || man.files.length > 500)
    die('that address does not serve this app (its manifest.json is not ours).');
  const fresh = [];
  let seen = 0;
  for (const f of man.files) {
    onStep(++seen, man.files.length);
    if (
      typeof f.path !== 'string' ||
      !SAFE.test(f.path) ||
      f.path.includes('..') ||
      !/^[0-9a-f]{64}$/.test(String(f.sha256))
    )
      die('the file list names something this launcher will not write: ' + JSON.stringify(f.path));
    const have = await read(path.join(APP, f.path));
    if (have && sha(have) === f.sha256) continue;
    const buf = await get(base + f.path);
    if (sha(buf) !== f.sha256)
      die(f.path + " does not match the site's own list of files. Nothing was written and nothing was started.");
    fresh.push([f.path, buf]);
  }
  const before = JSON.parse(String((await read(path.join(APP, 'manifest.json'))) || '{"files":[]}'));
  const now = new Set(man.files.map((f) => f.path));
  for (const [rel, buf] of fresh) {
    const dest = path.join(APP, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest + '.part', buf);
    await rename(dest + '.part', dest);
  }
  for (const f of before.files || [])
    if (typeof f.path === 'string' && SAFE.test(f.path) && !f.path.includes('..') && !now.has(f.path))
      await rm(path.join(APP, f.path), { force: true }); // a file the new version dropped
  await writeFile(path.join(APP, 'manifest.json'), JSON.stringify(man));
  await writeFile(SOURCE, base);
  return { version: man.version, fetched: fresh.length, of: man.files.length };
}

const hello = async (port) => {
  try {
    const j = await (
      await fetch('http://127.0.0.1:' + port + '/api/hello', { signal: AbortSignal.timeout(1500) })
    ).json();
    return !!j && j.app === 'familyoffice';
  } catch {
    return false;
  }
};
const free = (port) =>
  new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.listen(port, '127.0.0.1', () => s.close(() => ok(true)));
  });
function show(url) {
  say('your team is at ' + url);
  if (process.env.FO_NO_OPEN === '1') return;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true })
      .on('error', () => say('open that address in your browser'))
      .unref();
  } catch {
    say('open that address in your browser');
  }
}

await mkdir(APP, { recursive: true });
await mkdir(STATE, { recursive: true });
const base = await sourceOf();
const installed = !!(await read(path.join(APP, 'server.mjs')));
if (!base && !installed) die('say where the app comes from: sh myfamilyoffice.sh https://<the site>/');

let port = 0;
const FROM = Number(process.env.FO_PORT_FROM) || 5210;
// A copy that is already running is left alone when it is the site's current version. When the site has a newer one, running the
// command again is how it updates: the old copy is asked to stop, and this carries on to fetch and start the new one.
const helloOf = async (p) => {
  try {
    const j = await (await fetch('http://127.0.0.1:' + p + '/api/hello', { signal: AbortSignal.timeout(1500) })).json();
    return j && j.app === 'familyoffice' ? j : null;
  } catch {
    return null;
  }
};
let siteVersion = '';
if (base) {
  try {
    siteVersion = String(JSON.parse((await get(base + 'manifest.json')).toString('utf8')).version || '');
  } catch {
    /* the site cannot be reached: whatever runs here stays */
  }
}
for (let p = FROM; p < FROM + 9; p++) {
  const up = await helloOf(p);
  if (up) {
    if (!(siteVersion && up.state === 'active' && up.version && up.version !== siteVersion)) {
      say('it is already running');
      show('http://127.0.0.1:' + p + '/start.html');
      process.exit(0);
    }
    say('the copy running here is version ' + up.version + ' and the site has ' + siteVersion + ': updating it');
    try {
      await fetch('http://127.0.0.1:' + p + '/api/shutdown', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* it may already be going */
    }
    for (let i = 0; i < 40 && ((await helloOf(p)) || !(await free(p))); i++)
      await new Promise((r) => setTimeout(r, 250));
  }
  if (await free(p)) {
    port = p;
    break;
  }
}
if (!port) die('ports ' + FROM + ' to ' + (FROM + 8) + ' are all in use on this machine.');

// While the app is being fetched, answer on its port, so the page that showed the command can say "setting up" instead of nothing.
// Only that site may read it from a browser, and all it says is this one line of progress.
const site = new Set();
try {
  const u = new URL(base);
  site.add(u.origin);
  if (u.hostname === '127.0.0.1') site.add(u.protocol + '//localhost' + (u.port ? ':' + u.port : ''));
} catch {
  /* no site: started from the installed copy */
}
let step = 'starting';
const front = http.createServer((req, res) => {
  const o = req.headers.origin;
  const head = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (o && site.has(o))
    Object.assign(head, {
      'access-control-allow-origin': o,
      vary: 'Origin',
      'access-control-allow-private-network': 'true',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'content-type',
    });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, head);
    return res.end();
  }
  res.writeHead(200, head);
  res.end(JSON.stringify({ app: 'familyoffice', state: 'setting-up', step, port }));
});
await new Promise((ok) => {
  front.once('error', (e) => die('could not use port ' + port + ': ' + e.message));
  front.listen(port, '127.0.0.1', ok);
});
if (base) {
  try {
    const r = await install(base, (n, of) => {
      step = 'fetching the app, file ' + n + ' of ' + of;
    });
    say(
      r.fetched
        ? 'fetched ' +
            r.fetched +
            ' of ' +
            r.of +
            ' files from ' +
            base +
            ", each checked against the site's list (version " +
            r.version +
            ')'
        : 'this machine already has the current version (' + r.version + ')',
    );
  } catch (e) {
    if (!installed) die('could not fetch the app from ' + base + ': ' + ((e && e.message) || e));
    say('could not reach ' + base + ' (' + ((e && e.message) || e) + '). Starting the copy already on this machine.');
  }
}
step = 'starting the app';
await new Promise((ok) => {
  front.close(ok);
  if (front.closeAllConnections) front.closeAllConnections();
});

const child = spawn(process.execPath, [path.join(APP, 'server.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port), FO_STATE_DIR: STATE, FO_LAUNCHED: '1', FO_SOURCE: base || '' },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code || 0));
for (let i = 0; i < 60 && !(await hello(port)); i++) await new Promise((r) => setTimeout(r, 200));
if (!(await hello(port))) {
  child.kill('SIGTERM');
  die('the app did not start.');
}

// WHERE THE APP SHOWS. The page the command was copied from is watching for this: when it sees the app it attaches to it and carries
// on as the app, so no second page opens. If no page attaches (a browser that will not let a web page reach this machine, or the tab
// was closed), open one: the site's own page if that has worked in this browser before, and the app's own address if it does not.
const local = 'http://127.0.0.1:' + port + '/start.html';
const ATTACHED = path.join(HOME, 'attached');
const pagesOpen = async () => {
  try {
    return (
      (await (await fetch('http://127.0.0.1:' + port + '/api/hello', { signal: AbortSignal.timeout(1500) })).json())
        .pages || 0
    );
  } catch {
    return 0;
  }
};
const attached = async (ms) => {
  for (let t = 0; t < ms; t += 300) {
    if (await pagesOpen()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};
let own = false;
try {
  own = !!base && new URL(base).pathname === '/';
} catch {
  /* no site */
}
if (base && (await attached(Number(process.env.FO_ATTACH_MS) || 8000))) {
  await writeFile(ATTACHED, base);
  say('your team is in the browser, on the page you copied this from. Go back to it.');
} else if (own && String((await read(ATTACHED)) || '') === base) {
  say('opening ' + base + 'start.html');
  if (process.env.FO_NO_OPEN !== '1') {
    const [cmd, args] =
      process.platform === 'darwin'
        ? ['open', [base + 'start.html']]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', base + 'start.html']]
          : ['xdg-open', [base + 'start.html']];
    try {
      spawn(cmd, args, { stdio: 'ignore', detached: true })
        .on('error', () => {})
        .unref();
    } catch {
      /* fall through to the app's own address */
    }
  }
  if (!(await attached(Number(process.env.FO_ATTACH_MS) || 12000))) show(local);
} else show(local);
say('it stops by itself when you close the app. Ctrl-C stops it now.');
