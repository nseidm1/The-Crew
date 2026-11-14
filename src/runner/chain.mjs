// chain.mjs - the little of Ethereum the licence check needs, with no dependency and no key of ours anywhere:
//   keccak256            the hash Ethereum uses (not the SHA-3 that Node ships), for function selectors, addresses and signed messages
//   recover              who signed a message (secp256k1 public-key recovery): a wallet proves it is the customer's WITHOUT a transaction
//   call                 read a contract through public RPC endpoints (eth_call). Nothing here can send a transaction or hold funds.
// Selectors are derived from the function's signature by keccak256 here, never typed in by hand. The self-test pins keccak256 and the
// curve arithmetic against known answers and against Node's own secp256k1.
const M = (1n << 64n) - 1n;
const rot = (x, n) => (n === 0n ? x : ((x << n) | (x >> (64n - n))) & M);
const RC = [
  0x1n,
  0x8082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x808bn,
  0x80000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x8an,
  0x88n,
  0x80008009n,
  0x8000000an,
  0x8000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x80000001n,
  0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14].map(BigInt);
function f1600(s) {
  for (let r = 0; r < 24; r++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rot(c[(x + 1) % 5], 1n);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    const b = new Array(25);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rot(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        s[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & M & b[((x + 2) % 5) + 5 * y]);
    s[0] ^= RC[r];
  }
}
export function keccak256(input) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const rate = 136;
  const len = Math.ceil((data.length + 1) / rate) * rate;
  const p = Buffer.alloc(len);
  data.copy(p);
  p[data.length] ^= 0x01;
  p[len - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let o = 0; o < len; o += rate) {
    for (let i = 0; i < rate / 8; i++) s[i] ^= p.readBigUInt64LE(o + i * 8);
    f1600(s);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(s[i], i * 8);
  return out;
}

// ---------- secp256k1, just enough to find out who signed ----------
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
];
const mod = (a, m) => ((a % m) + m) % m;
const pow = (b, e, m) => {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
};
const inv = (a, m) => pow(a, m - 2n, m);
const add = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  if (a[0] === b[0]) {
    if (mod(a[1] + b[1], P) === 0n) return null;
    const l = mod(3n * a[0] * a[0] * inv(2n * a[1], P), P);
    const x = mod(l * l - 2n * a[0], P);
    return [x, mod(l * (a[0] - x) - a[1], P)];
  }
  const l = mod((b[1] - a[1]) * inv(b[0] - a[0], P), P);
  const x = mod(l * l - a[0] - b[0], P);
  return [x, mod(l * (a[0] - x) - a[1], P)];
};
const mul = (k, pt) => {
  let r = null;
  let q = pt;
  k = mod(k, N);
  while (k > 0n) {
    if (k & 1n) r = add(r, q);
    q = add(q, q);
    k >>= 1n;
  }
  return r;
};
const big = (buf) => BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'));
const b32 = (x) => Buffer.from(x.toString(16).padStart(64, '0'), 'hex');
export const publicOf = (priv) => {
  const q = mul(big(priv), G);
  return Buffer.concat([b32(q[0]), b32(q[1])]);
};
export const addressOf = (pub64) => '0x' + keccak256(pub64).subarray(12).toString('hex');
export const personalHash = (message) =>
  keccak256(
    Buffer.concat([Buffer.from('\x19Ethereum Signed Message:\n' + Buffer.byteLength(message)), Buffer.from(message)]),
  );
// the address that made this 65-byte signature (r, s, v) over this 32-byte hash, or null if it is not a signature
export function recover(hash, sig) {
  try {
    const s = Buffer.from(String(sig).replace(/^0x/, ''), 'hex');
    if (s.length !== 65) return null;
    const r = big(s.subarray(0, 32));
    const ss = big(s.subarray(32, 64));
    const v = s[64] < 27 ? s[64] + 27 : s[64];
    const z = big(hash);
    if (r <= 0n || r >= N || ss <= 0n || ss >= N || (v !== 27 && v !== 28)) return null;
    let y = pow(mod(r * r * r + 7n, P), (P + 1n) / 4n, P);
    if (mod(y * y, P) !== mod(r * r * r + 7n, P)) return null;
    if (Number(y & 1n) !== v - 27) y = P - y;
    const ri = inv(r, N);
    const q = add(mul(mod(-z * ri, N), G), mul(mod(ss * ri, N), [r, y]));
    return q ? addressOf(Buffer.concat([b32(q[0]), b32(q[1])])) : null;
  } catch {
    return null;
  }
}
// for the self-test only: sign a hash with a private key the test made up (a customer's wallet does this, never this app)
export function signForTest(hash, priv) {
  const d = big(priv);
  const z = big(hash);
  for (let i = 1n; ; i++) {
    const k = mod(big(keccak256(Buffer.concat([Buffer.from(priv), Buffer.from(hash), b32(i)]))), N);
    if (k === 0n) continue;
    const R = mul(k, G);
    const r = mod(R[0], N);
    if (r === 0n) continue;
    let s = mod(inv(k, N) * (z + r * d), N);
    let v = 27 + Number(R[1] & 1n);
    if (s === 0n) continue;
    if (s > N / 2n) {
      s = N - s;
      v = v === 27 ? 28 : 27;
    }
    return '0x' + b32(r).toString('hex') + b32(s).toString('hex') + v.toString(16);
  }
}

// ---------- reading a contract ----------
export const selector = (signature) => keccak256(signature).subarray(0, 4).toString('hex'); // derived, never hand-typed
const word = (v) =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)
    ? v.slice(2).toLowerCase().padStart(64, '0')
    : BigInt(v).toString(16).padStart(64, '0');
export const encode = (signature, ...args) => '0x' + selector(signature) + args.map(word).join('');
export const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
// eth_call against the first endpoint that answers. Resolves the result hex, or throws when none of them can be reached.
export async function call(rpcs, to, data, ms = 6000) {
  let last = 'no endpoint';
  for (const url of rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
        signal: AbortSignal.timeout(ms),
      });
      const j = await r.json();
      if (j && typeof j.result === 'string') return j.result;
      last = (j && j.error && j.error.message) || 'no result';
      if (j && j.error && /revert/i.test(last)) throw Object.assign(new Error(last), { reverted: true });
    } catch (e) {
      if (e.reverted) throw e;
      last = String(e.message || e);
    }
  }
  throw Object.assign(new Error('the chain could not be read: ' + last), { offline: true });
}
export const uint = (hex) => BigInt(hex && hex !== '0x' ? hex : '0x0');
