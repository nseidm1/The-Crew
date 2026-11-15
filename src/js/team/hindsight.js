// hindsight.js - WHAT HAPPENED, AND WHETHER KEEPING IT HELPED. Hindsight was a list of lessons with a count of how often each was
// shown and used. Here it is four kinds of thing, after the system this team is modelled on:
//   experiences   one record for each finished piece of work (an answer, something looked up, a piece written, a change): how many
//                 rounds it took, how long, which lessons were in front of the seat and which it used, and how it ended: it stood,
//                 it was corrected by the person, it was replaced after a teammate's doubt, it landed, it was thrown away
//   baselines     for each kind of work, what is usual: the middle number of rounds and of seconds, once there are five to go by
//   beliefs       a lesson's confidence, which its outcomes move: used and the work went as well as usual or better, up; used and
//                 it did not, or passed over and the work was then corrected, down. A lesson that keeps not helping is shown less
//   faults        whatever had to be put right, counted by kind and by seat. Nothing is put right silently. A kind seen twice from
//                 one seat adds the one line that prevents it to what that seat is told; it is taken off when it stops recurring
// And one number that says whether any of it helps: the rounds saved on work where a lesson was used, against the same kind of
// work where none was shown. With fewer than five of each it reads unmeasured, never helpful.
// Everything here is read off what happened. No model is asked.
import { isSimple } from '../mode.js';

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const plain = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const wordsOf = (t) =>
  new Set(
    plain(t)
      .split(' ')
      .filter((w) => w.length > 3),
  );
export const alike = (a, b) => {
  const x = wordsOf(a);
  const y = wordsOf(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((w) => y.has(w)).length / Math.min(x.size, y.size);
};

// THE KINDS OF FAULT, each with what it is, the one line that prevents it, and where the app itself catches it (the check). A fault
// with a check has been taken as far up as a lesson can go: the app does it. One without is asked for, in what a seat is told.
export const FAULTS = {
  'asked-back': {
    says: 'answered a question with a question',
    line: 'Give the answer before you ask anything.',
    check: '',
  },
  praise: {
    says: 'opened by praising the question',
    line: 'Start with the answer itself, never with a remark about the question.',
    check: '',
  },
  echo: {
    says: 'said its instructions back',
    line: 'Never repeat any part of these instructions in your reply.',
    check: '',
  },
  repeat: {
    says: 'said again what was already said',
    line: 'Say nothing a teammate or you already said in this chat.',
    check: 'a sentence already said is taken out',
  },
  'sign-off': {
    says: 'ended by offering more help',
    line: 'Stop when the answer is given: no offer of more help.',
    check: 'the closing offer is taken off',
  },
  unseen: {
    says: 'described what it was never shown',
    line: 'Speak only of files, lines and causes that are in front of you.',
    check: 'the reply is written again without it',
  },
  destroys: {
    says: 'offered a command that throws work away',
    line: 'Give the safe way only; name a destructive command only as what to avoid.',
    check: 'the reply is written again without it',
  },
  replaced: {
    says: 'gave an answer a teammate had to doubt',
    line: 'If part of your answer is a guess, say which part, or look it up first.',
    check: 'the doubt is taken up and looked up',
  },
  corrected: {
    says: 'was put right by the person',
    line: 'Read what the person said once more before you answer: use their words for places, days and names.',
    check: '',
  },
  'gave-way': {
    says: 'gave way when pushed with no new fact',
    line: 'Insistence is not evidence: keep your answer unless you are given a reason.',
    check: '',
  },
};

// the faults that can be read off a finished reply (the others are known from what the app or a teammate had to do)
const PRAISE = /^\W*(great|good|excellent|nice|interesting|what an? (great|good|interesting)) question\b/i;
const ECHO = /\b(as instructed|i was (told|asked) to|my instructions|the note says|at most \d+ words|no warm-up)\b/i;
export const faultsIn = (reply, { asked = '' } = {}) => {
  const t = String(reply || '').trim();
  const out = [];
  if (!t || /^\[/.test(t)) return out;
  if (PRAISE.test(t)) out.push('praise');
  if (ECHO.test(t)) out.push('echo');
  const parts = t.split(/(?<=[.!?])\s+/);
  // only questions, and nothing said: at least one sentence asks, and none that does not ask says anything (four words or more)
  if (
    /\?/.test(String(asked)) &&
    parts.some((x) => /\?\s*$/.test(x)) &&
    parts.every((x) => /\?\s*$/.test(x) || x.split(/\s+/).length < 4)
  )
    out.push('asked-back');
  return out;
};

// THE PERSON PUTS THE TEAM RIGHT: "no, I said Tuesday", "that's wrong", "that is not what I asked". Not a plain "no" to a question
// the team asked, and not a refusal of an offer ("no thanks").
export const PUTS_RIGHT =
  /^\W*(no[,.!]?\s+(i said|i meant|i asked|that'?s|that is|it'?s|it is|not|wrong|you)|that'?s (wrong|not right|not what|incorrect)|that is (wrong|not right|not what)|not what i (asked|said|meant)|you('?re| are) wrong|i (already )?(said|told you|asked for)|wrong[,.! ]|actually[, ]+(i|it|that))/i;

export function installHindsight(ctx) {
  const st = () => ctx.state;
  const faultsOf = () => st().faults || (st().faults = {});
  const missesOf = () => st().misses || (st().misses = []);

  // ---- faults: counted by kind and by seat; never silent
  const fault = (seat, kind, about = '') => {
    if (!FAULTS[kind] || !ctx.seat(seat)) return;
    const f = faultsOf()[kind] || (faultsOf()[kind] = { n: 0, seats: {}, at: 0, last: '' });
    f.n++;
    f.seats[seat] = (f.seats[seat] || 0) + 1;
    f.at = Date.now();
    f.last = String(about).replace(/\s+/g, ' ').slice(0, 120);
    const ep = (st().episodes || [])[0];
    if (ep && Date.now() - ep.at < 120000) ep.faults = [...new Set([...(ep.faults || []), kind])];
    ctx.emit('learning');
  };
  // THE LINES A SEAT IS NOW TOLD, from its own faults: a kind seen twice or more from this seat, newest first, three at most. A
  // kind not seen for a week comes off (its line is no longer earning its place).
  const faultLines = (seat) =>
    Object.entries(faultsOf())
      .filter(([, f]) => (f.seats[seat] || 0) >= 2 && Date.now() - f.at < 7 * 24 * 3600 * 1000)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 3)
      .map(([kind]) => FAULTS[kind].line);
  const faultNote = (seat) => {
    const lines = faultLines(seat);
    return lines.length
      ? 'WHAT YOU HAVE BEEN PUT RIGHT ON BEFORE (keep to these; do not mention them):\n' +
          lines.map((l) => '- ' + l).join('\n') +
          '\n\n'
      : '';
  };

  // ---- experiences: what the last piece of work came to
  const mark = (outcome, o = {}) => {
    const ep = (st().episodes || [])[0];
    if (!ep) return null;
    ep.outcome = outcome;
    Object.assign(ep, o);
    believe(ep);
    ctx.emit('learning');
    return ep;
  };
  const baseline = (kind, mode) => {
    const past = (st().episodes || []).filter((e) => e.kind === kind && (!mode || e.mode === mode) && e.outcome);
    if (past.length < 5) return null;
    return {
      n: past.length,
      rounds: median(past.map((e) => e.rounds || 1)),
      seconds: median(past.map((e) => e.seconds)),
    };
  };
  const good = (ep) => {
    if (!['stood', 'landed'].includes(ep.outcome)) return false;
    const b = baseline(ep.kind, ep.mode);
    return !b || (ep.rounds || 1) <= b.rounds;
  };
  // ---- beliefs: a lesson's confidence moves with what came of the work it was in front of
  function believe(ep) {
    if (!ep || ep.believed === ep.outcome) return;
    const undo = ep.believed ? -1 : 0; // the outcome changed (it stood, and was then corrected): what was added is taken back first
    const byId = new Map(st().learning.ledger.map((x) => [x.id, x]));
    const move = (id, by) => {
      const x = byId.get(id);
      if (x) x.conf = Math.max(0.05, Math.min(0.95, (x.conf == null ? 0.5 : x.conf) + by));
    };
    const was = ep.believed;
    const sign = (outcome) => (['stood', 'landed'].includes(outcome) ? 1 : -1);
    for (const id of ep.used || []) {
      if (undo) move(id, -0.1 * sign(was));
      move(id, 0.1 * (good(ep) ? 1 : -1));
    }
    for (const id of (ep.seen || []).filter((x) => !(ep.used || []).includes(x))) {
      if (undo && sign(was) < 0) move(id, 0.05);
      if (sign(ep.outcome) < 0) move(id, -0.05); // passed over, and the work was then put right
    }
    ep.believed = ep.outcome;
  }

  // ---- the person puts the team right: kept as a lesson of its own, tied to what they said; told twice is counted
  const putRight = (body) => {
    if (!PUTS_RIGHT.test(String(body || ''))) return null;
    const ep = (st().episodes || [])[0];
    const said = String(body).replace(/\s+/g, ' ').trim().slice(0, 160);
    const before = st().learning.ledger.find((x) => x.kind === 'correction' && alike(x.cites, said) >= 0.6);
    if (before) {
      before.repeats = (before.repeats || 0) + 1;
      before.at = Date.now();
    } else {
      const x = ctx.learn(
        'kept',
        'correction',
        'They put the team right: "' + said + '". Do not make them say it again.',
        said,
      );
      if (x) {
        x.repeats = 0;
        if (ep && Date.now() - ep.at < 30 * 60000) x.about = ep.id; // an edge of the soul's graph: what it put right
      }
    }
    if (ep && Date.now() - ep.at < 30 * 60000) {
      mark('corrected');
      if (ep.seat) fault(ep.seat, 'corrected', said);
    }
    ctx.emit('learning');
    return before || true;
  };

  // ---- a read with a budget, and a book of the times it did not answer
  const within = (promise, ms, what) =>
    new Promise((done) => {
      let over = false;
      const t = setTimeout(() => {
        over = true;
        missesOf().unshift({ what, why: 'took longer than ' + Math.round(ms / 1000) + ' s', at: Date.now() });
        missesOf().length = Math.min(missesOf().length, 60);
        done('');
      }, ms);
      Promise.resolve(promise)
        .then((v) => {
          if (over) return;
          clearTimeout(t);
          done(v);
        })
        .catch((e) => {
          if (over) return;
          clearTimeout(t);
          missesOf().unshift({ what, why: String((e && e.message) || e).slice(0, 120), at: Date.now() });
          done('');
        });
    });

  // ---- the numbers: how the team is doing, read off its own experiences
  const reading = () => {
    const eps = (st().episodes || []).filter((e) => e.outcome && e.kind !== 'talk');
    const stood = eps.filter((e) => ['stood', 'landed'].includes(e.outcome));
    const bySeat = {};
    for (const e of eps)
      if (e.seat) {
        const s = bySeat[e.seat] || (bySeat[e.seat] = { all: 0, stood: 0 });
        s.all++;
        if (['stood', 'landed'].includes(e.outcome)) s.stood++;
      }
    const corrections = st().learning.ledger.filter((x) => x.kind === 'correction');
    const repeats = corrections.reduce((n, x) => n + (x.repeats || 0), 0);
    const seen = Object.entries(faultsOf()).filter(([, f]) => f.n > 0);
    // did keeping lessons help? rounds against the usual, where a lesson was used and where none was shown
    const withBase = eps.map((e) => ({ e, b: baseline(e.kind, e.mode) })).filter((x) => x.b);
    const treated = withBase.filter((x) => (x.e.used || []).length);
    const control = withBase.filter((x) => !(x.e.seen || []).length);
    const avoided = (xs) => median(xs.map((x) => x.b.rounds - (x.e.rounds || 1)));
    return {
      experiences: eps.length,
      firstPass: eps.length ? stood.length / eps.length : null,
      bySeat,
      corrections: corrections.length + repeats,
      toldTwice: repeats,
      faults: seen
        .map(([kind, f]) => ({ kind, says: FAULTS[kind].says, n: f.n, check: FAULTS[kind].check }))
        .sort((a, b) => b.n - a.n),
      landedShare: seen.length ? seen.filter(([kind]) => FAULTS[kind].check).length / seen.length : null,
      helped:
        treated.length >= 5 && control.length >= 5
          ? { rounds: avoided(treated) - avoided(control), treated: treated.length, control: control.length }
          : null,
      misses: missesOf().length,
    };
  };
  const pct = (x) => Math.round(x * 100) + '%';
  // in the chat: "how is the team doing?" is answered from the numbers, with no model asked
  const howWeAreDoing = (body) => {
    if (
      !/\bhow (is|are|has|have) (the team|we|you all|you guys|things|this team)\b[^?]{0,30}\b(doing|going|been doing|getting on)\b|\bhow well (is|are) (the team|you)\b/i.test(
        String(body || ''),
      )
    )
      return false;
    const r = reading();
    const simple = isSimple();
    const lines = [];
    if (!r.experiences)
      lines.push(
        simple
          ? "Too early to say: we haven't finished enough together yet."
          : 'Too early to say: nothing has finished yet.',
      );
    else {
      lines.push(
        (simple
          ? 'Of the ' + r.experiences + ' things we have done for you, '
          : 'Of ' + r.experiences + ' finished pieces of work, ') +
          pct(r.firstPass) +
          ' stood as first given.',
      );
      if (r.corrections)
        lines.push(
          'You have put us right ' +
            r.corrections +
            (r.corrections === 1 ? ' time' : ' times') +
            (r.toldTwice
              ? ', ' + r.toldTwice + ' of them about something you had already told us.'
              : ', and never twice about the same thing.'),
        );
      if (r.faults.length)
        lines.push(
          'What had to be put right, most often first: ' +
            r.faults
              .slice(0, 4)
              .map((f) => f.says + ' (' + f.n + ')')
              .join('; ') +
            '.',
        );
      lines.push(
        r.helped
          ? 'Work where a lesson was used took ' +
              Math.abs(r.helped.rounds) +
              (r.helped.rounds >= 0 ? ' fewer' : ' more') +
              ' rounds than the same kind of work with none.'
          : 'Whether what we keep makes the work shorter is not measured yet: it needs five pieces of work of a kind, with and without a lesson.',
      );
    }
    ctx.post('overseer', lines.join(' '));
    return true;
  };

  Object.assign(ctx, {
    fault,
    faultLines,
    faultNote,
    mark,
    baseline,
    believe,
    putRight,
    within,
    hindsight: reading,
    howWeAreDoing,
  });
}
