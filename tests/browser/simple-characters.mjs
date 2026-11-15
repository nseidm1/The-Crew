// simple-characters.mjs - Simple's five characters in a real browser, against a stand-in team: in the empty chat, in a reply, while one is writing;
// at a computer's width and a phone's; and with motion asked to be reduced. It also says what Developer shows.   node tests/browser/simple-characters.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'buddies-state');
const OUT = path.join(WORK, 'buddies');
const PORT = 5236;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(state, 'bin'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 600)));
  if (!ok) bad++;
};
const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    FO_KEEP: '1',
    FO_STATE_DIR: state,
    FO_FAKE_DIR: state,
    FO_NO_NET: '1',
    FO_NO_OPEN: '1',
    FO_BILLING: '{"enforce":false}',
    FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_LINK_PORT: '47896',
  },
});
process.on('exit', () => {
  try {
    srv.kill('SIGTERM');
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
const browser = await chromium.launch();
const errors = [];
// ONE browser profile throughout: the chat opens for the browser that met the team, as it does for a person
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
const open = async (w, hgt, mode, opts = {}) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: hgt });
  await p.emulateMedia({ reducedMotion: opts.still ? 'reduce' : 'no-preference' });
  p.on('pageerror', (e) => errors.push('page error: ' + e.message));
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.evaluate((m) => {
    localStorage.setItem('familyoffice.mode', m);
  }, mode);
  await p.goto(B + '/app.html', { waitUntil: 'load' });
  await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 20000 });
  await sleep(900);
  return p;
};
const moving = (p, sel) =>
  p.evaluate((q) => [...document.querySelectorAll(q)].map((e) => getComputedStyle(e).animationName), sel);
const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
// the five as they are SEEN: only what is on the page and has a size counts
const crewOf = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.crew-one')]
      .filter((c) => c.offsetParent !== null)
      .map((c) => {
        const r = c.querySelector('.buddy').getBoundingClientRect();
        return {
          name: c.querySelector('em').textContent,
          svg: !!c.querySelector('svg.bd'),
          w: Math.round(r.width),
          top: Math.round(r.top),
          right: Math.round(r.right),
        };
      }),
  );
// the team is set up first, the way a person does it: Simple, with Claude (a stand-in here)
{
  const s = await ctx.newPage();
  await s.goto(B + '/start.html', { waitUntil: 'load' });
  await s.locator('#modes').waitFor({ timeout: 15000 });
  await s.locator('#mode-simple').click();
  await s.locator('#simple-start').waitFor({ timeout: 20000 });
  await s.locator('#mind-claude').click();
  await s.locator('#simple-start').click();
  await s
    .getByText(/Your models? (is|are) running|Claude is ready|Your team is ready/)
    .first()
    .waitFor({ timeout: 90000 });
  await s.locator('#meet').click();
  await s.locator('.composer :is(input, textarea)').waitFor({ timeout: 15000 });
  await s.close();
}
// 1. the empty chat in Simple, at a computer's width
const p = await open(1366, 900, 'simple');
const crew = await crewOf(p);
check(
  'simple, empty chat: the five are there by first name, each a character of its own',
  crew.length === 5 &&
    crew.every((c) => c.svg && c.w >= 42) &&
    crew.map((c) => c.name).join(' ') === 'Sam Robin Alex Jamie Pat',
  crew,
);
check(
  'simple: each character breathes and blinks',
  (await moving(p, '.crew .bd-body')).every((n) => /bd-breathe|bd-sway/.test(n)) &&
    (await moving(p, '.crew .bd-eyes')).every((n) => n === 'bd-blink'),
  await moving(p, '.crew .bd-body'),
);
await p.locator('.crew').screenshot({ path: path.join(OUT, 'crew.png') });
await p.screenshot({ path: path.join(OUT, 'empty-wide.png') });
// 2. a phone, the chat still empty
const q = await open(390, 844, 'simple');
const small = await crewOf(q);
check(
  'simple, phone: the five are seen side by side on one line, with nothing off the side',
  small.length === 5 &&
    Math.max(...small.map((c) => c.top)) - Math.min(...small.map((c) => c.top)) <=
      3 /* each is breathing: a pixel apart at most */ &&
    small.every((c) => c.w >= 42 && c.right <= 390) &&
    (await wide(q)) <= 0,
  [small, await wide(q)],
);
await q.screenshot({ path: path.join(OUT, 'empty-phone.png') });
await q.close();
// 3. less motion asked for: nothing moves
const r = await open(1366, 900, 'simple', { still: true });
const stillNames = [...(await moving(r, '.buddy *')), ...(await moving(r, '.crew-one'))];
check(
  'simple, reduced motion: the five are there and nothing moves',
  (await crewOf(r)).length === 5 && stillNames.length > 20 && stillNames.every((n) => n === 'none'),
  stillNames.slice(0, 12),
);
await r.close();
// 4. a reply: the one who answers is its character, and hops while it writes
await p.locator('.composer :is(input, textarea)').fill('hello');
await p.locator('.composer :is(input, textarea)').press('Enter');
let hop = false;
let seen = 0;
for (let i = 0; i < 120; i++) {
  seen = await p.locator('.chat-log .msg .buddy svg.bd').count();
  if (!hop && seen) hop = (await moving(p, '.msg:has(p.typing) .bd-body')).includes('bd-hop');
  if (seen && !(await p.locator('.chat-log p.typing').count()) && i > 4) break;
  await sleep(120);
}
check(
  'simple: whoever answers is shown as its character, not a line shape',
  seen >= 1 && (await p.locator('.chat-log .msg .seat-mark').count()) === 0,
  seen,
);
// (the stand-in answers in one piece, too fast to be caught writing: the reply is marked the way the chat marks one whose words are still arriving)
const still = await moving(p, '.chat-log .bd-body');
await p.evaluate(() => document.querySelector('.chat-log .msg:not(.you) p').classList.add('typing'));
const hops = await moving(p, '.chat-log .msg:has(p.typing) .bd-body');
await p.evaluate(() => document.querySelector('.chat-log p.typing').classList.remove('typing'));
check(
  'simple: the one who is writing hops, and is settled when it has finished',
  (hop || hops.includes('bd-hop')) &&
    !still.includes('bd-hop') &&
    !(await moving(p, '.chat-log .bd-body')).includes('bd-hop'),
  { hop, hops, still },
);
await p.screenshot({ path: path.join(OUT, 'reply-wide.png') });
await p
  .locator('.chat-log .msg:not(.you)')
  .first()
  .screenshot({ path: path.join(OUT, 'reply.png') });
// 5. Developer keeps its line shapes
// a card that comes after the reply is whole is shown without the page being opened again (the chat's own view, with a chat of one reply)
const late = await p.evaluate(async () => {
  const { chatView } = await import('/js/views.js');
  const host = document.createElement('div');
  const log = document.createElement('div');
  host.append(log);
  document.body.append(host);
  const m = { id: 'm1', by: 'operations', text: 'In Lisbon it is 18°C now.', at: Date.now() };
  const s = { chat: [m], proposals: [], team: { seats: [] } };
  const v = chatView(log, { snapshot: () => s });
  const before = log.querySelectorAll('.answer-card').length;
  m.card = {
    kind: 'weather',
    icon: 'rain',
    title: 'Lisbon',
    big: '18°C',
    small: 'light rain',
    rows: [['High', '21°C']],
    good: ['Dry by the evening'],
    bad: ['Wet until four'],
    warn: 'The steps by the river are slippery in the rain',
    note: 'Tomorrow is dry.',
  };
  m.cardOnly = true;
  v.update();
  await new Promise((r) => setTimeout(r, 700));
  const card = log.querySelector('.answer-card') || document.createElement('i');
  const out = {
    before,
    after: log.querySelectorAll('.answer-card').length,
    text: (card.innerText || '').replace(/\s+/g, ' '),
    words: log.querySelector('p:not(.ac-warn):not(.ac-note)').offsetParent === null,
    parts: ['.ac-good li', '.ac-bad li', '.ac-warn', '.ac-note'].map((q) => card.querySelectorAll(q).length).join(),
    emoji: /[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(card.innerText || ''),
  };
  host.remove();
  return out;
});
check(
  'simple: a card that is drawn after the reply has finished takes the place of its words: the words fold away',
  late.before === 0 && late.after === 1 && /Lisbon 18°C light rain/.test(late.text) && late.words,
  late,
);
check(
  'simple: a card has room for what is good, what is not, a warning and a closing note, with no emoji',
  late.parts === '1,1,1,1' && /Careful: The steps by the river/.test(late.text) && !late.emoji,
  late,
);
const gallery = await p.evaluate(async () => {
  const { chatView } = await import('/js/views.js');
  const log = document.querySelector('.chat-log');
  const kinds = [
    'sun',
    'part',
    'cloud',
    'rain',
    'storm',
    'snow',
    'fog',
    'wind',
    'clock',
    'tag',
    'star',
    'pin',
    'check',
    'steps',
    'bulb',
    'calendar',
    'plane',
    'fork',
  ];
  const chat = kinds.map((k, i) => ({
    id: 'g' + i,
    by: ['operations', 'steward', 'ask'][i % 3],
    text: 'The words of the answer, which say 18°C and 07:17.',
    at: Date.now(),
    cardOnly: true,
    card:
      k === 'check' || k === 'steps'
        ? {
            kind: k === 'steps' ? 'steps' : 'list',
            icon: k,
            title: k === 'steps' ? 'How to do it' : 'Things to sort out',
            big: '',
            small: '',
            rows: [],
            items: ['Pick the date', 'Book the table', 'Order the cake'],
            numbered: k === 'steps',
          }
        : {
            kind: 'facts',
            icon: k,
            title: 'A card with the ' + k,
            big: '18°C',
            small: 'a few words',
            rows: i % 2 ? [['Sunrise', '07:17']] : [],
          },
  }));
  const host = document.createElement('div');
  host.className = 'chat-log';
  host.id = 'gallery';
  host.style.cssText =
    'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:16px;max-height:none;overflow:visible';
  log.replaceWith(host);
  chatView(host, { snapshot: () => ({ chat, proposals: [], team: { seats: [] } }) });
  await new Promise((r) => setTimeout(r, 900));
  const first = host.querySelector('.msg');
  const card = first.querySelector('.answer-card').getBoundingClientRect();
  const para = first.querySelector('p').getBoundingClientRect();
  const head = first.querySelector('.msg-head').getBoundingClientRect();
  return {
    cards: host.querySelectorAll('.answer-card').length,
    drawn: [...host.querySelectorAll('.ac-icon svg')].filter(
      (s) => s.getBoundingClientRect().width >= 40 && s.querySelector('path, circle, rect'),
    ).length,
    emoji: /[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(host.innerText),
    above: head.bottom <= card.top + 1 && first.querySelector('p').offsetParent === null && para.height === 0,
    still: [...host.querySelectorAll('.ac-icon svg')].filter(
      (sv) => ![...sv.querySelectorAll('*')].some((e) => getComputedStyle(e).animationName !== 'none'),
    ).length,
    lists: [...host.querySelectorAll('.ac-items')]
      .map(
        (l) =>
          l.tagName +
          ' ' +
          l.children.length +
          (l.closest('.answer-card').querySelector('.ac-big') ? ' with a figure' : ''),
      )
      .join(),
  };
});
check(
  "simple: the card's symbol is one of eighteen drawings of our own, no emoji, and every one of them moves",
  gallery.cards === 18 && gallery.drawn === 18 && !gallery.emoji && gallery.still === 0,
  gallery,
);
check(
  'simple: a card can be a list: things to sort out, or numbered steps, with no figure on it',
  gallery.lists === 'UL 3,OL 3',
  gallery,
);
check(
  'simple: the card is the reply: it sits under the name, and the words are not shown beside it',
  gallery.above,
  gallery,
);
await p.locator('#gallery').screenshot({ path: path.join(OUT, 'cards.png') });
const d = await open(1366, 900, 'developer');
await d.locator('.composer :is(input, textarea)').fill('hello');
await d.locator('.composer :is(input, textarea)').press('Enter');
for (let i = 0; i < 80; i++) {
  if ((await d.locator('.chat-log .msg .seat-mark').count()) >= 2) break;
  await sleep(250);
}
const devAv = await d.evaluate(() =>
  [...document.querySelectorAll('.chat-log .msg .seat-mark')].map((m) => ({
    av: m.classList.contains('av'),
    who: (
      m.querySelector('svg.bd') || {
        getAttribute() {
          return '';
        },
      }
    ).getAttribute('class'),
    body: !!m.querySelector('image.bd-shape'),
    w: Math.round(m.getBoundingClientRect().width),
  })),
);
await d.screenshot({ path: path.join(OUT, 'developer.png') });
check(
  'developer: whoever answers is shown as the same character it is in Simple, with the textured body',
  devAv.length >= 1 &&
    devAv.every((m) => m.av && /bd-(overseer|steward|operations|ask|master)/.test(m.who) && m.body && m.w >= 40),
  devAv,
);
const setups = await d.evaluate(async () => {
  const { chatView } = await import('/js/views.js');
  const host = document.createElement('div');
  host.className = 'chat-log';
  host.id = 'setups';
  host.style.cssText = 'display:grid;gap:10px;padding:16px;max-height:none;overflow:visible;max-width:820px';
  document.querySelector('.chat-log').replaceWith(host);
  const did = [];
  const at = Date.now();
  const chat = [
    {
      id: 's1',
      by: 'overseer',
      at,
      text: 'Before we build it, I need a folder on this computer to put it in. Press the button and choose one: an empty folder is fine.',
      setup: { kind: 'folder', state: 'open', task: 'an app for my bakery', rev: 0 },
    },
    {
      id: 's2',
      by: 'ask',
      at,
      text: 'It is running on this computer now, so you can look at it: press Open. Only this computer can see it.',
      setup: { kind: 'site', state: 'online', id: 'x', url: 'http://localhost:4321/', why: '', rev: 0 },
    },
    {
      id: 's3',
      by: 'operations',
      at,
      text: 'About getting it onto a phone:',
      setup: {
        kind: 'phone',
        state: 'none',
        text: 'No phone is connected. To put the app on your own Android phone, switch on its developer options once:',
        steps: [
          'On the phone, open Settings, then About phone, and tap "Build number" seven times',
          'Go back to Settings, open System, then Developer options, and switch on "USB debugging"',
          'Plug the phone into this computer with a USB cable, unlock it, and tap Allow',
          'Then press Check again',
        ],
        rev: 0,
      },
    },
  ];
  const v = chatView(host, {
    snapshot: () => ({ chat, proposals: [], team: { seats: [] } }),
    setupDo: (id, act) => did.push(id + ':' + act),
  });
  await new Promise((r) => setTimeout(r, 400));
  const q = (s) => host.querySelector(s);
  const text = (s) => ((q(s) || {}).innerText || '').replace(/\s+/g, ' ').trim();
  const first = {
    folder: text('.is-folder [data-act="choose"]'),
    open: (q('.is-site a[data-act="open"]') || {}).href,
    running: text('.is-site .setup-line'),
    stop: !!q('.is-site [data-act="stop"]'),
    steps: host.querySelectorAll('.is-phone .setup-steps li').length,
    check: !!q('.is-phone [data-act="check"]'),
    put: !!q('.is-phone [data-act="install"]'),
    wide: document.scrollingElement.scrollWidth - innerWidth,
  };
  window.__shot = () => null;
  q('.is-folder [data-act="choose"]').click();
  q('.is-site [data-act="stop"]').click();
  q('.is-phone [data-act="check"]').click();
  return { first, did };
});
await d.locator('#setups').screenshot({ path: path.join(OUT, 'setup-cards.png') });
const setups2 = await d.evaluate(async () => {
  const host = document.querySelector('#setups');
  const q = (s) => host.querySelector(s);
  const text = (s) => ((q(s) || {}).innerText || '').replace(/\s+/g, ' ').trim();
  return { ok: true, host: !!host, text: text('.is-site .setup-line') };
});
check(
  "developer: under a message there is a folder to choose, the site's address with whether it is running, and the phone with how to connect one; each can be pressed",
  setups.first.folder === 'Choose a folder' &&
    setups.first.open === 'http://localhost:4321/' &&
    /Running at localhost:4321/.test(setups.first.running) &&
    setups.first.stop &&
    setups.first.steps === 4 &&
    setups.first.check &&
    !setups.first.put &&
    setups.first.wide <= 0 &&
    setups.did.join() === 's1:choose,s2:stop,s3:check' &&
    setups2.host,
  [setups, setups2],
);
const want = /remote:\s*true/.test(fs.readFileSync(path.join(ROOT, 'js', 'product.js'), 'utf8'));
const tabs = await d.evaluate(() =>
  [...document.querySelectorAll('#nav a')]
    .filter((a) => a.offsetParent !== null)
    .map((a) => a.firstChild.textContent.trim()),
);
await d.evaluate(() => {
  location.hash = '#remote';
});
await sleep(700);
const at = await d.locator('#title').innerText();
check(
  'developer: the Remote tab is ' +
    (want ? 'shown' : 'not shown, and its address leads to the chat') +
    ', as the Owner page has it set now',
  tabs.length >= 3 && tabs.includes('Remote') === want && (want ? /Remote/.test(at) : at === 'Team chat'),
  [tabs, at],
);
check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
