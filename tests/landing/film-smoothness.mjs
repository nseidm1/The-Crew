// film-smoothness.mjs - DOES ANYTHING IN THE FILM SWITCH ON OR OFF? The film is asked for every frame of one whole turn, a sixtieth of a
// second apart (3,090 of them), and each is compared with the one before it: how much of the picture changed, as the average change of
// a pixel (0 to 255) in a picture reduced to 240 across. Motion that is smooth changes about as much from one frame to the next as it
// did the frame before. A JUMP is a frame that changed several times more than the frames around it: something appeared, vanished or
// moved at once. It lists the jumps (when, in which scene, how large against its surroundings) and the calmest and busiest stretches.
//   node tests/landing/film-smoothness.mjs [port] [--from s --to s]      a jump's two frames are saved to .work/land/smooth/ to be looked at
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const B = 'http://127.0.0.1:' + (Number(process.argv[2]) || 5210);
const FROM = arg('--from', 0);
const TO = arg('--to', 49.5);
const DIR = path.join(WORK, 'land', 'smooth') + path.sep;
mkdirSync(DIR, { recursive: true });
const SC = [
  ['the opening', 0],
  ['the five', 9],
  ['vision', 18.5],
  ['hindsight', 28],
  ['soul', 36.5],
  ['one soul', 44],
];
const sceneAt = (t) => SC.filter((s) => t >= s[1]).pop()[0];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await p.goto(B + '/index.html?uni=0', { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1200);
const SEL = process.argv.includes('--sel') ? process.argv[process.argv.indexOf('--sel') + 1] : '#uni';
const d = await p.evaluate(
  ({ FROM, TO, SEL }) => {
    const c = document.querySelector(SEL);
    const small = document.createElement('canvas');
    small.width = 240;
    small.height = Math.round((240 * c.height) / c.width);
    const g = small.getContext('2d', { willReadFrequently: true });
    const out = [];
    const BG = [5, 7, 12];
    let last = null;
    for (let n = 0; FROM + n / 60 <= TO; n++) {
      c.__uni.at(FROM + n / 60);
      g.clearRect(0, 0, small.width, small.height);
      g.drawImage(c, 0, 0, small.width, small.height);
      const px = g.getImageData(0, 0, small.width, small.height).data;
      if (last) {
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3] / 255;
          const b = last[i + 3] / 255;
          for (let ch = 0; ch < 3; ch++) {
            const by = Math.abs(px[i + ch] * a + BG[ch] * (1 - a) - last[i + ch] * b - BG[ch] * (1 - b));
            if (by >= 2.5) sum += by;
          }
        }
        out.push(sum / (px.length / 4) / 3);
      }
      last = px;
    }
    return out;
  },
  { FROM, TO, SEL },
);
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const jumps = [];
for (let i = 3; i < d.length - 3; i++) {
  const around = Math.max(d[i - 3], d[i - 2], d[i + 2], d[i + 3]);
  if (d[i] > around * 2.5 + 0.35) jumps.push([FROM + (i + 1) / 60, d[i], around]);
}
const all = med(d);
const per = SC.map(([name, s], n) => {
  const e = n + 1 < SC.length ? SC[n + 1][1] : 49.5;
  const part = d.filter((_, i) => {
    const t = FROM + (i + 1) / 60;
    return t >= s && t < e;
  });
  return part.length ? name + ' ' + med(part).toFixed(2) + ' (most ' + Math.max(...part).toFixed(2) + ')' : null;
}).filter(Boolean);
console.log(
  SEL +
    ': ' +
    d.length +
    ' frames compared, ' +
    FROM +
    ' s to ' +
    TO +
    ' s. A pixel changes by ' +
    all.toFixed(2) +
    ' of 255 from one frame to the next, in the middle case; the most ' +
    Math.max(...d).toFixed(2),
);
console.log('by scene, the middle case: ' + per.join('; '));
console.log(
  jumps.length ? jumps.length + ' jump(s):' : 'no jumps: no frame changed much more than the frames around it',
);
for (const [t, by, around] of jumps.slice(0, 40))
  console.log(
    '   at ' +
      t.toFixed(3) +
      ' s (' +
      sceneAt(t) +
      ')   changed ' +
      by.toFixed(2) +
      ', the frames around it ' +
      around.toFixed(2),
  );
for (const [t] of jumps.slice(0, 6))
  for (const [tag, at] of [
    ['a', t - 1 / 60],
    ['b', t],
  ]) {
    await p.evaluate((at) => document.querySelector('#uni').__uni.at(at), at);
    const png = await p.evaluate(() => document.querySelector('#uni').toDataURL('image/png'));
    writeFileSync(DIR + 'jump-' + t.toFixed(2) + '-' + tag + '.png', Buffer.from(png.split(',')[1], 'base64'));
  }
await browser.close();
process.exit(jumps.length ? 1 : 0);
