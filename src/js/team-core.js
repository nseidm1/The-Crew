// team-core.js - THE TEAM, IN THE PAGE. It keeps the team's record (the chat, the work, the proofs, the lessons) in this browser and
// runs the round of the table: who speaks, what is planned, built, proven, judged and landed. A seat's words come from the engine
// the runner on this machine started (a local model, or Claude Code), and a change is made, proven and landed by that runner. With
// no engine under the page a scripted team answers. Every page gets its core from js/core-port.js, never from here.
import { isSimple } from './mode.js'; // Simple mode has no autonomy setting, and is not asked questions before a build
import { BASE } from './base-lessons.js';
import { store } from './ui.js';
import { soulOf } from './team-soul.js';
import { installYou, standingIn } from './team/you.js';
import { SETTLES, STAYS, branchFrom, directFrom, installSource, pushFrom } from './team/source.js';
import { installTicket } from './team/ticket.js';
import { installHost } from './team/host.js';
import { installThread } from './team/thread.js';
import { installSlates } from './team/slate.js';
import { edgesOf, fileId, reachedBy, walk } from './team/graph.js';
import { faultsIn, installHindsight } from './team/hindsight.js';
import { forSharing } from './team/share.js';
import { extrasOf } from './team/extras.js';
import {
  EXACT,
  GO_AHEAD,
  NEW_THING,
  apartOn,
  asksPlatform,
  destroysIn,
  discussNote,
  discussing,
  installManners,
  PLATFORM,
  unseenIn,
  withoutRepeats,
  withoutSignOff,
} from './team/manners.js';
import { installBuild } from './team/build.js';
import { installRound } from './team/round.js';
import { cardWorthy, installCards } from './team/cards.js';
import { installResearch } from './team/research.js';
import {
  ANSWERS,
  DOING,
  DOING_AS,
  DULL_ASK,
  RED_WHY,
  SCENES,
  SEATS,
  STATED,
  MAKES,
  sentenceCap,
  firstSentences,
  STOP,
  UI_WORDS,
  VOICE,
  rng,
  seatAs,
  seedState,
  short,
  slug,
  unsaid,
} from './team/base.js';
export { FRIENDLY, SEATS, STAGES, seatAs } from './team/base.js';

export function createTeamCore({ persist = true, speed = 1, demo = false } = {}) {
  // what the parts of this module share: each part (see team/) reads what it needs from here and puts here what the others use of it
  const ctx = {};
  const disk = store('familyoffice.core.v1');
  const listeners = new Set();
  ctx.state = (persist && disk.get(null)) || seedState(Date.now());
  if (!ctx.state || ctx.state.v !== 2) ctx.state = seedState(); // an older saved state held example work: it is not carried over
  if (demo) {
    // the playground: an empty desk, and proven work lands without asking
    ctx.state.work = [];
    ctx.state.proofs = [];
    ctx.state.proposals = [];
    ctx.state.autonomy.level = 2;
    ctx.state.chat = [
      {
        id: 'm0',
        by: 'overseer',
        at: Date.now(),
        text: 'This is a demo team, so nothing here is real work. Ask for a change and watch what a real team would do with it.',
      },
    ];
  }
  const random = rng(Date.now() & 0xffffff);
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(random() * 16)]).join('');
  ctx.state.team.seats.forEach((x) => {
    x.status = 'idle';
    x.line = '';
  }); // nothing is mid-flight after a reload
  ctx.state.chat.forEach((m) => {
    if (m.veil) delete m.veil;
    if (m.live) {
      m.live = false;
      m.text = m.text || '[this reply was interrupted]';
    }
    if (m.kind === 'tools' && m.open) {
      m.open = false;
      m.steps.forEach((st) => {
        if (st.state === 'run') {
          st.state = 'fail';
          st.note = 'interrupted';
        }
      });
    }
  });
  ctx.state.rulings = ctx.state.rulings || [];
  ctx.state.episodes = ctx.state.episodes || [];
  ctx.state.learning.ledger.forEach((x, i) => {
    if (!x.id) x.id = 'L-' + (x.at || 0) + '-' + i;
  });

  const emit = (type) => {
    if (persist) disk.set(ctx.state);
    listeners.forEach((fn) => {
      try {
        fn(type);
      } catch (e) {
        console.error(e);
      }
    });
  };
  const later = (ms, fn) => setTimeout(fn, ms / speed);
  const seat = (id) => ctx.state.team.seats.find((x) => x.id === id);
  const post = (by, text, extra) => {
    ctx.state.chat.push({ id: 'm' + ++ctx.state.n, by, at: Date.now(), text, ...extra });
    emit('chat');
  };
  const busy = (id, line) => {
    const x = seat(id);
    x.status = line ? 'working' : 'idle';
    x.line = line || '';
    emit('team');
  };
  // THE SOUL, modelled on the system this team comes from. There it is one store: rulings, requests, proofs and lessons, each linked to
  // what it cites. Three things act on it, and the same three act here:
  //   RULINGS    what the customer has decided. They are the source of truth: the ones in force are shown to every seat before it
  //              speaks, ahead of anything else, and a newer ruling on the same thing replaces the older one.
  //   VISION     recall before every turn: up to three things from the soul that bear on what was asked.
  //   HINDSIGHT  grading after the fact: was what Vision showed drawn on in the reply (per lesson: shown, used), and one record per
  //              finished round saying whether it was answered with something the team already knew.
  const learn = (dir, kind, text, cites) => {
    if (dir === 'out') return null;
    const x = { id: 'L-' + ++ctx.state.n, dir, kind, at: Date.now(), text, cites: cites || '', shown: 0, used: 0 };
    ctx.state.learning.ledger.unshift(x);
    emit('learning');
    return x;
  };
  const rule = (kind, text) => {
    for (const r of ctx.state.rulings)
      if (r.kind === kind && kind !== 'answer' && kind !== 'standing' && !r.superseded) r.superseded = true;
    ctx.state.rulings.unshift({ id: 'R-' + ++ctx.state.n, kind, text, at: Date.now(), superseded: false });
    ctx.state.rulings.length = Math.min(ctx.state.rulings.length, 60);
  };
  const rare = (text) =>
    new Set(
      (
        String(text)
          .toLowerCase()
          .match(/[a-z]{5,}/g) || []
      ).filter((w) => !STOP.has(w)),
    );
  ctx.visionShown = 0;
  ctx.soulKeeps = null; // soulKeeps: when the free allowance is used up and the plan does not cover the Soul, Vision recalls only this many of the newest lessons (nothing is deleted)

  function land(p, w) {
    p.landed = { sha: hex(7), at: Date.now() };
    w.stage = 'landed';
    busy('master', '');
    post('master', VOICE.land(p));
    emit('proofs');
    later(900, () => {
      post('overseer', VOICE.done(p));
      busy('overseer', '');
      learn('out', 'hindsight', 'What it took to prove "' + p.title + '": ' + p.runs.length + ' runs.');
      if (p.after) later(1500, () => post(p.after[0], p.after[1]));
    });
  }

  // A REAL ENGINE (set by app.js when the runner has one): the seats then speak through it instead of from the script. The persona is the
  // seat's own role and voice. Nothing is connected to the customer's repo yet, so a seat is told to say what it WOULD do, never that it did.
  ctx.engine = null; // { seat(o), route(text), tool(body), shotUrl(id), clipUrl(id), eyes(), helpers() }
  const onClaude = () => !!(ctx.state.session && ctx.state.session.kind === 'claude');
  // CONTEXT RESET, as the core does it, behind the scenes. A seat carries the chat since its last reset. When that passes the bar, the
  // seat writes its own packet (what is owed, what is in flight, the last result, where to find the rest), the packet is checked, and
  // the seat starts again from the packet alone. The packet is kept as hindsight. None of this is said in the chat: the only trace is
  // a line on the Soul page. If the packet fails its check, nothing is dropped and the seat carries on as it was.
  const BAR = Number(store('familyoffice.resetBar').get(0)) || 16000; // characters carried before a reset: about 4,000 tokens
  async function carried(seatId) {
    const carry =
      (ctx.state.carry = ctx.state.carry || {})[seatId] ||
      (ctx.state.carry[seatId] = { packet: '', from: 0, resets: 0 });
    const lines = ctx.state.chat
      .slice(carry.from)
      .filter((q) => q.text && !q.live)
      .map(
        (q) =>
          (q.by === 'you' ? 'Customer' : seatAs(SEATS.find((z) => z.id === q.by) || {}).title || q.by) + ': ' + q.text,
      );
    let text = lines.join('\n');
    const before = carry.packet.length + text.length;
    if (before > BAR && lines.length > 4) {
      let packet = '';
      try {
        await ctx.engine.seat({
          seat: seatId,
          system: soulOf(seat(seatId), 'build', { claude: onClaude() }),
          onDelta: (d) => {
            packet += d;
          },
          onReset: (t) => {
            packet = t || '';
          },
          messages: [
            {
              role: 'user',
              content:
                'CONTEXT RESET. Below is everything you are carrying. Write the packet your fresh self will start from, in at most 120 words, as four short parts: ' +
                "OWED (what you still owe, and to whom), IN FLIGHT (what is on the bench), LAST RESULT (how the last piece ended), POINTERS (where the rest can be found: the chat, the proofs, the team's memory). Plain text only.\n\n" +
                (carry.packet ? 'YOUR LAST PACKET:\n' + carry.packet + '\n\n' : '') +
                'THE CHAT SINCE:\n' +
                text,
            },
          ],
        });
      } catch (e) {
        packet = '';
      }
      packet = packet.trim();
      // the retention check: there is a packet, it is far smaller than what it replaces, and it still says what is owed
      if (packet && packet.length < before / 2 && /owed/i.test(packet)) {
        carry.packet = packet;
        carry.from = ctx.state.chat.length;
        carry.resets++;
        text = '';
        (ctx.state.resets = ctx.state.resets || []).unshift({
          seat: seatId,
          at: Date.now(),
          before,
          after: packet.length,
        });
        ctx.state.resets.length = Math.min(ctx.state.resets.length, 50);
        learn(
          'kept',
          'hindsight',
          seat(seatId).title +
            ' reset its context: ' +
            before.toLocaleString() +
            ' characters carried became a packet of ' +
            packet.length.toLocaleString() +
            '.',
        );
      }
    }
    return (
      (carry.packet ? 'YOUR RESET PACKET (what you carried over from before):\n' + carry.packet + '\n\n' : '') +
      (text ? 'The chat since:\n' + text + '\n\n' : '')
    );
  }
  // o.mode: what kind of reply this is (team-soul.js: soulOf): build, talk, answer, research, check, qa
  // o.customer / o.lang: what the customer wrote, so the reply stays in their language   o.about: what Vision looks up (default: ask)
  // o.use: what this reply may use on Claude Code ({ web, shot })   o.max: a cap on the reply   o.sources: shown under the reply
  async function speak(seatId, ask, opts = {}) {
    const mode = opts.mode || 'build';
    // VISION: before a seat speaks, it is shown what the team's memory holds on the subject (its lessons, its proofs, its rulings). Added, never a replacement.
    // in Simple, what every team starts with is developer practice: it is not recalled
    const seen =
      mode === 'talk'
        ? []
        : core
            .ask(opts.about || ask)
            .filter(
              (v) => v.kind !== 'ruling' && !(isSimple() && v.kind === 'base') && !(v.ref && v.ref.kind === 'you'),
            )
            .slice(0, 3);
    const force = ctx.state.rulings.filter((r) => !r.superseded).slice(0, 6);
    const you = ctx.youKnown();
    for (const v of seen) if (v.ref) v.ref.shown = (v.ref.shown || 0) + 1;
    ctx.visionShown += seen.filter((v) => v.ref).length; // a round is built on what the team knew when a LESSON was recalled in it
    const speaker = seat(seatId);
    const msg = {
      id: 'm' + ++ctx.state.n,
      by: seatId,
      at: Date.now(),
      text: '',
      live: true,
      vision: seen.length,
      resets: 0,
      ...(opts.veil ? { veil: true } : {}),
    }; // veil: its words are not shown while it is written, because a card may be the whole of it (cardFor lifts it)
    const carry = await carried(seatId); // the seat's context: its reset packet, then the chat since
    ctx.state.chat.push(msg);
    busy(seatId, opts.doing || DOING_AS[mode] || DOING[seatId] || 'Answering');
    emit('chat');
    let last = 0;
    try {
      const request = {
        seat: seatId,
        system:
          soulOf(seatAs(speaker), mode, { claude: onClaude(), simple: isSimple() }) +
          (!isSimple() && ctx.teamSkills[seatId] ? '\n\n' + ctx.teamSkills[seatId] : ''),
        customer: opts.customer || '',
        lang: opts.lang || '',
        use: opts.use || null,
        max: opts.max || 0,
        messages: [
          {
            role: 'user',
            content:
              carry +
              (force.length
                ? (isSimple()
                    ? 'WHAT THIS PERSON HAS ASKED THE TEAM FOR, which still stands (keep to it in what you say, and do not say it back to them):\n'
                    : "YOUR CUSTOMER'S RULINGS IN FORCE (the source of truth; the newest wording wins):\n") +
                  force.map((r) => '- ' + r.text).join('\n') +
                  '\n\n'
                : '') +
              ctx.devNote() +
              ctx.mannerNote() +
              ctx.faultNote(seatId) +
              (mode === 'talk' && nameOf() ? 'Their name is ' + nameOf() + '. Use it when you greet them.\n\n' : '') +
              (you.length
                ? (isSimple()
                    ? 'WHAT THE TEAM HAS LEARNED ABOUT THIS PERSON from things they have said. Fit what you say to them: where they are, what they like, how they like to be answered. Do not recite it back, and do not say that you keep it:\n'
                    : 'WHAT THE TEAM HAS LEARNED ABOUT ITS CUSTOMER from things they have said. Fit what you say to them, and do not recite it back:\n') +
                  you.map((y) => '- ' + y.text).join('\n') +
                  '\n\n'
                : '') +
              (seen.length
                ? "VISION, what the team's memory holds on this (use it if it helps):\n" +
                  seen.map((v) => '- [' + v.kind + ', ' + v.from + '] ' + v.text).join('\n') +
                  '\n\n'
                : '') +
              (ctx.state.focus
                ? 'THE JIRA TICKET THE CUSTOMER HAS ATTACHED TO THIS CHAT. When they say "it", "this", "the ticket", "the issue" or "the bug", or ask a question that names nothing else, they mean this ticket. Answer about it from what is written here, and say its key:\n' +
                  ctx.state.focus.key +
                  ': ' +
                  ctx.state.focus.summary +
                  '\nStatus: ' +
                  (ctx.state.focus.status || 'not given') +
                  (ctx.state.focus.type ? '. Type: ' + ctx.state.focus.type : '') +
                  (ctx.state.focus.priority ? '. Priority: ' + ctx.state.focus.priority : '') +
                  (ctx.state.focus.assignee ? '. Assigned to: ' + ctx.state.focus.assignee : '') +
                  (ctx.state.focus.description ? '\nIts description:\n' + ctx.state.focus.description : '') +
                  (ctx.state.focus.media ? '\n' + String(ctx.state.focus.media).trim() : '') +
                  '\n\n'
                : '') +
              (mode !== 'talk' && ctx.state.attached && Date.now() - ctx.state.attached.at < 30 * 60000
                ? (isSimple()
                    ? 'WHAT THE PERSON GAVE THE TEAM TO LOOK AT, as Jamie read it (what they say now is probably about this):\n'
                    : 'WHAT THE CUSTOMER ATTACHED, as Ask read it (what they say now is probably about this):\n') +
                  ctx.state.attached.note +
                  '\n\n'
                : '') +
              ask +
              ctx.shapeNote(mode) +
              (sentenceCap(force) && (mode === 'talk' || mode === 'answer')
                ? '\n\nA LIMIT THEY SET, which outranks any length given above: at most ' +
                  sentenceCap(force) +
                  ' sentences in this reply. Count them before you finish.'
                : ''),
          },
        ],
        onDelta: (d) => {
          msg.text += d;
          if (Date.now() - last > 90) {
            last = Date.now();
            emit('chat');
          }
        },
        onReset: (t) => {
          msg.text = t || '';
          msg.resets++;
          emit('chat');
        },
      };
      const stats = await ctx.engine.seat(request); // a local model's reply broke down and was cut: what was shown is replaced
      if (stats && stats.broke) msg.broke = true;
      // WHAT IT WAS NEVER SHOWN (Developer, a local model): an answer that names a file or a line that is nowhere in what the seat was
      // given, or states the cause of a failure it knows nothing about, is written once more without it. What comes back stands.
      const again = !isSimple() && !onClaude() && mode === 'answer' && !msg.broke;
      const destroys = again ? destroysIn(msg.text, request.messages[0].content) : [];
      const unseen = [...(again ? unseenIn(msg.text, request.messages[0].content) : []), ...destroys];
      if (unseen.length) {
        ctx.fault(seatId, destroys.length ? 'destroys' : 'unseen', unseen.join(', '));
        const draft = msg.text;
        msg.rewrote = unseen;
        msg.text = '';
        emit('chat');
        try {
          await ctx.engine.seat({
            ...request,
            messages: [
              request.messages[0],
              { role: 'assistant', content: draft },
              {
                role: 'user',
                content: destroys.length
                  ? 'That reply offers ' +
                    destroys.join(', ') +
                    ', which throws away work or data that cannot be got back, and nobody asked for it. Write the reply again in the same length: give the safe way only, and name the destructive one only as what to avoid.'
                  : 'That reply spoke of ' +
                    unseen.join(', ') +
                    ', which nobody has shown you. Write the reply again without it: say what you would look at and how, in the same length, and say plainly that you have not seen their code or their logs. Name no file they did not name, no line, and no cause.',
              },
            ],
          });
        } catch {
          /* the draft stands */
        }
        if (!msg.text.trim()) msg.text = draft;
      }
    } catch (e) {
      msg.text =
        (msg.text ? msg.text + ' ' : '') +
        '[' +
        speaker.title +
        ' could not reply: ' +
        String((e && e.message) || e).slice(0, 120) +
        ']';
    }
    // a reply is plain text: the bold marks and heading marks a model adds are taken off
    msg.live = false;
    msg.text =
      msg.text
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/(^|\s)__([^_\n]+)__(?=\s|[.,;:!?]|$)/g, '$1$2')
        .replace(/^#{1,4}\s+/gm, '')
        .trim() || '[no reply]';
    // A LIMIT THE PERSON SET ("keep every answer to three sentences at most") is kept, whoever speaks and whatever they were asked:
    // what runs past it is cut at the limit. Counted as a fault, so the seat is told next time. Code and lists are left alone.
    const cap = mode === 'talk' || mode === 'answer' ? sentenceCap(force) : 0;
    if (cap && !/```|^\s*(?:[-*]|\d+[.)])\s/m.test(msg.text)) {
      const kept = firstSentences(msg.text, cap);
      if (kept !== msg.text) {
        ctx.fault(seatId, 'too-long', msg.text);
        msg.text = kept;
      }
    }
    if (mode === 'answer') {
      // a sentence already said in this chat is not said again, and an answer does not end by offering more help. What had to be
      // taken out, and what can be read off the reply itself, is a fault of a kind (team/hindsight.js): counted, never silent
      const was = msg.text;
      const once = withoutRepeats(was, ctx.saidSoFar(msg));
      const done = withoutSignOff(once);
      if (once !== was) ctx.fault(seatId, 'repeat', was);
      if (done !== once) ctx.fault(seatId, 'sign-off', was);
      msg.text = done;
      for (const kind of faultsIn(done, { asked: opts.customer || '' })) ctx.fault(seatId, kind, done);
    }
    if (opts.sources && opts.sources.length) msg.sources = opts.sources;
    // WHAT GOES UNDER IT besides its words (team/extras.js): read off the reply and what was asked, never asked of a model
    {
      const shown = [
        ctx.state.focus ? 'the ticket ' + ctx.state.focus.key : '',
        ctx.state.attached && Date.now() - ctx.state.attached.at < 30 * 60000 ? 'what you attached' : '',
      ].filter(Boolean);
      const extras = extrasOf(msg, {
        simple: isSimple(),
        asked: opts.customer || '',
        mode,
        sourcesText: opts.sourcesText || '',
        shown,
      });
      if (extras) msg.extras = extras;
    }
    busy(seatId, '');
    // HINDSIGHT, the grade: a thing Vision showed counts as used when the reply draws on it (it shares two or more of its distinctive words)
    const said = rare(msg.text);
    msg.used = 0;
    for (const y of you) {
      y.shown = (y.shown || 0) + 1;
      if (ctx.youWords(y.text).some((w) => w.length >= 5 && msg.text.toLowerCase().includes(w)))
        y.used = (y.used || 0) + 1;
    } // what was known of the person counts as used when the reply draws on it
    for (const v of seen) {
      let n = 0;
      for (const w of rare(v.text)) if (said.has(w)) n++;
      if (v.ref && v.ref.id) (ctx.seenNow || (ctx.seenNow = new Set())).add(v.ref.id);
      if (n >= 2) {
        msg.used++;
        if (v.ref) v.ref.used = (v.ref.used || 0) + 1;
        if (v.ref && v.ref.id) (ctx.usedNow || (ctx.usedNow = new Set())).add(v.ref.id);
      }
    }
    emit('chat');
    return msg.text;
  }

  // WHAT A SEAT DID WITH A TOOL is a message of its own in the chat: one line per step, each ending in what it found or why it failed,
  // and the picture if one was taken. The customer sees every search, every page read and every picture, as it happens.
  const note = (by, title) => {
    const m = {
      id: 'm' + ++ctx.state.n,
      by,
      at: Date.now(),
      text: '',
      kind: 'tools',
      title,
      steps: [],
      open: true,
      rev: 0,
    };
    ctx.state.chat.push(m);
    emit('chat');
    return m;
  };
  const step = async (m, text, doing, run) => {
    const st = { text, state: 'run', note: '' };
    m.steps.push(st);
    m.rev++;
    busy(m.by, doing);
    let r;
    try {
      r = await run();
    } catch (e) {
      r = { ok: false, why: String((e && e.message) || e).slice(0, 140) };
    }
    st.state = r && r.ok ? 'ok' : 'fail';
    st.note = r && r.ok ? r.note || '' : (r && r.why) || 'it did not work';
    m.rev++;
    emit('chat');
    return r || { ok: false };
  };
  const shut = (m) => {
    m.open = false;
    m.rev++;
    busy(m.by, '');
  };
  // AN EXPERIENCE (team/hindsight.js): one record for each finished piece of work. Besides what it always held (how long, how much
  // Vision showed, whether a lesson was kept): whose it was, the mode, how many rounds it took, how it ended, and which lessons were
  // in front of the seats and which they used. What was learned in it is tied to it, so that things kept together are recalled
  // together. more: { seat, rounds, outcome }.
  const episode = (kind, title, t0, v0, seats, kept, more = {}) => {
    const plan =
      kind === 'build' ? [...ctx.state.chat].reverse().find((m) => m.plan && m.plan.title === short(title)) : null;
    const stage = plan ? plan.plan.stage : '';
    const ep = {
      id: 'E-' + ++ctx.state.n,
      kind,
      title,
      at: Date.now(),
      seats,
      seconds: Math.round((Date.now() - t0) / 1000),
      shown: ctx.visionShown - v0,
      kept: !!kept,
      mode: isSimple() ? 'simple' : 'developer',
      seat: more.seat || (kind === 'build' ? 'operations' : ''),
      rounds: more.rounds || (plan ? plan.plan.n || 1 : 1),
      outcome:
        more.outcome ||
        (stage === 'landed' ? 'landed' : stage === 'stopped' ? 'stopped' : stage === 'thrown' ? 'thrown' : 'stood'),
      seen: [...(ctx.seenNow || [])],
      used: [...(ctx.usedNow || [])],
      files: plan
        ? [...new Set([...((plan.plan.sections || {}).files || []), ...((plan.plan.diff || {}).files || [])])].slice(
            0,
            12,
          )
        : [],
    };
    ctx.seenNow = new Set();
    ctx.usedNow = new Set();
    for (const x of ctx.state.learning.ledger)
      if (x.at >= t0 && !x.ep) {
        x.ep = ep.id; // kept in this piece of work
        if (ep.files.length) x.files = ep.files;
      }
    ctx.state.episodes.unshift(ep);
    ctx.state.episodes.length = Math.min(ctx.state.episodes.length, 200);
    ctx.believe(ep);
    emit('learning');
    return ep;
  };
  ctx.teamSkills = {}; // by seat: what that seat knows of the languages the workspace is written in (the runner reads them from its files)
  // ASKED QUIETLY: a seat is asked something and its words are read here before any of them is shown. Used where what comes back
  // has to be checked first (found for real: a model with nothing to ask read its own instructions out to the customer).
  const quiet = async (id, ask, o = {}) => {
    let text = '';
    busy(id, o.doing || 'Reading the request');
    try {
      await ctx.engine.seat({
        seat: id,
        system: o.system || soulOf(seatAs(seat(id)), 'answer', { claude: onClaude(), simple: isSimple() }), // o.system: a blank slate (team/slate.js)
        customer: o.customer || '',
        lang: o.lang || '',
        max: o.max || 0,
        messages: [{ role: 'user', content: ask }],
        onDelta: (d) => {
          text += d;
        },
        onReset: (t) => {
          text = t || '';
        },
      });
    } catch {
      text = '';
    }
    busy(id, '');
    return text.trim();
  };
  // A PIECE OF WORK IN SIMPLE MODE: friendly people, each with one plain job. Sam says who does what; Alex does it, in full; Robin
  // checks it against what was asked; Pat hands over the final version with what Robin found put right, or, when Robin found
  // nothing, says in a line that Alex's is ready (the piece is not said twice). No plan in steps, no judge, no proof.
  // WHAT IS KEPT (Hindsight): what the check caught, as a lesson Vision brings back the next time something like it is asked; and
  // HOW THIS PERSON LIKES THINGS. When they ask for a piece to be changed ("make it funnier", "shorter", "more formal"), that wish
  // is kept as theirs and is in front of every seat from then on, so the next piece starts that way. A later wish of the same kind
  // (tone, length, words) replaces the earlier one.
  // A STANDING INSTRUCTION IS A RULING. Said plainly ("from now on ...", "always ...", "never ...", "call me ..."), it is kept by topic,
  // so a newer one on the same topic replaces the older, and every seat is shown it before it speaks. Each part of it is its own
  // ruling ("call me Dana, and keep answers to three sentences" is two). Where it is about branches or pushing, it also sets what the
  // team recommends (s.branchPrefix, s.branchKeyed, s.ways), because a ruling the team's own advice ignores is not in force.
  // "Remember that ..." is a thing told, not a rule: it is kept as a lesson, and Vision brings it back when it bears on what is asked.
  const nameOf = () => {
    const r = ctx.state.rulings.find((x) => !x.superseded && x.kind === 'standing-name');
    const told = r ? (/\b(?:call me|address me as|my name is)\s+([A-Z][\w'-]*)/i.exec(r.text) || [])[1] || '' : '';
    if (told) return told;
    const y = ctx.state.learning.ledger.find(
      (x) => x.kind === 'you' && /\b(?:called|name is|named)\s+[A-Z]/.test(x.text),
    );
    return y ? (/\b(?:called|name is|named)\s+([A-Z][\w'À-ÿ-]*)/.exec(y.text) || [])[1] || '' : '';
  }; // what the customer asked to be called

  const core = {
    useEngine(e) {
      ctx.engine = !e ? null : typeof e === 'function' ? { seat: e } : e;
      ctx.watchHost();
    },
    forget(id) {
      const n = ctx.state.learning.ledger.length;
      ctx.state.learning.ledger = ctx.state.learning.ledger.filter((x) => !(x.id === id && x.kind === 'you'));
      if (ctx.state.learning.ledger.length !== n) emit('learning');
      return ctx.state.learning.ledger.length !== n;
    },
    shotUrl: (id) => (ctx.engine && ctx.engine.shotUrl ? ctx.engine.shotUrl(id) : ''),
    clipUrl: (id) => (ctx.engine && ctx.engine.clipUrl ? ctx.engine.clipUrl(id) : ''),
    proofUrl: (id) => (ctx.engine && ctx.engine.work && ctx.engine.work.proofUrl ? ctx.engine.work.proofUrl(id) : ''), // the proof image of a change
    limitSoul(n) {
      ctx.soulKeeps = n == null ? null : Math.max(0, n | 0);
    },
    seeIntro(seen) {
      ctx.state.introSeen = !!seen;
      emit('intro');
    },
    isLive: () => !!ctx.engine,
    snapshot: () => ctx.state,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // the session: Start (start.js) hands over what the runner set up; the admin opens only once there is one
    adopt(session) {
      ctx.state.session = { name: 'Local team', at: Date.now(), ...session };
      emit('session');
      return ctx.state.session;
    },
    stop() {
      ctx.state.session = null;
      emit('session');
    },
    reset() {
      ctx.state = seedState(Date.now());
      emit('reset');
    },

    // the customer asks for work: plan -> judge (red) -> build -> prove -> receipt -> land
    request(text, { auto = false } = {}) {
      let title = text.trim().replace(/\s+/g, ' ').slice(0, 90);
      if (!title) return null;
      if (ctx.engine) {
        post('you', title);
        ctx.round(title);
        return null;
      } // a real round of the table
      // a demo scene: the team does its first steps out loud, then the change it found is proven like any other
      const said = title;
      const scen = demo ? SCENES.find((x) => x.re.test(title)) : null;
      const shift = scen ? scen.pre.length * 1500 + 300 : 0;
      const schedule = (ms, fn) => later(shift + ms, fn);
      if (scen) {
        title = scen.work;
        scen.pre.forEach(([by, line], i) =>
          later(700 + i * 1500, () => {
            busy(by, by === 'operations' ? 'Reading your tickets' : 'Planning');
            post(by, line);
            later(900, () => busy(by, ''));
          }),
        );
      }
      const isUi = UI_WORDS.test(title);
      const builder = 'operations';
      const work = { id: 'W-' + ++ctx.state.n, title, stage: 'planned', proofId: null, at: Date.now() };
      ctx.state.work.unshift(work);
      post('you', said);
      emit('work');
      const proofRecord = {
        id: 'PF-' + hex(4),
        title,
        judge: 'judges/' + slug(title) + '.test',
        runs: [],
        at: Date.now(),
        by: { judge: 'steward', code: builder },
        receipt: null,
        landed: null,
        after: scen ? scen.after : null,
      };
      schedule(800, () => {
        busy('overseer', 'Planning');
        post('overseer', VOICE.plan(title));
      });
      schedule(2100, () => {
        busy('overseer', '');
        busy('steward', 'Writing the judge');
        proofRecord.runs.push({ n: 1, result: 'red', why: 'expected: nothing does this yet' }); // the plan is made: the Overseer is no longer planning
        ctx.state.proofs.unshift(proofRecord);
        work.proofId = proofRecord.id;
        work.stage = 'judge';
        post('steward', VOICE.judge(proofRecord));
        emit('proofs');
      });
      schedule(3400, () => {
        busy('steward', '');
        busy('operations', 'Building');
        work.stage = 'build';
        post('operations', VOICE.start(builder));
        emit('work');
      });
      const stumble = random() < 0.6;
      let t = 4600;
      if (stumble) {
        schedule(t, () => {
          const why = RED_WHY[Math.floor(random() * RED_WHY.length)];
          proofRecord.runs.push({ n: proofRecord.runs.length + 1, result: 'red', why });
          post('operations', VOICE.red(proofRecord.runs.length, why));
          emit('proofs');
        });
        t += 1400;
      }
      if (isUi) {
        schedule(t, () => {
          busy('ask', 'Checking the design');
          post('ask', VOICE.design());
        });
        t += 1200;
      }
      schedule(t, () => {
        busy('ask', '');
        proofRecord.runs.push({ n: proofRecord.runs.length + 1, result: 'green', why: '' });
        proofRecord.receipt = { id: 'r-' + hex(6), key: hex(12), head: hex(7), state: 'READY' };
        work.stage = 'proven';
        busy('operations', '');
        post('operations', VOICE.green(proofRecord.runs.length));
        emit('proofs');
      });
      schedule(t + 1100, () => {
        if (ctx.state.autonomy.level === 1 && !auto) {
          const prop = {
            id: 'P-' + ++ctx.state.n,
            by: 'overseer',
            kind: 'landing',
            state: 'open',
            at: Date.now(),
            title: 'Land "' + title + '"',
            why: 'It is proven: the judge went red, then green, and the receipt is ready.',
            evidence: proofRecord.runs.length + ' proof runs, receipt ' + proofRecord.receipt.id,
            proofId: proofRecord.id,
          };
          ctx.state.proposals.unshift(prop);
          post('overseer', VOICE.wait(title), { proposal: prop.id });
          emit('proposals');
        } else {
          busy('master', 'Landing');
          later(700, () => land(proofRecord, work));
        }
      });
      return work.id;
    },

    // THE ONE WAY A MESSAGE REACHES THE TEAM. What kind of message it is decides what the team does with it (the runner sorts it: by
    // its own words when they settle it, by one short question to the model when they do not):
    //   talk       a greeting or thanks: one seat answers, briefly
    //   question   the seat whose job the subject is answers it
    //   research   that seat searches the web, reads what it finds and answers with its sources; the Steward says what to verify
    //   qa         a page or an app is opened and pictured, and the seats it concerns go over it
    //   build      the whole team: plan, judge, build, proof, landing
    // Seats picked with the chips or "@", or a reply to a seat's message, decide WHO: those seats answer, and a request for a change
    // addressed to them is answered by them rather than taken round the table.
    send(text, { to = [], re = null, posted = false } = {}) {
      // posted: the message is already in the chat (it was sent with something attached)
      const clean = String(text || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (!clean) return;
      const at = /^@(\w+)/.exec(clean);
      // spoken to by name, the way people do in a group chat ("Robin, is that right?"): that one answers
      const called = /^(?:(?:hey|hi|ok|okay|so|and|thanks|cheers)[, ]+)?([A-Za-z]+)[,:]\s+\S/.exec(clean);
      const calledSeat = called
        ? SEATS.find((x) =>
            (isSimple() ? [seatAs(x).title] : [x.id, x.title]).some(
              (n) => String(n).toLowerCase() === called[1].toLowerCase(),
            ),
          )
        : null;
      const named = [
        ...new Set([
          ...to,
          ...(at && seat(at[1].toLowerCase()) ? [at[1].toLowerCase()] : []),
          ...(calledSeat ? [calledSeat.id] : []),
        ]),
      ].filter((id) => seat(id));
      if (!ctx.engine || !ctx.engine.route) {
        if (named.length || re || /\?\s*$/.test(clean)) core.say(clean, { to: named, re });
        else core.request(clean);
        return;
      } // no model under this page: the scripted team
      const quoted = re ? ctx.state.chat.find((m) => m.id === re && m.by !== 'you') : null;
      const body = clean.replace(/^@\w+[,:]?\s*/, '') || clean;
      if (!posted)
        post('you', clean, { to: named, re: quoted ? { by: quoted.by, text: quoted.text.slice(0, 160) } : null });
      if (!isSimple()) ctx.sizeUp(body); // who the team is talking to is read from every message they write
      // the team asked its questions (Ask me first) and this is the customer's answer: the round carries on with it
      const small =
        /^(hi|hello|hey|hiya|thanks|thank you|cheers|good (morning|afternoon|evening))( there| all| team| everyone)?[.!\s]*$/i.test(
          body,
        ); // a greeting or a thank-you is not an answer: the team's questions stay open
      const other =
        /^(please\s+)?(address|work on|take on|pick up|start on|do|fix|implement|resolve|handle)\s+(the\s+|this\s+|that\s+)?(ticket|issue|[A-Z][A-Z0-9]+-\d+)\b/i.test(
          body,
        ); // asks for a ticket: a new request, which replaces the one the team was asking about
      if (other) ctx.state.asking = null;
      if (isSimple() && !small && !named.length) ctx.keepWish(body);
      if (!named.length && !quoted && ctx.aboutMe(body)) return;
      if (!named.length && !quoted && ctx.howWeAreDoing(body)) return;
      ctx.putRight(body); // "no, I said Tuesday": kept as a lesson of its own, and counted when it is the second time
      const aside =
        !!ctx.state.asking &&
        !/^(yes|no|go|ok|sure)\b/i.test(body) &&
        (/\?\s*$/.test(body) ||
          /^(please\s+)?((can|could) you\s+)?(look up|look into|find out|search (for|the web|online)|google|research|take a (picture|screenshot)|screenshot|draw|sketch|show me|tell me|explain|what|who|when|where|why|how)\b/i.test(
            body,
          )); // a question of the customer's own, while the team waits for their answer: it is answered, and the request goes on waiting
      // a standing instruction: kept as a ruling. When the message is nothing else, the team says so and that is all; when it is part
      // of an answer or a request, it is kept and the message goes on as it would have.
      const stands = !named.length && !quoted && !small ? standingIn(body) : null;
      if (stands) {
        const kept = ctx.keepStanding(stands);
        emit('learning');
        const rules = kept.filter((k) => typeof k === 'string');
        const facts = kept.filter((k) => k && k.told).map((k) => k.told);
        if (stands.whole && !ctx.state.asking) {
          post(
            'overseer',
            [
              rules.length
                ? isSimple()
                  ? "Got it. I'll keep to that from now on: " + rules.join(' ')
                  : 'Kept, and in force from now on: ' +
                    rules.join(' ') +
                    ' Every seat is shown it before it speaks, and the newest wording on a subject wins. It is under Soul.'
                : '',
              facts.length
                ? (isSimple() ? "I'll remember that: " : 'Noted, and it comes back when it bears on what you ask: ') +
                  facts.join(' ')
                : '',
            ]
              .filter(Boolean)
              .join(' '),
          );
          return;
        }
      }
      if (ctx.state.asking && !named.length && !quoted && !small && !aside) {
        const was = ctx.state.asking;
        ctx.state.asking = null;
        const br = branchFrom(body, was.suggest) || (was.recommend && !STAYS.test(body) ? was.suggest : '');
        const said = pushFrom(body);
        const pu = said === null && was.pushes && br ? true : said;
        ctx.keepWays(was, body, br, said);
        ctx
          .round(was.title, {
            lang: was.lang,
            answers: /^(go|skip|as (it is )?written|just (build|do) it|no questions?)\b/i.test(body) ? '' : body,
            branch: br,
            push: pu,
            direct: directFrom(body),
          })
          .catch((e) => {
            post('overseer', '[The team could not finish that: ' + String((e && e.message) || e).slice(0, 140) + ']');
            ctx.state.team.seats.forEach((x) => {
              x.status = 'idle';
              x.line = '';
            });
            emit('team');
          });
        return;
      }
      (async () => {
        if (!named.length && !quoted && SETTLES.test(body) && (await ctx.settle(body).catch(() => false))) return; // a change is waiting, and this says what to do with it
        // a ticket the customer wants addressed: found, read for what it must do, and then built like any request
        if (!named.length && !quoted) {
          let tk = null;
          try {
            tk = await ctx.ticketFor(body);
          } catch {
            tk = null;
          }
          if (tk === 'asked') return;
          if (tk)
            return ctx
              .round(('Address ' + tk.key + ': ' + tk.summary).slice(0, 90), {})
              .catch((e) =>
                post(
                  'overseer',
                  '[The team could not finish that: ' + String((e && e.message) || e).slice(0, 140) + ']',
                ),
              );
        }
        // THE DETAILS THE TEAM ASKED FOR (Simple). The team asked ("tell me your airline and where you're going") and this is the answer: it
        // is the same request, now whole. It is sorted together with what was first asked, and if that needs looking up, it is looked up.
        if (isSimple() && !named.length && !quoted && !small && !/\?/.test(body) && body.split(/\s+/).length <= 30) {
          const before = ctx.state.chat.slice(0, -1).filter((m) => m.kind !== 'tools');
          const lastTeam = [...before].reverse().find((m) => m.by !== 'you');
          const lastYou = [...before].reverse().find((m) => m.by === 'you');
          if (
            lastTeam &&
            lastYou &&
            before.indexOf(lastTeam) > before.indexOf(lastYou) &&
            /\?\s*$|\btell me\b|\blet me know\b/i.test(String(lastTeam.text))
          ) {
            const whole = String(lastYou.text).replace(/[\s.?!]*$/, '') + '. ' + body;
            let rr = null;
            busy('overseer', 'Reading that');
            try {
              rr = await ctx.engine.route(whole, { simple: true });
            } catch {
              rr = null;
            }
            busy('overseer', '');
            if (rr && rr.kind === 'research')
              return await ctx
                .research(whole, [seat(rr.seat) ? rr.seat : 'operations'], { lang: rr.language || '' })
                .catch((e) =>
                  post(
                    'overseer',
                    '[The team could not finish that: ' + String((e && e.message) || e).slice(0, 140) + ']',
                  ),
                );
          }
        }
        if (!isSimple()) ctx.sizeUp(body); // someone new, or someone who does this for a living: read from what they say
        let route;
        try {
          route = await ctx.engine.route(body, { simple: isSimple() });
        } catch {
          route = { kind: /\?\s*$/.test(body) ? 'question' : 'talk', seat: 'overseer' };
        }
        // A MESSAGE THAT STATES WHAT THE WORK MUST DO IS WORK TO DO (Developer). Found on a real team: a ticket's own words, with its
        // "What it must do" list, were read as something to find out; the cause was explained and nothing was changed.
        if (
          !isSimple() &&
          route &&
          route.kind !== 'build' &&
          (STATED.test(body) || MAKES.test(body.trim())) &&
          !/\?\s*$/.test(body)
        )
          route = { ...route, kind: 'build' };
        // AN IDEA BEING TALKED THROUGH IS TALKED THROUGH (team/manners.js: discussing). While it is, every message of theirs is kept,
        // so that when they say to start, the team builds what was talked about and not the words "let's build it".
        const talk = ctx.state.discuss && Date.now() - ctx.state.discuss.at < 45 * 60000 ? ctx.state.discuss : null;
        const level = isSimple() ? 'new' : (ctx.state.dev && ctx.state.dev.level) || '';
        let discuss = false;
        let ask = body; // what a round is asked to build
        if (
          !named.length &&
          ['build', 'question', 'talk'].includes(route.kind) &&
          discussing(body, { level, simple: isSimple(), ongoing: !!talk && route.kind !== 'talk' })
        ) {
          discuss = true;
          ctx.state.discuss = {
            at: Date.now(),
            said: [...((talk && talk.said) || []), body.slice(0, 600)].slice(-8),
            askedPlatform: !!(talk && talk.askedPlatform),
            named: !!(talk && talk.named) || PLATFORM.test(body),
          };
          route = { ...route, kind: 'question' };
        } else if (talk && route.kind === 'build' && GO_AHEAD.test(body) && !NEW_THING.test(body)) {
          // "let's build it": the it is what was talked through, in their own words (shown as the work's title, so nothing of ours is
          // added to it), then what they said to start
          ask = talk.said.join(' ') + ' (' + body + ')';
          ctx.state.discuss = null;
        } else if (route.kind === 'build') ctx.state.discuss = null;
        // AN EXACT FACT GETS A SECOND OPINION ON A LOCAL MODEL (Simple): see EXACT and apartOn in team/manners.js. The answer is given
        // from memory as before; the fact-checker is asked for the bare fact; and only if the two do not agree is it looked up.
        // Not when they are in a hurry, not when they spoke to one of the five by name, and not when there is nothing to look with.
        const exact =
          isSimple() &&
          !onClaude() &&
          route.kind === 'question' &&
          !named.length &&
          !quoted &&
          EXACT.test(body) &&
          !!ctx.engine.tool &&
          !(ctx.register() || {}).hurried;
        const who = named.length ? named : quoted ? [quoted.by] : [seat(route.seat) ? route.seat : 'overseer'];
        const opts = { lang: route.language || '' };
        const startedAt = Date.now();
        const visionBefore = ctx.visionShown;
        try {
          if (route.kind === 'draw' || route.kind === 'film') return await ctx.make(route.kind, body);
          if (route.kind === 'build' && !named.length && !quoted) return await ctx.round(ask.slice(0, 2400), opts); // the whole request: the team plans and builds from every word of it (it was once cut to 90 characters, and the cut was what got built)
          if (route.kind === 'research') return await ctx.research(body, who, opts);
          if (route.kind === 'qa') return await ctx.look(body, route, who, named.length > 0, opts);
          const lead =
            (quoted
              ? 'Earlier ' +
                seatAs(seat(quoted.by)).title +
                ' said: "' +
                quoted.text.slice(0, 700) +
                '". The customer is replying to that. '
              : '') +
            'The customer just said' +
            (named.length > 1
              ? ' to ' + named.map((id) => seat(id).title).join(' and ')
              : named.length
                ? ' to you'
                : '') +
            ': "' +
            body +
            '". Answer them.' +
            (discuss
              ? discussNote({
                  askPlatform: !ctx.state.discuss.named && !ctx.state.discuss.askedPlatform,
                  simple: isSimple(),
                })
              : '');
          let said = '';
          for (const id of who)
            said = await speak(id, lead, {
              // (a talk about an idea takes the shape the note gives it: not "the answer first, never a question back")
              mode: route.kind === 'talk' || discuss ? 'talk' : 'answer',
              customer: body,
              about: body,
              lang: opts.lang,
              max: route.kind === 'talk' ? 140 : discuss ? 240 : 320,
              // IN SIMPLE AN ANSWER IS NOT SHOWN WHILE IT IS WRITTEN: a card may be the whole of the reply, and words that appear and
              // are then replaced by a card are two replies where there should be one. The words are shown, whole, only when it is
              // settled that no card stands for them.
              veil: isSimple() && route.kind !== 'talk' && !discuss,
            });
          if (discuss && asksPlatform(said)) ctx.state.discuss.askedPlatform = true;
          const carded = isSimple() && route.kind !== 'talk' && !discuss && cardWorthy(said) ? who[who.length - 1] : '';
          const unveil = () => {
            let any = false;
            for (const msg of ctx.state.chat) if (msg.veil && !msg.live) any = delete msg.veil;
            if (any) emit('chat');
          };
          if (!carded) unveil();
          // A SEAT THAT SAYS IT WAS NOT TOLD ASKS THE MEMORY FOR MORE (after the system this team is modelled on, where memory is
          // pushed at the start of a turn and can be pulled in the middle of one). Three things are put in front of a seat before it
          // speaks; when it then says it does not remember or was never told, the rest of what the team holds on the question is
          // put in front of it and it answers once more. Only when there IS more: otherwise what it said stands.
          if (
            route.kind !== 'talk' &&
            /\b(you (haven'?t|have not|never) (told|said|mentioned)|i (don'?t|do not) (remember|recall)|i (wasn'?t|was not) told|not sure (what|which) you (like|prefer|said|meant)|i don'?t know (what|which|your))\b/i.test(
              said,
            )
          ) {
            const more = core
              .ask(body)
              .filter((v) => v.kind !== 'base')
              .slice(3, 8);
            const about = ctx.state.learning.ledger.filter((x) => x.kind === 'you').slice(8, 16);
            if (more.length || about.length) {
              const first = [...ctx.state.chat].reverse().find((m) => m.by === who[who.length - 1]);
              if (first) first.superseded = true;
              said = await speak(
                who[who.length - 1],
                "WHAT ELSE THE TEAM'S MEMORY HOLDS ON THIS (you asked for more; use what bears on the question):\n" +
                  [...more.map((v) => '- [' + v.kind + '] ' + v.text), ...about.map((y) => '- ' + y.text)].join('\n') +
                  '\n\nYou said: "' +
                  String(said).slice(0, 400) +
                  '". Answer the question again with this in front of you: "' +
                  body.slice(0, 500) +
                  '". If it still does not say, say so in one sentence and ask the one thing you need.',
                { mode: 'answer', customer: body, about: body, lang: opts.lang, max: 320, veil: isSimple() },
              );
              const now = [...ctx.state.chat].reverse().find((m) => m.by === who[who.length - 1]);
              if (now) now.thread = 'pulled';
              unveil();
            }
          }
          // A SEAT THAT SAYS IT WOULD HAVE TO LOOK IT UP: the team has the tools, so it looks it up, there and then
          // (In Developer, not for a question about the customer's OWN system: "what caused the outage this morning?" was looked up
          // on the web and answered with somebody else's outage. What is theirs is asked for, not searched for.)
          const theirs =
            !isSimple() &&
            /\b(our|ours|my|we|us|last night'?s?|this morning'?s?|yesterday'?s?|the (deploy|deployment|outage|incident|build|pipeline|release|server|database|logs?))\b/i.test(
              body,
            );
          if (
            route.kind !== 'talk' &&
            !quoted &&
            !named.length &&
            !theirs &&
            /\bi (do not|don't) know\b|\b(need|have) to look (it|that|this) up\b|\bhaven'?t looked\b|\bfrom what i know\b|\bcan'?t give you a reliable\b|\bmy (information|knowledge) (may|might|could) be (out of date|old)\b/i.test(
              said,
            ) &&
            ctx.engine.tool
          ) {
            unveil(); // what it said is shown: it is going to look it up
            await ctx.research(body, who, opts);
          } else {
            if (carded) await ctx.cardFor(carded, said, body, opts.lang);
            unveil();
            if (exact && said && !/^\[(no reply|this reply was interrupted)\]/.test(said)) {
              const answerer = who[who.length - 1];
              // A BLANK SLATE CHECKS IT (team/slate.js): a slot of the team's own model, opened empty, that has not heard the answer;
              // and for a question someone will act on, a second one whose only job is to break the claim
              const checked = await ctx.checkFact(body, said, { lang: opts.lang });
              const second = checked.fact;
              const apart = checked.apart;
              const mine = [...ctx.state.chat].reverse().find((m) => m.by === answerer);
              if (mine) {
                mine.checkedBy = { seat: 'steward', agreed: !apart };
                if (!apart) ctx.react(mine, 'steward', 'checked');
                if (mine.extras && mine.extras.origin) mine.extras.origin.checked = !apart;
                mine.xrev = (mine.xrev || 0) + 1;
              }
              ctx.state.secondTrace = { second: String(second).slice(0, 160), apart };
              if (apart) {
                if (mine) mine.superseded = true;
                ctx.fault(answerer, 'replaced', String(second).slice(0, 100));
                ctx.episode('answer', short(body), startedAt, visionBefore, 1, false, {
                  seat: answerer,
                  outcome: 'replaced',
                });
                post(
                  'steward',
                  "One thing first: I'm not sure of that. I'd have said " +
                    String(second)
                      .replace(/\s+/g, ' ')
                      .replace(/[.\s]+$/, '')
                      .slice(0, 120) +
                    ". We don't agree, so let's look it up before you rely on either of us.",
                  { chime: true },
                );
                return await ctx.research(body, ['operations'], opts);
              }
            }
            if (route.kind !== 'talk' && !named.length && !quoted && said.split(/\s+/).length >= (isSimple() ? 12 : 25))
              await ctx.chimeIn(who[who.length - 1], body, said, opts);
            // an answer is a piece of work like any other: what came of it is kept (it stood, or a teammate's doubt replaced it)
            if (route.kind !== 'talk')
              ctx.episode('answer', short(body), startedAt, visionBefore, 1, false, {
                seat: who[who.length - 1],
                outcome: ctx.state.chat.some((m) => m.superseded && m.by === who[who.length - 1] && m.at >= startedAt)
                  ? 'replaced'
                  : 'stood',
              });
          } // the others chime in, when one has something to add
        } catch (e) {
          post(who[0], '[The team could not finish that: ' + String((e && e.message) || e).slice(0, 140) + ']');
          ctx.state.team.seats.forEach((x) => {
            x.status = 'idle';
            x.line = '';
          });
          emit('team');
        }
      })().finally(() => {
        if (!small) ctx.notice(body).catch(() => {});
        if (aside && ctx.state.asking && !named.length)
          post(
            'overseer',
            'Your request "' +
              String(ctx.state.asking.title).slice(0, 80) +
              '" is still waiting for you: answer above, or say "go".',
          );
      });
    },

    // a message that is not a task: the seat it names answers, or the Overseer does
    // to: the seats it is addressed to (each answers, in the order picked). re: the id of a message it replies to (that seat is told
    // what it said). With neither, a line that starts "@seat" goes to that seat, and anything else to the Overseer.
    say(text, { to = [], re = null } = {}) {
      const clean = text.trim();
      if (!clean) return;
      const at = /^@(\w+)/.exec(clean);
      const named = [...new Set(to)].filter((id) => seat(id));
      const who = named.length ? named : [at && seat(at[1].toLowerCase()) ? at[1].toLowerCase() : 'overseer'];
      const quoted = re ? ctx.state.chat.find((m) => m.id === re && m.by !== 'you') : null;
      post('you', clean, { to: named, re: quoted ? { by: quoted.by, text: quoted.text.slice(0, 160) } : null });
      const lead =
        (quoted
          ? 'Earlier ' +
            seatAs(seat(quoted.by)).title +
            ' said: "' +
            quoted.text.slice(0, 700) +
            '". The customer is replying to that. '
          : '') +
        'The customer just said' +
        (named.length > 1 ? ' to ' + named.map((id) => seat(id).title).join(' and ') : named.length ? ' to you' : '') +
        ': "' +
        clean +
        '". Answer them.';
      if (ctx.engine) {
        (async () => {
          for (const id of who) await speak(id, lead);
        })();
        return;
      }
      who.forEach((id, i) => later(900 + i * 800, () => post(id, (ANSWERS[id] || ANSWERS.overseer)(ctx.state))));
    },

    // SOMETHING UNDER A MESSAGE WAS PRESSED (m.setup): choose a folder; open, stop or start the site; check for a phone, or put
    // the app on it. What it did is written back onto the same message.
    async setupDo(id, act) {
      const msg = ctx.state.chat.find((x) => x.id === id && x.setup);
      if (!msg || !ctx.engine || msg.setup.busy) return;
      const kind = msg.setup.kind;
      try {
        if (
          kind === 'folder' &&
          act === 'choose' &&
          msg.setup.state !== 'done' &&
          ctx.engine.work &&
          ctx.engine.work.pick
        ) {
          ctx.touch(msg, { busy: true, note: '' });
          const r = await ctx.engine.work.pick();
          if (!r || r.cancelled)
            return ctx.touch(msg, { busy: false, note: 'No folder was chosen. Nothing was changed.' });
          const name = r.repo || 'your folder';
          ctx.touch(msg, { busy: false, state: 'done', name });
          post(
            'overseer',
            'Working in ' +
              name +
              ' now.' +
              (msg.setup.task ? ' Carrying on with "' + String(msg.setup.task).slice(0, 90) + '".' : ''),
          );
          if (msg.setup.task) await ctx.afterBuild(msg.setup.task, await ctx.build(msg.setup.task, {}));
          return;
        }
        if (kind === 'site' && ctx.engine.host) {
          if (act === 'stop') {
            await ctx.engine.host.siteStop(msg.setup.id);
            return ctx.touch(msg, { state: 'stopped', why: 'you stopped it' });
          }
          if (act === 'start') {
            const got = await ctx.engine.host.siteStart();
            ctx.touch(
              msg,
              got && got.ok
                ? { state: 'online', id: got.site.id, url: got.site.url, why: '' }
                : { state: 'stopped', why: (got && got.why) || 'it could not be started' },
            );
            return ctx.watchHost();
          }
        }
        if (kind === 'phone' && ctx.engine.host) {
          if (act === 'check') return ctx.touch(msg, { ...ctx.phoneSays(await ctx.engine.host.devices()), note: '' });
          if (act === 'install' && msg.setup.serial) {
            ctx.touch(msg, { busy: true, note: '' });
            const r = await ctx.engine.host.install(msg.setup.serial);
            return ctx.touch(msg, {
              busy: false,
              note:
                r && r.ok
                  ? 'It is on ' + (msg.setup.name || 'the phone') + " now. Look for it among the phone's apps."
                  : 'It did not go on: ' + String((r && r.why) || 'the phone did not answer').slice(0, 200),
            });
          }
        }
      } catch (e) {
        ctx.touch(msg, { busy: false, note: String((e && e.message) || e).slice(0, 200) });
      }
    },
    hostCheck: () => ctx.watchOnce(), // look once, now, at what is running and what is plugged in
    // ---- WHAT THE PERSON PRESSES UNDER A REPLY (team/extras.js, js/views.js). Each says what it did in the chat.
    // CHECK THIS: an answer given from memory is looked up, and the team says whether it held
    async checkThis(id) {
      const at = ctx.state.chat.findIndex((m) => m.id === id);
      const msg = ctx.state.chat[at];
      if (!msg || !ctx.engine) return;
      if (msg.extras && msg.extras.origin && msg.extras.origin.checking) return;
      const asked = [...ctx.state.chat.slice(0, at)].reverse().find((m) => m.by === 'you');
      if (!asked) return;
      const touch = (o) => {
        msg.extras = {
          ...(msg.extras || {}),
          origin: { ...((msg.extras || {}).origin || { how: 'memory', sources: 0 }), ...o },
        };
        msg.xrev = (msg.xrev || 0) + 1;
        emit('chat');
      };
      touch({ checking: true });
      // WITH NOTHING TO LOOK THINGS UP WITH (offline, or a model with no tools): blank slates check it, and say that is what they did
      if (!(ctx.engine.tool || onClaude())) {
        const c = await ctx.checkFact(asked.text, msg.text, {}).catch(() => ({ apart: '', fact: '', slates: 0 }));
        if (c.apart) msg.superseded = false; // nothing replaces it: the person is told it is in doubt
        touch({ checking: false, checked: true, held: c.slates ? !c.apart : null });
        post(
          'steward',
          !c.slates || (!c.fact && !c.apart)
            ? 'I could not check that from here: there is nothing to look it up with, and a fresh reading did not know.'
            : c.apart
              ? 'Checked afresh, without looking it up: a fresh reading says ' +
                c.fact +
                ', which is not what was said. Treat it as in doubt until it can be looked up.'
              : 'Checked afresh, without looking it up: ' +
                (c.slates > 1 ? 'two fresh readings agree' : 'a fresh reading agrees') +
                ' with it. That is the same model asked again, not a source.',
          { chime: true },
        );
        return;
      }
      const from = ctx.state.chat.length;
      try {
        await ctx.research(asked.text, ['operations'], {
          query: asked.text.replace(/[?.!]+$/, '').slice(0, 160),
          because: 'the person asked for this to be checked',
        });
      } catch {
        /* said in the chat by research itself */
      }
      const found = ctx.state.chat.slice(from).find((m) => m.by !== 'you' && m.sources && m.sources.length);
      const apart = found ? apartOn(msg.text, found.text) : '';
      if (found && apart) msg.superseded = true;
      touch({ checking: false, checked: true, held: found ? !apart : null });
      if (found)
        post(
          'steward',
          apart
            ? isSimple()
              ? 'Checked, and the first answer does not hold: go by the one just above.'
              : 'Checked against sources: the first answer does not hold. The one above replaces it.'
            : isSimple()
              ? 'Checked: the first answer holds.'
              : 'Checked against sources: the first answer holds.',
          { chime: true },
        );
    },
    // RUN IT HERE (Developer): one of the commands a reply gave, in the connected workspace, when it only reads or tests
    async runCommand(id, i) {
      const msg = ctx.state.chat.find((m) => m.id === id);
      const c = msg && msg.extras && msg.extras.commands && msg.extras.commands[i];
      if (!c || !c.run || c.state === 'running' || !ctx.engine || !ctx.engine.work || !ctx.engine.work.run) return;
      const touch = (o) => {
        Object.assign(c, o);
        msg.xrev = (msg.xrev || 0) + 1;
        emit('chat');
      };
      touch({ state: 'running', out: '' });
      try {
        const r = await ctx.engine.work.run(c.cmd);
        touch({
          state: r && r.ok ? 'ran' : 'failed',
          out: String((r && (r.out || r.why)) || '').slice(0, 6000),
          code: r ? r.code : null,
        });
        // WHAT IT PRINTED IS READ BACK: the seat that gave the command says what the output shows and what to do next
        if (r && r.out && ctx.seat(msg.by)) {
          const says = await ctx.within(
            quiet(
              msg.by,
              'The customer ran this in their workspace, at your suggestion: ' +
                c.cmd +
                '\nIt ' +
                (r.ok ? 'finished' : 'failed with code ' + r.code) +
                ' and printed:\n"""\n' +
                String(r.out).slice(-1800) +
                '\n"""\nIn at most 50 words: what this output shows, and the one next step. Speak only of what is printed here.',
              { doing: 'Reading what it printed', max: 140 },
            ),
            30000,
            'reading a command back',
          );
          if (says && !unsaid(says)) post(msg.by, says, { chime: true });
        }
      } catch (e) {
        touch({ state: 'failed', out: String((e && e.message) || e).slice(0, 400) });
      }
    },
    // SHOW ME THE DIFF FIRST, and HOLD IT FOR A REVIEW: on a change that is proven and waits for the customer's word
    async planDiff(id) {
      const msg = ctx.state.chat.find((m) => m.id === id);
      if (!msg || !msg.plan || !ctx.engine || !ctx.engine.work || !ctx.engine.work.diff) return;
      try {
        const d = await ctx.engine.work.diff();
        msg.plan.diff = {
          files: (d.files || []).slice(0, 30),
          text: String(d.diff || '').slice(0, 12000),
          cut: !!d.cut || String(d.diff || '').length > 12000,
        };
      } catch (e) {
        msg.plan.diff = { files: [], text: '', why: String((e && e.message) || e).slice(0, 200) };
      }
      msg.plan.rev = (msg.plan.rev || 0) + 1;
      emit('chat');
    },
    planHold(id) {
      const msg = ctx.state.chat.find((m) => m.id === id);
      if (!msg || !msg.plan || msg.plan.held) return;
      msg.plan.held = true;
      msg.plan.rev = (msg.plan.rev || 0) + 1;
      post(
        'master',
        'Held for a review. It stays proven and unlanded, and nothing leaves this machine. Say "land it" when it has been looked at, or "throw it away".',
      );
    },
    answerProposal(id, yes) {
      const prop = ctx.state.proposals.find((x) => x.id === id);
      if (!prop || prop.state !== 'open') return;
      prop.state = yes ? 'approved' : 'declined';
      rule(
        'answer',
        (yes
          ? prop.kind === 'landing'
            ? 'Landed: '
            : 'Approved: '
          : prop.kind === 'landing'
            ? 'Not landed: '
            : 'Declined: ') + prop.title.replace(/^Land /, ''),
      );
      emit('proposals');
      if (prop.kind === 'landing') {
        const p = ctx.state.proofs.find((x) => x.id === prop.proofId);
        const w = ctx.state.work.find((x) => x.proofId === prop.proofId);
        if (yes && p && w) {
          busy('master', 'Landing');
          later(700, () => land(p, w));
        } else later(600, () => post('overseer', VOICE.declined(p ? p.title : prop.title)));
      } else {
        later(600, () =>
          post(
            'overseer',
            yes
              ? 'Done: "' + prop.title + '" is how the team works from now on. I will measure whether it helped.'
              : 'Left as it is. I will not raise "' + prop.title + '" again unless the numbers change.',
          ),
        );
        if (yes) learn('out', 'soul', 'A process change this team adopted: ' + prop.title.toLowerCase() + '.');
      }
    },

    // Vision: ask the team's soul a question. Here it searches what this simulated team holds: its lessons, its proofs, its proposals.
    ask(question) {
      // WORDS ARE MATCHED WHOLE, by their stem. They used to be cut three letters short and looked for anywhere in a text, so "should"
      // became "sho" and found "show" and "short": a question about a cake recalled four lessons about proving a screen, and not the
      // customer's own "my sister is allergic to peanuts". A stem is the word less a plain ending; it must match a whole word's stem.
      // little words that say nothing of what a question is about ("a line of its own" recalled a lesson with "its handler" in it)
      const SMALL = new Set(
        'its own our for and was did has had not but can are way new one two out how why who all any get got let put see use via per yet too may now src lib'.split(
          ' ',
        ),
      );
      const stem = (w) => {
        // "messages" and "message", "changed" and "change", "keys" and "key" are one word each (measured by training/recall.mjs:
        // cutting "es" made "messag" of one and left the other whole, and a three-letter stem was thrown away)
        const x = w
          .replace(/ies$/, 'y')
          .replace(/([sxz]|ch|sh)es$/, '$1')
          .replace(/(ing|edly|ed|ly)$/, '')
          .replace(/s$/, '')
          .replace(/e$/, '');
        return x.length >= 3 ? x : w;
      };
      const stems = (t) =>
        new Set(
          (
            String(t || '')
              .toLowerCase()
              .match(/[a-z0-9]{3,}/g) || []
          )
            .filter((w) => !STOP.has(w) && !DULL_ASK.has(w) && !SMALL.has(w))
            .map(stem),
        );
      const words = [...stems(question)];
      if (!words.length) return [];
      const items = [
        ...ctx.state.rulings
          .filter((r) => !r.superseded)
          .map((r) => ({ kind: 'ruling', nid: r.id, at: r.at, text: r.text, from: 'your ruling, in force' })),
        ...(ctx.soulKeeps == null ? ctx.state.learning.ledger : ctx.state.learning.ledger.slice(0, ctx.soulKeeps)).map(
          (x) => ({
            kind: 'lesson',
            at: x.at,
            text: x.text,
            from: x.cites ? 'learned from "' + x.cites + '"' : 'learned on this team',
            ref: x,
          }),
        ),
        ...ctx.state.proofs.map((p) => ({
          kind: 'proof',
          nid: p.id,
          at: p.at,
          from: "this team's proofs",
          text:
            p.title +
            ': ' +
            p.runs.length +
            ' proof runs' +
            p.runs
              .filter((r) => r.result === 'red' && r.n > 1)
              .map((r) => ', red on ' + r.why)
              .join('') +
            (p.landed ? ', then landed.' : ', not landed yet.'),
        })),
        ...ctx.state.proposals.map((p) => ({
          kind: 'proposal',
          at: p.at,
          from: "the Overseer's proposals",
          text: p.title + '. ' + p.why,
        })),
        // WHAT EVERY TEAM STARTS WITH (base-lessons.js): general practice, matched on the situation as well as the lesson. It is recalled
        // only on a firm match (two of the question's words), and the team's own lessons win a tie, being newer.
        ...BASE.map((b) => ({
          kind: 'base',
          nid: b.id,
          at: 0,
          text: b.text,
          match: b.when + ' ' + b.text,
          from: 'what every team starts with: ' + b.topic.toLowerCase(),
          ref: (ctx.state.base || (ctx.state.base = {}))[b.id] || (ctx.state.base[b.id] = { shown: 0, used: 0 }),
        })),
      ];
      // THE TEAM'S OWN KNOWLEDGE COMES FIRST: what this customer told it, what it settled and what it proved outrank what every team starts
      // with, whatever the count of matching words. General practice fills what is left, and only on a firm match.
      const own = (it) => (it.kind === 'base' ? 0 : 1);
      // THE PIECES OF WORK are nodes too. They are not shown as lessons are, but the walk passes through them: a question that
      // names a piece of work reaches what was learned in it.
      const again =
        /\b(again|still|last time|like before|as before|keeps? (happening|failing|breaking)|same (as|thing)|once more)\b/i.test(
          String(question),
        );
      const told = {
        stood: 'it stood as given',
        landed: 'it landed',
        corrected: 'you put it right afterwards',
        replaced: 'a teammate doubted it and it was replaced',
        stopped: 'it was stopped before it was done',
        thrown: 'it was thrown away',
      };
      const work = (ctx.state.episodes || []).map((e) => ({
        kind: 'experience',
        nid: e.id,
        at: e.at,
        match: e.title,
        from: 'what happened the last time',
        text:
          'Last time ("' +
          e.title +
          '"): ' +
          (told[e.outcome] || 'it was finished') +
          (e.rounds > 1 ? ', after ' + e.rounds + ' rounds' : '') +
          (e.faults && e.faults.length ? '. What had to be put right then: ' + e.faults.join(', ') : '') +
          '.',
      }));
      const all = [...items, ...work];
      const idOf = (it, i) => (it.ref && it.ref.id) || it.nid || 'I' + i;
      // A RARE WORD WEIGHS MORE. A word found in many of the things kept says little about which one is meant; one found in two
      // says a lot. How many words match decides WHETHER a thing is a seed (one for the team's own, two for general practice and
      // for a piece of work); the weight decides the ORDER.
      const held = all.map((it) => stems(it.match || it.text));
      const weight = new Map(
        words.map((w) => [
          w,
          1 + Math.log((all.length + 1) / (held.reduce((n, has) => n + (has.has(w) ? 1 : 0), 0) + 1)),
        ]),
      );
      // WHAT THE TEAM HAS COME TO BELIEVE OF A LESSON moves it too (team/hindsight.js): one that has helped rises, one shown three
      // times and never used sinks. It moves down the order; it is never dropped from it.
      const belief = (it) => {
        const r = it.ref;
        if (!r) return 0;
        return (
          ((r.conf == null ? 0.5 : r.conf) - 0.5) * 2 +
          ((r.shown || 0) >= 3 ? (r.used || 0) / r.shown - (r.used ? 0 : 0.8) : 0)
        );
      };
      // ---- THE SEEDS: where the question lands
      const seeds = new Map(); // what the walk starts from: firm matches only (two words, a named file, a piece of work)
      const landed = new Map(); // every match, firm or not: id -> { hits, rank }
      all.forEach((it, i) => {
        const hits = words.filter((w) => held[i].has(w));
        const need = it.kind === 'base' || it.kind === 'experience' ? (again && it.kind === 'experience' ? 1 : 2) : 1;
        if (hits.length < need) return;
        const rank = hits.reduce((n, w) => n + weight.get(w), 0);
        landed.set(idOf(it, i), { hits: hits.length, rank });
        if (hits.length >= 2 || it.kind === 'experience') seeds.set(idOf(it, i), rank);
      });
      const edges = edgesOf(ctx.state);
      // a file the request names is a seed of its own, and the strongest: it outranks any one word
      const known = new Set(edges.flatMap(([a, b]) => [a, b]));
      for (const name of String(question).match(/\b[\w.-]+(?:\/[\w.-]+)*\.[a-z]{1,5}\b/gi) || [])
        for (const id of known)
          if (
            id.startsWith('F:') &&
            (id === fileId(name) || id.endsWith('/' + name.toLowerCase()) || fileId(name).endsWith('/' + id.slice(2)))
          )
            seeds.set(id, 8);
      // ---- THE WALK: two steps out along what ties the kept things together (team/graph.js)
      const found = walk({ seeds, edges, steps: 2 });
      const ranked = all
        .map((it, i) => {
          const id = idOf(it, i);
          const hit = landed.get(id);
          const got = found.get(id);
          const reached = got && got.hops > 0 && (!hit || got.rank > hit.rank);
          if (!hit && !(got && got.hops > 0 && got.rank >= 1.5)) return null; // reached, but too faintly to be worth a seat's eye
          return {
            ...it,
            score: hit ? hit.hits : 1,
            rank: Math.max(hit ? hit.rank : 0, got ? got.rank : 0) + belief(it),
            ...(reached ? { from: reachedBy(got.via), reached: got.via } : {}),
          };
        })
        .filter(Boolean);
      // "AGAIN", "STILL", "LIKE LAST TIME": the earlier attempt itself is said first. Otherwise a piece of work is only a way through.
      const before = again
        ? ranked
            .filter((it) => it.kind === 'experience')
            .sort((a, b) => b.rank - a.rank || b.at - a.at)
            .slice(0, 1)
            .map((it) => ({ ...it, kind: 'earlier', score: 9, rank: 99 }))
        : [];
      return [
        ...before,
        ...ranked
          .filter((it) => it.kind !== 'experience' && (it.kind !== 'base' || it.score > 1))
          .sort((a, b) => own(b) - own(a) || b.rank - a.rank || b.at - a.at),
      ].slice(0, 8);
    },

    // the ticket the customer chose on the Jira tab to talk about: every seat that answers is given it, until it is cleared
    focusTicket(t) {
      ctx.state.focus =
        t && t.key
          ? {
              key: String(t.key).slice(0, 40),
              summary: String(t.summary || '').slice(0, 240),
              status: String(t.status || '').slice(0, 60),
              type: String(t.type || '').slice(0, 40),
              priority: String(t.priority || '').slice(0, 30),
              assignee: String(t.assignee || '').slice(0, 80),
              url: t.url || null,
              description: String(t.description || '').slice(0, 1500),
              media: String(t.media || '').slice(0, 1500),
              at: Date.now(),
            }
          : null;
      emit('focus');
    },
    lookAtTicket: (d) => ctx.seeTicket(d),
    // A PICTURE OR A RECORDING HANDED OVER IN THE CHAT. It goes to the runner on this computer, Ask looks at it and says what it shows,
    // and that reading is in front of every seat for what is asked next. Anything that is not a picture or a video is said not to be.
    async sendWith(text, files, opts = {}) {
      // the words and what was attached, as one message: it is looked at first, then the words are answered
      const list = [...(files || [])].filter((f) => f && /^(image|video)\//.test(f.type || '')).slice(0, 4);
      const clean = String(text || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (!list.length) {
        if (clean) core.send(clean, opts);
        return;
      }
      post('you', clean, {
        to: opts.to || [],
        files: list.map((f) => ({
          name: String(f.name || 'file').slice(0, 80),
          kind: /^video\//.test(f.type) ? 'video' : 'picture',
        })),
      });
      await core.attach(list, { asked: !!clean });
      if (clean) core.send(clean, { ...opts, posted: true });
    },
    async attach(files, opts = {}) {
      const list = [...(files || [])].filter((f) => f && /^(image|video)\//.test(f.type || '')).slice(0, 4);
      const names = list.map((f) => f.name).join(', ');
      if (!list.length) {
        post('ask', 'I can look at a picture or a video. What you chose is neither.');
        return null;
      }
      if (!ctx.engine || !ctx.engine.media) {
        post('ask', 'I can only look at a file when this app is running on your computer.');
        return null;
      }
      busy('ask', 'Looking at ' + names);
      try {
        const ids = [];
        for (const f of list) ids.push((await ctx.engine.media.up(f)).id);
        const got = await ctx.engine.media.read(ids, ctx.state.focus ? ctx.state.focus.summary : '');
        const seen = ((got && got.media) || []).filter((m) => m.ok && m.says);
        const not = ((got && got.media) || []).filter((m) => !m.ok);
        busy('ask', '');
        if (!seen.length) {
          post(
            'ask',
            'I could not look at ' +
              names +
              ': ' +
              String((not[0] && not[0].why) || 'nothing came back').replace(/\.$/, '') +
              '.',
          );
          return got;
        }
        post(
          'ask',
          'I looked at what you gave me.\n\n' +
            seen
              .map(
                (m) =>
                  m.name +
                  (m.kind === 'video'
                    ? ' (a recording' + (m.frames ? ', ' + m.frames + ' moments of it' : '') + ')'
                    : '') +
                  ': ' +
                  m.says +
                  (m.wrong ? '\nWhat I take to be wrong: ' + String(m.wrong).replace(/\.$/, '') + '.' : ''),
              )
              .join('\n\n') +
            (not.length ? '\n\nI could not look at ' + not.map((m) => m.name).join(', ') + '.' : '') +
            (opts.asked
              ? seen.some((m) => m.wrong)
                ? '\n\nTell me if I have misread any of it.'
                : ''
              : '\n\nTell me what you would like done about it' +
                (seen.some((m) => m.wrong) ? ', and tell me if I have misread any of it.' : '.')),
        );
        ctx.state.attached = {
          at: Date.now(),
          note: (
            seen
              .map(
                (m) =>
                  m.name +
                  (m.kind === 'video' ? ' (a recording)' : ' (a picture)') +
                  ': ' +
                  String(m.says).slice(0, 520),
              )
              .join(' | ') +
            (seen.some((m) => m.wrong)
              ? ' What it shows to be wrong, which is part of what must be put right: ' +
                seen
                  .filter((m) => m.wrong)
                  .map((m) => String(m.wrong).slice(0, 260))
                  .join('; ') +
                '.'
              : '')
          ).slice(0, 1400),
        };
        emit('focus');
        return got;
      } catch (e) {
        busy('ask', '');
        post('ask', 'I could not look at ' + names + ': ' + String((e && e.message) || e).slice(0, 180));
        return null;
      }
    },
    unlinkWorkspace() {
      ctx.state.workspace = { kind: null, name: '' };
      emit('workspace');
    }, // disconnected: the team has nowhere to work until one is chosen
    linkWorkspace({ kind, name, items }) {
      ctx.state.workspace = {
        kind,
        name: String(name || '').slice(0, 120),
        items: Number.isFinite(items) ? items : null,
        at: Date.now(),
      };
      rule(
        'workspace',
        'The team works in ' +
          ctx.state.workspace.name +
          (kind === 'github' ? ', a GitHub repository.' : ', a folder on this computer.'),
      );
      emit('workspace');
    },
    // HINDSIGHT'S READING (team/hindsight.js): how the team is doing, read off its own experiences
    hindsight: () => ({ ...ctx.hindsight(), links: edgesOf(ctx.state).length }),
    // THE SOUL'S EDGES (team/graph.js): what ties the kept things together, as [from, to, kind]
    graph: () => edgesOf(ctx.state),
    // WHAT WOULD BE CONTRIBUTED (team/share.js): the team's lessons with everything of the person's own taken out. Nothing is sent
    // from here; this is what a sender would be handed, and all it would be handed.
    contribution: () =>
      ctx.state.learning.contribute
        ? forSharing(
            ctx.state.learning.ledger,
            ctx.state.chat.filter((m) => m.by === 'you').map((m) => m.text),
          )
        : [],
    setContribute(on) {
      ctx.state.learning.contribute = !!on;
      emit('learning');
    },
    setPlan(plan) {
      ctx.state.plan = { ...ctx.state.plan, ...plan };
      emit('plan');
    },
    renameTeam(name) {
      ctx.state.team.name = String(name || '').slice(0, 40) || 'Your team';
      emit('team');
    },
  };
  Object.assign(ctx, {
    onClaude,
    post,
    learn,
    emit,
    busy,
    core,
    hex,
    seat,
    quiet,
    rule,
    speak,
    episode,
    step,
    note,
    shut,
  });
  installYou(ctx);
  installSource(ctx);
  installTicket(ctx);
  installHost(ctx);
  installManners(ctx);
  installBuild(ctx);
  installRound(ctx);
  installCards(ctx);
  installThread(ctx);
  installHindsight(ctx);
  installSlates(ctx);
  installResearch(ctx);
  return core;
}
