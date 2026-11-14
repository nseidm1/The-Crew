#!/usr/bin/env node
// fake-strata.mjs - a TEST DOUBLE for Strata's Terminal command, used only when FO_BIN_STRATA points at it (or at the copy the
// stand-in installer made). It does what the runner relies on and nothing more:
//   strata --version
//   strata launch --family F --model M --context C --plan --output json     what would be downloaded; nothing changes
//   strata launch ... --port N --save-preset NAME --yes --no-tui            starts a model server in the background and returns
//   strata launch --stop --preset NAME                                      stops that one
// The model server is the engine stand-in the rest of the self-test uses (fake-tensorfold.mjs), so the agent check has something
// that answers as a model does. Every call is appended to $FO_FAKE_DIR/fake-strata.jsonl. FO_FAKE_STRATA_NO_FIT=1 makes the plan
// say the model cannot run here; FO_FAKE_STRATA_FAILS=1 makes the launch stop the way a failed download does.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const dir = process.env.FO_FAKE_DIR || '.';
const val = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : '';
};
const has = (k) => args.includes(k);
try {
  appendFileSync(path.join(dir, 'fake-strata.jsonl'), JSON.stringify({ args }) + '\n');
} catch {
  /* nowhere to record */
}
if (has('--version')) {
  console.log('strata 0.2.13');
  process.exit(0);
}
if (args[0] !== 'launch') {
  console.error('usage: strata launch ...');
  process.exit(2);
}
const pidFile = (name) => path.join(dir, 'fake-strata-' + String(name || 'default').replace(/\W+/g, '-') + '.pid');
if (has('--stop')) {
  const f = pidFile(val('--preset'));
  if (existsSync(f)) {
    try {
      process.kill(Number(readFileSync(f, 'utf8')), 'SIGTERM');
    } catch {
      /* already gone */
    }
    rmSync(f, { force: true });
    console.log('Stopped.');
  } else console.log('Nothing is running.');
  process.exit(0);
}
if (has('--plan')) {
  if (process.env.FO_FAKE_STRATA_NO_FIT === '1') {
    console.log(
      JSON.stringify({
        family: val('--family'),
        model: val('--model'),
        error: 'no engine package for this graphics card',
      }),
    );
    process.exit(0);
  }
  console.log(
    JSON.stringify({
      family: val('--family'),
      model: val('--model'),
      context: val('--context'),
      vision: 'on',
      downloads: [
        { name: 'engine', bytes: 400 * 2 ** 20 },
        { name: 'weights', bytes: 22 * 2 ** 30 },
      ],
      total_bytes: 400 * 2 ** 20 + 22 * 2 ** 30,
    }),
  );
  process.exit(0);
}
if (!has('--yes') || !has('--no-tui') || !val('--port')) {
  console.error('this stand-in only runs without questions: --yes --no-tui --port N');
  process.exit(2);
}
if (has('--restart')) {
  console.error('this stand-in refuses --restart: it would replace a model the customer runs themself');
  process.exit(2);
}
if (process.env.FO_FAKE_STRATA_FAILS === '1') {
  console.log('Downloading weights 3%');
  console.error('error: download failed: connection reset');
  process.exit(1);
}
console.log('Downloading weights 100%');
console.log('Loading ' + val('--family') + ' ' + val('--model'));
const server = spawn(
  process.execPath,
  [
    path.join(
      path.dirname(process.env.FO_FAKE_STRATA_ENGINE || ''),
      path.basename(process.env.FO_FAKE_STRATA_ENGINE || 'fake-tensorfold.mjs'),
    ),
    'serve',
    val('--family') + '/' + val('--model'),
    '--name',
    val('--family') + '-' + val('--model'),
    '--context',
    '32768',
    '--host',
    '127.0.0.1',
    '--port',
    val('--port'),
  ],
  { detached: true, stdio: 'ignore', env: process.env },
);
server.unref();
writeFileSync(pidFile(val('--save-preset')), String(server.pid));
console.log('Serving at http://127.0.0.1:' + val('--port'));
