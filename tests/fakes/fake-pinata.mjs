// fake-pinata.mjs - a TEST DOUBLE for Pinata's API and one of its gateways, on one local port. Nothing here reaches Pinata.
//   GET  /data/testAuthentication     200 for the token "good-test-token", 401 for anything else
//   POST /pinning/pinFileToIPFS       takes the folder as Pinata does (one "file" part for each file, its name carrying the path),
//                                     keeps what it was sent, and answers with a CID made from the content, so the same bundle
//                                     gives the same CID and "isDuplicate" the second time
//   GET  /ipfs/<cid>/<path>           the file that was pinned under that CID, as a gateway would serve it
// startFakePinata(port) -> { pins, calls, close }   pins: [{ cid, name, options, files: [{ path, size }] }]
import http from 'node:http';
import { createHash } from 'node:crypto';

const b32 = (buf) => {
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const x of buf) {
    acc = (acc << 8) | x;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += A[(acc >> bits) & 31];
      acc &= (1 << bits) - 1;
    }
  }
  if (bits) out += A[(acc << (5 - bits)) & 31];
  return 'b' + out;
};
export function startFakePinata(port) {
  const pins = [];
  const calls = [];
  const held = new Map(); // held: cid -> Map(path within the folder -> Buffer)
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization || '';
    calls.push(req.method + ' ' + url.pathname);
    if (url.pathname.startsWith('/ipfs/')) {
      const [cid, ...rest] = url.pathname.slice(6).split('/');
      const f = held.get(cid) && held.get(cid).get(rest.join('/'));
      if (!f) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200);
      return res.end(f);
    }
    if (auth !== 'Bearer good-test-token')
      return json(res, 401, { error: { reason: 'INVALID_CREDENTIALS', details: 'Invalid/expired credentials' } });
    if (req.method === 'GET' && url.pathname === '/data/testAuthentication')
      return json(res, 200, { message: 'Congratulations! You are communicating with the Pinata API!' });
    if (req.method === 'POST' && url.pathname === '/pinning/pinFileToIPFS') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'content-type': req.headers['content-type'] },
      }).formData();
      const files = [];
      const inside = new Map();
      const h = createHash('sha256');
      for (const f of form.getAll('file')) {
        const b = Buffer.from(await f.arrayBuffer());
        files.push({ path: f.name, size: b.length });
        inside.set(f.name.split('/').slice(1).join('/'), b);
      }
      for (const f of files.slice().sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(f.path + ':' + f.size + '\n');
      const cid = b32(Buffer.concat([Buffer.from([1, 0x70, 0x12, 0x20]), h.digest()]));
      const again = held.has(cid);
      held.set(cid, inside);
      pins.push({
        cid,
        name: JSON.parse(form.get('pinataMetadata') || '{}').name || '',
        options: JSON.parse(form.get('pinataOptions') || '{}'),
        files,
      });
      return json(res, 200, {
        IpfsHash: cid,
        PinSize: files.reduce((n, f) => n + f.size, 0),
        Timestamp: new Date().toISOString(),
        isDuplicate: again,
      });
    }
    json(res, 404, { error: 'not found' });
  });
  return new Promise((ok) =>
    server.listen(port, '127.0.0.1', () => ok({ pins, calls, close: () => new Promise((r) => server.close(r)) })),
  );
}
