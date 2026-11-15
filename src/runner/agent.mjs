// agent.mjs - Pi on the local model, and the agent check: three small jobs that need tools, each judged by the runner, never by the model.
// A job that fails its judge is not left failed: the model is told what the judge found and corrects its own work, then is given the
// way of working spelled out, then the job one checked step at a time. What it took is kept as how the team works with this model.
// Pi is installed INSIDE this app's own folder (.runner/pi), never globally, and it is pointed at the local server only (its own agent
// directory, .runner/pi-agent, holds one provider: this machine). The model gets read, write, edit and ls - no shell.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { AGENT, SERVED_NAME } from '../js/catalog.js';
import { piInstalled } from './host.mjs';
import { CONTEXT, run } from './engine.mjs';
import { fetchNode, findNpm, nodeFix, privateNode, privateNpm } from './node.mjs';

// EVERY NODE.JS THIS MACHINE HAS, in the order they are worth trying: this app's own copy, the one the runner itself is running on,
// the ones the caller knows of, then whatever version managers and Homebrew have installed, newest first.
async function nodesHere(stateDir, hints = []) {
  if (process.env.FO_NODE_CANDIDATES !== undefined)
    return process.env.FO_NODE_CANDIDATES.split(path.delimiter).filter(Boolean); // a test names them
  const home = os.homedir();
  const kids = async (d) => {
    try {
      return (await readdir(d)).map((x) => path.join(d, x));
    } catch {
      return [];
    }
  };
  const cellar = async (root) =>
    (await Promise.all((await kids(root)).filter((d) => /[\\/]node(@\d+)?$/.test(d)).map(kids)))
      .flat()
      .map((d) => path.join(d, 'bin', 'node'));
  const managed = [
    ...(await kids(path.join(process.env.NVM_DIR || path.join(home, '.nvm'), 'versions', 'node'))).map((d) =>
      path.join(d, 'bin', 'node'),
    ),
    ...(await kids(path.join(home, '.local/share/fnm/node-versions'))).map((d) =>
      path.join(d, 'installation', 'bin', 'node'),
    ),
    ...(await kids(path.join(home, 'Library/Application Support/fnm/node-versions'))).map((d) =>
      path.join(d, 'installation', 'bin', 'node'),
    ),
    ...(await kids(path.join(home, '.volta/tools/image/node'))).map((d) => path.join(d, 'bin', 'node')),
    ...(await kids(path.join(home, '.asdf/installs/nodejs'))).map((d) => path.join(d, 'bin', 'node')),
    ...(await cellar('/opt/homebrew/Cellar')),
    ...(await cellar('/usr/local/Cellar')),
  ];
  const ver = (p) => (/(\d+)\.(\d+)\.(\d+)/.exec(p) || [0, 0, 0, 0]).slice(1).map(Number);
  const newest = (a, b) => {
    const x = ver(a);
    const y = ver(b);
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  };
  const out = [];
  const seen = new Set();
  for (const n of [
    privateNode(stateDir),
    process.execPath,
    ...hints,
    ...managed.sort(newest),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
  ]) {
    if (!n) continue;
    const real = await realpath(n).catch(() => null);
    if (!real || seen.has(real)) continue;
    seen.add(real);
    out.push(n);
  }
  return out.slice(0, 16);
}
const errorIn = (tail) =>
  (tail.map((l) => String(l).trim()).find((l) => /^\w*Error\b.{0,3}:? /.test(l) && l.length < 300) || '').slice(0, 180);
// does the agent start on this Node.js at all? null when it does, else why not
const startsOn = async (node, cli) => {
  const r = await run(node, [cli, '--version'], { timeout: 25000 }).catch((e) => ({
    code: 1,
    tail: [String(e && e.message)],
  }));
  return r.code === 0 ? null : errorIn(r.tail) || 'it stopped as soon as it started (exit ' + r.code + ')';
};
const versionOf = async (node) => {
  const r = await run(node, ['--version'], { timeout: 8000 }).catch(() => ({ code: 1, tail: [] }));
  return r.code === 0
    ? String(r.tail[r.tail.length - 1] || '')
        .trim()
        .replace(/^v/, '')
    : '';
};
// THE NODE.JS THE AGENT RUNS ON is found by trying, not by reading a version number: a Node.js can be newer by its number and still
// lack what the agent needs. Each one is asked to start the agent; the first that does is the one. avoid: ones already found wanting.
export async function nodeFor(stateDir, cli, { hints = [], avoid = [], onLine = () => {} } = {}) {
  const tried = [];
  for (const n of await nodesHere(stateDir, hints)) {
    if (avoid.includes(n)) {
      tried.push({ node: n, why: 'it stopped the agent in the middle of a job' });
      continue;
    }
    const why = await startsOn(n, cli);
    if (!why) return { node: n, version: await versionOf(n), tried };
    tried.push({ node: n, why });
    onLine(AGENT.name + ' does not start on ' + n + '. Trying another Node.js');
  }
  return { node: null, version: '', tried };
}

export async function ensureAgent(stateDir, nodeBin, { onLine = () => {}, fetch: mayFetch = false, avoid = [] } = {}) {
  const test = process.env.FO_PI_CLI;
  let have = test ? { cli: test, version: 'test double' } : await piInstalled(stateDir);
  let installer = null;
  const already = !!have;
  // already here: the registry is asked, once a day at most, whether a newer one is out. A failed update leaves the one here.
  if (already && !test) {
    const { updateAgent } = await import('./updates.mjs');
    const up = await updateAgent({ stateDir, nodeBin, onLine }).catch(() => ({}));
    if (up.did) have = (await piInstalled(stateDir)) || have;
  }
  if (!have) {
    const prefix = path.join(stateDir, 'pi');
    await mkdir(prefix, { recursive: true });
    // which Node.js installs it: this app's own copy when it has one, else the machine's, with the npm that goes with it wherever that is kept
    const own = privateNode(stateDir);
    let npmCli = null;
    if (
      await readFile(own).then(
        () => true,
        () => false,
      )
    ) {
      nodeBin = own;
      npmCli = privateNpm(stateDir);
    } else if (nodeBin) npmCli = await findNpm(nodeBin);
    if (!nodeBin || !npmCli) {
      const what = nodeBin
        ? 'Pi is installed with npm, and the Node.js on this machine (' + nodeBin + ') has no npm with it.'
        : 'Pi needs Node.js ' + AGENT.node.join('.') + ' or newer, and this machine has none.';
      if (!mayFetch) return { ok: false, why: what, fix: nodeFix(what) }; // offered as a button, never as a command to type
      const got = await fetchNode(stateDir, onLine);
      if (!got.ok) return { ok: false, why: got.why, fix: nodeFix(what) };
      nodeBin = got.node;
      npmCli = got.npmCli;
    }
    const r = await run(
      nodeBin,
      [npmCli, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', AGENT.pkg],
      {
        onLine,
        timeout: 6 * 60000,
        env: { ...process.env, PATH: path.dirname(nodeBin) + path.delimiter + process.env.PATH },
      },
    );
    if (r.code !== 0) return { ok: false, why: 'npm install of Pi failed: ' + r.tail.slice(-2).join(' / ') };
    have = await piInstalled(stateDir);
    if (!have) return { ok: false, why: 'npm finished, but Pi was not found afterwards.' };
    installer = nodeBin;
  }
  // INSTALLED IS NOT THE SAME AS ABLE TO START. The agent is started once on each Node.js here until one runs it.
  let got = await nodeFor(stateDir, have.cli, { hints: [installer, nodeBin].filter(Boolean), avoid, onLine });
  if (!got.node) {
    const what =
      AGENT.name +
      ' is installed, but no Node.js on this machine can start it' +
      (got.tried.length
        ? ' (' + got.tried.length + ' tried; the last said: ' + got.tried[got.tried.length - 1].why + ')'
        : '') +
      '.';
    const offline = process.env.FO_NO_NET === '1' && !process.env.FO_NODE_DIST;
    if (offline) return { ok: false, why: what, fix: nodeFix(what) };
    onLine('No Node.js here can start ' + AGENT.name + '. Fetching Node.js for this app only');
    const f = await fetchNode(stateDir, onLine);
    if (!f.ok) return { ok: false, why: what + ' ' + f.why, fix: nodeFix(what) };
    const why = await startsOn(f.node, have.cli);
    if (why) return { ok: false, why: AGENT.name + ' does not start even on the Node.js fetched for it: ' + why };
    got = { node: f.node, version: await versionOf(f.node), tried: got.tried, fetched: true };
  }
  const says = got.fetched
    ? 'It runs on a Node.js fetched for this app (' + got.version + '): none on this machine could start it'
    : got.tried.length
      ? 'It runs on Node.js ' +
        got.version +
        ' here: ' +
        got.tried.length +
        ' other' +
        (got.tried.length === 1 ? '' : 's') +
        ' could not start it'
      : '';
  return { ok: true, ...have, already, node: got.node, nodeVersion: got.version, says };
}

// WHAT THE AGENT IS TOLD ABOUT THE MODEL SERVER: how much it may ask for in one reply, and how large the server's context is. An agent
// that asks for more reply than the server's whole context is refused before the model sees a word (TensorFold checks it; some servers
// do not), and that looks exactly like a model that did nothing. So the reply is capped from the start, and whatever a server says
// about its limits when it refuses is LEARNED and kept beside the agent (limits.json), per server and model, for every run after.
const limitsFile = (dir) => path.join(dir, 'limits.json');
const readLimits = async (dir) => {
  try {
    return JSON.parse(await readFile(limitsFile(dir), 'utf8'));
  } catch {
    return {};
  }
};
async function agentDir(stateDir, port, via) {
  const dir = path.join(stateDir, 'pi-agent');
  await mkdir(dir, { recursive: true });
  const t =
    port && typeof port === 'object' ? port : { base: 'http://127.0.0.1:' + port, model: SERVED_NAME, ours: true }; // a server we started, or one that was already running
  const key = (t.ours ? 'ours' : t.base) + '|' + t.model;
  const all = await readLimits(dir);
  const lim = { maxTokens: 4096, ...(t.ours ? { context: CONTEXT } : {}), ...(all[key] || {}) };
  await writeFile(
    path.join(dir, 'models.json'),
    JSON.stringify(
      {
        providers: {
          tensorfold: {
            baseUrl: (via || t.base) + '/v1',
            api: 'openai-completions',
            apiKey: 'local',
            models: [{ id: t.model, maxTokens: lim.maxTokens, ...(lim.context ? { contextWindow: lim.context } : {}) }],
          },
        },
      },
      null,
      2,
    ),
  );
  return {
    dir,
    model: t.model,
    key,
    lim,
    learn: async (next) => {
      const now = await readLimits(dir);
      now[key] = { ...next, at: Date.now() };
      await writeFile(limitsFile(dir), JSON.stringify(now, null, 2));
    },
  };
}
// what a refusal says about the server's limits, in the words servers use: { context, maxTokens }, or null when it says nothing usable
export function limitsFrom(err) {
  const s = String(err || '');
  const n = (re) => Number((re.exec(s) || [])[1]) || 0;
  const context = n(/maximum context length is (\d+)/i) || n(/context (?:window|length|size) (?:is|of) (\d+)/i);
  const room = n(/request at most (\d+) (?:reply|completion|output|new) tokens/i);
  const used =
    n(/rendered prompt has (\d+) tokens/i) ||
    n(/\((\d+) in the messages/i) ||
    n(/prompt (?:is|has|contains) (\d+) tokens/i);
  const spare = room || (context && used ? context - used : 0);
  return context && spare >= 512 ? { context, maxTokens: Math.max(256, Math.min(4096, Math.floor(spare / 2))) } : null; // under 512 to spare: the agent's own instructions do not fit, and no setting here cures that
}

// one Pi run: a prompt, a working folder, the JSON event stream read line by line (LF only, as Pi's docs require).
// The agent is run LEAN: nothing from the customer's own machine is read into its instructions (no AGENTS.md or CLAUDE.md from the
// folders above, no extensions, skills, templates or connectors), so a job is the same job on every machine. repo: true lets it read
// the instruction files of the repository it is working in.
// AN ENGINE FAULT IS NOT A WRONG ANSWER. When the model server refuses the agent's request, the run ends at once with no work done.
// If the refusal names the server's limits, they are learned and the run is made again within them; otherwise the fault is reported
// as engineError, in the server's own words, and nothing is "corrected".
// via: the runner's own door to the model (index.mjs: /api/model). Through it every request is asked the way this model has been
// learned to need, and a reply that breaks down is cut and asked again before the agent ever sees it (tune.mjs).
const PATHS =
  'Name every file by its path relative to the current folder, for example notes.txt or src/app.js. Never write a full path from the root of the disk.';
// A REPOSITORY'S OWN INSTRUCTIONS (its AGENTS.md, or its CLAUDE.md), for a change made in it: read from the top of that repository
// only, and only their first part. The agent is never left to find instruction files itself: it looks in every folder above the
// one it is started in as well, and whatever lies there (found for real: 23,526 tokens of another project's rules, into a model
// that holds 16,384) is put in front of every request.
const repoNotes = async (cwd) => {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const t = await readFile(path.join(cwd, name), 'utf8').catch(() => null);
    if (t && t.trim()) {
      const cut = t.length > 4000;
      return (
        "\n\nThis repository's own instructions for anyone changing it (from " +
        name +
        (cut ? ', its first part' : '') +
        '):\n' +
        t.slice(0, 4000).trim()
      );
    }
  }
  return '';
};
export async function runAgent({
  stateDir,
  nodeBin,
  cli,
  port,
  via = '',
  cwd,
  prompt,
  timeout = 4 * 60000,
  repo = false,
  tools: has = 'read,write,edit,ls',
  full = false,
}) {
  const startedAt = Date.now();
  const notes = repo ? await repoNotes(cwd) : '';
  let out = null;
  for (let go = 0; go < 3; go++) {
    const { dir, model, lim, learn } = await agentDir(stateDir, port, via);
    let tools = 0;
    let turns = 0;
    let said = '';
    let fault = '';
    const onLine = (line) => {
      if (line[0] !== '{') return;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.type === 'turn_end') {
        turns++;
        tools += Array.isArray(ev.toolResults) ? ev.toolResults.length : 0;
      }
      if (ev.type === 'message_end' && ev.message && ev.message.role === 'assistant') {
        const c = ev.message.content;
        said = Array.isArray(c)
          ? c
              .filter((x) => x && x.type === 'text')
              .map((x) => x.text)
              .join(' ')
          : String(c || '');
        if (ev.message.stopReason === 'error')
          fault = String(ev.message.errorMessage || 'the model server refused the request').slice(0, 400);
      }
    };
    const lean = ['--no-context-files', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-mcp'];
    const result = await run(
      nodeBin || process.execPath,
      [
        cli,
        '--mode',
        'json',
        '--no-session',
        '--provider',
        'tensorfold',
        '--model',
        model,
        '--tools',
        has,
        ...lean,
        '--append-system-prompt',
        PATHS,
        prompt + notes,
      ],
      { onLine, cwd, timeout, env: { ...process.env, PI_CODING_AGENT_DIR: dir } },
    );
    // CRASHED: it ended badly without one turn. That is the agent not running, not the model answering wrongly, and it is said as such.
    const brokeDown = /^BROKE DOWN/.test(fault);
    const crashed = result.code !== 0 && turns === 0 && tools === 0;
    const engineError = !crashed && fault && tools === 0 && !brokeDown ? fault : '';
    out = {
      code: brokeDown ? 1 : result.code,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      tools,
      turns,
      said: said.slice(0, full ? 2000 : 200),
      crashed,
      engineError,
      brokeDown,
      error: crashed ? errorIn(result.tail) || 'it stopped as soon as it started (exit ' + result.code + ')' : '',
      tail: brokeDown
        ? 'its replies kept breaking down into repetition'
        : result.tail
            .filter((l) => l[0] !== '{' && String(l).length < 300)
            .slice(-2)
            .join(' / '),
    };
    const next = engineError ? limitsFrom(engineError) : null;
    if (!next || (next.maxTokens === lim.maxTokens && next.context === lim.context)) break; // nothing to learn from it, or it was already known
    await learn(next);
    out.learned = next; // the server said what it allows: kept, and the run is made again within it
  }
  return out;
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const text = (dir, name) => readFile(path.join(dir, name), 'utf8').catch(() => null);
const TEST_JS =
  "const assert = require('node:assert');\nconst { average } = require('./math.js');\nassert.strictEqual(average([2, 4, 6]), 4);\nassert.strictEqual(average([10]), 10);\nconsole.log('PASS');\n";
const MATH_JS = 'exports.average = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length + 1);\n';
const SEATS = ['overseer', 'steward', 'operations', 'ask', 'master'];

// A JUDGE answers null when the work is right, or what it found: 'why' for the person, 'tell' for the model. 'tell' is what a reviewer
// would say - what is wrong and where to look - and NEVER the answer, so a correction is still the model's own work.
const found = (why, tell, lesson) => ({ why, tell: tell || why, lesson: lesson || '' });
// WHAT A FINDING TEACHES. Each is a rule in plain words that holds for any job, never the answer to this one. A judge names its rule,
// or the rule is read from what the judge said.
export const LESSONS = {
  names: 'Use the exact file names the task gives, and create each file the task asks for.',
  exact: 'Write exactly what is asked and nothing around it: no extra words, no explanation, no code fence.',
  read: 'Read every file the task names before you write anything.',
  scope: 'Change only what the task says. Leave every other file as it is.',
  check: 'When you have written a file, read it back and check it against the task, part by part.',
  ground: 'Say only what the sources say. When they do not say it, say that they do not.',
  brief: 'Keep to the length that was asked for. Count before you finish.',
};
const lessonOf = (f) =>
  f && LESSONS[f.lesson]
    ? f.lesson
    : !f
      ? ''
      : /was not written|is missing|There is no (file|sentence)/i.test(f.tell)
        ? 'names'
        : /was changed|has been put back|change only/i.test(f.tell)
          ? 'scope'
          : /nothing else|and nothing|not valid JSON|no words around|only the|exactly/i.test(f.tell)
            ? 'exact'
            : /sources? do not|the sources/i.test(f.tell)
              ? 'ground'
              : /under \d+ words|too long|longer than/i.test(f.tell)
                ? 'brief'
                : 'check';
// the rules a model was taught here, in front of a job
// the same rules as a seat in the chat is given them: only the ones that mean something in a conversation, in a conversation's words
export const SEAT_LESSONS = {
  exact: 'Give exactly what was asked for, with nothing around it.',
  check: 'Before you send it, read your answer back against what was asked, part by part.',
  ground:
    'When you are given sources to answer from, say only what they say; when they do not say, say so. A plain question with no sources you answer from what you know.',
  brief: 'Keep to the length that was asked for.',
};
export const leadOf = (keys) => {
  const ls = (keys || []).filter((k) => LESSONS[k]);
  return ls.length
    ? 'Before you start, these are things you have got wrong before. Keep to them:\n' +
        ls.map((k) => '- ' + LESSONS[k]).join('\n') +
        '\n\n'
    : '';
};
const onlyDigits = (name, t, of) =>
  name + ' must hold only ' + of + ', as digits and nothing else. It holds: ' + JSON.stringify(String(t).slice(0, 60));
async function judgeTotal(dir) {
  const t = await text(dir, 'total.txt');
  if (t === null)
    return found(
      'total.txt was not written',
      'There is no file named total.txt. Write the total to a new file with exactly that name.',
    );
  if (t.trim() === '42') return null;
  return found(
    'total.txt does not hold 42',
    /^-?\d+$/.test(t.trim())
      ? 'total.txt holds ' +
          t.trim() +
          ', which is not the sum of the numbers. Read the numbers again, add every one of them, and write only the total.'
      : onlyDigits('total.txt', t, 'the total'),
  );
}
async function judgeSeen(dir) {
  const t = await text(dir, 'seen.txt');
  if (t === null)
    return found(
      'seen.txt was not written',
      'There is no file named seen.txt. Write the numbers to a new file with exactly that name.',
    );
  return t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(',') === '12,7,23'
    ? null
    : found(
        'seen.txt does not hold the three numbers',
        'seen.txt must hold the numbers from numbers.txt, one on each line, in the same order, and nothing else. Read numbers.txt again and compare.',
      );
}
// test.js is put back if it was touched: the model is told so, and the next try starts from an honest test
async function keepTest(dir) {
  if (sha((await text(dir, 'test.js')) || '') === sha(TEST_JS)) return null;
  await writeFile(path.join(dir, 'test.js'), TEST_JS);
  return found(
    'test.js was changed',
    'You changed test.js. It has been put back as it was. The bug is in math.js: change only math.js.',
  );
}
async function judgeFix(dir, { nodeBin }) {
  const touched = await keepTest(dir);
  if (touched) return touched;
  const r = await run(nodeBin || process.execPath, ['test.js'], { cwd: dir, timeout: 15000 });
  if (r.code === 0) return null;
  const said = r.tail
    .filter((l) => /assert|error|expected|actual|!==|\d/i.test(l) && !/^\s+at /.test(l))
    .slice(0, 4)
    .join(' / ')
    .slice(0, 320);
  return found(
    'the test still fails',
    'Running test.js still fails' +
      (said ? ', and prints: ' + said : '') +
      '. Read math.js again and correct the function so the test passes.',
  );
}
async function judgeBugNote(dir) {
  const touched = await keepTest(dir);
  if (touched) return touched;
  if ((await text(dir, 'math.js')) !== MATH_JS) {
    await writeFile(path.join(dir, 'math.js'), MATH_JS);
    return found(
      'math.js was changed too early',
      'This step is only to say what is wrong. math.js has been put back as it was. Write the sentence to bug.txt and change nothing else.',
    );
  }
  const t = await text(dir, 'bug.txt');
  return t !== null && t.trim().length >= 12
    ? null
    : found(
        'bug.txt was not written',
        'There is no sentence in a file named bug.txt. Read math.js and test.js, then write one sentence to bug.txt saying what is wrong with the average function.',
      );
}
async function judgeSeats(dir) {
  const raw = await text(dir, 'seats.json');
  let a;
  if (raw === null)
    return found(
      'seats.json is missing or is not JSON',
      'There is no file named seats.json. Create it with exactly that name.',
    );
  try {
    a = JSON.parse(raw);
  } catch {
    return found(
      'seats.json is missing or is not JSON',
      'seats.json is not valid JSON. It must hold a JSON array of strings and nothing else: no words around it and no code fence.',
    );
  }
  return JSON.stringify(a) === JSON.stringify(SEATS)
    ? null
    : found(
        'seats.json does not hold the five seats in order',
        'seats.json does not hold exactly the five strings from the task, in the order given. Compare it with the task word by word.',
      );
}
async function judgeCount(dir) {
  const c = await text(dir, 'count.txt');
  if (c === null)
    return found('count.txt does not hold 5', 'There is no file named count.txt. Create it with exactly that name.');
  return c.trim() === '5'
    ? null
    : found('count.txt does not hold 5', onlyDigits('count.txt', c, 'the number of items in the array in seats.json'));
}

// THE AGENT CHECK. Each job: files to start from, what to ask, a judge the runner runs afterwards - and the same job as STEPS, each a
// smaller instruction with a judge of its own, for a model that cannot hold the whole job at once. A step never tells the answer.
export const JOBS = [
  {
    id: 'read-write',
    title: 'Read a file, write the answer',
    files: { 'numbers.txt': '12\n7\n23\n' },
    prompt: 'Read numbers.txt, add the numbers together, and write only the total to a new file named total.txt.',
    judge: judgeTotal,
    steps: [
      {
        prompt:
          'Read numbers.txt. Write the numbers it holds to a new file named seen.txt, one on each line, in the same order.',
        judge: judgeSeen,
      },
      {
        prompt:
          'Read seen.txt. Add the numbers in it together, and write only the total to a new file named total.txt.',
        judge: judgeTotal,
      },
    ],
  },
  {
    id: 'fix-bug',
    title: 'Find a bug and fix it',
    files: { 'math.js': MATH_JS, 'test.js': TEST_JS },
    prompt:
      'test.js fails. Read math.js and test.js, fix the bug in math.js so the test passes, and do not change test.js.',
    judge: judgeFix,
    steps: [
      {
        prompt:
          'Read math.js and test.js. Write one sentence to a new file named bug.txt saying what is wrong with the average function in math.js. Change no other file.',
        judge: judgeBugNote,
      },
      {
        prompt: 'Read bug.txt and math.js. Change math.js so the average function is correct. Change only math.js.',
        judge: judgeFix,
      },
    ],
  },
  {
    id: 'two-files',
    title: 'Write two files that agree',
    files: {},
    prompt:
      'Create seats.json containing a JSON array of exactly these five strings in this order: overseer, steward, operations, ask, master. Then create count.txt containing only the number of items in that array.',
    judge: async (dir) => (await judgeSeats(dir)) || judgeCount(dir),
    steps: [
      {
        prompt:
          'Create seats.json containing a JSON array of exactly these five strings in this order: overseer, steward, operations, ask, master. Create no other file.',
        judge: judgeSeats,
      },
      {
        prompt: 'Read seats.json. Create count.txt containing only the number of items in that array.',
        judge: judgeCount,
      },
    ],
  },
];

// HOW A JOB IS GIVEN, from the least help to the most. A job stops at the first way that passes its judge.
//   alone      the job as it is
//   corrected  the model is told what the judge found, and puts its own work right (its work is still in the folder)
//   guided     the job again from clean files, with the way of working spelled out in front of it, and corrections as before
//   steps      the job one step at a time: each step judged by the runner and corrected before the next is given
export const WAYS = ['alone', 'corrected', 'guided', 'steps'];
export const GUIDE = [
  'Work like this:',
  '1. Read every file the task names before you change anything.',
  '2. Make one change at a time, with your tools. Writing a file means writing its whole content.',
  '3. After each change, read the file back and check it against the task.',
  '4. Do exactly what the task asks and nothing more. Do not create or change any other file.',
  '5. When it is done, say so in one line and stop.',
  '',
  'The task: ',
].join('\n');
const STEP = 'One step only. Do exactly this and nothing more, then stop.\n\n';
const correction = (task, tell) =>
  'A check of your work found: ' +
  tell +
  '\n\nYour earlier work is still in this folder. Put it right, then stop.\n\nThe task was: ' +
  task;

// work(): ONE JOB, given the way that suits the model, corrected until its judge passes or the ways run out. This is how the agent
// check runs a job, and it is the way the team gives this model any job with a judge: 'from' is where to begin (what was learned).
//   attempt(prompt) -> { code, seconds, tools, turns, tail }     one run of the agent in 'dir'
//   onTry({ how, tries, last })                                  called before every run, for the page
// It answers { pass, how, why, tries, seconds, tools, turns, note }. Nothing here ever writes the answer for the model.
export async function work({
  job,
  dir,
  attempt,
  ctx = {},
  from = 'alone',
  fixes = 2,
  lead = '',
  onTry = () => {},
  halt = () => false,
  budgetMs = Number(process.env.FO_CHECK_BUDGET_MS) || 10 * 60000,
}) {
  const t0 = Date.now();
  const tot = { tries: 0, seconds: 0, tools: 0, turns: 0 };
  const taught = new Set();
  let last = null;
  let note = ''; // taught: the rules its misses pointed at
  const over = () => Date.now() - t0 > budgetMs;
  const fresh = async () => {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const [name, body] of Object.entries(job.files)) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), body);
    }
  };
  const tryJob = async (prompt, how, judge) => {
    // one run, then its judgement
    if (halt()) throw new Error('cancelled');
    tot.tries++;
    onTry({ how, tries: tot.tries, last: last ? last.why : '' });
    const r = await attempt(lead + prompt);
    if (r.crashed) throw Object.assign(new Error(r.error || 'it stopped as soon as it started'), { agentDown: true }); // no correction can help an agent that is not running
    if (r.engineError) throw Object.assign(new Error(r.engineError), { agentDown: true, engine: true }); // nor a model server that refuses the agent's request: the model never saw the job
    tot.seconds = Math.round((tot.seconds + (r.seconds || 0)) * 10) / 10;
    tot.tools += r.tools || 0;
    tot.turns += r.turns || 0;
    if (r.code !== 0 && r.tail) note = r.tail;
    last = await judge(dir, ctx).catch((e) => found('the judge could not run: ' + e.message));
    if (last) taught.add(lessonOf(last));
    return !last;
  };
  const told = async (task, lead, how, judge, n) => {
    for (let i = 0; i < n && !over(); i++)
      if (await tryJob(lead + correction(task, last.tell), how, judge)) return true;
    return false;
  };
  const done = async (how) => {
    const end =
      how === 'steps' || !last
        ? await job.judge(dir, ctx).catch((e) => found('the judge could not run: ' + e.message))
        : last;
    return {
      pass: !end,
      how: end ? 'failed' : how,
      why: end ? end.why : '',
      ...tot,
      note: end ? note : '',
      lessons: [...taught].filter(Boolean),
    };
  };
  const at = Math.max(0, WAYS.indexOf(from));
  try {
    await fresh();
    if (at <= 1) {
      if (await tryJob(job.prompt, 'alone', job.judge)) return done('alone');
      if (await told(job.prompt, '', 'corrected', job.judge, fixes)) return done('corrected');
    }
    if (at <= 2 && !over()) {
      if (at <= 1) await fresh();
      if (
        (await tryJob(GUIDE + job.prompt, 'guided', job.judge)) ||
        (await told(job.prompt, GUIDE, 'guided', job.judge, 1))
      )
        return done('guided');
    }
    if (!over()) {
      await fresh();
      let ok = true;
      for (const step of job.steps) {
        if (!(
          (await tryJob(STEP + step.prompt, 'steps', step.judge)) ||
          (await told(step.prompt, STEP, 'steps', step.judge, fixes))
        )) {
          ok = false;
          break;
        }
      }
      if (ok) return done('steps');
    }
    last =
      (await job.judge(dir, ctx).catch((e) => found('the judge could not run: ' + e.message))) ||
      found('it ran out of time'); // say what the job's own judge finds, not a step's
    return done('failed');
  } catch (e) {
    if (!e || !e.agentDown) throw e;
    return {
      pass: false,
      how: 'failed',
      why: e.engine ? "the model server refused the agent's request" : 'the agent could not start',
      crashed: true,
      engine: !!e.engine,
      note: e.message,
      ...tot,
    };
  }
}

// before: what this model needed last time, job by job ({ jobs: { id: way } }). A job begins where it passed before; within one check, once
// a job has needed the way of working spelled out, the jobs after it are given it from the start.
// repair(why) -> a Node.js the agent runs on, or null: called when the agent stops without a turn in the middle of the check
// ---------- the jobs of the other sets ----------
// a Python to run a Python job's test with. On a Mac, /usr/bin/python3 without the developer tools is Apple's placeholder, and running
// it puts up a window asking to install them: that one is never run, and the job is then judged by reading the file.
const there = (p) =>
  realpath(p).then(
    () => true,
    () => false,
  );
const findPython = async () => {
  for (const d of String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)) {
    const p = path.join(d, 'python3');
    if (!(await there(p))) continue;
    if (
      process.platform === 'darwin' &&
      p === '/usr/bin/python3' &&
      !(await there('/Library/Developer/CommandLineTools/usr/bin/python3')) &&
      !(await there('/Applications/Xcode.app'))
    )
      continue;
    return p;
  }
  return '';
};
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
const missing = (name) =>
  found(name + ' was not written', 'There is no file named ' + name + '. Write it with exactly that name.', 'names');
const untouched = async (dir, name, body, where) => {
  if ((await text(dir, name)) === body) return null;
  await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
  await writeFile(path.join(dir, name), body);
  return found(
    name + ' was changed',
    'You changed ' + name + '. It has been put back as it was. Change only ' + where + '.',
    'scope',
  );
};
const judgeNote = async (dir) => {
  const t = await text(dir, 'notes.txt');
  return t !== null && t.trim().length >= 12 ? null : missing('notes.txt');
};
// every job can also be given one step at a time: first say what it needs in notes.txt, then do it
const stepped = (job, first) => ({
  ...job,
  steps: [
    { prompt: first + ' Write it to a new file named notes.txt. Change no other file.', judge: judgeNote },
    { prompt: 'Read notes.txt. ' + job.prompt, judge: job.judge },
  ],
});
const SOURCE_A =
  'CITY GUIDE, page 12\nThe Harbour Museum reopened in 2019 after two years of repairs. Its cafe is on the ground floor. The Maritime Library next door opens 9 am to 5 pm every day.\n';
const SOURCE_B =
  'HARBOUR MUSEUM, visitor notice\nOpening hours: Tuesday to Saturday 9 am to 6 pm. Sunday 10 am to 4 pm. Closed on Mondays.\n';
const oneLine = async (dir, name, max, need, what) => {
  const t = await text(dir, name);
  if (t === null) return missing(name);
  const s = t.trim();
  if (s.split('\n').filter((l) => l.trim()).length !== 1)
    return found(name + ' is not one line', name + ' must hold one line and nothing else.', 'exact');
  if (words(s) > max)
    return found(
      name + ' is too long',
      name + ' is longer than was asked: it must be under ' + max + ' words.',
      'brief',
    );
  return need.every((re) => re.test(s))
    ? null
    : found(
        name + ' leaves out part of what was asked for',
        name + ' does not describe everything in request.txt: ' + what + '. Read request.txt again.',
        'check',
      );
};
const SIMPLE = [
  stepped(
    {
      id: 'answer',
      title: 'Answer a question plainly',
      files: { 'question.txt': 'How many days are there in a leap year, and which month has the extra day?\n' },
      prompt: 'Read question.txt and write the answer to a new file named answer.txt, in one or two plain sentences.',
      judge: async (dir) => {
        const t = await text(dir, 'answer.txt');
        if (t === null) return missing('answer.txt');
        if (words(t) > 45)
          return found(
            'answer.txt is too long',
            'answer.txt is longer than was asked: it must be one or two sentences, under 45 words.',
            'brief',
          );
        return /366/.test(t) && /febr/i.test(t)
          ? null
          : found(
              'answer.txt does not answer both parts of the question',
              'answer.txt does not give both things the question asks for. Read question.txt again and answer each part.',
              'check',
            );
      },
    },
    'Read question.txt and say in one sentence what it asks.',
  ),
  stepped(
    {
      id: 'research',
      title: 'Find it in the sources, and say which one',
      files: { 'source-a.txt': SOURCE_A, 'source-b.txt': SOURCE_B },
      prompt:
        'Using only source-a.txt and source-b.txt, write to a new file named findings.txt when the Harbour Museum is open on Sundays, and name the file that says so.',
      judge: async (dir) => {
        const t = await text(dir, 'findings.txt');
        if (t === null) return missing('findings.txt');
        if (!/\b10\b/.test(t) || !/\b4\b/.test(t))
          return found(
            'findings.txt does not give the Sunday hours',
            'findings.txt does not give the hours the sources give for the Harbour Museum on Sundays. One of the sources is about another building: read both again.',
            'ground',
          );
        return /source-b/i.test(t)
          ? null
          : found(
              'findings.txt does not name the source',
              'findings.txt must also name the file that gives those hours.',
              'check',
            );
      },
    },
    "Read source-a.txt and source-b.txt and say which of them gives the Harbour Museum's opening hours.",
  ),
  stepped(
    {
      id: 'not-there',
      title: 'Say so when the sources do not say',
      files: { 'source-a.txt': SOURCE_A, 'source-b.txt': SOURCE_B },
      prompt:
        'Using only source-a.txt and source-b.txt, write to a new file named price.txt what a ticket to the Harbour Museum costs. If the sources do not say, write exactly: not stated',
      judge: async (dir) => {
        const t = await text(dir, 'price.txt');
        if (t === null) return missing('price.txt');
        return t.trim().toLowerCase().replace(/[."']/g, '') === 'not stated'
          ? null
          : found(
              'price.txt gives something the sources do not say',
              'The sources do not give a ticket price. When they do not say, price.txt must hold exactly the two words the task gives, and nothing else.',
              'ground',
            );
      },
    },
    'Read source-a.txt and source-b.txt and say whether either of them gives a ticket price.',
  ),
  stepped(
    {
      id: 'message',
      title: 'Write a message for someone',
      files: { 'note.txt': 'cant do thursday 3pm. move it. ASAP!!\n' },
      prompt:
        'Read note.txt. Write a polite message to a new file named reply.txt that asks to move the meeting from Thursday at 3 pm to another time. Keep the day and the time in it, and keep it under 60 words.',
      judge: async (dir) => {
        const t = await text(dir, 'reply.txt');
        if (t === null) return missing('reply.txt');
        if (words(t) > 60)
          return found(
            'reply.txt is too long',
            'reply.txt is longer than was asked: it must be under 60 words.',
            'brief',
          );
        if (!/thursday/i.test(t) || !/\b3\s*(pm|p\.m\.|:00)/i.test(t))
          return found(
            'reply.txt lost the day or the time',
            'reply.txt must keep the day and the time of the meeting that is to be moved. Read note.txt again.',
            'check',
          );
        return /ASAP|!!/.test(t)
          ? found(
              'reply.txt is not polite',
              'reply.txt still reads like the note: it must be polite, with no shouting.',
              'check',
            )
          : null;
      },
    },
    'Read note.txt and say in one sentence what the writer wants.',
  ),
];
const BRIEFS = {
  draw: stepped(
    {
      id: 'picture-brief',
      title: 'Describe a picture to be made',
      files: { 'request.txt': 'a red bicycle leaning on a blue door, early morning light\n' },
      prompt:
        'Read request.txt. Write to a new file named picture.txt one line, under 40 words, that describes that picture for a picture maker: what is in it, its colours, and the light.',
      judge: (dir) =>
        oneLine(dir, 'picture.txt', 40, [/bicycle|bike/i, /door/i, /red/i, /blue/i], 'what is in it and its colours'),
    },
    'Read request.txt and list what is in the picture.',
  ),
  film: stepped(
    {
      id: 'video-brief',
      title: 'Describe a video to be made',
      files: { 'request.txt': 'waves coming in on a beach at sunset\n' },
      prompt:
        'Read request.txt. Write to a new file named video.txt one line, under 40 words, that describes a few seconds of video for a film maker: what is in it, and what moves.',
      judge: (dir) =>
        oneLine(
          dir,
          'video.txt',
          40,
          [/wave/i, /beach|shore|sand/i, /sunset|dusk|evening/i],
          'where it is, the time of day, and what moves',
        ),
    },
    'Read request.txt and say what moves in it.',
  ),
};
const STATS_PY = 'def median(xs):\n    s = sorted(xs)\n    return s[len(s) // 2]\n';
const TEST_PY =
  'from stats import median\nassert median([3, 1, 2]) == 2\nassert median([4, 1, 3, 2]) == 2.5\nprint("ok")\n';
const STRINGS_XML = '<resources>\n    <string name="app_name">Shop</string>\n</resources>\n';
const LAYOUT_XML =
  '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"\n    android:layout_width="match_parent"\n    android:layout_height="wrap_content">\n    <Button\n        android:id="@+id/pay"\n        android:layout_width="wrap_content"\n        android:layout_height="wrap_content"\n        android:text="Pay now" />\n</LinearLayout>\n';
const GREETING_SWIFT = 'func greeting(name: String) -> String {\n    return "Hello" + name\n}\n';
const GREETING_TEST =
  '// greeting(name: "Ada") must return "Hello, Ada!"\n// greeting(name: "Lin") must return "Hello, Lin!"\n';
// one job for each platform a developer codes against here. They are reported by platform and do not decide how the team works with the model.
const PLATFORMS = [
  stepped(
    {
      id: 'python-fix',
      area: 'Python',
      extra: true,
      title: 'Python: fix a function so its test passes',
      files: { 'stats.py': STATS_PY, 'test_stats.py': TEST_PY },
      prompt:
        'test_stats.py fails. Read stats.py and test_stats.py, fix median in stats.py so the test passes, and do not change test_stats.py.',
      judge: async (dir, ctx) => {
        const kept = await untouched(dir, 'test_stats.py', TEST_PY, 'stats.py');
        if (kept) return kept;
        if (ctx.python) {
          const r = await run(ctx.python, ['test_stats.py'], { cwd: dir, timeout: 20000 });
          return r.code === 0
            ? null
            : found(
                'the test still fails',
                'Running test_stats.py still fails' +
                  (r.tail.length ? ', and prints: ' + r.tail.slice(-2).join(' / ').slice(0, 240) : '') +
                  '. A list with an even number of items has two middle values. Read stats.py again.',
                'check',
              );
        }
        const t = (await text(dir, 'stats.py')) || '';
        return /%\s*2/.test(t) && /\/\s*2(?!\s*\])/.test(t)
          ? null
          : found(
              'stats.py does not handle a list with an even number of items',
              'median in stats.py is still wrong for a list with an even number of items, which has two middle values. Read test_stats.py again.',
              'check',
            );
      },
    },
    'Read stats.py and test_stats.py and say in one sentence what is wrong with median.',
  ),
  stepped(
    {
      id: 'android-strings',
      area: 'Android',
      extra: true,
      title: "Android: move a button's words into the strings file",
      files: { 'res/values/strings.xml': STRINGS_XML, 'res/layout/checkout.xml': LAYOUT_XML },
      prompt:
        'This is part of an Android app. The button in res/layout/checkout.xml has its words written straight into the layout. Add a string named pay_button with the text Pay now to res/values/strings.xml, and make the button use it.',
      judge: async (dir) => {
        const s = await text(dir, 'res/values/strings.xml');
        const l = await text(dir, 'res/layout/checkout.xml');
        if (s === null) return missing('res/values/strings.xml');
        if (l === null) return missing('res/layout/checkout.xml');
        if (!/<string\s+name="pay_button"\s*>\s*Pay now\s*<\/string>/.test(s) || !/name="app_name"/.test(s))
          return found(
            'strings.xml does not hold the new string beside the old one',
            'res/values/strings.xml must hold a string named pay_button with the text Pay now, inside the resources element, and must still hold app_name.',
            'check',
          );
        return /android:text="@string\/pay_button"/.test(l) && !/android:text="Pay now"/.test(l)
          ? null
          : found(
              'the layout does not use the string',
              'The button in res/layout/checkout.xml must take its words from the new string by its name, and must no longer have them written in.',
              'check',
            );
      },
    },
    'Read res/layout/checkout.xml and res/values/strings.xml and say what has to change in each.',
  ),
  stepped(
    {
      id: 'swift-fix',
      area: 'Swift',
      extra: true,
      title: 'Swift: fix a function to match what is expected',
      files: { 'Greeting.swift': GREETING_SWIFT, 'GreetingTests.swift': GREETING_TEST },
      prompt:
        'Read Greeting.swift and GreetingTests.swift. Fix greeting in Greeting.swift so it returns what GreetingTests.swift says it must. Change only Greeting.swift.',
      judge: async (dir) => {
        const kept = await untouched(dir, 'GreetingTests.swift', GREETING_TEST, 'Greeting.swift');
        if (kept) return kept;
        const t = (await text(dir, 'Greeting.swift')) || '';
        return /"Hello, \\\(name\)!"/.test(t) || /"Hello, "\s*\+\s*name\s*\+\s*"!"/.test(t)
          ? null
          : found(
              'greeting does not return what is expected',
              'greeting in Greeting.swift does not return exactly what GreetingTests.swift gives: compare the two character by character, the comma, the space and the mark at the end. Write it as one string with the name inside it.',
              'check',
            );
      },
    },
    'Read Greeting.swift and GreetingTests.swift and say in one sentence what greeting returns now and what it must return.',
  ),
];
// which jobs a check runs. No mode: the three jobs with files, as before. helpers: { draw, film } as the runner reports them.
export function jobsFor({ mode = '', helpers = {} } = {}) {
  if (mode === 'simple')
    return [
      ...SIMPLE,
      ...(helpers && helpers.draw ? [BRIEFS.draw] : []),
      ...(helpers && helpers.film ? [BRIEFS.film] : []),
    ];
  return mode === 'developer' ? [...JOBS, ...PLATFORMS] : JOBS;
}

// learn: a local model is taught from its own misses (below). jobs: which jobs (jobsFor).
export async function agentCheck({
  stateDir,
  nodeBin,
  cli,
  port,
  via = '',
  onJob,
  runJob,
  root,
  before = null,
  halt,
  repair = null,
  jobs = JOBS,
  learn = false,
}) {
  const base = root || path.join(stateDir, 'check'); // runJob: another agent's way of doing one job (Claude Code); root: where its scratch folders go
  const out = [];
  const python = await findPython();
  const kept = ((before && before.lessons) || []).filter((k) => LESSONS[k]);
  let needed = 0; // kept: what this model was taught here before, in front of every job from the start
  // the scratch folders are plain CommonJS whatever package they sit under, so a job's test.js runs the way the model was told it does
  await mkdir(base, { recursive: true });
  await writeFile(path.join(base, 'package.json'), '{ "private": true, "type": "commonjs" }\n');
  const attemptIn = (dir) => (prompt) =>
    runJob ? runJob({ cwd: dir, prompt }) : runAgent({ stateDir, nodeBin, cli, port, via, cwd: dir, prompt });
  for (const job of jobs) {
    const dir = path.join(base, job.id);
    const was = before && before.jobs && WAYS.includes(before.jobs[job.id]) ? WAYS.indexOf(before.jobs[job.id]) : 0;
    const from = WAYS[Math.max(was, Math.min(needed, 2))];
    onJob({ id: job.id, title: job.title, state: 'run', how: 'alone', tries: 1, last: '' });
    const once = () =>
      work({
        job,
        dir,
        ctx: { nodeBin, python },
        from,
        halt,
        lead: leadOf(kept),
        attempt: attemptIn(dir),
        onTry: (t) => onJob({ id: job.id, title: job.title, state: 'run', ...t }),
      });
    let result = await once();
    if (result.crashed && repair && !result.engine) {
      onJob({
        id: job.id,
        title: job.title,
        state: 'run',
        how: 'repair',
        tries: 2,
        last: 'the agent stopped: finding a Node.js it runs on',
      });
      const next = await repair(result.note).catch(() => null);
      if (next) {
        nodeBin = next;
        result = await once();
      }
    }
    if (result.crashed) {
      const row = {
        id: job.id,
        title: job.title,
        state: 'done',
        pass: false,
        why: result.why,
        how: 'failed',
        crashed: true,
        engine: !!result.engine,
        tries: result.tries,
        seconds: result.seconds,
        tools: 0,
        turns: 0,
        note: result.note,
      };
      out.push(row);
      onJob(row);
      break;
    } // nothing after it can run either
    if (!job.extra) {
      if (result.pass) needed = Math.max(needed, WAYS.indexOf(result.how));
      else needed = WAYS.length - 1;
    } // a platform's job does not change how the jobs after it are given
    const row = {
      id: job.id,
      title: job.title,
      state: 'done',
      pass: result.pass,
      why: result.why,
      how: result.how,
      tries: result.tries,
      seconds: result.seconds,
      tools: result.tools,
      turns: result.turns,
      note: result.note,
      lessons: result.lessons || [],
      ...(job.extra ? { extra: true, area: job.area } : {}),
    };
    out.push(row);
    onJob(row);
  }
  // LEARNING FROM ITS OWN MISSES (a local model; Claude Code is not taught this way). Every miss pointed at a rule. The jobs that needed
  // help are given again, from the start and on their own, with the rules in front. If the model then needed LESS help in all, the rules
  // are kept and its results are the better ones; if not, they are dropped and nothing changes. Then once more with whatever the second
  // round's misses added, while there is a gain and time. What is kept goes in front of every job this model is given from then on.
  // Only a job the model actually MISSED is evidence: one that was given in steps because an earlier job needed them, and passed, taught
  // nothing, so it does not count towards whether the rules are kept. Once they are kept it is measured again from the start with them.
  let lessons = kept.slice();
  let rounds = 1;
  const helpOf = (r) => (r.pass ? WAYS.indexOf(r.how) : WAYS.length);
  const learnMs = Number(process.env.FO_LEARN_BUDGET_MS) || 8 * 60000;
  const began = Date.now();
  const again = (row, lead) => {
    const job = jobs.find((j) => j.id === row.id);
    const dir = path.join(base, job.id);
    onJob({ ...row, state: 'run', how: 'learning', tries: 1, last: '', round: rounds });
    return work({
      job,
      dir,
      ctx: { nodeBin, python },
      from: 'alone',
      fixes: 1,
      halt,
      lead,
      attempt: attemptIn(dir),
      onTry: (t) => onJob({ id: job.id, title: job.title, state: 'run', ...t, how: 'learning', round: rounds }),
    });
  };
  const take = (row, r, better) => {
    const spent = row.tries;
    row.again = (row.again || 0) + r.tries;
    row.seconds = Math.round((row.seconds + r.seconds) * 10) / 10;
    row.tools += r.tools;
    row.turns += r.turns;
    if (better && helpOf(r) < helpOf(row))
      Object.assign(row, {
        pass: r.pass,
        why: r.why,
        how: r.how,
        note: r.note,
        learned: true,
        lessons: r.lessons || [],
        tries: r.tries,
        again: row.again - r.tries + spent,
      });
    onJob(row);
  };
  while (learn && !runJob && rounds < 3 && !(halt && halt()) && Date.now() - began < learnMs) {
    const missed = out.filter((r) => helpOf(r) > 0 && (r.lessons || []).length);
    const fresh = [...new Set(missed.flatMap((r) => r.lessons))].filter((k) => LESSONS[k] && !lessons.includes(k));
    if (!missed.length || !fresh.length) break;
    rounds++;
    const trial = [...lessons, ...fresh];
    const tried = [];
    let gain = 0;
    let broke = false;
    for (const row of missed) {
      if (Date.now() - began > learnMs) break;
      const r = await again(row, leadOf(trial));
      if (r.crashed) {
        onJob(row);
        broke = true;
        break;
      }
      tried.push({ row, r });
      gain += helpOf(row) - helpOf(r);
    }
    for (const { row, r } of tried) take(row, r, gain > 0);
    if (gain <= 0) {
      rounds--;
      break;
    } // the rules did not help: they are not kept
    lessons = trial;
    if (broke) break;
    for (const row of out.filter((r) => helpOf(r) > 0 && !(r.lessons || []).length)) {
      // never missed, only given more help than it may need
      if (Date.now() - began > learnMs) break;
      const r = await again(row, leadOf(lessons));
      if (r.crashed) {
        onJob(row);
        break;
      }
      take(row, r, true);
    }
  }
  out.lessons = lessons;
  out.rounds = rounds;
  out.taught = lessons.filter((k) => !kept.includes(k));
  return out;
}

// THE FIT: what the check found about how this model works on this machine, kept with the session and used from then on.
//   level   the most help any job needed          jobs   the way each job passed (where a later check begins)
//   says    one sentence for the person           seat   one line added to what every seat is told when it speaks through this model
const SAYS = {
  alone: () => 'It did every job on its own, first time. Your team hands it whole jobs and checks the result.',
  corrected: () =>
    'It put its own work right once it was told what a check found. Your team checks its work and tells it what was found, up to twice.',
  guided: () =>
    'It works when the way of working is spelled out. Your team gives it that with every job, checks the work, and tells it what was found.',
  steps: () =>
    'It works one checked step at a time. Your team breaks its jobs into steps, checks each one, and tells it what was found.',
  short: (f) =>
    'It could not finish ' +
    (f.of - f.passed) +
    ' of ' +
    f.of +
    ' jobs, even one checked step at a time. Its tool work will need your eye; a larger model, or Claude Code, will do better.',
};
const SEAT = {
  alone: '',
  corrected: 'Before you answer, check your answer against what was asked.',
  guided:
    'Work in this order: say what was asked, do one thing, check it, then answer. Be exact about names and numbers.',
  steps:
    'Give one step at a time: the next thing to do and how to check it. Do not plan past that step. Be exact about names and numbers.',
};
// A platform's job is reported by its platform and does not set the level; what the model was taught is kept, and said to every seat.
export function fitFrom(rows) {
  const main = rows.filter((r) => !r.extra);
  const extra = rows.filter((r) => r.extra);
  const lessons = (rows.lessons || []).filter((k) => LESSONS[k]);
  const passed = main.filter((r) => r.pass).length;
  const top = main.reduce((a, r) => Math.max(a, r.pass ? WAYS.indexOf(r.how) : WAYS.length), 0);
  const level = top >= WAYS.length ? 'short' : WAYS[top];
  const f = {
    level,
    passed,
    of: main.length,
    tries: rows.reduce((a, r) => a + (r.tries || 1) + (r.again || 0), 0),
    jobs: Object.fromEntries(rows.map((r) => [r.id, r.pass ? r.how : 'steps'])),
    lessons,
    rounds: rows.rounds || 1,
    platforms: Object.fromEntries(extra.map((r) => [r.area, r.pass ? r.how : 'failed'])),
  };
  const HOWSAID = {
    alone: 'on its own',
    corrected: 'once corrected',
    guided: 'with the way of working spelled out',
    steps: 'one step at a time',
    failed: 'not yet',
  };
  const by = extra.length
    ? ' By platform: ' + extra.map((r) => r.area + ' ' + HOWSAID[r.pass ? r.how : 'failed']).join(', ') + '.'
    : '';
  const taught = (rows.taught || []).length
    ? ' It was taught ' +
      rows.taught.length +
      (rows.taught.length === 1 ? ' rule' : ' rules') +
      ' from its own misses, needed less help with ' +
      (rows.taught.length === 1 ? 'it' : 'them') +
      ' in front, and is given ' +
      (rows.taught.length === 1 ? 'it' : 'them') +
      ' from now on.'
    : '';
  const base = SEAT[level] === undefined ? SEAT.steps : SEAT[level];
  return {
    ...f,
    says: SAYS[level](f) + by + taught,
    seat: [
      base,
      ...lessons.filter((k) => !(k === 'check' && /check your answer/i.test(base))).map((k) => SEAT_LESSONS[k]),
    ]
      .filter(Boolean)
      .join(' '),
  };
}
export const checkLine = (rows) => {
  const ok = rows.filter((r) => r.pass);
  const self = ok.filter((r) => r.how !== 'alone').length;
  const learned = rows.filter((r) => r.learned).length;
  return (
    ok.length +
    ' of ' +
    rows.length +
    ' jobs passed' +
    (self ? ', ' + self + ' after it corrected itself' : '') +
    (learned ? ', ' + learned + ' with less help once it had been taught from its misses' : '')
  );
};
