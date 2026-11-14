#!/usr/bin/env node
// fake-arch.mjs - a TEST DOUBLE for macOS's /usr/bin/arch, used only when FO_BIN_ARCH points at it. It notes what it was asked to run
// for which chip, marks what it starts as native (the engine's stand-ins refuse anything else when told to), and runs it.
// With FO_FAKE_ARCH_BAD=1 it answers the way arch does for a program that has no build for the chip.
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const [flag, cmd, ...args] = process.argv.slice(2);
if (process.env.FO_FAKE_DIR)
  appendFileSync(
    path.join(process.env.FO_FAKE_DIR, 'arch.log'),
    flag + ' ' + path.basename(cmd || '') + ' ' + (args[0] || '') + '\n',
  );
if (process.env.FO_FAKE_ARCH_BAD === '1') {
  console.error('arch: posix_spawnp: ' + cmd + ': Bad CPU type in executable');
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, FO_FAKE_NATIVE: '1' } });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
child.on('error', (e) => {
  console.error('arch: ' + e.message);
  process.exit(1);
});
child.on('close', (code) => process.exit(code == null ? 1 : code));
