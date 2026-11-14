// github.mjs - the customer signs in to GitHub from the Workspace page, with no server and no secret of ours (js/github.js).
//   THE DEVICE FLOW   the runner asks GitHub for a short code, the page shows it, the customer types it at github.com/login/device and
//                     approves in their own browser. The runner asks GitHub every few seconds whether they have, and is handed the
//                     token when they do. The page never sees the token; nothing of it is sent anywhere but GitHub.
//   OR THE gh COMMAND when the machine already has GitHub's own command signed in, that sign-in can be used as it is. Its token is
//                     asked for each time it is needed and is never copied.
//   WHEN gh IS NOT THERE, OR IS NOT SIGNED IN   the page is told which. Not there: at the customer's press, one pinned release of
//                     GitHub's own build is fetched from GitHub, checked by its SHA-256, and unpacked into this app's folder (nothing
//                     is installed on the machine at large, and a gh the customer already has is never touched). Not signed in: gh's
//                     own web sign-in is started, and the one-time code it gives is shown on the page instead of in a terminal. The
//                     customer approves on GitHub; gh keeps its sign-in where it always does, and this app uses it through gh.
// The token from the device flow is kept in this app's folder, readable only by the customer's own user. Signing out here deletes it;
// taking the app's access away altogether is done in GitHub's own settings (Applications).
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { GITHUB } from '../js/github.js';
import { bin, sh } from './host.mjs';
import { download } from './eyes.mjs';

export function createGithub(stateDir) {
  const file = path.join(stateDir, 'github.json');
  const LOGIN = process.env.FO_GITHUB_LOGIN || 'https://github.com';
  const API = process.env.FO_GITHUB_API || 'https://api.github.com';
  let live = GITHUB;
  let flow = null;
  let run = 0;
  const clientId = () =>
    process.env.FO_GITHUB_CLIENT === 'none' ? '' : process.env.FO_GITHUB_CLIENT || live.clientId || ''; // none: a test of the app as it is before any Client ID is set
  const load = async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = async (o) => {
    await mkdir(stateDir, { recursive: true });
    await writeFile(file, JSON.stringify(o), { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
  };
  const form = (o) =>
    Object.entries(o)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
  const ask = async (route, params) =>
    (
      await fetch(LOGIN + route, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: form(params),
        signal: AbortSignal.timeout(15000),
      })
    ).json();
  // GitHub's own command, pinned: v2.103.3 (published 2026-10-26), with each build's size and SHA-256 as GitHub's release API gives them.
  // FO_GH_RELEASE / FO_GH_FILES: another address and build, which is how the self-test stands in for the release.
  const GH_API = {
    version: '2.103.3',
    builds: {
      'darwin-arm64': {
        file: 'gh_2.103.3_macOS_arm64.zip',
        bytes: 14106091,
        sha256: 'd700207eae9ae98fe2b89535c2c087c07823d4628c56364695a5a07ef311c062',
      },
      'darwin-x64': {
        file: 'gh_2.103.3_macOS_amd64.zip',
        bytes: 15702601,
        sha256: 'a2f86418f4350ae6e9ec60d5000bdf7665728436946a97fc27fe50e6ae752682',
      },
      'linux-x64': {
        file: 'gh_2.103.3_linux_amd64.tar.gz',
        bytes: 15031972,
        sha256: '4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d',
      },
      'linux-arm64': {
        file: 'gh_2.103.3_linux_arm64.tar.gz',
        bytes: 13661485,
        sha256: 'ee32df2323c8847f5fac6cb6b4b69ca75828e9329a8f22f677021f7b3306ce63',
      },
    },
  };
  const ghBuild = () => {
    if (process.env.FO_GH_FILES) {
      try {
        return JSON.parse(process.env.FO_GH_FILES);
      } catch {
        return null;
      }
    }
    return GH_API.builds[process.platform + '-' + process.arch] || null;
  };
  const ghDir = path.join(stateDir, 'tools', 'gh-' + GH_API.version);
  const findIn = async (dir, depth = 0) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const f = path.join(dir, e.name);
      if (e.isFile() && e.name === 'gh' && path.basename(dir) === 'bin') return f;
      if (e.isDirectory() && depth < 3) {
        const got = await findIn(f, depth + 1);
        if (got) return got;
      }
    }
    return null;
  };
  const ghBin = async () => (await bin('gh')) || (await findIn(ghDir)); // the machine's own first; then the one this app fetched
  let job = null;
  let ghChild = null; // job: the install under way or last tried
  const ghToken = async () => {
    const g = await ghBin();
    if (!g) return null;
    const r = await sh(g, ['auth', 'token'], { timeout: 8000 });
    const t = String(r.out || '').trim();
    return r.ok !== false && /^[A-Za-z0-9_]{20,}$/.test(t) ? t : null;
  };
  const token = async () => {
    const got = await load();
    return got.via === 'gh' ? ghToken() : got.token || null;
  };
  const api = async (route) => {
    const t = await token();
    if (!t) throw new Error('not signed in to GitHub');
    const r = await fetch(API + route, {
      headers: { authorization: 'Bearer ' + t, accept: 'application/vnd.github+json', 'user-agent': 'familyoffice' },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 401) {
      await rm(file, { force: true });
      throw new Error('GitHub no longer accepts that sign-in. Sign in again.');
    }
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    return r.json();
  };

  const send = async (route, body) => {
    const t = await token();
    if (!t) throw new Error('Sign in to GitHub first.');
    const r = await fetch(API + route, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + t,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'familyoffice',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new Error(
        'GitHub said: ' +
          String(j.message || r.status).slice(0, 160) +
          (j.errors && j.errors[0] && j.errors[0].message
            ? ' (' + String(j.errors[0].message).slice(0, 120) + ')'
            : ''),
      );
    return j;
  };
  const self = {
    token, // for git itself (runner/repo.mjs): asked for when a command needs it, and never kept anywhere else
    async who() {
      const got = await load();
      return got.login ? { name: got.login, email: got.login + '@users.noreply.github.com' } : null;
    }, // whose name the team's commits carry
    // a new repository on the customer's own account, private unless they say public, with a first commit so it can be cloned and worked in at once
    async create({ name, private: priv = true, description = '' }) {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(String(name)) || /^\.+$/.test(String(name)))
        throw new Error('A repository name is letters, digits, dots, dashes and underscores, with no spaces.');
      const j = await send('/user/repos', {
        name: String(name),
        private: !!priv,
        description: String(description || '').slice(0, 200),
        auto_init: true,
      });
      return { name: j.full_name, private: !!j.private, branch: j.default_branch || 'main' };
    },
    async openPull({ repo, head, base, title, body }) {
      const j = await send('/repos/' + repo + '/pulls', { title, head, base, body: body || '' });
      return { url: j.html_url, number: j.number };
    },
    use(cfg) {
      if (cfg && typeof cfg === 'object') live = cfg;
    }, // the owner's panel changed js/github.js
    async status() {
      const got = await load();
      const g = await ghBin();
      return {
        configured: !!clientId(),
        gh: !!g,
        ghSignedIn: g ? !!(await ghToken()) : false,
        canInstall: !!ghBuild(),
        ghJob: job ? { state: job.state, why: job.why || '', pct: Math.round((job.pct || 0) * 100) } : null,
        signedIn: !!(got.login && (got.via === 'gh' || got.token)),
        login: got.login || null,
        via: got.via || null,
        flow: flow
          ? {
              state: flow.state,
              code: flow.state === 'waiting' ? flow.code : null,
              uri: flow.uri,
              why: flow.why || '',
              via: flow.via || 'device',
            }
          : null,
      };
    },
    // start the device flow: resolves with the code to show
    async start() {
      if (!clientId()) throw new Error('GitHub sign-in is not set up for this app yet.');
      const d = await ask('/login/device/code', { client_id: clientId(), scope: live.scope || 'repo' });
      if (!d.device_code)
        throw new Error(
          'GitHub would not start a sign-in: ' + String(d.error_description || d.error || 'no code').slice(0, 120),
        );
      const mine = ++run;
      const current = (flow = {
        state: 'waiting',
        code: d.user_code,
        uri: d.verification_uri || LOGIN + '/login/device',
        why: '',
      });
      const until = Date.now() + (Number(d.expires_in) || 900) * 1000;
      let every = Number(process.env.FO_GITHUB_POLL_MS) || Math.max(5, Number(d.interval) || 5) * 1000;
      (async () => {
        while (mine === run && Date.now() < until) {
          await new Promise((r) => setTimeout(r, every));
          if (mine !== run) return;
          let reply;
          try {
            reply = await ask('/login/oauth/access_token', {
              client_id: clientId(),
              device_code: d.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            });
          } catch {
            continue;
          }
          if (reply.access_token) {
            try {
              const u = await (
                await fetch(API + '/user', {
                  headers: {
                    authorization: 'Bearer ' + reply.access_token,
                    accept: 'application/vnd.github+json',
                    'user-agent': 'familyoffice',
                  },
                })
              ).json();
              await save({
                via: 'device',
                token: reply.access_token,
                login: u.login || 'your account',
                at: Date.now(),
              });
              current.state = 'done';
            } catch {
              current.state = 'failed';
              current.why = 'GitHub approved it, but your account could not be read.';
            }
            return;
          }
          if (reply.error === 'slow_down') every += 5000;
          else if (reply.error && reply.error !== 'authorization_pending') {
            current.state = 'failed';
            current.why =
              reply.error === 'access_denied'
                ? 'You declined it on GitHub.'
                : reply.error === 'expired_token'
                  ? 'The code ran out before it was approved.'
                  : String(reply.error_description || reply.error).slice(0, 120);
            return;
          }
        }
        if (mine === run && current.state === 'waiting') {
          current.state = 'failed';
          current.why = 'The code ran out before it was approved.';
        }
      })();
      return { code: current.code, uri: current.uri };
    },
    // fetch GitHub's own command for this app, then start its sign-in
    async ghInstall() {
      if (await ghBin()) return self.ghLogin();
      if (job && job.state === 'installing') return self.status();
      const b = ghBuild();
      if (!b) throw new Error('GitHub publishes no build of its command for this machine.');
      if (process.env.FO_NO_NET === '1' && !process.env.FO_GH_RELEASE)
        throw new Error("This machine is not using the network, so GitHub's command was not fetched.");
      const install = (job = { state: 'installing', why: '', pct: 0 });
      const from = (
        process.env.FO_GH_RELEASE || 'https://github.com/cli/cli/releases/download/v' + GH_API.version
      ).replace(/\/$/, '');
      (async () => {
        try {
          await mkdir(ghDir, { recursive: true });
          const dest = path.join(ghDir, b.file);
          const got = await download({
            url: from + '/' + b.file,
            dest,
            bytes: b.bytes,
            sha: b.sha256,
            label: "GitHub's command",
            onBytes: (n) => {
              install.pct = Math.min(0.99, (Number(n) || 0) / b.bytes);
            },
          });
          if (!got.ok) throw new Error(got.why);
          const un = b.file.endsWith('.zip')
            ? await sh('unzip', ['-q', '-o', dest, '-d', ghDir], { timeout: 120000 })
            : await sh('tar', ['-xzf', dest, '-C', ghDir], { timeout: 120000 });
          if (!un.ok)
            throw new Error(
              'it could not be unpacked: ' +
                String(un.err || '')
                  .split('\n')
                  .pop()
                  .slice(0, 160),
            );
          await rm(dest, { force: true });
          const g = await findIn(ghDir);
          if (!g) throw new Error('the build was unpacked, but it holds no gh command');
          await chmod(g, 0o755).catch(() => {});
          install.state = 'done';
          install.pct = 1;
          await self.ghLogin().catch((e) => {
            install.why = String((e && e.message) || e).slice(0, 200);
          }); // and its sign-in starts at once
        } catch (e) {
          install.state = 'failed';
          install.why = String((e && e.message) || e).slice(0, 240);
          await rm(ghDir, { recursive: true, force: true }).catch(() => {});
        }
      })();
      return self.status();
    },
    // gh's own web sign-in, with its one-time code shown on the page. gh is told there is no browser to open: the page gives the link.
    async ghLogin() {
      const g = await ghBin();
      if (!g) throw new Error("GitHub's command is not on this machine yet.");
      if (await ghToken()) return self.useGh();
      if (flow && flow.via === 'gh' && (flow.state === 'starting' || flow.state === 'waiting')) return self.status();
      const mine = ++run;
      const current = (flow = {
        state: 'starting',
        code: null,
        uri: 'https://github.com/login/device',
        why: '',
        via: 'gh',
      });
      let out = '';
      const child = (ghChild = spawn(
        g,
        ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'],
        {
          env: { ...process.env, GH_BROWSER: 'true', BROWSER: 'true', NO_COLOR: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      ));
      const read = (d) => {
        out = (out + d).slice(-4000);
        const m = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(out);
        if (m && current.state === 'starting') {
          current.code = m[1];
          current.state = 'waiting';
        }
      };
      child.stdout.on('data', read);
      child.stderr.on('data', read);
      try {
        child.stdin.write('\n');
        child.stdin.end();
      } catch {
        /* it does not read: it prints the address instead */
      }
      const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60000);
      child.on('error', (e) => {
        clearTimeout(timer);
        if (mine === run) {
          current.state = 'failed';
          current.why = String(e.message || e).slice(0, 160);
        }
      });
      child.on('close', async (code) => {
        clearTimeout(timer);
        if (ghChild === child) ghChild = null;
        if (mine !== run) return;
        if (code === 0 && (await ghToken())) {
          try {
            await self.useGh();
            current.state = 'done';
          } catch (e) {
            current.state = 'failed';
            current.why = String((e && e.message) || e).slice(0, 160);
          }
        } else {
          current.state = 'failed';
          current.why = (out.trim().split('\n').filter(Boolean).pop() || "GitHub's command stopped without signing in")
            .replace(/^(error|failed)[: ]+/i, '')
            .slice(0, 160);
        }
      });
      return self.status();
    },
    // use the sign-in the gh command already has on this machine
    async useGh() {
      const t = await ghToken();
      if (!t) throw new Error("GitHub's command on this machine is not signed in yet.");
      const u = await (
        await fetch(API + '/user', {
          headers: {
            authorization: 'Bearer ' + t,
            accept: 'application/vnd.github+json',
            'user-agent': 'familyoffice',
          },
        })
      ).json();
      if (!u.login) throw new Error('GitHub did not recognise that sign-in.');
      await save({ via: 'gh', login: u.login, at: Date.now() });
      return self.status();
    },
    async signOut() {
      run++;
      flow = null;
      if (ghChild) {
        try {
          ghChild.kill('SIGTERM');
        } catch {
          /* already gone */
        }
        ghChild = null;
      }
      await rm(file, { force: true });
      return self.status();
    }, // this app's sign-in only: gh's own, if it has one, is gh's
    async repos(q) {
      const all = await api('/user/repos?per_page=100&sort=pushed');
      const want = String(q || '').toLowerCase();
      return (Array.isArray(all) ? all : [])
        .filter((r) => !want || String(r.full_name).toLowerCase().includes(want))
        .slice(0, 30)
        .map((r) => ({
          name: r.full_name,
          private: !!r.private,
          branch: r.default_branch || 'main',
          pushed: r.pushed_at || null,
        }));
    },
  };
  return self;
}
