// git-own.mjs - GIT, WHERE THE MACHINE HAS NONE. A workspace is a Git folder, so the team cannot make one, clone one or land a change
// without Git. A Mac and most Linux machines have it; a Windows PC usually does not, and the first thing a person did there
// ("Make it a Git folder and connect") stopped at "git is not installed". So where Git is missing it is fetched, without being asked:
//   Windows   Git for Windows' own minimal build (MinGit: made for exactly this, a program that brings its own Git), from its GitHub
//             release at a PINNED version, kept only if its SHA-256 is the one here, and unpacked into this app's own folder. No
//             installer runs, no administrator rights are asked for, and the PC's PATH is not changed: only the commands this app
//             starts find it. A Git the person installs later is used in its place.
//   macOS     Git comes with Apple's Command Line Tools. macOS is asked to install them (its own window, its own download), and the
//             person is told to press the button again when it has finished: this app cannot install Apple's tools itself.
//   Linux     installing a package needs the machine's password, which this app never asks for: it says what is missing.
//   ensureGit({ onLine }) -> { ok: true, already | fetched } | { ok: false, why }
// A test names the Git to use (FO_BIN_GIT: that file or nothing) and the build to fetch (FO_GIT_RELEASE).
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { exists, sh, PLATFORM } from './host.mjs';
import { download } from './eyes.mjs';

// Sizes and SHA-256 as GitHub's release listed them on 2026-11-15.
export const GIT_WIN = {
  version: '2.56.1',
  site: 'https://github.com/git-for-windows/git',
  tag: 'v2.56.1.windows.1',
  builds: {
    x64: {
      asset: 'MinGit-2.56.1-64-bit.zip',
      bytes: 39849768,
      sha256: '4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd',
    },
    arm64: {
      asset: 'MinGit-2.56.1-arm64.zip',
      bytes: 37983254,
      sha256: '96571e442e90523a90e5fd8661b4c4e43bc192910f3c6db938816e6955b4cc8c',
    },
  },
};
let home = '';
export const setGitHome = (stateDir) => {
  home = path.join(stateDir, 'tools', 'mingit-' + GIT_WIN.version);
};
const ownGit = () => path.join(home, 'cmd', 'git.exe');
const works = async (file) => (await sh(file, ['--version'], { timeout: 15000 })).ok;
// this app's own copy goes at the front of the PATH of this app's own process, so every command it starts finds Git
const adopt = () => {
  const dir = path.dirname(ownGit());
  const parts = String(process.env.PATH || '').split(path.delimiter);
  if (!parts.includes(dir)) process.env.PATH = [dir, ...parts].join(path.delimiter);
};
const releaseOf = () => {
  try {
    const t = JSON.parse(process.env.FO_GIT_RELEASE || 'null');
    if (t && t.url) return t;
  } catch {
    /* the pinned one */
  }
  const b = GIT_WIN.builds[process.arch === 'arm64' ? 'arm64' : 'x64'];
  return { ...b, url: GIT_WIN.site + '/releases/download/' + GIT_WIN.tag + '/' + b.asset };
};

let under = null; // one fetch at a time: a second caller waits for the first
export function ensureGit(opts = {}) {
  if (!under) under = find(opts).finally(() => (under = null));
  return under;
}
async function find({ onLine = () => {} } = {}) {
  const named = process.env.FO_BIN_GIT;
  if (named !== undefined ? await exists(named) : await works('git')) return { ok: true, already: true };
  if (home && named === undefined && (await exists(ownGit())) && (await works(ownGit()))) {
    adopt();
    return { ok: true, already: true, own: true };
  }
  if (PLATFORM === 'win32') {
    if (process.env.FO_NO_NET === '1' && !process.env.FO_GIT_RELEASE)
      return {
        ok: false,
        why: 'Git is not on this PC, and this machine is not using the network, so it was not fetched.',
      };
    if (!home) return { ok: false, why: 'Git is not on this PC, and this app has no folder of its own to put it in.' };
    const rel = releaseOf();
    onLine(
      'Git is not on this PC. Fetching its own copy for this app (about ' + Math.round(rel.bytes / 2 ** 20) + ' MB).',
    );
    await rm(home, { recursive: true, force: true });
    await mkdir(home, { recursive: true });
    const zip = path.join(home, 'git.zip');
    const got = await download({ url: rel.url, dest: zip, bytes: rel.bytes, sha: rel.sha256, label: 'Git' });
    if (!got.ok) {
      await rm(home, { recursive: true, force: true });
      return {
        ok: false,
        why: 'Git is not on this PC and could not be fetched: ' + String(got.why || 'no reason given').slice(0, 160),
      };
    }
    const un = await sh('tar', ['-xf', zip, '-C', home], { timeout: 180000 });
    await rm(zip, { force: true }).catch(() => {});
    if (!un.ok || !(await exists(ownGit())) || (named === undefined && !(await works(ownGit())))) {
      await rm(home, { recursive: true, force: true });
      return {
        ok: false,
        why: 'Git was fetched but does not run on this PC. Install Git for Windows, then press the button again.',
      };
    }
    adopt();
    onLine('Git ' + GIT_WIN.version + " is in this app's own folder.");
    return { ok: true, fetched: true, own: true };
  }
  if (PLATFORM === 'darwin') {
    // Apple's own window: nothing is installed by this app, and nothing opens on a machine nobody is sitting at
    if (process.env.FO_NO_OPEN !== '1' && process.env.FO_NO_NET !== '1') await sh('xcode-select', ['--install']);
    return {
      ok: false,
      why: "Git is not on this Mac. It comes with Apple's Command Line Tools, and macOS is asking to install them now. Accept, let it finish, then press the button again.",
    };
  }
  return {
    ok: false,
    why: "Git is not on this machine. Install it with your system's software installer, then press the button again.",
  };
}
