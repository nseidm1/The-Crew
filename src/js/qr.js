// qr.js - a QR code, made on this page from a piece of text. No library and nothing fetched: the text never leaves the page.
// What it makes: byte mode, error correction level M (about 15% of the code may be unreadable), versions 1 to 15 (up to 412 bytes),
// the best of the eight masks by the standard's own penalty score.
//   qrMatrix(text) -> rows of true (dark) / false (light)        qrSvg(text) -> an <svg> element, dark on white, with its quiet border
// Level M, per version: [error-correction codewords per block, blocks, data codewords in each, more blocks, data in each of those]
const EC = [
  null,
  [10, 1, 16],
  [16, 1, 28],
  [26, 1, 44],
  [18, 2, 32],
  [24, 2, 43],
  [16, 4, 27],
  [18, 4, 31],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
];
const ALIGN = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
];
// arithmetic in GF(256), for the error-correction codewords
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 256) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function correction(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}
const bch = (value, bits, poly, polyBits) => {
  let r = value << (polyBits - 1);
  for (let i = bits + polyBits - 2; i >= polyBits - 1; i--) if (r & (1 << i)) r ^= poly << (i - (polyBits - 1));
  return (value << (polyBits - 1)) | r;
};

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = 1;
  const room = (ver) => {
    const e = EC[ver];
    return e[1] * e[2] + (e[3] || 0) * (e[4] || 0);
  };
  while (v <= 15 && 4 + (v < 10 ? 8 : 16) + 8 * bytes.length > room(v) * 8) v++;
  if (v > 15) throw new Error('too much text for one code');
  // the message: what kind it is, how long, the bytes, an end mark, then filler to the size of this version
  const bits = [];
  const put = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const total = room(v) * 8;
  put(0, Math.min(4, total - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < total; pad ^= 0xec ^ 0x11) put(pad, 8);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // cut into blocks, give each its correction codewords, and deal them out a codeword at a time
  const e = EC[v];
  const blocks = [];
  let at = 0;
  for (const [count, size] of [
    [e[1], e[2]],
    [e[3] || 0, e[4] || 0],
  ])
    for (let i = 0; i < count; i++) {
      const d = words.slice(at, at + size);
      at += size;
      blocks.push({ d, c: correction(d, e[0]) });
    }
  const out = [];
  for (let i = 0; i < Math.max(...blocks.map((b) => b.d.length)); i++)
    for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < e[0]; i++) for (const b of blocks) out.push(b.c[i]);
  // the square: the fixed parts first (and which cells they own), then the message threaded through what is left
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, dark) => {
    if (x >= 0 && y >= 0 && x < n && y < n) {
      m[y][x] = !!dark;
      fixed[y][x] = true;
    }
  };
  for (let i = 0; i < n; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
  const al = ALIGN[v];
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const format = (mask) => {
    const f = bch(mask, 5, 0x537, 11) ^ 0x5412;
    const bit = (i) => (f >> i) & 1; // level M is 00, so the five bits are the mask alone
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  format(0);
  if (v >= 7) {
    const info = bch(v, 6, 0x1f25, 13);
    for (let i = 0; i < 18; i++) {
      const dark = (info >> i) & 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? n - 1 - step : step;
        if (!fixed[y][x] && k < out.length * 8) {
          m[y][x] = ((out[k >> 3] >> (7 - (k & 7))) & 1) === 1;
          k++;
        }
      }
  }
  // the mask: the pattern, of eight, that leaves the square easiest to read
  const MASK = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const flip = (mask) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixed[y][x] && MASK[mask](x, y)) m[y][x] = !m[y][x];
  };
  const penalty = () => {
    let p = 0;
    let dark = 0;
    const line = (get) => {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b <= n; b++) {
          if (b < n && get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
        for (let b = 0; b + 10 < n; b++) {
          const w = [];
          for (let i = 0; i < 11; i++) w.push(get(a, b + i) ? 1 : 0);
          const s = w.join('');
          if (s === '10111010000' || s === '00001011101') p += 40;
        }
      }
    };
    line((y, x) => m[y][x]);
    line((x, y) => m[y][x]);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (m[y][x]) dark++;
        if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1])
          p += 3;
      }
    return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  };
  let best = 0;
  let least = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask);
    format(mask);
    const p = penalty();
    if (p < least) {
      least = p;
      best = mask;
    }
    flip(mask);
  }
  flip(best);
  format(best);
  return m;
}

export function qrSvg(text, { quiet = 4 } = {}) {
  const m = qrMatrix(text);
  const n = m.length;
  const size = n + quiet * 2;
  const NS = 'http://www.w3.org/2000/svg';
  let d = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
  const svg = document.createElementNS(NS, 'svg');
  const bg = document.createElementNS(NS, 'rect');
  const p = document.createElementNS(NS, 'path');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', "Pairing code for a phone's camera");
  bg.setAttribute('width', size);
  bg.setAttribute('height', size);
  bg.setAttribute('fill', '#fff');
  p.setAttribute('d', d);
  p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}
