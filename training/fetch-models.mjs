// fetch-models.mjs - THE MODELS LLAMA.CPP RUNS, FETCHED ONCE FOR EVERY MEASUREMENT. A measurement starts a new team, in a folder of
// its own, for every run; left to that, each run would fetch its model again (the largest is 7 GB). This fetches them into one
// place (.work/models, never committed) with the app's own fetch: the pinned revision, the size and the SHA-256 in the catalog,
// and a download that stopped carries on. The trainers find them there by themselves.
//   node training/fetch-models.mjs                 every Bonsai 2 size
//   node training/fetch-models.mjs --only llama-bonsai2-9b,llama-qwen35-4b
//   node training/fetch-models.mjs --list          what is there, and what is not
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, REPO_ROOT } from './support/team-chat.mjs';
const cat = await import(path.join(REPO_ROOT, 'src', 'js', 'catalog.js'));
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const only = String(arg('only', '')).split(',').filter(Boolean);
const wanted = cat.LLAMA_MODELS.filter((m) => (only.length ? only.includes(m.id) : m.family === 'Bonsai'));
fs.mkdirSync(MODELS, { recursive: true });
process.env.FO_LLAMA_MODELS_DIR = MODELS;
const { fetchLlamaModel, haveLlamaModel } = await import(path.join(REPO_ROOT, 'src', 'runner', 'llama.mjs'));
const gb = (n) => (n / 2 ** 30).toFixed(1) + ' GB';
if (process.argv.includes('--list')) {
  for (const m of cat.LLAMA_MODELS)
    console.log(((await haveLlamaModel(MODELS, m)) ? 'here     ' : 'not here ') + m.id.padEnd(20) + gb(m.bytes));
  process.exit(0);
}
let bad = 0;
for (const m of wanted) {
  if (await haveLlamaModel(MODELS, m)) {
    console.log('here     ' + m.id.padEnd(20) + gb(m.bytes));
    continue;
  }
  let said = 0;
  const t0 = Date.now();
  const r = await fetchLlamaModel(m, {
    stateDir: MODELS,
    onBytes: (n) => {
      if (Date.now() - said < 15000) return;
      said = Date.now();
      console.log('         ' + m.id.padEnd(20) + gb(n) + ' of ' + gb(m.bytes));
    },
  });
  console.log(
    (r.ok ? 'fetched  ' : 'FAILED   ') +
      m.id.padEnd(20) +
      (r.ok ? gb(m.bytes) + ', checked against its SHA-256, ' + Math.round((Date.now() - t0) / 1000) + ' s' : r.why),
  );
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
