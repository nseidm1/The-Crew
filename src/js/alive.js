// alive.js - ties the runner on this machine to the life of the app. Every page loads this. While the app is open it holds one
// connection to the runner, shared by all the tabs of the browser (stream.js); when the last one has been gone for a short while the
// runner stops what it started and exits. So closing the app is what stops the server: nothing is left running behind a closed tab.
// The other direction too: if the runner stops while a page is open, or comes back, the page is TOLD (two events on window), so it
// can change what it shows without a reload:
//   fo:runner-gone   the runner stopped. A page that handles it (preventDefault) shows that itself; otherwise a bar says so here.
//   fo:runner-back   it is up again. A page that handles it carries on; otherwise the page reloads.
// It works the same whether the runner serves this page or this page is the site the runner was fetched from (where.js).
import { runnerBase } from './where.js';
import { stream } from './stream.js';
let events = null;
let timer = 0;
let bar = null;
let gen = 0;
const stop = () => {
  if (events) {
    events.close();
    events = null;
  }
  clearInterval(timer);
  timer = 0;
};
const tell = (name) => window.dispatchEvent(new CustomEvent(name, { cancelable: true })); // false when a page took it

function showBar(start) {
  if (bar) return;
  let shut = false;
  try {
    shut = sessionStorage.getItem('familyoffice.shut') === '1';
  } catch {
    /* no storage */
  }
  const code = document.createElement('code');
  code.textContent = start || 'node server.mjs';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn small';
  copy.textContent = 'Copy';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select it and copy';
    }
  };
  const text = document.createElement('p');
  text.append(
    shut
      ? 'Shut down. Nothing is running on this machine. To start your team again, run this in Terminal and this page carries on by itself:'
      : 'The runner on this machine has stopped, so your team is not running. Start it again in Terminal, and this page carries on by itself:',
  );
  bar = document.createElement('div');
  bar.className = 'gone-bar';
  bar.setAttribute('role', 'alert');
  bar.append(text, code, copy);
  document.body.append(bar);
}

// a page that says for itself that nothing is running (Start, with its command and its state) takes the bar down: it would say it twice
export function hideBar() {
  if (bar) {
    bar.remove();
    bar = null;
  }
}

// attach to the runner this page can reach now (called on load, and again by a page whenever its runner changes)
export async function watchRunner({ fresh = false } = {}) {
  const mine = ++gen;
  stop();
  const base = await runnerBase({ fresh });
  if (base === null || mine !== gen) return;
  const hello = async () => {
    try {
      const r = await fetch(base + 'api/hello', { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  const first = await hello();
  if (!first || first.app !== 'familyoffice' || mine !== gen) return;
  if (bar) {
    bar.remove();
    bar = null;
  }
  // this page came from the site, the app on this machine came from an earlier copy of it: say so, with the one command that updates it
  // (not on the landing page: that page is the product's front door, read by people who may have no team at all, and a line about
  // updating belongs where the team is started and used)
  if (base !== '' && first.version && first.version !== 'dev' && !document.body.classList.contains('land'))
    site().then((v) => {
      if (mine !== gen) return;
      if (v && v !== first.version)
        note(
          'The app on this machine is an older version (' +
            first.version +
            ') than this site (' +
            v +
            '). Run this in ' +
            (/Windows/i.test(navigator.userAgent) ? 'PowerShell' : 'Terminal') +
            ': it replaces the old one, and this page carries on.',
          /Windows/i.test(navigator.userAgent)
            ? "$env:FO_SITE='" +
                new URL('.', location.href).href +
                "'; irm " +
                new URL('.', location.href).href +
                'myfamilyoffice.ps1 | iex'
            : 'curl -fsSL ' +
                new URL('.', location.href).href +
                'myfamilyoffice.sh | sh -s ' +
                new URL('.', location.href).href,
          null,
          'old-app',
        );
      else unnote('old-app');
    }); // the app that answers now is this site's own version: the note is no longer true
  else unnote('old-app');
  let misses = 0;
  let down = false;
  const check = async () => {
    if (mine !== gen) return;
    const h = await hello();
    if (mine !== gen) return;
    if (h && h.app === 'familyoffice') {
      const swapped = !!h.version && !!first.version && h.version !== first.version; // another copy answers now: the app was updated while this page stayed open
      if (!down && !swapped) {
        clearInterval(timer);
        timer = 0;
        misses = 0;
        return;
      } // a blip: the connection comes back by itself
      stop();
      try {
        sessionStorage.removeItem('familyoffice.shut');
      } catch {
        /* no storage */
      }
      if (bar) {
        bar.remove();
        bar = null;
      }
      // The app came back, and what is served now is newer than what this page was built from: an old page must not go on driving a
      // new app. This is the one moment the page reloads by itself; it comes back on the same screen.
      if (await behind()) {
        location.reload();
        return;
      }
      if (tell('fo:runner-back')) location.reload();
      else watchRunner({ fresh: true });
      return;
    }
    if (++misses === 2) {
      down = true;
      clearInterval(timer);
      timer = 0;
      if (!tell('fo:runner-gone')) {
        stop();
        return;
      } // the page shows it and watches for the return itself
      showBar(first.start);
      timer = setInterval(check, 4000); // keep looking, slowly
    }
  };
  events = stream(base).on('error', () => {
    if (!timer && !down && mine === gen) timer = setInterval(check, 1500);
  }); // the connection dropped: look, in case the runner has stopped
}

// A SMALL NOTE along the bottom, with something to copy or press. One at a time; a newer one replaces it.
let noteEl = null;
const unnote = (kind) => {
  if (noteEl && noteEl.dataset.kind === kind) {
    noteEl.remove();
    noteEl = null;
  }
}; // a note of that kind is taken down once it is no longer true
function note(text, command, action, kind = '') {
  if (noteEl) noteEl.remove();
  const p = document.createElement('p');
  p.textContent = text;
  noteEl = document.createElement('div');
  noteEl.className = 'gone-bar';
  noteEl.dataset.kind = kind;
  noteEl.setAttribute('role', 'status');
  noteEl.append(p);
  if (command) {
    const code = document.createElement('code');
    code.textContent = command;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn small';
    copy.textContent = 'Copy';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(command);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Select it and copy';
      }
    };
    noteEl.append(code, copy);
  }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small primary';
    b.textContent = action.label;
    b.onclick = action.run;
    noteEl.append(b);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'btn small';
  x.textContent = 'Not now';
  x.onclick = () => {
    noteEl.remove();
    noteEl = null;
  };
  noteEl.append(x);
  document.body.append(noteEl);
}
// the version of the site this page belongs to (the bundle's manifest); null where there is none, as when run from source
const site = async () => {
  try {
    const r = await fetch('manifest.json', { cache: 'no-store' });
    return r.ok ? (await r.json()).version || null : null;
  } catch {
    return null;
  }
};
// THE PAGE ITSELF can fall behind: the site is republished, or the app on this machine updated, while a tab stays open. It checks now
// and then, and when the tab is looked at again, and offers to reload. (When the app itself comes back updated, it reloads: above.)
const loaded = site(); // the version this page was built from
async function behind() {
  const was = await loaded;
  const now = was ? await site() : null;
  return !!(was && now && now !== was);
}
{
  let told = false;
  const look = async () => {
    if (told || !(await behind())) return;
    told = true;
    note('This page is from an older version than the one now here.', null, {
      label: 'Update this page',
      run: () => location.reload(),
    });
  };
  setInterval(look, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) look();
  });
}

// a link that says who sent the visitor (?ref=<their wallet>) is remembered here, on whichever page they land, and given to the checkout later
try {
  const r = new URLSearchParams(location.search).get('ref');
  if (/^0x[0-9a-fA-F]{40}$/.test(r || '')) localStorage.setItem('familyoffice.ref', r);
} catch {
  /* a private window */
}
let top = true;
try {
  top = window.top === window;
} catch {
  top = false;
}
if (top) watchRunner();
