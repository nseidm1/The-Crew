// node.mjs - the npm the agent is installed with, and a private Node.js for this app when the machine's own cannot do the job.
// Pi is installed with npm. A Node.js can be on a machine without its npm sitting where it is expected (Homebrew keeps it under
// libexec, some installs ship none), so npm is looked for in every place it is known to live. When there is none at all, or no Node.js
// new enough, the customer is offered ONE button: fetch Node's own build from nodejs.org into this app's folder, checked against the
// checksum Node publishes, used by this app only. Nothing else on the machine changes. (The checksum comes from the same server as the
// download: it catches a broken or cut-off download, not a compromised nodejs.org.)
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { machineArch } from './host.mjs';

const has = (f) =>
  access(f).then(
    () => true,
    () => false,
  );
// Node's Windows build keeps node.exe and npm at the top of its folder; everywhere else they are under bin/ and lib/
const WIN = process.platform === 'win32';
export const privateNode = (stateDir) =>
  WIN ? path.join(stateDir, 'node', 'node.exe') : path.join(stateDir, 'node', 'bin', 'node');
export const privateNpm = (stateDir) =>
  WIN
    ? path.join(stateDir, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(stateDir, 'node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

// the npm-cli.js that goes with a node binary, wherever that install keeps it
export async function findNpm(nodeBin) {
  if (process.env.FO_NPM_CLI) return (await has(process.env.FO_NPM_CLI)) ? process.env.FO_NPM_CLI : null; // a test names the only place to look
  const dirs = new Set([path.dirname(nodeBin)]);
  try {
    dirs.add(path.dirname(await realpath(nodeBin)));
  } catch {
    /* not a link */
  }
  const tries = [];
  for (const d of dirs)
    tries.push(
      path.join(d, '../lib/node_modules/npm/bin/npm-cli.js'),
      path.join(d, 'node_modules/npm/bin/npm-cli.js'), // Windows: beside node.exe
      path.join(d, '../libexec/lib/node_modules/npm/bin/npm-cli.js'),
    ); // the usual place; Homebrew's
  tries.push('/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', '/usr/local/lib/node_modules/npm/bin/npm-cli.js');
  for (const t of tries) if (await has(t)) return path.normalize(t);
  return null;
}

// Node's own build, into <stateDir>/node. Resolves { ok, node, npmCli } or { ok: false, why }.
export async function fetchNode(stateDir, onLine = () => {}) {
  const os = { darwin: 'darwin', linux: 'linux', win32: 'win' }[process.platform];
  const ext = WIN ? 'zip' : 'tar.gz';
  const arch = { arm64: 'arm64', x64: 'x64' }[await machineArch()]; // the build for the machine's chip, not for whichever Node is asking
  if (!os || !arch)
    return {
      ok: false,
      why: 'Node has no build this app knows for this system. Install Node.js 22 from nodejs.org, then continue.',
    };
  const dist = process.env.FO_NODE_DIST || 'https://nodejs.org/dist/latest-v22.x';
  const tmp = path.join(stateDir, 'node.tmp');
  const dest = path.join(stateDir, 'node');
  try {
    onLine("Reading Node's list of builds");
    const sums = await (await fetch(dist + '/SHASUMS256.txt', { signal: AbortSignal.timeout(30000) })).text();
    const line = sums
      .split('\n')
      .find((l) =>
        new RegExp(' node-v[0-9.]+-' + os + '-' + arch + '\\.' + ext.replace('.', '\\.') + '$').test(l.trim()),
      );
    if (!line) return { ok: false, why: "Node's list has no build for " + os + ' ' + arch + '.' };
    const [want, name] = line.trim().split(/\s+/);
    const res = await fetch(dist + '/' + name, { signal: AbortSignal.timeout(10 * 60000) });
    if (!res.ok) return { ok: false, why: 'The Node.js download answered ' + res.status + '.' };
    const total = Number(res.headers.get('content-length')) || 0;
    const parts = [];
    let got = 0;
    let said = 0;
    for await (const chunk of res.body) {
      parts.push(chunk);
      got += chunk.length;
      if (Date.now() - said > 400) {
        said = Date.now();
        onLine(
          'Fetching ' +
            name +
            ': ' +
            (got / 1048576).toFixed(0) +
            (total ? ' of ' + (total / 1048576).toFixed(0) : '') +
            ' MB',
        );
      }
    }
    const buf = Buffer.concat(parts);
    if (createHash('sha256').update(buf).digest('hex') !== want)
      return {
        ok: false,
        why: "The Node.js download does not match Node's published checksum. Nothing was installed.",
      };
    await rm(tmp, { recursive: true, force: true });
    await mkdir(path.join(tmp, 'out'), { recursive: true });
    await writeFile(path.join(tmp, name), buf);
    onLine('Unpacking ' + name);
    const code = await new Promise((done) => {
      const c = spawn(
        'tar',
        [WIN ? '-xf' : '-xzf', path.join(tmp, name), '-C', path.join(tmp, 'out'), '--strip-components', '1'],
        {
          stdio: 'ignore',
        },
      );
      c.on('error', () => done(-1));
      c.on('close', done);
    });
    if (code !== 0) return { ok: false, why: 'The Node.js download could not be unpacked.' };
    await rm(dest, { recursive: true, force: true });
    await rename(path.join(tmp, 'out'), dest);
    await rm(tmp, { recursive: true, force: true });
    const node = privateNode(stateDir);
    const npmCli = privateNpm(stateDir);
    if (!(await has(node)) || !(await has(npmCli)))
      return { ok: false, why: 'The fetched Node.js is missing its npm.' };
    return { ok: true, node, npmCli, name };
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    return { ok: false, why: 'Node.js could not be fetched: ' + String((e && e.message) || e).slice(0, 160) };
  }
}
// what the setup card offers when npm, or a Node.js new enough, is missing
export const nodeFix = (what) => ({
  kind: 'node',
  title: 'This machine needs a Node.js that can install the agent',
  text: what,
  steps: [
    "Press the button. A private copy of Node.js is fetched from nodejs.org into this app's own folder and checked against the checksum Node publishes.",
    'It is used by this app only: no password, and nothing else on the machine is changed.',
    'Setup then carries on from this step. What is already done stays done.',
  ],
  actions: [{ id: 'node-fetch', label: 'Fetch Node.js for this app and continue' }],
  link: null,
  code: false,
});
