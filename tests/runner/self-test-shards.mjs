// self-test-shards.mjs - THE RUNNER'S SELF-TEST, SIDE BY SIDE. self-test.mjs is one long file: an opening (its stand-ins and
// helpers) and then about a hundred sections, each a server started for a group of checks. Run whole it takes eight minutes in
// one process. Here its sections are dealt out to several processes, each given every shared statement of the file in its
// order and its own share of the sections, and what they print is counted as one run.
//   node tests/runner/self-test-shards.mjs              four at once (what is steady: see JOBS)
//   node tests/runner/self-test-shards.mjs --jobs 4     four             --plan   say how the file divides, and run nothing
//   node tests/runner/self-test-shards.mjs --times      how long each section took, longest first
// WHAT KEEPS TWO SHARDS APART. The self-test names its ports as numbers, in what it starts and in what it expects to read back
// (a line of a log, an address in a reply). A shard is the same text with every one of those numbers moved by a hundred for each
// shard before it, wherever it stands, so what is started and what is expected move together; its state folder is named for the
// shard; and it is given a port of its own for the phone link. Nothing of self-test.mjs is changed, and run by itself it is the
// whole of it in one process, on the ports written in it.
// A shard is a file written beside self-test.mjs for the length of the run (.self-test-shard-N.mjs) and taken away after.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => (argv.includes('--' + name) ? argv[argv.indexOf('--' + name) + 1] : null);
const CORES = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
// THE PORTS THE SELF-TEST NAMES (all between 5219 and 5267). Moved a hundred at a time they stay four digits and clear of each
// other for eight shards (5219..5267, 5319..5367 ... 5919..5967); a ninth would run into six thousand, which the file also names.
const PORTS = [
  5219, 5229, 5235, 5236, 5237, 5240, 5241, 5243, 5246, 5247, 5248, 5249, 5261, 5262, 5263, 5264, 5266, 5267,
];
const MOST = 8;
// HOW MANY AT ONCE: four, as measured. At four the same 578 checks pass run after run, in about 160 seconds where the whole takes
// about 480. At eight it is quicker still (about 120) and not steady: the sections that time something (a router asked once
// within a moment, a browser opened once) come late beside seven others, and one run in two lost a check. --jobs asks for more.
const JOBS = Math.max(1, Math.min(MOST, Number(flag('jobs') || process.env.FO_TEST_SHARDS) || Math.min(4, CORES)));

// THE STATEMENTS OF THE FILE, top to bottom. It is laid out by Prettier, so a statement begins on a line that starts at the
// margin and, where it runs over several lines, ends on the next line that starts at the margin (its closing brace or bracket).
// The comment lines above a statement go with it.
export function statementsOf(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let lead = -1;
  const atMargin = (l) => l.length > 0 && !/^\s/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (l.startsWith('//')) {
      if (lead < 0) lead = i;
      i++;
      continue;
    }
    const from = lead >= 0 ? lead : i;
    lead = -1;
    let j = i;
    // (one line that ends itself; else on to the closing line at the margin, and on again where that line opens another part)
    if (!/[;}]$/.test(l.trimEnd()) || /[{([]$/.test(l.trimEnd())) {
      for (;;) {
        j++;
        while (j < lines.length && !atMargin(lines[j])) j++;
        if (j >= lines.length) break;
        if (!/[{([,]$/.test(lines[j].trimEnd())) break;
      }
    }
    out.push({ at: i + 1, text: lines.slice(from, Math.min(j, lines.length - 1) + 1).join('\n'), head: l });
    i = j + 1;
  }
  return out;
}
// A SECTION is a statement that only checks: a block in braces of its own, a server started for a group of checks, a check at
// the margin. Everything else is shared (an import, a helper, a stand-in started for the sections after it, the closing lines)
// and goes to every shard, in its place.
export const isSection = (s) =>
  /^\{$/.test(s.head) ||
  /^await withServer\(/.test(s.head) ||
  /^check\($/.test(s.head) ||
  // (and any other statement that checks something: run in every shard, its checks would be counted in every one)
  (/\bcheck\(/.test(s.text) && !/^(const check|import |async function |function )/.test(s.head));

export function deal(sections, n, times = {}) {
  const weight = (s) => (times[s.at] != null ? Number(times[s.at]) : s.text.split('\n').length / 60);
  const shards = Array.from({ length: Math.min(n, sections.length) }, () => ({ at: new Set(), weight: 0 }));
  for (const s of [...sections].sort((x, y) => weight(y) - weight(x))) {
    const to = shards.reduce((m, x) => (x.weight < m.weight ? x : m), shards[0]);
    to.at.add(s.at);
    to.weight += weight(s);
  }
  return shards;
}
// one shard's text: every shared statement, its own sections, the ports and the folder moved for shard k
export function shardText(statements, mine, k) {
  let text = statements
    .filter((s) => !isSection(s) || mine.has(s.at))
    .map((s) =>
      isSection(s)
        ? 'globalThis.__t = Date.now();\n' +
          s.text +
          "\nconsole.log('TIME " +
          s.at +
          " ' + (Date.now() - globalThis.__t));"
        : s.text,
    )
    .join('\n');
  if (k > 0) {
    text = text.replace(new RegExp('\\b(' + PORTS.join('|') + ')\\b', 'g'), (m) => String(Number(m) + 100 * k));
    // (and a port written as a pattern, in what a check expects to read: 524\d is moved as 5240 is)
    text = text.replace(/\b52(\d)\\d/g, (m, d) => '5' + (2 + k) + d + '\\d');
    text = text.replace(/'selftest/g, "'selftest-s" + k);
    // (a port of its own for the phone link, where a section names none: two runners up at once would both ask for the usual one)
    text = text.replace(
      "FO_CLONE_ALLOW_FILE: '1',",
      "FO_CLONE_ALLOW_FILE: '1',\n      FO_LINK_PORT: '" + (46100 + 10 * k) + "',",
    );
  }
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t0 = Date.now();
  const statements = statementsOf(fs.readFileSync(path.join(HERE, 'self-test.mjs'), 'utf8'));
  const sections = statements.filter(isSection);
  let times = {};
  try {
    times = JSON.parse(fs.readFileSync(path.join(HERE, 'self-test-times.json'), 'utf8')).seconds || {};
  } catch {
    /* never timed: dealt by length */
  }
  const shards = deal(sections, JOBS, times);
  if (argv.includes('--plan')) {
    console.log(
      statements.length +
        ' statements: ' +
        sections.length +
        ' sections, ' +
        (statements.length - sections.length) +
        ' shared',
    );
    const kinds = {};
    for (const s of statements.filter((x) => !isSection(x))) {
      const k = s.head.split(/[ (]/).slice(0, 2).join(' ');
      kinds[k] = (kinds[k] || 0) + 1;
    }
    console.log('shared, by how they begin: ' + JSON.stringify(kinds));
    shards.forEach((s, i) =>
      console.log('shard ' + (i + 1) + ': ' + s.at.size + ' sections, weight ' + s.weight.toFixed(0)),
    );
    process.exit(0);
  }
  const files = [];
  const clean = () => {
    for (const f of files)
      try {
        fs.unlinkSync(f);
      } catch {
        /* gone */
      }
  };
  process.on('exit', clean);
  process.on('SIGINT', () => process.exit(130));
  const run = (file) =>
    new Promise((done) => {
      const s0 = Date.now();
      const child = spawn(process.execPath, [file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      for (const s of [child.stdout, child.stderr]) s.on('data', (d) => (text += d));
      child.on('close', (code) => done({ code, text, seconds: (Date.now() - s0) / 1000 }));
    });
  const results = await Promise.all(
    shards.map((s, k) => {
      const file = path.join(HERE, '.self-test-shard-' + k + '.mjs');
      fs.writeFileSync(file, shardText(statements, s.at, k));
      files.push(file);
      return run(file).then((r) => ({ ...r, k }));
    }),
  );
  if (!argv.includes('--keep')) clean();
  let bad = 0;
  const took = {};
  for (const r of results) {
    const lines = r.text.split('\n');
    let fails = 0;
    for (const l of lines) {
      // (a shard's own closing line is not a check: the count is made here, over them all)
      if (/^(ok|FAIL)\s/.test(l)) console.log(l);
      if (/^FAIL\s/.test(l)) fails++;
      const m = /^TIME (\d+) (\d+)$/.exec(l);
      if (m) took[m[1]] = Number(m[2]) / 1000;
    }
    bad += fails;
    if (r.code !== 0 && !fails) {
      bad++;
      console.log(
        'FAIL shard ' +
          (r.k + 1) +
          ' stopped (exit ' +
          r.code +
          '): ' +
          lines.filter(Boolean).slice(-5).join(' | ').slice(0, 700),
      );
    }
  }
  if (argv.includes('--times')) {
    const rows = Object.entries(took).sort((x, y) => y[1] - x[1]);
    for (const [at, s] of rows.slice(0, 12))
      console.log('     ' + s.toFixed(1).padStart(6) + ' s  the section at line ' + at);
    if (argv.includes('--keep-times'))
      fs.writeFileSync(
        path.join(HERE, 'self-test-times.json'),
        JSON.stringify(
          {
            about:
              'How long each section of tests/runner/self-test.mjs took when last timed (seconds, by the line it begins on): what self-test-shards.mjs deals the sections out by, so the shards come out even. node tests/runner/self-test-shards.mjs --times --keep-times writes it again. A section that has moved or is new is dealt by its length.',
            seconds: Object.fromEntries(rows.map(([at, s]) => [at, Math.round(s * 10) / 10])),
          },
          null,
          2,
        ) + '\n',
      );
  }
  console.log(
    'in ' +
      ((Date.now() - t0) / 1000).toFixed(0) +
      ' s, ' +
      results.length +
      ' at once: ' +
      results.map((r) => r.seconds.toFixed(0) + ' s').join(', ') +
      ' (one after another: ' +
      results.reduce((n, r) => n + r.seconds, 0).toFixed(0) +
      ' s)',
  );
  console.log(bad ? bad + ' FAILED' : 'all checks passed');
  process.exit(bad ? 1 : 0);
}
