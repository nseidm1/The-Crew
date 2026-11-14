// film-performance.mjs - how smoothly the film above the fold plays: frames a second, and what the film itself costs to draw each frame, on
// this machine as it is and with the processor held to a quarter of its speed (roughly a middling phone). It also tries the page with
// a dressing taken off (given as CSS), to see what each costs.   node tests/landing/film-performance.mjs [port]
// (a browser with no screen draws without a graphics card, so these are lower than a real one's; they are for comparing, not for quoting)
import { createRequire } from 'module';
import { PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.argv[2] || 5210);
const GPU = process.argv.includes('--gpu');
const browser = await chromium.launch(
  GPU
    ? { args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas'] }
    : {},
);
{
  const p = await browser.newPage();
  console.log(
    'drawing with: ' +
      (await p.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return 'no graphics card (software)';
        const e = gl.getExtension('WEBGL_debug_renderer_info');
        return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })),
  );
  await p.close();
}
const run = async (name, w, h, dpr, slow, css) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto(B + '/index.html', { waitUntil: 'load' });
  if (css) await p.addStyleTag({ content: css });
  await p.waitForTimeout(1500);
  if (slow > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  const got = await p.evaluate(
    () =>
      new Promise((done) => {
        const c = document.querySelector('#uni');
        const u0 = { ...c.__uni };
        const gaps = [];
        let last = performance.now();
        let t0 = last;
        const tick = (now) => {
          gaps.push(now - last);
          last = now;
          if (now - t0 < 9000) requestAnimationFrame(tick);
          else {
            gaps.sort((a, b) => a - b);
            const u = c.__uni;
            done({
              fps: Math.round(gaps.length / ((now - t0) / 1000)),
              worst: Math.round(gaps[Math.floor(gaps.length * 0.98)]),
              draw: Math.round(((u.ms - u0.ms) / Math.max(1, u.frames - u0.frames)) * 10) / 10,
              px: c.width + 'x' + c.height + (u.quality < 1 ? ', drawn at ' + Math.round(u.quality * 100) + '%' : ''),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(
    name.padEnd(46) +
      String(got.fps).padStart(3) +
      ' frames a second; the film takes ' +
      String(got.draw).padStart(5) +
      ' ms a frame to draw (' +
      got.px +
      '); slowest frame in fifty ' +
      got.worst +
      ' ms',
  );
  await ctx.close();
};
await run('laptop', 1366, 900, 2, 1, '');
await run(
  'laptop, no mask on the film',
  1366,
  900,
  2,
  1,
  '.hero-uni canvas { -webkit-mask-image: none !important; mask-image: none !important; }',
);
await run(
  "laptop, the page's moving ground held still",
  1366,
  900,
  2,
  1,
  'body::before { animation: none !important; filter: none !important; }',
);
await run(
  'laptop, both off',
  1366,
  900,
  2,
  1,
  '.hero-uni canvas { -webkit-mask-image: none !important; mask-image: none !important; } body::before { animation: none !important; filter: none !important; }',
);
await run('laptop, the film taken away', 1366, 900, 2, 1, '#uni { display: none !important; }');
await run(
  'laptop, only the film moving',
  1366,
  900,
  2,
  1,
  '*:not(canvas), *::before, *::after { animation: none !important; transition: none !important; } body::before { filter: none !important; } .glass, .nav { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
);
await run(
  'laptop, the film drawn a third the size',
  1366,
  900,
  2,
  1,
  '.hero-uni canvas { width: 40% !important; height: 40% !important; inset: 30% !important; }',
);
await run('laptop, one screen pixel to a pixel', 1366, 900, 1, 1, '');
await run('laptop, processor at a quarter', 1366, 900, 2, 4, '');
await run('phone, processor at a quarter', 390, 844, 3, 4, '');
await browser.close();
