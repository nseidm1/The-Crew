// app-pages.mjs - Start and the app's pages in a real browser, against stand-ins (Hugging Face, Homebrew, llama.cpp, the engine, the agent, Claude Code
// and its Jira connector, the browser that draws pictures). Nothing real is installed, fetched or changed.     node tests/browser/app-pages.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
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
      return x;
    };
    return b;
  };
} // Developer mode, unless a page chose otherwise
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'ui2-state');
const OUT = path.join(WORK, 'ui2');
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
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
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
const llama = path.join(state, 'bin', 'llama');
// a Git folder "already on this machine", for the Workspace: one commit, a GitLab origin, and one change that is not committed
const GF = path.join(WORK, 'ui2-git', 'my-app');
fs.rmSync(path.dirname(GF), { recursive: true, force: true });
fs.mkdirSync(GF, { recursive: true });
{
  const { execFileSync } = await import('node:child_process');
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
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
    FO_FAKE_AVATAR: 'none',
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
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
      errors.push('console: ' + m.text().slice(0, 200));
  });
};
process.on('exit', () => {
  if (errors.length) console.log('PAGE ERRORS: ' + JSON.stringify(errors).slice(0, 1500));
});
const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
const requests = () => {
  try {
    return fs
      .readFileSync(path.join(state, 'fake-requests.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// ---- 1. Choose your model: plain words, drawn capability, and the picture helper as a tick on the model
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  watch(p);
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#go-local').click();
  await p.locator('#next').click({ timeout: 15000 });
  await p.locator('#helper-lfm3-omni-2b').waitFor({ timeout: 15000 });
  const d = p.locator('#detail');
  const t = await flat(d);
  check(
    'model: the chosen model is described in one plain sentence and drawn: meters for size and speed, a bar for room, dots for what to expect',
    (await d.locator('.plain').count()) === 1 &&
      (await d.locator('.meter').count()) === 2 &&
      (await d.locator('.roombar').count()) === 1 &&
      (await d.locator('.dots3').count()) === 3 &&
      /What to expect/i.test(t) &&
      /Talking it through/.test(t) &&
      /Changing code/.test(t),
    t,
  );
  check(
    'model: a speed that was not measured here is drawn as expected, not as fact, and says so',
    (await d.locator('.meter.guess').count()) === 1 && /Not measured here yet/.test(t),
    t,
  );
  check(
    'model: the technical record and the exact commands are folded away, not gone',
    (await d.locator('details.more').count()) >= 2 &&
      !(await d.locator('details.more[open]').count()) &&
      (await d.locator('code').first().isHidden()),
  );
  check(
    'model: there is no separate add-on card: seeing pictures is a tick on the model',
    (await p.locator('#addon').count()) === 0 &&
      /Let it see pictures/.test(t) &&
      !(await p.locator('#helper-lfm3-omni-2b').isChecked()),
  );
  await p.locator('.av[data-id="qwen35-2b"]').click();
  const before = await flat(p.locator('#detail .steps-plain'));
  await p.locator('#helper-lfm3-omni-2b').check();
  const after = await flat(p.locator('#detail .steps-plain'));
  const name = await flat(p.locator('.pick-name'));
  check(
    'model: ticking it adds what it needs to the steps (llama.cpp, its download, a test that it can see), and the button says so',
    !/llama/.test(before) &&
      /Install llama\.cpp/.test(after) &&
      /Download LFM3-Omni-2B/.test(after) &&
      /Test that it can see/.test(after) &&
      /with eyes/.test(name),
    [before, after, name],
  );
  await p.locator('#helper-flux2-klein-4b').check();
  const more = await flat(p.locator('#detail .steps-plain'));
  const name2 = await flat(p.locator('.pick-name'));
  await p.locator('#helper-flux2-klein-4b').uncheck();
  check(
    'model: a helper that draws is a tick too: ticked, its engine, its download and its test join the steps',
    /Install stable-diffusion\.cpp/.test(more) &&
      /Download FLUX\.2 klein 4B/.test(more) &&
      /Test that it can draw/.test(more) &&
      /with eyes and a pencil/.test(name2) &&
      (await p.locator('.eyes-opt').count()) === 3 &&
      !/stable-diffusion/.test(await flat(p.locator('#detail .steps-plain'))),
    [more, name2],
  );
  check('model: the page does not scroll sideways', (await wide(p)) <= 0, await wide(p));
  await p.screenshot({ path: path.join(OUT, 'model.png'), fullPage: true });
  await p.locator('#setup').click();
  await p.locator('.todo li').first().waitFor({ timeout: 8000 });
  let steps = 0;
  // the mark of the step under way must be the SAME element from one look to the next: drawn anew, its turning starts again each time
  let redrawn = 0;
  let looks = 0;
  for (let i = 0; i < 200; i++) {
    steps = Math.max(steps, await p.locator('.todo > li').count());
    const kept = await p.evaluate(() => {
      const li = document.querySelector('.todo > li.run');
      if (!li) return null;
      const mark = li.querySelector(':scope > .mark');
      const title = li.querySelector('strong').textContent;
      const same = mark.__for === title;
      const was = document.__running;
      mark.__for = title;
      document.__running = title;
      return was === title ? same : null; // only where the same step was under way at the last look
    });
    if (kept !== null) {
      looks++;
      if (!kept) redrawn++;
    }
    if (await p.locator('#meet').count()) break;
    await sleep(150);
  }
  check(
    'setup: the turning mark of the step under way is never drawn again while that step runs',
    looks > 0 && redrawn === 0,
    { looks, redrawn },
  );
  const said = (await p.locator('[data-helper-said]').count())
    ? await flat(p.locator('[data-helper-said]').first())
    : '';
  check(
    'setup: with the tick, the helper is installed and tested as the last steps of the same setup, and Ready says it can see',
    steps === 11 && /It can see pictures\. LFM3-Omni-2B is set up and read its test picture/.test(said),
    [steps, said],
  );
  const readyTitle = await flat(p.locator('#st-title'));
  const readyLede = await flat(p.locator('#ready-lede'));
  check(
    'ready: with a helper beside the model it is models that are running, and the helper is named',
    readyTitle === 'Your models are running' &&
      /^Qwen3\.5-2B on TensorFold [\d.]+, with LFM3-Omni-2B beside it, on /.test(readyLede),
    [readyTitle, readyLede],
  );
  await p.screenshot({ path: path.join(OUT, 'ready.png'), fullPage: true });
  await p.locator('#again').click();
  await p.locator('#go-local').click();
  await p.locator('#next').click({ timeout: 15000 });
  await p.locator('#helper-lfm3-omni-2b').waitFor({ timeout: 15000 });
  check(
    'model: once downloaded, the tick is still a tick (on, and free to untick), with a way to remove the files',
    (await p.locator('#helper-lfm3-omni-2b').isChecked()) &&
      !(await p.locator('#helper-lfm3-omni-2b').isDisabled()) &&
      (await p.locator('.eyes-opt').count()) === 3 &&
      (await p.locator('[data-remove="lfm3-omni-2b"]').count()) === 1 &&
      /Already downloaded on this Mac/.test(await flat(p.locator('.eyes-opt[data-id="lfm3-omni-2b"]'))),
  );
  await ctx.close();
}

// ---- 2. The app opens on the team chat; the Overview is a button on it; the header pills are one shape
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh) FamilyOffice-Android-probe',
});
const p = await ctx.newPage();
watch(p);
await ctx.route('https://avatars.example.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
); // the stand-in people's pictures
await p.goto(B + '/app.html', { waitUntil: 'load' });
await p.locator('.composer input').waitFor({ timeout: 15000 });
check(
  'app: it opens on the team chat, and the navigation has no Overview, Proofs or Autonomy entry',
  (await p.locator('#title').innerText()) === 'Team chat' &&
    (await p.locator('#nav a[href="#overview"], #nav a[href="#proofs"], #nav a[href="#autonomy"]').count()) === 0 &&
    (await p.locator('#nav a').count()) === 5 &&
    (await p.locator('#nav a').first().innerText()).startsWith('Team chat'),
);
const ov = p.locator('#overview-open');
const ovText = await flat(ov);
check(
  'chat: the Overview is a button on the chat with a meter of the set-up, what is next and how the team stands',
  (await ov.locator('.ov-meter i').count()) === 3 &&
    (await ov.locator('.ov-meter i.on').count()) === 1 &&
    /1 of 3 set up\. Next: connect a workspace/.test(ovText) &&
    /Team idle/.test(ovText),
  ovText,
);
const pills = await p.evaluate(() =>
  [...document.querySelectorAll('#chips .pill')].map((a) => {
    const c = getComputedStyle(a);
    return {
      text: a.innerText.replace(/\s+/g, ' '),
      h: Math.round(a.getBoundingClientRect().height),
      tt: c.textTransform,
      ls: c.letterSpacing,
      bw: c.borderTopWidth,
      dot: getComputedStyle(a.querySelector('i')).backgroundColor,
    };
  }),
);
check(
  'pills: three, one height, one border, no capitals, each "what" then "how it stands"; there is no autonomy pill',
  pills.length === 3 &&
    (await p.locator('#autonomy-pill, .pill-menu').count()) === 0 &&
    new Set(pills.map((x) => x.h)).size === 1 &&
    pills.every((x) => x.tt === 'none' && x.bw === '1px' && (x.ls === 'normal' || x.ls === '0px')) &&
    /^Workspace Not connected$/.test(pills[0].text) &&
    /^Model Qwen3\.5-2B · \d+ tokens a second$/.test(pills[1].text),
  pills,
);
check(
  'pills: a dot says in place or still to do',
  pills[0].dot !== pills[1].dot,
  pills.map((x) => x.dot),
);
const faces = await p.evaluate(() =>
  [...document.querySelectorAll('#chat-side li.seat')].map((li) => ({
    face: !!li.querySelector('.seat-face.av svg.bd image.bd-shape'),
    fill: (li.querySelector('.seat-face svg.bd') || { getAttribute() {} }).getAttribute('class'),
    w: Math.round((li.querySelector('.seat-face') || li).getBoundingClientRect().width),
    text: li.innerText.replace(/\s+/g, ' '),
  })),
);
check(
  'who is here: each seat is its own character (the one it is everywhere), and its manner beside its name',
  faces.length === 5 &&
    faces.every((x) => x.face && x.w === 44) &&
    new Set(faces.map((x) => x.fill)).size === 5 &&
    /^Overseer \S+.* Idle$/.test(faces[0].text),
  faces,
);
await p.goto(B + '/app.html#autonomy', { waitUntil: 'load' });
await p.locator('.composer input').waitFor({ timeout: 5000 });
check(
  'autonomy: there is no such page or setting any more, and its old address leads to the chat',
  (await p.locator('#title').innerText()) === 'Team chat' &&
    (await p.locator('#autonomy-pill, .pill-menu, .pill-list').count()) === 0,
);
await p.keyboard.press('Escape');
await p.goto(B + '/app.html#proofs', { waitUntil: 'load' });
await p.locator('#soul-proofs').waitFor({ timeout: 5000 });
check(
  'proofs: they are on the Soul page now, and their old address leads there',
  (await p.locator('#title').innerText()) === 'Soul' &&
    /No proofs yet|runs/.test(await p.locator('#soul-proofs').locator('..').innerText()),
);
await p.goto(B + '/app.html#chat', { waitUntil: 'load' });
await p.locator('.composer input').waitFor({ timeout: 8000 });
await p.screenshot({ path: path.join(OUT, 'chat.png') });
await ov.click();
await p.locator('#overview-back').waitFor({ timeout: 5000 });
check(
  'overview: it opens from the button, with the way back to the chat',
  (await p.locator('#title').innerText()) === 'Overview' && (await p.locator('.setup-list li').count()) >= 4,
);
await p.locator('#overview-back').click();
await p.locator('.composer input').waitFor({ timeout: 5000 });

// ---- 3. What every team starts with: on the Soul page, and recalled by Vision on a firm match
const box = p.locator('.composer input');
const settle = async () => {
  let quiet = 0;
  let last = -1;
  for (let t = 0; t < 120 && quiet < 5; t++) {
    await sleep(300);
    const c = await p.locator('.chat-log .msg').count();
    const busy = await p.locator('.narr-bar.on').count();
    const live = await p.locator('.chat-log p.typing').count();
    if (c === last && !busy && !live) quiet++;
    else quiet = 0;
    last = c;
  }
};
await box.fill('How do we prove a change is done before we call it finished?');
await box.press('Enter');
await settle();
const recalled = requests()
  .filter((x) => /what every team starts with: proving a change/.test(x.tail || ''))
  .pop();
check(
  'chat: a question about proving a change is answered with what every team starts with put in front of the seat',
  !!recalled && /Done means proven: a check that fails on the code before the change/.test(recalled.tail),
  recalled && recalled.tail.slice(0, 500),
);
await box.fill('Draw a logo for my bakery');
await box.press('Enter');
await settle();
const cannot = (await p.locator('.chat-log .msg').last().innerText()).replace(/\s+/g, ' ');
check(
  'chat: asked to draw when no drawing helper is ticked, Ask says how to add one instead of taking it round the table',
  /I cannot draw yet/.test(cannot) && /Let it make pictures/.test(cannot),
  cannot,
);
await p.goto(B + '/app.html#learning', { waitUntil: 'load' });
await p.locator('details.base-topic').first().waitFor({ timeout: 8000 });
const topics = await p.locator('details.base-topic > summary').allInnerTexts();
await p.locator('details.base-topic').first().locator('summary').click();
const firstTopic = await flat(p.locator('details.base-topic').first());
check(
  "soul: what the team started with is shown by subject, apart from the customer's own lessons, and says which were used",
  topics.length === 7 &&
    /Proving a change/.test(topics[0]) &&
    /When: about to say a change is done/.test(firstTopic) &&
    /[01] of 1 used/i.test(firstTopic),
  [topics, firstTopic.slice(0, 300)],
);
check('soul: the page does not scroll sideways', (await wide(p)) <= 0);

// ---- 4. Jira as a board: columns by status, a card dragged to another column, a ticket opened, and a ticket brought to the team
const post = async (u, b) => (await fetch(B + u, { method: 'POST', headers: J, body: JSON.stringify(b || {}) })).json();
const conn = await post('/api/connect', { id: 'atlassian' });
let jstate = '';
for (let i = 0; i < 50; i++) {
  jstate = (await (await fetch(B + '/api/jira?fresh=1')).json()).state;
  if (jstate === 'connected') break;
  await sleep(300);
}
if (jstate !== 'connected') console.log('JIRA NOT CONNECTED: ' + jstate + ' ' + JSON.stringify(conn).slice(0, 400));
await p.goto(B + '/app.html#jira', { waitUntil: 'load' });
await p.reload({ waitUntil: 'load' });
await p.locator('#jira-show').waitFor({ timeout: 15000 }); // reloaded: the sign-in was made behind the page's back
const tools = await p.evaluate(() =>
  [...document.querySelector('.jira-tools').children]
    .map((el) => el.id || (el.querySelector('summary') || {}).id || el.className)
    .filter(Boolean),
);
check(
  "jira: the toolbar is in the board's own order: search, which tickets, area, then the board and Show tickets",
  tools.join(' ') === 'jira-find jira-what jira-area jira-area-not jira-clear jgap jira-board jira-show',
  tools,
);
const looks = await p.evaluate(() =>
  ['#jira-find', '#jira-what', '#jira-area', '#jira-board'].map((s) => {
    const el = document.querySelector(s);
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return Math.round(r.height) + '|' + c.borderTopLeftRadius + '|' + c.borderTopColor;
  }),
);
const room = await p.evaluate(() => {
  const s = document.querySelector('#jira-what');
  const a = getComputedStyle(s, '::after');
  const b = document.querySelector('#jira-board');
  return {
    caretGap: parseFloat(a.marginLeft),
    summaryPad: parseFloat(getComputedStyle(s).paddingRight),
    selectPad: parseFloat(getComputedStyle(b).paddingRight),
    native: getComputedStyle(b).appearance,
  };
});
check(
  'jira: every control in the toolbar is one height and one look, and each down arrow has room around it',
  new Set(looks).size === 1 &&
    room.caretGap >= 6 &&
    room.summaryPad >= 16 &&
    room.selectPad >= 36 &&
    room.native === 'none',
  [looks, room],
);
await p.locator('#jira-show').click();
await p.locator('.jcol').first().waitFor({ timeout: 20000 });
const cols = async () =>
  p.evaluate(() =>
    [...document.querySelectorAll('#jira-cols .jcol')].map(
      (c) => c.dataset.status + ':' + [...c.querySelectorAll('.jcard')].map((x) => x.dataset.key).join(','),
    ),
  );
const c0 = await cols();
const card = p.locator('.jcard[data-key="APP-12"]');
const cardText = await flat(card);
const otherNote = async () =>
  (await p.locator('#jira-other').count()) ? (await p.locator('#jira-other').innerText()).replace(/\s+/g, ' ') : '';
check(
  'jira: the board has its four columns, To Do, Reopened, In Progress and Tech Review, whether or not they hold a ticket; a ticket in another status is counted under it',
  c0.join(' | ') === 'To Do:APP-9 | Reopened: | In Progress:APP-12 | Tech Review:' &&
    /1 ticket is in a status that is not a column here \(Closed 1\)/.test(await otherNote()),
  [c0, await otherNote()],
);
check(
  "jira: a card reads as Jira's does: summary, where it belongs, its parent, then its kind, key, days in the column, flag, priority and whose it is",
  /^Checkout button is cut off on phones Android Checkout iOS APP-1 Checkout epic APP-12 \d+d( TU)?$/.test(cardText) &&
    (await card.locator('.jtype.bug').count()) === 1 &&
    (await card.locator('.jflag').count()) === 1 &&
    (await card.locator('.jprio.high').count()) === 1 &&
    (await card.locator('.jface').count()) === 1,
  cardText,
);
await p.locator('#jira-find').fill('footer');
await sleep(200);
const found = await cols();
const shown = await flat(p.locator('#jira-shown'));
check(
  'jira: Search board narrows the cards at once, keeps the box in focus, and says how many are shown',
  !found.join('|').includes('APP-12') &&
    !found.join('|').includes('APP-9') &&
    /Closed 1/.test(await otherNote()) &&
    /1 of 3 shown/.test(shown) &&
    (await p.evaluate(() => document.activeElement.id)) === 'jira-find',
  [found, shown],
);
await p.locator('#jira-clear').click();
await p.locator('.jcard[data-key="APP-12"]').waitFor({ timeout: 4000 });
await p.locator('.jcard[data-key="APP-12"]').dragTo(p.locator('.jcol[data-status="To Do"]'));
await sleep(300);
const mid = await cols();
for (let i = 0; i < 40 && (await p.locator('.jcard.moving').count()); i++) await sleep(200);
const moved = await cols();
const store = JSON.parse(fs.readFileSync(path.join(state, 'claude', 'fake-jira.json'), 'utf8'));
check(
  'jira: a card dragged to another column moves at once, and is then moved in Jira',
  /To Do:APP-9,APP-12|To Do:APP-12,APP-9/.test(mid[0]) &&
    /APP-12/.test(moved[0]) &&
    store.status['APP-12'] === 'To Do' &&
    !(await p.locator('.jcard.moving').count()),
  [mid, moved, store],
);
await p.locator('.jcard[data-key="APP-12"]').dragTo(p.locator('.jcol[data-status="Reopened"]'));
for (let i = 0; i < 40 && !(await p.locator('#jira-said').count()); i++) await sleep(200);
const back = await cols();
const why = (await p.locator('#jira-said').count()) ? await flat(p.locator('#jira-said')) : '';
check(
  "jira: a move the workflow does not allow puts the card back and says why in Jira's own words",
  /APP-12/.test(back[0]) &&
    !/APP-12/.test(back[1]) &&
    /APP-12 was not moved: no transition leads to "Reopened"/.test(why),
  [back, why],
);
await p.screenshot({ path: path.join(OUT, 'jira-board.png'), fullPage: true });
await p.locator('.jcard[data-key="APP-12"]').click();
await p.locator('#jira-ticket').waitFor({ timeout: 5000 });
for (let i = 0; i < 50 && (await p.locator('#jira-reading').count()); i++) await sleep(200);
const panel = await flat(p.locator('#jira-ticket'));
const opts = await p.locator('#jira-move option').allInnerTexts();
check(
  'jira: a pressed card is selected and opens beside the board: fields, description, subtasks, comments, and where it can move to',
  (await p.locator('.jcard.sel').count()) === 1 &&
    /Reporter Ana/.test(panel) &&
    /Sprint Sprint 12/.test(panel) &&
    /On a phone 360 wide the Pay button is cut off\./.test(panel) &&
    /APP-13 Fix the button/.test(panel) &&
    /Seen on Android too\./.test(panel) &&
    opts.join() === 'Move to…,In Progress',
  [panel.slice(0, 600), opts],
);
await p.locator('#jira-comment').fill('Checked on a Pixel 9.');
await p.locator('#jira-comment-go').click();
for (let i = 0; i < 40 && !/Checked on a Pixel 9\./.test(await flat(p.locator('.jcomments'))); i++) await sleep(200);
check(
  'jira: a comment typed on the ticket is added in Jira and shown',
  /You .*Checked on a Pixel 9\./.test(await flat(p.locator('.jcomments'))) &&
    JSON.parse(fs.readFileSync(path.join(state, 'claude', 'fake-jira.json'), 'utf8')).comments['APP-12'][0] ===
      'Checked on a Pixel 9.',
);
await p.locator('#jira-move').selectOption('In Progress');
for (let i = 0; i < 50 && !/In Progress:APP-12/.test((await cols()).join('|')); i++) await sleep(200);
check(
  'jira: the ticket can also be moved from its own view, for a screen that cannot drag',
  /In Progress:APP-12/.test((await cols()).join('|')),
  await cols(),
);
const tops = await p.evaluate(() =>
  [...document.querySelectorAll('#chips .pill')].map((a) => {
    const r = a.getBoundingClientRect();
    return Math.round(r.top) + ':' + Math.round(r.height);
  }),
);
check(
  'pills: on a page where one of them is the next step, all three still sit on one line at one size',
  new Set(tops).size === 1,
  tops,
);
const under = await p.evaluate(() => {
  const b = document.querySelector('#jira-cols').getBoundingClientRect();
  const c = [...document.querySelectorAll('#jira-cols .jcol')].map((x) => Math.round(x.getBoundingClientRect().width));
  return {
    board: Math.round(b.width),
    cols: c,
    fixed: getComputedStyle(document.querySelector('#jira-ticket')).position,
  };
});
check(
  'jira: the open ticket is a drawer over the page: the board under it keeps its width and its four equal columns',
  under.fixed === 'fixed' && under.cols.length === 4 && new Set(under.cols).size === 1 && under.cols[0] >= 230,
  under,
);
await p.locator('#jira-close').click();
await sleep(200);
await p.locator('.jcard[data-key="APP-12"]').dragTo(p.locator('.jcol[data-status="Tech Review"]'));
for (
  let i = 0;
  i < 50 && (!/Tech Review:APP-12/.test((await cols()).join('|')) || (await p.locator('.jcard.moving').count()));
  i++
)
  await sleep(200);
check(
  'jira: a card can be dragged on into Tech Review',
  /Tech Review:APP-12/.test((await cols()).join('|')) &&
    JSON.parse(fs.readFileSync(path.join(state, 'claude', 'fake-jira.json'), 'utf8')).status['APP-12'] ===
      'Tech Review',
  await cols(),
);
await p.locator('#jira-other-show').click();
await sleep(200);
const withOther = await cols();
await p.locator('#jira-other-show').click();
await sleep(200);
check(
  'jira: the tickets in other statuses can be shown, and hidden again',
  withOther.length === 5 && /Closed:WEB-3/.test(withOther[4]) && (await cols()).length === 4,
  withOther,
);
await p.locator('#jira-board').selectOption('b:7');
await sleep(300);
await p.locator('#jira-show').click();
let ran = '';
for (let i = 0; i < 100; i++) {
  ran = (await p.locator('.by-hand pre').count()) ? await p.locator('.by-hand pre').textContent() : '';
  if (/status in/.test(ran) && !/Reading Jira/.test(await p.locator('#jira-meta').innerText())) break;
  await sleep(200);
}
const what = (await p.locator('#jira-what').innerText()).replace(/\s+/g, ' ');
const boardCols = await p.evaluate(() =>
  [...document.querySelectorAll('#jira-cols .jcol')].map((c) => c.dataset.status),
);
check(
  'jira: a board that is chosen is read by its own filter and shows its own columns, for everyone',
  /^\(project = APP\) AND status in \(/.test(ran) &&
    /Everyone, this board/i.test(what) &&
    boardCols.join() === 'To Do,Reopened,In Progress,Tech Review' &&
    /Tech Review:APP-12/.test((await cols()).join('|')),
  [ran, what, boardCols],
);
check('jira: the board scrolls inside its own box, never the page', (await wide(p)) <= 0, await wide(p));
// the people's own pictures: looked up after the tickets are on the board, and put in place
for (let i = 0; i < 60 && !(await p.locator('.faces .face img').count()); i++) await sleep(200);
const pics = await p.evaluate(() => ({
  faces: [...document.querySelectorAll('.faces .face')].map(
    (f) => f.getAttribute('aria-label') + ':' + (f.querySelector('img') ? 'picture' : f.textContent.trim()),
  ),
  cards: document.querySelectorAll('.jcard .jface img').length,
  loaded: [...document.querySelectorAll('.faces .face img')].every((i) => i.complete && i.naturalWidth > 0),
}));
check(
  'jira: people the search gave no picture for get their own picture, on the faces and on the cards, put in place where they are',
  pics.faces.some((f) => f === 'Test User:picture') && pics.cards >= 1 && pics.loaded,
  pics,
);
// the Tickets menu's toggle: its choices fill the row, and the lit one has the same space above and below
await p.locator('#jira-what').click();
await sleep(250);
const segs = await p.evaluate(() =>
  [...document.querySelectorAll('.jmenu[open] .jseg')].map((s) => {
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    const px = (k) => parseFloat(cs[k]);
    const bs = [...s.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    const on = s.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    const inL = r.left + px('borderLeftWidth') + px('paddingLeft');
    const inR = r.right - px('borderRightWidth') - px('paddingRight');
    const inT = r.top + px('borderTopWidth') + px('paddingTop');
    const inB = r.bottom - px('borderBottomWidth') - px('paddingBottom');
    return {
      gapL: Math.round(bs[0].left - inL),
      gapR: Math.round(inR - bs[bs.length - 1].right),
      top: Math.round(on.top - inT),
      bottom: Math.round(inB - on.bottom),
      over: s.scrollWidth - s.clientWidth,
      words: Math.round(
        Math.abs(
          (on.left + on.right) / 2 -
            (() => {
              const g = document.createRange();
              g.selectNodeContents(s.querySelector('[aria-pressed="true"]'));
              const t = g.getBoundingClientRect();
              return (t.left + t.right) / 2;
            })(),
        ),
      ),
    };
  }),
);
check(
  'jira: in the Tickets menu a toggle fills its row edge to edge, and the lit choice sits square in it with its words in the middle',
  segs.length >= 1 &&
    segs.every((s) => s.gapL === 0 && s.gapR === 0 && s.top === 0 && s.bottom === 0 && s.over <= 0 && s.words <= 1),
  segs,
);
await p.locator('.jmenu[open] .jmenu-list').screenshot({ path: path.join(OUT, 'jira-whose.png') });
await p.locator('.jira-head h2').click();
await sleep(200);
// Area: the areas on the tickets, to tick; ticking narrows the board at once
const beforeArea = await p.locator('.jcard').count();
await p.locator('summary#jira-area').click();
await sleep(200);
const areaTicks = (await p.locator('.jmenu[open] [role="checkbox"]').allInnerTexts()).map((t) =>
  t.replace(/\s+/g, ' ').trim(),
);
await p.locator('.jmenu[open] [role="checkbox"]', { hasText: 'Android' }).click();
await sleep(250);
const onlyArea = await p.locator('.jcard').evaluateAll((els) => els.map((e) => e.dataset.key));
const areaSays = (await p.locator('#jira-area').innerText()).replace(/\s+/g, ' ').trim();
const areaOpen = await p.locator('.jmenu[open] #jira-area').count();
const shownSays = await p
  .locator('#jira-shown')
  .innerText()
  .catch(() => '');
check(
  'jira: Area lists the areas on the tickets with how many each has, and ticking one narrows the board at once and leaves the menu open',
  areaTicks.some((t) => /^Android ?1$/.test(t)) &&
    onlyArea.join() === 'APP-12' &&
    beforeArea > 1 &&
    /^Area ?Android$/.test(areaSays) &&
    areaOpen === 1 &&
    /^1 of \d+ shown/.test(shownSays) &&
    !(await p.locator('#jira-clear').isHidden()),
  [areaTicks, onlyArea, beforeArea, areaSays, areaOpen, shownSays],
);
await p.screenshot({ path: path.join(OUT, 'jira-area.png') });
await p.locator('.jmenu[open] [role="checkbox"]', { hasText: 'Android' }).click();
await sleep(250);
check(
  'jira: unticking it brings every ticket back',
  (await p.locator('.jcard').count()) === beforeArea && (await p.locator('#jira-area').innerText()).trim() === 'Area',
  await p.locator('.jcard').count(),
);
// Not area: the same areas, to leave out
await p.locator('.jmenu[open] [role="checkbox"]', { hasText: 'Android' }).click();
await p.locator('.jira-head h2').click();
await sleep(200);
await p.locator('summary#jira-area-not').click();
await sleep(200);
await p.locator('.jmenu[open] [role="checkbox"]', { hasText: 'Android' }).click();
await sleep(250);
const leftOut = await p.locator('.jcard').evaluateAll((els) => els.map((e) => e.dataset.key));
const notSays = (await p.locator('#jira-area-not').innerText()).replace(/\s+/g, ' ').trim();
const areaAfter = (await p.locator('#jira-area').innerText()).trim();
check(
  'jira: Not area leaves out the tickets in an area, and an area ticked there is unticked in Area where it stands',
  leftOut.length === beforeArea - 1 &&
    !leftOut.includes('APP-12') &&
    /^Not area ?Android$/.test(notSays) &&
    areaAfter === 'Area',
  [leftOut, notSays, areaAfter],
);
await p.screenshot({ path: path.join(OUT, 'jira-area-not.png') });
await p.locator('.jmenu[open] [role="checkbox"]', { hasText: 'Android' }).click();
await sleep(250);
await p.locator('.jira-head h2').click();
await sleep(200);
await p.locator('.jcard[data-key="APP-12"]').click();
await p.locator('#jira-ticket').waitFor({ timeout: 5000 });
for (let i = 0; i < 50 && (await p.locator('#jira-reading').count()); i++) await sleep(200);
// THE TICKET PANEL: its actions, its details, the comment box above the comments
const pl = await p.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (el) => el.getBoundingClientRect();
  const acts = [...q('.jacts').children].map(r);
  const rows = [...document.querySelectorAll('.jfields .jrow')].map((x) => ({
    dt: r(x.querySelector('dt')).left,
    dd: r(x.querySelector('dd')).left,
  }));
  const first = q('.jcomments li');
  const pn = q('#jira-ticket');
  const uniq = (xs) => new Set(xs.map(Math.round)).size;
  return {
    n: acts.length,
    tops: uniq(acts.map((a) => a.top)),
    heights: uniq(acts.map((a) => a.height)),
    widths: uniq(acts.map((a) => a.width)),
    rows: rows.length,
    dts: uniq(rows.map((x) => x.dt)),
    dds: uniq(rows.map((x) => x.dd)),
    above: first ? r(q('.mde')).bottom <= r(first).top : null,
    over: pn.scrollWidth - pn.clientWidth,
    tools: [...document.querySelectorAll('.mde-b')].map((b) => b.getAttribute('aria-label')).join(),
    files: [...document.querySelectorAll('.jfiles li')].map((x) => x.textContent).join(),
    area:
      [...document.querySelectorAll('.jfields .jrow')]
        .map((x) => x.innerText.replace(/\s+/g, ' '))
        .find((x) => /^Area/.test(x)) || '',
  };
});
check(
  'jira: the ticket panel has three actions in one row at one size, details lined up in two columns with its area, its files by name, and the comment box above the comments',
  pl.n === 3 &&
    pl.tops === 1 &&
    pl.heights === 1 &&
    pl.widths === 1 &&
    pl.rows >= 4 &&
    pl.dts === 1 &&
    pl.dds === 1 &&
    pl.above === true &&
    pl.over <= 0 &&
    pl.tools === 'Bold,Italic,Code,Code block,Bulleted list,Numbered list,Quote,Link,Attach a file' &&
    pl.files === 'cut-off.png' &&
    /^Area Android/.test(pl.area),
  pl,
);
const ta = p.locator('#jira-comment');
await ta.fill('fixed');
await ta.selectText();
await p.locator('.mde-bold').click();
const bolded = await ta.inputValue();
await ta.fill('one\ntwo');
await ta.selectText();
await p.locator('.mde-bullets').click();
const listed = await ta.inputValue();
check(
  "jira: the comment box's buttons write the Markdown: bold round what is selected, a list down its lines",
  bolded === '**fixed**' && listed === '- one\n- two',
  [bolded, listed],
);
const paste = (text, file) =>
  p.evaluate(
    ([text, file]) => {
      const el = document.querySelector('#jira-comment');
      const dt = new DataTransfer();
      if (file) dt.items.add(new File(['x'], file, { type: 'image/png' }));
      else dt.setData('text/plain', text);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      return el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    [text, file || ''],
  );
await ta.fill('');
const KT = 'fun pay(amount: Int) {\n    val fee = amount / 10\n    return amount + fee\n}';
const tookCode = await paste(KT);
const coded = await ta.inputValue();
const saidCode = await p.locator('.mde-said').innerText();
await ta.fill('');
const tookProse = await paste('Looks fine to me. I will check it tomorrow.\nThanks for the steps.');
const prose = await ta.inputValue();
check(
  'jira: code that is pasted goes in as a code block with its language named, and says so; ordinary sentences are left to be pasted as they are',
  tookCode === false &&
    coded === '\x60\x60\x60kotlin\n' + KT + '\n\x60\x60\x60\n' &&
    /Pasted as a code block \(kotlin\)/.test(saidCode) &&
    tookProse === true &&
    prose === '',
  [tookCode, coded, saidCode, tookProse, prose],
);
const tookFile = await paste('', 'shot.png');
await p.locator('#jira-comment-pick').setInputFiles([
  { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video') },
  { name: 'notes.log', mimeType: 'text/plain', buffer: Buffer.from('a log') },
]);
await sleep(200);
const tray = await p.evaluate(() =>
  [...document.querySelectorAll('#jira-comment-files .mde-file')].map(
    (f) =>
      f.dataset.kind +
      ':' +
      f.querySelector('.mde-fname').textContent +
      ':' +
      (f.querySelector('.mde-thumb img')
        ? 'img'
        : f.querySelector('.mde-thumb video')
          ? 'video'
          : f.querySelector('.mde-thumb .ext').textContent) +
      ':' +
      f.querySelector('.mde-x').getAttribute('aria-label'),
  ),
);
check(
  'jira: the paperclip, a paste or a drop puts files in the comment box: a picture is shown, a video shows as one, another file shows its kind, each with its name and an x',
  tookFile === false &&
    (await p.locator('.mde-clip').getAttribute('aria-label')) === 'Attach a file' &&
    tray.join('|') ===
      'image:shot.png:img:Remove shot.png|video:clip.mp4:video:Remove clip.mp4|file:notes.log:log:Remove notes.log',
  tray,
);
await p.locator('#jira-comment-files .mde-thumb').first().click();
await p.locator('.mde-light').waitFor({ timeout: 4000 });
const light = await p.evaluate(() => ({
  img: !!document.querySelector('.mde-light img'),
  name: document.querySelector('.mde-light-name').textContent,
  modal: document.querySelector('.mde-light').getAttribute('aria-modal'),
  focus: document.activeElement.className,
}));
await p.keyboard.press('Escape');
await sleep(150);
check(
  'jira: a press on a file opens it to be looked at, over the page, and Escape closes it and leaves the ticket open',
  light.img &&
    /^shot\.png · /.test(light.name) &&
    light.modal === 'true' &&
    light.focus === 'mde-light-x' &&
    (await p.locator('.mde-light').count()) === 0 &&
    (await p.locator('#jira-ticket').count()) === 1,
  light,
);
await p.locator('#jira-ticket').screenshot({ path: path.join(OUT, 'jira-comment-files.png') });
await p.locator('.mde-x[aria-label="Remove notes.log"]').click();
await p.locator('.mde-x[aria-label="Remove clip.mp4"]').click();
check(
  'jira: its x takes a file out of the box',
  (await p.locator('#jira-comment-files .mde-file').count()) === 1,
  await p.locator('#jira-comment-files .mde-file').count(),
);
const saidFile = 'kept';
const fileLink = '/browse/APP-12';
void saidFile;
void fileLink;
const codeSeen = await p.evaluate(async () => {
  const x = await import('./js/md.js');
  const trace =
    'java.lang.IllegalStateException: boom\n    at com.x.Pay.run(Pay.kt:41)\n    at com.x.Main.main(Main.kt:9)';
  return [
    x.looksLikeCode('Hello there. This is fine.\nA second sentence here.'),
    x.looksLikeCode('adb shell am start -n com.x/.Main'),
    x.looksLikeCode('{\n  "a": 1,\n  "b": [2]\n}'),
    x.langOf('{\n  "a": 1\n}'),
    x.looksLikeCode(trace),
    x.langOf(trace),
    x.looksLikeCode('- tap any offer\n- activate the offer\nActual result: missing box'),
  ];
});
check(
  'jira: what counts as code: a command, JSON and a stack trace do; sentences and a list of steps do not',
  JSON.stringify(codeSeen) === JSON.stringify([false, true, true, 'json', true, '', false]),
  codeSeen,
);
const MD =
  '**Fixed** in \x60build 41\x60\n\n- one\n- two\n\n\x60\x60\x60kotlin\nval x = 1\n\x60\x60\x60\n\n[notes](https://example.com/n) and <img src=x onerror=alert(1)> [bad](javascript:alert(1))';
await ta.fill(MD);
await p.locator('.mde-tabs button', { hasText: 'Preview' }).click();
await sleep(150);
const pv = await p.evaluate(() => {
  const v = document.querySelector('.mde-view');
  return {
    strong: (v.querySelector('strong') || {}).textContent,
    code: (v.querySelector('p code') || {}).textContent,
    items: v.querySelectorAll('ul li').length,
    lang: (v.querySelector('pre.md-code') || { dataset: {} }).dataset.lang,
    pre: (v.querySelector('pre code') || {}).textContent,
    href: (v.querySelector('a') || {}).href,
    target: (v.querySelector('a') || {}).target,
    links: v.querySelectorAll('a').length,
    imgs: v.querySelectorAll('img, script').length,
    says: /<img src=x/.test(v.textContent),
  };
});
check(
  'jira: Preview shows the comment as it will read, and nothing that was typed is ever treated as HTML: one https link, no image, the rest as text',
  pv.strong === 'Fixed' &&
    pv.code === 'build 41' &&
    pv.items === 2 &&
    pv.lang === 'kotlin' &&
    pv.pre === 'val x = 1' &&
    pv.href === 'https://example.com/n' &&
    pv.target === '_blank' &&
    pv.links === 1 &&
    pv.imgs === 0 &&
    pv.says === true,
  pv,
);
await p.locator('#jira-ticket').screenshot({ path: path.join(OUT, 'jira-comment-preview.png') });
await p.locator('.mde-tabs button', { hasText: 'Write' }).click();
await p.locator('#jira-comment-go').click();
for (
  let i = 0;
  i < 60 &&
  !/Fixed/.test(
    await p
      .locator('.jcomments li')
      .first()
      .innerText()
      .catch(() => ''),
  );
  i++
)
  await sleep(200);
const top = await p.evaluate(() => {
  const li = document.querySelector('.jcomments li');
  return {
    strong: (li.querySelector('.md strong') || {}).textContent,
    pre: (li.querySelector('pre.md-code code') || {}).textContent,
    box: document.querySelector('#jira-comment').value,
    n: document.querySelector('.jpanel h3 .count:last-child')
      ? [...document.querySelectorAll('.jpanel h3')].find((x) => /Comments/.test(x.textContent)).querySelector('.count')
          .textContent
      : '',
  };
});
check(
  'jira: a comment that is sent appears at the top of the comments as it reads, and the box is empty again',
  top.strong === 'Fixed' && top.pre === 'val x = 1' && top.box === '' && Number(top.n) >= 2,
  top,
);
const kept = await p.evaluate(() => ({
  files: document.querySelectorAll('#jira-comment-files .mde-file').length,
  said: (document.querySelector('.mde-said') || {}).textContent || '',
  link: (document.querySelector('.mde-said a') || {}).href || '',
}));
check(
  'jira: the words went to Jira and the file did not: the page says the file was not attached and why, links the ticket, and the file is still in the box',
  kept.files === 1 &&
    /The comment was added\. The file was not attached: The Jira connector has no way to upload a file\./.test(
      kept.said,
    ) &&
    /still here/.test(kept.said) &&
    /\/browse\/APP-12$/.test(kept.link),
  kept,
);
// already mine: the button says so
await p.locator('#jira-take').click();
for (
  let i = 0;
  i < 60 &&
  !/Assigned to you/.test(
    await p
      .locator('#jira-take')
      .innerText()
      .catch(() => ''),
  );
  i++
)
  await sleep(200);
const mineNow = await p.evaluate(() => {
  const b = document.querySelector('#jira-take');
  return {
    says: b.textContent,
    off: b.disabled,
    who: [...document.querySelectorAll('.jfields .jrow')]
      .map((x) => x.innerText.replace(/\s+/g, ' '))
      .find((x) => /^Assignee/.test(x)),
  };
});
check(
  'jira: once the ticket is the customer\'s own, Assign to me reads "Assigned to you" and can no longer be pressed',
  /Assigned to you/.test(mineNow.says) && mineNow.off === true && /Assignee Test User/.test(mineNow.who),
  mineNow,
);
// a press outside the panel closes it; a press inside does not
await p.locator('#jira-ticket h2').click();
const inside = await p.locator('#jira-ticket').count();
await p.locator('.jira-head h2').click();
await sleep(250);
check(
  'jira: a press inside the ticket leaves it open, and a press anywhere outside closes it',
  inside === 1 && (await p.locator('#jira-ticket').count()) === 0,
  [inside, await p.locator('#jira-ticket').count()],
);
await p.locator('.jcard[data-key="APP-12"]').click();
await p.locator('#jira-ticket').waitFor({ timeout: 5000 });
for (let i = 0; i < 50 && (await p.locator('#jira-reading').count()); i++) await sleep(200);
// the wait is shown: a ring turning inside a green halo
await p.route('**/api/jira/issue', async (route) => {
  await sleep(1500);
  await route.continue();
});
await p.locator('#jira-close').click();
await p.locator('.jcard:not([data-key="APP-12"])').first().click();
await p.locator('#jira-reading').waitFor({ timeout: 5000 });
await sleep(300);
const jl = await p.evaluate(() => {
  const el = document.querySelector('#jira-reading');
  const run = (s) =>
    el
      .querySelector(s)
      .getAnimations()
      .filter((a) => a.playState === 'running').length;
  const a = el.querySelector('.jload-ring').getBoundingClientRect();
  const b = el.lastElementChild.getBoundingClientRect();
  const acts = [...document.querySelector('.jacts').children].map((x) => Math.round(x.getBoundingClientRect().top));
  return {
    role: el.getAttribute('role'),
    halo: run('.halo'),
    turn: run('.turn'),
    green: /52, 211, 153/.test(getComputedStyle(el.querySelector('.halo')).backgroundImage),
    says: el.innerText.trim(),
    mid: Math.round(Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2)),
    acts: acts.length,
    oneRow: new Set(acts).size,
  };
});
check(
  'jira: while a ticket is being read the panel shows it: a ring turning inside a green halo, level with its line, and the three actions already in their row',
  jl.role === 'status' &&
    jl.halo === 1 &&
    jl.turn === 1 &&
    jl.green &&
    /^Reading the description and the comments/.test(jl.says) &&
    jl.mid <= 1 &&
    jl.acts === 3 &&
    jl.oneRow === 1,
  jl,
);
await p.locator('#jira-ticket').screenshot({ path: path.join(OUT, 'jira-ticket-loading.png') });
for (let i = 0; i < 50 && (await p.locator('#jira-reading').count()); i++) await sleep(200);
await p.unroute('**/api/jira/issue');
await p.locator('#jira-close').click();
await p.locator('.jcard[data-key="APP-12"]').click();
await p.locator('#jira-ticket').waitFor({ timeout: 5000 });
for (let i = 0; i < 50 && (await p.locator('#jira-reading').count()); i++) await sleep(200);
await p.screenshot({ path: path.join(OUT, 'jira-ticket.png') });
await p.locator('#jira-discuss').click();
await p.locator('.chat-ticket').waitFor({ timeout: 5000 });
const chip = await flat(p.locator('.chat-ticket'));
check(
  'jira: "Talk to the team about this" opens the chat with the ticket above the composer',
  (await p.locator('#title').innerText()) === 'Team chat' &&
    /^APP-12 Checkout button is cut off on phones/i.test(chip) &&
    (await p.locator('#attach-tray #ticket-clear').getAttribute('aria-label')) === 'Remove APP-12 from the chat' &&
    (await p.locator('#attach-tray #ticket-clear').innerText()) === '\u00d7',
  chip,
);
await p.locator('.composer input').fill('What would you check first on this one?');
await p.locator('.composer input').press('Enter');
await settle();
const about = requests()
  .filter((x) => /THE JIRA TICKET THE CUSTOMER HAS ATTACHED TO THIS CHAT/.test(x.tail || ''))
  .pop();
check(
  'chat: the seat that answers is given the selected ticket, with its description',
  !!about &&
    /APP-12: Checkout button is cut off on phones/.test(about.tail) &&
    /On a phone 360 wide the Pay button is cut off/.test(about.tail) &&
    /What would you check first on this one\?/.test(about.tail),
  about && about.tail.slice(-700),
);
await p.screenshot({ path: path.join(OUT, 'chat-ticket.png') });
await p.locator('#ticket-clear').click();
await sleep(300);
check(
  'chat: the ticket is cleared from the chat when the customer says so',
  (await p.locator('.chat-ticket').count()) === 0,
);
// a ticket asked for in words: found on the board, read for what it must do, and it becomes what the team is working on
await p.locator('.composer input').fill('Please address the ticket about the checkout button being cut off');
await p.locator('.composer input').press('Enter');
let found12 = '';
for (let i = 0; i < 150; i++) {
  found12 = (await p.locator('.chat-log').innerText()).replace(/\s+/g, ' ');
  if (
    /This is about APP-12, "Checkout button is cut off on phones"\. What it has to do, from the ticket: On a phone 360 wide the Pay button is cut off/.test(
      found12,
    )
  )
    break;
  await sleep(300);
}
check(
  'chat: asked to address a ticket by what it is about, the team finds it on the board, reads what it has to do from the ticket, and takes it up',
  /This is about APP-12, "Checkout button is cut off on phones"\. What it has to do, from the ticket: On a phone 360 wide the Pay button is cut off/.test(
    found12,
  ) && /^APP-12 /i.test(await flat(p.locator('.chat-ticket'))),
  found12.slice(-500),
);
await settle();
await p.locator('.composer input').fill('Please address the ticket about dinosaurs and volcanoes');
await p.locator('.composer input').press('Enter');
await sleep(1500);
check(
  'chat: when no ticket on the board fits, the team says it cannot tell which one is meant, and builds nothing',
  /I cannot tell which ticket you mean/.test((await p.locator('.chat-log').innerText()).replace(/\s+/g, ' ')),
  (await p.locator('.chat-log').innerText()).slice(-300),
);
await settle();
await ctx.close();

// ---- 5. On a phone
{
  const c2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Macintosh) FamilyOffice-Android-probe',
  });
  const q = await c2.newPage();
  watch(q);
  for (const [hash, wait] of [
    ['', '.composer input'],
    ['#jira', '#jira-show'],
    ['#learning', 'details.base-topic'],
  ]) {
    await q.goto(B + '/app.html' + hash, { waitUntil: 'load' });
    await q.locator(wait).first().waitFor({ timeout: 15000 });
    await sleep(400);
    if (hash === '#jira') {
      await q.locator('#jira-show').click();
      await q.locator('.jcol').first().waitFor({ timeout: 20000 });
      await q.locator('.jcard').first().click();
      await q.locator('#jira-ticket').waitFor({ timeout: 5000 });
    }
    check('phone: ' + (hash || 'the team chat') + ' does not scroll sideways', (await wide(q)) <= 0, await wide(q));
    await q.screenshot({ path: path.join(OUT, 'phone' + (hash.replace('#', '-') || '-chat') + '.png') });
  }
  await c2.close();
}
check('no page error and no console error anywhere', errors.length === 0, errors);
console.log(bad ? bad + ' FAILED' : 'all passed');
await browser.close();
await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
stop();
hf.close();
await sleep(300);
process.exit(bad ? 1 : 0);
