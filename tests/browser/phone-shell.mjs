// phone-shell.mjs - THE APP ON A PHONE, in a real browser against a stand-in team: one toolbar (the mark and name, and the Simple /
// Developer switch) and the chat as the whole screen under it; no title, chips, Overview bar, "Waiting on you" or "Who is here";
// the pages reached from a drawer; and a computer laid out as it was.   node tests/browser/phone-shell.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const ROOT = SRC;
const T = FAKES;
const state = path.join(WORK, 'phone-state');
const OUT = path.join(WORK, 'phone');
const PORT = 5238 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of [state, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(state, 'bin'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) bad++;
};
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
    FO_BIN_CLAUDE: path.join(T, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_BIN_GH: path.join(state, 'no-gh'),
    FO_BIN_ADB: path.join(state, 'no-adb'),
    FO_LINK_PORT: String(47898 + SHIFT),
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
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});
// the team is set up first, the way a person does it (Simple, with a stand-in for Claude)
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
  await s.locator('.composer :is(input, textarea)').waitFor({ timeout: 15000 });
  await s.close();
}
const open = async (w, h, mode) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.evaluate((m) => localStorage.setItem('familyoffice.mode', m), mode);
  await p.goto(B + '/app.html', { waitUntil: 'load' });
  await p.locator('.composer :is(input, textarea)').waitFor({ timeout: 20000 });
  await sleep(900);
  return p;
};
const shell = (p) =>
  p.evaluate(() => {
    const r = (q) => {
      const e = document.querySelector(q);
      if (
        !e ||
        (e.offsetParent === null &&
          getComputedStyle(e).position !== 'fixed' &&
          getComputedStyle(e).position !== 'sticky')
      )
        return null;
      const b = e.getBoundingClientRect();
      return {
        l: Math.round(b.left),
        t: Math.round(b.top),
        r: Math.round(b.right),
        b: Math.round(b.bottom),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    };
    const seen = (q) => {
      const e = document.querySelector(q);
      if (!e) return false;
      const b = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return (
        c.display !== 'none' &&
        c.visibility !== 'hidden' &&
        b.width > 0 &&
        b.height > 0 &&
        b.right > 0 &&
        b.left < innerWidth
      );
    };
    const bar = document.querySelector('#tbar');
    const bc = getComputedStyle(bar);
    const card = document.querySelector('.chat-card');
    const cc = card ? getComputedStyle(card) : {};
    return {
      vw: innerWidth,
      vh: innerHeight,
      bar: r('#tbar'),
      barSeen: seen('#tbar'),
      shadow: bc.boxShadow,
      barBg: bc.backgroundColor,
      sticky: bc.position,
      inBar: [...bar.children].map((e) => e.id).join(),
      home: r('#tbar-home'),
      homeText: (document.querySelector('#tbar-home').innerText || '').trim(),
      nameSize: getComputedStyle(document.querySelector('#tbar-name')).fontSize,
      modes: [...document.querySelectorAll('#tbar-mode button')].map((b) => ({
        t: b.textContent,
        on: b.getAttribute('aria-pressed'),
        w: Math.round(b.getBoundingClientRect().width),
        reach: Math.round(b.getBoundingClientRect().height) + 10,
      })),
      title: seen('#title'),
      chips: seen('#chips'),
      overview: seen('#chat-top') || seen('#overview-open'),
      side: seen('#chat-side'),
      strip: seen('#nav'),
      card: r('.chat-card'),
      border: cc.borderTopWidth + ' ' + cc.borderLeftWidth,
      radius: cc.borderTopLeftRadius,
      composer: r('.composer'),
      wide: document.scrollingElement.scrollWidth - innerWidth,
      tall: document.scrollingElement.scrollHeight - innerHeight,
      mode: document.documentElement.dataset.mode,
    };
  });

// 1. a phone, in Developer: everything the owner's picture showed is there to be taken away
const p = await open(390, 844, 'developer');
const s = await shell(p);
check(
  'phone: there is one toolbar across the top, 56px tall, raised (a shadow under it, a surface of its own), and it stays there',
  s.barSeen &&
    s.bar.t === 0 &&
    s.bar.l === 0 &&
    s.bar.r === 390 &&
    s.bar.h === 56 &&
    s.sticky === 'sticky' &&
    /rgba?\(0, 0, 0/.test(s.shadow) &&
    s.shadow !== 'none' &&
    s.barBg === 'rgb(13, 18, 29)',
  { bar: s.bar, shadow: s.shadow, bg: s.barBg },
);
check(
  'phone: in the toolbar are the mark and name, and the Simple / Developer switch, and nothing else; each is at least 48px to the finger',
  s.inBar === 'tbar-home,tbar-mode' &&
    s.homeText === 'Family Office' &&
    s.nameSize === '20px' &&
    s.home.h >= 48 &&
    s.modes.map((m) => m.t).join() === 'Simple,Developer' &&
    s.modes.every((m) => m.w >= 48 && m.reach >= 48) &&
    s.modes[1].on === 'true' &&
    s.modes[0].on === 'false',
  { inBar: s.inBar, home: s.home, modes: s.modes },
);
check(
  'phone: no "Team chat" title, no chips, no Overview bar, no "Waiting on you" or "Who is here", and no strip of pages',
  !s.title && !s.chips && !s.overview && !s.side && !s.strip,
  { title: s.title, chips: s.chips, overview: s.overview, side: s.side, strip: s.strip },
);
check(
  'phone: the chat has no frame and is the screen: from the toolbar to the bottom, edge to edge, and the page neither scrolls sideways nor under it',
  s.card.t === 56 &&
    s.card.l === 0 &&
    s.card.r === 390 &&
    s.card.b === 844 &&
    s.border === '0px 0px' &&
    s.radius === '0px' &&
    s.composer.b <= 844 &&
    s.composer.b >= 820 &&
    s.wide <= 0 &&
    s.tall <= 0,
  { card: s.card, border: s.border, radius: s.radius, composer: s.composer, wide: s.wide, tall: s.tall },
);
await p.screenshot({ path: path.join(OUT, 'developer.png') });
// 2. the switch
await p.evaluate(() => {
  window.__same = true;
});
await p.locator('#tbar-mode button[data-set="simple"]').tap();
await sleep(700);
const s2 = await shell(p);
const same = await p.evaluate(() => window.__same === true);
check(
  'phone: the switch turns the app to Simple in place (nothing is loaded again), and shows which it is',
  s2.mode === 'simple' &&
    same &&
    s2.modes[0].on === 'true' &&
    s2.modes[1].on === 'false' &&
    s2.card.t === 56 &&
    s2.card.b === 844 &&
    !s2.title &&
    !s2.chips,
  { mode: s2.mode, same, modes: s2.modes, card: s2.card },
);
await p.screenshot({ path: path.join(OUT, 'simple.png') });
await p.locator('#tbar-mode button[data-set="developer"]').tap();
await sleep(600);
// 3. the pages, from the drawer
const before = await p.evaluate(() => ({
  seen: getComputedStyle(document.querySelector('#side')).visibility,
  scrim: document.querySelector('#scrim').hidden,
}));
await p.locator('#tbar-home').tap();
await sleep(500);
const dr = await p.evaluate(() => {
  const side = document.querySelector('#side');
  const b = side.getBoundingClientRect();
  return {
    left: Math.round(b.left),
    w: Math.round(b.width),
    h: Math.round(b.height),
    seen: getComputedStyle(side).visibility,
    scrim: !document.querySelector('#scrim').hidden,
    expanded: document.querySelector('#tbar-home').getAttribute('aria-expanded'),
    pages: [...side.querySelectorAll('nav a')]
      .filter((a) => a.offsetParent !== null)
      .map((a) => a.textContent.replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ')),
    tall: [...side.querySelectorAll('nav a')]
      .filter((a) => a.offsetParent !== null)
      .every((a) => a.getBoundingClientRect().height >= 48),
    foot: [...side.querySelectorAll('.side-foot button')].map((x) => x.textContent.trim()).join(),
  };
});
check(
  'phone: the mark and name open the pages of the app as a drawer from the left, over a scrim: Team chat first, each row tall enough to press, and Stop team at its foot',
  before.seen === 'hidden' &&
    before.scrim === true &&
    dr.left === 0 &&
    dr.w >= 280 &&
    dr.w <= 336 &&
    dr.h === 844 &&
    dr.seen === 'visible' &&
    dr.scrim &&
    dr.expanded === 'true' &&
    /^Team chat/.test(dr.pages[0]) &&
    dr.pages.length >= 4 &&
    dr.tall &&
    /Stop team/.test(dr.foot),
  [before, dr],
);
await p.screenshot({ path: path.join(OUT, 'drawer.png') });
await p.locator('#side nav a[href="#workspace"]').tap();
await sleep(900);
const ws = await p.evaluate(() => ({
  name: document.querySelector('#tbar-name').textContent,
  open: document.body.classList.contains('drawer-open'),
  scrim: document.querySelector('#scrim').hidden,
  title: getComputedStyle(document.querySelector('.top')).display,
  hash: location.hash,
  pad: parseFloat(getComputedStyle(document.querySelector('.main')).paddingLeft),
  wide: document.scrollingElement.scrollWidth - innerWidth,
}));
check(
  "phone: choosing a page closes the drawer and goes there; the toolbar carries that page's name, and the page has its own margins",
  ws.name === 'Workspace' &&
    !ws.open &&
    ws.scrim === true &&
    ws.title === 'none' &&
    ws.hash === '#workspace' &&
    ws.pad === 16 &&
    ws.wide <= 0,
  ws,
);
await p.screenshot({ path: path.join(OUT, 'workspace.png') });
await p.locator('#tbar-home').tap();
await sleep(400);
await p.keyboard.press('Escape');
await sleep(400);
const esc = await p.evaluate(() => document.body.classList.contains('drawer-open'));
await p.locator('#tbar-home').tap();
await sleep(400);
await p.locator('#scrim').tap({ position: { x: 370, y: 400 } });
await sleep(400);
const scr = await p.evaluate(() => document.body.classList.contains('drawer-open'));
await p.locator('#tbar-home').tap();
await sleep(400);
await p.locator('#side nav a[href="#chat"]').tap();
await sleep(800);
const back = await shell(p);
check(
  "phone: Escape and the scrim close the drawer; Team chat goes back to the chat, where the name is the product's again",
  !esc && !scr && back.homeText === 'Family Office' && back.card && back.card.t === 56 && back.card.b === 844,
  { esc, scr, name: back.homeText, card: back.card },
);
// 4. a small phone, and a computer
const q = await open(360, 740, 'developer');
const sm = await shell(q);
check(
  'a small phone (360 wide): the toolbar still holds both, nothing runs off the side, and the chat still fills the screen',
  sm.bar.h === 56 &&
    sm.home.w >= 48 &&
    sm.modes.every((m) => m.w >= 48) &&
    sm.wide <= 0 &&
    sm.card.l === 0 &&
    sm.card.r === 360 &&
    sm.card.b === 740 &&
    (await q.evaluate(() => {
      const a = document.querySelector('#tbar-home').getBoundingClientRect();
      const b = document.querySelector('#tbar-mode').getBoundingClientRect();
      return a.right <= b.left && b.right <= innerWidth;
    })),
  sm,
);
await q.close();
const d = await open(1366, 900, 'developer');
const dk = await shell(d);
check(
  'a computer is laid out as it was: no toolbar, the rail of pages on the left, the title and the chips, the Overview bar, and the cards beside the chat',
  !dk.barSeen &&
    dk.title &&
    dk.chips &&
    dk.overview &&
    dk.side &&
    dk.strip &&
    dk.card.l > 232 &&
    dk.border !== '0px 0px',
  {
    bar: dk.barSeen,
    title: dk.title,
    chips: dk.chips,
    overview: dk.overview,
    side: dk.side,
    strip: dk.strip,
    card: dk.card,
    border: dk.border,
  },
);
check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
