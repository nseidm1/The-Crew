// manners.mjs - DOES THE TEAM TALK THE WAY PEOPLE TALK? Measured on a real team, in a real browser. Made-up people write to the team
// the way people really write: one short and casual, one formal and British, one in a hurry, one with something heavy on their
// mind, one who speaks to a teammate by name. In Developer: an engineer, someone who has never built anything, and someone who
// uses the words of the trade and then says they are no developer. Each reply is read against the conventions of that kind of
// conversation, and every reading is of the words themselves: no model grades another.
//   register   the reply is in the register it was spoken to in: short for short, no slang for formal, their spelling
//   turns      hello is said back once and not again; thanks gets a few words and no new subject; nobody signs off or offers more help
//   room       the room reads as a group chat: nobody repeats a teammate, nobody opens by praising one, the one spoken to answers
//   kind       (Developer) the team works out who it is talking to, and an engineer is not explained things, a beginner not buried in terms
// Every reply is printed, so the voice can be read as well as counted.
//   node training/manners.mjs --mode simple --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
//   node training/manners.mjs --mode developer --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
// Rows go to .work/train/manners-runs.jsonl; the summary to training/results/<label>-manners-<mode>.json and history.jsonl.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { barFor } from './ratchet.mjs';

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
const MODE = arg('mode', 'simple') === 'developer' ? 'developer' : 'simple';
let setup = { mode: MODE, engine: 'claude' };
try {
  if (arg('setup')) setup = { ...JSON.parse(arg('setup')), mode: MODE };
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

// ---- how a reply is read
const wordsOf = (t) =>
  (
    String(t)
      .toLowerCase()
      .match(/[a-zà-ÿ']{3,}/g) || []
  ).filter((w) => w.length > 3);
// the words of a reply: a command or a piece of code in it is not prose, and is not counted
// THE BAR (training/ratchet.mjs): each step it has been raised asks for replies a tenth shorter
const STEP = barFor(label + '-manners-' + MODE);
const cap = (n) => Math.round(n * (1 - 0.1 * STEP));
const count = (t) => {
  const prose = String(t)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' x ')
    .trim();
  return prose ? prose.split(/\s+/).length : 0;
};
const opening = (t, n) => String(t).trim().split(/\s+/).slice(0, n).join(' ');
const shared = (a, b) => {
  const x = new Set(wordsOf(a));
  const y = new Set(wordsOf(b));
  const both = [...x].filter((w) => y.has(w)).length;
  return x.size && y.size ? both / Math.min(x.size, y.size) : 0;
};
const GREETING = /^\W*(hi|hey|heya|hiya|hello|howdy|good (morning|afternoon|evening)|morning)\b/i;
const SLANG = /\b(hey|heya|gonna|wanna|gotta|yeah|yep|nope|nah|awesome|cool|lol|haha+|kinda|sorta|dunno|ya)\b/i;
const STIFF =
  /\b(certainly|i would be (happy|delighted|glad) to|please find|kind regards|furthermore|moreover|in conclusion|i hope this (helps|message finds)|as an ai|thank you for (your|reaching))\b/i;
const SIGN_OFF =
  /\b(let (me|us) know if|feel free to|happy to help|hope (this|that) helps|anything else (i|we) can|don'?t hesitate|is there anything else)\b/i;
const PRAISE =
  /^\W*(great|good|nice|excellent|lovely|fantastic|brilliant|spot on|well said)\b[^.!?]{0,40}\b(answer|point|question|idea|advice|call|shout)\b/i;
const AMERICAN =
  /\b(colors?|favor(ite|ites|s)?|flavors?|neighbors?|organiz(e|ed|es|ing|ation)|realiz(e|ed|es|ing)|recogniz(e|ed|es|ing)|centers?|theaters?|traveling|canceled)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const KIND = /\b(sorry|condolences|so hard|hard time|difficult time|loss|thinking of you|heavy|tough)\b/i;
const JOKES = /\b(haha+|lol|hehe|just kidding)\b|!/i;
const JARGON =
  /\b(repo(sitory)?|branch(es)?|commits?|pull requests?|merge|rebase|ci|pipeline|endpoint|framework|npm|git|docker|staging|refactor|schema|sdk|cli|backend|frontend)\b/gi;
const EXPLAINS_BASICS =
  /\b(ci stands for|a pipeline is|a test is|a repository is|in simple terms|think of it (as|like)|to put it simply|basically,? a)\b/i;
const PEP =
  /\b(great question|good question|don'?t worry|you('ve| have) got this|exciting|no problem at all|happy to help)\b/i;
const EXACT =
  /`[^`]+`|\b[\w/-]+\.(ts|tsx|js|mjs|py|json|ya?ml|spec\.ts)\b|\b(timeout|retry|retries|selector|race|flaky|trace|network|fixture|await)\b/i;
const ASKS_BACK = (t) =>
  !String(t)
    .split(/(?<=[.!?])\s+/)
    .some((x) => !/\?\s*$/.test(x) && x.split(/\s+/).length >= 6); // nothing in it but questions and a word or two
const QUESTION_PRAISE = /^\W*(great|good|excellent|nice|interesting|what an? (great|good|interesting)) question\b/i;
const SAID_BACK =
  /\b(no warm-up|as instructed|i was (told|asked) to|my instructions|the note says|at most \d+ words)\b/i;
const sentences = (t) =>
  String(t)
    .split(/(?<=[.!?])\s+/)
    .map((x) =>
      x
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, '')
        .trim(),
    )
    .filter((x) => x.split(' ').length >= 8);
// what holds for every turn, whoever is writing
const ALWAYS = (r) => ({
  'turns: nobody opens with praise for the question': !r.all.some((m) => QUESTION_PRAISE.test(m.text)),
  'register: nothing the team was told is said back': !SAID_BACK.test(r.text),
  'room: nobody says again a sentence already said in this chat': !r.all.some((m) =>
    sentences(m.text).some((x) => r.earlier.includes(x)),
  ),
});
const NEXT = /\b(next|first|then|you('ll| will) see|press|button|step|start by|to begin)\b/i;

// ---- the people. Each is a fresh chat; `after` reads the replies to that message (first = the first seat to answer, all = every reply)
const PEOPLE = {
  simple: [
    {
      id: 'casual',
      who: 'writes short and casual',
      says: [
        {
          say: 'hey whats a good pasta for tonight',
          after: (r) => ({
            'register: a short casual message gets a short answer (at most 90 words from the first to answer)':
              count(r.first) <= cap(90),
            'register: nothing stiff or form-letter in it': !STIFF.test(r.text),
            'turns: it answers before it asks back': !ASKS_BACK(r.first),
            'turns: hello is said back': GREETING.test(r.first) || /\b(hey|hi|hello)\b/i.test(opening(r.first, 8)),
            'turns: nobody signs off or offers more help': !SIGN_OFF.test(r.text),
            'register: no emoji for someone who uses none': !EMOJI.test(r.text),
          }),
        },
        {
          say: 'and what wine goes with it',
          after: (r) => ({
            'turns: once the chat is going, nobody greets again': !r.all.some((m) => GREETING.test(m.text)),
            'register: still short (at most 90 words)': count(r.first) <= cap(90),
          }),
        },
        {
          say: 'thanks!',
          after: (r) => ({
            'turns: thanks gets a few words (at most 25, from one person)':
              r.all.length === 1 && count(r.first) <= cap(25),
            'turns: and no new question or subject': !/\?/.test(r.first),
          }),
        },
      ],
    },
    {
      id: 'formal',
      who: 'writes formally, in British spelling',
      says: [
        {
          say: 'Good afternoon. I would like to organise a small dinner for twelve colleagues near the theatre district in Manchester next month; could you please advise on how to choose a venue?',
          after: (r) => ({
            'register: no slang for someone who writes formally': !SLANG.test(r.text),
            'register: their spelling is kept (no American forms)': !AMERICAN.test(r.text),
            'turns: nobody signs off or offers more help': !SIGN_OFF.test(r.text),
            'register: no emoji': !EMOJI.test(r.text),
          }),
        },
      ],
    },
    {
      id: 'heavy',
      who: 'has something heavy on their mind',
      says: [
        {
          say: "My dad passed away last week and I have to say a few words at the funeral. I don't know where to start.",
          after: (r) => ({
            'register: a kind word comes first (within the first 30 words)': KIND.test(opening(r.first, 30)),
            'register: and then it helps with what they asked':
              /\b(start|begin|memor\w+|stor(y|ies)|write|jot|speech|eulogy|minutes)\b/i.test(r.text),
            'register: no jokes and no exclamation marks, from anyone': !r.all.some((m) => JOKES.test(m.text)),
            'room: nobody tells them how to feel':
              !/\byou (should|must|need to) (feel|be (strong|happy|grateful))\b/i.test(r.text),
          }),
        },
      ],
    },
    {
      id: 'hurry',
      who: 'is in a hurry',
      says: [
        {
          say: 'quick - how long do I boil an egg for a soft yolk? running late',
          after: (r) => ({
            'register: the answer is in the first sentence':
              /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
                String(r.first).split(/(?<=[.!?])\s/)[0] || '',
              ),
            'register: and it is brief (at most 60 words)': count(r.first) <= cap(60),
            'turns: no greeting to someone in a hurry': !GREETING.test(r.first),
          }),
        },
      ],
    },
    {
      id: 'room',
      who: 'asks something more than one of them has a view on',
      says: [
        {
          say: 'Is it safe to leave my dog in the car for ten minutes while I pop into a shop on a warm day?',
          after: (r) => ({
            'room: nobody repeats a teammate (no two replies share most of their words)': !r.all.some((a, i) =>
              r.all.some((b, j) => j > i && shared(a.text, b.text) > 0.6),
            ),
            'room: nobody opens by praising a teammate': !r.all.slice(1).some((m) => PRAISE.test(m.text)),
            'room: at most three people speak': r.all.length <= 3,
            'room: a second voice joins, with something of its own': r.all.length >= 2,
            'room: the warning is given plainly': /\b(no|not safe|never|don'?t|dangerous|risk)\b/i.test(r.first),
          }),
        },
        {
          say: 'Robin, is ten minutes really enough to hurt a dog?',
          after: (r) => ({
            'room: the one spoken to by name is the one who answers first':
              r.all.length > 0 && r.all[0].who === 'Robin',
            'room: and answers the question that was asked (it is enough: the reply does not open with "No")':
              !/^\W*no\b/i.test(r.first),
          }),
        },
      ],
    },
  ],
  developer: [
    {
      id: 'engineer',
      who: 'is an engineer',
      level: 'seasoned',
      says: [
        {
          say: 'Our CI is flaky: the checkout e2e test in tests/checkout.spec.ts times out one run in five on the staging pipeline. Where would you look first?',
          after: (r) => ({
            'kind: an engineer is not explained the basics': !EXPLAINS_BASICS.test(r.text),
            'kind: and gets no pep talk': !PEP.test(r.text),
            'kind: the answer is exact: a file, a command or a term of the trade': EXACT.test(r.text),
            'turns: no greeting and no sign-off in a team channel':
              !r.all.some((m) => GREETING.test(m.text)) && !SIGN_OFF.test(r.text),
            'register: brief (at most 130 words from the first to answer)': count(r.first) <= cap(130),
          }),
        },
      ],
    },
    {
      id: 'beginner',
      who: 'has never built anything',
      level: 'new',
      says: [
        {
          say: 'I have never made a website before. Is it hard to make one for my bakery, with our opening hours and a few photos?',
          after: (r) => ({
            'kind: a beginner is not buried in the words of the trade (none used)': !(r.text.match(JARGON) || [])
              .length,
            'kind: and is told what happens next': NEXT.test(r.text),
            'kind: nothing is called simple or easy to someone who has not done it':
              !/\b(simply|trivial|it'?s easy|super easy)\b/i.test(r.text),
          }),
        },
      ],
    },
    {
      id: 'says-so',
      who: 'uses the words of the trade, then says they are no developer',
      level: 'new',
      says: [
        {
          say: 'I am not a developer, a friend set up the repo for me. What does "deploy" actually mean for my site?',
          after: (r) => ({
            'kind: nothing is made up: no button or page it was not shown':
              !/\b(click|press|hit|tap) (on )?the ["“']?deploy["”']? button\b/i.test(r.text),
            'kind: the term they asked about is explained in plain words':
              /\b(means|is when|putting|publish|live|online|visitors|people can)\b/i.test(r.text),
            'kind: and no other word of the trade is dropped on them unexplained (at most one besides the two they used)':
              [...new Set((r.text.match(JARGON) || []).map((w) => w.toLowerCase()))].filter((w) => !/^repo/.test(w))
                .length <= 1,
          }),
        },
      ],
    },
  ],
};
const people = PEOPLE[MODE].filter((p) => !arg('only') || String(arg('only')).split(',').includes(p.id));
const turns = people.reduce((n, p) => n + p.says.length, 0);
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: ' +
      turns +
      ' messages, each answered by one to three seats. Add --spend-claude to say so.',
  );
  process.exit(2);
}
const PORT = Number(arg('port', MODE === 'simple' ? 5287 : 5288));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-manners-'));
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
const t0 = Date.now();
const rows = [];
const checks = [];
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
  for (const person of people) {
    // each person is a new browser profile: a chat nobody has written in, and a team that knows nothing of them
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    await ctx.addInitScript((mode) => {
      try {
        localStorage.setItem('familyoffice.mode', mode);
      } catch {
        /* no storage */
      }
    }, MODE);
    const p = await ctx.newPage();
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
    const earlier = []; // every sentence the team has said in this chat
    console.log('\n==== ' + person.id + ': someone who ' + person.who);
    for (const turn of person.says) {
      const from = await p.locator('.chat-log .msg:not(.you)').count();
      const began = Date.now();
      await p.locator('.composer input').fill(turn.say);
      await p.locator('.composer input').press('Enter');
      await settle(from);
      const all = await p.evaluate(
        (at) =>
          [...document.querySelectorAll('.chat-log .msg:not(.you)')]
            .slice(at)
            .map((el) => ({
              who: ((el.querySelector('.msg-head strong') || {}).textContent || '?').trim(),
              said: [...el.querySelectorAll('p')]
                .filter((x) => !x.closest('.answer-card'))
                .map((x) => x.innerText)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim(),
              text: [
                ...[...el.querySelectorAll('p')].map((x) => x.innerText),
                (el.querySelector('.answer-card') || {}).innerText || '',
              ]
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim(),
            }))
            .filter((m) => m.text),
        from,
      );
      const level = await p.evaluate(() => {
        try {
          return ((JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}').dev || {}).level || '') + '';
        } catch {
          return '';
        }
      });
      const read = {
        all,
        earlier,
        first: (all[0] || {}).said || (all[0] || {}).text || '',
        text: all.map((m) => m.text).join('\n'),
      };
      const got = all.length ? { ...turn.after(read), ...ALWAYS(read) } : { 'the team answered': false };
      for (const m of all) earlier.push(...sentences(m.text));
      const chime = await p.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}').chimeTrace || null;
        } catch {
          return null;
        }
      });
      if (person.level)
        got['kind: the team read them as ' + (person.level === 'new' ? 'someone starting out' : 'an engineer')] =
          level === person.level;
      const row = {
        at: new Date().toISOString(),
        mode: MODE,
        person: person.id,
        say: turn.say,
        seconds: Math.round((Date.now() - began) / 1000),
        level,
        replies: all.map((m) => m.who + ': ' + m.text.slice(0, 1200)),
        chime,
        checks: got,
      };
      rows.push(row);
      fs.appendFileSync(path.join(WORK, 'manners-runs.jsonl'), JSON.stringify(row) + '\n');
      console.log('\nYOU: ' + turn.say + '   (' + row.seconds + ' s' + (level ? '; read as ' + level : '') + ')');
      for (const r of row.replies) console.log('  ' + r.slice(0, 800));
      if (chime) console.log('  (who was asked to add something: ' + JSON.stringify(chime).slice(0, 300) + ')');
      for (const [name, ok] of Object.entries(got)) {
        checks.push({ id: person.id + ' / ' + name, ok: !!ok });
        console.log('  ' + (ok ? 'held  ' : 'MISS  ') + name);
      }
    }
    await p.screenshot({ path: path.join(WORK, 'manners-' + MODE + '-' + person.id + '.png'), fullPage: false });
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
const good = checks.filter((c) => c.ok).length;
const minutes = Math.round((Date.now() - t0) / 6000) / 10;
console.log(
  '\n' +
    label +
    ', manners (' +
    MODE +
    '): ' +
    good +
    ' of ' +
    checks.length +
    ' conventions held. ' +
    minutes +
    ' min.' +
    checks
      .filter((c) => !c.ok)
      .map((c) => '\n  MISS ' + c.id)
      .join(''),
);
const out = path.join(HERE, 'results');
fs.mkdirSync(out, { recursive: true });
// a run of some of the people (--only) is a look, not the measurement: it is in the history, and does not replace the full run's file
if (!arg('only'))
  fs.writeFileSync(
    path.join(out, label + '-manners-' + MODE + '.json'),
    JSON.stringify(
      { label, mode: MODE, setup, at: new Date().toISOString(), minutes, good, of: checks.length, checks, rows },
      null,
      1,
    ) + '\n',
  );
fs.appendFileSync(
  path.join(out, 'history.jsonl'),
  JSON.stringify({
    label: label + '-manners-' + MODE,
    at: new Date().toISOString(),
    note: String(arg('note', '')),
    minutes,
    total: { runs: checks.length, good },
    misses: checks.filter((c) => !c.ok).map((c) => c.id),
  }) + '\n',
);
process.exit(checks.length && good === checks.length ? 0 : 1);
