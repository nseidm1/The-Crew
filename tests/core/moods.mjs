// moods.mjs - WHAT A FACE SHOWS (src/js/team/mood.js). The five have faces that can change; which feeling goes with a message is
// read off the message itself, the same way in both modes, with no model asked. A face shows what happened: pleased because the
// change landed, worried because the card carries a warning, sorry because the reply could not be made.
//   node tests/core/moods.mjs
import { moodOf, moodOfSeat } from '../../src/js/team/mood.js';

let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 400)));
  if (!ok) failed++;
};
const all = (rows, o) => rows.map(([m, want]) => [moodOf(m, o), want, m.text || JSON.stringify(m).slice(0, 60)]);
const off = (rows) => rows.filter(([got, want]) => got !== want);

const both = all([
  [{ by: 'you', text: 'hello!' }, 'idle'],
  [{ by: 'overseer', live: true, text: '' }, 'thinking'],
  [{ by: 'overseer', live: true, text: 'Six min' }, 'speaking'],
  [{ by: 'overseer', text: '[Sam could not reply: the model stopped]' }, 'sorry'],
  [{ by: 'overseer', text: '[The team could not finish that: no network]' }, 'sorry'],
  [{ by: 'operations', kind: 'tools', open: true, text: '' }, 'focused'],
  [
    { by: 'operations', text: 'Before we build it, I need a folder.', setup: { kind: 'folder', state: 'open' } },
    'curious',
  ],
  [{ by: 'operations', text: 'The folder is set.', setup: { kind: 'folder', state: 'done' } }, 'happy'],
]);
check(
  'while it is written a face thinks, then speaks; a reply that could not be made looks sorry; a seat at a tool is set to it; one that asks for something looks it',
  !off(both).length,
  off(both),
);

const simple = all(
  [
    [{ by: 'overseer', text: 'No, it is not safe, even for ten minutes.' }, 'worried'],
    [
      { by: 'overseer', text: 'Six minutes from boiling.', card: { warn: 'Cool it in cold water straight after.' } },
      'worried',
    ],
    [{ by: 'overseer', text: "I'm so sorry about your dad. Start with one true thing about him." }, 'kind'],
    [
      { by: 'steward', chime: true, text: "One thing first: I'm not sure of that. I'd have said 2 to 3 days." },
      'unsure',
    ],
    [{ by: 'overseer', text: 'About a day.', checkedBy: { seat: 'steward', agreed: false } }, 'unsure'],
    [{ by: 'operations', chime: true, text: 'Salt the water well, like the sea.' }, 'listening'],
    [{ by: 'overseer', text: 'Go with garlic and oil spaghetti. What is in your fridge?' }, 'curious'],
    [{ by: 'overseer', text: 'Hey! Go with a simple garlic and olive oil spaghetti.' }, 'happy'],
    [{ by: 'overseer', text: 'Enjoy the pasta tonight.' }, 'happy'],
    [{ by: 'overseer', text: 'A crisp, dry white is your best bet.' }, 'idle'],
    [{ by: 'operations', text: 'The build is red on an empty cart.' }, 'idle'],
  ],
  { simple: true },
);
check(
  'in Simple: a plain no or a warning looks worried, a hard day is met kindly, a doubt looks unsure, a chime listens, a question back looks curious, good news looks happy, and a plain answer is at rest',
  !off(simple).length,
  off(simple),
);

const dev = all(
  [
    [{ by: 'master', text: 'Landed.', plan: { stage: 'landed' } }, 'proud'],
    [{ by: 'master', text: 'It is proven and waits for your yes.', plan: { stage: 'waiting' } }, 'curious'],
    [{ by: 'overseer', text: 'Round 2: one requirement is not met yet.', plan: { stage: 'again' } }, 'focused'],
    [
      { by: 'overseer', text: 'Stopped: three rounds and one requirement still not met.', plan: { stage: 'stopped' } },
      'sorry',
    ],
    [{ by: 'operations', text: 'Run 2 is green. Same judge, same bytes.' }, 'proud'],
    [{ by: 'operations', text: 'Run 1 is red: the empty case. Fixing.' }, 'focused'],
    [{ by: 'operations', text: 'The change has not landed yet.' }, 'idle'],
    [{ by: 'overseer', text: "I haven't seen your nginx.conf, so I can't tell you what is on line 40." }, 'unsure'],
    [{ by: 'steward', text: 'Start with the traces of the failed runs, not the test code.' }, 'focused'],
    [{ by: 'operations', text: 'Store timestamps in UTC and convert when you show them.' }, 'idle'],
  ],
  { simple: false },
);
check(
  'in Developer: a landed change looks proud, one waiting for a yes looks to the customer, a round that goes again is set to its work, a stopped one is sorry; green is proud and red is focused; what was not shown looks unsure',
  !off(dev).length,
  off(dev),
);

check(
  'where the team is listed, a seat at rest is at rest, one searching or checking is set to it, one answering speaks, and a stopped team sleeps',
  moodOfSeat({ status: 'idle' }) === 'idle' &&
    moodOfSeat({ status: 'working', line: 'Searching the web' }) === 'focused' &&
    moodOfSeat({ status: 'working', line: 'Answering' }) === 'speaking' &&
    moodOfSeat({ status: 'working', line: 'Getting to know you' }) === 'thinking' &&
    moodOfSeat({ status: 'stopped' }) === 'sleepy' &&
    moodOfSeat(null) === 'idle',
  [moodOfSeat({ status: 'working', line: 'Searching the web' }), moodOfSeat({ status: 'working', line: 'Answering' })],
);
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
