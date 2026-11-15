// film-returns.mjs - COMING BACK TO THE LANDING PAGE STARTS ITS FILM FROM THE BEGINNING. The film above the fold used to carry on
// from wherever it had been left when the page was returned to: from another tab, or back from Start (the browser keeps the page
// whole, so nothing runs again). Here the film is taken to a later scene, the page is left and returned to in each of those two
// ways, and the film must be at its first scene, near that scene's start, each time. Scrolling it out of view and back must NOT
// wind it back. The pages are served here as plain files, from a port of this check's own.
//   node tests/landing/film-returns.mjs
import { createRequire } from 'module';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 500)));
  if (!ok) bad++;
};
const TYPES = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  svg: 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(SRC, rel);
  if (!file.startsWith(SRC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).slice(1)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const B = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
// every scene the film's markers are ever set to, from the first moment of the page, with when: so a scene that shows for an
// instant before the film begins is caught
await p.addInitScript(() => {
  window.__scenes = [];
  const t0 = performance.now();
  new MutationObserver(() => {
    const i = [...document.querySelectorAll('#uni-dots button')].findIndex(
      (d) => d.getAttribute('aria-current') === 'true',
    );
    const last = window.__scenes[window.__scenes.length - 1];
    if (i >= 0 && (!last || last[0] !== i)) window.__scenes.push([i, Math.round(performance.now() - t0)]);
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-current'], childList: true });
});
await p.goto(B + 'index.html', { waitUntil: 'load' });
await p.locator('#uni-dots button').first().waitFor({ timeout: 20000 });
await p.waitForTimeout(1200);
const scene = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('#uni-dots button')].findIndex((d) => d.getAttribute('aria-current') === 'true'),
  );
// the very beginning: the Family Office with one window lit, its first line under it, in the film's first two seconds
const where = () =>
  p.evaluate(() => ({
    at: Number(document.querySelector('#uni').dataset.at),
    name: document.querySelector('#uni-name').textContent,
    line: document.querySelector('#uni-line').textContent,
  }));
const atStart = (w) => w.at <= 2 && /Family Office/.test(w.name) && /One window is lit/.test(w.line);
// arriving on the page (the logo in the header is a link to it): the film is at its beginning from the first thing drawn
{
  await p.waitForTimeout(1500);
  const seen = await p.evaluate(() => window.__scenes);
  const w = await where();
  check(
    'arriving on the page, no other scene is shown before the film starts: it opens on the Family Office and stays there',
    seen.every((x) => x[0] === 0) && atStart({ ...w, at: Math.min(w.at, 2) }) && w.at <= 4,
    { seen, ...w },
  );
}
const later = async () => {
  await p.locator('#uni-dots button').nth(2).click(); // on to the third scene
  await p.waitForTimeout(900);
  return scene();
};
// the page says whether it is hidden; a check cannot hide a real tab, so it says so on the page's behalf
const hide = (hidden) =>
  p.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

const a0 = await later();
await hide(true);
await p.waitForTimeout(400);
await hide(false);
await p.waitForTimeout(900);
const a1 = await scene();
const aw = await where();
check(
  'back from another tab, the film starts again from its very beginning: the Family Office, one window lit',
  a0 === 2 && a1 === 0 && atStart(aw),
  { before: a0, after: a1, ...aw },
);

const b0 = await later();
await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
await p.waitForTimeout(900);
const b1 = await scene();
const bw = await where();
check(
  'back to a page the browser kept whole, it starts again from its very beginning too',
  b0 === 2 && b1 === 0 && atStart(bw),
  { before: b0, after: b1, ...bw },
);

const c0 = await later();
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(700);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(900);
const c1 = await scene();
check('scrolled out of view and back, it carries on where it was: that is not a return', c0 === 2 && c1 >= 2, {
  before: c0,
  after: c1,
});

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
