// claude-sign-in.mjs - SIGNING IN TO CLAUDE AS A STEP OF SETTING UP, in a real browser against a stand-in Claude Code that is signed out until
// its sign-in has been gone through: the page shows "Sign in to Claude" as the step under way (not "It stopped"), offers Claude's page
// and a box for a code, and carries on to "ready" by itself with nothing pressed.   node tests/browser/claude-sign-in.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'signin-state');
const OUT = path.join(WORK, 'signin');
const PORT = 5237 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(state, 'bin'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) bad++;
};
fs.chmodSync(path.join(T, 'fake-claude.mjs'), 0o755);
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
    FO_FAKE_CLAUDE_OUT: 'until-login',
    FO_FAKE_LOGIN_MS: '6000',
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_LINK_PORT: String(47895 + SHIFT),
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
for (const [name, w, hgt, mode] of [
  ['simple', 1366, 900, 'simple'],
  ['developer-phone', 390, 844, 'developer'],
]) {
  fs.rmSync(path.join(state, 'claude', 'fake-signed-in'), { force: true }); // signed out again for the second pass
  await fetch(B + '/api/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(
    () => {},
  );
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#modes').waitFor({ timeout: 15000 });
  const card = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  if (mode === 'simple') {
    await p.locator('#mode-simple').click();
    await p.locator('#simple-start').waitFor({ timeout: 20000 });
    await p.locator('#mind-claude').click();
    await p.locator('#simple-start').click();
  } else {
    await p.locator('#mode-developer').click();
    const go = p.getByRole('button', { name: /Start (free )?with Claude/ }).first();
    await go.waitFor({ timeout: 20000 });
    const said = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
    check(
      name +
        ': the Claude Code choice says it is installed for you and signed in to right here, and names no command or terminal',
      /Installed for you if it is missing/.test(said) &&
        /you sign in to Claude right here/.test(said) &&
        !/\bCLI\b|terminal|command line/i.test(said),
      said.slice(0, 600),
    );
    await go.click();
  }
  await p.locator('#signin-step').waitFor({ timeout: 30000 });
  await sleep(900);
  const step = await p.evaluate(() => {
    const el = document.querySelector('#signin-step');
    const a = document.querySelector('#signin-open');
    return {
      text: el.innerText.replace(/\s+/g, ' '),
      href: a && !a.hidden ? a.href : '',
      code: !!document.querySelector('#codeform input[name=code]'),
      title: document.querySelector('#st-title').innerText.replace(/\s+/g, ' '),
      now: (document.querySelector('#plain-now') || {}).innerText || '',
      what: document.querySelector('#what').innerText,
      stopped: !!document.querySelector('.ring.fail'),
      wide: document.scrollingElement.scrollWidth - innerWidth,
      steps: [...document.querySelectorAll('.todo > li')].map(
        (li) =>
          li.className +
          ': ' +
          li.querySelector('strong').textContent +
          ' / ' +
          (li.querySelector('.d') || {}).textContent,
      ),
    };
  });
  // signed out, there is no account to change from: "Use another account" belongs where Claude Code is signed in, not here
  check(
    name + ': the sign-in step offers no "Use another account": Claude Code is signed out, so there is none to leave',
    !/Use another account/.test(await p.locator('#signin-step').innerText()),
  );
  check(
    name +
      ': signed out, the page shows "Sign in to Claude" as the step under way: Claude\'s page to open, a box for a code, and it has not stopped',
    /^Sign in to Claude/i.test(step.text) &&
      /carries on by itself/.test(step.text) &&
      /We never see what you type/.test(step.text) &&
      /^https:\/\/claude\.ai\//.test(step.href) &&
      step.code &&
      !step.stopped &&
      !/stopped/i.test(step.title) &&
      step.wide <= 0,
    step,
  );
  check(
    name + ': the steps name Claude Code in words: no command, no terminal, and the sign-in step is the one running',
    step.steps.some((x) => /^run: Sign in to Claude \/ Waiting for you to sign in to Claude/.test(x)) &&
      !/\bCLI\b|terminal|curl|claude command/i.test(step.steps.join(' ')) &&
      (mode !== 'simple' || /Waiting for you to sign in to Claude/.test(step.now)),
    [step.steps, step.now, step.what],
  );
  await p.screenshot({ path: path.join(OUT, name + '.png') });
  await p
    .getByText(/Claude is ready|Your team is ready/)
    .first()
    .waitFor({ timeout: 90000 });
  const v = await (await fetch(B + '/api/setup')).json();
  check(
    name + ': once the sign-in has finished, setup carries on to ready by itself, with nothing pressed',
    v.setup.done === true && !v.setup.error && !!v.session && (await p.locator('#signin-step').count()) === 0,
    v.setup.error || v.setup.steps.map((x) => x.state),
  );
  await ctx.close();
}
check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
