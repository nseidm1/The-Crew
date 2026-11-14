// banner.mjs - THE INSTALLER'S BANNER (src/myfamilyoffice.sh), in a real terminal of every width: it is the size that fits, no line
// of it is as wide as the terminal (so none can wrap), it is plain ASCII, it has colour only where colour is wanted, it is drawn
// again when the terminal is resized, and it is never drawn into a pipe. The terminal is a real pseudo-terminal, made by the
// system's own `script` command.   node tests/runner/banner.mjs
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { SRC } from '../support/paths.mjs';

const SH = path.join(SRC, 'myfamilyoffice.sh');
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)));
  if (!ok) failed++;
};
// one command line run inside a pseudo-terminal; what the terminal was sent comes back as text
const inTerminal = (command, env = {}) => {
  const args = os.platform() === 'darwin' ? ['-q', '/dev/null', 'sh', '-c', command] : ['-qec', command, '/dev/null'];
  const run = spawnSync('script', args, {
    encoding: 'utf8',
    timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '', FO_NO_ART: '', ...env },
  });
  return String(run.stdout || '')
    .replace(/\r/g, '')
    .replace(/\^D\x08\x08/g, ''); // `script` itself shows the end of its (empty) input: not something the banner wrote
};
const plain = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const linesOf = (text) => plain(text).split('\n');
const drawn = (width, env, shell = 'sh') =>
  inTerminal('stty cols ' + width + ' rows 24; FO_BANNER=only ' + shell + ' ' + JSON.stringify(SH), env);

// 1. every width: the banner fits, and is the size meant for that width
const sizes = [];
for (const width of [200, 120, 80, 60, 59, 40, 24, 23, 14, 13, 5]) {
  const out = drawn(width);
  const lines = linesOf(out);
  const widest = Math.max(0, ...lines.map((line) => line.length));
  const kind = /F A M I L Y {3}O F F I C E/.test(out)
    ? 'wide'
    : /\|____________\|/.test(out)
      ? 'tall'
      : /Family Office/.test(out)
        ? 'name'
        : 'none';
  sizes.push({ width, kind, widest, ascii: /^[\x20-\x7e\n]*$/.test(plain(out)) });
}
check(
  'no line of the banner is ever as wide as the terminal, at any width from 5 to 200 columns',
  sizes.every((size) => size.widest < size.width),
  sizes,
);
check(
  'the size follows the width: the house beside the name from 60 columns, the house over the name from 24, the name alone from 14, nothing under that',
  sizes.map((size) => size.kind).join() === 'wide,wide,wide,wide,tall,tall,tall,name,name,none,none',
  sizes.map((size) => size.width + ':' + size.kind),
);
check(
  'it is plain ASCII, so it is the same in every font and every locale',
  sizes.every((size) => size.ascii),
  sizes,
);

// 2. colour only where it is wanted
const coloured = drawn(80);
const noColour = drawn(80, { NO_COLOR: '1' });
const dumb = drawn(80, { TERM: 'dumb' });
const off = drawn(80, { FO_NO_ART: '1' });
check(
  'colour is used on a terminal that has it and is switched off again at the end of every line; NO_COLOR draws the same banner with none',
  /\x1b\[32m/.test(coloured) &&
    !/\x1b\[32m[^\n]*\n/.test(coloured.replace(/\x1b\[0m/g, '<off>').replace(/\x1b\[32m([^\n]*)<off>/g, '$1')) &&
    !/\x1b/.test(noColour) &&
    plain(coloured) === noColour,
  { coloured: coloured.slice(0, 200), noColour: noColour.slice(0, 120) },
);
check(
  'nothing is drawn for a terminal that says it is dumb, or when FO_NO_ART is set',
  dumb.trim() === '' && off.trim() === '',
  { dumb, off },
);

// 3. never into a pipe or a file
const piped = spawnSync('sh', [SH], {
  encoding: 'utf8',
  env: { ...process.env, FO_BANNER: 'only', TERM: 'xterm-256color' },
});
check(
  'nothing is drawn when the output is not a terminal (a pipe, a file, a log)',
  piped.stdout === '' && piped.status === 0,
  piped.stdout,
);

// 4. resized while the banner is the last thing on the screen: cleared and drawn again in the size that fits now
const resized = inTerminal(
  'stty cols 100 rows 24; (FO_BANNER=hold sh ' +
    JSON.stringify(SH) +
    ') & pid=$!; sleep 0.8; stty cols 30; kill -WINCH $pid 2>/dev/null; wait $pid',
);
const clears = [...resized.matchAll(/\x1b\[(\d+)A\x1b\[J/g)];
const after = clears.length ? resized.slice(resized.lastIndexOf('\x1b[J') + 3) : '';
check(
  'made narrower, from 100 columns to 30: the wide banner is cleared (every row it had come to take) and the house over the name is drawn, none of it as wide as the terminal',
  /F A M I L Y {3}O F F I C E/.test(resized.split('\x1b[J')[0]) &&
    clears.length >= 1 &&
    Number(clears[clears.length - 1][1]) === 10 &&
    /Family Office/.test(after) &&
    !/F A M I L Y/.test(after) &&
    linesOf(after).every((line) => line.length < 30),
  { clears: clears.map((match) => match[1]), after: plain(after).slice(0, 300) },
);
const widened = inTerminal(
  'stty cols 20 rows 24; (FO_BANNER=hold sh ' +
    JSON.stringify(SH) +
    ') & pid=$!; sleep 0.8; stty cols 90; kill -WINCH $pid 2>/dev/null; wait $pid',
);
const afterWide = widened.includes('\x1b[J') ? widened.slice(widened.lastIndexOf('\x1b[J') + 3) : '';
check(
  'made wider, from 20 columns to 90: the name alone gives way to the house beside the name',
  /^Family Office$/m.test(plain(widened.split('\x1b[')[0] || widened)) && /F A M I L Y {3}O F F I C E/.test(afterWide),
  {
    before: plain(widened).slice(0, 80),
    after: plain(afterWide).slice(0, 200),
  },
);

// 5. the other shell a system may call sh
if (spawnSync('sh', ['-c', 'command -v dash'], { encoding: 'utf8' }).status === 0) {
  const dash = drawn(80, {}, 'dash');
  check(
    'it is drawn the same under dash, the sh of many Linux systems',
    plain(dash) === plain(coloured),
    plain(dash).slice(0, 200),
  );
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
