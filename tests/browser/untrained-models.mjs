// untrained-models.mjs - A LOCAL MODEL IS OFFERED ONCE IT HAS BEEN THROUGH THE TRAINER, in a real browser against stand-ins. A model
// that fits the machine and is not in the record of training (src/js/trained.js, which training/publish.mjs writes) is listed
// dimmed and cannot be chosen; Simple, which chooses for the person, never chooses it; and the day the record has it, it can be
// chosen, with nothing restarted. The record is a file of the check's own here (FO_TRAINED_FILE), so a model is "trained" by
// writing it down, under a runner that stays up.     node tests/browser/untrained-models.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SRC, FAKES, WORK, PLAYWRIGHT_FROM } from '../support/paths.mjs';
import { SHIFT } from '../support/ports.mjs';
delete process.env.FO_ALL_MODELS; // (that switch offers every model: this check is of the app as it ships)
const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright');
const state = path.join(WORK, 'untrained-state');
const PORT = 5287 + SHIFT;
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(state, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
let bad = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 900)));
  if (!ok) bad++;
};
// THE RECORD OF TRAINING, as this check has it: the models named are the ones that have been through the trainer
const record = path.join(state, 'trained.mjs');
const train = async (ids) => {
  fs.writeFileSync(
    record,
    'export const TRAINED = ' +
      JSON.stringify(Object.fromEntries(ids.map((id) => [id, { at: '2026-11-18', machine: 'a check', kinds: 1 }]))) +
      ';\n',
  );
  await sleep(30); // (the record is read again when its file has changed: the next look is after the write)
};
await train([]);
for (const f of ['fake-tensorfold.mjs', 'fake-claude.mjs']) fs.chmodSync(path.join(FAKES, f), 0o755);
const srv = spawn(process.execPath, [path.join(SRC, 'server.mjs')], {
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
    FO_BIN_TENSORFOLD: path.join(FAKES, 'fake-tensorfold.mjs'),
    FO_PI_CLI: path.join(FAKES, 'fake-pi.mjs'),
    FO_BIN_CLAUDE: path.join(FAKES, 'fake-claude.mjs'),
    FO_CLAUDE_ROOT: path.join(state, 'claude'),
    FO_TRAINED_FILE: record,
  },
});
const stop = () => {
  try {
    srv.kill('SIGTERM');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(B + '/api/setup')).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(150);
}
const models = async () => await (await fetch(B + '/api/models')).json();
const browser = await chromium.launch();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push('page error: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
      errors.push('console: ' + m.text().slice(0, 200));
  });
};
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
// a page in one mode, as a person who chose that mode before finds it
const pageIn = async (mode) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem('familyoffice.mode', m);
    } catch {
      /* no storage */
    }
  }, mode);
  const p = await ctx.newPage();
  watch(p);
  return { ctx, p };
};
// the cards of Choose your model, as they stand: Developer's road to them (Start local, the machine, what it can run)
const cards = async (p) => {
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#go-local').click({ timeout: 90000 });
  await p.locator('#next').click({ timeout: 90000 });
  await p.locator('.av').first().waitFor({ timeout: 90000 });
  return p.evaluate(() => ({
    cards: [...document.querySelectorAll('.av')].map((el) => ({
      id: el.dataset.id,
      disabled: el.disabled,
      untrained: el.classList.contains('untrained'),
      pressed: el.getAttribute('aria-pressed') === 'true',
      label: el.getAttribute('aria-label'),
      tags: [...el.querySelectorAll('.tag')].map((t) => t.textContent.trim()),
      opacity: Number(getComputedStyle(el).opacity),
    })),
    note: (document.querySelector('#untrained-note') || {}).textContent || '',
    setup: document.querySelector('#setup') ? document.querySelector('#setup').disabled : null,
    detail: (document.querySelector('#detail') || {}).textContent || '',
  }));
};
const simpleChoice = async (p) => {
  await p.goto(B + '/start.html', { waitUntil: 'load' });
  await p.locator('#simple-start').waitFor({ timeout: 90000 });
  return p.evaluate(() => ({
    localOff: document.querySelector('#mind-local').getAttribute('aria-disabled') === 'true',
    local: document.querySelector('#mind-local').getAttribute('aria-checked') === 'true',
    claude: document.querySelector('#mind-claude').getAttribute('aria-checked') === 'true',
    text: document.querySelector('#mind-local').textContent.replace(/\s+/g, ' '),
    cards: document.querySelectorAll('.av').length,
  }));
};

// ---- 1. Nothing has been through the trainer: every model is listed, none can be chosen, and Simple offers Claude
const first = await models();
const fits = first.models.filter((m) => m.fits);
check(
  'the runner says of each model whether it has been through the trainer, and recommends none that has not: with nothing trained, none is recommended',
  first.all === false &&
    first.models.length > 0 &&
    first.models.every((m) => m.trained === false) &&
    first.models.every((m) => !m.recommended),
  [first.all, first.models.map((m) => [m.id, m.trained, m.recommended])],
);
if (fits.length < 2) {
  console.log('ok   (this machine fits fewer than two models: the rest of this check needs two, and is not run here)');
} else {
  const dev = await pageIn('developer');
  const none = await cards(dev.p);
  const shown = none.cards.filter((c) => fits.some((m) => m.id === c.id));
  check(
    'choose your model, nothing trained: every model that fits is listed, dimmed, says Not trained yet and cannot be chosen; none is chosen, Set up cannot be pressed, and the page says why, with the ways there still are',
    shown.length >= 2 &&
      shown.every((c) => c.disabled && c.untrained && !c.pressed && c.opacity < 1) &&
      shown.every(
        (c) => c.tags.join() === 'Not trained yet' && /not trained yet, so it cannot be chosen/.test(c.label),
      ) &&
      none.cards.every((c) => !c.pressed) &&
      none.setup === true &&
      /None of the models that fit .* has been through our training yet, so none can be chosen/.test(none.note) &&
      /think with Claude, or with a model you already serve/.test(none.note),
    none,
  );
  const sim = await pageIn('simple');
  const s0 = await simpleChoice(sim.p);
  check(
    'simple, nothing trained: a mind on this computer is not offered, and the choice says the models that fit have not been through training yet; Claude is the one chosen, and no model is named to pick',
    s0.localOff &&
      !s0.local &&
      s0.claude &&
      /have not been through our training yet\. One is offered here as soon as it has\./.test(s0.text) &&
      !/We chose/.test(s0.text) &&
      s0.cards === 0,
    s0,
  );

  // ---- 2. One model is trained, under the runner that is up: it can be chosen at once, and the others still cannot
  const a = fits.find((m) => shown.some((c) => c.id === m.id));
  const b = fits.find((m) => m.id !== a.id && shown.some((c) => c.id === m.id));
  await train([a.id]);
  const second = await models();
  check(
    'a model trained while the runner is up is offered on the next look, with no restart: the runner says it is trained, and it is the one recommended, being the only one that can be chosen',
    second.models.find((m) => m.id === a.id).trained === true &&
      second.models.filter((m) => m.trained).length === 1 &&
      second.models
        .filter((m) => m.recommended)
        .map((m) => m.id)
        .join() === a.id,
    second.models.map((m) => [m.id, m.trained, m.recommended]),
  );
  const one = await cards(dev.p);
  const ca = one.cards.find((c) => c.id === a.id);
  const cb = one.cards.find((c) => c.id === b.id);
  check(
    'choose your model, one trained: that model is lit, can be chosen and is the one chosen to begin with, and Set up names it; the others that fit are still dimmed and say Not trained yet, and the page says they can be chosen as soon as they have been',
    ca &&
      !ca.disabled &&
      !ca.untrained &&
      ca.pressed &&
      ca.opacity === 1 &&
      !ca.tags.includes('Not trained yet') &&
      cb.disabled &&
      cb.untrained &&
      !cb.pressed &&
      cb.tags.join() === 'Not trained yet' &&
      one.cards.filter((c) => c.pressed).length === 1 &&
      one.setup === false &&
      /not been through our training yet, so (it|they) cannot be chosen/.test(one.note) &&
      /as soon as it has\./.test(one.note) &&
      one.detail.includes(a.name),
    [ca, cb, one.note, one.setup],
  );
  // (a card that cannot be chosen is not chosen by any road: a click that reaches it changes nothing)
  await dev.p.evaluate((id) => {
    const el = document.querySelector('.av[data-id="' + id + '"]');
    el.disabled = false;
    el.click();
  }, b.id);
  const after = await dev.p.evaluate(() =>
    [...document.querySelectorAll('.av')]
      .filter((el) => el.getAttribute('aria-pressed') === 'true')
      .map((el) => el.dataset.id),
  );
  check('a model not trained yet stays unchosen even where a click reaches it', after.join() === a.id, after);
  const s1 = await simpleChoice(sim.p);
  check(
    'simple, one trained: a mind on this computer is offered again, and the one Simple chose is the trained one',
    !s1.localOff && s1.text.includes('We chose ' + a.name) && s1.cards === 0,
    s1,
  );

  // ---- 3. A second one is trained: it can be chosen too
  await train([a.id, b.id]);
  const two = await cards(dev.p);
  const cb2 = two.cards.find((c) => c.id === b.id);
  check(
    'a second model trained is offered too, the same way: its card is lit and can be chosen, and choosing it shows it',
    cb2 && !cb2.disabled && !cb2.untrained && cb2.opacity === 1 && !cb2.tags.includes('Not trained yet'),
    cb2,
  );
  await dev.p.locator('.av[data-id="' + b.id + '"]').click();
  const pressed = await dev.p.evaluate(() =>
    [...document.querySelectorAll('.av')]
      .filter((el) => el.getAttribute('aria-pressed') === 'true')
      .map((el) => el.dataset.id),
  );
  check('and it is chosen with a press', pressed.join() === b.id, pressed);
  await dev.ctx.close();
  await sim.ctx.close();
}
check('no page error anywhere on the way', errors.length === 0, errors);
await browser.close();
stop();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
