// runner-restart.mjs - THE APP IS UPDATED WHILE ITS PAGE IS OPEN. Running the start command again stops the app, and for a moment
// the launcher answers on the app's port while it fetches the new version: it knows /api/hello and nothing else. A page that was
// open through that has to end up connected to the new app again: told what it is doing, and counted by it as a page that is open
// (an app that sees no page open stops itself). Found on the published site: the page's one held connection met the launcher's
// "not found", which a browser takes as final, and it was never opened again.   node tests/browser/runner-restart.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';

const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const PORT = 5283 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const state = path.join(WORK, 'restart-state');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(state, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 600)));
  if (!ok) failed++;
};
const startApp = async () => {
  const child = spawn(process.execPath, [path.join(SRC, 'server.mjs')], {
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
      FO_LINK_PORT: String(47883 + SHIFT),
    },
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  return child;
};
const stopApp = (child) =>
  new Promise((done) => {
    child.on('exit', done);
    child.kill('SIGKILL');
  });
const pagesOpen = async () => (await (await fetch(B + '/api/hello')).json()).pages;

let app = await startApp();
process.on('exit', () => {
  try {
    app.kill('SIGKILL');
  } catch {
    /* gone */
  }
});
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(B + '/start.html', { waitUntil: 'load' });
await page.locator('#modes').waitFor({ timeout: 15000 });
await sleep(1500);
check('a page that is open is counted by the app as open', (await pagesOpen()) === 1, await pagesOpen());

// the app stops, and the launcher stands on its port for a while: it answers /api/hello, and "not found" to everything else
await stopApp(app);
const launcher = http.createServer((req, res) => {
  if (req.url === '/api/hello') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ app: 'familyoffice', ok: true, state: 'setup', port: PORT }));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not found"}');
});
await new Promise((ready) => launcher.listen(PORT, '127.0.0.1', ready));
await sleep(7000); // long enough for the page's held connection to try again and be told "not found"
await new Promise((closed) => {
  launcher.closeAllConnections();
  launcher.close(closed);
});

// the new app comes up on the same port
app = await startApp();
let back = 0;
for (let i = 0; i < 40 && !back; i++) {
  await sleep(500);
  back = await pagesOpen();
}
check(
  'after the app has been replaced under it, the page is connected to the new one again: the app counts it as open',
  back === 1,
  back,
);
// and it is told what the app does: a setup started by hand shows on the page
await fetch(B + '/api/setup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ engine: 'claude', mode: 'simple' }),
});
let told = '';
for (let i = 0; i < 60 && !/ready|Ready|running/.test(told); i++) {
  await sleep(500);
  told = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
}
check('and the page follows what the new app does without being reloaded', /ready|Ready|running/i.test(told), told);
await browser.close();
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
