// repo.mjs - the team's hands on GitHub: clone a repository, and LAND a change in it the way the customer chose.
//   clone    into this app's own folder (<state>/work/<owner>/<name>): never the customer's own working copy of the repository
//   land     the ONE way anything the team changed leaves this machine. How is the customer's setting (the Workspace page):
//              pr       a new branch, pushed, and a pull request opened against the default branch. Nothing reaches it until they merge.
//              direct   a commit on the default branch, pushed.
//   discard  throw away what was changed in the clone
// Git is given the customer's GitHub sign-in for one command at a time, in the command's environment: it is never written into the
// clone's own settings, never put on a command line, and never kept. The commits are in the customer's name (their GitHub login).
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const HOST = () => (process.env.FO_GITHUB_GIT || 'https://github.com').replace(/\/$/, ''); // a test names a stand-in
export const validRepo = (r) =>
  /^[A-Za-z0-9][\w.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/.test(String(r)) && !String(r).includes('..');
export const cloneDir = (stateDir, repo) => path.join(stateDir, 'work', ...String(repo).split('/'));
const tail = (r) =>
  String(r.err || r.out || 'no reason given')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-2)
    .join(' / ')
    .replace(/x-access-token:[^@\s]+/g, 'x-access-token:…')
    .slice(0, 240);

// own: the command runs with the machine's OWN Git sign-in (its credential helper, its SSH keys), as when the customer runs git themself.
// It still never stops to ask a question: a sign-in that would need one fails, and the reason is said.
function git(args, { cwd, token, timeout = 120000, own = false } = {}) {
  return new Promise((done) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
    if (own && !env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes';
    if (token)
      Object.assign(env, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.' + HOST() + '/.extraheader',
        GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + token).toString('base64'),
      });
    const child = spawn('git', [...(own ? [] : ['-c', 'credential.helper=']), ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      err += '\nstopped: it ran past ' + Math.round(timeout / 1000) + ' s';
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (d) => {
      out = (out + d).slice(-20000);
    });
    child.stderr.on('data', (d) => {
      err = (err + d).slice(-4000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: 1, out, err: e.code === 'ENOENT' ? 'git is not installed on this machine' : e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
  });
}
const must = async (args, o, what) => {
  const r = await git(args, o);
  if (r.code !== 0)
    throw new Error(
      (what || 'git ' + args.find((a) => !a.startsWith('-') && !a.includes('=')) + ' did not work') + ': ' + tail(r),
    );
  return r;
};

// where the clone stands: its branch, the default branch, the last commit, and what has been changed and not yet landed
export async function statusOf(dir) {
  const one = async (args) => {
    const r = await git(args, { cwd: dir });
    return r.code === 0 ? r.out.trim() : '';
  };
  const branch = (await one(['symbolic-ref', '--short', 'HEAD'])) || 'main';
  const base = (await one(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).replace(/^origin\//, '') || branch;
  const porcelain = await git(['status', '--porcelain'], { cwd: dir }); // not trimmed: the first two columns of each line are the state
  const changed = (porcelain.code === 0 ? porcelain.out : '')
    .split('\n')
    .filter(Boolean)
    .map((l) => ({
      state: l.slice(0, 2).trim() === '??' ? 'new' : /D/.test(l.slice(0, 2)) ? 'removed' : 'changed',
      path: l.slice(3).replace(/^"|"$/g, ''),
    }))
    .slice(0, 200);
  return {
    dir,
    branch,
    base,
    head: (await one(['rev-parse', '--short', 'HEAD'])) || null,
    full: (await one(['rev-parse', 'HEAD'])) || null,
    subject: (await one(['log', '-1', '--format=%s'])).slice(0, 140),
    changed,
  };
}

// WHAT THE WAITING CHANGE IS, AS TEXT: for the seat that judges it against what was asked. The tracked files as git's own diff,
// then each new file written out. Bounded (the start of it is kept), and said when it was cut. sig is the whole of it as one short
// value: two that are equal are the same change, which is how a further round that altered nothing is known.
export async function changeOf(dir, max = 12000) {
  const d = await git(['diff', 'HEAD'], { cwd: dir, timeout: 30000 });
  const o = await git(['ls-files', '--others', '--exclude-standard'], { cwd: dir, timeout: 30000 });
  const fresh = (o.code === 0 ? o.out : '').split('\n').filter(Boolean).slice(0, 12);
  const parts = [d.code === 0 ? d.out.trim() : ''];
  for (const f of fresh) {
    const t = await readFile(path.join(dir, f), 'utf8').catch(() => null);
    if (t === null || t.includes('\0')) {
      parts.push('new file ' + f + ' (not text)');
      continue;
    }
    parts.push(
      'new file ' +
        f +
        '\n' +
        t
          .slice(0, 3000)
          .split('\n')
          .map((l) => '+' + l)
          .join('\n') +
        (t.length > 3000 ? '\n(the rest of this file is not shown)' : ''),
    );
  }
  const all = parts.filter(Boolean).join('\n\n');
  return {
    diff: all.slice(0, max),
    cut: all.length > max || (d.out || '').length >= 20000,
    sig: createHash('sha1').update(all).digest('hex'),
  };
}
export async function cloneRepo({ stateDir, repo, token }) {
  if (!validRepo(repo)) throw new Error('That is not a repository name: write it as owner/name.');
  const dir = cloneDir(stateDir, repo);
  const have = await access(path.join(dir, '.git')).then(
    () => true,
    () => false,
  );
  if (have) {
    // already here: bring it up to date, unless the team has changes waiting in it
    await must(['fetch', '--prune', 'origin'], { cwd: dir, token }, 'GitHub could not be reached for ' + repo);
    const st = await statusOf(dir);
    if (!st.changed.length && st.head) await git(['merge', '--ff-only', 'origin/' + st.branch], { cwd: dir });
  } else {
    await mkdir(path.dirname(dir), { recursive: true });
    await must(
      ['clone', HOST() + '/' + repo + '.git', dir],
      { token, timeout: 15 * 60000 },
      'GitHub would not let ' + repo + ' be cloned',
    );
  }
  return statusOf(dir);
}

export async function discard(dir) {
  await must(['reset', '--hard', 'HEAD'], { cwd: dir });
  await must(['clean', '-fd'], { cwd: dir });
  return statusOf(dir);
}

// how: 'pr' or 'direct'. who: { name, email } for the commit. openPull({ repo, head, base, title, body }) -> { url, number } (GitHub's API).
export const validBranch = (v) => {
  const n = String(v || '');
  return (
    /^[A-Za-z0-9][\w./-]{0,90}$/.test(n) &&
    !n.includes('..') &&
    !n.includes('//') &&
    !/[/.]$/.test(n) &&
    !/\.lock$/.test(n)
  );
}; // a branch name the customer gave: the characters a branch name uses, and nothing git would read as something else
export async function land({ dir, repo, token, how, title, body = '', who, openPull, branch: named = '' }) {
  const status = await statusOf(dir);
  if (!status.changed.length) throw new Error('There is nothing to land: no file was changed.');
  title = String(title || 'A change from your team')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const id = ['-c', 'user.name=' + who.name, '-c', 'user.email=' + who.email];
  const msg = title + (body ? '\n\n' + String(body).slice(0, 2000) : '');
  const at = { cwd: dir };
  const web = 'https://github.com/' + repo;
  if (how === 'direct') {
    if (status.branch !== status.base) await must(['checkout', status.base], at);
    await must(['add', '-A'], at);
    await must([...id, 'commit', '-m', msg], at);
    await must(
      ['push', 'origin', 'HEAD:refs/heads/' + status.base],
      { ...at, token },
      'GitHub would not take the commit on ' + status.base,
    );
    const now = await statusOf(dir);
    return {
      how: 'direct',
      branch: status.base,
      commit: now.head,
      url: web + '/commit/' + now.full,
      title,
      files: status.changed.length,
    };
  }
  const d = new Date();
  const stamp = d
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, '')
    .replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'change';
  const branch = named || 'familyoffice/' + stamp + '-' + slug; // the name the customer asked for, or one of this app's own
  await must(['checkout', '-b', branch], at);
  await must(['add', '-A'], at);
  await must([...id, 'commit', '-m', msg], at);
  const made = await statusOf(dir);
  try {
    await must(['push', '-u', 'origin', branch], { ...at, token }, 'GitHub would not take the branch');
    const pr = await openPull({ repo, head: branch, base: status.base, title, body }).catch((e) => {
      throw new Error(
        'The branch ' +
          branch +
          ' is pushed, but GitHub would not open the pull request: ' +
          String(e.message || e).slice(0, 160),
      );
    });
    return {
      how: 'pr',
      branch,
      base: status.base,
      commit: made.head,
      url: pr.url,
      number: pr.number,
      title,
      files: status.changed.length,
    };
  } finally {
    await git(['checkout', status.base], at);
  } // the clone goes back to the default branch: the next change starts from there
}

// ---------- A FOLDER THAT IS ALREADY ON THIS MACHINE (a Git repository from GitHub, GitLab or anywhere else) ----------
// The rule of this file holds here too: the team never works in the customer's own working copy. The folder is CLONED into this
// app's own folder (its "origin" is the customer's folder), the team changes that copy, and landing hands the work back:
//   - with no branch asked for, the change is committed onto the branch the customer HAS CHECKED OUT, by a fast-forward of their
//     folder. Git itself refuses that if it would overwrite anything of theirs (a file they have changed, a commit they made since);
//     the change then goes on a branch of its own in their folder, and the page says why. It is never pushed: their branch is theirs.
//   - with a branch named by the customer, that branch is made in their folder from the change, their checkout does not move, and,
//     if they chose it, the branch is pushed to the folder's origin with the machine's own Git sign-in, with the address where a
//     pull request (GitHub) or a merge request (GitLab) for it is opened.
// The copy starts from the folder's last commit. What the customer has not committed is not in it, and the page says how much that is.
export function remoteOf(url) {
  const m =
    /^(?:https?:\/\/(?:[^@/\s]+@)?|ssh:\/\/(?:[^@/\s]+@)?|[\w.-]+@)([\w.-]+)(?::\d+)?[:/]([\w.~/-]+?)(?:\.git)?\/?$/.exec(
      String(url || '').trim(),
    );
  if (!m) return null;
  const host = m[1].toLowerCase();
  const slug = m[2].replace(/^\/+/, '');
  if (!slug.includes('/')) return null;
  return {
    host,
    slug,
    kind: /(^|\.)github\./.test(host) ? 'github' : /gitlab/.test(host) ? 'gitlab' : 'other',
    web: 'https://' + host + '/' + slug,
  };
}
export async function folderInfo(folder) {
  const p = String(folder || '').trim();
  if (!path.isAbsolute(p)) throw new Error("Give the folder's whole path, starting from the top of the disk.");
  const one = async (dir, args) => {
    const r = await git(['-C', dir, ...args]);
    return r.code === 0 ? r.out.trim() : '';
  };
  const top = await one(p, ['rev-parse', '--show-toplevel']);
  if (!top) throw new Error('That folder is not a Git repository: ' + p.slice(0, 160));
  if (!(await one(top, ['rev-parse', '--verify', 'HEAD'])))
    throw new Error('That repository has no commit yet. Make its first commit, then choose it again.');
  const dirty = await git(['-C', top, 'status', '--porcelain']);
  const url = await one(top, ['config', '--get', 'remote.origin.url']); // as it is written, before any rewriting the machine's own Git settings would do
  return {
    folder: top,
    name: path.basename(top),
    branch: (await one(top, ['symbolic-ref', '--short', 'HEAD'])) || '',
    remote: url ? remoteOf(url) : null,
    hasOrigin: !!url,
    uncommitted: dirty.code === 0 ? dirty.out.split('\n').filter(Boolean).length : 0,
    branches: (
      await one(top, ['for-each-ref', '--sort=-committerdate', '--count=30', '--format=%(refname:short)', 'refs/heads'])
    )
      .split('\n')
      .filter(Boolean), // how this repository names its branches, newest first
    who: { name: await one(top, ['config', 'user.name']), email: await one(top, ['config', 'user.email']) },
  };
}
export const folderCloneDir = (stateDir, folder) =>
  path.join(
    stateDir,
    'work',
    'local',
    path
      .basename(folder)
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 60) +
      '-' +
      createHash('sha1').update(folder).digest('hex').slice(0, 8),
  );
export async function cloneFolder({ stateDir, folder }) {
  const info = await folderInfo(folder);
  const dir = folderCloneDir(stateDir, info.folder);
  const have = await access(path.join(dir, '.git')).then(
    () => true,
    () => false,
  );
  if (have) {
    // already copied: brought up to the folder's last commit, unless the team has a change waiting in it
    await must(['fetch', '--prune', 'origin'], { cwd: dir }, 'Your folder could not be read again');
    // the copy stands on the branch the customer has checked out NOW, at its last commit (they may have switched since last time)
    const st = await statusOf(dir);
    if (!st.changed.length && st.head) {
      if (info.branch) await git(['checkout', '-B', info.branch, 'origin/' + info.branch], { cwd: dir });
      else await git(['merge', '--ff-only', 'origin/' + st.branch], { cwd: dir });
    }
  } else {
    await mkdir(path.dirname(dir), { recursive: true });
    await must(['clone', info.folder, dir], { timeout: 15 * 60000 }, 'That folder could not be copied');
  }
  return { ...(await statusOf(dir)), info };
}
// A FOLDER THAT IS NOT A GIT REPOSITORY YET. Someone new says "I want to make an app" and chooses a folder (or makes one in the
// folder window). It is made a repository where it stands, with a first commit of whatever is in it, made in the team's name so
// that nothing has to be set up first. Nothing in the folder is changed or removed: a ".git" folder is added to it. Not the home
// folder, not the top of a disk, and not a folder that already holds thousands of files (that is not one app).
export async function startFolder(folder) {
  const given = String(folder || '').trim();
  if (!path.isAbsolute(given)) throw new Error("Give the folder's whole path, starting from the top of the disk.");
  const p = path.resolve(given);
  const home = process.env.HOME ? path.resolve(process.env.HOME) : '';
  if (p === home || path.dirname(p) === p)
    throw new Error(
      'Choose a folder for this one app, not your home folder or a whole disk. You can make a new folder in the window that opens.',
    );
  const inRepo = (await git(['-C', p, 'rev-parse', '--show-toplevel'])).code === 0;
  if (!inRepo) {
    let n = 0;
    const walk = async (d, depth) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (++n > 3000) return;
        if (e.isDirectory() && depth < 6 && e.name !== 'node_modules') await walk(path.join(d, e.name), depth + 1);
      }
    };
    await walk(p, 0);
    if (n > 3000)
      throw new Error(
        'That folder already holds more than 3,000 files. Choose an empty folder, or the folder of one app.',
      );
    await must(['-C', p, 'init', '-q'], {}, 'That folder could not be made a Git folder');
    await git(['-C', p, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
  const has = (await git(['-C', p, 'rev-parse', '--verify', 'HEAD'])).code === 0;
  if (!has) {
    await git(['-C', p, 'add', '-A']);
    await must(
      [
        '-C',
        p,
        '-c',
        'user.name=Family Office',
        '-c',
        'user.email=team@familyoffice.invalid',
        'commit',
        '--allow-empty',
        '-q',
        '-m',
        'Start',
      ],
      {},
      'The first commit could not be made',
    );
  }
  return { made: !inRepo, first: !has };
}
// current: the branch the customer has checked out. branch: the name they asked for, or ''. push: also send a NAMED branch to the
// folder's origin. who: { name, email } for the commit.
export async function landFolder({
  dir,
  folder,
  current,
  remote,
  hasOrigin,
  push,
  title,
  body = '',
  who,
  branch = '',
}) {
  const status = await statusOf(dir);
  if (!status.changed.length) throw new Error('There is nothing to land: no file was changed.');
  title = String(title || 'A change from your team')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const id = ['-c', 'user.name=' + who.name, '-c', 'user.email=' + who.email];
  const msg = title + (body ? '\n\n' + String(body).slice(0, 2000) : '');
  const at = { cwd: dir };
  const enc = encodeURIComponent;
  const d = new Date();
  const stamp = d
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, '')
    .replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'change';
  const own = 'familyoffice/' + stamp + '-' + slug;
  const base = current || status.branch;
  await must(['checkout', '-b', own], at);
  await must(['add', '-A'], at);
  await must([...id, 'commit', '-m', msg], at);
  const made = await statusOf(dir);
  const out = {
    branch: '',
    base,
    commit: made.head,
    folder,
    title,
    files: status.changed.length,
    pushed: false,
    why: '',
    url: null,
    host: remote ? remote.kind : '',
    fell: false,
  };
  const asBranch = async (name, why = '') => {
    // the change as a branch in the customer's folder ("origin", from the copy, is their folder)
    await must(
      ['push', 'origin', own + ':refs/heads/' + name],
      at,
      'The branch ' +
        name +
        ' could not be made in your folder' +
        (name === own ? '' : ' (if there is one by that name already, give another)'),
    );
    return { ...out, how: 'branch', branch: name, why, fell: !!why };
  };
  try {
    if (!branch) {
      // onto the branch they have checked out, by fast-forward
      const got = await git(['-C', folder, 'fetch', dir, own]);
      const ff = got.code === 0 ? await git(['-C', folder, 'merge', '--ff-only', 'FETCH_HEAD']) : got;
      if (ff.code === 0) return { ...out, how: 'commit', branch: base };
      return await asBranch(
        own,
        'It could not go onto ' + base + ' as that branch stands (' + tail(ff) + '), so it is on a branch of its own.',
      );
    }
    const on = await asBranch(branch);
    if (!push) return on;
    if (!hasOrigin) return { ...on, why: 'Your folder has no origin to push to.' };
    const sent = await git(['-C', folder, 'push', 'origin', branch + ':refs/heads/' + branch], {
      own: true,
      timeout: 180000,
    });
    if (sent.code !== 0) return { ...on, why: tail(sent) };
    return {
      ...on,
      pushed: true,
      url: !remote
        ? null
        : remote.kind === 'github'
          ? remote.web + '/compare/' + enc(base) + '...' + enc(branch) + '?expand=1'
          : remote.kind === 'gitlab'
            ? remote.web +
              '/-/merge_requests/new?merge_request%5Bsource_branch%5D=' +
              enc(branch) +
              '&merge_request%5Btarget_branch%5D=' +
              enc(base)
            : null,
    };
  } finally {
    await git(['checkout', status.branch], at);
  } // the copy goes back to where it started: the next change starts from there
}

// ---------- a repository cloned from its address ----------
// The customer gives the address (HTTPS, SSH or git@host:path, as any Git host shows it under Clone) and chooses where on this machine
// it goes. It is cloned there with the machine's OWN Git sign-in, exactly as if they had run git clone themself, and is then connected
// like any Git folder: it is their folder, and the team works in its own copy of it. Only those kinds of address are taken: never
// something git would read as an option, a local path, or a transport that runs a command.
export const cloneNameOf = (url) =>
  ((/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url || '').trim()) || [])[1] || '').replace(/^\.+/, '');
export const validCloneUrl = (url) => {
  const u = String(url || '');
  return (
    u.length <= 500 &&
    !u.includes('..') &&
    (/^(https:\/\/|ssh:\/\/)([\w.-]+@)?[\w.-]+(:\d+)?\/[\w.@:/~+%-]+$/.test(u) ||
      /^[\w.-]+@[\w.-]+:[\w.@/~+%-]+$/.test(u) ||
      (process.env.FO_CLONE_ALLOW_FILE === '1' && /^file:\/\/\/[\w./-]+$/.test(u)))
  );
}; // file: only in the self-test
export async function cloneUrl({ url, into }) {
  if (!validCloneUrl(url))
    throw new Error(
      'That is not a repository address. Paste the HTTPS or SSH address your Git host shows under Clone.',
    );
  const name = cloneNameOf(url);
  if (!name) throw new Error('That address does not name a repository.');
  const dest = path.join(into, name);
  if (
    await access(dest).then(
      () => true,
      () => false,
    )
  )
    throw new Error(
      'There is already something named ' + name + ' there. Choose another place, or find that folder instead.',
    );
  const r = await git(['-c', 'protocol.ext.allow=never', 'clone', '--', url, dest], { own: true, timeout: 30 * 60000 });
  if (r.code !== 0) throw new Error('It could not be cloned: ' + tail(r));
  return { folder: dest, name };
}
