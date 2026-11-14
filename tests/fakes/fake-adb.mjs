#!/usr/bin/env node
// fake-adb.mjs - a TEST DOUBLE for Android's adb, used only when FO_BIN_ADB points at it. It lists two phones (one ready, one that has
// not accepted this computer yet), and notes every install and every command sent to a phone in adb.log. No phone is touched.
import { appendFileSync } from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2);
const note = (line) => {
  if (process.env.FO_FAKE_DIR) appendFileSync(path.join(process.env.FO_FAKE_DIR, 'adb.log'), line + '\n');
};
if (a[0] === 'devices') {
  console.log(
    'List of devices attached\nemulator-5554          device product:sdk model:Pixel_9_Pro device:emu transport_id:1\nR5CT1234ABC            unauthorized usb:1-1 transport_id:2\n',
  );
  process.exit(0);
}
if (a[0] === '-s' && a[2] === 'install') {
  note('install ' + a[1] + ' ' + a.slice(3).join(' '));
  console.log(
    process.env.FO_FAKE_ADB_REFUSE === '1'
      ? 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]'
      : 'Performing Streamed Install\nSuccess',
  );
  process.exit(0);
}
if (a[0] === '-s' && a[2] === 'shell') {
  note('shell ' + a[1] + ' ' + a.slice(3).join(' '));
  console.log('Starting: Intent { act=android.intent.action.VIEW }');
  process.exit(0);
}
console.error('adb: unknown command');
process.exit(1);
