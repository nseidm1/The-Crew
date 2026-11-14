// gateway.mjs - stands in for the hosted site while testing: it serves dist/ and NOTHING else, the way an IPFS gateway or a .eth
// address would. No /api/, no runner. Use it to try the whole path a customer takes:
//   node tools/bundle.mjs && node tools/gateway.mjs        then open http://localhost:5300/ and press Start
// (Opening dist/index.html straight from the disk does not work as a test: browsers refuse module scripts and fetch on file:// pages.)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(REPO_ROOT, 'dist');
const PORT = Number(process.env.PORT) || 5300;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
http
  .createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT + path.sep) || !(await stat(file)).isFile()) throw new Error('no');
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  })
  .listen(PORT, '127.0.0.1', () =>
    console.log(
      'The hosted site, as a gateway would serve it:\n  http://myfamilyoffice.localhost:' +
        PORT +
        '/   (Chrome, Firefox, Edge: a name of its own, so the page behaves exactly as it will when hosted)\n  http://localhost:' +
        PORT +
        '/                  (any browser)',
    ),
  );

// THE OWNER'S PANEL rides along. This stand-in is an owner's tool, so it also starts the app from its source on port 5220, which is the
// only place the owner's panel exists. The admin on the stand-in site shows an "Owner" button while it is up. (Only on the default
// port: a script that starts a stand-in on another port for a test gets just the site.)
if (PORT === 5300 && process.env.GATEWAY_NO_OWNER !== '1') {
  const OP = Number(process.env.OWNER_PORT) || 5220;
  const own = spawn(process.execPath, [path.join(REPO_ROOT, 'src', 'server.mjs')], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(OP), FO_KEEP: '1', FO_OWNER_DIR: path.join(REPO_ROOT, '.owner') },
  });
  const end = () => {
    try {
      own.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  };
  process.on('exit', end);
  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => {
      end();
      process.exit(0);
    });
  setTimeout(
    () =>
      console.log("The owner's panel (codes, locks, billing, the bundle):\n  http://127.0.0.1:" + OP + '/owner.html'),
    600,
  );
}
