// sites.mjs - A WEBSITE THE TEAM MADE, SERVED ON THIS COMPUTER so that it can be opened and looked at. Someone new asks for a
// website; the team makes it; and instead of being told to "run a local server", they are given an address to press.
// It is a small server INSIDE this app: there is no second program to be left running when the app goes, so nothing is orphaned.
// It serves the files of one folder and nothing else:
//   - only to this computer (it listens on 127.0.0.1, and refuses a request that names any other host)
//   - only to be read (GET and HEAD), with no listing of a folder
//   - nothing hidden (no path with a part that begins with a dot: not .git, not .env), and nothing outside the folder
// One site at a time (the workspace's). It is stopped when it is asked to be, when the team is stopped, when the workspace is
// disconnected, and by itself when nobody has opened it for a while; and it remembers the last few that stopped, and why, so that
// the chat can say so.
//   createSites() -> { start(dir, name) -> { ok, site } | { ok: false, why },  stop(id),  stopAll(why),  list() -> [site] }
//   site: { id, name, url, port, online, at, hits, last, why }
import http from 'node:http';
import path from 'node:path';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};
const ROOTS = ['', 'public', 'dist', 'build', 'docs', 'site', 'www', 'web', 'out'];
// where the pages are: the folder itself, or the first of the usual places that holds an index.html
export async function webRoot(dir) {
  for (const r of ROOTS) {
    if (
      await access(path.join(dir, r, 'index.html')).then(
        () => true,
        () => false,
      )
    )
      return path.join(dir, r);
  }
  return null;
}

export function createSites({ idleMs = Number(process.env.FO_SITE_IDLE_MS) || 45 * 60000 } = {}) {
  const live = new Map();
  const gone = [];
  const view = (s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    port: s.port,
    online: s.server.listening,
    at: s.at,
    hits: s.hits,
    last: s.last,
    why: '',
  });
  const stop = (id, why = 'it was stopped') =>
    new Promise((done) => {
      const s = live.get(id);
      if (!s) return done(false);
      live.delete(id);
      clearInterval(s.timer);
      gone.unshift({
        id,
        name: s.name,
        url: s.url,
        port: s.port,
        online: false,
        at: s.at,
        hits: s.hits,
        last: s.last,
        why,
      });
      gone.length = Math.min(gone.length, 8);
      s.server.close(() => done(true));
      if (s.server.closeAllConnections) s.server.closeAllConnections();
    });
  async function start(dir, name) {
    const found = await webRoot(dir);
    if (!found) return { ok: false, why: 'There is no page to open yet: the workspace has no index.html.' };
    const root = await realpath(found);
    for (const s of live.values()) if (s.root === root) return { ok: true, site: view(s), already: true };
    for (const id of [...live.keys()]) await stop(id, 'another site took its place');
    const id = randomBytes(5).toString('hex');
    const site = { id, root, name: String(name || path.basename(dir)).slice(0, 80), at: Date.now(), hits: 0, last: 0 };
    site.server = http.createServer(async (req, res) => {
      const say = (code, text) => {
        res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end(text);
      };
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(req.headers.host || '')))
        return say(403, 'This page is served to this computer only.');
      if (req.method !== 'GET' && req.method !== 'HEAD') return say(405, 'This page can only be read.');
      let rel;
      try {
        rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      } catch {
        return say(400, 'That address cannot be read.');
      }
      if (rel.includes('\0') || rel.split(/[\\/]/).some((part) => part.startsWith('.'))) return say(404, 'Not found');
      try {
        let file = path.join(root, rel);
        let st = await stat(file);
        if (st.isDirectory()) {
          file = path.join(file, 'index.html');
          st = await stat(file);
        }
        const real = await realpath(file);
        if (real !== root && !real.startsWith(root + path.sep)) return say(404, 'Not found'); // a link out of the folder is not followed
        const body = await readFile(real);
        site.hits++;
        site.last = Date.now();
        res.writeHead(200, {
          'content-type': TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream',
          'content-length': body.length,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        say(404, 'Not found');
      }
    });
    await new Promise((ok, no) => {
      site.server.once('error', no);
      site.server.listen(0, '127.0.0.1', ok);
    });
    site.port = site.server.address().port;
    site.url = 'http://localhost:' + site.port + '/';
    site.timer = setInterval(
      () => {
        if (Date.now() - Math.max(site.at, site.last) > idleMs) stop(id, 'nobody had opened it for a while');
      },
      Math.min(60000, Math.max(500, idleMs / 4)),
    );
    if (site.timer.unref) site.timer.unref();
    live.set(id, site);
    return { ok: true, site: view(site) };
  }
  return {
    start,
    stop,
    stopAll: async (why = 'the team was stopped') => {
      for (const id of [...live.keys()]) await stop(id, why);
    },
    list: () => [...[...live.values()].map(view), ...gone],
  };
}
