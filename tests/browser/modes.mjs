// modes.mjs - Simple and Developer modes, in a real browser against stand-ins, the way a person on the computer meets them: Start asks
// first; Simple is one choice and an app that is the conversation; Developer is everything; switching redraws in place. Also here:
// the Workspace's Git folder on this machine, which needs the desktop page.     node tests/browser/modes.mjs
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { PRODUCT_REMOTE_ON } from '../support/product.mjs';
process.env.FO_ALL_MODELS = '1'; // the checks walk every model in the catalogue, the shelved ones too
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'mode-state');
const OUT = path.join(WORK, 'mode');
const PORT = 5279;
const HFP = 5282;
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(state, 'bin'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 800)));
  if (!ok) bad++;
};
const mk = (n, seed) => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 255;
  return b;
};
const blobs = { 'LFM3-Omni-2B-Q4_K_M.gguf': mk(300000, 7), 'mmproj-LFM3-Omni-2B-Q8_0.gguf': mk(120000, 3) };
const names = Object.keys(blobs);
const FILES = JSON.stringify(
  names.map((name, i) => ({
    part: i ? 'projector' : 'model',
    name,
    bytes: blobs[name].length,
    sha256: createHash('sha256').update(blobs[name]).digest('hex'),
  })),
);
const hf = http.createServer((req, res) => {
  const body = blobs[decodeURIComponent(req.url.split('/').pop())];
  if (!body) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-length': body.length });
  res.end(body);
});
await new Promise((r) => hf.listen(HFP, '127.0.0.1', r));
for (const f of ['fake-llama.mjs', 'fake-brew.mjs', 'fake-browser.mjs', 'fake-tensorfold.mjs', 'fake-claude.mjs'])
  fs.chmodSync(path.join(T, f), 0o755);
const GF = path.join(WORK, 'mode-git', 'my-app');
fs.rmSync(path.dirname(GF), { recursive: true, force: true });
fs.mkdirSync(GF, { recursive: true });
{
  const g = (...a) =>
    execFileSync('git', a, {
      cwd: GF,
      env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(GF, '..', 'no-global'), GIT_CONFIG_NOSYSTEM: '1' },
    });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Pat Owner');
  g('config', 'user.email', 'pat@example.com');
  fs.writeFileSync(path.join(GF, 'README.md'), '# My app\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'first');
  g('remote', 'add', 'origin', 'git@gitlab.example.com:acme/my-app.git');
  fs.writeFileSync(path.join(GF, 'notes.txt'), 'mine\n');
}
const llama = path.join(state, 'bin', 'llama');
const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    FO_KEEP: '1',
    FO_PRODUCT_FILE: PRODUCT_REMOTE_ON,
    FO_STATE_DIR: state,
    FO_FAKE_DIR: state,
    FO_NO_NET: '1',
    FO_NO_OPEN: '1',
    FO_BILLING: '{"enforce":false}',
    FO_BIN_TENSORFOLD: path.join(T, 'fake-tensorfold.mjs'),
    FO_PI_CLI: path.join(T, 'fake-pi.mjs'),
    FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_ADDON_FILES: FILES,
    FO_HF_BASE: 'http://127.0.0.1:' + HFP,
    FO_BIN_LLAMA: llama,
    FO_BIN_BREW: path.join(T, 'fake-brew.mjs'),
    FO_FAKE_BREW_LLAMA: llama,
    FO_BIN_BROWSER: path.join(T, 'fake-browser.mjs'),
    FO_WEB_ANY: '1',
    FO_LINK_PORT: '47898',
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_PICK_FOLDER: GF,
  },
});
const stop = () => {
  try {
    srv.kill('SIGTERM');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(B + '/api/setup')).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(150);
}
const browser = await chromium.launch();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push('page error: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
};
const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const running = (p) =>
  p
    .getByText(/Your models? (is|are) running|Claude is ready|Your team is ready/)
    .first()
    .waitFor({ timeout: 90000 });
const nav = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('#nav a')]
      .filter((a) => a.offsetParent !== null)
      .map((a) => a.firstChild.textContent.trim()),
  );
const pills = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('#chips .pill')]
      .filter((x) => x.offsetParent !== null)
      .map((x) => {
        const r = x.getBoundingClientRect();
        return { says: x.innerText.replace(/\s+/g, ' ').trim(), top: Math.round(r.top), h: Math.round(r.height) };
      }),
  );
const level = (ps) => new Set(ps.map((x) => x.top)).size === 1 && new Set(ps.map((x) => x.h)).size === 1;

// ---- 1. Start asks first: Simple or Developer
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
watch(p);
await p.goto(B + '/start.html', { waitUntil: 'load' });
await p.locator('#modes').waitFor({ timeout: 15000 });
const first = await flat(p.locator('#modes'));
const three = await p.locator('.ways.three').count();
check(
  "start: before anything else it asks which way to use it, Simple or Developer, in plain words, and shows neither's choices yet",
  /Simple Just talk to it/i.test(first) &&
    /Developer A team that ships code/i.test(first) &&
    three === 0 &&
    (await p.locator('#modes .way').count()) === 2 &&
    (await wide(p)) <= 0,
  first.slice(0, 500),
);
const boxes = await p.evaluate(() =>
  [...document.querySelectorAll('#modes .way')].map((w) => {
    const r = w.getBoundingClientRect();
    const b = w.querySelector('.btn').getBoundingClientRect();
    return [Math.round(r.top), Math.round(r.height), Math.round(b.top)];
  }),
);
check(
  'start: the two cards are the same height, with their buttons on one line',
  boxes[0].join() === boxes[1].join(),
  boxes,
);
const topOf = (pg) =>
  pg.evaluate(() => {
    const t = document.querySelector('#mode-toggle');
    const sh = document.querySelector('#shut');
    const tag = document.querySelector('#mode');
    const r = (e) => e.getBoundingClientRect();
    const bs = [...t.querySelectorAll('button')];
    return {
      says: bs.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(),
      chip: tag.offsetParent !== null,
      mid: Math.round(Math.abs((r(t).top + r(t).bottom) / 2 - (r(sh).top + r(sh).bottom) / 2)),
      hT: Math.round(r(t).height),
      hS: Math.round(r(sh).height),
      widths: bs.map((b) => Math.round(r(b).width)),
      lines: document.querySelectorAll('#mode-line').length,
    };
  });
const top1 = await topOf(p);
check(
  'start: where "Running on this machine" was there is now the mode, Simple or Developer: neither lit until one is chosen, level with Shut down and as tall, both sides one width',
  top1.says === 'Simple,Developer' &&
    !top1.chip &&
    top1.mid <= 1 &&
    top1.hT === top1.hS &&
    top1.widths[0] === top1.widths[1] &&
    top1.lines === 0,
  top1,
);
await p.screenshot({ path: path.join(OUT, '1-choose.png') });

// ---- 2. Simple: one choice, where it thinks
await p.evaluate(() => {
  window.__same = 1;
});
await p.locator('#mode-simple').click();
await p.locator('#simple-start').waitFor({ timeout: 20000 });
const sim = await flat(p.locator('.simple'));
const mind = await p.evaluate(() => ({
  local: document.querySelector('#mind-local').getAttribute('aria-checked'),
  claude: document.querySelector('#mind-claude').getAttribute('aria-checked'),
  rec: [...document.querySelectorAll('.way .rec')].map((x) => x.closest('.way').id).join(),
  extras: [...document.querySelectorAll('#extras input')].map((x) => x.id),
  same: window.__same,
  mode: document.documentElement.dataset.mode,
}));
check(
  'simple: one choice, where the team thinks: on this computer (chosen, and marked as suiting it) or with Claude; no model names to pick from, and the page was not reloaded',
  mind.local === 'true' &&
    mind.claude === 'false' &&
    mind.rec === 'mind-local' &&
    mind.same === 1 &&
    mind.mode === 'simple' &&
    /Private Suits this computer On this computer/i.test(sim) &&
    /never leaves it/.test(sim) &&
    /Quickest With Claude/i.test(sim) &&
    /Nothing to download/.test(sim) &&
    (await p.locator('.av').count()) === 0 &&
    (await p.locator('.ways.three').count()) === 0,
  [mind, sim.slice(0, 700)],
);
check(
  'simple: the extras are plain ticks: read pictures, make pictures, make video, each with what it costs to download',
  mind.extras.length === 3 &&
    /Also let it/i.test(sim) &&
    /Let it see pictures/.test(sim) &&
    /GB more to download/.test(sim),
  [mind.extras, sim.slice(0, 900)],
);
const top2 = await topOf(p);
check(
  'simple: the toggle at the top says Simple, and there is no separate line about the mode anywhere on the page',
  top2.says === 'Simple*,Developer' && top2.lines === 0 && !/Switch to Developer/.test(sim),
  top2,
);
await p.screenshot({ path: path.join(OUT, '2-simple.png'), fullPage: true });
await p.locator('#mind-claude').click();
const asClaude = await p.evaluate(() => [
  document.querySelector('#mind-claude').getAttribute('aria-checked'),
  !!document.querySelector('#extras'),
  document.querySelector('.simple-go .muted').textContent,
]);
check(
  'simple: choosing Claude is one press, and the extras, which belong to a mind on this computer, are no longer offered',
  asClaude[0] === 'true' &&
    asClaude[1] === false &&
    /Claude Code is found or installed/.test(asClaude[2]) &&
    (await wide(p)) <= 0 &&
    !/\bnull\b|\bundefined\b/.test(await flat(p.locator('main'))),
  [asClaude, (await flat(p.locator('main'))).slice(-300)],
);
const railNow = await p.evaluate(() =>
  [...document.querySelectorAll('#rail li')]
    .filter((x) => x.offsetParent !== null)
    .map((x) => x.textContent + (x.classList.contains('now') ? '*' : '')),
);
check(
  'simple: the steps along the top are three, in its own words, and the first is where we are',
  railNow.join() === 'Choose*,Getting ready,Ready',
  railNow,
);
await p.locator('#mind-local').press('Enter');
await p.locator('#extra-lfm3-omni-2b').check();
await p.locator('#simple-start').click();
await p.locator('#plain-now').waitFor({ timeout: 10000 });
let lines = new Set();
for (let i = 0; i < 12; i++) {
  lines.add(
    await p
      .locator('#plain-now')
      .innerText()
      .catch(() => ''),
  );
  await sleep(250);
}
const getting = await p.evaluate(() => ({
  title: document.querySelector('#st-title').innerText,
  sub: document.querySelector('.plain-sub').innerText,
  folded: !document.querySelector('#plain-more').open,
  steps: document.querySelectorAll('#plain-more .todo li').length,
  ring: !!document.querySelector('.ring'),
  shown: [...document.querySelectorAll('.work.plain > *, .plain-side > *')]
    .filter((x) => x.offsetParent !== null)
    .map((x) => x.className || x.tagName)
    .join(),
  rail: [...document.querySelectorAll('#rail li')]
    .filter((x) => x.offsetParent !== null)
    .map((x) => x.textContent + (x.classList.contains('now') ? '*' : ''))
    .join(),
}));
const said = [...lines].filter(Boolean);
check(
  'simple, getting ready: the ring, and ONE plain line of what is happening now, with no engine, token or agent in it; every step is still there, folded away',
  /^Getting it ready$/i.test(getting.title.replace(/\s+/g, ' ')) &&
    getting.ring &&
    said.length >= 1 &&
    said.every((t) => !/tensorfold|token|agent|server|inference|homebrew|SHA|llama/i.test(t)) &&
    getting.folded &&
    getting.steps >= 7 &&
    /done once/.test(getting.sub) &&
    getting.rail === 'Choose,Getting ready*,Ready',
  [getting, said],
);
await p.screenshot({ path: path.join(OUT, '2b-getting-ready.png') });
await running(p);
const v1 = await (await fetch(B + '/api/setup')).json();
const done1 = await flat(p.locator('main'));
check(
  'simple: Start sets up the model we chose for this computer, with the extra that was ticked, and says it is running',
  v1.session &&
    v1.session.kind !== 'claude' &&
    v1.setup.done === true &&
    (v1.setup.addons || []).some((a) => a.id === 'lfm3-omni-2b' && a.ok) &&
    /Your team is ready/i.test(done1) &&
    /what you say stays here/.test(done1) &&
    /It can also look at pictures/.test(done1) &&
    /Start talking/.test(done1) &&
    !/tokens a second|agent check|first token/i.test(done1.replace(/How its try-out went.*$/i, '')) &&
    (await p.locator('#tryout').evaluate((d) => !d.open && /try-out jobs passed/.test(d.textContent))) &&
    (await p.locator('.tiles').count()) === 0,
  [v1.session && v1.session.model, v1.setup.addons, done1.slice(0, 300)],
);

// ---- 3. The app in Simple: the conversation
await p.screenshot({ path: path.join(OUT, '2c-ready.png') });
await p.locator('#meet').click();
await p.locator('.composer input').waitFor({ timeout: 15000 });
await sleep(500);
const sNav = await nav(p);
const sPills = await pills(p);
const sChat = await p.evaluate(() => ({
  top: !!document.querySelector('#chat-top') && document.querySelector('#chat-top').offsetParent !== null,
  side: !!document.querySelector('#chat-side') && document.querySelector('#chat-side').offsetParent !== null,
  to:
    !!document.querySelector('.talk-bar .to-row') && document.querySelector('.talk-bar .to-row').offsetParent !== null,
  acts: [...document.querySelectorAll('.simple-acts button')].map((b) => b.textContent),
  ph: document.querySelector('.composer input').placeholder,
  empty: (document.querySelector('.chat-empty') || {}).innerText || '',
}));
check(
  'app, simple: three pages only (the chat, the phone link, the plan), and nothing about code',
  sNav.join() === 'Team chat,Remote,Plan',
  sNav,
);
check(
  'app, simple: the chat is the page: no overview, no side column, no seats to address; instead what can be asked for',
  !sChat.top &&
    !sChat.side &&
    !sChat.to &&
    sChat.acts.join() === 'Ask,Find out,Look at a page' &&
    /look something up/.test(sChat.ph) &&
    /or show it a page/.test(sChat.empty) &&
    !/picture|video/i.test(sChat.acts.join() + sChat.ph + sChat.empty),
  sChat,
);
check(
  'app, simple: two pills, level with each other: where it thinks, and the mode',
  sPills.length === 2 &&
    /^Thinking On this computer$/i.test(sPills[0].says) &&
    /^Mode Simple$/i.test(sPills[1].says) &&
    level(sPills),
  sPills,
);
await p.locator('.simple-acts button', { hasText: 'Find out' }).click();
const started = await p.locator('.composer input').inputValue();
check('app, simple: pressing what you want starts the message for you', started === 'Find out ', started);
// the same page for a team whose picture maker is in use (the runner's state, as the page receives it, with that helper on)
{
  const q = await ctx.newPage();
  watch(q);
  await q.route('**/api/events', (r) => r.abort());
  await q.route('**/api/setup', async (r) => {
    if (r.request().method() !== 'GET') return r.continue();
    const res = await r.fetch();
    const j = await res.json();
    j.helpers = { ...(j.helpers || {}), draw: 'FLUX.2 klein 4B', film: null };
    await r.fulfill({ response: res, json: j });
  });
  await q.goto(B + '/app.html', { waitUntil: 'load' });
  await q.locator('.composer input').waitFor({ timeout: 15000 });
  await sleep(500);
  const acts = await q.locator('.simple-acts button').allInnerTexts();
  const ph = await q.locator('.composer input').getAttribute('placeholder');
  const starts = await q.locator('.starters button').allInnerTexts();
  check(
    'app, simple: what can be asked for follows the helpers in use: with the picture maker on, Make a picture is offered and Make a video is not',
    acts.join() === 'Ask,Find out,Look at a page,Make a picture' &&
      /ask for a picture$/.test(ph) &&
      starts.some((t) => /Make a picture/.test(t)) &&
      !starts.some((t) => /video/i.test(t)),
    [acts, ph, starts],
  );
  await q.close();
}
check('app, simple: the page does not scroll sideways', (await wide(p)) <= 0, await wide(p));
await p.screenshot({ path: path.join(OUT, '3-app-simple.png') });
await p.evaluate(() => {
  location.hash = '#jira';
});
await sleep(400);
{
  await p.locator('.composer input').fill('hello');
  await p.locator('.composer input').press('Enter');
  let heads = [];
  for (let i = 0; i < 80; i++) {
    heads = (await p.locator('.chat-log .msg-head').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    if (heads.some((t) => /^(Sam|Robin|Alex|Jamie|Pat)\b/.test(t))) break;
    await sleep(400);
  }
  check(
    'app, simple: the team is people with plain jobs: a reply comes from a first name and what they do, never from a developer seat',
    heads.some((t) => /^(Sam|Robin|Alex|Jamie|Pat) (Organizer|Fact-checker|Doer|Artist|Editor)\b/i.test(t)) &&
      !heads.some((t) => /Overseer|Steward|Operations|Master|measured|exacting|decisive/i.test(t)),
    heads,
  );
  for (let i = 0; i < 40 && (await p.locator('.narr-bar.on').count()); i++) await sleep(400);
}
check(
  'app, simple: a page Simple does not show leads back to the chat',
  (await p.locator('#title').innerText()) === 'Team chat' && (await p.locator('.composer input').count()) === 1,
  await p.locator('#title').innerText(),
);

// ---- 4. Developer, switched to from the top of the app, in place
await p.evaluate(() => {
  location.hash = '#chat';
  window.__same = 2;
});
await sleep(300);
await p.locator('#mode-pill').click();
await p.locator('#overview-open').waitFor({ timeout: 8000 });
const dNav = await nav(p);
const dPills = await pills(p);
const same = await p.evaluate(() => [
  window.__same,
  document.documentElement.dataset.mode,
  !!document.querySelector('.simple-acts'),
  document.querySelector('.talk-bar .to-row').offsetParent !== null,
]);
check(
  'app, developer: one press on the mode pill brings everything back, in place: all six pages, the overview, who a message is for',
  dNav.join() === 'Team chat,Workspace,Jira,Remote,Soul,Plan' && same.join() === '2,developer,false,true',
  [dNav, same],
);
{
  const dHeads = (await p.locator('.chat-log .msg-head').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(
    "app, developer: switched in place, the same replies carry the developer seats' names again",
    dHeads.some((t) => /^(Overseer|Steward|Operations|Ask|Master)\b/.test(t)) &&
      !dHeads.some((t) => /^(Sam|Robin|Alex|Jamie|Pat)\b/.test(t)),
    dHeads,
  );
}
{
  const q = await ctx.newPage();
  await q.route('**/js/product.js', (r) =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const PRODUCT = { remote: false };\n' }),
  ); // as the bundle would carry it with Remote switched off
  await q.goto(B + '/app.html#remote', { waitUntil: 'load' });
  await q.locator('.composer input').waitFor({ timeout: 15000 });
  await sleep(400);
  check(
    'remote switched off for this version: there is no Remote tab, and its address leads to the chat',
    (await q.locator('#nav a[href="#remote"]').count()) === 0 &&
      (await q.locator('#title').innerText()) === 'Team chat' &&
      (await q.locator('#nav a[href="#workspace"]').count()) === 1,
    await q.locator('#nav').innerText(),
  );
  await q.close();
}
check(
  'app, developer on a local model: three pills, level with each other: workspace, model, and a mode that says it is experimental; there is no autonomy pill',
  dPills.length === 3 &&
    /^Workspace/i.test(dPills[0].says) &&
    /^Model/i.test(dPills[1].says) &&
    /^Mode Developer \u00B7 experimental$/i.test(dPills[2].says) &&
    level(dPills) &&
    (await p.locator('#autonomy-pill, .pill-menu').count()) === 0,
  dPills,
);
await p.screenshot({ path: path.join(OUT, '4-app-developer.png') });

// ---- 5. Developer's Workspace: a Git folder that is already on this machine
await p.goto(B + '/app.html#workspace', { waitUntil: 'load' });
await p.locator('#ws-folder').waitFor({ timeout: 15000 });
await sleep(600);
const offer = await flat(p.locator('#view'));
check(
  'workspace: two ways to connect, a Git folder and GitHub, in few words, and nothing to set',
  /Git folder/.test(offer) &&
    /Find a Git folder/.test(offer) &&
    /GitHub/.test(offer) &&
    /Connect a Git folder or a GitHub repository\./.test(offer) &&
    !/never sent to us|type its path|comes back to you|reaches GitHub/i.test(offer) &&
    /Clone a repository/.test(offer) &&
    (await p.locator('#ws-url').count()) === 1 &&
    (await p.locator('#ws-path, #ws-folder-gh, .land-how, [data-how]').count()) === 0 &&
    offer.length < 1000,
  [offer.length, offer.slice(0, 900)],
);
await p.locator('#ws-folder').click();
await p.locator('#ws-folder-path').waitFor({ timeout: 20000 });
await sleep(900);
const card = await flat(p.locator('.card.chosen'));
const title = await flat(p.locator('#view h2').first());
const lead = await flat(p.locator('#ws-lead'));
check(
  'workspace: the folder that was found is connected: its name, where it is, its origin, the branch, what is not committed, and the two things to do with it',
  /Connected/i.test(card) &&
    /Choose a different folder/.test(card) &&
    /Disconnect/.test(card) &&
    /my-app/.test(card) &&
    card.includes(fs.realpathSync(GF)) &&
    /origin: gitlab\.example\.com\/acme\/my-app/.test(card) &&
    /On main at \w+/.test(card) &&
    /1 change of yours is not committed, so the team does not see it/.test(card) &&
    /Your team works in my-app/.test(title) &&
    card.length < 520,
  [title, card.length, card.slice(0, 600)],
);
const apart = await p.evaluate(() => {
  const a = document.querySelector('#ws-folder').getBoundingClientRect();
  const b = document.querySelector('#ws-disconnect').getBoundingClientRect();
  return Math.round(b.left - a.right);
});
check(
  'workspace: the two buttons on the connected card stand apart, and with a workspace connected the card to clone one is gone',
  apart >= 8 && (await p.locator('#ws-url').count()) === 0,
  apart,
);
check(
  'workspace: how work lands is not set here: the page says it is settled with the team in the chat',
  /settled with your team in the chat/.test(lead) &&
    (await p.locator('.land-how, [data-how], #ws-task').count()) === 0 &&
    !/Push a named branch|Keep it on this machine|comes back to you|Ask the team for a change here/i.test(
      await flat(p.locator('#view')),
    ),
  lead,
);
check('workspace: the page does not scroll sideways', (await wide(p)) <= 0, await wide(p));
await p.screenshot({ path: path.join(OUT, '5-workspace-folder.png'), fullPage: true });
if (await p.locator('dialog.step-done').count()) {
  await p.keyboard.press('Escape');
  await sleep(350);
} // the note that a step is done is closed, as a person would
await p.locator('#ws-disconnect').click();
const sure = await p.locator('#ws-disconnect').innerText();
const stillIn = await p.locator('.card.chosen').count();
check(
  'workspace: Disconnect is on the connected card, and one press only asks "Really disconnect?"',
  (await p.locator('.card.chosen #ws-disconnect').count()) === 1 && sure === 'Really disconnect?' && stillIn === 1,
  [sure, stillIn],
);
await p.locator('#ws-disconnect').click();
await p.locator('#conn-said').waitFor({ timeout: 10000 });
await sleep(600);
const off = await p.evaluate(() => ({
  title: document.querySelector('#view h2').textContent,
  said: document.querySelector('#conn-said').textContent,
  chosen: document.querySelectorAll('.card.chosen').length,
  conns: document.querySelectorAll('#conn-workspace').length,
  offer: !!document.querySelector('#ws-folder'),
  task: !!document.querySelector('#ws-pending, #ws-clone'),
}));
const wsNow = await (await fetch(B + '/api/workspace')).json();
check(
  'workspace: the second press disconnects: the page says nothing was deleted and that the copy is kept, no card is in use, and a folder can be chosen again',
  off.title === 'No workspace yet' &&
    /Disconnected from my-app\. Nothing was deleted/.test(off.said) &&
    /copy is kept on this machine/.test(off.said) &&
    off.chosen === 0 &&
    off.conns === 0 &&
    off.offer &&
    !off.task &&
    wsNow.repo === null &&
    fs.existsSync(path.join(GF, 'notes.txt')),
  [off, wsNow.repo],
);
await p.screenshot({ path: path.join(OUT, '5b-workspace-disconnected.png') });

// ---- 6. Start in Developer shows every way, and can go back to Simple; Simple with Claude
await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' });
await sleep(500);
await p.goto(B + '/start.html', { waitUntil: 'load' });
await p.locator('.ways.three').waitFor({ timeout: 15000 });
const line = (await topOf(p)).says;
check(
  'start, developer: the three ways are there as before, with one line that says the mode and switches it',
  line === 'Simple,Developer*' &&
    (await p.locator('#mode-line').count()) === 0 &&
    (await p.locator('#go-local').count()) === 1 &&
    (await p.locator('#go-claude').count()) === 1,
  line,
);
await p.screenshot({ path: path.join(OUT, '6-start-developer.png') });
await p.evaluate(() => {
  window.__same = 3;
});
await p.locator('#mode-toggle button[data-mode-is="simple"]').click();
await p.locator('#simple-start').waitFor({ timeout: 20000 });
const back = await p.evaluate(() => [
  window.__same,
  document.documentElement.dataset.mode,
  document.querySelector('#mind-local').getAttribute('aria-checked'),
]);
const ready = await flat(p.locator('#mind-local'));
check(
  'start: switching to Simple redraws in place and remembers what was chosen',
  back.join() === '3,simple,true' && /On this computer/.test(ready),
  [back, ready],
);
await p.locator('#mind-claude').click();
await p.locator('#simple-start').click();
await running(p).catch(async (e) => {
  const v = await (await fetch(B + '/api/setup')).json();
  console.log(
    'CLAUDE SETUP DID NOT FINISH: ' +
      JSON.stringify({
        busy: v.busy,
        error: v.setup && v.setup.error,
        steps: v.setup && v.setup.steps.map((x) => x.id + ':' + x.state + ' ' + (x.detail || '').slice(0, 80)),
      }).slice(0, 900) +
      ' | page: ' +
      (await flat(p.locator('main'))).slice(0, 300),
  );
  throw e;
});
const v2 = await (await fetch(B + '/api/setup')).json();
check(
  'simple, with Claude: Start sets the team up on Claude Code',
  v2.session && v2.session.kind === 'claude' && v2.setup.done === true,
  [v2.session, v2.setup.error],
);
await p.goto(B + '/app.html', { waitUntil: 'load' });
await p.locator('.composer input').waitFor({ timeout: 15000 });
await sleep(400);
const cPills = await pills(p);
check(
  'app, simple, with Claude: the pill says it thinks with Claude',
  cPills.length === 2 && /^Thinking With Claude$/i.test(cPills[0].says) && level(cPills),
  cPills,
);
// (the team now thinks with Claude Code) back to Developer, and the folder connected again
await p.locator('#mode-pill').click();
await p.locator('#overview-open').waitFor({ timeout: 8000 });
await p.evaluate(() => {
  location.hash = '#workspace';
});
await p.locator('#ws-folder').waitFor({ timeout: 15000 });
await sleep(500);
await p.locator('#ws-folder').click();
await p.locator('#ws-folder-path').waitFor({ timeout: 20000 });
await sleep(900);
if (await p.locator('dialog.step-done').count()) {
  await p.keyboard.press('Escape');
  await sleep(350);
} // the note that a step is done is closed, as a person would
// ---- 5a. A change asked for in the chat is built in the workspace. Ask me first asks before it builds; Land on green does not.
await p.evaluate(() => {
  location.hash = '#chat';
});
await p.locator('.composer input').waitFor({ timeout: 10000 });
await sleep(400);
const tell = async (t) => {
  await p.locator('.composer input').fill(t);
  await p.locator('.composer input').press('Enter');
};
const log = async () => (await p.locator('.chat-log').innerText()).replace(/\s+/g, ' ');
const wsOf = async () => (await fetch(B + '/api/workspace')).json();
const until = async (re, ms = 120000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) {
    if (re.test(await log())) return true;
    await sleep(400);
  }
  return false;
};

await tell('Add a line to the README saying hello');
await sleep(9000);
const asked = await wsOf();
const afterAsk = await log();
check(
  'the team speaks before it builds: nothing is changed in the workspace until the customer answers',
  asked.changed.length === 0 && !/I changed \d+ file/.test(afterAsk) && !/Nothing was built/.test(afterAsk),
  [asked.changed, afterAsk.slice(-400)],
);
await tell('What branch are we on right now?');
const reminded = await until(
  /"Add a line to the README saying hello" is still waiting for you: answer above, or say "go"\./,
  60000,
);
check(
  "a question of the customer's own while the team waits is answered, and the request goes on waiting",
  reminded && (await wsOf()).changed.length === 0 && !/I changed \d+ file/.test(await log()),
  [reminded, (await log()).slice(-300)],
);
await tell('go');
const built = await until(/I changed 1 file in my-app: README\.md\. Nothing has left this machine\./);
const waits =
  built &&
  (await until(/waits for you\. Say "land it" \(it goes on the branch feature\/[\w-]+\) or "throw it away"\./));
const pend = await wsOf();
check(
  'told to go on main, a shared branch, the team takes the branch it recommended, named by the usual convention; it builds in its copy, tries to prove it, and a change it could not prove waits',
  built &&
    waits &&
    pend.changed.length === 1 &&
    pend.changed[0].path === 'README.md' &&
    /^feature\//.test(pend.pending.branch) &&
    pend.pending.push === false &&
    /(Not proven yet\.|I could not prove it:)/.test(await log()) &&
    fs.readFileSync(path.join(GF, 'README.md'), 'utf8') === '# My app\n',
  [built, waits, pend.pending, (await log()).slice(-500)],
);
await tell('Add one more line to the README');
const guarded = await until(/An earlier change is still waiting\. Say "land it" or "throw it away" first/, 90000);
check(
  'with a change still waiting the team says so at once, and builds nothing over it',
  guarded && (await wsOf()).changed.length === 1,
  [guarded, (await log()).slice(-400)],
);
await p.evaluate(() => {
  location.hash = '#workspace';
});
await p.locator('#ws-pending').waitFor({ timeout: 10000 });
await sleep(400);
const waitCard = await flat(p.locator('.card.ws-wait'));
check(
  'workspace: the change that is waiting has a card of its own, with the branch it will land on',
  /A change is waiting/i.test(waitCard) &&
    /The team changed 1 file/.test(waitCard) &&
    /README\.md/.test(waitCard) &&
    /Land it on feature\/[\w-]+/.test(waitCard) &&
    /Throw it away/.test(waitCard),
  waitCard.slice(0, 500),
);
await p.evaluate(() => {
  location.hash = '#chat';
});
await p.locator('.composer input').waitFor({ timeout: 10000 });
await sleep(400);
await tell('land it');
const landedSaid = await until(/Landed: the branch feature\/[\w-]+ is in your folder\./, 60000);
const afterLand = await wsOf();
check(
  '"land it" in the chat lands the waiting change: the branch is in the customer\'s folder, not pushed, and their checkout and files have not moved',
  landedSaid &&
    afterLand.changed.length === 0 &&
    afterLand.pending === null &&
    afterLand.last.how === 'branch' &&
    afterLand.last.pushed === false &&
    fs.existsSync(path.join(GF, '.git', 'refs', 'heads', 'feature')) &&
    fs.readFileSync(path.join(GF, 'README.md'), 'utf8') === '# My app\n' &&
    fs.existsSync(path.join(GF, 'notes.txt')),
  [landedSaid, afterLand.last, (await log()).slice(-300)],
);
await tell('Add one more line to the README saying goodbye. Stay on main, no branch.');
const stated = await until(
  /The request says enough to build from\. You said to stay on main, so it goes there\./,
  60000,
);
const built2 =
  stated && (await until(/waits for you\. Say "land it" \(it is committed onto main\) or "throw it away"\./, 120000));
const w2 = await wsOf();
check(
  'a request that says where it goes is not asked about it: the team says so and builds, and what could not be proven waits',
  stated && built2 && w2.changed.length === 1 && w2.pending.branch === '',
  [stated, built2, w2.pending, (await log()).slice(-400)],
);
await tell('throw it away');
const thrown = await until(/Thrown away\. Nothing left this machine\./, 60000);
const w3 = await wsOf();
check(
  '"throw it away" in the chat discards the waiting change, and the customer\'s folder is as it was',
  thrown &&
    w3.changed.length === 0 &&
    w3.pending === null &&
    fs.readFileSync(path.join(GF, 'README.md'), 'utf8') === '# My app\n',
  [thrown, w3.changed],
);
await p.screenshot({ path: path.join(OUT, '5a-chat-build.png') });
await p.evaluate(() => {
  location.hash = '#workspace';
});
await p.locator('#ws-lead').waitFor({ timeout: 10000 });
await sleep(500);
await ctx.close();

// ---- 7. On a narrow screen
{
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const q = await c2.newPage();
  watch(q);
  await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' });
  await sleep(400);
  await q.goto(B + '/start.html', { waitUntil: 'load' });
  await q.locator('#modes').waitFor({ timeout: 15000 });
  check('narrow: the choice of mode does not scroll sideways', (await wide(q)) <= 0, await wide(q));
  await q.screenshot({ path: path.join(OUT, '7-narrow-choose.png'), fullPage: true });
  await q.locator('#mode-simple').click();
  await q.locator('#simple-start').waitFor({ timeout: 20000 });
  check("narrow: Simple's one choice does not scroll sideways", (await wide(q)) <= 0, await wide(q));
  await q.screenshot({ path: path.join(OUT, '7-narrow-simple.png'), fullPage: true });
  await c2.close();
}
// ---- 8. With billing switched on and nobody paying yet: Simple says what the plan allows
stop();
await sleep(700);
{
  const state2 = path.join(WORK, 'mode-state2');
  fs.rmSync(state2, { recursive: true, force: true });
  fs.mkdirSync(state2, { recursive: true });
  // a publisher's own plans, as their .owner/ folder would hold them: billing switched on, and a lock for the paid plan (a made-up address)
  const ownerDir = path.join(state2, 'owner');
  fs.mkdirSync(ownerDir, { recursive: true });
  fs.writeFileSync(
    path.join(ownerDir, 'billing.js'),
    fs
      .readFileSync(path.join(ROOT, 'js', 'billing.js'), 'utf8')
      .replace('enforce: false', 'enforce: true')
      .replace("lock: ''", "lock: '0x" + '1'.repeat(40) + "'"),
  );
  const srv2 = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      FO_KEEP: '1',
      FO_PRODUCT_FILE: PRODUCT_REMOTE_ON,
      FO_STATE_DIR: state2,
      FO_FAKE_DIR: state2,
      FO_NO_NET: '1',
      FO_NO_OPEN: '1',
      FO_OWNER_DIR: ownerDir,
      FO_BIN_TENSORFOLD: path.join(T, 'fake-tensorfold.mjs'),
      FO_PI_CLI: path.join(T, 'fake-pi.mjs'),
      FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
      FO_CLAUDE_ROOT: path.join(state2, 'claude'),
      FO_BIN_LLAMA: path.join(state2, 'no-llama'),
      FO_LINK_PORT: '47898',
      FO_BIN_GH: path.join(state2, 'no-gh'),
      FO_BIN_ADB: path.join(state2, 'no-adb'),
    },
  });
  process.on('exit', () => {
    try {
      srv2.kill('SIGTERM');
    } catch {
      /* gone */
    }
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  const c8 = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
  await c8.addInitScript(() => {
    try {
      localStorage.setItem('familyoffice.mode', 'simple');
      if (!localStorage.getItem('familyoffice.simple.mind')) localStorage.setItem('familyoffice.simple.mind', 'local');
    } catch (e) {
      /* none */
    }
  }); // as someone who chose "on this computer" while a code covered it
  const q = await c8.newPage();
  watch(q);
  await q.goto(B + '/start.html', { waitUntil: 'load' });
  await q.locator('#simple-start').waitFor({ timeout: 20000 });
  await sleep(500);
  const lic = await (await fetch(B + '/api/license')).json();
  const paid = await q.evaluate(() => {
    const g = (s) => (document.querySelector(s) || {}).textContent || '';
    const strip = document.querySelector('#plan-strip');
    return {
      strip:
        strip && !strip.hidden
          ? strip.dataset.plan + ': ' + strip.innerText.replace(/\s+/g, ' ').slice(0, 160)
          : 'hidden',
      code: !!document.querySelector('#plan-strip button, #plan-strip input'),
      local: g('#plan-mark-local'),
      claude: g('#plan-mark-claude'),
      start: g('#simple-start'),
      mind: document.querySelector('#mind-local').getAttribute('aria-checked'),
      claudeOn: document.querySelector('#mind-claude').getAttribute('aria-checked'),
      extras: !!document.querySelector('#extras'),
      rec: document.querySelectorAll('#mind-local .rec').length,
      card: document.querySelector('#mind-local').innerText.replace(/\s+/g, ' '),
    };
  });
  check(
    'simple, billing on, Free, for someone who had chosen "on this computer" under a code that no longer applies: Claude is the one chosen, the local mind is not marked as the one to take and offers no extras; the plan bar is above the choice with its way to pay or use a code; "On this computer" is marked as needing the paid plan and says so; "With Claude" is in every plan; and Start says what it will do',
    lic.enforce === true &&
      /^free:/.test(paid.strip) &&
      paid.code &&
      /^Needs /.test(paid.local) &&
      paid.claude === 'In every plan' &&
      paid.mind === 'false' &&
      paid.claudeOn === 'true' &&
      paid.start === 'Start' &&
      paid.extras === false &&
      paid.rec === 0 &&
      /It needs .+: use a code or get/.test(paid.card) &&
      !/\bnull\b|\bundefined\b/.test(await flat(q.locator('main'))),
    [lic.enforce, lic.name, paid],
  );
  await q.locator('#mind-local').click();
  const goLabel = await q.locator('#simple-start').innerText();
  await q.locator('#mind-claude').click();
  const goClaude = await q.locator('#simple-start').innerText();
  check(
    'simple, billing on, Free: the button reads "Get ... to start" for a mind on this computer and plain "Start" for Claude',
    /^Get .+ to start$/.test(goLabel) && goClaude === 'Start',
    [goLabel, goClaude],
  );
  await q.locator('#mind-local').click();
  await q.screenshot({ path: path.join(OUT, '8-simple-free.png'), fullPage: true });

  // ---- 9. The landing page: the workflow between the seats, and the four scenes
  const l = await c8.newPage();
  watch(l);
  await l.goto(B + '/index.html', { waitUntil: 'load' });
  await l.locator('#seats .seat').first().waitFor({ timeout: 15000 });
  const steps = await l.locator('#seats .seat-step').allInnerTexts();
  check(
    'landing, the team: each seat carries its step in the order the work moves',
    steps.map((t) => t.replace(/\s+/g, ' ')).join('|') ===
      '1 Plans it|2 Writes the judge|3 Builds until it passes|4 Checks how it looks|5 Lands it',
    steps,
  );
  await l.locator('#seats').scrollIntoViewIfNeeded();
  await l.evaluate(() => document.querySelector('#seats').scrollIntoView({ block: 'center' }));
  const seen = [];
  const many = [];
  let dots = 0;
  let drew = 0;
  for (let i = 0; i < 52; i++) {
    const t = await l.evaluate(() => ({
      on: [...document.querySelectorAll('#seats .seat.on')].map((c) => c.dataset.seat),
      dot: document.querySelector('.flow-dot').style.opacity === '1',
      len: document.querySelector('.flow-line').getAttribute('d') || '',
    }));
    if (t.on.length > 1) many.push(t.on.join('+'));
    for (const id of t.on) if (seen[seen.length - 1] !== id) seen.push(id);
    if (t.dot) dots++;
    if (t.len) drew++;
    if (i === 14) await l.screenshot({ path: path.join(OUT, '9-team-flow.png') });
    await sleep(250);
  }
  check(
    'landing, the team: the work moves seat to seat in order, one seat lit at a time, with a point of light crossing between them along a drawn line',
    seen.slice(0, 5).join() === 'overseer,steward,operations,ask,master' &&
      many.length === 0 &&
      dots >= 4 &&
      drew > 0 &&
      (await wide(l)) <= 0,
    [seen, many, dots, drew],
  );
  await l.evaluate(() => document.querySelector('#system .traits').scrollIntoView({ block: 'center' }));
  await sleep(1200);
  const sc = await l.evaluate(() =>
    [...document.querySelectorAll('#system .traits article')].map((a) => ({
      playing: a.classList.contains('playing'),
      run: a.querySelector('.scene')
        ? [...a.querySelectorAll('.scene *')].reduce(
            (n, el) => n + el.getAnimations().filter((x) => x.playState === 'running').length,
            0,
          )
        : -1,
      h3: a.querySelector('h3').textContent,
      words: a.querySelector('p').textContent.length,
      label: (
        a.querySelector('.scene') || {
          getAttribute() {
            return '';
          },
        }
      ).getAttribute('aria-label').length,
      w: Math.round(a.querySelector('.scene') ? a.querySelector('.scene').getBoundingClientRect().width : 0),
    })),
  );
  check(
    'landing, what the team is made of: each of the four habits is its words and a scene that is playing, with a description for someone who cannot see it',
    sc.length === 4 &&
      sc.every((x) => x.playing && x.run >= 3 && x.words > 60 && x.label > 60 && x.w > 150) &&
      (await wide(l)) <= 0,
    sc,
  );
  await sleep(1500);
  await l.locator('#system').screenshot({ path: path.join(OUT, '9-scenes.png') });
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const cq = await calm.newPage();
  watch(cq);
  await cq.goto(B + '/index.html', { waitUntil: 'load' });
  await cq.locator('#seats .seat').first().waitFor({ timeout: 15000 });
  await cq.evaluate(() => document.querySelector('#seats').scrollIntoView({ block: 'center' }));
  await sleep(2200);
  await cq.evaluate(() => document.querySelector('#system .traits').scrollIntoView({ block: 'center' }));
  await sleep(900);
  const still = await cq.evaluate(() => ({
    on: document.querySelectorAll('#seats .seat.on').length,
    playing: document.querySelectorAll('.traits .playing').length,
    run: [...document.querySelectorAll('.scene *')].reduce(
      (n, el) => n + el.getAnimations().filter((x) => x.playState === 'running').length,
      0,
    ),
    steps: document.querySelectorAll('#seats .seat-step').length,
    over: document.scrollingElement.scrollWidth - innerWidth,
  }));
  check(
    "landing, with less motion asked for and on a narrow screen: nothing moves, the numbered steps and the scenes' finished frames are there, and the page does not scroll sideways",
    still.on === 0 && still.playing === 0 && still.run === 0 && still.steps === 5 && still.over <= 0,
    still,
  );
  await cq.screenshot({ path: path.join(OUT, '9-narrow-calm.png') });
  await calm.close();
  await c8.close();
  try {
    srv2.kill('SIGTERM');
  } catch {
    /* gone */
  }
  await sleep(400);
}
// ---- 10. Clear all: asks first, says what goes and what stays, then the app is as it was when first started
{
  const c10 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const z = await c10.newPage();
  watch(z);
  fs.rmSync(path.join(WORK, 'mode-state3'), { recursive: true, force: true });
  const srv3 = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      FO_KEEP: '1',
      FO_PRODUCT_FILE: PRODUCT_REMOTE_ON,
      FO_STATE_DIR: path.join(WORK, 'mode-state3'),
      FO_FAKE_DIR: path.join(WORK, 'mode-state3'),
      FO_NO_NET: '1',
      FO_NO_OPEN: '1',
      FO_BILLING: '{"enforce":false}',
      FO_BIN_TENSORFOLD: path.join(T, 'fake-tensorfold.mjs'),
      FO_PI_CLI: path.join(T, 'fake-pi.mjs'),
      FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
      FO_CLAUDE_ROOT: path.join(WORK, 'mode-state3', 'claude'),
      FO_BIN_LLAMA: path.join(WORK, 'mode-state3', 'no-llama'),
      FO_LINK_PORT: '47898',
      FO_BIN_GH: path.join(WORK, 'mode-state3', 'no-gh'),
      FO_BIN_ADB: path.join(WORK, 'mode-state3', 'no-adb'),
      FO_PICK_FOLDER: GF,
    },
  });
  process.on('exit', () => {
    try {
      srv3.kill('SIGTERM');
    } catch {
      /* gone */
    }
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  await z.goto(B + '/start.html', { waitUntil: 'load' });
  await z.locator('#mode-developer').click();
  await z.locator('#go-claude').click();
  await running(z);
  await z.goto(B + '/app.html', { waitUntil: 'load' });
  await z.locator('.composer input').waitFor({ timeout: 15000 });
  await z.locator('.composer input').fill('Hello team');
  await z.locator('.composer input').press('Enter');
  await sleep(2500);
  const foot = await z.evaluate(() => {
    const a = document.querySelector('#out').getBoundingClientRect();
    const b = document.querySelector('#clear-all').getBoundingClientRect();
    const c = getComputedStyle(document.querySelector('#clear-all'));
    return {
      sameRow: Math.round(a.top) === Math.round(b.top),
      sameH: Math.round(a.height) === Math.round(b.height),
      right: b.left > a.right,
      red: c.color,
    };
  });
  await z.locator('#clear-all').click();
  await z.locator('#clear-dialog').waitFor({ timeout: 4000 });
  const asks = await flat(z.locator('#clear-dialog'));
  const before = await z.evaluate(() => ({
    chat: document.querySelectorAll('.chat-log > *').length,
    keys: Object.keys(localStorage).filter((k) => k.startsWith('familyoffice.')).length,
  }));
  check(
    'clear all: a red button beside Stop team, level with it; one press only opens a dialog that says what is deleted and what is kept',
    foot.sameRow &&
      foot.sameH &&
      foot.right &&
      /255, 15\d, 15\d/.test(foot.red) &&
      /Delete everything and start again\?/.test(asks) &&
      /DELETED/i.test(asks) &&
      /The whole chat/.test(asks) &&
      /Jira and GitHub sign-ins/.test(asks) &&
      /KEPT/i.test(asks) &&
      /models and helpers already downloaded/.test(asks) &&
      /Your plan/.test(asks) &&
      before.chat > 0,
    [foot, asks.slice(0, 400), before],
  );
  await z.screenshot({ path: path.join(OUT, '10-clear-all.png') });
  {
    const gap = await z.evaluate(() => {
      const a = document.querySelector('#clear-no').getBoundingClientRect();
      const b = document.querySelector('#clear-go').getBoundingClientRect();
      return { gap: Math.round(b.left - a.right), sameRow: Math.abs(a.top - b.top) < 2 };
    });
    check('clear all: the two buttons of the dialog stand apart on one row', gap.gap >= 8 && gap.sameRow, gap);
  }
  {
    await z.locator('#clear-models').check();
    await sleep(400);
    const ticked = await z.evaluate(() => ({
      go: document.querySelector('#clear-go').textContent,
      kept: document.querySelector('#clear-kept-models').hidden,
      phones: document.querySelector('#clear-phones').textContent,
      note: document.querySelector('#clear-models-note').textContent,
    }));
    let sentBody = null;
    await z.route('**/api/reset', async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      sentBody = r.request().postDataJSON();
      await r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'held by the test' }),
      });
    }); // never let through: this runner reads the real model cache
    await z.locator('#clear-go').click();
    await sleep(700);
    const held = await flat(z.locator('#clear-dialog'));
    await z.unroute('**/api/reset');
    await z.locator('#clear-models').uncheck();
    check(
      'clear all: a tick box also deletes the downloaded models and says what is there; ticked, the button says so and that is what is asked for; paired phones are among what is deleted',
      /Delete everything and the models/.test(ticked.go) &&
        ticked.kept === true &&
        /paired/i.test(ticked.phones) &&
        /downloaded again/.test(ticked.note) &&
        !!sentBody &&
        sentBody.sure === true &&
        sentBody.models === true &&
        /could not be cleared/.test(held) &&
        (await z.locator('#clear-go').textContent()) === 'Delete everything' &&
        !/Phones you have paired/.test(asks),
      [ticked, sentBody, held.slice(-200)],
    );
  }
  await z.locator('#clear-no').click();
  await sleep(200);
  check(
    'clear all: Cancel closes the dialog and nothing is deleted',
    (await z.locator('#clear-dialog').count()) === 0 &&
      (await z.evaluate(() => document.querySelectorAll('.chat-log > *').length)) === before.chat &&
      (await (await fetch(B + '/api/setup')).json()).session !== null,
  );
  await z.locator('#clear-all').click();
  await z.locator('#clear-go').click();
  await z.locator('#modes').waitFor({ timeout: 20000 });
  const after = await z.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) =>
        k.startsWith('familyoffice.') && !['familyoffice.ran', 'familyoffice.port', 'familyoffice.ref'].includes(k),
    ),
  );
  const st3 = await (await fetch(B + '/api/setup')).json();
  check(
    'clear all: Delete everything stops the team, forgets what this browser kept, and goes to Start, which asks Simple or Developer as it did the first time',
    after.length === 0 &&
      st3.session === null &&
      /start\.html/.test(z.url()) &&
      (await z.locator('#modes .way').count()) === 2,
    [after, st3.session, z.url()],
  );
  await c10.close();
  try {
    srv3.kill('SIGTERM');
  } catch {
    /* gone */
  }
  await sleep(400);
}
check('no page error and no console error anywhere', errors.length === 0, errors);
console.log(bad ? bad + ' FAILED' : 'all passed');
await browser.close();
await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
stop();
hf.close();
await sleep(300);
process.exit(bad ? 1 : 0);
