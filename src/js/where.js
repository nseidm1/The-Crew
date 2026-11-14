// where.js - where the runner on this machine is, as seen from this page, and whether this page may drive it.
// Two cases. (1) The runner serves this page itself (the address is 127.0.0.1): it is right here. (2) This page is the SITE the runner
// was fetched from: the runner, once the customer has started it with the site's command, accepts that site and no other, so the page
// the command was copied from carries on as the app instead of a second page opening.
// A first visit never looks at the machine: the page only looks once the command has been copied in this browser.
const KEY = 'familyoffice.ran';
const PORT = 'familyoffice.port';
const PORTS = [5210, 5211, 5212];
export const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
// the Android app: its pages come from the runner through the phone link, so the runner is right behind them, as it is on the computer
export const APP = /FamilyOffice-Android/.test(navigator.userAgent);
export const ran = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const markRan = (port) => {
  try {
    localStorage.setItem(KEY, '1');
    if (port) localStorage.setItem(PORT, String(port));
  } catch {
    /* a private window */
  }
};
const lastPort = () => {
  try {
    return Number(localStorage.getItem(PORT)) || 0;
  } catch {
    return 0;
  }
};
const wait = (ms) =>
  typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(ms) } : {};

// one port: is our runner (or its launcher, still setting up) answering there?
export async function ask(port) {
  try {
    const j = await (
      await fetch('http://127.0.0.1:' + port + '/api/hello', { cache: 'no-store', ...wait(1200) })
    ).json();
    return j && j.app === 'familyoffice' ? { ...j, port } : null;
  } catch {
    return null;
  }
}
export async function look(only) {
  const last = lastPort();
  const tries = only ? [only] : [...new Set([last, ...PORTS].filter(Boolean))];
  return (await Promise.all(tries.map(ask))).find(Boolean) || null;
}

// The address this page reaches its runner at: '' when the runner serves this page, 'http://127.0.0.1:<port>/' when this is the site
// it came from and it lets this page drive it, null when there is none (the page then only offers the command that starts it).
let found;
export async function runnerBase({ fresh = false } = {}) {
  // fresh: look again (the runner may have come up or gone since)
  if (fresh) found = undefined;
  if (found !== undefined) return found;
  if (LOCAL || APP) {
    try {
      const r = await fetch('api/hello', { cache: 'no-store' });
      if (r.ok && (await r.json()).app === 'familyoffice') return (found = '');
    } catch {
      /* served by something else */
    }
  }
  if (!ran()) return (found = null);
  const h = await look();
  if (h && h.state === 'active' && h.drive) {
    markRan(h.port);
    return (found = 'http://127.0.0.1:' + h.port + '/');
  }
  return (found = null);
}
