// knows.mjs - DOES THE TEAM GET TO KNOW THE PERSON, AND DOES IT SOUND LIKE A FRIEND? Measured on a real team, in a real browser, in Simple.
// A made-up person says a few things of themself in passing while asking for ordinary things. Then:
//   kept     what the team kept about them (read from the chat's own store) names what they said, and nothing they did not
//   fits     a later answer, to a question that names none of it, fits them (their city, what they eat)
//   told     "what do you know about me?" lists it
//   forgot   "forget that ..." removes it
// Every reply is printed, so the voice can be read: this script does not grade whether a reply is fun.
//   node training/knows.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
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
let setup = { mode: 'simple', engine: 'claude' };
try {
  if (arg('setup')) setup = { mode: 'simple', ...JSON.parse(arg('setup')) };
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));
const SAY = [
  {
    say: 'Hi! We just moved to Porto, and we are vegetarian. What should we cook tonight? Something quick.',
    why: 'says two lasting things in passing',
  },
  { say: 'My daughter Mia turns six on Saturday. Any ideas for a small party at home?', why: 'says a third' },
  {
    say: 'Where could we go for a nice dinner this weekend?',
    why: 'names nothing of themself: the answer should still fit them',
    fits: /porto|vegetarian|veggie|meat-free|plant/i,
  },
  { say: 'What do you know about me?', why: 'asks what is kept', told: [/porto/i, /vegetarian/i, /mia|daughter/i] },
  { say: 'Forget that we are vegetarian', why: 'has one thing forgotten', forgot: /vegetarian/i },
];
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: ' +
      SAY.length +
      ' messages, one or two with a web search. Add --spend-claude to say so.',
  );
  process.exit(2);
}
const PORT = Number(arg('port', 5289));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-knows-'));
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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('familyoffice.mode', 'simple');
    } catch {
      /* no storage */
    }
  });
  const p = await ctx.newPage();
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
  const settle = async (from) => {
    let quiet = 0;
    let last = -1;
    for (let t = 0; t < 900 && quiet < 10; t++) {
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
  const kept = () =>
    p.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}');
        return ((s.learning || {}).ledger || [])
          .filter((x) => x.kind === 'you')
          .map((x) => ({ text: x.text, shown: x.shown || 0, used: x.used || 0 }));
      } catch {
        return [];
      }
    });
  for (const a of SAY) {
    const from = await p.locator('.chat-log .msg:not(.you)').count();
    const t0 = Date.now();
    await p.locator('.composer :is(input, textarea)').fill(a.say);
    await p.locator('.composer :is(input, textarea)').press('Enter');
    await settle(from);
    const got = await p.evaluate(
      (at) =>
        [...document.querySelectorAll('.chat-log .msg:not(.you)')]
          .slice(at)
          .map((el) => ({
            who: (el.querySelector('.msg-head strong') || {}).textContent || '?',
            text: [...el.querySelectorAll('p')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' '),
            card: (el.querySelector('.answer-card') || {}).innerText || '',
          }))
          .filter((m) => m.text),
      from,
    );
    const text = got.map((m) => m.text).join('\n');
    const know = await kept();
    const row = {
      at: new Date().toISOString(),
      say: a.say,
      why: a.why,
      seconds: Math.round((Date.now() - t0) / 1000),
      kept: know,
      replies: got.map(
        (m) =>
          m.who +
          ': ' +
          m.text.slice(0, 900) +
          (m.card ? '  [CARD: ' + m.card.replace(/\s+/g, ' ').slice(0, 200) + ']' : ''),
      ),
    };
    if (a.fits) row.fits = a.fits.test(text);
    if (a.told) row.told = a.told.map((re) => re.test(text));
    if (a.forgot) row.forgot = !know.some((k) => a.forgot.test(k.text));
    rows.push(row);
    fs.appendFileSync(path.join(WORK, 'knows-runs.jsonl'), JSON.stringify(row) + '\n');
    console.log('\nYOU: ' + a.say + '   (' + a.why + '; ' + row.seconds + ' s)');
    for (const r of row.replies) console.log('  ' + r.slice(0, 700));
    console.log(
      '  kept about them now: ' +
        (know.length
          ? know.map((k) => '"' + k.text + '" (shown ' + k.shown + ', used ' + k.used + ')').join('; ')
          : 'nothing') +
        (a.fits ? '\n  FITS THEM: ' + (row.fits ? 'yes' : 'NO') : '') +
        (a.told ? '\n  LISTED: ' + row.told.map((x) => (x ? 'yes' : 'NO')).join(', ') : '') +
        (a.forgot ? '\n  FORGOTTEN: ' + (row.forgot ? 'yes' : 'NO') : ''),
    );
  }
  await p.screenshot({ path: path.join(WORK, 'knows.png'), fullPage: false });
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
const after2 = (rows[1] || {}).kept || [];
const ok = {
  kept: /porto/i.test(JSON.stringify(after2)) && /vegetarian/i.test(JSON.stringify(after2)),
  fits: !!(rows[2] || {}).fits,
  told: ((rows[3] || {}).told || []).filter(Boolean).length >= 2,
  forgot: !!(rows[4] || {}).forgot,
};
console.log(
  '\nKept what they said of themself: ' +
    (ok.kept ? 'yes' : 'NO') +
    '. A later answer fitted them: ' +
    (ok.fits ? 'yes' : 'NO') +
    '. Listed when asked: ' +
    (ok.told ? 'yes' : 'NO') +
    '. Forgotten when asked: ' +
    (ok.forgot ? 'yes' : 'NO') +
    '.',
);
process.exit(Object.values(ok).every(Boolean) ? 0 : 1);
