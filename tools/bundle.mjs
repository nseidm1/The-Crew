// bundle.mjs - writes dist/ from src/: everything the product needs, in one folder, so one address serves all of it.
//   node tools/bundle.mjs
// dist/ is what gets pinned to IPFS or handed to whatever publishes the site. It holds:
//   the pages          what a visitor's browser loads
//   the runner         server.mjs and runner/: the part that runs on the customer's own machine (a web page cannot measure a machine,
//                      install a model or start Claude Code, so that part has to run there)
//   myfamilyoffice.sh  the one command: finds Node.js or fetches a private copy, then hands over to
//   myfamilyoffice.mjs which fetches the app from the site, checks it and starts it
//   android/           the Android app (familyoffice.apk), when it has been built: the Remote tab puts it on a phone over USB
//   manifest.json      every file with its SHA-256: the launcher fetches by this list and refuses anything that does not match it
// The bundle is REFUSED if any page reaches for a root-absolute path, because the same folder has to work at the root of an address
// (name.eth.limo/) and under a subpath (a gateway's /ipfs/<cid>/, github.io/Family-Office/).
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(REPO_ROOT, 'src');
const OUT = path.join(REPO_ROOT, 'dist');
const PAGES = [
  'index.html',
  'start.html',
  'app.html',
  'film.html',
  'reset.html',
  'rsi.html',
  'promise.html',
  'css',
  'js',
];
const RUNNER = ['server.mjs', 'myfamilyoffice.sh', 'myfamilyoffice.mjs', 'package.json', 'runner'];
const NOT_PAGES = /^(?:runner\/|server\.mjs$|myfamilyoffice\.mjs$)/; // these run in Node on the customer's machine, not in a browser: the path rule is not about them
const ABSOLUTE = [
  /(?:src|href)=["']\/(?!\/)/,
  /\bfrom\s+["']\//,
  /\bimport\(\s*["']\//,
  /url\(\s*["']?\/(?!\/)/,
  /location\.(?:href|replace|assign)\s*[=(]\s*["']\//,
];

async function walk(dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const f = path.join(dir, name);
    if ((await stat(f)).isDirectory()) out.push(...(await walk(f)));
    else out.push(f);
  }
  return out;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const f of [...PAGES, ...RUNNER])
  await cp(path.join(ROOT, f), path.join(OUT, f), {
    recursive: true,
    filter: (src) => !/[\\/]runner[\\/]owner\.mjs$/.test(src),
  }); // the owner's panel does not ship
// THE PUBLISHER'S OWN VALUES (.owner/, which git never sees): the plans, the codes, the Client ID and the switches they set go into
// the bundle in place of the source's neutral ones. With no such folder the bundle is the source as it is. FO_NO_OWNER=1 leaves them out.
const OWNER = path.join(REPO_ROOT, '.owner');
const owned = [];
if (process.env.FO_NO_OWNER !== '1')
  for (const name of ['billing.js', 'github.js', 'product.js', 'pulse.js'])
    if (
      await stat(path.join(OWNER, name)).then(
        (s) => s.isFile(),
        () => false,
      )
    ) {
      await cp(path.join(OWNER, name), path.join(OUT, 'js', name));
      owned.push(name);
    }
// the Android app, when it has been built (node src/android/build.mjs): the app itself ships, never its source or its signing key
const APK = path.join(ROOT, 'android', 'familyoffice.apk');
const hasApp = await stat(APK).then(
  (s) => s.isFile(),
  () => false,
);
if (hasApp) {
  await mkdir(path.join(OUT, 'android'), { recursive: true });
  await cp(APK, path.join(OUT, 'android', 'familyoffice.apk'));
}

const files = await walk(OUT);
const bad = [];
const list = [];
let bytes = 0;
for (const f of files) {
  const rel = path.relative(OUT, f).split(path.sep).join('/');
  const buf = await readFile(f);
  bytes += buf.length;
  list.push({ path: rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  if (NOT_PAGES.test(rel) || !/\.(html|css|js|mjs)$/.test(rel)) continue;
  buf
    .toString('utf8')
    .split('\n')
    .forEach((line, i) => {
      if (ABSOLUTE.some((re) => re.test(line))) bad.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 100));
    });
}
if (bad.length) {
  console.error('REFUSED: root-absolute paths would break the site off its own root:\n  ' + bad.join('\n  '));
  await rm(OUT, { recursive: true, force: true });
  process.exit(1);
}
for (const need of [
  'server.mjs',
  'myfamilyoffice.sh',
  'myfamilyoffice.mjs',
  'runner/index.mjs',
  'js/alive.js',
  'start.html',
])
  if (!list.some((f) => f.path === need)) {
    console.error('REFUSED: the bundle is missing ' + need);
    process.exit(1);
  }
// the version is the content: the same files always give the same version, and so the same manifest and the same IPFS address
const version = createHash('sha256')
  .update(list.map((f) => f.path + ':' + f.sha256).join('\n'))
  .digest('hex')
  .slice(0, 12);
await writeFile(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ app: 'familyoffice', version, files: list }, null, 1),
);
await writeFile(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve the folder as it is
console.log(
  'dist/: ' +
    (list.length + 1) +
    ' files, ' +
    Math.round(bytes / 1024) +
    ' KB, version ' +
    version +
    ', pages and runner' +
    (hasApp ? ' and the Android app' : ' (no Android app: it has not been built)') +
    ', no root-absolute paths' +
    (owned.length ? ", with the publisher's own " + owned.join(', ') : ''),
);
