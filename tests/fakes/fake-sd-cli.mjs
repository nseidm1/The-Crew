#!/usr/bin/env node
// fake-sd-cli.mjs - a TEST DOUBLE for stable-diffusion.cpp's "sd-cli" command. It is put in a zip by the self-test and "installed" from
// there, the way the real release is, or named directly by FO_BIN_SDCLI. It does what the runner relies on and nothing more: it insists
// that every model file it is given exists, writes a small real PNG (or a stub WebM or AVI) where -o says, and records what it was
// asked in $FO_FAKE_DIR/fake-sd.jsonl. FO_FAKE_SD_FAILS=1 makes it stop the way a real one does when it runs out of memory;
// FO_FAKE_SD_AVI_ONLY=1 makes it refuse to write a WebM.
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const args = process.argv.slice(2);
const val = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : '';
};
const out = val('-o');
try {
  appendFileSync(
    path.join(process.env.FO_FAKE_DIR || '.', 'fake-sd.jsonl'),
    JSON.stringify({ args, prompt: val('-p'), mode: val('-M'), out: path.basename(out) }) + '\n',
  );
} catch {
  /* nowhere to record */
}
for (const k of ['--diffusion-model', '--vae', '--llm', '--clip_l', '--t5xxl'])
  if (args.includes(k) && !existsSync(val(k))) {
    console.error('error: failed to load ' + k.slice(2) + ' from ' + val(k));
    process.exit(1);
  }
if (!args.includes('--diffusion-model') || !out) {
  console.error('usage: sd-cli --diffusion-model <file> ... -p <prompt> -o <file>');
  process.exit(2);
}
if (process.env.FO_FAKE_SD_FAILS === '1') {
  console.error('error: failed to allocate the compute buffer (out of memory)');
  process.exit(1);
}
if (/\.webm$/.test(out)) {
  if (process.env.FO_FAKE_SD_AVI_ONLY === '1') {
    console.error('error: unsupported output format: webm');
    process.exit(1);
  }
  writeFileSync(out, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(600, 7)]));
} else if (/\.avi$/.test(out))
  writeFileSync(out, Buffer.concat([Buffer.from('RIFF\0\0\0\0AVI LIST'), Buffer.alloc(600, 7)]));
else {
  // a 96 x 96 PNG: a red disc on white, so it is plainly a picture
  const W = 96;
  const H = 96;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W; x++) {
      const inside = (x - 48) ** 2 + (y - 48) ** 2 < 900;
      const i = row + 1 + x * 3;
      raw[i] = inside ? 214 : 255;
      raw[i + 1] = inside ? 48 : 255;
      raw[i + 2] = inside ? 49 : 255;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head[8] = 8;
  head[9] = 2;
  writeFileSync(
    out,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', head),
      chunk('IDAT', zlib.deflateSync(raw, { level: 0 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.log('save result image to ' + out);
