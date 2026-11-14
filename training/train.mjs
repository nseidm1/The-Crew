// train.mjs - THE TEAM, MEASURED ON REAL TICKETS (Developer mode). Every scenario in scenarios.mjs goes through the runner's own routes the way
// the chat sends it: the team looks, changes the code and proves it, and then a check the team never saw says whether "proven" was true.
// Nothing is stood in for: the model is the one that was set up, the repository is a real Git folder, the proof is the product's own.
// The same script measures a local model and Claude Code: only --setup differs, so the two can be laid side by side.
//
//   node training/train.mjs --check                          the scenarios themselves: each oracle red as it is, green on its reference fix. No model.
//   node training/train.mjs                                  every scenario this machine can check, 2 rounds each, on the local model
//   node training/train.mjs --rounds 4 --only slug,js-retry  some of them
//   node training/train.mjs --lang javascript --kind fix,enhance
//   node training/train.mjs --setup '{"model":"qwen35-27b"}' --label qwen35-27b
//   node training/train.mjs --setup '{"engine":"claude"}' --label claude --spend-claude
//
// WHAT A RUN IS CALLED
//   proven-right     the team said proven, and the oracle agrees          the only good one
//   false-green      the team said proven, and the oracle does not        the dangerous one: a customer would have landed it
//   right-unproven   the change is right, and the team could not prove it a cost in time, not in trust
//   wrong            neither
//   no-change        the team changed nothing, or the request failed
//   found / not-found   (a "find" ticket) the answer names what it had to name, or does not
// Rows go to .work/train/runs.jsonl (one a run, with the change and the proof it wrote); the summary goes to training/results/<label>.json,
// and every summary is also kept by time in training/results/history.jsonl so one night's runs can be compared.
// A run on Claude Code spends the customer's own plan, so it is refused without --spend-claude.
import { spawn, spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { SCENARIOS, taskOf } from './scenarios.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ROOT = path.join(REPO_ROOT, 'src');
const WORK = path.join(REPO_ROOT, '.work', 'train');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const has = (name) => process.argv.includes('--' + name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PY = process.env.FO_TRAIN_PYTHON || 'python3';
const csv = (name) => String(arg(name, '')).split(',').filter(Boolean);
const only = csv('only');
const langs = csv('lang');
const kinds = csv('kind');
const sets = csv('set'); // --set harder,media,first: the tickets added on 2026-11-13, those with attachments, or the ones before them
const HARD =
  /^(ts-|js-cart-view|js-bus|js-sort|py-refund|py-tier|kt-checkout-total|kt-stepper|dart-stepper|dart-summary|media-)/;
const inSet = (s) =>
  !sets.length ||
  sets.some((k) =>
    k === 'media' ? !!s.media : k === 'harder' ? HARD.test(s.id) : k === 'first' ? !HARD.test(s.id) : false,
  );
const list = SCENARIOS.filter(
  (s) =>
    (!only.length || only.includes(s.id)) &&
    (!langs.length || langs.includes(s.lang)) &&
    (!kinds.length || kinds.includes(s.kind)) &&
    inSet(s),
);
if (!list.length) {
  console.log('No scenario matches. There are: ' + SCENARIOS.map((s) => s.id).join(', '));
  process.exit(2);
}
fs.mkdirSync(WORK, { recursive: true });

// ---------- the oracle: the hidden check, against a folder ----------
const onPath = (cmd) => !spawnSync(cmd, ['--version'], { timeout: 20000 }).error;
const memo = (fn) => {
  let got;
  return () => (got === undefined ? (got = fn()) : got);
};
// SWIFT: the swift on the path, or, when that one is broken (Command Line Tools left over from another machine) and Xcode is installed, Xcode's
const swiftEnv = memo(() => {
  if (spawnSync('swift', ['--version'], { timeout: 30000 }).status === 0) return {};
  const dev = '/Applications/Xcode.app/Contents/Developer';
  return fs.existsSync(dev) &&
    spawnSync('swift', ['--version'], { timeout: 30000, env: { ...process.env, DEVELOPER_DIR: dev } }).status === 0
    ? { DEVELOPER_DIR: dev }
    : null;
});
// ANDROID: Java, the Android SDK, and a Gradle wrapper. A scenario cannot carry the wrapper's jar as text, so the wrapper is made once here by a
// Gradle this machine already has (under ~/.gradle/wrapper/dists) and put into each Android scenario's repository, as a real project has it.
const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  [path.join(os.homedir(), 'Library', 'Android', 'sdk'), path.join(os.homedir(), 'Android', 'Sdk')].find((d) =>
    fs.existsSync(d),
  ) ||
  '';
const gradleEnv = () => ({ ...process.env, ...(ANDROID_HOME ? { ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME } : {}) });
const wrapper = memo(() => {
  const at = path.join(WORK, 'gradle-wrapper');
  if (
    fs.existsSync(path.join(at, 'gradlew')) &&
    fs.existsSync(path.join(at, 'gradle', 'wrapper', 'gradle-wrapper.jar'))
  )
    return at;
  const dists = path.join(os.homedir(), '.gradle', 'wrapper', 'dists');
  let best = null;
  for (const d of fs.existsSync(dists) ? fs.readdirSync(dists) : []) {
    const m = /^gradle-(\d+)\.(\d+)(?:\.(\d+))?-(?:bin|all)$/.exec(d);
    if (!m) continue;
    const v = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
    const ver = m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '');
    if (v[0] !== 9 || v[1] < 3) continue; // the Android plugin these scenarios name (9.3) needs Gradle 9.3 or later
    for (const h of fs.readdirSync(path.join(dists, d))) {
      const bin = path.join(dists, d, h, 'gradle-' + ver, 'bin', 'gradle');
      if (fs.existsSync(bin) && (!best || v[1] * 100 + v[2] > best.n)) best = { bin, ver, n: v[1] * 100 + v[2] };
    }
  }
  if (!best) return '';
  fs.rmSync(at, { recursive: true, force: true });
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'settings.gradle.kts'), 'rootProject.name = "wrapper"\n');
  const r = spawnSync(
    best.bin,
    ['wrapper', '--gradle-version', best.ver, '--distribution-type', 'bin', '--console=plain'],
    { cwd: at, encoding: 'utf8', timeout: 5 * 60000, env: gradleEnv() },
  );
  return r.status === 0 && fs.existsSync(path.join(at, 'gradlew')) ? at : '';
});
const TOOLS = {
  unittest: () => (onPath(PY) ? '' : 'there is no ' + PY + ' on this machine'),
  node: () => '',
  swift: () => (swiftEnv() ? '' : 'the swift command does not run on this machine'),
  gradle: () =>
    spawnSync('java', ['-version'], { timeout: 20000 }).status !== 0
      ? 'there is no Java on this machine'
      : !ANDROID_HOME
        ? 'no Android SDK was found on this machine'
        : !wrapper()
          ? 'no Gradle 9.3 or later was found under ~/.gradle to make a wrapper from'
          : '',
  flutter: () => (onPath('flutter') ? '' : 'there is no flutter on this machine'),
};
const junitIn = (dir) => {
  const rows = [];
  const walk = (d) => {
    for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.xml$/.test(e.name))
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g))
          rows.push({
            name: (/\bname="([^"]*)"/.exec(m[1]) || [])[1] || '?',
            bad: /<(failure|error)\b/.test(m[3] || ''),
          });
    }
  };
  walk(dir);
  return rows;
};
const cannot = (s) =>
  s.kind === 'find'
    ? ''
    : !s.oracle
      ? 'it has no oracle'
      : (TOOLS[s.oracle.type] || (() => 'an oracle of type ' + s.oracle.type + ' is not known'))();
function oracleOn(dir, s) {
  const od = fs.mkdtempSync(path.join(WORK, 'oracle-'));
  let r;
  if (s.oracle.type === 'gradle') {
    // an Android project: the oracle goes into a copy, among its unit tests, and Gradle runs just that class
    const copy = path.join(od, 'copy');
    fs.cpSync(dir, copy, {
      recursive: true,
      filter: (src) => !/(^|\/)(\.git|\.gradle|build|\.proof|\.familyoffice-proof)$/.test(src),
    });
    const at = path.join(copy, s.oracle.file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, s.oracle.text);
    r = spawnSync(
      './gradlew',
      [':app:testDebugUnitTest', '--tests', s.oracle.test, '--console=plain', '--build-cache', '-q'],
      { cwd: copy, encoding: 'utf8', timeout: 40 * 60000, env: gradleEnv() },
    );
    const rows = junitIn(path.join(copy, 'app', 'build', 'test-results'));
    const out = String(r.stdout || '') + String(r.stderr || '');
    fs.rmSync(od, { recursive: true, force: true });
    return {
      ran: rows.length,
      failed: rows.length ? rows.filter((x) => x.bad).map((x) => x.name) : ['it did not build'],
      green: r.status === 0 && rows.length > 0 && !rows.some((x) => x.bad),
      tail: (out.split('\n').find((l) => /^e: |error:|FAILED|What went wrong/.test(l)) || '').trim().slice(0, 300),
    };
  }
  if (s.oracle.type === 'swift' || s.oracle.type === 'flutter') {
    // a compiled project: the oracle goes into a copy of it, among its own tests
    const copy = path.join(od, 'copy');
    const swift = s.oracle.type === 'swift';
    fs.cpSync(dir, copy, { recursive: true, filter: (src) => !/(^|\/)(\.git|\.build|build|\.dart_tool)$/.test(src) });
    const at = swift
      ? path.join(copy, 'Tests', s.oracle.target, 'OracleTests.swift')
      : path.join(copy, 'test', 'oracle_test.dart');
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, s.oracle.text);
    r = swift
      ? spawnSync('swift', ['test', '--filter', 'OracleTests'], {
          cwd: copy,
          encoding: 'utf8',
          timeout: 20 * 60000,
          env: { ...process.env, ...swiftEnv() },
        })
      : spawnSync('flutter', ['test', 'test/oracle_test.dart', '--reporter', 'json'], {
          cwd: copy,
          encoding: 'utf8',
          timeout: 20 * 60000,
        });
    const out = String(r.stdout || '') + String(r.stderr || '');
    fs.rmSync(od, { recursive: true, force: true });
    if (swift) {
      const done = [...out.matchAll(/Test Case '-\[\S+ (\w+)\]' (passed|failed)/g)];
      const failed = [...new Set(done.filter((m) => m[2] === 'failed').map((m) => m[1]))];
      const ran = new Set(done.map((m) => m[1])).size;
      return {
        ran,
        failed: ran ? failed : ['it did not build'],
        green: r.status === 0 && ran > 0 && !failed.length,
        tail: (out.split('\n').find((l) => /error:/.test(l)) || '').trim().slice(0, 300),
      };
    }
    const names = new Map();
    const failed = [];
    let ran = 0; // the JSON reporter: testStart names a test, testDone says how it went; a "loading" entry is hidden
    for (const line of out.split('\n')) {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === 'testStart' && ev.test) names.set(ev.test.id, ev.test.name);
      if (ev.type === 'testDone' && !ev.hidden) {
        ran++;
        if (ev.result !== 'success') failed.push(names.get(ev.testID) || 'a test');
      }
    }
    return {
      ran,
      failed: ran ? failed : ['it did not build'],
      green: r.status === 0 && ran > 0 && !failed.length,
      tail: (out.split('\n').find((l) => /Error:|error •/.test(l)) || '').trim().slice(0, 300),
    };
  }
  if (s.oracle.type === 'unittest') {
    fs.writeFileSync(path.join(od, 'test_oracle.py'), s.oracle.text);
    r = spawnSync(PY, ['-B', '-m', 'unittest', '-v', 'test_oracle'], {
      cwd: od,
      env: { ...process.env, PYTHONPATH: dir, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
      timeout: 120000,
    });
  } else {
    fs.writeFileSync(
      path.join(od, 'oracle.test.mjs'),
      s.oracle.text.split('@repo/').join(pathToFileURL(dir).href + '/'),
    );
    r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(od, 'oracle.test.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 120000,
    });
  }
  fs.rmSync(od, { recursive: true, force: true });
  const out = String(r.stderr || '') + String(r.stdout || '');
  if (s.oracle.type === 'unittest') {
    const ran = Number((/Ran (\d+) tests?/.exec(out) || [])[1] || 0);
    return {
      ran,
      failed: [...out.matchAll(/^(?:FAIL|ERROR): (\S+)/gm)].map((m) => m[1]),
      green: r.status === 0 && ran > 0,
      tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300),
    };
  }
  const oks = [...out.matchAll(/^ok \d+ - (.+)$/gm)].map((m) => m[1]);
  const nots = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).filter((n) => !/oracle\.test\.mjs$/.test(n));
  return {
    ran: oks.length + nots.length,
    failed: r.status === 0 ? [] : nots.length ? nots : ['the file did not load'],
    green: r.status === 0 && oks.length > 0,
    tail: (r.status === 0 ? '' : out.split('\n').find((l) => /Error|expected|actual/.test(l)) || '')
      .trim()
      .slice(0, 300),
  };
}
function lay(dir, files, s) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  if (s && s.lang === 'kotlin' && s.kind !== 'find' && wrapper()) {
    // the Gradle wrapper, as a real Android project has it, and what such a project leaves out of Git
    for (const f of [
      'gradlew',
      'gradlew.bat',
      'gradle/wrapper/gradle-wrapper.jar',
      'gradle/wrapper/gradle-wrapper.properties',
    ]) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(wrapper(), f), path.join(dir, f));
    }
    fs.chmodSync(path.join(dir, 'gradlew'), 0o755);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\n.gradle/\nlocal.properties\n.familyoffice-proof/\n');
  }
}
function ownTests(dir, s) {
  const r =
    s.lang === 'kotlin'
      ? spawnSync('./gradlew', [':app:testDebugUnitTest', '--console=plain', '--build-cache', '-q'], {
          cwd: dir,
          encoding: 'utf8',
          timeout: 40 * 60000,
          env: gradleEnv(),
        })
      : s.lang === 'python'
        ? spawnSync(PY, ['-B', '-m', 'unittest', 'discover', '-s', dir, '-p', 'test_*.py'], {
            cwd: dir,
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
            encoding: 'utf8',
            timeout: 120000,
          })
        : s.lang === 'swift'
          ? spawnSync('swift', ['test'], { cwd: dir, encoding: 'utf8', timeout: 20 * 60000 })
          : s.lang === 'dart'
            ? spawnSync('flutter', ['test'], { cwd: dir, encoding: 'utf8', timeout: 20 * 60000 })
            : spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return r.status === 0;
}
// a "find" ticket: the answer names every thing it had to name (exactly, so a guess in other words does not count) and gives the value
const foundIn = (said, f) => {
  const t = String(said || '');
  const missing = f.names.filter((n) => !t.includes(n));
  if (f.value && f.value.length && !f.value.some((v) => t.toLowerCase().includes(String(v).toLowerCase())))
    missing.push('the value (' + f.value[0] + ')');
  return missing;
};

// ---------- what is attached to a ticket: drawn or recorded from the scenario's html, once ----------
// A picture is the page as a browser draws it. A video is the page recorded while it plays (its own window.play()), for as long as the
// scenario says. Both are made by Playwright's Chromium and kept under .work/train/media/<scenario>/, so a run uses the same files.
let pw = null;
async function mediaOf(s) {
  const dir = path.join(WORK, 'media', s.id);
  const out = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const m of s.media || []) {
    const file = path.join(dir, m.name);
    const page = path.join(dir, m.name.replace(/\.\w+$/, '') + '.html');
    if (
      !fs.existsSync(file) ||
      fs.statSync(file).size < 1000 ||
      !fs.existsSync(page) ||
      fs.readFileSync(page, 'utf8') !== m.html
    ) {
      fs.writeFileSync(page, m.html);
      if (!pw) {
        const req = createRequire(process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json'));
        pw = await req('playwright').chromium.launch();
      }
      const size = { width: 1366, height: 900 };
      const ctx = await pw.newContext({
        viewport: size,
        deviceScaleFactor: 1,
        ...(m.kind === 'video' ? { recordVideo: { dir, size } } : {}),
      });
      const p = await ctx.newPage();
      await p.goto(pathToFileURL(page).href);
      if (m.kind === 'video') {
        await p.evaluate(() => window.play && window.play());
        await sleep((m.seconds || 8) * 1000);
        const v = p.video();
        await ctx.close();
        fs.rmSync(file, { force: true });
        fs.renameSync(await v.path(), file);
      } else {
        await p.screenshot({ path: file });
        await ctx.close();
      }
    }
    out.push({ name: m.name, kind: m.kind, file, type: m.kind === 'video' ? 'video/webm' : 'image/png' });
  }
  return out;
}
const closeBrowser = async () => {
  if (pw) {
    await pw.close().catch(() => {});
    pw = null;
  }
};
async function checkMedia() {
  let bad = 0;
  const { framesOf } = await import(path.join(ROOT, 'runner', 'media.mjs'));
  for (const s of list.filter((x) => x.media)) {
    for (const m of await mediaOf(s)) {
      const size = fs.statSync(m.file).size;
      let say = Math.round(size / 1024) + ' KB';
      if (m.kind === 'video') {
        const fr = await framesOf(m.file, path.join(WORK, 'media', s.id, 'frames-check'), { max: 6 });
        say += fr.ok
          ? ', ' +
            Math.round(fr.duration) +
            ' s, ' +
            fr.frames.length +
            ' moments picked at ' +
            fr.frames.map((f) => f.at.toFixed(1)).join(', ') +
            ' s'
          : ', NOT taken apart: ' + fr.why;
        if (!fr.ok || fr.frames.length < 3) bad++;
      }
      console.log((size > 1000 ? 'ok   ' : 'BAD  ') + s.id.padEnd(18) + 'attached: ' + m.name + ' (' + say + ')');
      if (size <= 1000) bad++;
    }
  }
  await closeBrowser();
  return bad;
}

// ---------- --check: a scenario that cannot be failed or cannot be passed measures nothing ----------
function checkScenarios() {
  let bad = 0;
  const skipped = [];
  for (const s of list) {
    const no = cannot(s);
    if (no) {
      skipped.push(s.id);
      console.log('skip ' + s.id.padEnd(18) + no);
      continue;
    }
    const a = path.join(WORK, 'check-' + process.pid, s.id, 'as-it-is');
    const b = path.join(WORK, 'check-' + process.pid, s.id, 'fixed');
    fs.rmSync(path.join(WORK, 'check-' + process.pid, s.id), { recursive: true, force: true });
    lay(a, s.files);
    if (s.kind === 'find') {
      const text = Object.values(s.files).join('\n');
      const lost = s.find.names.filter((n) => !Object.keys(s.files).some((f) => f.endsWith(n)) && !text.includes(n));
      console.log(
        (lost.length ? 'BAD  ' : 'ok   ') +
          s.id.padEnd(18) +
          (lost.length
            ? 'what the answer must name is not in the repository: ' + lost.join(', ')
            : 'a find: the answer must name ' + s.find.names.join(', ')),
      );
      if (lost.length) bad++;
      continue;
    }
    lay(a, {}, s);
    lay(b, { ...s.files, ...s.fix }, s);
    const red = oracleOn(a, s);
    const green = oracleOn(b, s);
    const own = ownTests(a, s);
    const ownFixed = ownTests(b, s);
    const why = !own
      ? 'its own tests fail on the repository as it is'
      : red.green || !red.failed.length
        ? 'the oracle passes before any change: it measures nothing'
        : !green.green
          ? 'the oracle fails on the reference fix: ' + green.failed.join(', ') + ' ' + green.tail
          : !ownFixed
            ? "the reference fix breaks the repository's own tests"
            : '';
    console.log(
      (why ? 'BAD  ' : 'ok   ') +
        s.id.padEnd(18) +
        (why ||
          s.kind.padEnd(8) +
            'oracle ' +
            red.failed.length +
            ' of ' +
            red.ran +
            ' red as it is, ' +
            green.ran +
            ' of ' +
            green.ran +
            ' green on the fix'),
    );
    if (why) bad++;
  }
  fs.rmSync(path.join(WORK, 'check-' + process.pid), { recursive: true, force: true });
  console.log(
    bad
      ? bad + ' scenario' + (bad === 1 ? '' : 's') + ' to put right before a model is measured on them.'
      : 'All ' +
          (list.length - skipped.length) +
          ' scenarios that can be checked here can be failed and can be passed.' +
          (skipped.length ? ' ' + skipped.length + ' cannot be checked on this machine.' : ''),
  );
  return bad;
}

// ---------- a request to the runner with no time limit of its own: a proof may take many minutes ----------
function call(port, method, p, body) {
  return new Promise((done) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: p,
        method,
        agent: false,
        headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          text += c;
        });
        res.on('end', () => {
          let j = {};
          try {
            j = JSON.parse(text);
          } catch {
            j = { raw: text.slice(0, 300) };
          }
          done({ status: res.statusCode, ...j });
        });
      },
    );
    req.on('error', (e) => done({ status: 0, error: String(e.message) }));
    if (data) req.write(data);
    req.end();
  });
}

if (has('check')) process.exit(checkScenarios() + (await checkMedia()) ? 1 : 0);
if (checkScenarios()) process.exit(1);
const runnable = list.filter((s) => !cannot(s));

// ---------- a real run ----------
let setup = { model: 'nemotron35-30b', mode: 'developer' };
try {
  if (arg('setup')) setup = JSON.parse(arg('setup'));
} catch {
  console.log('--setup takes JSON, as /api/setup does.');
  process.exit(2);
}
const claude = /claude/i.test(JSON.stringify(setup));
const claudeModel = String(arg('claude-model', ''));
const label = String(
  arg(
    'label',
    claude
      ? 'claude' + (claudeModel ? '-' + claudeModel.replace(/^claude-/, '') : '')
      : setup.model || setup.engine || setup.kind || 'team',
  ),
).replace(/[^\w.-]+/g, '-');
// A RUN ON CLAUDE CODE WORKS OUTSIDE THIS REPOSITORY. Claude Code reads the instruction files of every folder above the one it works in, so a
// team copy kept under this checkout would be handed this checkout's own instructions (and its hooks). Its state and repositories go in the
// system's temporary folder; a local model's stay under .work/train. Each has a port of its own, so the two can be measured at the same time.
const rounds = Math.max(1, Number(arg('rounds', 2)) || 2);
const PORT = Number(arg('port', claude ? 5293 : 5290));
const BASE = claude ? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fo-train-')) : WORK;
const state = path.join(BASE, 'state');
const repos = path.join(BASE, 'repos');
const rowsFile = path.join(WORK, 'runs.jsonl');
// A LOCAL TEAM IS GIVEN THE PICTURE-READING HELPER THIS MACHINE ALREADY HAS, when a ticket has something attached: its files are linked
// into the run's own state (never copied, fetched or changed) and set-up is told the team has it, which checks that it reads.
const eyesFrom = path.join(os.homedir(), '.familyoffice', 'state', 'addons', 'lfm3-omni-2b');
const wantEyes = !claude && runnable.some((s) => s.media) && fs.existsSync(eyesFrom) && setup.addons === undefined;
if (wantEyes) setup = { ...setup, addons: ['lfm3-omni-2b'] };
if (claude && !has('spend-claude')) {
  console.log(
    'A run on Claude Code spends your own Claude plan: ' +
      runnable.length * rounds +
      ' tickets, each a change and its proof. Add --spend-claude to say so.',
  );
  process.exit(2);
}
for (const d of [state, repos]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
if (wantEyes) {
  fs.mkdirSync(path.join(state, 'addons'), { recursive: true });
  fs.symlinkSync(eyesFrom, path.join(state, 'addons', 'lfm3-omni-2b'));
}
// what this machine already learned about serving the model is carried over, so a run measures the team and not the set-up
const from = process.env.FO_TRAIN_FROM || path.join(REPO_ROOT, '.work', 'qa-real');
try {
  const was = JSON.parse(fs.readFileSync(path.join(from, 'state.json'), 'utf8'));
  const keep = {};
  for (const k of ['tune', 'fit', 'measured']) if (was[k]) keep[k] = was[k];
  fs.writeFileSync(path.join(state, 'state.json'), JSON.stringify(keep));
} catch {
  /* learned again during set-up */
}
// Claude Code is started as the customer's own terminal would start it: nothing of a Claude session this script may itself be running in is handed down
const ownEnv = claude
  ? Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_|MCP_)/.test(k)))
  : process.env;
const env = {
  ...ownEnv,
  PORT: String(PORT),
  FO_KEEP: '1',
  FO_STATE_DIR: state,
  FO_NO_OPEN: '1',
  FO_BILLING: '{"enforce":false}',
  FO_LINK_PORT: String(PORT + 40000),
  FO_KEEP_FAILED_PROOFS: '1',
  ...(has('no-room') ? { FO_NO_ROOM: '1' } : {}),
  ...(ANDROID_HOME ? { ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME } : {}),
  ...(swiftEnv() || {}),
  ...(claude
    ? { FO_CLAUDE_ROOT: path.join(BASE, 'claude'), ...(claudeModel ? { FO_CLAUDE_MODEL: claudeModel } : {}) }
    : {}),
}; // --claude-model: the model every Claude Code run of this measurement uses, where a seat has none of its own
if (!claude && !env.FO_PI_CLI) {
  const { piInstalled } = await import(path.join(ROOT, 'runner', 'host.mjs'));
  const pi = await piInstalled(path.join(os.homedir(), '.familyoffice', 'state'));
  if (pi && pi.cli) env.FO_PI_CLI = pi.cli;
  else console.log('No agent is installed for this machine yet: set-up will install its own.');
}
const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { stdio: 'ignore', env });
const stop = () => {
  try {
    srv.kill('SIGTERM');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => {
    stop();
    process.exit(130);
  });
const get = (p) => call(PORT, 'GET', p);
const post = (p, b) => call(PORT, 'POST', p, b || {});
for (let i = 0; i < 80 && (await get('/api/setup')).status !== 200; i++) await sleep(150);

const git = (dir, ...a) =>
  execFileSync('git', a, {
    cwd: dir,
    env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(repos, 'no-global'), GIT_CONFIG_NOSYSTEM: '1' },
  }).toString();
const verdictOf = (r) =>
  r.kind === 'find'
    ? r.missing.length
      ? 'not-found'
      : 'found'
    : !r.changed.length
      ? 'no-change'
      : r.proofOk && r.oracle.green
        ? 'proven-right'
        : r.proofOk
          ? 'false-green'
          : r.oracle.green
            ? 'right-unproven'
            : 'wrong';
const good = (v) => v === 'proven-right' || v === 'found';
const rows = [];
const t0 = Date.now();
try {
  await post('/api/setup', setup);
  let v;
  for (;;) {
    await sleep(2000);
    v = await get('/api/setup');
    if (!v.busy) break;
  }
  if (!v.setup || !v.setup.done) {
    console.log('Set-up stopped: ' + JSON.stringify((v.setup && v.setup.error) || v).slice(0, 300));
    throw new Error('no team to measure');
  }
  console.log(
    '\nTeam ready on ' +
      label +
      '. ' +
      runnable.length +
      ' scenarios, ' +
      rounds +
      ' round' +
      (rounds === 1 ? '' : 's') +
      ' each.\n',
  );
  for (const s of runnable) {
    const repo = path.join(
      repos,
      s.id,
      s.lang === 'javascript'
        ? 'shop-web'
        : s.lang === 'typescript'
          ? 'shop-web-ts'
          : s.lang === 'kotlin'
            ? 'shop-android'
            : s.lang === 'swift'
              ? 'ShopKit'
              : 'shop-app',
    );
    lay(repo, { 'README.md': '# ' + path.basename(repo) + '\n\nThe Harbor Shop.\n', ...s.files }, s);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 'Maya Chen');
    git(repo, 'config', 'user.email', 'maya@harborshop.example');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'The shop as it is');
    await post('/api/workspace/discard');
    await post('/api/workspace/disconnect');
    const ws = await post('/api/workspace/folder', { path: repo });
    if (ws.status !== 200) {
      console.log(s.id + ': the folder was not connected: ' + JSON.stringify(ws).slice(0, 200));
      continue;
    }
    // WHAT IS ATTACHED: handed over as files, looked at by the team, and put into the ticket as the team's own reading (as a Jira
    // ticket's attachments are). Looked at once a scenario: the files do not change between rounds.
    let seen = null;
    if (s.media) {
      const files = await mediaOf(s);
      const ids = [];
      for (const f of files) {
        const up = await fetch('http://127.0.0.1:' + PORT + '/api/media?name=' + encodeURIComponent(f.name), {
          method: 'POST',
          headers: { 'content-type': f.type },
          body: fs.readFileSync(f.file),
        })
          .then((r) => r.json())
          .catch((e) => ({ error: String(e.message) }));
        if (up.id) ids.push(up.id);
        else console.log(s.id + ': ' + f.name + ' was not taken: ' + JSON.stringify(up).slice(0, 160));
      }
      const a = Date.now();
      const got = ids.length
        ? await post('/api/media/read', { ids, about: s.title + '. ' + s.ticket })
        : { media: [], note: '' };
      const said = (got.media || []).map((m) => m.says || '').join(' ');
      seen = {
        note: String(got.note || ''),
        seconds: Math.round((Date.now() - a) / 1000),
        saw: !!said && (s.see || []).every((re) => re.test(said)),
        list: (got.media || []).map((m) => ({
          name: m.name,
          ok: m.ok,
          by: m.by || '',
          frames: m.frames || 0,
          says: String(m.says || '').slice(0, 700),
          why: String(m.why || got.error || '').slice(0, 200),
        })),
      };
      console.log(
        s.id.padEnd(18) +
          'attached  ' +
          (seen.saw ? 'SEEN' : 'NOT SEEN') +
          ' in ' +
          seen.seconds +
          ' s' +
          seen.list
            .map(
              (m) =>
                '\n   ' +
                m.name +
                (m.by ? ' (' + m.by + ')' : '') +
                ': ' +
                (m.ok ? m.says.slice(0, 260) : 'not looked at: ' + m.why),
            )
            .join(''),
      );
    }
    const ask = taskOf(s) + (seen ? seen.note : '');
    for (let n = 1; n <= rounds; n++) {
      await post('/api/workspace/discard');
      const row = {
        at: new Date().toISOString(),
        label,
        scenario: s.id,
        lang: s.lang,
        kind: s.kind,
        round: n,
        taskStatus: 0,
        changed: [],
        taskS: 0,
        said: '',
        missing: [],
        oracleFirst: null,
        proofOk: false,
        proofSays: '',
        loops: 0,
        loop: [],
        stuck: '',
        proofS: 0,
        oracle: { ran: 0, failed: [], green: false, tail: '' },
        ...(seen ? { saw: seen.saw, media: seen.list } : {}),
      };
      if (s.kind === 'find') {
        const a = Date.now();
        const got = await post('/api/workspace/look', { task: ask });
        row.taskS = Math.round((Date.now() - a) / 1000);
        row.taskStatus = got.status;
        row.said = String(got.found || got.error || '').slice(0, 900);
        row.missing = got.status === 200 ? foundIn(got.found, s.find) : ['an answer'];
      } else {
        const a = Date.now();
        const made = await post('/api/workspace/task', { task: ask, branch: 'bugfix/' + s.key + '-' + s.id });
        row.taskS = Math.round((Date.now() - a) / 1000);
        const dir = (await get('/api/workspace')).dir;
        row.taskStatus = made.status;
        row.changed = (made.changed || []).map((c) => c.path);
        row.said = String(made.said || made.error || '').slice(0, 300);
        row.tests = made.tests || null;
        row.buildRoom = made.room
          ? {
              came: made.room.came,
              lines: (made.room.lines || []).map(
                (l) => l.name + ': ' + String(l.says).slice(0, 160) + (l.tried ? ' [' + l.came + ']' : ''),
              ),
            }
          : null;
        if (row.changed.length && dir) {
          row.oracleFirst = oracleOn(dir, s);
          const b = Date.now();
          const pr = await post('/api/workspace/prove');
          row.proofS = Math.round((Date.now() - b) / 1000);
          row.proofOk = pr.ok === true;
          row.proofSays = String(pr.says || pr.why || pr.blocked || pr.error || '').slice(0, 400);
          row.loop = (pr.rounds || []).map((x) => ({
            n: x.n,
            what: x.what,
            tests: x.tests,
            why: String(x.why || '').slice(0, 240),
          }));
          row.loops = row.loop.length;
          row.stuck = String(pr.stuck || '').slice(0, 300);
          row.challenge = pr.challenge || null;
          row.room = pr.room
            ? {
                came: pr.room.came,
                tally: pr.room.tally,
                lines: (pr.room.lines || []).map(
                  (l) =>
                    l.name +
                    ' (' +
                    (l.blame || '?') +
                    '): ' +
                    String(l.says).slice(0, 160) +
                    (l.tried ? ' [' + l.came + ']' : ''),
                ),
              }
            : null;
          row.checks = (pr.rows || []).map((x) => x.verdict + ':' + x.test);
          row.steps = pr.steps || [];
          row.oracle = oracleOn(dir, s); // again after the proof, because the team may have repaired the code while proving it
          try {
            row.diff = git(dir, 'diff', 'HEAD').slice(0, 4000);
          } catch {
            row.diff = '';
          }
          const pd = path.join(state, 'proofs');
          const newest =
            pr.id ||
            (fs.existsSync(pd)
              ? (fs
                  .readdirSync(pd)
                  .map((d) => [d, fs.statSync(path.join(pd, d)).mtimeMs])
                  .sort((x, y) => y[1] - x[1])[0] || [])[0]
              : '');
          const ph = newest ? path.join(pd, newest, 'harness') : '';
          const pf =
            ph && fs.existsSync(ph)
              ? fs
                  .readdirSync(ph, { recursive: true })
                  .map(String)
                  .find((f) => /\.(py|mjs|js|ts|swift|kt|java|dart)$/.test(f))
              : '';
          row.proof = pf ? fs.readFileSync(path.join(ph, pf), 'utf8').slice(0, 5000) : '';
        }
      }
      row.verdict = verdictOf(row);
      rows.push(row);
      fs.appendFileSync(rowsFile, JSON.stringify(row) + '\n');
      console.log(
        s.id.padEnd(18) +
          'round ' +
          n +
          '  ' +
          row.verdict.padEnd(15) +
          (s.kind === 'find'
            ? ' looked ' + String(row.taskS).padStart(3) + ' s'
            : ' change ' +
              String(row.taskS).padStart(3) +
              ' s, proof ' +
              String(row.proofS).padStart(3) +
              ' s' +
              (row.loops ? ', ' + row.loops + ' more proof round' + (row.loops === 1 ? '' : 's') : '')) +
          (row.challenge && row.challenge.found.length
            ? '  [the challenge found a fault' +
              (row.challenge.fixed ? ', and it was put right]' : ', and it was not put right]')
            : '') +
          (row.room ? '  [the room: ' + String(row.room.came).slice(0, 110) + ']' : '') +
          (row.buildRoom ? '  [the room, at the build: ' + String(row.buildRoom.came).slice(0, 80) + ']' : '') +
          (row.oracleFirst && row.oracleFirst.green !== row.oracle.green
            ? row.oracle.green
              ? '  [the code was put right while proving]'
              : '  [THE CODE WAS RIGHT AND PROVING IT BROKE IT]'
            : '') +
          (good(row.verdict)
            ? ''
            : '\n   ' +
              (s.kind === 'find'
                ? 'the answer does not name: ' + row.missing.join(', ') + ' | it said: ' + row.said.slice(0, 200)
                : (row.proofSays || row.said).slice(0, 220) +
                  (row.oracle.failed.length
                    ? '\n   the oracle: ' + row.oracle.failed.join(', ') + ' | ' + row.oracle.tail
                    : ''))),
      );
    }
  }
} catch (e) {
  console.log('STOPPED ' + String((e && e.stack) || e).slice(0, 400));
} finally {
  await post('/api/stop');
  await sleep(800);
  stop();
  await sleep(300);
  await closeBrowser();
}

// ---------- what it came to ----------
const KINDS = ['proven-right', 'found', 'false-green', 'right-unproven', 'wrong', 'no-change', 'not-found'];
const count = (some) => Object.fromEntries(KINDS.map((k) => [k, some.filter((r) => r.verdict === k).length]));
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const goodOf = (some) => some.filter((r) => good(r.verdict)).length;
const per = runnable.map((s) => {
  const mine = rows.filter((r) => r.scenario === s.id);
  return {
    id: s.id,
    lang: s.lang,
    kind: s.kind,
    shape: s.shape,
    runs: mine.length,
    good: goodOf(mine),
    ...count(mine),
    taskS: mean(mine.map((r) => r.taskS)),
    proofS: mean(mine.map((r) => r.proofS)),
    loops: mine.reduce((a, r) => a + r.loops, 0),
  };
});
const by = (key) =>
  Object.fromEntries(
    [...new Set(rows.map((r) => r[key]))].map((k) => {
      const mine = rows.filter((r) => r[key] === k);
      return [
        k,
        { runs: mine.length, good: goodOf(mine), falseGreen: mine.filter((r) => r.verdict === 'false-green').length },
      ];
    }),
  );
const total = { runs: rows.length, good: goodOf(rows), ...count(rows) };
const pct = (n) => (rows.length ? Math.round((100 * n) / rows.length) : 0);
console.log(
  '\n' +
    'scenario'.padEnd(18) +
    'kind     runs  good  false green  right unproven  wrong  no change  not found  work s  proof s',
);
for (const x of per)
  console.log(
    x.id.padEnd(18) +
      x.kind.padEnd(9) +
      String(x.runs).padStart(4) +
      String(x.good).padStart(6) +
      String(x['false-green']).padStart(13) +
      String(x['right-unproven']).padStart(16) +
      String(x.wrong).padStart(7) +
      String(x['no-change']).padStart(11) +
      String(x['not-found']).padStart(11) +
      String(x.taskS).padStart(8) +
      String(x.proofS).padStart(9),
  );
console.log(
  '\n' +
    label +
    ': ' +
    total.good +
    ' of ' +
    total.runs +
    ' tickets done right (' +
    pct(total.good) +
    '%): ' +
    total['proven-right'] +
    ' proven and right, ' +
    total.found +
    ' found. ' +
    total['false-green'] +
    ' false green, ' +
    total['right-unproven'] +
    ' right but unproven, ' +
    total.wrong +
    ' wrong, ' +
    total['no-change'] +
    ' with no change, ' +
    total['not-found'] +
    ' not found. ' +
    Math.round((Date.now() - t0) / 60000) +
    ' min.',
);
const asked = rows.filter((r) => r.room || r.buildRoom);
const withMedia = rows.filter((r) => r.media);
if (asked.length)
  console.log(
    'The room was asked on ' +
      asked.length +
      ' ticket' +
      (asked.length === 1 ? '' : 's') +
      ': ' +
      asked.filter((r) => good(r.verdict)).length +
      ' of them ended right' +
      (asked.some((r) => r.verdict === 'false-green')
        ? ', ' + asked.filter((r) => r.verdict === 'false-green').length + ' FALSE GREEN'
        : '') +
      '.',
  );
const dared = rows.filter((r) => r.challenge && r.challenge.tests);
if (dared.length)
  console.log(
    'The challenge was put to ' +
      dared.length +
      ' proven change' +
      (dared.length === 1 ? '' : 's') +
      ': it found a fault in ' +
      dared.filter((r) => r.challenge.found.length).length +
      ', of which ' +
      dared.filter((r) => r.challenge.fixed).length +
      ' were put right.',
  );
if (withMedia.length)
  console.log(
    'Tickets with something attached: the team saw what it had to on ' +
      withMedia.filter((r) => r.saw).length +
      ' of ' +
      withMedia.length +
      ' runs.',
  );
console.log(
  'By language: ' +
    Object.entries(by('lang'))
      .map(([k, x]) => k + ' ' + x.good + '/' + x.runs)
      .join(', ') +
    '.  By kind: ' +
    Object.entries(by('kind'))
      .map(([k, x]) => k + ' ' + x.good + '/' + x.runs)
      .join(', ') +
    '.',
);
if (rows.length) {
  const out = path.join(HERE, 'results');
  fs.mkdirSync(out, { recursive: true });
  const misses = rows
    .filter((r) => !good(r.verdict))
    .map((r) => ({
      scenario: r.scenario,
      round: r.round,
      verdict: r.verdict,
      says: r.proofSays || r.said,
      oracle: r.oracle.failed,
      missing: r.missing,
      stuck: r.stuck,
    }));
  const sum = {
    label,
    setup,
    at: new Date().toISOString(),
    machine: os.cpus()[0].model + ', ' + Math.round(os.totalmem() / 2 ** 30) + ' GB',
    rounds,
    minutes: Math.round((Date.now() - t0) / 60000),
    note: String(arg('note', '')),
    total,
    byLang: by('lang'),
    byKind: by('kind'),
    room: { asked: asked.length, good: asked.filter((r) => good(r.verdict)).length, off: has('no-room') },
    media: { runs: withMedia.length, saw: withMedia.filter((r) => r.saw).length },
    challenge: {
      put: dared.length,
      found: dared.filter((r) => r.challenge.found.length).length,
      fixed: dared.filter((r) => r.challenge.fixed).length,
    },
    scenarios: per,
    misses,
  };
  fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify(sum, null, 1) + '\n');
  fs.appendFileSync(
    path.join(out, 'history.jsonl'),
    JSON.stringify({
      label,
      at: sum.at,
      note: sum.note,
      rounds,
      minutes: sum.minutes,
      total,
      byLang: sum.byLang,
      byKind: sum.byKind,
      room: sum.room,
      media: sum.media,
      challenge: sum.challenge,
      only: only.join(','),
      set: sets.join(','),
    }) + '\n',
  );
  console.log(
    'Summary: training/results/' + label + '.json   Every run, with its change and its proof: .work/train/runs.jsonl',
  );
}
process.exit(0);
