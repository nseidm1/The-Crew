// picture-cards.mjs - A CARD SHOWS WHAT IT IS ABOUT, and THE CHAT FILLS THE WINDOW, in a real browser against a stand-in team. A card of
// picks is put into the chat as the team's core would keep it; the page has to draw each pick with its picture over its name, say
// where the pictures came from, and stand without a picture that is not there. And on a computer the chat's title is the size of
// the chips beside it and the chat runs to the foot of the window, at any height.   node tests/browser/picture-cards.mjs
// (PICTURES=real uses real posters, to look at; the check itself fetches nothing from the web.)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';

const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const PORT = 5284 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const state = path.join(WORK, 'pictures-state');
const OUT = path.join(WORK, 'pictures');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) failed++;
};
const srv = spawn(process.execPath, [path.join(SRC, 'server.mjs')], {
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
    FO_BIN_CLAUDE: path.join(FAKES, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_LINK_PORT: String(47884 + SHIFT),
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
const real = process.env.PICTURES === 'real';
const art = (colour) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="' +
      colour +
      '"/></svg>',
  );
const from = { page: 'https://en.wikipedia.org/wiki/Example', from: 'Wikipedia' };
const CARD = {
  kind: 'picks',
  icon: 'star',
  title: 'Top films at the cinema',
  big: '',
  small: 'The charts do not agree this week',
  rows: [],
  items: [],
  numbered: false,
  good: [],
  bad: [],
  picture: '',
  picks: [
    {
      name: 'You Can See Everything',
      note: 'a documentary, number one',
      image: {
        url: real ? 'https://upload.wikimedia.org/wikipedia/en/5/5e/Paddington_in_Peru_poster.jpg' : art('#3b6'),
        ...from,
      },
    },
    {
      name: 'Wildwood',
      note: 'right behind it',
      image: {
        url: real ? 'https://upload.wikimedia.org/wikipedia/en/a/aa/Wildwood_2026_poster.jpg' : art('#36b'),
        ...from,
      },
    },
    {
      name: 'Clayface',
      note: 'right behind it',
      image: {
        url: real ? 'https://upload.wikimedia.org/wikipedia/en/5/52/Dune_Part_Two_poster.jpeg' : art('#b63'),
        ...from,
      },
    },
    { name: 'Drummer Boy', note: 'near the top last weekend' },
    { name: 'Heated Rivalry', note: 'also listed', image: { url: B + '/no-such-picture.jpg', ...from } },
  ],
  warn: 'With that headache, a loud film on a big screen might not help',
  note: 'Tell me your town and Alex can find showtimes near you.',
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
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
  // the card, kept with the chat the way the team's core keeps one that is the whole of a reply
  await s.evaluate((card) => {
    const kept = JSON.parse(localStorage.getItem('familyoffice.core.v1'));
    kept.chat.push({ id: 'm-you', by: 'you', at: Date.now(), text: 'What films are on this weekend?' });
    kept.chat.push({
      id: 'm-card',
      by: 'overseer',
      at: Date.now(),
      text: 'The top film is You Can See Everything.',
      card,
      cardOnly: true,
    });
    localStorage.setItem('familyoffice.core.v1', JSON.stringify(kept));
  }, CARD);
  await s.close();
}
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(B + '/app.html', { waitUntil: 'load' });
await page.locator('.answer-card .ac-picks').waitFor({ timeout: 20000 });
await sleep(real ? 3500 : 900);
const read = () =>
  page.evaluate(() => {
    const box = (q) => {
      const e = document.querySelector(q);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return {
        t: Math.round(b.top),
        b: Math.round(b.bottom),
        l: Math.round(b.left),
        r: Math.round(b.right),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    };
    const card = document.querySelector('.answer-card');
    return {
      picks: [...card.querySelectorAll('.ac-picks li')].map((li) => {
        const img = li.querySelector('img.ac-pick-art');
        const b = (img || li.querySelector('.ac-pick-art')).getBoundingClientRect();
        return {
          name: li.querySelector('strong').textContent,
          note: (li.querySelector('strong + span') || {}).textContent || '',
          picture: !!img && img.complete && img.naturalWidth > 0,
          alt: img ? img.alt : '',
          shape: Math.round((b.height / b.width) * 100) / 100,
          stand: img ? '' : li.querySelector('.ac-pick-art').textContent,
          policy: img ? img.referrerPolicy : '',
        };
      }),
      credit: (card.querySelector('.ac-credit') || {}).innerText || '',
      creditLink: (card.querySelector('.ac-credit a') || {}).href || '',
      warn: !!card.querySelector('.ac-warn'),
      words: getComputedStyle(card.closest('.msg').querySelector('p')).display,
      inside:
        card.getBoundingClientRect().right <= document.querySelector('.chat-log').getBoundingClientRect().right + 1,
      title: {
        size: getComputedStyle(document.querySelector('#title')).fontSize,
        text: document.querySelector('#title').textContent,
      },
      chip: getComputedStyle(document.querySelector('#chips .pill')).fontSize,
      chat: box('.chat-card'),
      top: box('.top'),
      composer: box('.composer'),
      vh: innerHeight,
      tall: document.scrollingElement.scrollHeight - innerHeight,
      wide: document.scrollingElement.scrollWidth - innerWidth,
    };
  });
const d = await read();
check(
  'a card of picks shows each thing under its own name with its picture over it, in the shape of a poster, and what was said of it',
  d.picks.length === 5 &&
    d.picks.slice(0, 3).every((p) => p.picture && p.alt === p.name && p.shape >= 1.4 && p.shape <= 1.6) &&
    d.picks[0].name === 'You Can See Everything' &&
    /documentary/.test(d.picks[0].note),
  d.picks,
);
check(
  'a pick with no picture, or one whose picture does not load, stands in the same place with its number; pictures are asked for without saying which page wants them; and where they came from is said, with a link',
  d.picks[3].picture === false &&
    d.picks[3].stand === '4' &&
    d.picks[4].picture === false &&
    d.picks[4].stand === '5' && // its picture did not load: its number stands there instead
    d.picks[3].shape >= 1.4 &&
    d.picks.slice(0, 3).every((p) => p.policy === 'no-referrer') &&
    /^Pictures: Wikipedia$/.test(d.credit.trim()) &&
    /wikipedia\.org/.test(d.creditLink),
  { last: d.picks[3], credit: d.credit, link: d.creditLink },
);
check(
  'the card is still the whole reply (no words beside it), keeps its warning, and stays inside the chat',
  d.words === 'none' && d.warn && d.inside && d.wide <= 0,
  { words: d.words, warn: d.warn, inside: d.inside },
);
check(
  "on a computer the chat page's title is small, about the size of the chips beside it, not a headline",
  parseFloat(d.title.size) <= 16 &&
    Math.abs(parseFloat(d.title.size) - parseFloat(d.chip)) <= 3 &&
    d.title.text === 'Team chat' &&
    d.top.h <= 60,
  { title: d.title, chip: d.chip, top: d.top },
);
check(
  'and the chat takes all the height there is: from just under the title to the foot of the window, with the message box at its foot and nothing to scroll',
  d.chat.t - d.top.b <= 20 &&
    d.vh - d.chat.b <= 24 &&
    d.vh - d.chat.b >= 0 &&
    d.composer.b <= d.chat.b &&
    d.chat.b - d.composer.b <= 30 &&
    d.tall <= 0,
  { chat: d.chat, top: d.top, composer: d.composer, vh: d.vh, tall: d.tall },
);
await page.locator('.answer-card').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'simple.png') });
const sizes = [];
for (const [w, h] of [
  [2000, 1011],
  [1280, 640],
  [1024, 1200],
]) {
  await page.setViewportSize({ width: w, height: h });
  await sleep(350);
  const x = await read();
  sizes.push({ w, h, gap: x.vh - x.chat.b, chatH: x.chat.h, tall: x.tall, wide: x.wide });
}
check(
  "whatever the window's size, the chat ends at its foot and the page itself never scrolls",
  sizes.every((x) => x.gap >= 0 && x.gap <= 24 && x.tall <= 0 && x.wide <= 0 && x.chatH >= 300),
  sizes,
);
// Developer: the same, with the cards beside the chat
await page.setViewportSize({ width: 1366, height: 900 });
await page.evaluate(() => localStorage.setItem('familyoffice.mode', 'developer'));
await page.reload({ waitUntil: 'load' });
await page.locator('.chat-card').waitFor({ timeout: 20000 });
await sleep(900);
const dev = await page.evaluate(() => {
  const b = (q) => document.querySelector(q).getBoundingClientRect();
  return {
    gap: Math.round(innerHeight - b('.chat-card').bottom),
    side: Math.round(innerHeight - b('#chat-side').bottom),
    sideScrolls: getComputedStyle(document.querySelector('#chat-side')).overflowY,
    tall: document.scrollingElement.scrollHeight - innerHeight,
    title: getComputedStyle(document.querySelector('#title')).fontSize,
    overview: !!document.querySelector('#chat-top').offsetParent,
  };
});
check(
  'in Developer too: the chat runs to the foot of the window, and the cards beside it scroll on their own rather than stretching the page',
  dev.gap >= 0 &&
    dev.gap <= 24 &&
    dev.side >= 0 &&
    dev.sideScrolls === 'auto' &&
    dev.tall <= 0 &&
    parseFloat(dev.title) <= 16 &&
    dev.overview,
  dev,
);
await page.screenshot({ path: path.join(OUT, 'developer.png') });
check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
