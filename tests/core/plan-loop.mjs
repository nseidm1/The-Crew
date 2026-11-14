// plan-loop.mjs - THE PLAN AND THE LOOP (Developer): the chat's core in Node, with stand-ins for the model and the workspace.
// The requirements are read from the request or from the ticket; the work goes round (build, prove, judge) on what is not met; it
// stops when all are met, when a round leaves what the last one left, when a round alters nothing, or after three rounds; nothing
// lands by itself while a requirement is not met; and each round has its own card in the chat.   node tests/core/plan-loop.mjs
const store = new Map([['familyoffice.mode', 'developer']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 900)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REQS =
  '1. The price on the menu page reads 5 euros.\n2. The order button is disabled while the shop is closed.\n3. The opening hours are shown under the title.';
// world: reqs (what the Overseer writes), verdicts (the Steward's, one for each round), repo (or none), proof, same (a further round alters nothing)
const teamOn = (world) => {
  const core = createTeamCore({ persist: false });
  const asked = [];
  const did = [];
  let judged = 0;
  world.changed = [];
  core.adopt({ kind: world.local ? 'local' : 'claude' });
  core.useEngine({
    route: async () => ({ kind: world.route || 'build', seat: 'overseer' }),
    search: async () => ({ results: [] }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      asked.push(ask);
      const say = /Write the requirements/.test(ask)
        ? world.reqs === undefined
          ? REQS
          : world.reqs
        : /Judge each requirement/.test(ask)
          ? world.verdicts[judged++] || ''
          : /do differently in the next round/.test(ask)
            ? 'Read the price from the settings file, not from the constant.'
            : /YES or NO/.test(ask)
              ? 'YES'
              : /KEEP or DROP/.test(ask)
                ? ''
                : 'A short word from this seat.';
      if (o.onDelta) o.onDelta(say);
      return {};
    },
    work: {
      state: async () =>
        world.repo
          ? {
              repo: world.repo,
              kind: 'github',
              base: 'main',
              changed: world.changed,
              pending: world.changed.length ? { task: 'the change' } : null,
              skills: {},
            }
          : { repo: null },
      pick: async () => {
        world.repo = 'shop';
        return { repo: 'shop' };
      },
      look: async () => ({ found: '' }),
      task: async (t, br, how) => {
        did.push({ task: String(t), more: !!(how && how.more) });
        world.changed = [{ path: 'src/menu.js' }];
        return {
          changed: world.changed,
          said: 'I changed the menu.',
          ...(how && how.more ? { further: true, same: !!world.same } : {}),
        };
      },
      prove: async () => {
        did.push('prove');
        return world.proof || { ok: true, says: 'It fails on the code before the change and passes after it.' };
      },
      diff: async () => ({
        diff: 'diff --git a/src/menu.js b/src/menu.js\n+const PRICE = 5;',
        files: ['src/menu.js'],
        cut: false,
      }),
      ...(world.inRepo
        ? {
            judge: async (reqs, task) => {
              did.push({ judge: reqs, about: task });
              if (world.inRepo === 'fails') throw new Error('the runner did not answer');
              return { said: world.inRepo };
            },
          }
        : {}),
      land: async () => {
        did.push('land');
        world.changed = [];
        return { how: 'pr', branch: 'familyoffice/menu', url: 'https://github.com/octo/shop/pull/7', number: 7 };
      },
      discard: async () => {
        did.push('discard');
        world.changed = [];
        return {};
      },
      proofUrl: () => '',
    },
  });
  // sent, and waited for until the chat has been still for a while and nobody is working
  const settle = async () => {
    let last = '';
    let still = 0;
    for (let k = 0; k < 400 && still < 8; k++) {
      await wait(100);
      const s = core.snapshot();
      const busy = s.chat.filter((m) => m.live).length + s.team.seats.filter((x) => x.status === 'working').length;
      const now =
        s.chat.length +
        ':' +
        s.chat
          .filter((m) => m.plan)
          .map((m) => m.plan.rev)
          .join();
      if (now === last && !busy) still++;
      else still = 0;
      last = now;
    }
  };
  const go = async (text) => {
    core.send(text);
    await settle();
    if (core.snapshot().asking) {
      core.send('go');
      await settle();
    }
    return core.snapshot();
  };
  const plans = () => core.snapshot().chat.filter((m) => m.plan);
  const by = (seat) =>
    core
      .snapshot()
      .chat.filter((m) => m.by === seat)
      .map((m) => m.text);
  return {
    core,
    asked,
    did,
    go,
    plans,
    by,
    tasks: () => did.filter((d) => d.task),
    count: (re) => asked.filter((a) => re.test(a)).length,
  };
};
const states = (m) => m.plan.reqs.map((r) => r.state).join(' ');

// 1. a request: two rounds, the second only on what was not met, then it lands
{
  const t = teamOn({
    repo: 'shop',
    verdicts: [
      '1. MET - PRICE is 5 in src/menu.js\n2. UNMET - the button is never disabled\n3. MET - the hours are under the title',
      '1. MET - PRICE is 5\n2. MET - disabled while closed\n3. MET - hours shown',
    ],
  });
  await t.go(
    'Put the price up to 5 euros on the menu page, with the button off while we are closed and the hours under the title',
  );
  const p = t.plans();
  const tasks = t.tasks();
  check(
    'the Overseer reads the requirements out of the request and posts the plan: a card with one row for each',
    p.length >= 1 &&
      p[0].by === 'overseer' &&
      p[0].plan.source === 'request' &&
      p[0].plan.reqs.length === 3 &&
      /The plan, from your request: 3 requirements/.test(p[0].text) &&
      /3 rounds at most/.test(p[0].text) &&
      p[0].plan.reqs[0].text === 'The price on the menu page reads 5 euros.',
    p[0] && [p[0].text, p[0].plan],
  );
  check(
    'the builder is given the requirements it will be judged on',
    /THE REQUIREMENTS, each of which is judged against the change afterwards: 1\) The price on the menu page reads 5 euros\. 2\) /.test(
      tasks[0].task,
    ) && tasks[0].more === false,
    tasks[0],
  );
  check(
    'the Steward judges every requirement against the change itself, and says which is not met and why',
    t.asked.some(
      (a) =>
        /Judge each requirement/.test(a) && /\+const PRICE = 5;/.test(a) && /2\. The order button is disabled/.test(a),
    ) &&
      t
        .by('steward')
        .some((x) =>
          /^Round 1: 2 of 3 requirements met\. Not yet:\n2\. The order button is disabled while the shop is closed\. \(the button is never disabled\)$/.test(
            x,
          ),
        ),
    t.by('steward'),
  );
  check(
    'what is not met goes round again: a second card, round 2 of 3, and the first says how its round ended',
    p.length === 2 &&
      p[0].plan.stage === 'again' &&
      states(p[0]) === 'met unmet met' &&
      /Round 1 ended: 2 of 3 requirements met/.test(p[0].plan.says) &&
      p[1].plan.n === 2 &&
      /^Round 2 of 3\. Still to do: 2\. This time: Read the price from the settings file/.test(p[1].text),
    p.map((m) => [m.text, m.plan.stage, m.plan.n, states(m)]),
  );
  check(
    'the second round is built on top of the waiting change, with only what is left and how to do it differently',
    tasks.length === 2 &&
      tasks[1].more === true &&
      /^Finish this change\. STILL TO DO, and only this: 2\) The order button is disabled while the shop is closed\. \(what is wrong now: the button is never disabled\) Do it this way: Read the price from the settings file/.test(
        tasks[1].task,
      ) &&
      /THE WHOLE REQUEST, for reference: Put the price up/.test(tasks[1].task),
    tasks[1],
  );
  check(
    'with every requirement met and the change proven, it lands, and the last card says so',
    t.did.filter((d) => d === 'land').length === 1 &&
      t.did.filter((d) => d === 'prove').length === 2 &&
      p[1].plan.stage === 'landed' &&
      states(p[1]) === 'met met met' &&
      /Landed after 2 rounds/.test(p[1].plan.says) &&
      t.by('steward').some((x) => /^Round 2: all 3 requirements are met\.$/.test(x)),
    [t.did.filter((d) => typeof d === 'string'), p[1].plan],
  );
}
// 2. a ticket: the requirements are the ticket's
{
  const t = teamOn({ repo: 'shop', verdicts: ['1. MET - a\n2. MET - b\n3. MET - c'] });
  t.core.focusTicket({
    key: 'SHOP-12',
    summary: 'Menu price and closed state',
    description:
      'Acceptance: the price reads 5 euros; the order button is disabled while closed; hours under the title.',
    media: 'A screenshot of the menu page with the price circled.',
  });
  await t.go('Do this ticket');
  const p = t.plans();
  const ask = t.asked.find((a) => /Write the requirements/.test(a)) || '';
  check(
    'with the chat on a ticket, the requirements are read from the ticket: what it says it must do, and what its pictures show',
    /It is about a ticket\. The ticket SHOP-12: Menu price and closed state\. What the ticket says it must do: Acceptance: the price reads 5 euros/.test(
      ask,
    ) &&
      /What its pictures show: A screenshot of the menu page/.test(ask) &&
      /as the ticket states it/.test(ask),
    ask.slice(0, 700),
  );
  check(
    "the plan says it is the ticket's, by its key, and one round is enough when all are met",
    p.length === 1 &&
      p[0].plan.source === 'ticket' &&
      p[0].plan.key === 'SHOP-12' &&
      /^The plan, from the ticket SHOP-12: 3 requirements/.test(p[0].text) &&
      p[0].plan.stage === 'landed' &&
      /Landed after 1 round:/.test(p[0].plan.says) &&
      t.tasks().length === 1,
    p.map((m) => [m.text, m.plan.stage, m.plan.says]),
  );
}
// 3. a round that leaves what the last one left: it stops, and nothing lands
{
  const t = teamOn({
    repo: 'shop',
    verdicts: [
      '1. MET - a\n2. UNMET - still enabled\n3. MET - c',
      '1. MET - a\n2. UNMET - still enabled when closed\n3. MET - c',
    ],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'a round that leaves exactly what the last one left stops the loop: no third round, and the Steward says why',
    t.tasks().length === 2 &&
      p.length === 2 &&
      t
        .by('steward')
        .some((x) =>
          /^Round 2: 2 of 3 requirements met\. Not yet:\n2\. .*\nThat is exactly what round 1 left, so another round would be the same\. I am stopping here\.$/.test(
            x,
          ),
        ),
    [t.tasks().length, t.by('steward')],
  );
  check(
    'nothing lands by itself while a requirement is not met, though the change is proven: it waits, and the card and Master say so',
    !t.did.includes('land') &&
      p[1].plan.stage === 'waiting' &&
      states(p[1]) === 'met unmet met' &&
      /It waits for you: 1 of 3 not met after 2 rounds\./.test(p[1].plan.says) &&
      t
        .by('master')
        .some((x) => /^It is proven, but 1 of 3 requirements is not met, so it waits for you\. Say "land it"/.test(x)),
    [p[1].plan, t.by('master')],
  );
  t.core.send('land it');
  await wait(900);
  const after = t.plans()[1].plan;
  check(
    'the customer\'s own "land it" lands it, and the card says it was at their word',
    t.did.includes('land') && after.stage === 'landed' && /^Landed at your word/.test(after.says),
    [t.did.filter((d) => typeof d === 'string'), after],
  );
}
// 4. three rounds at most
{
  const t = teamOn({
    repo: 'shop',
    verdicts: [
      '1. UNMET - a\n2. UNMET - b\n3. UNMET - c',
      '1. MET - a\n2. UNMET - b\n3. UNMET - c',
      '1. MET - a\n2. MET - b\n3. UNMET - c',
    ],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'the loop is bounded: three rounds, each with its own card, and then it waits with what is left',
    t.tasks().length === 3 &&
      p.length === 3 &&
      p.map((m) => m.plan.n).join() === '1,2,3' &&
      p.map((m) => m.plan.stage).join() === 'again,again,waiting' &&
      t.by('steward').some((x) => /^Round 3: 2 of 3 requirements met\.[^]*That was the last of 3 rounds\.$/.test(x)) &&
      !t.did.includes('land'),
    [p.map((m) => [m.plan.n, m.plan.stage]), t.by('steward').slice(-1)],
  );
  t.core.send('throw it away');
  await wait(900);
  const after = t.plans()[2].plan;
  check(
    '"throw it away" is said on the card too',
    t.did.includes('discard') && after.stage === 'thrown' && /Thrown away at your word/.test(after.says),
    after,
  );
}
// 5. a later round can undo what an earlier one got right: every requirement is judged every round
{
  const t = teamOn({
    repo: 'shop',
    verdicts: [
      '1. MET - a\n2. UNMET - b\n3. MET - c',
      '1. UNMET - the price is 4 again\n2. MET - b\n3. MET - c',
      '1. MET - a\n2. MET - b\n3. MET - c',
    ],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'every requirement is judged again each round, so one that a later round broke is caught and put right',
    p.length === 3 &&
      states(p[1]) === 'unmet met met' &&
      p[2].plan.stage === 'landed' &&
      states(p[2]) === 'met met met' &&
      /STILL TO DO, and only this: 1\) /.test(t.tasks()[2].task),
    p.map((m) => [m.plan.stage, states(m)]),
  );
}
// 6. a further round that alters nothing stops, without proving the same change again
{
  const t = teamOn({ repo: 'shop', same: true, verdicts: ['1. MET - a\n2. UNMET - b\n3. MET - c'] });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'a round that alters nothing stops there: it is not proven a second time, it waits, and Operations says it changed nothing',
    t.tasks().length === 2 &&
      t.did.filter((d) => d === 'prove').length === 1 &&
      p[1].plan.stage === 'waiting' &&
      /Round 2 changed nothing/.test(p[1].plan.says) &&
      states(p[1]) === 'met unmet met' &&
      t.by('operations').some((x) => /^I went round again and changed nothing more\./.test(x)) &&
      !t.did.includes('land'),
    [p[1].plan, t.by('operations')],
  );
}
// 7. the Steward gives no verdict: it does not land by itself
{
  const t = teamOn({ repo: 'shop', verdicts: ['It all looks fine to me.'] });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'with no verdict on any requirement nothing is taken as met: no further round, no landing, and it is said',
    p.length === 1 &&
      states(p[0]) === 'unknown unknown unknown' &&
      p[0].plan.stage === 'waiting' &&
      !t.did.includes('land') &&
      t.tasks().length === 1 &&
      t.by('steward').some((x) => /^I could not judge the change against the plan/.test(x)),
    [p[0].plan, t.by('steward')],
  );
}
// 8. a change that cannot be proven does not go round
{
  const t = teamOn({
    repo: 'shop',
    proof: { ok: false, blocked: 'there is nothing to run a test with yet' },
    verdicts: ['1. MET - a\n2. UNMET - b\n3. MET - c'],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'a change that cannot be proven at all does not go round again: it waits, with what is not met said',
    t.tasks().length === 1 &&
      p.length === 1 &&
      p[0].plan.stage === 'waiting' &&
      t.by('steward').some((x) => /The change could not be proven, so it does not go round again\.$/.test(x)),
    [p.map((m) => m.plan.stage), t.by('steward')],
  );
}
// 9. a model that writes no list: the request itself is the one requirement
{
  const t = teamOn({
    repo: 'shop',
    reqs: 'I would start by reading the menu page and then change the price.',
    verdicts: ['1. MET - the price is 5'],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'prose is not taken for requirements: the request itself is then the one thing to meet',
    p[0].plan.reqs.length === 1 &&
      p[0].plan.reqs[0].text === 'Put the price up to 5 euros on the menu page' &&
      /one requirement/.test(p[0].text) &&
      p[0].plan.stage === 'landed' &&
      t.by('steward').some((x) => /^Round 1: the requirement is met\.$/.test(x)),
    [p[0].text, p[0].plan, t.by('steward')],
  );
}
// 10. no workspace yet: the plan is talked through, and carried on once there is a folder
{
  const t = teamOn({ verdicts: ['1. MET - a\n2. MET - b\n3. MET - c'] });
  await t.go('Make a menu page for my shop with the price at 5 euros');
  const p1 = t.plans();
  const folder = t.core.snapshot().chat.find((m) => m.setup && m.setup.kind === 'folder');
  check(
    'with nowhere to build, the plan is still made and shown, and says it waits for a workspace',
    p1.length === 1 &&
      p1[0].plan.stage === 'talk' &&
      /Waiting for a workspace/.test(p1[0].plan.says) &&
      !!folder &&
      t.tasks().length === 0,
    [p1.map((m) => m.plan), !!folder],
  );
  await t.core.setupDo(folder.id, 'choose');
  await wait(1200);
  const p2 = t.plans();
  check(
    'once a folder is chosen the same plan is carried on in a new card (the requirements are not read a second time), and the old card points down to it',
    p2.length === 2 &&
      p2[0].plan.stage === 'moved' &&
      /Carried on further down/.test(p2[0].plan.says) &&
      p2[1].plan.reqs.map((r) => r.text).join('|') === p1[0].plan.reqs.map((r) => r.text).join('|') &&
      t.count(/Write the requirements/) === 1 &&
      t.tasks().length === 1 &&
      p2[1].plan.stage === 'landed',
    [p2.map((m) => [m.plan.stage, m.plan.says]), t.count(/Write the requirements/)],
  );
}
// 11. a team on a local model: met, but checked rather than proven, so it waits
{
  const t = teamOn({ repo: 'shop', local: true, verdicts: ['1. MET - a\n2. MET - b\n3. MET - c'] });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    "on a local model a change that meets every requirement still waits for the customer's yes, and the card says every requirement is met",
    p[0].plan.stage === 'waiting' &&
      /Every requirement is met\. It waits for your yes\./.test(p[0].plan.says) &&
      !t.did.includes('land'),
    p[0].plan,
  );
}
// 11b. where the runner can, the judgement is made in the repository itself (the code as it stands, not only the diff)
{
  const t = teamOn({
    repo: 'shop',
    inRepo:
      '1. MET - `PRICE = 5` in src/menu.js\n2. MET - src/order.js already disabled it; the change leaves it alone\n3. MET - hours under the title',
    verdicts: [],
  });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  const j = t.did.find((d) => d.judge);
  check(
    'the Steward judges in the repository when the runner can: it is handed the requirements, nothing is asked in words, and a requirement the code already met is met',
    !!j &&
      j.judge.length === 3 &&
      j.judge[1] === 'The order button is disabled while the shop is closed.' &&
      t.count(/Judge each requirement/) === 0 &&
      p.length === 1 &&
      p[0].plan.stage === 'landed' &&
      p[0].plan.reqs[1].why === 'src/order.js already disabled it; the change leaves it alone',
    [j, p.map((m) => m.plan)],
  );
  check(
    'what the Steward says shows it is kept whole, marks and all',
    p[0].plan.reqs[0].why === 'PRICE = 5 in src/menu.js',
    p[0].plan.reqs[0],
  );
}
{
  const t = teamOn({ repo: 'shop', inRepo: 'fails', verdicts: ['1. MET - a\n2. MET - b\n3. MET - c'] });
  await t.go('Put the price up to 5 euros on the menu page');
  const p = t.plans();
  check(
    'if the runner cannot judge, the Steward is asked in words and shown the change, as before',
    t.count(/Judge each requirement/) === 1 && p[0].plan.stage === 'landed',
    [t.count(/Judge each requirement/), p.map((m) => m.plan.stage)],
  );
}
// 11c. a ticket's own words are work to do, whatever the model takes them for, and the whole of it is read
{
  const long =
    'Product search should match tags and ignore case. Searching for mug finds nothing when the product is called Blue Mug. ' +
    'People expect more of it than that, and say so often. '.repeat(14) +
    '**What it must do** - A search matches whatever the case. - A product also matches when one of its tags contains the query. - Results keep the order the products are in.';
  const t = teamOn({ repo: 'shop', route: 'research', verdicts: ['1. MET - a\n2. MET - b\n3. MET - c'] });
  await t.go(long);
  const ask = t.asked.find((a) => /Write the requirements/.test(a)) || '';
  check(
    'a message that states what the work must do is planned and built, though the model took it for something to find out; and its last requirement, past 700 characters, is in what the plan is read from',
    long.length > 900 &&
      t.plans().length === 1 &&
      t.tasks().length === 1 &&
      /Results keep the order the products are in\./.test(ask),
    [long.length, t.plans().length, t.tasks().length, ask.slice(-300)],
  );
  const q = teamOn({ repo: 'shop', route: 'question', verdicts: [] });
  q.core.send('What are the acceptance criteria for the search ticket?');
  await wait(2500);
  check(
    'a question stays a question, even when it uses those words',
    q.plans().length === 0 && q.tasks().length === 0,
    q.plans().length,
  );
}
// 12. Simple has no plan
{
  store.set('familyoffice.mode', 'simple');
  const t = teamOn({ repo: 'shop', verdicts: [] });
  t.core.send('Write me a poem about the sea');
  await wait(2600);
  check('Simple mode has no plan and no rounds', t.plans().length === 0 && t.tasks().length === 0, t.plans().length);
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
