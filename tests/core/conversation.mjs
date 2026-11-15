// conversation.mjs - THE CONVENTIONS OF A CONVERSATION: the chat's core in Node, with a stand-in engine that records what every seat
// is told. How a person writes is read from their own messages (no model is asked) and each seat is told what that asks of its
// reply; the room has manners of its own in each mode; and in Developer the team works out whether it is talking to an engineer or
// to someone starting out, and talks to each as their kind talks.
//   node tests/core/conversation.mjs
const store = new Map([['familyoffice.mode', 'simple']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
const { registerOf, mannersNote, withoutRepeats, withoutSignOff } = await import('../../src/js/team/manners.js');
const { picksIn } = await import('../../src/js/team/cards.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. how a person writes, read from their words alone
{
  const casual = registerOf(['hey whats a good pasta for tonight']);
  check(
    'a short, lower-case message that opens with "hey" is read as short, casual and a greeting',
    casual.length === 'short' && casual.tone === 'casual' && casual.greets && !casual.thanks,
    casual,
  );
  const formal = registerOf([
    'Good afternoon. I would like to organise a dinner for twelve colleagues near the theatre; could you please advise?',
  ]);
  check(
    'a formal message in British spelling is read as formal and British',
    formal.tone === 'formal' && formal.spelling === 'british',
    formal,
  );
  check(
    'American spelling is read as American, and one word that is only sometimes British settles nothing',
    registerOf(['What is your favorite color for a gray apartment?']).spelling === 'american' &&
      registerOf(['We are going on holiday in June']).spelling === '',
    [
      registerOf(['What is your favorite color for a gray apartment?']),
      registerOf(['We are going on holiday in June']),
    ],
  );
  const thanks = registerOf(['Where can I park near the station on a Sunday morning?', 'thanks!']);
  check('"thanks!" is read as thanks; a question with "thanks" in it is not', thanks.thanks, thanks);
  check(
    'a question that ends "thanks" is still a question',
    !registerOf(['Can you find me a plumber for tomorrow? Thanks']).thanks,
    registerOf(['Can you find me a plumber for tomorrow? Thanks']),
  );
  const heavy = registerOf([
    'My dad passed away last week and I have to write something for the funeral lol I cannot even',
  ]);
  check('something heavy is read as heavy, and never as joking', heavy.heavy && !heavy.joking, heavy);
  const rush = registerOf(['quick, what temp for roast chicken? 😅']);
  check('a hurry and an emoji are both read', rush.hurried && rush.emoji, rush);
  check('nothing written, nothing read', registerOf([]) === null && mannersNote(null) === '', registerOf([]));
  const note = mannersNote(heavy, { simple: true, going: true });
  check(
    'for something heavy the seat is told to be kind first and to drop the jokes, and is not told to play along or to match a casual tone',
    /Something is weighing on them/.test(note) &&
      /Keep jokes, exclamation marks and silver linings out/.test(note) &&
      !/play along/.test(note) &&
      !/write casually/.test(note),
    note,
  );
}

// ---- 1b. what a small local model really writes
{
  const pool = ['steward', 'operations', 'ask', 'master'];
  const names = { steward: 'Robin', operations: 'Alex', ask: 'Jamie', master: 'Pat' };
  const noisy =
    '[]\n</think>[]\n</think>[{"seat":"Alex","point":"Add a splash of pasta water to loosen the sauce"}]\n\`\`\`';
  const got = picksIn(noisy, pool, (id) => names[id]);
  check(
    'who was picked is read from a reply that thinks aloud first, fences its JSON and names the person in place of the seat',
    got.length === 1 && got[0].seat === 'operations' && /pasta water/.test(got[0].point),
    got,
  );
  check(
    'a reply with no pick in it picks nobody, and one that names someone not on the team is left out',
    picksIn('[]\nThe answer already covers it.', pool, (id) => names[id]).length === 0 &&
      picksIn('[{"seat":"Morgan","point":"x y z"}]', pool, (id) => names[id]).length === 0,
    picksIn('[]\nThe answer already covers it.', pool, (id) => names[id]),
  );
  const before = ['No, it is not safe. Never leave them alone in a parked car on a warm day.'];
  const again =
    'Ten minutes can be enough to cause serious harm. Never leave them alone in a parked car on a warm day.';
  check(
    'a sentence already said in the chat, word for word, is not said again; the rest of the reply stands',
    withoutRepeats(again, before) === 'Ten minutes can be enough to cause serious harm.',
    withoutRepeats(again, before),
  );
  check(
    'a reply that is nothing but that sentence is left as it is, and so is a short one',
    withoutRepeats(before[0].split('. ')[1], before) === before[0].split('. ')[1] &&
      withoutRepeats('No, it is not safe.', before) === 'No, it is not safe.',
    withoutRepeats(before[0].split('. ')[1], before),
  );
}

check(
  'an answer does not end by offering more help: that last sentence is taken off, and a question or a lone sentence is left',
  withoutSignOff('Go for carbonara: quick and rich. Let me know if you need the recipe!') ===
    'Go for carbonara: quick and rich.' &&
    withoutSignOff('Go for carbonara. Do you eat pork?') === 'Go for carbonara. Do you eat pork?' &&
    withoutSignOff('Let me know if you need the recipe!') === 'Let me know if you need the recipe!',
  withoutSignOff('Go for carbonara: quick and rich. Let me know if you need the recipe!'),
);

// ---- 2. Simple: each seat is told how this person writes, and the room has a group chat's manners
{
  const asks = [];
  let ROUTE = { kind: 'question', seat: 'operations' };
  let ANSWER = 'Go for a cacio e pepe: three ingredients, twenty minutes, and it tastes like you tried much harder.';
  const core = createTeamCore({ persist: false });
  core.adopt({ kind: 'claude' }); // the full wording is what a team on Claude Code is given (a local model's is section 4)
  core.useEngine({
    route: async () => ROUTE,
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      asks.push({ seat: o.seat, ask, system: o.system || '' });
      const say = /Would any of them have something genuinely useful/.test(ask)
        ? '[{"seat":"steward","point":"the pasta water needs salting or it falls flat"}]'
        : /You are chiming in/.test(ask)
          ? 'Alex has it. One thing though: salt the water properly or it falls flat.'
          : /Would a small card help|anything LASTING/.test(ask)
            ? 'NONE'
            : ANSWER;
      if (o.onDelta) o.onDelta(say);
      return {};
    },
  });
  const answerTo = (re) =>
    asks.filter((a) => re.test(a.ask) && !/Would a|anything LASTING|chiming in|Would any/.test(a.ask)).pop();

  core.send('hey whats a good pasta for tonight');
  await wait(1200);
  const first = answerTo(/good pasta/);
  check(
    'the seat that answers a casual hello is told to say hello back, to keep it short and to be as relaxed as they are',
    !!first &&
      /HOW THIS PERSON WRITES, AND WHAT THAT ASKS OF YOU/.test(first.ask) &&
      /said hello\. Say it back in a word or two/.test(first.ask) &&
      /write short messages/.test(first.ask) &&
      /They write casually\. So do you/.test(first.ask) &&
      /never mention it/.test(first.ask),
    first && first.ask.slice(0, 900),
  );
  check(
    'and its own line carries the manners of a group chat: no repeating a teammate, naming them when building on them, one point, no lecture',
    !!first &&
      /THE MANNERS OF A GROUP CHAT/.test(first.system) &&
      /never say it again/.test(first.system) &&
      /say their name and do it kindly/.test(first.system) &&
      /One point to a message/.test(first.system) &&
      /Do not correct how they write/.test(first.system),
    first && first.system.slice(0, 300),
  );
  const chime = asks.find((a) => /You are chiming in/.test(a.ask));
  check(
    'a teammate who chimes in is told how this person writes too, and that it may name the teammate it builds on',
    !!chime && /HOW THIS PERSON WRITES/.test(chime.ask) && /you can name them in passing/.test(chime.ask),
    chime ? chime.ask.slice(0, 500) : asks.map((a) => a.ask.slice(0, 60)),
  );
  const chimed = core.snapshot().chat.find((m) => m.chime);
  check(
    'and what it says, naming its teammate, is in the chat under its own name',
    !!chimed && chimed.by === 'steward' && /^Alex has it/.test(chimed.text),
    chimed,
  );

  ANSWER = 'A bright green salad with lemon cuts through it nicely.';
  core.send('and what goes with it');
  await wait(1200);
  const second = answerTo(/what goes with it/);
  check(
    'once the chat is going, the next seat is told not to greet again or sign off',
    !!second &&
      /The chat is already going\. Do not open with a greeting/.test(second.ask) &&
      !/said hello/.test(second.ask),
    second && second.ask.slice(0, 700),
  );

  ANSWER = 'Three, yes: pasta, pecorino and pepper. The water does the rest.';
  core.send('Robin, is it really only three ingredients?');
  await wait(1200);
  const called = answerTo(/only three ingredients/);
  check(
    'a teammate spoken to by name, the way people do in a group chat, is the one who answers',
    !!called && called.seat === 'steward',
    called && called.seat,
  );

  ROUTE = { kind: 'talk', seat: 'operations' };
  ANSWER = 'Any time. Enjoy it.';
  const before = asks.length;
  core.send('thanks a lot!');
  await wait(1200);
  const thanked = asks.slice(before).find((a) => /thanks a lot/.test(a.ask) || /just said thanks/.test(a.ask));
  check(
    'thanks is taken in a few words: the seat is told to add nothing new and ask nothing',
    !!thanked && /just said thanks/.test(thanked.ask) && /Add nothing new, ask nothing/.test(thanked.ask),
    thanked ? thanked.ask.slice(0, 600) : asks.slice(before).map((a) => a.ask.slice(0, 80)),
  );

  ROUTE = { kind: 'question', seat: 'master' };
  ANSWER = 'I am so sorry about your dad. Start with one true thing about him, the way you would tell it to a friend.';
  core.send('My dad passed away last week and I have to write something for the funeral. Where do I even start?');
  await wait(1200);
  const heavy = answerTo(/funeral/);
  check(
    'when something is weighing on the person the seat is told to say one kind thing first, with no jokes',
    !!heavy &&
      /Something is weighing on them/.test(heavy.ask) &&
      /Keep jokes, exclamation marks and silver linings out/.test(heavy.ask),
    heavy && heavy.ask.slice(0, 700),
  );

  const two = createTeamCore({ persist: false });
  two.adopt({ kind: 'claude' });
  const told = [];
  two.useEngine({
    route: async () => ({ kind: 'question', seat: 'ask' }),
    seat: async (o) => {
      told.push(o.messages[o.messages.length - 1].content);
      if (o.onDelta) o.onDelta('A warm grey with one strong colour, on the wall the eye lands on first, would do it.');
      return {};
    },
  });
  two.send('What colour should I paint a small grey living room so it feels like the centre of the flat? 🎨');
  await wait(1200);
  const brit = told.find((t) => /living room/.test(t)) || '';
  check(
    'someone who spells the British way and uses emoji is answered in British spelling, with at most one emoji allowed',
    /They spell the British way/.test(brit) && /They use emoji\. One is fine/.test(brit),
    brit.slice(0, 700),
  );
}

// ---- 3. Developer: an engineer or someone starting out, worked out from what they write, and spoken to as their kind speaks
{
  store.set('familyoffice.mode', 'developer');
  const team = (claude = true) => {
    const told = [];
    const core = createTeamCore({ persist: false });
    if (claude) core.adopt({ kind: 'claude' });
    core.useEngine({
      route: async () => ({ kind: 'question', seat: 'operations' }),
      seat: async (o) => {
        told.push({ ask: o.messages[o.messages.length - 1].content, system: o.system || '' });
        if (o.onDelta) o.onDelta('A queue: retries and back-pressure come with it, and a cron job gives you neither.');
        return {};
      },
    });
    const say = async (text) => {
      core.send(text);
      await wait(1000);
      return (core.snapshot().dev || {}).level || '';
    };
    return { core, told, say };
  };

  const a = team();
  const level = await a.say(
    'Which is cheaper to run for nightly invoices, a cron job on the api box or a queue with a worker in docker?',
  );
  const got = a.told.find((t) => /nightly invoices/.test(t.ask));
  check(
    'someone who writes in the words of the trade is read as an engineer, and the seat is told to talk as engineers do in a team channel',
    level === 'seasoned' &&
      !!got &&
      /WHO YOU ARE TALKING TO: an experienced developer/.test(got.ask) &&
      /lead with the finding or the decision/.test(got.ask) &&
      /in backticks/.test(got.ask) &&
      /What they want to hear about: the diff, the tests and CI/.test(got.ask),
    [level, got && got.ask.slice(0, 500)],
  );
  await a.say('ok and which is easier to debug');
  const next = a.told.find((t) => /easier to debug/.test(t.ask));
  check(
    "and the seat's own line carries the manners of a team channel; once the thread is going it is told how the customer writes, and nothing about emoji",
    !!got &&
      /THE MANNERS OF A TEAM CHANNEL/.test(got.system) &&
      /you argue with the claim, never with the person/.test(got.system) &&
      !!next &&
      /HOW THE CUSTOMER WRITES/.test(next.ask) &&
      /The chat is already going/.test(next.ask) &&
      !/emoji/.test(next.ask),
    next && next.ask.slice(0, 600),
  );

  const b = team();
  const newLevel = await b.say('I have never made a website. What is the difference between a website and an app?');
  const plain = b.told.find((t) => /difference between a website/.test(t.ask));
  check(
    'someone starting out is read as that, and the seat is told to go one step at a time, in plain words, about what they will see',
    newLevel === 'new' &&
      !!plain &&
      /WHO YOU ARE TALKING TO: someone new to building software/.test(plain.ask) &&
      /showing a friend round the workshop/.test(plain.ask) &&
      /Never make a question sound basic/.test(plain.ask) &&
      /What can wait until they ask: branches, pipelines, tests/.test(plain.ask),
    [newLevel, plain && plain.ask.slice(0, 500)],
  );

  const c = team();
  check(
    'one word of the trade inside the words of someone starting out is still someone starting out',
    (await c.say('I want to make an app with an API for my shop, how do I start?')) === 'new',
    c.core.snapshot().dev,
  );
  check(
    'two of them is someone who knows the trade',
    (await c.say('I would like to build it in React and deploy it to staging first')) === 'seasoned',
    c.core.snapshot().dev,
  );
  check(
    'what a person says of themself outranks the words they used, either way, and the reason is kept',
    (await c.say('Honestly I am not a developer, my nephew set up the repo and the pipeline for me')) === 'new' &&
      c.core.snapshot().dev.why === 'they said so',
    c.core.snapshot().dev,
  );
  const d = team();
  check(
    '"I am a backend engineer" is an engineer, with no other word of the trade in the message',
    (await d.say('I am a backend engineer. Where would you start on a slow page?')) === 'seasoned',
    d.core.snapshot().dev,
  );

  // ---- 4. the shape of the reply is said last, on either engine; and a local model is given the short form of everything else
  const e = team();
  await e.say(
    'Which is cheaper to run for nightly invoices, a cron job on the api box or a queue with a worker in docker?',
  );
  const shaped = e.told.find((t) => /nightly invoices/.test(t.ask));
  check(
    "an engineer's question ends with the shape of the reply: the finding first, at most 110 words, a list only for commands",
    !!got &&
      /YOUR REPLY: begin with the thing itself \(where to look, or what you decided\), then why\. At most 110 words; a list only for commands\. A question of good practice is answered outright\. Only what is in their own code.*or what caused something\.$/.test(
        got.ask,
      ),
    shaped && shaped.ask.slice(-200),
  );
  const loc = team(false);
  const localLevel = await loc.say(
    'Which is cheaper to run for nightly invoices, a cron job on the api box or a queue with a worker in docker?',
  );
  const local = loc.told.find((t) => /nightly invoices/.test(t.ask));
  check(
    'on a local model the engineer is read the same, and the seat is told who they are in the short form, with the same shape last',
    localLevel === 'seasoned' &&
      !!local &&
      /WHO YOU ARE TALKING TO: an experienced developer/.test(local.ask) &&
      /Name files, functions and commands exactly, in backticks/.test(local.ask) &&
      !/What they want to hear about/.test(local.ask) &&
      /TEAM CHANNEL MANNERS\. Do not repeat a teammate/.test(local.system) &&
      !/THE MANNERS OF A TEAM CHANNEL/.test(local.system) &&
      /At most 110 words; a list only for commands\. A question of good practice is answered outright\. Only what is in their own code.*or what caused something\.$/.test(
        local.ask,
      ),
    local && [local.ask.slice(0, 400), local.system.slice(0, 200)],
  );

  store.set('familyoffice.mode', 'simple');
  const asks = [];
  const core4 = createTeamCore({ persist: false });
  core4.useEngine({
    route: async () => ({ kind: 'question', seat: 'operations' }),
    seat: async (o) => {
      asks.push({ ask: o.messages[o.messages.length - 1].content, system: o.system || '' });
      if (o.onDelta) o.onDelta('NONE');
      return {};
    },
  });
  core4.send('hey whats a good pasta for tonight 😋 quick im starving');
  await wait(1200);
  const first = asks.find((x) => /good pasta/.test(x.ask) && /YOUR REPLY/.test(x.ask));
  const note = first
    ? first.ask.slice(first.ask.indexOf('HOW THIS PERSON WRITES'), first.ask.lastIndexOf('hey whats'))
    : '';
  check(
    "on a local model in Simple the note is the four lines that matter most, and the room's manners are the short form",
    !!first &&
      note.split('\n').filter((l) => /^- /.test(l)).length === 4 &&
      /in a hurry/.test(note) &&
      /GROUP CHAT MANNERS\. Do not repeat anything a teammate or you already said/.test(first.system) &&
      !/THE MANNERS OF A GROUP CHAT/.test(first.system),
    first ? [note, first.system.slice(0, 200)] : asks.map((x) => x.ask.slice(-120)),
  );
  check(
    'and the question ends with the shape of the reply: the answer itself first, never a question back, at most 40 words in a hurry',
    !!first &&
      /YOUR REPLY: say hello back in a word, then give the answer itself, or your best suggestion if a detail is missing\. Do not open with a remark about the question, and do not answer with a question\. At most 40 words\.$/.test(
        first.ask,
      ),
    first && first.ask.slice(-260),
  );
  core4.send('thanks!');
  await wait(1200);
  const thanked = asks.find((x) => /YOUR REPLY: a few warm words, at most 20, and nothing else\.$/.test(x.ask));
  check(
    'thanks ends with: a few warm words, at most 20, and nothing else',
    !!thanked,
    asks.slice(-2).map((x) => x.ask.slice(-160)),
  );
}
// ---- 5. substance on a local model: an exact fact is looked up, and what was never shown is not described
{
  store.set('familyoffice.mode', 'simple');
  // a team whose answer and whose fact-checker's one line are given
  const simpleTeam = (claude, answer, fact) => {
    const looked = [];
    const asked = [];
    const core = createTeamCore({ persist: false });
    if (claude) core.adopt({ kind: 'claude' });
    core.useEngine({
      route: async () => ({ kind: 'question', seat: 'overseer' }),
      seat: async (o) => {
        const ask = o.messages[o.messages.length - 1].content;
        asked.push(ask);
        const say = /Give only the fact, in one short line/.test(ask)
          ? fact
          : /Would a small card|anything LASTING|Could ONE teammate/.test(ask)
            ? '[]'
            : answer;
        if (o.onDelta) o.onDelta(say);
        return {};
      },
      tool: async (t) => {
        looked.push(t.tool + ':' + (t.q || ''));
        return { ok: false, why: 'no network in this check' };
      },
    });
    return { core, looked, asked };
  };
  const turkey = 'How long does a 5 kg turkey take to defrost in the fridge?';
  const apart = simpleTeam(false, 'A 5 kg turkey takes about 24 to 30 hours to defrost in the fridge.', '2 to 3 days');
  apart.core.send(turkey);
  await wait(1800);
  const robin = apart.core.snapshot().chat.find((m) => m.by === 'steward' && m.chime);
  check(
    'on a local model in Simple an exact fact gets a second opinion: the fact-checker is asked for the bare fact, and when the two do not agree it says so and the team looks it up',
    apart.asked.some((a) => /Give only the fact, in one short line/.test(a)) &&
      !!robin &&
      /I'd have said 2 to 3 days\. We don't agree, so let's look it up/.test(robin.text) &&
      apart.looked.some((x) => /^search:.*turkey/i.test(x)),
    [robin && robin.text, apart.looked],
  );
  const agreed = simpleTeam(false, 'Allow two to three days in the fridge for a 5 kg bird.', '2.5 days');
  agreed.core.send(turkey);
  await wait(1800);
  const answer = agreed.core.snapshot().chat.find((m) => m.by === 'overseer');
  check(
    'when the two agree nothing is looked up, and the answer is marked as checked',
    agreed.looked.length === 0 &&
      agreed.asked.some((a) => /Give only the fact/.test(a)) &&
      !!answer &&
      !!answer.checkedBy &&
      answer.checkedBy.agreed === true,
    [agreed.looked, answer && answer.checkedBy],
  );
  const hurried = simpleTeam(false, 'Six minutes.', '3 minutes');
  hurried.core.send('quick - how long do I boil an egg for a soft yolk? running late');
  await wait(1200);
  const opinion = simpleTeam(false, 'A big tray of baked pasta feeds six with no fuss.', 'no');
  opinion.core.send('What should we cook for six people on Saturday night?');
  await wait(1200);
  const withClaude = simpleTeam(true, 'About 24 hours.', '3 days');
  withClaude.core.send(turkey);
  await wait(1200);
  const none = (t) => t.looked.length === 0 && !t.asked.some((a) => /Give only the fact/.test(a));
  check(
    'no second opinion for someone in a hurry, for a question that is a matter of taste, or on Claude Code, which looks things up itself',
    none(hurried) && none(opinion) && none(withClaude),
    [hurried.asked.length, opinion.asked.length, withClaude.asked.length],
  );

  store.set('familyoffice.mode', 'developer');
  const calls = [];
  const dev = createTeamCore({ persist: false });
  dev.useEngine({
    route: async () => ({ kind: 'question', seat: 'operations' }),
    seat: async (o) => {
      calls.push(o.messages);
      const again = o.messages.length === 3;
      if (o.onDelta)
        o.onDelta(
          again
            ? 'I have not seen your code. Return 400 for a body that cannot be parsed and 422 for one that parses and fails validation.'
            : 'Check api/src/routes/health/validate.ts first. The current guard on line 12 returns 400.',
        );
      return {};
    },
  });
  dev.send('Which HTTP status should the API return when the JSON body fails validation in our docker api?');
  await wait(1500);
  const reply = dev
    .snapshot()
    .chat.filter((m) => m.by !== 'you')
    .pop();
  const second = calls.find((m) => m.length === 3);
  check(
    'in Developer on a local model, an answer that names a file and a line nobody showed it is written again without them, once',
    !!second &&
      /api\/src\/routes\/health\/validate\.ts, line 12, which nobody has shown you/.test(second[2].content) &&
      /^I have not seen your code/.test(reply.text) &&
      !/validate\.ts/.test(reply.text) &&
      calls.filter((m) => m.length === 3).length === 1,
    [reply && reply.text, second && second[2].content.slice(0, 160)],
  );
  const lengths = [];
  const named = createTeamCore({ persist: false });
  named.useEngine({
    route: async () => ({ kind: 'question', seat: 'steward' }),
    seat: async (o) => {
      lengths.push(o.messages.length);
      if (o.onDelta) o.onDelta('Start with the traces of the failing runs of tests/checkout.spec.ts, not the code.');
      return {};
    },
  });
  named.send('The e2e test in tests/checkout.spec.ts is flaky on the staging pipeline. Where would you look first?');
  await wait(1500);
  const shown = named
    .snapshot()
    .chat.filter((m) => m.by !== 'you')
    .pop();
  check(
    'a file the customer named themself is theirs to speak of: nothing is written again',
    !lengths.includes(3) && /tests\/checkout\.spec\.ts/.test(shown.text),
    [lengths, shown && shown.text],
  );
}
// ---- 6. a command that destroys work is not offered
{
  store.set('familyoffice.mode', 'developer');
  const rounds = [];
  const dev = createTeamCore({ persist: false });
  dev.useEngine({
    route: async () => ({ kind: 'question', seat: 'overseer' }),
    seat: async (o) => {
      rounds.push(o.messages);
      if (o.onDelta)
        o.onDelta(
          o.messages.length === 3
            ? 'Run git revert on the bad commit and push that. Do not force push: the others have it.'
            : 'First git revert the bad commit. Then force-push with git push origin main --force-with-lease.',
        );
      return {};
    },
  });
  dev.send('I pushed a bad commit to main and the others have already pulled it. How do I undo it?');
  await wait(1500);
  const reply = dev
    .snapshot()
    .chat.filter((m) => m.by !== 'you')
    .pop();
  const again = rounds.find((m) => m.length === 3);
  check(
    'in Developer on a local model, an answer that offers a forced push nobody asked for is written again with the safe way only',
    !!again &&
      /throws away work or data that cannot be got back/.test(again[2].content) &&
      /^Run git revert/.test(reply.text) &&
      rounds.filter((m) => m.length === 3).length === 1,
    [reply && reply.text, again && again[2].content.slice(0, 120)],
  );
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
