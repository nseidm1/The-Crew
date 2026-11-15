// team-chat.mjs - A REAL TEAM IN A REAL BROWSER, for a measurement to talk to. It starts the product from src/ on a port of its own,
// sets it up (a local model, or Claude Code on the user's own plan), and hands back a way to open a chat nobody has written in,
// type into it and read what the team said. The measurement decides what to say and how to read it; nothing here grades.
//   const team = await startTeam({ mode, setup, claudeModel, port, tag });
//   const chat = await team.open();            a new browser profile: an empty chat, a team that knows nothing of the person
//   const got = await chat.say('...');         { all: [{ who, said, text }], first, text, level, looked, chime, seconds }
//   await chat.close();   await team.stop();
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const WORK = path.join(REPO_ROOT, '.work', 'train');
export const MODELS = path.join(REPO_ROOT, '.work', 'models'); // never committed
const ROOT = path.join(REPO_ROOT, 'src');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = { 'content-type': 'application/json' };

export async function startTeam({ mode = 'simple', setup = {}, claudeModel = '', port = 5285, tag = 'team' } = {}) {
  const claude = /claude/i.test(JSON.stringify(setup));
  const require = createRequire(process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json'));
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('Playwright was not found. Set FO_PLAYWRIGHT to a package.json whose folder has it installed.');
  }
  const B = 'http://127.0.0.1:' + port;
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-' + tag + '-'));
  const state = path.join(base, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  // a run on Claude Code is given none of this session's own Claude settings: it is the user's plan, as a customer's would be
  const ownEnv = claude
    ? Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_|MCP_)/.test(k)))
    : process.env;
  const env = {
    ...ownEnv,
    PORT: String(port),
    FO_KEEP: '1',
    FO_STATE_DIR: state,
    FO_NO_OPEN: '1',
    FO_BILLING: '{"enforce":false}',
    FO_LINK_PORT: String(port + 40000),
    // the models llama.cpp runs are fetched once (training/fetch-models.mjs) and kept in one place, not in each run's own folder
    ...(fs.existsSync(MODELS) && !process.env.FO_LLAMA_MODELS_DIR ? { FO_LLAMA_MODELS_DIR: MODELS } : {}),
    ...(claude
      ? { FO_CLAUDE_ROOT: path.join(base, 'claude'), ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}) }
      : {}),
  };
  if (!claude && !env.FO_PI_CLI) {
    const { piInstalled } = await import(path.join(ROOT, 'runner', 'host.mjs'));
    const pi = await piInstalled(path.join(os.homedir(), '.familyoffice', 'state'));
    if (pi && pi.cli) env.FO_PI_CLI = pi.cli;
  }
  const server = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { stdio: 'ignore', env });
  const kill = () => {
    try {
      server.kill('SIGTERM');
    } catch {
      /* gone */
    }
  };
  process.on('exit', kill);
  for (const sig of ['SIGTERM', 'SIGINT'])
    process.on(sig, () => {
      kill();
      process.exit(130);
    });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(B + '/api/setup')).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(150);
  }
  await fetch(B + '/api/setup', { method: 'POST', headers: J, body: JSON.stringify({ ...setup, mode }) });
  let view;
  for (;;) {
    await sleep(2000);
    view = await (await fetch(B + '/api/setup', { headers: { connection: 'close' } })).json();
    if (!view.busy) break;
  }
  if (!view.setup || !view.setup.done) {
    kill();
    throw new Error('set-up stopped: ' + JSON.stringify((view.setup && view.setup.error) || view).slice(0, 300));
  }
  const browser = await chromium.launch();

  async function open() {
    const profile = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    await profile.addInitScript((m) => {
      try {
        localStorage.setItem('familyoffice.mode', m);
      } catch {
        /* no storage */
      }
    }, mode);
    const page = await profile.newPage();
    await page.goto(B + '/start.html', { waitUntil: 'load' });
    await page.locator('#meet, #resume-go').first().waitFor({ timeout: 40000 });
    if (await page.locator('#resume-go').count()) {
      await page.locator('#resume-go').click();
      await page.locator('#meet').waitFor({ timeout: 20000 });
    }
    await page.locator('#meet').click();
    await page.locator('.composer :is(input, textarea)').waitFor({ timeout: 30000 });
    await sleep(900);
    if (await page.locator('dialog.step-done[open]').count()) {
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    // the chat has gone quiet: nothing new, nobody busy, nobody typing, for five seconds
    const settle = async (from) => {
      let quiet = 0;
      let last = -1;
      for (let t = 0; t < 900 && quiet < 10; t++) {
        await sleep(500);
        const count = await page.locator('.chat-log .msg').count();
        const busy = await page.locator('.narr-bar.on').count();
        const live = await page.locator('.chat-log p.typing').count();
        const answered = (await page.locator('.chat-log .msg:not(.you)').count()) > from || t > 120;
        if (count === last && !busy && !live && answered) quiet++;
        else quiet = 0;
        last = count;
      }
    };
    const stored = () =>
      page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('familyoffice.core.v1') || '{}');
        } catch {
          return {};
        }
      });
    async function say(text) {
      const from = await page.locator('.chat-log .msg:not(.you)').count();
      const before = ((await stored()).chat || []).length;
      const began = Date.now();
      await page.locator('.composer :is(input, textarea)').fill(text);
      await page.locator('.composer :is(input, textarea)').press('Enter');
      await settle(from);
      const all = await page.evaluate(
        (at) =>
          [...document.querySelectorAll('.chat-log .msg:not(.you)')]
            .slice(at)
            .map((el) => ({
              who: ((el.querySelector('.msg-head strong') || {}).textContent || '?').trim(),
              said: [...el.querySelectorAll('p')]
                .filter((x) => !x.closest('.answer-card'))
                .map((x) => x.innerText)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim(),
              text: [
                ...[...el.querySelectorAll('p')].map((x) => x.innerText),
                (el.querySelector('.answer-card') || {}).innerText || '',
              ]
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim(),
            }))
            .filter((m) => m.text),
        from,
      );
      const kept = await stored();
      const since = (kept.chat || []).slice(before);
      return {
        all,
        first: (all[0] || {}).said || (all[0] || {}).text || '',
        text: all.map((m) => m.text).join('\n'),
        level: (kept.dev || {}).level || '',
        looked: since.some((m) => m.kind === 'tools' || (m.sources && m.sources.length)), // it went and looked something up
        checked: since.some((m) => m.checkedBy), // the fact-checker went over it
        chime: kept.chimeTrace || null,
        seconds: Math.round((Date.now() - began) / 1000),
      };
    }
    return {
      say,
      shot: (file) => page.screenshot({ path: file, fullPage: false }),
      close: () => profile.close(),
    };
  }

  async function stop() {
    await browser.close().catch(() => {});
    await fetch(B + '/api/stop', { method: 'POST', headers: J, body: '{}' }).catch(() => {});
    await sleep(800);
    kill();
    await sleep(300);
    fs.rmSync(base, { recursive: true, force: true });
  }
  return { open, stop, claude };
}
