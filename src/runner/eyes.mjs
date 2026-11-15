// eyes.mjs - THE HELPERS: small models added beside the one the team thinks with, each for one job that model cannot do
// (js/catalog.js: ADDONS). A helper is a tick on the model page, never a choice of mind.
//   see    reads a picture and says what is on it                 LFM3-Omni-2B, served by llama.cpp while it reads
//   draw   makes a picture from words, or changes one it is given  FLUX.2 klein 4B, run by stable-diffusion.cpp
//   film   makes a few seconds of video from words                 Wan 2.2 TI2V 5B, run by stable-diffusion.cpp
//   createEyes({ stateDir, disk, save, push }) ->
//     list(host, mainNeedGb)   what the Start page shows for each: size, memory, the plan (what adding it would run), its state
//     view() / has()           the picture-reader's state for the pushed view / which kinds are ready, by name
//     steps(a) / install(a, io)   the steps of adding one, and the run of them, wherever they are shown (its own job, or a team's setup)
//     add(id) / cancel() / remove(id)
//     see({ file, ask, max })           -> { ok, text, seconds, by }           one picture, read
//     make(kind, { prompt, ref, dir })  -> { ok, file, type, seconds, by }     one picture or one clip, made
//     rest()                   let the picture-reader go from memory (it stays added)
// ADDING ONE does the same things in the same order, each shown as it happens and each resumable:
//   1 ITS ENGINE. llama.cpp comes from Homebrew's own formula. stable-diffusion.cpp has no formula: its macOS release is fetched from
//     GitHub at a PINNED tag, kept only if its SHA-256 is the one in the catalog, and unpacked into this app's own folder.
//   2 ITS FILES, from Hugging Face, each at a PINNED revision, each kept only if its SHA-256 is the one its page lists. A download
//     that stops carries on from where it stopped.
//   3 A CHECK THAT IT DOES ITS JOB: the reader reads a number off a test picture; a drawer draws a test picture; the film maker makes
//     a short test clip. One that fails is not switched on, and what happened is said.
// The reader is loaded only while it reads (ten minutes after its last picture it is let go). A drawer or film maker runs once for each
// thing it makes and holds nothing afterwards. One helper works at a time. None of them outlives the runner.
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { ADDONS, addonBytes, addonFit } from '../js/catalog.js';
import { atLeast, bin, native, sh, which, TRANSLATED } from './host.mjs';
import { alive, runNative } from './engine.mjs';
import { brewDo, canOwnBrew, ensureBrew } from './brew.mjs';
import { guard } from './talk.mjs';
import { findBrowser, shotPage } from './shot.mjs';

const CHAT = '/v1/chat/completions';
const IDLE = Number(process.env.FO_EYES_IDLE_MS) || 600000;
const hfBase = () => (process.env.FO_HF_BASE || 'https://huggingface.co').replace(/\/$/, '');
const gb = (bytes) => Math.round((bytes / 2 ** 30) * 10) / 10;
const mb = (bytes) => Math.round(bytes / 2 ** 20);
const exists = (f) =>
  stat(f).then(
    () => true,
    () => false,
  );
const freePort = () =>
  new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
const sha256 = (file) =>
  new Promise((ok, no) => {
    const hsh = createHash('sha256');
    createReadStream(file)
      .on('data', (c) => hsh.update(c))
      .on('end', () => ok(hsh.digest('hex')))
      .on('error', no);
  });
async function walk(dir, keep, out = [], depth = 0) {
  if (depth > 5) return out;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, keep, out, depth + 1);
    else if (keep.test(e.name)) out.push(f);
  }
  return out;
}
// a test names its own small files and its own engine release (FO_ADDON_FILES, FO_SD_RELEASE): the real ones weigh gigabytes and are
// only ever fetched because a customer pressed the button
const filesOf = (a) => {
  try {
    const t = JSON.parse(process.env.FO_ADDON_FILES || 'null');
    if (Array.isArray(t)) {
      if (a.kind === 'see') return t;
    } else if (t && Array.isArray(t[a.id])) return t[a.id];
  } catch {
    /* the catalog's */
  }
  return a.files;
};
const releaseOf = (a) => {
  try {
    const t = JSON.parse(process.env.FO_SD_RELEASE || 'null');
    if (t && t.url) return { ...a.engine, ...t };
  } catch {
    /* the catalog's */
  }
  return { ...a.engine, url: a.engine.site + '/releases/download/' + a.engine.tag + '/' + a.engine.asset };
};
const local = (f) => path.basename(f.name);

// ---------- one download: resumable, and kept only when its SHA-256 is the expected one ----------
async function download({ url, dest, bytes, sha, label, signal, onBytes = () => {} }) {
  const part = dest + '.part';
  const s0 = await stat(dest).catch(() => null);
  if (s0 && s0.size === bytes) return { ok: true, already: true }; // it was checked against its SHA-256 before it got this name
  for (let go = 0; go < 2; go++) {
    let from = ((await stat(part).catch(() => null)) || { size: 0 }).size;
    if (from > bytes) {
      await rm(part, { force: true });
      from = 0;
    }
    if (from < bytes) {
      let res;
      try {
        res = await fetch(url, { signal, redirect: 'follow', headers: from ? { range: 'bytes=' + from + '-' } : {} });
      } catch (e) {
        if (signal && signal.aborted) throw e;
        return {
          ok: false,
          why: label + ' could not be reached. Press Try again: it carries on from ' + gb(from) + ' GB.',
        };
      }
      if (res.status !== 200 && res.status !== 206)
        return { ok: false, why: 'The download of ' + label + ' was answered with ' + res.status + '.' };
      const whole = res.status === 200;
      const out = createWriteStream(part, { flags: whole ? 'w' : 'a' });
      let n = whole ? 0 : from;
      let broke = null; // sent whole although the rest was asked for: it starts again
      try {
        for await (const c of res.body) {
          if (!out.write(c)) await new Promise((r) => out.once('drain', r));
          n += c.length;
          onBytes(n);
        }
      } catch (e) {
        broke = e;
      }
      await new Promise((r) => out.end(r));
      if (broke) {
        if (signal && signal.aborted) throw broke;
        return {
          ok: false,
          why: label + ' stopped at ' + gb(n) + ' of ' + gb(bytes) + ' GB. Press Try again: it carries on from there.',
        };
      }
    }
    const size = (await stat(part)).size;
    if (size < bytes)
      return {
        ok: false,
        why: label + ' stopped at ' + gb(size) + ' of ' + gb(bytes) + ' GB. Press Try again: it carries on from there.',
      };
    if (size === bytes && (await sha256(part)) === sha) {
      await rename(part, dest);
      return { ok: true };
    }
    await rm(part, { force: true }); // not the file that was expected: thrown away, and fetched once more from the start
  }
  return { ok: false, why: label + ' did not match its expected SHA-256, twice. Nothing was kept.' };
}
export { download, versionOf }; // llama.mjs fetches and checks a team's own model the same way
const offline = (override) => process.env.FO_NO_NET === '1' && !process.env[override];

// ---------- llama.cpp (the reader's engine) ----------
// The command is "llama" (llama serve ...) since the release this model needs; an older install has "llama-server", which is found too
// so that it can be told it is too old instead of being reported as missing.
async function findLlama() {
  const a = await bin('llama');
  if (a) return { file: a, pre: ['serve'] };
  if (process.env.FO_BIN_LLAMA !== undefined) return null;
  const b = await which('llama-server');
  return b ? { file: b, pre: [] } : null;
}
// what it says of itself, read from its first line only (a later line names the compiler's version, which is not its own)
async function versionOf(e) {
  const r = await sh(...native(e.file, ['--version']), { timeout: 10000 });
  const first =
    (r.out + '\n' + r.err)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0] || '';
  const v = /(\d+)\.(\d+)\.(\d+)/.exec(first);
  const b = /\bb?(\d{4,6})\b/.exec(first.replace(/\d+\.\d+\.\d+/g, ''));
  return {
    text: v ? v[0] : b ? 'build ' + b[1] : '',
    v: v ? [Number(v[1]), Number(v[2]), Number(v[3])] : null,
    build: b ? Number(b[1]) : null,
  };
}
const enough = (a, ver) => (ver.v ? atLeast(ver.v, a.engine.min) : ver.build ? ver.build >= a.engine.minBuild : null); // null: it does not say, so it is tried
const needs = (a) => 'v' + a.engine.min.join('.') + ' (build ' + a.engine.minBuild + ') or newer';
const noBrew = (a, old) => ({
  kind: 'llama',
  title: old ? a.engine.name + ' on this Mac is too old for this model' : a.engine.name + ' is not on this Mac',
  text:
    a.name +
    ' is served by ' +
    a.engine.name +
    ' ' +
    needs(a) +
    '. Homebrew installs it with one command, and there is no Homebrew here.',
  steps: [
    'Its own copy of Homebrew could not be fetched here. Install Homebrew from brew.sh, then press Try again: the rest is done for you.',
    'Or download ' +
      a.engine.name +
      ' from its releases page and put its "llama" command on your PATH, then press Try again.',
  ],
  link: { href: a.engine.site + '/releases', label: a.engine.name + ' releases' },
});
async function ensureLlama(addon, { onLine, onChild }) {
  let engine = await findLlama();
  let ver = engine ? await versionOf(engine) : null;
  const had = !!engine;
  if (engine && enough(addon, ver) !== false) return { ok: true, e: engine, ver, already: true };
  if (offline('FO_BIN_BREW') && process.env.FO_BIN_BREW === undefined)
    return { ok: false, why: 'this machine is not using the network, so ' + addon.engine.name + ' was not installed' }; // a test run never reaches the real Homebrew
  const got = await ensureBrew({ exec: runNative, onLine });
  if (!got.ok) {
    const fix = noBrew(addon, had);
    return { ok: false, why: fix.title + ' (' + got.why + ')', fix };
  }
  const brew = got.brew;
  if (got.fetched)
    await brewDo(brew, ['update', '--force', '--quiet'], { exec: runNative, onLine, timeout: 15 * 60000 });
  const brewRun = await brewDo(brew, [had ? 'upgrade' : 'install', addon.engine.formula], {
    exec: runNative,
    onLine,
    onChild,
    formula: addon.engine.formula,
    timeout: 20 * 60000,
  });
  engine = await findLlama();
  if (!engine)
    return {
      ok: false,
      why:
        brewRun.code === 0
          ? 'Homebrew finished, but no llama command was found afterwards.'
          : 'brew ' +
            (had ? 'upgrade ' : 'install ') +
            addon.engine.formula +
            ' failed: ' +
            brewRun.tail.slice(-2).join(' / '),
    };
  ver = await versionOf(engine);
  if (enough(addon, ver) === false)
    return {
      ok: false,
      why:
        "Homebrew's " +
        addon.engine.name +
        ' is ' +
        (ver.text || 'an older build') +
        ', and this model needs ' +
        needs(addon) +
        (brewRun.code === 0 ? '.' : ': ' + brewRun.tail.slice(-1).join('')),
    };
  return { ok: true, e: engine, ver, already: false, updated: had };
}

export function createEyes({ stateDir, disk, save, push }) {
  const dirOf = (a) => path.join(stateDir, 'addons', a.id);
  const rec = (a) => (disk().addons || {})[a.id] || null;
  const byId = (id) => ADDONS.find((x) => x.id === id) || null;
  // ADDED IS NOT THE SAME AS IN USE. A helper that has been downloaded and checked stays on the machine; whether the team uses it is
  // the tick on the model page, kept here as "on". Setting a team up says which helpers it has (use), and one that is not ticked is
  // left on disk and left alone.
  const live = (a) => {
    const r = rec(a);
    return !!(r && r.ready && r.on !== false);
  };
  async function use(ids) {
    const d = disk();
    let changed = false;
    for (const a of ADDONS) {
      const r = (d.addons || {})[a.id];
      if (!r || !r.ready) continue;
      const on = ids.includes(a.id);
      if ((r.on !== false) !== on) {
        r.on = on;
        changed = true;
        if (!on && a.kind === 'see') rest();
      }
    }
    if (changed) {
      await save();
      push();
    }
  }
  let job = null;
  let ctl = null;
  let kids = new Set();
  let child = null;
  let port = 0;
  let idle = null;
  let turn = Promise.resolve();
  const rest = () => {
    clearTimeout(idle);
    idle = null;
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      child = null;
    }
    port = 0;
  };
  process.on('exit', rest);
  const later = () => {
    clearTimeout(idle);
    idle = setTimeout(rest, IDLE);
    if (idle.unref) idle.unref();
  };
  const queued = async (fn) => {
    const before = turn;
    let done;
    turn = new Promise((r) => {
      done = r;
    });
    await before;
    try {
      return await fn();
    } finally {
      done();
    }
  }; // one helper works at a time

  // ---------- stable-diffusion.cpp (the drawers' and the film maker's engine): its pinned macOS release, in this app's own folder ----------
  const sdDir = (a) => path.join(stateDir, 'engines', 'sd-' + a.engine.tag);
  async function findSd(a) {
    if (process.env.FO_BIN_SDCLI !== undefined)
      return (await exists(process.env.FO_BIN_SDCLI)) ? process.env.FO_BIN_SDCLI : null;
    return (await walk(sdDir(a), /^sd-cli$/))[0] || null;
  }
  async function ensureSd(a, { signal, onBytes }) {
    let cli = await findSd(a);
    if (cli) return { ok: true, cli, already: true, ver: { text: a.engine.tag } };
    if (process.env.FO_BIN_SDCLI !== undefined) return { ok: false, why: a.engine.name + ' is not on this machine.' };
    if (offline('FO_SD_RELEASE'))
      return { ok: false, why: 'this machine is not using the network, so ' + a.engine.name + ' was not fetched' };
    const rel = releaseOf(a);
    const dir = sdDir(a);
    const zip = path.join(dir, 'release.zip');
    await mkdir(dir, { recursive: true });
    const got = await download({
      url: rel.url,
      dest: zip,
      bytes: rel.bytes,
      sha: rel.sha256,
      label: a.engine.name,
      signal,
      onBytes,
    });
    if (!got.ok) return got;
    const un = await sh('/usr/bin/unzip', ['-o', '-q', zip, '-d', dir], { timeout: 120000 });
    if (!un.ok)
      return { ok: false, why: a.engine.name + ' could not be unpacked: ' + un.err.split('\n').pop().slice(0, 160) };
    cli = (await walk(dir, /^sd-cli$/))[0];
    if (!cli)
      return { ok: false, why: 'The ' + a.engine.name + ' release was unpacked, but it holds no sd-cli command.' };
    await chmod(cli, 0o755).catch(() => {});
    await rm(zip, { force: true }).catch(() => {});
    return { ok: true, cli, already: false, ver: { text: a.engine.tag } };
  }
  // ONE THING MADE: the command its own documentation gives, with this helper's files and settings. A film maker is asked for a WebM
  // (which a page can play); if the engine wrote nothing by that name, an AVI is tried, and the result says which it is.
  async function gen(a, cli, { prompt, out, ref, extra = [], onLine = () => {} }) {
    const files = filesOf(a);
    const dir = dirOf(a);
    const t0 = Date.now();
    const base = [
      ...(a.mode ? ['-M', a.mode] : []),
      ...files.filter((f) => f.flag).flatMap((f) => [f.flag, path.join(dir, local(f))]),
      '-p',
      String(prompt).slice(0, 600),
      ...(a.negative ? ['-n', a.negative] : []),
      ...(a.args || []),
      ...(extra.length ? extra : a.size || []),
      ...(ref ? ['-r', ref] : []),
    ]; // its own settings, then the size: the usual one, or the small one a check asks for
    let last = '';
    for (const type of a.kind === 'film' ? ['webm', 'avi'] : ['png']) {
      const file = out + '.' + type;
      await rm(file, { force: true }).catch(() => {});
      const r = await runNative(cli, [...base, '-o', file], {
        onLine,
        onChild: (c) => {
          kids.add(c);
          c.on('close', () => kids.delete(c));
        },
        timeout: (a.minutes || 10) * 60000,
      });
      const s = await stat(file).catch(() => null);
      if (r.code === 0 && s && s.size > 200)
        return { ok: true, file, type, seconds: Math.round((Date.now() - t0) / 100) / 10 };
      last =
        r.code === 0
          ? 'it finished without writing ' + path.basename(file)
          : 'it stopped (exit ' + r.code + '): ' + r.tail.slice(-2).join(' / ').slice(0, 240);
      if (r.code !== 0 && !/output|format|extension|webm|encode/i.test(r.tail.join(' '))) break; // not about the kind of file: asking for another kind would not help
    }
    return { ok: false, why: last };
  }
  async function make(kind, { prompt, ref, out, extra, onLine }) {
    const a = ADDONS.find((x) => x.kind === kind && live(x));
    if (!a)
      return {
        ok: false,
        none: true,
        why:
          kind === 'film'
            ? 'No model that makes video has been added.'
            : 'No model that makes pictures has been added.',
      };
    return queued(async () => {
      const cli = await findSd(a);
      if (!cli)
        return {
          ok: false,
          why: a.engine.name + ' is no longer on this machine. Add ' + a.name + ' again from the Start page.',
        };
      const r = await gen(a, cli, { prompt, ref, out, extra, onLine });
      return r.ok ? { ...r, by: a.name } : { ok: false, why: a.name + ' did not make it: ' + r.why };
    });
  }

  // ---------- the reader: served by llama.cpp while it reads ----------
  // serve it and wait until it answers. The flags are its page's own; one an older build refuses is left out and it is tried again.
  async function bringUp(a, e, { onLine = () => {}, waitMs = 4 * 60000, halt = () => false } = {}) {
    if (child && port && (await alive(port))) {
      later();
      return { ok: true, port, warm: true, loadMs: 0 };
    }
    rest();
    const [model, proj] = ['model', 'projector'].map((p) =>
      path.join(dirOf(a), local(filesOf(a).find((f) => f.part === p) || { name: '' })),
    );
    const base = (mm) => ['-m', model, mm, proj, '--host', '127.0.0.1', '-c', String(a.context)];
    const page = ['--reasoning', 'off', '--temp', '0']; // page: the flags its own page gives
    let last = '';
    for (const [mm, extra] of [
      ['--mmproj', page],
      ['--mmproj', ['--temp', '0']],
      ['--mmproj', []],
      ['-mm', page],
      ['-mm', []],
    ]) {
      if (halt()) {
        last = 'cancelled';
        break;
      }
      const openPort = await freePort();
      const args = [...e.pre, ...base(mm), '--port', String(openPort), ...extra];
      const tail = [];
      let exited = null;
      const mine = (child = spawn(...(TRANSLATED ? native(e.file, args) : [e.file, args]), {
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
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
      mine.on('error', (err) => {
        exited = { code: -1, why: err.message };
      });
      mine.on('close', (code) => {
        exited = { code };
        if (child === mine) {
          child = null;
          port = 0;
        }
      });
      const t0 = Date.now();
      while (!exited && !halt() && Date.now() - t0 < waitMs) {
        if (await alive(openPort)) {
          port = openPort;
          later();
          return { ok: true, port: openPort, warm: false, loadMs: Date.now() - t0, args: args.join(' ') };
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      last = exited
        ? 'it stopped (exit ' + exited.code + '): ' + tail.slice(-3).join(' / ')
        : 'it did not answer within ' + Math.round(waitMs / 60000) + ' minutes';
      if (!exited) break;
    }
    rest();
    return { ok: false, why: last };
  }
  // ONE PICTURE, READ. A reply that runs on into one piece repeated is cut where it was still sound, as any local model's is.
  const SYS =
    'You read pictures for a software team that cannot see them. Say only what is in the picture. Where you cannot make something out, say so; never guess.';
  async function ask(addon, e, { file, text, max = 500, onLine }) {
    const server = await bringUp(addon, e, { onLine });
    if (!server.ok) return { ok: false, why: 'The model that reads pictures did not start: ' + server.why };
    const png = await readFile(file).catch(() => null);
    if (!png) return { ok: false, why: 'that picture is no longer kept' };
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 180000);
    const startedAt = Date.now();
    try {
      const res = await fetch('http://127.0.0.1:' + server.port + CHAT, {
        method: 'POST',
        signal: stop.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: addon.served,
          temperature: 0,
          max_tokens: max,
          messages: [
            { role: 'system', content: SYS },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png.toString('base64') } },
                { type: 'text', text },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false, why: 'it answered ' + res.status + ': ' + (await res.text()).slice(0, 160) };
      const j = await res.json();
      const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      let said = (
        typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : ''
      ).trim();
      let cut = null;
      const g = guard();
      for (let i = 0; i < said.length && !cut; i += 12) cut = g.feed(said.slice(i, i + 12));
      if (cut) said = cut.keep;
      if (!said) return { ok: false, why: 'it said nothing about the picture' };
      return {
        ok: true,
        text: said,
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        loadSeconds: server.warm ? 0 : Math.round(server.loadMs / 100) / 10,
        by: addon.name,
        cut: !!cut,
      };
    } catch (err) {
      return {
        ok: false,
        why: stop.signal.aborted
          ? 'it did not finish reading within three minutes'
          : 'it stopped answering: ' + String((err && err.message) || err).slice(0, 120),
      };
    } finally {
      clearTimeout(timer);
      later();
    }
  }
  async function see({ file, ask: text, max }) {
    const a = ADDONS.find((x) => x.kind === 'see' && live(x));
    if (!a) return { ok: false, none: true, why: 'No model that reads pictures has been added.' };
    return queued(async () => {
      const e = await findLlama();
      if (!e)
        return {
          ok: false,
          why: a.engine.name + ' is no longer on this machine. Add ' + a.name + ' again from the Start page.',
        };
      return ask(a, e, { file, text: String(text || '').slice(0, 1500), max });
    });
  }

  // ---------- adding one ----------
  const CHECK = {
    see: ['Check that it reads', 'It is shown a test picture with a number on it, and must read the number back'],
    draw: ['Check that it draws', 'It is asked for one small test picture'],
    film: ['Check that it films', 'It is asked for one short test clip'],
  };
  const STEPS = (a) => [
    {
      id: 'engine',
      title: 'Install ' + a.engine.name,
      detail:
        a.kind === 'see' ? 'The program that serves this kind of model' : 'The program that runs this kind of model',
    },
    {
      id: 'model',
      title: 'Fetch ' + a.name,
      detail: gb(addonBytes({ files: filesOf(a) })) + ' GB, each file checked against its SHA-256',
    },
    ...(a.kind === 'see'
      ? [{ id: 'server', title: 'Start it', detail: 'On 127.0.0.1, where only this machine can reach it' }]
      : []),
    { id: 'check', title: CHECK[a.kind][0], detail: CHECK[a.kind][1] },
  ];
  // THE SAME STEPS RUN TWO WAYS: on their own (add(), from the API), or as the last steps of a team's setup when the customer ticked the
  // helper on the model page (index.mjs: runSetup hands in its own step list). io is where the steps are shown:
  //   io.start(id)  io.end(id, detail)  io.fail(id, why, fix) -> false  io.line(id, text)  io.progress(id, pct, detail)  io.signal  io.kid(child)
  async function work(addon, io) {
    const dir = dirOf(addon);
    const files = filesOf(addon);
    const total = addonBytes({ files });
    io.start('engine');
    const eng =
      addon.engine.kind === 'release'
        ? await ensureSd(addon, {
            signal: io.signal,
            onBytes: (n) => io.progress('engine', 0, addon.engine.name + ', ' + mb(n) + ' MB'),
          })
        : await ensureLlama(addon, { onLine: (l) => io.line('engine', l), onChild: io.kid });
    if (!eng.ok) return io.fail('engine', eng.why, eng.fix);
    io.end(
      'engine',
      addon.engine.name +
        ' ' +
        (eng.ver.text || '') +
        (eng.already
          ? ' was already here'
          : eng.updated
            ? ' installed, replacing an older one'
            : addon.engine.kind === 'release'
              ? " fetched, matching its SHA-256, into this app's own folder"
              : ' installed'),
    );

    io.start('model');
    await mkdir(dir, { recursive: true });
    let before = 0;
    let fresh = false;
    for (const f of files) {
      if (offline('FO_HF_BASE') && !(await exists(path.join(dir, local(f)))))
        return io.fail('model', 'this machine is not using the network');
      const got = await download({
        url: hfBase() + '/' + (f.repo || addon.repo) + '/resolve/' + (f.rev || addon.rev) + '/' + f.name,
        dest: path.join(dir, local(f)),
        bytes: f.bytes,
        sha: f.sha256,
        label: local(f),
        signal: io.signal,
        onBytes: (n) =>
          io.progress(
            'model',
            Math.min(0.99, (before + n) / total),
            addon.name + ', ' + gb(before + n) + ' of ' + gb(total) + ' GB',
          ),
      });
      if (!got.ok) return io.fail('model', got.why);
      if (!got.already) fresh = true;
      before += f.bytes;
    }
    io.end(
      'model',
      addon.name +
        ', ' +
        gb(total) +
        ' GB, ' +
        (fresh ? 'each file matching the SHA-256 on its Hugging Face page' : 'already on this machine'),
    );

    const measured = { at: Date.now(), engine: eng.ver.text || '', read: null, seconds: null };
    if (addon.kind === 'see') {
      io.start('server');
      const srv = await bringUp(addon, eng.e, { onLine: (l) => io.line('server', l), halt: () => io.signal.aborted });
      if (!srv.ok) return io.fail('server', 'It did not start: ' + srv.why);
      measured.loadSeconds = Math.round(srv.loadMs / 100) / 10;
      io.end('server', 'Serving on 127.0.0.1:' + srv.port + ', loaded in ' + measured.loadSeconds + ' s');
      io.start('check');
      if (!(await findBrowser()))
        io.end(
          'check',
          "Not checked: this machine has no Chrome, Edge, Brave or Chromium to draw the test picture with. It can still read a picture of an app's window",
        );
      else {
        const n = randomInt(1000, 9999);
        const page = path.join(dir, 'check.html');
        const pic = path.join(dir, 'check.png');
        await writeFile(
          page,
          '<!doctype html><meta charset="utf-8"><title>Reading check</title><body style="margin:0;background:#fff;color:#111;font:700 220px/1 Helvetica,Arial,sans-serif;display:grid;place-items:center;height:100vh">' +
            n +
            '</body>',
        );
        const shot = await shotPage({ url: 'file://' + page, file: pic, profile: path.join(dir, '.profile') });
        if (!shot.ok) return io.fail('check', 'The test picture could not be drawn: ' + shot.why);
        const r = await ask(addon, eng.e, {
          file: pic,
          text: 'What number is written on this picture? Answer with the number only.',
          max: 24,
        });
        if (!r.ok) return io.fail('check', 'It could not be asked about the test picture: ' + r.why);
        if (!r.text.replace(/\D/g, '').includes(String(n)))
          return io.fail(
            'check',
            'It did not read the test picture. The number on it was ' +
              n +
              ', and it said: "' +
              r.text.slice(0, 80) +
              '". It has not been switched on.',
          );
        measured.read = true;
        measured.seconds = r.seconds;
        io.end('check', 'It read ' + n + ' off the test picture in ' + r.seconds + ' s');
      }
    } else {
      // a drawer or a film maker proves itself by making something: the file must be there, and be the kind of file it says it is
      io.start('check');
      const made = await gen(addon, eng.cli, {
        prompt:
          addon.kind === 'film'
            ? 'a red ball rolling across a white table'
            : 'a red apple on a white table, studio photograph',
        out: path.join(dir, 'check'),
        extra: addon.test || [],
        onLine: (l) => io.line('check', l),
      });
      if (!made.ok)
        return io.fail(
          'check',
          'It did not make its test ' +
            (addon.kind === 'film' ? 'clip' : 'picture') +
            ': ' +
            made.why +
            '. It has not been switched on.',
        );
      if (made.type === 'png') {
        const fh = await open(made.file, 'r');
        const head = Buffer.alloc(8);
        await fh.read(head, 0, 8, 0);
        await fh.close();
        if (head.toString('latin1', 1, 4) !== 'PNG')
          return io.fail('check', 'What it wrote is not a picture. It has not been switched on.');
      }
      measured.made = made.type;
      measured.seconds = made.seconds;
      io.end(
        'check',
        addon.kind === 'film'
          ? 'It made a short test clip in ' +
              made.seconds +
              ' s' +
              (made.type === 'avi' ? ', as an AVI: a page cannot play that, so clips are offered as files to open' : '')
          : 'It drew a test picture in ' + made.seconds + ' s',
      );
    }
    const d = disk();
    (d.addons || (d.addons = {}))[addon.id] = { ready: true, on: true, at: Date.now(), measured };
    await save();
    return true;
  }
  function add(id) {
    const addon = byId(id);
    if (!addon) return { ok: false, why: 'no such add-on' };
    if (job && job.state === 'adding') return { ok: false, why: 'one is already being added' };
    ctl = new AbortController();
    job = {
      id: addon.id,
      state: 'adding',
      steps: STEPS(addon).map((x) => ({ ...x, state: 'wait', pct: 0, line: '' })),
      error: null,
    };
    push();
    const mine = job;
    const stepOf = (id2) => mine.steps.find((x) => x.id === id2);
    const gone = () => {
      if (ctl.signal.aborted) throw new Error('cancelled');
    };
    const io = {
      signal: ctl.signal,
      kid: (c) => {
        kids.add(c);
        c.on('close', () => kids.delete(c));
      },
      start: (k) => {
        gone();
        stepOf(k).state = 'run';
        push();
      },
      end: (k, detail) => {
        const s = stepOf(k);
        s.state = 'done';
        s.pct = 1;
        s.line = '';
        if (detail) s.detail = detail;
        push();
      },
      fail: (k, why, fix) => {
        gone();
        const s = stepOf(k);
        s.state = 'fail';
        s.line = '';
        mine.state = 'failed';
        mine.error = { step: k, why, fix: fix || null };
        push();
        return false;
      },
      line: (k, text) => {
        stepOf(k).line = String(text).slice(0, 140);
        push();
      },
      progress: (k, pct, detail) => {
        const s = stepOf(k);
        s.pct = pct;
        if (detail) s.detail = detail;
        push();
      },
    };
    work(addon, io)
      .then((ok) => {
        if (ok && job === mine) {
          job = null;
          push();
        }
      })
      .catch((e) => {
        if (job !== mine) return;
        if (ctl.signal.aborted) {
          job = null;
          rest();
        } else {
          const at = mine.steps.find((x) => x.state === 'run');
          if (at) at.state = 'fail';
          mine.state = 'failed';
          mine.error = { step: at ? at.id : 'engine', why: String((e && e.message) || e).slice(0, 200), fix: null };
        }
        push();
      });
    return { ok: true };
  }
  function cancel() {
    if (!job) return;
    if (job.state === 'adding') {
      ctl.abort();
      for (const c of kids) {
        try {
          c.kill('SIGTERM');
        } catch {
          /* already gone */
        }
      }
      rest();
    } else job = null;
    push();
  } // what was fetched so far stays: adding it again carries on
  async function remove(id) {
    const a = byId(id);
    if (!a) return { ok: false, why: 'no such add-on' };
    if (job && job.state === 'adding') return { ok: false, why: 'one is being added: cancel that first' };
    if (a.kind === 'see') rest();
    if (job && job.id === a.id) job = null;
    await rm(dirOf(a), { recursive: true, force: true });
    const d = disk();
    if (d.addons) delete d.addons[a.id];
    await save();
    push();
    return { ok: true };
  }

  const stateOf = (a) =>
    job && job.id === a.id ? job.state : live(a) ? 'ready' : (rec(a) || {}).ready ? 'off' : 'none'; // off: downloaded and checked, but not ticked for this team
  const viewOf = (a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    state: stateOf(a),
    steps: job && job.id === a.id ? job.steps : null,
    error: job && job.id === a.id ? job.error : null,
    measured: (rec(a) || {}).measured || null,
  });
  function view() {
    const a = ADDONS.find((x) => x.kind === 'see');
    return a ? { ...viewOf(a), loaded: !!child } : null;
  } // the reader, as the app has always been told of it
  const has = () =>
    Object.fromEntries(
      ['see', 'draw', 'film'].map((k) => [k, (ADDONS.find((x) => x.kind === k && live(x)) || { name: '' }).name]),
    );
  async function list(host, mainNeedGb = 0) {
    const llama = await findLlama();
    const lver = llama ? await versionOf(llama) : null;
    const brew = host.tools.brew;
    return Promise.all(
      ADDONS.map(async (addon) => {
        const files = filesOf(addon);
        const dir = dirOf(addon);
        const missing = [];
        for (const f of files) {
          const s = await stat(path.join(dir, local(f))).catch(() => null);
          if (!s || s.size !== f.bytes) missing.push(f);
        }
        const fit = addonFit({ ...addon, files }, host.memoryGb, mainNeedGb);
        const plan = [];
        let here = null;
        if (addon.engine.kind === 'release') {
          const cli = await findSd(addon);
          const rel = releaseOf(addon);
          here = cli ? { version: addon.engine.tag, enough: true } : null;
          if (!cli)
            plan.push({
              what: 'Install ' + addon.engine.name,
              command:
                'its macOS release ' +
                addon.engine.tag +
                " from GitHub, checked against its SHA-256 and unpacked into this app's own folder",
              from: 'github.com/leejet/stable-diffusion.cpp',
              size: mb(rel.bytes) + ' MB',
              blocked: host.arch === 'arm64' ? '' : 'its release is built for Apple silicon only',
            });
        } else {
          const old = !!llama && enough(addon, lver) === false;
          here = llama ? { version: lver.text || 'installed', enough: !old } : null;
          if (!llama || old)
            plan.push({
              what: (old ? 'Update ' : 'Install ') + addon.engine.name,
              command: 'brew ' + (old ? 'upgrade ' : 'install ') + addon.engine.formula,
              from: 'Homebrew',
              note: old
                ? 'The one here is ' + (lver.text || 'an older build') + '; this model needs ' + needs(addon) + '.'
                : '',
              blocked:
                brew || canOwnBrew() ? '' : 'needs Homebrew (brew.sh), or ' + addon.engine.name + ' installed by hand',
              ...(!brew && canOwnBrew() && !old
                ? {
                    note: "There is no Homebrew on this machine: its own files are fetched into this app's folder first (no password), and it builds here, which takes longer.",
                  }
                : {}),
            });
        }
        if (missing.length)
          plan.push({
            what: 'Download ' + addon.name,
            command:
              missing.map(local).join(', ') +
              (new Set(missing.map((x) => x.rev || addon.rev)).size === 1 && (missing[0].rev || addon.rev)
                ? ', at revision ' + (missing[0].rev || addon.rev).slice(0, 8)
                : ', each at its pinned revision') +
              ', each checked against its SHA-256',
            from: [...new Set(missing.map((f) => 'huggingface.co/' + (f.repo || addon.repo)))].join(', '),
            size: gb(addonBytes({ files: missing })) + ' GB',
            blocked:
              host.diskFreeGb != null && host.diskFreeGb < gb(addonBytes({ files: missing })) * 1.1
                ? 'not enough free disk: ' + host.diskFreeGb + ' GB'
                : '',
          });
        return {
          ...addon,
          files: undefined,
          negative: undefined,
          ...fit,
          plan,
          engineHere: here,
          ...viewOf(addon),
          ...(addon.kind === 'see' ? { loaded: !!child } : {}),
        };
      }),
    );
  }
  return {
    list,
    view,
    has,
    use,
    add,
    cancel,
    remove,
    see,
    make,
    rest,
    adding: () => !!job && job.state === 'adding',
    byId,
    steps: STEPS,
    install: work,
  };
}
