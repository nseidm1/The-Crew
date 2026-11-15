// run.mjs - runs the checks, one after another (never two at once: they start servers and browsers), and says how each ended.
//   node tests/run.mjs                    core and runner: no browser needed, nothing installed, nothing fetched
//   node tests/run.mjs browser            the app in a real browser, against stand-ins (needs Playwright: see tests/README.md)
//   node tests/run.mjs landing            the landing page and its film (needs Playwright)
//   node tests/run.mjs all                everything
//   node tests/run.mjs core/plan-loop     one check, by its path under tests/
// Each check prints a line for everything it checked ("ok" or "FAIL") and its whole output is kept in .work/logs/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, SRC, WORK } from './support/paths.mjs';

const SUITES = {
  core: [
    'core/plan-loop',
    'core/developer-setup',
    'core/answer-cards',
    'core/knows-you',
    'core/conversation',
    'core/moods',
    'core/extras',
    'core/threads',
    'core/hindsight',
  ],
  runner: ['runner/self-test', 'runner/host', 'runner/banner', 'runner/run-here'],
  browser: [
    'browser/app-pages',
    'browser/modes',
    'browser/simple-characters',
    'browser/phone-shell',
    'browser/plan-in-chat',
    'browser/ticket-media',
    'browser/claude-sign-in',
    'browser/runner-restart',
    'browser/picture-cards',
    'browser/under-a-reply',
    'browser/crawl',
  ],
  landing: ['landing/landing-page', 'landing/alignment', 'landing/film-smoothness', 'landing/start-command'],
};
const LANDING_PORT = 5281; // the landing checks read pages from a server; this one is started for them and stopped after
const asked = process.argv.slice(2);
const names = (asked.length ? asked : ['core', 'runner']).flatMap((a) =>
  a === 'all' ? Object.values(SUITES).flat() : SUITES[a] || [a.replace(/\.mjs$/, '')],
);
const logs = path.join(WORK, 'logs');
fs.mkdirSync(logs, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (name, args = []) =>
  new Promise((done) => {
    const file = path.join(REPO_ROOT, 'tests', name + '.mjs');
    const log = path.join(logs, name.replace('/', '-') + '.log');
    const t0 = Date.now();
    if (!fs.existsSync(file)) return done({ name, ok: false, said: 'there is no tests/' + name + '.mjs', seconds: 0 });
    const out = fs.createWriteStream(log);
    const child = spawn(process.execPath, [file, ...args], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    for (const s of [child.stdout, child.stderr])
      s.on('data', (d) => {
        text += d;
        out.write(d);
      });
    child.on('close', (code) => {
      out.end();
      const lines = text.split('\n');
      const passed = lines.filter((l) => /^ok\b/.test(l)).length;
      const failed = lines.filter((l) => /^(FAIL|not ok)\b|^\s*ISSUE\b/.test(l));
      done({
        name,
        ok: code === 0 && !failed.length,
        passed,
        failed,
        said: lines.filter(Boolean).pop() || '',
        seconds: Math.round((Date.now() - t0) / 1000),
        log: path.relative(REPO_ROOT, log),
      });
    });
  });

let server = null;
const needsServer = names.some((n) => n.startsWith('landing/'));
if (needsServer) {
  server = spawn(process.execPath, [path.join(SRC, 'server.mjs')], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(LANDING_PORT),
      FO_KEEP: '1',
      FO_NO_OPEN: '1',
      FO_STATE_DIR: path.join(WORK, 'landing-state'),
    },
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:' + LANDING_PORT + '/index.html')).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
}
const landingArgs = {
  'landing/landing-page': ['run', String(LANDING_PORT)],
  'landing/alignment': [String(LANDING_PORT)],
  'landing/film-smoothness': [String(LANDING_PORT)],
};
const results = [];
for (const name of names) {
  const r = await run(name, landingArgs[name] || []);
  results.push(r);
  console.log(
    (r.ok ? 'ok    ' : 'FAIL  ') +
      name.padEnd(28) +
      String(r.passed ?? 0).padStart(4) +
      ' passed' +
      (r.failed && r.failed.length ? ', ' + r.failed.length + ' failed' : '') +
      '  ' +
      String(r.seconds).padStart(4) +
      ' s' +
      (r.ok
        ? ''
        : '   ' +
          (r.failed && r.failed[0] ? r.failed[0].slice(0, 160) : r.said.slice(0, 160)) +
          (r.log ? '   (' + r.log + ')' : '')),
  );
}
if (server) {
  try {
    server.kill('SIGTERM');
  } catch {
    /* already gone */
  }
}
const bad = results.filter((r) => !r.ok);
console.log(
  '\n' +
    (bad.length
      ? bad.length + ' of ' + results.length + ' checks did not pass: ' + bad.map((r) => r.name).join(', ')
      : 'all ' + results.length + ' passed') +
    ', ' +
    results.reduce((n, r) => n + (r.passed || 0), 0) +
    ' things checked.',
);
process.exit(bad.length ? 1 : 0);
