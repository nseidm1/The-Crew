// plan-in-chat.mjs - THE PLAN AND ITS ROUNDS, SEEN IN THE GROUP CHAT: a real browser, the real page and runner, a stand-in for Claude
// that leaves the second requirement unmet the first time it judges (FO_FAKE_JUDGE=second), and a Git folder to build in. The
// request is planned, built, proven, judged, goes round once for what was not met, and lands; the checks are on what the chat
// shows at each point, on a computer and on a phone.   node tests/browser/plan-in-chat.mjs      pictures: .work/plan/
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'plan-state');
const OUT = path.join(WORK, 'plan');
const PORT = 5239;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(state, 'bin'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 900)));
  if (!ok) bad++;
};
// a Git folder for the team to work in: one file, one commit
const repo = path.join(state, 'menu-site');
const git = (...a) =>
  execFileSync('git', a, {
    cwd: repo,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
fs.mkdirSync(repo, { recursive: true });
fs.writeFileSync(path.join(repo, 'README.md'), '# Menu site\n');
fs.writeFileSync(
  path.join(repo, 'package.json'),
  JSON.stringify({ name: 'menu-site', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2) +
    '\n',
);
git('init', '-q', '-b', 'main');
git('add', '-A');
git('commit', '-q', '-m', 'Start');
const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    FO_KEEP: '1',
    FO_STATE_DIR: state,
    FO_FAKE_DIR: state,
    FO_NO_NET: '1',
    FO_NO_OPEN: '1',
    FO_BILLING: '{"enforce":false}',
    FO_FAKE_JUDGE: 'second',
    FO_PICK_FOLDER: repo,
    FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_LINK_PORT: '47899',
  },
});
process.on('exit', () => {
  try {
    srv.kill('SIGTERM');
  } catch {
    /* gone */
  }
});
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(B + '/api/setup')).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(150);
}
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
{
  const s = await ctx.newPage();
  await s.goto(B + '/start.html', { waitUntil: 'load' });
  await s.locator('#modes').waitFor({ timeout: 15000 });
  await s.locator('#mode-simple').click();
  await s.locator('#simple-start').waitFor({ timeout: 20000 });
  await s.locator('#mind-claude').click();
  await s.locator('#simple-start').click();
  await s
    .getByText(/Your models? (is|are) running|Claude is ready|Your team is ready/)
    .first()
    .waitFor({ timeout: 90000 });
  await s.locator('#meet').click();
  await s.locator('.composer input').waitFor({ timeout: 15000 });
  await s.evaluate(() => localStorage.setItem('familyoffice.mode', 'developer'));
  await s.close();
}
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(B + '/app.html', { waitUntil: 'load' });
await p.locator('.composer input').waitFor({ timeout: 20000 });
await sleep(600);
// the folder is connected the way a person does it: the Workspace page, "Find a Git folder" (the folder window is stood in for)
await p.goto(B + '/app.html#workspace', { waitUntil: 'load' });
await p.locator('#ws-folder').waitFor({ timeout: 20000 });
await p.locator('#ws-folder').click();
await p.locator('#ws-folder-path').waitFor({ timeout: 30000 });
await sleep(600);
if (await p.locator('dialog.step-done[open]').count()) {
  await p.keyboard.press('Escape');
  await sleep(300);
} // "that step is done": closed, as a person would
await p.locator('#nav a[href="#chat"]').click();
await p.locator('.composer input').waitFor({ timeout: 20000 });
await sleep(900);
const linked = await p.evaluate(() => (document.querySelector('#chips') || {}).innerText || '');
check('the team has a Git folder to work in, and the page says so', /menu-site/.test(linked), linked);
// every state the plan's cards pass through is written down as it is shown
await p.evaluate(() => {
  window.__seen = [];
  const note = () => {
    for (const c of document.querySelectorAll('.plan-card')) {
      const k = c.dataset.round + ':' + c.dataset.stage;
      if (!window.__seen.includes(k)) window.__seen.push(k);
    }
  };
  new MutationObserver(note).observe(document.querySelector('.chat-log'), {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-stage'],
  });
});
const say = async (t) => {
  await p.locator('.composer input').fill(t);
  await p.keyboard.press('Enter');
};
await say('Add the opening hours to the README and keep its title');
// the Overseer may say where it will go and wait for "go"
for (let i = 0; i < 80 && !(await p.locator('.plan-card').count()); i++) {
  if (await p.evaluate(() => /Say "go"|say "go"/.test(document.querySelector('.chat-log').innerText))) {
    await say('go');
    await sleep(1500);
  }
  await sleep(400);
}
try {
  await p.locator('.plan-card').first().waitFor({ timeout: 60000 });
} catch {
  console.log(
    'NO PLAN. The chat:\n' +
      (await p.evaluate(() =>
        [...document.querySelectorAll('.chat-log .msg')]
          .map(
            (m) =>
              (m.querySelector('.msg-head strong') || {}).textContent +
              ': ' +
              ((m.querySelector('p') || {}).innerText || '').slice(0, 500),
          )
          .join('\n'),
      )),
  );
}
let mid = null;
try {
  await p.locator('.plan-card[data-round="2"].is-live').waitFor({ timeout: 150000 });
  await sleep(250);
  mid = await p.evaluate(() => {
    const c = document.querySelector('.plan-card[data-round="2"]');
    return c
      ? { stage: c.dataset.stage, now: (c.querySelector('.plan-track li[aria-current="step"]') || {}).innerText || '' }
      : null;
  });
  await p.locator('.plan-card[data-round="2"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(OUT, 'round-2-live.png') });
} catch {
  mid = null;
}
try {
  await p.locator('.plan-card[data-round="2"][data-stage="landed"]').waitFor({ timeout: 120000 });
} catch {
  console.log(
    'NOT LANDED. The chat:\n' +
      (await p.evaluate(() =>
        [...document.querySelectorAll('.chat-log .msg')]
          .map(
            (m) =>
              (m.querySelector('.msg-head strong') || {}).textContent +
              ': ' +
              ((m.querySelector('p') || {}).innerText || '').slice(0, 400) +
              ' ' +
              [...m.querySelectorAll('.plan-card')]
                .map(
                  (c) =>
                    '[card ' +
                    c.dataset.round +
                    ' ' +
                    c.dataset.stage +
                    ' ' +
                    (c.querySelector('.plan-says') || {}).innerText +
                    ']',
                )
                .join(''),
          )
          .join('\n'),
      )),
  );
}
await sleep(700);
const read = () =>
  p.evaluate(() => {
    const log = document.querySelector('.chat-log').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.plan-card')].map((c) => {
      const b = c.getBoundingClientRect();
      const shown = (q) => {
        const e = c.querySelector(q);
        return !!e && getComputedStyle(e).display !== 'none';
      };
      return {
        round: c.dataset.round,
        stage: c.dataset.stage,
        by: c.closest('.msg').querySelector('.msg-head strong').textContent,
        head: c.querySelector('.plan-head').innerText.replace(/\s+/g, ' ').trim(),
        track: shown('.plan-track')
          ? [...c.querySelectorAll('.plan-track li')].map(
              (li) => li.className.replace('is-', '') + ':' + li.innerText.trim(),
            )
          : null,
        loop: shown('.plan-loop') ? c.querySelector('.plan-loop').innerText.trim() : null,
        reqs: [...c.querySelectorAll('.plan-reqs li')].map((li) => ({
          state: li.className.replace('is-', ''),
          says: li.querySelector('.plan-mark').getAttribute('aria-label'),
          text: li.querySelector('.plan-req').innerText.replace(/\s+/g, ' ').trim(),
          mark: getComputedStyle(li.querySelector('.plan-mark'), '::after').content !== 'none',
        })),
        bar: [...c.querySelectorAll('.plan-bar i')].map((i) => i.className.replace('is-', '')).join(),
        barSays: c.querySelector('.plan-bar').getAttribute('aria-label'),
        pips: [...c.querySelectorAll('.plan-pips i')].map((i) => i.className || 'todo').join(),
        says: (c.querySelector('.plan-says') || {}).innerText || '',
        inside: b.left >= log.left - 1 && b.right <= log.right + 1,
        clipped: [...c.querySelectorAll('.plan-track li span, .plan-lap, .plan-req')].some(
          (e) => e.scrollWidth > e.clientWidth + 1,
        ),
      };
    });
    return {
      cards,
      wide: document.scrollingElement.scrollWidth - innerWidth,
      seen: window.__seen || [],
      chat: [...document.querySelectorAll('.chat-log .msg')].map(
        (m) =>
          (m.querySelector('.msg-head strong') || {}).textContent +
          ': ' +
          ((m.querySelector('p') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 150),
      ),
    };
  });
const d = await read();
const [c1, c2] = d.cards;
check(
  "the plan is a card under the Overseer's message: whose plan, which round of how many, and one row for each requirement",
  d.cards.length === 2 &&
    /Overseer/.test(c1.by) &&
    /^PLAN from your request Round 1 of 3$/i.test(c1.head) &&
    c1.reqs.length === 2 &&
    c1.reqs[0].text.startsWith('The README says what was asked.') &&
    c1.reqs[1].text.startsWith('The README keeps its title.'),
  c1,
);
check(
  'each state the round passes through is shown as it happens: plan, build, prove, judge, and then round 2 the same way to landed',
  ['1:plan', '1:build', '1:prove', '1:judge', '1:again', '2:plan', '2:build', '2:prove', '2:judge', '2:landed'].every(
    (k) => d.seen.includes(k),
  ),
  d.seen,
);
check(
  'while a round is running its card says where it is, with that step marked as the current one',
  !!mid &&
    ['plan', 'build', 'prove', 'judge', 'judged'].includes(mid.stage) &&
    /Plan|Build|Prove|Judge|Land/.test(mid.now),
  mid,
);
check(
  "the first round's card stays as the record of how it ended: one met, one not met (said in words and by a different mark), and that it went round again",
  c1.stage === 'again' &&
    c1.reqs.map((r) => r.state + '/' + r.says).join() === 'met/Met,unmet/Not met' &&
    c1.reqs.every((r) => r.mark) &&
    /Not met: the title line is not checked yet/.test(c1.reqs[1].text) &&
    c1.loop === 'Not all met: it went round again' &&
    c1.track === null &&
    /Round 1 ended: 1 of 2 requirements met/.test(c1.says) &&
    c1.bar === 'met,unmet' &&
    c1.barSays === '1 of 2 met',
  c1,
);
check(
  'the second round has its own card under the Overseer\'s "Round 2 of 3": every step done, every requirement met, and where it landed',
  /Overseer/.test(c2.by) &&
    /^PLAN, ROUND 2 from your request Round 2 of 3$/i.test(c2.head) &&
    c2.pips === 'done,done,todo' &&
    c2.track.join() === 'done:Plan,done:Build,done:Prove,done:Judge,done:Land' &&
    c2.reqs.every((r) => r.state === 'met' && r.says === 'Met') &&
    c2.bar === 'met,met' &&
    /^Landed after 2 rounds: /.test(c2.says) &&
    /only what was not met/.test(c2.loop),
  c2,
);
check(
  "the chat tells it in words too: the Steward's verdict each round, the Overseer's next round with what to do differently, and Master landing it",
  d.chat.some((x) => /Steward: Round 1: 1 of 2 requirements met\. Not yet: 2\. The README keeps its title\./.test(x)) &&
    d.chat.some((x) => /Overseer: Round 2 of 3\. Still to do: 2\. This time: Keep the title line/.test(x)) &&
    d.chat.some((x) => /Steward: Round 2: all 2 requirements are met\./.test(x)) &&
    d.chat.some((x) => /Master: Landed "/.test(x)),
  d.chat.slice(-14),
);
check(
  'the cards sit inside the chat, nothing in them is cut off, and the page does not scroll sideways',
  d.cards.every((c) => c.inside && !c.clipped) && d.wide <= 0,
  { cards: d.cards.map((c) => [c.inside, c.clipped]), wide: d.wide },
);
await p.locator('.plan-card[data-round="1"]').scrollIntoViewIfNeeded();
await sleep(200);
await p.locator('.plan-card[data-round="1"]').screenshot({ path: path.join(OUT, 'round-1-card.png') });
await p.locator('.plan-card[data-round="2"]').scrollIntoViewIfNeeded();
await sleep(200);
await p.locator('.plan-card[data-round="2"]').screenshot({ path: path.join(OUT, 'round-2-card.png') });
await p.screenshot({ path: path.join(OUT, 'desktop.png') });
// on a phone: the same chat, read again from where it is kept
const ph = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  storageState: await ctx.storageState(),
});
const q = await ph.newPage();
q.on('pageerror', (e) => errors.push(e.message));
await q.goto(B + '/app.html', { waitUntil: 'load' });
await q.locator('.composer input').waitFor({ timeout: 20000 });
await sleep(900);
const m = await q.evaluate(() => {
  const log = document.querySelector('.chat-log').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.plan-card')];
  return {
    n: cards.length,
    inside: cards.every((c) => {
      const b = c.getBoundingClientRect();
      return b.left >= log.left - 1 && b.right <= log.right + 1 && b.right <= innerWidth;
    }),
    clipped: cards.some((c) =>
      [...c.querySelectorAll('.plan-track li span, .plan-lap, .plan-req')].some(
        (e) => e.scrollWidth > e.clientWidth + 1,
      ),
    ),
    wide: document.scrollingElement.scrollWidth - innerWidth,
    stages: cards.map((c) => c.dataset.stage).join(),
    small: Math.min(
      ...cards.flatMap((c) =>
        [...c.querySelectorAll('.plan-track li span, .plan-loop span, .plan-req em')].map((e) =>
          parseFloat(getComputedStyle(e).fontSize),
        ),
      ),
    ),
  };
});
check(
  'on a phone the same two cards are there after the page is opened again, inside the screen, with nothing cut off and no text under 11px',
  m.n === 2 && m.stages === 'again,landed' && m.inside && !m.clipped && m.wide <= 0 && m.small >= 11,
  m,
);
await q.locator('.plan-card[data-round="2"]').scrollIntoViewIfNeeded();
await sleep(300);
await q.screenshot({ path: path.join(OUT, 'phone.png') });
check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
