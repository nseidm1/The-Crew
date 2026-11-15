// base.js - WHAT EVERY PART OF THE TEAM STARTS FROM: the five seats and their names in each mode, the words a seat is shown as doing,
// and the small helpers that need nothing but their arguments. Nothing here keeps state.
import { isSimple } from '../mode.js';

export const SEATS = [
  {
    id: 'overseer',
    title: 'Overseer',
    role: 'Plans the work, measures it and proposes improvements',
    tone: 'measured',
    traits: ['plans before acting', 'reports in numbers'],
  },
  {
    id: 'steward',
    title: 'Steward',
    role: 'Writes the judge every change must pass',
    tone: 'exacting',
    traits: ['defines done first', 'expects red before green'],
  },
  {
    id: 'operations',
    title: 'Operations',
    role: 'Builds and runs your systems',
    tone: 'direct',
    traits: ['short sentences', 'says why a run failed'],
  },
  {
    id: 'ask',
    title: 'Ask',
    role: 'Designs what people see and touch',
    tone: 'visual',
    traits: ['draws before building', 'checks every width'],
  },
  {
    id: 'master',
    title: 'Master',
    role: 'Lands proven work and settles disputes',
    tone: 'decisive',
    traits: ['lands only on a receipt', 'few words'],
  },
];

// There is no autonomy setting. The team asks what it needs to know, recommends how the change should be handled in source control
// the way a development team would, lands what is proven where that was agreed, and keeps what the customer chose for the next time.
// SIMPLE MODE'S TEAM: the same five, as a friendly group of people with plain jobs. A member of the public meets Sam, Robin, Alex,
// Jamie and Pat, and is told what each one does in a few everyday words; the developer seats, their workflow and their vocabulary
// are Developer mode's. Only what is shown and what the model is told changes: the seat ids, the chat and the memory are the same.
export const FRIENDLY = {
  overseer: {
    title: 'Sam',
    short: 'Organizer',
    role: 'Works out a plan and says who does what',
    tone: 'calm',
    traits: ['says the plan in a sentence', 'keeps things moving'],
  },
  steward: {
    title: 'Robin',
    short: 'Fact-checker',
    role: 'Checks that what you get is right',
    tone: 'careful',
    traits: ['checks before agreeing', 'says plainly when unsure'],
  },
  operations: {
    title: 'Alex',
    short: 'Doer',
    role: 'Does the work: finds things out and writes them up',
    tone: 'practical',
    traits: ['gets to the point', 'gives you something you can use'],
  },
  ask: {
    title: 'Jamie',
    short: 'Artist',
    role: 'Makes pictures and video, and cares how things look',
    tone: 'creative',
    traits: ['says what you will see', 'keeps it easy on the eye'],
  },
  master: {
    title: 'Pat',
    short: 'Editor',
    role: 'Reads it over and gives you the final version',
    tone: 'clear',
    traits: ['few words', 'gives one final answer'],
  },
};

export const seatAs = (x) => (x && FRIENDLY[x.id] && isSimple() ? { ...x, ...FRIENDLY[x.id] } : x || {}); // a seat as this mode shows it

export const STAGES = ['planned', 'judge', 'build', 'proven', 'landed'];

export const DOING = {
  overseer: 'Planning',
  steward: 'Writing the judge',
  operations: 'Working out the build',
  ask: 'Drawing it',
  master: 'Weighing the proof',
}; // what the chat says a seat is doing while it speaks

export const DOING_AS = {
  talk: 'Answering',
  answer: 'Answering',
  research: 'Writing up what it found',
  check: 'Checking the claims',
  qa: 'Going over it',
}; // and when it is not building

// WHAT EACH SEAT IS ASKED when the team looks at a page or an app: the part of it that is that seat's job
export const LOOK = {
  ask: 'Go over it as the designer: what a person meets first, the order of what is on it, and anything missing or confusing. At most 70 words.',
  steward:
    'Say what a judge should pin about it, and name anything in the evidence that already looks wrong (a failed status, a missing title, empty or broken text). At most 60 words.',
  operations:
    'Say whether it loads and answers as it should, from the status and what came back, and what you would check next on the machine. At most 60 words.',
  overseer: 'Say what the team should do about it next, in one step, and what you would measure. At most 50 words.',
  master:
    'Say whether what is there looks like finished, landed work, and what you would need to see to be sure. At most 50 words.',
};

// a message that states what the work must do, the way a ticket does: it is a change to make, whatever else it reads like
export const STATED =
  /\bwhat it (?:must|should|has to|needs to) do\b|\bacceptance criteria\b|\bdefinition of done\b|\brequirements:/i;

// a message that asks for a thing to be made ("Let's start with a simple calendar app", "Build me a script that..."): it is work to
// plan, whatever else it reads like. Found on a real team on a local model: the sentence was taken for talk, and one seat described
// what a calendar is where the Overseer should have written the plan.
export const MAKES =
  /^(?:(?:ok(?:ay)?|so|right|now)[,.]?\s+)?(?:(?:let'?s|let us|please|i(?:'d| would) like (?:you )?to|i want (?:you )?to|we (?:should|need to)|time to)\s+)?(?:start(?: with| on)?|build|make|create|write|scaffold|set up|code|implement|develop)\s+(?:me\s+|us\s+)?(?:a|an|the|my|our)\s[^?]*\b(?:app|application|site|website|web ?page|tool|script|service|api|game|bot|extension|cli|library|package|dashboard|server|plugin|component|widget|program)\b/i;

// a limit on length the person set, read from the rulings in force (the newest first): "three sentences at most", "no more than 2
// sentences", "in one sentence". 0 when there is none.
const NUM = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
export const sentenceCap = (rulings) => {
  for (const r of rulings || []) {
    const t = String(r.text || '').toLowerCase();
    const m =
      t.match(
        /\b(?:at most|no more than|up to|max(?:imum)?(?: of)?|under|within|to|in)\s+(\d|one|a|two|three|four|five|six)\s+(?:short\s+)?sentences?\b/,
      ) ||
      t.match(
        /\b(\d|one|two|three|four|five|six)\s+(?:short\s+)?sentences?\s+(?:at most|or (?:fewer|less)|max(?:imum)?|tops)\b/,
      );
    if (m) return NUM[m[1]] || Number(m[1]) || 0;
  }
  return 0;
};
export const firstSentences = (text, n) => {
  const t = String(text);
  const re = /[.!?]+(?=\s|$)/g;
  let m;
  let seen = 0;
  while ((m = re.exec(t))) {
    if (/\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Dr)\.$/i.test(t.slice(0, m.index + 1))) continue;
    if (++seen === n) return t.slice(0, m.index + m[0].length).trim();
  }
  return t;
};

export const unsaid = (t) =>
  /^\[(?:no reply\]|this reply was interrupted\]|[A-Z][a-z]+ could not reply)/.test(String(t)); // a reply that is only the note saying there was none (an answer may well begin "[1]")

export const hostOf = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, '');
  } catch {
    return String(u).slice(0, 40);
  }
};

export const DULL_ASK = new Set([
  'should',
  'would',
  'could',
  'anything',
  'something',
  'nothing',
  'everything',
  'watch',
  'out',
  'any',
  'some',
  'there',
  'their',
  'them',
  'they',
  'from',
  'will',
  'can',
  'are',
  'not',
  'but',
  'has',
  'had',
  'were',
  'been',
  'into',
  'than',
  'then',
  'also',
  'just',
  'need',
  'want',
  'make',
  'please',
  'this',
  'weekend',
  'today',
  'tomorrow',
  'week',
]); // words in a question that say nothing of what it is about

export const STOP = new Set([
  'the',
  'and',
  'what',
  'how',
  'did',
  'does',
  'for',
  'with',
  'was',
  'why',
  'when',
  'that',
  'this',
  'have',
  'about',
  'last',
  'time',
  'you',
  'your',
  'know',
  'our',
  'team',
  'learned',
  'learn',
]);

export const UI_WORDS =
  /\b(ui|page|button|toggle|design|dark|colou?r|layout|screen|form|modal|menu|theme|style|table|empty state)\b/i;

export const RED_WHY = [
  'the empty case',
  'a value right at the boundary',
  'a stale cache path',
  'the exact wording the judge pins',
  'two requests arriving at once',
];

export const VOICE = {
  plan: (t) =>
    'Plan for "' +
    t +
    '": Steward pins the behaviour first, Operations builds against it, Master lands it on a receipt. I will report when it is done.',
  judge: () =>
    'I wrote the check that decides when this is done. It fails right now, as it should: nothing does this yet.',
  start: (who) => 'On it. ' + (who === 'operations' ? 'Building' : who + ' is building') + ' against the judge.',
  red: (n, why) => 'Run ' + n + ' is red: ' + why + '. Fixing.',
  design: () =>
    'I drew it before it was built. Placement, states and contrast are in the change, and it holds at phone width.',
  green: (n) => 'Run ' + n + ' is green. Same judge, same bytes.',
  wait: (t) => '"' + t + '" is proven and has a receipt. You asked to approve landings, so it waits for your yes.',
  land: (p) => 'Receipt ' + p.receipt.id + ' holds on the current head. Landed at ' + p.landed.sha + '.',
  done: (p) =>
    'Landed. ' +
    p.runs.length +
    ' proof runs, ' +
    (p.runs.filter((r) => r.result === 'red').length - 1) +
    ' red after the judge. The receipt is on the Proofs page.',
  declined: (t) =>
    'Understood. "' + t + '" stays proven and unlanded. Its receipt is good until a path it proved changes.',
};

export const ANSWERS = {
  overseer: (s) =>
    s.proofs.filter((p) => p.landed).length +
    ' proven changes have landed and ' +
    s.proposals.filter((p) => p.state === 'open').length +
    ' things wait on you. Ask me for anything in numbers.',
  steward: () =>
    'A judge is the test that defines done. I write it before anyone builds, and it has to be red first, or it proves nothing.',
  operations: () => 'I build against the judge until it is green. When a run is red I say why in one line.',
  ask: () => 'Tell me what the person using it should see first. I draw from there, then Operations builds it.',
  master: () => 'I land only what carries a receipt that still holds on the current head. Nothing else.',
};

// DEMO SCENES: a request that starts somewhere else first. The team says what it does there, then proves the change the usual way.
// Everything in a scene is example data: no account is signed in to and no ticket system is touched.
export const SCENES = [
  {
    re: /jira|ticket/i,
    work: 'FO-142: Export button does nothing on Safari',
    pre: [
      [
        'overseer',
        'Four steps. Operations signs in to Jira and reads your tickets. I choose which one goes first. Steward pins what done means. Operations makes the change and Master proves it before it lands.',
      ],
      [
        'operations',
        'Signed in to Jira with the access you gave the team. Three tickets are yours: FO-142 Export button does nothing on Safari. FO-139 Wrong total on the invoice page. FO-131 Update the footer year. (Example tickets: this demo touches no Jira account.)',
      ],
      ['overseer', 'FO-142 goes first: it stops customers today. The other two wait in the queue.'],
    ],
    after: [
      'operations',
      'The changeset is 2 files and 14 lines: export.js and its test. I attached the receipt to FO-142 and moved it to In review.',
    ],
  },
];

export const short = (t) => {
  const x = String(t || '')
    .replace(/\s+/g, ' ')
    .trim();
  return x.length > 90 ? x.slice(0, 87).replace(/\s+\S*$/, '') + '…' : x;
}; // a request as a label: a card's title, a line in a message

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 38) || 'change';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A NEW TEAM STARTS FROM NOTHING: no chat, no work, no proofs, no lessons, and nothing chosen for it. Whatever appears afterwards, the
// customer or their team put there. (The demo page fills its own stage; see demo below.)
export function seedState() {
  return {
    v: 2,
    session: null,
    n: 100,
    introSeen: false,
    team: { name: 'Your team', seats: SEATS.map((s) => ({ ...s, status: 'idle', line: '' })) },
    chat: [],
    work: [],
    proofs: [],
    proposals: [],
    workspace: { kind: null, name: '' },
    autonomy: { level: 1, chosen: false }, // until the customer chooses, the team asks before anything lands
    learning: { contribute: false, ledger: [] },
    plan: { mode: null, period: null },
  };
}
