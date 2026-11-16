// discuss.mjs - DOES THE TEAM TALK AN IDEA THROUGH, OR RUSH TO BUILD IT? Found with a real person (2026-11-16): someone who has never
// built anything was talking an app idea over with the team, and the team went straight into planning to build it when she wanted to
// keep discussing it. A team that works for people of every skill has to tell the two apart: someone thinking an idea through is
// talked with, and someone who says "build it" is built for. And an app has to run on something, so a team that is going to build one
// asks what on (a phone, iPhone or Android; a computer; a website) when nobody has said.
// Measured on a real team, in a real browser, a fresh chat for each conversation. Each turn is read off the words and the page:
//   talks      while they are thinking it through, no work is started: no plan card, no round of work, no questions-before-building
//   platform   before the conversation ends, the team has asked what it should run on (where nobody said)
//   one        no reply buries them: at most two questions in a reply
//   plain      (someone new) no reply uses the words of the trade
//   builds     when they say to start, or an engineer asks for it outright, work starts
//   no-redundant  an engineer who named the platform is not asked it again
// Some conversations are HELD OUT (held: true): nothing in the product is written with their words in mind, and they are reported
// apart, so that teaching to the list cannot pass for getting better.
//   node training/discuss.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
//   node training/discuss.mjs --only amateur-simple,engineer-named
// Rows go to .work/train/discuss-runs.jsonl; the summary to training/results/discuss-<label>.json and history.jsonl.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tradeIn } from '../src/js/team/host.js';

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
let setup = { engine: 'claude' };
try {
  if (arg('setup')) setup = JSON.parse(arg('setup'));
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));

// THE CONVERSATIONS. say: the person's messages in order; each is marked with what the team should do with it: 'talk' (they are
// thinking it through: no work), or 'build' (they asked for it: work starts). level: who they are. platform: whether they named what it
// runs on (where they did not, the team should ask before the conversation ends).
export const CONVERSATIONS = [
  {
    id: 'amateur-simple',
    mode: 'simple',
    level: 'new',
    platform: false,
    say: [
      ['talk', "Hi! My friend and I have been dreaming up an app idea and I'd love to talk it through with you."],
      [
        'talk',
        'I want to make an app where parents can swap the clothes their kids have outgrown with other families nearby.',
      ],
      ['talk', "What do you think? Would people actually use something like that? I'm not a tech person at all."],
    ],
  },
  {
    id: 'amateur-developer',
    mode: 'developer',
    level: 'new',
    platform: false,
    say: [
      ['talk', "I've never built anything before, but I have an idea for an app and wanted to chat about it first."],
      [
        'talk',
        'Make an app that reminds people to water their plants, with a little picture of each plant and how thirsty it is.',
      ],
      ['talk', 'Do you think that would be hard? I keep going back and forth on what it should look like.'],
      ['build', "Okay, I think I'm ready now. Let's start building it!"],
    ],
  },
  {
    id: 'amateur-developer-2',
    held: true,
    mode: 'developer',
    level: 'new',
    platform: false,
    say: [
      [
        'talk',
        "So I'm a total beginner, but my book club keeps losing track of who's reading what. Could there be an app for that?",
      ],
      [
        'talk',
        "Something where everyone sees the book of the month, votes on the next one, and leaves little notes. I'm just thinking out loud.",
      ],
      ['talk', 'Is that the kind of thing you could help with someday?'],
    ],
  },
  {
    id: 'amateur-simple-2',
    held: true,
    mode: 'simple',
    level: 'new',
    platform: false,
    say: [
      [
        'talk',
        "Build me an app for my bakery? I'm not sure yet what it should do, maybe orders, maybe just the menu. What do you all think?",
      ],
      ['talk', "I don't really know how apps work, I just know my customers keep calling to ask what's fresh today."],
    ],
  },
  {
    id: 'engineer-named',
    mode: 'developer',
    level: 'seasoned',
    platform: true,
    say: [
      [
        'build',
        "I'm a mobile engineer. Build a habit tracker in React Native with Expo for iOS and Android: a daily streak per habit, stored locally with AsyncStorage.",
      ],
    ],
  },
  {
    id: 'engineer-unnamed',
    mode: 'developer',
    level: 'seasoned',
    platform: false,
    say: [
      [
        'build',
        'Build a habit tracker app: a daily streak per habit, stored locally, with a reminder notification at 8pm.',
      ],
    ],
  },
];

// WHAT IS READ OFF A REPLY
// what it runs on, named
export const PLATFORM =
  /\b(i ?phones?|ios|android|ipads?|tablets?|phones?|mobile|computers?|desktops?|laptops?|mac(book|os)?|windows|web ?sites?|web ?apps?|browsers?|on the web)\b/i;
// asked about: a sentence that ends in a question mark and names one of them (or asks the question in words)
export const asksPlatform = (text) =>
  String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .some(
      (s) =>
        /\?\s*$/.test(s) &&
        (PLATFORM.test(s) ||
          /\b(what|which) (should it|would it|do you want it to|will it) run on\b|\bbuild (it )?on\b/i.test(s)),
    );
// the words of a round of work starting (Simple's "who does what", Developer's requirements and plan)
export const WORK_WORDS =
  /\b(alex writes it|robin checks it|pat hands over|the requirements|requirements are|operations makes the change|the steward proves it|master lands it|before (we|i) build|before building|the plan card|round 1)\b/i;
export const WORK_DOING =
  /working out who does what|reading what (it|the ticket) must do|weighing the questions|looking in |working on it|putting the final version together/i;
export const questionsIn = (text) => (String(text || '').match(/\?(?=\s|$)/g) || []).length;

// one conversation's verdicts, from what each turn left: [{ want, text, worked, busy }]
export function verdict(conv, turns) {
  const out = {};
  const talkTurns = turns.filter((t) => t.want === 'talk');
  const buildTurns = turns.filter((t) => t.want === 'build');
  if (talkTurns.length) out.talks = talkTurns.every((t) => !t.worked);
  if (talkTurns.length && !conv.platform) out.platform = talkTurns.some((t) => asksPlatform(t.text));
  out.one = turns.filter((t) => t.want === 'talk').every((t) => t.replies.every((r) => questionsIn(r) <= 2));
  if (conv.level === 'new') out.plain = talkTurns.every((t) => tradeIn(t.text).length === 0);
  if (buildTurns.length) out.builds = buildTurns.every((t) => t.worked);
  if (conv.platform) out['no-redundant'] = !turns.some((t) => asksPlatform(t.text));
  if (!conv.platform && !talkTurns.length) out.platform = buildTurns.some((t) => asksPlatform(t.text));
  return out;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  if (has('check')) {
    // the readers, against replies whose verdict is known: no model, no browser
    const cases = [
      [asksPlatform('Love it. Should it be an app for phones (iPhone, Android) or a website?'), true],
      [asksPlatform('What would you want to build it on?'), true],
      [asksPlatform('Who is it for? Parents nearby, I guess.'), false],
      [asksPlatform('It could work on phones. What would you call it?'), false],
      [WORK_WORDS.test('Alex writes it, Robin checks it, and Pat hands over the final version.'), true],
      [WORK_WORDS.test('That sounds like a lovely idea. Who would use it most?'), false],
      [questionsIn('Nice! Who is it for? Where would they find it? And what would it cost?') === 3, true],
      [tradeIn('We could use React and an API with a schema.').length >= 2, true],
      [tradeIn('People could post a photo of the clothes and a size.').length === 0, true],
    ];
    const bad = cases.map(([got, want], i) => (got === want ? -1 : i)).filter((i) => i >= 0);
    console.log(
      bad.length
        ? 'The readers misread cases ' + bad.join(', ') + '.'
        : 'The readers read all ' + cases.length + ' cases right.',
    );
    process.exit(bad.length ? 1 : 0);
  }
  const only = String(arg('only', '')).split(',').filter(Boolean);
  const list = CONVERSATIONS.filter((c) => !only.length || only.includes(c.id));
  if (claude && !has('spend-claude')) {
    console.log(
      'A run on Claude Code spends your own Claude plan: ' +
        list.reduce((n, c) => n + c.say.length, 0) +
        ' messages in ' +
        list.length +
        ' conversations. Add --spend-claude to say so.',
    );
    process.exit(2);
  }
  const PORT = Number(arg('port', 5293));
  const B = 'http://127.0.0.1:' + PORT;
  const J = { 'content-type': 'application/json' };
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-discuss-'));
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
  const label = claude
    ? 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : '')
    : setup.model || 'team';
  const results = [];
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
    for (const conv of list) {
      // a fresh chat for each conversation: one cannot lean on another
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await ctx.addInitScript((mode) => {
        try {
          if (!sessionStorage.getItem('fo-discuss')) {
            for (const k of Object.keys(localStorage))
              if (k.startsWith('familyoffice.core')) localStorage.removeItem(k);
            sessionStorage.setItem('fo-discuss', '1');
          }
          localStorage.setItem('familyoffice.mode', mode);
        } catch {
          /* no storage */
        }
      }, conv.mode);
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
      const turns = [];
      for (const [want, text] of conv.say) {
        const from = await p.locator('.chat-log .msg:not(.you)').count();
        const cardsBefore = await p.locator('.chat-log .round-card').count();
        const t0 = Date.now();
        await p.locator('.composer :is(input, textarea)').fill(text);
        await p.locator('.composer :is(input, textarea)').press('Enter');
        // wait for the team to finish, keeping every busy line it showed meanwhile
        const busy = new Set();
        let quiet = 0;
        let last = -1;
        for (let t = 0; t < 720 && quiet < 8; t++) {
          await sleep(500);
          const c = await p.locator('.chat-log .msg').count();
          const on = await p.locator('.narr-bar.on').count();
          if (on)
            busy.add(
              (
                (await p
                  .locator('.narr-bar.on')
                  .first()
                  .innerText()
                  .catch(() => '')) || ''
              )
                .replace(/\s+/g, ' ')
                .trim(),
            );
          const live = await p.locator('.chat-log p.typing').count();
          const answered = (await p.locator('.chat-log .msg:not(.you)').count()) > from || t > 120;
          if (c === last && !on && !live && answered) quiet++;
          else quiet = 0;
          last = c;
        }
        const replies = await p.evaluate(
          (at) =>
            [...document.querySelectorAll('.chat-log .msg:not(.you)')]
              .slice(at)
              .map((el) => [...el.querySelectorAll('p')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' ')),
          from,
        );
        const who = await p.evaluate(
          (at) =>
            [...document.querySelectorAll('.chat-log .msg:not(.you)')]
              .slice(at)
              .map((el) => (el.querySelector('.msg-head strong') || {}).textContent || '?'),
          from,
        );
        const cards = (await p.locator('.chat-log .round-card').count()) - cardsBefore;
        const all = replies.join('\n');
        const busyText = [...busy].join(' | ');
        const worked = cards > 0 || WORK_WORDS.test(all) || WORK_DOING.test(busyText);
        turns.push({
          want,
          say: text,
          replies,
          who,
          text: all,
          worked,
          cards,
          busy: busyText,
          seconds: Math.round((Date.now() - t0) / 1000),
        });
        console.log(
          '  ' +
            (want === 'talk' ? (worked ? 'RUSHED' : 'talked') : worked ? 'built ' : 'NO WORK') +
            '  ' +
            String(Math.round((Date.now() - t0) / 1000)).padStart(3) +
            ' s  ' +
            text.slice(0, 60).padEnd(60) +
            ' -> ' +
            who
              .map((w, i) => w + ': ' + replies[i])
              .join(' / ')
              .replace(/\s+/g, ' ')
              .slice(0, 260),
        );
        if (want === 'build' && worked) break; // work started: the next turns would be about the work, not this
      }
      const v2 = verdict(conv, turns);
      const pass = Object.values(v2).every(Boolean);
      const row = {
        at: new Date().toISOString(),
        label,
        id: conv.id,
        mode: conv.mode,
        level: conv.level,
        held: !!conv.held,
        verdict: v2,
        pass,
        turns,
      };
      results.push(row);
      fs.appendFileSync(path.join(WORK, 'discuss-runs.jsonl'), JSON.stringify(row) + '\n');
      console.log(
        (pass ? 'ok    ' : 'MISS  ') +
          conv.id +
          (conv.held ? ' (held out)' : '') +
          '  ' +
          Object.entries(v2)
            .map(([k, x]) => (x ? k : k.toUpperCase() + ' FAILED'))
            .join(', '),
      );
      await ctx.close();
    }
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
  const tally = (rs) => ({ passed: rs.filter((r) => r.pass).length, of: rs.length });
  const checks = {};
  for (const r of results)
    for (const [k, x] of Object.entries(r.verdict)) {
      checks[k] = checks[k] || { passed: 0, of: 0 };
      checks[k].of++;
      if (x) checks[k].passed++;
    }
  const summary = {
    at: new Date().toISOString(),
    trainer: 'discuss',
    label,
    all: tally(results),
    taught: tally(results.filter((r) => !r.held)),
    heldOut: tally(results.filter((r) => r.held)),
    checks,
  };
  fs.mkdirSync(path.join(REPO_ROOT, 'training', 'results'), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, 'training', 'results', 'discuss-' + label + '.json'),
    JSON.stringify({ ...summary, runs: results }, null, 2) + '\n',
  );
  fs.appendFileSync(path.join(REPO_ROOT, 'training', 'results', 'history.jsonl'), JSON.stringify(summary) + '\n');
  console.log(
    '\n' +
      summary.all.passed +
      ' of ' +
      summary.all.of +
      ' conversations went as they should (taught ' +
      summary.taught.passed +
      '/' +
      summary.taught.of +
      ', held out ' +
      summary.heldOut.passed +
      '/' +
      summary.heldOut.of +
      '). ' +
      Object.entries(checks)
        .map(([k, c]) => k + ' ' + c.passed + '/' + c.of)
        .join(', '),
  );
  process.exit(results.length && results.every((r) => r.pass) ? 0 : 1);
}
