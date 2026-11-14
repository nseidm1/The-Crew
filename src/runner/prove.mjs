// prove.mjs - THE PROOF OF A CHANGE, handed over the way a careful team hands work over: a test that is RED on the code before the
// change and GREEN on the code after it, run without a device, and one proof image the customer can read and pass on.
//   1 THE RECIPE. How this repository runs a proof. Its own .familyoffice/proof.json when it has one (a project with a harness of
//     its own names its command there). Otherwise the recipe for the kind of project it is, each the same idea in that platform's
//     own tools: a test that needs no device, no server and no account.
//       Android   Robolectric, by the project's own Gradle unit-test task. The real screen is started on data the test supplies.
//       Swift     XCTest, by "swift test", in the package's own test target.
//       Python    pytest where the project has it, else unittest from the standard library.
//       JS / TS   the project's own runner (Vitest or Jest) where it has one, else Node's own test runner.
//     A project that is none of these, or lacks what its recipe needs, is told exactly what to add; nothing is guessed.
// THE LOGIC every recipe serves: what a request or a ticket asks for DOES NOT WORK TODAY (it is missing, or it is a bug). The proof is
// its acceptance test: it fails on the code as it is, because the thing is not there, and it must pass on the change.
//   2 THE PROOF FILE is written by the team's agent, in the clone, under the recipe's proof folder. The moment it exists it is MOVED
//     OUT of the clone into this app's own folder: a proof is made for people, not for the repository, and never enters the change.
//   3 TWO THROWAWAY COPIES of the repository (git worktrees): the base (HEAD) and the change (HEAD plus what is waiting). The proof
//     file is copied into both and the recipe's command is run in each, the change first.
//   4 THE VERDICT, test by test: red on the base and green on the change is PROVEN; green on both is a GUARD; red on both is a
//     finding about the BASE; green then red is a BREAK. A base run that reported no tests at all proves nothing (it usually did not
//     compile, because the proof names something the change adds) and is said so.
//   5 THE PROOF IMAGE: one sheet, drawn by a browser the machine already has. What was asked and the verdict; the table; the frames
//     the tests captured, base beside change; any setup; and numbered steps for whoever checks it. Kept in this app's folder.
// The copies are removed afterwards whatever happened. Nothing here commits, pushes or changes the clone.
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { sh, which } from './host.mjs';
import { run } from './engine.mjs';
import { findBrowser } from './shot.mjs';
import { TEMPER } from '../js/team-soul.js';
import { askRoom, tally, snapOf, tryIdeas, roomLines, statusLines } from './swarm.mjs';

const exists = (f) =>
  stat(f).then(
    () => true,
    () => false,
  );
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const git = (dir, args, o) => sh('git', ['-C', dir, ...args], { timeout: 60000, ...o });
const rel = (v) => {
  const s = String(v || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  return s && !s.startsWith('/') && !s.split('/').includes('..') ? s : '';
}; // a path inside the repository, or nothing

// ---------- the recipes, one for each kind of project ----------
const text = (f) => readFile(f, 'utf8').catch(() => '');
const first = async (dir, names) => {
  for (const n of names) if (await exists(path.join(dir, n))) return n;
  return '';
};
// a test's name in plain words: test_pay_button_is_visible and testPayButtonIsVisible both read "Pay button is visible"
export const plain = (name) => {
  const n = String(name || '');
  if (/\s/.test(n)) return n;
  const s = n
    .replace(/^test_?/i, '')
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : n;
};
const SCRATCH = { dest: '.proof', frames: '.proof/frames', scratch: true, copy: [], guide: '', env: {} }; // a folder of this app's own, emptied afterwards

// ANDROID: Robolectric, the way a device-free Android proof is done. The module, the task (with the first flavor, when there are
// flavors) and the language are read from the project's own Gradle files. A project with no Robolectric is told what to add, once.
async function androidRecipe(dir) {
  if (!(await exists(path.join(dir, 'gradlew')))) return null;
  const settings =
    (await text(path.join(dir, 'settings.gradle.kts'))) + '\n' + (await text(path.join(dir, 'settings.gradle')));
  const mods = [
    ...new Set([...settings.matchAll(/["'](:[\w:.-]+)["']/g)].map((m) => m[1].replace(/^:/, '').replace(/:/g, '/'))),
  ].filter((m) => m && !m.split('/').includes('..'));
  if (!mods.includes('app') && (await exists(path.join(dir, 'app')))) mods.unshift('app');
  const builds = [];
  for (const m of mods.slice(0, 24)) {
    const b = (await text(path.join(dir, m, 'build.gradle.kts'))) + (await text(path.join(dir, m, 'build.gradle')));
    if (b) builds.push({ m, b });
  }
  const app =
    builds.find((x) => /com\.android\.application|android\.application/.test(x.b)) ||
    builds.find((x) => /com\.android\.library|android\.library|\bandroid\s*\{/.test(x.b));
  if (!app)
    return {
      blocked:
        'This is a Gradle project, but no Android module was found in it to run a proof in (a module that applies the Android plugin; it is proven with Robolectric, with no device). Add a .familyoffice/proof.json that names the command that runs a proof here.',
    };
  if (
    !builds.some((x) => /robolectric/i.test(x.b)) &&
    !/robolectric/i.test(await text(path.join(dir, 'gradle', 'libs.versions.toml')))
  )
    return {
      blocked:
        'This Android project has no Robolectric, which is what runs a screen without a device. Ask the team to add it once, as a change of its own: in ' +
        app.m +
        '/build.gradle, a testImplementation of org.robolectric:robolectric and, inside android { }, testOptions { unitTests { isIncludeAndroidResources = true } }. After that every change can be proven here without a device.',
    };
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    (await first(os.homedir(), ['Library/Android/sdk', 'Android/Sdk']).then((d) =>
      d ? path.join(os.homedir(), d) : '',
    ));
  const flavors = /productFlavors\s*\{([\s\S]*?)\n\s{0,4}\}/.exec(app.b);
  const flavor = flavors
    ? (/(?:create|register)\(\s*["'](\w+)["']/.exec(flavors[1]) || /^\s*(\w+)\s*\{/m.exec(flavors[1]) || [])[1] || ''
    : '';
  const task = 'test' + (flavor ? flavor[0].toUpperCase() + flavor.slice(1) : '') + 'DebugUnitTest';
  const kotlin = /kotlin/i.test(app.b) || (await exists(path.join(dir, app.m, 'src', 'main', 'kotlin')));
  return {
    kind: 'android',
    compose: builds.some((x) => /ui-test-junit4|compose\.ui\.test/.test(x.b)),
    name: 'Robolectric, by Gradle (' + app.m + ':' + task + ')',
    dest: app.m + '/src/test/java/familyoffice/proof',
    file: 'FamilyOfficeProofTest.' + (kotlin ? 'kt' : 'java'),
    run: [
      './gradlew',
      ':' + app.m.replace(/\//g, ':') + ':' + task,
      '--tests',
      'familyoffice.proof.FamilyOfficeProofTest',
      '--console=plain',
    ],
    parse: 'junit',
    results: app.m + '/build/test-results/' + task,
    frames: app.m + '/build/familyoffice-proof',
    copy: ['local.properties'],
    link: [],
    guide: await first(dir, ['docs/PROOF.md', 'PROOF.md', 'docs/proof.md']),
    env: sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {},
    minutes: 40,
    how:
      "This is an Android project, and the proof runs with no device, under Robolectric. Write it in the package familyoffice.proof as the class FamilyOfficeProofTest, run with RobolectricTestRunner. Start the REAL screen (an ActivityScenario, or the real layout inflated) on data the test supplies itself: no network, no account, no sleeping. Look at the project's own tests first and set a screen up the way they do. To capture a picture, give the class @GraphicsMode(GraphicsMode.Mode.NATIVE), draw the root view into a Bitmap, and write it as a PNG into " +
      app.m +
      '/build/familyoffice-proof/, named for what it shows.',
  };
}
// SWIFT: XCTest by "swift test", in the package's own first test target
async function swiftRecipe(dir) {
  if (!(await exists(path.join(dir, 'Package.swift'))))
    return (await first(
      dir,
      (await readdir(dir).catch(() => [])).filter((n) => /\.(xcodeproj|xcworkspace)$/.test(n)),
    ))
      ? {
          blocked:
            'This is an Xcode project with no Package.swift, so there is no one command that runs its tests. Add a .familyoffice/proof.json that names it (an xcodebuild test command for a scheme and a simulator), and the folder its test files go in.',
        }
      : null;
  const bin = await which('swift');
  if (!bin)
    return { blocked: 'This is a Swift package, and there is no swift command on this machine to run its tests with.' };
  const xcode = '/Applications/Xcode.app/Contents/Developer';
  const runs = async (env) => (await sh(bin, ['--version'], { timeout: 30000, env: { ...process.env, ...env } })).ok;
  const swiftEnv = (await runs({}))
    ? {}
    : (await exists(xcode)) && (await runs({ DEVELOPER_DIR: xcode }))
      ? { DEVELOPER_DIR: xcode }
      : null;
  if (!swiftEnv)
    return {
      blocked:
        'This is a Swift package, and the swift command on this machine does not start' +
        ((await exists(xcode))
          ? ", with Xcode's either: open Xcode once and accept its licence."
          : ': its developer tools are missing or were made for another kind of Mac. Install Xcode from the App Store, open it once, and try again.'),
    };
  const targets = (await readdir(path.join(dir, 'Tests'), { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (!targets.length)
    return {
      blocked:
        'This Swift package has no test target (nothing under Tests/). Ask the team to add one, as a change of its own; after that every change can be proven here.',
    };
  return {
    kind: 'swift',
    name: 'XCTest, by swift test',
    dest: 'Tests/' + targets[0],
    file: 'FamilyOfficeProofTests.swift',
    run: [
      bin,
      'test',
      '--parallel',
      '--filter',
      'FamilyOfficeProofTests',
      '--xunit-output',
      '.familyoffice-proof/result.xml',
    ],
    parse: 'junit',
    results: '.familyoffice-proof',
    frames: '.familyoffice-proof/frames',
    copy: [],
    link: [],
    guide: '',
    env: swiftEnv,
    minutes: 40,
    how:
      'This is a Swift package. Write an XCTestCase subclass named FamilyOfficeProofTests, importing the module the way the other files in ' +
      targets[0] +
      ' do, with one method for each thing it proves, named testWhatItProves. No network and no sleeping.',
  };
}
// PYTHON: pytest where the project's own Python has it, else unittest, which every Python has
async function pythonRecipe(dir) {
  // a Python project by its own files, or simply Python files at its top or in a tests folder (found for real: calc.py and test_calc.py, and nothing else)
  const { readdir: ls } = await import('node:fs/promises');
  const loose = async () =>
    (await ls(dir).catch(() => [])).some((n) => /\.py$/.test(n)) ||
    (await ls(path.join(dir, 'tests')).catch(() => [])).some((n) => /\.py$/.test(n));
  if (
    !(await first(dir, [
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'pytest.ini',
      'tox.ini',
      'Pipfile',
      'manage.py',
    ])) &&
    !(await loose())
  )
    return null;
  const own = await first(dir, ['.venv/bin/python', 'venv/bin/python', 'env/bin/python']);
  const python = own ? path.join(dir, own) : (await which('python3')) || (await which('python'));
  if (!python)
    return { blocked: 'This is a Python project, and there is no python3 on this machine to run its tests with.' };
  const pytest = (await sh(python, ['-c', 'import pytest'], { timeout: 20000 })).ok;
  const common = {
    ...SCRATCH,
    kind: 'python',
    file: 'test_change.py',
    link: [],
    env: { PYTHONPATH: '.', PYTHONDONTWRITEBYTECODE: '1' },
    minutes: 15,
  };
  return pytest
    ? {
        ...common,
        name: 'pytest',
        run: [
          python,
          '-m',
          'pytest',
          '.proof/test_change.py',
          '-q',
          '-p',
          'no:cacheprovider',
          '--junitxml=.familyoffice-proof/result.xml',
        ],
        parse: 'junit',
        results: '.familyoffice-proof',
        how: "This is a Python project, run with pytest. Write plain functions named test_what_it_proves, importing the project's code as its own tests do. Give them no docstrings: the name is what is reported.",
      }
    : {
        ...common,
        name: "Python's own unittest",
        run: [python, '-m', 'unittest', 'discover', '-v', '-s', '.proof', '-p', 'test_change.py'],
        parse: 'unittest',
        results: '',
        how: "This is a Python project. Use unittest from the standard library: one class ProofTest(unittest.TestCase) with methods named test_what_it_proves, importing the project's code from the repository's top folder. Give the methods no docstrings: the name is what is reported.",
      };
}
// FLUTTER AND DART: flutter_test by "flutter test", or package:test by "dart test" for a package with no Flutter in it. The proof goes among
// the project's own tests, because that is the only place the test runner resolves the project's packages from.
async function dartRecipe(dir) {
  const spec = await text(path.join(dir, 'pubspec.yaml'));
  if (!spec) return null;
  const isFlutter = /^\s*sdk:\s*flutter\s*$/m.test(spec);
  const bin = await which(isFlutter ? 'flutter' : 'dart');
  if (!bin)
    return {
      blocked:
        'This is a ' +
        (isFlutter ? 'Flutter' : 'Dart') +
        ' project, and there is no ' +
        (isFlutter ? 'flutter' : 'dart') +
        ' command on this machine to run its tests with.',
    };
  const name = (/^name:\s*([\w]+)/m.exec(spec) || [])[1] || 'the app';
  return {
    kind: 'flutter',
    pkg: name === 'the app' ? '' : name,
    known: [
      'flutter',
      'flutter_test',
      'flutter_localizations',
      'test',
      ...[...spec.matchAll(/^ {2}([a-z_]\w*):/gm)].map((m) => m[1]),
    ],
    name: isFlutter ? 'flutter_test, by flutter test' : 'package:test, by dart test',
    dest: 'test',
    file: 'familyoffice_proof_test.dart',
    run: [bin, 'test', 'test/familyoffice_proof_test.dart', '--reporter', 'json', '--timeout', '90s'],
    parse: 'dartjson',
    results: '',
    frames: '',
    copy: [],
    link: ['.dart_tool'],
    guide: await first(dir, ['docs/PROOF.md', 'PROOF.md']),
    env: {},
    minutes: 8,
    how:
      'This is a ' +
      (isFlutter
        ? 'Flutter app. Use flutter_test: testWidgets with pumpWidget for a widget (wrap it in a MaterialApp), find.text or find.byKey and expect, and plain test() for logic. After a tap or a change use tester.pump(); use pumpAndSettle() only where nothing animates for ever, because it waits until everything is still.'
        : 'Dart package. Use package:test: test() and expect().') +
      " Import the project's code as package:" +
      name +
      '/<file under lib>. One test for each thing it proves, named in plain words. No network.',
  };
}
// the JSON reporter of flutter test and dart test: testStart names a test, testDone says how it went; the "loading" entries are hidden
export function readDartJson(out) {
  const rows = new Map();
  const why = new Map();
  const names = new Map();
  for (const line of String(out).split('\n')) {
    if (line[0] !== '{') continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === 'testStart' && ev.test && !/^loading\s/.test(String(ev.test.name || '')))
      names.set(ev.test.id, String(ev.test.name || '')); // "loading <file>" is the runner reading the file, not one of its tests: when the file cannot load on the old code that is the whole run failing, which the proof already knows how to read
    if (ev.type === 'error' && names.has(ev.testID))
      why.set(
        plain(names.get(ev.testID)),
        String(ev.error || 'it failed')
          .split('\n')[0]
          .slice(0, 200),
      );
    if (ev.type === 'testDone' && !ev.hidden && !ev.skipped && names.has(ev.testID))
      rows.set(plain(names.get(ev.testID)), ev.result === 'success');
  }
  return { rows, why };
}
// JAVASCRIPT AND TYPESCRIPT: the project's own runner where it has one, else Node's own. The project's node_modules are lent to the copies.
async function nodeRecipe(dir) {
  let pkg = null;
  try {
    pkg = JSON.parse(await text(path.join(dir, 'package.json')));
  } catch {
    pkg = null;
  }
  if (!pkg) return null;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasTypeScript = await exists(path.join(dir, 'tsconfig.json'));
  const common = { ...SCRATCH, link: ['node_modules'], minutes: 10 };
  const npx = (await which('npx')) || 'npx';
  if (deps.vitest) {
    const file = 'change.test.' + (hasTypeScript ? 'ts' : 'mjs');
    return {
      ...common,
      kind: 'vitest',
      name: 'Vitest',
      file,
      run: [
        npx,
        '--no-install',
        'vitest',
        'run',
        '.proof/' + file,
        '--reporter=junit',
        '--outputFile=.familyoffice-proof/result.xml',
      ],
      parse: 'junit',
      results: '.familyoffice-proof',
      how: 'This project tests with Vitest. Write the file the way its own tests are written (the same imports, the same style).',
    };
  }
  if (deps.jest) {
    const file = 'change.test.' + (hasTypeScript ? 'ts' : 'js');
    return {
      ...common,
      kind: 'jest',
      name: 'Jest',
      file,
      run: [
        npx,
        '--no-install',
        'jest',
        '--rootDir',
        '.',
        '--runTestsByPath',
        '.proof/' + file,
        '--json',
        '--outputFile=.familyoffice-proof/result.json',
      ],
      parse: 'jest',
      results: '.familyoffice-proof/result.json',
      how: 'This project tests with Jest. Write the file the way its own tests are written (the same imports, the same style).',
    };
  }
  return {
    ...common,
    kind: 'node',
    ts: hasTypeScript,
    name: "Node's own test runner" + (hasTypeScript ? ' (TypeScript, its types stripped by Node)' : ''),
    file: 'change.test.mjs',
    run: [process.execPath, '--test', '--test-reporter=tap', '.proof/change.test.mjs'],
    parse: 'tap',
    results: '',
    minutes: 5,
    how:
      'This project is tested with Node\'s own test runner. The proof is an ES module: import test from "node:test" and assert from "node:assert/strict". It sits in the folder .proof, so the project\'s own files are one folder up: import them as "../name.' +
      (hasTypeScript
        ? 'ts" (this project is TypeScript, and Node runs it as it is: keep the .ts ending in every import, and write no type that needs compiling, such as an enum or a namespace)'
        : 'mjs"') +
      '.',
  };
}

// THE PROJECT'S OWN TESTS, where running them is quick and needs nothing fetched: Python's, Node's own runner, Flutter's. Run after a
// change is made (and, to tell what the change broke from what was broken already, on the code as it was committed: at = 'HEAD').
// -> { ok, none: there are no tests, failed: [names], said: what the failures printed, command } or null when this kind of project is not run here
// what an editor's "add import" knows: the names a Compose screen and a JUnit test use every day, and where they live
const KOTLIN_IMPORTS = (() => {
  const imports = {};
  const put = (pkg, names) =>
    names.split(' ').forEach((n) => {
      imports[n] = pkg + '.' + n;
    });
  put('androidx.compose.ui', 'Modifier Alignment');
  put('androidx.compose.runtime', 'Composable remember mutableStateOf getValue setValue LaunchedEffect');
  put('androidx.compose.ui.unit', 'dp sp Dp');
  put('androidx.compose.ui.platform', 'testTag LocalContext');
  put('androidx.compose.ui.res', 'stringResource');
  put('androidx.compose.ui.graphics', 'Color');
  put('androidx.compose.foundation', 'clickable background');
  put(
    'androidx.compose.foundation.layout',
    'Column Row Box Spacer BoxWithConstraints padding fillMaxWidth fillMaxSize fillMaxHeight width height size widthIn heightIn sizeIn Arrangement PaddingValues',
  );
  put(
    'androidx.compose.material3',
    'Text Button Surface MaterialTheme Scaffold Icon IconButton TextButton OutlinedButton Card',
  );
  put('org.junit', 'Test Rule Before After');
  put('org.junit.runner', 'RunWith');
  put('org.robolectric', 'RobolectricTestRunner');
  put('org.robolectric.annotation', 'Config');
  put('org.junit.Assert', 'assertEquals assertTrue assertFalse assertNull assertNotNull assertNotEquals');
  put('androidx.compose.ui.test.junit4', 'createComposeRule');
  put(
    'androidx.compose.ui.test',
    'onNodeWithText onNodeWithTag assertIsDisplayed performClick assertWidthIsEqualTo assertHeightIsEqualTo assertHasClickAction assertTextEquals assertExists assertIsEnabled assertIsNotEnabled assertDoesNotExist assertIsNotDisplayed performTextInput onAllNodesWithText onAllNodesWithTag assertCountEquals assertIsOn assertIsOff',
  );
  put('androidx.compose.ui.text', 'TextStyle');
  put('androidx.compose.ui.text.font', 'FontWeight');
  put('androidx.compose.ui.text.style', 'TextAlign');
  put('androidx.compose.foundation.shape', 'RoundedCornerShape CircleShape');
  put('androidx.compose.foundation.layout', 'Arrangement');
  put('androidx.compose.runtime.saveable', 'rememberSaveable');
  put('androidx.compose.material3', 'OutlinedTextField TextField Checkbox Switch Badge HorizontalDivider');
  put('androidx.compose.foundation.layout', 'defaultMinSize requiredWidth');
  return imports;
})();
// the imports a Kotlin file is missing for these names, added after its last import (or its package line)
export function addKotlinImports(body, names) {
  const lines = String(body || '').split('\n');
  const have = new Set(
    lines
      .filter((l) => /^\s*import\s/.test(l))
      .map((l) =>
        l
          .trim()
          .replace(/^import\s+/, '')
          .replace(/\s+as\s+\w+$/, ''),
      ),
  );
  const code = lines.filter((l) => !/^\s*(import|package)\s/.test(l)).join('\n');
  const add = [];
  for (const n of names) {
    const fq = KOTLIN_IMPORTS[n];
    if (!fq || have.has(fq) || have.has(fq.replace(/\.\w+$/, '.*'))) continue;
    if (
      new RegExp(n === 'dp' || n === 'sp' ? '\\.\\s*' + n + '\\b' : '(^|[^.\\w])@?(?:get:)?' + n + '\\b').test(code) ||
      (/^(padding|fillMax\w+|width|height|size|\w+In|testTag|clickable|background|assert\w+|perform\w+|onNode\w+|onAllNodes\w+|defaultMinSize|requiredWidth)$/.test(
        n,
      ) &&
        new RegExp('\\.' + n + '\\(').test(code))
    )
      add.push('import ' + fq);
  }
  if (!add.length) return String(body || '');
  let at = -1;
  lines.forEach((l, i) => {
    if (/^\s*import\s/.test(l)) at = i;
  });
  if (at < 0) at = lines.findIndex((l) => /^\s*package\s/.test(l));
  lines.splice(at + 1, 0, ...(at >= 0 && !/^\s*import\s/.test(lines[at]) ? ['', ...add] : add));
  return lines.join('\n');
}
// AN IMPORT THE CHANGE TOOK AWAY WHILE THE FILE STILL USES WHAT IT BROUGHT IN IS PUT BACK. Found for real, in Kotlin and in Dart: asked to
// change one function, the agent rewrote the top of the file and lost its imports, and the project no longer built.
export async function restoreImports(dir, paths) {
  const IMPORT = /^\s*(?:import\s.+|from\s+[\w.]+\s+import\s.+)$/;
  const back = [];
  for (const file of (paths || []).slice(0, 12)) {
    const old = await git(dir, ['show', 'HEAD:' + file]);
    if (!old.ok) continue;
    const now = await text(path.join(dir, file)).catch(() => '');
    if (!now) continue;
    const have = new Set(
      now
        .split('\n')
        .filter((l) => IMPORT.test(l))
        .map((l) => l.trim()),
    );
    const lost = old.out
      .split('\n')
      .filter((l) => IMPORT.test(l) && !have.has(l.trim()))
      .map((l) => l.trim());
    const code = now
      .split('\n')
      .filter((l) => !IMPORT.test(l))
      .join('\n');
    const used = (line) => {
      const names = /\{([^}]+)\}/.exec(line)
        ? /\{([^}]+)\}/
            .exec(line)[1]
            .split(',')
            .map((x) =>
              x
                .trim()
                .split(/\s+as\s+/)
                .pop(),
            )
        : /^from\s+[\w.]+\s+import\s+(.+)$/.test(line)
          ? /^from\s+[\w.]+\s+import\s+(.+)$/
              .exec(line)[1]
              .split(',')
              .map((x) =>
                x
                  .trim()
                  .split(/\s+as\s+/)
                  .pop(),
              )
          : /^import\s+['"]/.test(line)
            ? null
            : [
                (/\bas\s+(\w+)\s*;?$/.exec(line) ||
                  /([\w]+)\s*;?$/.exec(line.replace(/\s+from\s+['"].*$/, '')) ||
                  [])[1],
              ];
      return names === null
        ? /\.dart['"]/.test(line)
        : names
            .filter(Boolean)
            .some(
              (n) =>
                (n !== '*' && new RegExp('(^|[^.\\w])@?' + n.replace(/[^\w]/g, '') + '\\b').test(code)) ||
                new RegExp('\\.' + n.replace(/[^\w]/g, '') + '\\(').test(code),
            );
    };
    const imported = [...have].join('\n');
    const already = (n) => {
      const w = String(n || '').replace(/[^\w]/g, '');
      return !!w && new RegExp('(^|[^.\\w])' + w + '\\b|\\.' + w + '\\s*;?\\s*$', 'm').test(imported);
    };
    const narrow = (line) => {
      const b = /\{([^}]+)\}/.exec(line);
      const names = (list) =>
        list
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .filter((x) => !already(x.split(/\s+as\s+/).pop()));
      if (b) {
        const keep = names(b[1]);
        return keep.length ? line.replace(b[0], '{ ' + keep.join(', ') + ' }') : '';
      }
      const py = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(line);
      if (py) {
        const keep = names(py[2]);
        return keep.length ? 'from ' + py[1] + ' import ' + keep.join(', ') : '';
      }
      if (/^import\s+['"]/.test(line)) return line;
      const one = (/\bas\s+(\w+)\s*;?$/.exec(line) ||
        /([\w]+)\s*;?$/.exec(line.replace(/\s+from\s+['"].*$/, '')) ||
        [])[1];
      return one && already(one) ? '' : line;
    };
    const put = lost.filter(used).map(narrow).filter(Boolean);
    if (!put.length) continue;
    const ls = now.split('\n');
    let at = -1;
    ls.forEach((l, i) => {
      if (IMPORT.test(l)) at = i;
    });
    if (at < 0) at = ls.findIndex((l) => /^\s*package\s/.test(l));
    ls.splice(at + 1, 0, ...(at >= 0 && !IMPORT.test(ls[at]) ? ['', ...put] : at < 0 ? [...put, ''] : put));
    await writeFile(path.join(dir, file), ls.join('\n'));
    back.push(...put.map((l) => file + ': ' + l));
  }
  return back;
}
const TOOL_OUTPUT = {
  flutter: ['.dart_tool/', 'build/', 'pubspec.lock', '.flutter-plugins', '.flutter-plugins-dependencies'],
  android: ['build/', '.gradle/', 'local.properties'],
  python: ['__pycache__/', '.pytest_cache/'],
  swift: ['.build/'],
  node: [],
  jest: [],
  vitest: [],
};
// what a project's own tools write as they run is not part of a change: named in the copy's own exclude list, which no commit carries
export async function excludeToolOutput(dir, kind) {
  const want = TOOL_OUTPUT[kind] || [];
  const info = path.join(dir, '.git', 'info');
  if (
    !want.length ||
    !(await stat(path.join(dir, '.git')).then(
      (s) => s.isDirectory(),
      () => false,
    ))
  )
    return 0;
  const file = path.join(info, 'exclude');
  const was = await text(file);
  const have = new Set(was.split('\n').map((l) => l.trim()));
  const add = want.filter((w) => !have.has(w));
  if (!add.length) return 0;
  await mkdir(info, { recursive: true });
  await writeFile(
    file,
    was.replace(/\s*$/, '\n') +
      "# written by what the project's own tools leave behind (Family Office): never part of a change\n" +
      add.join('\n') +
      '\n',
  );
  return add.length;
}
// a TypeScript file, checked as Node will run it: types stripped by Node's own stripper, then its syntax check on what is left
const TS_CHECK =
  "const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process'),strip=require('node:module').stripTypeScriptTypes;if(typeof strip!=='function')process.exit(0);let js;try{js=strip(fs.readFileSync(process.argv[1],'utf8'))}catch(e){console.error(process.argv[1]+': error: '+e.message);process.exit(1)}const t=path.join(os.tmpdir(),'fo-ts-'+process.pid+'.mjs');fs.writeFileSync(t,js);const r=spawnSync(process.execPath,['--check',t],{encoding:'utf8'});fs.rmSync(t,{force:true});if(r.status!==0){console.error(String(r.stderr).split(t).join(process.argv[1]));process.exit(1)}";
export async function importsBelowPackage(dir, files) {
  let count = 0;
  for (const f of (files || []).filter((x) => /\.(kt|kts|java)$/.test(x))) {
    const at = path.join(dir, f);
    const body = await text(at);
    if (!body) continue;
    const ls = body.split('\n');
    const pk = ls.findIndex((l) => /^\s*package\s+[\w.]+/.test(l));
    if (pk <= 0) continue;
    const early = ls
      .slice(0, pk)
      .map((l, i) => (/^\s*import\s+[\w.*]+/.test(l) ? i : -1))
      .filter((i) => i >= 0);
    if (!early.length) continue;
    const head = ls.slice(0, pk).filter((l, i) => !early.includes(i));
    const after = ls.slice(pk + 1);
    const first = Math.max(
      0,
      after.findIndex((l) => l.trim()),
    );
    const rest = after.slice(first);
    await writeFile(
      at,
      [
        ...(head.join('').trim() ? head : []),
        ls[pk],
        '',
        ...early.map((i) => ls[i].trim()),
        ...(/^\s*import\s/.test(rest[0] || '') ? [] : ['']),
        ...rest,
      ].join('\n'),
    );
    count++;
  }
  return count;
}
export async function ownTests(dir, { at = '', changed = [], buildOnly = false } = {}) {
  const recipe = await recipeFor(dir).catch(() => null);
  if (!recipe || recipe.blocked) return null;
  if (!at) await excludeToolOutput(dir, recipe.kind).catch(() => 0);
  // DOES WHAT WAS CHANGED BUILD? A project's tests only say so for the files they touch. Each changed file is checked by its language's own
  // tool first; a file that does not build is the answer, and no test needs running to know it.
  if (!at && changed.length) {
    const of = (re) => changed.filter((f) => re.test(f));
    const py = of(/\.py$/);
    const js = of(/\.(mjs|cjs|js|ts|mts)$/);
    const dart = of(/\.dart$/);
    let baseline = null;
    let tool = '';
    if (recipe.kind === 'python' && py.length) {
      tool = 'python -m py_compile';
      baseline = await run(recipe.run[0], ['-m', 'py_compile', ...py], {
        cwd: dir,
        timeout: 60000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      });
    } else if ((recipe.kind === 'node' || recipe.kind === 'jest' || recipe.kind === 'vitest') && js.length) {
      tool = 'node --check';
      for (const f of js) {
        baseline = /\.m?ts$/.test(f)
          ? await run(process.execPath, ['--no-warnings', '-e', TS_CHECK, f], { cwd: dir, timeout: 30000 })
          : await run(process.execPath, ['--check', f], { cwd: dir, timeout: 30000 });
        if (baseline.code !== 0) break;
      }
    } else if (recipe.kind === 'flutter' && dart.length) {
      tool = path.basename(recipe.run[0]) + ' analyze';
      if (!(await exists(path.join(dir, '.dart_tool', 'package_config.json'))))
        await run(recipe.run[0], ['pub', 'get'], { cwd: dir, timeout: 4 * 60000 }); // the project's packages, fetched once: without them every name from a package is "undefined"
      baseline = await run(recipe.run[0], ['analyze', '--no-pub', '--no-fatal-infos', '--no-fatal-warnings', ...dart], {
        cwd: dir,
        timeout: 3 * 60000,
      });
    }
    if (buildOnly && !(baseline && baseline.code !== 0))
      return { ok: true, none: true, failed: [], builds: true, command: tool, said: '' }; // asked only whether it builds
    if (baseline && baseline.code !== 0)
      return {
        ok: false,
        none: false,
        failed: [],
        builds: false,
        command: tool,
        said:
          baseline.tail
            .filter((l) => /error|Error|line \d+|\^/.test(l) && l.length < 320)
            .slice(0, 8)
            .map((l) => l.trim())
            .join('\n')
            .slice(0, 900) || baseline.tail.slice(-4).join('\n').slice(0, 600),
      };
  }
  const cmd =
    recipe.kind === 'python'
      ? recipe.name === 'pytest'
        ? [recipe.run[0], '-m', 'pytest', '-q', '-p', 'no:cacheprovider']
        : [recipe.run[0], '-m', 'unittest', 'discover', '-s', '.', '-p', 'test*.py']
      : recipe.kind === 'node'
        ? [process.execPath, '--test', '--test-reporter=tap']
        : recipe.kind === 'flutter'
          ? [recipe.run[0], 'test', '--reporter', 'expanded', '--timeout', '90s']
          : recipe.kind === 'android'
            ? [recipe.run[0], recipe.run[1], '--console=plain', '-q']
            : recipe.kind === 'swift'
              ? [recipe.run[0], 'test']
              : null;
  if (!cmd) return null;
  let where = dir;
  let tmp = '';
  if (at) {
    tmp = path.join(os.tmpdir(), 'fo-base-' + randomBytes(5).toString('hex'));
    const a = await git(dir, ['worktree', 'add', '--detach', tmp, at]);
    if (!a.ok) return null;
    where = tmp;
  }
  try {
    const lines = [];
    const got = await run(cmd[0], cmd.slice(1), {
      cwd: where,
      timeout: (recipe.kind === 'android' || recipe.kind === 'swift' ? 20 : 4) * 60000,
      env: { ...process.env, ...recipe.env, CI: '1', PYTHONDONTWRITEBYTECODE: '1' },
      onLine: (l) => {
        if (lines.length < 6000) lines.push(l);
      },
    });
    const out = lines.join('\n');
    const failed = [
      ...new Set(
        [
          ...out.matchAll(/^(?:FAIL|ERROR): (\w+)/gm),
          ...out.matchAll(/^\s*not ok \d+ - (.+?)\s*$/gm),
          ...out.matchAll(/^FAILED (\S+)/gm),
          ...out.matchAll(/^\S+ > (\S+) FAILED\s*$/gm),
          ...out.matchAll(/error: -\[\S+ (\w+)\]/g),
          ...out.matchAll(/^\d+:\d+ \+\d+(?: ~\d+)? -\d+: (.+?) \[E\]\s*$/gm),
        ].map((m) => m[1]),
      ),
    ]
      .filter((n) => !/[\\/]|\.(mjs|cjs|js|ts|dart)$/.test(n))
      .slice(0, 8);
    const none =
      /Ran 0 tests|NO TESTS RAN|no tests ran|^# tests 0\s*$|No tests were found/m.test(out) ||
      (recipe.kind === 'node' && !/^\s*(not )?ok \d+/m.test(out));
    const said = lines
      .filter(
        (l) =>
          /^e: |: error: |^\s*error: |Unresolved reference|Compilation failed|AssertionError|Error:|is not defined|is not a function|Cannot find|does not provide an export|\bassert|Expected|expected:|actual:|!==?/.test(
            l,
          ) && l.length < 320,
      )
      .slice(0, 8)
      .map((l) => l.trim())
      .join('\n');
    return {
      ok: got.code === 0,
      none,
      failed,
      said: said.slice(0, 900),
      command: cmd.map((a) => (a === process.execPath ? 'node' : path.basename(a))).join(' '),
    };
  } finally {
    if (tmp) {
      await git(dir, ['worktree', 'remove', '--force', tmp]).catch(() => {});
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      await git(dir, ['worktree', 'prune']).catch(() => {});
    }
  }
}

// ---------- 1 the recipe ----------
// { kind, name, dest, file, run: [argv], parse: 'tap' | 'junit' | 'unittest' | 'jest' | 'exit', results, frames, copy: [files copied into the
//   copies], link: [folders lent to the copies], scratch, guide, how: what to tell the writer about this kind of project, env, minutes } or { blocked }
export async function recipeFor(dir) {
  const own = path.join(dir, '.familyoffice', 'proof.json');
  if (await exists(own)) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(own, 'utf8'));
    } catch {
      return { blocked: "This repository's .familyoffice/proof.json is not valid JSON." };
    }
    const runv = Array.isArray(pkg.run) ? pkg.run.map(String).filter(Boolean).slice(0, 24) : [];
    const dest = rel(pkg.dest);
    const file = rel(pkg.file);
    if (!runv.length || !dest || !file || file.includes('/'))
      return {
        blocked:
          'This repository\'s .familyoffice/proof.json needs "run" (the command, as a list), "dest" (the folder a proof file goes in) and "file" (a name for it).',
      };
    return {
      kind: 'recipe',
      name: String(pkg.name || "This repository's own recipe").slice(0, 80),
      dest,
      file,
      run: runv,
      parse: ['tap', 'junit', 'exit'].includes(pkg.parse) ? pkg.parse : 'junit',
      results: rel(pkg.results),
      frames: rel(pkg.frames),
      copy: (Array.isArray(pkg.copy) ? pkg.copy : []).map(rel).filter(Boolean).slice(0, 8),
      guide: rel(pkg.guide),
      env:
        pkg.env && typeof pkg.env === 'object'
          ? Object.fromEntries(
              Object.entries(pkg.env)
                .slice(0, 12)
                .map(([k, v]) => [String(k), String(v)]),
            )
          : {},
      minutes: Math.min(60, Math.max(1, Number(pkg.minutes) || 15)),
    };
  }
  // by the kind of project it is: a Python project that also keeps a package.json for its tools is still a Python project
  const pyFirst = !!(await first(dir, ['pyproject.toml', 'setup.py', 'manage.py']));
  return (
    (await androidRecipe(dir)) ||
    (await swiftRecipe(dir)) ||
    (await dartRecipe(dir)) ||
    (pyFirst ? await pythonRecipe(dir) : null) ||
    (await nodeRecipe(dir)) ||
    (await pythonRecipe(dir)) || {
      blocked:
        'This repository has no proof recipe: it is not a project this app knows how to test (Android with Gradle, a Swift package, Flutter or Dart, Python, or JavaScript with a package.json), and it has no .familyoffice/proof.json. Add a .familyoffice/proof.json that names the command that runs a proof here.',
    }
  );
}

// what the agent is asked for: one proof file, written to the rules that make a red/green run mean something
export const proofAsk = (r, task, changed, guide) =>
  'You are working in a clone of a repository, in the current folder. The team has just made this change, and it is waiting, uncommitted:\n\n' +
  task +
  '\n\nFiles it changed: ' +
  changed.join(', ') +
  '\n\n' +
  (r.kind === 'flutter' || r.kind === 'android' || r.kind === 'swift'
    ? ''
    : 'Load or import the code under test inside each test, never at the top of the file, so that a test of something new fails on the old code while the other tests still run there. ') +
  'What was asked for does not work today: it is missing, or it is a bug. Your file is its acceptance test.\n\n' +
  'Write ONE proof test file at ' +
  r.dest +
  '/' +
  r.file +
  ', and change no other file. It will be run twice with the command "' +
  r.run.map((a) => (a === process.execPath ? 'node' : a)).join(' ') +
  '": on the code BEFORE the change, where it must fail, and on the code AFTER it, where it must pass.\n\nThe rules:\n' +
  (r.kind === 'flutter' || r.kind === 'android' || r.kind === 'swift'
    ? '1. A test of something the change ADDS may import it and call it directly. On the old code the file then does not build, and that is counted as failing there, which is what is wanted. Write plain tests: never start another test run, a process or a build from inside a test.\n'
    : '1. It must run on the old code too. Never call or import anything the change adds: drive the new behaviour through what the old code already accepts (a file, a setting, an input) so the old code fails an assertion instead of failing to start.\n') +
  '2. One test for each thing the change was asked to do, named in plain words for what it proves. Add one test for something that must NOT have changed; it passes on both sides and is reported as a guard.\n' +
  '3. Assert first. If you capture a picture, capture it after the assertion, and when the change is about where something sits, assert its position.\n' +
  '4. One state per test: each language, account or variant gets its own test.\n' +
  (guide
    ? '5. Read ' + guide + ' in this repository first: it says how proofs are written here, and which helpers exist.\n'
    : '') +
  (r.how ? '\nFor this project: ' + r.how + '\n' : '') +
  (r.kind === 'python'
    ? "Put every import of the project's code INSIDE the test that uses it, never at the top of the file. Like this:\n    def test_double_gives_twice_the_number(self):\n        from shapes import double\n        self.assertEqual(double(4), 8)\nThen a test of something new fails on the old code by itself, and a test that something old still works runs there and passes.\n"
    : '') +
  '\nWhen the file is written, say in one sentence what it proves.';

// ---------- 3 and 4: run it on both sides, and read the result ----------
const TAP = /^\s*(not ok|ok)\s+\d+\s+-\s+(.+?)\s*(#.*)?$/;
function readTap(out) {
  const rows = new Map();
  const why = new Map();
  const ls = String(out).split('\n');
  // what a failing test said: the lines under it, down to the next test (its error, and what was expected and what came)
  ls.forEach((line, i) => {
    const m = TAP.exec(line);
    if (!m || m[1] !== 'not ok') return;
    const name = m[2].trim();
    let err = '';
    let exp = '';
    let act = '';
    for (let j = i + 1; j < ls.length && !TAP.test(ls[j]) && j < i + 60; j++) {
      const l = ls[j].trim();
      const e = /^error:\s*(.*)$/.exec(l);
      if (e) {
        err = e[1].replace(/^\|-?$/, '').replace(/^['"]|['"]$/g, '');
        for (let k = j + 1; !err && k < j + 6 && k < ls.length; k++) if (ls[k].trim()) err = ls[k].trim();
        for (let k = j + 1; k < j + 8 && k < ls.length; k++)
          if (/!==?|deepEqual|to be/.test(ls[k]) && ls[k].trim() !== err) {
            err += ' ' + ls[k].trim();
            break;
          }
      }
      if (/^expected:\s/.test(l)) exp = l.replace(/^expected:\s*/, '');
      if (/^actual:\s/.test(l)) act = l.replace(/^actual:\s*/, '');
    }
    if (err || exp)
      why.set(name, ((err || 'It failed') + (exp ? ' (expected ' + exp + ', got ' + act + ')' : '')).slice(0, 260));
  });
  for (const line of String(out).split('\n')) {
    const m = TAP.exec(line);
    if (!m) continue;
    const name = m[2].trim();
    if (/[\\/]|\.(test|spec)\.|\.m?js$/.test(name)) continue;
    if (/#\s*(skip|todo)/i.test(m[3] || '')) continue;
    rows.set(name, m[1] === 'ok');
  } // a file's own line is not a test
  return { rows, why };
}
async function walk(dir, keep, out = [], depth = 0) {
  if (depth > 6) return out;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, keep, out, depth + 1);
    else if (keep.test(e.name)) out.push(f);
  }
  return out;
}
async function readJunit(dir) {
  const rows = new Map();
  const why = new Map();
  for (const f of await walk(dir, /\.xml$/i)) {
    const xml = await readFile(f, 'utf8').catch(() => '');
    for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const name = (/\bname="([^"]*)"/.exec(m[1]) || [])[1];
      if (!name) continue;
      const body = m[3] || '';
      if (/<skipped\b/.test(body)) continue;
      const bad = /<(failure|error)\b[^>]*?(?:message="([^"]*)")?/.exec(body);
      const nice = plain(name);
      rows.set(nice, !bad);
      if (bad)
        why.set(
          nice,
          (bad[2] || 'it failed')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .slice(0, 200),
        );
    }
  }
  return { rows, why };
}
// unittest -v: "test_name (module.Class.test_name) ... ok"
export function readUnittest(out) {
  const rows = new Map();
  const why = new Map();
  const names = new Map();
  const frames = new Map(); // names: the test as it is written in the file; frames: the last line of code the error came from
  // A test is reported on one line, or, when it has a docstring, on two: its name, then the docstring's first line and the result.
  // The file itself, when it could not be loaded, is reported as a test of its own (_FailedTest): that is not one of its tests.
  let held = '';
  for (const raw of String(out).split('\n')) {
    const line = raw.trim();
    if (/_FailedTest/.test(line)) {
      held = '';
      continue;
    }
    const name = /^(test\w*) \([^)]*\)$/.exec(line);
    if (name) {
      held = name[1];
      continue;
    }
    const one = /^(test\w*) \([^)]*\)(?: \.\.\.)? ?\.\.\. (ok|FAIL|ERROR)\b/.exec(line);
    const two = held ? /\.\.\. (ok|FAIL|ERROR)\b/.exec(line) : null;
    const m = one || (two ? [null, held, two[1]] : null);
    held = '';
    if (m) {
      rows.set(plain(m[1]), m[2] === 'ok');
      names.set(plain(m[1]), m[1]);
      if (m[2] !== 'ok')
        why.set(plain(m[1]), m[2] === 'ERROR' ? 'It stopped with an error instead of passing.' : 'It failed.');
    }
  }
  // what each failing test said: the error's own line, and the line of the test it was raised on
  for (const part of String(out)
    .split(/^={20,}$/m)
    .slice(1)) {
    const head = /^(FAIL|ERROR): (test\w*)/m.exec(part);
    if (!head || /_FailedTest/.test(part)) continue;
    const ls = part
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const said = [...ls].reverse().find((l) => /^\w*(Error|Exception)\b/.test(l)) || '';
    const at = ls.find((l) => /^self\.assert|^assert /.test(l)) || '';
    const frame = [...ls].reverse().find((l) => /^File "/.test(l)) || '';
    frames.set(plain(head[2]), frame);
    if (said) why.set(plain(head[2]), (said + (at ? ', at: ' + at : '')).slice(0, 260));
  }
  return { rows, why, names, frames };
}
// Jest's own JSON report
export function readJest(json) {
  const rows = new Map();
  const why = new Map();
  let j = null;
  try {
    j = JSON.parse(json);
  } catch {
    return { rows, why };
  }
  for (const f of j.testResults || [])
    for (const a of f.assertionResults || []) {
      if (a.status !== 'passed' && a.status !== 'failed') continue;
      const name = String(a.title || a.fullName || '').slice(0, 200);
      if (!name) continue;
      rows.set(name, a.status === 'passed');
      if (a.status === 'failed')
        why.set(
          name,
          String((a.failureMessages || [])[0] || 'it failed')
            .split('\n')[0]
            .slice(0, 200),
        );
    }
  return { rows, why };
}
async function side(r, tree) {
  if (r.results)
    await mkdir(path.join(tree, /\.\w+$/.test(r.results) ? path.dirname(r.results) : r.results), {
      recursive: true,
    }).catch(() => {}); // where the runner is told to put its report
  const startedAt = Date.now();
  const lines = [];
  const got = await run(r.run[0], r.run.slice(1), {
    cwd: tree,
    timeout: r.minutes * 60000,
    env: { ...process.env, ...r.env, CI: '1' },
    onLine: (l) => {
      if (lines.length < 20000) lines.push(l);
    },
  });
  let rows = new Map();
  let why = new Map();
  let names = new Map();
  let frames = new Map();
  if (r.parse === 'tap') ({ rows, why } = readTap(lines.join('\n')));
  else if (r.parse === 'junit') ({ rows, why } = await readJunit(path.join(tree, r.results || '.')));
  else if (r.parse === 'unittest') ({ rows, why, names, frames } = readUnittest(lines.join('\n')));
  else if (r.parse === 'jest') ({ rows, why } = readJest(await text(path.join(tree, r.results))));
  else if (r.parse === 'dartjson') ({ rows, why } = readDartJson(lines.join('\n')));
  else rows.set('The command finished without an error', got.code === 0);
  const dartSaid = [];
  if (r.parse === 'dartjson')
    for (const l of lines) {
      if (l[0] !== '{' || dartSaid.length >= 5) continue;
      let ev;
      try {
        ev = JSON.parse(l);
      } catch {
        continue;
      }
      if (ev.type === 'error' && ev.error)
        for (const e of String(ev.error).split('\n'))
          if (/\.dart:\d+:\d+: Error: /.test(e) && dartSaid.length < 5)
            dartSaid.push(e.trim().replace(/^.*\/(?=[\w.-]+\.dart:\d)/, ''));
    }
  return {
    rows,
    why,
    names,
    frames,
    code: got.code,
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
    errors: lines.filter((l) => /^e: .*\.kt:\d+:\d+/.test(l)).slice(0, 60),
    tail: (
      dartSaid.join(' / ') ||
      lines
        .filter((l) =>
          /^#\s+\w*(Error|Exception): |^e: |: error: |Unresolved reference|Compilation failed|^\s*Error: .{8,}|error •|Cannot find module|ERR_MODULE_NOT_FOUND|does not provide an export named|^\s*SyntaxError|^\s*ReferenceError/.test(
            l,
          ),
        )
        .slice(0, 3)
        .map((l) => l.trim().replace(/file:\/\/\S*\/(?=[\w.-]+:\d)/, ''))
        .join(' / ') ||
      got.tail
        .slice()
        .reverse()
        .find((l) => /\b\w*(Error|Exception)\b[: ]|^FAILED|error:/i.test(l) && !/^\s*File "/.test(l)) ||
      got.tail
        .filter((l) => l.trim() && !/^\s*(File "|~|\^)/.test(l))
        .slice(-2)
        .join(' / ')
    )
      .trim()
      .slice(0, 300),
  }; // the reason, which is at the end of what a failed run prints, never the top of its traceback
}
// the team's own words about its proof, for the sheet: plain, and ended at the end of a sentence
const saidOf = (t) => {
  const x = String(t || '')
    .replace(/\*\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (x.length <= 260) return x;
  const cut = x.slice(0, 260);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(': '));
  return (end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
};
const VERDICT = {
  proven: 'Proven',
  guard: 'Guard',
  base: 'About the base',
  broken: 'Broken by the change',
  norun: 'Not proven',
};
export function verdicts(red, green) {
  const names = [...new Set([...green.rows.keys(), ...red.rows.keys()])];
  return names.map((test) => {
    const b = red.rows.get(test);
    const c = green.rows.get(test);
    const v =
      c === undefined
        ? 'norun'
        : b === undefined
          ? 'norun'
          : !b && c
            ? 'proven'
            : b && c
              ? 'guard'
              : !b && !c
                ? 'base'
                : 'broken';
    return {
      test,
      base: b === undefined ? 'none' : b ? 'green' : 'red',
      change: c === undefined ? 'none' : c ? 'green' : 'red',
      verdict: v,
      label: VERDICT[v],
      why:
        v === 'norun'
          ? b === undefined
            ? 'The base run did not report this test. It usually means the proof does not start on the old code, so it proves nothing.'
            : 'The run on the change did not report this test.'
          : v === 'base'
            ? green.why.get(test) || 'It fails before and after the change: a finding about the code as it was.'
            : v === 'broken'
              ? green.why.get(test) || 'It passed before the change and fails after it.'
              : v === 'proven' && /could not start/.test(red.why.get(test) || '')
                ? red.why.get(test)
                : '',
    };
  });
}

// ---------- 5 the proof image ----------
const medium = (task) =>
  /animat|flash|flicker|timing|transition|fade|appear|disappear|scroll|delay|slow|video|swipe/i.test(task)
    ? 'A picture proves a fixed state. This change is about something that happens over time, so it also wants a video from a device, which this team cannot record yet.'
    : 'A picture, because what changed is a fixed state: it does not live in time.';
// THE HEADING IS THE REQUEST, NOT THE BRIEF. A request made about a ticket carries the ticket's whole text behind it, and as a heading that
// was eight lines of bold with its marks showing. The first line, or the part before the ticket's text, is the heading; the rest is read under it.
const plainText = (s) =>
  String(s || '')
    .replace(/\*\*|__|\x60/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/[ \t]+/g, ' ')
    .trim();
export function headOf(task) {
  const t = plainText(task);
  const cut = t.search(
    /\s+(?:It is about the ticket |What the customer said when asked: |What the team found in the code: )|\n/,
  );
  const first = (cut > 0 ? t.slice(0, cut) : t).trim();
  const sentence = /^(.{12,150}?[.!?])(\s|$)/.exec(first);
  const head =
    first.length <= 150 ? first : sentence ? sentence[1] : first.slice(0, 147).replace(/\s+\S*$/, '') + '...';
  const rest = t
    .slice(head.endsWith('...') ? head.length - 3 : head.length)
    .trim()
    .replace(/^What the customer said when asked:\s*/, 'Said when asked: ')
    .replace(/\s*\bWhat the team found in the code:\s*/, (m, at) => (at ? '\n' : '') + 'Found in the code: ')
    .replace(/\s*\bIt is about the ticket\s+/, (m, at) => (at ? '\n' : '') + 'The ticket: ')
    .replace(/(?<=[.:!?]|must do)\s+-\s+(?=\S)/g, '\n- ');
  return { head, rest: rest.length > 900 ? rest.slice(0, 897).replace(/\s+\S*$/, '') + '...' : rest };
}
function sheet({ task, repo, rows, ok, steps, setup, frames, seconds, recipe, said, at, checked = false }) {
  const title = headOf(task);
  const countOf = (v) => rows.filter((x) => x.verdict === v).length;
  const mark = (s) =>
    '<span class="m ' + s + '">' + (s === 'green' ? 'passes' : s === 'red' ? 'fails' : 'no result') + '</span>';
  const pics = (list, label) =>
    list
      .map(
        (f) =>
          '<figure><img src="' +
          esc(f.data) +
          '" alt=""><figcaption><b>' +
          label +
          '</b> ' +
          esc(f.name) +
          '</figcaption></figure>',
      )
      .join('');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Proof</title><style>*{box-sizing:border-box;margin:0;padding:0}body{width:1200px;background:#fff;color:#1b1f24;font:17px/1.45 -apple-system,"Helvetica Neue",Arial,sans-serif;padding:44px 52px 48px}' +
    'header{border-bottom:3px solid #0f766e;padding-bottom:18px;margin-bottom:22px}h1{font-size:32px;line-height:1.2}.brief{margin-top:10px;font-size:16px;color:#3b434c;white-space:pre-line}h2{font-size:20px;margin:26px 0 10px}.sub{color:#57606a;margin-top:6px}' +
    '.v{display:inline-block;margin-bottom:10px;padding:4px 12px;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:.04em}.v.ok{background:#dcfce7;color:#166534}.v.no{background:#f1f5f9;color:#334155}' +
    'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #d8dee4;vertical-align:top}th{font-size:13px;color:#57606a;font-weight:600}' +
    '.m{font-weight:600}.m.green{color:#166534}.m.red{color:#57606a}.m.none{color:#9a6700}.k{display:inline-block;padding:1px 9px;border-radius:999px;font-size:13px;font-weight:700}.k.proven{background:#dcfce7;color:#166534}.k.guard{background:#e0f2fe;color:#075985}.k.base,.k.norun{background:#fef9c3;color:#854d0e}.k.broken{background:#fee2e2;color:#991b1b}' +
    '.why{display:block;color:#57606a;font-size:14px;margin-top:2px}.frames{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{border:1px solid #d8dee4;border-radius:10px;overflow:hidden}figure img{display:block;width:100%}figcaption{padding:8px 10px;font-size:14px;color:#57606a}' +
    'ol{margin-left:22px}li{margin:6px 0}.box{background:#f6f8fa;border:1px solid #d8dee4;border-radius:10px;padding:14px 18px}.foot{margin-top:26px;color:#57606a;font-size:14px}</style></head><body>' +
    '<header><span class="v ' +
    (ok ? 'ok' : 'no') +
    '">' +
    (ok ? (checked ? 'CHECKED, NOT PROVEN' : 'PROVEN') : 'NOT PROVEN YET') +
    '</span><h1>' +
    esc(title.head) +
    '</h1>' +
    (title.rest ? '<p class="brief">' + esc(title.rest) + '</p>' : '') +
    '<p class="sub">' +
    esc(repo) +
    ' · ' +
    new Date(at).toISOString().slice(0, 16).replace('T', ' ') +
    ' UTC' +
    ' · ' +
    countOf('proven') +
    ' proven, ' +
    countOf('guard') +
    (countOf('guard') === 1 ? ' guard' : ' guards') +
    (countOf('base') ? ', ' + countOf('base') + ' about the base' : '') +
    (countOf('broken') ? ', ' + countOf('broken') + ' broken' : '') +
    (countOf('norun') ? ', ' + countOf('norun') + ' without a result' : '') +
    '</p></header>' +
    (said ? '<p class="box">' + esc(said) + '</p>' : '') +
    '<h2>Part 1 · Proof it works</h2><table><tr><th>What was checked</th><th>Before the change</th><th>After the change</th><th>Verdict</th></tr>' +
    rows
      .map(
        (x) =>
          '<tr><td>' +
          esc(x.test) +
          (x.why ? '<span class="why">' + esc(x.why) + '</span>' : '') +
          '</td><td>' +
          mark(x.base) +
          '</td><td>' +
          mark(x.change) +
          '</td><td><span class="k ' +
          x.verdict +
          '">' +
          x.label +
          '</span></td></tr>',
      )
      .join('') +
    '</table>' +
    (frames.red.length || frames.green.length
      ? '<h2>What the tests captured</h2><div class="frames">' +
        pics(frames.red, 'Before') +
        pics(frames.green, 'After') +
        '</div>'
      : '') +
    (setup ? '<h2>Part 2 · Setup</h2><p class="box">' + esc(setup) + '</p>' : '') +
    '<h2>' +
    (setup ? 'Part 3' : 'Part 2') +
    ' · Steps to check it yourself</h2><ol>' +
    steps.map((s) => '<li>' + esc(s) + '</li>').join('') +
    '</ol>' +
    '<p class="foot">' +
    esc(medium(task)) +
    ' Run with ' +
    esc(recipe) +
    ', in ' +
    seconds +
    ' s, on two throwaway copies of the repository. This sheet and the proof file are not part of the change.' +
    (checked
      ? ' The change and its checks were both written by one local model, so this is a check and not a proof: follow the steps above yourself before you rely on it.'
      : '') +
    '</p></body></html>'
  );
}
async function draw(html, out, dir) {
  const browser = await findBrowser();
  if (!browser)
    return {
      ok: false,
      why: 'No Chrome, Edge, Brave or Chromium was found on this machine to draw the proof image with.',
    };
  const src = path.join(dir, 'proof.html');
  const probe = path.join(dir, 'measure.html');
  const profile = path.join(dir, '.profile');
  const common = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=3000',
  ];
  await writeFile(src, html);
  await writeFile(
    probe,
    html.replace(
      '</body>',
      '<script>addEventListener("load",()=>{document.title="H"+Math.ceil(document.body.getBoundingClientRect().height)})</script></body>',
    ),
  );
  const m = await sh(browser, [...common, '--window-size=1200,600', '--dump-dom', 'file://' + probe], {
    timeout: 40000,
  });
  const high = Math.min(12000, Math.max(600, Number((/<title>H(\d+)<\/title>/.exec(m.out) || [])[1]) || 1600)); // the page's own height, so nothing is cut off and nothing is padded
  await sh(
    browser,
    [...common, '--force-device-scale-factor=2', '--window-size=1200,' + high, '--screenshot=' + out, 'file://' + src],
    { timeout: 60000 },
  );
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(probe, { force: true }).catch(() => {});
  const s = await stat(out).catch(() => null);
  return s && s.size > 200 ? { ok: true } : { ok: false, why: 'The browser did not draw the proof image.' };
}
async function framesOf(tree, r, to) {
  if (!r.frames) return [];
  const out = [];
  await mkdir(to, { recursive: true });
  for (const f of (await walk(path.join(tree, r.frames), /\.(png|jpe?g)$/i)).sort().slice(0, 6)) {
    const buf = await readFile(f).catch(() => null);
    if (!buf || buf.length > 3e6) continue;
    await writeFile(path.join(to, path.basename(f)), buf);
    out.push({
      name: path
        .basename(f)
        .replace(/\.\w+$/, '')
        .replace(/[-_]+/g, ' '),
      data: 'data:image/' + (/\.png$/i.test(f) ? 'png' : 'jpeg') + ';base64,' + buf.toString('base64'),
    });
  }
  return out;
}

// ---------- asking for the proof as text, and weighing a check that fails ----------
const DRAFTS = new Set(['python', 'node', 'flutter', 'android']);
const drafts = (r) => DRAFTS.has(r.kind) && (r.kind !== 'android' || /\.kt$/.test(r.file)); // the kinds whose proof file a local model writes as text, and this app then puts into shape
const DRAFTER = 'You write one test file. You reply with the complete file in a single code block and nothing else.';
const REFEREE =
  'You settle whether a failing check or the code is wrong, going only by what the task says. You are exact with numbers.';
export const codeIn = (t) => {
  const s = String(t || '');
  const m = /\x60\x60\x60[\w+-]*\n([\s\S]*?)\x60\x60\x60/.exec(s);
  if (m) return m[1].replace(/\s+$/, '');
  // A FENCE THAT NEVER CLOSED: the reply ran out of room. Found for real, twice in one pass: the whole reply was thrown away and the
  // team "did not write a proof file". What is kept ends at its last whole test, since the one being written when it stopped is not whole.
  const open = /\x60\x60\x60[\w+-]*\n([\s\S]*)$/.exec(s);
  if (open) {
    const b = open[1];
    const cut = Math.max(
      b.lastIndexOf('\n    def test_'),
      b.lastIndexOf('\ndef test_'),
      b.lastIndexOf('\ntest('),
      b.lastIndexOf('\nit('),
      b.lastIndexOf('\n    @Test'),
      b.lastIndexOf('\n  testWidgets('),
      b.lastIndexOf('\n  test('),
    );
    return (cut > 0 ? b.slice(0, cut) : '').replace(/\s+$/, '');
  }
  return (/^\s*(import |from |const |def |class |package |\/\/|#)/.test(s) ? s : '').replace(/\s+$/, '');
};
// A PYTHON PROOF FOR unittest, PUT INTO SHAPE. Found for real: test functions written at the top of the file, each taking (self), with no
// class round them, which unittest does not run ("Ran 0 tests"); and the same again when asked a second time. So the shape is not
// left to the model: unittest is imported, and tests that stand outside a class are put inside one TestCase, taking self.
export function shapeUnittest(body) {
  let s = String(body || '').replace(/\r\n/g, '\n');
  if (!/^\s*def test_\w+\s*\(/m.test(s)) return s;
  if (/^class \w+\([^)]*TestCase[^)]*\):/m.test(s) && !/^def test_\w+\s*\(/m.test(s))
    return /^import unittest\b|^from unittest\b/m.test(s) ? s : 'import unittest\n\n' + s;
  const lines = s.split('\n');
  const head = [];
  const tests = [];
  const tail = [];
  let at = 'head';
  for (const l of lines) {
    if (/^def test_\w+\s*\(/.test(l)) at = 'tests';
    else if (at === 'tests' && /^(if __name__|class |def (?!test_))/.test(l)) at = 'tail';
    (at === 'head' ? head : at === 'tests' ? tests : tail).push(l);
  }
  const inside = tests
    .map((l) => (/^def (test_\w+)\s*\(\s*\)/.test(l) ? l.replace(/^def (test_\w+)\s*\(\s*\)/, 'def $1(self)') : l))
    .map((l) => (l.trim() ? '    ' + l : l));
  const top = head.join('\n').trim();
  const keep = tail
    .filter((l) => !/^if __name__/.test(l) && !/^\s+unittest\.main\(\)/.test(l))
    .join('\n')
    .trim();
  return (
    (/^import unittest\b/m.test(top) ? top : 'import unittest\n' + (top ? '\n' + top : '')) +
    '\n\n\nclass ProofTest(unittest.TestCase):\n' +
    inside.join('\n').replace(/\s+$/, '') +
    '\n' +
    (keep ? '\n\n' + keep + '\n' : '') +
    '\n\nif __name__ == "__main__":\n    unittest.main()'
  );
}
// A NODE PROOF, PUT INTO SHAPE. Found for real: the proof imports "./basket.mjs", but it sits in .proof and the project is one folder up,
// so the file does not load and nothing runs. Where the proof sits is this app's choice, so the path is put right here, not left to the model.
// ASSERTIONS WITH NO TEST ROUND THEM. Found for real: "// Test 1: ..." followed by bare assert calls, twice running. Each block that
// starts at such a comment and holds an assertion becomes test('...', () => { ... }); with no such comments, everything after the
// imports becomes one test. A block that uses a name an earlier block declared would not stand alone, so then it is one test as well.
function wrapBareAsserts(body) {
  const s = String(body || '');
  if (/^\s*(?:test|it|describe)(?:\.\w+)?\s*\(/m.test(s) || !/^\s*(?:await\s+)?assert\b/m.test(s)) return s;
  const ls = s.split('\n');
  let lastImport = -1;
  ls.forEach((l, i) => {
    if (/^\s*import\s/.test(l)) lastImport = i;
  });
  const head = ls.slice(0, lastImport + 1);
  const rest = ls.slice(lastImport + 1);
  const MARK = /^\s*\/\/\s*(?:test|check|case)\s*\d*\s*[:.)-]\s*(.+?)\s*$/i;
  const chunks = [];
  let cur = { title: '', lines: [] };
  for (const l of rest) {
    const m = MARK.exec(l);
    if (m) {
      if (cur.lines.some((x) => x.trim())) chunks.push(cur);
      cur = { title: m[1], lines: [l] };
    } else cur.lines.push(l);
  }
  if (cur.lines.some((x) => x.trim())) chunks.push(cur);
  const code = (c) => c.lines.filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const decl = (c) =>
    [...code(c).matchAll(/\b(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))/g)]
      .flatMap((m) =>
        m[1]
          ? m[1].split(',').map((x) =>
              x
                .trim()
                .split(/\s*:\s*/)
                .pop(),
            )
          : [m[2]],
      )
      .filter(Boolean);
  const leans = chunks.some((c, i) =>
    chunks.slice(0, i).some((e) => decl(e).some((n) => new RegExp('\\b' + n + '\\b').test(code(c)))),
  );
  const one = (title, lines) =>
    "test('" +
    String(title || 'the change does what the task asks')
      .replace(/\\/g, '')
      .replace(/'/g, "\\'")
      .slice(0, 110) +
    "', " +
    (/\bawait\b/.test(lines.join('\n')) ? 'async ' : '') +
    '() => {\n' +
    lines
      .map((l) => (l.trim() ? '  ' + l : l))
      .join('\n')
      .replace(/\s+$/, '') +
    '\n});';
  const tests =
    leans || !chunks.some((c) => c.title)
      ? [one(chunks.find((c) => c.title) ? '' : '', rest)]
      : chunks.map((c, i) =>
          /\bassert\b/.test(code(c)) ? one(c.title || 'check ' + (i + 1), c.lines) : c.lines.join('\n'),
        );
  return [...head, '', ...tests].join('\n').replace(/\n{4,}/g, '\n\n\n');
}
export function shapeNode(body, dest) {
  const up = '../'.repeat(
    String(dest || '.proof')
      .split('/')
      .filter(Boolean).length,
  );
  return wrapBareAsserts(String(body || '').replace(/\r\n/g, '\n')).replace(
    /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])\.\/(?!\.)/g,
    (m, a, q) => a + q + up,
  );
}
const shaped = (r, body) =>
  dropOld(
    r,
    r.parse === 'unittest'
      ? shapeUnittest(body)
      : r.kind === 'node'
        ? shapeNode(body, r.dest)
        : r.kind === 'flutter'
          ? shapeDart(body, r.pkg, r.known)
          : r.kind === 'android'
            ? shapeKotlinProof(body)
            : body,
  );
// one test of a JavaScript test file, by its title: where it starts and ends
function jsTest(body, title) {
  const source = String(body);
  const q = String(title).replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
  const m = new RegExp('(^|\\n)[ \\t]*(?:testWidgets|test|it)(?:\\.\\w+)?\\(\\s*([\'"\\x60])' + q + '\\2').exec(source);
  if (!m) return null;
  const start = m.index + (m[1] ? 1 : 0);
  let i = source.indexOf('(', start);
  let depth = 0;
  let quote = '';
  for (; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '\x60') {
      quote = ch;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl < 0 ? source.length : nl;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || i >= source.length) return null;
  let end = i + 1;
  if (source[end] === ';') end++;
  if (source[end] === '\n') end++;
  return { start, end, text: source.slice(start, end) };
}
// one test taken out of a JavaScript proof file, with the comment that stands right above it
export function dropJsTest(body, title) {
  const t = jsTest(body, title);
  if (!t) return null;
  const s = String(body);
  let from = t.start;
  for (;;) {
    const prev = s.lastIndexOf('\n', from - 2);
    const line = s.slice(prev + 1, from - 1);
    if (from > 0 && /^\s*\/\//.test(line)) from = prev + 1;
    else break;
  }
  return (s.slice(0, from) + s.slice(t.end)).replace(/\n{4,}/g, '\n\n\n');
}
// the steps to check a JavaScript change by hand, read off the proof that ran (as stepsOf does for Python)
function sayJsAssert(line) {
  const m =
    /^assert\.(\w+)\((.*)\);?$/.exec(line) ||
    (/^assert\((.*)\);?$/.exec(line) ? ['', 'ok', /^assert\((.*)\);?$/.exec(line)[1]] : null);
  if (!m) return null;
  const [a, b] = argsOf(m[2]);
  if (!a) return null;
  if (/^(equal|strictEqual|deepEqual|deepStrictEqual)$/.test(m[1])) {
    if (!b) return null;
    const call = literal(a) && !literal(b) ? b : a;
    const value = call === a ? b : a;
    return call + ' gives ' + value;
  }
  return m[1] === 'ok' ? a + ' is true' : /^(notEqual|notStrictEqual)$/.test(m[1]) && b ? a + ' is not ' + b : null;
}
export function stepsOfJs(body, rows, changed) {
  const out = [];
  const uses = new Set();
  const code = (changed || []).map((c) => c.path || c).filter((f) => f && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const tops = [...String(body).matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]/gm)].map(
    (m) => 'import {' + m[1] + "} from '" + m[2].replace(/^(\.\.\/)+/, './') + "'",
  );
  for (const x of [...rows.filter((v) => v.verdict === 'proven'), ...rows.filter((v) => v.verdict === 'guard')]) {
    const proven = x.verdict === 'proven';
    const byTitle = () =>
      out.push(
        proven
          ? 'Confirm that: ' + x.test + '. Before the change this did not hold.'
          : 'Confirm it is still true that: ' + x.test + '.',
      );
    const t = jsTest(body, x.test);
    const open = t
      ? t.text.indexOf('{', t.text.indexOf('=>') > 0 ? t.text.indexOf('=>') : t.text.indexOf('function'))
      : -1;
    if (!t || open < 0) {
      byTitle();
      continue;
    }
    const ls = t.text
      .slice(open + 1, t.text.lastIndexOf('}'))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^\/\//.test(l));
    const imports = ls.filter((l) => /^const \{[^}]+\} = await import\(['"][^'"]+['"]\);?$/.test(l));
    const asserts = ls.filter((l) => /^assert\b/.test(l));
    const said = asserts.map(sayJsAssert);
    if (
      ls.length !== imports.length + asserts.length ||
      !asserts.length ||
      said.some((s) => !s) ||
      said.join(' ').length > 320
    ) {
      byTitle();
      continue;
    }
    out.push(
      proven
        ? said.join(', and ') + '. Before the change ' + (said.length > 1 ? 'these did not all hold.' : 'it did not.')
        : said.map((s) => s.replace(/ (gives|is) /, ' still $1 ')).join(', and ') + '.',
    );
  }
  if (!out.length) return [];
  for (const i of tops) uses.add(i);
  const head = [
    code.length ? 'Open the change in ' + code.slice(0, 4).join(', ') + '.' : '',
    uses.size
      ? "In Node, started in the repository's folder, bring in what is checked: " +
        [...uses].slice(0, 4).join('; ') +
        '.'
      : '',
  ].filter(Boolean);
  return [...head, ...out.filter((s, i, a) => a.indexOf(s) === i)].slice(0, 10);
}
const looksLikeTest = (t) => t.length > 60 && /\b(test|assert|expect)\w*/i.test(t);
// the change, for whoever writes its proof: the diff, and each changed file as it now stands
async function sourcesOf(dir, changed) {
  const paths = changed.map((c) => c.path || c).slice(0, 6);
  const diff = (await git(dir, ['diff', 'HEAD', '--', ...paths])).out.slice(0, 5000);
  let out = diff.trim() ? 'The change, as a diff:\n' + diff + '\n' : '';
  for (const f of paths.slice(0, 4)) {
    const t = await text(path.join(dir, f)).catch(() => '');
    if (t && t.length < 6000) out += '\nThe file ' + f + ' as it is now:\n' + t + '\n';
  }
  return out;
}
// WHAT THE DRAFTER IS SHOWN: the task; each changed file AS IT WAS BEFORE THE CHANGE (so it knows what there is to call, and what the old
// code does); and the names the change adds or rewrites, with their arguments and nothing of their bodies. It is not shown how the change
// was written, because a test written from the code proves that the code does what the code does.
const SIG =
  /^\s*(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|internal\s+|static\s+|async\s+|suspend\s+|override\s+)*(?:def|class|function|fun|func|struct|enum|object)\s+[\w.]+[^\n]{0,140}$|^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?\([^\n]{0,100}$|^(?:String|int|double|bool|void|num|Widget|Future<[\w<>?]+>|List<[\w<>?]+>|Map<[\w<>?, ]+>)\s+\w+\s*\([^\n]{0,120}$/;
const SIG2 = /^\s*(?:export\s+)?(?:interface|type)\s+\w+[^\n]{0,140}$/;
async function specOf(dir, changed) {
  const paths = changed
    .map((c) => c.path || c)
    .filter(
      (f) =>
        f &&
        !/(^|\/)(test_[\w-]+\.py|[\w-]+_test\.(py|dart)|[\w.-]+\.(test|spec)\.[cm]?[jt]sx?|\w+Tests?\.(swift|kt|java))$/.test(
          f,
        ),
    )
    .slice(0, 4);
  let out = '';
  let names = [];
  for (const f of paths) {
    const old = await git(dir, ['show', 'HEAD:' + f]);
    const now = await text(path.join(dir, f)).catch(() => '');
    out +=
      old.ok && old.out.trim()
        ? '\nThe file ' + f + ' as it was BEFORE the change:\n' + old.out.slice(0, 5000) + '\n'
        : '\n' + f + ' is a new file: it did not exist before the change.\n';
    for (const l of String(now).split('\n'))
      if ((SIG.test(l) || SIG2.test(l)) && names.length < 24)
        names.push(f + ':  ' + l.trim().replace(/\s*[{:=]\s*$/, ''));
  }
  return (
    out +
    (names.length
      ? '\nWhat is in ' +
        (paths.length === 1 ? 'that file' : 'those files') +
        ' AFTER the change, by name only (you are not shown how it was written):\n' +
        names.map((n) => '  ' + n).join('\n') +
        '\n'
      : '')
  );
}
// a test that says of itself that it checks the old, faulty behaviour is not a check of the task: it is taken out before anything is run
const OLD_TEST =
  /old[ _](code|behaviou?r|version)|before[ _](the[ _])?(change|fix)|was[ _]broken|still[ _]broken|bug[ _](exists|is[ _]present)|current[ _]behaviou?r/i;
export function dropOld(r, body) {
  let out = String(body || '');
  if (r.parse === 'unittest') {
    for (const m of [...out.matchAll(/^\s*def (test_\w+)\s*\(/gm)])
      if (OLD_TEST.test(m[1])) {
        const less = dropTest(out, m[1]);
        if (less && /def test_\w+/.test(less)) out = less;
      }
  } else if (r.parse === 'tap' || r.parse === 'dartjson') {
    for (const m of [...out.matchAll(/^[ \t]*(?:testWidgets|test|it)\(\s*(['"\x60])(.+?)\1/gm)])
      if (OLD_TEST.test(m[2])) {
        const less = dropJsTest(out, m[2]);
        if (less && /\b(testWidgets|test|it)\(/.test(less)) out = less;
      }
  }
  return out;
}
const draftAsk = (recipe, task, sources, know = '') =>
  'A team has just made this change in a repository:\n\n' +
  task +
  '\n\n' +
  sources +
  '\nWrite its proof test file, ' +
  recipe.dest +
  '/' +
  recipe.file +
  '. It will be run twice with the command "' +
  recipe.run.map((a) => (a === process.execPath ? 'node' : a)).join(' ') +
  '": on the code BEFORE the change, where the tests of what was asked must fail, and on the code AFTER it, where every test must pass.\n\nThe rules:\n' +
  '1. One test for each thing the task says must be true, named in plain words for what it proves.\n' +
  "2. Take every expected value from the task's own words. Work each one out, and write the working as a comment on the line above the assertion, like this:  " +
  (recipe.kind === 'python' ? '#' : '//') +
  ' 360 - 2 * 16 = 328\n' +
  '3. One more test for something that must NOT have changed.\n' +
  (recipe.kind === 'python'
    ? "4. Put every import of the project's code INSIDE the test that uses it, never at the top of the file, like this:\n    def test_double_gives_twice_the_number(self):\n        from shapes import double\n        # 2 * 4 = 8\n        self.assertEqual(double(4), 8)\n"
    : '') +
  (recipe.kind === 'node'
    ? '4. The file is an ES module, and it sits in the folder ' +
      recipe.dest +
      ", so the project's own files are one folder up. Like this:\n    import test from 'node:test';\n    import assert from 'node:assert/strict';\n    import { double } from '../shapes." +
      (recipe.ts ? 'ts' : 'mjs') +
      "';\n\n    test('double gives twice the number', () => {\n      // 2 * 4 = 8\n      assert.equal(double(4), 8);\n    });\nA function that returns a promise is awaited, inside an async test.\n"
    : '') +
  (recipe.kind === 'flutter'
    ? "4. The file is a Dart test in the folder test. Import flutter_test, and the project's own files by its package name" +
      (recipe.pkg ? ' (' + recipe.pkg + ')' : '') +
      ". Like this:\n    import 'package:flutter_test/flutter_test.dart';\n    import 'package:" +
      (recipe.pkg || 'the_app') +
      "/shapes.dart';\n\n    void main() {\n      test('double gives twice the number', () {\n        // 2 * 4 = 8\n        expect(doubleOf(4), 8);\n      });\n    }\nA widget is tested with testWidgets and tester.pumpWidget, wrapped in a MaterialApp; import package:flutter/material.dart in a file that builds widgets. To test how wide something is on a screen of a given width, set the size of the screen first, like this:\n    testWidgets('on a small phone the banner leaves a margin', (tester) async {\n      tester.view.physicalSize = const Size(360, 800);\n      tester.view.devicePixelRatio = 1.0;\n      addTearDown(tester.view.reset);\n      await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: Banner(text: 'Hello')))));\n      // 360 - 2 * 24 = 312\n      expect(tester.getSize(find.byType(Banner)).width, 312);\n    });\nA press is tester.tap(find...) and then tester.pump(). Never call testWidgets inside test(), and never write await outside an async function.\n"
    : '') +
  (recipe.kind === 'android'
    ? "4. The file is Kotlin, in the package familyoffice.proof, with one class named FamilyOfficeProofTest, tested with JUnit 4. Import the project's own code by its package, as the files above name it. Like this:\n    package familyoffice.proof\n\n    import org.junit.Assert.assertEquals\n    import org.junit.Test\n    import shop.example.shapes.double\n\n    class FamilyOfficeProofTest {\n        @Test\n        fun doubleGivesTwiceTheNumber() {\n            // 2 * 4 = 8\n            assertEquals(8, double(4))\n        }\n    }\nA test's name is one camelCase word with no spaces. In assertEquals the expected value comes first.\n" +
      (recipe.compose
        ? 'A SCREEN (a @Composable function) is tested with Robolectric and a Compose rule, with no device. The width of the screen is set for one test with @Config(qualifiers = "w360dp-h800dp-mdpi"), which is a screen 360 dp wide. Find a thing on the screen by its test tag (rule.onNodeWithTag) or by its text (rule.onNodeWithText), and use only these on what is found: assertIsDisplayed(), assertWidthIsEqualTo(328.dp), assertHeightIsEqualTo(48.dp), assertTextEquals("..."), assertHasClickAction(), assertIsEnabled(), assertIsNotEnabled(), assertDoesNotExist(), performClick(). Like this:\n    @RunWith(RobolectricTestRunner::class)\n    class FamilyOfficeProofTest {\n        @get:Rule val rule = createComposeRule()\n\n        @Test @Config(qualifiers = "w360dp-h800dp-mdpi")\n        fun onASmallPhoneTheBannerLeavesAMargin() {\n            rule.setContent { Banner(text = "Hello") }\n            // 360 - 2 * 24 = 312\n            rule.onNodeWithTag("banner").assertWidthIsEqualTo(312.dp)\n        }\n    }\nCall the screen\'s own composable with the arguments it takes, as the file above declares it. Use no Activity, no ActivityScenario and nothing else from Robolectric: the rule is all a screen test needs.\n'
        : '')
    : '') +
  // written from the task, not from the code: found for real, a test that used the one input on which a wrong reading and the right one agree
  '6. Write every test from what the task says must be true AFTER the change. You are not shown how the change was written, and you must not guess it. For each rule, choose an input that tells the rule from its nearest wrong reading: where the task says "contains", use a value that contains it and is not equal to it; where it says "at most", test the edge itself; where it says "every", test more than one.\n' +
  '7. Never write a test that expects the old, faulty behaviour, and never one that only says the old code was wrong. A test of what the task asks fails on the old code by itself.\n' +
  (recipe.kind === 'flutter' || recipe.kind === 'android'
    ? "8. Every test calls the project's own code and asserts on what comes back. A test that only does sums with numbers of its own proves nothing.\n"
    : '') +
  (/attachments show|attached shows/.test(task)
    ? '9. The task carries what its attachments show to be wrong. Write a test for EACH fault it names, with the very numbers and words shown there: the count in the picture, the limit on the page, every case it shows and not only the first.\n'
    : '') +
  // a ticket about speed: found for real, four tests that the slow code passes and one that only says "the old code is slow"
  '5. When the task sets a limit on time, one test measures exactly that: it builds the big input the task describes, times the call with ' +
  (recipe.kind === 'python' ? 'time.perf_counter()' : 'performance.now()') +
  ", and asserts what the call returns as well as that it took less than the limit the task gives. The input must be one where nothing lets the call stop early (every item in stock, every item different), and the slow code's worst case, at the size the task names (for a search through a list: items that are all different, so that each is found late). The old code fails that test by being too slow. Never write a test that only says the old code is slow.\n" +
  (recipe.how ? '\nFor this project: ' + recipe.how + '\n' : '') +
  (know ? know + '\n' : '') +
  '\nAt most six tests in all, each a few lines. Reply with the complete file in one code block and nothing else.';
// what a referee's reply decided: its VERDICT line; or, with no such line, its own words when they all say the same thing. A reply that
// blames the check in one breath and the code in the next has decided nothing.
const bare = (v) =>
  String(v == null ? '' : v)
    .trim()
    .replace(/^['"\x60]+|['"\x60.]+$/g, '');
export function verdictIn(said) {
  const s = String(said || '');
  const line = /VERDICT:\s*THE (CHECK|CODE) IS WRONG/i.exec(s);
  const blamesCode =
    /\b(bug|fault|error|mistake) in the code\b|\bcode (is|has|produces|gives|returns)\b[^.]{0,80}\b(bug|wrong|incorrect|extra|missing)\b|\bnot a test error\b|\bnot the (check|test)('s)? (fault|error)\b/i.test(
      s,
    );
  if (line) {
    const v = line[1].toLowerCase();
    return v === 'check' && blamesCode ? '' : v;
  }
  const all = [...s.matchAll(/\bTHE (CHECK|CODE) IS WRONG\b/gi)].map((m) => m[1].toLowerCase());
  const one = all.length && all.every((v) => v === all[0]) ? all[0] : '';
  return one === 'check' && blamesCode ? '' : one;
}
// IS WHAT A CHECK IS CALLED IN THE TASK'S OWN WORDS? Two words of the check's name (by their first four letters, so "fails" and "failure",
// "limit" and "limits" are one word) in one sentence of the task is enough: such a check is about something the task says, and is never
// taken out as "not asked for". Small words and the words every test name has are not counted.
const DULL = new Set(
  'that this with from when then than does must should have will only each every into over after before still also test tests check checks call calls called calling return returns given using uses used value values'.split(
    ' ',
  ),
);
const stems = (t) =>
  new Set(
    (
      String(t)
        .toLowerCase()
        .match(/[a-z]{4,}/g) || []
    )
      .filter((w) => !DULL.has(w))
      .map((w) => w.slice(0, 4)),
  );
export function askedFor(task, test, need = 2) {
  const mine = stems(
    String(test)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' '),
  );
  if (mine.size < need) return need === 2;
  return String(task)
    .split(/(?<=[.!?:;])\s+|\s+-\s+|\n+|\s\|\s/)
    .some((s) => {
      const theirs = stems(s);
      let n = 0;
      for (const w of mine) if (theirs.has(w)) n++;
      return n >= need;
    });
}
const requireAsk = (task, proof, test) =>
  'The task a team was given:\n\n' +
  task +
  '\n\nA test file was written for it:\n\n' +
  proof +
  '\n\nLook only at the test named "' +
  test +
  '". Does any sentence of the task ask for what that test checks? If one does, copy that sentence word for word after "QUOTE:". ' +
  (/attachments show|attached shows/.test(task)
    ? 'The task includes what its attachments show, as the team read them: a fault they show counts as something the task asks to be put right. '
    : '') +
  'If no sentence of the task asks for it, reply exactly: QUOTE: NONE';
// WHAT A FAILING JAVASCRIPT ASSERTION COMPARED, read from the test itself: Node's runner says what was expected and what came, not which
// call it was. The assertion in that test whose expected value is the one reported is the one that failed.
export function jsEquality(body, title, ran) {
  const m = /\(expected (.+), got (.+)\)\s*$/.exec(String(ran || ''));
  const t = jsTest(body, title);
  if (!m || !t) return null;
  const wanted = m[1].trim();
  const gave = m[2].trim();
  const src = t.text.replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const call of src.matchAll(/assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\(/g)) {
    let i = call.index + call[0].length;
    let depth = 1;
    let q = '';
    let inner = '';
    for (; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        inner += ch;
        if (ch === '\\') inner += src[++i] || '';
        else if (ch === q) q = '';
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '\x60') {
        q = ch;
        inner += ch;
        continue;
      }
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) {
        depth--;
        if (!depth) break;
      }
      inner += ch;
    }
    const args = argsOf(inner.trim());
    if (args.length < 2) continue;
    const k = literal(args[1]) && !literal(args[0]) ? 0 : literal(args[0]) && !literal(args[1]) ? 1 : -1;
    if (k < 0 || !sameValue(args[1 - k], wanted)) continue;
    const before = src
      .slice(0, call.index)
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && !/^const \{[^}]+\} = await import\(/.test(l) && !/^import /.test(l));
    return { call: args[k].replace(/\s+/g, ' '), expected: args[1 - k], gave, wanted, before };
  }
  return null;
}
function mendJs(proof, title, expected, value) {
  const t = jsTest(proof, title);
  if (!t || t.text.split(expected).length !== 2) return null;
  const cut = t.text.lastIndexOf(expected);
  return (
    String(proof).slice(0, t.start) +
    t.text.slice(0, cut) +
    value +
    t.text.slice(cut + expected.length) +
    String(proof).slice(t.end)
  );
}
// A PROOF WRITTEN WITH TOOLS IS PUT INTO SHAPE TOO. Kotlin: a test named in backticks may not hold a colon, a dot or a slash ("Name contains
// illegal characters", and nothing runs); kotlin.test and JUnit 5 are not what an Android project tests with, so their imports become
// JUnit 4's; and a name it uses and does not import (Robolectric's runner, a Compose test call) is imported. Dart: the project's own
// files are imported by the package name in its pubspec, not one made up.
export const shapeKotlin = (body) =>
  addKotlinImports(
    String(body || '')
      .replace(
        /fun\s+\x60([^\x60\n]+)\x60/g,
        (m, name) =>
          'fun \x60' +
          name
            .replace(/[.:;/\\<>[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() +
          '\x60',
      )
      .replace(/^(\s*import\s+)kotlin\.test\.Test\s*$/gm, '$1org.junit.Test')
      .replace(/^(\s*import\s+)kotlin\.test\.(assert\w+)\s*$/gm, '$1org.junit.Assert.$2')
      .replace(/^\s*import\s+kotlin\.test\.\*\s*$/gm, 'import org.junit.Test\nimport org.junit.Assert.*')
      .replace(/^(\s*import\s+)org\.junit\.jupiter\.api\.Test\s*$/gm, '$1org.junit.Test')
      .replace(/^(\s*import\s+)org\.junit\.jupiter\.api\.Assertions\.(\w+|\*)\s*$/gm, '$1org.junit.Assert.$2'),
    Object.keys(KOTLIN_IMPORTS),
  );
const WIDGETY =
  /\b(MaterialApp|Scaffold|ElevatedButton|IconButton|TextButton|Icons\.|Key\(|ValueKey\(|Size\(|Center\(|Column\(|Row\(|Padding\(|SizedBox\(|Text\(|StatelessWidget|StatefulWidget|EdgeInsets|BuildContext)/;
export const shapeDart = (body, pkg, known) => {
  let s = pkg
    ? String(body || '').replace(/(['"])package:(\w+)\//g, (m, q, name) =>
        name === pkg || (known || []).includes(name) ? m : q + 'package:' + pkg + '/',
      )
    : String(body || '');
  // a proof that builds widgets needs Flutter's material library: imported when it is used and missing
  if (
    WIDGETY.test(s) &&
    !/package:flutter\/(material|widgets|cupertino)\.dart/.test(s) &&
    /package:flutter_test\/flutter_test\.dart/.test(s)
  )
    s = s.replace(
      /^(\s*import\s+['"]package:flutter_test\/flutter_test\.dart['"];)[ \t]*$/m,
      "import 'package:flutter/material.dart';\n$1",
    );
  return s;
};
// A KOTLIN PROOF WRITTEN AS TEXT, PUT INTO SHAPE. The command runs one class by name, in one package: both are set here, whatever the
// reply called them. A screen test with no runner is given Robolectric's. An import of a known name from a place it does not live is taken
// out (found for real: androidx.compose.ui.test.createComposeRule, which lives in ...test.junit4), and shapeKotlin then adds the right one.
export function shapeKotlinProof(body) {
  let s = String(body || '').replace(/\r\n/g, '\n');
  s = /^\s*package\s+[\w.]+\s*$/m.test(s)
    ? s.replace(/^\s*package\s+[\w.]+\s*$/m, 'package familyoffice.proof')
    : 'package familyoffice.proof\n\n' + s;
  s = s.replace(/^([ \t]*(?:(?:open|internal|public|final)[ \t]+)*)class\s+\w+/m, '$1class FamilyOfficeProofTest');
  if (/createComposeRule\s*\(|@Config\b/.test(s) && !/@RunWith\s*\(/.test(s))
    s = s.replace(
      /^([ \t]*)class FamilyOfficeProofTest/m,
      '$1@RunWith(RobolectricTestRunner::class)\n$1class FamilyOfficeProofTest',
    );
  s = s
    .split('\n')
    .filter((l) => {
      const m = /^\s*import\s+([\w.]+)\s*$/.exec(l);
      if (!m) return true;
      const name = m[1].split('.').pop();
      return !(KOTLIN_IMPORTS[name] && KOTLIN_IMPORTS[name] !== m[1]);
    })
    .join('\n');
  return shapeKotlin(s);
}
// WHAT THE COMPILER SAYS OF A KOTLIN PROOF, PUT RIGHT WITHOUT ASKING ANYBODY: an import it cannot find is taken out, and a name it cannot
// find that an editor would know how to import is imported. errors: the compiler's own lines; file: the proof's file name.
export function mendKotlin(body, errors, file) {
  const ls = String(body || '').split('\n');
  const gone = new Set();
  const names = new Set();
  for (const e of errors || []) {
    const m = new RegExp(
      file.replace(/[.]/g, '\\.') + ":(\\d+):\\d+:? (?:error: )?Unresolved reference:? '?(\\w+)'?",
    ).exec(String(e));
    if (!m) continue;
    const at = Number(m[1]) - 1;
    if (/^\s*import\s/.test(ls[at] || '')) gone.add(at);
    else if (KOTLIN_IMPORTS[m[2]]) names.add(m[2]);
  }
  if (!gone.size && !names.size) return null;
  const now = shapeKotlin(addKotlinImports(ls.filter((l, i) => !gone.has(i)).join('\n'), [...names]));
  return now !== String(body || '') ? now : null;
}
// WHAT NODE SAYS OF AN IMPORT IN A PROOF, PUT RIGHT WITHOUT ASKING ANYBODY: a name imported from a file that does not export it is
// imported from the project file that does. tree: a copy of the repository; dest: the folder the proof sits in. -> the mended file, or null
export async function mendJsImport(body, said, tree, dest) {
  const m = /module '([^']+)' does not provide an export named '(\w+)'/.exec(String(said || ''));
  if (!m) return null;
  const spec = m[1];
  const name = m[2];
  const DEF = new RegExp(
    'export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+' +
      name +
      '\\b|export\\s*\\{[^}]*\\b' +
      name +
      '\\b[^}]*\\}',
  );
  let home = '';
  for (const f of (await walk(tree, /\.(mjs|cjs|js|ts|mts)$/)).sort()) {
    if (/node_modules|[\\/]\.proof[\\/]|\.(test|spec)\./.test(f)) continue;
    if (DEF.test(await text(f))) {
      home = f;
      break;
    }
  }
  if (!home) return null;
  const rel = path.relative(path.join(tree, dest), home).split(path.sep).join('/');
  const to = rel.startsWith('.') ? rel : './' + rel;
  const line = new RegExp(
    '^([ \\t]*import\\s*\\{)([^}]*)(\\}\\s*from\\s*[\'"]' +
      spec.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') +
      '[\'"];?)[ \\t]*$',
    'm',
  );
  const hit = line.exec(String(body));
  if (!hit) return null;
  const names = hit[2]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const mine = names.find((x) => x.split(/\s+as\s+/)[0] === name);
  const keep = names.filter((x) => x !== mine);
  if (!mine) return null;
  return String(body).replace(
    line,
    () =>
      (keep.length ? hit[1] + ' ' + keep.join(', ') + ' ' + hit[3] + '\n' : '') +
      'import { ' +
      mine +
      " } from '" +
      to +
      "';",
  );
}
// A NAME THE CHANGE USES AND NEVER BROUGHT IN, put right as an editor would: "x is not defined" (JavaScript, TypeScript) or "name 'x' is
// not defined" (Python), where x is used in a changed file, is not declared or imported there, and one other file of the project
// exports or defines it. The import is added: into the import that already reads from that file, when there is one. -> files mended
export async function mendNames(dir, files, said) {
  const js = [...new Set([...String(said || '').matchAll(/\b([A-Za-z_$][\w$]*) is not defined/g)].map((m) => m[1]))]
    .filter((n) => !/^name$/.test(n))
    .slice(0, 6);
  const missingNames = [
    ...new Set([...String(said || '').matchAll(/name '(\w+)' is not defined/g)].map((m) => m[1])),
  ].slice(0, 6);
  let count = 0;
  const skip = /node_modules|[\\/]\.(proof|git|venv)[\\/]|\.(test|spec)\.|(^|[\\/])test_[^\\/]*\.py$/;
  const esc = (s) => s.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
  for (const file of files || []) {
    const filePath = path.join(dir, file);
    let body = await text(filePath);
    let did = false;
    if (!body) continue;
    if (/\.(mjs|js|ts|mts)$/.test(file) && js.length) {
      const all = (await walk(dir, /\.(mjs|js|ts|mts)$/))
        .filter((g) => !skip.test(g) && path.resolve(g) !== path.resolve(filePath))
        .sort();
      for (const name of js) {
        if (
          !new RegExp('\\b' + esc(name) + '\\b').test(body) ||
          new RegExp(
            'import[^;]*[{,\\s]' +
              esc(name) +
              '[},\\s][^;]*from|(?:function\\*?|const|let|var|class)\\s+' +
              esc(name) +
              '\\b',
          ).test(body)
        )
          continue;
        const DEF = new RegExp('export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+' + esc(name) + '\\b');
        let home = '';
        for (const g of all)
          if (DEF.test(await text(g))) {
            home = g;
            break;
          }
        if (!home) continue;
        let rel = path.relative(path.dirname(filePath), home).split(path.sep).join('/');
        if (!rel.startsWith('.')) rel = './' + rel;
        const line = new RegExp(
          '^([ \\t]*import\\s*\\{)([^}]*)(\\}\\s*from\\s*[\'"]' + esc(rel) + '[\'"];?)[ \\t]*$',
          'm',
        );
        const hit = line.exec(body);
        if (hit)
          body = body.replace(
            line,
            () =>
              hit[1] +
              ' ' +
              [
                ...hit[2]
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
                name,
              ].join(', ') +
              ' ' +
              hit[3],
          );
        else {
          const ls = body.split('\n');
          let last = -1;
          ls.forEach((l, i) => {
            if (/^\s*import\s/.test(l)) last = i;
          });
          ls.splice(last + 1, 0, 'import { ' + name + " } from '" + rel + "';");
          body = ls.join('\n');
        }
        did = true;
      }
    }
    if (/\.py$/.test(file) && missingNames.length) {
      const all = (await walk(dir, /\.py$/))
        .filter((g) => !skip.test(g) && path.resolve(g) !== path.resolve(filePath))
        .sort();
      for (const name of missingNames) {
        if (
          !new RegExp('\\b' + name + '\\b').test(body) ||
          new RegExp(
            '^\\s*(?:from\\s+[\\w.]+\\s+import\\s+[^\\n]*\\b' +
              name +
              '\\b|import\\s+[^\\n]*\\b' +
              name +
              '\\b|(?:def|class)\\s+' +
              name +
              '\\b|' +
              name +
              '\\s*=)',
            'm',
          ).test(body)
        )
          continue;
        const DEF = new RegExp('^(?:def|class)\\s+' + name + '\\b|^' + name + '\\s*=', 'm');
        let home = '';
        for (const g of all)
          if (DEF.test(await text(g))) {
            home = g;
            break;
          }
        if (!home) continue;
        const mod = path.relative(dir, home).replace(/\.py$/, '').split(path.sep).join('.');
        const ls = body.split('\n');
        let last = -1;
        ls.forEach((l, i) => {
          if (/^(?:from\s+[\w.]+\s+import\s|import\s)/.test(l)) last = i;
        });
        if (last < 0) {
          last = ls.findIndex((l, i) => i > 0 && /^\s*("""|''')/.test(l) && /("""|''')\s*$/.test(l));
          if (/^\s*("""|''').*("""|''')\s*$/.test(ls[0] || '')) last = 0;
        }
        ls.splice(
          last + 1,
          0,
          ...(last >= 0 && !/import\s/.test(ls[last])
            ? ['', 'from ' + mod + ' import ' + name]
            : ['from ' + mod + ' import ' + name]),
        );
        body = ls.join('\n');
        did = true;
      }
    }
    if (did) {
      await writeFile(filePath, body);
      count++;
    }
  }
  return count;
}
const refereeAsk = (task, proof, test, said) =>
  'The task a team was given:\n\n' +
  task +
  '\n\nThe proof file written for it:\n\n' +
  proof +
  '\n\nThe check named "' +
  test +
  '" FAILS on the changed code. What the run said: ' +
  (said || 'it failed') +
  "\n\nWork out, from the task's own words only, what the right result is for the case this check tests. Show the working in one line. Then finish with exactly one of these two lines:\nVERDICT: THE CHECK IS WRONG\nVERDICT: THE CODE IS WRONG";
// the two sides of a failed equality, and which is the call and which the value the check expected
export function equalityOf(said) {
  const match = /^AssertionError: (.+?) != (.+?), at: self\.assertEqual\((.*)\)\s*$/.exec(String(said || ''));
  if (!match) return null;
  const args = [];
  let depth = 0;
  let cur = '';
  let q = '';
  for (const ch of match[3]) {
    if (q) {
      cur += ch;
      if (ch === q) q = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  if (args.length < 2) return null;
  const lit = (a) => /^-?\d+(\.\d+)?$|^(['"]).*\2$|^(True|False|None)$/.test(a);
  const i = lit(args[1]) && !lit(args[0]) ? 0 : lit(args[0]) && !lit(args[1]) ? 1 : -1;
  if (i < 0) return null;
  return {
    call: args[i],
    expected: args[1 - i],
    gave: (i === 0 ? match[1] : match[2]).trim(),
    wanted: (i === 0 ? match[2] : match[1]).trim(),
  }; // gave: what the code returned; wanted: what the check expected
}
const sameValue = (a, b) => {
  const n = (v) =>
    String(v == null ? '' : v)
      .trim()
      .replace(/^['"\x60]|['"\x60.]$/g, '')
      .replace(/\s*(px|pixels?)$/i, '')
      .trim();
  const x = n(a);
  const y = n(b);
  return x !== '' && (x === y || (isFinite(Number(x)) && isFinite(Number(y)) && Number(x) === Number(y)));
};
const deriveAsk = (task, call, before = []) =>
  'The task a team was given:\n\n' +
  task +
  '\n\n' +
  (before.length
    ? 'These lines have just run, in this order, on code that follows the task:\n\n' +
      before.map((l) => '    ' + l).join('\n') +
      '\n\n'
    : '') +
  "Going by the task's own rules and nothing else, what must this give" +
  (before.length ? ' now' : '') +
  '?\n\n    ' +
  call +
  '\n\nShow the working in one line. Then finish with one line of exactly this form:\nANSWER: <the value>';
// THE STEPS TO CHECK IT BY HAND ARE READ OFF THE PROOF THAT RAN. They used to be written by the team's model from the checks' titles, and a
// local model wrote steps that described the fault instead of the fix, with a sum of its own that was wrong (348 for 360 less 16 a side).
// Every line of the proof was just run on both copies, so what it asserts is known to be true: each assertion becomes a step in plain
// words. A test that sets things up first (so its assertion does not stand alone) is given by its title instead.
const argsOf = (inner) => {
  const args = [];
  let depth = 0;
  let cur = '';
  let q = '';
  for (const ch of inner) {
    if (q) {
      cur += ch;
      if (ch === q) q = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
};
const literal = (a) =>
  /^-?\d+(\.\d+)?$|^(['"]).*\2$|^(True|False|None|true|false|null|undefined)$|^[\[({].*[\])}]$/.test(a);
function sayAssert(line) {
  const m = /^self\.assert(\w+)\((.*)\)\s*$/.exec(line);
  if (!m) return null;
  const [a, b] = argsOf(m[2]);
  const kind = m[1];
  if (!a) return null;
  const two = {
    LessEqual: 'is at most',
    Less: 'is less than',
    GreaterEqual: 'is at least',
    Greater: 'is more than',
    In: 'is in',
    NotIn: 'is not in',
    NotEqual: 'is not',
    Is: 'is',
    IsNot: 'is not',
    AlmostEqual: 'is about',
  };
  if (kind === 'Equal' || kind === 'Equals' || kind === 'ListEqual' || kind === 'DictEqual' || kind === 'TupleEqual') {
    if (!b) return null;
    const call = literal(a) && !literal(b) ? b : a;
    const value = call === a ? b : a;
    return call + ' gives ' + value;
  }
  if (two[kind]) return b ? a + ' ' + two[kind] + ' ' + b : null;
  return kind === 'True'
    ? a + ' is true'
    : kind === 'False'
      ? a + ' is false'
      : kind === 'IsNone'
        ? a + ' gives None'
        : kind === 'IsNotNone'
          ? a + ' gives something'
          : null;
}
function testLines(body, name) {
  const ls = String(body).split('\n');
  const at = name ? ls.findIndex((l) => new RegExp('^\\s*def ' + name + '\\s*\\(').test(l)) : -1;
  if (at < 0) return null;
  const ind = /^\s*/.exec(ls[at])[0].length;
  let end = at + 1;
  while (end < ls.length && (!ls[end].trim() || /^\s*/.exec(ls[end])[0].length > ind)) end++;
  return ls
    .slice(at + 1, end)
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l) && !/^(?:"""|''').*(?:"""|''')$/.test(l));
}
export function stepsOf(body, rows, names, changed) {
  const out = [];
  const uses = new Set();
  const code = (changed || [])
    .map((c) => c.path || c)
    .filter((f) => f && !/(^|\/)(test_[\w-]+|[\w-]+_test)\.py$/.test(f));
  for (const x of [...rows.filter((v) => v.verdict === 'proven'), ...rows.filter((v) => v.verdict === 'guard')]) {
    const proven = x.verdict === 'proven';
    const byTitle = () =>
      out.push(
        proven
          ? 'Confirm that: ' + x.test + '. Before the change this did not hold.'
          : 'Confirm it is still true that: ' + x.test + '.',
      );
    const ls = testLines(body, names && names.get(x.test));
    if (!ls) {
      byTitle();
      continue;
    }
    const imports = ls.filter((l) => /^(from [\w.]+ import [\w, ]+|import [\w.]+)$/.test(l));
    const asserts = ls.filter((l) => /^self\.assert\w+\(/.test(l));
    const said = asserts.map(sayAssert);
    if (
      ls.length !== imports.length + asserts.length ||
      !asserts.length ||
      said.some((s) => !s) ||
      said.join(' ').length > 320
    ) {
      byTitle();
      continue;
    }
    for (const i of imports) uses.add(i);
    out.push(
      proven
        ? said.join(', and ') + '. Before the change ' + (said.length > 1 ? 'these did not all hold.' : 'it did not.')
        : said.map((s) => s.replace(/ (gives|is) /, ' still $1 ')).join(', and ') + '.',
    );
  }
  if (!out.length) return [];
  const head = [
    code.length ? 'Open the change in ' + code.slice(0, 4).join(', ') + '.' : '',
    uses.size
      ? "In Python, started in the repository's folder, bring in what is checked: " +
        [...uses].slice(0, 4).join('; ') +
        '.'
      : '',
  ].filter(Boolean);
  return [...head, ...out.filter((s, i, a) => a.indexOf(s) === i)].slice(0, 10);
}
// AN ASSERTION WRITTEN OVER SEVERAL LINES. Python reports the line it starts on ("self.assertEqual("), which says nothing of what was
// compared; found for real, that left a wrong change with nobody able to say why its check failed. The lines that finish it are joined on.
export function wholeAt(ran, lines) {
  const at = ((/, at: (.+)$/.exec(String(ran)) || [])[1] || '').trim();
  if (!at || !/[(,]$/.test(at) || !lines.length) return ran;
  const i = lines.indexOf(at);
  if (i < 0) return ran;
  let joined = at;
  let depth = 0;
  const count = (l) => {
    for (const ch of l) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
    }
  };
  count(at);
  for (let j = i + 1; j < lines.length && depth > 0; j++) {
    joined += ' ' + lines[j];
    count(lines[j]);
  }
  return depth === 0
    ? String(ran).replace(
        /, at: .+$/,
        () => ', at: ' + joined.replace(/([(\[{])\s+/g, '$1').replace(/,?\s+([)\]}])/g, '$1'),
      )
    : ran;
}
// the value a check expects, put right inside that one test wherever it is written (its own line, or one of several the assertion runs over)
function mendIn(proof, name, expected, value) {
  const ls = String(proof).split('\n');
  const at = ls.findIndex((l) => new RegExp('^\\s*def ' + name + '\\s*\\(').test(l));
  if (at < 0) return null;
  const ind = /^\s*/.exec(ls[at])[0].length;
  let end = at + 1;
  while (end < ls.length && (!ls[end].trim() || /^\s*/.exec(ls[end])[0].length > ind)) end++;
  const block = ls.slice(at, end).join('\n');
  if (block.split(expected).length !== 2) return null;
  const cut = block.lastIndexOf(expected);
  return [...ls.slice(0, at), block.slice(0, cut) + value + block.slice(cut + expected.length), ...ls.slice(end)].join(
    '\n',
  );
}
const countTests = (body) =>
  (String(body).match(/^\s*@Test\b|^\s*def test_\w+\s*\(|^\s*(?:testWidgets|test|it)(?:\.\w+)?\(\s*['"\x60]/gm) || [])
    .length;
// one test taken out of a Python proof file, by the name it is written under
export function dropTest(body, name) {
  const ls = String(body).split('\n');
  const at = ls.findIndex((l) => new RegExp('^\\s*def ' + name + '\\s*\\(').test(l));
  if (at < 0) return null;
  const ind = /^\s*/.exec(ls[at])[0].length;
  let end = at + 1;
  while (end < ls.length && (!ls[end].trim() || /^\s*/.exec(ls[end])[0].length > ind)) end++;
  let from = at;
  while (from > 0 && /^\s*#/.test(ls[from - 1]) && /^\s*/.exec(ls[from - 1])[0].length === ind) from--;
  ls.splice(from, end - from);
  return ls.join('\n').replace(/\n{4,}/g, '\n\n\n');
}
const repairAsk = (task, list) =>
  (list.some((c) => c.again)
    ? 'A first repair of this did not fix it. Read the function again against exactly the case below, and trace it line by line before you change anything.\n\n'
    : '') +
  'You are working in a clone of a repository, in the current folder. An earlier change was made here for this task:\n\n' +
  task +
  '\n\nIt was then checked, and the code is wrong in this:\n' +
  list.map((c) => '- ' + c.test + ': ' + c.why).join('\n') +
  "\n\nPut the code right so that this holds, keeping everything else the task asked for. Change only the project's own files and write no tests. Do not run git. When it is done, say in one sentence what you changed.";

// ---------- the whole thing ----------
// ask({ system, prompt, max }) -> text     the team's model asked for words, with no tools (a local model: see the top of this file's proof notes)
// write({ prompt }) -> { ok, said, why }   the team's agent, working in the clone
// stepsFor({ task, rows }) -> [string]     numbered checks for whoever verifies it (the team's model); a plain list is used if it gives none
// textProof: ask for the proof file as text (a local model); otherwise it is written and corrected by the agent, with its tools
export async function proveChange({
  stateDir,
  dir,
  repo,
  task,
  changed,
  write,
  ask = null,
  textProof = true,
  stepsFor,
  skill = '',
  rewrite = null,
  independent = false,
  checked = false,
  onStep = () => {},
}) {
  const startedAt = Date.now();
  const id = randomBytes(6).toString('hex');
  const home = path.join(stateDir, 'proofs', id);
  const harness = path.join(home, 'harness');
  const trees = { green: path.join(home, 'green'), red: path.join(home, 'red') };
  const recipe = await recipeFor(dir);
  if (recipe.blocked) return { ok: false, blocked: recipe.blocked };
  await mkdir(harness, { recursive: true });
  const fail = async (why) => {
    if (process.env.FO_KEEP_FAILED_PROOFS !== '1') await rm(home, { recursive: true, force: true }).catch(() => {});
    return { ok: false, why };
  }; // FO_KEEP_FAILED_PROOFS=1: a proof that failed is left where it was, to be looked at
  try {
    onStep('Writing the proof');
    const statusNow = async () => statusLines((await git(dir, ['status', '--porcelain', '--untracked-files=all'])).out);
    const before = new Set((await statusNow()).map((x) => x.file));
    const guide = recipe.guide && (await exists(path.join(dir, recipe.guide))) ? recipe.guide : '';
    const know = skill ? '\n\n' + skill : '';
    const agentAsk =
      proofAsk(
        recipe,
        task,
        changed.map((c) => c.path || c),
        guide,
      ) + know;
    const news = async () => (await statusNow()).filter((x) => x.fresh && !before.has(x.file)).map((x) => x.file);
    // THE CODE UNDER TEST IS HELD WHILE ITS PROOF IS WRITTEN. Found for real: asked for a proof file, the agent also "tidied" the function
    // it was proving and the project's own test, and left both broken; the change had been right. So what the change is (each file it
    // touched, as it stands) is kept, and after any step that only writes or corrects a proof, every one of those files is put back,
    // and any other tracked file the step touched is put back as it was committed.
    const held = new Map();
    const hold = async () => {
      held.clear();
      const now = (await statusNow()).filter((x) => !x.fresh || before.has(x.file)).map((x) => x.file);
      for (const f of new Set([...changed.map((c) => c.path || c), ...now]))
        held.set(f, await readFile(path.join(dir, f)).catch(() => null));
    };
    const restore = async () => {
      let n = 0;
      for (const [f, was] of held) {
        const now = await readFile(path.join(dir, f)).catch(() => null);
        if (was === null ? now === null : now !== null && was.equals(now)) continue;
        n++;
        if (was === null) await rm(path.join(dir, f), { force: true }).catch(() => {});
        else {
          await mkdir(path.dirname(path.join(dir, f)), { recursive: true });
          await writeFile(path.join(dir, f), was);
        }
      }
      for (const x of await statusNow())
        if (!x.fresh && !held.has(x.file) && !before.has(x.file)) {
          await git(dir, ['checkout', '--', x.file]).catch(() => {});
          n++;
        }
      return n;
    };
    await hold();
    // whatever new is under the proof folder is the proof, and is taken out of the clone at once. A test file written somewhere else
    // is taken as the proof and put where it belongs; anything else the step left behind is removed: it is not part of the change.
    const takeOut = async () => {
      let all = await news();
      let fresh = all.filter((f) => f.startsWith(recipe.dest + '/'));
      let odd = all.filter((f) => !f.startsWith(recipe.dest + '/'));
      const tests = odd.filter((f) =>
        /(^|\/)(test_[\w-]+\.py|[\w-]+_test\.py|[\w.-]+\.(test|spec)\.[cm]?[jt]sx?|\w+Tests?\.(swift|kt|java))$/.test(
          f,
        ),
      );
      if (!fresh.length && tests.length === 1 && recipe.file) {
        await mkdir(path.join(dir, recipe.dest), { recursive: true });
        await rename(path.join(dir, tests[0]), path.join(dir, recipe.dest, recipe.file));
        fresh = [recipe.dest + '/' + recipe.file];
        odd = odd.filter((f) => f !== tests[0]);
      }
      for (const f of fresh) {
        await mkdir(path.dirname(path.join(harness, f)), { recursive: true });
        await rename(path.join(dir, f), path.join(harness, f)).catch(async () => {
          await cp(path.join(dir, f), path.join(harness, f));
          await rm(path.join(dir, f), { force: true });
        });
      }
      for (const f of odd) await rm(path.join(dir, f), { force: true }).catch(() => {});
      if (recipe.scratch) await rm(path.join(dir, recipe.dest), { recursive: true, force: true }).catch(() => {}); // this app's own scratch folder, left empty
      return { fresh, odd };
    };
    let written = null;
    let fresh = [];
    let odd = [];
    // 1. THE PROOF FILE. A local model is asked for the file itself, as text, and it is written here; the agent is the other way.
    if (ask && textProof && recipe.file && drafts(recipe)) {
      const want = draftAsk(recipe, task, await specOf(dir, changed), know);
      let body = codeIn(await ask({ system: DRAFTER, prompt: want, max: 1800 }).catch(() => ''));
      if (!looksLikeTest(body))
        body = codeIn(
          await ask({
            system: DRAFTER,
            prompt: want + '\n\nYour last reply was not a test file in one code block. Reply with the file only.',
            max: 1800,
          }).catch(() => ''),
        );
      if (looksLikeTest(body)) {
        await mkdir(path.join(dir, recipe.dest), { recursive: true });
        await writeFile(path.join(dir, recipe.dest, recipe.file), shaped(recipe, body) + '\n');
        ({ fresh, odd } = await takeOut());
        written = { ok: true, said: '' };
      }
    }
    if (!fresh.length) {
      written = await write({ prompt: agentAsk });
      await restore();
      ({ fresh, odd } = await takeOut());
    }
    if (!fresh.length) {
      onStep('Asking for the proof file again');
      written = await write({
        prompt:
          agentAsk +
          '\n\nYou were asked this once already, and no new file appeared under ' +
          recipe.dest +
          '. Create that one file now with the write tool. Do nothing else.',
      });
      await restore();
      ({ fresh, odd } = await takeOut());
    }
    if (!fresh.length)
      return fail(
        'The team did not write a proof file' +
          (odd.length
            ? ': it wrote ' + odd.slice(0, 3).join(', ') + ' instead'
            : written && written.why
              ? ': ' + String(written.why).slice(0, 160)
              : '.'),
      );

    // 2. BOTH SIDES: a copy of the repository with the change and one without, each with the proof in it, each run once
    const reshape = async () => {
      for (const f of fresh) {
        const at = path.join(harness, f);
        const was = await text(at);
        if (!was) continue;
        const now =
          recipe.kind === 'android' && /\.kt$/.test(f)
            ? shapeKotlin(was)
            : recipe.kind === 'flutter'
              ? shapeDart(was, recipe.pkg, recipe.known)
              : was;
        if (now !== was) await writeFile(at, now);
      }
    };
    const both = async () => {
      await reshape();
      for (const k of ['green', 'red']) {
        await git(dir, ['worktree', 'remove', '--force', trees[k]]).catch(() => {});
        await rm(trees[k], { recursive: true, force: true }).catch(() => {});
      }
      await git(dir, ['worktree', 'prune']).catch(() => {});
      const snap = (await git(dir, ['stash', 'create'])).out.trim() || 'HEAD'; // the tracked part of what is waiting, as a commit nothing points at
      for (const [k, at] of [
        ['green', snap],
        ['red', 'HEAD'],
      ]) {
        const a = await git(dir, ['worktree', 'add', '--detach', trees[k], at]);
        if (!a.ok)
          throw new Error('A copy of the repository could not be made: ' + a.err.split('\n').pop().slice(0, 160));
      }
      for (const f of (await git(dir, ['ls-files', '--others', '--exclude-standard'])).out
        .split('\n')
        .filter(Boolean)) {
        await mkdir(path.dirname(path.join(trees.green, f)), { recursive: true });
        await cp(path.join(dir, f), path.join(trees.green, f)).catch(() => {});
      } // new files are part of the change too
      for (const k of ['green', 'red']) {
        for (const f of fresh) {
          await mkdir(path.dirname(path.join(trees[k], f)), { recursive: true });
          await cp(path.join(harness, f), path.join(trees[k], f));
        }
        for (const f of recipe.copy) await cp(path.join(dir, f), path.join(trees[k], f)).catch(() => {});
        for (const f of recipe.link || [])
          if (await exists(path.join(dir, f))) await symlink(path.join(dir, f), path.join(trees[k], f)).catch(() => {});
      } // lent, not copied: what the project already has installed
      onStep('Running it on the change');
      const green = await side(recipe, trees.green);
      if (!green.rows.size) return { green, red: null };
      onStep('Running it on the code before the change');
      const red = await side(recipe, trees.red);
      // A PROOF THAT CANNOT EVEN START ON THE OLD CODE fails there: something new was asked for, the test uses it, and on the old code
      // it is not there to use. The same test passes on the change, so that is red before and green after, and the sheet says so.
      if (red.code !== 0)
        for (const [name, pass] of green.rows)
          if (pass && !red.rows.has(name)) {
            red.rows.set(name, false);
            red.why.set(name, 'It could not start on the code before the change: what it uses is not there yet.');
          }
      return { green, red };
    };
    onStep('Making two copies of the repository');
    // 3. ROUND AND ROUND UNTIL IT IS GREEN. Each round runs both sides; when the proof is not green the team works out why, puts
    //    that right, and runs again. rounds: what was done in each, for the chat and for what the team keeps.
    const MAX = Number(process.env.FO_PROOF_ROUNDS) || 7;
    const until = startedAt + (Number(process.env.FO_PROOF_BUDGET_MS) || 14 * 60000);
    const rounds = [];
    const tried = new Map();
    const proofFile = path.join(harness, fresh[0]);
    const canDraft = !!(ask && textProof && recipe.file && drafts(recipe));
    // a mistaken check, corrected by the agent with its tools: the proof goes back into the clone, the named checks are corrected there, and it is taken out again
    const byAgent = async (list) => {
      for (const f of fresh) {
        await mkdir(path.dirname(path.join(dir, f)), { recursive: true });
        await cp(path.join(harness, f), path.join(dir, f));
        await rm(path.join(harness, f), { force: true });
      }
      await write({
        prompt:
          'You are working in a clone of a repository, in the current folder. The proof test file ' +
          fresh[0] +
          ' was written for this task:\n\n' +
          task +
          '\n\nThese checks in it are mistaken about what the task asks:\n' +
          list.map((c) => '- ' + c.test + ' (the run said: ' + c.ran + '): ' + c.why).join('\n') +
          '\n\nCorrect only those checks, in that file, to what the task requires for the same case. Remove none of them. Change no other file, and do not touch the code under test.',
      });
      await restore();
      const back = await takeOut();
      if (back.fresh.length) fresh = back.fresh;
      else for (const f of fresh) await cp(path.join(dir, f), path.join(harness, f)).catch(() => {});
    };
    const WRITERS = ['steward', 'master', 'ask', 'overseer', 'operations'];
    const nextWriter = (skip = 0) => {
      const id = WRITERS[(rounds.filter((q) => q.what === 'proof').length + skip) % WRITERS.length];
      const t = TEMPER[id];
      return id === 'steward'
        ? { seat: id, name: t.title, temperature: 0, line: '' }
        : {
            seat: id,
            name: t.title,
            temperature: Math.min(0.8, t.warmth),
            line: ' You write it as yourself: ' + t.temper + '.',
          };
    }; // the first rewrite is the Steward's, as plainly as the first draft; then the others, each in its own temper
    // asked of one seat after another until one answers with a file (three at most): -> the seat that wrote it, or null
    const redraftBy = async (why, how) => {
      for (let k = 0; k < 3; k++) {
        const w2 = nextWriter(k);
        if (await redraft(why, how, w2)) return w2;
      }
      return null;
    };
    const redraft = async (why, how, who = null) => {
      const was = await text(proofFile).catch(() => '');
      const body = codeIn(
        await ask({
          system: DRAFTER + (who ? who.line : ''),
          ...(who ? { seat: who.seat, temperature: who.temperature } : {}),
          prompt:
            draftAsk(recipe, task, await specOf(dir, changed)) +
            '\n\nA first try at this file ' +
            why +
            '. This was it:\n\n' +
            String(was).slice(0, 3000) +
            '\n\n' +
            how,
          max: 1800,
        }).catch(() => ''),
      );
      if (!looksLikeTest(body)) return false;
      await writeFile(proofFile, shaped(recipe, body) + '\n');
      return true;
    };
    let green = null;
    let red = null;
    let rows = [];
    let ok = false;
    let stuck = '';
    for (let roundNo = 1; roundNo <= MAX; roundNo++) {
      ({ green, red } = await both());
      if (!red) {
        // it ran no tests: written in a shape the command does not pick up
        const said = green.tail || 'the command reported no tests';
        if (recipe.parse === 'tap' && roundNo < MAX) {
          const was = await text(proofFile).catch(() => '');
          const now = await mendJsImport(was, said, trees.green, recipe.dest).catch(() => null);
          if (now && now !== was) {
            await writeFile(proofFile, now);
            rounds.push({
              n: roundNo,
              what: 'proof',
              tests: [],
              why: 'the proof imported a name from a file that does not have it, so the import was pointed at the file that does',
            });
            continue;
          }
        }
        if (recipe.kind === 'android' && green.errors && green.errors.length && roundNo < MAX) {
          const was = await text(proofFile).catch(() => '');
          const now = mendKotlin(was, green.errors, path.basename(proofFile));
          if (now) {
            await writeFile(proofFile, now);
            rounds.push({
              n: roundNo,
              what: 'proof',
              tests: [],
              why: 'the proof did not build: imports the compiler could not find were taken out, and the ones it uses were added',
            });
            continue;
          }
        }
        if (!canDraft && roundNo < Math.min(MAX, 3) && Date.now() < until) {
          // written with tools (Kotlin, Swift, Dart, Claude Code): the file goes back to its writer with what the run said
          onStep('Correcting the proof');
          for (const f of fresh) {
            await mkdir(path.dirname(path.join(dir, f)), { recursive: true });
            await cp(path.join(harness, f), path.join(dir, f));
            await rm(path.join(harness, f), { force: true });
          }
          await write({
            prompt:
              'You are working in a clone of a repository, in the current folder. The proof test file ' +
              fresh[0] +
              ' was written for this task:\n\n' +
              task +
              '\n\nIt does not run with the command "' +
              recipe.run.map((a) => (a === process.execPath ? 'node' : a)).join(' ') +
              '". What the run said: ' +
              said +
              '\n\nCorrect that one file so that it builds and runs: fix its imports, names and syntax, and keep what each test checks. Change no other file, and do not touch the code under test.',
          });
          await restore();
          const back = await takeOut();
          if (back.fresh.length) fresh = back.fresh;
          else for (const f of fresh) await cp(path.join(dir, f), path.join(harness, f)).catch(() => {});
          rounds.push({
            n: roundNo,
            what: 'proof',
            tests: [],
            why: 'the proof did not run (' + String(said).slice(0, 120) + ')',
          });
          continue;
        }
        let who = null;
        if (
          !canDraft ||
          roundNo === MAX ||
          !(who = await redraftBy(
            'ran NO tests with that command (' + said + ')',
            'Write it again so that the command finds and runs its tests.' +
              (recipe.parse === 'unittest'
                ? ' For this command that means: import unittest, then one class ProofTest(unittest.TestCase) whose methods are each named test_ and something, and nothing that has to be run by hand.'
                : recipe.parse === 'tap'
                  ? ' For this command that means an ES module: import test from "node:test", import the project\'s own files from "../<file>", and call test(name, fn) at the top level of the file.'
                  : ''),
          ))
        )
          return fail('The proof did not run on the change: ' + said + '.');
        rounds.push({
          n: roundNo,
          what: 'proof',
          tests: [],
          by: who.seat,
          why: 'the proof ran no tests (' + String(said).slice(0, 120) + '), so ' + who.name + ' wrote it again',
        });
        continue;
      }
      rows = verdicts(red, green);
      const failing = rows.filter((x) => x.change !== 'green');
      const proven = rows.some((x) => x.verdict === 'proven');
      ok = proven && !failing.length && !rows.some((x) => x.verdict === 'norun');
      if (ok || !ask || roundNo === MAX || Date.now() > until) break;
      if (!failing.length) {
        // every check passes on the old code as well: nothing here tests what was asked
        let who = null;
        if (
          !canDraft ||
          !(who = await redraftBy(
            'proved nothing: every one of its tests passes on the code BEFORE the change as well',
            'Write it again with a test of what the task asked for, one that fails on the old code and passes on the changed code.' +
              (/\b(slow|fast|faster|quick|seconds?|minutes?|milliseconds|hangs?|speed|takes)\b/i.test(task)
                ? " The task is about time: build the big input it describes, at the size it names, time the call, and assert the limit it gives. If such a test passed on the old code, its input was too easy: make it the old code's worst case (for a search through a list, items that are all different)."
                : ''),
          ))
        )
          break;
        rounds.push({
          n: roundNo,
          what: 'proof',
          tests: [],
          by: who.seat,
          why: 'none of its checks failed before the change, so it proved nothing, and ' + who.name + ' wrote it again',
        });
        continue;
      }
      onStep('Weighing what failed');
      let proof = await text(proofFile).catch(() => '');
      const fixedChecks = [];
      const wrongCode = [];
      const handChecks = [];
      const rewrites = [];
      for (const failure of failing.slice(0, 5)) {
        const raw = (green.names && green.names.get(failure.test)) || '';
        const was = tried.get(failure.test) || 0;
        const ran = wholeAt(
          green.why.get(failure.test) || failure.why || 'it failed',
          (recipe.parse === 'unittest' && raw && testLines(proof, raw)) || [],
        );
        const eq0 = recipe.parse === 'tap' ? jsEquality(proof, failure.test, ran) : equalityOf(ran);
        const equality = eq0 && /\w\s*\(/.test(eq0.call) ? eq0 : null; // only a call into the project can be asked of the task's rule: a test's own counter cannot
        const inCheck =
          /^(NameError|SyntaxError|IndentationError|UnboundLocalError)\b/.test(ran) &&
          green.frames &&
          String(green.frames.get(failure.test) || '').includes(recipe.dest + '/');
        if (was >= 2) {
          stuck =
            'the check "' +
            failure.test +
            '" still fails after it was put right twice (' +
            String(ran).slice(0, 160) +
            ')';
          break;
        }
        let verdict = '';
        let why = '';
        let derived = '';
        const lost = (/^ModuleNotFoundError: No module named '([\w.]+)'/.exec(ran) || [])[1] || '';
        const notOurs =
          !!lost &&
          !(await exists(path.join(dir, lost.split('.')[0] + '.py'))) &&
          !(await exists(path.join(dir, lost.split('.')[0]))); // it imports a module the project does not have, changed or not
        // the check's own slip, with Python's own word for what was meant: its line takes that name (only where the task never uses the wrong one)
        const meant = /^AttributeError: .* has no attribute '(\w+)'\. Did you mean: '(\w+)'\?/.exec(ran);
        const own = green.frames && String(green.frames.get(failure.test) || '').includes(recipe.dest + '/');
        if (meant && own && raw && recipe.parse === 'unittest' && !new RegExp('\\b' + meant[1] + '\\b').test(task)) {
          const tl = testLines(proof, raw) || [];
          const hits = tl.filter((l) => new RegExp('\\.' + meant[1] + '\\b(?!\\w)').test(l));
          if (hits.length) {
            let next = proof;
            for (const l of hits)
              if (next.split(l).length === 2)
                next = next.replace(l, () =>
                  l.replace(new RegExp('\\.' + meant[1] + '\\b(?!\\w)', 'g'), '.' + meant[2]),
                );
            if (next !== proof && was < 2) {
              proof = next;
              fixedChecks.push({
                test: failure.test,
                how: 'corrected',
                why:
                  'it used ' +
                  meant[1] +
                  ', which the project does not have, where Python itself says ' +
                  meant[2] +
                  ' is meant',
              });
              tried.set(failure.test, was + 1);
              continue;
            }
          }
        }
        if (inCheck) {
          verdict = 'drop';
          why =
            'it stopped on its own lines before it tested anything (' +
            String(ran).split(', at:')[0].slice(0, 120) +
            ')';
        } else if (notOurs) {
          verdict = 'drop';
          why = 'it imports ' + lost + ', which is not in this project';
        } else if (equality) {
          // an equality: what do the task's own rules make it?
          const ls = (recipe.parse === 'unittest' && raw && testLines(proof, raw)) || [];
          const at = ls.indexOf((/, at: (.+)$/.exec(ran) || [])[1]);
          const before = (at > 0 ? ls.slice(0, at) : []).filter((l) => !/^(from|import) /.test(l)); // what the test did before the line that failed: a value that depends on it cannot be worked out without it
          const said = String(
            await ask({
              system: REFEREE,
              prompt: deriveAsk(task, equality.call, equality.before || before),
              max: 300,
            }).catch(() => ''),
          );
          const ans = (/ANSWER:\s*(.+?)\s*$/m.exec(said) || [])[1] || '';
          if (ans && sameValue(ans, equality.gave)) {
            verdict = 'fix';
            why =
              equality.call +
              ": the task's rule gives " +
              equality.gave +
              ', and the check expected ' +
              equality.wanted;
          } else if (ans && sameValue(ans, equality.wanted)) {
            verdict = 'code';
            why =
              equality.call +
              ' must give ' +
              equality.wanted +
              " by the task's rule, and the code gives " +
              equality.gave;
          }
          // NEITHER SIDE HAS IT, and the task itself quotes the value: the task settles both. The check's one line is corrected to it and
          // the code is put right to it, in the same round. (Found for real: the check had one space where the ticket has two, and the
          // code had a dollar sign too many. Each was wrong, and the ticket said what was right.)
          else if (ans && bare(ans).length >= 3 && task.includes(bare(ans))) {
            verdict = 'both';
            derived = bare(ans);
            why =
              equality.call +
              ': the task itself says ' +
              derived +
              '. The check expected ' +
              equality.wanted +
              ' and the code gives ' +
              equality.gave;
          } else if (ans) derived = bare(ans); // the task's rule, as worked out, gives something the code does not: whatever else is decided, this check is not taken out
        }
        if (!verdict) {
          const said = String(
            await ask({ system: REFEREE, prompt: refereeAsk(task, proof, failure.test, ran), max: 420 }).catch(
              () => '',
            ),
          );
          const v0 = verdictIn(said);
          const v =
            v0 ||
            verdictIn(
              String(
                await ask({
                  system: REFEREE,
                  prompt:
                    refereeAsk(task, proof, failure.test, ran) + '\n\nReply with the verdict line and nothing else.',
                  max: 40,
                }).catch(() => ''),
              ),
            ); // a reply that ran out before its verdict is asked for the verdict alone
          verdict = v === 'check' ? 'rewrite' : v === 'code' ? 'code' : '';
          why =
            said
              .replace(/VERDICT:[\s\S]*$/i, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 220) || String(ran).slice(0, 200);
          if (verdict === 'rewrite' && derived) {
            verdict = '';
            why =
              "the referee blamed the check, but by the task's rule " +
              equality.call +
              ' gives ' +
              derived +
              ', which is not what the code gives (' +
              equality.gave +
              ')';
          }
        } // two readings disagree: nothing is taken out on one of them
        if (verdict === 'both' && (recipe.parse === 'unittest' || recipe.parse === 'tap')) {
          // the check's one line takes the task's own value, and the code is put right to it
          const line = (/, at: (.+)$/.exec(ran) || [])[1] || '';
          const n = proof.split(line).length - 1;
          const cut = line.lastIndexOf(equality.expected);
          const q = /^['"]/.test(equality.expected) ? equality.expected[0] : '';
          const lit = q
            ? q +
              derived
                .replace(/\\/g, '\\\\')
                .split(q)
                .join('\\' + q) +
              q
            : derived;
          const mended =
            recipe.parse === 'tap'
              ? mendJs(proof, failure.test, equality.expected, lit)
              : line && n === 1 && cut >= 0
                ? proof.replace(line, () => line.slice(0, cut) + lit + line.slice(cut + equality.expected.length))
                : raw
                  ? mendIn(proof, raw, equality.expected, lit)
                  : null;
          if (mended) {
            proof = mended;
            fixedChecks.push({ test: failure.test, how: 'corrected', why });
          }
          wrongCode.push({
            test: failure.test,
            why: equality.call + ' must give ' + derived + ', as the task says, and the code gives ' + equality.gave,
            ran: String(ran).slice(0, 200),
          });
          tried.set(failure.test, was + 1);
          continue;
        }
        if (verdict === 'both') verdict = 'code';
        // A CHECK IS NEVER TAKEN OUT ON A REFEREE'S WORD. Found for real, twice: the code was wrong, the check that caught it was blamed and
        // removed, and the change went green with nothing left to catch it. A check the referee blames is written again against the task,
        // for the same case; if it still fails, that is said. Only a check that cannot run at all (above) is ever removed.
        // IS IT SOMETHING THE TASK ASKS FOR AT ALL? A check of a requirement the model made up cannot be written "again against the task":
        // there is nothing in the task to write it against. When no sentence of the task asks for what it checks, and the proof still
        // proves something without it, it is taken out. That is the only thing a referee's doubt can ever remove.
        if (verdict === 'rewrite' && failure.base === 'green' && rows.some((v) => v.verdict === 'proven')) {
          const second = verdictIn(
            String(
              await ask({
                system: REFEREE,
                seat: 'master',
                temperature: Math.min(0.5, TEMPER.master.warmth),
                prompt: refereeAsk(task, proof, failure.test, ran),
                max: 420,
              }).catch(() => ''),
            ),
          );
          if (second === 'check') {
            verdict = 'drop';
            why =
              'it expects what the code did before the change, which is what the change was asked to stop: it passes on the old code and fails on the new, and two of the team, asked separately, read the task and found the check mistaken';
          }
        }
        if (verdict === 'rewrite' && rows.some((v) => v.verdict === 'proven') && !askedFor(task, failure.test, 3)) {
          const q = String(
            await ask({ system: REFEREE, prompt: requireAsk(task, proof, failure.test), max: 160 }).catch(() => ''),
          );
          if (/QUOTE:\s*NONE\b/i.test(q)) {
            verdict = 'drop';
            why = "it checks something no sentence of the task asks for, and its name is not in the task's own words";
          }
        }
        if (verdict === 'fix' && recipe.parse === 'tap') {
          const mended = mendJs(proof, failure.test, equality.expected, equality.gave);
          if (mended) {
            proof = mended;
            fixedChecks.push({ test: failure.test, how: 'corrected', why });
            continue;
          }
          verdict = 'drop';
        }
        if (verdict === 'rewrite') {
          (canDraft ? rewrites : handChecks).push({ test: failure.test, why, ran: String(ran).slice(0, 200) });
          tried.set(failure.test, was + 1);
          continue;
        }
        if (verdict === 'fix' && recipe.parse === 'unittest') {
          // the one line, with the value two readings agree on
          const line = (/, at: (.+)$/.exec(ran) || [])[1] || '';
          const n = proof.split(line).length - 1;
          const cut = line.lastIndexOf(equality.expected);
          if (line && n === 1 && cut >= 0) {
            proof = proof.replace(
              line,
              () => line.slice(0, cut) + equality.gave + line.slice(cut + equality.expected.length),
            );
            fixedChecks.push({ test: failure.test, how: 'corrected', why });
            continue;
          }
          const mended = raw ? mendIn(proof, raw, equality.expected, equality.gave) : null;
          if (mended) {
            proof = mended;
            fixedChecks.push({ test: failure.test, how: 'corrected', why });
            continue;
          }
          verdict = 'drop'; // the task's rule and the code agree and the check does not: with its line not to be found, the check goes
        }
        if (verdict === 'drop' && recipe.parse === 'unittest' && raw) {
          const less = dropTest(proof, raw);
          if (less && /def test_\w+/.test(less)) {
            proof = less;
            fixedChecks.push({ test: failure.test, how: 'taken out', why });
            continue;
          }
        }
        if (verdict === 'drop' && (recipe.parse === 'tap' || recipe.parse === 'dartjson')) {
          const less = dropJsTest(proof, failure.test);
          if (less && /\b(test|it)\(/.test(less)) {
            proof = less;
            fixedChecks.push({ test: failure.test, how: 'taken out', why });
            continue;
          }
        }
        if (verdict === 'code') {
          wrongCode.push({ test: failure.test, why, ran: String(ran).slice(0, 200), again: was > 0 });
          tried.set(failure.test, was + 1);
          continue;
        }
        if (verdict === 'drop' || verdict === 'fix') {
          handChecks.push({ test: failure.test, why, ran: String(ran).slice(0, 200) });
          tried.set(failure.test, was + 1);
          continue;
        } // a mistaken check that cannot be mended line by line here goes to the agent to correct
        stuck =
          'nothing could settle whether the check "' +
          failure.test +
          '" or the code is wrong (' +
          String(ran).slice(0, 160) +
          ')';
        break;
      }
      if (stuck) break;
      if (fixedChecks.length) {
        onStep('Correcting the proof');
        await writeFile(proofFile, shaped(recipe, proof).replace(/\s+$/, '') + '\n');
        rounds.push({
          n: roundNo,
          what: 'check',
          tests: fixedChecks.map((c) => c.test),
          why: fixedChecks.map((c) => '"' + c.test + '" was ' + c.how + ': ' + c.why).join('; '),
        });
      }
      if (handChecks.length) {
        onStep('Correcting the proof');
        await byAgent(handChecks);
        rounds.push({
          n: roundNo,
          what: 'check',
          tests: handChecks.map((c) => c.test),
          why: handChecks.map((c) => '"' + c.test + '" was corrected: ' + c.why).join('; '),
        });
      }
      if (wrongCode.length) {
        onStep('Putting the change right');
        const whole =
          rewrite && wrongCode.some((c) => c.again)
            ? await rewrite({
                idea: null,
                fails: wrongCode
                  .map((c) => c.test + ': ' + c.why)
                  .join('; ')
                  .slice(0, 700),
              }).catch(() => 0)
            : 0; // shown wrong twice by the same check: the file is written out whole instead of edited again
        if (!whole) await write({ prompt: repairAsk(task, wrongCode) });
        await hold();
        for (const f of await news()) await rm(path.join(dir, f), { force: true }).catch(() => {});
        rounds.push({ n: roundNo, what: 'code', tests: wrongCode.map((c) => c.test), why: wrongCode[0].why });
      }
      if (rewrites.length) {
        onStep('Writing a check again');
        const was = await text(proofFile).catch(() => '');
        const had = countTests(was);
        const done = await redraft(
          'has ' +
            (rewrites.length === 1 ? 'a test that fails' : 'tests that fail') +
            ' on the changed code and may be mistaken: ' +
            rewrites.map((c) => '"' + c.test + '" (' + c.ran + ')').join('; '),
          'Check each of those tests against the task word by word, and write it again so that it checks what the task requires for the same case. Keep every other test exactly as it is. Remove none: the file must have as many tests as before.',
        );
        if (done && countTests(await text(proofFile).catch(() => '')) >= had)
          rounds.push({
            n: roundNo,
            what: 'check',
            tests: rewrites.map((c) => c.test),
            why: rewrites.map((c) => '"' + c.test + '" was written again against the task: ' + c.why).join('; '),
          });
        else {
          await writeFile(proofFile, was);
          stuck =
            'the check "' +
            rewrites[0].test +
            '" fails, and it could not be written again without losing it (' +
            rewrites[0].ran.slice(0, 140) +
            ')';
          break;
        }
      }
      if (!fixedChecks.length && !wrongCode.length && !handChecks.length && !rewrites.length) {
        stuck = 'what failed could not be put right';
        break;
      }
    }
    // 4. DOES ANYONE HAVE ANY IDEAS? (swarm.mjs) The loop above has given up with a check still failing. The builder asks the room: each
    //    seat reads the task, the code and the failing check from its own temper and says where it would look, one thing to try, and
    //    which of the three it thinks is mistaken. Then, in this order and only one of them:
    //      a value in dispute that the room works out the same way, and that is what the code gives: the check takes that value
    //      most of the room blames the code: each different idea is tried from the same starting point, and the proof decides
    //      most of the room blames the check: it is written again against the task, and the file may not lose a test
    //    A split room settles nothing, and that is said. Nothing is ever taken out here.
    let room = null;
    const judged = (rs) =>
      rs.some((q) => q.verdict === 'proven') &&
      !rs.some((q) => q.change !== 'green') &&
      !rs.some((q) => q.verdict === 'norun');
    const TESTFILE =
      /(^|\/)(test_[\w-]+\.py|[\w-]+_test\.(py|dart)|[\w.-]+\.(test|spec)\.[cm]?[jt]sx?|\w+Tests?\.(swift|kt|java))$/;
    const stillFailing = red ? rows.filter((q) => q.change !== 'green') : [];
    if (!ok && ask && red && stillFailing.length && process.env.FO_NO_ROOM !== '1') {
      onStep('Asking the room for ideas');
      const proof = await text(proofFile).catch(() => '');
      const failure = stillFailing[0];
      const raw = (green.names && green.names.get(failure.test)) || '';
      const ls = (recipe.parse === 'unittest' && raw && testLines(proof, raw)) || [];
      const ran = wholeAt(green.why.get(failure.test) || failure.why || 'it failed', ls);
      const eq0 = recipe.parse === 'tap' ? jsEquality(proof, failure.test, ran) : equalityOf(ran);
      const equality = eq0 && /\w\s*\(/.test(eq0.call) ? eq0 : null;
      const jt = recipe.parse === 'tap' || recipe.parse === 'dartjson' ? jsTest(proof, failure.test) : null;
      const checkText = (
        recipe.parse === 'unittest' && raw
          ? ['def ' + raw + '(self):', ...ls.map((l) => '    ' + l)].join('\n')
          : jt
            ? jt.text
            : ''
      ).slice(0, 1500);
      const files = [...held.keys()].filter((f) => !TESTFILE.test(f)).slice(0, 3);
      const code = (
        await Promise.all(
          files.map(async (f) => 'The file ' + f + ':\n' + (await text(path.join(dir, f))).slice(0, 3500)),
        )
      ).join('\n\n');
      const fails = stillFailing
        .slice(0, 3)
        .map(
          (f) => 'the check "' + f.test + '": ' + String(green.why.get(f.test) || f.why || 'it failed').slice(0, 220),
        );
      const answers = await askRoom({
        ask,
        problem: {
          task,
          code,
          check: checkText,
          fails,
          tried: rounds.map((q) => String(q.why).slice(0, 180)).slice(-4),
          call: equality ? equality.call : '',
        },
      });
      const votes = tally(answers);
      const tries = [];
      const roomUntil = Date.now() + (Number(process.env.FO_ROOM_BUDGET_MS) || 8 * 60000);
      let came = '';
      const rerun = async () => {
        await hold();
        ({ green, red } = await both());
        if (red) {
          rows = verdicts(red, green);
          ok = judged(rows);
        }
        return !!red;
      };
      if (
        answers.length &&
        equality &&
        votes.value &&
        sameValue(votes.value, equality.gave) &&
        !sameValue(votes.value, equality.wanted) &&
        (recipe.parse === 'unittest' || recipe.parse === 'tap')
      ) {
        const mended =
          recipe.parse === 'tap'
            ? mendJs(proof, failure.test, equality.expected, equality.gave)
            : raw
              ? mendIn(proof, raw, equality.expected, equality.gave)
              : null;
        if (mended) {
          onStep('Correcting the proof');
          await writeFile(proofFile, shaped(recipe, mended).replace(/\s+$/, '') + '\n');
          await rerun();
          came =
            votes.agree +
            ' of the ' +
            votes.gave +
            ' who worked ' +
            equality.call +
            ' out from the task got ' +
            votes.value +
            ', which is what the code gives, so the check was corrected to it';
        }
      }
      const blamesCode =
        (votes.code > votes.check && votes.code >= 3) ||
        !!(equality && votes.value && sameValue(votes.value, equality.wanted));
      const ideas = answers
        .filter((a) => a.idea && a.blame !== 'CHECK')
        .map((a) => (a.seat === 'overseer' ? { ...a, fresh: true } : a));
      if (!ok && !came && !independent && answers.length)
        came =
          (blamesCode
            ? 'most of the room thinks the code is mistaken here'
            : votes.check > votes.code
              ? 'most of the room thinks the check is mistaken here'
              : 'the room is split') +
          ' (' +
          votes.code +
          ' blamed the code, ' +
          votes.check +
          ' the check). Every seat thinks with the same model, so that is one opinion several times over: it is said for you to weigh, and nothing was changed on it';
      if (!ok && !came && blamesCode && ideas.length) {
        const snap = await snapOf(dir);
        const must =
          equality && votes.value && !sameValue(votes.value, equality.gave)
            ? equality.call + ' must give ' + votes.value
            : '';
        const ideaAsk = (idea) =>
          'You are working in a clone of a repository, in the current folder. ' +
          (idea.fresh
            ? 'A change was made here for the task below. It did not hold and it has been thrown away: the files are as they were before it. Make the change again, from the start.'
            : 'A change was made here for the task below, and it does not hold yet.') +
          '\n\n' +
          task +
          '\n\nWhat failed:\n' +
          fails.map((f) => '- ' + f).join('\n') +
          (must ? "\n\nBy the task's own rule, " + must + '.' : '') +
          '\n\n' +
          idea.name +
          ', on your team, has this idea' +
          (idea.where ? ' (' + idea.where + ')' : '') +
          ':\n\n' +
          idea.idea +
          "\n\nDo it that way. Read the files first. Change only the project's own files and write no tests. Do not run git. When it is done, say in one sentence what you changed.";
        const got = await tryIdeas({
          ideas,
          snap,
          dir,
          start: stillFailing.length,
          limit: recipe.kind === 'android' || recipe.kind === 'swift' ? 2 : 3,
          until: roomUntil,
          onStep,
          onlyGreen: true,
          apply: async (idea) => {
            const did = rewrite
              ? await rewrite({
                  idea,
                  fails: fails.join('; ').slice(0, 600) + (must ? ". By the task's own rule, " + must + '.' : ''),
                }).catch(() => 0)
              : 0;
            if (!did) await write({ prompt: ideaAsk(idea) });
            for (const f of await news()) {
              if (TESTFILE.test(f)) await rm(path.join(dir, f), { force: true }).catch(() => {});
              else before.add(f);
            }
          },
          score: async () => {
            if (!(await rerun())) return { ok: false, failing: Infinity, why: 'it did not run' };
            return {
              ok,
              failing:
                rows.filter((q) => q.change !== 'green').length + (rows.some((q) => q.verdict === 'broken') ? 100 : 0),
            };
          },
        });
        tries.push(...got.tries);
        if (!got.best.ok) await rerun(); // the working copy is back at whichever got furthest: the table is that one's
        came = got.best.ok
          ? got.best.idea.name + "'s idea was tried, and with it every check passes"
          : got.tries.length
            ? got.tries.map((q) => q.name + "'s idea").join(' and ') +
              (got.tries.length === 1 ? ' was' : ' were') +
              ' tried, and none made every check pass, so the change is as it stood before the room was asked'
            : '';
      }
      if (!ok && !came && !blamesCode && votes.check >= 3 && votes.check > votes.code) {
        onStep('Writing a check again');
        const had = countTests(proof);
        const why = answers
          .filter((a) => a.blame === 'CHECK' && a.idea)
          .map((a) => a.name + ': ' + a.idea)
          .join(' / ')
          .slice(0, 600);
        if (canDraft) {
          const done = await redraft(
            'has a test that fails on the changed code, and ' +
              votes.check +
              ' of the ' +
              votes.of +
              ' people who read it against the task think the test itself is mistaken ("' +
              failure.test +
              '": ' +
              String(ran).slice(0, 160) +
              '). What they said: ' +
              why,
            'Write that one test again so that it checks what the task requires for the same case. Keep every other test exactly as it is. Remove none: the file must have as many tests as before.',
          );
          if (done && countTests(await text(proofFile).catch(() => '')) >= had) {
            await rerun();
            came =
              votes.check +
              ' of ' +
              votes.of +
              ' read the check against the task and found the check mistaken, so it was written again';
          } else await writeFile(proofFile, proof);
        } else {
          await byAgent([
            {
              test: failure.test,
              ran: String(ran).slice(0, 200),
              why: 'the room read it against the task and thinks it is mistaken: ' + why,
            },
          ]);
          await rerun();
          came =
            votes.check +
            ' of ' +
            votes.of +
            ' read the check against the task and found the check mistaken, so it was corrected';
        }
      }
      room = {
        asked: answers.length,
        tally: votes,
        lines: roomLines(answers, tries),
        came:
          came ||
          (answers.length
            ? 'the room was split (' +
              votes.code +
              ' blamed the code, ' +
              votes.check +
              ' the check' +
              (votes.task ? ', ' + votes.task + ' the task' : '') +
              '), so nothing was changed on its say'
            : 'nobody had an idea'),
      };
      if (ok) stuck = '';
      rounds.push({
        n: rounds.length + 2,
        what: 'room',
        tests: [failure.test],
        why:
          'the room was asked for ideas (' +
          (answers.map((a) => a.name).join(', ') || 'nobody answered') +
          '): ' +
          room.came,
      });
    }
    let challenge = null;
    if (
      ok &&
      ask &&
      recipe.file &&
      drafts(recipe) &&
      (recipe.parse === 'unittest' || recipe.parse === 'tap') &&
      process.env.FO_NO_CHALLENGE !== '1' &&
      Date.now() < until + 3 * 60000
    ) {
      onStep('Challenging the change');
      const cfile = recipe.parse === 'unittest' ? 'test_challenge.py' : 'challenge.test.mjs';
      const r2 = { ...recipe, file: cfile, run: recipe.run.map((a) => String(a).split(recipe.file).join(cfile)) };
      const cpath = path.join(path.dirname(proofFile), cfile);
      const body = codeIn(
        await ask({
          seat: 'steward',
          temperature: 0.15,
          max: 1500,
          system:
            DRAFTER +
            ' You are the sceptic of the team: you believe nothing you have not seen, and you look for the case nobody tried.',
          prompt:
            draftAsk(r2, task, await specOf(dir, changed)) +
            '\n\nTHIS FILE IS A CHALLENGE TO THE CHANGE, not its first proof, so rules 1 and 3 do not apply. The change already passes these checks:\n' +
            rows.map((q) => '- ' + q.test).join('\n') +
            "\n\nWrite up to three MORE tests, each for a case that the task's own words decide and those checks do not try: the edge of a rule, the point where two rules meet, an empty input or a single one, a value just inside a limit and one just outside it. Repeat none of the checks above, and test nothing the task does not state. At most three tests.",
        }).catch(() => ''),
      );
      if (looksLikeTest(body)) {
        await writeFile(cpath, shaped(r2, body) + '\n');
        const runIt = async () => {
          await mkdir(path.join(trees.green, recipe.dest), { recursive: true });
          await cp(cpath, path.join(trees.green, recipe.dest, cfile));
          const got = await side(r2, trees.green);
          await rm(path.join(trees.green, recipe.dest, cfile), { force: true }).catch(() => {});
          return got;
        };
        let run = await runIt();
        const found = [];
        const left = [];
        const doubt = [];
        const tests = [...run.rows.keys()];
        for (const [name, pass] of run.rows) {
          if (pass) continue;
          const cbody = await text(cpath).catch(() => '');
          const raw = (run.names && run.names.get(name)) || '';
          const lines = (recipe.parse === 'unittest' && raw && testLines(cbody, raw)) || [];
          const ran = wholeAt(run.why.get(name) || 'it failed', lines);
          const eq0 = recipe.parse === 'tap' ? jsEquality(cbody, name, ran) : equalityOf(ran);
          const equality = eq0 && /\w\s*\(/.test(eq0.call) ? eq0 : null;
          const jury = async () => {
            let code = 0;
            let chk = 0;
            for (const who of ['steward', 'overseer', 'master']) {
              const v = verdictIn(
                String(
                  await ask({
                    system: REFEREE,
                    seat: who,
                    temperature: who === 'steward' ? 0 : Math.min(0.5, TEMPER[who].warmth),
                    prompt: refereeAsk(task, cbody, name, ran),
                    max: 420,
                  }).catch(() => ''),
                ),
              );
              if (v === 'code') code++;
              else if (v === 'check') chk++;
            }
            return { code, chk };
          };
          const about = stems(String(name)).size >= 2 && askedFor(task, name); // is this check about something the task says?
          if (!equality) {
            const j = await jury();
            if (j.code === 3)
              found.push({
                test: name,
                why:
                  'three of the team, asked separately, read the task and found the code wrong in this case (' +
                  String(ran).slice(0, 140) +
                  ')',
                ran: String(ran).slice(0, 200),
              });
            else if (about && j.chk < 3) doubt.push({ test: name, ran: String(ran).slice(0, 160) });
            else left.push(name);
            continue;
          }
          const at = lines.indexOf((/, at: (.+)$/.exec(ran) || [])[1]);
          const before2 = (at > 0 ? lines.slice(0, at) : []).filter((l) => !/^(from|import) /.test(l));
          const said = String(
            await ask({
              system: REFEREE,
              prompt: deriveAsk(task, equality.call, equality.before || before2),
              max: 300,
            }).catch(() => ''),
          );
          const ans = (/ANSWER:\s*(.+?)\s*$/m.exec(said) || [])[1] || '';
          if (ans && sameValue(ans, equality.wanted) && !sameValue(ans, equality.gave))
            found.push({
              test: name,
              why:
                equality.call +
                ' must give ' +
                equality.wanted +
                " by the task's rule, and the code gives " +
                equality.gave,
              ran: String(ran).slice(0, 200),
            });
          else if (ans && sameValue(ans, equality.gave))
            left.push(name); // the task's rule, worked out afresh, gives what the code gives: the challenger's own mistake
          else if (about && (await jury()).chk < 3) doubt.push({ test: name, ran: String(ran).slice(0, 160) });
          else left.push(name);
        }
        challenge = {
          tests: tests.length,
          passed: tests.length - found.length - left.length - doubt.length,
          left: left.length,
          doubt: doubt.map((f) => f.test),
          found: found.map((f) => f.test),
          fixed: false,
        };
        if (doubt.length && !found.length) {
          ok = false;
          stuck =
            'a further check, written from the task to challenge the change, fails, and the team could not settle whether it or the code is mistaken: "' +
            doubt[0].test +
            '" (' +
            doubt[0].ran +
            ')';
          rounds.push({
            n: rounds.length + 2,
            what: 'challenge',
            tests: doubt.map((f) => f.test),
            why:
              'a further check, written from the task to challenge the change, fails (' +
              doubt[0].ran +
              '), and the team could not settle whether the check or the code is mistaken. So the change is not called proven',
          });
        }
        if (found.length) {
          onStep('Putting the change right');
          const snap = await snapOf(dir);
          if (
            !(rewrite
              ? await rewrite({
                  idea: null,
                  fails: found
                    .map((f) => f.test + ': ' + f.why)
                    .join('; ')
                    .slice(0, 700),
                }).catch(() => 0)
              : 0)
          )
            await write({ prompt: repairAsk(task, found) });
          await hold();
          for (const f of await news()) await rm(path.join(dir, f), { force: true }).catch(() => {});
          ({ green, red } = await both());
          const rows2 = red ? verdicts(red, green) : [];
          const ok2 = red ? judged(rows2) : false;
          run = ok2 ? await runIt() : run;
          if (ok2 && found.every((f) => run.rows.get(f.test) === true)) {
            rows = rows2;
            challenge.fixed = true;
            rounds.push({
              n: rounds.length + 2,
              what: 'challenge',
              tests: found.map((f) => f.test),
              why:
                'a further check, written from the task to challenge the change, showed it wrong: ' +
                found[0].why +
                '. The code was put right, and the proof and the challenge both pass now',
            });
          } else {
            ok = false;
            if (red) rows = rows2;
            stuck =
              'a further check, written from the task to challenge the change, fails: "' +
              found[0].test +
              '" (' +
              found[0].why +
              ')';
            rounds.push({
              n: rounds.length + 2,
              what: 'challenge',
              tests: found.map((f) => f.test),
              why:
                'a further check, written from the task to challenge the change, showed it wrong, and it could not be put right: ' +
                found[0].why,
            });
            void snap;
          }
        }
      }
    }
    const fixes = rounds;
    const went = rounds.length
      ? ' It took ' +
        (rounds.length + 1) +
        ' rounds: ' +
        rounds
          .map((x) =>
            x.what === 'check'
              ? 'what was mistaken in the proof itself was corrected or taken out'
              : x.what === 'code'
                ? 'the change was put right where a check showed it wrong'
                : x.what === 'room'
                  ? 'the room was asked for ideas'
                  : x.what === 'challenge'
                    ? 'a further check written to challenge the change found a fault'
                    : 'the proof was written again',
          )
          .filter((t, i, a) => a.indexOf(t) === i)
          .join(', and ') +
        '.'
      : '';
    const fixed = went;
    const frames = {
      green: await framesOf(trees.green, recipe, path.join(home, 'frames', 'after')),
      red: await framesOf(trees.red, recipe, path.join(home, 'frames', 'before')),
    };

    onStep('Writing the steps to check it');
    let steps =
      recipe.parse === 'unittest'
        ? stepsOf(await text(proofFile).catch(() => ''), rows, green && green.names, changed)
        : recipe.parse === 'tap'
          ? stepsOfJs(await text(proofFile).catch(() => ''), rows, changed)
          : [];
    // otherwise the team's model writes them, and a step that brings a number of its own (one in neither the task nor a check) is left out
    if (!steps.length) {
      const known = new Set((task + ' ' + rows.map((x) => x.test).join(' ')).match(/\d+(?:\.\d+)?/g) || []);
      try {
        steps = ((await stepsFor({ task, rows })) || []).filter((s) =>
          (String(s).match(/\d{2,}(?:\.\d+)?/g) || []).every((n) => known.has(n)),
        );
      } catch {
        steps = [];
      }
    }
    if (!steps.length)
      steps = [
        'Open the change the team made for "' + task + '".',
        ...rows.filter((x) => x.verdict === 'proven').map((x) => 'Check that: ' + x.test + '.'),
        ...rows.filter((x) => x.verdict === 'guard').map((x) => 'Check it is still true that: ' + x.test + '.'),
      ];
    onStep('Drawing the proof image');
    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    const pic = await draw(
      sheet({
        task,
        repo,
        rows,
        ok,
        steps,
        setup: '',
        frames,
        seconds,
        recipe: recipe.name,
        said: saidOf(written && written.said),
        at: Date.now(),
        checked,
      }),
      path.join(home, 'proof.png'),
      home,
    );
    return {
      ok,
      id,
      at: Date.now(),
      kind: recipe.kind,
      recipe: recipe.name,
      rows,
      steps,
      seconds,
      image: pic.ok,
      imageWhy: pic.ok ? '' : pic.why,
      files: fresh,
      medium: medium(task),
      fixes,
      rounds,
      stuck,
      room,
      challenge,
      word: checked ? 'checked' : 'proven',
      says: ok
        ? rows.filter((x) => x.verdict === 'proven').length +
          ' of ' +
          rows.length +
          ' checks fail before the change and pass after it.' +
          fixed +
          (challenge && challenge.tests && !challenge.found.length
            ? ' ' +
              (challenge.passed === 1 ? 'One further check' : challenge.passed + ' further checks') +
              ', written to challenge it, also ' +
              (challenge.passed === 1 ? 'passes.' : 'pass.')
            : challenge && challenge.fixed
              ? ' A further check written to challenge it found a fault, which was put right.'
              : '')
        : stuck
          ? 'The team could not settle it by itself: ' + stuck + '.' + went
          : rows.some((x) => x.verdict === 'broken')
            ? 'A check that passed before the change fails after it' +
              (fixes.length ? ', after ' + (rounds.length + 1) + ' rounds' : '') +
              ': ' +
              (rows.find((x) => x.verdict === 'broken').why || rows.find((x) => x.verdict === 'broken').test).slice(
                0,
                160,
              ) +
              '.'
            : rows.some((x) => x.verdict === 'base')
              ? 'A check still fails after the change: ' +
                rows.find((x) => x.verdict === 'base').test +
                (rows.find((x) => x.verdict === 'base').why
                  ? ' (' + String(rows.find((x) => x.verdict === 'base').why).slice(0, 120) + ')'
                  : '') +
                '.'
              : rows.some((x) => x.verdict === 'norun')
                ? 'The proof did not run on the code before the change, so it proves nothing yet.'
                : 'No check fails before the change and passes after it, so the change is not proven.',
    };
  } catch (e) {
    return fail('The proof stopped: ' + String((e && e.message) || e).slice(0, 200));
  } finally {
    for (const k of ['green', 'red']) await git(dir, ['worktree', 'remove', '--force', trees[k]]).catch(() => {});
    await git(dir, ['worktree', 'prune']).catch(() => {});
    await rm(trees.green, { recursive: true, force: true }).catch(() => {});
    await rm(trees.red, { recursive: true, force: true }).catch(() => {});
  }
}
