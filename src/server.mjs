// server.mjs - the customer product on this machine: the pages, and the local runner behind Start. Loopback only, zero dependencies.
//   node src/server.mjs            http://127.0.0.1:5210/
//   PORT=6000 node src/server.mjs
// Pages come from THIS folder only. /api/ goes to runner/index.mjs, which measures this machine, installs and serves a local model with
// TensorFold, and runs Pi against it - each only after the customer presses the button that says what will happen.
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner } from './runner/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5210;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const PRIVATE = /^\/(?:runner|dist|android)(?:\/|$)|\/\./; // the runner's code and state, the bundle, the Android app's folder and any dotfile are never served as pages
// THE PUBLISHER'S OWN VALUES (FO_OWNER_DIR). The plans in force, the access codes and the GitHub Client ID are set by whoever publishes
// the app, on the owner's panel, and are theirs, not the repository's: the source carries neutral ones and theirs live in a folder
// git never sees. Run from source with that folder named, its files stand in for the source's own, for the pages and for the runner.
const OWNER_DIR = process.env.FO_OWNER_DIR ? path.resolve(process.env.FO_OWNER_DIR) : '';
const OWNED = {};
for (const [name, key] of [
  ['billing.js', 'FO_BILLING_FILE'],
  ['github.js', 'FO_GITHUB_FILE'],
  ['product.js', 'FO_PRODUCT_FILE'],
  ['pulse.js', 'FO_PULSE_FILE'],
]) {
  const file = OWNER_DIR ? path.join(OWNER_DIR, name) : '';
  if (!file || !existsSync(file)) continue;
  if (!process.env[key]) process.env[key] = file;
  OWNED['/js/' + name] = file;
}
if (OWNED['/js/github.js'] && !process.env.FO_GITHUB_CLIENT) {
  const id = /clientId:\s*'([^']*)'/.exec(readFileSync(OWNED['/js/github.js'], 'utf8'));
  if (id && id[1]) process.env.FO_GITHUB_CLIENT = id[1];
}
const runner = createRunner({ root: ROOT, port: PORT });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await runner(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    let p = decodeURIComponent(url.pathname);
    if (PRIVATE.test(p)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    if (p.endsWith('/')) p += 'index.html';
    if (!path.extname(p)) p += '.html';
    // a check's own copy of what this version shows: named by whoever started the server, never by a request
    const owned =
      OWNED[p] ||
      (process.env.FO_PRODUCT_FILE && p === '/js/product.js' ? path.resolve(process.env.FO_PRODUCT_FILE) : '');
    const own = !!owned;
    const file = own ? owned : path.join(ROOT, path.normalize(p));
    if (!own && file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end();
    } // never above this folder
    if (
      p === '/manifest.json' &&
      !(await stat(file).then(
        (s) => s.isFile(),
        () => false,
      ))
    ) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
      return res.end('{ "app": "familyoffice", "version": null, "files": [] }');
    } // run from source: there is no bundle to have a version
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
server.listen(PORT, '127.0.0.1', () => {
  if (process.env.FO_LAUNCHED !== '1')
    console.log('App:    http://127.0.0.1:' + PORT + '/\nOwner:  http://127.0.0.1:' + PORT + '/owner.html');
}); // started by the launcher, it says where the app shows itself
