// base-lessons.js - WHAT EVERY TEAM STARTS WITH. A new team has no hindsight of its own, so its first answers would be built on
// nothing. These are general lessons about doing software work well, distilled from what the system this team comes from learned
// the hard way (its own lessons are about its own code and are not copied here: only the practice that would hold anywhere), and from
// a proof-first way of doing QA on real product work: prove a change red then green without a device, hand over one proof image with
// the steps to check it, and keep all of that out of the change itself.
//   when   the situation a seat is in when the lesson applies (Vision matches on it, as well as on the lesson)
//   text   the lesson, in one or two sentences a seat can act on
// They are recalled like any lesson, but only on a firm match, and a customer's own rulings and lessons come first. They are practice,
// not decisions: a ruling the customer makes always outranks one.
const topicRows = (topic, rows) => rows.map(([id, when, text]) => ({ id: 'B-' + id, topic, when, text }));
export const BASE = [
  ...topicRows('Proving a change', [
    [
      'done',
      'about to say a change is done, finished, fixed or working',
      'Done means proven: a check that fails on the code before the change and passes on the code after it. A check that passes on both sides proves nothing about the change; name it as a guard against regression instead.',
    ],
    [
      'base',
      'writing the test or proof for a change, a new function, a new feature',
      'A proof has to run on the old code too. Never have it call something the change adds: drive the new behaviour through data the old code ignores. A red run that fails to compile proves nothing.',
    ],
    [
      'four',
      'reporting test results, red and green runs, base and change',
      'Report all four outcomes by name: red then green is proven; green on both sides is a guard; red on both is a finding about the base, not the change; green then red is a break.',
    ],
    [
      'capture',
      'taking a screenshot or a frame as evidence, proving a layout or a position',
      'Assert first, then take the picture, so the picture and the result cannot disagree. When the change is about where something sits, assert its position, not only that it exists.',
    ],
    [
      'state',
      'testing several languages, accounts, variants, themes or carriers',
      'One test, one state. Each language, account type or variant gets its own test with a fresh start, so nothing leaks from one into the next.',
    ],
    [
      'apart',
      'where to put proof files, test doubles, proof images, handouts',
      'Proof files and proof images are made for people, not for the repository. Keep them out of the change, and keep only the recipe for rebuilding them.',
    ],
    [
      'close',
      'closing a ticket, handing over finished work, what to deliver',
      'A finished ticket closes with three things, unasked: the proof, any setup the reader has to do outside the code, and numbered steps for whoever checks it.',
    ],
    [
      'medium',
      'choosing between a picture and a video as proof, an animation, a timing bug',
      'Pick the proof by what the behaviour is. A picture for a fixed fact: a layout, a value, a state. A video when it lives in time: an animation, something appearing, a sequence across screens. Both when a timed behaviour also needs steps.',
    ],
    [
      'headless',
      'testing a screen, an app or a mobile app without a device, Android, Robolectric, a browser',
      'Prove a screen without a device first: run the real screen in a headless test on recorded data and capture frames. Keep the device for what a headless run cannot show, which is timing and animation.',
    ],
    [
      'fixtures',
      'recording API responses, test data, fixtures, mock data',
      'Headless proofs run on recorded responses. Keep them generic: no tokens, no real names, emails or account ids, and formatted so a diff is readable. A call that was not recorded should fail loudly, never return an empty success.',
    ],
    [
      'hang',
      'a test run that never finishes, hangs or spins',
      'A test that never finishes usually has something redrawing forever: an animation that escaped being switched off, or a screen holding a splash. Switch animations off, and advance the clock in a bounded loop instead of waiting for idle.',
    ],
    [
      'frames',
      'a proof test failed and you are about to report a bug',
      'Look at the captured frames before believing a failure. A test can fail because of how it drove the screen, such as a scroll that never settles headlessly, and not because the product is wrong.',
    ],
    [
      'process',
      'the product already works and the report came from a test step, no code change needed',
      'When the proof shows the product works and a test step caused the report, hand over a different proof: lead with what to check, list the updated steps with the new ones marked, and put the evidence last.',
    ],
    [
      'image',
      'laying out a proof image, a proof sheet, a report for QA or product',
      'A proof image states one claim and lets the frames prove it: a headline with the claim, the frames side by side with one-line captions that quote the value, and a one-line result. Leave out how it was debugged.',
    ],
    [
      'copied',
      'writing setup instructions, config values, keys, event names for someone else',
      'Every key, value and name in instructions is copied from the code, never from memory. One wrong value in a handout silently sends its reader down the wrong path.',
    ],
    [
      'stale',
      'handing over a proof or instructions made earlier, after the code changed',
      'A proof describes the code as it was when the proof was made. If the code changed since, rebuild the proof before handing it over, and say which earlier copies are out of date.',
    ],
  ]),
  ...topicRows('Evidence', [
    [
      'control',
      'a search, grep, probe or query found nothing, no results, no matches',
      'Before believing a search that found nothing, show it can find something: run it once against a case you know is there.',
    ],
    [
      'empty',
      'a command printed nothing, short output, zero rows, an empty list',
      'Empty output is not success. Check that the thing ran at all, that it read the right place, and how many items it looked at, before reading zero as good news.',
    ],
    [
      'exit',
      'reading whether a command or a script succeeded, exit code, pipeline',
      'An exit code that came through a pipe or a wrapper belongs to the last command, not the one you care about. Read the result itself.',
    ],
    [
      'green',
      'calling a test suite green, passing, all tests pass',
      'Green means the whole suite ran to its end with no failure. A run that stopped early reports what it never ran as absent, which looks nearly green and is not.',
    ],
    [
      'scoped',
      'you ran only some of the tests, a filtered or scoped run',
      'A run scoped to a few tests is evidence about those tests only. Do not quote it as proof the change is safe.',
    ],
    [
      'inferred',
      'diagnosing a crash or a bug by reading the code',
      'Reading the code shows that a mechanism exists; it does not show that it causes the failure. Reproduce it, or say plainly that it is inferred and not measured.',
    ],
    [
      'wired',
      'you have an explanation that fits every symptom, a root cause',
      'An explanation that fits every symptom is not thereby true. Before acting on it, check the suspected cause is actually on the path that failed.',
    ],
    [
      'sample',
      'you measured something once, a timing, a flaky result',
      'One sample is a first impression. Something that flaps needs several readings before you call it a property.',
    ],
    [
      'definition',
      'a number surprised you, two figures disagree, a metric looks wrong',
      'A number that surprises you is more often a problem of definition than a discovery. If two definitions exist, report both and say which one you used.',
    ],
    [
      'narrow',
      'about to write that nothing else changed, everything works, it is identical',
      'Claim what you checked, not what you expect. "Nothing else changed" is a claim about everything; say which files or cases you compared.',
    ],
    [
      'instrument',
      'a tool or a check disagrees with what you believe',
      'When an instrument disagrees with you, suspect yourself first. The tool is usually answering a slightly different question from the one you asked.',
    ],
    [
      'fixture',
      'your tests pass on a fixture or a mock you wrote yourself',
      'A fixture built from your own understanding cannot fail in the way you misunderstand. Drive the real thing once before trusting the fixture.',
    ],
    [
      'mention',
      'a check that matches text, a regex test, a lint rule, a guard',
      'A check that matches text can pass because the text is merely mentioned. Try it on a case that mentions the thing without doing it, and on a deliberate regression.',
    ],
    [
      'coverage',
      'you wrote a fix and are about to say what it solves',
      'Measure how much of the problem your fix closes. A remedy that handles the case you looked at may cover a small share of the cases that exist.',
    ],
    [
      'before',
      'comparing before and after, measuring an improvement',
      'Take "before" from version control, never from the working copy: the working copy already holds your change.',
    ],
  ]),
  ...topicRows('Making the change', [
    [
      'small',
      'deciding how much to change, a fix, a refactor, tidying up',
      'Make the smallest change that fixes what was reported: the fewest files and lines, with no renames or tidy-ups riding along. Flag unrelated cleanup; do not do it.',
    ],
    [
      'needed',
      'starting a ticket or a task written some time ago',
      'Before starting, check the work is still needed. A ticket written against older code may already be done, or its plan may no longer fit. Say so, rather than follow a sketch you know is wrong.',
    ],
    [
      'exists',
      'about to build a new tool, helper, script, counter or check',
      'Before building a helper, search for one that exists. The thing you are about to write has often been written.',
    ],
    [
      'reach',
      'adding a guard, a catch, a fallback or a validation as a fix',
      'A guard the failure cannot reach changes nothing. Trace the failing path and confirm your fix sits on it.',
    ],
    [
      'comments',
      'writing code comments, documentation in code',
      'Default to no comment. When one is needed, write one line that explains the rule a user would recognise, not the mechanics.',
    ],
    [
      'names',
      'naming a constant, a function, a variable or a parameter',
      'A name says what a thing is in plain words. A reader should not need the code around it to decode a constant or a parameter.',
    ],
    [
      'anchor',
      'editing a file by search and replace, a scripted edit, a patch',
      'Make edits that refuse to apply when the text they look for is not unique. A replacement that lands in the wrong place is worse than one that fails.',
    ],
    [
      'fresh',
      'quoting a version number, a hardware figure, a setting from memory or an old note',
      'Never copy a version, a hardware figure or a setting from an old note. Read it from the machine or the file, now.',
    ],
    [
      'restore',
      'reverting, resetting or checking out over a file with changes in it',
      'Reverting a file that holds unsaved work loses it silently. Look at what is there first, and prefer an edit you can run again to one made by hand.',
    ],
  ]),
  ...topicRows('Working with people', [
    [
      'report',
      'writing a status update, a summary, a report to the customer',
      "Report in the reader's language: the finding or the decision first, then what it means, in a few lines. Leave the mechanism out unless you are asked.",
    ],
    [
      'result',
      'ending a piece of work, wrapping up, what to hand back',
      'End on a result, not on an account of effort. If the only thing produced is a clearer explanation, the work is not finished.',
    ],
    [
      'batch',
      'you need several decisions or answers from the customer',
      'When several decisions are needed, ask for them together, and keep working on whatever does not depend on the answers.',
    ],
    [
      'show',
      'proposing a design, a fix or an approach for approval',
      'A proposal shown as the actual change takes one round. The same proposal described in words usually takes two.',
    ],
    [
      'found',
      'you found another bug or problem while working on something else',
      'A defect found while doing something else is written down as its own item, linked to the work that found it. It is not fixed silently and it is not forgotten.',
    ],
    [
      'defect',
      'deciding whether something is a bug, a defect or a suggestion',
      'A defect is a stated expectation that fails. If no written check or expectation fails, it is a suggestion, and is filed as one.',
    ],
    [
      'blame',
      'telling a tester, QA or a user that their steps need to change',
      "When someone's steps need to change, credit what their report got right, say what the tool or platform did and why it is easy to miss, and phrase the new steps as checks. Never frame it as their mistake.",
    ],
  ]),
  ...topicRows('Small local models', [
    [
      'told',
      'a local model, a small model failed a task, gave a bad answer',
      "Before blaming a small model's size, check what it was actually told. An empty or cut-off prompt fails at every size.",
    ],
    [
      'step',
      'giving work to a small model, a local model, an agent on a local model',
      'A small model does best on one small step that can be checked: a line or an expression to fill, with a test that decides. Asked for a whole function it tends to copy what is already there.',
    ],
    [
      'suggest',
      'using the output of a local model, trusting a small model',
      "Treat a small model's output as a suggestion until a check has passed on it. How sure it sounds says nothing.",
    ],
    [
      'repeat',
      'a local model repeats itself, loops, breaks down, a long path or string',
      'A small model often breaks down on a long unfamiliar string or a repeated piece. Shorten paths, give repeats a name, and cut and ask again rather than wait for it to recover.',
    ],
  ]),
  ...topicRows('Answering a question', [
    [
      'flaky',
      'a flaky test, an intermittent failure, a test that times out sometimes, one run in five, CI is flaky',
      'A test that fails some of the time is a race or shared state until shown otherwise. Find the step that differs between a failing run and a passing one, from the traces. A fixed wait or a longer timeout hides the fault: never offer one as the fix.',
    ],
    [
      'undo',
      'undo a commit that was pushed, a bad commit on main, others have pulled it, shared branch history',
      'What others have already pulled is undone with a new commit: git revert. Rewriting shared history (reset --hard and a forced push) takes their work with it, so it is not offered as a way to do this, only named as what to avoid.',
    ],
    [
      'secrets',
      'store passwords, user passwords, password hash, credentials in the database',
      'Passwords are stored as a slow, salted password hash: argon2id, bcrypt or scrypt, through a maintained library. Never encrypted, never a fast hash such as MD5 or SHA alone.',
    ],
    [
      'unseen',
      'what is in a file, what is on a line, why did it fail, what does the log say, what is in our config',
      'A question about their own code, config or logs can only be answered from what was shown. If it was not shown, say so, and say how to look or ask for it. Never describe a file, a line or a cause from guesswork.',
    ],
  ]),
  ...topicRows('Looking at a screen', [
    [
      'visible',
      'checking a page, a screen, a button exists, QA of a user interface',
      'Present in the page is not the same as visible. Check the thing can be seen and reached at the widths people use, not only that it exists.',
    ],
    [
      'judge',
      'using a screenshot or a picture to check a page',
      "Use a picture for judgement (does it look right) and the page's own words and measurements for facts (what it says, whether it overflows).",
    ],
    [
      'states',
      'reviewing a screen, a design, a form, a list',
      'A screen has more than one state: empty, loading, failed, long text, large type, another language. Check the ones a real person will meet.',
    ],
    [
      'read',
      'sharing a proof image, a screenshot, a handout, a picture of results',
      'Open the finished image and read every value in it before you share it. People act on the image, not on what it was built from.',
    ],
  ]),
];
