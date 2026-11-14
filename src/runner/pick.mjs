// pick.mjs - THE MACHINE'S OWN FOLDER CHOOSER, opened by the runner because the runner is on the machine the folder is on. A browser
// cannot tell a page where a folder really is; the system's own window can, and the customer chooses in it as they would anywhere.
//   pickFolder(prompt) -> { path } | { cancelled: true } | { error }
// macOS: the standard "choose folder" window (osascript). Linux: zenity or kdialog, where one is installed.
// A test names the answer (FO_PICK_FOLDER: a path, or empty for "the customer closed it") and a run that must open nothing on the
// screen (FO_NO_OPEN=1) is told there is no chooser, so a window is never opened on a machine nobody is sitting at.
import { PLATFORM, sh, which } from './host.mjs';

export async function pickFolder(prompt = 'Choose a Git folder for your team to work in') {
  if (process.env.FO_PICK_FOLDER !== undefined)
    return process.env.FO_PICK_FOLDER ? { path: process.env.FO_PICK_FOLDER } : { cancelled: true };
  const none = {
    error:
      'This machine has no folder chooser the app can open. On Linux it uses zenity or kdialog: install one of them, then choose again.',
  };
  if (process.env.FO_NO_OPEN === '1') return none;
  const words = String(prompt).replace(/[^\w ,.'-]/g, '');
  const wait = { timeout: 10 * 60000 };
  if (PLATFORM === 'darwin') {
    const r = await sh(
      '/usr/bin/osascript',
      ['-e', 'activate', '-e', 'POSIX path of (choose folder with prompt "' + words.replace(/'/g, '') + '")'],
      wait,
    );
    if (r.ok && r.out) return { path: r.out.trim().replace(/(.)\/$/, '$1') };
    return /User canceled|-128/.test(r.err)
      ? { cancelled: true }
      : { error: 'The folder chooser did not open: ' + (r.err.split('\n').pop() || 'no reason given').slice(0, 140) };
  }
  const z = await which('zenity');
  const k = z ? null : await which('kdialog');
  if (!z && !k) return none;
  const r = z
    ? await sh(z, ['--file-selection', '--directory', '--title=' + words], wait)
    : await sh(k, ['--getexistingdirectory', process.env.HOME || '/', '--title', words], wait);
  return r.ok && r.out ? { path: r.out.trim().replace(/(.)\/$/, '$1') } : { cancelled: true };
}
