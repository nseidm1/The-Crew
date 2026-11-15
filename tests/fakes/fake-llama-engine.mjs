#!/usr/bin/env node
// fake-llama-engine.mjs - a TEST DOUBLE for llama.cpp used as a team's engine (runner/llama.mjs). The self-test packs a copy of it
// into a small archive named like llama.cpp's own build, so the runner's fetch, check and unpack are driven for real, and then runs it
// the way the runner runs the real one:
//   llama-server --version
//   llama-server -m FILE --host H --port P -a NAME -c N -np 1
// The server it starts is the engine stand-in the rest of the self-test uses ($FO_FAKE_ENGINE: fake-tensorfold.mjs), so the timed
// answer and the agent check meet something that answers as a model does. Every call is appended to $FO_FAKE_DIR/fake-llama-engine.jsonl.
//   FO_FAKE_LLAMA_VERSION=<text>   what --version says (default: a build new enough)
//   FO_FAKE_LLAMA_DIES=1           the server stops at once, in llama.cpp's own words for a file it cannot read
//   llama-server --list-devices    lists the cards in FO_FAKE_LLAMA_DEVICES (one a line), as llama.cpp lists them; none by default
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const dir = process.env.FO_FAKE_DIR || '.';
const val = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : '';
};
try {
  appendFileSync(path.join(dir, 'fake-llama-engine.jsonl'), JSON.stringify({ args }) + '\n');
} catch {
  /* nowhere to record */
}
if (args.includes('--version')) {
  console.log(process.env.FO_FAKE_LLAMA_VERSION || 'version: 12110 (stand-in)');
  process.exit(0);
}
if (args.includes('--list-devices')) {
  console.log('Available devices:');
  String(process.env.FO_FAKE_LLAMA_DEVICES || '')
    .split('\n')
    .filter(Boolean)
    .forEach((d, i) => console.log('  Vulkan' + i + ': ' + d));
  process.exit(0);
}
if (!val('-m') || !val('--port')) {
  console.error('usage: llama-server -m FILE --port N');
  process.exit(2);
}
if (!existsSync(val('-m'))) {
  console.error('error: failed to load model from ' + val('-m'));
  process.exit(1);
}
if (process.env.FO_FAKE_LLAMA_DIES === '1') {
  console.error('llama_model_load: error loading model: invalid magic');
  process.exit(1);
}
console.log('main: loading model');
console.log('main: server is listening on http://' + (val('--host') || '127.0.0.1') + ':' + val('--port'));
process.argv = [
  process.argv[0],
  process.env.FO_FAKE_ENGINE,
  'serve',
  path.basename(val('-m')),
  '--name',
  val('-a') || 'model',
  '--context',
  val('-c') || '16384',
  '--host',
  val('--host') || '127.0.0.1',
  '--port',
  val('--port'),
];
await import(pathToFileURL(process.env.FO_FAKE_ENGINE).href);
