// pick.mjs - THE MACHINE'S OWN FOLDER CHOOSER, opened by the runner because the runner is on the machine the folder is on. A browser
// cannot tell a page where a folder really is; the system's own window can, and the customer chooses in it as they would anywhere.
// It is the system's window whatever browser the page is in: the page only asks, and the runner opens it.
//   pickFolder(prompt) -> { path } | { cancelled: true } | { error }
// macOS: the standard "choose folder" window (osascript). Windows: its own folder window (through PowerShell, which every Windows
// has). Linux: zenity or kdialog, where one is installed; inside Windows' Linux layer, where there is usually neither, the Windows
// window is used and the folder is given as Linux sees it.
// WHAT IS SAID WHEN IT CANNOT is about the system the person is on: what that system uses, and what to do there.
// A test names the answer (FO_PICK_FOLDER: a path, or empty for "the customer closed it") and a run that must open nothing on the
// screen (FO_NO_OPEN=1) is told there is no chooser, so a window is never opened on a machine nobody is sitting at.
import { PLATFORM, inWsl, sh, which } from './host.mjs';

// what cannot be done here, in the words of the system it is
export const noChooser = (platform, wsl = false) => ({
  error:
    platform === 'win32'
      ? 'This PC has no folder chooser the app can open just now: Windows did not open its folder window. Close any folder window that is waiting behind this one, then choose again.'
      : platform === 'darwin'
        ? 'This Mac has no folder chooser the app can open just now: macOS did not open its folder window. Choose again.'
        : wsl
          ? "This machine has no folder chooser the app can open from Windows' Linux layer. Install zenity inside it, or start the app on Windows itself, then choose again."
          : 'This machine has no folder chooser the app can open. On Linux it uses zenity or kdialog: install one of them, then choose again.',
});
const lastLine = (r) =>
  (
    String(r.err || '')
      .split('\n')
      .pop() || 'no reason given'
  ).slice(0, 140);

// Windows' own folder window, on top of the other windows. Prints the folder chosen, or nothing when it is closed.
const windowsScript = (words) =>
  'Add-Type -AssemblyName System.Windows.Forms; ' +
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
  "$d.Description = '" +
  words +
  "'; $d.ShowNewFolderButton = $true; " +
  '$top = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0 }; ' +
  'if ($d.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }';
async function pickOnWindows(exe, words, wait) {
  const r = await sh(exe, ['-NoProfile', '-STA', '-Command', windowsScript(words)], wait);
  if (!r.ok) return { error: 'The folder window did not open: ' + lastLine(r) };
  return r.out ? { path: r.out.trim() } : { cancelled: true };
}

export async function pickFolder(prompt = 'Choose a Git folder for your team to work in') {
  if (process.env.FO_PICK_FOLDER !== undefined)
    return process.env.FO_PICK_FOLDER ? { path: process.env.FO_PICK_FOLDER } : { cancelled: true };
  const wsl = inWsl();
  if (process.env.FO_NO_OPEN === '1') return noChooser(PLATFORM, wsl);
  const words = String(prompt)
    .replace(/[^\w ,.-]/g, '')
    .slice(0, 120);
  const wait = { timeout: 10 * 60000 };
  if (PLATFORM === 'darwin') {
    const r = await sh(
      '/usr/bin/osascript',
      ['-e', 'activate', '-e', 'POSIX path of (choose folder with prompt "' + words + '")'],
      wait,
    );
    if (r.ok && r.out) return { path: r.out.trim().replace(/(.)\/$/, '$1') };
    return /User canceled|-128/.test(r.err)
      ? { cancelled: true }
      : { error: 'The folder window did not open: ' + lastLine(r) };
  }
  if (PLATFORM === 'win32') return pickOnWindows('powershell', words, wait);
  const z = await which('zenity');
  const k = z ? null : await which('kdialog');
  if (!z && !k) {
    if (!wsl) return noChooser(PLATFORM, false);
    // inside Windows' Linux layer: Windows' own window, and the folder as this Linux sees it
    const got = await pickOnWindows('powershell.exe', words, wait);
    if (!got.path) return got.error ? noChooser(PLATFORM, true) : got;
    const here = await sh('wslpath', ['-u', got.path]);
    return here.ok && here.out ? { path: here.out.trim().replace(/(.)\/$/, '$1') } : noChooser(PLATFORM, true);
  }
  const r = z
    ? await sh(z, ['--file-selection', '--directory', '--title=' + words], wait)
    : await sh(k, ['--getexistingdirectory', process.env.HOME || '/', '--title', words], wait);
  return r.ok && r.out ? { path: r.out.trim().replace(/(.)\/$/, '$1') } : { cancelled: true };
}
