// publish.mjs - WHAT TRAINING HAS SHOWN OF EACH LOCAL MODEL, WRITTEN WHERE THE APP SHOWS IT. Every trainer leaves a result file for
// the model it ran on (training/results). This reads them, for each model in the catalog, and writes one small file the app ships
// with (src/js/trained.js): how many of each kind of measurement the model got right, when, and on what machine. The model page
// shows it beside each model, so a person choosing one can see how far its training has come; a model with no results says so.
// It is run at the end of a training session, and the next bundle carries what it wrote: as training goes on, what the app
// says of a model follows it. Nothing here is judged or rounded up: the numbers are the trainers' own.
//   node training/publish.mjs            write src/js/trained.js
//   node training/publish.mjs --check    say what it would write, and exit 1 if the file is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RESULTS = path.join(HERE, 'results');
const OUT = path.join(ROOT, 'src', 'js', 'trained.js');
const cat = await import(path.join(ROOT, 'src', 'js', 'catalog.js'));
const ids = [...cat.MODELS, ...cat.STRATA_MODELS, ...cat.LLAMA_MODELS].map((m) => m.id);
const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS, name), 'utf8'));
  } catch {
    return null;
  }
};
const day = (at) => String(at || '').slice(0, 10);
const n = (v) => Number(v) || 0;
const TRAINED = {};
for (const id of ids) {
  const parts = {
    answers: [read(id + '-substance-simple.json'), read(id + '-substance-developer.json')].filter(Boolean),
    manners: [read(id + '-manners-simple.json'), read(id + '-manners-developer.json')].filter(Boolean),
    voices: [read(id + '-voices.json')].filter(Boolean),
    memory: [read('soul-' + id + '.json')].filter(Boolean),
    requests: [read('simple-' + id + '.json')].filter(Boolean),
    tickets: [read(id + '.json')].filter(Boolean),
  };
  const all = Object.values(parts).flat();
  if (!all.length) continue;
  const sum = (list, good, of) => ({
    good: list.reduce((a, r) => a + n(good(r)), 0),
    of: list.reduce((a, r) => a + n(of(r)), 0),
  });
  const one = {};
  if (parts.answers.length)
    one.answers = sum(
      parts.answers,
      (r) => r.total.right,
      (r) => r.total.of,
    );
  if (parts.manners.length)
    one.manners = sum(
      parts.manners,
      (r) => r.good,
      (r) => r.of,
    );
  if (parts.voices.length)
    one.voices = sum(
      parts.voices,
      (r) => r.good,
      (r) => r.of,
    );
  if (parts.memory.length)
    one.memory = sum(
      parts.memory,
      (r) => r.total.good,
      (r) => r.total.checks,
    );
  if (parts.requests.length)
    one.requests = sum(
      parts.requests,
      (r) => r.total.good,
      (r) => r.total.runs,
    );
  if (parts.tickets.length)
    one.tickets = {
      ...sum(
        parts.tickets,
        (r) => r.total.good,
        (r) => r.total.runs,
      ),
      falseGreen: parts.tickets.reduce((a, r) => a + n(r.total['false-green']), 0),
    };
  // a kind that ran nothing (a trainer that stopped before its first question) is not a result
  for (const k of Object.keys(one)) if (!one[k].of) delete one[k];
  if (!Object.keys(one).length) continue;
  const newest = all
    .map((r) => r.at)
    .filter(Boolean)
    .sort()
    .pop();
  TRAINED[id] = {
    at: day(newest),
    machine: (all.find((r) => r.machine) || {}).machine || '',
    kinds: Object.keys(one).length,
    ...one,
  };
}
const text =
  "// trained.js - WHAT TRAINING HAS SHOWN OF EACH LOCAL MODEL. Written by training/publish.mjs from the trainers' own result files;\n" +
  '// not edited by hand. For each model: the day of its newest result, the machine, and for each kind of measurement how many it\n' +
  '// got right of how many (tickets also count a change passed as proven that was wrong). A model that is not here has not been\n' +
  '// trained: Choose your model lists it dimmed, it cannot be chosen, and Simple never chooses it, until it is here.\n' +
  'export const TRAINED = ' +
  JSON.stringify(TRAINED, null, 2) +
  ';\n';
const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
for (const [id, t] of Object.entries(TRAINED))
  console.log(
    id.padEnd(20) +
      t.at +
      '  ' +
      ['answers', 'manners', 'voices', 'memory', 'requests', 'tickets']
        .filter((k) => t[k])
        .map((k) => k + ' ' + t[k].good + '/' + t[k].of)
        .join('  '),
  );
if (process.argv.includes('--check')) {
  console.log(
    was === text
      ? 'src/js/trained.js is up to date.'
      : 'src/js/trained.js is OUT OF DATE: run node training/publish.mjs',
  );
  process.exit(was === text ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(
  (was === text ? 'unchanged: ' : 'written: ') +
    path.relative(ROOT, OUT) +
    ' (' +
    Object.keys(TRAINED).length +
    ' models)',
);
