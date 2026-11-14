#!/usr/bin/env node
// fake-llama.mjs - a TEST DOUBLE for llama.cpp's "llama" command, used only when FO_BIN_LLAMA points at it (or at a copy of it that
// fake-brew.mjs "installed"). It does what the runner relies on and nothing more:
//   llama --version                      one line, as the real one prints (FO_FAKE_LLAMA_OLD=1: a release too old for the model)
//   llama serve -m <file> --mmproj <file> --host 127.0.0.1 --port N ...     an OpenAI-compatible server
// The server "reads" a picture the only way a double can: it looks up which page the fake browser was last asked to draw
// ($FO_FAKE_DIR/fake-shot.json) and, asked for the number on it, gives the number that page carries. FO_FAKE_LLAMA_BLIND=1 makes it
// read wrongly; FO_FAKE_LLAMA_NO_REASONING=1 makes it refuse the --reasoning flag, as an older build would, and FO_FAKE_LLAMA_SHORT_MM=1
// makes it take the projector only as -mm. Every request is appended
// to $FO_FAKE_DIR/fake-llama.jsonl: whether a picture came with it, how large, and what was asked.
import http from 'node:http';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = process.env.FO_FAKE_DIR || process.cwd();
const val = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : '';
};
if (args.includes('--version')) {
  console.log(
    process.env.FO_FAKE_LLAMA_OLD === '1' && !existsSync(path.join(dir, 'llama-upgraded'))
      ? 'llama 0.7.4 (b11310)\nbuilt with Apple clang version 17.0.0'
      : 'llama 0.8.2 (b12044)\nbuilt with Apple clang version 17.0.0',
  );
  process.exit(0);
}
if (args[0] !== 'serve') {
  console.error('usage: llama serve ...');
  process.exit(2);
}
if (process.env.FO_FAKE_LLAMA_NO_REASONING === '1' && args.includes('--reasoning')) {
  console.error('error: invalid argument: --reasoning');
  process.exit(1);
}
if (process.env.FO_FAKE_LLAMA_SHORT_MM === '1' && args.includes('--mmproj')) {
  console.error('error: invalid argument: --mmproj');
  process.exit(1);
}
for (const k of ['-m', args.includes('-mm') ? '-mm' : '--mmproj'])
  if (!existsSync(val(k))) {
    console.error('error: failed to load ' + (k === '-m' ? 'model' : 'projector') + ' from ' + val(k));
    process.exit(1);
  }
appendFileSync(path.join(dir, 'fake-llama.jsonl'), JSON.stringify({ served: args }) + '\n');

const numberOnPage = () => {
  try {
    const shot = JSON.parse(readFileSync(path.join(dir, 'fake-shot.json'), 'utf8'));
    return (/>(\d{4})<\/body>/.exec(readFileSync(String(shot.url).replace(/^file:\/\//, ''), 'utf8')) || [])[1] || '';
  } catch {
    return '';
  }
};
http
  .createServer((req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/v1/models')
      return json(200, { object: 'list', data: [{ id: 'fo-eyes' }] });
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions')
      return json(404, { error: { message: 'not found' } });
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      let b;
      try {
        b = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        return json(400, { error: { message: 'not JSON' } });
      }
      const user = (b.messages || []).find((m) => m.role === 'user') || {};
      const bits = Array.isArray(user.content) ? user.content : [];
      const pic = bits.find((x) => x && x.type === 'image_url');
      const text = (bits.find((x) => x && x.type === 'text') || {}).text || '';
      const data = pic ? String(pic.image_url.url).split(',')[1] || '' : '';
      const png = Buffer.from(data, 'base64');
      appendFileSync(
        path.join(dir, 'fake-llama.jsonl'),
        JSON.stringify({
          picture: png.length,
          isPng: png.slice(1, 4).toString() === 'PNG',
          asked: text,
          max: b.max_tokens,
          temperature: b.temperature,
        }) + '\n',
      );
      if (!pic) return json(400, { error: { message: 'no picture came with the request' } });
      const blind = process.env.FO_FAKE_LLAMA_BLIND === '1';
      const said = /what number/i.test(text)
        ? blind
          ? 'I see a white page.'
          : 'The number is ' + numberOnPage() + '.'
        : process.env.FO_FAKE_LLAMA_RUNS_ON === '1'
          ? 'A dark page with a green band near the top. ' + 'band band '.repeat(40)
          : 'A dark page with a green band near the top. Heading: "Plans". One button: "Start". Nothing overlaps; the lower half is empty.';
      json(200, {
        id: 'chatcmpl-fake',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: said }, finish_reason: 'stop' }],
        usage: { completion_tokens: 30 },
      });
    });
  })
  .listen(Number(val('--port')), val('--host') || '127.0.0.1');
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
