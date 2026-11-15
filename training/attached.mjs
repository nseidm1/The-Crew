// attached.mjs - A TICKET IS ATTACHED TO THE CHAT, AND THE CUSTOMER SAYS "IT". Measured on a real team, in a real browser, in Developer:
// a made-up ticket is put in front of the team the way "Talk to the team" leaves one (kept with the chat, in the browser), and the
// customer then asks about it without naming it. A reply passes when it is plainly about that ticket. No Jira is asked anything.
//   node training/attached.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
//   node training/attached.mjs --setup '{"model":"nemotron35-30b"}'
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ROOT = path.join(REPO_ROOT, 'src');
const WORK = path.join(REPO_ROOT, '.work', 'train');
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i < 0 ? d : process.argv[i + 1];
};
const has = (n) => process.argv.includes('--' + n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let setup = { mode: 'developer', engine: 'claude' };
try {
  if (arg('setup')) setup = { mode: 'developer', ...JSON.parse(arg('setup')) };
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));
// the ticket is made up, and names no real one
const TICKET = {
  key: 'SHOP-48',
  summary: 'Checkout button is cut off on small phones',
  status: 'In Progress',
  type: 'Bug',
  priority: 'High',
  description:
    'On a phone 360 wide the Pay button at the bottom of the checkout is cut off at the right edge, so its label reads "Pay no". It is fine at 390 and wider. Seen on Android and on iPhone SE.',
};
const ABOUT = /SHOP-48|pay button|checkout|cut off|360|small phones?/i;
const ASKS = [
  { say: 'What do you make of it?', why: '"it", with nothing else said' },
  { say: 'How big a job is this one, roughly?', why: '"this one"' },
  { say: 'Who on the team should pick that up first, and why?', why: '"that"' },
];
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: ' +
      ASKS.length +
      ' short questions. Add --spend-claude to say so.',
  );
  process.exit(2);
}
const PORT = Number(arg('port', 5291));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-attached-'));
const state = path.join(base, 'state');
fs.mkdirSync(state, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const ownEnv = claude
  ? Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_|MCP_)/.test(k)))
  : process.env;
const env = {
  ...ownEnv,
  PORT: String(PORT),
  FO_KEEP: '1',
  FO_STATE_DIR: state,
  FO_NO_OPEN: '1',
  FO_BILLING: '{"enforce":false}',
  FO_LINK_PORT: String(PORT + 40000),
  ...(claude
    ? { FO_CLAUDE_ROOT: path.join(base, 'claude'), ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}) }
    : {}),
};
if (!claude && !env.FO_PI_CLI) {
  const { piInstalled } = await import(path.join(ROOT, 'runner', 'host.mjs'));
  const pi = await piInstalled(path.join(os.homedir(), '.familyoffice', 'state'));
  if (pi && pi.cli) env.FO_PI_CLI = pi.cli;
}
const require = createRequire(process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright was not found. Set FO_PLAYWRIGHT to a package.json whose folder has it installed.');
  process.exit(2);
}
const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { stdio: 'ignore', env });
const stop = () => {
  try {
    srv.kill('SIGTERM');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => {
    stop();
    process.exit(130);
  });
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(B + '/api/setup')).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(150);
}
const rows = [];
let browser = null;
try {
  await fetch(B + '/api/setup', { method: 'POST', headers: J, body: JSON.stringify(setup) });
  let v;
  for (;;) {
    await sleep(2000);
    v = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
    if (!v.busy) break;
  }
  if (!v.setup || !v.setup.done)
    throw new Error('set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 300));
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('familyoffice.mode', 'developer');
    } catch {
      /* no storage */
    }
  });
  const p = await ctx.newPage();
  const openChat = async () => {
    await p.goto(B + '/start.html', { waitUntil: 'load' });
    await p.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
    if (await p.locator('#resume-go').count()) {
      await p.locator('#resume-go').click();
      await p.locator('#meet').waitFor({ timeout: 20000 });
    }
    await p.locator('#meet').click();
    await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 30000 });
    await sleep(900);
    if (await p.locator('dialog.step-done[open]').count()) {
      await p.keyboard.press('Escape');
      await sleep(300);
    }
  };
  await openChat();
  // the ticket, kept with the chat exactly where "Talk to the team" keeps it; then the page is opened again and shows it attached
  const kept = await p.evaluate((t) => {
    const k = 'familyoffice.core.v1';
    const was = JSON.parse(localStorage.getItem(k) || '{}');
    was.focus = t;
    localStorage.setItem(k, JSON.stringify(was));
    return Object.keys(was).length;
  }, TICKET);
  await openChat();
  const shown = (
    await p
      .locator('#chat-ticket')
      .innerText()
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .trim();
  console.log(
    'The ticket is attached to the chat' +
      (/SHOP-48/.test(shown)
        ? ', and the chat shows it: ' + shown.slice(0, 90)
        : ': BUT THE CHAT DOES NOT SHOW IT (' + kept + ' things kept; the page says: ' + shown.slice(0, 120) + ')'),
  );
  const settle = async (from) => {
    let quiet = 0;
    let last = -1;
    for (let t = 0; t < 600 && quiet < 8; t++) {
      await sleep(500);
      const c = await p.locator('.chat-log .msg').count();
      const busy = await p.locator('.narr-bar.on').count();
      const live = await p.locator('.chat-log p.typing').count();
      const answered = (await p.locator('.chat-log .msg:not(.you)').count()) > from || t > 120;
      if (c === last && !busy && !live && answered) quiet++;
      else quiet = 0;
      last = c;
    }
  };
  for (const a of ASKS) {
    const from = await p.locator('.chat-log .msg:not(.you)').count();
    const t0 = Date.now();
    await p.locator('.composer :is(input, textarea)').fill(a.say);
    await p.locator('.composer :is(input, textarea)').press('Enter');
    await settle(from);
    const got = await p.evaluate(
      (at) =>
        [...document.querySelectorAll('.chat-log .msg:not(.you)')]
          .slice(at)
          .map(
            (el) =>
              ((el.querySelector('.msg-head strong') || {}).textContent || '?') +
              ': ' +
              [...el.querySelectorAll('p')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' '),
          ),
      from,
    );
    const text = got.join('\n');
    const row = {
      at: new Date().toISOString(),
      say: a.say,
      why: a.why,
      seconds: Math.round((Date.now() - t0) / 1000),
      replies: got.length,
      about: ABOUT.test(text),
      lost: /which (ticket|one|task)|what (are you|do you) (referring|mean)|not sure what you mean|can you (clarify|say which)/i.test(
        text,
      ),
      text: text.slice(0, 1200),
    };
    row.pass = row.about && !row.lost;
    rows.push(row);
    fs.appendFileSync(
      path.join(WORK, 'attached-runs.jsonl'),
      JSON.stringify({
        label: claude
          ? 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : '')
          : setup.model || 'team',
        ...row,
      }) + '\n',
    );
    console.log(
      (row.pass ? 'ok    ' : 'MISS  ') +
        a.why.padEnd(28) +
        String(row.seconds).padStart(4) +
        ' s  ' +
        text.replace(/\s+/g, ' ').slice(0, 230),
    );
  }
  await p.screenshot({ path: path.join(WORK, 'attached.png') });
} catch (e) {
  console.log('STOPPED ' + String((e && e.stack) || e).slice(0, 400));
} finally {
  if (browser) await browser.close().catch(() => {});
  await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
  await sleep(800);
  stop();
  await sleep(300);
  fs.rmSync(base, { recursive: true, force: true });
}
console.log(
  '\n' +
    rows.filter((r) => r.pass).length +
    ' of ' +
    rows.length +
    ' questions about "it" were answered about the attached ticket.',
);
process.exit(rows.length && rows.every((r) => r.pass) ? 0 : 1);
