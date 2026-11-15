// updates.mjs - WHAT A SETUP ALREADY FOUND ON THE MACHINE IS BROUGHT UP TO DATE. A setup used to install what was missing and leave
// the rest as it was, so a machine set up months ago kept the engine and the agent of that day. Now each thing this app depends
// on is asked whether a newer one is out, and updated the way it was installed:
//   an engine or llama.cpp that Homebrew installed     brew upgrade, when Homebrew says it is outdated
//   TensorFold from its own signed installer            the installer again (it installs the current signed release)
//   Strata                                              its own installer again, when its latest release is newer than the one here
//   the agent (Pi)                                      npm install <package>@latest, when the registry has a newer one
// (This app's own copy of llama.cpp follows the build pinned in the catalog, and its own copy of Node.js is the start script's.)
// THE RULES. An update that fails never stops a setup: the version already here is used and the line says so. Each thing is asked
// about once a day at most. Nothing the customer installed by hand, outside Homebrew, is touched. With FO_NO_NET nothing is asked.
import path from 'node:path';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { AGENT, ENGINE, STRATA } from '../js/catalog.js';
import { bin, engineHome, exists, piInstalled } from './host.mjs';
import { brewDo, brewOutdated, findBrew } from './brew.mjs';
import { engineVersion, installSigned, run, runNative } from './engine.mjs';
import { installStrata, strataVersion } from './strata.mjs';
import { findNpm, privateNode, privateNpm } from './node.mjs';

const DAY = 20 * 3600 * 1000;
const offline = (testVar) => process.env.FO_NO_NET === '1' && process.env[testVar] === undefined;
const stamps = (stateDir) => path.join(stateDir, 'updates.json');

// is it time to ask about this again? Asked once a day at most (a test says FO_UPDATE_ALWAYS=1).
export async function due(stateDir, key, every = DAY) {
  if (process.env.FO_UPDATE_ALWAYS === '1') return true;
  let seen = {};
  try {
    seen = JSON.parse(await readFile(stamps(stateDir), 'utf8'));
  } catch {
    seen = {};
  }
  if (Date.now() - (Number(seen[key]) || 0) < every) return false;
  seen[key] = Date.now();
  await mkdir(stateDir, { recursive: true });
  await writeFile(stamps(stateDir), JSON.stringify(seen));
  return true;
}

const parts = (v) => (/(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v)) || []).slice(1).map((n) => Number(n || 0));
// is `latest` a newer version than `have`? false when either cannot be read as a version
export function newer(latest, have) {
  const a = parts(latest);
  const b = parts(have);
  if (!a.length || !b.length) return false;
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// did Homebrew put this command here? (its real file is in a Cellar, or in a Homebrew folder; a test says FO_BREW_MANAGED=1)
export async function brewManaged(file) {
  if (process.env.FO_BREW_MANAGED !== undefined) return process.env.FO_BREW_MANAGED === '1';
  const real = await realpath(file).catch(() => file);
  return /\/(?:Cellar|homebrew|linuxbrew)\//i.test(real);
}

const kept = (onLine, what, why) =>
  onLine('The update to ' + what + ' did not go through (' + why + '). Carrying on with the version already here.');

// a formula Homebrew installed: upgraded when Homebrew says a newer one is out
export async function updateFormula({ stateDir, formula, name, file, onLine = () => {} }) {
  if (!file || !(await brewManaged(file))) return { did: false, why: 'not installed by Homebrew' };
  if (offline('FO_BIN_BREW')) return { did: false, why: 'offline' };
  if (!(await due(stateDir, 'brew:' + formula))) return { did: false, why: 'asked today' };
  const brew = await findBrew();
  if (!brew) return { did: false, why: 'no Homebrew' };
  const out = await brewOutdated(brew, formula, { exec: runNative });
  if (out !== true) return { did: false, why: out === false ? 'current' : 'could not tell' };
  onLine('A newer ' + name + ' is out. Updating it through Homebrew.');
  const r = await brewDo(brew, ['upgrade', formula], { exec: runNative, onLine, formula, timeout: 20 * 60000 });
  if (r.code !== 0) {
    kept(onLine, name, r.tail.slice(-1).join('') || 'Homebrew stopped');
    return { did: false, failed: true, why: r.tail.slice(-1).join('') };
  }
  return { did: true };
}

// TensorFold, however it got here
export async function updateEngine({ stateDir, onLine = () => {} }) {
  const file = await bin('tensorfold');
  if (!file) return { did: false, why: 'not installed' };
  if (await brewManaged(file))
    return updateFormula({ stateDir, formula: ENGINE.formula, name: ENGINE.name, file, onLine });
  const real = await realpath(file).catch(() => file);
  const home = await realpath(engineHome()).catch(() => engineHome());
  if (!real.startsWith(home + path.sep)) return { did: false, why: 'installed by hand' }; // not ours to change
  if (offline('FO_INSTALL_SH')) return { did: false, why: 'offline' };
  if (!(await due(stateDir, 'engine:signed'))) return { did: false, why: 'asked today' };
  const was = await engineVersion();
  const r = await installSigned({ onLine: () => {}, stateDir });
  if (!r.ok) {
    kept(onLine, ENGINE.name, r.why);
    return { did: false, failed: true, why: r.why };
  }
  const now = await engineVersion();
  if (newer(now, was)) onLine(ENGINE.name + ' was updated from ' + was + ' to ' + now + '.');
  return { did: newer(now, was), from: was, to: now };
}

// Strata: its latest release against the one here
export async function updateStrata({ stateDir, onLine = () => {} }) {
  const have = await strataVersion();
  if (!have) return { did: false, why: 'not installed' };
  if (offline('FO_STRATA_LATEST')) return { did: false, why: 'offline' };
  if (!(await due(stateDir, 'strata'))) return { did: false, why: 'asked today' };
  let latest = process.env.FO_STRATA_LATEST || '';
  if (!latest)
    try {
      const api = STRATA.site.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases/latest';
      const res = await fetch(api, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/vnd.github+json' },
      });
      latest = res.ok ? String((await res.json()).tag_name || '') : '';
    } catch {
      latest = '';
    }
  if (!newer(latest, have)) return { did: false, why: latest ? 'current' : 'could not tell' };
  onLine(
    'A newer ' +
      STRATA.name +
      ' is out (' +
      latest.replace(/^v/, '') +
      '; this machine has ' +
      have +
      '). Updating it.',
  );
  const r = await installStrata({ stateDir, onLine, force: true });
  if (!r.ok) {
    kept(onLine, STRATA.name, r.why);
    return { did: false, failed: true, why: r.why };
  }
  return { did: true, from: have, to: await strataVersion() };
}

// the agent: the registry's latest against the one in this app's folder
export async function updateAgent({ stateDir, nodeBin, onLine = () => {} }) {
  if (process.env.FO_PI_CLI) return { did: false, why: 'a test double' };
  const have = await piInstalled(stateDir);
  if (!have) return { did: false, why: 'not installed' };
  if (offline('FO_NPM_CLI')) return { did: false, why: 'offline' };
  if (!(await due(stateDir, 'agent'))) return { did: false, why: 'asked today' };
  const own = privateNode(stateDir);
  let npmCli = process.env.FO_NPM_CLI || null;
  if (!npmCli && (await exists(own))) {
    nodeBin = own;
    npmCli = privateNpm(stateDir);
  } else if (!npmCli && nodeBin) npmCli = await findNpm(nodeBin);
  if (!nodeBin || !npmCli) return { did: false, why: 'no npm to ask' };
  const env = { ...process.env, PATH: path.dirname(nodeBin) + path.delimiter + process.env.PATH };
  const seen = await run(nodeBin, [npmCli, 'view', AGENT.pkg, 'version'], { timeout: 30000, env });
  const latest = seen.code === 0 ? seen.tail.filter((l) => /^\d+\.\d+/.test(l)).pop() || '' : '';
  if (!newer(latest, have.version)) return { did: false, why: latest ? 'current' : 'could not tell' };
  onLine('A newer ' + AGENT.name + ' is out (' + latest + '; this machine has ' + have.version + '). Updating it.');
  const r = await run(
    nodeBin,
    [
      npmCli,
      'install',
      '--prefix',
      path.join(stateDir, 'pi'),
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      AGENT.pkg + '@' + latest,
    ],
    { onLine, timeout: 6 * 60000, env },
  );
  if (r.code !== 0) {
    kept(onLine, AGENT.name, r.tail.slice(-1).join('') || 'npm stopped');
    return { did: false, failed: true, why: r.tail.slice(-1).join('') };
  }
  return { did: true, from: have.version, to: latest };
}
