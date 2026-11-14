// knows-you.mjs - THE TEAM GETS TO KNOW THE PERSON, and A CARD FOR ANY REPLY THAT SUITS ONE: the chat's core in Node, in Simple, with a
// stand-in engine that records every ask. What a person says of themself is kept only in their own words, is in front of every seat
// from then on, is graded, can be listed and forgotten in the chat; and a plain answer with steps in it gets a list card.
//   node tests/core/knows-you.mjs
const store = new Map([['familyoffice.mode', 'simple']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got).slice(0, 500)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const asks = [];
let NOTICE = 'NONE';
let ANSWER = 'How about a mushroom risotto?';
let CARD = '{"kind":"none"}';
let ROUTE = { kind: 'question', seat: 'operations' };
const core = createTeamCore({ persist: false });
core.useEngine({
  route: async () => ROUTE,
  seat: async (o) => {
    const ask = o.messages[o.messages.length - 1].content;
    asks.push({ seat: o.seat, ask, system: o.system || '' });
    const say = /Does it tell the team anything LASTING/.test(ask)
      ? NOTICE
      : /Would a small card help/.test(ask)
        ? CARD
        : ANSWER;
    if (o.onDelta) o.onDelta(say);
    return {};
  },
});
const you = () => core.snapshot().learning.ledger.filter((x) => x.kind === 'you');
const lasting = () => asks.filter((a) => /anything LASTING/.test(a.ask)).length;
const carded = () => asks.filter((a) => /Would a small card help/.test(a.ask)).length;
const last = () => {
  const c = core.snapshot().chat;
  return c[c.length - 1];
};

// 1. said in passing, kept in their own words
NOTICE = 'WHO: They are vegetarian.\nWHO: They live in Lisbon.\nLIKES: They like ponies and long walks.';
core.send('We are vegetarian and I live in Lisbon. What should we cook tonight?');
await wait(900);
check(
  'what a person says of themself in passing is kept, each thing on its own, and a line that is not their own words is not',
  you()
    .map((x) => x.text)
    .sort()
    .join(' | ') === 'They are vegetarian. | They live in Lisbon.',
  you().map((x) => x.text),
);
check('a short plain answer is not asked about a card', carded() === 0, carded());
// 2. in front of every seat from then on; a message that says nothing of the person is not read twice
ANSWER = 'A pear tart is lovely, and vegetarian too.';
core.send('What is a good dessert for tonight?');
await wait(900);
const seen = asks.filter((a) => /What is a good dessert/.test(a.ask) && !/anything LASTING/.test(a.ask)).pop();
check(
  'the next seat to speak is shown what the team has learned about the person, and told to fit its answer to them',
  !!seen &&
    /WHAT THE TEAM HAS LEARNED ABOUT THIS PERSON/.test(seen.ask) &&
    /- They are vegetarian\./.test(seen.ask) &&
    /- They live in Lisbon\./.test(seen.ask) &&
    /Do not recite it back/.test(seen.ask),
  seen && seen.ask.slice(0, 400),
);
check('a message that says nothing of the person is not read a second time', lasting() === 1, lasting());
// 3. graded like any lesson
const veg = you().find((x) => /vegetarian/.test(x.text));
const lis = you().find((x) => /Lisbon/.test(x.text));
check(
  'Hindsight grades it: shown each time, and used when the reply drew on it',
  veg.shown >= 1 && veg.used >= 1 && lis.shown >= 1 && !lis.used,
  [veg, lis],
);
// 4. theirs to see
const before = asks.length;
core.send('What do you know about me?');
await wait(300);
check(
  'asked what the team knows about them, Sam lists it and says how to have it forgotten, and no model is asked',
  last().by === 'overseer' &&
    /picked up about you/.test(last().text) &&
    /- They are vegetarian\./.test(last().text) &&
    /- They live in Lisbon\./.test(last().text) &&
    /forget that/i.test(last().text) &&
    asks.length === before,
  last().text,
);
// 5. and to remove, one at a time
core.send('Forget that I live in Lisbon');
await wait(300);
check(
  '"forget that ..." removes that one thing and says so',
  you()
    .map((x) => x.text)
    .join() === 'They are vegetarian.' && /^Forgotten: They live in Lisbon\./.test(last().text),
  [you().map((x) => x.text), last().text],
);
// 6. the same thing put differently replaces the earlier wording
NOTICE = 'WHO: They are a vegetarian and eat no meat.';
ANSWER = 'Noted. No meat it is.';
core.send('I am a vegetarian by the way, so I eat no meat at all');
await wait(900);
check(
  'the same thing said again in other words replaces the earlier wording; it is not kept twice',
  you().length === 1 && you()[0].text === 'They are a vegetarian and eat no meat.',
  you().map((x) => x.text),
);
// 7. a wish about the answers is kept as a ruling
core.send('That was too long');
await wait(600);
check(
  '"that was too long" is kept as how this person likes things, and is in force',
  core.snapshot().rulings.some((r) => !r.superseded && r.kind === 'likes-length' && /things kept shorter/.test(r.text)),
  core.snapshot().rulings.slice(0, 3),
);
// 8. their name, said in passing, is used to greet them
NOTICE = 'WHO: They are called Lucía.';
ANSWER = 'Hola Lucía.';
ROUTE = { kind: 'talk', seat: 'overseer' };
core.send('Me llamo Lucía y mi hermana viene mañana a cenar');
await wait(900);
core.send('hello again');
await wait(600);
const greet = asks.filter((a) => /hello again/.test(a.ask)).pop();
check(
  'a name said in passing is kept, and a greeting is told to use it',
  you().some((x) => /Lucía/.test(x.text)) && !!greet && /Their name is Lucía/.test(greet.ask),
  [you().map((x) => x.text), greet && greet.ask.slice(0, 200)],
);
// 9. everything, at once
core.send('Forget everything about me');
await wait(300);
check(
  '"forget everything about me" removes all of it, and what they asked the team to always do still stands',
  you().length === 0 &&
    /gone/.test(last().text) &&
    /still stands/.test(last().text) &&
    core.snapshot().rulings.some((r) => !r.superseded && r.kind === 'likes-length'),
  last().text,
);
// 10. a card for an answer with steps in it, which was not looked up
ROUTE = { kind: 'question', seat: 'operations' };
NOTICE = 'NONE';
ANSWER =
  'Happy to help with that. First, pick the date and book a table for ten. Then send the invitations two weeks ahead. Next, order the cake and check for allergies. Finally, confirm the numbers with the restaurant the day before, and bring candles.';
CARD =
  'Sure: {"kind":"list","icon":"check","title":"Birthday dinner for ten","big":"","small":"","rows":[],"items":["Pick the date and book a table","Send the invitations two weeks ahead","Order the cake and check allergies","Rent a pony for the garden"]}';
core.send('What do I need to sort out for a birthday dinner for ten?');
await wait(1200);
const m = core.snapshot().chat.find((x) => x.card && x.card.kind === 'list');
check(
  "an answer that was not looked up, with steps in it, gets a card: a list, each line the answer's own, and a line it never said left off",
  !!m &&
    m.card.icon === 'check' &&
    m.card.big === '' &&
    m.card.items.length === 3 &&
    !m.card.items.some((x) => /pony/.test(x)) &&
    m.card.title === 'Birthday dinner for ten',
  m && m.card,
);
// 11. Developer is not asked about cards, and the Soul's own remove works
store.set('familyoffice.mode', 'developer');
const n = carded();
NOTICE = 'WANTS: They want small diffs they can review on a phone.';
core.send('I usually review on my phone, so keep our diffs small');
await wait(900);
const learned = you().map((x) => x.text);
const gone = learned.length ? core.forget(you()[0].id) : false;
check(
  "in Developer the team learns about its customer too, no card is asked for, and the Soul page's Forget removes what was learned",
  carded() === n &&
    learned.join() === 'They want small diffs they can review on a phone.' &&
    gone === true &&
    you().length === 0,
  [carded(), n, learned, gone],
);
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
