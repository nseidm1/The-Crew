#!/usr/bin/env node
// fake-brew.mjs - a TEST DOUBLE for Homebrew. Used only when FO_BIN_BREW points at it.
//   brew tap ...                      succeeds
//   brew install|upgrade llama.cpp    with FO_FAKE_BREW_LLAMA=<path>: "installs" the test double for llama.cpp at that path (and marks
//                                     it as the new release, so one that was too old no longer is)
//   brew install <the engine's formula> with FO_FAKE_BREW_TF=1 (and FO_FAKE_TF, FO_BIN_TENSORFOLD): "installs" the test double for the engine there
//   brew --version | update | cleanup | link     succeed (link "installs" what a cut-off run left unlinked)
//   brew outdated <formula>           names the formula when FO_FAKE_BREW_OUTDATED lists it
//   FO_FAKE_BREW_FAIL=locked|cutoff|unlinked, with FO_FAKE_BREW_ONCE=<file>: the first install or upgrade fails that way (locked:
//                                     another Homebrew is at work; cutoff: a broken download; unlinked: installed, not linked)
//   FO_FAKE_BREW_LOG=<file>           every call is written down
//   anything else                     fails the way the real one does when Apple's Command Line Tools are out of date
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [cmd, what] = process.argv.slice(2).filter((a, i) => i === 0 || !a.startsWith('-')); // the command, and what it is about
if (process.env.FO_FAKE_BREW_LOG) appendFileSync(process.env.FO_FAKE_BREW_LOG, process.argv.slice(2).join(' ') + '\n');
const putEngine = () => {
  mkdirSync(path.dirname(process.env.FO_BIN_TENSORFOLD), { recursive: true });
  copyFileSync(process.env.FO_FAKE_TF, process.env.FO_BIN_TENSORFOLD);
  chmodSync(process.env.FO_BIN_TENSORFOLD, 0o755);
};
if (cmd === '--version') {
  console.log('Homebrew 5.0.0');
  process.exit(0);
}
if (cmd === 'update' || cmd === 'cleanup') process.exit(0);
if (cmd === 'link') {
  if (process.env.FO_FAKE_BREW_TF === '1') putEngine();
  console.log('Linking: done');
  process.exit(0);
}
if (cmd === 'outdated') {
  if (
    String(process.env.FO_FAKE_BREW_OUTDATED || '')
      .split(',')
      .includes(what)
  )
    console.log(what.split('/').pop());
  process.exit(0);
}
if ((cmd === 'install' || cmd === 'upgrade') && process.env.FO_FAKE_BREW_FAIL) {
  const once = process.env.FO_FAKE_BREW_ONCE;
  const kind = process.env.FO_FAKE_BREW_FAIL;
  if (kind === 'unlinked' || (once && !existsSync(once))) {
    if (once) writeFileSync(once, kind);
    console.error(
      kind === 'locked'
        ? 'Error: Another active Homebrew process is already in progress. Please wait for it to finish or terminate it to continue.'
        : kind === 'cutoff'
          ? 'Error: SHA256 mismatch\nExpected: 1111\n  Actual: 2222'
          : 'Warning: ' +
            what +
            " 1.2.3 is already installed, it's just not linked.\nTo link this version, run:\n  brew link " +
            what,
    );
    process.exit(1);
  }
}
if ((cmd === 'install' || cmd === 'upgrade') && /tensorfold/.test(what || '') && process.env.FO_FAKE_BREW_TF === '1') {
  console.log('==> Installing tensorfold');
  putEngine();
  process.exit(0);
}
if (cmd === 'tap') {
  console.log('==> Tapping ashhart/tensorfold');
  process.exit(0);
}
if ((cmd === 'install' || cmd === 'upgrade') && what === 'llama.cpp' && process.env.FO_FAKE_BREW_LLAMA) {
  console.log('==> Pouring llama.cpp');
  copyFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-llama.mjs'),
    process.env.FO_FAKE_BREW_LLAMA,
  );
  chmodSync(process.env.FO_FAKE_BREW_LLAMA, 0o755);
  writeFileSync(
    path.join(process.env.FO_FAKE_DIR || path.dirname(process.env.FO_FAKE_BREW_LLAMA), 'llama-upgraded'),
    cmd,
  );
  process.exit(0);
}
console.error('Error: Your Command Line Tools are too outdated.');
console.error('Update them from Software Update in System Settings.');
console.error('Alternatively, manually download them from:');
console.error('  https://developer.apple.com/download/all/.');
console.error('You should download the Command Line Tools for Xcode 27.0.');
process.exit(1);
