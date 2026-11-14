// adb.mjs - a phone plugged into this computer, for putting the app on it before it is in a store. It uses Android's own adb, which is
// on a machine that has the Android platform tools; nothing is installed to get it. A phone is listed only when its owner has switched
// on Developer options and USB debugging and accepted this computer on the phone's own screen.
//   phones()                 { adb, list: [{ serial, state, name, says }] }   state: ready | unauthorized | offline
//   install(serial, apk)     put the app on it (it replaces an older copy and keeps its pairing)
//   open(serial, link)       start the app on it with a pairing link, so pairing needs no camera
import os from 'node:os';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { sh, which } from './host.mjs';

export const PACKAGE = 'eth.myfamilyoffice.app';
const exists = (f) =>
  access(f).then(
    () => true,
    () => false,
  );
export async function findAdb() {
  if (process.env.FO_BIN_ADB !== undefined)
    return (await exists(process.env.FO_BIN_ADB)) ? process.env.FO_BIN_ADB : null;
  for (const sdk of [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk'),
  ]) {
    if (!sdk) continue;
    const f = path.join(sdk, 'platform-tools', 'adb');
    if (await exists(f)) return f;
  }
  return which('adb');
}
const SAYS = {
  ready: 'Ready',
  unauthorized: 'Unlock the phone and accept "Allow USB debugging" for this computer',
  offline: 'Plugged in, but not answering. Unplug it and plug it in again',
};
export async function phones() {
  const adb = await findAdb();
  if (!adb) return { adb: false, list: [] };
  const r = await sh(adb, ['devices', '-l'], { timeout: 8000 });
  const list = [];
  for (const line of r.out.split('\n').slice(1)) {
    const m = /^(\S+)\s+(device|unauthorized|offline)\b(.*)$/.exec(line.trim());
    if (!m || !/^[\w.:-]{1,64}$/.test(m[1])) continue;
    const state = m[2] === 'device' ? 'ready' : m[2];
    const model = (/model:(\S+)/.exec(m[3]) || [])[1] || '';
    list.push({
      serial: m[1],
      state,
      name: model.replace(/_/g, ' ') || m[1],
      says: SAYS[state],
      emulator: /^emulator-/.test(m[1]),
    });
  }
  return { adb: true, list };
}
// THE APP A BUILD LEFT IN A WORKSPACE: the debug app, where Gradle or Flutter puts it. null when nothing has been built there.
export async function builtApp(dir) {
  for (const rel of [
    'app/build/outputs/apk/debug/app-debug.apk',
    'build/app/outputs/flutter-apk/app-debug.apk',
    'android/app/build/outputs/apk/debug/app-debug.apk',
    'build/outputs/apk/debug/app-debug.apk',
  ]) {
    const file = path.join(dir, rel);
    if (await exists(file)) return { file, rel };
  }
  return null;
}
export async function install(serial, apk) {
  const adb = await findAdb();
  if (!adb) return { ok: false, why: "Android's adb was not found on this computer." };
  if (!(await exists(apk))) return { ok: false, why: 'The app is not in this copy of Family Office yet.' };
  const r = await sh(adb, ['-s', serial, 'install', '-r', apk], { timeout: 180000 });
  if (/Success/.test(r.out)) return { ok: true };
  const said = (r.out + ' ' + r.err).replace(/\s+/g, ' ').trim();
  return {
    ok: false,
    why: /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(said)
      ? 'A copy signed by someone else is already on the phone. Remove that one from the phone, then install again.'
      : /unauthorized/i.test(said)
        ? SAYS.unauthorized + '.'
        : 'The phone refused the install: ' + said.slice(-200),
  };
}
export async function open(serial, link) {
  const adb = await findAdb();
  if (!adb) return { ok: false, why: "Android's adb was not found on this computer." };
  if (!/^familyoffice:\/\/pair\?[A-Za-z0-9._~:%&=,-]+$/.test(link))
    return { ok: false, why: 'That is not a pairing link.' }; // it is handed to the phone's shell: only these characters
  const r = await sh(
    adb,
    ['-s', serial, 'shell', "am start -a android.intent.action.VIEW -d '" + link + "' " + PACKAGE],
    { timeout: 20000 },
  );
  return /Error|Exception/i.test(r.out + r.err)
    ? {
        ok: false,
        why:
          'The app could not be started on the phone: ' + (r.out + ' ' + r.err).replace(/\s+/g, ' ').trim().slice(-160),
      }
    : { ok: true };
}
