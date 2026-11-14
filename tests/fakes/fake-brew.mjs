#!/usr/bin/env node
// fake-brew.mjs - a TEST DOUBLE for Homebrew. Used only when FO_BIN_BREW points at it.
//   brew tap ...                      succeeds
//   brew install|upgrade llama.cpp    with FO_FAKE_BREW_LLAMA=<path>: "installs" the test double for llama.cpp at that path (and marks
//                                     it as the new release, so one that was too old no longer is)
//   anything else                     fails the way the real one does when Apple's Command Line Tools are out of date
import { chmodSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [cmd, what] = process.argv.slice(2);
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
