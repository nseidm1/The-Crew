// ticket-media.mjs - THE PAGE'S SIDE OF A TICKET'S PICTURES, in a real browser against a real runner with stand-ins for Claude Code, Jira
// and Atlassian's media host: open a ticket on the Jira page, press "Talk to the team", and the chat must show Ask saying what the
// ticket's picture shows, with that reading kept on the ticket the team is talking about.   node tests/browser/ticket-media.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';

const ROOT = SRC;
const T = FAKES;
const PORT = 5233 + SHIFT;
const MP = 5234 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const state = path.join(WORK, 'ticket-media-state');
fs.rmSync(state, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { chromium } = createRequire(PLAYWRIGHT_FROM)('playwright');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got).slice(0, 500)));
  if (!ok) failed++;
};
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(300, 7)]);
const asked = [];
const host = http.createServer((q, r) => {
  asked.push(q.url);
  r.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length });
  r.end(PNG);
});
await new Promise((ok) => host.listen(MP, '127.0.0.1', ok));
for (const f of ['fake-claude.mjs', 'fake-open.mjs']) fs.chmodSync(path.join(T, f), 0o755);
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
    FO_LINK_PORT: String(PORT + 40000),
    FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_BIN_OPEN: path.join(T, 'fake-open.mjs'),
    FO_FAKE_OPEN_LOG: path.join(state, 'opened.txt'),
    FO_MEDIA_HOST: 'http://127.0.0.1:' + MP + '/',
    FO_FAKE_MEDIA_URL: 'http://127.0.0.1:' + MP + '/file/',
    FO_FAKE_AVATAR: 'none',
  },
});
let browser = null;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  await fetch(B + '/api/setup', {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ engine: 'claude', mode: 'developer' }),
  });
  for (let i = 0; i < 300; i++) {
    const v = await (await fetch(B + '/api/setup')).json();
    if (!v.busy) break;
    await sleep(200);
  }
  await fetch(B + '/api/connect', { method: 'POST', headers: J, body: '{"id":"atlassian"}' });
  for (let i = 0; i < 40; i++) {
    if (((await (await fetch(B + '/api/connectors')).json()).list[0] || {}).state === 'connected') break;
    await sleep(250);
  }
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('familyoffice.mode')) localStorage.setItem('familyoffice.mode', 'developer');
    } catch {
      /* no storage */
    }
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
  if (await p.locator('#resume-go').count()) {
    await p.locator('#resume-go').click();
    await p.locator('#meet').waitFor({ timeout: 20000 });
  }
  await p.locator('#meet').click();
  await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 30000 });
  await sleep(800);
  if (await p.locator('dialog.step-done[open]').count()) {
    await p.keyboard.press('Escape');
    await sleep(300);
  }
  await p.evaluate(() => {
    location.hash = '#jira';
  });
  for (let i = 0; i < 40 && !(await p.locator('#jira-signin, #jira-show').count()); i++) await sleep(300);
  if (await p.locator('#jira-signin').count()) {
    await p.locator('#jira-signin').click();
    for (let i = 0; i < 40 && !(await p.locator('#jira-show').count()); i++) await sleep(400);
  }
  for (let i = 0; i < 40 && (await p.locator('#jira-board option').count()) < 2; i++) await sleep(300);
  await p.locator('#jira-board').selectOption({ index: 1 });
  for (let i = 0; i < 40 && (await p.locator('.jmenu-off').count()); i++) await sleep(300);
  await p.locator('#jira-what').click();
  await sleep(200);
  await p.locator('.jseg button', { hasText: 'Everyone' }).click();
  await sleep(200);
  await p.locator('.jira-head h2').click();
  await sleep(200);
  await p.locator('#jira-show').click();
  await sleep(300);
  for (let i = 0; i < 80 && (await p.locator('#jira-show').isDisabled()); i++) await sleep(300);
  for (let i = 0; i < 40 && !(await p.locator('.ticket').count()); i++) await sleep(300);
  await p.locator('.ticket', { hasText: 'APP-12' }).first().click();
  await p.locator('#jira-ticket .jdesc').waitFor({ timeout: 30000 });
  const files = await p.locator('#jira-ticket .jfiles li').allInnerTexts();
  const small = await p.locator('#jira-ticket').innerText();
  check(
    "the ticket's panel names its file and says the team looks at pictures and recordings",
    files.join() === 'cut-off.png' && /fetched to this computer and looked at by the team/.test(small),
    [files, small.slice(0, 200)],
  );
  await p.locator('#jira-discuss').click();
  await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 20000 });
  let said = '';
  for (let i = 0; i < 60; i++) {
    said = (await p.locator('.chat-log .msg').allInnerTexts()).join('\n');
    if (/attached to APP-12/.test(said)) break;
    await sleep(300);
  }
  check(
    'pressing "Talk to the team" has Ask look at what is attached, and say in the chat what it shows',
    /I looked at what is attached to APP-12/.test(said) &&
      /cut-off\.png: The Pay button is cut off at the right edge/.test(said),
    said.slice(-500),
  );
  check(
    'the picture was fetched once, from the address the connector gave',
    asked.length === 1 && /^\/file\/63172\/binary/.test(asked[0]),
    asked,
  );
  const focus = await p.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}').focus || null;
    } catch {
      return null;
    }
  });
  check(
    "what the picture shows is kept on the ticket the team is talking about, as the team's own reading",
    !!focus &&
      focus.key === 'APP-12' &&
      /as the team read them: cut-off\.png \(a picture\): The Pay button is cut off/.test(focus.media || ''),
    focus,
  );
  // a picture handed over in the chat itself: the paperclip, the computer's file chooser, and Ask saying what it shows
  check(
    'the message box has a paperclip for a picture or a video',
    (await p.locator('#attach').count()) === 1 &&
      /picture or a video/.test(await p.locator('#attach').getAttribute('title')),
    null,
  );
  const choose = async (files) => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.locator('#attach').click()]);
    await fc.setFiles(files);
    await sleep(300);
  };
  const chips = () =>
    p
      .locator('#attach-files .att.file')
      .evaluateAll((els) =>
        els.map(
          (e) =>
            e.querySelector('.t').textContent +
            (e.querySelector('.att-thumb') ? ' +thumb' : '') +
            (e.querySelector('.att-x') ? ' +x' : ''),
        ),
      );
  const tk = await p.locator('#attach-tray .att.chat-ticket').count();
  const before = await p.locator('.chat-log .msg').count();
  check(
    'the ticket the chat is about is a chip in the message box, with an x',
    tk === 1 &&
      (await p.locator('#attach-tray #ticket-clear').getAttribute('aria-label')) === 'Remove APP-12 from the chat',
    tk,
  );
  await choose([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') },
    { name: 'my-screen.png', mimeType: 'image/png', buffer: PNG },
  ]);
  const tray1 = await chips();
  const note1 = await p
    .locator('.tray-note')
    .innerText()
    .catch(() => '');
  check(
    'a chosen picture waits in the message box as a chip with its name, a thumbnail and an x; a file that is neither a picture nor a video is left out and the box says so; nothing is sent yet',
    tray1.join() === 'my-screen.png +thumb +x' &&
      /notes\.txt is not a picture or a video/.test(note1) &&
      (await p.locator('.chat-log .msg').count()) === before,
    [tray1, note1],
  );
  await p.locator('#attach-files .att-x').first().click();
  await sleep(200);
  check(
    'its x takes it out again, and nothing was sent',
    (await chips()).length === 0 && (await p.locator('.chat-log .msg').count()) === before,
    await chips(),
  );
  await choose({ name: 'my-screen.png', mimeType: 'image/png', buffer: PNG });
  await p.locator('.composer :is(input, textarea)').fill('What is wrong with this screen?');
  await p
    .locator('.chat-card')
    .screenshot({ path: path.join(WORK, 'out', 'tray.png') })
    .catch(() => {});
  await p.locator('.composer :is(input, textarea)').press('Enter');
  let said2 = '';
  for (let i = 0; i < 100; i++) {
    said2 = (await p.locator('.chat-log .msg').allInnerTexts()).slice(before).join('\n');
    if (
      /what you gave me/.test(said2) &&
      (await p.locator('.chat-log .msg').count()) >= before + 3 &&
      !(await p.locator('.chat-log p.typing').count())
    )
      break;
    await sleep(300);
  }
  const mine = (await p.locator('.chat-log .msg.you').last().innerText()).replace(/\s+/g, ' ');
  check(
    'sent with words: the message shows what was attached, Ask says what it shows without asking what is wanted, and the words are answered',
    /my-screen\.png/.test(mine) &&
      /What is wrong with this screen\?/.test(mine) &&
      /I looked at what you gave me\./.test(said2) &&
      /my-screen\.png: The Pay button is cut off/.test(said2) &&
      !/Tell me what you would like done/.test(said2) &&
      (await chips()).length === 0 &&
      (await p.locator('.chat-log .msg').count()) >= before + 3,
    [mine, said2.slice(-500)],
  );
  const b2 = await p.locator('.chat-log .msg').count();
  await choose({ name: 'second.png', mimeType: 'image/png', buffer: PNG });
  await p.locator('.composer .btn.primary').click();
  let said3 = '';
  for (let i = 0; i < 60; i++) {
    said3 = (await p.locator('.chat-log .msg').allInnerTexts()).slice(b2).join('\n');
    if (/what you gave me/.test(said3)) break;
    await sleep(300);
  }
  check(
    'sent with no words: it is looked at, and Ask asks what is wanted',
    /second\.png/.test(said3) &&
      /I looked at what you gave me\./.test(said3) &&
      /Tell me what you would like done about it/.test(said3),
    said3.slice(-400),
  );
  const box = await p.locator('.composer').boundingBox();
  const clipBox = await p.locator('#attach').boundingBox();
  check(
    'the paperclip sits inside the message row',
    !!box && !!clipBox && clipBox.x >= box.x && clipBox.x + clipBox.width <= box.x + box.width && clipBox.height >= 32,
    [box, clipBox],
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('on a phone the message row still fits the screen', wide <= 1, wide);
  await p.screenshot({ path: path.join(WORK, 'out', 'chat-attached.png') }).catch(() => {});
  check('the page raised no error', errors.length === 0, errors);
} catch (e) {
  check('ran to the end', false, String((e && e.stack) || e).slice(0, 400));
} finally {
  if (browser) await browser.close().catch(() => {});
  srv.kill('SIGTERM');
  host.close();
  await sleep(300);
  fs.rmSync(state, { recursive: true, force: true });
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
