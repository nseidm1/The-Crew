// voices.mjs - FIVE SEATS, FIVE VOICES? One model sits in all five seats, so the team is only a team if the seats do not all say the same
// thing. This asks every seat the same question, in Simple and in Developer, through the route the chat itself speaks through
// (/api/seat, with the seat's own system line from js/team-soul.js), and measures three things:
//   differ    no two seats gave the same answer: the words two answers share, over the words either used, stays under 0.6
//   tell      a reader who is shown the five answers unnamed, and what each seat is like, puts the right name to at least three of them
//             (by chance it would be one). The reader is the team's own model, asked coldly.
//   plain     (Simple) no seat used a developer's word; (Developer) each answer keeps to its length
// And, for the room (runner/swarm.mjs): given one stuck problem, the seats do not all offer the same idea.
//   node training/voices.mjs                                      the local model
//   node training/voices.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
// Rows go to .work/train/voices.jsonl; the summary to training/results/<label>-voices.json and history.jsonl.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { FRIENDLY, SEATS } from '../src/js/team-core.js';
import { soulOf, TEMPER } from '../src/js/team-soul.js';
import { askRoom, tally } from '../src/runner/swarm.mjs';

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
    'A run on Claude Code spends your own Claude plan: about thirty short replies. Add --spend-claude to say so.',
  );
  process.exit(2);
}
fs.mkdirSync(WORK, { recursive: true });
const PORT = Number(arg('port', claude ? 5298 : 5297));
const B = 'http://127.0.0.1:' + PORT;
const J = { 'content-type': 'application/json' };
const BASE = claude ? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-voices-')) : path.join(WORK, 'voices');
const state = path.join(BASE, 'state');
fs.rmSync(state, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
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
  /* learned again during set-up */
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

// one reply of a seat, through the chat's own route: the pieces of the stream put together (a reset replaces what came before it)
async function speak({ seat, system, prompt, max = 260 }) {
  const res = await fetch(B + '/api/seat', {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ seat, system, max, messages: [{ role: 'user', content: prompt }] }),
  });
  const raw = await res.text();
  let text = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    let ev;
    try {
      ev = JSON.parse(line.slice(5));
    } catch {
      continue;
    }
    if (typeof ev.reset === 'string') text = ev.reset;
    else if (ev.reset === true) text = '';
    if (typeof ev.text === 'string') text += ev.text;
    if (ev.error) text += ' [' + ev.error + ']';
  }
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}
const words = (t) =>
  new Set(
    String(t)
      .toLowerCase()
      .match(/[a-z']{3,}/g) || [],
  );
const SMALL = new Set(
  'the and for you your that with this are not but have has was will would can could should from they them what when where which who how its our out one two all any more most some than then also just into over very about there their been being were had did does make made take get got like want need first'.split(
    ' ',
  ),
);
const overlap = (a, b) => {
  const x = [...words(a)].filter((w) => !SMALL.has(w));
  const y = new Set([...words(b)].filter((w) => !SMALL.has(w)));
  const both = x.filter((w) => y.has(w)).length;
  const either = new Set([...x, ...y]).size;
  return either ? both / either : 1;
};
const DEV =
  /\b(code|repo|repository|commit|branch|pull request|unit test|function|deploy|API|backend|frontend|judge|proof|red before green|merge)\b/i;
const ASKS = {
  simple: 'I have a free Saturday and no plans at all. What would you do with it?',
  developer: 'Our checkout page feels slow on phones. What is the first thing you would do about it?',
};
const STUCK = {
  task: 'The Pay button is cut off on a phone 360 wide. It must never be wider than the screen less a margin of 16 on each side, and on a screen wide enough it stays 400 wide. It is pay_button_width(screen_width) in checkout.py.',
  code: 'The file checkout.py:\ndef pay_button_width(screen_width):\n    """How wide the Pay button is drawn."""\n    return min(400, screen_width - 16)\n',
  check:
    'def test_a_small_phone_leaves_a_margin_each_side(self):\n    from checkout import pay_button_width\n    self.assertEqual(pay_button_width(360), 328)',
  fails: ['the check "A small phone leaves a margin each side": AssertionError: 344 != 328'],
  tried: ['the builder changed the width to screen_width - 16, and the check still fails'],
  call: 'pay_button_width(360)',
};

const all = [];
const rows = [];
const t0 = Date.now();
const check = (id, ok, detail) => {
  all.push({
    id,
    ok: !!ok,
    detail: ok ? '' : String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500),
  });
  console.log('  ' + (ok ? 'ok    ' : 'MISS  ') + id + (ok ? '' : '   ' + all[all.length - 1].detail.slice(0, 260)));
};
try {
  await fetch(B + '/api/setup', { method: 'POST', headers: J, body: JSON.stringify({ ...setup, mode: 'developer' }) });
  let v;
  for (;;) {
    await sleep(2000);
    v = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
    if (!v.busy) break;
  }
  if (!v.setup || !v.setup.done)
    throw new Error('set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 200));
  for (const mode of ['simple', 'developer']) {
    const simple = mode === 'simple';
    const seats = SEATS.map((s) => (simple ? { ...s, ...FRIENDLY[s.id] } : s));
    console.log('\n=== ' + mode.toUpperCase() + ' on ' + label + ': "' + ASKS[mode] + '" ===');
    const said = [];
    for (const s of seats) {
      const text = await speak({
        seat: s.id,
        system: soulOf(s, 'answer', { claude, simple }),
        prompt: (simple ? 'The person says: ' : 'The customer says: ') + ASKS[mode],
      });
      said.push({ id: s.id, name: s.title, text });
      console.log('  ' + s.title.padEnd(11) + text.slice(0, 230));
    }
    const pairs = [];
    for (let i = 0; i < said.length; i++)
      for (let k = i + 1; k < said.length; k++)
        pairs.push({
          a: said[i].name,
          b: said[k].name,
          share: Math.round(overlap(said[i].text, said[k].text) * 100) / 100,
        });
    const worst = pairs.slice().sort((x, y) => y.share - x.share)[0];
    check(
      mode + '.every-seat-answered',
      said.every((x) => x.text.length > 20 && !/\[no reply\]|broke down/.test(x.text)),
      said.filter((x) => x.text.length <= 20).map((x) => x.name),
    );
    check(mode + '.no-two-seats-say-the-same', worst.share < 0.6, worst);
    // a reader who cannot see the names: the answers in an order of their own, and what each seat is like
    const order = [3, 0, 4, 1, 2];
    const letters = 'ABCDE';
    const key = order.map((i, n) => ({ letter: letters[n], id: said[i].id }));
    const who = seats
      .map(
        (s) => '- ' + s.title + ': ' + (simple ? TEMPER[s.id].plain + '. ' + TEMPER[s.id].says : TEMPER[s.id].temper),
      )
      .join('\n');
    // IS THE READER ANY GOOD? (the reliability of a model as a judge is itself in question: arXiv 2412.12509, 2410.02736.) Before its
    // reading of the real answers is believed, it is given five answers anyone could tell apart, each saying outright what its
    // speaker is like. A reader that cannot name four of those is not reading, and its verdict on the real ones is VOID: reported,
    // and counted neither for the team nor against it.
    const plainly = seats.map(
      (x) => 'Speaking as someone of whom this is true: ' + (simple ? TEMPER[x.id].plain : TEMPER[x.id].temper) + '.',
    );
    const trial = await speak({
      seat: 'steward',
      max: 120,
      system: 'You match unnamed answers to the people who gave them. You reply with the five pairs and nothing else.',
      prompt:
        'Five people each said one thing.\n\nWhat each of them is like:\n' +
        who +
        '\n\nWhat they said, in no particular order:\n' +
        order.map((i, n) => letters[n] + ': ' + plainly[i]).join('\n\n') +
        '\n\nWho said which? Each person said exactly one. Reply with exactly five lines of the form "A: name".',
    });
    const able =
      key.filter((k) => {
        const m = new RegExp('\\b' + k.letter + '\\s*[:=-]\\s*(?:the\\s+)?([A-Za-z]+)', 'i').exec(trial);
        return m && m[1].toLowerCase() === seats.find((x) => x.id === k.id).title.toLowerCase();
      }).length >= 4;
    const guess = await speak({
      seat: 'steward',
      max: 120,
      system: 'You match unnamed answers to the people who gave them. You reply with the five pairs and nothing else.',
      prompt:
        'Five people were each asked: "' +
        ASKS[mode] +
        '"\n\nWhat each of them is like:\n' +
        who +
        '\n\nTheir answers, in no particular order:\n' +
        order.map((i, n) => letters[n] + ': ' + said[i].text.slice(0, 420)).join('\n\n') +
        '\n\nWho gave which answer? Each person gave exactly one. Reply with exactly five lines of the form "A: name".',
    });
    const right = key.filter((k) => {
      const m = new RegExp('\\b' + k.letter + '\\s*[:=-]\\s*(?:the\\s+)?([A-Za-z]+)', 'i').exec(guess);
      const name = seats.find((s) => s.id === k.id).title;
      return m && m[1].toLowerCase() === name.toLowerCase();
    }).length;
    // THEIR TASTES ARE THEIR OWN (after "Quantifying and optimizing global faithfulness in persona-driven role-playing", arXiv
    // 2405.07726: a character should answer to what bears on it and stay out of what does not). Each of the five is given a subject
    // that is one seat's and nobody else's; asked who has most to say on it, the team's model names that seat for at least four.
    if (simple) {
      const SUBJECTS = [
        ['overseer', 'getting six people to the airport on time for a morning flight'],
        ['steward', 'an email that says I have won a prize and asks for my bank details'],
        ['operations', 'my bike chain keeps slipping off and I need a quick fix'],
        ['ask', 'colours and decorations for the birthday party of a five-year-old'],
        ['master', 'how to word a polite no to a wedding invitation'],
      ];
      let right = 0;
      const got = [];
      for (const [id, subject] of SUBJECTS) {
        const named = await speak({
          seat: 'overseer',
          max: 20,
          system: 'You say which person a subject belongs to. You reply with one name and nothing else.',
          prompt:
            'Five people, and what each cares about:\n' +
            seats.map((x) => '- ' + x.title + ': ' + TEMPER[x.id].cares).join('\n') +
            '\n\nWho has the most to say about this: "' +
            subject +
            '"? Reply with the one name.',
        });
        const want = seats.find((x) => x.id === id).title;
        if (new RegExp('\\b' + want + '\\b', 'i').test(named)) right++;
        got.push(want + ': ' + named.slice(0, 20));
      }
      check('simple.their-tastes-are-told-apart', right >= 4, right + ' of 5. ' + got.join('; '));
    }
    // each voice's own way of speaking, read off its answer: no reader is needed, so a small model's reading does not blur it
    if (simple) {
      const first = (t) => String(t).split(/(?<=[.!?])\s+/)[0] || '';
      const count = (t) => String(t).trim().split(/\s+/).length;
      const shortest = Math.min(...said.map((x) => count(x.text)));
      const WAY = {
        overseer: (t) => /\b(first|then|after that|next)\b/i.test(t),
        steward: (t) => /\b(check|one thing|careful|make sure|watch|before you|depends|unless)\b/i.test(first(t)),
        operations: (t) =>
          /^\W*(grab|try|skip|go|pick|head|start|make|take|get|find|pack|book|call|walk|cook|sleep)\b/i.test(t),
        ask: (t) => /\blike an?\b|\b(looks?|feels?|picture|imagine|colou?r)\b/i.test(t),
        master: (t) => count(t) === shortest || count(t) <= 45,
      };
      const kept = said.filter((x) => WAY[x.id](x.text)).map((x) => x.name);
      check(
        'simple.each-voice-keeps-its-way-of-speaking',
        kept.length >= 4,
        kept.length + ' of 5: ' + (kept.join(', ') || 'none'),
      );
    }
    if (able)
      check(
        mode + '.a-reader-can-tell-who-said-what',
        right >= 3,
        right + ' of 5 named rightly. The reader said: ' + guess.slice(0, 200),
      );
    else
      console.log(
        '  VOID  ' +
          mode +
          '.a-reader-can-tell-who-said-what   this model could not name answers that say outright who gave them, so its reading (' +
          right +
          ' of 5) is not counted',
      );
    if (simple)
      check(
        'simple.no-seat-uses-a-developer-word',
        said.every((x) => !DEV.test(x.text)),
        said.filter((x) => DEV.test(x.text)).map((x) => x.name + ': ' + (DEV.exec(x.text) || [])[0]),
      );
    else
      check(
        'developer.each-keeps-to-its-length',
        said.every((x) => x.text.split(/\s+/).length <= 120),
        said.map((x) => x.name + ' ' + x.text.split(/\s+/).length),
      );
    rows.push({
      at: new Date().toISOString(),
      label,
      mode,
      ask: ASKS[mode],
      said,
      pairs,
      right,
      guess: guess.slice(0, 300),
    });
  }
  // the room: one stuck problem, asked of all five
  console.log('\n=== THE ROOM on ' + label + ': a button that is 344 wide and must be 328 ===');
  const answers = await askRoom({
    problem: STUCK,
    ask: async ({ system, prompt, max, seat }) =>
      speak({ seat, system, prompt, max: max || 320 }).then((t) =>
        t.replace(/\s*(WHERE|IDEA|VALUE|BLAME)\s*:/g, '\n$1:'),
      ),
  });
  const t = tally(answers);
  for (const a of answers)
    console.log(
      '  ' +
        a.name.padEnd(13) +
        '[' +
        (a.blame || '?') +
        (a.value ? ', ' + a.value : '') +
        '] ' +
        a.idea.slice(0, 200) +
        (a.also.length ? '   (also: ' + a.also.join(', ') + ')' : ''),
    );
  check(
    'room.the-seats-answer-in-the-form-asked',
    answers.length >= 2 && answers.reduce((n, a) => n + a.votes.length, 0) >= 4,
    answers.map((a) => a.said.slice(0, 120)),
  );
  check(
    'room.more-than-one-idea-comes-back',
    answers.filter((a) => a.idea).length >= 2,
    answers.map((a) => a.idea.slice(0, 80)),
  );
  check('room.it-blames-the-code-here', t.code > t.check, t);
  check('room.it-works-the-value-out', t.value === '328', t);
  rows.push({
    at: new Date().toISOString(),
    label,
    mode: 'room',
    answers: answers.map((a) => ({ seat: a.seat, also: a.also, blame: a.blame, value: a.value, idea: a.idea })),
    tally: t,
  });
} catch (e) {
  console.log('STOPPED ' + String((e && e.stack) || e).slice(0, 400));
  check('ran-to-the-end', false, String((e && e.message) || e));
} finally {
  try {
    await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' });
  } catch {
    /* gone */
  }
  await sleep(800);
  stop();
}

const good = all.filter((c) => c.ok).length;
const minutes = Math.round((Date.now() - t0) / 6000) / 10;
console.log(
  '\n' +
    label +
    ', voices: ' +
    good +
    ' of ' +
    all.length +
    ' checks held. ' +
    minutes +
    ' min.' +
    all
      .filter((c) => !c.ok)
      .map((c) => '\n  MISS ' + c.id)
      .join(''),
);
for (const r of rows) fs.appendFileSync(path.join(WORK, 'voices.jsonl'), JSON.stringify(r) + '\n');
const out = path.join(HERE, 'results');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, label + '-voices.json'),
  JSON.stringify(
    { label, setup, at: new Date().toISOString(), minutes, good, of: all.length, checks: all, rows },
    null,
    1,
  ) + '\n',
);
fs.appendFileSync(
  path.join(out, 'history.jsonl'),
  JSON.stringify({
    label: label + '-voices',
    at: new Date().toISOString(),
    note: String(arg('note', '')),
    minutes,
    total: { runs: all.length, good },
    misses: all.filter((c) => !c.ok).map((c) => c.id),
  }) + '\n',
);
process.exit(0);
