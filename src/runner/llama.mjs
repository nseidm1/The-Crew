// llama.mjs - LLAMA.CPP AS A TEAM'S ENGINE: the last rung of the engine waterfall (js/catalog.js: LLAMA, LLAMA_MODELS).
// TensorFold needs an Apple silicon Mac with a current macOS, and Strata needs a Linux machine with a lot of memory. A machine that is
// neither (an Intel Mac, a Linux machine with little memory or no graphics card, an Apple silicon Mac whose macOS is too old) still
// gets a team with a local model: a small one, run by llama.cpp on its processor.
//   ensureLlamaEngine({ stateDir, arch, signal, onBytes })   the engine: one already on the machine, or this app's own pinned build
//   haveLlamaModel(stateDir, m)                             is the model's file already here, whole
//   fetchLlamaModel(m, { stateDir, signal, onBytes })       the model's one file, from Hugging Face at a pinned revision
//   serveLlama(m, e, { stateDir, onLine })                  serve it on 127.0.0.1 on a free port, and wait until it answers
// THE ENGINE IS NEVER INSTALLED OVER ANYTHING. A "llama" command already on the machine is used when it is new enough. Otherwise
// llama.cpp's own build for this machine is fetched from its GitHub release at a PINNED tag, kept only if its SHA-256 is the one in the
// catalog, and unpacked into this app's own folder. No Homebrew, no compiler, no password.
// THE MODEL IS ONE FILE, kept only if its SHA-256 is the one its Hugging Face page lists. A download that stops carries on.
// The server is this runner's child (engine.mjs: adoptEngine), so stopping the team, or the runner, stops it.
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chmod, mkdir, rm, stat } from 'node:fs/promises';
import { LLAMA, SERVED_NAME, llamaBuild } from '../js/catalog.js';
import { atLeast, findLlamaEngine, llamaDir, sh, PLATFORM } from './host.mjs';
import { adoptEngine, alive, stopEngine } from './engine.mjs';
import { download, versionOf } from './eyes.mjs';

export const LLAMA_CONTEXT = 16384; // the context the model is served with; the agent is told it, so it asks for no more than fits
const HF = () => (process.env.FO_HF_BASE || 'https://huggingface.co').replace(/\/$/, '');
const freePort = () =>
  new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
// a test names its own small engine build and its own small model files (FO_LLAMA_RELEASE, FO_LLAMA_FILES): the real ones are only
// ever fetched because a customer pressed the button
const releaseOf = (arch) => {
  try {
    const t = JSON.parse(process.env.FO_LLAMA_RELEASE || 'null');
    if (t && t.url) return t;
  } catch {
    /* the catalog's */
  }
  const b = llamaBuild(PLATFORM, arch);
  return b ? { ...b, url: LLAMA.site + '/releases/download/' + LLAMA.tag + '/' + b.asset } : null;
};
const fileOf = (m) => {
  try {
    const t = JSON.parse(process.env.FO_LLAMA_FILES || 'null');
    if (t && t[m.id]) return { url: HF() + '/' + m.repo + '/resolve/' + m.rev + '/' + m.file, ...t[m.id] };
  } catch {
    /* the catalog's */
  }
  return { url: HF() + '/' + m.repo + '/resolve/' + m.rev + '/' + m.file, bytes: m.bytes, sha256: m.sha256 };
};
export const llamaModelPath = (stateDir, m) => path.join(stateDir, 'models', m.id, m.file);
export async function haveLlamaModel(stateDir, m) {
  const s = await stat(llamaModelPath(stateDir, m)).catch(() => null);
  return !!s && s.size === fileOf(m).bytes;
} // it only gets this name once its SHA-256 has matched
const enough = (ver) => (ver.v ? atLeast(ver.v, LLAMA.min) : ver.build ? ver.build >= LLAMA.minBuild : null); // null: it does not say, so it is tried

export async function ensureLlamaEngine({ stateDir, arch, signal, onBytes = () => {} }) {
  let engine = await findLlamaEngine(stateDir);
  let ver = engine ? await versionOf(engine) : null;
  if (engine && (engine.own || enough(ver) !== false))
    return {
      ok: true,
      e: engine,
      ver: ver.text ? ver : { ...ver, text: engine.own ? LLAMA.tag : 'installed' },
      already: true,
    };
  const old = engine ? ver.text || 'an older build' : ''; // one on the machine that is too old is left exactly as it is: this app's own copy goes beside it
  const rel = releaseOf(arch);
  if (!rel)
    return { ok: false, why: LLAMA.name + ' publishes no build for this machine (' + PLATFORM + ' on ' + arch + ').' };
  if (process.env.FO_NO_NET === '1' && !process.env.FO_LLAMA_RELEASE)
    return { ok: false, why: 'this machine is not using the network, so ' + LLAMA.name + ' was not fetched' }; // a test run never reaches the real release
  const dir = llamaDir(stateDir);
  const tgz = path.join(dir, 'release.tar.gz');
  await mkdir(dir, { recursive: true });
  const got = await download({
    url: rel.url,
    dest: tgz,
    bytes: rel.bytes,
    sha: rel.sha256,
    label: LLAMA.name,
    signal,
    onBytes,
  });
  if (!got.ok) return got;
  const un = await sh('tar', ['-xzf', tgz, '-C', dir], { timeout: 120000 });
  if (!un.ok)
    return { ok: false, why: LLAMA.name + ' could not be unpacked: ' + un.err.split('\n').pop().slice(0, 160) };
  engine = await findLlamaEngine(stateDir, { own: true });
  if (!engine)
    return { ok: false, why: 'The ' + LLAMA.name + ' build was unpacked, but it holds no llama-server command.' };
  await chmod(engine.file, 0o755).catch(() => {});
  await rm(tgz, { force: true }).catch(() => {});
  ver = await versionOf(engine);
  return { ok: true, e: engine, ver: ver.text ? ver : { ...ver, text: LLAMA.tag }, already: false, beside: old };
}

export async function fetchLlamaModel(m, { stateDir, signal, onBytes = () => {} }) {
  if (process.env.FO_NO_NET === '1' && !process.env.FO_HF_BASE)
    return { ok: false, why: 'this machine is not using the network, so ' + m.name + ' was not fetched' }; // a test run never reaches the real Hugging Face
  const f = fileOf(m);
  const dest = llamaModelPath(stateDir, m);
  await mkdir(path.dirname(dest), { recursive: true });
  return download({ url: f.url, dest, bytes: f.bytes, sha: f.sha256, label: m.name, signal, onBytes });
}

// start the server and wait until it answers. While the model is still being read into memory llama.cpp answers "loading", so a reply
// that is not an error means it is ready. One request at a time (-np 1): the whole context belongs to whoever is speaking.
export async function serveLlama(m, e, { stateDir, onLine = () => {}, waitMs = 10 * 60000 } = {}) {
  stopEngine();
  const port = await freePort();
  const tail = [];
  const startedAt = Date.now();
  const args = [
    ...e.pre,
    '-m',
    llamaModelPath(stateDir, m),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '-a',
    SERVED_NAME,
    '-c',
    String(LLAMA_CONTEXT),
    '-np',
    '1',
  ];
  let exited = null;
  const child = spawn(e.file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  adoptEngine(child);
  const take = (c) =>
    String(c)
      .split(/[\r\n]+/)
      .forEach((raw) => {
        const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
        if (!line) return;
        tail.push(line);
        if (tail.length > 12) tail.shift();
        onLine(line);
      });
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', (err) => {
    exited = { code: -1, why: err.message };
  });
  child.on('close', (code) => {
    if (!exited) exited = { code };
  });
  while (!exited && Date.now() - startedAt < waitMs) {
    if (await alive(port))
      return {
        ok: true,
        port,
        pid: child.pid,
        base: 'http://127.0.0.1:' + port,
        args: args.join(' '),
        loadMs: Date.now() - startedAt,
      };
    await new Promise((r) => setTimeout(r, 700));
  }
  stopEngine();
  return {
    ok: false,
    why: exited
      ? 'the model server stopped (exit ' + exited.code + '): ' + (exited.why || tail.slice(-3).join(' / '))
      : 'the model server did not answer within ' + Math.round(waitMs / 60000) + ' minutes',
  };
}
