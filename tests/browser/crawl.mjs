// crawl.mjs - a full pass over the product in a real browser, hosted and live, desktop and phone.
//   node tests/browser/crawl.mjs [hosted|live|all] [desktop|phone|all]
// HOSTED = dist/ behind a stand-in gateway (no runner: the pages a visitor reads, and Start offering its one command). LIVE = server.mjs with test doubles for the engine, the
// agent and Claude Code, so nothing real is installed or run. Findings print as lines; screenshots go to .work/qa/.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REPO_ROOT, SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
import { PRODUCT_REMOTE_ON } from '../support/product.mjs';

process.env.FO_ALL_MODELS = '1'; // the checks walk every model in the catalogue, the shelved ones too
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
{
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (o) => {
    const b = await launch(o);
    const nc = b.newContext.bind(b);
    b.newContext = async (c) => {
      const x = await nc(c);
      await x.addInitScript(() => {
        try {
          if (!localStorage.getItem('familyoffice.mode')) localStorage.setItem('familyoffice.mode', 'developer');
        } catch (e) {
          /* no storage */
        }
      });
      await x.route('https://avatars.example.com/**', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        }),
      );
      return x;
    };
    return b;
  };
} // Developer mode, unless a page chose otherwise; the stand-in people's pictures are served
const ROOT = SRC;
const OUT = path.join(WORK, 'qa' + (process.env.QA_OFF ? '-' + process.env.QA_OFF : ''));
const T = FAKES;
const [which = 'all', sizes = 'all'] = process.argv.slice(2);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const state = path.join(WORK, 'qa-state' + (process.env.QA_OFF || ''));
fs.rmSync(state, { recursive: true, force: true });
const OFF = (Number(process.env.QA_OFF) || 0) + SHIFT;
const GP = 5262 + OFF;
const LP = 5261 + OFF;
const HOSTED = 'http://myfamilyoffice.localhost:' + GP + '/';
const LIVE = 'http://localhost:' + LP + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = [];
const issue = (where, what) => {
  found.push(where + ' :: ' + what);
  console.log('  ISSUE ' + where + ' :: ' + what);
};
const note = (t) => console.log('  ' + t);

const kids = [];
// stand-ins for the repositories git itself clones and pushes to: bare repositories in a folder, never github.com
const GITROOT = path.join(state, 'gh-remotes');
{
  const { execFileSync } = await import('child_process');
  const g = (a, cwd) => execFileSync('git', a, { cwd, stdio: 'ignore' });
  for (const full of ['acme/billing', 'acme/site']) {
    const bare = path.join(GITROOT, full + '.git');
    const tmp = path.join(GITROOT, 'seed-' + full.replace('/', '-'));
    fs.mkdirSync(path.dirname(bare), { recursive: true });
    g(['init', '--bare', '-b', 'main', bare]);
    g(['init', '-b', 'main', tmp]);
    fs.writeFileSync(path.join(tmp, 'README.md'), '# ' + full + '\n');
    g(['add', '-A'], tmp);
    g(['-c', 'user.name=seed', '-c', 'user.email=seed@example.com', 'commit', '-m', 'first'], tmp);
    g(['push', bare, 'main'], tmp);
  }
}
// a stand-in for GitHub's device sign-in and its repository list: nothing of the real GitHub is reached
const GH = 5248 + (Number(process.env.QA_OFF) || 0) + SHIFT;
let ghAsked = 0;
const ghStub = (await import('http')).createServer(async (req, res) => {
  for await (const c of req) void c;
  const out = (o, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(o));
  };
  if (req.url === '/login/device/code')
    return out({
      device_code: 'dc',
      user_code: 'WDJB-MJHT',
      verification_uri: 'https://github.com/login/device',
      interval: 5,
      expires_in: 900,
    });
  if (req.url === '/login/oauth/access_token')
    return out(++ghAsked < 2 ? { error: 'authorization_pending' } : { access_token: 'gho_standin_token_0123456789' });
  if (req.url === '/user') return out({ login: 'octo' });
  if (req.url.startsWith('/user/repos'))
    return out([
      { full_name: 'acme/billing', private: true, default_branch: 'main' },
      { full_name: 'acme/site', private: false, default_branch: 'main' },
    ]);
  if (req.method === 'POST' && /^\/repos\/acme\/[\w.-]+\/pulls$/.test(req.url))
    return out({ html_url: 'https://github.com/acme/billing/pull/1', number: 1 }, 201);
  out({}, 404);
});
await new Promise((r) => ghStub.listen(GH, '127.0.0.1', r));
// a stand-in for the web: a search page in the shape the runner reads, and a page for the team to open and read
const WEB = 5390 + OFF;
const webPage =
  '<html><head><title>Node.js releases</title></head><body><nav>Home Docs</nav><h1>Releases</h1><p>The current long-term-support line is 24, and 26 is the current release.</p><p>Each line is supported for thirty months.</p></body></html>';
const webFound = ['Node.js releases', 'Release schedule explained', 'What is new in Node.js']
  .map(
    (t, i) =>
      '<div class="result results_links"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=' +
      encodeURIComponent('http://127.0.0.1:' + WEB + '/page' + (i + 1)) +
      '&amp;rut=x">' +
      t +
      '</a></h2><a class="result__snippet">About ' +
      t.toLowerCase() +
      '.</a></div>',
  )
  .join('');
const webStub = (await import('http')).createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url.startsWith('/html/') ? '<html><body>' + webFound + '</body></html>' : webPage);
});
await new Promise((r) => webStub.listen(WEB, '127.0.0.1', r));
fs.chmodSync(path.join(T, 'fake-browser.mjs'), 0o755);
const up = async (url) => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).status < 500) return true;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  return false;
};
if (which !== 'live') {
  kids.push(
    spawn(process.execPath, [path.join(REPO_ROOT, 'tools', 'gateway.mjs')], {
      env: { ...process.env, PORT: String(GP) },
      stdio: 'ignore',
    }),
  );
  await up('http://127.0.0.1:' + GP + '/');
}
if (which !== 'hosted') {
  kids.push(
    spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(LP),
        FO_KEEP: '1',
        FO_PRODUCT_FILE: PRODUCT_REMOTE_ON,
        FO_STATE_DIR: state,
        FO_FAKE_DIR: state,
        FO_NO_NET: '1',
        FO_BIN_TENSORFOLD: path.join(T, 'fake-tensorfold.mjs'),
        FO_PI_CLI: path.join(T, 'fake-pi.mjs'),
        FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
        FO_CLAUDE_ROOT: path.join(state, 'claude'),
        FO_BIN_SSH: path.join(T, 'fake-ssh.mjs'),
        FO_SSH_DIR: path.join(state, 'ssh'),
        FO_BIN_TAILSCALE: path.join(state, 'no-tailscale'),
        FO_BILLING: '{"enforce":false}',
        FO_NO_OPEN: '1',
        FO_FAKE_AVATAR: 'none',
        FO_GITHUB_GIT: 'file://' + GITROOT,
        FO_GITHUB_LOGIN: 'http://127.0.0.1:' + GH,
        FO_GITHUB_API: 'http://127.0.0.1:' + GH,
        FO_GITHUB_POLL_MS: '300',
        FO_GITHUB_CLIENT: 'Iv1.standin0123456789',
        FO_BIN_GH: path.join(state, 'no-gh'),
        FO_BIN_ADB: path.join(T, 'fake-adb.mjs'),
        FO_LINK_PORT: String(47850 + OFF),
        FO_LINK_LAN: '127.0.0.1',
        FO_LINK_APK: path.join(state, 'app.apk'),
        FO_WEB_SEARCH: 'http://127.0.0.1:' + WEB + '/html/',
        FO_WEB_ANY: '1',
        FO_BIN_BROWSER: path.join(T, 'fake-browser.mjs'),
        FO_BIN_SCREENCAPTURE: path.join(T, 'fake-browser.mjs'),
        FO_BIN_BREW: path.join(state, 'no-brew'),
        FO_BIN_LLAMA: path.join(state, 'no-llama'),
      },
    }),
  ); // the phone link listens on this machine only, adb is a test double and the app it installs is a stand-in   // billing off whatever the real plans file says; GitHub is a stand-in   // nothing of the real machine is read or reached: no real ssh, no real SSH records, no Tailscale
  await up('http://127.0.0.1:' + LP + '/api/setup');
}
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, 'app.apk'), 'a stand-in for the app');
// a phone, for the Remote page: its own certificate, and the one thing a stranger may say while a pairing window is open
const { selfSigned } = await import(path.join(ROOT, 'runner', 'cert.mjs'));
const https = await import('https');
const phoneAsks = (link, me) =>
  new Promise((ok) => {
    const u = new URL(link);
    const q = new URLSearchParams(u.hash.slice(1));
    const req = https.request(
      {
        host: '127.0.0.1',
        port: u.port,
        method: 'POST',
        path: '/pair',
        key: me.key,
        cert: me.cert,
        rejectUnauthorized: false,
        agent: false,
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        let t = '';
        res.on('data', (d) => {
          t += d;
        });
        res.on('end', () => {
          try {
            ok(JSON.parse(t));
          } catch {
            ok({});
          }
        });
      },
    );
    req.on('error', () => ok({}));
    req.end(JSON.stringify({ k: q.get('k'), name: 'Pixel 9 Pro' }));
  });
const done = () => {
  for (const k of kids)
    try {
      k.kill('SIGTERM');
    } catch {
      /* gone */
    }
};
process.on('exit', done);

const browser = await chromium.launch();
const VIEW = { desktop: { width: 1366, height: 850 }, phone: { width: 390, height: 844 } };

async function open(size, label) {
  const ctx = await browser.newContext({ viewport: VIEW[size], deviceScaleFactor: 1, hasTouch: size === 'phone' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text() + ' @ ' + (m.location().url || ''));
  });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/127\.0\.0\.1:521\d\/api\/hello/.test(u))
      errs.push('REQUEST FAILED ' + u + ' ' + (r.failure() || {}).errorText);
  });
  page.on('response', (r) => {
    if (
      r.status() >= 400 &&
      !/127\.0\.0\.1:521\d/.test(r.url()) &&
      !(r.status() === 400 && /\/api\/detect$/.test(r.url()))
    )
      errs.push('HTTP ' + r.status() + ' ' + r.url());
  });
  const flush = (where) => {
    const mine = errs
      .splice(0)
      .filter(
        (e) =>
          !/127\.0\.0\.1:521\d/.test(e) &&
          !/ERR_CONNECTION_REFUSED|ERR_ABORTED/.test(e) &&
          !/status of 400 .*api\/detect/.test(e),
      );
    for (const e of [...new Set(mine)]) issue(label + ' ' + where, 'console: ' + e.slice(0, 220));
  };
  return { ctx, page, flush, size, label };
}

// everything that can be judged without an eye
async function audit(s, where, { shot = true } = {}) {
  const { page, label } = s;
  const tag = label + ' ' + where;
  await sleep(350);
  const r = await page.evaluate(() => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return (
        b.width > 0 && b.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05
      );
    };
    const out = {
      wide: [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.right > innerWidth + 1 && document.documentElement.scrollWidth > innerWidth + 1;
        })
        .slice(0, 4)
        .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]),
      overflow: Math.round(document.documentElement.scrollWidth - innerWidth),
      bad: [],
      unnamed: [],
      cut: [],
      off: [],
      small: [],
      imgs: [],
      dupIds: [],
    };
    const text = document.body.innerText;
    const m = text.match(/[^\n]*(\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b)[^\n]*/g);
    if (m) out.bad = m.slice(0, 5);
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
      if (!vis(el)) continue;
      const name = (
        el.getAttribute('aria-label') ||
        el.textContent ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        ''
      ).trim();
      if (!name) out.unnamed.push(el.tagName.toLowerCase() + '.' + el.className);
      const b = el.getBoundingClientRect();
      let sc = el.parentElement;
      let scrolls = false;
      while (sc && sc !== document.body) {
        const o = getComputedStyle(sc).overflowX;
        if (o === 'auto' || o === 'scroll') {
          scrolls = true;
          break;
        }
        sc = sc.parentElement;
      }
      if (!scrolls && (b.right > innerWidth + 1 || b.left < -1)) out.off.push((name || el.className).slice(0, 40));
      if (
        innerWidth < 500 &&
        (el.tagName === 'BUTTON' || el.tagName === 'A') &&
        b.height < 28 &&
        !el.closest('p, li, .hint, .muted, small, footer, .fine')
      )
        out.small.push((name || el.className).slice(0, 30) + ' ' + Math.round(b.height) + 'px');
    }
    for (const el of document.querySelectorAll('h1, h2, h3, p, li, span, strong, code, button, a, dd, dt')) {
      if (!vis(el) || !el.textContent.trim() || el.children.length > 3 || el.closest('.sr, .vh, .sr-only')) continue;
      const c = getComputedStyle(el);
      if (
        (c.overflowX === 'hidden' || c.overflow === 'hidden') &&
        c.textOverflow !== 'ellipsis' &&
        el.scrollWidth > el.clientWidth + 2
      )
        out.cut.push(
          el.tagName.toLowerCase() +
            '.' +
            String(el.className).split(' ')[0] +
            ' "' +
            el.textContent.trim().slice(0, 30) +
            '"',
        );
    }
    for (const im of document.images) if (im.complete && !im.naturalWidth) out.imgs.push(im.src);
    const ids = {};
    for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
    out.dupIds = Object.keys(ids).filter((k) => ids[k] > 1);
    return out;
  });
  if (r.overflow > 1) issue(tag, 'the page scrolls sideways by ' + r.overflow + 'px (' + r.wide.join(', ') + ')');
  if (r.bad.length) issue(tag, 'raw value on screen: ' + r.bad.join(' | ').slice(0, 200));
  if (r.unnamed.length) issue(tag, 'controls with no name: ' + [...new Set(r.unnamed)].slice(0, 5).join(', '));
  if (r.off.length) issue(tag, 'controls off the edge: ' + [...new Set(r.off)].slice(0, 5).join(', '));
  if (r.cut.length) issue(tag, 'text cut off: ' + [...new Set(r.cut)].slice(0, 5).join(', '));
  if (r.small.length) issue(tag, 'small touch targets: ' + [...new Set(r.small)].slice(0, 6).join(', '));
  if (r.imgs.length) issue(tag, 'broken images: ' + r.imgs.join(', '));
  if (r.dupIds.length) issue(tag, 'duplicate ids: ' + r.dupIds.join(', '));
  s.flush(where);
  if (shot) {
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += innerHeight * 0.8) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 140));
      }
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 250));
    });
    const hid = await page.evaluate(() =>
      [...document.querySelectorAll('main section, main article, main .reveal, section')]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.height > 40 && Number(getComputedStyle(el).opacity) < 0.5;
        })
        .map((el) => el.id || el.className)
        .slice(0, 6),
    );
    if (hid.length) issue(tag, 'still invisible after scrolling past: ' + hid.join(', '));
  }
  if (shot)
    await page
      .screenshot({
        path: path.join(OUT, (label + '-' + where).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.jpg'),
        type: 'jpeg',
        quality: 62,
        fullPage: true,
      })
      .catch(() => {});
}
async function links(s, where) {
  const hrefs = await s.page.evaluate(() =>
    [
      ...new Set(
        [...document.querySelectorAll('a[href], iframe[src], link[href], script[src]')].map((a) => a.href || a.src),
      ),
    ].filter((h) => h.startsWith(location.origin)),
  );
  for (const h of hrefs) {
    const r = await s.page.request.get(h.split('#')[0]).catch(() => null);
    if (!r || r.status() >= 400)
      issue(s.label + ' ' + where, 'dead link ' + h + ' (' + (r ? r.status() : 'no answer') + ')');
  }
}
const buttons = (s) =>
  s.page.evaluate(() =>
    [...document.querySelectorAll('main button, main a.btn, .stage button, .stage a.btn')]
      .filter((b) => b.offsetParent)
      .map((b) => b.textContent.trim().slice(0, 34))
      .join(' | '),
  );
const click = async (s, name, where) => {
  const b = s.page.getByRole('button', { name }).first();
  if (!(await b.count())) {
    issue(s.label + ' ' + where, 'no button ' + name + ' (have: ' + (await buttons(s)) + ')');
    return false;
  }
  await b.click();
  return true;
};
const title = (s) => s.page.evaluate(() => (document.querySelector('#st-title, h1') || {}).textContent || '');

// ---------- the pages a visitor reads ----------
async function reading(base, size, kind) {
  const s = await open(size, kind + '-' + size);
  for (const p of ['index.html', 'start.html', 'app.html', 'film.html', 'reset.html', 'rsi.html', 'promise.html']) {
    await s.page.goto(base + p, { waitUntil: 'load' });
    await sleep(900);
    await audit(s, p.replace('.html', ''));
    await links(s, p);
    if (/demo|simulated|example figures/i.test(await s.page.locator('body').innerText()))
      issue(s.label + ' ' + p, 'the page still speaks of a demo');
  }
  if ((await s.page.request.get(base + 'playground.html')).status() < 400)
    issue(s.label, 'the demo page is still served');
  await s.page.goto(base, { waitUntil: 'load' });
  await sleep(600);
  // the Owner link sits beside Start on the owner's own copy, and nowhere else
  const owner = await s.page.locator('.nav-cta #owner-link').count();
  note('landing: Owner link ' + (owner ? 'shown' : 'not shown'));
  if (kind === 'live' && !owner)
    issue(s.label + ' landing', "the owner's own copy does not offer the Owner link beside Start");
  if (kind === 'hosted' && owner) issue(s.label + ' landing', 'the published site offers the Owner link');
  if (owner) {
    const a = await s.page.locator('#owner-link').boundingBox();
    const b = await s.page.locator('.nav-cta .btn.primary').boundingBox();
    if (!a || !b || Math.abs(a.y - b.y) > 4 || a.x > b.x)
      issue(s.label + ' landing', 'the Owner link is not beside Start, to its left');
  }
  const nav = await s.page.evaluate(() =>
    [...document.querySelectorAll('header a, nav a')]
      .filter((a) => a.offsetParent)
      .map((a) => a.textContent.trim() + ' -> ' + a.getAttribute('href')),
  );
  note('landing nav: ' + nav.join(' ; '));
  await s.ctx.close();
}

// ---------- Start, from the first screen to a team ----------
async function start(base, size, kind, way) {
  const s = await open(size, kind + '-' + size + '-' + way);
  await s.page.goto(base + 'start.html', { waitUntil: 'load' });
  await sleep(900);
  await audit(s, 'start-intro');
  note('intro buttons: ' + (await buttons(s)));
  const press = async (id) => {
    const b = s.page.locator(id);
    if (!(await b.count())) {
      issue(s.label + ' intro', 'no ' + id + ' (have: ' + (await buttons(s)) + ')');
      return false;
    }
    await b.click();
    return true;
  };
  if (
    (await s.page.locator('.demo, .badge, #go-demo').count()) ||
    /demo|simulated|just looking/i.test(await s.page.locator('main').innerText())
  )
    issue(s.label + ' intro', 'the demo is back on Start your team');
  if (kind === 'hosted') {
    // nothing is running on this machine: the page offers its one command and nothing to press through
    if (!(await s.page.locator('.launch').count()) || (await s.page.locator('.way').count()))
      issue(
        s.label + ' intro',
        'with nothing running, Start should offer the command and no ways: ' + (await buttons(s)),
      );
    await s.ctx.close();
    return null;
  }
  if (kind === 'live' && way === 'claude') {
    if (await press('#go-existing')) {
      await sleep(2500);
      await audit(s, 'start-existing');
      note(
        'already running: "' +
          (await title(s)).trim() +
          '" ' +
          (
            await s.page
              .locator('.servers')
              .innerText()
              .catch(() => '')
          )
            .replace(/\n/g, ' ')
            .slice(0, 120),
      );
      await s.page.locator('.add-server input').fill('nokey:1');
      await s.page.locator('.add-server button').click();
      await sleep(4800);
      if (!(await s.page.locator('.note.bad').isVisible()))
        issue(s.label + ' existing', 'a dead address drew no message');
      await s.page.getByRole('button', { name: 'Back' }).click();
      await sleep(500);
    }
  }
  if (way === 'claude') {
    if (!(await press('#go-claude'))) return s.ctx.close();
  } else {
    if (!(await press('#go-local'))) return s.ctx.close();
    await sleep(3200);
    await audit(s, 'start-machine');
    note('machine: "' + (await title(s)).trim() + '" buttons: ' + (await buttons(s)));
    const next = s.page.locator('.stage .btn.primary, main .btn.primary').last();
    if (await next.count()) await next.click();
    await sleep(1500);
    await audit(s, 'start-models');
    note('models: "' + (await title(s)).trim() + '" buttons: ' + (await buttons(s)));
    const avs = s.page.locator('.av');
    const an = await avs.count();
    note('model avatars: ' + an);
    for (let i = 0; i < an; i++) {
      await avs.nth(i).click();
      await sleep(250);
    }
    if (an) {
      // the small model the stand-in engine serves (the last on the list is no longer it: Bonsai 2 follows, run by another engine)
      const small = s.page.locator('.av[data-id="qwen35-2b"]');
      await ((await small.count()) ? small.first() : avs.nth(an - 1)).click();
      await sleep(300);
      await audit(s, 'start-models-picked');
    }
    const go = s.page.locator('#setup');
    note(
      'start button: ' +
        (await go.innerText().catch(() => 'NONE')) +
        ' disabled=' +
        (await go.isDisabled().catch(() => '?')),
    );
    await go.click().catch(() => {});
  }
  await sleep(1400);
  await audit(s, 'start-working');
  note('working: "' + (await title(s)).trim() + '"');
  let ok = false;
  for (let t = 0; t < 120; t++) {
    await sleep(500);
    if (/ready|is running/i.test(await title(s))) {
      ok = true;
      break;
    }
    const fix = await s.page.locator('.fix, .fix-card').count();
    if (fix) break;
  }
  if (!ok) {
    issue(s.label, 'setup did not reach ready: "' + (await title(s)).trim() + '" buttons: ' + (await buttons(s)));
    await audit(s, 'start-stuck');
    return s.ctx.close();
  }
  await sleep(800);
  await audit(s, 'start-ready');
  note('ready buttons: ' + (await buttons(s)));
  if (!(await s.page.locator('.big.go#meet').count()) || !(await s.page.locator('.big.back').count()))
    issue(s.label + ' ready', 'the Ready screen does not end in its two big buttons');
  if (await s.page.locator('.convo, .conns').count())
    issue(s.label + ' ready', 'the quick chat or the connector row is back on the Ready screen');
  // back and forward again: no stale state
  if (kind === 'live') {
    await s.page.goto(base + 'index.html', { waitUntil: 'load' });
    await sleep(400);
    await s.page.goto(base + 'start.html', { waitUntil: 'load' });
    await sleep(1500);
    note('re-entering Start: "' + (await title(s)).trim() + '" buttons: ' + (await buttons(s)));
    if (!/ready|is running/i.test(await title(s)))
      issue(
        s.label + ' start',
        'leaving and coming back to Start lost the running team: "' + (await title(s)).trim() + '"',
      );
    await audit(s, 'start-reentry');
  }
  const meet = s.page.locator('a[href*="app.html"]').first();
  if (await meet.count()) {
    await meet.click();
    await sleep(1500);
  } else {
    issue(s.label + ' ready', 'no way through to the team from Start');
    await s.page.goto(base + 'app.html');
    await sleep(1200);
  }
  return s;
}

// ---------- the admin: every page, every control ----------
async function admin(s) {
  const p = s.page;
  if (!/app\.html/.test(p.url())) {
    issue(s.label + ' admin', 'not on the admin: ' + p.url());
  }
  // a finished setup step is confirmed in a dialog that waits for an answer: the crawl answers Stay here and carries on
  const dismiss = async () => {
    if (await p.locator('dialog.step-done[open]').count()) {
      await p.getByRole('button', { name: 'Stay here' }).click();
      await sleep(250);
      return true;
    }
    return false;
  };
  const views = await p.evaluate(() => [...document.querySelectorAll('#nav a')].map((a) => a.getAttribute('href')));
  note(
    'admin views: ' +
      views.join(' ') +
      ' | side: ' +
      (
        await p
          .locator('.side-foot, aside')
          .first()
          .innerText()
          .catch(() => '')
      )
        .replace(/\n/g, ' / ')
        .slice(0, 160),
  );
  for (const v of views) {
    await p.evaluate((h) => {
      location.hash = h;
    }, v);
    await sleep(700);
    await audit(s, 'admin' + v.replace('#', '-') + '-empty');
  }
  // chat: a starter, a request, a question to one seat
  await p.evaluate(() => {
    location.hash = '#chat';
  });
  await sleep(600);
  const st = p.locator('.starters button').first();
  if (await st.count()) {
    await st.click();
    const v = await p.locator('.composer :is(input, textarea)').inputValue();
    if (!v) issue(s.label + ' chat', 'a starter did not fill the box');
  } else issue(s.label + ' chat', 'no starters on an empty chat');
  const box = p.locator('.composer :is(input, textarea)');
  await box.fill('Add a dark mode switch to the header');
  await box.press('Enter');
  let quiet = 0;
  let last = -1;
  for (let t = 0; t < 90 && quiet < 6; t++) {
    await sleep(500);
    const c = await p.locator('.chat-log .msg').count();
    const busy = await p.locator('.narr-bar.on').count();
    if (c === last && !busy) quiet++;
    else quiet = 0;
    last = c;
  }
  if (
    /say "go"|Say yes|say to stay|Say so if/i.test(
      await p
        .locator('.chat-log')
        .innerText()
        .catch(() => ''),
    ) ||
    (await p.locator('.chat-log .msg').count()) < 3
  ) {
    await box.fill('go');
    await box.press('Enter');
    quiet = 0;
    last = -1;
    for (let t = 0; t < 120 && quiet < 6; t++) {
      await sleep(500);
      const c = await p.locator('.chat-log .msg').count();
      const busy = await p.locator('.narr-bar.on').count();
      if (c === last && !busy) quiet++;
      else quiet = 0;
      last = c;
    }
  } // Ask me first: the team asked, and is told to go ahead as written
  note('chat after a request: ' + last + ' messages');
  if (last < 3) issue(s.label + ' chat', 'a request drew only ' + last + ' messages');
  await box.fill('@steward what would the check be?');
  await box.press('Enter');
  await sleep(6000);
  // the team is talked to, not only given work: a greeting gets one answer, research is searched for and sourced, a page is opened and pictured
  const settle = async () => {
    let quiet = 0;
    let last = -1;
    for (let t = 0; t < 120 && quiet < 5; t++) {
      await sleep(400);
      const c = await p.locator('.chat-log .msg').count();
      const busy = await p.locator('.narr-bar.on').count();
      if (c === last && !busy) quiet++;
      else quiet = 0;
      last = c;
    }
    return last;
  };
  const n0 = await settle();
  await box.fill('hello');
  await box.press('Enter');
  const n1 = await settle();
  if (n1 - n0 !== 2)
    issue(
      s.label + ' chat',
      'a greeting drew ' + (n1 - n0 - 1) + ' replies: it should be answered once, not taken round the table',
    );
  await box.fill('Look up the latest stable Node.js release');
  await box.press('Enter');
  const n2 = await settle();
  const steps = await p.locator('.tool-work').last().locator('.tool-step.is-ok').count();
  const failed = await p.locator('.tool-step.is-fail').count();
  const srcs = await p.locator('.sources a').count();
  const viaClaude = /claude/.test(s.label); // Claude Code searches and reads for itself: its answer comes without the runner's steps
  if (viaClaude) {
    if (n2 - n1 !== 3)
      issue(
        s.label + ' chat',
        'research on Claude Code drew ' +
          (n2 - n1) +
          " messages: the question, the answer and the Steward's check were expected",
      );
  } else {
    if (steps < 2) issue(s.label + ' chat', 'research showed ' + steps + ' finished steps (a search, then pages read)');
    if (failed)
      issue(
        s.label + ' chat',
        failed +
          ' research steps failed: ' +
          (await p.locator('.tool-step.is-fail').first().innerText()).replace(/\n/g, ' ').slice(0, 140),
      );
    if (srcs < 1) issue(s.label + ' chat', 'the researched answer names no sources');
    if (n2 - n1 < 4)
      issue(
        s.label + ' chat',
        'research drew ' +
          (n2 - n1) +
          " messages: the question, the work, the answer and the Steward's check were expected",
      );
  }
  await audit(s, 'admin-chat-research');
  await box.fill('Take a look at http://127.0.0.1:' + WEB + '/page and tell me what you see');
  await box.press('Enter');
  const n3 = await settle();
  await sleep(500);
  const pic = await p.evaluate(() => {
    const i = [...document.querySelectorAll('.shot img')].pop();
    return i ? { ok: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width) } : null;
  });
  if (!pic) issue(s.label + ' chat', 'a look at a page showed no picture');
  else if (!pic.ok) issue(s.label + ' chat', 'the picture of the page did not load');
  else if (pic.w > (s.size === 'phone' ? 360 : 560)) issue(s.label + ' chat', 'the picture is ' + pic.w + 'px wide');
  if (n3 - n2 !== 5)
    issue(
      s.label + ' chat',
      'a look at a page drew ' +
        (n3 - n2) +
        ' messages: the request, the work, and Ask, the Steward and Operations were expected',
    );
  note(
    'chat: greeting +' +
      (n1 - n0) +
      ', research +' +
      (n2 - n1) +
      ' (' +
      steps +
      ' steps, ' +
      srcs +
      ' sources), a look +' +
      (n3 - n2) +
      (pic ? ', picture ' + pic.w + 'px' : ''),
  );
  await audit(s, 'admin-chat-look');
  const gap = await p.evaluate(() => {
    const l = document.querySelector('.chat-log');
    return Math.round(l.scrollHeight - l.clientHeight - l.scrollTop);
  });
  if (gap > 4) issue(s.label + ' chat', 'the chat did not follow to the newest line (' + gap + 'px short)');
  await audit(s, 'admin-chat-used');
  if (await p.locator('#autonomy-pill, .pill-menu').count())
    issue(s.label + ' autonomy', 'there is still an autonomy pill');
  await audit(s, 'admin-autonomy-chosen');
  // plan
  await p.evaluate(() => {
    location.hash = '#plan';
  });
  await sleep(500);
  if ((await p.locator('.plan-card.tier').count()) !== 2)
    issue(s.label + ' plan', 'the Plan page does not show two tiers');
  if (
    !/Back to Team chat/.test(
      await p
        .locator('#plan-back')
        .innerText()
        .catch(() => ''),
    )
  )
    issue(s.label + ' plan', 'the Plan page does not offer the way back to where the customer was');
  await audit(s, 'admin-plan-chosen');
  // workspace: a bad name, then a good one
  await p.evaluate(() => {
    location.hash = '#workspace';
  });
  await sleep(500);
  const gh = p.locator('main input[type="text"]').first();
  const liveGh =
    (await p.getByRole('button', { name: 'Sign in with GitHub' }).count()) + (await p.locator('.rows.repos').count()); // a live team signs in and picks from its own list: the text box there only narrows that list
  if ((await gh.count()) && !liveGh) {
    await gh.fill('not a repo');
    await gh.press('Enter');
    await sleep(500);
    const err = await p.locator('main').innerText();
    if (!/owner\/repo/i.test(err)) issue(s.label + ' workspace', 'a bad repository name drew no message');
    await audit(s, 'admin-workspace-bad');
    await p.locator('main input[type="text"]').first().fill('acme/billing');
    await p.locator('main input[type="text"]').first().press('Enter');
    await sleep(700);
    if (!(await dismiss())) issue(s.label + ' workspace', 'connecting a workspace drew no confirmation');
    if (!(await p.locator('.card.chosen').count()))
      issue(s.label + ' workspace', 'the connected workspace does not look chosen');
    await audit(s, 'admin-workspace-linked');
    note(
      'workspace after link: ' +
        (
          await p
            .locator('#chips, .chips')
            .first()
            .innerText()
            .catch(() => '')
        ).replace(/\n/g, ' '),
    );
  } else {
    // a live team: sign in to GitHub (a stand-in here), then choose a repository from the list
    const si = p.getByRole('button', { name: 'Sign in with GitHub' });
    if (await si.count()) {
      await si.click();
      for (let i = 0; i < 40 && !(await p.locator('.rows.repos li').count()); i++) await sleep(300);
      await audit(s, 'admin-workspace-signed-in');
    }
    const repo = p.locator('.rows.repos button').first();
    if (await repo.count()) {
      await repo.click();
      for (let i = 0; i < 40 && !(await p.locator('dialog.step-done[open], #ws-clone').count()); i++) await sleep(250);
      await sleep(400);
      if (!(await dismiss())) issue(s.label + ' workspace', 'connecting a workspace drew no confirmation');
      if (!(await p.locator('.card.chosen').count()))
        issue(s.label + ' workspace', 'the connected workspace does not look chosen');
      await audit(s, 'admin-workspace-linked');
      note(
        'workspace after link: ' +
          (
            await p
              .locator('#chips, .chips')
              .first()
              .innerText()
              .catch(() => '')
          ).replace(/\n/g, ' '),
      );
    } else issue(s.label + ' workspace', 'no repository to choose after signing in to GitHub');
    // the clone, the landing gate, and one change made by the team and landed the way the gate says
    if (!(await p.locator('#ws-clone').count()))
      issue(
        s.label + ' workspace',
        'the chosen repository does not say it is cloned: ' +
          (await p
            .locator('#ws-said')
            .innerText()
            .catch(() => 'nothing said')),
      );
    if (await p.locator('.land-how, [data-how]').count())
      issue(s.label + ' workspace', 'a landing choice is on the Workspace page: it is settled in the chat');
    if (await p.locator('#ws-task, #ws-go').count())
      issue(s.label + ' workspace', 'the box that asks the team for a change is back');
    if (await p.locator('#ws-clone').count()) {
      if (!(await p.locator('#ws-pending').count()))
        await p.evaluate(() =>
          fetch('api/workspace/task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ task: 'Add a line to the README saying hello' }),
          })
            .then((r) => r.json())
            .catch(() => null),
        );
      await p.reload({ waitUntil: 'load' });
      for (let i = 0; i < 80 && !(await p.locator('#ws-pending, #ws-said').count()); i++) await sleep(300);
      await audit(s, 'admin-workspace-change-waiting');
      if (await p.locator('#ws-land').count()) {
        note(
          'workspace: the team changed ' +
            (await p.locator('.ws-files li').count()) +
            ' file; landing button says "' +
            (await p.locator('#ws-land').innerText()) +
            '"',
        );
        await p.locator('#ws-land').click();
        for (let i = 0; i < 60 && !(await p.locator('#ws-last').count()); i++) await sleep(300);
        note(
          'workspace: ' +
            (
              await p
                .locator('#ws-last')
                .innerText()
                .catch(
                  () =>
                    'NOT LANDED: ' +
                    p
                      .locator('#ws-said')
                      .innerText()
                      .catch(() => ''),
                )
            ).replace(/\s+/g, ' '),
        );
        if (!(await p.locator('#ws-last').count())) issue(s.label + ' workspace', 'the change was not landed');
        await audit(s, 'admin-workspace-landed');
      } else
        note(
          'workspace: no change to land (' +
            (
              await p
                .locator('#ws-said')
                .innerText()
                .catch(() => '')
            )
              .replace(/\s+/g, ' ')
              .slice(0, 120) +
            ')',
        );
    }
  }
  // jira: sign in (a stand-in), choose filters, see tickets as a board
  await p.evaluate(() => {
    location.hash = '#jira';
  });
  for (let i = 0; i < 30 && !(await p.locator('#jira-signin, #jira-show').count()); i++) await sleep(300);
  if (await p.locator('#jira-signin').count()) {
    await p.locator('#jira-signin').click();
    for (let i = 0; i < 40 && !(await p.locator('#jira-show').count()); i++) await sleep(400);
    await audit(s, 'admin-jira-signed-in');
  }
  if (await p.locator('#jira-show').count()) {
    // a board from the list, then its two menus: Filter by (the board's own filters) and Area (its project's components)
    for (let i = 0; i < 40 && (await p.locator('#jira-board option').count()) < 2; i++) await sleep(300);
    if ((await p.locator('#jira-board option').count()) < 2) issue(s.label + ' jira', 'no boards to choose from');
    else {
      await p.locator('#jira-board').selectOption({ index: 1 });
      for (let i = 0; i < 40 && (await p.locator('.jmenu-off').count()); i++) await sleep(300); // until the board's areas have been read
      if (await p.locator('#jira-by').count()) issue(s.label + ' jira', 'the Filter by menu is back');
      note(
        'jira menus: ' +
          (await p.locator('.jmenu summary').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).join(' | '),
      );
    }
    if (await p.locator('.jcap, #jira-quick').count())
      issue(s.label + ' jira', 'the old captions or the Custom filters button are back');
    await p.locator('#jira-what').click();
    await sleep(200);
    await p.locator('.jseg button', { hasText: 'Everyone' }).click();
    await sleep(200);
    await p.locator('.jira-head h2').click();
    await sleep(200);
    await p.locator('#jira-show').click(); // which tickets: in the Tickets menu now
    await sleep(300);
    for (let i = 0; i < 80 && (await p.locator('#jira-show').isDisabled()); i++) await sleep(300); // until this read is in: tickets from an earlier read may already be on the page
    for (let i = 0; i < 40 && !(await p.locator('.ticket').count()); i++) await sleep(300);
    if (await p.locator('.ticket').count()) {
      // Area: the areas on the tickets, so it is looked at once tickets are on the board
      const id = '#jira-area';
      const name = 'Area';
      const had = await p.locator('.ticket').count();
      if (!(await p.locator('summary' + id).count())) issue(s.label + ' jira', 'no ' + name + ' menu');
      else {
        await p.locator('summary' + id).click();
        await sleep(200);
        const ticks = p.locator('details.jmenu[open] [role="checkbox"]');
        const tn = await ticks.count();
        if (tn) {
          await ticks.first().click();
          await sleep(200);
          if (!(await p.locator('details.jmenu[open]').count()))
            issue(s.label + ' jira', 'ticking in ' + name + ' closed the menu');
          if (!(await p.locator('summary' + id + ' b').count()))
            issue(s.label + ' jira', name + ' does not say what is chosen');
          if ((await p.locator('.ticket').count()) > had)
            issue(s.label + ' jira', 'ticking an area showed more tickets, not fewer');
          await audit(s, 'admin-jira-menu');
          await ticks.first().click();
          await sleep(200);
          if ((await p.locator('.ticket').count()) !== had)
            issue(s.label + ' jira', 'unticking the area did not bring the tickets back');
        } else if (
          !/area/i.test(
            await p
              .locator('details.jmenu[open] .jmenu-list')
              .innerText()
              .catch(() => ''),
          )
        )
          issue(s.label + ' jira', 'the ' + name + ' menu is empty and does not say why');
        await p.locator('.jira-head h2').click();
        await sleep(150);
        if (await p.locator('details.jmenu[open]').count())
          issue(s.label + ' jira', 'a press outside did not close the ' + name + ' menu');
      }
    }
    const n = await p.locator('.ticket').count();
    note(
      'jira: ' +
        n +
        ' tickets in ' +
        (await p.locator('.jcol').count()) +
        ' columns | nav chip: ' +
        (await p
          .locator('#nav a[href="#jira"] .nc')
          .innerText()
          .catch(() => 'none')),
    );
    if (n && (await p.locator('.face').count())) {
      const before = n;
      await p.locator('.face').first().click();
      await sleep(300);
      const after = await p.locator('.ticket').count();
      note(
        'jira: one person chosen, ' +
          after +
          ' of ' +
          before +
          ' tickets shown (' +
          (await p.locator('#jira-shown').innerText()).slice(0, 40) +
          ')',
      );
      if (after > before || !after) issue(s.label + ' jira', 'choosing a person did not narrow the board sensibly');
      await audit(s, 'admin-jira-person');
      await p.locator('#jira-clear').click();
      await sleep(200);
    } else if (n) issue(s.label + ' jira', 'no people to choose from above the board');
    if (!n)
      issue(
        s.label + ' jira',
        'no tickets were shown: ' +
          (await p
            .locator('#jira-said')
            .innerText()
            .catch(() => 'nothing said')),
      );
    await audit(s, 'admin-jira-board');
  } else
    issue(
      s.label + ' jira',
      'the Jira page never offered its filters: ' +
        (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160),
    );
  // the overview is the set-up, and the navigation carries the state
  await p.evaluate(() => {
    location.hash = '#overview';
  });
  await sleep(500);
  if (!(await p.locator('.setup-list li').count()))
    issue(s.label + ' overview', 'the Overview does not list what there is to set up');
  if (await p.locator('.flow').count()) issue(s.label + ' overview', '"How your team gets work done" is back');
  note('nav chips: ' + (await p.locator('#nav a').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).join(' / '));
  // soul: ask Vision, flip sharing
  await p.evaluate(() => {
    location.hash = '#learning';
  });
  await sleep(500);
  const vq = p.locator('main form input[type="text"]').first();
  if (await vq.count()) {
    await vq.fill('dark mode');
    await vq.press('Enter');
    await sleep(900);
  }
  const sw = p.locator('main [role="switch"], main input[type="checkbox"]').first();
  if (await sw.count()) issue(s.label + ' soul', 'the sharing switch is back');
  for (const hd of ['Your rulings', 'Vision', 'Hindsight'])
    if (!(await p.getByRole('heading', { name: hd, exact: true }).count()))
      issue(s.label + ' soul', 'no "' + hd + '" on the Soul page');
  await audit(s, 'admin-soul-used');
  if (await p.locator('#nav a[href="#team"], #nav a[href="#work"]').count())
    issue(s.label + ' nav', 'the Team or Work tab is back');
  // proofs and overview once there is something
  for (const v of ['#proofs', '#overview']) {
    await p.evaluate((h) => {
      location.hash = h;
    }, v);
    await sleep(700);
    await audit(s, 'admin' + v.replace('#', '-') + '-used');
  }
  const got = p.getByRole('button', { name: /Got it/i });
  if (await got.count()) {
    await got.click();
    await sleep(400);
    if (await p.locator('.intro').count()) issue(s.label + ' overview', 'Got it did not put the introduction away');
    const back = p.getByRole('button', { name: /How the team works/i });
    if (!(await back.count())) issue(s.label + ' overview', 'no way to bring the introduction back');
    else {
      await back.click();
      await sleep(300);
      if (!(await p.locator('.intro').count()))
        issue(s.label + ' overview', 'How the team works did not bring it back');
    }
  }
  // a reload keeps what was done
  await p.reload({ waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => {
    location.hash = '#chat';
  });
  await sleep(600);
  if (!(await p.locator('.chat-log > *').count())) issue(s.label + ' admin', 'a reload lost the chat');
  if (
    (await p.locator('.side-foot > *').count()) > 2 ||
    !(await p.locator('.side-foot #out').count()) ||
    !(await p.locator('.side-foot #clear-all').count())
  )
    issue(
      s.label + ' admin',
      'the sidebar foot is not Stop team and Clear all: ' +
        (await p.locator('.side-foot').innerText()).replace(/\s+/g, ' '),
    );
  await audit(s, 'admin-after-reload', { shot: false });
  // remote: off, on, a pairing code, a phone that asks (played here over TLS with its own certificate), allowed, a phone on a cable, removed, off
  await p.evaluate(() => {
    location.hash = '#remote';
  });
  await p
    .locator('#remote-switch')
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  if (!(await p.locator('#remote-switch').count()))
    issue(
      s.label + ' remote',
      'the Remote page has no switch: ' + (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160),
    );
  else {
    if (
      (await p.locator('#remote-switch').getAttribute('aria-checked')) !== 'false' ||
      (await p.locator('#remote-pair, #remote-qr').count())
    )
      issue(s.label + ' remote', 'Remote does not start off');
    await p.locator('#remote-switch').click();
    await p
      .locator('#remote-switch[aria-checked="true"]')
      .waitFor({ timeout: 15000 })
      .catch(async () =>
        issue(
          s.label + ' remote',
          'the switch did not come on: ' +
            (await p
              .locator('#remote-said')
              .innerText()
              .catch(() => 'nothing said')),
        ),
      );
    await audit(s, 'admin-remote-on');
    note(
      'remote, on: ' +
        (
          await p
            .locator('.reach')
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 150),
    );
    await p.locator('#remote-pair').click();
    await p
      .locator('#remote-qr svg')
      .waitFor({ timeout: 8000 })
      .catch(() => issue(s.label + ' remote', 'no pairing code was drawn'));
    const link = await p.evaluate(async () => {
      const j = await (await fetch('api/link?usb=0')).json();
      return j.pairing ? j.pairing.link : '';
    });
    const me = selfSigned('crawl phone');
    const asked = link ? await phoneAsks(link, me) : {};
    await p
      .locator('#remote-wants li')
      .waitFor({ timeout: 12000 })
      .catch(() => issue(s.label + ' remote', 'a phone that asked to pair did not appear'));
    const shown = (
      await p
        .locator('#remote-wants .pcode')
        .first()
        .innerText()
        .catch(() => '')
    ).replace(/\s/g, '');
    if (!asked.code || shown !== asked.code)
      issue(
        s.label + ' remote',
        'the code on the computer (' + shown + ') is not the one the phone was given (' + asked.code + ')',
      );
    await audit(s, 'admin-remote-asking');
    note(
      'remote, asking: ' +
        (
          await p
            .locator('#remote-wants')
            .innerText()
            .catch(() => '')
        ).replace(/\s+/g, ' ') +
        ' | nav chip: ' +
        (await p
          .locator('#nav a[href="#remote"] .nc')
          .innerText()
          .catch(() => 'none')),
    );
    await p.locator('#remote-wants button', { hasText: 'Allow' }).first().click();
    await p
      .locator('#remote-phones li')
      .waitFor({ timeout: 8000 })
      .catch(() => issue(s.label + ' remote', 'Allow did not pair the phone'));
    if ((await p.locator('#remote-usb li').count()) !== 2)
      issue(
        s.label + ' remote',
        'the phones on a cable are not listed: ' +
          (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(-200),
      );
    else {
      await p.locator('#remote-usb button', { hasText: 'Install and pair' }).first().click();
      for (
        let i = 0;
        i < 30 &&
        !/is on Pixel 9 Pro/.test(
          await p
            .locator('#remote-said')
            .innerText()
            .catch(() => ''),
        );
        i++
      )
        await sleep(300);
      if (
        !/is on Pixel 9 Pro/.test(
          await p
            .locator('#remote-said')
            .innerText()
            .catch(() => ''),
        )
      )
        issue(
          s.label + ' remote',
          'putting the app on a plugged-in phone said: ' +
            (await p
              .locator('#remote-said')
              .innerText()
              .catch(() => 'nothing')),
        );
      if (!(await p.locator('#remote-usb li').nth(1).locator('button').isDisabled()))
        issue(s.label + ' remote', 'a phone that has not accepted this computer can be pressed');
    }
    await audit(s, 'admin-remote-paired');
    note(
      'remote, paired: ' +
        (
          await p
            .locator('#remote-phones')
            .innerText()
            .catch(() => '')
        ).replace(/\s+/g, ' ') +
        ' | nav chip: ' +
        (await p
          .locator('#nav a[href="#remote"] .nc')
          .innerText()
          .catch(() => 'none')),
    );
    await p.locator('#remote-phones button', { hasText: 'Remove' }).first().click();
    await sleep(600);
    if (await p.locator('#remote-phones li').count()) issue(s.label + ' remote', 'Remove left the phone paired');
    await p.locator('#remote-switch').click();
    await p
      .locator('#remote-switch[aria-checked="false"]')
      .waitFor({ timeout: 10000 })
      .catch(() => issue(s.label + ' remote', 'the switch did not go off'));
    await sleep(300);
    if (await p.locator('#remote-pair, #remote-qr').count())
      issue(s.label + ' remote', 'pairing is still offered with Remote off');
  }
  // stop the team
  const stop = p.getByRole('button', { name: /Stop team/i });
  if (await stop.count()) {
    await stop.click();
    await sleep(1800);
    note('after Stop team: ' + p.url() + ' "' + (await title(s)).trim().slice(0, 60) + '"');
    if (!/start\.html/.test(p.url()))
      issue(s.label + ' admin', 'Stop team did not go back to Start your team: ' + p.url());
    await audit(s, 'after-stop');
  } else note('no Stop team button here');
}

const runs = sizes === 'all' ? ['desktop', 'phone'] : [sizes];
for (const size of runs) {
  if (which !== 'live') {
    console.log('\n== HOSTED ' + size + ' ==');
    await reading(HOSTED, size, 'hosted');
    await start(HOSTED, size, 'hosted', 'none');
  }
  if (which !== 'hosted') {
    console.log('\n== LIVE ' + size + ' ==');
    if (size === 'desktop') await reading(LIVE, size, 'live');
    for (const way of size === 'desktop' ? ['claude', 'local'] : ['claude']) {
      const s = await start(LIVE, size, 'live', way);
      if (s && s.page) {
        await admin(s);
        await s.ctx.close();
      }
    }
  }
}
await browser.close();
done();
console.log('\n' + (found.length ? found.length + ' issues' : 'no issues found by the crawl'));
process.exit(0);
