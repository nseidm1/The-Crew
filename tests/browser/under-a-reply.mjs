// under-a-reply.mjs - WHAT A REPLY CARRIES UNDER IT, in the real chat of the real app, in both modes. A chat is written into the
// app's own store (every piece read off its reply by src/js/team/extras.js, as the core does) and the app paints it: where an
// answer came from, a timer, a sum the app worked, a day and its calendar file, a comparison, places with a way to a map, a
// draft's controls, fields to fill, marks from teammates; in Developer commands to copy or run, what was seen and not seen, a
// plan with the sections its planner chose, the choices on a proven change with its diff, and a proof's runs.
//   node tests/browser/under-a-reply.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const OUT = path.join(WORK, 'under-a-reply');
const PORT = 5279 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = path.join(OUT, 'state');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 600)));
  if (!ok) failed++;
};
fs.rmSync(state, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
const srv = spawn(process.execPath, [path.join(SRC, 'server.mjs')], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    FO_KEEP: '1',
    FO_STATE_DIR: state,
    FO_FAKE_DIR: state,
    FO_NO_OPEN: '1',
    FO_NO_NET: '1',
    FO_BILLING: '{"enforce":false}',
    FO_BIN_CLAUDE: path.join(FAKES, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_LINK_PORT: String(47889 + SHIFT),
  },
});
process.on('exit', () => {
  try {
    srv.kill('SIGKILL');
  } catch {
    /* gone */
  }
});
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(B + '/api/setup')).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(150);
}
const { extrasOf } = await import(path.join(SRC, 'js/team/extras.js'));
const now = Date.now();
let n = 500;
const you = (text) => ({ id: 'm' + ++n, by: 'you', at: now, text });
const said = (by, text, asked, mode, simple, more = {}) => {
  const m = { id: 'm' + ++n, by, at: now, text, ...more };
  const x = extrasOf(m, { simple, asked, mode, sourcesText: more.sourcesText || '', shown: more.shown || [] });
  if (x || more.extras) m.extras = { ...(x || {}), ...(more.extras || {}) };
  delete m.sourcesText;
  delete m.shown;
  return m;
};
const CHATS = {
  simple: [
    you('how long do I boil an egg for a soft yolk?'),
    said(
      'overseer',
      'Six to seven minutes in boiling water, straight from the fridge. Do you want it runny or just set?',
      'how long do I boil an egg for a soft yolk?',
      'answer',
      true,
      {
        reactions: [
          { by: 'steward', mark: 'checked' },
          { by: 'operations', mark: 'agreed' },
        ],
        checkedBy: { seat: 'steward', agreed: true },
      },
    ),
    you('How long does a 5 kg turkey take to defrost in the fridge?'),
    said(
      'operations',
      'Allow two to three days for a 5 kg bird, on a tray at the bottom of the fridge.',
      'How long does a 5 kg turkey take to defrost in the fridge?',
      'research',
      true,
      {
        sources: [
          { n: 1, title: 'Turkey basics: safe thawing', url: 'https://www.fsis.usda.gov/turkey' },
          { n: 2, title: 'How to defrost a turkey', url: 'https://www.bbcgoodfood.com/turkey' },
        ],
        sourcesText: 'Allow about 24 hours for every 4 to 5 pounds of bird in the refrigerator.',
      },
    ),
    you('Plan us a Saturday with Mia'),
    said(
      'overseer',
      'Here is the day. 10:00 - the park while it is cool. 12:30 - lunch at the cafe by the gate. 3pm: cake at home. 5:30pm - a film on the sofa.',
      'Plan us a Saturday with Mia',
      'answer',
      true,
    ),
    you('Kindle or iPad for reading in bed?'),
    said(
      'overseer',
      'For reading in bed the Kindle is the one.',
      'Kindle or iPad for reading in bed?',
      'answer',
      true,
      {
        card: {
          kind: 'compare',
          icon: 'bulb',
          title: 'Kindle or iPad',
          big: '',
          small: '',
          rows: [],
          items: [],
          picks: [],
          good: [],
          bad: [],
          warn: '',
          note: 'For reading in bed the Kindle is the one.',
          compare: {
            options: ['Kindle', 'iPad'],
            rows: [
              ['Battery', 'weeks on a charge', 'about a day'],
              ['Weight', 'light in one hand', 'heavier'],
              ['Price', 'about 100', 'about 350'],
            ],
          },
        },
        cardOnly: true,
      },
    ),
    you('Where can we get good pizza near us?'),
    said('operations', 'Three good ones nearby.', 'Where can we get good pizza near us?', 'research', true, {
      card: {
        kind: 'picks',
        icon: 'fork',
        title: 'Pizza near you',
        big: '',
        small: '',
        rows: [],
        items: [],
        good: [],
        bad: [],
        warn: '',
        note: '',
        picks: [
          { name: 'Casa Guedes', note: 'wood oven, busy at eight' },
          { name: 'Forno 51', note: 'thin base, quiet' },
          { name: 'Pizzaria Luzzo', note: 'the one with the garden' },
        ],
      },
      cardOnly: true,
      sources: [{ n: 1, title: 'Pizza in Porto', url: 'https://example.org/pizza' }],
    }),
    you('Write a short note to my landlord about the boiler'),
    said(
      'master',
      'Dear Mr Alves, the boiler in flat 3 has not heated water since Monday. Could someone come this week? I am in every day after five. Thank you, Dana',
      'Write a short note to my landlord about the boiler',
      'do',
      true,
      { extras: { draft: true } },
    ),
    you('Can you help me rebook my flight?'),
    said(
      'overseer',
      "We can't change the booking ourselves, but we can find where you do it. Tell me your airline, your booking reference and the new date.",
      'Can you help me rebook my flight?',
      'answer',
      true,
    ),
  ],
  developer: [
    you('What is on line 40 of our nginx.conf?'),
    said(
      'overseer',
      "I haven't seen your nginx.conf, so I can't say what is on line 40. Paste the file, or run `cat nginx.conf` and `git log --oneline -5` so I can see what changed. Do not `git push --force` anything meanwhile.",
      'What is on line 40 of our nginx.conf?',
      'answer',
      false,
    ),
    you('The basket total should include delivery'),
    {
      id: 'm' + ++n,
      by: 'overseer',
      at: now,
      text: 'The plan, from your request: three requirements.',
      plan: {
        title: 'The basket total should include delivery',
        source: 'request',
        key: '',
        n: 2,
        max: 3,
        stage: 'waiting',
        says: 'Proven. It waits for your word.',
        rev: 1,
        reqs: [
          {
            text: 'The basket total includes delivery.',
            state: 'met',
            why: 'the total test passes with delivery added',
          },
          { text: 'An empty basket shows no total.', state: 'met', why: 'pinned by the empty case' },
          { text: 'The total is shown in pounds.', state: 'met', why: '' },
        ],
        sections: {
          files: ['src/basket.js', 'tests/basket.test.js'],
          risk: 'Rounding the total twice. Undone by reverting the one commit.',
          cases: ['empty basket', 'one item', 'free delivery over 50'],
          lead: 1,
        },
        checks: [
          {
            id: 'L-1',
            text: 'Round money once, at the end, in pence.',
            state: 'applied',
            line: 'the total is rounded in one place',
          },
          { id: 'L-2', text: 'Nothing lands on a Friday afternoon.', state: 'skipped', line: 'not answered' },
        ],
        diff: {
          files: ['src/basket.js', 'tests/basket.test.js'],
          text: '@@ -12,7 +12,8 @@ export function total(items) {\n-  return sum(items);\n+  const goods = sum(items);\n+  return goods ? goods + delivery(goods) : 0;\n }\n',
          cut: false,
        },
      },
    },
    {
      id: 'm' + ++n,
      by: 'master',
      at: now,
      text: 'Proven. The proof fails on the code before the change and passes on the code after it.',
      proof: 'ab12',
    },
  ],
};
const proofs = [
  {
    id: 'PF-ab12',
    title: 'The basket total should include delivery',
    at: now,
    real: true,
    by: { judge: 'steward', code: 'operations' },
    receipt: null,
    landed: null,
    judge: 'The proof',
    runs: [
      { n: 1, result: 'red', why: 'on the code before the change, 2 of 3 checks fail, as they must' },
      { n: 2, result: 'red', why: 'an empty basket showed 3.50' },
      { n: 3, result: 'green', why: 'all 3 checks pass on the change' },
    ],
  },
];

await fetch(B + '/api/setup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ engine: 'claude', mode: 'simple' }),
});
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (!(await (await fetch(B + '/api/setup')).json()).busy) break;
}
const browser = await chromium.launch();
const errors = [];
for (const mode of ['simple', 'developer']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem('familyoffice.mode', m);
    } catch {
      /* none */
    }
  }, mode);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(mode + ': ' + String(e.message).slice(0, 200)));
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#meet, #resume-go').first().waitFor({ timeout: 30000 });
  if (await p.locator('#resume-go').count()) {
    await p.locator('#resume-go').click();
    await p.locator('#meet').waitFor({ timeout: 20000 });
  }
  await p.locator('#meet').click();
  await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 30000 });
  await sleep(600);
  await p.evaluate(
    ({ chat, proofs }) => {
      const s = JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}');
      s.chat = chat;
      s.proofs = proofs;
      s.n = 900;
      s.learning = s.learning || { ledger: [] };
      s.learning.ledger = [
        { id: 'y1', kind: 'you', text: 'They live in Porto.', at: Date.now() },
        ...(s.learning.ledger || []),
      ];
      localStorage.setItem('familyoffice.core.v1', JSON.stringify(s));
    },
    { chat: CHATS[mode], proofs },
  );
  await p.reload({ waitUntil: 'load' });
  await p.locator('.chat-log .msg').first().waitFor({ timeout: 20000 });
  await sleep(1500);
  // the whole chat, not only what fits in the window
  const log = p.locator('.chat-log');
  const full = await log.evaluate((el) => el.scrollHeight);
  await p.setViewportSize({ width: 1280, height: Math.min(4200, full + 420) });
  await sleep(900);
  await log.evaluate((el) => (el.scrollTop = 0));
  await sleep(300);
  await p.screenshot({ path: path.join(OUT, 'extras-' + mode + '.png'), fullPage: true });
  const got = await p.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    return {
      origin: q('.x-origin'),
      timer: q('.x-timer'),
      sum: q('.x-sum'),
      day: q('.x-day'),
      replies: [...document.querySelectorAll('.x-replies button')].filter((b) => b.offsetParent).length, // the ones that can be seen
      form: q('.x-form input'),
      draft: q('.x-draft button'),
      reacts: q('.x-react'),
      compare: q('.ac-compare tr'),
      map: q('.ac-map'),
      cmds: q('.x-cmds li'),
      seen: q('.x-seen'),
      runs: q('.x-runs li'),
      choices: q('.plan-choices button'),
      more: q('.plan-more p'),
      checks: [...document.querySelectorAll('.plan-checks li')]
        .map((li) => li.className + ': ' + li.querySelector('b').textContent)
        .join(' | '),
      diff: q('.plan-diff pre span'),
      moods: [...document.querySelectorAll('.chat-log .msg svg.bd')].map((e) => e.dataset.mood).join(','),
    };
  });
  if (mode === 'simple') {
    check(
      "Simple: under its replies are where each checkable answer came from, a timer, a worked sum, a day, a draft's four controls, three fields, and two marks from teammates",
      got.origin === 3 &&
        got.timer === 1 &&
        got.sum === 1 &&
        got.day === 1 &&
        got.draft === 4 &&
        got.form === 3 &&
        got.reacts === 2,
      got,
    );
    check(
      'a comparison is a table of its options, and each place has a way to a map',
      got.compare === 4 && got.map === 3,
      got,
    );
    check(
      "answers to tap are gone once the person has written again, and none of Developer's pieces are shown",
      got.replies === 0 && got.cmds === 0 && got.choices === 0,
      got,
    );
    const sum = await p.locator('.x-sum span').innerText();
    check(
      "the sum is the app's own: a 5 kg bird at 24 hours for every 4 to 5 pounds is between 2 and 3 days",
      /between 2(\.5)? days and 3 days/.test(sum),
      sum,
    );
    await p.locator('.x-timer button').click();
    await sleep(2300);
    const clock = await p.locator('.x-clock').innerText();
    check('the timer counts down from the six minutes the reply named', /^5:5[5-9]$/.test(clock), clock);
    const [file] = await Promise.all([
      p.waitForEvent('download', { timeout: 8000 }),
      p.locator('.x-day button').click(),
    ]);
    const saved = path.join(OUT, 'plan.ics');
    await file.saveAs(saved);
    const ics = fs.readFileSync(saved, 'utf8');
    check(
      'the day is handed over as a calendar file with its four events',
      /^BEGIN:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length === 4,
      ics.slice(0, 200),
    );
    const href = await p.locator('.ac-map').first().getAttribute('href');
    check(
      'a place opens on a map by its name and where the person lives',
      /openstreetmap\.org\/search\?query=Casa%20Guedes%2C%20Porto/.test(href),
      href,
    );
    check(
      'the faces beside the replies show what each is: a question back, an answer that was checked, a looked-up one',
      /^curious,proud,happy/.test(got.moods),
      got.moods,
    );
  } else {
    check(
      "Developer: a reply's commands are listed to copy (three), what was seen and not seen is said, and none of Simple's pieces are shown",
      got.cmds === 3 && got.seen === 1 && got.timer === 0 && got.origin === 0 && got.draft === 0,
      got,
    );
    const runnable = await p.evaluate(() =>
      [...document.querySelectorAll('.x-cmds li')].map(
        (li) => li.querySelector('code').textContent + ' => ' + (li.querySelector('em') || {}).textContent,
      ),
    );
    check(
      'a command that reads may be run once a workspace is connected; one that throws work away can only be copied',
      /cat nginx\.conf => Connect a workspace/.test(runnable.join('|')) &&
        /git push --force => Copy only/.test(runnable.join('|')),
      runnable,
    );
    check(
      'a plan carries the sections its planner chose (files, cases, the risk), a proven change has more than a yes and a no, and its diff is shown',
      got.more === 3 && got.choices === 3 && got.diff >= 5,
      got,
    );
    check(
      "a proof's runs are shown red to green",
      got.runs === 3 && (await p.locator('.x-runs li.is-green').count()) === 1,
      got.runs,
    );
    check(
      'the lessons the round had to answer are on the plan, each with how it was answered: applied, or skipped and said so',
      got.checks === 'is-applied: Applied | is-skipped: Skipped',
      got.checks,
    );
    check(
      'the lead requirement is marked',
      (await p.locator('.plan-lead').count()) === 1,
      await p.locator('.plan-lead').count(),
    );
  }
  await ctx.close();
}
check('nothing on the page threw', errors.length === 0, errors);
await browser.close();
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
