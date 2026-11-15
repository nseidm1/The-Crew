// ratchet.mjs - A BAR THAT IS HELD TIGHTENS. A round that only repeats the last one teaches nothing. This reads the history of every
// trainer (training/results/history.jsonl) and, for each one whose last three full runs held everything they asked, raises what it
// asks: one step for each three clean runs, three steps at most. What a step means is the trainer's own (manners.mjs asks for
// shorter replies; the others read the step and say so). A run that misses puts the bar back one step: a bar is held, not kept.
// (After the system this team is modelled on, where a target that has been held for its period tightens by itself.)
//   node training/ratchet.mjs            what each bar is now, and why      node training/ratchet.mjs --write   also keep it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(HERE, 'results');
export const BARS = path.join(out, 'bars.json');
export const barFor = (label) => {
  try {
    return (JSON.parse(fs.readFileSync(BARS, 'utf8'))[label] || {}).step || 0;
  } catch {
    return 0;
  }
};
// a full run asks at least as much as the fullest run of its label has asked; a look at a few people or questions is not one
export const stepsOf = (rows) => {
  const by = new Map();
  for (const r of rows) if (r && r.label && r.total) by.set(r.label, [...(by.get(r.label) || []), r]);
  const bars = {};
  for (const [label, all] of by) {
    const most = Math.max(...all.map((r) => r.total.runs || 0));
    const full = all.filter((r) => (r.total.runs || 0) >= most * 0.9);
    let step = 0;
    let clean = 0;
    for (const r of full) {
      const held = (r.total.good || 0) === (r.total.runs || 0) && !(r.total.wrong > 0);
      if (held) {
        clean++;
        if (clean % 3 === 0) step = Math.min(3, step + 1);
      } else {
        clean = 0;
        step = Math.max(0, step - 1);
      }
    }
    bars[label] = { step, clean, runs: full.length, last: full.length ? full[full.length - 1].at : null };
  }
  return bars;
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let rows = [];
  try {
    rows = fs
      .readFileSync(path.join(out, 'history.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      });
  } catch {
    /* no history yet */
  }
  const bars = stepsOf(rows);
  for (const [label, b] of Object.entries(bars))
    console.log(
      (b.step ? 'step ' + b.step + '  ' : 'as is   ') +
        label.padEnd(44) +
        b.clean +
        ' clean in a row, of ' +
        b.runs +
        ' full runs',
    );
  if (process.argv.includes('--write')) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(BARS, JSON.stringify(bars, null, 1) + '\n');
    console.log('kept in ' + path.relative(process.cwd(), BARS));
  }
}
