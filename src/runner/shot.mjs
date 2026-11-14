// shot.mjs - a picture of a page, or of an application's window, for the team to look at and for the customer to see in the chat.
// Nothing is installed for it: a page is drawn by a browser the machine already has (Chrome, Edge, Brave or Chromium, run without a
// window), and a window is captured by macOS's own screencapture. Pictures are kept in the state folder and shown in the chat.
//   shotPage({ url, file })   -> { ok, file, why }      1366 x 900, as a visitor's browser would draw it
//   shotApp({ app, file })    -> { ok, file, whole }    the front window of that application; whole: the main screen instead, when
//                                                       its window could not be singled out
// macOS asks the customer, the first time, to let this app record the screen or talk to that application; until they allow it the
// picture is refused or shows only the desktop, and the seat says so. A picture is only ever taken because the customer asked.
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import { sh, which } from './host.mjs';

const exists = (f) =>
  access(f).then(
    () => true,
    () => false,
  );
export async function findBrowser() {
  if (process.env.FO_BIN_BROWSER !== undefined)
    return (await exists(process.env.FO_BIN_BROWSER)) ? process.env.FO_BIN_BROWSER : null;
  const apps = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium', 'Google Chrome Canary'].flatMap((n) => [
    path.join('/Applications', n + '.app/Contents/MacOS', n),
    path.join(os.homedir(), 'Applications', n + '.app/Contents/MacOS', n),
  ]);
  for (const f of apps) if (await exists(f)) return f;
  for (const n of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
    const f = await which(n);
    if (f) return f;
  }
  return null;
}
const sized = async (file) => {
  const s = await stat(file).catch(() => null);
  return s && s.size > 200 ? s.size : 0;
};
// a retina screen makes a very large picture: brought down to 1600 across with the system's own tool, where there is one
const shrink = async (file) => {
  if (process.platform === 'darwin') await sh('sips', ['-Z', '1600', file], { timeout: 20000 });
};

export async function shotPage({ url, file, profile }) {
  const browser = await findBrowser();
  if (!browser)
    return { ok: false, why: 'No Chrome, Edge, Brave or Chromium was found on this machine to draw the page with.' };
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(profile, { recursive: true });
  const r = await sh(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--user-data-dir=' + profile,
      '--window-size=1366,900',
      '--virtual-time-budget=5000',
      '--screenshot=' + file,
      url,
    ],
    { timeout: 45000 },
  );
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  if (!(await sized(file)))
    return {
      ok: false,
      why:
        'The browser did not draw the page' +
        (r.err ? ': ' + r.err.split('\n').filter(Boolean).pop().slice(0, 160) : '.'),
    };
  await shrink(file);
  return { ok: true, file, by: path.basename(browser) };
}
export async function shotApp({ app, file }) {
  if (process.platform !== 'darwin' && process.env.FO_BIN_SCREENCAPTURE === undefined)
    return { ok: false, why: "A picture of an application's window can only be taken on a Mac for now." };
  const cap = process.env.FO_BIN_SCREENCAPTURE || '/usr/sbin/screencapture';
  await mkdir(path.dirname(file), { recursive: true });
  let id = '';
  if (app && /^[\w .&+-]{1,40}$/.test(app) && process.env.FO_BIN_SCREENCAPTURE === undefined) {
    const r = await sh('osascript', ['-e', 'tell application "' + app + '" to id of window 1'], { timeout: 8000 });
    if (r.ok && /^\d+$/.test(r.out.trim())) id = r.out.trim();
  }
  const r = await sh(cap, id ? ['-x', '-o', '-l', id, file] : ['-x', '-m', file], { timeout: 20000 });
  if (!(await sized(file)))
    return {
      ok: false,
      why:
        'macOS did not hand over a picture' +
        (r.err ? ' (' + r.err.split('\n').filter(Boolean).pop().slice(0, 140) + ')' : '') +
        '. It asks once whether this app may record the screen: allow it in System Settings, Privacy and Security, Screen Recording, then ask again.',
    };
  await shrink(file);
  return { ok: true, file, whole: !id };
}
