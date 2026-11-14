// fake-pi.mjs - a TEST DOUBLE for Pi's CLI. It does what a competent agent would do for the three agent-check jobs and their steps, and
// prints Pi's JSON event shapes. Used only when FO_PI_CLI points at it. It can be made to need help, the way a small model does:
//   FO_FAKE_PI_FAIL=<job id>                    it never gets that job right, however it is given
//   FO_FAKE_PI_NEEDS=<job id>=<need>,...        it gets that job WRONG until it is given the way it needs:
//       told    it must be told what the judge found        guide   it must be given the way of working
//       steps   it must be given the job one step at a time
//       lesson  it must have been taught: the rules from its own misses are in front of the job
//   FO_FAKE_PI_ASKS=1                           before it works it asks the model once, the way Pi does (through the address in its
//                                               models.json, with Pi's kind of instructions and a tool). A refusal ends the run as Pi
//                                               ends it; a reply that is not whole means it does nothing this run.
// Getting a job wrong means doing something wrong, not doing nothing: a wrong total, an edited test, a file that is not JSON.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { solve, botch, JOB_IDS } from './fake-jobs.mjs';

const prompt = process.argv[process.argv.length - 1];
const job = path.basename(process.cwd());
const needs = Object.fromEntries(
  String(process.env.FO_FAKE_PI_NEEDS || '')
    .split(',')
    .filter(Boolean)
    .map((x) => x.split('=')),
);
const given = {
  told: /A check of your work found/.test(prompt),
  guide: /Work like this:/.test(prompt),
  steps: /^One step only/.test(prompt),
  lesson: /things you have got wrong before/.test(prompt),
};
const wrong = process.env.FO_FAKE_PI_FAIL === job || (needs[job] && !given[needs[job]]);
// which Node.js it is run on matters to the real one. Here a "Node.js" is a wrapper that names itself in FO_WRAP, and the double can be
// told to refuse to start on some of them (FO_FAKE_PI_CRASH_ON, at once) or to stop mid-job on some (FO_FAKE_PI_CRASH_RUN), as Pi 1.5.2
// does on a Node.js that lacks what it needs.
const wrap = process.env.FO_WRAP || 'none';
const dies = (v) =>
  String(process.env[v] || '')
    .split(',')
    .includes(wrap);
const boom = () => {
  console.error(
    "TypeError: Cannot read properties of undefined (reading 'bind')\n    at node_modules/undici/lib/interceptor/decompress.js",
  );
  process.exit(1);
};
if (process.argv.includes('--version')) {
  if (dies('FO_FAKE_PI_CRASH_ON')) boom();
  console.log('9.9.9');
  process.exit(0);
}
if (dies('FO_FAKE_PI_CRASH_ON') || dies('FO_FAKE_PI_CRASH_RUN')) boom();
const say = (o) => console.log(JSON.stringify(o));
if (process.env.FO_FAKE_PI_MS) await new Promise((r) => setTimeout(r, Number(process.env.FO_FAKE_PI_MS))); // as slow as a real model, for watching the page
say({ type: 'session', version: 3, id: 'test', cwd: process.cwd() });
say({ type: 'agent_start' });
say({ type: 'turn_start' });
let cutShort = false;
if (process.env.FO_FAKE_PI_ASKS === '1') {
  const cfg = JSON.parse(readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'models.json'), 'utf8')).providers
    .tensorfold;
  const model = cfg.models[0];
  const r = await fetch(cfg.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      stream: true,
      max_completion_tokens: model.maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert coding assistant.\n<docs>\n/opt/pi/docs/README.md\n</docs>\n<cwd>\n' +
            process.cwd() +
            '\n</cwd>',
        },
        { role: 'user', content: [{ type: 'text', text: prompt }] },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'read',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string', description: 'Path to the file to read (relative or absolute)' } },
              required: ['path'],
            },
          },
        },
      ],
    }),
  });
  const raw = await r.text();
  if (!r.ok) {
    let msg = raw;
    try {
      msg = JSON.parse(raw).error.message;
    } catch {
      /* its own words */
    }
    say({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: msg } });
    say({ type: 'agent_end', messages: [], willRetry: false });
    process.exit(0);
  }
  cutShort = !/"finish_reason":"(tool_calls|stop)"/.test(raw) || raw.includes('后汉书');
}
let tools = 0;
const sum = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .reduce((a, b) => a + Number(b), 0);
if (process.env.FO_FAKE_PI_FAIL === job || cutShort)
  tools = 0; // it does nothing at all
else if (wrong) {
  if (job === 'read-write') {
    writeFileSync('total.txt', 'The total is 41\n');
    tools = 2;
  } else if (job === 'fix-bug') {
    writeFileSync('test.js', readFileSync('test.js', 'utf8').replace('4);', '3);'));
    tools = 2;
  } else if (job === 'two-files') {
    writeFileSync('seats.json', 'Here are the seats: overseer, steward');
    tools = 1;
  } else if (JOB_IDS.includes(job)) tools = botch();
} else if (JOB_IDS.includes(job)) tools = Math.max(0, solve(prompt));
else if (/named seen\.txt/.test(prompt)) {
  writeFileSync('seen.txt', readFileSync('numbers.txt', 'utf8'));
  tools = 2;
} else if (/total\.txt/.test(prompt)) {
  writeFileSync(
    'total.txt',
    String(sum(/Read seen\.txt/.test(prompt) && existsSync('seen.txt') ? 'seen.txt' : 'numbers.txt')) + '\n',
  );
  tools = 2;
} else if (/named bug\.txt/.test(prompt)) {
  writeFileSync('bug.txt', 'The average function divides by one more than the number of items.\n');
  tools = 3;
} else if (/math\.js/.test(prompt)) {
  writeFileSync('math.js', readFileSync('math.js', 'utf8').replace('(xs.length + 1)', 'xs.length'));
  tools = 3;
} else if (/Create seats\.json/.test(prompt)) {
  writeFileSync('seats.json', JSON.stringify(['overseer', 'steward', 'operations', 'ask', 'master']));
  tools = 1;
  if (/count\.txt/.test(prompt)) {
    writeFileSync('count.txt', '5');
    tools = 2;
  }
} else if (/count\.txt/.test(prompt)) {
  writeFileSync('count.txt', String(JSON.parse(readFileSync('seats.json', 'utf8')).length));
  tools = 2;
}
say({ type: 'turn_end', message: { role: 'assistant' }, toolResults: Array.from({ length: tools }, () => ({})) });
say({
  type: 'message_end',
  message: { role: 'assistant', content: [{ type: 'text', text: wrong ? 'I think that is right.' : 'Done.' }] },
});
say({ type: 'agent_end', messages: [], willRetry: false });
say({ type: 'agent_settled', aborted: false });
