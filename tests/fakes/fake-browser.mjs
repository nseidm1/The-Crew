#!/usr/bin/env node
// fake-browser.mjs - a TEST DOUBLE for a browser run without a window (and, as FO_BIN_SCREENCAPTURE, for macOS's screencapture): it
// writes a small real picture where it is told to and records which page it was asked for. Used only when FO_BIN_BROWSER points at it.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const args = process.argv.slice(2);
const shot = args.find((a) => a.startsWith('--screenshot='));
const file = shot ? shot.slice(13) : args[args.length - 1];
if (process.env.FO_FAKE_BROWSER_FAILS === '1') {
  console.error('ERROR: could not load the page');
  process.exit(1);
}
// a 320 x 200 PNG: a dark page with a lighter band across it, so it is plainly a picture when the chat shows it
const W = 320;
const H = 200;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const band = y > 30 && y < 70;
    const i = row + 1 + x * 3;
    raw[i] = band ? 52 : 10;
    raw[i + 1] = band ? 211 : 15;
    raw[i + 2] = band ? 153 : 24;
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
  file,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
writeFileSync(
  path.join(process.env.FO_FAKE_DIR || path.dirname(file), 'fake-shot.json'),
  JSON.stringify({ args, url: shot ? args[args.length - 1] : '' }),
);
