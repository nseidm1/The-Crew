// recall.mjs - DOES VISION PUT THE RIGHT THING IN FRONT OF THE SEAT? Measured with no model at all. A team's memory is written out
// (lessons, what a person said of themself, experiences), and for each question the thing that answers it is named. Vision is
// asked the question, and the score is whether that thing is among the three a seat is shown. The same set is asked every time,
// so a change to how the team recalls can be laid beside the last one; and it is asked two ways: as Vision recalls now, and by
// counting shared words alone, which is what it did before, so that what the ranking buys is a number and not a belief.
// (After the system this team is modelled on, which scores its own recall with a stand-in that hands back what it was shown.)
//   node training/recall.mjs            the score, each miss named
// Exit 1 when recall falls below the last full run's. The summary goes to training/results/recall.json and history.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const store = new Map([['familyoffice.mode', 'developer']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../src/js/team-core.js');
const { seedState } = await import('../src/js/team/base.js');

// ---- the memory: frozen. A lesson may be tied to the piece of work it was kept in (ep) and to the files that work touched.
const at = (days) => Date.now() - days * 86400000;
const L = (id, text, more = {}) => ({
  id,
  dir: 'kept',
  kind: 'lesson',
  at: at(more.days || 5),
  text,
  cites: more.cites || '',
  shown: more.shown || 0,
  used: more.used || 0,
  ...more,
});
const LEDGER = [
  L('pin-empty', 'Pin the empty basket before changing how the total is worked out.', {
    ep: 'E-1',
    files: ['src/basket.js'],
  }),
  L('round-once', 'Round money once, at the end, in pence; rounding twice lost a penny on three items.', {
    ep: 'E-1',
    files: ['src/basket.js'],
  }),
  L('team-short', 'The team keeps what the team writes for the team short.', { shown: 7, used: 0 }),
  L('team-ask', 'The team asks the team before the team changes a plan the team agreed.', { shown: 5, used: 0 }),
  L('team-notes', 'Notes for the team go in the team channel, where the team reads them.', { shown: 6, used: 0 }),
  L('safari-date', 'Safari does not parse a date with a space in it: build dates from their parts.', {
    ep: 'E-2',
    files: ['src/export.js'],
  }),
  L('export-wait', 'The export button did nothing because its handler was added before the table existed.', {
    ep: 'E-2',
    files: ['src/export.js'],
  }),
  L('branch-name', 'Branches are named fix/<ticket>-<what>, never after a person.', { conf: 0.8 }),
  L('no-friday', 'Nothing lands on a Friday afternoon; it waits for Monday.', { conf: 0.75 }),
  L(
    'flaky-trace',
    'The flaky checkout test was a race on the payment sandbox: found by comparing traces, not by reading the test.',
    { ep: 'E-3', files: ['tests/checkout.spec.ts'] },
  ),
  L('retry-hides', 'Turning retries on made the flaky test look fixed for a week.', {
    ep: 'E-3',
    files: ['tests/checkout.spec.ts'],
  }),
  L('migrate-first', 'A migration that adds a column goes out one release before the code that reads it.', {
    ep: 'E-4',
  }),
  L('rollback-plan', 'Every migration is written with the statement that undoes it beside it.', { ep: 'E-4' }),
  L('cache-key', 'The price cache is keyed by currency as well as product; without it, pounds were shown in euros.', {
    files: ['src/prices.js'],
  }),
  L('copy-tone', 'Error messages say what to do next, never only what went wrong.'),
  L('img-size', 'Photos are cut to 1600 pixels wide before they go on a page; the home page was 9 MB without it.', {
    files: ['src/gallery.js'],
  }),
  L('a11y-label', 'Every button that is only an icon has a spoken name.'),
  L('tz-utc', "Times are kept in UTC and turned into the customer's own zone only where they are shown."),
  L('secret-env', 'Keys live in the environment of the server, never in the page.'),
  L('test-name', 'A test is named for what it proves, as a sentence.'),
  { id: 'you-porto', dir: 'kept', kind: 'you', at: at(9), text: 'They live in Porto.', cites: '', shown: 0, used: 0 },
  { id: 'you-veg', dir: 'kept', kind: 'you', at: at(9), text: 'They are vegetarian.', cites: '', shown: 0, used: 0 },
  {
    id: 'fix-tuesday',
    dir: 'kept',
    kind: 'correction',
    at: at(2),
    text: 'They put the team right: "no, the market in the square is on Tuesday". Do not make them say it again.',
    cites: 'no, the market in the square is on Tuesday',
    shown: 0,
    used: 0,
    repeats: 0,
  },
];
const EPISODES = [
  {
    id: 'E-1',
    kind: 'build',
    title: 'The basket total should include delivery',
    at: at(6),
    seconds: 420,
    mode: 'developer',
    seat: 'operations',
    rounds: 2,
    outcome: 'landed',
    faults: [],
  },
  {
    id: 'E-2',
    kind: 'build',
    title: 'Export button does nothing on Safari',
    at: at(5),
    seconds: 380,
    mode: 'developer',
    seat: 'operations',
    rounds: 1,
    outcome: 'landed',
    faults: [],
  },
  {
    id: 'E-3',
    kind: 'build',
    title: 'Fix the flaky checkout test',
    at: at(4),
    seconds: 900,
    mode: 'developer',
    seat: 'operations',
    rounds: 3,
    outcome: 'stopped',
    faults: ['unseen'],
  },
  {
    id: 'E-4',
    kind: 'build',
    title: 'Add a delivery date column to orders',
    at: at(3),
    seconds: 500,
    mode: 'developer',
    seat: 'operations',
    rounds: 1,
    outcome: 'landed',
    faults: [],
  },
];
// ---- the questions: each with the things that answer it. why: what kind of recall it tests.
const QUESTIONS = [
  { q: 'The basket shows the wrong total when it is empty', need: ['pin-empty'], why: 'plain words' },
  {
    q: 'Change how the team works out the total for the team discount',
    need: ['pin-empty', 'round-once'],
    why: 'a rare word among common ones',
  },
  { q: 'We are a penny out on some orders', need: ['round-once'], why: 'plain words' },
  {
    q: 'Rework src/basket.js so delivery is a line of its own',
    need: ['pin-empty', 'round-once'],
    why: 'a file the request names',
  },
  {
    q: 'The download in src/export.js is empty on an iPhone',
    need: ['safari-date', 'export-wait'],
    why: 'a file the request names',
  },
  { q: 'Dates look wrong in Safari', need: ['safari-date'], why: 'plain words' },
  {
    q: 'Dates look wrong in Safari, what else did we learn then',
    need: ['export-wait'],
    why: 'kept in the same piece of work',
  },
  {
    q: 'The checkout test is still failing one run in five',
    need: ['flaky-trace'],
    why: 'the earlier attempt',
    earlier: 'Fix the flaky checkout test',
  },
  { q: 'Should we turn retries on for the checkout test', need: ['retry-hides'], why: 'plain words' },
  { q: 'What should I call the branch for this fix', need: ['branch-name'], why: 'plain words' },
  { q: 'Can this land today, it is Friday at four', need: ['no-friday'], why: 'plain words' },
  { q: 'We need a new column on the orders table', need: ['migrate-first'], why: 'plain words' },
  {
    q: 'We need a new column on the orders table, and a way back',
    need: ['rollback-plan'],
    why: 'kept in the same piece of work',
  },
  { q: 'Prices are shown in the wrong currency for some customers', need: ['cache-key'], why: 'plain words' },
  { q: 'The home page is slow to load its photos', need: ['img-size'], why: 'plain words' },
  { q: 'Where should the Stripe key go', need: ['secret-env'], why: 'plain words' },
  { q: 'What time zone do we keep times in', need: ['tz-utc'], why: 'plain words' },
  { q: 'Write the message for when the card is declined', need: ['copy-tone'], why: 'plain words' },
  {
    q: 'The team wants the team page to list the team by name for the team photo',
    need: [],
    none: ['team-short', 'team-ask', 'team-notes'],
    why: 'common words alone recall nothing worth showing',
  },
  { q: 'When is the market in the square again', need: ['fix-tuesday'], why: 'what the person put right' },
  // reached only by walking: nothing below shares a telling word with what answers it
  {
    q: 'A new download button is going in, like the export one on Safari',
    need: ['safari-date', 'export-wait'],
    why: 'through the piece of work it names',
  },
  {
    q: 'We are adding another delivery date column to another table',
    need: ['migrate-first', 'rollback-plan'],
    why: 'through the piece of work it names',
  },
  { q: 'src/prices.js is being rewritten from scratch', need: ['cache-key'], why: 'a file the request names' },
  {
    q: 'tests/checkout.spec.ts needs a new case for gift cards',
    need: ['flaky-trace', 'retry-hides'],
    why: 'a file, then what was kept with it',
  },
];

store.set(
  'familyoffice.core.v1',
  JSON.stringify({ ...seedState(), learning: { contribute: false, ledger: LEDGER }, episodes: EPISODES }),
);
const core = createTeamCore({ persist: true });
// what a seat is shown: the first three that are not a ruling (as speak() takes them)
const shownFor = (q) =>
  core
    .ask(q)
    .filter((v) => v.kind !== 'ruling')
    .slice(0, 3);
// the way it was: shared words counted, each the same, newest first on a tie
const words = (t) =>
  new Set(
    (
      String(t)
        .toLowerCase()
        .match(/[a-z0-9]{4,}/g) || []
    ).map((w) => w.replace(/(ing|ed|es|s)$/, '')),
  );
const plainFor = (q) => {
  const w = [...words(q)];
  return LEDGER.map((x) => ({ x, n: w.filter((y) => words(x.text).has(y)).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || b.x.at - a.x.at)
    .slice(0, 3)
    .map((r) => r.x.id);
};
let needed = 0;
let hit = 0;
let plainHit = 0;
let noise = 0;
const misses = [];
for (const item of QUESTIONS) {
  const got = shownFor(item.q);
  const ids = got.map((v) => (v.ref && v.ref.id) || v.kind);
  const plain = plainFor(item.q);
  for (const id of item.need) {
    needed++;
    if (ids.includes(id)) hit++;
    else misses.push('"' + item.q + '" needed ' + id + ' (' + item.why + '); shown: ' + (ids.join(', ') || 'nothing'));
    if (plain.includes(id)) plainHit++;
  }
  if (item.earlier && !got.some((v) => v.kind === 'earlier' && v.text.includes(item.earlier)))
    misses.push('"' + item.q + '" did not bring back the earlier attempt');
  if (item.none) noise += ids.filter((id) => item.none.includes(id)).length;
  console.log(
    (item.need.every((id) => ids.includes(id)) ? 'ok    ' : 'MISS  ') + item.q.slice(0, 64).padEnd(66) + ids.join(', '),
  );
}
const recall = Math.round((hit / needed) * 1000) / 1000;
const plain = Math.round((plainHit / needed) * 1000) / 1000;
const out = path.join(HERE, 'results');
let before = null;
try {
  before = JSON.parse(fs.readFileSync(path.join(out, 'recall.json'), 'utf8'));
} catch {
  /* the first run */
}
console.log(
  '\nVision put ' +
    hit +
    ' of ' +
    needed +
    ' needed things in front of the seat (recall ' +
    recall +
    '). Counting shared words alone: ' +
    plainHit +
    ' (' +
    plain +
    ').' +
    (noise ? ' It showed ' + noise + ' lessons that share only common words, where nothing was wanted.' : '') +
    (before ? ' Last run: ' + before.recall + '.' : '') +
    misses.map((m) => '\n  MISS ' + m).join(''),
);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, 'recall.json'),
  JSON.stringify(
    { at: new Date().toISOString(), questions: QUESTIONS.length, needed, hit, recall, plain, noise, misses },
    null,
    1,
  ) + '\n',
);
fs.appendFileSync(
  path.join(out, 'history.jsonl'),
  JSON.stringify({
    label: 'recall',
    at: new Date().toISOString(),
    note: String(process.argv[2] || ''),
    total: { runs: needed, good: hit },
    recall,
    plain,
    misses: misses.map((m) => m.slice(0, 80)),
  }) + '\n',
);
process.exit(before && recall < before.recall ? 1 : 0);
