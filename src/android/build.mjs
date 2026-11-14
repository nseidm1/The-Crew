// build.mjs - builds the Android app from this folder into android/familyoffice.apk, with the Android SDK's own tools and nothing else:
// no Gradle, no library, nothing downloaded. The app is plain Java over the platform (one screen, a WebView and TLS).
//   node src/android/build.mjs
// It needs the Android SDK (a platform and its build tools) and a JDK, which a machine with Android Studio has.
// The app is signed with a key kept here in android/debug.keystore, made the first time. A phone only accepts an update signed with
// the same key as the copy it has, so that file is kept (and never shipped). The Play Store will want its own key: that is the
// owner's, and is not made here.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, 'build'), APK = path.join(HERE, 'familyoffice.apk'), KEYS = path.join(HERE, 'debug.keystore');
const MIN = 26, PACKAGE = 'eth.myfamilyoffice.app';
const die = (m) => { console.error('Not built: ' + m); process.exit(1); };
const run = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }); } catch (e) { die(path.basename(cmd) + ' failed:\n' + String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 30).join('\n')); } };
const newest = (dir, ok) => readdirSync(dir).filter(ok).sort((a, b) => parseFloat(a.replace(/^\D+/, '')) - parseFloat(b.replace(/^\D+/, ''))).pop();

const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')].find((d) => d && existsSync(d)) || die('the Android SDK was not found (set ANDROID_HOME).');
const bt = path.join(sdk, 'build-tools', newest(path.join(sdk, 'build-tools'), (x) => /^\d/.test(x)) || die('the SDK has no build tools.'));
const has = (x) => existsSync(path.join(sdk, 'platforms', x, 'android.jar'));
const platform = newest(path.join(sdk, 'platforms'), (x) => /^android-\d+$/.test(x) && has(x)) || newest(path.join(sdk, 'platforms'), (x) => /^android-\d/.test(x) && has(x)) || die('the SDK has no platform.');   // a released platform (android-36) before a preview (android-37.0)
const jar = path.join(sdk, 'platforms', platform, 'android.jar'), target = parseInt(platform.replace('android-', ''), 10);
const code = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000), name = '0.1.' + code;   // a version that only ever goes up: minutes since the start of 2026

rmSync(OUT, { recursive: true, force: true }); mkdirSync(path.join(OUT, 'classes'), { recursive: true }); mkdirSync(path.join(OUT, 'dex'), { recursive: true }); mkdirSync(path.join(OUT, 'gen'), { recursive: true });
run(path.join(bt, 'aapt2'), ['compile', '--dir', path.join(HERE, 'res'), '-o', path.join(OUT, 'res.zip')]);
run(path.join(bt, 'aapt2'), ['link', '-o', path.join(OUT, 'base.apk'), '-I', jar, '--manifest', path.join(HERE, 'AndroidManifest.xml'), '--java', path.join(OUT, 'gen'), '--min-sdk-version', String(MIN), '--target-sdk-version', String(target), '--version-code', String(code), '--version-name', name, path.join(OUT, 'res.zip')]);
const walk = (d, ext) => readdirSync(d).flatMap((x) => { const f = path.join(d, x); return statSync(f).isDirectory() ? walk(f, ext) : f.endsWith(ext) ? [f] : []; });
run('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-bootclasspath', jar + path.delimiter + path.join(bt, 'core-lambda-stubs.jar'), '-d', path.join(OUT, 'classes'), ...walk(path.join(HERE, 'src'), '.java'), ...walk(path.join(OUT, 'gen'), '.java')]);
run(path.join(bt, 'd8'), ['--release', '--lib', jar, '--min-api', String(MIN), '--output', path.join(OUT, 'dex'), ...walk(path.join(OUT, 'classes'), '.class')]);
run('zip', ['-j', '-q', path.join(OUT, 'base.apk'), path.join(OUT, 'dex', 'classes.dex')]);
run(path.join(bt, 'zipalign'), ['-f', '-p', '4', path.join(OUT, 'base.apk'), path.join(OUT, 'aligned.apk')]);
if (!existsSync(KEYS)) run('keytool', ['-genkeypair', '-keystore', KEYS, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950', '-dname', 'CN=Family Office debug']);
run(path.join(bt, 'apksigner'), ['sign', '--ks', KEYS, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--ks-key-alias', 'androiddebugkey', '--out', APK, path.join(OUT, 'aligned.apk')]);
run(path.join(bt, 'apksigner'), ['verify', APK]);
const says = run(path.join(bt, 'aapt2'), ['dump', 'badging', APK]);
rmSync(OUT, { recursive: true, force: true }); for (const f of readdirSync(HERE)) if (/\.idsig$/.test(f)) rmSync(path.join(HERE, f));
console.log('android/familyoffice.apk: ' + Math.round(statSync(APK).size / 1024) + ' KB, ' + PACKAGE + ' ' + name + ', Android ' + (/(?:sdkVersion|minSdkVersion):'(\d+)'/.exec(says) || [])[1] + ' and newer (built for ' + target + '), signed with android/debug.keystore');
if (!says.includes("package: name='" + PACKAGE + "'")) die('the package name in the manifest is not ' + PACKAGE + '.');
