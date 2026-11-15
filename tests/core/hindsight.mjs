// hindsight.mjs - WHAT HAPPENED, AND WHETHER KEEPING IT HELPED (src/js/team/hindsight.js), and what Vision does with it. The chat's
// core in Node with a stand-in engine. Every finished piece of work is kept as an experience; what had to be put right is a fault
// of a kind, counted, and a kind seen twice from one seat adds its line to what that seat is told; the person's corrections are
// lessons of their own and "told twice" is counted; recall weighs rare words, brings back what was kept together and the
// earlier attempt; a seat that was not told is given more; and a lesson that leaves the machine keeps method only.
//   node tests/core/hindsight.mjs
const store = new Map([['familyoffice.mode', 'simple']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
const { seedState } = await import('../../src/js/team/base.js');
const { faultsIn, PUTS_RIGHT, FAULTS } = await import('../../src/js/team/hindsight.js');
const { stripped, forSharing, theirsIn } = await import('../../src/js/team/share.js');
const { dayOf } = await import('../../src/js/team/extras.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'familyoffice.core.v1';
// a team whose replies are given in order (the last one repeats), with its memory seeded when asked
const team = ({
  says = ['An answer of some length, long enough to be a real answer to a real question.'],
  seed = null,
  claude = false,
} = {}) => {
  if (seed) store.set(KEY, JSON.stringify({ ...seedState(), ...seed }));
  else store.delete(KEY);
  const asked = [];
  let n = 0;
  const core = createTeamCore({ persist: !!seed });
  if (claude) core.adopt({ kind: 'claude' });
  core.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      asked.push(ask);
      const quiet = /Could ONE teammate|Would any of them|Would a small card|anything LASTING|Give only the fact/.test(
        ask,
      );
      const say = quiet ? (/Give only the fact/.test(ask) ? '' : '[]') : says[Math.min(n++, says.length - 1)];
      if (o.onDelta) o.onDelta(say);
      return {};
    },
  });
  const go = async (text, ms = 1300) => {
    core.send(text);
    await wait(ms);
    return core.snapshot();
  };
  return { core, asked, go };
};
const lesson = (id, text, more = {}) => ({
  id,
  dir: 'kept',
  kind: 'lesson',
  at: Date.now() - 1000,
  text,
  cites: '',
  shown: 0,
  used: 0,
  ...more,
});

// ---- faults that can be read off a reply, and a correction from the person
check(
  'a reply that opens by praising the question, says its instructions back, or answers a question with a question is a fault of that kind',
  faultsIn('Great question! Carbonara.', { asked: 'what pasta?' }).join() === 'praise' &&
    faultsIn('Six minutes. No warm-up needed.', { asked: 'how long?' }).join() === 'echo' &&
    faultsIn("What's your favorite pasta shape?", { asked: 'whats a good pasta?' }).join() === 'asked-back' &&
    faultsIn('Go for a simple garlic and olive oil spaghetti tonight.', { asked: 'whats a good pasta?' }).length === 0,
  [
    faultsIn('Great question! Carbonara.', { asked: 'what pasta?' }),
    faultsIn("What's your favorite pasta shape?", { asked: 'whats a good pasta?' }),
  ],
);
check(
  '"no, I said Tuesday" puts the team right; "no thanks" and a plain "no" do not',
  PUTS_RIGHT.test('No, I said Tuesday, not Thursday') &&
    PUTS_RIGHT.test("That's not what I asked") &&
    !PUTS_RIGHT.test('no thanks') &&
    !PUTS_RIGHT.test('No.'),
  [PUTS_RIGHT.test('No, I said Tuesday, not Thursday'), PUTS_RIGHT.test('no thanks')],
);
check(
  'every kind of fault names the line that prevents it',
  Object.values(FAULTS).every((f) => f.says && f.line.length > 20),
  Object.keys(FAULTS),
);

// ---- an answer is an experience; the person's correction marks it and is kept; told twice is counted
{
  const t = team({ says: ['The farmers market in the square is on Thursday mornings, from eight until about one.'] });
  let s = await t.go('when is the farmers market in the square?');
  const first = s.episodes[0];
  check(
    'an answer is kept as an experience: whose it was, the mode, one round, and that it stood',
    !!first &&
      first.kind === 'answer' &&
      first.seat === 'overseer' &&
      first.mode === 'simple' &&
      first.rounds === 1 &&
      first.outcome === 'stood',
    first,
  );
  s = await t.go('No, I said the one by the station, not the square');
  const kept = s.learning.ledger.find((x) => x.kind === 'correction');
  check(
    'when the person puts the team right, that is a lesson of its own in their words, the experience is marked corrected, and it is a fault of the seat that answered',
    !!kept &&
      /the one by the station/.test(kept.text) &&
      s.episodes.find((e) => e.id === first.id).outcome === 'corrected' &&
      s.faults.corrected.seats.overseer === 1,
    [kept, s.episodes.map((e) => e.outcome), s.faults],
  );
  s = await t.go('No, I said the one by the station, not the one in the square');
  const r = t.core.hindsight();
  check(
    'put right a second time about the same thing is counted as told twice, not kept as a new lesson',
    s.learning.ledger.filter((x) => x.kind === 'correction').length === 1 && r.toldTwice === 1 && r.corrections === 2,
    r,
  );
  check(
    'how the team is doing is read off its experiences: how many stood as first given',
    r.experiences >= 2 && r.firstPass < 1 && r.helped === null,
    r,
  );
  const before = t.asked.length;
  s = await t.go('how is the team doing?');
  const said = s.chat[s.chat.length - 1];
  check(
    '"how is the team doing?" is answered from those numbers, with no model asked, and says what is not measured yet',
    t.asked.length === before &&
      said.by === 'overseer' &&
      /stood as first given/.test(said.text) &&
      /put us right/.test(said.text) &&
      /not measured yet/.test(said.text),
    [said.text, t.asked.length - before],
  );
}

// ---- a kind of fault seen twice from one seat adds its line to what that seat is told
{
  const t = team({
    says: [
      'Great question! A carbonara is quick and rich and uses what you have.',
      'Great question! A crisp white like a Pinot Grigio goes well with it.',
      'A green salad with lemon.',
    ],
  });
  await t.go('whats a good pasta for tonight');
  await t.go('and what wine goes with a carbonara like that');
  const s = await t.go('and what would you put beside it on the table');
  const third = t.asked.filter((a) => /beside it on the table/.test(a)).pop() || '';
  check(
    'once is recorded; twice, the seat is told the one line that prevents it, the next time it speaks',
    s.faults.praise.seats.overseer === 2 &&
      /WHAT YOU HAVE BEEN PUT RIGHT ON BEFORE/.test(third) &&
      /Start with the answer itself, never with a remark about the question/.test(third) &&
      !/WHAT YOU HAVE BEEN PUT RIGHT ON BEFORE/.test(t.asked.find((a) => /what wine goes/.test(a)) || ''),
    [s.faults, third.slice(0, 400)],
  );
}

// ---- recall: rare words, what was kept together, the earlier attempt, a file
{
  const ledger = [
    lesson('L-1', 'The team keeps the team notes short when the team writes for the team.'),
    lesson('L-2', 'The team asks the team before the team changes a plan.'),
    lesson('L-3', 'Their sister is allergic to peanuts, so nothing with peanuts goes in a cake.', { ep: 'E-9' }),
    lesson('L-4', 'For birthdays they order from the bakery on the corner two days ahead.', { ep: 'E-9' }),
    lesson('L-5', 'Pin the empty basket case before changing the total.', { files: ['src/basket.js'] }),
    lesson('L-6', 'A lesson that was shown often and never used, about the team and the cake.', { shown: 6, used: 0 }),
  ];
  const episodes = [
    {
      id: 'E-3',
      kind: 'build',
      title: 'Fix the checkout test',
      at: Date.now() - 5000,
      seconds: 300,
      mode: 'developer',
      seat: 'operations',
      rounds: 3,
      outcome: 'stopped',
      faults: ['unseen'],
    },
  ];
  const t = team({ seed: { learning: { contribute: true, ledger }, episodes } });
  const got = t.core.ask('is the team fine with peanuts in the cake for the team party');
  check(
    'a rare word weighs more: the one lesson about peanuts comes before the ones that only share "team", and one shown often and never used sinks below it',
    got[0].ref.id === 'L-3' && got.findIndex((v) => v.ref && v.ref.id === 'L-6') > 0,
    got.map((v) => [v.ref && v.ref.id, v.kind]),
  );
  check(
    'what was kept together comes back together: the other lesson from the same piece of work, though it shares no word with the question',
    got.some((v) => v.ref && v.ref.id === 'L-4' && v.from === 'kept in the same piece of work'),
    got.map((v) => [v.ref && v.ref.id, v.from]),
  );
  const again = t.core.ask('why is the checkout test still failing');
  check(
    '"still" recalls the earlier attempt first: what it was, how it ended, in how many rounds, and what had to be put right',
    again[0].kind === 'earlier' &&
      /Fix the checkout test/.test(again[0].text) &&
      /stopped before it was done, after 3 rounds/.test(again[0].text) &&
      /unseen/.test(again[0].text),
    again[0],
  );
  check(
    'without "again" or "still" the earlier attempt is not brought up',
    !t.core.ask('what does the checkout test cover').some((v) => v.kind === 'earlier'),
    null,
  );
  const file = t.core.ask('rework the totals in src/basket.js');
  check(
    'a file the request names brings back what was learned on that file, whatever words it uses',
    file.some((v) => v.ref && v.ref.id === 'L-5'),
    file.map((v) => v.ref && v.ref.id),
  );
  const out = t.core.contribution();
  check(
    'what would be contributed is the lessons only, with nothing of the person in them: no file, no quoted words, none about who they are',
    out.length >= 1 &&
      out.every((x) => !/basket\.js|sister|peanuts/.test(x.text) || !/src\//.test(x.text)) &&
      !out.some((x) => /\.js\b/.test(x.text)),
    out,
  );
  store.delete(KEY);
}

// ---- a seat that says it was not told is given more of what the team holds, once
{
  const ledger = [
    lesson('L-1', 'For a party they want a lemon cake.'),
    lesson('L-2', 'For a party they want candles on the cake.'),
    lesson('L-3', 'For a party they want the cake by noon.'),
    lesson('L-4', 'For a party the cake must have no nuts in it at all.'),
    lesson('L-5', 'For a party the cake comes from the bakery on the corner.'),
  ];
  const t = team({
    seed: { learning: { contribute: false, ledger } },
    says: [
      "I don't remember which cake you like for a party.",
      'A lemon cake with no nuts, from the bakery on the corner.',
    ],
  });
  const s = await t.go('which cake should we get for the party?', 1800);
  const second = t.asked.find((a) => /WHAT ELSE THE TEAM'S MEMORY HOLDS ON THIS/.test(a)) || '';
  const last = s.chat.filter((m) => m.by === 'overseer').pop();
  check(
    'a seat that says it does not remember is given the rest of what the team holds on the question, and answers once more',
    /no nuts in it at all|bakery on the corner/.test(second) &&
      last.thread === 'pulled' &&
      /lemon cake with no nuts/.test(last.text) &&
      t.core.contribution().length === 0,
    [second.slice(0, 300), last],
  );
  store.delete(KEY);
}

// ---- what may leave the machine, the day of a plan
check(
  'a lesson that leaves keeps method only: an address, an email, a file, a path, an identifier and a run of their own words are taken out',
  stripped(
    'Pin the empty case first in src/cart/basket.js before changing FO-142, see https://example.org/x or ask dana@example.org.',
    [],
  ) === 'Pin the empty case first in before changing, see or ask.' &&
    theirsIn('They want the invoice total shown in pounds with two decimal places always', [
      'please show the invoice total shown in pounds with two decimal places always',
    ]).some((f) => f.kind === 'their words') &&
    stripped('src/a.js', []) === '',
  stripped(
    'Pin the empty case first in src/cart/basket.js before changing FO-142, see https://example.org/x or ask dana@example.org.',
    [],
  ),
);
check(
  'only lessons are handed over: never what the person said of themself, what they like, or how they put the team right',
  forSharing(
    [
      lesson('a', 'Run the build before the tests, every time.'),
      { ...lesson('b', 'They live in Porto and eat no meat.'), kind: 'you' },
      { ...lesson('c', 'They put the team right: "no, Tuesday".'), kind: 'correction' },
    ],
    [],
  )
    .map((x) => x.text)
    .join('|') === 'Run the build before the tests, every time.',
  forSharing(
    [
      lesson('a', 'Run the build before the tests, every time.'),
      { ...lesson('b', 'They live in Porto.'), kind: 'you' },
    ],
    [],
  ),
);
{
  const sat = new Date(2026, 10, 14, 10).getTime(); // a Saturday
  check(
    'a day plan knows its day when the words say: tomorrow, today, or the next of a weekday (never today itself)',
    dayOf('Plan us a day tomorrow', sat) === '2026-11-15' &&
      dayOf('what shall we do today', sat) === '2026-11-14' &&
      dayOf('a Saturday with Mia', sat) === '2026-11-21' &&
      dayOf('lunch on Wednesday', sat) === '2026-11-18' &&
      dayOf('a day out', sat) === '',
    [dayOf('a Saturday with Mia', sat), dayOf('lunch on Wednesday', sat)],
  );
}
// ---- the soul is a graph, and recall walks it
{
  const { edgesOf, walk, KEEP } = await import('../../src/js/team/graph.js');
  const state = {
    learning: {
      ledger: [
        lesson('L-a', 'Pin the empty case first.', { ep: 'E-1', files: ['src/basket.js'] }),
        lesson('L-b', 'Round money once.', { ep: 'E-1' }),
        { ...lesson('L-c', 'They put the team right about delivery.'), kind: 'correction', about: 'E-1' },
        lesson('L-d', 'Unrelated, kept elsewhere.', { ep: 'E-9' }),
      ],
    },
    episodes: [
      {
        id: 'E-2',
        kind: 'build',
        title: 'The basket total should include delivery',
        at: 2,
        used: ['L-a'],
        faults: ['unseen'],
      },
      { id: 'E-1', kind: 'build', title: 'The basket total should include delivery', at: 1, files: ['src/basket.js'] },
    ],
    proofs: [{ id: 'PF-1', title: 'The basket total should include delivery' }],
    rulings: [
      { id: 'R-2', kind: 'likes-length', superseded: false },
      { id: 'R-1', kind: 'likes-length', superseded: true },
    ],
  };
  const edges = edgesOf(state);
  const has = (a, b, kind) =>
    edges.some((e) => ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) && e[2] === kind);
  check(
    'what produced what is an edge: a lesson and its piece of work, two lessons kept together, a lesson and its file, a correction and what it put right, a second go and the first, a plan and its proof, a ruling and the one it replaced',
    has('L-a', 'E-1', 'kept-in') &&
      has('L-a', 'L-b', 'together') &&
      has('L-a', 'F:src/basket.js', 'file') &&
      has('L-c', 'E-1', 'about') &&
      has('E-2', 'E-1', 'again') &&
      has('P:The basket total should include delivery', 'PF-1', 'proof') &&
      has('R-2', 'R-1', 'replaced') &&
      has('L-a', 'E-2', 'used') &&
      !edges.some((e) => e.includes('L-d') && e.includes('L-a')),
    edges,
  );
  const found = walk({ seeds: new Map([['F:src/basket.js', 8]]), edges, steps: 2 });
  check(
    'a walk goes two steps out and loses weight at each: from the file to the lesson learned on it, and on to the lesson kept with that one; what is not tied to it is not reached',
    Math.abs(found.get('L-a').rank - 8 * KEEP.file) < 1e-9 &&
      found.get('L-a').hops === 1 &&
      found.get('L-b').hops === 2 &&
      found.get('L-b').rank < found.get('L-a').rank &&
      !found.has('L-d') &&
      found.get('F:src/basket.js').hops === 0,
    [...found].map(([id, v]) => [id, Math.round(v.rank * 100) / 100, v.hops, v.via]),
  );
  const t = team({
    seed: {
      learning: {
        contribute: false,
        ledger: [
          lesson('L-a', 'Pin the empty basket before changing how the total is worked out.', { ep: 'E-1' }),
          lesson('L-b', 'Round money once, at the end, in pence.', { ep: 'E-1' }),
          {
            ...lesson('L-c', 'They put the team right: "delivery is free over fifty".'),
            kind: 'correction',
            about: 'E-1',
            cites: 'delivery is free over fifty',
          },
        ],
      },
      episodes: [
        {
          id: 'E-1',
          kind: 'build',
          title: 'Charge delivery on small orders',
          at: Date.now() - 9000,
          seconds: 300,
          mode: 'developer',
          seat: 'operations',
          rounds: 2,
          outcome: 'landed',
        },
      ],
    },
  });
  const got = t.core.ask('We are doing the charge for delivery on small orders differently now');
  check(
    'a question that names a piece of work reaches what was learned in it and what the person put right there, though neither shares a telling word with it',
    ['L-a', 'L-b', 'L-c'].every((id) => got.some((v) => v.ref && v.ref.id === id)) &&
      got.every((v) => v.kind !== 'experience') &&
      t.core.hindsight().links >= 4,
    got.map((v) => [v.ref && v.ref.id, v.from]),
  );
  store.delete(KEY);
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
