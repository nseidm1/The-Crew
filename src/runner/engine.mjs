// engine.mjs - TensorFold on this machine: install it, fetch a model, serve it, measure it. Every command is TensorFold's own documented
// one (README: brew install, tensorfold pull, tensorfold serve, the OpenAI-compatible /v1 API). Nothing here runs until the customer
// has pressed the button that says what will be installed.
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { ENGINE, SERVED_NAME } from '../js/catalog.js';
import { sh, bin, engineHome, native, TRANSLATED } from './host.mjs';
import { brewDo, canOwnBrew, ensureBrew } from './brew.mjs';

const exists = (f) =>
  access(f).then(
    () => true,
    () => false,
  );

// run a command, hand every output line to onLine, resolve with the exit code and the last lines (for an honest failure message)
// every child a setup starts, so Cancel can end them all
const LIVE = new Set();
export const track = (c) => {
  LIVE.add(c);
  c.on('close', () => LIVE.delete(c));
  return c;
};
export const killAll = () => {
  for (const c of LIVE) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
};

export function run(cmd, args, { onLine = () => {}, env, cwd, timeout = 0, onChild } = {}) {
  return new Promise((ok) => {
    const tail = [];
    const child = track(spawn(cmd, args, { env: env || process.env, cwd, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (onChild) onChild(child);
    let timer = null;
    let buf = '';
    const take = (chunk) => {
      buf += String(chunk);
      const parts = buf.split(/[\r\n]+/);
      buf = parts.pop();
      for (const raw of parts) {
        const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
        if (!line) continue;
        tail.push(line);
        if (tail.length > 12) tail.shift();
        onLine(line);
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    if (timeout)
      timer = setTimeout(() => {
        tail.push('stopped: it ran past ' + Math.round(timeout / 1000) + ' s');
        child.kill('SIGKILL');
      }, timeout);
    child.on('error', (e) => {
      clearTimeout(timer);
      ok({ code: -1, tail: [...tail, String(e.message)] });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim()) tail.push(buf.trim());
      ok({ code: code == null ? -1 : code, tail });
    });
  });
}

// AN ENGINE COMMAND, RUN FOR THE MACHINE'S OWN CHIP (host.mjs: native()). Under an Intel Node on an Apple silicon Mac that is through
// macOS's arch; anywhere else it is the command itself. If the program turns out to have no build for the chip (macOS says "Bad CPU
// type"), it is run the plain way instead: a step back, never a dead end.
export async function runNative(cmd, args, opts = {}) {
  const [c, a] = native(cmd, args);
  const r = await run(c, a, opts);
  return TRANSLATED && r.code !== 0 && /Bad CPU type|arch: /i.test(r.tail.join(' ')) ? run(cmd, args, opts) : r;
}

// ---------- sizes: what a model really weighs, read from Hugging Face (a listing, not a download) ----------
const hubDir = () =>
  process.env.HF_HUB_CACHE || path.join(process.env.HF_HOME || path.join(os.homedir(), '.cache/huggingface'), 'hub');
export const cacheDirOf = (repo) => path.join(hubDir(), 'models--' + repo.replace(/\//g, '--'));
export async function sizeOf(model) {
  if (process.env.FO_NO_NET === '1') return null;
  let bytes = 0;
  for (const repo of [model.repo, model.drafter].filter(Boolean)) {
    const rev = repo === model.repo && model.rev ? model.rev : 'main';
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch('https://huggingface.co/api/models/' + repo + '/tree/' + rev + '?recursive=true', {
        signal: ctl.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      for (const f of await res.json())
        if (f && f.type === 'file') bytes += Number((f.lfs && f.lfs.size) || f.size || 0);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return bytes > 0 ? { bytes, gb: Math.round((bytes / 2 ** 30) * 10) / 10 } : null;
}
export async function cachedBytes(model) {
  let kb = 0;
  for (const repo of [model.repo, model.drafter].filter(Boolean)) {
    const dir = cacheDirOf(repo);
    if (!(await exists(dir))) continue;
    const r = await sh('du', ['-sk', dir], { timeout: 20000 });
    kb += Number(r.out.split(/\s+/)[0]) || 0;
  }
  return kb * 1024;
}

// ---------- install ----------
// What the customer is told when a route is closed: what is wrong, what to do, and which buttons can help. Nothing here needs a password.
const cltFix = (need, installed) => ({
  kind: 'clt',
  need: need || null,
  title: installed ? "Apple's Command Line Tools need updating" : "Apple's Command Line Tools are not installed",
  text:
    'Homebrew builds TensorFold on this Mac, and macOS will not let it build without ' +
    (need ? 'the Command Line Tools for Xcode ' + need : 'current Command Line Tools') +
    '. They are a free download from Apple and need no Apple developer account for Software Update.',
  steps: [
    installed
      ? 'Open Software Update and install "Command Line Tools for Xcode" if it is offered.'
      : 'Press "Ask macOS to install them" and accept Apple\'s prompt.',
    'If Software Update offers nothing, download "Command Line Tools for Xcode' +
      (need ? ' ' + need : '') +
      '" from developer.apple.com/download/all and open the installer.',
    'Come back here and press Try again. Setup carries on from this step.',
  ],
  actions: [
    installed
      ? { id: 'software-update', label: 'Open Software Update' }
      : { id: 'clt-install', label: 'Ask macOS to install them' },
  ],
  link: { href: 'https://developer.apple.com/download/all/', label: "Apple's downloads page" },
});
const routeFix = () => ({
  kind: 'route',
  title: 'TensorFold needs one of two things to install',
  text: 'Its own installer checks a signature that the OpenSSL shipped with macOS cannot verify, and the other way in is Homebrew.',
  steps: [
    'Setup tries to fetch its own copy of Homebrew when there is none. If that could not be done here, install Homebrew from brew.sh, then run: brew install openssl@3',
    'Or download the TensorFold app from tensorfold.dev (Download for Mac).',
    'Come back here and press Try again.',
  ],
  actions: [],
  link: { href: ENGINE.site, label: 'tensorfold.dev' },
});
// which way in this machine can take, decided BEFORE anything runs, so the page can say it
export function installRoute(tools) {
  if (tools.engine) return { route: 'have' };
  if (tools.openssl3) return { route: 'signed' };
  if (tools.brew)
    return tools.clt && !tools.clt.installed ? { route: 'none', fix: cltFix(null, false) } : { route: 'brew' };
  // no Homebrew here: this app fetches its own copy (brew.mjs), which builds on this machine and so needs Apple's build tools too
  if (canOwnBrew())
    return tools.clt && !tools.clt.installed ? { route: 'none', fix: cltFix(null, false) } : { route: 'own' };
  return { route: 'none', fix: routeFix() };
}
export async function installSigned({ onLine, stateDir }) {
  let script = process.env.FO_INSTALL_SH;
  if (!script) {
    if (process.env.FO_NO_NET === '1') return { ok: false, why: 'the installer could not be fetched (offline)' };
    try {
      const res = await fetch(ENGINE.site + '/install.sh');
      if (!res.ok) throw new Error('status ' + res.status);
      script = path.join(stateDir, 'tensorfold-install.sh');
      await mkdir(stateDir, { recursive: true });
      await writeFile(script, await res.text());
    } catch (err) {
      return { ok: false, why: 'the installer could not be fetched: ' + String(err.message).slice(0, 80) };
    }
  }
  // its own release, signature and checksum verified by the script; into the engine's own folder; the shell profile is left alone
  const r = await runNative('/bin/sh', [script], {
    onLine,
    timeout: 10 * 60000,
    env: { ...process.env, TENSORFOLD_INSTALL_DIR: engineHome(), TENSORFOLD_NO_MODIFY_PATH: '1' },
  });
  return r.code === 0 ? { ok: true } : { ok: false, why: r.tail.slice(-2).join(' / ') };
}
async function installBrew({ onLine, tools }) {
  if (process.env.FO_NO_NET === '1' && process.env.FO_BIN_BREW === undefined)
    return { ok: false, why: 'this machine is not using the network, so nothing was installed' }; // a test run never reaches the real Homebrew
  const got = await ensureBrew({ exec: runNative, onLine });
  if (!got.ok) return { ok: false, why: got.why, fix: routeFix() };
  const brew = got.brew;
  // a copy just fetched knows of no formulae yet: its first update fetches the list. If that fails, the install says why itself.
  if (got.fetched)
    await brewDo(brew, ['update', '--force', '--quiet'], { exec: runNative, onLine, timeout: 15 * 60000 });
  const tap = await brewDo(brew, ['tap', ENGINE.tap], { exec: runNative, onLine });
  if (tap.code !== 0)
    return { ok: false, why: 'brew tap ' + ENGINE.tap + ' failed: ' + tap.tail.slice(-2).join(' / ') };
  const inst = await brewDo(brew, ['install', ENGINE.formula], { exec: runNative, onLine, formula: ENGINE.formula });
  if (inst.code === 0) return { ok: true, recovered: inst.recovered || tap.recovered || '', own: got.own };
  const said = inst.tail.join(' ');
  if (/Command Line Tools|xcode-select|CLT/i.test(said))
    return {
      ok: false,
      why: "Homebrew stopped: Apple's Command Line Tools are missing or out of date.",
      fix: cltFix(
        (/Command Line Tools for Xcode (\d+(?:\.\d+)*)/.exec(said) || [])[1],
        !(tools && tools.clt && tools.clt.installed === false),
      ),
    };
  return { ok: false, why: 'brew install failed: ' + inst.tail.slice(-2).join(' / ') };
}
export async function installEngine({ onLine, tools = {}, stateDir }) {
  if (await bin('tensorfold')) return { ok: true, already: true };
  const plan = installRoute({ ...tools, engine: null });
  if (plan.route === 'none') return { ok: false, why: plan.fix.title, fix: plan.fix };
  let signedWhy = '';
  if (plan.route === 'signed') {
    const r = await installSigned({ onLine, stateDir });
    if (r.ok && (await bin('tensorfold'))) return { ok: true, already: false, route: 'signed' };
    signedWhy = r.why || 'no tensorfold command was found afterwards';
    onLine('The signed installer did not finish: ' + signedWhy);
  }
  if (plan.route === 'brew' || plan.route === 'own' || tools.brew) {
    const r = await installBrew({ onLine, tools });
    if (r.ok)
      return (await bin('tensorfold'))
        ? { ok: true, already: false, route: r.own ? 'own' : 'brew', recovered: r.recovered || '' }
        : { ok: false, why: 'Homebrew finished, but no tensorfold command was found afterwards.' };
    return {
      ok: false,
      why: (signedWhy ? 'The signed installer failed (' + signedWhy + '), and then ' : '') + r.why,
      fix: r.fix,
    };
  }
  return { ok: false, why: "TensorFold's installer failed: " + signedWhy, fix: routeFix() };
}
export async function engineVersion() {
  const b = await bin('tensorfold');
  if (!b) return null;
  const r = await sh(...native(b, ['--version']));
  return (/(\d+\.\d+\.\d+)/.exec(r.out + ' ' + r.err) || [])[1] || 'installed';
}

// ---------- fetch ----------
export async function isCached(model) {
  const b = await bin('tensorfold');
  if (!b) return false;
  const r = await sh(...native(b, ['models', '--json']), { timeout: 20000 });
  try {
    // "schema 1, and each checkpoint's repo": find the repos wherever the document keeps them
    const repos = new Set();
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if (typeof v.repo === 'string') repos.add(v.repo.toLowerCase());
        Object.values(v).forEach(walk);
      }
    };
    walk(JSON.parse(r.out));
    return repos.has(model.repo.toLowerCase());
  } catch {
    return false;
  }
}
export async function pullModel(model, { onLine, onProgress, totalBytes }) {
  const b = await bin('tensorfold');
  if (!b) return { ok: false, why: 'TensorFold is not installed.' };
  // the download is watched from outside: how much of the model is on disk, against what Hugging Face says it weighs
  const watch = totalBytes
    ? setInterval(async () => {
        const have = await cachedBytes(model);
        onProgress(Math.min(0.99, have / totalBytes), have);
      }, 1500)
    : null;
  try {
    for (const spec of [model.repo + (model.rev ? '@' + model.rev : ''), model.drafter].filter(Boolean)) {
      const r = await runNative(b, ['pull', spec], { onLine });
      if (r.code !== 0)
        return { ok: false, why: 'tensorfold pull ' + spec + ' failed: ' + r.tail.slice(-2).join(' / ') };
    }
    return { ok: true };
  } finally {
    clearInterval(watch);
  }
}

// ---------- serve ----------
const freePort = () =>
  new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
// where a model is served: a port number means the server this runner started on this machine; { base, model } means a server that was already running
export const where = (p) => (p && typeof p === 'object' ? p : { base: 'http://127.0.0.1:' + p, model: SERVED_NAME });
const at = where;
export async function alive(port) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(at(port).base + '/v1/models', { signal: ctl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
let child = null;
export function stopEngine() {
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
    child = null;
  }
}
// a model server another module started (llama.mjs) is this one's to stop too
export function adoptEngine(c) {
  stopEngine();
  child = c;
  c.on('close', () => {
    if (child === c) child = null;
  });
}
process.on('exit', stopEngine);
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    stopEngine();
    process.exit(0);
  }); // the model server never outlives the runner
// start the server and wait until it answers. A large model can take minutes to load, so the wait is long and the last line is shown.
export const CONTEXT = 16384; // the context a model is served with here; the agent is told it, so it asks for no more than fits
// flags: serve flags learned for this model on this machine (index.mjs: serveFlags); tried first, and dropped if the server will not start with them
export async function serveModel(model, { onLine, context = CONTEXT, waitMs = 15 * 60000, flags = [] }) {
  const binPath = await bin('tensorfold');
  if (!binPath) return { ok: false, why: 'TensorFold is not installed.' };
  const plainest = [
    [...(model.drafter ? ['--drafter', model.drafter] : []), '--no-thinking'],
    ['--no-thinking'],
    [], // the plainest form last: a flag this model does not take must not stop the team from starting
  ];
  const attempts = [...(flags.length ? plainest.slice(0, 2).map((x) => [...x, ...flags]) : []), ...plainest].filter(
    (a, i, all) => all.findIndex((x) => x.join(' ') === a.join(' ')) === i,
  );
  let last = null;
  let viaArch = TRANSLATED;
  for (let i = 0; i < attempts.length; i++) {
    const extra = attempts[i];
    stopEngine();
    const port = await freePort();
    const tail = [];
    const args = [
      'serve',
      model.repo,
      '--name',
      SERVED_NAME,
      '--context',
      String(context),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      ...extra,
    ];
    let exited = null;
    child = spawn(...(viaArch ? native(binPath, args) : [binPath, args]), { stdio: ['ignore', 'pipe', 'pipe'] }); // the model server above all: a model does not load in a translated process
    const mine = child;
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
    mine.stdout.on('data', take);
    mine.stderr.on('data', take);
    mine.on('error', (e) => {
      exited = { code: -1, why: e.message };
    });
    mine.on('close', (code) => {
      exited = { code };
      if (child === mine) child = null;
    });
    const t0 = Date.now();
    while (!exited && Date.now() - t0 < waitMs) {
      if (await alive(port)) return { ok: true, port, pid: mine.pid, args: args.join(' '), loadMs: Date.now() - t0 };
      await new Promise((r) => setTimeout(r, 700));
    }
    last = exited
      ? 'the server stopped (exit ' + exited.code + '): ' + tail.slice(-3).join(' / ')
      : 'the server did not answer within ' + Math.round(waitMs / 60000) + ' minutes';
    if (!exited) break;
    if (viaArch && /Bad CPU type|arch: /i.test(tail.join(' '))) {
      viaArch = false;
      i--;
    } // it has no build for the chip: the plain way, with the same flags
  }
  stopEngine();
  return { ok: false, why: last };
}

// ---------- measure: one streamed reply, timed ----------
const PROMPT = 'Explain in about 120 words what a unit test is and why a team writes one before changing code.';
export async function* chatStream(port, messages, { maxTokens = 220, temperature = 0, signal } = {}) {
  const t = at(port);
  const ask = (extra) =>
    fetch(t.base + '/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: t.model, messages, max_tokens: maxTokens, temperature, stream: true, ...extra }),
    });
  let res = await ask({ stream_options: { include_usage: true } });
  if (res.status === 400 || res.status === 422) res = await ask({}); // a server that does not know stream_options
  if (!res.ok) throw new Error('the model server answered ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const m = /^data:\s*(.*)$/.exec(line.trim());
      if (!m || m[1] === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(m[1]);
      } catch {
        continue;
      }
      const d = j.choices && j.choices[0] && j.choices[0].delta;
      const text = d && (d.content || d.reasoning_content || '');
      if (text) yield { text };
      if (j.usage) yield { usage: j.usage };
    }
  }
}
// what the measuring step says while it measures: first that it waits, then what has come and how fast
export const speedLine = (t) =>
  t.waited != null
    ? 'Waiting for its first word: ' + t.waited + ' s. The first answer after a model loads is the slowest.'
    : t.tokens + ' words so far' + (t.tokPerSec ? ', ' + t.tokPerSec + ' a second' : '');
// A MEASUREMENT THAT CAN BE WATCHED, AND THAT ENDS. On a processor a large model writes a word or two a second, so the whole reply
// takes minutes, and a line that said nothing all that time looked stalled (found on a real PC). So: onTick is told how long it has
// waited for the first word, then how many words there are and how fast they come; once there are enough to say the speed
// (`enough` of them over `enoughMs`) the reply is cut short there; and a model that writes nothing in `firstMs` is an error that
// says so. A fast model finishes its reply before any of this applies, and is measured as it always was.
export async function measureSpeed(
  port,
  { onTick = () => {}, firstMs = 8 * 60000, enoughMs = 30000, enough = 24 } = {},
) {
  const t0 = Date.now();
  let first = 0;
  let pieces = 0;
  let chars = 0;
  let usage = null;
  let stopped = '';
  const ctl = new AbortController();
  const wait = setInterval(() => {
    if (first) return;
    onTick({ waited: Math.round((Date.now() - t0) / 1000) });
    if (Date.now() - t0 > firstMs) {
      stopped = 'nothing';
      ctl.abort();
    }
  }, 1000);
  try {
    for await (const ev of chatStream(port, [{ role: 'user', content: PROMPT }], { signal: ctl.signal })) {
      if (ev.text) {
        if (!first) first = Date.now();
        pieces++;
        chars += ev.text.length;
        const s = (Date.now() - first) / 1000;
        onTick({ tokens: pieces, tokPerSec: s >= 1 ? Math.round((pieces / s) * 10) / 10 : null });
        if (pieces >= enough && Date.now() - first >= enoughMs) {
          stopped = 'enough';
          ctl.abort();
          break;
        }
      }
      if (ev.usage) usage = ev.usage;
    }
  } catch (e) {
    if (!stopped) throw e;
  } finally {
    clearInterval(wait);
  }
  const end = Date.now();
  if (stopped === 'nothing') throw new Error('the model wrote nothing in ' + Math.round(firstMs / 60000) + ' minutes');
  if (!first) throw new Error('the model returned no text');
  const tokens = (usage && Number(usage.completion_tokens)) || pieces;
  const secs = Math.max(0.001, (end - first) / 1000);
  return {
    tokPerSec: Math.round((tokens / secs) * 10) / 10,
    firstTokenMs: first - t0,
    tokens,
    counted: usage && usage.completion_tokens ? 'by the server' : 'by stream pieces',
    chars,
  };
}

// ---------- the downloads, for Clear all ----------
// What this app downloaded and can delete again: the models it offers, where TensorFold keeps them (the Hugging Face cache: only the
// folders of the models in this app's own catalogue, never anything else in that cache, which other programs share); the models it
// fetched for llama.cpp; and the helpers. Never an engine: those are programs, small, and may be the customer's own.
import { rm as wipeDir } from 'node:fs/promises'; // imports are read before anything runs, wherever they are written
export const downloadDirs = (stateDir, models) =>
  [...new Set(models.flatMap((m) => [m.repo, m.drafter]).filter(Boolean))]
    .map(cacheDirOf)
    .concat([path.join(stateDir, 'models'), path.join(stateDir, 'addons')]);
export async function downloadsBytes(stateDir, models) {
  let kb = 0;
  for (const d of downloadDirs(stateDir, models)) {
    if (!(await exists(d))) continue;
    const r = await sh('du', ['-sk', d], { timeout: 30000 });
    kb += Number(r.out.split(/\s+/)[0]) || 0;
  }
  return kb * 1024;
}
export async function dropDownloads(stateDir, models) {
  let n = 0;
  for (const d of downloadDirs(stateDir, models)) {
    if (!(await exists(d))) continue;
    await wipeDir(d, { recursive: true, force: true }).catch(() => {});
    n++;
  }
  return n;
}
