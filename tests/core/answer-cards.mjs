// answer-cards.mjs - the chat's core in Node, in Simple, with a stand-in engine: a looked-up answer gets a card made only from its own figures;
// and a seat that is only being talked to is shown the ticket the customer attached.   node tests/core/answer-cards.mjs
const store = new Map([['familyoffice.mode', 'simple']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got).slice(0, 400)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const asks = [];
const ANSWER = 'In Lisbon it is 18°C now with light rain this afternoon, and a high of 21°C [1]. Tomorrow is dry.';
const CARD =
  '{"kind":"weather","icon":"rain","title":"Lisbon","big":"18°C","small":"light rain this afternoon","rows":[["High","21°C"],["Wind","35 km/h"],["Tomorrow","dry"]]}';
const engineOf = (answer = ANSWER, card = CARD) => ({
  route: async () => ({ kind: 'research', seat: 'operations' }),
  tool: async (o) =>
    o.tool === 'search'
      ? {
          ok: true,
          from: 'a stand-in',
          results: [{ title: 'Lisbon weather', url: 'https://weather.example/lisbon', snippet: '18 and rain' }],
        }
      : o.tool === 'read'
        ? { ok: true, status: 200, text: 'Lisbon: 18°C, light rain this afternoon, high 21°C. '.repeat(8), chars: 400 }
        : { ok: false },
  seat: async (o) => {
    const ask = o.messages[o.messages.length - 1].content;
    asks.push({ seat: o.seat, ask, system: String(o.system || '') });
    const say = /Would a small card help/.test(ask)
      ? 'Here: ' + card
      : /WHAT A WEB SEARCH FOUND/.test(ask)
        ? answer
        : 'I would check the temperature against a second source.';
    if (o.onDelta) o.onDelta(say);
    return {};
  },
});
const core = createTeamCore({ persist: false });
core.useEngine(engineOf());
core.send('What is the weather in Lisbon today?');
await wait(2500);
const chat = core.snapshot().chat;
const m = chat.find((x) => x.card);
check(
  'a looked-up answer in Simple is given a card: a symbol, the place, the figure that matters and a few words',
  !!m &&
    m.card.icon === 'rain' &&
    m.card.title === 'Lisbon' &&
    m.card.big === '18°C' &&
    m.card.small === 'light rain this afternoon' &&
    /18°C now/.test(m.text),
  m && m.card,
);
check(
  'the card is the reply: the words are kept and marked not to be shown, and nothing is left veiled',
  !!m && m.cardOnly === true && !chat.some((x) => x.veil),
  chat.map((x) => [x.by, !!x.card, !!x.cardOnly, !!x.veil]),
);
check(
  'a figure on the card that the answer never gave is left off, and a line with no figure in it is kept',
  !!m && JSON.stringify(m.card.rows) === '[["High","21°C"],["Tomorrow","dry"]]',
  m && m.card.rows,
);
// Developer: a ticket the customer attached is in front of a seat that is only being talked to
const cardOf = async (answer, card) => {
  const c = createTeamCore({ persist: false });
  c.useEngine(engineOf(answer, card));
  c.send('Is the Louvre open on Tuesdays?');
  await wait(2500);
  return (c.snapshot().chat.find((x) => x.card) || {}).card || null;
};
const LOUVRE = 'The Louvre is closed on Tuesdays. On other days it is open from 9:00 to 18:00 [1].';
const worded = await cardOf(
  LOUVRE,
  '{"kind":"times","icon":"clock","title":"Louvre opening hours","big":"Closed Tuesdays","small":"open 9:00 to 18:00 on other days","rows":[["Usual hours","9:00 to 18:00"],["Late night","21:45"]]}',
);
check(
  'a card whose main line is words, not a figure, is kept when the answer says those words; a row with a figure the answer never gave is still left off',
  !!worded && worded.big === 'Closed Tuesdays' && JSON.stringify(worded.rows) === '[["Usual hours","9:00 to 18:00"]]',
  worded,
);
check(
  'a card whose main line the answer never said is not shown',
  (await cardOf(
    LOUVRE,
    '{"kind":"times","icon":"clock","title":"Louvre opening hours","big":"Open every day","small":"","rows":[]}',
  )) === null,
  null,
);
// the owner's own case: a bunny, celery, and the hazards
const replyOf = async (answer, card) => {
  const c = createTeamCore({ persist: false });
  c.useEngine(engineOf(answer, card));
  c.send('Can a bunny eat celery?');
  await wait(2500);
  return c.snapshot().chat.find((x) => x.by !== 'you' && /celery/.test(x.text)) || {};
};
const LINKED = await replyOf(
  'Yes, a bunny can eat a little celery, cut into pieces 2 cm long, up to 3 times a week [1]. Too much causes loose droppings. Sources: https://rabbits.example/feeding/274087/celery-41 and rabbits.example/guide/9913',
  '{"kind":"facts","icon":"check","title":"Can a bunny eat celery?","big":"Yes, a little","rows":[["Pieces","2 cm long"],["How often","up to 3 times a week"]],"bad":["Too much causes loose droppings"]}',
);
check(
  "a number inside a web address is not one of the answer's figures: a card that carries the answer's own two is the reply",
  !!LINKED.card && LINKED.cardOnly === true,
  LINKED.card || LINKED,
);
const BUNNY =
  'Yes, a bunny can eat celery, in small amounts. Cut it into small pieces first: the long strings can choke a rabbit or block its gut. Too much causes loose droppings, so give a thumb-sized piece a few times a week [1].';
const bare = await replyOf(
  BUNNY,
  '{"kind":"steps","icon":"steps","title":"Feeding a bunny celery","items":["Cut it into small pieces","Give a thumb-sized piece","A few times a week"]}',
);
check(
  'an answer that gives a warning is not replaced by a card that leaves the warning out: the words are shown',
  !bare.card && !bare.cardOnly && !bare.veil && /choke/.test(bare.text || ''),
  bare,
);
const full = await replyOf(
  BUNNY,
  '{"kind":"facts","icon":"check","title":"Can a bunny eat celery?","big":"Yes, in small amounts","good":["A thumb-sized piece a few times a week"],"bad":["Too much causes loose droppings"],"warn":"The long strings can choke a rabbit or block its gut: cut it into small pieces","note":"Made up: ask a vet about 50 grams"}',
);
check(
  'a card that carries the answer, its upside, its downside and its warning is the reply; a note the answer never gave is left off',
  !!full.card &&
    full.cardOnly === true &&
    full.card.big === 'Yes, in small amounts' &&
    full.card.good.length === 1 &&
    full.card.bad.length === 1 &&
    /choke a rabbit/.test(full.card.warn) &&
    full.card.note === '',
  full.card,
);
check(
  'a seat that answers is told to answer the question first, then the upsides, the downsides and any warning',
  asks.some(
    (a) =>
      /Answer the question they asked first/.test(a.system) &&
      /upsides, the downsides and any warning/.test(a.system) &&
      /never left out/.test(a.system),
  ),
  asks.slice(0, 2).map((a) => a.system.slice(-260)),
);
// the rest of the team chimes in: after an answer, at most two of the others add a line of their own; one that passes is not shown
{
  const c = createTeamCore({ persist: false });
  c.adopt({ kind: 'claude' }); // the full form of the question; a local model's short form is in conversation.mjs
  const heard = [];
  c.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      heard.push({ seat: o.seat, ask, system: String(o.system || '') });
      const say = /Would any of them have something genuinely useful to add/.test(ask)
        ? '[{"seat":"steward","point":"the strings are a choking risk"},{"seat":"ask","point":"nothing really"},{"seat":"master","point":"a third one, which is one too many"},{"seat":"nobody","point":"x"}]'
        : /You are chiming in/.test(ask)
          ? o.seat === 'steward'
            ? 'One thing: pull the strings off first, they can choke a rabbit.'
            : 'PASS'
          : /Would a small card help/.test(ask)
            ? '{"kind":"none"}'
            : 'Yes, a little celery is fine for a bunny, a few times a week, as long as most of what it eats is still hay and it has fresh water.';
      if (o.onDelta) o.onDelta(say);
      return {};
    },
  });
  c.send('Can a bunny eat celery?');
  await wait(2600);
  const chat = c.snapshot().chat.filter((x) => x.by !== 'you');
  const named = createTeamCore({ persist: false });
  const told = [];
  check(
    'after an answer the others chime in when one has something to add: the one with a point speaks in its own line, and the one that passes is not shown',
    chat.length === 2 &&
      chat[0].by === 'overseer' &&
      chat[1].by === 'steward' &&
      chat[1].chime === true &&
      /pull the strings off/.test(chat[1].text) &&
      !chat.some((x) => /PASS/.test(x.text)),
    chat.map((x) => [x.by, x.text.slice(0, 60)]),
  );
  check(
    'at most two are asked to chime in, each is shown the question, the answer and its own point, and none is asked who is not on the team',
    heard
      .filter((h2) => /You are chiming in/.test(h2.ask))
      .map((h2) => h2.seat)
      .join() === 'steward,ask' &&
      heard.some(
        (h2) =>
          h2.seat === 'steward' &&
          /Can a bunny eat celery/.test(h2.ask) &&
          /the strings are a choking risk/.test(h2.ask),
      ),
    heard.map((h2) => [h2.seat, h2.ask.slice(0, 50)]),
  );
  named.useEngine({
    route: async () => ({ kind: 'talk', seat: 'overseer' }),
    seat: async (o) => {
      told.push(o.messages[o.messages.length - 1].content);
      if (o.onDelta)
        o.onDelta(
          'Hello! Good to see you. What are we sorting out today, then? Tell me and I will get the others on it.',
        );
      return {};
    },
  });
  named.send('hello');
  await wait(1200);
  check(
    'each of the five is told what it cares about, that it is taste and not a life story; and whoever is asked who would chime in is shown what each of the others cares about',
    heard.some(
      (h2) =>
        /Would any of them have something genuinely useful to add/.test(h2.ask) &&
        /Robin, who .*Cares about: whether a thing is really true/.test(h2.ask) &&
        /Jamie, who .*Cares about: how things look and feel/.test(h2.ask) &&
        /Pick the one whose subject it is/.test(h2.ask),
    ) &&
      /WHAT YOU CARE ABOUT: a day that runs to time/.test(heard[0].system) &&
      /tastes, not a life story/.test(heard[0].system),
    [heard[0].system.slice(-400)],
  );
  check(
    'nobody chimes in after a greeting',
    named.snapshot().chat.filter((x) => x.by !== 'you').length === 1 &&
      !told.some((a) => /something genuinely useful to add/.test(a)),
    told.map((a) => a.slice(0, 50)),
  );
}
store.set('familyoffice.mode', 'developer');
const dev = createTeamCore({ persist: false });
const seen = [];
dev.useEngine({
  route: async () => ({ kind: 'talk', seat: 'overseer' }),
  seat: async (o) => {
    seen.push(o.messages[o.messages.length - 1].content);
    if (o.onDelta) o.onDelta('It is APP-12, the Pay button cut off on phones.');
    return {};
  },
});
dev.focusTicket({
  key: 'APP-12',
  summary: 'Checkout button is cut off on phones',
  status: 'In Progress',
  description: 'On a phone 360 wide the Pay button is cut off.',
});
dev.send('What do you make of it?');
await wait(1200);
check(
  'a seat that is only being talked to is shown the attached ticket, and told that "it" means that ticket',
  seen.some(
    (a) =>
      /THE JIRA TICKET THE CUSTOMER HAS ATTACHED TO THIS CHAT/.test(a) &&
      /APP-12: Checkout button is cut off on phones/.test(a) &&
      /they mean this ticket/.test(a),
  ),
  seen.map((a) => a.slice(0, 160)),
);
// A DIRECT ANSWER (not looked up) that a card stands for: its words are never on the screen, at any moment, before the card is
{
  store.set('familyoffice.mode', 'simple');
  const LONG =
    'Yes, a bunny can eat celery, in small amounts. Cut it into pieces of 1 cm first, then offer 2 or 3 pieces. The strings can choke a rabbit, so never give a whole stalk. Start with one piece and wait a day.';
  const BUNNY =
    '{"kind":"facts","icon":"check","title":"Celery for a bunny","big":"Yes, in small amounts","small":"","items":["Cut it into pieces of 1 cm","Offer 2 or 3 pieces"],"warn":"The strings can choke a rabbit, so never give a whole stalk"}';
  const watch = (answer, card) => {
    const c = createTeamCore({ persist: false });
    const shown = [];
    c.on(() => {
      for (const x of c.snapshot().chat)
        if (x.by !== 'you' && x.text && !x.veil && !(x.card && x.cardOnly)) shown.push(x.text.slice(0, 40));
    });
    c.useEngine({
      route: async () => ({ kind: 'question', seat: 'overseer' }),
      seat: async (o) => {
        const ask = o.messages[o.messages.length - 1].content;
        const say = /Would a small card help/.test(ask) ? card : /useful to add/.test(ask) ? '[]' : answer;
        if (o.onDelta) for (const piece of say.match(/.{1,25}/gs)) o.onDelta(piece);
        return {};
      },
    });
    return { c, shown };
  };
  const carded = watch(LONG, BUNNY);
  carded.c.send('Can a bunny eat celery?');
  await wait(2500);
  const reply = carded.c.snapshot().chat.find((x) => x.card);
  check(
    'a direct answer that a card stands for is never shown as words first: while it is written and while the card is drawn there are only the dots, then the card',
    !!reply && reply.cardOnly === true && !reply.veil && carded.shown.length === 0,
    { card: !!reply, shown: [...new Set(carded.shown)] },
  );
  const plain = watch(LONG, '{"kind":"none"}');
  plain.c.send('Can a bunny eat celery?');
  await wait(2500);
  const words = plain.c.snapshot().chat.find((x) => x.by !== 'you' && /bunny can eat celery/.test(x.text || ''));
  check(
    'when no card stands for it, the answer is shown whole, as words, and nothing is left hidden',
    !!words && !words.veil && !words.card && plain.shown.length > 0 && !plain.c.snapshot().chat.some((x) => x.veil),
    { words: !!words, veiled: plain.c.snapshot().chat.filter((x) => x.veil).length },
  );
}
// PICKS, WITH PICTURES: several named things, each under its own name with a picture the runner found for it
{
  store.set('familyoffice.mode', 'simple');
  const FILMS =
    'The top film this weekend is You Can See Everything, a documentary. Right behind it are Wildwood and Clayface. Some charts also list Moonrise Kingdom Come, which I could not confirm, so treat the order as rough and first check the cinema for showtimes, then choose.';
  const PICKS = JSON.stringify({
    kind: 'picks',
    icon: 'star',
    title: 'Top films at the cinema',
    big: '',
    picks: [
      { name: 'You Can See Everything', note: 'a documentary' },
      { name: 'Wildwood', note: 'right behind it' },
      { name: 'Clayface', note: 'right behind it' },
      { name: 'A Film The Answer Never Named', note: 'made up' },
    ],
    note: 'Treat the order as rough',
  });
  const asked = [];
  const c = createTeamCore({ persist: false });
  c.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    tool: async (o) => {
      asked.push(o);
      return {
        ok: true,
        pictures: o.names.map((name) =>
          name === 'Clayface'
            ? { ok: false, name }
            : {
                ok: true,
                name,
                url: 'https://upload.wikimedia.org/' + encodeURIComponent(name) + '.jpg',
                page: 'https://en.wikipedia.org/wiki/x',
                from: 'Wikipedia',
              },
        ),
      };
    },
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      const say = /Would a small card help/.test(ask) ? PICKS : /useful to add/.test(ask) ? '[]' : FILMS;
      if (o.onDelta) o.onDelta(say);
      return {};
    },
  });
  c.send('What films are on at the cinema this weekend?');
  await wait(2500);
  const card = (c.snapshot().chat.find((x) => x.card) || {}).card;
  check(
    'several named things are picks: each under the name the answer gave it, and one the answer never named is left off',
    !!card &&
      card.picks.map((p) => p.name).join('|') === 'You Can See Everything|Wildwood|Clayface' &&
      card.rows.length === 0 &&
      card.items.length === 0,
    card && card.picks,
  );
  check(
    'the runner is asked for a picture of each, told they are films; a pick has its picture and where it came from, and one with none found stands without',
    asked.length === 1 &&
      asked[0].tool === 'picture' &&
      asked[0].hint === 'film' &&
      asked[0].names.length === 3 &&
      !!card &&
      /You%20Can%20See%20Everything/.test(card.picks[0].image.url) &&
      card.picks[0].image.from === 'Wikipedia' &&
      !card.picks[2].image,
    [asked, card && card.picks],
  );
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
