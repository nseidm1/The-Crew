// swarm.mjs - DOES ANYONE HAVE ANY IDEAS?
// One model sits in all five seats. Asked the same thing the same way it gives the same answer five times, and a repair that failed once
// fails again the same way. What differs between the seats is how each LOOKS at a problem (its temper, js/team-soul.js), how freely it
// is let to think (its warmth: the sampling temperature) and what it reads first. So when the builder is stuck it asks the room; each
// seat answers from its own temper; and the answers that differ are each tried from the same starting point. The proof decides between
// them. Nobody's word does: a seat can say what it thinks is mistaken, and nothing is ever taken out or passed on that say-so alone.
//   askRoom({ ask, problem, seats, simple })  -> [{ seat, name, where, idea, blame, value, said }]   one answer a seat, the same ones dropped
//   tally(answers)                            -> { code, check, task, of, value, agree }             what the room thinks is mistaken
//   snapOf(dir) / backTo(dir, snap)           the working copy as it stands, and put back to that
//   tryIdeas({ ideas, snap, dir, apply, score, until, onStep }) -> { tries, best }                   each idea from the same start, the best kept
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { TEMPER } from '../js/team-soul.js';
import { sh } from './host.mjs';

const git = async (dir, args) => {
  const r = await sh('git', ['-C', dir, ...args], { timeout: 60000 });
  return { ok: r.ok, out: r.out || '', err: r.err || '' };
};
const words = (s) =>
  new Set(
    String(s || '')
      .toLowerCase()
      .match(/[a-z_][a-z0-9_]{2,}/g) || [],
  );
// two ideas are the same idea when most of the words of the shorter one are in the longer one
export const alike = (a, b) => {
  const x = words(a);
  const y = words(b);
  const small = x.size <= y.size ? x : y;
  const big = small === x ? y : x;
  if (!small.size) return true;
  let n = 0;
  for (const w of small) if (big.has(w)) n++;
  return n / small.size >= 0.7;
};
export const ROOM = ['overseer', 'steward', 'ask', 'master', 'operations'];

// WHAT A SEAT IS ASKED. It is shown the same problem as the others, and told to answer as itself. Three lines back, so that the answer can
// be read by a program: where, the one idea, and what it thinks is mistaken. When a value is in dispute it also works the value out.
const roomAsk = (p, t, first) =>
  (first ? first + '\n\n' : '') +
  'The builder on your team is stuck, and has asked the room: does anyone have any ideas?\n\nThe task the team was given:\n\n' +
  p.task +
  '\n\n' +
  (p.code ? 'The code as it stands now:\n\n' + p.code + '\n\n' : '') +
  'What still fails:\n' +
  p.fails.map((f) => '- ' + f).join('\n') +
  '\n\n' +
  (p.check
    ? 'The check that fails, as it is written (it was written from the task, and it may itself be mistaken):\n\n' +
      p.check +
      '\n\n'
    : '') +
  (p.tried && p.tried.length
    ? 'What has been tried already, and did not settle it:\n' + p.tried.map((x) => '- ' + x).join('\n') + '\n\n'
    : '') +
  (p.call
    ? "One value is in dispute: by the task's own rules and nothing else, what must this give?\n\n    " +
      p.call +
      '\n\n'
    : '') +
  'Answer as yourself: ' +
  t.temper +
  '. Do not repeat what was tried. Reply with exactly these lines and nothing else:\n' +
  'WHERE: <the file and the function, by name>\n' +
  'IDEA: <one concrete thing to try, in at most 60 words: what to change, and to what>\n' +
  (p.call ? "VALUE: <the value the task's rules give for the call above, and nothing else on the line>\n" : '') +
  'BLAME: <one word: CODE if the code is mistaken, CHECK if the check is mistaken about what the task asks, TASK if the task itself is unclear>';
const lineOf = (said, key) =>
  ((new RegExp('^\\s*\\**' + key + '\\**\\s*:\\s*(.+?)\\s*$', 'im').exec(String(said || '')) || [])[1] || '')
    .replace(/^\**|\**$/g, '')
    .trim();
export function readAnswer(said) {
  const blame = (/\b(CODE|CHECK|TASK)\b/i.exec(lineOf(said, 'BLAME')) || [])[1] || '';
  return {
    where: lineOf(said, 'WHERE').slice(0, 160),
    idea: lineOf(said, 'IDEA').slice(0, 500),
    value: lineOf(said, 'VALUE')
      .replace(/^['"\x60]+|['"\x60.]+$/g, '')
      .slice(0, 120),
    blame: blame.toUpperCase(),
  };
}
// ask({ system, prompt, max, temperature, seat }) -> text. Each seat is asked once; one that gives no idea is asked nothing more.
// What each reads first differs too: the sceptic starts from the failing check, the planner from the task's own words.
export async function askRoom({ ask, problem, seats = ROOM, simple = false }) {
  const out = [];
  for (const id of seats) {
    const temper = TEMPER[id];
    if (!temper) continue;
    const first =
      id === 'steward'
        ? 'Start from the check that fails: take the smallest input that shows it, and follow the code by hand.'
        : id === 'overseer'
          ? 'Start from the task: read it again word by word before you look at the code.'
          : id === 'master'
            ? 'Start from the whole change: what did it touch that it did not need to, and what did it leave out?'
            : id === 'ask'
              ? 'Start from what a person would see or get: say the result you expect first, then work back to the code.'
              : '';
    const system =
      'You are ' +
      (simple ? temper.friend : temper.title) +
      ', one of five people on a small team. ' +
      temper.temper.charAt(0).toUpperCase() +
      temper.temper.slice(1) +
      '. ' +
      temper.habit +
      ' You are plain and exact, and you answer in the form you are asked for.';
    const said = String(
      await ask({
        system,
        prompt: roomAsk(problem, temper, first),
        max: 320,
        temperature: temper.warmth,
        seat: id,
      }).catch(() => ''),
    );
    const a = readAnswer(said);
    if (!a.idea && !a.blame) continue;
    const same = out.find((o) => a.idea && o.idea && alike(o.idea, a.idea));
    if (same) {
      same.also.push(id);
      if (a.blame) same.votes.push({ seat: id, blame: a.blame, value: a.value });
      continue;
    }
    out.push({
      seat: id,
      name: simple ? temper.friend : temper.title,
      ...a,
      also: [],
      votes: [{ seat: id, blame: a.blame, value: a.value }],
      said: said.slice(0, 600),
    });
  }
  return out;
}
// WHAT THE ROOM THINKS IS MISTAKEN, counted a seat a vote. A value is agreed when all but one of those who gave one gave the same.
const norm = (v) =>
  String(v == null ? '' : v)
    .trim()
    .replace(/^['"\x60]+|['"\x60.]+$/g, '')
    .replace(/\s*(px|pixels?|dp)$/i, '')
    .trim();
export const sameValue = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x !== '' && (x === y || (isFinite(Number(x)) && isFinite(Number(y)) && Number(x) === Number(y)));
};
export function tally(answers) {
  const votes = answers.flatMap((a) => a.votes);
  const n = (k) => votes.filter((v) => v.blame === k).length;
  const vals = votes.map((v) => v.value).filter(Boolean);
  let value = '';
  let agree = 0;
  for (const v of vals) {
    const c = vals.filter((w) => sameValue(v, w)).length;
    if (c > agree) {
      agree = c;
      value = norm(v);
    }
  }
  return {
    code: n('CODE'),
    check: n('CHECK'),
    task: n('TASK'),
    of: votes.length,
    value: vals.length >= 3 && agree >= vals.length - 1 && agree >= 3 ? value : '',
    agree,
    gave: vals.length,
  };
}

// ---------- the working copy as it stands, and back to it ----------
// Every file that differs from the last commit, and every new one, with its bytes. Going back writes those bytes again, and puts any
// OTHER file a try touched back as it was committed (a new one it made is removed).
// (a line of git's status is two letters, a space and the path; the first line may have lost a leading space on its way here, so each is
// read by its shape and never by counting characters)
export const statusLines = (out) =>
  String(out || '')
    .split('\n')
    .map((l) => /^\s*([MADRCUT?!]{1,2})\s+(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({
      fresh: m[1] === '??',
      gone: m[1].includes('D'),
      file: m[2].replace(/^.+ -> /, '').replace(/^"|"$/g, ''),
    }));
const statusOf = async (dir) => statusLines((await git(dir, ['status', '--porcelain', '--untracked-files=all'])).out);
export async function snapOf(dir) {
  const files = new Map();
  for (const s of await statusOf(dir))
    files.set(s.file, s.gone ? null : await readFile(path.join(dir, s.file)).catch(() => null));
  return files;
}
export async function backTo(dir, snap) {
  for (const s of await statusOf(dir))
    if (!snap.has(s.file)) {
      if (s.fresh) await rm(path.join(dir, s.file), { force: true }).catch(() => {});
      else await git(dir, ['checkout', '--', s.file]);
    }
  for (const [f, bytes] of snap) {
    const at = path.join(dir, f);
    if (bytes === null) {
      await rm(at, { force: true }).catch(() => {});
      continue;
    }
    const now = await readFile(at).catch(() => null);
    if (now && now.equals(bytes)) continue;
    await mkdir(path.dirname(at), { recursive: true });
    await writeFile(at, bytes);
  }
}

// EACH IDEA FROM THE SAME START. apply(idea) makes the try (the builder, told the idea); score() says how far it got: { ok, failing }.
// The first that is green is kept as it stands. Otherwise the working copy goes back to whichever got furthest, and to where it
// started when nothing got further than that. limit: how many are tried; until: no new try is started after this time.
export async function tryIdeas({
  ideas,
  snap,
  dir,
  apply,
  score,
  start = null,
  limit = 3,
  until = Infinity,
  onlyGreen = false,
  onStep = () => {},
}) {
  const tries = [];
  let best = { snap, failing: start == null ? Infinity : start, idea: null };
  for (const idea of ideas.slice(0, limit)) {
    if (Date.now() > until) break;
    await backTo(dir, idea.fresh ? new Map() : snap);
    onStep('Trying ' + idea.name + "'s idea" + (idea.fresh ? ', from a clean start' : '')); // fresh: the try starts from the code as it was committed, with nothing of the earlier change
    let got = null;
    try {
      await apply(idea);
      got = await score(idea);
    } catch (e) {
      got = { ok: false, failing: Infinity, why: String((e && e.message) || e).slice(0, 160) };
    }
    const row = {
      seat: idea.seat,
      name: idea.name,
      idea: idea.idea,
      where: idea.where,
      ok: !!got.ok,
      failing: got.failing,
      why: got.why || '',
    };
    tries.push(row);
    if (got.ok) {
      best = { snap: await snapOf(dir), failing: 0, idea: row, ok: true };
      return { tries, best };
    }
    if (!onlyGreen && got.failing < best.failing) best = { snap: await snapOf(dir), failing: got.failing, idea: row }; // onlyGreen: nothing short of green is kept
  }
  await backTo(dir, best.snap);
  return { tries, best };
}
// what the room said, for the chat: one line a seat, in the order they were asked, with what came of it
export const roomLines = (answers, tries = []) =>
  answers
    .map((a) => {
      const t = tries.find((x) => x.seat === a.seat);
      return {
        seat: a.seat,
        name: a.name,
        says:
          a.idea ||
          (a.blame === 'CHECK'
            ? 'I think the check is mistaken, not the code.'
            : a.blame === 'TASK'
              ? 'I think the task itself is unclear here.'
              : ''),
        blame: a.blame,
        also: a.also,
        tried: !!t,
        ok: !!(t && t.ok),
        came: t ? (t.ok ? 'it went green' : isFinite(t.failing) ? t.failing + ' still failing' : 'it did not run') : '',
      };
    })
    .filter((l) => l.says);
