#!/usr/bin/env node
// fake-tensorfold.mjs - a TEST DOUBLE for the tensorfold command, so the runner's whole pipeline can be driven without installing an
// engine or downloading a model. It answers only what the runner calls: --version, models --json, pull, serve (a tiny OpenAI-style
// streaming server). It is never used unless FO_BIN_TENSORFOLD points at it.
// The served model can be made to go wrong the ways a real one was seen to (every request it gets is written to fake-requests.jsonl):
//   FO_FAKE_DRAFTS_BREAK=1       every reply breaks down into one piece repeated to its limit, unless it is served with --no-drafts
//   FO_FAKE_AFTER_TOOL_BREAKS=1  only a reply that follows a tool's result (a "tool" turn) breaks down
//   FO_FAKE_RUNS_ON=1            every reply is whole, and then runs on into the repeated piece
//   FO_FAKE_NO_PENALTY=1         it refuses any penalty setting (400, naming the setting)
//   FO_FAKE_CONTEXT=<n>          it refuses a request for n reply tokens or more, in the real engine's words
// Like the real one it honours a stop piece: a reply ends where the piece would have begun.
import http from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
const store = path.join(process.env.FO_FAKE_DIR || '.', 'fake-models.json');
const have = () => {
  try {
    return JSON.parse(readFileSync(store, 'utf8'));
  } catch {
    return [];
  }
};
// like the real one under Rosetta: it refuses to run as an Intel program (the stand-in for arch marks what it starts as native)
if (process.env.FO_FAKE_NEEDS_NATIVE === '1' && process.env.FO_FAKE_NATIVE !== '1') {
  console.error('TensorFold native requires Apple Silicon on macOS.');
  process.exit(1);
}
if (cmd === '--version') {
  console.log('tensorfold 0.0.0-test');
  process.exit(0);
}
if (cmd === 'models') {
  console.log(
    JSON.stringify({ schema: 1, checkpoints: have().map((repo) => ({ repo, family: 'Test', model_type: 'test' })) }),
  );
  process.exit(0);
}
if (cmd === 'pull') {
  const repo = args[0].split('@')[0];
  for (let i = 1; i <= 5; i++) {
    console.log('pulling ' + repo + ' ' + i * 20 + '%');
    await new Promise((r) => setTimeout(r, 120));
  }
  mkdirSync(path.dirname(store), { recursive: true });
  writeFileSync(store, JSON.stringify([...new Set([...have(), repo])]));
  process.exit(0);
}
if (cmd === 'serve') {
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  if (process.env.FO_FAKE_REFUSE && args.includes(process.env.FO_FAKE_REFUSE)) {
    console.error('error: unknown flag ' + process.env.FO_FAKE_REFUSE);
    process.exit(2);
  }
  const name = flag('--name') || 'local-model';
  const port = Number(flag('--port') || 8080);
  const PIECE = '后汉书';
  const drafts = !args.includes('--no-drafts');
  const on = (v) => process.env[v] === '1';
  console.log('loading ' + args[0]);
  const words =
    'A unit test is a small check that one piece of code does what it should. A team writes it first so a change is proven, not hoped for.'.split(
      ' ',
    );
  const textOf = (c) =>
    typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : '';
  const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
  http
    .createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: name }] }));
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let raw = '';
        req.on('data', (d) => {
          raw += d;
        });
        req.on('end', async () => {
          let b = {};
          try {
            b = JSON.parse(raw);
          } catch {
            /* an empty request is answered like any other */
          }
          const msgs = Array.isArray(b.messages) ? b.messages : [];
          const last = msgs[msgs.length - 1] || {};
          const cap = Number(b.max_completion_tokens || b.max_tokens) || 0;
          const stops = [].concat(b.stop || []);
          try {
            appendFileSync(
              path.join(process.env.FO_FAKE_DIR || '.', 'fake-requests.jsonl'),
              JSON.stringify({
                drafts,
                cap,
                stop: stops,
                roles: msgs.map((m) => m.role),
                system: textOf((msgs.find((m) => m.role === 'system') || {}).content),
                last: textOf(last.content).slice(0, 300),
                tail: textOf(last.content).slice(-4000),
                tools: (b.tools || []).map(
                  (t) =>
                    t.function.name + ': ' + (((t.function.parameters || {}).properties || {}).path || {}).description,
                ),
                penalty:
                  b.repetition_penalty != null
                    ? b.repetition_penalty
                    : b.frequency_penalty != null
                      ? b.frequency_penalty
                      : null,
              }) + '\n',
            );
          } catch {
            /* the record is for the tests */
          }
          const refuse = (message) => {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message, type: 'invalid_request_error' } }));
          };
          const ctx = Number(process.env.FO_FAKE_CONTEXT) || 0;
          if (ctx && cap >= ctx)
            return refuse(
              "This model's maximum context length is " +
                ctx +
                ' tokens, but the rendered prompt has 1015 tokens and requests ' +
                cap +
                ' reply tokens (' +
                (1015 + cap) +
                ' in total). Shorten the messages or request at most ' +
                (ctx - 1015) +
                ' reply tokens.',
            );
          const pen = ['repetition_penalty', 'frequency_penalty', 'presence_penalty'].find((k) => b[k] != null);
          if (on('FO_FAKE_NO_PENALTY') && pen) return refuse(pen + " is not supported by backend 'metal'");
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const send = (delta, finish = null) =>
            res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n');
          const breaks =
            (on('FO_FAKE_DRAFTS_BREAK') && drafts) ||
            (on('FO_FAKE_AFTER_TOOL_BREAKS') && msgs.some((m) => m.role === 'tool'));
          const runsOn = on('FO_FAKE_RUNS_ON');
          // the repeated piece, to the reply's limit; with the piece given as a place to stop, the reply ends here instead
          const garbage = async () => {
            if (stops.includes(PIECE)) return send({}, 'stop');
            const n = Math.min(400, Math.max(40, cap || 400));
            for (let i = 0; i < n && !res.destroyed; i += 10) {
              send({ content: PIECE.repeat(10) });
              await tick(3);
            }
            send({}, 'length');
          };
          if (Array.isArray(b.tools) && b.tools.length) {
            const after =
              last.role === 'tool' || (last.role === 'user' && /Result of the \w+ call:/.test(textOf(last.content)));
            if (breaks) {
              send({ role: 'assistant', content: 'I' });
              await garbage();
            } else if (after) {
              send({ role: 'assistant', content: 'Done.' });
              if (runsOn) await garbage();
              else send({}, 'stop');
            } else {
              send({
                role: 'assistant',
                tool_calls: [
                  { index: 0, id: 'call_1', type: 'function', function: { name: 'read', arguments: '{"path":' } },
                ],
              });
              await tick();
              send({ tool_calls: [{ index: 0, function: { arguments: '"numbers.txt"}' } }] });
              if (runsOn) await garbage();
              else send({}, 'tool_calls');
            }
          } else if (breaks) {
            for (const w of words.slice(0, 4)) {
              send({ content: w + ' ' });
              await tick();
            }
            await garbage();
          } else {
            for (const w of words) {
              send({ content: w + ' ' });
              await tick();
            }
            if (runsOn) await garbage();
          }
          res.write(
            'data: ' +
              JSON.stringify({ choices: [], usage: { completion_tokens: words.length } }) +
              '\n\ndata: [DONE]\n\n',
          );
          res.end();
        });
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(port, '127.0.0.1', () => console.log('listening on 127.0.0.1:' + port + ', 8 streams at once'));
} else if (!['--version', 'models', 'pull'].includes(cmd)) {
  console.error('fake tensorfold: unknown command ' + cmd);
  process.exit(2);
}
