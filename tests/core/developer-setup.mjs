// developer-setup.mjs - DEVELOPER MODE MEETS THE DEVELOPER WHERE THEY ARE: the chat's core in Node, with stand-ins for the model, the
// workspace and this computer. Someone new who asks for an app with nowhere to build it; someone experienced who does the same; the
// website the team made, running here and then not; and a phone, absent and then plugged in.   node tests/core/developer-setup.mjs
const store = new Map([['familyoffice.mode', 'developer']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { createTeamCore } = await import('../../src/js/team-core.js');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// a team on stand-ins. world: what this computer has (a workspace or none, a site up or down, the phones adb sees, a built app)
const teamOn = (world) => {
  const core = createTeamCore({ persist: false });
  const told = [];
  const did = [];
  core.useEngine({
    route: async (t) => ({ kind: /^(hello|hi|thanks)\b/i.test(t) ? 'talk' : 'build', seat: 'overseer' }),
    seat: async (o) => {
      const ask = o.messages[o.messages.length - 1].content;
      told.push(String(o.system || '') + '\n' + ask);
      const say =
        /question/i.test(ask) && /ask|need to know|missing/i.test(ask)
          ? 'none'
          : 'A page with the opening hours and one button to order.';
      if (o.onDelta) o.onDelta(say);
      return {};
    },
    work: {
      state: async () =>
        world.repo
          ? {
              repo: world.repo,
              kind: 'folder',
              changed: world.changed || [],
              pending: null,
              skills: world.skills || {},
            }
          : { repo: null },
      pick: async () => {
        did.push('pick');
        if (world.cancel) return { cancelled: true };
        world.repo = 'bakery-app';
        return { repo: 'bakery-app' };
      },
      look: async () => ({ found: '' }),
      task: async (t) => {
        did.push('task: ' + String(t).slice(0, 40));
        world.changed = ['index.html'];
        return { changed: ['index.html'], said: 'made the page' };
      },
      prove: async () => ({ ok: false, blocked: 'there is nothing to run a test with yet' }),
      land: async () => ({ branch: 'main' }),
      discard: async () => ({}),
      proofUrl: () => '',
    },
    host: {
      siteStart: async () => {
        did.push('site start');
        if (!world.page) return { ok: false, why: 'There is no page to open yet: the workspace has no index.html.' };
        world.up = true;
        return { ok: true, site: { id: 's1', url: 'http://localhost:4321/', name: world.repo, online: true } };
      },
      siteStop: async () => {
        did.push('site stop');
        world.up = false;
        world.why = 'you stopped it';
        return { ok: true };
      },
      sites: async () => ({
        sites: [
          {
            id: 's1',
            url: 'http://localhost:4321/',
            online: !!world.up,
            why: world.up ? '' : world.why || 'nobody had opened it for a while',
          },
        ],
      }),
      devices: async () => ({ adb: world.adb !== false, list: world.phones || [], built: world.built || null }),
      install: async (serial) => {
        did.push('install ' + serial);
        return world.refuse
          ? { ok: false, why: 'A copy signed by someone else is already on the phone.' }
          : { ok: true };
      },
    },
  });
  const go = async (text, ms = 3200) => {
    core.send(text);
    await wait(ms);
    if (core.snapshot().asking) {
      core.send('go');
      await wait(ms);
    }
    return core.snapshot();
  };
  return { core, told, did, go, cards: (kind) => core.snapshot().chat.filter((m) => m.setup && m.setup.kind === kind) };
};

// 1. someone new, with nowhere to build
{
  const world = { page: true };
  const t = teamOn(world);
  const s1 = await t.go('I want to make an app for my bakery');
  const card = t.cards('folder')[0];
  check(
    "someone new asks for an app with nowhere to build it: the Overseer's message has a folder to choose, in plain words, and nothing was built",
    !!card &&
      card.by === 'overseer' &&
      card.setup.state === 'open' &&
      /Press the button and choose one/.test(card.text) &&
      /empty folder is fine/.test(card.text) &&
      !/Workspace page|repository|Git/.test(card.text) &&
      !t.did.some((d) => /^task/.test(d)),
    [card && card.text, t.did],
  );
  check(
    'the team has read them as someone new, and each seat is told to speak accordingly',
    (s1.dev || {}).level === 'new' && !t.told.some((x) => /an experienced developer/.test(x)),
    s1.dev,
  );
  await t.core.setupDo(card.id, 'choose');
  await wait(600);
  const s2 = t.core.snapshot();
  const again = t.cards('folder')[0];
  const said = s2.chat.map((m) => m.by + ': ' + m.text.slice(0, 70));
  check(
    'pressing it opens the folder window; the folder is connected, the message says so, and the team carries on with what was asked',
    t.did[0] === 'pick' &&
      t.did.some((d) => /^task: /.test(d)) &&
      again.setup.state === 'done' &&
      again.setup.name === 'bakery-app' &&
      s2.chat.some(
        (m) =>
          m.by === 'overseer' && /Working in bakery-app now\. Carrying on with "I want to make an app/.test(m.text),
      ),
    [t.did, said.slice(-6)],
  );
  check(
    'once they have asked, every seat that speaks is told it is talking to someone new',
    t.told.some(
      (x) =>
        /WHO YOU ARE TALKING TO: someone new to building software/.test(x) &&
        /never ask them for a path, a branch or a command/.test(x),
    ),
    t.told.length,
  );
  const site = t.cards('site')[0];
  check(
    'what was built has a page: it is served on this computer and the message has its address, said plainly',
    !!site &&
      site.by === 'ask' &&
      site.setup.state === 'online' &&
      site.setup.url === 'http://localhost:4321/' &&
      /press Open/.test(site.text) &&
      /Only this computer can see it/.test(site.text),
    site && [site.text, site.setup],
  );
  world.up = false;
  world.why = 'nobody had opened it for a while';
  await t.core.hostCheck();
  const down = t.cards('site')[0];
  check(
    'the site is watched: when it stops, its message says so and why',
    down.setup.state === 'stopped' && /nobody had opened it/.test(down.setup.why),
    down.setup,
  );
  await t.core.setupDo(site.id, 'start');
  const up = t.cards('site')[0].setup.state;
  await t.core.setupDo(site.id, 'stop');
  const off = { ...t.cards('site')[0].setup }; // the state as it was at each moment (the message itself goes on changing)
  check(
    'it can be started again and stopped from the message, and the message keeps to what is true',
    up === 'online' && off.state === 'stopped' && /you stopped it/.test(off.why) && t.did.includes('site stop'),
    [up, off, t.did],
  );
  check('nothing is said about a phone when the app is not for one', t.cards('phone').length === 0, t.cards('phone'));
}
// 2. the folder window closed with nothing chosen
{
  const t = teamOn({ cancel: true });
  await t.go('I want to make a website for my band');
  const card = t.cards('folder')[0];
  await t.core.setupDo(card.id, 'choose');
  const after = t.cards('folder')[0];
  check(
    'closing the folder window changes nothing, and the message says so and can be pressed again',
    after.setup.state === 'open' &&
      /No folder was chosen/.test(after.setup.note) &&
      !after.setup.busy &&
      !t.did.some((d) => /^task/.test(d)),
    after.setup,
  );
}
// 3. someone experienced
{
  const t = teamOn({});
  const s = await t.go('Refactor the checkout endpoint in src/cart.ts and open a pull request');
  const card = t.cards('folder')[0];
  check(
    'someone experienced is read as that, is spoken to in the words of the trade, and gets the same button',
    (s.dev || {}).level === 'seasoned' &&
      !!card &&
      /No workspace is connected\. Choose a Git folder/.test(card.text) &&
      /Workspace page/.test(card.text) &&
      t.told.some((x) => /WHO YOU ARE TALKING TO: an experienced developer/.test(x)),
    [s.dev, card && card.text],
  );
  const t2 = teamOn({});
  await t2.go('I want to make an app');
  const mid = (t2.core.snapshot().dev || {}).level;
  await t2.go('Actually it is a React app, deploy it to staging');
  check(
    'someone read as new is read again as soon as they show otherwise, and that sticks',
    mid === 'new' && (t2.core.snapshot().dev || {}).level === 'seasoned',
    [mid, t2.core.snapshot().dev],
  );
}
// 4. an Android app, and the phone
{
  const world = { repo: 'steps-app', page: false, phones: [] };
  const t = teamOn(world);
  await t.go('I want to make an Android app that counts my steps');
  const card = t.cards('phone')[0];
  check(
    'an Android app, with no phone plugged in: the message says so and how to switch on USB debugging, step by step',
    !!card &&
      card.by === 'operations' &&
      card.setup.state === 'none' &&
      card.setup.steps.length === 4 &&
      /Build number/.test(card.setup.steps[0]) &&
      /USB debugging/.test(card.setup.steps[1]) &&
      /tap Allow/.test(card.setup.steps[2]),
    card && card.setup,
  );
  check('with no page in it, no site is offered', t.cards('site').length === 0 && t.did.includes('site start'), t.did);
  world.phones = [
    {
      serial: 'R5CT1',
      state: 'unauthorized',
      name: 'Pixel 9 Pro',
      says: 'Unlock the phone and accept "Allow USB debugging" for this computer',
    },
  ];
  await t.core.setupDo(card.id, 'check');
  const wait1 = t.cards('phone')[0];
  check(
    'Check again sees a phone that has not accepted this computer, and says what to do on it',
    wait1.setup.state === 'waiting' &&
      /has not accepted this computer/.test(wait1.setup.text) &&
      /Allow USB debugging/.test(wait1.setup.steps[0]),
    wait1.setup,
  );
  world.phones = [{ serial: 'R5CT1', state: 'ready', name: 'Pixel 9 Pro' }];
  world.built = 'app/build/outputs/apk/debug/app-debug.apk';
  await t.core.hostCheck();
  const ready = t.cards('phone')[0];
  check(
    'the phone is watched: plugged in and accepted, with an app built, the message says it is ready and the app can go on it',
    ready.setup.state === 'ready' &&
      ready.setup.built === true &&
      ready.setup.serial === 'R5CT1' &&
      /Pixel 9 Pro is connected and ready: the app the team built can go on it/.test(ready.setup.text),
    ready.setup,
  );
  await t.core.setupDo(card.id, 'install');
  const put = t.cards('phone')[0].setup.note;
  world.refuse = true;
  await t.core.setupDo(card.id, 'install');
  const no = t.cards('phone')[0].setup.note;
  check(
    'Put it on the phone does, and says where to find it; a phone that refuses is said, with why',
    t.did.includes('install R5CT1') &&
      /It is on Pixel 9 Pro now/.test(put) &&
      /It did not go on: A copy signed by someone else/.test(no),
    [put, no],
  );
  world.adb = false;
  world.phones = [];
  await t.core.setupDo(card.id, 'check');
  const tools = t.cards('phone')[0];
  check(
    'with no Android tools on the computer, it says that, and where to get them',
    tools.setup.state === 'no-tools' &&
      /platform tools/.test(tools.setup.text) &&
      /developer\.android\.com/.test(tools.setup.steps[0]),
    tools.setup,
  );
}
// 5. Simple has none of this
{
  store.set('familyoffice.mode', 'simple');
  const t = teamOn({ page: true });
  await t.go('I want to make a website for my bakery', 2600);
  const s = t.core.snapshot();
  check(
    'Simple mode has none of it: no folder is asked for, no site, no phone, and nobody is sized up',
    !s.chat.some((m) => m.setup) && !(s.dev && s.dev.level),
    [s.chat.filter((m) => m.setup).length, s.dev],
  );
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
