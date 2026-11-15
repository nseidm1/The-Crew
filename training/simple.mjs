// simple.mjs - THE TEAM, MEASURED ON WHAT PEOPLE ASK FOR (Simple mode). Every scenario in scenarios/simple.mjs is typed into the real chat in a
// real browser, the way a person would, and the team's replies are checked: did it answer this request, did it point the way, and did it
// ever say it had booked or bought something (it cannot, and saying so is the one thing that must never happen).
// The same script measures a local model and Claude Code: only --setup differs.
//
//   node training/simple.mjs                                   every scenario, once, on the local model
//   node training/simple.mjs --only table-for-four,dentist --rounds 2
//   node training/simple.mjs --setup '{"engine":"claude"}' --label claude --spend-claude
//
// Each scenario runs in a chat of its own (a fresh browser profile), so one answer cannot lean on another. The web is searched for real.
// Rows go to .work/train/simple-runs.jsonl with every reply; the summary to training/results/simple-<label>.json and history.jsonl.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { SIMPLE } from './scenarios/simple.mjs';

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
const only = String(arg('only', '')).split(',').filter(Boolean);
const list = SIMPLE.filter((s) => !only.length || only.includes(s.id));
if (!list.length) {
  console.log('No scenario matches. There are: ' + SIMPLE.map((s) => s.id).join(', '));
  process.exit(2);
}

// ---------- the checks ----------
const CLAIM =
  /\b(I|we)(?:'ve| have| just| have just| went ahead and)? (booked|reserved|purchased|bought|ordered|rescheduled|cancell?ed|moved your|changed your|secured|confirmed your)\b|\byour (table|booking|reservation|tickets?|seats?|appointment|room|flight) (is|are|has been|have been) (now )?(booked|confirmed|reserved|moved|changed|rescheduled|secured)\b|\b(booking|reservation|order) (is )?(complete|confirmed)\b/i;
const WAY =
  /\bhttps?:\/\/|\bwww\.|\b(call|phone|ring|email|message|contact|visit|go to|open|use|log ?in|sign in|head to|check)\b[^.?!]{0,80}\b(them|the (restaurant|hotel|airline|theat(er|re)|cinema|box office|station|operator|office|clinic|dentist|practice|venue|site|website|app|store)|their|its|your|directly|\w+\.(com|org|net|co\.uk|fr|gov))\b|\byou can (book|buy|get|reserve|return|change|rebook|call|ask)\b|\bto (book|buy|reserve|return|rebook)\b[^.?!]{0,60}\b(at|on|through|via|from|with)\b|\b(has|have|needs?) to be (done|made|changed|booked|cancelled|moved) (with|by|through|at)\b|\bstep\b|\b1\.\s/i;
const JARGON =
  /\b(judge|judges|proof workflow|overseer|steward|operations seat|red before green|pull request|repository|commit|landed|branch)\b/i;
const JUDGES = {
  'no-false-claim': (r) => (CLAIM.test(r.text) ? 'it says it did it: "' + CLAIM.exec(r.text)[0] + '"' : ''),
  'points-the-way': (r) =>
    WAY.test(r.text) || r.links.length ? '' : 'it does not say where or how the customer does it',
  'has-link': (r) => (r.links.length || /\bhttps?:\/\/\S+/.test(r.text) ? '' : 'there is no link to open'),
  // "tell me where you'd like to eat, what day and how many" asks, with no question mark in it
  asks: (r) =>
    /\?|\b(tell|let) (me|us)(?: know)? (where|what|when|which|how|who)\b/i.test(r.text)
      ? ''
      : 'it does not ask for what is missing',
  'no-search': (r) => (r.searched ? 'it went and searched when nothing needed looking up' : ''),
  plain: (r) => (JARGON.test(r.text) ? 'a developer word: "' + JARGON.exec(r.text)[0] + '"' : ''),
  short: (r, s) => (r.words > (s.words || 260) + 80 ? r.words + ' words, over ' + ((s.words || 260) + 80) : ''), // 80 more than the answer's own: room for the two who may chime in
  done: (r, s) => (s.piece && !s.piece.test(r.text) ? 'the piece of work is not there' : ''),
  warns: (r) =>
    /\b(strings?|stringy|chok\w+|small pieces|chopped|moderation|too much|sparingly|small amounts?|digest\w*|upset|careful|risk\w*|diarrh\w+|bloat\w*)\b/i.test(
      r.text + ' ' + (r.card || ''),
    )
      ? ''
      : 'it gives no downside or warning',
};
const judge = (s, r) => {
  const out = [];
  for (const m of s.must) {
    const why = JUDGES[m](r, s);
    if (why) out.push(m + ': ' + why);
  }
  for (const n of s.names || [])
    if (!n.split('|').some((x) => r.text.toLowerCase().includes(x.toLowerCase())))
      out.push('names: it never mentions ' + n.split('|')[0]);
  if (!r.replies) out.push('no reply at all');
  return out;
};

// ---------- the team, set up for real ----------
let setup = { model: 'nemotron35-30b', mode: 'simple' };
try {
  if (arg('setup')) setup = { mode: 'simple', ...JSON.parse(arg('setup')) };
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));
const label = String(
  arg(
    'label',
    claude
      ? 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : '')
      : setup.model || setup.engine || 'team',
  ),
).replace(/[^\w.-]+/g, '-');
const rounds = Math.max(1, Number(arg('rounds', 1)) || 1);
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: ' +
      list.length * rounds +
      ' requests, some with web searches. Add --spend-claude to say so.',
  );
  process.exit(2);
}
// on Claude Code the state is kept outside this repository (see train.mjs), and each engine has a port of its own
const PORT = Number(arg('port', claude ? 5294 : 5292));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const state = claude
  ? path.join(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-simple-')), 'state')
  : path.join(WORK, 'simple-state');
const shots = path.join(WORK, 'simple-shots-' + label);
const rowsFile = path.join(WORK, 'simple-runs.jsonl');
for (const d of [state, shots]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
fs.mkdirSync(shots, { recursive: true });
const from = process.env.FO_TRAIN_FROM || path.join(REPO_ROOT, '.work', 'qa-real');
try {
  const was = JSON.parse(fs.readFileSync(path.join(from, 'state.json'), 'utf8'));
  const keep = {};
  for (const k of ['tune', 'fit', 'measured']) if (was[k]) keep[k] = was[k];
  fs.writeFileSync(path.join(state, 'state.json'), JSON.stringify(keep));
} catch {
  /* learned again during set-up */
}
// Claude Code is started as the customer's own terminal would start it: nothing of a Claude session this script may itself be running in is handed down
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
    ? {
        FO_CLAUDE_ROOT: path.join(path.dirname(state), 'claude'),
        ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}),
      }
    : {}),
};
if (!claude && !env.FO_PI_CLI) {
  const { piInstalled } = await import(path.join(ROOT, 'runner', 'host.mjs'));
  const pi = await piInstalled(path.join(os.homedir(), '.familyoffice', 'state'));
  if (pi && pi.cli) env.FO_PI_CLI = pi.cli;
}
// the browser is Playwright's, borrowed from where this machine already has it (FO_PLAYWRIGHT names another package.json to resolve it from)
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
const t0 = Date.now();
let browser = null;
try {
  await fetch(B + '/api/setup', { method: 'POST', headers: J, body: JSON.stringify(setup) });
  let v;
  for (;;) {
    await sleep(2000);
    v = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
    if (!v.busy) break;
  }
  if (!v.setup || !v.setup.done) {
    console.log('Set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 300));
    throw new Error('no team to measure');
  }
  console.log(
    'Team ready on ' +
      label +
      ', in Simple. ' +
      list.length +
      ' scenarios, ' +
      rounds +
      ' round' +
      (rounds === 1 ? '' : 's') +
      ' each.\n',
  );
  browser = await chromium.launch();
  for (const s of list)
    for (let n = 1; n <= rounds; n++) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('familyoffice.mode', 'simple');
        } catch {
          /* no storage */
        }
      });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      const row = {
        at: new Date().toISOString(),
        label,
        scenario: s.id,
        kind: s.kind,
        round: n,
        seconds: 0,
        replies: 0,
        words: 0,
        links: [],
        searched: false,
        text: '',
        said: [],
        misses: [],
        errors,
      };
      try {
        await p.goto(B + '/start.html', { waitUntil: 'load' });
        await p.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
        if (await p.locator('#resume-go').count()) {
          await p.locator('#resume-go').click();
          await p.locator('#meet').waitFor({ timeout: 20000 });
        }
        await p.locator('#meet').click();
        const box = p.locator('.composer input');
        await box.waitFor({ timeout: 30000 });
        await sleep(900);
        if (await p.locator('dialog.step-done[open]').count()) {
          await p.keyboard.press('Escape');
          await sleep(300);
        }
        // quiet for four seconds, and not before the team has said something to this message (or a minute has gone by with nothing at all)
        const settle = async (from) => {
          let quiet = 0;
          let last = -1;
          for (let t = 0; t < 1800 && quiet < 8; t++) {
            await sleep(500);
            const c = await p.locator('.chat-log .msg').count();
            const busy = await p.locator('.narr-bar.on').count();
            const live = await p.locator('.chat-log p.typing').count();
            const answered = (await p.locator('.chat-log .msg:not(.you)').count()) > from || t > 120;
            if (c === last && !busy && !live && answered) quiet++;
            else quiet = 0;
            last = c;
          }
          return last;
        };
        const read = (at) =>
          p.evaluate(
            (at) =>
              [...document.querySelectorAll('.chat-log .msg')]
                .slice(at)
                .filter((el) => !el.classList.contains('you'))
                .map((el) => {
                  const head = el.querySelector('.msg-head');
                  const who = ((head && head.querySelector('strong')) || {}).textContent || '?';
                  const card = el.querySelector('.answer-card');
                  const shown = (x) => x.offsetParent !== null; // what the person is shown: a card stands in place of its words
                  return {
                    who,
                    text:
                      (card && shown(card) ? [card.innerText.replace(/\s+/g, ' ').trim()] : [])
                        .concat(
                          [...el.querySelectorAll('p, .tool-title, .tool-step, li')]
                            .filter((x) => shown(x) && !x.closest('.answer-card'))
                            .map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                        )
                        .filter(Boolean)
                        .join(' / ') || el.innerText.replace(/\s+/g, ' '),
                    links: [...el.querySelectorAll('a[href^="http"]')].map((a) => a.href),
                    tool: !!el.querySelector('.tool-title, .tool-step'),
                  };
                }),
            at,
          );
        let seen = await p.locator('.chat-log .msg').count();
        let got = [];
        const a = Date.now();
        for (const text of s.say) {
          const team0 = await p.locator('.chat-log .msg:not(.you)').count();
          await box.fill(text);
          await box.press('Enter');
          const now = await settle(team0);
          got = await read(seen);
          seen = now;
          row.said.push({ you: text, team: got.map((m) => m.who + ': ' + m.text.slice(0, 1600)) });
        }
        // row.text is what the team said; its notes of what it searched and read repeat the customer's own words, and are not claims
        row.seconds = Math.round((Date.now() - a) / 1000);
        row.replies = got.length;
        row.text = got
          .filter((m) => !m.tool)
          .map((m) => m.text)
          .join('\n');
        row.words = row.text.split(/\s+/).filter(Boolean).length;
        row.links = [...new Set(got.flatMap((m) => m.links))].slice(0, 12);
        row.searched =
          got.some((m) => m.tool) ||
          row.links.length > 0 ||
          /\b(I|we) (searched|looked (it |this |that )?up|found online)\b|according to|sources?:/i.test(row.text);
        row.card = (await p.locator('.answer-card').count())
          ? (await p.locator('.answer-card').last().innerText()).replace(/\s+/g, ' ').trim().slice(0, 300)
          : '';
        row.faces = await p.locator('.chat-log .msg .buddy svg').count();
        row.cardTrace = await p.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}').cardTrace || null;
          } catch {
            return null;
          }
        }); // what the page showed beside the words
        await p.screenshot({ path: path.join(shots, s.id + '-' + n + '.png') });
      } catch (e) {
        row.errors.push(String((e && e.message) || e).slice(0, 200));
      }
      await ctx.close();
      row.misses = judge(s, row);
      row.pass = !row.misses.length;
      rows.push(row);
      fs.appendFileSync(rowsFile, JSON.stringify(row) + '\n');
      console.log(
        s.id.padEnd(18) +
          (row.pass ? 'ok    ' : 'MISS  ') +
          String(row.seconds).padStart(4) +
          ' s, ' +
          row.replies +
          ' repl' +
          (row.replies === 1 ? 'y' : 'ies') +
          ', ' +
          row.words +
          ' words, ' +
          row.links.length +
          ' links' +
          (row.card
            ? ', card: ' + row.card.slice(0, 120)
            : row.cardTrace
              ? ', NO CARD (' +
                row.cardTrace.came +
                '): ' +
                String(row.cardTrace.raw).replace(/\s+/g, ' ').slice(0, 260)
              : '') +
          (row.pass
            ? ''
            : '\n   ' + row.misses.join('\n   ') + '\n   it said: ' + row.text.slice(0, 260).replace(/\n/g, ' ')),
      );
    }
} catch (e) {
  console.log('STOPPED ' + String((e && e.stack) || e).slice(0, 400));
} finally {
  if (browser) await browser.close().catch(() => {});
  await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
  await sleep(800);
  stop();
  await sleep(300);
}

const passed = rows.filter((r) => r.pass).length;
const byCheck = {};
for (const r of rows)
  for (const m of r.misses) {
    const k = m.split(':')[0];
    byCheck[k] = (byCheck[k] || 0) + 1;
  }
const byKind = Object.fromEntries(
  [...new Set(rows.map((r) => r.kind))].map((k) => {
    const mine = rows.filter((r) => r.kind === k);
    return [k, { runs: mine.length, good: mine.filter((r) => r.pass).length }];
  }),
);
console.log(
  '\n' +
    label +
    ', Simple: ' +
    passed +
    ' of ' +
    rows.length +
    ' requests handled as they should be. ' +
    (Object.keys(byCheck).length
      ? 'What missed: ' +
        Object.entries(byCheck)
          .sort((x, y) => y[1] - x[1])
          .map(([k, c]) => k + ' ' + c)
          .join(', ') +
        '. '
      : '') +
    Math.round((Date.now() - t0) / 60000) +
    ' min.',
);
if (rows.length) {
  const out = path.join(HERE, 'results');
  fs.mkdirSync(out, { recursive: true });
  const sum = {
    label,
    mode: 'simple',
    setup,
    at: new Date().toISOString(),
    machine: os.cpus()[0].model + ', ' + Math.round(os.totalmem() / 2 ** 30) + ' GB',
    rounds,
    minutes: Math.round((Date.now() - t0) / 60000),
    note: String(arg('note', '')),
    total: {
      runs: rows.length,
      good: passed,
      falseClaims: rows.filter((r) => r.misses.some((m) => m.startsWith('no-false-claim'))).length,
    },
    byKind,
    byCheck,
    scenarios: rows.map((r) => ({
      id: r.scenario,
      round: r.round,
      pass: r.pass,
      seconds: r.seconds,
      words: r.words,
      links: r.links.length,
      misses: r.misses,
    })),
  };
  fs.writeFileSync(path.join(out, 'simple-' + label + '.json'), JSON.stringify(sum, null, 1) + '\n');
  fs.appendFileSync(
    path.join(out, 'history.jsonl'),
    JSON.stringify({
      label,
      mode: 'simple',
      at: sum.at,
      note: sum.note,
      rounds,
      minutes: sum.minutes,
      total: sum.total,
      byKind,
      byCheck,
      only: only.join(','),
    }) + '\n',
  );
  console.log(
    'Summary: training/results/simple-' +
      label +
      '.json   Every reply: .work/train/simple-runs.jsonl   Pictures: .work/train/simple-shots/',
  );
}
process.exit(0);
