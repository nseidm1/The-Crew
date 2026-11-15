// runner-client.js - the pages' door to the runner on the customer's own machine. connectRunner() resolves to that runner when there
// is one (it serves this page, or this page is the site it was started from), and to noRunner() when there is none: a web page
// cannot measure a machine, install a model or start Claude Code, so without the runner a page can only say how to start it.
//   live                      true: the runner is there. false: there is none, and every call below is refused
//   host()                    the machine, measured now
//   models()                  { host, models[] } - the options for it
//   setup(modelId)            start; progress arrives through on()
//   state()                   { setup, session, busy }
//   on(fn) -> off()           fn(state) on every change
//   chat(text, onDelta)       one streamed reply; resolves with { tokens, tokPerSec, firstTokenMs }
//   stop()
import { MODELS } from './catalog.js';
import { runnerBase } from './where.js';
import { stream } from './stream.js';

// what the runner refused, with the tier that would allow it when the reason is the plan (a 402)
const refused = (j) =>
  Object.assign(new Error(j.error || 'the runner refused'), { upgrade: j.upgrade || '', feature: j.feature || '' });

async function live(base = '') {
  // base: '' when the runner serves this page, its address when this page is the site it came from
  const get = async (p) => {
    const r = await fetch(base + p, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw refused(j);
    return j;
  };
  const post = async (p, body) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json();
    if (!r.ok) throw refused(j);
    return j;
  };
  let last = null;
  const subs = new Set();
  // the runner's state, pushed on every change, over the one connection all the tabs of this browser share (stream.js)
  const feed = stream(base).on('message', (data) => {
    try {
      last = JSON.parse(data);
    } catch {
      return;
    }
    subs.forEach((fn) => fn(last));
  });
  try {
    const now = await get('api/setup');
    if (!last) last = now;
  } catch (e) {
    feed.close();
    throw e;
  }
  return {
    live: true,
    remote: base !== '',
    base,
    close() {
      feed.close();
      subs.clear();
    }, // this page is moving to another runner, or to none
    shutdown: () => post('api/shutdown'),
    license: () => get('api/license'),
    minds: () => get('api/minds'),
    setMind: (b) => post('api/minds', b), // on Claude Code: the model and the effort each seat thinks with
    github: () => get('api/github'),
    githubRepos: (q) => get('api/github/repos?q=' + encodeURIComponent(q || '')),
    githubLogin: () => post('api/github/login'),
    githubUseGh: () => post('api/github/gh'),
    githubGhInstall: () => post('api/github/gh/install'), // fetch GitHub's own command for this app, then start its sign-in
    githubGhLogin: () => post('api/github/gh/login'), // gh's own web sign-in, its code shown on the page
    githubSignOut: () => post('api/github/logout'),
    bindWallet: (message, signature) => post('api/license/wallet', { message, signature }),
    recheck: () => post('api/license/recheck'),
    redeem: (code) => post('api/license/code', { code }),
    release: () => post('api/license/release'),
    buyPlan: (wallet, referrer) => post('api/license/buy', { wallet, referrer: referrer || '' }),
    githubCreate: (name, priv) => post('api/github/create', { name, private: priv }),
    workspace: () => get('api/workspace'),
    workspaceUse: (repo) => post('api/workspace/use', { repo }),
    workspaceClone: (url) => post('api/workspace/clone', { url }), // a repository cloned from its address; the machine's folder window asks where it goes
    workspaceStart: () => post('api/workspace/folder', { start: true }), // someone new: the folder they choose in the machine's folder window is made a Git folder, and connected
    sites: () => get('api/sites'),
    siteStart: () => post('api/sites/start'),
    siteStop: (id) => post('api/sites/stop', { id }), // the workspace's website, served on this computer
    devices: () => get('api/devices'),
    deviceInstall: (serial) => post('api/devices/install', { serial }), // the phone plugged into this computer, and the built app put on it
    workspaceFolder: (path) => post('api/workspace/folder', path ? { path } : {}), // a Git folder already on this machine; with no path, the machine's own folder chooser opens
    resetWould: () => get('api/reset'), // what Clear all would delete here: { phones, gb, strata }
    reset: (models) => post('api/reset', { sure: true, models: models === true }), // Clear all: the app as it was when first started (the plan is kept; the downloaded models are kept unless models is true; every phone is unpaired)
    workspaceDisconnect: () => post('api/workspace/disconnect'), // stop working there; the team's copy is kept on the machine
    workspaceTask: (task, branch, how) =>
      post('api/workspace/task', { task, ...(branch ? { branch } : {}), ...(how || {}) }), // how: { push, direct }, as it was said in the chat   // branch: the one the customer asked for, kept for the landing
    workspaceLand: (branch, how) => post('api/workspace/land', { ...(branch ? { branch } : {}), ...(how || {}) }),
    workspaceDiscard: () => post('api/workspace/discard'),
    workspaceLook: (task) => post('api/workspace/look', { task }), // the team searches the code and says what it found; nothing is changed
    workspaceDiff: () => post('api/workspace/diff'),
    workspaceRun: (cmd) => post('api/workspace/run', { cmd }), // one command that reads or tests, in the connected workspace
    workspaceJudge: (requirements, task) => post('api/workspace/judge', { requirements, task }),
    workspaceProve: () => post('api/workspace/prove'), // red on the code before the change, green after it, and one proof image
    proofUrl: (id) => base + 'api/proof/' + id + '.png',
    jira: (fresh) => get('api/jira' + (fresh ? '?fresh=1' : '')),
    jiraSearch: (filters) => post('api/jira/search', filters),
    jiraProjects: () => post('api/jira/projects'),
    jiraQuick: (scope) => post('api/jira/quick', scope),
    jiraBoards: () => post('api/jira/boards'),
    jiraLogout: () => post('api/jira/logout'),
    mediaUp: async (file) => {
      const r = await fetch(base + 'api/media?name=' + encodeURIComponent(file.name || 'file'), {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) throw refused(j);
      return j;
    }, // a picture or a video, handed to the team: the file itself is the body
    mediaRead: (ids, about) => post('api/media/read', { ids, about }), // looked at: what each shows, in words
    jiraMedia: (key, files, about) => post('api/jira/media', { key, files, about }), // its pictures and recordings, fetched and looked at by the team
    jiraIssue: (key) => post('api/jira/issue', { key }), // one ticket, whole
    jiraMove: (key, to) => post('api/jira/move', { key, to }), // a card dropped on another column: one transition
    jiraComment: (key, text) => post('api/jira/comment', { key, text }),
    jiraFaces: () => post('api/jira/faces', {}), // the pictures of the people on the board that was last read
    jiraTake: (key) => post('api/jira/take', { key }),
    jiraAttach: (key, files) => post('api/jira/attach', { key, files }), // files for a ticket: whether they could be attached, and why not                 // assign it to me
    // the phone link (runner/link.mjs): its state, and the controls that live on this computer only
    link: (usb = true) => get('api/link' + (usb ? '' : '?usb=0')),
    linkOn: (on) => post('api/link/on', { on }),
    linkPairing: () => post('api/link/pairing'),
    linkDecide: (fp, ok) => post('api/link/decide', { fp, ok }),
    linkRevoke: (id) => post('api/link/revoke', { id }),
    linkSideload: (serial) => post('api/link/sideload', { serial }),
    detect: () => get('api/detect'),
    detectFar: () => get('api/detect?far=ssh'),
    hints: () => get('api/detect?hints=1'),
    addServer: (address) => post('api/detect', { address }),
    host: () => get('api/host'),
    models: () => get('api/models'),
    setup: (what, mode) =>
      post('api/setup', { ...(typeof what === 'string' ? { model: what } : what), ...(mode ? { mode } : {}) }), // mode: 'simple' or 'developer', which decides the agent check's jobs
    state: () => last,
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    stop: () => post('api/stop'),
    cancel: () => post('api/cancel'),
    fix: (action, more) => post('api/fix', { action, ...(more || {}) }),
    claudeAccount: () => get('api/claude/account'),
    connectors: () => get('api/connectors'),
    connect: (id) => post('api/connect', { id }),
    code: (code) => post('api/signin', { code }).then((r) => !!r.ok),
    // a seat speaks: o.customer and o.lang keep it in the customer's language, o.use is what it may use on Claude Code, o.max caps the
    // reply, and o.onReset(text) says that what was shown is to be replaced (a local model's reply broke down and was cut)
    seat(system, messages, onDelta, o = {}) {
      return this.chat(null, onDelta, {
        path: 'api/seat',
        onReset: o.onReset,
        body: {
          seat: o.seat || '',
          system,
          messages,
          customer: o.customer || '',
          lang: o.lang || '',
          use: o.use || null,
          max: o.max || 0,
        },
      });
    },
    route: (text, o) => post('api/route', { text, ...(o || {}) }), // what kind of message it is, and whose
    tool: (body) => post('api/tool', body), // the seats' tools: search, read, shot, see
    addons: () => get('api/addons'), // the add-on models (one that reads pictures) and what adding each would run
    addon: (id, action) => post('api/addon', { id, action }), // add, cancel, remove
    shotUrl: (id) => base + 'api/shot/' + id,
    clipUrl: (id) => base + 'api/clip/' + id,
    async chat(text, onDelta, o = {}) {
      const res = await fetch(base + (o.path || 'api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(o.body || { text }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'the model is not running');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let stats = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const m = /^data:\s*(.*)$/.exec(part.trim());
          if (!m) continue;
          const j = JSON.parse(m[1]);
          if (j.reset !== undefined && o.onReset) o.onReset(j.reset);
          if (j.text) onDelta(j.text);
          if (j.error) throw new Error(j.error);
          if (j.done) stats = j;
        }
      }
      return stats;
    },
  };
}

// ---------- no runner: nothing has been started on this machine. The page keeps its shape; every call says why it cannot answer. ----------
export function noRunner() {
  const idle = { setup: null, session: null, busy: false };
  const no = async () => {
    throw new Error('Your team is not running on this machine. Start it from the Start page.');
  };
  return new Proxy(
    { live: false, remote: false, base: null, close() {}, state: () => idle, on: () => () => {} },
    { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k !== 'then' ? no : undefined) },
  );
}
export async function connectRunner(opts) {
  // { fresh: true } looks again
  const base = await runnerBase(opts); // '' = the runner serves this page; an address = this is the site it came from; null = there is none
  if (base === null) return noRunner();
  try {
    return await live(base);
  } catch {
    return noRunner();
  }
}
export { MODELS };
