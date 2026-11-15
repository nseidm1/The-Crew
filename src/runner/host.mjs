// host.mjs - measure THIS machine, now. Called when the customer presses Start; nothing is remembered between presses.
// Everything here is a read: sysctl, sw_vers, df, vm_stat, and "is this tool on the machine" probes. Nothing is installed or changed.
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { readdir, readFile, access, statfs } from 'node:fs/promises';
import { ENGINE, AGENT, STRATA, STRATA_MODELS, LLAMA } from '../js/catalog.js';

export function sh(cmd, args, { timeout = 8000, env } = {}) {
  return new Promise((ok) => {
    execFile(
      cmd,
      args,
      { timeout, env: env || process.env, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) =>
        ok({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() }),
    );
  });
}
export const exists = (f) =>
  access(f).then(
    () => true,
    () => false,
  );
// THE ENGINE WATERFALL: which engines can run a local model on this machine, the first choice first.
//   an Apple silicon Mac             TensorFold (MLX). On a macOS too old for it: llama.cpp
//   a Linux machine, x64 or arm64    Strata, when it has the memory for one of Strata's models, and llama.cpp below it. Otherwise llama.cpp alone
//   an Intel Mac                     llama.cpp
//   anything else                    none, and the page says so. (Windows: llama.cpp, from myfamilyoffice.ps1; inside WSL it is a Linux machine.)
// A test names the system it pretends to be (FO_PLATFORM).
export const PLATFORM = process.env.FO_PLATFORM || process.platform;
export const enginesFor = (platform, arch, { macosOk = true, poolGb = null } = {}) => {
  if (platform === 'darwin')
    return arch === 'arm64' ? (macosOk ? ['tensorfold'] : ['llama']) : arch === 'x64' ? ['llama'] : [];
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64'))
    return poolGb == null || STRATA_MODELS.some((m) => m.memGb + 6 <= poolGb) ? ['strata', 'llama'] : ['llama'];
  if (platform === 'win32' && (arch === 'x64' || arch === 'arm64')) return ['llama']; // llama.cpp's own Windows build
  return [];
};
export const engineFor = (platform, arch, o) => enginesFor(platform, arch, o)[0] || '';
const ENGINE_NAMES = { tensorfold: ENGINE.name, strata: STRATA.name, llama: LLAMA.name };
const num = (s) => {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
};
const verOf = (s) => {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(s));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
};
export const atLeast = (v, min) => {
  if (!v) return false;
  for (let i = 0; i < min.length; i++) {
    if ((v[i] || 0) > min[i]) return true;
    if ((v[i] || 0) < min[i]) return false;
  }
  return true;
};

// a command on PATH or in the usual install folders (a server started from an app often has a short PATH)
const BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin')];
// this app's own copy of Homebrew (brew.mjs), for a machine that has none: inside the app's own folder, where a test says, or where
// the runner said its state is kept
let BREW_HOME = '';
export const setBrewHome = (dir) => {
  BREW_HOME = dir;
};
export const brewHome = () =>
  process.env.FO_BREW_HOME ||
  BREW_HOME ||
  path.join(process.env.FO_STATE_DIR || path.join(os.homedir(), '.familyoffice', 'state'), 'homebrew');
// TensorFold's own installer puts a signed release here, with no compiler involved
export const engineHome = () => process.env.FO_TENSORFOLD_HOME || path.join(os.homedir(), '.tensorfold');
export async function which(name) {
  for (const dir of [
    path.join(engineHome(), 'bin'),
    ...String(process.env.PATH || '').split(path.delimiter),
    ...BIN_DIRS,
  ]) {
    if (!dir) continue;
    // on Windows a command is a .exe (or npm's .cmd)
    for (const n of process.platform === 'win32' ? [name + '.exe', name + '.cmd', name] : [name]) {
      const f = path.join(dir, n);
      if (await exists(f)) return f;
    }
  }
  return null;
}

// the same, unless a test names the binary (FO_BIN_TENSORFOLD, FO_BIN_BREW): then that file or nothing
export async function bin(name) {
  const o = process.env['FO_BIN_' + name.toUpperCase()];
  return o !== undefined ? ((await exists(o)) ? o : null) : which(name);
}

// llama.cpp as an engine (llama.mjs): the "llama" command on the machine (llama serve ...), an older "llama-server", or the pinned
// build this app unpacked into its own folder. own: true skips the machine's and names only this app's copy.
export const llamaDir = (stateDir) => path.join(stateDir, 'engines', 'llama-' + LLAMA.tag);
export const llamaCardDir = (stateDir) => llamaDir(stateDir) + '-vulkan';
export const ownLlamaIn = async (dir) =>
  (await fileNamed(dir, 'llama-server')) || (await fileNamed(dir, 'llama-server.exe'));
async function fileNamed(dir, name, depth = 0) {
  const inside = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) inside.push(path.join(dir, e.name));
    else if (e.name === name) return path.join(dir, e.name);
  }
  if (depth < 4)
    for (const d of inside) {
      const hit = await fileNamed(d, name, depth + 1);
      if (hit) return hit;
    }
  return null;
}
export async function findLlamaEngine(stateDir, { own = false } = {}) {
  if (!own) {
    const a = await bin('llama');
    if (a) return { file: a, pre: ['serve'], own: false };
    if (process.env.FO_BIN_LLAMA === undefined) {
      const b = await which('llama-server');
      if (b) return { file: b, pre: [], own: false };
    } // a test names the only one there is
  }
  if (!stateDir) return null;
  // this app's own: the build that uses a graphics card, where there is one (llama.mjs keeps that folder only while a card answers), else the processor build
  for (const dir of [llamaCardDir(stateDir), llamaDir(stateDir)]) {
    const c = await ownLlamaIn(dir);
    if (c) return { file: c, pre: [], own: true, card: dir === llamaCardDir(stateDir) };
  }
  const d = await fileNamed(llamaDir(stateDir), 'llama');
  return d ? { file: d, pre: ['serve'], own: true } : null;
}

// every node this machine has: the ones built for its own chip first, then newest first. Pi needs a newer one than the runner itself
// does, and a Node built for another chip (an Intel one on an Apple silicon Mac) is the last to be chosen, never the first.
async function nodes(stateDir) {
  const found = new Map();
  const add = async (f) => {
    if (!f || found.has(f) || !(await exists(f))) return;
    const r = await sh(f, ['-p', 'process.version + " " + process.arch']);
    const v = verOf(r.out);
    if (v) found.set(f, { v, arch: r.out.split(' ')[1] || '' });
  };
  await add(process.execPath);
  await add(await which('node'));
  if (stateDir) await add(path.join(stateDir, 'node', 'bin', 'node')); // and this app's own copy, when it has fetched one
  const nvm = path.join(os.homedir(), '.nvm/versions/node');
  for (const d of await readdir(nvm).catch(() => [])) await add(path.join(nvm, d, 'bin/node'));
  for (const d of BIN_DIRS) await add(path.join(d, 'node'));
  const chip = await machineArch();
  const own = (x) => (x.arch === chip ? 0 : 1);
  return [...found]
    .map(([file, { v, arch }]) => ({ file, v, version: v.join('.'), arch }))
    .sort((a, b) => own(a) - own(b) || b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2]);
}

export async function piInstalled(stateDir) {
  const pkg = path.join(stateDir, 'pi/node_modules', AGENT.pkg, 'package.json');
  try {
    const p = JSON.parse(await readFile(pkg, 'utf8'));
    const bin = typeof p.bin === 'string' ? p.bin : p.bin && (p.bin.pi || Object.values(p.bin)[0]);
    return { version: p.version, cli: path.join(path.dirname(pkg), bin) };
  } catch {
    return null;
  }
}

// Apple's Command Line Tools: Homebrew needs them, current, to build a formula. version null = installed but macOS has no record of which.
async function cltState() {
  if (PLATFORM !== 'darwin') return null;
  const p = await sh('xcode-select', ['-p']);
  if (!p.ok || !p.out) return { installed: false, version: null };
  const v = await sh('pkgutil', ['--pkg-info=com.apple.pkg.CLTools_Executables']);
  return { installed: true, path: p.out, version: (/version:\s*([\d.]+)/.exec(v.out) || [])[1] || null };
}
// an OpenSSL that can verify Ed25519 (macOS ships LibreSSL, which cannot): TensorFold's installer refuses to run without one
async function findOpenssl3() {
  if (process.env.FO_OPENSSL3 !== undefined) return process.env.FO_OPENSSL3 || null;
  for (const c of [
    await which('openssl'),
    '/opt/homebrew/opt/openssl@3/bin/openssl',
    '/usr/local/opt/openssl@3/bin/openssl',
  ]) {
    if (!c || !(await exists(c))) continue;
    const r = await sh(c, ['pkeyutl', '-help']);
    if (/-rawin/.test(r.out + r.err)) return c;
  }
  return null;
}

// THE CHIP, NOT THE NODE. A Node.js built for Intel runs on an Apple silicon Mac under Rosetta and says x64 about itself, so asking
// Node would call an M2 an Intel Mac. The machine is asked instead: macOS says whether the hardware is arm64 whatever is asking.
export async function machineArch() {
  if (process.env.FO_MACHINE_ARCH !== undefined) return process.env.FO_MACHINE_ARCH || process.arch;
  if (
    process.platform === 'darwin' &&
    process.arch !== 'arm64' &&
    (await sh('sysctl', ['-n', 'hw.optional.arm64'])).out.trim() === '1'
  )
    return 'arm64';
  return process.arch;
}

// WHAT A TRANSLATED NODE STARTS RUNS TRANSLATED TOO. So under an Intel Node on an Apple silicon Mac the engine's installer sees an
// Intel machine and refuses, Homebrew refuses its own folder, and a model would not load. native() gives the command that runs a
// program for the machine's own chip: itself when this Node is native, and through macOS's own /usr/bin/arch when it is not.
const ARCH_BIN = process.env.FO_BIN_ARCH || '/usr/bin/arch';
export const TRANSLATED =
  process.env.FO_TRANSLATED !== undefined
    ? process.env.FO_TRANSLATED === '1'
    : process.platform === 'darwin' && process.arch !== 'arm64' && (await machineArch()) === 'arm64';
export const native = (cmd, args = []) => (TRANSLATED ? [ARCH_BIN, ['-arm64', cmd, ...args]] : [cmd, args]);

// the graphics cards, by the driver's own tool where there is one (NVIDIA). A card of another make is not listed here: Strata's own
// plan decides what it can use, and says so.
async function cards() {
  const smi =
    process.env.FO_BIN_NVIDIA_SMI !== undefined
      ? (await exists(process.env.FO_BIN_NVIDIA_SMI))
        ? process.env.FO_BIN_NVIDIA_SMI
        : null
      : await which('nvidia-smi');
  if (!smi) return PLATFORM === 'win32' && process.env.FO_BIN_NVIDIA_SMI === undefined ? windowsCards() : [];
  const r = await sh(smi, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  return r.out
    .split('\n')
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((x) => x.length >= 2 && Number(x[1]) > 0)
    .map(([name, mb]) => ({ name, vramGb: Math.round((Number(mb) / 1024) * 10) / 10 }));
}
// Windows' Linux layer, asked on Windows itself: is there one, with a Linux in it? (wsl.exe answers in UTF-16: a NUL after every
// letter.) A test says FO_WSL: a name, or "none".
async function wslState() {
  if (PLATFORM !== 'win32') return null;
  if (process.env.FO_WSL !== undefined)
    return process.env.FO_WSL && process.env.FO_WSL !== 'none'
      ? { ready: true, distro: process.env.FO_WSL }
      : { ready: false, distro: '' };
  const r = await sh('wsl.exe', ['-l', '-q'], { timeout: 8000 });
  const names = String(r.out || '')
    .replace(/\0/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^docker-desktop/.test(l));
  return { ready: r.ok && names.length > 0, distro: names[0] || '' };
}
export const inWsl = () =>
  process.env.FO_IN_WSL !== undefined
    ? process.env.FO_IN_WSL === '1'
    : process.platform === 'linux' && (!!process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release()));
// a Windows PC's cards by name, whoever made them (nvidia-smi only knows NVIDIA's). Only cards of their own are counted: the
// graphics built into a processor share its memory and are not what makes a large model usable. Their memory is not read here.
export const isCard = (name) =>
  /NVIDIA|GeForce|\bRTX\b|\bGTX\b|Quadro|Radeon (RX|Pro)|\bArc\b/i.test(name) && !/Basic|Remote|Virtual/i.test(name);
async function windowsCards() {
  const r = await sh('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], {
    timeout: 15000,
  });
  return String(r.out || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(isCard)
    .map((name) => ({ name, vramGb: null }));
}
export async function measureHost(stateDir) {
  if (stateDir && !BREW_HOME) setBrewHome(path.join(stateDir, 'homebrew'));
  const mac = PLATFORM === 'darwin';
  const sys = async (k) => (mac ? (await sh('sysctl', ['-n', k])).out : '');
  const [chip, mem, perf, eff, wired, macos, df, vm, tfBin, brew, nodeList, piFound] = await Promise.all([
    sys('machdep.cpu.brand_string'),
    sys('hw.memsize'),
    sys('hw.perflevel0.physicalcpu'),
    sys('hw.perflevel1.physicalcpu'),
    sys('iogpu.wired_limit_mb'),
    mac ? sh('sw_vers', ['-productVersion']).then((r) => r.out) : '',
    sh('df', ['-k', os.homedir()]).then((r) => r.out),
    mac ? sh('vm_stat', []).then((r) => r.out) : '',
    bin('tensorfold'),
    bin('brew').then(async (b) => {
      const own = path.join(brewHome(), 'bin', 'brew');
      const may = process.env.FO_BIN_BREW === undefined || process.env.FO_BREW_HOME !== undefined;
      return b || (may && (await exists(own)) ? own : null);
    }),
    nodes(stateDir),
    piInstalled(stateDir),
  ]);
  const gb = (bytes) => Math.round((bytes / 2 ** 30) * 10) / 10;
  const dfRow = df.split('\n').pop().trim().split(/\s+/);
  // where there is no df (Windows), the file system is asked directly
  const fsNow = num(dfRow[3]) == null ? await statfs(os.homedir()).catch(() => null) : null;
  const freeKb = fsNow ? Math.round((fsNow.bavail * fsNow.bsize) / 1024) : num(dfRow[3]);
  // memory free right now: free + inactive + speculative pages (what macOS can hand over without swapping)
  const page = num((/page size of (\d+)/.exec(vm) || [])[1]) || 16384;
  const pages = (k) => num((new RegExp(k + ':\\s+(\\d+)').exec(vm) || [])[1]) || 0;
  const availNow = vm
    ? (pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')) * page
    : os.freemem();
  const tfVer = tfBin ? await sh(...native(tfBin, ['--version'])) : null;
  const clt = await cltState();
  const openssl3 = await findOpenssl3();
  const nodeForPi = nodeList.find((n) => atLeast(n.v, AGENT.node)) || null;
  const macV = verOf(macos);
  const arch = await machineArch();
  const arm = arch === 'arm64';
  const total = (Number(process.env.FO_MEMORY_GB) || 0) * 2 ** 30 || num(mem) || os.totalmem(); // a test names the memory it pretends to have
  const linux = PLATFORM === 'linux';
  const gpus = linux || PLATFORM === 'win32' ? await cards() : []; // on Windows the card is only reported: llama.cpp's build there runs on the processor
  const wsl = await wslState();
  const vramGb = Math.round(gpus.reduce((n, c) => n + c.vramGb, 0) * 10) / 10;
  const poolGb = Math.round((gb(total) + vramGb) * 10) / 10;
  // the waterfall for this machine as it is now: a macOS too old for TensorFold, or too little memory for any of Strata's models, goes one rung down
  const engines = enginesFor(PLATFORM, arch, {
    macosOk: atLeast(macV, ENGINE.minMacos),
    poolGb: linux ? poolGb : null,
  });
  const eng = engines[0] || '';
  const stBin = engines.includes('strata') ? await bin('strata') : null;
  const stVer = stBin ? await sh(stBin, ['--version']) : null;
  const lf = engines.includes('llama') || eng === 'tensorfold' ? await findLlamaEngine(stateDir) : null; // an Apple silicon Mac may run a Bonsai model on it
  const lfVer = lf ? await sh(lf.file, ['--version'], { timeout: 10000 }) : null;
  const llama = lf
    ? {
        path: lf.file,
        version:
          (verOf((lfVer.out + '\n' + lfVer.err).split('\n').find((l) => l.trim()) || '') || []).join('.') ||
          (lf.own ? LLAMA.tag : 'installed'),
        own: lf.own,
      }
    : null;
  const meminfo = linux ? await readFile('/proc/meminfo', 'utf8').catch(() => '') : '';
  const memFree = num((/MemAvailable:\s+(\d+)/.exec(meminfo) || [])[1]);
  const blockers = [];
  if (!eng)
    blockers.push(
      'A local model runs on a Mac, or on a Linux machine with an x64 or arm64 chip. This machine is ' +
        PLATFORM +
        ' on ' +
        arch +
        '. Your team can still run on Claude Code.',
    );
  return {
    measuredAt: Date.now(),
    chip: chip || os.cpus()[0]?.model || 'Unknown',
    arch,
    translated: arch !== process.arch, // translated: this Node is an Intel build running under Rosetta
    os: mac
      ? 'macOS ' + macos
      : PLATFORM === 'linux'
        ? 'Linux ' + os.release().split('-')[0]
        : PLATFORM === 'win32'
          ? 'Windows ' + os.release()
          : PLATFORM,
    engine: eng,
    engines,
    engineName: ENGINE_NAMES[eng] || ENGINE.name,
    gpus,
    inWsl: inWsl(), // a Linux inside Windows: the person's browser and files are Windows'
    vramGb,
    poolGb, // poolGb: RAM and graphics memory together, which is how Strata counts what a model needs
    memoryGb: gb(total),
    availableGb: memFree ? gb(memFree * 1024) : gb(availNow),
    cores: os.cpus().length,
    perfCores: num(perf),
    effCores: num(eff),
    diskFreeGb: freeKb == null ? null : Math.round(freeKb / 1024 / 1024),
    gpuLimitMb: num(wired) || 0, // 0 = the macOS default
    supported: blockers.length === 0,
    blockers,
    tools: {
      llama,
      engine:
        eng === 'llama'
          ? llama
          : eng === 'strata'
            ? stBin
              ? { path: stBin, version: (verOf(stVer.out + ' ' + stVer.err) || []).join('.') || 'installed' }
              : null
            : tfBin
              ? { path: tfBin, version: (tfVer && (verOf(tfVer.out) || []).join('.')) || 'installed' }
              : null,
      brew: brew || null,
      wsl, // Windows only: { ready, distro }
      node: nodeForPi ? { path: nodeForPi.file, version: nodeForPi.version } : null,
      nodeSeen: nodeList.map((n) => n.version),
      agent: piFound ? { version: piFound.version } : null,
      clt,
      openssl3,
    },
  };
}
