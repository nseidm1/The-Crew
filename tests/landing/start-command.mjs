// start-command.mjs - THE ONE COMMAND ON THE HOSTED START PAGE, as a visitor on each system sees it, in a real browser. A Mac or a
// Linux machine is given the curl command; a Windows PC is given the PowerShell one, which is long. At a desktop width and at a
// phone's the command must sit INSIDE its box (found on a real Windows PC: it ran out of the right-hand side), and the Windows
// command must be the kind that runs in the window it is pasted into: it starts no second PowerShell, which security software
// refuses ("Access is denied"). The pages are served here, as plain files, from a port of this check's own.
//   node tests/landing/start-command.mjs
import { createRequire } from 'module';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const OUT = path.join(WORK, 'start-command');
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
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
const UA = {
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const errors = [];
const look = async (who, w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: UA[who] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(B + 'start.html', { waitUntil: 'load' });
  await p.locator('.launch .cmd code').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
  const got = await p.evaluate(() => {
    const box = document.querySelector('.launch .cmd');
    const code = box.querySelector('code');
    const b = box.getBoundingClientRect();
    const spans = [...code.querySelectorAll('span')].map((s) => s.getBoundingClientRect());
    return {
      text: code.textContent,
      heading: document.querySelector('#launch-h').textContent,
      note: (document.querySelector('#win-note') || { textContent: '' }).textContent,
      // every part of the command is inside the box, and the box is inside the page
      inside: spans.every((r) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5),
      boxInside: b.right <= document.documentElement.clientWidth + 0.5,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      spans: spans.map((r) => [Math.round(r.left), Math.round(r.right)]),
      box: [Math.round(b.left), Math.round(b.right)],
    };
  });
  await p.locator('.launch').screenshot({ path: path.join(OUT, who + '-' + w + '.png') });
  await ctx.close();
  return got;
};
for (const [w, h] of [
  [1280, 800],
  [390, 844],
]) {
  const win = await look('windows', w, h);
  check(
    'Windows, ' + w + ' wide: the PowerShell command sits inside its box and nothing scrolls sideways',
    win.inside && win.boxInside && win.sideways <= 0,
    win,
  );
  if (w === 1280) {
    check(
      'a Windows PC is given the command that runs in the window it is pasted into: the site, then irm | iex, and no second PowerShell',
      win.text === "$env:FO_SITE='" + B + "'; irm " + B + 'myfamilyoffice.ps1 | iex' &&
        !/powershell |ExecutionPolicy|scriptblock/i.test(win.text) &&
        /PowerShell/.test(win.heading) &&
        /Windows/.test(win.note),
      win,
    );
  }
  const mac = await look('mac', w, h);
  check(
    'a Mac, ' + w + ' wide: the curl command, inside its box, in Terminal',
    mac.text === 'curl -fsSL ' + B + 'myfamilyoffice.sh | sh -s ' + B &&
      /Terminal/.test(mac.heading) &&
      mac.note === '' &&
      mac.inside &&
      mac.boxInside &&
      mac.sideways <= 0,
    mac,
  );
}
// the script the command fetches: it is there, and it is the kind that can be pasted (it never ends the window it runs in)
const ps1 = fs.readFileSync(path.join(SRC, 'myfamilyoffice.ps1'), 'utf8');
const exits = ps1.split('\n').filter((l) => /^\s*[^#]*\bexit\b/.test(l) && !/process\.exit/.test(l));
check(
  'the Windows script ends its window only when it was run as a file, reads the site it was pasted with, and starts no PowerShell of its own to run itself',
  exits.length === 1 &&
    /if \(\$PSCommandPath\) \{ exit /.test(exits[0]) &&
    /\$env:FO_SITE/.test(ps1) &&
    !/Start-Process[^\n]*powershell/i.test(ps1),
  exits,
);
check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
