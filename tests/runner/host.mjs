// host.mjs - WHAT THE TEAM NEEDS FROM THIS COMPUTER, at the runner itself (no browser, no model): a plain folder made a
// workspace; the workspace's website served on this computer, to this computer only, and stopped without leaving anything behind;
// and the phone that is or is not plugged in (Android's adb is a stand-in here).   node tests/runner/host.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SRC, FAKES } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
const ROOT = SRC;
const T = FAKES;
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-host-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 500)));
  if (!ok) bad++;
};
const J = { 'content-type': 'application/json' };
const withServer = async (port, env, fn) => {
  const state = path.join(tmp, 'state-' + port);
  fs.mkdirSync(state, { recursive: true });
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(port),
      FO_KEEP: '1',
      FO_STATE_DIR: state,
      FO_FAKE_DIR: state,
      FO_NO_NET: '1',
      FO_NO_OPEN: '1',
      FO_BILLING: '{"enforce":false}',
      FO_LINK_PORT: String(port + 40000),
      ...env,
    },
  });
  const B = 'http://127.0.0.1:' + port;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(B + '/api/setup')).ok) break;
      } catch {
        /* not yet */
      }
      await sleep(150);
    }
    await fn({
      B,
      state,
      get: async (p) => (await fetch(B + p)).json(),
      post: async (p, b) => {
        const r = await fetch(B + p, { method: 'POST', headers: J, body: JSON.stringify(b || {}) });
        return { status: r.status, ...(await r.json()) };
      },
    });
  } finally {
    srv.kill('SIGTERM');
    await sleep(300);
  }
};
const hostile = (url) =>
  new Promise((done) => {
    const u = new URL(url);
    const req = http.request(
      { host: '127.0.0.1', port: u.port, path: '/', headers: { host: 'evil.example' } },
      (res) => {
        res.resume();
        done(res.statusCode);
      },
    );
    req.on('error', () => done(0));
    req.end();
  });
const reach = async (url) => {
  try {
    const r = await fetch(url);
    return { status: r.status, text: await r.text() };
  } catch {
    return { status: 0, text: '' };
  }
};

// a plain folder with a small website in it, something hidden, and an empty folder the folder window "chooses"
const plain = path.join(tmp, 'my-first-site');
const empty = path.join(tmp, 'brand-new');
fs.mkdirSync(path.join(plain, 'img'), { recursive: true });
fs.mkdirSync(empty);
fs.writeFileSync(
  path.join(plain, 'index.html'),
  '<!doctype html><title>Mine</title><h1>Hello from my first site</h1><link rel="stylesheet" href="style.css">',
);
fs.writeFileSync(path.join(plain, 'style.css'), 'h1{color:teal}');
fs.writeFileSync(path.join(plain, '.env'), 'SECRET=1');
fs.writeFileSync(path.join(tmp, 'outside.txt'), 'not yours');

await withServer(
  5297 + SHIFT,
  { FO_BIN_ADB: path.join(T, 'fake-adb.mjs'), FO_PICK_FOLDER: empty },
  async ({ B, state, get, post }) => {
    const no = await post('/api/workspace/folder', { path: plain });
    check(
      'a folder that is not a Git folder is still not taken unless it is asked to be started',
      no.status >= 400 && /not a Git repository/.test(no.error || ''),
      no,
    );
    const home = await post('/api/workspace/folder', { path: os.homedir(), start: true });
    check(
      'the home folder is never made a Git folder',
      home.status >= 400 && /not your home folder/.test(home.error || '') && !fs.existsSync(path.join(tmp, '.git')),
      home.error,
    );
    const w = await post('/api/workspace/folder', { path: plain, start: true });
    const before = fs.readFileSync(path.join(plain, 'index.html'), 'utf8');
    check(
      'someone new: a plain folder is made a Git folder where it stands and connected, and nothing in it is changed',
      w.status === 200 &&
        w.repo === 'my-first-site' &&
        fs.existsSync(path.join(plain, '.git')) &&
        /Hello from my first site/.test(before) &&
        fs.existsSync(path.join(plain, '.env')) &&
        !!w.dir &&
        fs.existsSync(path.join(w.dir, 'index.html')),
      { status: w.status, repo: w.repo, error: w.error },
    );
    // the website
    const nothing = await get('/api/sites');
    const s1 = await post('/api/sites/start');
    const url = (s1.site || {}).url || '';
    const page = await reach(url);
    const css = await reach(url + 'style.css');
    check(
      "the workspace's website is served on this computer: an address on localhost, the page, and what the page uses",
      nothing.sites.length === 0 &&
        s1.ok === true &&
        /^http:\/\/localhost:\d+\/$/.test(url) &&
        page.status === 200 &&
        /Hello from my first site/.test(page.text) &&
        css.status === 200 &&
        /teal/.test(css.text),
      { s1, page: page.status },
    );
    const hidden = await reach(url + '.env');
    const git = await reach(url + '.git/config');
    const out = await reach(url + '%2e%2e/outside.txt');
    const evil = await hostile(url);
    const posted = await fetch(url, { method: 'POST' }).then(
      (r) => r.status,
      () => 0,
    );
    check(
      'it serves nothing hidden, nothing outside the folder, nothing to another host, and can only be read',
      hidden.status === 404 && git.status === 404 && out.status === 404 && evil === 403 && posted === 405,
      { hidden: hidden.status, git: git.status, out: out.status, evil, posted },
    );
    const l1 = await get('/api/sites');
    const twice = await post('/api/sites/start');
    check(
      'what is running is known: online, how often it was opened, and asking again starts no second one',
      l1.sites.length === 1 &&
        l1.sites[0].online === true &&
        l1.sites[0].hits >= 2 &&
        twice.already === true &&
        twice.site.url === url,
      l1.sites,
    );
    const st = await post('/api/sites/stop', { id: s1.site.id });
    const after = await reach(url);
    const l2 = await get('/api/sites');
    check(
      'stopped, it is gone from this computer, and what stopped is remembered with why',
      st.ok === true &&
        after.status === 0 &&
        l2.sites.length === 1 &&
        l2.sites[0].online === false &&
        /you stopped it/.test(l2.sites[0].why),
      [after.status, l2.sites],
    );
    // a phone
    const d1 = await get('/api/devices');
    check(
      'the phones this computer sees are told apart: one ready, one that has not accepted this computer; and no built app yet',
      d1.adb === true &&
        d1.list.length === 2 &&
        d1.list[0].state === 'ready' &&
        /Pixel 9 Pro/.test(d1.list[0].name) &&
        d1.list[1].state === 'unauthorized' &&
        /Allow USB debugging/.test(d1.list[1].says) &&
        d1.built === null,
      d1,
    );
    const early = await post('/api/devices/install', { serial: d1.list[0].serial });
    const odd = await post('/api/devices/install', { serial: 'x; rm -rf /' });
    check(
      'with nothing built, nothing is put on the phone, and it says why; a serial that is not one is refused',
      early.ok === false && /no built app/.test(early.why) && odd.ok === false && /not a phone/.test(odd.why),
      [early, odd],
    );
    fs.mkdirSync(path.join(w.dir, 'app/build/outputs/apk/debug'), { recursive: true });
    fs.writeFileSync(path.join(w.dir, 'app/build/outputs/apk/debug/app-debug.apk'), 'not a real app');
    const d2 = await get('/api/devices');
    const put = await post('/api/devices/install', { serial: d1.list[0].serial });
    const log = fs.existsSync(path.join(state, 'adb.log')) ? fs.readFileSync(path.join(state, 'adb.log'), 'utf8') : '';
    check(
      'once a build has left an app in the workspace it is seen, and it goes on the phone that is ready',
      /app-debug\.apk$/.test(d2.built || '') && put.ok === true && /install emulator-5554 .*app-debug\.apk/.test(log),
      [d2.built, put, log],
    );
    // the folder window, an empty folder, and stopping the team
    const e = await post('/api/workspace/folder', { start: true });
    const s2 = await post('/api/sites/start');
    check(
      'a new, empty folder chosen in the folder window is made a Git folder with a first commit; with no page in it, no site is started, and it says why',
      e.status === 200 &&
        e.repo === 'brand-new' &&
        fs.existsSync(path.join(empty, '.git')) &&
        s2.ok === false &&
        /no index\.html/.test(s2.why),
      [e.repo, e.error, s2],
    );
    await post('/api/workspace/folder', { path: plain });
    const s3 = await post('/api/sites/start');
    const up = await reach(s3.site.url);
    await post('/api/workspace/disconnect');
    const down = await reach(s3.site.url);
    const l3 = await get('/api/sites');
    check(
      'disconnecting the workspace stops its site: nothing is left running',
      up.status === 200 &&
        down.status === 0 &&
        !l3.sites.some((x) => x.online) &&
        l3.sites.some((x) => /disconnected/.test(x.why)),
      [up.status, down.status, l3.sites.map((x) => x.why)],
    );
  },
);
await withServer(
  5298 + SHIFT,
  { FO_BIN_ADB: path.join(tmp, 'no-adb-here'), FO_SITE_IDLE_MS: '1200' },
  async ({ get, post }) => {
    const d = await get('/api/devices');
    check(
      'with no Android tools on the computer, it says so (and lists no phone)',
      d.adb === false && d.list.length === 0,
      d,
    );
    await post('/api/workspace/folder', { path: plain });
    const s = await post('/api/sites/start');
    const first = await reach(s.site.url);
    await sleep(2600);
    const later = await reach(s.site.url);
    const l = await get('/api/sites');
    check(
      'a site nobody opens for a while stops by itself, and says that is why',
      first.status === 200 &&
        later.status === 0 &&
        l.sites.some((x) => !x.online && /nobody had opened it/.test(x.why)),
      [first.status, later.status, l.sites],
    );
  },
);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
