// run.mjs - runs the checks SIDE BY SIDE, as many at once as this machine has cores, and says how each ended. Each check that
// starts servers is given ports of its own (FO_TEST_SHIFT: tests/support/ports.mjs) and keeps a folder of its own under .work,
// so two of them never meet. The longest is started first, since nothing ends before it does.
//   node tests/run.mjs                    core and runner: no browser needed, nothing installed, nothing fetched
//   node tests/run.mjs --jobs 4           at most four at once (--serial: one after another, as it was)
//   node tests/run.mjs browser            the app in a real browser, against stand-ins (needs Playwright: see tests/README.md)
//   node tests/run.mjs landing            the landing page and its film (needs Playwright)
//   node tests/run.mjs all                everything
//   node tests/run.mjs core/plan-loop     one check, by its path under tests/
// Each check prints a line for everything it checked ("ok" or "FAIL") and its whole output is kept in .work/logs/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  runner: ['runner/self-test-shards', 'runner/host', 'runner/banner', 'runner/run-here'],
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
    'browser/untrained-models',
    'browser/crawl',
  ],
  landing: [
    'landing/landing-page',
    'landing/alignment',
    'landing/film-smoothness',
    'landing/start-command',
    'landing/film-returns',
  ],
};
const LANDING_PORT = 5281; // the landing checks read pages from a server; this one is started for them and stopped after
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf('--' + name);
  return i < 0 ? null : argv[i + 1];
};
const CORES = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
// HOW MANY AT ONCE: every core, unless told (--jobs N, FO_TEST_JOBS, --serial)
const JOBS = Math.max(1, argv.includes('--serial') ? 1 : Number(flag('jobs') || process.env.FO_TEST_JOBS) || CORES);
const asked = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--jobs');
// THE LONGEST FIRST (seconds, as last measured on a 24-core Mac): the run is as long as its longest check, so that one starts at once
const LONG = { 'runner/self-test-shards': 160, 'browser/crawl': 300, 'browser/modes': 90, 'browser/app-pages': 51 };
// A CHECK THAT TIMES WHAT IT SEES (frames of a film) is run by itself, after the others: beside them it would measure their load
const ALONE = ['landing/film-smoothness'];
// PORTS OF ITS OWN: the runner's self-test keeps the ports written in it (they are in what it expects), and every other check
// is moved clear of it and of each other
const shiftOf = (name, i) => (name === 'runner/self-test-shards' ? 0 : 1000 + 100 * i);
const names = (asked.length ? asked : ['core', 'runner']).flatMap((a) =>
  a === 'all' ? Object.values(SUITES).flat() : SUITES[a] || [a.replace(/\.mjs$/, '')],
);
const logs = path.join(WORK, 'logs');
fs.mkdirSync(logs, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (name, args = [], shift = 0) =>
  new Promise((done) => {
    const file = path.join(REPO_ROOT, 'tests', name + '.mjs');
    const log = path.join(logs, name.replace('/', '-') + '.log');
    const t0 = Date.now();
    if (!fs.existsSync(file)) return done({ name, ok: false, said: 'there is no tests/' + name + '.mjs', seconds: 0 });
    const out = fs.createWriteStream(log);
    const child = spawn(process.execPath, [file, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FO_TEST_SHIFT: String(shift) },
    });
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
const said = (r) =>
  console.log(
    (r.ok ? 'ok    ' : 'FAIL  ') +
      r.name.padEnd(28) +
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
const t0 = Date.now();
// each check keeps the place it was named in (its ports follow from it), and the queue takes the longest first
const jobs = names.map((name, i) => ({ name, shift: shiftOf(name, i) }));
const queue = jobs.filter((j) => !ALONE.includes(j.name)).sort((x, y) => (LONG[y.name] || 0) - (LONG[x.name] || 0));
// HOW MANY CORES A CHECK TAKES: one, but for the runner's self-test, which is four processes of its own, and a check that
// drives a browser, which is a server and a browser at work together. The checks running at once never take more than the
// machine has: with every core spoken for twice over, the checks that time what a page does come late and fail.
const coresOf = (name) => (name === 'runner/self-test-shards' ? 4 : name.startsWith('browser/') ? 2 : 1);
let busy = 0;
await new Promise((done) => {
  let running = 0;
  const next = () => {
    if (!queue.length && !running) return done();
    for (let i = 0; i < queue.length; i++) {
      const j = queue[i];
      const need = Math.min(coresOf(j.name), JOBS);
      if (busy + need > JOBS) continue;
      queue.splice(i--, 1);
      busy += need;
      running++;
      run(j.name, landingArgs[j.name] || [], j.shift).then((r) => {
        busy -= need;
        running--;
        results.push(r);
        said(r);
        next();
      });
    }
  };
  next();
});
for (const j of jobs.filter((x) => ALONE.includes(x.name))) {
  const r = await run(j.name, landingArgs[j.name] || [], j.shift);
  results.push(r);
  said(r);
}
// A CHECK THAT DID NOT PASS BESIDE THE OTHERS IS RUN AGAIN BY ITSELF. Some checks time what a page does (a card dragged, a film's
// frames), and a machine with every core busy can make one late. Run alone it says what is true of the app: passing there it is
// counted as passing, and the line says it took a second run; failing there too, it failed. (--no-again: the first run stands.)
if (JOBS > 1 && !argv.includes('--no-again'))
  for (const r of results.filter((x) => !x.ok)) {
    const j = jobs.find((x) => x.name === r.name);
    const again = await run(j.name, landingArgs[j.name] || [], j.shift);
    again.seconds += r.seconds;
    if (again.ok) again.name = r.name + ' (by itself, the second time)';
    results[results.indexOf(r)] = again;
    said(again);
  }
const wall = Math.round((Date.now() - t0) / 1000);
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
    ' things checked, in ' +
    wall +
    ' s with up to ' +
    JOBS +
    ' cores at once (one after another they take ' +
    results.reduce((n, r) => n + (r.seconds || 0), 0) +
    ' s).',
);
process.exit(bad.length ? 1 : 0);
