// plan.mjs - THE PLAN AND THE LOOP, MEASURED ON A REAL TEAM (Developer mode). A JavaScript scenario from scenarios/javascript.mjs is
// put in a Git folder, the folder is connected on the Workspace page, and the ticket is typed into the real chat in a real browser.
// What is read back: the requirements the Overseer wrote (did a real model give a list that could be read), the rounds it took, the
// Steward's verdict on each requirement (was every one judged), how it ended (landed, or waiting with what is not met), and the
// scenario's ORACLE, the hidden check the team never sees, run on the team's copy. The four ways it can come out:
//   landed-right   it landed, and the oracle agrees                      the good one
//   false-green    it landed, and the oracle does not                    the dangerous one
//   held-right     it waits with a requirement not met, and the oracle fails too
//   held-back      it waits, and the oracle passes: the judge was stricter than the ticket
//
//   node training/plan.mjs --spend-claude --claude-model claude-sonnet-5-5                 js-basket, once
//   node training/plan.mjs --only js-basket,js-slug --spend-claude --claude-model claude-sonnet-5-5
//
// Each scenario has a runner, a folder and a chat of its own. Rows go to .work/train/plan-runs.jsonl; the summary to
// training/results/plan-<label>.json and history.jsonl; a picture of the chat at the end to .work/train/plan-shots-<label>/.
import { createRequire } from 'module';
import { spawn, spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { JAVASCRIPT } from './scenarios/javascript.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ROOT = path.join(REPO_ROOT, 'src');
const WORK = path.join(REPO_ROOT, '.work', 'train');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const has = (name) => process.argv.includes('--' + name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = String(arg('only', 'js-basket')).split(',').filter(Boolean);
const list = JAVASCRIPT.filter((s) => s.kind !== 'find' && s.oracle && s.oracle.type === 'node' && only.includes(s.id));
if (!list.length) {
  console.log(
    'No scenario matches. There are: ' +
      JAVASCRIPT.filter((s) => s.kind !== 'find')
        .map((s) => s.id)
        .join(', '),
  );
  process.exit(2);
}
const claudeModel = String(arg('claude-model', ''));
const label = String(arg('label', 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : ''))).replace(
  /[^\w.-]+/g,
  '-',
);
if (!has('spend-claude')) {
  console.log(
    'This run spends your own Claude plan: ' +
      list.length +
      ' scenario' +
      (list.length === 1 ? '' : 's') +
      ', each a build and a proof, and up to two more of each if a requirement is not met. Add --spend-claude to say so.',
  );
  process.exit(2);
}
const PORT = Number(arg('port', 5295));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const shots = path.join(WORK, 'plan-shots-' + label);
const rowsFile = path.join(WORK, 'plan-runs.jsonl');
fs.mkdirSync(shots, { recursive: true });
const require = createRequire(process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright was not found. Set FO_PLAYWRIGHT to a package.json whose folder has it installed.');
  process.exit(2);
}
// Claude Code is started as the customer's own terminal would start it: nothing of a Claude session this script may itself be running in is handed down
const ownEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_|MCP_)/.test(k)));

// the oracle, against a copy of the folder the team worked in: Node's own test runner; "@repo/" is the copy
function oracleOn(dir, s) {
  const od = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-plan-oracle-'));
  const copy = path.join(od, 'copy');
  fs.cpSync(dir, copy, { recursive: true, filter: (src) => !/(^|\/)(\.git|node_modules)$/.test(src) });
  const at = path.join(od, 'oracle.mjs');
  fs.writeFileSync(at, s.oracle.text.replace(/@repo\//g, copy + '/'));
  const r = spawnSync(process.execPath, ['--test', at], { encoding: 'utf8', timeout: 120000 });
  fs.rmSync(od, { recursive: true, force: true });
  return {
    pass: r.status === 0,
    said: String(r.stdout || '')
      .split('\n')
      .filter((l) => /^not ok|^# (pass|fail) /.test(l))
      .join(' / ')
      .slice(0, 300),
  };
}

const rows = [];
const t0 = Date.now();
const browser = await chromium.launch();
for (const s of list) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-plan-'));
  const state = path.join(base, 'state');
  const repo = path.join(base, s.id);
  fs.mkdirSync(state, { recursive: true });
  for (const [f, text] of Object.entries(s.files)) {
    fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    fs.writeFileSync(path.join(repo, f), text);
  }
  const git = (...a) =>
    execFileSync('git', a, {
      cwd: repo,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Customer',
        GIT_AUTHOR_EMAIL: 'customer@example.com',
        GIT_COMMITTER_NAME: 'Customer',
        GIT_COMMITTER_EMAIL: 'customer@example.com',
      },
    });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'As the customer has it');
  const row = {
    at: new Date().toISOString(),
    label,
    scenario: s.id,
    seconds: 0,
    reqs: [],
    rounds: 0,
    stage: '',
    says: '',
    cards: [],
    judged: false,
    oracle: null,
    outcome: '',
    chat: [],
    errors: [],
  };
  const before = oracleOn(repo, s);
  if (before.pass) {
    row.errors.push('the oracle passes before anything is changed');
  }
  const env = {
    ...ownEnv,
    PORT: String(PORT),
    FO_KEEP: '1',
    FO_STATE_DIR: state,
    FO_NO_OPEN: '1',
    FO_BILLING: '{"enforce":false}',
    FO_LINK_PORT: String(PORT + 40000),
    FO_PICK_FOLDER: repo,
    FO_CLAUDE_ROOT: path.join(base, 'claude'),
    ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}),
  };
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { stdio: 'ignore', env });
  const stop = () => {
    try {
      srv.kill('SIGTERM');
    } catch {
      /* gone */
    }
  };
  process.on('exit', stop);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('familyoffice.mode', 'developer');
    } catch {
      /* no storage */
    }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => row.errors.push(e.message));
  const a = Date.now();
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
    let v;
    for (;;) {
      await sleep(2000);
      v = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
      if (!v.busy) break;
    }
    if (!v.setup || !v.setup.done)
      throw new Error('set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 300));
    await p.goto(B + '/start.html', { waitUntil: 'load' });
    await p.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
    if (await p.locator('#resume-go').count()) {
      await p.locator('#resume-go').click();
      await p.locator('#meet').waitFor({ timeout: 20000 });
    }
    await p.locator('#meet').click();
    await p.locator('.composer input').waitFor({ timeout: 30000 });
    await sleep(900);
    if (await p.locator('dialog.step-done[open]').count()) {
      await p.keyboard.press('Escape');
      await sleep(300);
    }
    // the folder, connected the way a person does it (the folder window is stood in for: it "chooses" the scenario's folder)
    await p.goto(B + '/app.html#workspace', { waitUntil: 'load' });
    await p.locator('#ws-folder').waitFor({ timeout: 20000 });
    await p.locator('#ws-folder').click();
    await p.locator('#ws-folder-path').waitFor({ timeout: 60000 });
    await sleep(600);
    if (await p.locator('dialog.step-done[open]').count()) {
      await p.keyboard.press('Escape');
      await sleep(300);
    } // "that step is done": closed, as a person would
    await p.locator('#nav a[href="#chat"]').click();
    const box = p.locator('.composer input');
    await box.waitFor({ timeout: 20000 });
    await sleep(900);
    // the ticket's words, WITHOUT its key: a key in the message has the team look the ticket up in the customer's own Jira (found on
    // the first runs: "I could not read WEB-214 from Jira"), and a measurement must not reach into that
    await box.fill((s.title + '. ' + s.ticket).replace(/\s+/g, ' ').trim());
    await box.press('Enter');
    // until the last plan card says how it ended; "go" is said once if the team stops to ask or to recommend a branch
    // (The first version looked for the word "go" in the last message, once; a team that asked twice was then left waiting for good.
    // Whether the team is waiting for an answer is read from the chat's own state, and "go" is said each time it is, three times at most.)
    let went = 0;
    let end = '';
    let idle = 0;
    for (let t = 0; t < 750 && !end && idle < 90; t++) {
      await sleep(2000);
      const now = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.plan-card')];
        const last = cards[cards.length - 1];
        let asking = false;
        try {
          asking = !!JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}').asking;
        } catch {
          asking = false;
        }
        return {
          stage: last ? last.dataset.stage : '',
          busy: !!document.querySelector('.narr-bar.on, .chat-log p.typing'),
          asking,
          n: cards.length,
        };
      });
      if (now.asking && !now.busy && went < 3) {
        went++;
        row.asked = went;
        await box.fill('go');
        await box.press('Enter');
        await sleep(1500);
        idle = 0;
        continue;
      }
      if (['landed', 'waiting', 'stopped', 'talk'].includes(now.stage) && !now.busy) end = now.stage;
      idle = now.busy ? 0 : idle + 1; // three minutes with nobody working and no end: it is not going to end
    }
    await sleep(1500);
    const got = await p.evaluate(() => ({
      cards: [...document.querySelectorAll('.plan-card')].map((c) => ({
        round: Number(c.dataset.round),
        stage: c.dataset.stage,
        says: ((c.querySelector('.plan-says') || {}).innerText || '').trim(),
        reqs: [...c.querySelectorAll('.plan-reqs li')].map((li) => ({
          state: li.className.replace('is-', ''),
          text: li.querySelector('.plan-req').firstChild.textContent.trim(),
          why: ((li.querySelector('em') || {}).innerText || '').trim(),
        })),
      })),
      chat: [...document.querySelectorAll('.chat-log .msg')].map(
        (m) =>
          ((m.querySelector('.msg-head strong') || {}).textContent || 'You') +
          ': ' +
          ((m.querySelector('p') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 700),
      ),
    }));
    const last = got.cards[got.cards.length - 1] || { reqs: [] };
    row.cards = got.cards;
    row.chat = got.chat;
    row.rounds = got.cards.filter((c) => c.stage !== 'moved' && c.stage !== 'talk').length;
    row.stage = end || 'ran out of time';
    row.says = last.says || '';
    row.reqs = last.reqs.map((r) => r.text);
    row.judged = last.reqs.length > 0 && last.reqs.every((r) => r.state === 'met' || r.state === 'unmet');
    await p
      .locator('.plan-card')
      .last()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await p.screenshot({ path: path.join(shots, s.id + '.png') });
    // the oracle, on where the change is. Landed: the branch the team made in the customer's folder (or the folder's own branch, if it
    // landed there), read out into a folder of its own. Waiting: the team's copy of the folder, where the change sits uncommitted.
    // (The first run of this script read the team's copy after a landing, which by then is back on the folder's branch: a false "false green".)
    if (row.stage === 'landed') {
      const made = execFileSync('git', ['branch', '--format=%(refname:short)'], { cwd: repo, encoding: 'utf8' })
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x && x !== 'main');
      const out = path.join(base, 'landed');
      execFileSync('git', ['clone', '-q', ...(made.length ? ['--branch', made[made.length - 1]] : []), repo, out], {
        stdio: 'ignore',
      });
      row.branch = made[made.length - 1] || 'main';
      row.oracle = oracleOn(out, s);
    } else {
      const local = path.join(state, 'work', 'local');
      const copy = fs.existsSync(local)
        ? fs
            .readdirSync(local)
            .map((d) => path.join(local, d))
            .find((d) => fs.statSync(d).isDirectory())
        : null;
      row.oracle = copy ? oracleOn(copy, s) : { pass: false, said: "the team's copy of the folder was not found" };
    }
    row.folder = repo;
    row.outcome =
      row.stage === 'landed'
        ? row.oracle.pass
          ? 'landed-right'
          : 'false-green'
        : row.stage === 'waiting'
          ? row.oracle.pass
            ? 'held-back'
            : 'held-right'
          : row.stage;
  } catch (e) {
    row.errors.push(String((e && e.message) || e).slice(0, 300));
    row.outcome = row.outcome || 'stopped';
  }
  row.seconds = Math.round((Date.now() - a) / 1000);
  await ctx.close().catch(() => {});
  await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
  await sleep(800);
  stop();
  await sleep(500);
  rows.push(row);
  fs.mkdirSync(WORK, { recursive: true });
  fs.appendFileSync(rowsFile, JSON.stringify(row) + '\n');
  console.log(
    s.id.padEnd(14) +
      String(row.outcome).padEnd(14) +
      String(row.seconds).padStart(5) +
      ' s, ' +
      row.rounds +
      ' round' +
      (row.rounds === 1 ? '' : 's') +
      ', ' +
      row.reqs.length +
      ' requirement' +
      (row.reqs.length === 1 ? '' : 's') +
      (row.judged ? ', every one judged' : ', NOT every one judged') +
      ', oracle ' +
      (row.oracle ? (row.oracle.pass ? 'passes' : 'FAILS ' + row.oracle.said) : 'not run'),
  );
  for (const c of row.cards)
    console.log(
      '   round ' +
        c.round +
        ' [' +
        c.stage +
        '] ' +
        c.says +
        '\n' +
        c.reqs
          .map(
            (r, i) => '      ' + (i + 1) + '. ' + r.state.padEnd(7) + ' ' + r.text + (r.why ? '  (' + r.why + ')' : ''),
          )
          .join('\n'),
    );
  if (row.errors.length) console.log('   errors: ' + row.errors.join(' | '));
  if (!['landed-right', 'false-green', 'held-right', 'held-back'].includes(row.outcome))
    console.log(
      '   the chat ended:\n   ' +
        row.chat
          .slice(-5)
          .map((x) => x.slice(0, 500))
          .join('\n   '),
    );
}
await browser.close().catch(() => {});
const count = (k) => rows.filter((r) => r.outcome === k).length;
console.log(
  '\n' +
    label +
    ', the plan and the loop: ' +
    count('landed-right') +
    ' landed right, ' +
    count('false-green') +
    ' false green, ' +
    count('held-right') +
    ' rightly held, ' +
    count('held-back') +
    ' held back by a strict judge, ' +
    rows.filter((r) => !['landed-right', 'false-green', 'held-right', 'held-back'].includes(r.outcome)).length +
    ' other. ' +
    Math.round((Date.now() - t0) / 60000) +
    ' min.',
);
if (rows.length) {
  const out = path.join(HERE, 'results');
  fs.mkdirSync(out, { recursive: true });
  const sum = {
    label,
    mode: 'developer',
    what: 'plan and loop',
    at: new Date().toISOString(),
    machine: os.cpus()[0].model + ', ' + Math.round(os.totalmem() / 2 ** 30) + ' GB',
    minutes: Math.round((Date.now() - t0) / 60000),
    note: String(arg('note', '')),
    total: {
      runs: rows.length,
      landedRight: count('landed-right'),
      falseGreen: count('false-green'),
      heldRight: count('held-right'),
      heldBack: count('held-back'),
    },
    scenarios: rows.map((r) => ({
      id: r.scenario,
      outcome: r.outcome,
      seconds: r.seconds,
      rounds: r.rounds,
      requirements: r.reqs,
      judged: r.judged,
      oracle: r.oracle,
      says: r.says,
      errors: r.errors,
    })),
  };
  fs.writeFileSync(path.join(out, 'plan-' + label + '.json'), JSON.stringify(sum, null, 1) + '\n');
  fs.appendFileSync(
    path.join(out, 'history.jsonl'),
    JSON.stringify({
      label,
      mode: 'developer',
      what: 'plan and loop',
      at: sum.at,
      note: sum.note,
      minutes: sum.minutes,
      total: sum.total,
      only: only.join(','),
    }) + '\n',
  );
  console.log(
    'Summary: training/results/plan-' +
      label +
      '.json   Every row: .work/train/plan-runs.jsonl   Pictures: .work/train/plan-shots-' +
      label +
      '/',
  );
}
process.exit(0);
