// alignment.mjs - IS THE TOP OF THE LANDING PAGE LINED UP ON A LARGE SCREEN? At each size it measures, in screen pixels: where the
// bar ends, where the words begin and end, where the film's box begins and ends (the box is what can be seen of the film: its picture,
// its caption and its dots), and where the fold is. From those it says:
//   - is the middle of the words the middle of the film's box
//   - is the pair in the middle of the first screen (as much room above it as below it), and all of it above the fold
//   - does the hero end at the fold (the first screen is the hero's)
//   - do the words begin where the bar's mark begins, and does the hero end where the bar's last button ends
//   - is the headline three lines, the first ending "built by"
//   - are the caption and the dots inside the box, and the dots at its bottom
// and, at two sizes, for each scene of the film at its fullest moment: where what is DRAWN begins and ends (read from the canvas's own
// pixels), which must be inside the box.
//   node tests/landing/alignment.mjs [port] [name]     pictures with guide lines go to .work/land/<name>/align-<w>x<h>.png
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import path from 'path';
import { WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { at as film } from '../support/film.mjs'; // a moment on the clock these were chosen against, on the film's clock now
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.argv[2] || 5210);
const NAME = process.argv[3] || 'align';
const DIR = path.join(WORK, 'land', NAME) + path.sep;
mkdirSync(DIR, { recursive: true });
const SIZES = [
  [1100, 700],
  [1280, 650],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1728, 1117],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
  [1200, 1600],
];
const SCENES = [
  ['the five', 17.2],
  ['vision', 26.86],
  ['hindsight', 32.25],
  ['soul', 40.25],
  ['one soul', 48.1],
]; // the opening (0 to 9 s) fills the whole picture on purpose and is not held to the box
const browser = await chromium.launch();
let bad = 0;
const r1 = (x) => Math.round(x * 10) / 10;
const open = async (w, h, at) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(B + '/index.html?uni=' + film(at), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1700);
  return [ctx, p];
};
for (const [w, h] of SIZES) {
  const [ctx, p] = await open(w, h, 48.1);
  const m = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => {
      const e = typeof s === 'string' ? q(s) : s;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { t: r.top, b: r.bottom, l: r.left, r: r.right, mid: (r.top + r.bottom) / 2 };
    };
    const copy = q('.hero-copy');
    const h1 = q('.hero h1');
    const tops = [];
    for (const s of h1.querySelectorAll('.w')) {
      const t = Math.round(s.getBoundingClientRect().top);
      if (!tops.some((x) => Math.abs(x[0] - t) < 8)) tops.push([t, '']);
      tops.find((x) => Math.abs(x[0] - t) < 8)[1] += s.textContent + ' ';
    }
    const last = [...q('.nav-cta').children].pop();
    return {
      fold: innerHeight,
      nav: box('.nav'),
      hero: box('.hero'),
      copy: box(copy),
      first: box(copy.firstElementChild),
      uni: box('#universe'),
      cap: box('.uni-cap'),
      dots: box('#uni-dots'),
      mark: box('.nav .wm'),
      last: box(last),
      lines: tops.map((x) => x[1].trim()),
      sideways: document.documentElement.scrollWidth - innerWidth,
      h1px: getComputedStyle(h1).fontSize,
    };
  });
  const top = m.nav.b;
  const pairTop = Math.min(m.copy.t, m.uni.t);
  const pairBot = Math.max(m.copy.b, m.uni.b);
  const above = pairTop - top;
  const below = m.fold - pairBot;
  const capped = m.hero.b < m.fold - 1;
  const says = [];
  says.push([
    "the middle of the words is the middle of the film's box",
    Math.abs(m.copy.mid - m.uni.mid) <= 2,
    r1(m.copy.mid - m.uni.mid),
  ]);
  if (!capped)
    says.push([
      'as much room above the pair as below it',
      Math.abs(above - below) <= 2,
      r1(above) + ' above, ' + r1(below) + ' below',
    ]);
  says.push(['all of it above the fold', pairBot <= m.fold + 0.5, r1(pairBot - m.fold)]);
  says.push([
    capped
      ? 'the hero ends above the fold (a tall, narrow window: it is held to four fifths of its width)'
      : 'the hero ends at the fold',
    capped ? m.hero.b <= m.fold : Math.abs(m.hero.b - m.fold) <= 1,
    r1(m.hero.b - m.fold),
  ]);
  says.push([
    "the words begin where the bar's mark begins",
    Math.abs(m.first.l - m.mark.l) <= 1.5,
    r1(m.first.l - m.mark.l),
  ]);
  says.push([
    "the hero ends where the bar's last button ends",
    Math.abs(m.hero.r - m.last.r) <= 1.5,
    r1(m.hero.r - m.last.r),
  ]);
  if (w >= 1180)
    says.push([
      'the headline is three lines, the first ending "built by"',
      m.lines.length === 3 && /built by$/.test(m.lines[0]),
      m.lines.join(' / '),
    ]);
  says.push([
    "the caption is inside the film's box",
    m.cap.t >= m.uni.t && m.cap.b <= m.uni.b + 1,
    r1(m.cap.b - m.uni.b),
  ]);
  says.push([
    "the dots are at the bottom of the film's box",
    Math.abs(m.dots.b - m.uni.b) <= 2,
    r1(m.dots.b - m.uni.b),
  ]);
  says.push(['no sideways scroll', m.sideways <= 0, m.sideways]);
  console.log(
    '\n' +
      w +
      ' x ' +
      h +
      '   bar ends ' +
      r1(top) +
      '; words ' +
      r1(m.copy.t) +
      ' to ' +
      r1(m.copy.b) +
      ' (middle ' +
      r1(m.copy.mid) +
      '); film box ' +
      r1(m.uni.t) +
      ' to ' +
      r1(m.uni.b) +
      ' (middle ' +
      r1(m.uni.mid) +
      ', ' +
      r1(m.uni.r - m.uni.l) +
      ' wide); hero ' +
      r1(m.hero.l) +
      ' to ' +
      r1(m.hero.r) +
      ' across, ends ' +
      r1(m.hero.b) +
      '; fold ' +
      m.fold +
      '; headline ' +
      m.h1px,
  );
  for (const [what, ok, by] of says) {
    if (!ok) bad++;
    console.log('   ' + (ok ? 'ok   ' : 'OFF  ') + what + '   (' + by + ')');
  }
  await p.evaluate(
    ({ m, top }) => {
      const line = (y, c, label) => {
        const d = document.createElement('div');
        d.style.cssText =
          'position:fixed;left:0;right:0;top:' +
          y +
          'px;height:1px;background:' +
          c +
          ';z-index:99999;pointer-events:none';
        const s = document.createElement('span');
        s.textContent = label;
        s.style.cssText = 'position:absolute;right:6px;top:-15px;font:11px/1 monospace;color:' + c;
        d.append(s);
        document.body.append(d);
      };
      line(top, '#f55', 'bar ends');
      line(m.copy.mid, '#5f5', 'middle of the words');
      line(m.uni.mid + 1, '#5cf', 'middle of the film box');
      line(m.copy.t, 'rgba(90,255,90,.5)', 'words begin');
      line(m.copy.b, 'rgba(90,255,90,.5)', 'words end');
      line(m.uni.t, 'rgba(90,200,255,.5)', 'film box begins');
      line(m.uni.b, 'rgba(90,200,255,.5)', 'film box ends');
    },
    { m, top },
  );
  await p.screenshot({ path: DIR + 'align-' + w + 'x' + h + '.png' });
  await ctx.close();
}
// what is drawn, scene by scene, read from the canvas itself: a row counts when two dozen of its pixels are solid (a face, a pill of
// words, the soul's core; a far star is neither wide nor solid)
for (const [w, h] of [
  [1366, 768],
  [1920, 1080],
]) {
  console.log(
    '\n' + w + ' x ' + h + ", what is drawn in each scene, as a share of the film's box (0% its top, 100% its bottom):",
  );
  for (const [name, at] of SCENES) {
    const [ctx, p] = await open(w, h, at);
    const s = await p.evaluate(() => {
      const c = document.querySelector('#uni');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const rows = [];
      for (let y = 0; y < c.height; y++) {
        let n = 0;
        for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] >= 215) n++;
        if (n >= 24) rows.push(y);
      }
      const r = c.getBoundingClientRect();
      const b = document.querySelector('#universe').getBoundingClientRect();
      const cap = document.querySelector('.uni-cap').getBoundingClientRect();
      const toScreen = (y) => r.top + (y * r.height) / c.height;
      if (!rows.length) return null;
      return {
        top: (toScreen(rows[0]) - b.top) / b.height,
        bot: (toScreen(rows[rows.length - 1]) - b.top) / b.height,
        cap: (cap.top - b.top) / b.height,
      };
    });
    const ok = s && s.top >= -0.01 && s.bot <= 1.005;
    if (!ok) bad++;
    console.log(
      '   ' +
        (ok ? 'ok   ' : 'OFF  ') +
        name.padEnd(15) +
        (s
          ? 'drawn from ' +
            Math.round(s.top * 100) +
            '% to ' +
            Math.round(s.bot * 100) +
            '% (the caption begins at ' +
            Math.round(s.cap * 100) +
            '%)'
          : 'nothing drawn'),
    );
    await ctx.close();
  }
}
await browser.close();
console.log('\n' + (bad ? bad + ' thing(s) off' : 'all lined up'));
