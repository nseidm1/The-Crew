// pulse.mjs - add a READING of the system to the landing page's pulse (js/pulse.js). Run it at each publish, with the day's counts:
//   node tools/pulse.mjs                      show the readings there are
//   node tools/pulse.mjs add date=2026-11-18 proofsDay=3104 judges=9120 measures=297 memories=101440 links=470212 commits90=24010 resetsWeek=802 shed=62
// A reading is added, never edited. It must be dated after the last one, and every count must be a whole number. Then build the bundle.
// The owner's panel does both in one press: its Bundle card takes the day's counts and runs this before it builds.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FILE =
  process.env.FO_PULSE_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js', 'pulse.js');
const { PULSE, KEYS } = await import(pathToFileURL(FILE).href + '?t=' + Date.now());
const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== 'add') {
  for (const r of PULSE.readings)
    console.log(r.date + '  ' + KEYS.map((k) => k + ' ' + r[k].toLocaleString('en-US')).join(' · '));
  console.log(
    PULSE.readings.length +
      (PULSE.readings.length === 1
        ? ' reading. With two, the page says what moved; with three, it draws the line.'
        : ' readings.'),
  );
  process.exit(0);
}
const got = Object.fromEntries(
  rest.map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)];
  }),
);
const fail = (m) => {
  console.error('Not added: ' + m);
  process.exit(1);
};
const last = PULSE.readings[PULSE.readings.length - 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(got.date || '') || Number.isNaN(Date.parse(got.date)))
  fail('give the date as date=YYYY-MM-DD.');
if (last && got.date <= last.date)
  fail('the date must be after the last reading (' + last.date + '). A reading is added, never edited.');
if (Date.parse(got.date) > Date.now() + 86400000) fail('that date has not happened yet.');
for (const k of KEYS)
  if (!/^\d+$/.test(got[k] || ''))
    fail(k + ' must be a whole number (give ' + KEYS.map((x) => x + '=').join(' ') + ').');
for (const k of Object.keys(got)) if (k !== 'date' && !KEYS.includes(k)) fail('there is no count called ' + k + '.');
if (Number(got.shed) > 100) fail('shed is a percentage.');
const line = "    { date: '" + got.date + "', " + KEYS.map((k) => k + ': ' + Number(got[k])).join(', ') + ' },\n';
const src = await readFile(FILE, 'utf8');
const at = src.indexOf('\n  ],', src.indexOf('readings: ['));
if (at < 0) fail('js/pulse.js is not laid out the way this expects.');
await writeFile(FILE, src.slice(0, at + 1) + line + src.slice(at + 1));
console.log('Added the reading for ' + got.date + '.');
if (last)
  for (const k of ['judges', 'memories', 'links', 'measures']) {
    const d = Number(got[k]) - last[k];
    console.log(
      '  ' +
        k +
        ': ' +
        (d >= 0 ? '+' : '') +
        d.toLocaleString('en-US') +
        ' since ' +
        last.date +
        (d < 0 ? '  (it went DOWN: the page will not claim it grew)' : ''),
    );
  }
console.log('Now build the bundle (node tools/bundle.mjs) and publish.');
