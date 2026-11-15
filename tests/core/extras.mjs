// extras.mjs - WHAT GOES UNDER A REPLY BESIDES ITS WORDS (src/js/team/extras.js): answers to tap, fields to fill, a timer, a sum
// worked by the app, a day down a line, commands to copy or run, what was seen and not seen. Each is read off the reply itself,
// with no model asked, and each says nothing when the reply does not bear it out.
//   node tests/core/extras.mjs
import {
  commandsIn,
  dayPlanIn,
  extrasOf,
  fieldsIn,
  icsOf,
  mapUrl,
  originOf,
  quickReplies,
  seenIn,
  sumFor,
  timerIn,
} from '../../src/js/team/extras.js';

let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 500)));
  if (!ok) failed++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// answers to tap
const or = quickReplies('Both take about twenty minutes. Do you want the garlic and oil one or the creamy tomato one?');
check(
  'a reply that ends by asking for one of two things offers those two to tap, in its own words',
  same(or, ['Garlic and oil one', 'Creamy tomato one']),
  or,
);
check(
  'a question a yes or a no answers offers those; one that is open offers nothing; and a question in the middle of a reply is not one',
  same(quickReplies('I can look up the times. Would you like me to?'), ['Yes', 'No']) &&
    quickReplies("What's in your fridge right now?").length === 0 &&
    quickReplies('Do you eat pork? Either way, start the water now.').length === 0,
  [quickReplies('I can look up the times. Would you like me to?'), quickReplies("What's in your fridge right now?")],
);
// fields to fill
const fields = fieldsIn('I can help find it. Tell me your airline, your flight number and where you are flying to.');
check(
  'a reply that asks for three facts at once gives a field for each',
  same(fields, ['Airline', 'Flight number', 'Where you are flying to']),
  fields,
);
check(
  'one that asks for a single thing gives none',
  fieldsIn('Tell me your postcode.').length === 0,
  fieldsIn('Tell me your postcode.'),
);

// a timer
const timer = timerIn(
  'how long do I boil an egg for a soft yolk?',
  'Six to seven minutes in boiling water, straight from the fridge.',
);
check(
  '"six to seven minutes" for something being boiled is a timer of six minutes, up to seven',
  !!timer && timer.seconds === 360 && timer.upTo === 420,
  timer,
);
check(
  'a duration that is not something the person is about to do, or no duration at all, is not',
  timerIn('How long is the flight to Lisbon?', 'About 150 minutes from London.') === null &&
    timerIn('how long do I boil an egg?', 'Until the white is set.') === null,
  timerIn('How long is the flight to Lisbon?', 'About 150 minutes from London.'),
);

// a sum, worked by the app
const turkey = sumFor(
  'How long does a 5 kg turkey take to defrost in the fridge?',
  'A 5 kg turkey takes about 24 hours.',
  'The USDA says 24 hours for every 4 to 5 pounds of bird.',
);
check(
  'the sum is done by the app from the rate the sources give: a 5 kg turkey at 24 hours for every 4 to 5 pounds is between two and three days, whatever the reply said',
  !!turkey &&
    turkey.least >= 52 * 60 &&
    turkey.most <= 67 * 60 &&
    /days/.test(turkey.says) &&
    /5 kg/.test(turkey.working),
  turkey,
);
const roast = sumFor('How long do I roast a 2 kg chicken?', 'Allow 20 minutes per 500 g, plus resting.');
check(
  'a rate in grams against an amount in kilos works the same way',
  !!roast && roast.most === 80 && roast.says === '80 minutes',
  roast,
);
check(
  'with no rate, or no amount, there is no sum',
  sumFor('How long does a turkey take?', '24 hours for every 2 kg') === null &&
    sumFor('a 5 kg turkey', 'about a day') === null,
  null,
);

// a day, down a line
const day = dayPlanIn(
  'Here is the day. 10:00 - the park while it is cool. 12:30 - lunch at the cafe by the gate. 3pm: cake at home. Bed by 7:30pm, with luck.',
);
check(
  'three or more times, each with what happens then, are a day in order',
  day.length >= 3 &&
    day[0].at === '10:00' &&
    /park/.test(day[0].what) &&
    day[1].at === '12:30' &&
    day[2].at === '15:00',
  day,
);
check(
  'figures that are not times are not a day',
  dayPlanIn('Boil for 6 minutes, then 2 minutes in cold water, serves 4.').length === 0,
  dayPlanIn('Boil for 6 minutes, then 2 minutes in cold water, serves 4.'),
);
const ics = icsOf(day, '2026-11-21', 'Saturday with Mia');
check(
  'and a calendar file of it: one event for each, each ending when the next begins',
  /^BEGIN:VCALENDAR\r\n/.test(ics) &&
    (ics.match(/BEGIN:VEVENT/g) || []).length === day.length &&
    /DTSTART:20261121T100000\r\nDTEND:20261121T123000/.test(ics) &&
    /END:VCALENDAR\r\n$/.test(ics),
  ics.slice(0, 300),
);

// commands
const cmds = commandsIn(
  'Start with `git status` and `npx playwright test tests/checkout.spec.ts --repeat-each=20`. Do not `git push --force`.\n```\nnpm install left-pad\ngit log --oneline -5\n```',
);
check(
  'the commands in a Developer reply are found; ones that only read or test may be run, and ones that change or throw away never',
  same(
    cmds.map((c) => [c.cmd.split(' ').slice(0, 2).join(' '), c.run]),
    [
      ['npm install', false],
      ['git log', true],
      ['git status', true],
      ['npx playwright', true],
    ],
  ),
  cmds,
);
check(
  'a forced push is found and never offered to be run',
  (() => {
    const c = commandsIn('You could `git push --force origin main`.');
    return c.length === 1 && c[0].run === false;
  })(),
  commandsIn('You could `git push --force origin main`.'),
);

// seen, and not seen
const seen = seenIn(
  'What is on line 40 of our nginx.conf?',
  "I haven't seen your nginx.conf, so I can't say. Paste the file and I will read it.",
);
check(
  'what the reply says it has not seen is listed, beside what the customer named',
  !!seen &&
    seen.notSeen.some((x) => /nginx\.conf/.test(x)) &&
    seen.seen.some((x) => /nginx\.conf \(named, not opened\)/.test(x)),
  seen,
);
check(
  'a reply that says nothing of what it has not seen has no such list',
  seenIn('UTC or local time?', 'Store timestamps in UTC.') === null,
  null,
);

// where it came from, and a map
check(
  'an answer with sources was looked up; one without is from memory, checked or not',
  same(originOf({ by: 'operations', text: 'x', sources: [{ n: 1 }, { n: 2 }] }), {
    how: 'looked',
    sources: 2,
    checked: false,
  }) &&
    same(originOf({ by: 'overseer', text: 'x', checkedBy: { agreed: true } }), {
      how: 'memory',
      sources: 0,
      checked: true,
    }) &&
    originOf({ by: 'you', text: 'x' }) === null,
  originOf({ by: 'overseer', text: 'x' }),
);
check(
  'a place opens on a map by its name and where the person is',
  /openstreetmap\.org\/search\?query=Regal%20Westfork%2C%20Idaho/.test(mapUrl('Regal Westfork', 'Idaho')),
  mapUrl('Regal Westfork', 'Idaho'),
);

// all of it for one reply, by mode
const simple = extrasOf(
  { by: 'overseer', text: 'Six to seven minutes in boiling water. Do you want it runny or just set?' },
  { simple: true, asked: 'how long do I boil an egg?', mode: 'answer' },
);
const dev = extrasOf(
  { by: 'operations', text: "I haven't seen the logs. Run `git log --oneline -5` and paste the output." },
  { simple: false, asked: "Why did last night's deploy fail?", mode: 'answer' },
);
check(
  'in Simple a reply carries where it came from, a timer and answers to tap; in Developer its commands and what was not seen; small talk carries nothing',
  !!simple &&
    simple.origin.how === 'memory' &&
    !!simple.timer &&
    same(simple.replies, ['Runny', 'Just set']) &&
    !simple.commands &&
    !!dev &&
    dev.commands.length === 1 &&
    dev.commands[0].run &&
    !!dev.seen &&
    !dev.timer &&
    !dev.origin &&
    extrasOf({ by: 'overseer', text: 'Any time.' }, { simple: true, asked: 'thanks', mode: 'talk' }) === null,
  [simple, dev],
);
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
