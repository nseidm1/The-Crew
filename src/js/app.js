// app.js - the customer's admin: ten views over one core. Every view renders from core.snapshot() and re-renders on change.
import { md, mdEditor } from './md.js';
import { $, $$, h, ago, clock, seatFace, buddy, glyph } from './ui.js';
import { connect } from './core-port.js';
import { connectRunner } from './runner-client.js';
import { STAGES, seatAs } from './team-core.js';
import { moodOfSeat } from './team/mood.js';
import { SOUL } from './team-soul.js';
import { BASE } from './base-lessons.js';
import { BILLING } from './billing.js';
import { PRODUCT } from './product.js';
import { planPanel } from './plan-panel.js';
import { qrSvg } from './qr.js';
import { APP } from './where.js';
import { applyMode, getMode, isSimple, setMode, SIMPLE_VIEWS } from './mode.js';
applyMode(); // Simple or Developer: how the pages are shown, never what the team can do
import { chatView, composer, paintOffer, proofDetail, proofState, richComposer } from './views.js';

const core = connect();
// the seats speak through the runner's engine. Without a runner, or with no team started on it, the page says so and points at Start
let runner = await connectRunner();
let engineOn = false;
// No team on record in this browser: Start is where one is chosen. On the phone the team was started on the computer, so the app
// takes the one that is running there instead of sending the phone through Start again.
if (!core.snapshot().session) {
  const ses = APP && runner.live ? runner.state().session : null;
  const m = (ses && ses.measured) || {};
  if (ses)
    core.adopt({
      model: ses.model,
      engine: ses.engine,
      agent: ses.agent,
      host: ses.host,
      kind: ses.kind || 'local',
      live: true,
      tokPerSec: m.tokPerSec,
      passed: m.passed,
      of: m.of,
    });
  else location.replace('start.html');
}
// THE RUNNER UNDER THIS PAGE can stop and come back while the page is open. adoptRunner() makes the page true again without a reload:
// who the seats speak through, what the sidebar says, and whether there is something to shut down.
function adoptRunner(next) {
  if (runner !== next && runner.close) runner.close();
  runner = next;
  engineOn = runner.live && !!runner.state().session;
  core.useEngine(
    engineOn
      ? {
          seat: (o) => runner.seat(o.system, o.messages, o.onDelta, o),
          route: (t, o) => runner.route(t, o),
          tool: (b) => runner.tool(b),
          shotUrl: (id) => runner.shotUrl(id),
          work: runner.workspaceTask
            ? {
                state: () => runner.workspace(),
                look: (t) => runner.workspaceLook(t),
                task: (t, br, how) => runner.workspaceTask(t, br, how),
                prove: () => runner.workspaceProve(),
                diff: runner.workspaceDiff ? () => runner.workspaceDiff() : null,
                run: runner.workspaceRun ? (cmd) => runner.workspaceRun(cmd) : null,
                judge: runner.workspaceJudge ? (reqs, task) => runner.workspaceJudge(reqs, task) : null,
                land: (br, how) => runner.workspaceLand(br, how),
                discard: () => runner.workspaceDiscard(),
                proofUrl: (id) => runner.proofUrl(id),
                pick: runner.workspaceStart ? () => startInFolder() : null,
              }
            : null,
          host: runner.sites
            ? {
                sites: () => runner.sites(),
                siteStart: () => runner.siteStart(),
                siteStop: (id) => runner.siteStop(id),
                devices: () => runner.devices(),
                install: (serial) => runner.deviceInstall(serial),
              }
            : null, // what the team needs from this computer: the site it made, served here, and a phone
          media: runner.mediaUp
            ? { up: (f) => runner.mediaUp(f), read: (ids, about) => runner.mediaRead(ids, about) }
            : null, // a picture or a recording handed over in the chat
          jira: runner.jiraIssue
            ? {
                issues: () => (jira && jira.last && jira.last.issues) || [],
                read: (key) => runner.jiraIssue(key),
                media: runner.jiraMedia ? (key, files, about) => runner.jiraMedia(key, files, about) : null,
              }
            : null, // the tickets on the board, and one read whole: how the team finds what a ticket must do   // the team's hands in the workspace: make a change, prove it, land it
          eyes: () => {
            const a = (runner.state() || {}).addon;
            return a && a.state === 'ready' ? a.name : '';
          },
          helpers: () => (runner.state() || {}).helpers || {},
          clipUrl: (id) => runner.clipUrl(id),
        }
      : null,
  ); // the add-on that reads pictures, when one has been added
}
adoptRunner(runner);
addEventListener('fo:runner-gone', () => {
  const up = $('#runner-up');
  const btn = $('#shut');
  if (up) {
    up.className = 'tag warn';
    up.textContent = 'Not running';
  }
  if (btn) btn.remove();
}); // the bar says how to start it again
addEventListener('fo:runner-back', (e) => {
  e.preventDefault();
  connectRunner({ fresh: true }).then((next) => {
    adoptRunner(next);
    paint(true);
  });
});

// THE PLAN in force on this machine (the runner checks it; this page only shows it). It is read when the page opens and again after
// anything that can change it. The Soul is not part of any plan: it is whole for everyone, so an allowance an older page set is lifted.
let lic = null;
let planSaid = '';
async function readPlan() {
  try {
    lic = await runner.license();
  } catch {
    lic = null;
  }
  core.limitSoul(null);
  if (typeof cur !== 'undefined') paint(cur === 'plan' || cur === 'learning' || cur === 'overview');
}
{
  const r = new URLSearchParams(location.search).get('ref');
  if (/^0x[0-9a-fA-F]{40}$/.test(r || '')) {
    try {
      localStorage.setItem('familyoffice.ref', r);
    } catch {
      /* a private window */
    }
  }
}
readPlan();

// JIRA, for its own page: whether the connector is signed in, the last tickets read, and the filters. Read when the page is first
// opened; the navigation shows how it stands from then on.
let jira = null;
let jiraBusy = '';
let jiraSaid = '';
let jiraLink = null;
let jfSet = false;
const jiraFilters = {
  project: '',
  board: 0,
  mine: true,
  status: 'open',
  sprint: false,
  text: '',
  quick: [],
  areas: [],
  cols: [],
}; // cols: which of the board's columns are read (none chosen = its working columns)   // quick is "Filter by" (the board's own filters), areas is "Area" (its project's components)
let jiraAskedBoards = false;
// what is narrowed on the page itself, at once, from the tickets already read: the people (their avatars) and the labels
const jiraView = { people: new Set(), tags: new Set(), areas: new Set(), notAreas: new Set() }; // areas: show only these; notAreas: leave these out
// THE PEOPLE'S OWN PICTURES. Jira's search names each assignee and gives no picture, so once tickets are on the board the people still
// without one are asked for, once for each read. When the pictures arrive they are put on the faces and the cards where they are:
// nothing is redrawn, nothing waits on it, and if it fails the initials stay.
let facesFor = 0;
async function jiraFacesSoon() {
  const last = jira.last;
  if (!last || !runner.jiraFaces || facesFor === last.at || !(last.issues || []).some((x) => x.assignee && !x.avatar))
    return;
  facesFor = last.at;
  try {
    const got = await runner.jiraFaces();
    const faces = (got && got.faces) || {};
    if (jira.last !== last) return;
    for (const x of last.issues) if (!x.avatar && faces[x.assignee]) x.avatar = faces[x.assignee];
    for (const el of document.querySelectorAll('.faces .face, .jface')) {
      const name = el.getAttribute('aria-label');
      const src = faces[name];
      if (!src || el.querySelector('img')) continue;
      el.replaceChildren(
        h('img', {
          src,
          alt: '',
          referrerpolicy: 'no-referrer',
          onerror: (e) => e.target.replaceWith(document.createTextNode(initials(name))),
        }),
      );
    }
  } catch {
    /* the initials stay */
  }
}
// the board itself: what is typed in "Search board", the ticket that is selected and the one that is open, the card being dragged, the
// cards on their way to another column, and what the open ticket is being asked to do
let jiraQuery = '';
let jsel = '';
let jopen = null;
let jdrag = '';
let jact = '';
let jcomment = '';
let jfiles = [];
let jfilesSaid = null;
let jfOpen = false;
let jOther = false;
const jmoving = new Map();
const JCOLS = [
  ['To Do', 'todo'],
  ['Reopened', 'todo'],
  ['In Progress', 'doing'],
  ['Tech Review', 'doing'],
]; // the board's columns, in order
const JORDER = [
  'backlog',
  'open',
  'to do',
  'todo',
  'selected for development',
  'ready',
  'reopened',
  'blocked',
  'in progress',
  'in development',
  'doing',
  'tech review',
  'code review',
  'in review',
  'review',
  'qa',
  'in qa',
  'testing',
  'in testing',
  'ready for release',
  'done',
  'closed',
  'resolved',
  'released',
];
// A CARD DROPPED ON ANOTHER COLUMN moves at once on the page and is then moved in Jira (one transition, through the connector). If
// Jira's workflow does not allow it the card goes back, and the page says why in Jira's own words.
async function moveTicket(key, to, category) {
  const x = jira && jira.last && jira.last.issues.find((i) => i.key === key);
  if (!x || jmoving.has(key) || String(x.status).toLowerCase() === String(to).toLowerCase()) return;
  const was = { status: x.status, category: x.category, since: x.since };
  x.status = to;
  if (category) x.category = category;
  x.since = Date.now();
  jmoving.set(key, to);
  jiraSaid = '';
  paint(true);
  try {
    const r = await runner.jiraMove(key, to);
    x.status = r.status;
    x.category = r.category;
    jmoving.delete(key);
    if (jopen && jopen.key === key) openTicket(key);
  } catch (e) {
    Object.assign(x, was);
    jmoving.delete(key);
    jiraSaid = String((e && e.message) || e);
  }
  paint(true);
}
// a ticket pressed on the board: it is selected, shown at once from what its card carries, and the rest is read from Jira
async function openTicket(key) {
  jsel = key;
  jopen = { key, data: jopen && jopen.key === key ? jopen.data : null, loading: true, err: '' };
  if (!jopen.data) {
    jcomment = '';
    for (const f of jfiles) URL.revokeObjectURL(f.url);
    jfiles.length = 0;
    jfilesSaid = null;
  }
  paint(true); // another ticket: its own draft, its own files
  try {
    const d = await runner.jiraIssue(key);
    if (jopen && jopen.key === key) {
      jopen.data = d;
      jopen.loading = false;
    }
  } catch (e) {
    if (jopen && jopen.key === key) {
      jopen.err = String((e && e.message) || e);
      jopen.loading = false;
    }
  }
  if (cur === 'jira') paint(true);
}
async function ticketDo(what, fn) {
  if (jact) return;
  jact = what;
  jiraSaid = '';
  paint(true);
  try {
    await fn();
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  }
  jact = '';
  paint(true);
}
const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
async function readJira(fresh, quiet) {
  try {
    jira = await runner.jira(fresh);
  } catch (e) {
    jira = {
      state: 'failed',
      why: /not found/i.test(String(e.message))
        ? 'The app on this machine is older than this page. Run the start command again in Terminal to update it.'
        : String(e.message || e),
    };
  }
  if (jira.filters && !jfSet) {
    Object.assign(jiraFilters, jira.filters);
    jfSet = true;
  }
  if (!quiet && typeof cur !== 'undefined') paint(cur === 'jira' || cur === 'overview');
}
// REMOTE, for its own page: the phone link on this computer (runner/link.mjs). Read once when the app opens, for the navigation; on
// the Remote page it is read every few seconds, and the page is redrawn only when something in it has changed.
let rem = null;
let remBusy = '';
let remSaid = '';
let remWas = '';
let remTimer = 0;
async function readRemote(quiet, usb) {
  if (APP || remoteOff()) return; // on a phone this is the link itself: its controls stay on the computer. Switched off for this version: nothing to read
  try {
    rem = await runner.link(!!usb); /* usb: also which phones are plugged in, which only the Remote page needs */
  } catch (e) {
    rem = {
      failed: true,
      why: /not found/i.test(String(e.message))
        ? 'The app on this machine is older than this page. Run the start command again in Terminal to update it.'
        : String(e.message || e),
    };
  }
  const now = JSON.stringify(rem);
  if (quiet && now === remWas) return;
  remWas = now;
  if (typeof cur !== 'undefined') paint(cur === 'remote');
}
async function remDo(what, fn) {
  if (remBusy) return;
  remBusy = what;
  remSaid = '';
  paint(true);
  try {
    const r = await fn();
    if (r) {
      rem = r;
      remSaid = r.said || '';
    }
  } catch (e) {
    remSaid = String((e && e.message) || e);
  }
  remBusy = '';
  remWas = JSON.stringify(rem);
  paint(true);
}
// Remote, as this version shows it NOW: the file the page loaded with, or what the runner says since (the owner may have switched it off while this page was open)
function remoteOff() {
  if (PRODUCT.remote === false) return true;
  try {
    const st = runner && runner.live && runner.state ? runner.state() : null;
    return !!(st && st.product && st.product.remote === false);
  } catch {
    return false;
  }
}
const remoteTab = $('#nav a[href="#remote"]');
const remoteHome = remoteTab ? { parent: remoteTab.parentNode, next: remoteTab.nextSibling } : null;
const syncRemote = () => {
  if (!remoteTab) return;
  const off = APP || remoteOff();
  if (off) {
    if (location.hash === '#remote') location.hash = '#chat';
    if (remoteTab.isConnected) remoteTab.remove();
  } else if (!remoteTab.isConnected && remoteHome.parent)
    remoteHome.parent.insertBefore(
      remoteTab,
      remoteHome.next && remoteHome.next.parentNode === remoteHome.parent ? remoteHome.next : null,
    );
};
syncRemote();
try {
  if (runner && runner.live && runner.on) runner.on(syncRemote);
} catch {
  /* no runner */
} // and no Remote tab when the owner has switched it off for this version
// a menu of ticks closes on a press outside it, and on Escape
document.addEventListener('click', (e) => {
  for (const d of document.querySelectorAll('details.jmenu[open], details.pill-menu[open]'))
    if (!d.contains(e.target)) d.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape')
    for (const d of document.querySelectorAll('details.jmenu[open], details.pill-menu[open]')) {
      d.open = false;
      d.querySelector('summary').focus();
    }
});
readRemote();
readJira(); // once when the app opens, so the Overview and the navigation can say how Jira stands
async function jiraSignIn() {
  if (jiraBusy) return;
  jiraBusy = 'signin';
  jiraSaid = 'Starting the sign-in…';
  jiraLink = null;
  paint(true);
  try {
    const r = await runner.connect('atlassian');
    if (!r.ok) jiraSaid = 'Jira could not be connected: ' + (r.why || 'no reason given');
    else {
      if (r.state !== 'connected') {
        jiraLink = r.url || null;
        jiraSaid = r.opened
          ? "Jira's sign-in should now be open in your browser. Finish it there." + (r.url ? ' No window?' : '')
          : r.url
            ? "Open Jira's sign-in and finish it there."
            : "Waiting for Jira's sign-in.";
        paint(true);
        for (let i = 0; i < 60; i++) {
          await new Promise((ok) => setTimeout(ok, 3000));
          await readJira(true, true);
          if (jira.state === 'connected') break;
          const cs = jira.signin;
          if (cs && cs.id === 'atlassian' && cs.state === 'failed') {
            jiraSaid = 'The sign-in stopped: ' + (cs.why || 'no reason given');
            break;
          }
        }
      } else await readJira(true, true);
      jiraLink = null;
      if (jira.state === 'connected') jiraSaid = '';
      else if (!/stopped/.test(jiraSaid)) jiraSaid = 'Jira still needs your sign-in. Press Sign in to open it again.';
    }
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  }
  jiraBusy = '';
  paint(true);
}
async function jiraShow() {
  for (let i = 0; i < 300 && (jiraBusy === 'boards' || jiraBusy === 'quick'); i++)
    await new Promise((r) => setTimeout(r, 200)); // a list being read finishes first
  if (jiraBusy) return;
  jiraBusy = 'search';
  jfSet = true;
  jiraSaid = '';
  paint(true); // what is going on is said by the controls themselves; the note under them is only for what went wrong
  try {
    const got = await runner.jiraSearch({ ...jiraFilters });
    jira.last = got;
    if (got.me) jira.me = got.me;
    jiraSaid = '';
    jiraView.people.clear();
    jiraView.tags.clear();
    if (got.columns && !jiraFilters.cols.length)
      jiraFilters.cols = got.columns.map((c) => c.name); /* the columns that were read are the ones ticked */
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  }
  jiraBusy = '';
  paint(true);
}
// what a board offers to narrow by, read through the connector in one go: its own filters ("Filter by") and its project's components ("Area")
async function jiraLoadQuick() {
  if (jiraBusy || (!jiraFilters.board && !jiraFilters.project)) return;
  jiraBusy = 'quick';
  jiraSaid = '';
  paint(true);
  try {
    jira.quick = await runner.jiraQuick({ project: jiraFilters.project, board: jiraFilters.board });
    jiraFilters.quick = [];
    jiraFilters.areas = jiraFilters.areas.filter((a) => (jira.quick.areas || []).includes(a));
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  } // a board with none simply shows none
  jiraBusy = '';
  paint(true);
}
// the boards to choose from (and the projects, when the connector cannot list boards): read once when the page first opens, kept after
async function jiraLoadBoards() {
  if (jiraBusy) return;
  jiraBusy = 'boards';
  jiraSaid = '';
  paint(true);
  try {
    const r = await runner.jiraBoards();
    jira.boards = r.boards;
    jira.projects = r.projects;
    if (r.me) jira.me = r.me;
    if (!r.boards.list.length)
      jiraSaid =
        (r.boards.note || 'The connector did not offer your boards.') +
        (r.projects.list.length ? ' Your projects are in the list instead.' : '');
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  }
  jiraBusy = '';
  paint(true);
}
// a board (or a project) chosen from the list: it is what the tickets are read for, and its custom filters are read at once
function jiraPick(v) {
  const boards = (jira.boards && jira.boards.list) || [];
  const b = v.startsWith('b:') ? boards.find((x) => x.id === Number(v.slice(2))) : null;
  jiraFilters.board = b ? b.id : 0;
  jiraFilters.project = b ? b.project || '' : v.startsWith('p:') ? v.slice(2) : '';
  jiraFilters.quick = [];
  jiraFilters.areas = [];
  jiraView.areas.clear();
  jiraView.notAreas.clear();
  jiraFilters.cols = [];
  jira.quick = null;
  jfSet = true;
  if (b) {
    jiraFilters.mine = false;
    jiraFilters.status = 'all';
  } // a board shows everyone's tickets in its own columns: that is what is read, unless Mine is chosen
  paint(true);
  if (jiraFilters.board || jiraFilters.project) jiraLoadQuick();
}
async function jiraSignOut() {
  if (jiraBusy) return;
  jiraBusy = 'out';
  jiraSaid = 'Signing out…';
  paint(true);
  try {
    await runner.jiraLogout();
    jiraSaid = 'Signed out of Jira on this machine.';
  } catch (e) {
    jiraSaid = String((e && e.message) || e);
  }
  jiraBusy = '';
  await readJira(true);
}

// GITHUB, for the Workspace: sign in (a short code typed at github.com, or the sign-in the gh command already has), then choose a
// repository from the customer's own list. The token stays in the runner; this page only ever sees who is signed in.
let ghs = null;
let ghAsked = false;
let ghRepos = null;
let ghQ = '';
let ghSaid = '';
let ghTimer = 0;
async function readGh() {
  try {
    ghs = await runner.github();
  } catch {
    ghs = { unread: true };
  }
  if (ghs.signedIn && ghRepos == null)
    runner
      .githubRepos(ghQ)
      .then(
        (r) => {
          ghRepos = r.repos || [];
        },
        (e) => {
          ghRepos = [];
          ghSaid = e.message;
        },
      )
      .finally(() => {
        if (cur === 'workspace') paint(true);
      });
  clearTimeout(ghTimer);
  if (
    (ghs.flow && (ghs.flow.state === 'waiting' || ghs.flow.state === 'starting')) ||
    (ghs.ghJob && ghs.ghJob.state === 'installing')
  )
    ghTimer = setTimeout(readGh, ghs.flow && ghs.flow.state === 'waiting' ? 2500 : 1000);
  if (cur === 'workspace') paint(true);
}
// THE CLONE, and how the team's work leaves it (runner/repo.mjs). A repository that is chosen is cloned into this app's own folder.
// The team makes a change there and it waits there; it reaches GitHub only when it is landed, the way chosen here: a pull request,
// or a direct commit to the default branch.
let workspace = null;
let wsBusy = '';
let wsSaid = '';
let wsTask = '';
const wsNew = { name: '', private: true };
async function readWs(quiet) {
  try {
    workspace = await runner.workspace();
  } catch {
    workspace = { unread: true, old: true };
  }
  if (!quiet && typeof cur !== 'undefined') paint(cur === 'workspace');
}
const wsLive = () => !!workspace && !workspace.unread;
async function wsDo(what, fn, done) {
  if (wsBusy) return;
  wsBusy = what;
  wsSaid = '';
  paint(true);
  try {
    const r = await fn();
    wsSaid = typeof done === 'function' ? done(r) : done || '';
  } catch (e) {
    wsSaid = String((e && e.message) || e);
  }
  wsBusy = '';
  await readWs(true);
  paint(true);
}
// choosing a repository clones it (on a live runner), then records it as the workspace
// A GIT FOLDER THAT IS ALREADY ON THIS MACHINE. With no path the machine's own folder chooser opens (the runner opens it, because
// only the machine can say where a folder really is); closing it changes nothing. wsFrom: which card the last thing said belongs to.
let wsFrom = 'gh';
let wsPath = '';
let discSure = false;
let connSaid = ''; // discSure: Disconnect was pressed once and waits for the second press; connSaid: what the last disconnect said
// DISCONNECT, in one place: the top of the Workspace page lists what the team is connected to (the workspace, and the GitHub sign-in
// when there is one), each with its own button. Disconnecting the workspace takes two presses. Nothing is deleted by it.
const disconnectWs = (name) => {
  if (!discSure) {
    discSure = true;
    paint(true);
    setTimeout(() => {
      if (discSure) {
        discSure = false;
        if (cur === 'workspace') paint(true);
      }
    }, 4000);
    return;
  }
  discSure = false;
  connSaid = '';
  wsDo(
    'disconnect',
    async () => {
      let was = null;
      if (wsLive()) {
        const r = await runner.workspaceDisconnect();
        was = r.was;
        workspace = r;
      }
      ghError = '';
      localItems = null;
      core.unlinkWorkspace();
      connSaid =
        'Disconnected from ' +
        name +
        '. Nothing was deleted' +
        (was
          ? ": the team's own copy is kept on this machine" +
            (was.waiting ? ', with the change that was waiting still in it' : '') +
            ', so connecting it again carries on from there.'
          : '.');
    },
    '',
  );
};
// one Disconnect, on the card of whatever is connected
const discBtn = (s) =>
  h(
    'button',
    {
      class: 'btn' + (discSure ? ' danger' : ''),
      type: 'button',
      id: 'ws-disconnect',
      disabled: !!wsBusy,
      onclick: () => disconnectWs(s.workspace.name),
    },
    wsBusy === 'disconnect' ? 'Disconnecting…' : discSure ? 'Really disconnect?' : 'Disconnect',
  );
const signOutGh = async () => {
  try {
    await runner.githubSignOut();
    ghRepos = null;
    connSaid = 'Signed out of GitHub on this machine.';
  } catch (e) {
    connSaid = String((e && e.message) || e);
  }
  readGh();
};
// CHOSEN FROM THE CHAT (someone new: "I want to make an app", and nowhere to build it): the machine's folder window opens, and
// whatever folder is chosen is made a Git folder and connected. The Workspace page shows it like any other.
const startInFolder = async () => {
  wsFrom = 'folder';
  const r = await runner.workspaceStart();
  if (r.cancelled) return r;
  workspace = r;
  ghError = '';
  localItems = null;
  wsPath = '';
  core.linkWorkspace({ kind: 'local', name: r.repo });
  if (cur === 'workspace') paint(true);
  return r;
};
const useFolder = (p) => {
  wsFrom = 'folder';
  return wsDo(
    'folder',
    async () => {
      const r = await runner.workspaceFolder(p);
      if (r.cancelled) return r;
      workspace = r;
      ghError = '';
      localItems = null;
      wsPath = '';
      core.linkWorkspace({ kind: 'local', name: r.repo });
      return r;
    },
    '',
  );
};
// CLONE A REPOSITORY FROM ITS ADDRESS, offered while nothing is connected: the address is pasted, the machine's folder window asks
// where it goes, and what is cloned there is connected as the Git folder it now is.
let wsUrl = '';
const useClone = (url) => {
  wsFrom = 'folder';
  return wsDo(
    'clone',
    async () => {
      const r = await runner.workspaceClone(url);
      if (r.cancelled) return r;
      workspace = r;
      ghError = '';
      localItems = null;
      wsUrl = '';
      core.linkWorkspace({ kind: 'local', name: r.repo });
      return r;
    },
    '',
  );
};
function cloneCard() {
  const url = h('input', {
    type: 'text',
    id: 'ws-url',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'https://… or git@…',
    'aria-label': 'The address of a repository to clone',
    value: wsUrl,
    oninput: (e) => {
      wsUrl = e.target.value;
    },
  });
  return card(
    '',
    h('h2', null, 'Clone a repository'),
    h('p', { class: 'muted' }, 'Paste its address, then choose where it goes on this machine.'),
    h(
      'form',
      {
        class: 'field',
        onsubmit: (e) => {
          e.preventDefault();
          const v = wsUrl.trim();
          if (v && !wsBusy) useClone(v);
        },
      },
      url,
      h(
        'button',
        { class: 'btn', type: 'submit', id: 'ws-clone-go', disabled: !!wsBusy },
        wsBusy === 'clone' ? 'Choose where, then it clones…' : 'Clone',
      ),
    ),
  );
}
const useRepo = (name) => (
  (wsFrom = 'gh'),
  wsLive()
    ? wsDo(
        'use:' + name,
        async () => {
          workspace = await runner.workspaceUse(name);
          ghError = '';
          localItems = null;
          core.linkWorkspace({ kind: 'github', name });
        },
        '',
      )
    : ((ghError = ''), (localItems = null), core.linkWorkspace({ kind: 'github', name }))
);
// WHERE THE TEAM'S COPY STANDS, on the card of the workspace in use: one line, and the last thing landed.
function placeParts(s) {
  if (!wsLive() || !workspace.repo || workspace.repo !== s.workspace.name) return [];
  const folder = workspace.kind === 'folder';
  const ask = folder && workspace.remote && workspace.remote.kind === 'gitlab' ? 'merge request' : 'pull request';
  const n = workspace.uncommitted || 0;
  return [
    h(
      'p',
      { class: 'muted', id: 'ws-clone' },
      'On ',
      h('strong', null, workspace.branch || workspace.base || 'the default branch'),
      workspace.head ? [' at ', h('code', null, workspace.head)] : '',
      '.',
      folder && n
        ? ' ' +
            n +
            (n === 1 ? ' change of yours is' : ' changes of yours are') +
            ' not committed, so the team does not see ' +
            (n === 1 ? 'it' : 'them') +
            '.'
        : '',
    ),
    workspace.last && workspace.last.how === 'branch'
      ? h(
          'p',
          { class: 'muted ws-last', id: 'ws-last' },
          'Last landed ' + ago(workspace.last.at) + ': the branch ',
          h('code', null, workspace.last.branch),
          workspace.last.pushed ? ', pushed. ' : ', in your folder only. ',
          workspace.last.url
            ? h('a', { href: workspace.last.url, target: '_blank', rel: 'noopener' }, 'Open a ' + ask)
            : null,
        )
      : null,
    workspace.last && workspace.last.how !== 'branch'
      ? h(
          'p',
          { class: 'muted ws-last', id: 'ws-last' },
          'Last landed ' + ago(workspace.last.at) + ': ',
          workspace.last.url
            ? h(
                'a',
                { href: workspace.last.url, target: '_blank', rel: 'noopener' },
                workspace.last.how === 'pr'
                  ? 'pull request ' + (workspace.last.number ? '#' + workspace.last.number : '')
                  : 'commit ' + workspace.last.commit,
              )
            : ['commit ', h('code', null, workspace.last.commit), ' on ' + workspace.last.branch],
          '.',
        )
      : null,
  ];
}
// THE CHANGE THAT IS WAITING, when there is one: what changed, its proof, and the three things that can be done with it. How it lands
// is settled with the team in the chat; pressed here it lands the way that was said there, or the plain way.
function waitingCard(s) {
  if (!wsLive() || !workspace.repo || workspace.repo !== s.workspace.name || !workspace.pending) return null;
  const folder = workspace.kind === 'folder';
  const base = workspace.base || 'the default branch';
  const busy = !!wsBusy;
  const pending = workspace.pending;
  const landed = (r) =>
    r.how === 'commit'
      ? 'Committed onto ' + r.branch + ' in your folder. It is not pushed.'
      : r.how === 'branch'
        ? (r.fell ? r.why + ' ' : '') +
          'The branch ' +
          r.branch +
          ' is in your folder' +
          (r.pushed
            ? ' and pushed to its origin.'
            : r.why && !r.fell
              ? '. It was not pushed: ' + r.why
              : '. Nothing left this machine.')
        : r.how === 'pr'
          ? 'A pull request is open.'
          : 'Committed to ' + r.branch + ' and pushed.';
  return card(
    'ws-wait',
    h('h2', null, 'A change is waiting'),
    h(
      'div',
      { class: 'ws-pending', id: 'ws-pending' },
      h(
        'strong',
        null,
        'The team changed ' +
          workspace.changed.length +
          (workspace.changed.length === 1 ? ' file' : ' files') +
          (pending.task ? ' for "' + pending.task + '"' : '') +
          '.',
      ),
      pending.said ? h('p', { class: 'muted' }, pending.said) : null,
      h(
        'ul',
        { class: 'ws-files' },
        workspace.changed
          .slice(0, 12)
          .map((f) =>
            h(
              'li',
              null,
              h('span', { class: 'tag ' + (f.state === 'new' ? 'ok' : f.state === 'removed' ? 'bad' : '') }, f.state),
              h('code', null, f.path),
            ),
          ),
        workspace.changed.length > 12
          ? h('li', { class: 'muted' }, 'and ' + (workspace.changed.length - 12) + ' more')
          : null,
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            id: 'ws-land',
            disabled: busy,
            onclick: () => wsDo('land', () => runner.workspaceLand(), landed),
          },
          wsBusy === 'land'
            ? 'Landing…'
            : folder
              ? pending.branch
                ? 'Land it on ' + pending.branch + (pending.push ? ' and push' : '')
                : 'Commit it to ' + (workspace.current || 'your branch')
              : pending.direct
                ? 'Commit to ' + base
                : 'Open a pull request',
        ),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            id: 'ws-prove',
            disabled: busy,
            onclick: () =>
              wsDo(
                'prove',
                () => runner.workspaceProve(),
                (r) => r.blocked || (r.why ? 'It could not be proven: ' + r.why : ''),
              ),
          },
          wsBusy === 'prove' ? 'Proving…' : workspace.proof ? 'Prove it again' : 'Prove it',
        ),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            id: 'ws-discard',
            disabled: busy,
            onclick: () =>
              wsDo(
                'discard',
                () => runner.workspaceDiscard(),
                'The change was thrown away. Nothing left this machine.',
              ),
          },
          'Throw it away',
        ),
      ),
      wsBusy === 'prove'
        ? h(
            'p',
            { class: 'muted small', role: 'status' },
            'One proof test, run before the change and after it. This can take a few minutes.',
          )
        : null,
      workspace.proof && workspace.proof.rows
        ? h(
            'div',
            { class: 'ws-proof', id: 'ws-proof' },
            h(
              'p',
              null,
              h(
                'span',
                { class: 'tag ' + (workspace.proof.ok ? 'ok' : 'warn') },
                workspace.proof.ok ? 'Proven' : 'Not proven yet',
              ),
              ' ',
              workspace.proof.says || workspace.proof.why || '',
            ),
            workspace.proof.rows.length
              ? h(
                  'table',
                  { class: 'proof-rows' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      ['What was checked', 'Before', 'After', 'Verdict'].map((t) => h('th', null, t)),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    workspace.proof.rows.map((x) =>
                      h(
                        'tr',
                        null,
                        h('td', null, x.test, x.why ? h('small', null, x.why) : null),
                        h(
                          'td',
                          { class: 'r-' + x.base },
                          x.base === 'green' ? 'Passes' : x.base === 'red' ? 'Fails' : 'No result',
                        ),
                        h(
                          'td',
                          { class: 'r-' + x.change },
                          x.change === 'green' ? 'Passes' : x.change === 'red' ? 'Fails' : 'No result',
                        ),
                        h(
                          'td',
                          null,
                          h(
                            'span',
                            { class: 'tag ' + (x.verdict === 'proven' ? 'ok' : x.verdict === 'guard' ? '' : 'warn') },
                            x.label,
                          ),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
            workspace.proof.steps && workspace.proof.steps.length
              ? [
                  h('h4', null, 'Steps to check it yourself'),
                  h(
                    'ol',
                    null,
                    workspace.proof.steps.map((t) => h('li', null, t)),
                  ),
                ]
              : null,
            workspace.proof.touched && workspace.proof.touched.length
              ? h(
                  'p',
                  { class: 'note' },
                  'While writing the proof the team also touched ' +
                    workspace.proof.touched.join(', ') +
                    '. Look at it before you land.',
                )
              : null,
            workspace.proof.image
              ? h(
                  'a',
                  { class: 'proof-pic', href: runner.proofUrl(workspace.proof.id), target: '_blank', rel: 'noopener' },
                  h('img', {
                    src: runner.proofUrl(workspace.proof.id),
                    alt: 'The proof image: the verdict, each check before and after the change, and the steps to check it',
                    loading: 'lazy',
                  }),
                )
              : workspace.proof.imageWhy
                ? h('p', { class: 'muted small' }, workspace.proof.imageWhy)
                : null,
            workspace.proof.medium ? h('p', { class: 'muted small' }, workspace.proof.medium) : null,
          )
        : null,
    ),
  );
}
function newRepoForm() {
  if (!wsLive()) return null;
  const name = h('input', {
    type: 'text',
    id: 'ws-new',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'A name for a new repository',
    'aria-label': 'Name for a new repository',
    maxlength: '100',
    value: wsNew.name,
    oninput: (e) => {
      wsNew.name = e.target.value;
    },
  });
  const vis = (v, label) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(wsNew.private === v),
        onclick: () => {
          wsNew.private = v;
          paint(true);
        },
      },
      label,
    );
  return h(
    'form',
    {
      class: 'field ws-create',
      onsubmit: (e) => {
        e.preventDefault();
        const n = wsNew.name.trim();
        if (!n) return;
        wsDo(
          'create',
          async () => {
            const r = await runner.githubCreate(n, wsNew.private);
            ghRepos = null;
            workspace = await runner.workspaceUse(r.name);
            ghError = '';
            localItems = null;
            core.linkWorkspace({ kind: 'github', name: r.name });
            wsNew.name = '';
            readGh();
            return r;
          },
          (r) => r.name + ' is made, ' + (r.private ? 'private' : 'public') + ', and cloned.',
        );
      },
    },
    name,
    h(
      'div',
      { class: 'jseg', role: 'group', 'aria-label': 'Who can see it' },
      vis(true, 'Private'),
      vis(false, 'Public'),
    ),
    h(
      'button',
      { class: 'btn', type: 'submit', id: 'ws-create', disabled: !!wsBusy },
      wsBusy === 'create' ? 'Making it…' : 'Make it',
    ),
  );
}
// A GIT FOLDER ON THIS MACHINE: found in the machine's own folder window, then disconnected or changed for another. Nothing else.
function folderCard(snap, isGh, isLocal) {
  const connected = workspace.kind === 'folder' && isLocal && workspace.repo === snap.workspace.name;
  return card(
    connected ? 'chosen' : isGh ? 'aside' : '',
    connected ? h('span', { class: 'in-use' }, '✓ Connected') : null,
    h('h2', null, 'Git folder'),
    connected
      ? [
          h('p', { class: 'chosen-name' }, h('span', { class: 'folder', 'aria-hidden': 'true' }), workspace.repo),
          h(
            'p',
            { class: 'muted small ws-where', id: 'ws-folder-path' },
            h('code', null, workspace.folder),
            workspace.remote
              ? [
                  'origin: ',
                  h(
                    'a',
                    { href: workspace.remote.web, target: '_blank', rel: 'noopener' },
                    workspace.remote.host + '/' + workspace.remote.slug,
                  ),
                ]
              : null,
          ),
        ]
      : h('p', { class: 'muted' }, 'A folder on this machine that is already a Git repository.'),
    ...(connected ? placeParts(snap) : []),
    h(
      'div',
      { class: 'row' },
      APP
        ? null
        : h(
            'button',
            {
              class: 'btn' + (connected || isGh ? '' : ' primary'),
              type: 'button',
              id: 'ws-folder',
              disabled: !!wsBusy,
              onclick: () => useFolder(''),
            },
            wsBusy === 'folder'
              ? 'Choose it in the window that opened…'
              : connected
                ? 'Choose a different folder'
                : 'Find a Git folder',
          ),
      connected ? discBtn(snap) : null,
    ),
    APP && !connected
      ? h('p', { class: 'muted small', id: 'ws-folder-phone' }, 'Find the folder on the computer itself.')
      : null,
  ); // on a phone there is no folder window to open
}
function githubCard(snap, isGh, isLocal, manual, linkManual) {
  const cls = isGh ? 'chosen' : isLocal ? 'aside' : '';
  const head = [
    isGh ? h('span', { class: 'in-use' }, '✓ Connected') : null,
    h('h2', null, 'GitHub'),
    isGh ? h('p', { class: 'chosen-name' }, snap.workspace.name) : null,
  ];
  const act = async (fn) => {
    ghSaid = '';
    try {
      await fn();
    } catch (e) {
      ghSaid = e.message;
    }
    readGh();
  };
  const said = ghSaid ? h('p', { class: 'note', role: 'alert' }, ghSaid) : null;
  const out = isGh ? h('div', { class: 'row' }, discBtn(snap)) : null;
  if (!ghs || ghs.unread)
    return card(
      cls,
      ...head,
      out,
      h(
        'form',
        { class: 'field', onsubmit: linkManual },
        manual,
        h('button', { class: 'btn', type: 'submit' }, isGh ? 'Change' : 'Connect'),
      ),
      ghError ? h('p', { class: 'note', role: 'alert' }, ghError) : null,
      h(
        'p',
        { class: 'note' },
        'The app on this machine did not answer about GitHub. Run the start command again in Terminal to update it.',
      ),
    );
  if (ghs.signedIn) {
    const searchBox = h('input', {
      type: 'text',
      autocomplete: 'off',
      placeholder: 'Find a repository',
      'aria-label': 'Find a repository',
      value: ghQ,
    });
    return card(
      cls,
      ...head,
      ...(isGh ? placeParts(snap) : []),
      out,
      h(
        'p',
        { class: 'muted gh-who', id: 'conn-github' },
        'Signed in as ',
        h('strong', null, ghs.login),
        '. ',
        h('button', { class: 'btn small', type: 'button', id: 'gh-signout', onclick: signOutGh }, 'Sign out'),
      ),
      h('h3', null, isGh ? 'Use a different repository' : 'Choose a repository'),
      h(
        'form',
        {
          class: 'field',
          onsubmit: (e) => {
            e.preventDefault();
            ghQ = searchBox.value.trim();
            ghRepos = null;
            readGh();
          },
        },
        searchBox,
        h('button', { class: 'btn', type: 'submit' }, 'Find'),
      ),
      ghRepos == null
        ? h('p', { class: 'muted small' }, 'Reading your repositories…')
        : ghRepos.length
          ? h(
              'ul',
              { class: 'rows repos' },
              ghRepos.slice(0, 8).map((r) => {
                const on = isGh && snap.workspace.name === r.name;
                const going = wsBusy === 'use:' + r.name;
                return h(
                  'li',
                  null,
                  tag(r.private ? '' : 'ok', r.private ? 'Private' : 'Public'),
                  h('span', { class: 't' }, h('strong', null, r.name), h('span', null, 'Default branch ' + r.branch)),
                  h(
                    'button',
                    {
                      class: 'btn small' + (on ? '' : ' primary'),
                      type: 'button',
                      disabled: on || !!wsBusy,
                      onclick: () => useRepo(r.name),
                    },
                    on ? 'Connected' : going ? 'Cloning…' : 'Connect',
                  ),
                );
              }),
            )
          : h('p', { class: 'empty' }, 'No repository of yours matches.'),
      wsLive() ? h('h3', null, 'Or start a new one') : null,
      newRepoForm(),
      said,
      wsLive()
        ? null
        : h(
            'p',
            { class: 'note' },
            'The app on this machine is older than this page. Run the start command again in Terminal to update it.',
          ),
    );
  }
  // NOT SIGNED IN. What is offered depends on what is there: this app's own sign-in when it is set up; GitHub's own command when it
  // is signed in; its sign-in when it is there but not signed in; and installing it (then signing in) when it is not there at all.
  const flow = ghs.flow;
  const waiting = flow && flow.state === 'waiting';
  const starting = flow && flow.state === 'starting';
  const job = ghs.ghJob;
  const installing = job && job.state === 'installing';
  const known = ghs.ghSignedIn !== undefined;
  const idle = !waiting && !starting && !installing;
  const state = !known
    ? ''
    : ghs.gh && ghs.ghSignedIn
      ? "GitHub's command on this machine is signed in."
      : ghs.gh
        ? "GitHub's command is on this machine, but is not signed in."
        : ghs.canInstall
          ? "GitHub's command is not on this machine."
          : ghs.configured
            ? ''
            : "GitHub's command is not on this machine, and there is no build of it for this machine.";
  return card(
    cls,
    ...head,
    out,
    state && idle ? h('p', { class: 'muted', id: 'gh-state' }, state) : null,
    installing
      ? h(
          'p',
          { class: 'muted', id: 'gh-installing', role: 'status' },
          "Installing GitHub's command for this app" + (job.pct ? ', ' + job.pct + '%' : '') + '…',
        )
      : null,
    starting ? h('p', { class: 'muted', id: 'gh-starting', role: 'status' }, "Starting GitHub's sign-in…") : null,
    waiting
      ? h(
          'div',
          { class: 'gh-code' },
          h('span', { class: 'muted' }, 'Type this code on GitHub, then approve:'),
          h('code', { id: 'gh-code' }, flow.code),
          h(
            'div',
            { class: 'row' },
            h('a', { class: 'btn primary', href: flow.uri, target: '_blank', rel: 'noopener' }, 'Open GitHub'),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: (e) => {
                  navigator.clipboard.writeText(flow.code).then(
                    () => {
                      e.target.textContent = 'Copied';
                    },
                    () => {},
                  );
                },
              },
              'Copy the code',
            ),
          ),
          h('span', { class: 'muted small' }, 'Waiting for your approval on GitHub.'),
        )
      : null,
    idle && flow && flow.state === 'failed'
      ? h('p', { class: 'note', role: 'alert' }, 'The sign-in did not finish: ' + flow.why)
      : null,
    idle && job && job.state === 'failed'
      ? h(
          'p',
          { class: 'note', role: 'alert', id: 'gh-install-failed' },
          "GitHub's command could not be installed: " + job.why,
        )
      : null,
    idle
      ? h(
          'div',
          { class: 'row' },
          ghs.gh && (ghs.ghSignedIn || !known)
            ? h(
                'button',
                { class: 'btn primary', type: 'button', id: 'gh-use', onclick: () => act(() => runner.githubUseGh()) },
                'Use the GitHub sign-in on this machine',
              )
            : null,
          ghs.gh && known && !ghs.ghSignedIn
            ? h(
                'button',
                {
                  class: 'btn primary',
                  type: 'button',
                  id: 'gh-login',
                  onclick: () => act(() => runner.githubGhLogin()),
                },
                'Sign in to GitHub',
              )
            : null,
          !ghs.gh && known && ghs.canInstall
            ? h(
                'button',
                {
                  class: 'btn primary',
                  type: 'button',
                  id: 'gh-install',
                  onclick: () => act(() => runner.githubGhInstall()),
                },
                'Install it and sign in',
              )
            : null,
          ghs.configured
            ? h(
                'button',
                {
                  class: 'btn' + (ghs.gh || (known && ghs.canInstall) ? '' : ' primary'),
                  type: 'button',
                  id: 'gh-device',
                  onclick: () => act(() => runner.githubLogin()),
                },
                'Sign in with GitHub',
              )
            : null,
        )
      : null,
    said,
  );
}
const view = $('#view');
let cur = 'chat';
let chat = null;
let picked = null;
let localItems = null;
let ghError = '';
let visionQuery = '';
let vhits = null;

const card = (cls, ...kids) => h('section', { class: 'card glass flat ' + cls }, kids);
const tag = (cls, text) => h('span', { class: 'tag ' + cls }, text);
const mini = (stage) =>
  h(
    'span',
    { class: 'mini', title: stage },
    STAGES.map((_, i) => h('i', { class: i <= STAGES.indexOf(stage) ? 'on' : '' })),
  );
const STAGE_TEXT = {
  planned: 'Planned',
  judge: 'Judge written',
  build: 'Building',
  proven: 'Proven, waiting to land',
  landed: 'Landed',
};
// more: what is drawn under the seat's line (on Claude Code, its model and effort). It is called from a map as well, which hands it a number there.
const seatRow = (x, more) =>
  h(
    'li',
    { class: 'seat' + (x.status === 'working' ? ' working' : '') },
    seatFace(x.id, moodOfSeat(x)), // a face that shows what it is doing, and the seat's manner beside its name
    h(
      'span',
      { class: 't' },
      [
        h('strong', null, seatAs(x).title, h('em', { class: 'tone' }, seatAs(x).short || x.tone || '')),
        h('span', null, x.status === 'working' ? x.line : 'Idle'),
        more instanceof Node ? more : null,
      ].filter(Boolean),
    ),
    h('span', { class: 'dot ' + (x.status === 'working' ? 'is-run' : 'is-clear') }),
  );
const offers = (list) =>
  list.length ? list.map((p) => paintOffer(h('div'), p, core)) : h('p', { class: 'muted' }, 'Nothing waits on you.');

const VIEWS = {
  // THE OVERVIEW is what there is to set up, and how each thing stands: nothing else. The state of the rest of the system is on the
  // navigation itself (navChips), next to the page it belongs to.
  overview(s) {
    const ses = s.session || {};
    const said = s.chat.some((m) => m.by === 'you');
    const steps = [
      {
        done: !!ses.model,
        text: 'A mind for your team to think with',
        href: 'start.html',
        go: 'Choose',
        sub: ses.model
          ? (ses.kind === 'claude' ? 'Claude Code' : shortModel(ses.model)) +
            (ses.tokPerSec && ses.kind !== 'claude' ? ', ' + ses.tokPerSec + ' tokens a second' : '') +
            (ses.of ? ', agent check ' + ses.passed + ' of ' + ses.of : '')
          : 'Not chosen yet',
      },
      {
        done: !!s.workspace.kind,
        text: 'A workspace for it to read and write',
        href: '#workspace',
        go: 'Connect',
        sub: s.workspace.kind
          ? (s.workspace.kind === 'github' ? 'GitHub: ' : 'Folder: ') + s.workspace.name
          : 'A GitHub repo, or a folder on your computer',
      },
      {
        done: said,
        text: 'Say hello to your team',
        href: '#chat',
        go: 'Open the chat',
        change: 'Open',
        sub: said ? 'You have talked with your team' : 'One room, five seats. Ask for something.',
      },
    ];
    const also = [
      {
        done: !!jira && jira.state === 'connected',
        text: 'Jira',
        href: '#jira',
        go: 'Connect',
        change: 'Open',
        sub: !jira
          ? 'Your tickets, with the filters you choose'
          : jira.state === 'connected'
            ? 'Connected' + (jira.last ? ', ' + jira.last.issues.length + ' tickets read ' + ago(jira.last.at) : '')
            : 'Not connected. Your tickets, with the filters you choose',
      },
      {
        done: !!lic && lic.enforce && lic.tier !== 'free',
        text: 'Plan',
        href: '#plan',
        go: 'See the plans',
        change: 'Open',
        sub: !lic
          ? 'Free, or Pro for local models'
          : !lic.enforce
            ? 'Everything is open for now'
            : 'You are on ' + lic.name + (lic.until ? ' until ' + new Date(lic.until).toLocaleDateString() : ''),
      },
    ];
    const doneCount = steps.filter((x) => x.done).length;
    const next = steps.find((x) => !x.done);
    const row = (x, i, numbered) =>
      h(
        'li',
        { class: (x.done ? 'done' : '') + (x === next ? ' next' : '') },
        h('span', { class: 'setup-n', 'aria-hidden': 'true' }, x.done ? '✓' : numbered ? String(i + 1) : ''),
        h('span', { class: 't' }, h('strong', null, x.text), h('span', null, x.sub)),
        h(
          'span',
          { class: 'tag ' + (x.done ? 'ok' : x === next ? 'warn' : '') },
          x.done ? 'Done' : x === next ? 'Next' : numbered ? 'To do' : 'Optional',
        ),
        h(
          'a',
          { class: 'btn small' + (x === next ? ' primary' : ''), href: x.href },
          x.done ? x.change || 'Change' : x.go,
        ),
      );
    view.append(
      h(
        'div',
        { class: 'grid' },
        h(
          'p',
          { class: 'plan-back' },
          h('a', { class: 'btn small', id: 'overview-back', href: '#chat' }, '← Back to the team chat'),
        ),
        card(
          'setup',
          h(
            'div',
            { class: 'setup-head' },
            h(
              'div',
              null,
              h('h2', { id: 'setup-h' }, next ? 'Set up your team' : 'Your team is set up'),
              h(
                'p',
                { class: 'muted' },
                next
                  ? doneCount + ' of ' + steps.length + ' done. The next one is marked.'
                  : 'Everything it needs is in place. Any of it can be changed here.',
              ),
            ),
            h(
              'div',
              { class: 'setup-meter', role: 'img', 'aria-label': doneCount + ' of ' + steps.length + ' set up' },
              steps.map((x) => h('i', { class: x.done ? 'on' : '' })),
            ),
          ),
          h(
            'ol',
            { class: 'setup-list' },
            steps.map((x, i) => row(x, i, true)),
          ),
        ),
        card(
          '',
          h('h2', null, 'Also yours to set up'),
          h(
            'ul',
            { class: 'setup-list' },
            also.map((x, i) => row(x, i, false)),
          ),
        ),
      ),
    );
  },

  chat() {
    const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const input = h('input', {
      type: 'text',
      autocomplete: 'off',
      placeholder: 'Ask for a change',
      'aria-label': 'Your message to the team',
    });
    // a picture or a recording for the team to look at: the paperclip opens the computer's own file chooser
    const pick = h('input', {
      type: 'file',
      accept: 'image/*,video/*',
      multiple: true,
      onchange: (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (files.length) addFiles(files);
      },
    });
    const clip =
      runner.live && runner.mediaUp
        ? h(
            'button',
            {
              class: 'btn attach',
              type: 'button',
              id: 'attach',
              title: 'Give the team a picture or a video to look at',
              'aria-label': 'Attach a picture or a video',
              onclick: () => pick.click(),
            },
            glyph('clip'),
          )
        : null;
    const form = h(
      'form',
      { class: 'composer' },
      clip,
      input,
      h('button', { class: 'btn primary', type: 'submit' }, 'Send'),
    );
    // WHAT IS ATTACHED, IN THE MESSAGE BOX: the ticket the chat is about (it stays until its x is pressed), and the pictures and
    // recordings chosen, pasted or dropped (they go with the next message). Each is a chip with an x.
    const pending = [];
    const urls = new Map();
    const filesEl = h('div', { id: 'attach-files' });
    const tray = h(
      'div',
      { class: 'attach-tray', id: 'attach-tray', role: 'group', 'aria-label': 'Attached' },
      h('div', { id: 'chat-ticket' }),
      filesEl,
    );
    let trayNote = '';
    const sizeOf = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const paintFiles = () => {
      for (const [f, u] of urls)
        if (!pending.includes(f)) {
          URL.revokeObjectURL(u);
          urls.delete(f);
        }
      filesEl.replaceChildren(
        ...pending.map((f) => {
          if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
          return h(
            'span',
            { class: 'att file', title: f.name },
            /^video\//.test(f.type)
              ? h('video', {
                  class: 'att-thumb',
                  src: urls.get(f),
                  muted: '',
                  preload: 'metadata',
                  'aria-hidden': 'true',
                })
              : h('img', { class: 'att-thumb', src: urls.get(f), alt: '' }),
            h('span', { class: 't' }, f.name),
            h('span', { class: 'att-size' }, sizeOf(f.size)),
            h(
              'button',
              {
                class: 'att-x',
                type: 'button',
                'aria-label': 'Remove ' + f.name,
                title: 'Remove',
                onclick: () => {
                  pending.splice(pending.indexOf(f), 1);
                  trayNote = '';
                  paintFiles();
                  input.focus();
                },
              },
              '×',
            ),
          );
        }),
        ...(trayNote ? [h('p', { class: 'tray-note', role: 'status' }, trayNote)] : []),
      );
    };
    const addFiles = (files) => {
      const ok = files.filter((f) => /^(image|video)\//.test(f.type || ''));
      const not = files.filter((f) => !ok.includes(f));
      const room = Math.max(0, 4 - pending.length);
      pending.push(...ok.slice(0, room));
      trayNote = not.length
        ? not.map((f) => f.name).join(', ') +
          (not.length === 1
            ? ' is not a picture or a video, so it was left out.'
            : ' are not pictures or videos, so they were left out.')
        : ok.length > room
          ? 'Four at a time: the rest were left out.'
          : '';
      paintFiles();
      input.focus();
    };
    if (clip) {
      input.addEventListener('paste', (e) => {
        const fs = [...((e.clipboardData && e.clipboardData.files) || [])];
        if (fs.length) {
          e.preventDefault();
          addFiles(fs);
        }
      });
      for (const el of [log, form, tray]) {
        el.addEventListener('dragover', (e) => {
          if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
        });
        el.addEventListener('drop', (e) => {
          const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
          if (fs.length) {
            e.preventDefault();
            addFiles(fs);
          }
        });
      }
    }
    const talk = richComposer({
      form,
      input,
      core,
      files: {
        take: () => {
          const out = pending.splice(0);
          trayNote = '';
          paintFiles();
          return out;
        },
      },
    }); // who a message is for: chips, @, or Reply
    // SIMPLE: the conversation is the app. In place of who-it-is-for, a row of what can be asked for; each starts the message.
    // It offers only what this team can do: making a picture or a video is there when that helper was chosen and is in use, not otherwise.
    const simple = isSimple();
    const helps = (runner.live && (runner.state() || {}).helpers) || {};
    const canDraw = !!helps.draw;
    const canFilm = !!helps.film;
    const made = canDraw && canFilm ? 'a picture or a video' : canDraw ? 'a picture' : canFilm ? 'a video' : '';
    const ACTS = [
      ['Ask', ''],
      ['Find out', 'Find out '],
      ['Look at a page', 'Look at https://'],
      canDraw ? ['Make a picture', 'Make a picture of '] : null,
      canFilm ? ['Make a video', 'Make a short video of '] : null,
    ].filter(Boolean);
    const acts = simple
      ? h(
          'div',
          { class: 'simple-acts', role: 'group', 'aria-label': 'What to ask for' },
          ACTS.map(([name, start]) =>
            h(
              'button',
              {
                class: 'to-chip',
                type: 'button',
                onclick: () => {
                  input.value = start;
                  input.focus();
                  input.setSelectionRange(start.length, start.length);
                },
              },
              name,
            ),
          ),
        )
      : null;
    if (simple)
      input.placeholder = made ? 'Ask anything, or ask for ' + made : 'Ask anything, or have it look something up';
    const crew = simple
      ? h(
          'div',
          { class: 'crew', 'aria-hidden': 'true' },
          ((core.snapshot().team || {}).seats || []).map((x) =>
            h('span', { class: 'crew-one' }, buddy(x.id, moodOfSeat(x)), h('em', null, seatAs(x).title)),
          ),
        )
      : null;
    view.append(
      h('div', { class: 'chat-top', id: 'chat-top' }),
      h(
        'div',
        { class: 'grid cols-2' },
        h(
          'section',
          { class: 'chat-card glass flat', 'aria-label': 'Group chat' },
          log,
          h(
            'div',
            { class: 'chat-empty' },
            crew || h('span', { class: 'dot is-green', 'aria-hidden': 'true' }),
            h('h2', null, 'Your team is here'),
            h(
              'p',
              null,
              simple
                ? 'Ask a question, have it look something up' +
                    (made ? ', show it a page, or ask for ' + made + '.' : ', or show it a page.')
                : 'Five seats, one room. Say hello, ask a question, send them to find something out or to look at a page, or tell them what you want done.',
            ),
            h(
              'div',
              { class: 'starters' },
              (simple
                ? [
                    'What can you help me with?',
                    'Find out what is on in my city this weekend',
                    canDraw
                      ? 'Make a picture of a lighthouse at dusk'
                      : canFilm
                        ? 'Make a short video of waves on a beach'
                        : 'Explain how a rainbow forms',
                  ]
                : [
                    'Hello team. Who does what?',
                    'Look up the latest stable Node.js release',
                    'How would you prove a change is done?',
                  ]
              ).map((t) =>
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    onclick: () => {
                      input.value = t;
                      input.focus();
                    },
                  },
                  t,
                ),
              ),
            ),
          ),
          acts,
          talk.bar,
          tray,
          form,
        ),
        h('div', { class: 'grid', id: 'chat-side' }),
      ),
    );
    chat = chatView(log, core, { onReply: talk.reply });
    chatSide(core.snapshot());
    chatTop(core.snapshot());
    chatTicket(core.snapshot());
    chat.tail.pin();
  },

  workspace(snap) {
    const repoBox = h('input', {
      type: 'text',
      autocomplete: 'off',
      placeholder: 'owner/repo',
      'aria-label': 'GitHub repository',
      value: snap.workspace.kind === 'github' ? snap.workspace.name : '',
    });
    const linkGh = (e) => {
      e.preventDefault();
      const v = repoBox.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(v)) {
        ghError = 'Write it as owner/repo, for example acme/billing.';
        paint(true);
        return;
      }
      ghError = '';
      localItems = null;
      core.linkWorkspace({ kind: 'github', name: v });
    };
    if (!ghAsked) {
      ghAsked = true;
      readGh();
      readWs();
    }
    const canPick = typeof window.showDirectoryPicker === 'function';
    const isGh = snap.workspace.kind === 'github';
    const isLocal = snap.workspace.kind === 'local';
    const items = snap.workspace.items != null ? snap.workspace.items : localItems;
    const pick = async () => {
      try {
        const dir = await window.showDirectoryPicker({ mode: 'read' });
        let n = 0;
        for await (const _ of dir.values()) {
          if (++n >= 500) break;
        }
        localItems = n;
        core.linkWorkspace({ kind: 'local', name: dir.name, items: n });
      } catch (e) {
        /* the person closed the picker: nothing changes */
      }
    };
    view.append(
      h(
        'div',
        { class: 'grid' },
        card(
          '',
          h('h2', null, snap.workspace.kind ? 'Your team works in ' + snap.workspace.name : 'No workspace yet'),
          h(
            'p',
            { class: 'muted', id: 'ws-lead' },
            snap.workspace.kind
              ? 'Branches, pushing and pull requests are settled with your team in the chat.'
              : 'Connect a Git folder or a GitHub repository.',
          ),
          connSaid ? h('p', { class: 'plan-said', role: 'status', id: 'conn-said' }, connSaid) : null,
          wsSaid ? h('p', { class: 'plan-said', role: 'status', id: 'ws-said' }, wsSaid) : null,
        ),
        waitingCard(snap),
        h(
          'div',
          { class: 'grid cols-even' },
          githubCard(snap, isGh, isLocal, repoBox, linkGh),
          wsLive() && !APP && !snap.workspace.kind && runner.workspaceClone ? cloneCard() : null,
          wsLive()
            ? folderCard(snap, isGh, isLocal)
            : card(
                isLocal ? 'chosen' : isGh ? 'aside' : '',
                isLocal ? h('span', { class: 'in-use' }, '✓ Connected') : null,
                h('h2', null, 'A folder on this computer'),
                isLocal
                  ? h(
                      'p',
                      { class: 'chosen-name' },
                      h('span', { class: 'folder', 'aria-hidden': 'true' }),
                      snap.workspace.name,
                    )
                  : h('p', { class: 'muted' }, 'A folder on this computer.'),
                isLocal
                  ? h(
                      'p',
                      { class: 'muted' },
                      items == null
                        ? 'Chosen on this computer.'
                        : items === 0
                          ? 'It is empty: nothing at its top level yet.'
                          : (items >= 500 ? '500 or more' : items) +
                            (items === 1 ? ' item' : ' items') +
                            ' at its top level.',
                    )
                  : null,
                h(
                  'div',
                  { class: 'row' },
                  h(
                    'button',
                    { class: 'btn', type: 'button', disabled: !canPick, onclick: pick },
                    isLocal ? 'Choose a different folder' : 'Find a folder',
                  ),
                  isLocal ? discBtn(snap) : null,
                ),
                canPick ? null : h('p', { class: 'note' }, 'This browser cannot pick folders. Chrome and Edge can.'),
              ),
        ),
      ),
    );
  },

  // THE SOUL. Laid out as the system this team comes from lays its own out: what it holds (rulings first, the source of truth), how it
  // recalls (Vision, before every turn), and how what happened is graded and kept (Hindsight). A number that has not been measured
  // reads as a dash, never as zero.
  learning(snap) {
    const kept = snap.learning.ledger;
    const lessons = kept.filter((x) => x.kind !== 'you');
    const you = kept.filter((x) => x.kind === 'you');
    const rul = snap.rulings || [];
    const eps = snap.episodes || [];
    const inForce = rul.filter((r) => !r.superseded);
    const resets = snap.resets || [];
    const counted = [...kept, ...Object.values(snap.base || {})];
    const shown = counted.reduce((n, x) => n + (x.shown || 0), 0);
    const used = counted.reduce((n, x) => n + (x.used || 0), 0);
    const built = eps.filter((e) => e.shown > 0).length;
    const askBox = h('input', {
      type: 'text',
      autocomplete: 'off',
      placeholder: 'What have we settled about dark mode?',
      'aria-label': 'A question for Vision',
      value: visionQuery,
    });
    const ask = (e) => {
      e.preventDefault();
      visionQuery = askBox.value.trim();
      vhits = visionQuery ? core.ask(visionQuery) : null;
      paint(true);
    };
    const tile = (n, label, sub) =>
      h('div', { class: 'tile glass flat' }, h('strong', null, n), h('span', null, label), h('small', null, sub));
    view.append(
      h(
        'div',
        { class: 'grid' },
        h(
          'p',
          { class: 'soul-lede' },
          "Your team's soul is everything it has settled with you, each thing linked to what it came from. ",
          h('strong', null, 'Vision'),
          ' brings the part that matters back to a seat before it speaks. ',
          h('strong', null, 'Hindsight'),
          ' looks at what happened afterwards, grades it, and keeps what was learned. It is what makes the second request go better than the first.',
        ),
        h(
          'div',
          { class: 'tiles four' },
          tile(
            inForce.length + kept.length + snap.proofs.length + snap.work.length + BASE.length,
            'Things it can recall',
            'Rulings, requests, proofs, lessons, and what it started with',
          ),
          tile(inForce.length, 'Rulings in force', 'Your decisions lead every answer'),
          tile(
            shown ? Math.round((used / shown) * 100) + '%' : '–',
            'Vision used',
            shown
              ? used + ' of ' + shown + ' recalled lessons were drawn on in the reply'
              : 'Not measured yet: no lesson has been recalled',
          ),
          tile(
            eps.length ? built + ' of ' + eps.length : '–',
            'Rounds built on what it knew',
            eps.length
              ? 'Requests answered with something already learned'
              : 'Not measured yet: no request has been answered',
          ),
        ),
        card(
          '',
          h('h2', null, 'Your rulings'),
          h(
            'p',
            { class: 'muted' },
            'What you have decided. These are the source of truth: every seat is shown the ones in force before it speaks, ahead of anything else, and a newer ruling on the same thing replaces the older one.',
          ),
          rul.length
            ? h(
                'ul',
                { class: 'rows wrap-text' },
                rul.map((r) =>
                  h(
                    'li',
                    { class: r.superseded ? 'old' : '' },
                    tag(r.superseded ? '' : 'ok', r.superseded ? 'Replaced' : 'In force'),
                    h('span', { class: 't' }, h('strong', null, r.text)),
                    h('span', { class: 'when' }, ago(r.at)),
                  ),
                ),
              )
            : h(
                'p',
                { class: 'empty' },
                'No rulings yet. Choosing a workspace, choosing how much the team does alone, and answering what the team proposes are all rulings.',
              ),
        ),
        card(
          '',
          h('h2', null, 'What the team knows about you'),
          h(
            'p',
            { class: 'muted' },
            'Picked up from what you have said in the chat: who you are, what you like, and how you want the team to work with you. Every seat is shown it before it speaks, so that its answers fit you. Nothing is kept that you did not say, and anything here can be forgotten.',
          ),
          you.length
            ? h(
                'ul',
                { class: 'rows wrap-text', id: 'soul-you' },
                you.map((x) =>
                  h(
                    'li',
                    null,
                    tag(x.used ? 'ok' : '', x.shown ? (x.used || 0) + ' of ' + x.shown + ' used' : 'Not used yet'),
                    h(
                      'span',
                      { class: 't' },
                      h('strong', null, x.text),
                      h('span', null, x.cites ? 'From when you said "' + x.cites + '"' : 'From the chat'),
                    ),
                    h(
                      'button',
                      {
                        class: 'btn small',
                        type: 'button',
                        'aria-label': 'Forget: ' + x.text,
                        onclick: () => {
                          core.forget(x.id);
                          paint(true);
                        },
                      },
                      'Forget',
                    ),
                  ),
                ),
              )
            : h(
                'p',
                { class: 'empty' },
                'Nothing yet. Tell the team about yourself as you go, and it keeps what will help it answer you. In the chat, "what do you know about me?" lists it.',
              ),
        ),
        card(
          '',
          h('h2', null, 'Vision'),
          h(
            'p',
            { class: 'muted' },
            'How a seat recalls. Before any seat speaks it is shown your rulings in force, then up to three things from the soul that bear on what was asked. Ask the question it asks:',
          ),
          h(
            'form',
            { class: 'field', onsubmit: ask },
            askBox,
            h('button', { class: 'btn primary', type: 'submit' }, 'Ask'),
          ),
          vhits == null
            ? null
            : vhits.length
              ? h(
                  'ul',
                  { class: 'rows wrap-text' },
                  vhits.map((x) =>
                    h(
                      'li',
                      null,
                      tag(x.kind === 'ruling' ? 'ok' : '', x.kind),
                      h('span', { class: 't' }, h('strong', null, x.text), h('span', null, x.from)),
                      h('span', { class: 'when' }, ago(x.at)),
                    ),
                  ),
                )
              : h('p', { class: 'muted' }, 'Nothing in this team\'s soul matches "' + visionQuery + '" yet.'),
        ),
        card(
          '',
          h('h2', null, 'Hindsight'),
          h(
            'p',
            { class: 'muted' },
            'What happened, graded and kept. After each request the team keeps what it settled as a lesson, linked to the request it came from. Each time Vision recalls a lesson, the reply is checked: did the seat draw on it?',
          ),
          // HOW THE TEAM IS DOING (team/hindsight.js): read off its own finished work, no model asked
          (() => {
            const r = core.hindsight ? core.hindsight() : null;
            if (!r || !r.experiences)
              return h('p', { class: 'empty' }, 'How the team is doing is shown here once it has finished some work.');
            const pct = (x) => Math.round(x * 100) + '%';
            return h(
              'dl',
              { class: 'hind-read' },
              h(
                'div',
                null,
                h('dt', null, 'Stood as first given'),
                h('dd', null, pct(r.firstPass)),
                h('span', null, 'of ' + r.experiences + ' finished pieces of work'),
              ),
              h(
                'div',
                null,
                h('dt', null, 'Put right by you'),
                h('dd', null, String(r.corrections)),
                h(
                  'span',
                  null,
                  r.toldTwice ? r.toldTwice + ' about something already said' : 'never twice about the same thing',
                ),
              ),
              h(
                'div',
                null,
                h('dt', null, 'Does keeping lessons help?'),
                h(
                  'dd',
                  null,
                  r.helped
                    ? (r.helped.rounds >= 0 ? '-' : '+') + Math.abs(r.helped.rounds) + ' rounds'
                    : 'Not measured',
                ),
                h(
                  'span',
                  null,
                  r.helped
                    ? 'where a lesson was used, against work with none'
                    : 'needs five pieces of work of a kind, with and without',
                ),
              ),
              h(
                'div',
                null,
                h('dt', null, 'Tied together'),
                h('dd', null, String(r.links || 0)),
                h('span', null, 'links between what is kept: recall follows them two steps out'),
              ),
              r.faults.length
                ? h(
                    'div',
                    { class: 'wide' },
                    h('dt', null, 'What had to be put right'),
                    h(
                      'dd',
                      null,
                      r.faults
                        .slice(0, 5)
                        .map((f) => h('span', { class: 'tag' + (f.check ? ' ok' : '') }, f.says + ' · ' + f.n)),
                    ),
                    h(
                      'span',
                      null,
                      r.landedShare == null
                        ? ''
                        : pct(r.landedShare) + ' of these kinds are now caught by the app itself',
                    ),
                  )
                : null,
            );
          })(),
          h('h3', null, 'Lessons'),
          lessons.length
            ? h(
                'ul',
                { class: 'rows wrap-text' },
                lessons.map((x) =>
                  h(
                    'li',
                    null,
                    tag(x.used ? 'ok' : '', x.shown ? (x.used || 0) + ' of ' + x.shown + ' used' : 'Not recalled yet'),
                    h(
                      'span',
                      { class: 't' },
                      h('strong', null, x.text),
                      h('span', null, x.cites ? 'From the request "' + x.cites + '"' : 'Kept by the team'),
                    ),
                    h('span', { class: 'when' }, ago(x.at)),
                  ),
                ),
              )
            : h(
                'p',
                { class: 'empty' },
                'Nothing yet. Ask the team for something: what it settles is kept here, and Vision brings it back when something like it comes up again.',
              ),
          h('h3', null, 'Rounds'),
          eps.length
            ? h(
                'ul',
                { class: 'rows wrap-text' },
                eps.map((e) =>
                  h(
                    'li',
                    null,
                    tag(
                      e.shown ? 'ok' : '',
                      e.shown ? 'Built on ' + e.shown + (e.shown === 1 ? ' recall' : ' recalls') : 'From nothing',
                    ),
                    h(
                      'span',
                      { class: 't' },
                      h('strong', null, e.title),
                      h(
                        'span',
                        null,
                        // what came of it (team/hindsight.js): how it ended and in how many rounds, beside what it always said
                        (e.seats ? e.seats + ' seats, ' : '') +
                          e.seconds +
                          ' s' +
                          (e.rounds > 1 ? ', ' + e.rounds + ' rounds' : '') +
                          (e.outcome
                            ? ', ' +
                              ({
                                stood: 'it stood',
                                landed: 'it landed',
                                corrected: 'you put it right',
                                replaced: 'replaced after a doubt',
                                stopped: 'stopped',
                                thrown: 'thrown away',
                              }[e.outcome] || e.outcome)
                            : '') +
                          (e.kept ? ', and a lesson was kept' : ', nothing kept'),
                      ),
                    ),
                    h('span', { class: 'when' }, ago(e.at)),
                  ),
                ),
              )
            : h(
                'p',
                { class: 'empty' },
                'No rounds yet. Each request the team answers is recorded here, with whether it was answered from something it already knew.',
              ),
        ),
        // PROOFS, kept with the rest of what the team holds: the record of each change, newest first, and the one that is opened.
        card(
          '',
          h('h2', { id: 'soul-proofs' }, 'Proofs'),
          h(
            'p',
            { class: 'muted' },
            'The record of each change: the check that defined done, every run of it, red then green, and the receipt it earned.',
          ),
          snap.proofs.length
            ? (() => {
                const open = snap.proofs.find((p) => p.id === picked) || snap.proofs[0];
                return h(
                  'div',
                  { class: 'grid cols-2' },
                  h(
                    'div',
                    { class: 'rows' },
                    snap.proofs.map((p) => {
                      const st = proofState(p);
                      return h(
                        'button',
                        {
                          type: 'button',
                          'aria-pressed': String(p.id === open.id),
                          onclick: () => {
                            picked = p.id;
                            paint(true);
                          },
                        },
                        tag(st.tag, st.text),
                        h(
                          'span',
                          { class: 't' },
                          h('strong', null, p.title),
                          h('span', null, p.runs.length + ' runs · built by ' + p.by.code),
                        ),
                        h('span', { class: 'when' }, ago(p.at)),
                      );
                    }),
                  ),
                  h('div', null, h('h3', null, open.title), proofDetail(open)),
                );
              })()
            : h('p', { class: 'empty' }, 'No proofs yet. One appears here for each change the team makes.'),
        ),
        card(
          '',
          h('h2', null, 'What the Overseer proposes'),
          h(
            'p',
            { class: 'muted' },
            'The Overseer watches how the work goes and proposes changes to how the team works.',
          ),
          offers([...snap.proposals].sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1))),
        ),
        // WHAT EVERY TEAM STARTS WITH (base-lessons.js): general practice, by subject. Not the customer's decisions and not learned with
        // them, so it is shown apart from both, folded away until a subject is opened.
        card(
          '',
          h('h2', null, 'What your team started with'),
          h(
            'p',
            { class: 'muted' },
            BASE.length +
              ' lessons every team begins with: how to prove a change, how to tell evidence from a guess, how to check a screen, how to work with a small model. They are general practice, not your decisions. Vision recalls one only on a firm match, and your own rulings and lessons come first.',
          ),
          [...new Set(BASE.map((b) => b.topic))].map((topic) => {
            const xs = BASE.filter((b) => b.topic === topic);
            return h(
              'details',
              {
                class: 'base-topic',
                open: baseOpen.has(topic),
                ontoggle: (e) => {
                  if (e.target.open) baseOpen.add(topic);
                  else baseOpen.delete(topic);
                },
              },
              h('summary', null, topic, h('span', { class: 'count' }, String(xs.length))),
              h(
                'ul',
                { class: 'rows wrap-text' },
                xs.map((b) => {
                  const c = (snap.base || {})[b.id];
                  return h(
                    'li',
                    null,
                    tag(
                      c && c.used ? 'ok' : '',
                      c && c.shown ? (c.used || 0) + ' of ' + c.shown + ' used' : 'Not recalled yet',
                    ),
                    h('span', { class: 't' }, h('strong', null, b.text), h('span', null, 'When: ' + b.when)),
                    h('span', null, ''),
                  );
                }),
              ),
            );
          }),
        ),
        card(
          '',
          h('h2', null, 'What a seat carries across a context reset'),
          h(
            'p',
            { class: 'muted' },
            "A long conversation is not carried whole. When a seat's context grows past its bar, it writes itself a short packet (what it owes, what is in flight, the last result, where to look) and carries on from that. It happens behind the scenes; this is the record.",
          ),
          resets.length
            ? h(
                'ul',
                { class: 'rows wrap-text' },
                resets
                  .slice(0, 8)
                  .map((r) =>
                    h(
                      'li',
                      null,
                      tag('ok', Math.round((1 - r.after / r.before) * 100) + '% shed'),
                      h(
                        'span',
                        { class: 't' },
                        h(
                          'strong',
                          null,
                          ((snap.team.seats.find((x) => x.id === r.seat) || {}).title || r.seat) + ' reset its context',
                        ),
                        h(
                          'span',
                          null,
                          r.before.toLocaleString() +
                            ' characters carried became a packet of ' +
                            r.after.toLocaleString(),
                        ),
                      ),
                      h('span', { class: 'when' }, ago(r.at)),
                    ),
                  ),
              )
            : h('p', { class: 'empty' }, 'No resets yet. They begin once a conversation is long enough to need one.'),
        ),
        h(
          'p',
          { class: 'note' },
          'This is modelled on the soul of the system your team comes from: one store of rulings, requests, proofs and lessons linked by what cites what, recall before every turn, and grading after the fact. It lives on this device and is not yet joined to that system. "Used" is judged by whether a reply shares the recalled lesson\'s distinctive words, which is a rough measure.',
        ),
      ),
    );
  },

  // JIRA: sign in once (Atlassian's own page, kept by Claude Code), then see the tickets as Jira's own board shows them: a column for
  // each status, cards that can be dragged from one to another, a ticket that opens beside the board, and a way to bring a ticket to
  // the team. Reading and writing are done by the runner through the connector (runner/jira.mjs); this page only asks and shows.
  jira() {
    if (!jira) {
      readJira();
      return view.append(
        card('', h('h2', null, 'Jira'), h('p', { class: 'muted' }, 'Looking at your Jira connection…')),
      );
    }
    const jiraState = jira.state;
    const busy = jiraBusy === 'search';
    const says = jiraSaid
      ? h(
          'p',
          { class: 'plan-said', role: 'status', id: 'jira-said' },
          jiraSaid,
          jiraLink
            ? [
                ' ',
                h(
                  'a',
                  { class: 'btn small', href: jiraLink, target: '_blank', rel: 'noopener' },
                  'Open the Jira sign-in',
                ),
              ]
            : null,
        )
      : null;
    if (jiraState !== 'connected')
      return view.append(
        h(
          'div',
          { class: 'grid' },
          card(
            '',
            h('h2', null, jiraState === 'unavailable' ? 'Jira needs Claude Code' : 'Connect your Jira'),
            h(
              'p',
              { class: 'muted' },
              jiraState === 'unavailable'
                ? "Your tickets are read through Atlassian's own connector, which lives in Claude Code, and Claude Code is not on this machine yet. Choose Claude Code once on the Start page and it is installed for you."
                : "Sign in once, in your own browser, on Atlassian's own page. This app never sees your password: the sign-in is kept by Claude Code on this machine, and your tickets are read through Atlassian's own connector.",
            ),
            jiraState === 'unavailable'
              ? h('div', null, h('a', { class: 'btn', href: 'start.html' }, 'Go to Start'))
              : h(
                  'div',
                  { class: 'row' },
                  h(
                    'button',
                    {
                      class: 'btn primary',
                      type: 'button',
                      id: 'jira-signin',
                      disabled: jiraBusy === 'signin',
                      onclick: jiraSignIn,
                    },
                    jiraBusy === 'signin' ? 'Waiting for the sign-in…' : 'Sign in to Jira',
                  ),
                ),
            says,
            jira.why ? h('p', { class: 'note' }, jira.why) : null,
          ),
        ),
      );
    if (!jira.boards && !jiraAskedBoards && !jiraBusy) {
      jiraAskedBoards = true;
      setTimeout(jiraLoadBoards, 0);
    } // the boards to choose from, read once
    const last = jira.last;
    const proj = (jira.projects && jira.projects.list) || [];
    const boards = (jira.boards && jira.boards.list) || [];
    const all = last ? last.issues : [];
    const scope = !!(jiraFilters.board || jiraFilters.project);
    const q =
      jira.quick &&
      ((jiraFilters.board && jira.quick.boardId === jiraFilters.board) ||
        (!jiraFilters.board && jiraFilters.project && jira.quick.project === jiraFilters.project))
        ? jira.quick
        : null; // what was read for THIS board, not the one before
    const seg = (key, opts, name) =>
      h(
        'div',
        { class: 'jseg', role: 'group', 'aria-label': name },
        opts.map(([v, label]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(jiraFilters[key] === v),
              onclick: () => {
                jiraFilters[key] = v;
                paint(true);
              },
            },
            label,
          ),
        ),
      );
    // AREA: the chip on a card ("Android", "API") is the ticket's own Area field in Jira (a team's "Area(s)" custom field, or its
    // components where a project uses those). The menu lists the areas on the tickets that were read, each with how many tickets
    // have it, and ticking one narrows the board at once: nothing is asked of Jira. Ticking changes the tick and the button in place,
    // so the menu stays open for the next one. It closes on a press outside it or on Escape.
    const areaOf = (x) => [...new Set([...(x.areas || []), ...(x.components || [])])];
    const areaN = new Map();
    for (const x of all) for (const a of areaOf(x)) areaN.set(a, (areaN.get(a) || 0) + 1);
    for (const set of [jiraView.areas, jiraView.notAreas])
      for (const a of [...set]) if (all.length && !areaN.has(a)) set.delete(a); // an area none of these tickets has is no longer a filter
    // TWO MENUS OVER THE SAME AREAS: "Area" keeps only the tickets in an area that is ticked, "Not area" leaves out the tickets in one.
    // An area cannot be both, so ticking it in one unticks it in the other, where it stands.
    const areaMenus = [];
    const areaMenu = (id, name, set) => {
      const sum = h('summary', { id });
      const label = () =>
        sum.replaceChildren(name, set.size ? h('b', null, set.size === 1 ? [...set][0] : String(set.size)) : '');
      const ticks = [...areaN.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((v) =>
          h(
            'button',
            {
              type: 'button',
              role: 'checkbox',
              'data-v': v,
              'aria-label': v + ', ' + areaN.get(v) + (areaN.get(v) === 1 ? ' ticket' : ' tickets'),
              onclick: () => {
                if (set.has(v)) set.delete(v);
                else {
                  set.add(v);
                  for (const m of areaMenus) if (m.set !== set && m.set.delete(v)) m.sync();
                }
                sync();
                paintBoard();
              },
            },
            h('span', null, v),
            h('i', null, String(areaN.get(v))),
          ),
        );
      const sync = () => {
        for (const b of ticks) b.setAttribute('aria-checked', String(set.has(b.getAttribute('data-v'))));
        label();
      };
      sync();
      areaMenus.push({ set, sync });
      return h(
        'details',
        { class: 'jmenu' },
        sum,
        h(
          'div',
          { class: 'jmenu-list', role: 'group', 'aria-label': name },
          ticks,
          areaN.size
            ? null
            : h(
                'p',
                null,
                all.length
                  ? 'None of these tickets has an area set in Jira.'
                  : 'Show tickets first. The areas are the ones on the tickets.',
              ),
        ),
      );
    };
    // THE TOOLBAR, in the order Jira's own board has it: search the board, the people on it, what to show, the board's own filters, and
    // clear. Searching, pressing a face and ticking an area narrow the tickets already read, at once. "Tickets" changes what is
    // read from Jira, so it takes effect on Show tickets.
    jiraFacesSoon();
    const who = new Map();
    const tags = new Map();
    for (const x of all) {
      const n = x.assignee || 'Unassigned';
      if (!who.has(n)) who.set(n, { name: n, avatar: x.avatar || null, n: 0 });
      who.get(n).n++;
      for (const t of x.labels || []) tags.set(t, (tags.get(t) || 0) + 1);
    }
    const flip = (set, v) => () => {
      if (set.has(v)) set.delete(v);
      else set.add(v);
      paint(true);
    };
    const STATUS = { open: 'Open', todo: 'To do', doing: 'In progress', done: 'Done', all: 'All' };
    const what = h(
      'details',
      {
        class: 'jmenu',
        open: jfOpen,
        ontoggle: (e) => {
          jfOpen = e.target.open;
        },
      },
      h(
        'summary',
        { id: 'jira-what' },
        'Tickets',
        h(
          'b',
          null,
          (jiraFilters.mine ? 'Mine' : 'Everyone') +
            ', ' +
            (jiraFilters.board ? 'this board' : STATUS[jiraFilters.status].toLowerCase()) +
            (jiraFilters.sprint ? ', this sprint' : '') +
            (jiraFilters.text ? ', "' + jiraFilters.text + '"' : ''),
        ),
      ),
      h(
        'div',
        { class: 'jmenu-list wide', role: 'group', 'aria-label': 'Which tickets to read' },
        h('span', { class: 'k' }, 'Whose'),
        seg(
          'mine',
          [
            [true, 'Mine'],
            [false, 'Everyone'],
          ],
          'Whose tickets',
        ),
        h('span', { class: 'k' }, 'Status'),
        jiraFilters.board
          ? h('p', null, "The statuses in this board's own columns.")
          : seg('status', Object.entries(STATUS), 'Status'),
        h(
          'button',
          {
            type: 'button',
            class: 'jtoggle',
            id: 'jira-sprint',
            'aria-pressed': String(jiraFilters.sprint),
            onclick: () => {
              jiraFilters.sprint = !jiraFilters.sprint;
              paint(true);
            },
          },
          'Current sprint',
        ),
        h('span', { class: 'k' }, 'Words in the ticket'),
        h('input', {
          type: 'text',
          id: 'jira-text',
          'aria-label': 'Words in the ticket',
          placeholder: 'Searched in Jira',
          value: jiraFilters.text,
          maxlength: '80',
          autocomplete: 'off',
          oninput: (e) => {
            jiraFilters.text = e.target.value;
          },
        }),
      ),
    );
    const narrowed =
      jiraView.people.size || jiraView.tags.size || jiraView.areas.size || jiraView.notAreas.size || jiraQuery.trim();
    const bar = h(
      'form',
      {
        class: 'jira-tools',
        onsubmit: (e) => {
          e.preventDefault();
          jiraShow();
        },
      },
      h('input', {
        type: 'text',
        id: 'jira-find',
        class: 'jfind',
        'aria-label': 'Search the tickets on the board',
        placeholder: 'Search board',
        value: jiraQuery,
        autocomplete: 'off',
        oninput: (e) => {
          jiraQuery = e.target.value;
          paintBoard();
        },
      }),
      all.length
        ? h(
            'div',
            { class: 'faces', role: 'group', 'aria-label': 'People' },
            [...who.values()]
              .sort((a, b) => b.n - a.n)
              .slice(0, 8)
              .map((p) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'face',
                    'aria-pressed': String(jiraView.people.has(p.name)),
                    title: p.name + ', ' + p.n + (p.n === 1 ? ' ticket' : ' tickets'),
                    'aria-label': p.name,
                    onclick: flip(jiraView.people, p.name),
                  },
                  p.avatar
                    ? h('img', {
                        src: p.avatar,
                        alt: '',
                        referrerpolicy: 'no-referrer',
                        loading: 'lazy',
                        onerror: (e) => e.target.replaceWith(document.createTextNode(initials(p.name))),
                      })
                    : initials(p.name),
                ),
              ),
          )
        : null,
      what,
      areaMenu('jira-area', 'Area', jiraView.areas),
      areaMenu('jira-area-not', 'Not area', jiraView.notAreas),
      // WHICH COLUMNS: the board's own, to tick. Offered once the board has been read; what is ticked is what Show tickets reads.
      jiraFilters.board && last && (last.allColumns || []).length
        ? (() => {
            const sum = h('summary', { id: 'jira-cols-menu' });
            const label = () =>
              sum.replaceChildren(
                'Columns',
                h('b', null, String(jiraFilters.cols.length || (last.columns || []).length)),
              );
            label();
            return h(
              'details',
              { class: 'jmenu' },
              sum,
              h(
                'div',
                { class: 'jmenu-list', role: 'group', 'aria-label': 'Columns to show' },
                last.allColumns.map((name) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'checkbox',
                      'aria-checked': String(jiraFilters.cols.includes(name)),
                      onclick: (e) => {
                        const on = !jiraFilters.cols.includes(name);
                        jiraFilters.cols = last.allColumns.filter((n) =>
                          n === name ? on : jiraFilters.cols.includes(n),
                        );
                        e.currentTarget.setAttribute('aria-checked', String(on));
                        label();
                      },
                    },
                    name,
                  ),
                ),
                h('p', null, 'Press Show tickets to read the columns ticked.'),
              ),
            );
          })()
        : null,
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          id: 'jira-clear',
          hidden: !narrowed,
          onclick: () => {
            jiraView.people.clear();
            jiraView.tags.clear();
            jiraView.areas.clear();
            jiraView.notAreas.clear();
            jiraQuery = '';
            paint(true);
          },
        },
        'Clear filters',
      ),
      h('span', { class: 'jgap' }),
      h(
        'select',
        {
          id: 'jira-board',
          'aria-label': 'Board',
          disabled: jiraBusy === 'boards',
          onchange: (e) => jiraPick(e.target.value),
        },
        h(
          'option',
          { value: '' },
          jiraBusy === 'boards' ? 'Reading your boards…' : boards.length || !proj.length ? 'Any board' : 'Any project',
        ),
        boards.map((b) =>
          h(
            'option',
            { value: 'b:' + b.id, selected: jiraFilters.board === b.id },
            b.name + (b.project ? ' (' + b.project + ')' : ''),
          ),
        ),
        boards.length
          ? !jiraFilters.board && jiraFilters.project
            ? h('option', { value: 'p:' + jiraFilters.project, selected: true }, 'Project ' + jiraFilters.project)
            : null
          : proj.map((p) =>
              h('option', { value: 'p:' + p.key, selected: jiraFilters.project === p.key }, p.key + ': ' + p.name),
            ),
      ),
      h(
        'button',
        { class: 'btn primary', type: 'submit', id: 'jira-show', disabled: busy },
        busy ? 'Reading Jira…' : 'Show tickets',
      ),
    );
    const labels = tags.size
      ? h(
          'div',
          { class: 'jchips', role: 'group', 'aria-label': 'Labels' },
          [...tags.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 14)
            .map(([t, n]) =>
              h(
                'button',
                { type: 'button', 'aria-pressed': String(jiraView.tags.has(t)), onclick: flip(jiraView.tags, t) },
                t,
                h('i', null, String(n)),
              ),
            ),
        )
      : null;

    // A CARD, laid out as Jira lays one out: what it is about, where it belongs, then one line of marks: its kind, its key, how long it
    // has sat in this column, a flag, its priority and whose it is. Pressing it opens the ticket; dragging it moves it.
    const TYPE = (t) =>
      h('i', {
        class:
          'jtype ' +
          (/bug/i.test(t)
            ? 'bug'
            : /epic/i.test(t)
              ? 'epic'
              : /story/i.test(t)
                ? 'story'
                : /sub/i.test(t)
                  ? 'sub'
                  : 'task'),
        title: t || 'Task',
        role: 'img',
        'aria-label': t || 'Task',
      });
    const PRIO = (p) =>
      p
        ? h('i', {
            class:
              'jprio ' +
              (/highest|blocker|critical/i.test(p)
                ? 'top'
                : /high|major/i.test(p)
                  ? 'high'
                  : /lowest|trivial/i.test(p)
                    ? 'least'
                    : /low|minor/i.test(p)
                      ? 'low'
                      : 'mid'),
            title: p + ' priority',
            role: 'img',
            'aria-label': p + ' priority',
          })
        : null;
    const face = (name, avatar) =>
      h(
        'span',
        {
          class: 'jface' + (name ? '' : ' none'),
          title: name || 'Unassigned',
          role: 'img',
          'aria-label': name || 'Unassigned',
        },
        avatar
          ? h('img', {
              src: avatar,
              alt: '',
              referrerpolicy: 'no-referrer',
              loading: 'lazy',
              onerror: (e) => e.target.replaceWith(document.createTextNode(initials(name))),
            })
          : name
            ? initials(name)
            : '',
      );
    const ticket = (issue) => {
      const days = issue.since ? Math.max(0, Math.floor((Date.now() - issue.since) / 86400000)) : null;
      const moving = jmoving.get(issue.key);
      return h(
        'article',
        {
          class:
            'ticket jcard' +
            (jsel === issue.key ? ' sel' : '') +
            (issue.flagged ? ' flagged' : '') +
            (moving ? ' moving' : ''),
          draggable: moving ? 'false' : 'true',
          tabindex: '0',
          'data-key': issue.key,
          'aria-label': issue.key + ': ' + issue.summary + '. ' + issue.status + '. Press to open, drag to move.',
          ondragstart: (e) => {
            jdrag = issue.key;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', issue.key);
            e.currentTarget.classList.add('dragging');
          },
          ondragend: (e) => {
            jdrag = '';
            e.currentTarget.classList.remove('dragging');
            $$('.jcol.over').forEach((c) => c.classList.remove('over'));
          },
          onclick: (e) => {
            if (!e.target.closest('a')) openTicket(issue.key);
          },
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openTicket(issue.key);
            }
          },
        },
        h('p', null, issue.summary),
        (issue.areas || []).length || (issue.components || []).length || (issue.labels || []).length
          ? h(
              'div',
              { class: 'tlabels' },
              [...new Set([...(issue.areas || []), ...(issue.components || []), ...(issue.labels || [])])]
                .slice(0, 4)
                .map((l) => h('span', null, l)),
            )
          : null,
        issue.parent
          ? h(
              'span',
              { class: 'jparent', title: issue.parent.key + ' ' + issue.parent.summary },
              h('i', { 'aria-hidden': 'true' }),
              issue.parent.key + ' ' + issue.parent.summary,
            )
          : null,
        h(
          'footer',
          null,
          TYPE(issue.type),
          issue.url
            ? h(
                'a',
                { class: 'jkey', href: issue.url, target: '_blank', rel: 'noopener', draggable: 'false' },
                issue.key,
              )
            : h('strong', { class: 'jkey' }, issue.key),
          days != null && issue.category !== 'done'
            ? h(
                'span',
                {
                  class: 'jage' + (days >= 7 ? ' old' : ''),
                  title: 'In this column for ' + days + (days === 1 ? ' day' : ' days'),
                },
                days + 'd',
              )
            : null,
          issue.flagged ? h('i', { class: 'jflag', title: 'Flagged', role: 'img', 'aria-label': 'Flagged' }) : null,
          moving ? h('span', { class: 'jmove', role: 'status' }, h('i', { class: 'jspin' }), 'Moving') : null,
          h('span', { class: 'jend' }, PRIO(issue.priority), face(issue.assignee, issue.avatar)),
        ),
      );
    };
    // THE COLUMNS ARE FIXED, as on Jira's own board: To Do, Reopened, In Progress, Tech Review. Each is there whether or not it holds a
    // ticket, so there is always somewhere to drop one. A ticket in any other status (Done, say) is not on the board: a line under
    // the board says how many there are, and they can be shown.
    const CAT = { todo: 0, doing: 1, done: 2 };
    const rank = (n) => {
      const i = JORDER.indexOf(n.toLowerCase());
      return i < 0 ? 50 : i;
    };
    const board = h('div', { id: 'jira-boardbox' });
    function paintBoard() {
      const words = jiraQuery.trim().toLowerCase();
      const shown = all.filter(
        (x) =>
          (!jiraView.people.size || jiraView.people.has(x.assignee || 'Unassigned')) &&
          [...jiraView.tags].every((t) => (x.labels || []).includes(t)) &&
          (!jiraView.areas.size || areaOf(x).some((a) => jiraView.areas.has(a))) &&
          !areaOf(x).some((a) => jiraView.notAreas.has(a)) &&
          (!words || (x.key + ' ' + x.summary).toLowerCase().includes(words)),
      );
      const norm = (v) =>
        String(v || '')
          .toLowerCase()
          .replace(/[^a-z]/g, '');
      const spelt = (name) => {
        const k = norm(name);
        const hit = all.find((x) => norm(x.status) === k);
        const seen = (jira.statuses || []).find((x) => norm(x.name) === k);
        return hit ? hit.status : seen ? seen.name : name;
      }; // the status as Jira spells it, once it has been seen
      // a board that was read brings its own columns, each with the statuses it holds; without one, the four usual columns are shown
      const cols =
        last && last.columns && last.columns.length
          ? last.columns.map((c) => ({
              name: c.name,
              to: c.statuses[0],
              keys: c.statuses.map(norm),
              category: '',
              xs: [],
            }))
          : JCOLS.map(([name, category]) => ({
              name: spelt(name),
              to: spelt(name),
              keys: [norm(name)],
              category,
              xs: [],
            }));
      const other = new Map();
      for (const x of shown) {
        const c = cols.find((y) => y.keys.includes(norm(x.status)));
        if (c) {
          c.xs.push(x);
          if (!c.category) c.category = x.category;
        } else {
          const k = x.status || 'No status';
          if (!other.has(k)) other.set(k, { name: k, to: k, keys: [norm(k)], category: x.category, xs: [] });
          other.get(k).xs.push(x);
        }
      }
      const rest = [...other.values()].sort(
        (a, b) =>
          (CAT[a.category] ?? 1) - (CAT[b.category] ?? 1) ||
          rank(a.name) - rank(b.name) ||
          a.name.localeCompare(b.name),
      );
      const off = rest.reduce((n, c) => n + c.xs.length, 0);
      if (jOther) cols.push(...rest);
      const count = $('#jira-shown');
      if (count) {
        count.hidden = shown.length === all.length;
        count.textContent = shown.length + ' of ' + all.length + ' shown';
      }
      const clear = $('#jira-clear');
      if (clear)
        clear.hidden = !(
          jiraView.people.size ||
          jiraView.tags.size ||
          jiraView.areas.size ||
          jiraView.notAreas.size ||
          words
        );
      const note =
        last && off
          ? h(
              'p',
              { class: 'muted small', id: 'jira-other' },
              off +
                (off === 1 ? ' ticket is' : ' tickets are') +
                ' in a status that is not a column here (' +
                rest.map((c) => c.name + ' ' + c.xs.length).join(', ') +
                '). ',
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  id: 'jira-other-show',
                  onclick: () => {
                    jOther = !jOther;
                    paintBoard();
                  },
                },
                jOther ? 'Hide them' : 'Show them',
              ),
            )
          : null;
      board.replaceChildren(
        ...[
          !last
            ? card('', h('p', { class: 'empty' }, 'Choose what to see and press Show tickets.'))
            : !last.issues.length
              ? card('', h('p', { class: 'empty' }, 'No tickets match.'))
              : !shown.length
                ? card(
                    '',
                    h('p', { class: 'empty' }, 'None of the tickets read match what is searched for and chosen above.'),
                  )
                : h(
                    'div',
                    { class: 'jira-board jira-cols', id: 'jira-cols' },
                    cols.map((c) =>
                      h(
                        'section',
                        {
                          class: 'jcol glass flat',
                          'data-col': c.category,
                          'data-status': c.name,
                          ondragover: (e) => {
                            if (!jdrag) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            e.currentTarget.classList.add('over');
                          },
                          ondragleave: (e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('over');
                          },
                          ondrop: (e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('over');
                            const key = jdrag || e.dataTransfer.getData('text/plain');
                            const x = all.find((i) => i.key === key);
                            jdrag = '';
                            if (x && !c.keys.includes(norm(x.status))) moveTicket(key, c.to, c.category);
                          },
                        }, // dropped where it already is: nothing to do
                        h('h3', null, c.name, h('span', { class: 'count' }, String(c.xs.length))),
                        c.xs.map(ticket),
                        c.xs.length ? null : h('p', { class: 'jdrop' }, 'Drop a ticket here'),
                      ),
                    ),
                  ),
          note,
        ].filter(Boolean),
      );
    }
    paintBoard();
    // THE TICKET, opened beside the board: what its card does not carry, where it can move to, and the way to bring it to the team.
    // Top to bottom: what it is and where it stands; its title; three actions in one row; its details as one aligned list; then its
    // description, its files by name, and its comments, with the box to write a new one ABOVE them. While the rest is being read from
    // Jira the panel says so with a ring turning inside a green halo, and what the card already carried is shown meanwhile.
    const openIssue = jopen ? all.find((i) => i.key === jopen.key) : null;
    const detail = jopen && jopen.data;
    const ticketNow = detail || openIssue;
    const row = (k, v) => h('div', { class: 'jrow' }, h('dt', null, k), h('dd', null, v));
    const pics = new Map(all.filter((x) => x.assignee && x.avatar).map((x) => [x.assignee, x.avatar]));
    const tAreas = ticketNow
      ? [...new Set([...((detail && detail.areas) || []), ...((openIssue && openIssue.areas) || [])])]
      : [];
    const reading = (text) =>
      h(
        'div',
        { class: 'jload', role: 'status', id: 'jira-reading' },
        h('span', { class: 'jload-ring', 'aria-hidden': 'true' }, h('i', { class: 'halo' }), h('i', { class: 'turn' })),
        h('span', null, text),
      );
    const canMove = !!(detail && detail.transitions.length && openIssue);
    const isMine = !!(jira.me && ticketNow && ticketNow.assignee && ticketNow.assignee === jira.me); // already the customer's own: the button says so, and does nothing
    const panel =
      !jopen || !ticketNow
        ? null
        : h(
            'aside',
            { class: 'jpanel glass flat', id: 'jira-ticket', 'aria-label': 'Ticket ' + ticketNow.key },
            h(
              'header',
              null,
              TYPE(ticketNow.type),
              ticketNow.url
                ? h('a', { class: 'jkey', href: ticketNow.url, target: '_blank', rel: 'noopener' }, ticketNow.key)
                : h('strong', { class: 'jkey' }, ticketNow.key),
              h(
                'span',
                { class: 'tag ' + ((openIssue || ticketNow).category === 'done' ? 'ok' : '') },
                (openIssue || ticketNow).status,
              ),
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  id: 'jira-close',
                  onclick: () => {
                    jopen = null;
                    jsel = '';
                    paint(true);
                  },
                },
                'Close',
              ),
            ),
            h('h2', null, ticketNow.summary),
            h(
              'div',
              { class: 'jacts' },
              h(
                'button',
                {
                  class: 'btn primary small',
                  type: 'button',
                  id: 'jira-discuss',
                  title: 'Talk to the team about this ticket',
                  onclick: () => {
                    core.focusTicket({
                      key: ticketNow.key,
                      summary: ticketNow.summary,
                      status: ticketNow.status,
                      type: ticketNow.type,
                      priority: ticketNow.priority,
                      assignee: ticketNow.assignee,
                      url: ticketNow.url,
                      description: detail ? detail.description : '',
                    });
                    if (detail && core.lookAtTicket) core.lookAtTicket(detail);
                    location.hash = '#chat';
                  },
                },
                'Talk to the team',
              ),
              h(
                'select',
                {
                  id: 'jira-move',
                  'aria-label': 'Move this ticket to',
                  disabled: !canMove || jmoving.has(ticketNow.key),
                  onchange: (e) => {
                    if (e.target.value) moveTicket(ticketNow.key, e.target.value, '');
                  },
                },
                h('option', { value: '' }, 'Move to…'),
                canMove ? detail.transitions.map((tr) => h('option', { value: tr.to }, tr.to)) : null,
              ),
              h(
                'button',
                {
                  class: 'btn small' + (isMine ? ' is-mine' : ''),
                  type: 'button',
                  id: 'jira-take',
                  disabled: !!jact || isMine,
                  title: isMine ? 'This ticket is already assigned to you' : null,
                  onclick: () =>
                    ticketDo('take', async () => {
                      const r = await runner.jiraTake(ticketNow.key);
                      if (r.me) jira.me = r.me;
                      if (openIssue) openIssue.assignee = r.assignee;
                      if (jopen && jopen.data) jopen.data.assignee = r.assignee;
                    }),
                },
                jact === 'take' ? 'Assigning…' : isMine ? '✓ Assigned to you' : 'Assign to me',
              ),
            ),
            h(
              'dl',
              { class: 'jfields' },
              row('Assignee', [
                face(
                  ticketNow.assignee,
                  pics.get(ticketNow.assignee) ||
                    (openIssue && openIssue.assignee === ticketNow.assignee && openIssue.avatar) ||
                    null,
                ),
                h('span', { class: 'ell' }, ticketNow.assignee || 'Unassigned'),
              ]),
              detail
                ? row('Reporter', [
                    face(detail.reporter, pics.get(detail.reporter) || null),
                    h('span', { class: 'ell' }, detail.reporter || 'Not given'),
                  ])
                : null,
              row('Priority', [PRIO(ticketNow.priority), ticketNow.priority || 'None']),
              ticketNow.parent
                ? row(
                    'Parent',
                    h(
                      'span',
                      { class: 'ell', title: ticketNow.parent.key + ' ' + ticketNow.parent.summary },
                      h('strong', null, ticketNow.parent.key),
                      ' ' + ticketNow.parent.summary,
                    ),
                  )
                : null,
              detail && detail.sprint ? row('Sprint', detail.sprint) : null,
              tAreas.length ? row('Area', tAreas.join(', ')) : null,
              (ticketNow.components || []).length ? row('Components', ticketNow.components.join(', ')) : null,
              (ticketNow.labels || []).length ? row('Labels', ticketNow.labels.join(', ')) : null,
              ticketNow.updated ? row('Updated', ago(ticketNow.updated)) : null,
            ),
            jopen.err ? h('p', { class: 'note', role: 'alert' }, jopen.err) : null,
            jopen.loading && !detail ? reading('Reading the description and the comments from Jira…') : null,
            detail
              ? [
                  h('h3', null, 'Description'),
                  detail.description
                    ? h('div', { class: 'jdesc' }, md(detail.description))
                    : h('p', { class: 'muted' }, 'It has no description.'),
                  (detail.attachments || []).length
                    ? [
                        h('h3', null, 'Files', h('span', { class: 'count' }, String(detail.attachments.length))),
                        h(
                          'ul',
                          { class: 'jfiles' },
                          detail.attachments.map((f) => h('li', { title: f.type || '' }, f.name)),
                        ),
                        h(
                          'p',
                          { class: 'muted small' },
                          'Pictures and recordings are fetched to this computer and looked at by the team when you talk to it about this ticket; other files are named here and opened in Jira. ',
                          ticketNow.url
                            ? h(
                                'a',
                                { href: ticketNow.url, target: '_blank', rel: 'noopener' },
                                'Open ' + ticketNow.key + ' in Jira',
                              )
                            : null,
                        ),
                      ]
                    : null,
                  detail.subtasks.length
                    ? [
                        h('h3', null, 'Subtasks'),
                        h(
                          'ul',
                          { class: 'rows wrap-text' },
                          detail.subtasks.map((st) =>
                            h(
                              'li',
                              null,
                              h('span', { class: 'tag' }, st.status || 'No status'),
                              h('span', { class: 't' }, h('strong', null, st.key), h('span', null, st.summary)),
                              h('span', null, ''),
                            ),
                          ),
                        ),
                      ]
                    : null,
                  h('h3', null, 'Comments', h('span', { class: 'count' }, String(detail.comments.length))),
                  mdEditor({
                    id: 'jira-comment',
                    value: jcomment,
                    label: 'Add a comment to ' + ticketNow.key,
                    placeholder: 'Add a comment',
                    busy: jact === 'comment',
                    send: 'Comment',
                    hint: 'Markdown. ⌘ Enter sends.',
                    files: jfiles,
                    filesSaid: jfilesSaid,
                    onInput: (v) => {
                      jcomment = v;
                    },
                    // the words go to Jira; the files are then offered to it, and if it cannot take them they stay in the box and the page says so
                    onSubmit: (text) =>
                      ticketDo('comment', async () => {
                        const r = await runner.jiraComment(ticketNow.key, text);
                        jcomment = '';
                        jfilesSaid = null;
                        if (jopen && jopen.data) jopen.data.comments.unshift(r.comment);
                        if (!jfiles.length) return;
                        const sent = await (
                          runner.jiraAttach
                            ? runner.jiraAttach(
                                ticketNow.key,
                                jfiles.map((f) => ({ name: f.name, type: f.type, bytes: f.size })),
                              )
                            : Promise.reject(new Error('The app on this machine is older than this page.'))
                        ).catch((e) => ({ ok: false, why: String((e && e.message) || e) }));
                        if (sent.ok) {
                          for (const f of jfiles) URL.revokeObjectURL(f.url);
                          jfiles.length = 0;
                          return;
                        }
                        jfilesSaid = [
                          'The comment was added. ' +
                            (jfiles.length === 1
                              ? 'The file was not attached'
                              : 'The ' + jfiles.length + ' files were not attached') +
                            ': ' +
                            sent.why +
                            ' ',
                          ticketNow.url
                            ? h(
                                'a',
                                { href: ticketNow.url, target: '_blank', rel: 'noopener' },
                                'Open ' + ticketNow.key + ' in Jira',
                              )
                            : 'Open the ticket in Jira',
                          ' to add ' +
                            (jfiles.length === 1 ? 'it' : 'them') +
                            ' there. ' +
                            (jfiles.length === 1 ? 'It is' : 'They are') +
                            ' still here.',
                        ];
                      }),
                  }),
                  jopen.loading ? reading('Reading the ticket again…') : null,
                  detail.comments.length
                    ? h(
                        'ul',
                        { class: 'jcomments' },
                        detail.comments.map((c) =>
                          h(
                            'li',
                            null,
                            face(c.author, pics.get(c.author) || null),
                            h(
                              'div',
                              { class: 'jc' },
                              h(
                                'div',
                                { class: 'jc-head' },
                                h('strong', null, c.author || 'Someone'),
                                c.at ? h('span', { class: 'when' }, ago(c.at)) : null,
                              ),
                              md(c.body),
                            ),
                          ),
                        ),
                      )
                    : h('p', { class: 'muted' }, 'No comments yet.'),
                ]
              : null,
          );
    view.append(
      h(
        'div',
        { class: 'grid' },
        card(
          'jira-bar',
          h(
            'div',
            { class: 'jira-head' },
            h('h2', null, 'Your tickets'),
            h(
              'span',
              { class: 'jira-meta', role: 'status', id: 'jira-meta' },
              busy
                ? [h('i', { class: 'jspin' }), 'Reading Jira. This takes 10 to 40 seconds.']
                : last
                  ? last.issues.length + (last.issues.length === 1 ? ' ticket' : ' tickets') + ', read ' + ago(last.at)
                  : (jira.site || '').replace(/^https:\/\//, ''),
            ),
            h('span', { class: 'muted small', id: 'jira-shown', hidden: true }),
          ),
          bar,
          labels,
          says,
          last && last.boardNote ? h('p', { class: 'note', id: 'jira-board-note' }, last.boardNote) : null,
        ),
        h('div', { class: 'jira-work' + (panel ? ' with-panel' : '') }, board, panel),
        last
          ? h(
              'details',
              { class: 'by-hand' },
              h('summary', null, 'The search that was run' + (last.seconds ? ', in ' + last.seconds + ' s' : '')),
              h('pre', { class: 'to-sign' }, last.jql),
            )
          : null,
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn small', type: 'button', id: 'jira-boards', disabled: !!jiraBusy, onclick: jiraLoadBoards },
            'Read my boards again',
          ),
          h(
            'button',
            { class: 'btn small', type: 'button', disabled: !!jiraBusy, onclick: jiraSignOut },
            'Sign out of Jira here',
          ),
        ),
      ),
    );
  },

  // REMOTE: the phone link, driven from this computer only. One switch; where the computer can be found; the code a phone pairs with
  // and the phones that asked; the phones that are paired; and putting the app on a phone that is plugged in.
  remote() {
    if (APP)
      return view.append(
        h(
          'div',
          { class: 'grid' },
          card(
            '',
            h('h2', null, 'Remote'),
            h(
              'p',
              { class: 'muted' },
              'This phone is already connected. Pairing and removing phones is done on the computer itself.',
            ),
          ),
        ),
      );
    if (!rem) {
      readRemote(false, true);
      return view.append(
        h(
          'div',
          { class: 'grid' },
          card('', h('h2', null, 'Remote'), h('p', { class: 'muted' }, 'Looking at the phone link…')),
        ),
      );
    }
    if (!remTimer)
      remTimer = setInterval(() => {
        if (cur !== 'remote') {
          clearInterval(remTimer);
          remTimer = 0;
          return;
        }
        if (!remBusy && !document.hidden) readRemote(true, true);
      }, 3000); // phones asking to pair, and phones plugged in, show up by themselves
    if (rem.failed)
      return view.append(
        h('div', { class: 'grid' }, card('', h('h2', null, 'Remote'), h('p', { class: 'note' }, rem.why))),
      );
    if (rem.usb == null && !remBusy) readRemote(true, true); // it was read for the navigation only: now also which phones are plugged in
    const linkOn = rem.on;
    const reach = rem.reach;
    const pairing = rem.pairing;
    const usb = rem.usb || { adb: true, list: [] };
    const digits = (c) => c.slice(0, 3) + ' ' + c.slice(3);
    const NEEDS = {
      open: 'It has an old address for this computer and catches up the next time it connects.',
      home: 'Open the app once on this Wi-Fi and it learns the new address.',
      pair: 'Pair it again: both addresses it has for this computer are out of date.',
    };
    const said = remSaid ? h('p', { class: 'plan-said', role: 'status', id: 'remote-said' }, remSaid) : null;
    const sw = h(
      'button',
      {
        class: 'rswitch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(linkOn),
        id: 'remote-switch',
        'aria-label': 'Remote access',
        disabled: !!remBusy,
        onclick: () => remDo('switch', () => runner.linkOn(!linkOn)),
      },
      h('i', { 'aria-hidden': 'true' }),
      h('span', null, remBusy === 'switch' ? (linkOn ? 'Switching off…' : 'Switching on…') : linkOn ? 'On' : 'Off'),
    );
    const head = card(
      linkOn ? 'chosen' : '',
      h('div', { class: 'remote-head' }, h('h2', null, 'Reach your team from your phone'), sw),
      !linkOn
        ? h(
            'p',
            { class: 'muted' },
            'Off. Nothing outside this computer can reach the app. Switch it on and one port listens for the phones you pair, and for nobody else.',
          )
        : h(
            'dl',
            { class: 'reach' },
            h(
              'div',
              null,
              h('dt', null, 'On this Wi-Fi'),
              h('dd', null, reach.lan || 'No network address was found for this computer'),
            ),
            h(
              'div',
              null,
              h('dt', null, 'Away from home'),
              h('dd', { class: reach.pub ? '' : 'no' }, reach.pub || 'Not reachable from outside'),
              h('dd', { class: 'why' }, reach.note),
            ),
          ),
      linkOn
        ? h(
            'p',
            { class: 'muted small' },
            'While this is on, the app keeps running on this computer after you close this page, so a phone can reach it. Only paired phones get in: anything else is dropped before a single request is read.',
          )
        : null,
    );
    const late = rem.devices.filter((d) => d.needs);
    const moved =
      linkOn && rem.changed && late.length
        ? h(
            'section',
            { class: 'card glass flat remote-moved', id: 'remote-moved', role: 'status' },
            h('h2', null, 'Your home address changed'),
            h(
              'p',
              null,
              'It changed ' +
                ago(rem.changed.at) +
                (rem.changed.from.pub ? ', from ' + rem.changed.from.pub.split(':')[0] : '') +
                (reach.pub ? ' to ' + reach.pub.split(':')[0] : '') +
                '. A phone that was away has the old one:',
            ),
            h(
              'ul',
              { class: 'rows wrap-text' },
              late.map((d) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'tag warn' }, d.name),
                  h('span', { class: 't' }, NEEDS[d.needs]),
                  h('span', null, ''),
                ),
              ),
            ),
          )
        : null;
    const pairCard = !linkOn
      ? null
      : card(
          '',
          h('h2', null, 'Pair a phone'),
          !pairing
            ? [
                h(
                  'p',
                  { class: 'muted' },
                  "Shows a code for the phone's camera. It works for ten minutes, and the phone still has to be allowed here before it gets in.",
                ),
                h(
                  'div',
                  { class: 'row' },
                  h(
                    'button',
                    {
                      class: 'btn primary',
                      type: 'button',
                      id: 'remote-pair',
                      disabled: !!remBusy,
                      onclick: () => remDo('pair', () => runner.linkPairing()),
                    },
                    'Show a pairing code',
                  ),
                ),
              ]
            : h(
                'div',
                { class: 'qr-wrap' },
                h('div', { class: 'qr', id: 'remote-qr' }, pairing.link ? qrSvg(pairing.link) : 'No network address'),
                h(
                  'div',
                  { class: 'qr-how' },
                  h(
                    'ol',
                    null,
                    h('li', null, 'On the phone, point the camera at the code and open the link.'),
                    h('li', null, 'The app opens and shows six digits.'),
                    h('li', null, 'The same six digits appear here. If they match, press Allow.'),
                  ),
                  h(
                    'p',
                    { class: 'muted small' },
                    'This code works until ' + clock(pairing.until) + '. The phone has to be on this Wi-Fi to pair.',
                  ),
                ),
              ),
          pairing && pairing.wants.length
            ? h(
                'ul',
                { class: 'wants', id: 'remote-wants' },
                pairing.wants.map((w) =>
                  h(
                    'li',
                    null,
                    h(
                      'span',
                      { class: 't' },
                      h('strong', null, w.name + ' wants to pair'),
                      h('span', { class: 'pcode' }, digits(w.code)),
                    ),
                    h(
                      'button',
                      {
                        class: 'btn primary small',
                        type: 'button',
                        disabled: !!remBusy,
                        onclick: () => remDo('decide', () => runner.linkDecide(w.fp, true)),
                      },
                      'Allow',
                    ),
                    h(
                      'button',
                      {
                        class: 'btn small',
                        type: 'button',
                        disabled: !!remBusy,
                        onclick: () => remDo('decide', () => runner.linkDecide(w.fp, false)),
                      },
                      'Refuse',
                    ),
                  ),
                ),
              )
            : null,
        );
    const phonesCard = card(
      '',
      h('h2', null, 'Paired phones'),
      rem.devices.length
        ? h(
            'ul',
            { class: 'rows wrap-text', id: 'remote-phones' },
            rem.devices.map((d) =>
              h(
                'li',
                null,
                h('span', { class: 'tag ' + (d.needs ? 'warn' : 'ok') }, d.name),
                h(
                  'span',
                  { class: 't' },
                  h('strong', null, d.seen ? 'Last here ' + ago(d.seen) : 'Has not connected yet'),
                  h('span', null, 'Paired ' + ago(d.at) + (d.needs ? '. ' + NEEDS[d.needs] : '')),
                ),
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    disabled: !!remBusy,
                    onclick: () => remDo('revoke', () => runner.linkRevoke(d.id)),
                  },
                  'Remove',
                ),
              ),
            ),
          )
        : h('p', { class: 'empty' }, 'No phone is paired.'),
    );
    const usbCard = card(
      '',
      h('h2', null, 'Put the app on a phone'),
      h(
        'p',
        { class: 'muted' },
        "Until the app is in the Play Store it goes onto an Android phone over a USB cable. On the phone: Settings, About phone, tap Build number seven times; then Developer options, and switch USB debugging on. Plug the phone in and accept this computer on the phone's screen.",
      ),
      !rem.app.built
        ? h('p', { class: 'note' }, 'This copy of Family Office does not carry the Android app yet.')
        : !usb.adb
          ? h(
              'p',
              { class: 'note' },
              'Android\'s own tool for this (adb) was not found on this computer. It comes with Android Studio, or with Google\'s "platform tools" download.',
            )
          : !usb.list.length
            ? h(
                'p',
                { class: 'empty', id: 'remote-usb-none' },
                'No phone is plugged in with USB debugging on. It appears here by itself when one is.',
              )
            : h(
                'ul',
                { class: 'rows wrap-text', id: 'remote-usb' },
                usb.list.map((phone) =>
                  h(
                    'li',
                    null,
                    h(
                      'span',
                      { class: 'tag ' + (phone.state === 'ready' ? 'ok' : 'warn') },
                      phone.state === 'ready' ? 'Ready' : 'Waiting',
                    ),
                    h(
                      'span',
                      { class: 't' },
                      h('strong', null, phone.name),
                      h(
                        'span',
                        null,
                        phone.state === 'ready'
                          ? linkOn
                            ? 'Installs the app and asks to pair, with no camera needed.'
                            : 'Switch Remote on first, so the app has something to pair with.'
                          : phone.says + '.',
                      ),
                    ),
                    h(
                      'button',
                      {
                        class: 'btn small ' + (phone.state === 'ready' && linkOn ? 'primary' : ''),
                        type: 'button',
                        disabled: !!remBusy || phone.state !== 'ready' || !linkOn,
                        onclick: () => remDo('side:' + phone.serial, () => runner.linkSideload(phone.serial)),
                      },
                      remBusy === 'side:' + phone.serial ? 'Installing…' : 'Install and pair',
                    ),
                  ),
                ),
              ),
    );
    view.append(h('div', { class: 'grid' }, head, said, moved, pairCard, phonesCard, usbCard));
  },
  // THE PLAN: the same panel as the Plan step of Start your team (js/plan-panel.js). It is reached from the navigation or from a page
  // that names it (the Soul's allowance), so it offers the way back to where the customer was.
  plan() {
    const from = cameFrom && cameFrom !== 'plan' && META[cameFrom] ? cameFrom : 'chat';
    view.append(
      h(
        'div',
        { class: 'grid' },
        h(
          'p',
          { class: 'plan-back' },
          h('a', { class: 'btn small', id: 'plan-back', href: '#' + from }, '← Back to ' + META[from][1]),
        ),
        planPanel({
          lic,
          said: planSaid,
          runner,
          back: location.origin + location.pathname + '#plan',
          say: (t) => {
            planSaid = t;
            paint(true);
          },
          changed: (t) => {
            planSaid = t;
            readPlan();
          },
        }),
      ),
    );
  },
};

const META = {
  overview: ['Your team', 'Overview'],
  chat: ['One room, five seats', 'Team chat'],
  workspace: ['Where the team works', 'Workspace'],
  learning: ['Rulings, Vision and Hindsight', 'Soul'],
  plan: ['Free until it reaches further', 'Plan'],
  jira: ['Your tickets', 'Jira'],
  remote: ['Your team, on your phone', 'Remote'],
};

// WHO IS HERE, IN DEVELOPER ON CLAUDE CODE: each seat has a model and an effort, as two small lists under its name, and one pair above
// them sets all five at once. The lists are what the runner read from this machine's Claude Code. A seat left on "Default" runs as
// Claude Code would by itself. On a local model there is one model for the whole team, so nothing is offered.
let minds = null;
let mindSaid = '';
async function readMinds() {
  try {
    minds = runner.live && runner.minds ? await runner.minds() : null;
  } catch {
    minds = null;
  }
  if (cur === 'chat') chatSide(core.snapshot());
}
function mindPick(seat, key, list, value, label) {
  const mixed = value === null;
  const sel = h(
    'select',
    {
      class: 'mind' + (value ? ' set' : ''),
      id: 'mind-' + seat + '-' + key,
      'aria-label': label,
      onchange: async (e) => {
        const to = e.target.value;
        e.target.blur();
        mindSaid = '';
        try {
          minds = await runner.setMind({ seat, [key]: to });
        } catch (err) {
          mindSaid = String((err && err.message) || err);
        }
        chatSide(core.snapshot());
      },
    },
    [
      mixed ? h('option', { value: '~', disabled: '' }, key === 'model' ? 'Mixed models' : 'Mixed efforts') : null,
      ...list.map((o) => h('option', { value: o.id }, o.name)),
    ].filter(Boolean),
  );
  sel.value = mixed ? '~' : value;
  return sel;
}
function mindRow(seat, title) {
  const all = seat === 'all';
  const mine = (key) => {
    if (!all) return minds.seats[seat] ? minds.seats[seat][key] : '';
    const vs = Object.values(minds.seats).map((x) => x[key]);
    return vs.every((v) => v === vs[0]) ? vs[0] : null;
  };
  return h(
    'span',
    { class: 'minds' },
    [
      minds.models.length
        ? mindPick(seat, 'model', minds.models, mine('model'), 'The model ' + title + ' thinks with')
        : null,
      minds.efforts.length
        ? mindPick(seat, 'effort', minds.efforts, mine('effort'), 'How hard ' + title + ' thinks')
        : null,
    ].filter(Boolean),
  );
}
function chatSide(s) {
  const side = $('#chat-side');
  if (!side) return;
  const at = document.activeElement;
  if (at && at.tagName === 'SELECT' && side.contains(at)) return; // a list is open under the pointer: it is not redrawn away
  const pick = !isSimple() && !!minds && minds.on && (minds.models.length > 0 || minds.efforts.length > 0);
  side.replaceChildren(
    card('', h('h2', null, 'Waiting on you'), offers(s.proposals.filter((p) => p.state === 'open'))),
    card(
      '',
      [
        h('h2', null, 'Who is here'),
        pick
          ? h(
              'div',
              { class: 'minds-all', id: 'minds-all' },
              h('span', null, 'All seats'),
              mindRow('all', 'every seat'),
            )
          : null,
        pick && mindSaid ? h('p', { class: 'muted', id: 'minds-said' }, mindSaid) : null,
        h(
          'ul',
          { class: 'rows' },
          s.team.seats.map((x) => seatRow(x, pick ? mindRow(x.id, seatAs(x).title) : null)),
        ),
      ].filter(Boolean),
    ),
  );
}
// THE OVERVIEW is a button on the team chat: how far the set-up is (one pip a step), what comes next, and whether anything waits on the
// customer or is being worked on. Pressing it opens the Overview page.
function chatTop(s) {
  const top = $('#chat-top');
  if (!top) return;
  const total = SETUP.length + 1;
  const done = SETUP.filter((x) => x.done(s)).length + (s.session ? 1 : 0);
  const next = SETUP.find((x) => !x.done(s));
  const open = s.proposals.filter((p) => p.state === 'open').length;
  const working = s.team.seats.filter((x) => x.status === 'working').length;
  const state = open
    ? ['warn', open + ' waiting on you']
    : working
      ? ['run', working + (working === 1 ? ' seat working' : ' seats working')]
      : ['', 'Team idle'];
  const sig = [done, total, next ? next.id : '', state[1]].join('|');
  if (top.dataset.sig === sig) return;
  top.dataset.sig = sig; // redrawn only when what it says has changed
  top.replaceChildren(
    h(
      'a',
      {
        class: 'ov-btn' + (done < total ? ' todo' : ''),
        id: 'overview-open',
        href: '#overview',
        'aria-label': 'Overview: ' + done + ' of ' + total + ' set up. ' + state[1],
      },
      h('strong', null, 'Overview'),
      h(
        'span',
        { class: 'ov-meter', 'aria-hidden': 'true' },
        Array.from({ length: total }, (_, i) => h('i', { class: i < done ? 'on' : '' })),
      ),
      h(
        'span',
        { class: 'ov-say' },
        done === total
          ? 'Everything is set up'
          : done +
              ' of ' +
              total +
              ' set up' +
              (next ? '. Next: ' + next.next.charAt(0).toLowerCase() + next.next.slice(1) : ''),
      ),
      h('span', { class: 'ov-state ' + state[0] }, h('i', { 'aria-hidden': 'true' }), state[1]),
      h('span', { class: 'ov-go', 'aria-hidden': 'true' }, '→'),
    ),
  );
}
// THE TICKET THE CUSTOMER IS TALKING ABOUT (chosen on the Jira tab): shown above the composer, and given to every seat that answers
// until it is cleared
function chatTicket(s) {
  const el = $('#chat-ticket');
  if (!el) return;
  const f = s.focus;
  const sig = f ? f.key + '|' + f.status + '|' + f.summary : '';
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.replaceChildren(
    ...(f
      ? [
          h(
            'span',
            { class: 'att chat-ticket', title: f.summary },
            h('span', { class: 'att-ic', 'aria-hidden': 'true' }, glyph('ticket')),
            f.url
              ? h('a', { class: 'jkey', href: f.url, target: '_blank', rel: 'noopener' }, f.key)
              : h('strong', { class: 'jkey' }, f.key),
            h('span', { class: 't' }, f.summary),
            h('span', { class: 'tag' }, f.status),
            h('a', { class: 'att-go', href: '#jira', title: 'Back to the board' }, 'Board'),
            h(
              'button',
              {
                class: 'att-x',
                type: 'button',
                id: 'ticket-clear',
                'aria-label': 'Remove ' + f.key + ' from the chat',
                title: 'Remove from the chat',
                onclick: () => core.focusTicket(null),
              },
              '\u00d7',
            ),
          ),
        ]
      : []),
  );
}
const shortModel = (m) => {
  const n = String(m || '')
    .split('/')
    .pop()
    .replace(/\.(gguf|safetensors|bin)$/i, '');
  return n.length > 34 ? n.slice(0, 32) + '…' : n;
};
// THE PILLS, ONE SHAPE: what it is, then how it stands, in plain words. A dot says in place (green) or still to do (amber). Workspace
// and Model lead to where they are set. There is no autonomy pill: how much the team asks, and where a change goes, is its own judgement.
// The pills are redrawn only when what they say has changed, so an open menu is not closed by an unrelated repaint.
function chips(s) {
  const ws = s.workspace;
  const ses = s.session || {};
  const box = $('#chips');
  const sig = JSON.stringify([ws.kind, ws.name, ses.model, ses.live, ses.tokPerSec, ses.kind, getMode()]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const simple = isSimple(); // Simple shows where the team thinks and the mode; Developer shows the workspace too
  const inner = (what, value) => [h('i', { 'aria-hidden': 'true' }), h('b', null, what), h('span', null, value)];
  const pill = (ok, view, href, what, value, title) =>
    h(
      'a',
      { class: 'pill' + (ok ? '' : ' warn'), 'data-view': view, href, title: title || what + ': ' + value },
      inner(what, value),
    );
  box.replaceChildren(
    ...[
      simple ? null : pill(!!ws.kind, 'workspace', '#workspace', 'Workspace', ws.kind ? ws.name : 'Not connected'),

      simple
        ? pill(
            !!(ses.model && ses.live),
            '',
            'start.html',
            'Thinking',
            ses.model ? (ses.kind === 'claude' ? 'With Claude' : 'On this computer') : 'Not started',
            ses.model ? ses.model + (ses.engine ? ', on ' + ses.engine : '') : '',
          )
        : pill(
            !!(ses.model && ses.live),
            '',
            'start.html',
            'Model',
            ses.model
              ? shortModel(ses.model) +
                  (ses.tokPerSec && ses.kind !== 'claude' ? ' · ' + Math.round(ses.tokPerSec) + ' tokens a second' : '')
              : 'None',
            ses.model ? ses.model + (ses.engine ? ', on ' + ses.engine : '') : '',
          ),
      h(
        'button',
        {
          class: 'pill mode-pill',
          type: 'button',
          id: 'mode-pill',
          title: simple
            ? 'Simple mode. Press for Developer: code, Jira, proofs and settings.'
            : 'Developer mode. Press for Simple: just the conversation.',
          onclick: () => setMode(simple ? 'developer' : 'simple'),
        },
        inner(
          'Mode',
          simple
            ? 'Simple'
            : 'Developer' +
                (() => {
                  try {
                    const ss = runner.live && (runner.state() || {}).session;
                    return ss && ss.kind !== 'claude' ? ' \u00B7 experimental' : '';
                  } catch {
                    return '';
                  }
                })(),
        ),
      ),
    ].filter(Boolean),
  );
}
const baseOpen = new Set(); // which subjects of "What your team started with" are open, kept across repaints
let cameFrom = ''; // the view the customer was on before this one: the Plan page offers the way back to it
// THE NAVIGATION SAYS HOW EACH PART STANDS: a small chip beside each page's name. This is the overview of the system; the Overview
// page itself is only the set-up. A chip in amber is something that waits on the customer.
function navChips(s) {
  const open = s.proposals.filter((p) => p.state === 'open').length;
  const working = s.team.seats.filter((x) => x.status === 'working').length;
  const landed = s.proofs.filter((p) => p.landed).length;
  const live = s.work.filter((w) => !w.talk && w.stage !== 'landed').length;
  const total = SETUP.length + 1;
  const done = SETUP.filter((x) => x.done(s)).length + (s.session ? 1 : 0);
  const built = s.work.filter((w) => !w.talk).length;
  const lessons = ((s.learning && s.learning.ledger) || []).length;
  const chips = {
    overview: done === total ? ['Set up', 'ok'] : [done + ' of ' + total, 'warn'],
    chat: open
      ? [open + ' waiting', 'warn']
      : working
        ? [working + ' working', 'run']
        : s.chat.length
          ? [String(s.chat.length), '']
          : null,
    proofs: s.proofs.length ? [landed + ' of ' + s.proofs.length, landed ? 'ok' : ''] : null,
    workspace: !s.workspace.kind
      ? ['Not set', 'warn']
      : workspace && workspace.pending
        ? ['Change waiting', 'warn']
        : [s.workspace.kind === 'github' ? 'GitHub' : 'Folder', 'ok'],
    jira: !jira
      ? null
      : jira.state === 'connected'
        ? [jira.last ? String(jira.last.issues.length) : 'On', 'ok']
        : ['Off', ''],
    remote:
      !rem || rem.failed
        ? null
        : !rem.on
          ? ['Off', '']
          : rem.pairing && rem.pairing.wants.length
            ? [rem.pairing.wants.length + ' asking', 'warn']
            : rem.changed && rem.devices.some((d) => d.needs)
              ? ['Address changed', 'warn']
              : [
                  rem.devices.length + (rem.devices.length === 1 ? ' phone' : ' phones'),
                  rem.devices.length ? 'ok' : '',
                ],
    learning: lessons ? [String(lessons), ''] : null,
    plan: !lic ? null : !lic.enforce ? ['Open', ''] : [lic.name, lic.tier !== 'free' ? 'ok' : ''],
  };
  $$('#nav a').forEach((a) => {
    const c = chips[a.getAttribute('href').slice(1)];
    let el = a.querySelector('.nc');
    if (!c) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = h('span', { class: 'nc' });
      a.append(el);
    }
    el.textContent = c[0];
    el.className = 'nc ' + c[1];
  });
}
let arrive = false; // true only for the paint that follows a navigation: entrance motion plays once, not on every repaint
// THE NEXT STEP. Three things set a team up, in this order. When one is finished on its own page, the page CONFIRMS it in a dialog and
// names the next one, with a button to go there. Nothing navigates by itself: "Stay here" is always offered. Until every step is done,
// the next one is also marked where the eye already goes: its entry in the navigation, its chip in the header, and a strip at the top
// of a finished step's page.
const SETUP = [
  {
    id: 'workspace',
    view: 'workspace',
    done: (s) => !!s.workspace.kind,
    title: 'Workspace connected',
    did: (s) =>
      'Your team works in ' +
      s.workspace.name +
      (s.workspace.kind === 'github' ? ', on GitHub' : ', a folder on this computer'),
    next: 'Connect a workspace',
    why: 'Where your team reads and writes.',
    go: 'Go to Workspace',
  },
  {
    id: 'chat',
    view: 'chat',
    done: (s) => s.chat.some((m) => m.by === 'you'),
    title: 'You have met your team',
    did: () => 'You have said hello',
    next: 'Say hello to your team',
    why: 'One room, five seats. Ask for something.',
    go: 'Open the team chat',
  },
];
let setupWas = null;
function confirmStep(step, s, next) {
  const old = $('dialog.step-done');
  if (old) old.remove();
  const dialog = h('dialog', { class: 'step-done', 'aria-labelledby': 'sd-h' });
  const shut = () => {
    if (dialog.open) dialog.close();
  };
  dialog.append(
    h('span', { class: 'sd-mark', 'aria-hidden': 'true' }, '✓'),
    h('h2', { id: 'sd-h' }, step.title),
    h('p', { class: 'sd-did' }, step.did(s) + '.'),
    next
      ? h(
          'div',
          { class: 'sd-next' },
          h('span', { class: 'k' }, 'Next'),
          h('strong', null, next.next),
          h('span', { class: 'muted' }, next.why),
        )
      : h(
          'div',
          { class: 'sd-next' },
          h('span', { class: 'k' }, 'Done'),
          h('strong', null, 'That is everything. Your team is set up.'),
        ),
    h(
      'div',
      { class: 'row' },
      h(
        'a',
        { class: 'btn primary', href: '#' + (next ? next.view : 'chat'), onclick: shut },
        next ? next.go : 'Back to the team chat',
      ),
      h('button', { class: 'btn', type: 'button', onclick: shut }, 'Stay here'),
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) shut();
  }); // a click on the backdrop closes it
  document.body.append(dialog);
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
}
function journey(s) {
  const now = Object.fromEntries(SETUP.map((x) => [x.id, x.done(s)]));
  const next = SETUP.find((x) => !now[x.id]) || null;
  $$('#nav a').forEach((a) => {
    const on = !!next && a.getAttribute('href') === '#' + next.view && cur !== next.view;
    a.classList.toggle('next', on);
    if (on) a.setAttribute('data-next', 'Next');
    else a.removeAttribute('data-next');
  });
  $$('#chips [data-view]').forEach((a) =>
    a.classList.toggle('pulse', !!next && a.dataset.view === next.view && cur !== next.view),
  );
  if (setupWas)
    for (const x of SETUP)
      if (!setupWas[x.id] && now[x.id] && cur === x.view && x.id !== 'chat') confirmStep(x, s, next); // autonomy is chosen from its pill, on whatever page that is   // finished just now, on its own page
  setupWas = now;
  return next;
}
const nextStrip = (next) =>
  h(
    'p',
    { class: 'next-strip' },
    h('span', { class: 'sd-mark small', 'aria-hidden': 'true' }, '✓'),
    h(
      'span',
      { class: 't' },
      h('strong', null, 'This step is done. '),
      'Next: ' + next.next.charAt(0).toLowerCase() + next.next.slice(1) + '.',
    ),
    h('a', { class: 'btn primary small', href: '#' + next.view }, next.go),
  );
// paint the current view; force = even while the person is typing in it
function paint(force) {
  if (!engineOn) {
    // no team is running here: nothing on this page would be true, so it says so and offers the way to start one
    if (!$('#not-running'))
      view.replaceChildren(
        h(
          'div',
          { class: 'grid' },
          card(
            '',
            h('h2', { id: 'not-running' }, 'Your team is not running'),
            h(
              'p',
              { class: 'muted' },
              runner.live
                ? 'The app is up on this machine, but no team has been started on it yet.'
                : 'Nothing is running on this machine. Start your team and this page is here when it is up.',
            ),
            h('div', { class: 'row' }, h('a', { class: 'btn primary', href: 'start.html' }, 'Start your team')),
          ),
        ),
      );
    chat = null;
    return;
  }
  const s = core.snapshot();
  chips(s);
  navChips(s);
  const next = journey(s);
  if (cur === 'chat' && chat) {
    chat.update();
    chatSide(s);
    chatTop(s);
    chatTicket(s);
    return;
  }
  const a = document.activeElement;
  if (!force && a && view.contains(a) && a.tagName === 'INPUT' && a.type === 'text' && a.value) return;
  chat = null;
  view.replaceChildren();
  VIEWS[cur](s);
  const here = SETUP.find((x) => x.view === cur);
  if (here && here.id !== 'chat' && here.done(s) && next) view.prepend(nextStrip(next)); // a finished step's page keeps pointing on
}
function goTo() {
  const id = location.hash.slice(1);
  const was = cur;
  cur = VIEWS[id] ? id : id === 'proofs' ? 'learning' : 'chat';
  if (was !== cur) cameFrom = was; // Proofs live on the Soul page now, and there is no Autonomy page: their old addresses still lead there
  if (isSimple() && !SIMPLE_VIEWS.includes(cur)) cur = 'chat'; // a page that Simple does not show is still there in Developer, as it was left
  if (cur === 'remote' && remoteOff()) cur = 'chat'; // Remote is switched off for this version: its address leads to the chat
  if (cur === 'workspace' && was !== 'workspace' && ghAsked) readWs();
  if (cur === 'chat') readMinds(); // what each seat thinks with, when the team runs on Claude Code   // read afresh each time the tab is opened: the chat may have built, landed or thrown away a change since
  $$('#nav a').forEach((a) => {
    if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#title').textContent = META[cur][1];
  chat = null;
  arrive = true;
  paint(true);
  arrive = false;
  window.scrollTo(0, 0);
  if (id === 'proofs') {
    const el = $('#soul-proofs');
    if (el) el.scrollIntoView({ block: 'start' });
  }
}
// CLEAR ALL, beside Stop team. It asks first, in a dialog that says exactly what goes and what stays; nothing happens on one press.
// Then the runner puts the machine's side back (its own route says what that is), this browser forgets what it kept, and the page
// goes to Start, which asks Simple or Developer again as it did the first time.
{
  const btn = $('#clear-all');
  if (btn && APP) btn.remove(); // on a phone there is nothing of the computer's to clear from here
  if (btn && !APP)
    btn.addEventListener('click', () => {
      const old = $('#clear-dialog');
      if (old) old.remove();
      const item = (t, id) => h('li', id ? { id } : null, t);
      const said = h('p', { class: 'muted small', role: 'status' });
      const tick = h('input', { type: 'checkbox', id: 'clear-models' });
      const tickNote = h(
        'span',
        { class: 'muted small', id: 'clear-models-note' },
        'They would have to be downloaded again.',
      );
      const keptModels = item('The models and helpers already downloaded', 'clear-kept-models');
      const phones = item('Every paired phone: each would have to be paired again', 'clear-phones');
      const confirmBtn = h('button', { class: 'btn red solid', type: 'button', id: 'clear-go' }, 'Delete everything');
      const cancelBtn = h(
        'button',
        { class: 'btn', type: 'button', id: 'clear-no', onclick: () => dlg.close() },
        'Cancel',
      );
      const dlg = h(
        'dialog',
        { class: 'confirm', id: 'clear-dialog', 'aria-labelledby': 'clear-h' },
        h('h2', { id: 'clear-h' }, 'Delete everything and start again?'),
        h('p', null, 'This puts the app back as it was when you first started it. It cannot be undone.'),
        h('h3', null, 'Deleted'),
        h(
          'ul',
          null,
          item('The whole chat, the work and the proofs'),
          item('Everything your team has learned, beyond what every team starts with'),
          item("The workspace connection, and the team's own copies of your code"),
          item('The Jira and GitHub sign-ins on this machine'),
          item('Your choice of Simple or Developer, and what the team learned of how you work'),
          item('How each model was measured and tuned here, and what it was taught'),
          phones,
        ),
        h('h3', null, 'Kept'),
        h(
          'ul',
          null,
          keptModels,
          item('Your plan, and any code in use'),
          item('Your own folders, and everything on GitHub and Jira'),
        ),
        h(
          'label',
          { class: 'also' },
          tick,
          h('span', null, h('strong', null, 'Also delete the downloaded models'), ' ', tickNote),
        ),
        said,
        h('div', { class: 'row' }, cancelBtn, confirmBtn),
      );
      const goSays = () => (tick.checked ? 'Delete everything and the models' : 'Delete everything');
      tick.onchange = () => {
        keptModels.hidden = tick.checked;
        confirmBtn.textContent = goSays();
      };
      // what is there to delete, counted now by the runner: how many phones, and how much the models weigh
      connectRunner()
        .then((r) => (r.live && r.resetWould ? r.resetWould() : null))
        .then((w) => {
          if (!w || !dlg.isConnected) return;
          phones.textContent = w.phones
            ? (w.phones === 1 ? 'Your paired phone: it' : 'Your ' + w.phones + ' paired phones: each') +
              ' would have to be paired again'
            : 'Paired phones (none are paired now)';
          tickNote.textContent =
            (w.gb
              ? w.gb + ' GB on this machine. '
              : w.bytes
                ? 'Under 0.1 GB on this machine. '
                : 'None are on this machine now. ') +
            'They would have to be downloaded again.' +
            (w.strata ? ' Models that Strata downloaded stay with Strata.' : '');
        })
        .catch(() => {
          /* an older runner: the dialog says it in words */
        });
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        tick.disabled = true;
        confirmBtn.textContent = 'Deleting…';
        try {
          const r = await connectRunner();
          if (r.live && r.reset) await r.reset(tick.checked);
        } catch (e) {
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          tick.disabled = false;
          confirmBtn.textContent = goSays();
          said.textContent = 'It could not be cleared: ' + String((e && e.message) || e).slice(0, 160);
          return;
        }
        core.reset();
        core.stop();
        try {
          for (const k of Object.keys(localStorage))
            if (
              k.startsWith('familyoffice.') &&
              !['familyoffice.ran', 'familyoffice.port', 'familyoffice.ref'].includes(k)
            )
              localStorage.removeItem(k);
        } catch {
          /* no storage */
        }
        location.href = 'start.html';
      };
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
      cancelBtn.focus();
    });
}
$('#out').addEventListener('click', async () => {
  const r = await connectRunner();
  await r.stop().catch(() => {});
  core.stop();
  location.href = 'start.html';
}); // back to Start your team, where another way can be chosen or the runner shut down
window.addEventListener('hashchange', goTo);
// A PRESS OUTSIDE THE OPEN TICKET CLOSES IT. A press on another card opens that one instead; a drag is not a press; a press inside a
// picture being looked at belongs to the picture; and something that was just redrawn by its own press is not "outside".
document.addEventListener('click', (e) => {
  if (!jopen || cur !== 'jira') return;
  const el = e.target;
  if (!(el instanceof Element) || !el.isConnected || el.closest('#jira-ticket, .jcard, .mde-light')) return;
  jopen = null;
  jsel = '';
  paint(true);
});
window.addEventListener('fo:mode', () => {
  $('#chips').dataset.sig = '';
  goTo();
}); // the mode changed: the page is drawn again where it stands, nothing is reloaded
core.on(() => paint(false));
goTo();

// THE PHONE'S TOOLBAR (css/app.css, at 720px and under). On a phone the top of the app is one bar, as an Android app has: the mark
// and the name, and the switch between Simple and Developer. Nothing else. Pressing the mark and name opens the pages of the app
// as a drawer from the left (the same list the side rail is on a computer, Team chat first); a page, the dark behind it, or Escape
// closes it. In the chat the name is the product's; on any other page it is that page's.
{
  const bar = $('#tbar');
  const home = $('#tbar-home');
  const name = $('#tbar-name');
  const scrim = $('#scrim');
  const side = $('#side');
  const title = $('#title');
  const nav = $('#nav');
  if (bar && home && side && scrim) {
    const open = () => document.body.classList.contains('drawer-open');
    const set = (on) => {
      document.body.classList.toggle('drawer-open', on);
      home.setAttribute('aria-expanded', String(on));
      scrim.hidden = !on;
      if (on) {
        const first = [...side.querySelectorAll('nav a')].find((a) => a.offsetParent !== null);
        if (first) first.focus({ preventScroll: true });
      } else if (side.contains(document.activeElement)) home.focus({ preventScroll: true });
    };
    home.addEventListener('click', () => set(!open()));
    scrim.addEventListener('click', () => set(false));
    side.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open()) set(false);
    });
    const say = () => {
      const here = nav && nav.querySelector('a[aria-current="page"]');
      const chat = !here || here.getAttribute('href') === '#chat';
      name.textContent = chat ? 'Family Office' : (title && title.textContent) || 'Family Office';
    };
    if (title) new MutationObserver(say).observe(title, { childList: true, characterData: true, subtree: true });
    if (nav)
      new MutationObserver(say).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
    say();
    const modes = $$('#tbar-mode button');
    const mark = () => modes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === getMode())));
    modes.forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.set !== getMode()) setMode(b.dataset.set);
      }),
    );
    window.addEventListener('fo:mode', mark);
    mark();
  }
}
