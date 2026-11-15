// soul.mjs - THE SOUL, VISION AND HINDSIGHT, AUDITED. The other two scripts measure whether the team gets a ticket or a request right. This one
// measures whether the team LEARNS from its customer and carries it forward: it plays one continuous story in the real chat, in a real
// browser, in each mode, and after each step reads what the team now holds (its rulings, its lessons, what it recalled, what it graded).
//
//   SOUL       a decision the customer states is kept as a ruling; a newer one on the same subject replaces the older; the team's own
//              recommendations obey it (a branch is named the way the customer said); answers obey it (no longer than they asked for)
//   VISION     what was settled earlier is brought back when it bears on what is asked now, and the answer draws on it
//   HINDSIGHT  each piece of work leaves a record and a lesson; a recalled lesson is graded (was it used); nothing is lost on a reload
//
//   node training/soul.mjs                          both stories on the local model
//   node training/soul.mjs --mode simple            one of them
//   node training/soul.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
//
// Each check is named <system>.<what>, so a run says which of the three systems fell short. Rows go to .work/train/soul-runs.jsonl with
// the whole chat; the summary to training/results/soul-<label>.json and history.jsonl.
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCENARIOS } from './scenarios.mjs';

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
const want = String(arg('mode', 'both'));
const modes = want === 'both' ? ['simple', 'developer'] : [want];
let setup = { model: 'nemotron35-30b' };
try {
  if (arg('setup')) setup = JSON.parse(arg('setup'));
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));
const label = String(
  arg(
    'label',
    claude ? 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : '') : setup.model || 'team',
  ),
).replace(/[^\w.-]+/g, '-');
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: two stories of about ten messages each, two of them changes with proofs. Add --spend-claude to say so.',
  );
  process.exit(2);
}
fs.mkdirSync(WORK, { recursive: true });
const PORT = Number(arg('port', claude ? 5296 : 5295));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const BASE = claude ? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-soul-')) : path.join(WORK, 'soul');
const rowsFile = path.join(WORK, 'soul-runs.jsonl');
const require = createRequire(process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright was not found. Set FO_PLAYWRIGHT to a package.json whose folder has it installed.');
  process.exit(2);
}

// the Developer story's repository: the shop's checkout and its cart, in one Git folder, on main
const by = (id) => SCENARIOS.find((s) => s.id === id);
const PAY = by('pay-button');
const CODE = by('discount-code');
const REPO = path.join(BASE, 'repo', 'shop-app');
function makeRepo() {
  fs.rmSync(path.dirname(REPO), { recursive: true, force: true });
  fs.mkdirSync(REPO, { recursive: true });
  for (const [f, t] of Object.entries({ 'README.md': '# shop-app\n\nThe Harbor Shop.\n', ...PAY.files, ...CODE.files }))
    fs.writeFileSync(path.join(REPO, f), t);
  const g = (...a) =>
    execFileSync('git', a, {
      cwd: REPO,
      env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(REPO, '..', 'no-global'), GIT_CONFIG_NOSYSTEM: '1' },
    }).toString();
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Maya Chen');
  g('config', 'user.email', 'maya@harborshop.example');
  g('add', '-A');
  g('commit', '-q', '-m', 'The shop as it is');
}
const flat = (t) =>
  String(t)
    .replace(/\*\*/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();

const all = [];
const t0 = Date.now();
let browser = null;
for (const mode of modes) {
  const state = path.join(BASE, 'state-' + mode);
  fs.rmSync(state, { recursive: true, force: true });
  fs.mkdirSync(state, { recursive: true });
  if (mode === 'developer') makeRepo();
  try {
    const was = JSON.parse(
      fs.readFileSync(
        path.join(process.env.FO_TRAIN_FROM || path.join(REPO_ROOT, '.work', 'qa-real'), 'state.json'),
        'utf8',
      ),
    );
    const keep = {};
    for (const k of ['tune', 'fit', 'measured']) if (was[k]) keep[k] = was[k];
    fs.writeFileSync(path.join(state, 'state.json'), JSON.stringify(keep));
  } catch {
    /* learned again */
  }
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
    FO_PICK_FOLDER: REPO,
    ...(claude
      ? { FO_CLAUDE_ROOT: path.join(BASE, 'claude'), ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}) }
      : {}),
  };
  if (!claude && !env.FO_PI_CLI) {
    const { piInstalled } = await import(path.join(ROOT, 'runner', 'host.mjs'));
    const pi = await piInstalled(path.join(os.homedir(), '.familyoffice', 'state'));
    if (pi && pi.cli) env.FO_PI_CLI = pi.cli;
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
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  const checks = [];
  const chat = [];
  const check = (id, ok, detail) => {
    checks.push({
      id,
      ok: !!ok,
      detail: ok
        ? ''
        : String(detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400),
    });
    console.log(
      '  ' + (ok ? 'ok    ' : 'MISS  ') + id + (ok ? '' : '   ' + checks[checks.length - 1].detail.slice(0, 260)),
    );
  };
  try {
    await fetch(B + '/api/setup', { method: 'POST', headers: J, body: JSON.stringify({ ...setup, mode }) });
    let v;
    for (;;) {
      await sleep(2000);
      v = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
      if (!v.busy) break;
    }
    if (!v.setup || !v.setup.done)
      throw new Error('set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 200));
    console.log('\n=== ' + mode.toUpperCase() + ' on ' + label + ' ===');
    browser = browser || (await chromium.launch());
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((m) => {
      try {
        if (!localStorage.getItem('familyoffice.mode')) localStorage.setItem('familyoffice.mode', m);
      } catch {
        /* no storage */
      }
    }, mode);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const dismiss = async () => {
      if (await p.locator('dialog.step-done[open]').count()) {
        await p.keyboard.press('Escape');
        await sleep(350);
      }
    };
    await p.goto(B + '/start.html', { waitUntil: 'load' });
    await p.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
    if (await p.locator('#resume-go').count()) {
      await p.locator('#resume-go').click();
      await p.locator('#meet').waitFor({ timeout: 20000 });
    }
    await p.locator('#meet').click();
    await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 30000 });
    await sleep(900);
    await dismiss();
    if (mode === 'developer') {
      await p.evaluate(() => {
        location.hash = '#workspace';
      });
      await p.locator('#ws-folder').waitFor({ timeout: 20000 });
      await p.locator('#ws-folder').click();
      await p.locator('#ws-folder-path').waitFor({ timeout: 30000 });
      await sleep(800);
      await dismiss();
      await p.evaluate(() => {
        location.hash = '#chat';
      });
      await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 20000 });
      await sleep(800);
      await dismiss();
    }
    const box = () => p.locator('.composer :is(input, textarea)');
    const settle = async (max = 2400) => {
      let quiet = 0;
      let last = -1;
      for (let t = 0; t < max && quiet < 8; t++) {
        await sleep(500);
        const c = await p.locator('.chat-log .msg').count();
        const busy = await p.locator('.narr-bar.on').count();
        const live = await p.locator('.chat-log p.typing').count();
        if (c === last && !busy && !live) quiet++;
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
              return {
                who: ((head && head.querySelector('strong')) || {}).textContent || '?',
                vis: head && head.querySelector('.vis') ? head.querySelector('.vis').textContent : '',
                text:
                  [...el.querySelectorAll('p, .tool-title, .tool-step, li')]
                    .map((x) => x.innerText.replace(/\s+/g, ' ').trim())
                    .filter(Boolean)
                    .join(' / ') || el.innerText.replace(/\s+/g, ' '),
                proof: !!el.querySelector('.chat-proof img'),
              };
            }),
        at,
      );
    const soul = () =>
      p.evaluate(() => {
        try {
          const s = JSON.parse(localStorage.getItem('familyoffice.core.v1') || 'null') || {};
          return {
            rulings: (s.rulings || []).filter((r) => !r.superseded).map((r) => ({ kind: r.kind, text: r.text })),
            all: (s.rulings || []).length,
            lessons: ((s.learning && s.learning.ledger) || []).map((x) => ({
              kind: x.kind,
              text: x.text,
              shown: x.shown || 0,
              used: x.used || 0,
            })),
            episodes: (s.episodes || []).map((e) => ({ kind: e.kind, title: e.title, shown: e.shown, kept: e.kept })),
            proofs: (s.proofs || []).length,
            ways: s.ways || null,
            prefix: s.branchPrefix || '',
            chat: (s.chat || []).length,
          };
        } catch (e) {
          return { error: String(e) };
        }
      });
    let seen = await p.locator('.chat-log .msg').count();
    const tell = async (text, o = {}) => {
      const a = Date.now();
      await box().fill(text);
      await box().press('Enter');
      if (o.until) {
        let still = 0;
        let n0 = -1;
        for (const t1 = Date.now(); Date.now() - t1 < (o.ms || 20 * 60000) && still < 60;) {
          await sleep(1500);
          if (o.until.test((await read(seen)).map((m) => m.text).join('\n'))) break;
          const c = await p.locator('.chat-log .msg').count();
          const busyNow = (await p.locator('.narr-bar.on').count()) + (await p.locator('.chat-log p.typing').count());
          if (c === n0 && !busyNow) still++;
          else still = 0;
          n0 = c;
        }
      }
      const now = await settle();
      const got = await read(seen);
      seen = now;
      chat.push({
        you: text,
        seconds: Math.round((Date.now() - a) / 1000),
        team: got.map((m) => m.who + (m.vis ? ' [' + m.vis + ']' : '') + ': ' + m.text.slice(0, 1200)),
      });
      console.log(
        ' you: ' +
          text.slice(0, 110) +
          (text.length > 110 ? '...' : '') +
          '   (' +
          Math.round((Date.now() - a) / 1000) +
          ' s, ' +
          got.length +
          ' repl' +
          (got.length === 1 ? 'y' : 'ies') +
          ')',
      );
      return { got, text: got.map((m) => m.text).join('\n'), vis: got.some((m) => /\d/.test(m.vis)) };
    };
    const sentences = (t) =>
      (
        String(t)
          .replace(/\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr)\./gi, '$1')
          .match(/[.!?]+(\s|$)/g) || []
      ).length;
    const inForce = (st, re) => st.rulings.filter((r) => re.test(r.kind + ' ' + r.text));

    if (mode === 'simple') {
      const a = await tell('Please call me Dana, and keep every answer to three sentences at most.');
      const s1 = await soul();
      check(
        'soul.a-stated-decision-is-kept-as-a-ruling',
        inForce(s1, /Dana/).length === 1 && inForce(s1, /three sentences/i).length === 1,
        s1.rulings,
      );
      check(
        'soul.it-is-acknowledged-in-one-short-reply',
        a.got.length === 1 && a.text.split(/\s+/).length <= 50 && /Dana/.test(a.text),
        a.text,
      );
      const b = await tell('What is the difference between a virus and a bacteria?');
      check(
        'soul.an-answer-obeys-the-ruling',
        b.got.length >= 1 && b.got.every((m) => sentences(m.text) <= 3),
        b.got.map((m) => sentences(m.text) + ' sentences: ' + m.text.slice(0, 160)),
      );
      const e0 = (await soul()).episodes.length;
      const c = await tell('Write a two-line birthday message for my brother Tom');
      const s3 = await soul();
      check('hindsight.a-piece-of-work-leaves-a-record', s3.episodes.length === e0 + 1 && /Tom/.test(c.text), [
        s3.episodes.slice(0, 2),
        c.text.slice(0, 200),
      ]);
      await tell('Can you make it funnier?');
      const s4 = await soul();
      check(
        'soul.how-they-like-things-is-kept',
        inForce(s4, /likes-|funnier/i).length >= 1 && s4.lessons.some((x) => /likes|funnier|lighter/i.test(x.text)),
        [s4.rulings, s4.lessons.slice(0, 3)],
      );
      check(
        'soul.the-earlier-rulings-still-stand',
        inForce(s4, /Dana/).length === 1 && inForce(s4, /three sentences/i).length === 1,
        s4.rulings,
      );
      const d = await tell('What did you write for my brother, and what is his name?');
      check('vision.what-was-done-earlier-is-recalled', /Tom/.test(d.text), d.text.slice(0, 300));
      await tell('Remember that my sister Priya is allergic to peanuts.');
      const s5 = await soul();
      check(
        'soul.a-thing-told-is-kept-for-recall',
        s5.lessons.some((x) => /Priya/.test(x.text) && /peanut/i.test(x.text)),
        s5.lessons.slice(0, 3),
      );
      const f = await tell('I am baking a cake for my sister this weekend. Anything I should watch out for?');
      const s6 = await soul();
      check('vision.a-thing-told-comes-back-when-it-matters', /peanut|allerg/i.test(f.text), f.text.slice(0, 300));
      check(
        'hindsight.a-recalled-lesson-is-graded',
        s6.lessons.some((x) => /Priya/.test(x.text) && x.shown >= 1),
        s6.lessons.filter((x) => /Priya/.test(x.text)),
      );
      await tell('From now on, call me Dee.');
      const s7 = await soul();
      check(
        'soul.the-newest-wording-wins',
        inForce(s7, /Dee/).length === 1 &&
          inForce(s7, /Dana/).length === 0 &&
          inForce(s7, /three sentences/i).length === 1,
        s7.rulings,
      );
      const g = await tell('hello');
      check('soul.the-new-ruling-is-used', /Dee/.test(g.text) && !/Dana/.test(g.text), g.text.slice(0, 200));
      const before = await soul();
      await p.reload({ waitUntil: 'load' });
      await box().waitFor({ timeout: 30000 });
      await sleep(1200);
      const after = await soul();
      check(
        'hindsight.nothing-is-lost-on-a-reload',
        after.rulings.length === before.rulings.length &&
          after.lessons.length === before.lessons.length &&
          after.episodes.length === before.episodes.length &&
          after.chat === before.chat,
        [before.rulings.length, after.rulings.length, before.lessons.length, after.lessons.length],
      );
    } else {
      const a = await tell('From now on, name every branch team/<short name>, and never push without asking me.');
      const s1 = await soul();
      check(
        'soul.a-stated-decision-is-kept-as-a-ruling',
        inForce(s1, /standing-branch/).length === 1 &&
          inForce(s1, /standing-push/).length === 1 &&
          s1.prefix === 'team',
        [s1.rulings, s1.prefix],
      );
      check('soul.it-is-acknowledged-in-one-short-reply', a.got.length === 1 && /Kept/.test(a.text), a.text);
      const b = await tell('Fix the Pay button: it is cut off on small phones. ' + flat(PAY.ticket), {
        until: /Say yes|say "go"|Say "go"|Proven\.|Not proven|could not/i,
      });
      check(
        'soul.the-team-looks-in-the-code-before-asking',
        b.got.some((m) => /I looked in shop-app/.test(m.text) && /checkout\.py|pay_button_width/.test(m.text)),
        b.got.map((m) => m.who + ': ' + m.text.slice(0, 120)),
      );
      check(
        'soul.its-own-recommendation-obeys-the-ruling',
        /team\/[\w-]*pay/i.test(b.text),
        b.text.match(/\b[\w-]+\/[\w-]*pay[\w-]*/gi) || ['no branch named: ' + b.text.slice(-300)],
      );
      check(
        'soul.it-does-not-ask-what-the-code-says',
        !(b.text.match(/[^.?!\n]*\?/g) || []).some((q) =>
          /how wide|what (is|are) the (current|existing)|current width|which file|where is/i.test(q),
        ),
        (b.text.match(/[^.?!\n]*\?/g) || []).slice(0, 4),
      );
      const p0 = (await soul()).proofs;
      const e0 = (await soul()).episodes.length;
      const c = /Proven\./.test(b.text)
        ? b
        : await tell('go', { until: /Proven\.|Not proven|could not|not be finished/i, ms: 25 * 60000 });
      const s2 = await soul();
      check('flow.the-change-is-proven', /Proven\./.test(c.text) || /Proven\./.test(b.text), c.text.slice(-300));
      check(
        'soul.the-branch-is-named-as-ruled',
        /team\/[\w-]*pay/i.test(c.text + b.text) && !/pushed to|I pushed/i.test(c.text),
        (c.text.match(/branch [\w/.-]+/g) || []).slice(0, 3),
      );
      check('hindsight.a-piece-of-work-leaves-a-record', s2.episodes.length > e0 && s2.proofs > p0, [
        'episodes ' + e0 + ' to ' + s2.episodes.length,
        'proofs ' + p0 + ' to ' + s2.proofs,
      ]);
      check(
        'hindsight.what-was-settled-is-kept-as-a-lesson',
        s2.lessons.some((x) => /Pay button|pay_button|source control|branch/i.test(x.text)),
        s2.lessons.slice(0, 4),
      );
      if (!/Landed/i.test(c.text)) await tell('land it', { until: /Landed|could not|nothing/i, ms: 5 * 60000 });
      const d = await tell('Fix the discount codes: an unknown code crashes the checkout. ' + flat(CODE.ticket), {
        until: /Say yes|say "go"|Say "go"|Proven\.|Not proven|could not/i,
      });
      check(
        'soul.the-ruling-holds-for-the-next-change',
        /team\/[\w-]*discount/i.test(d.text),
        d.text.match(/\b[\w-]+\/[\w-]*discount[\w-]*/gi) || ['no branch named'],
      );
      const e = /Proven\./.test(d.text)
        ? d
        : await tell('go', { until: /Proven\.|Not proven|could not|not be finished/i, ms: 25 * 60000 });
      const s3 = await soul();
      check('flow.the-second-change-is-proven', /Proven\./.test(e.text) || /Proven\./.test(d.text), e.text.slice(-300));
      check(
        'vision.the-second-round-was-shown-what-the-first-settled',
        d.vis || e.vis || s3.lessons.some((x) => x.shown >= 1),
        s3.lessons.slice(0, 4),
      );
      if (!/Landed/i.test(e.text)) await tell('land it', { until: /Landed|could not|nothing/i, ms: 5 * 60000 });
      const f = await tell('What did we change for the Pay button, and how was it proven?');
      const s4 = await soul();
      check(
        'vision.what-was-done-earlier-is-recalled',
        /pay_button_width|checkout\.py|margin|328|16 px/i.test(f.text),
        f.text.slice(0, 300),
      );
      check(
        'hindsight.a-recalled-lesson-is-graded',
        s4.lessons.some((x) => x.shown >= 1),
        s4.lessons.map((x) => x.shown + '/' + x.used + ' ' + x.text.slice(0, 60)).slice(0, 5),
      );
      await p.evaluate(() => {
        location.hash = '#learning';
      });
      await sleep(1200);
      const page = (await p.locator('#view').innerText()).replace(/\s+/g, ' ');
      check(
        'soul.the-soul-page-shows-what-is-held',
        /team\//.test(page) && /Rulings in force/i.test(page) && /Hindsight/.test(page) && /Pay button/i.test(page),
        page.slice(0, 400),
      );
      await p.evaluate(() => {
        location.hash = '#chat';
      });
      await box().waitFor({ timeout: 20000 });
      await sleep(600);
      await tell('From now on, name every branch work/<short name>.');
      const s5 = await soul();
      check(
        'soul.the-newest-wording-wins',
        inForce(s5, /standing-branch/).length === 1 &&
          /work\//.test(inForce(s5, /standing-branch/)[0].text) &&
          s5.prefix === 'work' &&
          inForce(s5, /standing-push/).length === 1,
        [s5.rulings, s5.prefix],
      );
      const before = await soul();
      await p.reload({ waitUntil: 'load' });
      await box().waitFor({ timeout: 30000 });
      await sleep(1200);
      const after = await soul();
      check(
        'hindsight.nothing-is-lost-on-a-reload',
        after.rulings.length === before.rulings.length &&
          after.lessons.length === before.lessons.length &&
          after.episodes.length === before.episodes.length &&
          after.proofs === before.proofs,
        [before, after].map((x) => [x.rulings.length, x.lessons.length, x.episodes.length, x.proofs]),
      );
    }
    check('flow.no-page-errors', !errors.length, errors.slice(0, 3));
    const end = await soul();
    await p.screenshot({ path: path.join(WORK, 'soul-' + mode + '-' + label + '.png') });
    await ctx.close();
    all.push({ mode, checks, chat, soul: end });
  } catch (e) {
    console.log('STOPPED ' + String((e && e.stack) || e).slice(0, 400));
    all.push({ mode, checks, chat, stopped: String((e && e.message) || e).slice(0, 300) });
  } finally {
    await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
    await sleep(800);
    stop();
    await sleep(600);
  }
}
if (browser) await browser.close().catch(() => {});

const flatChecks = all.flatMap((x) => x.checks.map((c) => ({ mode: x.mode, ...c })));
const bySystem = {};
for (const c of flatChecks) {
  const k = c.id.split('.')[0];
  bySystem[k] = bySystem[k] || { checks: 0, good: 0 };
  bySystem[k].checks++;
  if (c.ok) bySystem[k].good++;
}
console.log(
  '\n' +
    label +
    ': ' +
    flatChecks.filter((c) => c.ok).length +
    ' of ' +
    flatChecks.length +
    ' checks held. ' +
    Object.entries(bySystem)
      .map(([k, v]) => k + ' ' + v.good + '/' + v.checks)
      .join(', ') +
    '. ' +
    Math.round((Date.now() - t0) / 60000) +
    ' min.',
);
for (const c of flatChecks.filter((x) => !x.ok)) console.log('  MISS ' + c.mode + ' ' + c.id);
fs.appendFileSync(rowsFile, JSON.stringify({ at: new Date().toISOString(), label, stories: all }) + '\n');
const out = path.join(HERE, 'results');
fs.mkdirSync(out, { recursive: true });
const sum = {
  label,
  kind: 'soul',
  setup,
  at: new Date().toISOString(),
  minutes: Math.round((Date.now() - t0) / 60000),
  note: String(arg('note', '')),
  total: { checks: flatChecks.length, good: flatChecks.filter((c) => c.ok).length },
  bySystem,
  misses: flatChecks.filter((c) => !c.ok).map((c) => ({ mode: c.mode, id: c.id, detail: c.detail })),
  stopped: all.filter((x) => x.stopped).map((x) => x.mode + ': ' + x.stopped),
};
fs.writeFileSync(path.join(out, 'soul-' + label + '.json'), JSON.stringify(sum, null, 1) + '\n');
fs.appendFileSync(
  path.join(out, 'history.jsonl'),
  JSON.stringify({
    label,
    kind: 'soul',
    at: sum.at,
    note: sum.note,
    minutes: sum.minutes,
    total: sum.total,
    bySystem,
    misses: sum.misses.map((m) => m.mode + ' ' + m.id),
  }) + '\n',
);
console.log(
  'Summary: training/results/soul-' + label + '.json   The whole chat of each story: .work/train/soul-runs.jsonl',
);
process.exit(0);
