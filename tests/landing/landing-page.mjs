// landing-page.mjs - THE LANDING PAGE, in a real browser: what is above the fold, the flight through the universe held still at each of its
// scenes (so each can be looked at), the sections under it, a phone, and someone who has asked for less motion. Pictures go to
// .work/land/<name>/ so one iteration can be laid beside the next.   node tests/landing/landing-page.mjs [name] [port]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const NAME = process.argv[2] || 'now';
const OUT = path.join(WORK, 'land', NAME);
const B = 'http://127.0.0.1:' + (process.argv[3] || 5210);
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) bad++;
};
const browser = await chromium.launch();
const errors = [];
const google = [];
const open = async (w, h, q = '', opts = {}) => {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    reducedMotion: opts.still ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => {
    google.push(r.request().url());
    r.abort();
  });
  await p.goto(B + '/index.html' + q, { waitUntil: 'load' });
  await p.waitForTimeout(opts.wait == null ? 1500 : opts.wait);
  return p;
};
// how much of a canvas holds light, and a number that changes when its picture does
const lit = (p, sel) =>
  p.evaluate(
    (q) =>
      [...document.querySelectorAll(q)].map((c) => {
        const g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let sum = 0;
        for (let i = 3; i < d.length; i += 4 * 97) {
          if (d[i] > 24) n++;
          sum = (sum * 31 + d[i] + d[i - 1]) % 1000003;
        }
        return { part: Math.round((n / (d.length / (4 * 97))) * 100), sum };
      }),
    sel,
  );

// ---- above the fold, at a laptop's size
const SHOTS = [
  ['0a-building', 1.2],
  ['0b-to-the-window', 3.3],
  ['0c-the-desk', 4.9],
  ['0d-the-screen', 7.1],
  ['0e-into-the-film', 8.5],
  ['1a-the-five-asked', 10.6],
  ['1b-the-five-one-speaks', 12.6],
  ['1c-the-five-all', 17.2],
  ['2a-vision-asks', 20.1],
  ['2b-vision-signals', 23.4],
  ['2c-vision-meets', 25],
  ['3a-hindsight-returns', 32.25],
  ['3b-hindsight-learned', 35.7],
  ['4-soul', 40.25],
  ['5-one-soul', 48],
  ['2d-vision-answers', 26.86],
]; // universe.js, the flight: the opening 0-9, the five to 18.5, vision to 28, hindsight to 36.5, soul to 44, all to 49.5
let p = await open(1366, 900, '?uni=13.5');
const top = await p.evaluate(() => {
  const at = (q) => {
    const e = document.querySelector(q);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      text: e.innerText.replace(/\s+/g, ' ').trim(),
    };
  };
  const copy = at('.hero-copy');
  const h1 = document.querySelector('.hero h1');
  return {
    h1: at('.hero h1'),
    copy,
    cta: at('.hero .cta'),
    uni: at('#universe'),
    cap: at('.uni-cap'),
    words: copy.text.split(' ').length,
    digits: (copy.text.match(/\d/g) || []).length,
    lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)),
    wide: document.scrollingElement.scrollWidth - innerWidth,
    font: getComputedStyle(h1).fontFamily.split(',')[0],
    loaded: document.fonts.check('40px "Instrument Serif"'),
    faces: ['italic 40px "Instrument Serif"', '16px Figtree', '700 12px Nunito']
      .map((f) => document.fonts.check(f))
      .join(),
    own: [...document.fonts].filter((f) => f.status === 'loaded').length,
  };
});
check(
  "the first words are the claim, in the owner's words",
  /^The first AI system built by and modeled after a real agentic RSI system\.$/.test(top.h1.text),
  top.h1,
);
check('left of the fold says little: under 60 words, and not one figure', top.words <= 60 && top.digits === 0, {
  words: top.words,
  digits: top.digits,
  text: top.copy.text,
});
check(
  'the claim, the one sentence and the way in are all on the screen before any scrolling, and so is the film beside them',
  top.cta.bottom <= 900 && top.h1.top >= 0 && top.uni.top < 500 && top.uni.left > top.copy.left + 300 && top.lines <= 4,
  top,
);
check('nothing runs off the side', top.wide <= 0, top.wide);
const first = (await lit(p, '#uni'))[0];
check('the film has drawn: there is light in it', first.part >= 8, first);
for (const [name, t] of SHOTS) {
  await p.goto(B + '/index.html?uni=' + t, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}
const cap = await p.evaluate(() => ({
  name: document.querySelector('#uni-name').textContent,
  line: document.querySelector('#uni-line').textContent,
  dot: [...document.querySelectorAll('#uni-dots button')].findIndex((b) => b.getAttribute('aria-current') === 'true'),
}));
check(
  "the caption and the dots follow the scene (held near the end of Vision), and the line under the name is that step's",
  cap.name === 'Vision' && /fits this person/.test(cap.line) && cap.dot === 2,
  cap,
);
// ---- the narration: each step of a scene has its own line, and the opening comes first
const said = [];
for (const t of [1, 3.4, 6, 8.4, 9.6, 12, 15.5, 19.2, 21.9, 24, 29, 34.5, 37.2, 41.5, 46]) {
  await p.goto(B + '/index.html?uni=' + t, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  said.push(
    await p.evaluate(
      () => document.querySelector('#uni-name').textContent + ': ' + document.querySelector('#uni-line').textContent,
    ),
  );
}
check(
  'the film opens on the Family Office and goes in: the building, the desk, the screen, then what lives there',
  /^The Family Office: This is the Family Office/.test(said[0]) &&
    /sat down at their desk/.test(said[1]) &&
    /On their screen is this page/.test(said[2]) &&
    /one soul, and five who share it/.test(said[3]),
  said.slice(0, 4),
);
check(
  'each step of a scene is narrated: the line under the name says what is being looked at, and changes as the scene goes',
  /^The five: Around the soul are five agents/.test(said[4]) &&
    /^The five: Ask once/.test(said[5]) &&
    /Five answers that fit together/.test(said[6]) &&
    /^Vision: Someone asks/.test(said[7]) &&
    /lights up what it knows/.test(said[8]) &&
    /travel to its core/.test(said[9]) &&
    /^Hindsight: After the answer/.test(said[10]) &&
    /stays gold/.test(said[11]) &&
    /^Soul: Closer now/.test(said[12]) &&
    /tell it to forget/.test(said[13]) &&
    /^One soul: One system/.test(said[14]) &&
    new Set(said).size === said.length,
  said,
);
const capBox = await p.evaluate(() => {
  const r = (q) => document.querySelector(q).getBoundingClientRect();
  const c = r('.uni-cap');
  const l = r('#uni-line');
  const d = r('#uni-dots');
  const u = r('#universe');
  return {
    lineSize: parseFloat(getComputedStyle(document.querySelector('#uni-line')).fontSize),
    lineBottom: Math.round(l.bottom),
    dotsTop: Math.round(d.top),
    capTop: Math.round(c.top - u.top),
    box: Math.round(u.height),
  };
});
check(
  'the narration is large enough to read (15.5px or more) and sits clear of the dots',
  capBox.lineSize >= 15.5 && capBox.lineBottom <= capBox.dotsTop + 1,
  capBox,
);
// ---- the flight is about the five: the opening, the five, then the features. Heard every two and a half seconds through one turn
const names = await p.evaluate(() =>
  [...document.querySelectorAll('#uni-dots button')].map((b) => b.getAttribute('aria-label')).join(' / '),
);
const heard = [];
for (let t = 0.5; t < 49.5; t += 2.5) {
  await p.goto(B + '/index.html?uni=' + t, { waitUntil: 'load' });
  await p.waitForTimeout(450);
  heard.push(
    await p.evaluate(
      () => document.querySelector('#uni-name').textContent + ': ' + document.querySelector('#uni-line').textContent,
    ),
  );
}
check(
  'the film above the fold is the opening, the five, then the features (vision, hindsight, the soul): no scene of a lone assistant, and nothing said of one mode or the other',
  names === 'The Family Office / The five / Vision / Hindsight / Soul / One soul' &&
    !heard.some((s) => /one assistant|flat answer|a claim|simple|developer|friends|engineers/i.test(s)) &&
    [...new Set(heard.map((s) => s.split(':')[0]))].join(' / ') === names,
  [names, heard],
);
// ---- the sections under it
await p.goto(B + '/index.html?uni=5', { waitUntil: 'load' });
await p.waitForTimeout(700);
for (const [id, at] of [
  ['soul', 5.2],
  ['worlds', 4.7],
  ['worlds-b', 9.4],
  ['behind', 9.4],
]) {
  await p.goto(B + '/index.html?uni=' + at, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.evaluate((i) => document.getElementById(i.replace('-b', '')).scrollIntoView({ block: 'start' }), id);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: path.join(OUT, 'section-' + id + '.png') });
}
const scenes = await lit(p, 'canvas[data-uni]');
const kinds = await p.evaluate(() =>
  [...document.querySelectorAll('canvas[data-uni]')].map((c) => c.dataset.uni).join(),
);
check(
  'the three powers and the two worlds each have their own scene, and each has drawn',
  kinds === 'soul,vision,hindsight,chat,proof' && scenes.every((s) => s.part >= 8),
  [kinds, scenes],
);
const says = await p.evaluate(() => ({
  soul: document.querySelector('#soul').innerText.replace(/\s+/g, ' '),
  worlds: document.querySelector('#worlds').innerText.replace(/\s+/g, ' '),
  nav: [...document.querySelectorAll('#sections a')].map((a) => a.getAttribute('href')).join(),
}));
check(
  'the powers are said as what they do for the visitor, and the two worlds as what to expect',
  /It keeps what matters to you/.test(says.soul) &&
    /It sees before it speaks/.test(says.soul) &&
    /Every day leaves it wiser/.test(says.soul) &&
    /Five friends in one chat, who know you/.test(says.worlds) &&
    /Five engineers who prove every change/.test(says.worlds) &&
    /Instead of one assistant/i.test(says.worlds) &&
    /Simple mode/i.test(says.worlds) &&
    /Developer mode/i.test(says.worlds) &&
    /#soul,#worlds/.test(says.nav),
  says.nav,
);
// ---- the two ways in are the main thing under the film: each a panel the width of the page
const ways = await p.evaluate(() =>
  [...document.querySelectorAll('.world')].map((w) => {
    const r = w.getBoundingClientRect();
    const h = w.querySelector('h3');
    const m = w.querySelector('.world-mode b');
    const c = w.querySelector('canvas').getBoundingClientRect();
    return {
      wide: Math.round(r.width),
      tall: Math.round(r.height),
      h3: parseFloat(getComputedStyle(h).fontSize),
      mode: m ? m.textContent : '',
      modeSize: m ? parseFloat(getComputedStyle(m).fontSize) : 0,
      scene: Math.round(c.width),
      ways: w.querySelectorAll('.cta a').length,
    };
  }),
);
check(
  'the two ways in are full-width panels: the mode named large, a headline of 44px or more, a scene 500px wide or more, and a way in',
  ways.length === 2 &&
    ways.every((w) => w.wide >= 1100 && w.tall >= 480 && w.h3 >= 44 && w.scene >= 500 && w.ways >= 1) &&
    ways[0].mode === 'Simple mode' &&
    ways[1].mode === 'Developer mode',
  ways,
);
// ---- behind the scenes: six pages side by side, one on screen, turned by a tab, a dot, an arrow or a link, and never by itself
const deck = () =>
  p.evaluate(() => {
    const d = document.querySelector('#deck');
    const dr = d.getBoundingClientRect();
    const pages = [...d.querySelectorAll('.page')];
    return {
      pages: pages.map((x) => x.id).join(),
      on: pages
        .filter((x) => {
          const r = x.getBoundingClientRect();
          return r.left >= dr.left - 4 && r.right <= dr.right + 4;
        })
        .map((x) => x.id)
        .join(),
      tab: (document.querySelector('#deck-tabs [aria-current="true"]') || {}).textContent,
      dot: [...document.querySelectorAll('#deck-dots button')].findIndex(
        (b) => b.getAttribute('aria-current') === 'true',
      ),
      tall: Math.round(dr.height),
      tabsTop: Math.round(document.querySelector('#deck-tabs').getBoundingClientRect().top),
      wide: document.scrollingElement.scrollWidth - innerWidth,
      kept: document.querySelector('#behind .band-head').innerText.replace(/\s+/g, ' '),
    };
  });
await p.evaluate(() => document.querySelector('#behind').scrollIntoView({ block: 'start' }));
await p.waitForTimeout(900);
const d0 = await deck();
check(
  'the technical sections are one section, "Behind the scenes": six pages side by side with the first on screen, and the page is no wider for it',
  d0.pages === 'numbers,proven,reset,rsi,team,system' &&
    d0.on === 'numbers' &&
    d0.tab === 'Its numbers' &&
    d0.dot === 0 &&
    d0.wide <= 0 &&
    /Behind the scenes/i.test(d0.kept) &&
    /comes to life/.test(d0.kept),
  d0,
);
await p.waitForTimeout(3200);
const d1 = await deck();
check('left alone, the deck stays on its page: nothing turns by itself', d1.on === 'numbers', d1);
await p.locator('#deck-tabs button').nth(3).click();
await p.waitForTimeout(1300);
const d2 = await deck();
check(
  'a tab turns to its page, and the dots follow',
  d2.on === 'rsi' && d2.tab === 'Always learning' && d2.dot === 3,
  d2,
);
await p.locator('#deck-next').click();
await p.waitForTimeout(1300);
const d3 = await deck();
await p.locator('#deck-dots button').nth(1).click();
await p.waitForTimeout(1300);
const d4 = await deck();
check(
  'the arrow goes on a page, a dot goes to its page, and the frame takes the height of the page it shows',
  d3.on === 'team' && d4.on === 'proven' && d4.tab === 'Proven' && Math.abs(d3.tall - d4.tall) > 20,
  [d3, d4],
);
await p.evaluate(() => scrollTo(0, 0));
await p.waitForTimeout(300);
await p.locator('#sections a[href="#reset"]').click();
await p.waitForTimeout(1500);
const d5 = await deck();
check(
  'a link in the bar to one of the pages turns to it and brings its tabs to the top of the screen',
  d5.on === 'reset' && d5.tab === 'Context Reset' && d5.tabsTop >= 40 && d5.tabsTop <= 140,
  d5,
);
await p.screenshot({ path: path.join(OUT, 'section-behind-reset.png') });
await p.locator('#deck-tabs button').nth(4).click();
await p.waitForTimeout(1500);
await p.screenshot({ path: path.join(OUT, 'section-behind-team.png') });
const cast = await p.evaluate(() =>
  [...document.querySelectorAll('#seats .seat .seat-mark')].map((m) => ({
    av: m.classList.contains('av'),
    who: (
      m.querySelector('svg.bd') || {
        getAttribute() {
          return '';
        },
      }
    ).getAttribute('class'),
    body: !!m.querySelector('image.bd-shape'),
  })),
);
check(
  'the team on the landing page is the same five characters, with the textured body',
  cast.length === 5 && cast.every((m) => m.av && m.body) && new Set(cast.map((m) => m.who)).size === 5,
  cast,
);
await p.evaluate(() => scrollTo(0, 0));
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(OUT, 'whole-page.png'), fullPage: true });
await p.context().close();
// ---- it moves, and a dot takes the flight to its scene
p = await open(1366, 900, '', { wait: 900 });
const a = (await lit(p, '#uni'))[0];
await p.waitForTimeout(700);
const b = (await lit(p, '#uni'))[0];
check('left alone, the film moves', a.sum !== b.sum, [a, b]);
await p.locator('#uni-dots button').nth(3).click();
await p.waitForTimeout(900);
check(
  'pressing a dot takes the flight to that scene',
  (await p.locator('#uni-name').textContent()) === 'Hindsight',
  await p.locator('#uni-name').textContent(),
);
await p.context().close();
// ---- less motion asked for: one still picture
p = await open(1366, 900, '', { still: true, wait: 900 });
const s1 = (await lit(p, '#uni'))[0];
await p.waitForTimeout(700);
const s2 = (await lit(p, '#uni'))[0];
check(
  'for someone who has asked for less motion it is one still picture: the question, what is known, and the answer',
  s1.sum === s2.sum && s1.part >= 8 && (await p.locator('#uni-name').textContent()) === 'Vision',
  [s1, s2],
);
await p.screenshot({ path: path.join(OUT, 'reduced-motion.png') });
await p.context().close();
// ---- a phone
p = await open(390, 844, '?uni=26.86');
const ph = await p.evaluate(() => {
  const r = (q) => document.querySelector(q).getBoundingClientRect();
  const h1 = document.querySelector('.hero h1');
  return {
    cta: Math.round(r('.hero .cta').bottom),
    lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)),
    uniTop: Math.round(r('#universe').top),
    wide: document.scrollingElement.scrollWidth - innerWidth,
  };
});
check(
  'on a phone the claim and the way in are on the first screen, the film starts just under them, and nothing runs off the side',
  ph.cta <= 844 && ph.lines <= 6 && ph.uniTop < 900 && ph.wide <= 0,
  ph,
);
await p.screenshot({ path: path.join(OUT, 'phone-top.png') });
await p.evaluate(() => document.querySelector('#universe').scrollIntoView({ block: 'center' }));
await p.waitForTimeout(600);
await p.screenshot({ path: path.join(OUT, 'phone-film.png') });
await p.evaluate(() => document.querySelector('#soul').scrollIntoView({ block: 'start' }));
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(OUT, 'phone-soul.png') });
await p.evaluate(() => document.querySelector('#worlds .worlds').scrollIntoView({ block: 'start' }));
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(OUT, 'phone-worlds.png') });
await p.evaluate(() => document.querySelector('#deck-tabs').scrollIntoView({ block: 'start' }));
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(OUT, 'phone-behind.png') });
const pd = await p.evaluate(() => ({
  wide: document.scrollingElement.scrollWidth - innerWidth,
  small: [...document.querySelectorAll('#deck-tabs button, #deck-dots button, .deck-arrow, #uni-dots button')].filter(
    (b) => {
      const r = b.getBoundingClientRect();
      return r.height < 43.5;
    },
  ).length,
  capUnder: Math.round(
    document.querySelector('.uni-cap').getBoundingClientRect().bottom -
      document.querySelector('#uni-dots').getBoundingClientRect().top,
  ),
}));
check(
  'on a phone the deck does not widen the page, every tab, dot and arrow is tall enough to press (44px), and the narration ends above the dots',
  pd.wide <= 0 && pd.small === 0 && pd.capUnder <= 2,
  pd,
);
await p.context().close();
check(
  'with Google blocked the page is still set in its own faces, and it asked Google for nothing',
  google.length === 0 && top.loaded && top.faces === 'true,true,true' && top.own >= 3,
  { google: google.slice(0, 3), faces: top.faces, own: top.own },
);
check('no page errors', errors.length === 0, errors);
console.log(
  'the headline is set in ' + top.font + (top.loaded ? ' (loaded)' : ' (NOT loaded: a fallback face is showing)'),
);
await browser.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
