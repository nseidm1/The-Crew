// brew.mjs - HOMEBREW, HANDLED FOR THE CUSTOMER. Two things a setup needs of Homebrew, neither of which the customer should have to do:
//   1 A HOMEBREW TO USE. The one on the machine, if there is one. If there is none, this app fetches Homebrew's own files into its own
//     folder and uses that copy. No password is asked for and nothing outside this app's folder is written: the same way the start
//     script treats Node. A Homebrew in its own folder builds what it installs on this machine, so it is slower than a system-wide
//     one and needs Apple's Command Line Tools; it is used only where there is no other.
//     Homebrew publishes no checksum for its files: they are fetched over https from its own GitHub repository, and that is all the
//     check there is. A fetch that is cut off leaves nothing behind (it is unpacked beside the folder and moved in whole).
//   2 A RUN THAT RECOVERS. Another Homebrew already at work on the machine: this one waits for it and carries on. A formula left
//     installed but not linked by a run that was cut off: it is linked. A download left broken or half-fetched: what was left is
//     cleared and the command is run once more. Anything else is Homebrew's own error, said as it said it.
//   findBrew()                                 the machine's, or this app's own copy, or null
//   ensureBrew({ exec, onLine })               -> { ok, brew, own, fetched } | { ok: false, why }
//   brewDo(brew, args, { exec, onLine, ... })  -> the run's { code, tail }, with recovered: 'waited' | 'linked' | 'retried' when it had to
//   brewOutdated(brew, formula, { exec })      is a newer version of this formula out?  true | false | null (could not tell)
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bin, exists, brewHome, PLATFORM } from './host.mjs';

export const BREW_SOURCE = 'https://github.com/Homebrew/brew/tarball/master';
const ENV = { HOMEBREW_NO_ENV_HINTS: '1', HOMEBREW_NO_ANALYTICS: '1', HOMEBREW_NO_AUTO_UPDATE: '1' };
export const brewEnv = () => ({ ...process.env, ...ENV });

export const LOCKED =
  /another active homebrew|already locked|has already locked|operation already in progress|another .{0,24}brew.{0,24}(?:process|update) is/i;
export const UNLINKED = /already installed, it'?s just not linked|is not linked|brew link\b/i;
export const CUT_OFF =
  /sha-?256 mismatch|checksum mismatch|incomplete|interrupted|unexpected end of|premature end|failed to download|curl: \((?:18|28|56|92)\)|corrupt|partial(?:ly)? (?:download|install)|was not installed successfully/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ownBrew = () => path.join(brewHome(), 'bin', 'brew');

// a test that names the Homebrew to use (FO_BIN_BREW) gets that file or nothing, unless it also says where this app's own copy goes
const mayOwn = () => process.env.FO_BIN_BREW === undefined || process.env.FO_BREW_HOME !== undefined;
export const canOwnBrew = () => mayOwn() && (PLATFORM === 'darwin' || PLATFORM === 'linux');

export async function findBrew() {
  const b = await bin('brew');
  if (b) return b;
  return mayOwn() && (await exists(ownBrew())) ? ownBrew() : null;
}

// this app's own copy of Homebrew, fetched whole or not at all
async function fetchOwn({ exec, onLine = () => {} }) {
  const src = process.env.FO_BREW_TARBALL || BREW_SOURCE;
  if (process.env.FO_NO_NET === '1' && !process.env.FO_BREW_TARBALL)
    return { ok: false, why: 'this machine is not using the network, so Homebrew was not fetched' }; // a test run never reaches the real one
  const dir = brewHome();
  const part = dir + '.part';
  const tgz = dir + '.tar.gz';
  await rm(part, { recursive: true, force: true });
  await mkdir(part, { recursive: true });
  onLine('There is no Homebrew on this machine. Fetching its own files into ' + dir + ' (no password is needed).');
  const clean = async () => {
    await rm(part, { recursive: true, force: true });
    await rm(tgz, { force: true });
  };
  if (/^https?:\/\//.test(src)) {
    const got = await exec('/usr/bin/curl', ['-fsSL', '--retry', '2', '--connect-timeout', '20', src, '-o', tgz], {
      onLine,
      timeout: 5 * 60000,
    });
    if (got.code !== 0) {
      await clean();
      return { ok: false, why: 'Homebrew could not be fetched: ' + got.tail.slice(-1).join('') };
    }
  }
  const un = await exec('tar', ['-xzf', /^https?:\/\//.test(src) ? tgz : src, '--strip-components', '1', '-C', part], {
    timeout: 3 * 60000,
  });
  if (un.code !== 0 || !(await exists(path.join(part, 'bin', 'brew')))) {
    await clean();
    return {
      ok: false,
      why: 'Homebrew was fetched but could not be unpacked' + (un.code ? ': ' + un.tail.slice(-1).join('') : '.'),
    };
  }
  await rm(dir, { recursive: true, force: true });
  await rename(part, dir);
  await rm(tgz, { force: true });
  const says = await exec(ownBrew(), ['--version'], { env: brewEnv(), timeout: 3 * 60000 });
  if (says.code !== 0) {
    await rm(dir, { recursive: true, force: true });
    return { ok: false, why: 'The Homebrew that was fetched does not run here: ' + says.tail.slice(-1).join('') };
  }
  await writeFile(
    path.join(dir, '.familyoffice'),
    'This copy of Homebrew belongs to Family Office. Deleting the folder removes it.\n',
  );
  onLine('Homebrew is in place: ' + (says.tail[0] || 'ready'));
  return { ok: true };
}

export async function ensureBrew({ exec, onLine = () => {} }) {
  const have = await findBrew();
  if (have) return { ok: true, brew: have, own: have === ownBrew(), fetched: false };
  if (!canOwnBrew()) return { ok: false, why: 'Homebrew is not on this machine' };
  const got = await fetchOwn({ exec, onLine });
  return got.ok ? { ok: true, brew: ownBrew(), own: true, fetched: true } : got;
}

// one Homebrew command, with the recoveries above. formula: what the command is about, when it is about one.
export async function brewDo(
  brew,
  args,
  {
    exec,
    onLine = () => {},
    formula = '',
    waitMs = Number(process.env.FO_BREW_WAIT_MS) || 15000,
    waits = 40,
    ...opts
  } = {},
) {
  const go = () => exec(brew, args, { onLine, env: brewEnv(), ...opts });
  let r = await go();
  let recovered = '';
  for (let i = 0; r.code !== 0 && LOCKED.test(r.tail.join(' ')) && i < waits; i++) {
    if (!i) onLine('Another Homebrew is already at work on this machine. Waiting for it to finish.');
    await sleep(waitMs);
    r = await go();
    recovered = 'waited';
  }
  if (r.code === 0) return { ...r, recovered };
  const said = r.tail.join(' ');
  if (formula && UNLINKED.test(said)) {
    onLine('An earlier Homebrew run left ' + formula + ' installed but not linked. Linking it.');
    const l = await exec(brew, ['link', '--overwrite', formula], { onLine, env: brewEnv(), timeout: 5 * 60000 });
    return l.code === 0 ? { ...l, recovered: 'linked' } : { ...r, recovered };
  }
  if (CUT_OFF.test(said)) {
    onLine('An earlier Homebrew run was cut off. Clearing what it left and trying once more.');
    await exec(brew, ['cleanup', '-s', ...(formula ? [formula] : [])], { env: brewEnv(), timeout: 5 * 60000 });
    r = await go();
    return { ...r, recovered: r.code === 0 ? 'retried' : recovered };
  }
  return { ...r, recovered };
}

export async function brewOutdated(brew, formula, { exec }) {
  const r = await exec(brew, ['outdated', '--quiet', formula], { env: brewEnv(), timeout: 3 * 60000 });
  const out = r.tail.join('\n');
  if (LOCKED.test(out)) return null;
  // Homebrew answers 0 with nothing when it is current; with the name when it is not (and, in some versions, exits 1 then)
  const name = formula.split('/').pop();
  if (new RegExp('(^|\\n|/)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(out)) return true;
  return r.code === 0 ? false : null;
}
