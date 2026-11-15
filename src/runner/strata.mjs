// strata.mjs - STRATA, the engine for a machine that is not an Apple silicon Mac (github.com/Niko1221/Strata; TensorFold is MLX, and
// MLX is Apple silicon only). Every command here is Strata's own documented one (docs/INSTALL.md, docs/TERMINAL_LAUNCH.md and
// docs/AI_SETUP.md in its repository): its one-line Terminal install, "strata launch --plan" to ask what a model needs before anything
// is downloaded, "strata launch ... --yes --no-tui" to download and serve it, and "strata launch --stop" to stop it.
//   strataVersion()                      the installed Terminal's version, or null
//   installStrata({ stateDir, onLine })  its own installer, fetched from its latest release and run; nothing else on the machine changes
//   planStrata(m)                        what Strata says it would do for this model: the downloads that are missing, and their size
//   launchStrata(m, { onLine })          download what is missing, serve it on a port of this app's own, wait until it answers
//   stopStrata()                         stop the model THIS APP started, and only that one
// THE MODEL THIS APP STARTS IS ITS OWN. It is launched under a preset named for this app on a free port, so it runs beside a Strata
// the customer may already use, and stopping it never stops theirs. It is reached on 127.0.0.1 only and needs no key.
// Strata decides what fits: its plan is shown, and a plan that names no way to run the model stops the setup there.
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { STRATA } from '../js/catalog.js';
import { bin, sh } from './host.mjs';
import { run } from './engine.mjs';

const PRESET = 'Family Office';
const CONTEXT = '32k';
const freePort = () =>
  new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
const jsonIn = (text) => {
  const a = String(text).indexOf('{');
  const b = String(text).lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(String(text).slice(a, b + 1));
  } catch {
    return null;
  }
};
const gb = (bytes) => Math.round((Number(bytes) / 2 ** 30) * 10) / 10;

export async function strataVersion() {
  const b = await bin('strata');
  if (!b) return null;
  const r = await sh(b, ['--version'], { timeout: 15000 });
  return (/(\d+\.\d+\.\d+)/.exec(r.out + ' ' + r.err) || [])[1] || 'installed';
}

// force: run the installer though Strata is here already (an update: updates.mjs)
export async function installStrata({ stateDir, onLine, force = false }) {
  if (!force && (await bin('strata'))) return { ok: true, already: true };
  let script = process.env.FO_STRATA_INSTALL_SH;
  if (!script) {
    if (process.env.FO_NO_NET === '1')
      return { ok: false, why: 'this machine is not using the network, so Strata was not installed' }; // a test run never fetches the real installer
    try {
      const res = await fetch(STRATA.installer, { redirect: 'follow' });
      if (!res.ok) throw new Error('status ' + res.status);
      script = path.join(stateDir, 'strata-install.sh');
      await mkdir(stateDir, { recursive: true });
      await writeFile(script, await res.text());
    } catch (err) {
      return { ok: false, why: "Strata's installer could not be fetched: " + String(err.message).slice(0, 80) };
    }
  }
  const r = await run('/bin/sh', [script], { onLine, timeout: 20 * 60000 });
  if (r.code !== 0) return { ok: false, why: "Strata's installer stopped: " + r.tail.slice(-2).join(' / ') };
  return (await bin('strata'))
    ? { ok: true, already: false }
    : {
        ok: false,
        why: "Strata's installer finished, but no strata command was found afterwards (it is normally ~/.local/bin/strata).",
      };
}

const launchArgs = (m) => ['launch', '--family', m.family, '--model', m.pack, '--context', CONTEXT];
// what Strata itself says it would do: read as JSON where it gives JSON, and kept as its own words where it does not
export async function planStrata(m) {
  const b = await bin('strata');
  if (!b) return { ok: false, why: 'Strata is not installed.' };
  const r = await sh(b, [...launchArgs(m), '--plan', '--output', 'json'], { timeout: 120000 });
  const j = jsonIn(r.out);
  if (!r.ok && !j)
    return {
      ok: false,
      why: 'Strata could not plan this model: ' + (r.err || r.out).split('\n').filter(Boolean).pop().slice(0, 200),
    };
  const list = j && Array.isArray(j.downloads) ? j.downloads : j && Array.isArray(j.missing) ? j.missing : [];
  const bytes =
    j && Number(j.total_bytes || j.download_bytes) > 0
      ? Number(j.total_bytes || j.download_bytes)
      : list.reduce((n, d) => n + (Number(d && (d.bytes || d.size)) || 0), 0);
  const cannot =
    j &&
    (j.error || j.unavailable || (j.backend && /unavailable|unsupported/i.test(String(j.backend.status || j.backend))));
  if (cannot)
    return {
      ok: false,
      why:
        'Strata says it cannot run this model here: ' +
        String(j.error || j.unavailable || 'its engine for this machine is not available').slice(0, 200),
    };
  return {
    ok: true,
    plan: j,
    downloads: list.length,
    gb: bytes ? gb(bytes) : null,
    says: j ? '' : r.out.split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 240),
  };
}
const answers = async (base) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(base + '/v1/models', { signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    return ((j.data || [])[0] || {}).id || 'strata';
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};
// download what is missing and serve it. The command returns once the server is up (--no-tui), so its lines are the progress.
export async function launchStrata(m, { onLine = () => {} } = {}) {
  const b = await bin('strata');
  if (!b) return { ok: false, why: 'Strata is not installed.' };
  await stopStrata().catch(() => {}); // an earlier run of this app's own, if one was left: only the preset named for this app is ever stopped
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  const t0 = Date.now();
  // never --restart: that would replace a model the customer is running themself. On a port of its own this one runs beside theirs,
  // and Strata says so if the two do not fit together. A first download can take hours.
  const r = await run(
    b,
    [
      ...launchArgs(m),
      '--port',
      String(port),
      '--access',
      'local',
      '--no-api-key',
      '--save-preset',
      PRESET,
      '--yes',
      '--no-tui',
    ],
    { onLine, timeout: 12 * 3600000 },
  );
  if (r.code !== 0)
    return { ok: false, why: 'Strata did not start the model: ' + r.tail.slice(-2).join(' / ').slice(0, 300) };
  for (let i = 0; i < 120; i++) {
    const model = await answers(base);
    if (model) return { ok: true, base, port, model, seconds: Math.round((Date.now() - t0) / 100) / 10 };
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  return {
    ok: false,
    why: 'Strata said the model was started, but nothing answered at ' + base + ' within two minutes.',
  };
}
export async function stopStrata() {
  const b = await bin('strata');
  if (!b) return false;
  const r = await sh(b, ['launch', '--stop', '--preset', PRESET], { timeout: 60000 });
  return r.ok;
}
