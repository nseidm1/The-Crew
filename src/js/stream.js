// stream.js - ONE held connection to the runner for every tab of this browser, not one or two for each.
// A browser allows six connections at a time to one host. Each tab used to hold two (the runner's state, and "this page is open"), so a
// third or fourth tab used them all up: every other request to the runner then waited behind them, the page took that for the runner
// being gone, and it redrew itself over and over. Now:
//   - one connection carries both. The runner's state arrives on it, and holding it is what says "the app is open" (the runner stops
//     itself a short while after the last one closes).
//   - the tabs of one browser SHARE it. One tab holds it (whichever holds the lock) and passes what arrives to the others; when that
//     tab closes, another takes over within a moment, well inside the runner's grace period.
// Where the browser has no way to share (no Web Locks, no BroadcastChannel), each tab holds its own single connection, as before.
const open = new Map(); // the runner's address -> the one stream this tab has to it

// stream(base).on('message', (data) => …)   the runner's state, as text, each time it changes
// stream(base).on('error', () => …)         the connection dropped (the browser retries by itself; the page may want to look)
// .close()                                  this user is done; the connection is let go when the last user in this tab is
export function stream(base) {
  let conn = open.get(base);
  if (!conn) {
    conn = {
      users: 0,
      es: null,
      release: null,
      chan: null,
      stop: null,
      subs: { message: new Set(), error: new Set() },
    };
    const name = 'familyoffice.stream:' + base;
    const emit = (type, data) =>
      conn.subs[type] &&
      conn.subs[type].forEach((fn) => {
        try {
          fn(data);
        } catch {
          /* one listener's trouble is not the others' */
        }
      });
    const pass = (type, data) => {
      emit(type, data);
      if (conn.chan) {
        try {
          conn.chan.postMessage({ type, data });
        } catch {
          /* the channel is closed */
        }
      }
    };
    // hold the connection for as long as this tab is the one that has it
    const hold = () =>
      new Promise((release) => {
        if (!open.has(base)) return release(); // closed while it waited its turn
        conn.release = release;
        conn.es = new EventSource(base + 'api/events');
        conn.es.onmessage = (e) => pass('message', e.data);
        conn.es.onerror = () => pass('error');
      });
    const can =
      typeof navigator !== 'undefined' &&
      navigator.locks &&
      typeof BroadcastChannel !== 'undefined' &&
      typeof AbortController !== 'undefined';
    open.set(base, conn);
    if (can) {
      conn.chan = new BroadcastChannel(name);
      conn.chan.onmessage = (e) => {
        if (!conn.es && e.data && e.data.type) emit(e.data.type, e.data.data);
      }; // what the tab that holds it passes on
      const ctl = new AbortController();
      conn.stop = () => ctl.abort();
      navigator.locks.request(name, { signal: ctl.signal }, hold).catch(() => {
        /* let go before its turn came */
      });
    } else hold();
  }
  conn.users++;
  let done = false;
  const mine = [];
  return {
    on(type, fn) {
      if (conn.subs[type]) {
        conn.subs[type].add(fn);
        mine.push([type, fn]);
      }
      return this;
    },
    close() {
      if (done) return;
      done = true;
      for (const [type, fn] of mine) conn.subs[type].delete(fn);
      if (--conn.users > 0) return;
      open.delete(base);
      if (conn.es) {
        conn.es.close();
        conn.es = null;
      }
      if (conn.release) conn.release();
      if (conn.stop) conn.stop();
      if (conn.chan) conn.chan.close();
    },
  };
}
