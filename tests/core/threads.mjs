// threads.mjs - ONE OF THE FIVE SETS ANOTHER GOING (src/js/team/thread.js), and what a reply carries under it. The chat's core in
// Node with a stand-in engine. A teammate's doubt is taken up by the one who answered, who says so and has it looked up; a
// correction is taken up by saying the answer again, put right; a tip is left as it is; and it happens once for each thing the
// person says. A teammate who only agrees leaves a mark. A plan may carry the sections its planner chose; a comparison is a card.
//   node tests/core/threads.mjs
const store = new Map([['familyoffice.mode', 'simple']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
const { readAdded, focusOf } = await import('../../src/js/team/thread.js');
const { planSections } = await import('../../src/js/team/build.js');
const { cardFrom } = await import('../../src/js/team/cards.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 600)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// a team whose first answer, whose teammate's line and whose second answer are given
const team = ({ answer, added, again = '', fact = '', claude = false, tool = true, seat = 'overseer' }) => {
  const looked = [];
  const asked = [];
  const core = createTeamCore({ persist: false });
  if (claude) core.adopt({ kind: 'claude' });
  core.useEngine({
    route: async () => ({ kind: 'question', seat }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      asked.push(ask);
      const say = /Could ONE teammate|Would any of them have something genuinely useful/.test(ask)
        ? added
          ? '[{"seat":"steward","point":"one thing to add or check here"}]'
          : '[]'
        : /You are chiming in/.test(ask)
          ? added
          : /Give your answer again, put right/.test(ask)
            ? again
            : /Give only the fact, in one short line/.test(ask)
              ? fact
              : /Would a small card|anything LASTING/.test(ask)
                ? 'NONE'
                : answer;
      if (o.onDelta) o.onDelta(say);
      return {};
    },
    ...(tool
      ? {
          tool: async (t) => {
            looked.push(t.tool + ':' + (t.q || ''));
            return { ok: false, why: 'no network in this check' };
          },
        }
      : {}),
  });
  const chat = () => core.snapshot().chat;
  return { core, looked, asked, chat };
};

// ---- how what a teammate adds is read
check(
  'what a teammate adds is read as a doubt, a correction or something added',
  readAdded('Those two films are guesses for now, so wait for the app.') === 'doubts' &&
    readAdded("I'd check that: it may have changed since last year.") === 'doubts' &&
    readAdded('Actually, it is the Tuesday market, not the Thursday one.') === 'corrects' &&
    readAdded('Salt the water well, like the sea.') === 'adds',
  [
    readAdded('Those two films are guesses for now, so wait for the app.'),
    readAdded('Salt the water well, like the sea.'),
  ],
);
check(
  'a tip that opens "Just check" is not a doubt about the answer; a figure or a name it questions is',
  readAdded('Just check the dog for heavy panting, drooling or vomiting. If you see any, cool them down.') === 'adds' &&
    readAdded('Just check: antibiotics only work on bacterial infections, so never use them for a cold.') === 'adds' &&
    readAdded('Just check the "about 19°F in 10 minutes" figure. Heating depends on sun and car colour.') ===
      'doubts' &&
    readAdded('Just check Westfork is the Regal you mean.') === 'doubts',
  [readAdded('Just check the dog for heavy panting.'), readAdded('Just check Westfork is the Regal you mean.')],
);
{
  const { sentenceCap, firstSentences } = await import('../../src/js/team/base.js');
  check(
    'a sentence limit the person set is read from the rulings in force, and a reply is cut at it',
    sentenceCap([{ text: 'Keep every answer to three sentences at most.' }]) === 3 &&
      sentenceCap([{ text: 'Call them Dana.' }]) === 0 &&
      sentenceCap([{ text: 'Answer in no more than 2 sentences.' }]) === 2 &&
      firstSentences('It boils at 100.5 degrees, e.g. at sea level. Two! Three? Four. Five.', 3) ===
        'It boils at 100.5 degrees, e.g. at sea level. Two! Three?' &&
      firstSentences('One. Two.', 3) === 'One. Two.',
    [
      sentenceCap([{ text: 'Keep every answer to three sentences at most.' }]),
      firstSentences('One. Two. Three. Four.', 3),
    ],
  );
}
{
  const { unseenIn, pathsIn, NAMES_CAUSE } = await import('../../src/js/team/manners.js');
  check(
    'a place the team offers to look, and a web address it would read, is not a file it claims to have seen; a file it speaks of is',
    pathsIn(
      'Send me the file, or its path if it lives somewhere else, such as /etc/nginx/nginx.conf or a conf.d directory.',
    ).length === 0 &&
      pathsIn("I'd fetch rfc-editor.org/rfc/rfc9110.html and read it directly.").length === 0 &&
      unseenIn('The third block in conf/sites/shop.conf proxies to the API.', 'What does the third server block do?')
        .length === 1 &&
      !NAMES_CAUSE.test('Until the cause is confirmed, I would treat the last change as unproven.') &&
      NAMES_CAUSE.test('The cause was a missing migration.'),
    [pathsIn('such as /etc/nginx/nginx.conf'), pathsIn('The block in conf/sites/shop.conf proxies.')],
  );
}
check(
  'what is searched for is what was asked, with the names and numbers of the doubt that were not in it',
  focusOf(
    'what is showing at the Regal today?',
    'Just check Westfork is the Regal you mean. Those two films are guesses.',
  ) === 'what is showing at the Regal today Westfork',
  focusOf(
    'what is showing at the Regal today?',
    'Just check Westfork is the Regal you mean. Those two films are guesses.',
  ),
);

// ---- Simple: a doubt is taken up
{
  const t = team({
    answer:
      'The Regal is a big thirteen-screen theater, and it is most likely showing Ebenezer and How to Rob a Bank today.',
    added: 'Just check Westfork is the Regal you mean. Also, those two films are guesses for now, so wait for the app.',
  });
  t.core.send('what is showing at the Regal today?');
  await wait(2200);
  const chat = t.chat();
  const first = chat.find((m) => m.by === 'overseer' && /thirteen-screen/.test(m.text));
  const took = chat.find((m) => m.thread === 'took');
  check(
    'in Simple, a teammate doubts the answer and the one who gave it takes it up: it says so, by name, and the team looks it up',
    !!took &&
      took.by === 'overseer' &&
      /^Good catch, Robin\. Let me look that up properly/.test(took.text) &&
      t.looked.some((x) => /^search:.*Regal.*Westfork/.test(x)),
    [took && took.text, t.looked],
  );
  check(
    'the first answer stays where it was said, marked as replaced',
    !!first && first.superseded === true,
    first && first.superseded,
  );
  const before = chat.length;
  t.core.send('ok, and what about tomorrow at the same Regal theater in Westfork?');
  await wait(2200);
  check(
    'it happens once for each thing the person says: the next thing they say can be taken up again, and no more than once',
    t.chat().filter((m) => m.thread === 'took').length === 2 && t.chat().length > before,
    t.chat().filter((m) => m.thread === 'took').length,
  );
}
// ---- Simple: a correction is taken up by saying it again
{
  const t = team({
    answer: 'The farmers market in the square is on Thursday mornings, from eight until about one, all year round.',
    added: 'Actually, it is the Tuesday market in the square. Thursday is the one by the station.',
    again: "Robin's right: the one in the square is on Tuesday mornings, eight until one.",
  });
  t.core.send('when is the farmers market in the square?');
  await wait(2200);
  const chat = t.chat();
  const again = chat.find((m) => m.thread === 'again');
  const told = t.asked.find((a) => /Give your answer again, put right/.test(a)) || '';
  check(
    'a correction is taken up by the one who answered saying it again, put right, told to open with what changed and to whom',
    !!again &&
      again.by === 'overseer' &&
      /^Robin's right/.test(again.text) &&
      /Open by saying in a few words what changes, to Robin by name/.test(told) &&
      t.looked.length === 0 &&
      chat.find((m) => /Thursday mornings/.test(m.text)).superseded === true,
    [again && again.text, told.slice(0, 200), t.looked],
  );
}
// ---- a tip is left as it is
{
  const t = team({
    answer: 'Go with a simple garlic and olive oil spaghetti: fifteen minutes, and you have everything for it already.',
    added: 'Salt the water well, like the sea, and keep a mug of it back for the sauce.',
  });
  t.core.send('whats a good pasta for tonight');
  await wait(2000);
  check(
    'something added that is neither a doubt nor a correction sets nobody going',
    !t.chat().some((m) => m.thread) && !t.chat().some((m) => m.superseded) && t.chat().some((m) => m.chime),
    t.chat().map((m) => [m.by, m.thread || '', !!m.chime]),
  );
}
// ---- Developer: the same, in its own words, and not on the web for the customer's own system
{
  store.set('familyoffice.mode', 'developer');
  const long =
    'Use a queue with a worker: retries and back-pressure come with it, and a cron job on the api box gives you neither. It costs one more thing to run and to watch, which is the trade you are making here.';
  const t = team({
    answer: long,
    added: "I'd check that: the queue's pricing may have changed, and that is a guess.",
    seat: 'operations',
  });
  t.core.send(
    'Which is cheaper to run for nightly invoices, a cron job on the api box or a queue with a worker in docker?',
  );
  await wait(2400);
  const took = t.chat().find((m) => m.thread === 'took');
  check(
    "in Developer one more voice may add to an answer, and a doubt is taken up in a team channel's words",
    !!took &&
      took.by === 'operations' &&
      took.text === 'The Steward is right to ask. Checking it now.' &&
      t.looked.length > 0,
    [took && took.text, t.looked, t.chat().map((m) => m.by)],
  );
  const own = team({
    answer:
      'The deploy most likely stopped at the migration step, because that is the step that changes the schema before the new code is running, and it is the usual place.',
    added: "I'd check that: it is a guess until someone has read the logs of the run.",
    again: 'The Steward is right: I have not seen the logs. Paste the failed step and I will read it.',
    seat: 'operations',
  });
  own.core.send(
    "Why did last night's deploy fail on our staging pipeline, and what would you look at first to find out?",
  );
  await wait(2400);
  check(
    "a doubt about the customer's own system is not looked up on the web: the answer is given again, saying what would have to be seen",
    own.looked.length === 0 && own.chat().some((m) => m.thread === 'again' && /have not seen the logs/.test(m.text)),
    [own.looked, own.chat().map((m) => [m.by, m.thread || ''])],
  );
  store.set('familyoffice.mode', 'simple');
}
// ---- a teammate who has checked it and found it right leaves a mark
{
  const t = team({
    answer: 'Allow two to three days in the fridge for a 5 kg bird, on a tray, low down.',
    added: '',
    fact: '2.5 days',
  });
  t.core.send('How long does a 5 kg turkey take to defrost in the fridge?');
  await wait(2000);
  const answer = t.chat().find((m) => m.by === 'overseer');
  check(
    'the fact-checker who agrees does not write to say so: it leaves a mark on the answer, and the answer says it was checked',
    !!answer &&
      (answer.reactions || []).some((r) => r.by === 'steward' && r.mark === 'checked') &&
      !!answer.extras &&
      answer.extras.origin.how === 'memory' &&
      answer.extras.origin.checked === true &&
      !t.chat().some((m) => m.by === 'steward'),
    answer && [answer.reactions, answer.extras],
  );
}
// ---- what a reply carries under it is kept on the message
{
  const t = team({
    answer: 'Six to seven minutes in boiling water, straight from the fridge. Do you want it runny or just set?',
    added: '',
    fact: '6 minutes',
  });
  t.core.send('how long do I boil an egg for a soft yolk?');
  await wait(2000);
  const m = t.chat().find((x) => x.by === 'overseer');
  check(
    'a reply keeps what goes under it: a timer for the six minutes it named, the two answers its question offers, and where it came from',
    !!m &&
      !!m.extras &&
      m.extras.timer.seconds === 360 &&
      JSON.stringify(m.extras.replies) === '["Runny","Just set"]' &&
      m.extras.origin.how === 'memory',
    m && m.extras,
  );
  await t.core.checkThis(m.id);
  await wait(600);
  check(
    '"Check this" has an answer from memory looked up, and the answer then says it was checked',
    t.looked.some((x) => /^search:.*boil an egg/.test(x)) &&
      t.chat().find((x) => x.id === m.id).extras.origin.checked === true,
    [t.looked, t.chat().find((x) => x.id === m.id).extras.origin],
  );
}
// ---- the sections a plan may carry, and a comparison as a card
{
  const raw =
    '1. The basket total includes delivery.\n2. An empty basket shows no total.\n3. The total is shown in pounds.\nFILES: src/basket.js, tests/basket.test.js\nRISK: rounding the total twice; undone by reverting the one commit\nCASES: empty basket | one item | free delivery over 50\nLEAD: 1';
  const s = planSections(raw, 3);
  check(
    'a planner may add files, the risk, the cases and which requirement matters most; each is kept only when it says something',
    !!s &&
      s.files.join() === 'src/basket.js,tests/basket.test.js' &&
      /rounding the total twice/.test(s.risk) &&
      s.cases.length === 3 &&
      s.lead === 1 &&
      planSections('1. One thing.\nFILES: everything\nRISK: none\nCASES: one\nLEAD: 9', 1) === null,
    [s, planSections('1. One thing.\nFILES: everything\nRISK: none\nCASES: one\nLEAD: 9', 1)],
  );
  const answer =
    'The Kindle is lighter and lasts weeks on a charge, at about 100. The iPad does far more and has a brighter screen, at about 350, and lasts a day.';
  const card = cardFrom(
    {
      kind: 'compare',
      title: 'Kindle or iPad',
      compare: {
        options: ['Kindle', 'iPad'],
        rows: [
          ['Battery', 'lasts weeks on a charge', 'lasts a day'],
          ['Price', 'about 100', 'about 350'],
          ['Colour', 'comes in gold', 'comes in silver'],
        ],
      },
    },
    answer,
  );
  check(
    'two options weighed on the same points are a card side by side, and a row the answer does not bear out is left off',
    !!card &&
      card.compare.options.join() === 'Kindle,iPad' &&
      card.compare.rows.length === 2 &&
      card.compare.rows[1][1] === 'about 100' &&
      card.rows.length === 0,
    card,
  );
}
// ---- a blank slate checks a fact: the team's own model, opened empty, with a brief and nothing else
{
  const { SLATES } = await import('../../src/js/team/slate.js');
  const seen = [];
  const looked = [];
  const core = createTeamCore({ persist: false });
  core.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      seen.push({ system: o.system || '', ask });
      const say =
        o.system === SLATES.fact
          ? 'Yes, in small amounts'
          : o.system === SLATES.doubt
            ? 'WRONG: No, grapes are toxic to dogs even in small amounts'
            : /Could ONE teammate|Would a small card|anything LASTING/.test(ask)
              ? '[]'
              : 'Yes, a few grapes make a fine treat for a dog now and then, as long as they are washed first.';
      if (o.onDelta) o.onDelta(say);
      return {};
    },
    tool: async (t) => {
      looked.push(t.tool + ':' + (t.q || ''));
      return { ok: false, why: 'no network in this check' };
    },
  });
  core.send('Can my dog have a few grapes as a treat?');
  await wait(2400);
  const fact = seen.find((x) => x.system === SLATES.fact);
  const doubt = seen.find((x) => x.system === SLATES.doubt);
  const robin = core.snapshot().chat.find((m) => m.by === 'steward' && m.chime);
  check(
    'a fact is checked by a blank slate: the same model given a brief and the question and nothing else: no persona, no chat, not the answer',
    !!fact &&
      !/You are (Sam|Robin|Alex|Jamie|Pat)|group chat|Family Office/.test(fact.system) &&
      !/fine treat/.test(fact.ask) &&
      /you know nothing else/.test(fact.system),
    fact && [fact.system.slice(0, 120), fact.ask.slice(0, 120)],
  );
  check(
    'when that slate agrees and the question is one someone will act on, a second is opened whose only job is to break the claim; it is shown the claim',
    !!doubt &&
      /The claim: "Yes, a few grapes make a fine treat/.test(doubt.ask) &&
      /find what is wrong with the claim/.test(doubt.system),
    doubt && doubt.ask.slice(0, 200),
  );
  check(
    'the doubter said no where the answer said yes: the fact-checker says so in the chat, the answer is marked as replaced, and the team looks it up',
    !!robin &&
      /I'd have said No, grapes are toxic to dogs/.test(robin.text) &&
      looked.some((x) => /^search:.*grapes/.test(x)) &&
      core.snapshot().chat.find((m) => /fine treat/.test(m.text)).superseded === true,
    [robin && robin.text, looked],
  );
  // a question nobody acts on opens one slate, not two
  const quiet = [];
  const plain = createTeamCore({ persist: false });
  plain.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    seat: async (o) => {
      quiet.push(o.system || '');
      const say =
        o.system === SLATES.fact
          ? '1889'
          : /"\[/.test('')
            ? ''
            : 'The Eiffel Tower opened in 1889, for the World Fair in Paris that year, and was meant to stand twenty years.';
      if (o.onDelta)
        o.onDelta(
          o.system === SLATES.fact
            ? '1889'
            : /Could ONE teammate|Would a small card|anything LASTING/.test(o.messages[o.messages.length - 1].content)
              ? '[]'
              : say,
        );
      return {};
    },
    tool: async () => ({ ok: false }),
  });
  plain.send('How old is the Eiffel Tower, when did it open?');
  await wait(1800);
  check(
    'a question nobody will act on opens the one slate and no doubter, and an answer the slate agrees with stands, marked as checked',
    quiet.filter((x) => x === SLATES.fact).length === 1 &&
      quiet.filter((x) => x === SLATES.doubt).length === 0 &&
      (plain.snapshot().chat.find((m) => m.by === 'overseer').reactions || []).some((r) => r.mark === 'checked'),
    quiet.map((x) => x.slice(0, 30)),
  );
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
