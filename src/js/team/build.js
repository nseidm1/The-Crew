// build.js - A CHANGE, FROM PLAN TO LANDING (Developer). The requirements are read from the request or the ticket; Operations builds,
// the Steward proves and then judges every requirement against the code; what is not met goes round again, three rounds at most;
// and nothing lands by itself while a requirement is open.
import { isSimple } from '../mode.js';
import { seatAs, short, unsaid } from './base.js';
import { branchFrom, directFrom, landedSays, pushFrom } from './source.js';

// THE PLAN AND THE LOOP (Developer): the team plans from the requirements of a request or of a Jira ticket, loops until they are
// met, and shows both in the group chat.
// THE PLAN is what must be true when the work is done: the requirements, read by the Overseer out of the ticket the chat is on
// (its summary, what it says it must do, what its pictures show) or, with no ticket, out of the request and the customer's
// answers. It is a message with a card under it (m.plan; views.js paints it): one row for each requirement, and where the
// round is (plan, build, prove, judge, land).
// THE LOOP is build, prove, judge. Operations makes the change, the Steward proves it, and then judges EVERY requirement
// against the change itself (its diff, when the runner gives one), each round: a later round can undo what an earlier one got
// right. What is not met goes round again, on top of the change that is waiting, with only what is left and with what the
// Overseer says to do differently this time. It is bounded three ways: PLAN_MAX rounds; a round that leaves exactly what the
// last one left stops it (nothing new was learned, so another would be the same); and a change that cannot be proven at all
// does not go round. Each round has its own card, so the chat keeps the record: an earlier card says how its round ended, the
// last one is the state of the work now. Nothing lands by itself while a requirement is not met.
export const PLAN_MAX = 3;

// only lines the model marked as a list are requirements: a model that answered in prose has not given any
export const reqLines = (raw) =>
  String(raw || '')
    .split('\n')
    .map((l) => l.replace(/\*\*|\x60/g, '').trim())
    .filter((l) => /^(?:\d+[.):]|[-*•])\s/.test(l))
    .map((l) => l.replace(/^(?:\d+[.):]|[-*•])\s*/, '').trim())
    .filter((l) => l.length >= 8 && l.length <= 240 && !/[?:]$/.test(l))
    .slice(0, 6);

// THE JUDGEMENT: the Steward, on every requirement. Where the runner can, it judges IN THE REPOSITORY (engine.work.judge): the
// code as it stands with the change in it, read with read-only tools, so a requirement the code already met is met. (Measured
// on a real team: shown only the diff, it called unmet what the change had no need to touch.) Otherwise it is asked quietly,
// and shown the change as text where the runner can give that. What comes back is read line by line (a number, MET or UNMET,
// a few words of why); a requirement with no line is "not judged".
export const verdicts = (raw, n) => {
  const got = new Map();
  if (!raw || unsaid(raw)) return got;
  for (const l of String(raw).split('\n')) {
    const m = /^\W*(\d)\W{0,6}\b(UNMET|NOT MET|MET)\b[\s:.,;–—-]*(.*)$/i.exec(l.replace(/\*\*|\x60/g, '').trim());
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= n && !got.has(Number(m[1])))
      got.set(Number(m[1]), { met: /^met$/i.test(m[2]), why: m[3].trim().replace(/\.$/, '').slice(0, 160) });
  }
  return got;
};

export function installBuild(ctx) {
  ctx.looked = null; // what the team found in the code for the request in hand: { title, found }

  // A REAL PROOF, KEPT IN THE SOUL: what was asked, each run of the proof (red on the code before, a line for every round it took, and
  // how it ended), the receipt when it is proven, and where it landed. The Soul page lists it and Vision can bring it back.
  const record = (title, proof) => {
    const rows = proof.rows || [];
    const nP = rows.filter((x) => x.verdict === 'proven').length;
    const rounds = proof.rounds || [];
    const proofRecord = {
      id: 'PF-' + (proof.id || ctx.hex(4)),
      title: short(title),
      judge: (proof.recipe || 'The proof') + ', run on a copy of the repository before the change and a copy after it',
      at: Date.now(),
      by: { judge: 'steward', code: 'operations' },
      real: true,
      after: null,
      runs: [
        {
          n: 1,
          result: 'red',
          why: nP
            ? 'on the code before the change, ' + nP + ' of ' + rows.length + ' checks fail, as they must'
            : 'on the code before the change',
        },
        ...rounds.map((x, i) => ({ n: i + 2, result: 'red', why: String(x.why || '').slice(0, 160) })),
        {
          n: rounds.length + 2,
          result: proof.ok ? 'green' : 'red',
          why: String(proof.says || proof.why || proof.blocked || '').slice(0, 200),
        },
      ],
      receipt: proof.ok
        ? {
            id: 'R-' + (proof.id || ctx.hex(4)),
            key: rows.length + ' checks',
            head: rows
              .filter((x) => x.verdict === 'proven')
              .map((x) => x.test)
              .slice(0, 3)
              .join('; '),
            state: proof.word === 'checked' ? 'checked' : 'proven',
          }
        : null,
      landed: null,
    };
    ctx.state.proofs.unshift(proofRecord);
    ctx.state.proofs = ctx.state.proofs.slice(0, 80);
    ctx.emit('proofs');
    return proofRecord;
  };

  async function build(title, opts) {
    // the round of the plan this is, and the plan's card (planFor)
    const lap = opts.lap || 1;
    let planMsg = opts.plan || null;
    if (!ctx.engine || !ctx.engine.work || isSimple()) {
      planTouch(planMsg, {
        stage: 'talk',
        says: 'Talked through. Nothing is built here: this team has no workspace to build in.',
      });
      return null;
    }
    let workspace = null;
    try {
      workspace = await ctx.engine.work.state();
    } catch {
      return null;
    }
    ctx.teamSkills = (workspace && workspace.skills) || ctx.teamSkills;
    if (!workspace || !workspace.repo) {
      planTouch(planMsg, {
        stage: 'talk',
        says: 'Waiting for a workspace. Nothing is built until there is a folder or a repository to build it in.',
      });
      if (ctx.engine.work.pick) ctx.askFolder(title);
      else
        ctx.post(
          'overseer',
          'Nothing was built: no workspace is connected. Connect a repository or a Git folder on the Workspace page, then ask again.',
        );
      return null;
    } // with a folder window to offer, the message has a button for it
    if (lap === 1 && (workspace.pending || (workspace.changed || []).length)) {
      planTouch(planMsg, { stage: 'stopped', says: 'Not started: an earlier change is still waiting.' });
      ctx.post(
        'overseer',
        'Nothing was built: an earlier change is still waiting. Say "land it" or "throw it away" first.',
      );
      return null;
    }
    // asked for from a folder that was only just chosen, or from anywhere a plan was not made yet: it is made (or carried on) here
    if (!planMsg) planMsg = await planFor(title, opts);
    const marked = (reqState) => planMsg.plan.reqs.map((r) => (r.state === 'met' ? r : { ...r, state: reqState }));
    const ticket = ctx.state.focus
      ? ' It is about the ticket ' +
        ctx.state.focus.key +
        ': ' +
        ctx.state.focus.summary +
        (ctx.state.focus.description
          ? '. What the ticket says it must do: ' + String(ctx.state.focus.description).slice(0, 1200)
          : '') +
        (ctx.state.focus.media ? ' ' + String(ctx.state.focus.media).slice(0, 1200) : '')
      : '';
    const given =
      ctx.state.attached && Date.now() - ctx.state.attached.at < 30 * 60000
        ? ' What the customer attached shows, as the team read it: ' + ctx.state.attached.note.slice(0, 1200)
        : '';
    const must =
      planMsg.plan.reqs.length > 1
        ? ' THE REQUIREMENTS, each of which is judged against the change afterwards: ' +
          planMsg.plan.reqs.map((r, i) => i + 1 + ') ' + r.text).join(' ')
        : '';
    const task = (
      title +
      must +
      (opts.answers ? ' What the customer said when asked: ' + opts.answers : '') +
      (ctx.looked && ctx.looked.title === title && ctx.looked.found
        ? ' What the team found in the code: ' + ctx.looked.found.slice(0, 500)
        : '') +
      ticket +
      given
    )
      .replace(/[\t\r\n]+/g, ' ')
      .slice(0, 3600); // line ends become a space; the spaces inside a quoted value are kept as the ticket has them
    // the branch, and whether it is pushed, as the customer said it: in the answer to the team's questions, or in the request itself
    const branch = opts.branch || branchFrom(title, '');
    const push = opts.push === true || opts.push === false ? opts.push : branch ? pushFrom(title) : null;
    const how = { ...(push === null ? {} : { push }), ...(opts.direct || directFrom(title) ? { direct: true } : {}) };
    try {
      if (branch) {
        ctx.state.branchNames = [branch, ...(ctx.state.branchNames || []).filter((n) => n !== branch)].slice(0, 12);
        ctx.emit('work');
      } // learned: how this customer names a branch
      planTouch(planMsg, {
        stage: 'build',
        says:
          lap > 1 ? 'Building what is left, on top of the change that is waiting' : 'Building it in ' + workspace.repo,
        reqs: marked('doing'),
      });
      ctx.busy(
        'operations',
        (lap > 1 ? 'Round ' + lap + ': building what is left in ' : 'Building it in ') + workspace.repo,
      );
      const made = await ctx.engine.work.task(
        lap > 1
          ? (
              'Finish this change. STILL TO DO, and only this: ' +
              opts.todo +
              (opts.way ? ' Do it this way: ' + opts.way : '') +
              ' What is already right in the change must stay as it is. THE WHOLE REQUEST, for reference: ' +
              task
            )
              .replace(/\s+/g, ' ')
              .slice(0, 3600)
          : task,
        branch,
        lap > 1 ? { ...how, more: true } : how,
      );
      ctx.busy('operations', '');
      // DOES ANYONE HAVE ANY IDEAS? When the builder was stuck it asked the room (runner/swarm.mjs). The chat shows it as it went: the
      // question, each seat's idea in its own name with what came of trying it, and how it ended.
      const roomSay = (room, why) => {
        if (!room || !room.lines || !room.lines.length) return;
        ctx.post('operations', why + ' Does anyone have any ideas?');
        for (const l of room.lines) ctx.post(l.seat, l.says + (l.tried ? ' (Tried: ' + l.came + '.)' : ''));
        ctx.post('operations', 'What came of it: ' + room.came + '.');
        const won = room.lines.find((l) => l.ok);
        if (won)
          ctx.learn(
            'kept',
            'lesson',
            'When "' +
              String(title).slice(0, 80) +
              '" would not come right (' +
              String(why).replace(/\.$/, '').slice(0, 90) +
              '), ' +
              (seatAs(ctx.seat(won.seat)).title || won.name) +
              "'s idea settled it: " +
              String(won.says).slice(0, 200),
            title,
          );
      };
      roomSay(
        made.room,
        (made.room && made.room.why) || "I repaired my change and the project's own tests still fail.",
      );
      const changed = (made.changed || []).map((f) => f.path);
      if (!changed.length) {
        planTouch(planMsg, { stage: 'stopped', says: 'Stopped: no file was changed.', reqs: marked('todo') });
        ctx.post('operations', 'I changed no file in ' + workspace.repo + '. ' + String(made.said || '').slice(0, 300));
        return null;
      }
      // a further round that altered nothing: going on would be the same round again, so it stops and waits for the customer
      if (lap > 1 && made.same) {
        ctx.post('operations', 'I went round again and changed nothing more. ' + String(made.said || '').slice(0, 300));
        planTouch(planMsg, {
          stage: 'waiting',
          says:
            'Round ' + lap + ' changed nothing, so the work stopped here: ' + opts.left + ' not met. It waits for you.',
          reqs: planMsg.plan.reqs.map((r) => (r.state === 'met' ? r : { ...r, state: 'unmet', why: r.was || r.why })),
        });
        ctx.post(
          'master',
          'It waits for you: ' +
            opts.left +
            ' not met, and another round would be the same. Say "land it" or "throw it away".',
        );
        return { landed: false, kept: null };
      }
      ctx.post(
        'operations',
        'I changed ' +
          changed.length +
          (changed.length === 1 ? ' file' : ' files') +
          ' in ' +
          workspace.repo +
          ': ' +
          changed.slice(0, 6).join(', ') +
          (changed.length > 6 ? ' and ' + (changed.length - 6) + ' more' : '') +
          '. Nothing has left this machine.',
      );
      planTouch(planMsg, {
        stage: 'prove',
        says: 'Proving the change: it has to fail on the code before and pass on the code after',
      });
      ctx.busy('steward', 'Proving it');
      const proof = await ctx.engine.work.prove().catch((e) => ({ ok: false, why: String((e && e.message) || e) }));
      ctx.busy('steward', '');
      // THE ROUNDS IT TOOK, each said by the seat whose work it was: the Steward for its proof, Operations for the code
      for (const proofRound of proof.rounds || [])
        if (proofRound.what === 'challenge')
          ctx.post(
            'steward',
            'I challenged the change with ' +
              (proofRound.tests.length === 1 ? 'a further check' : 'further checks') +
              ' from the ticket\'s own words: "' +
              proofRound.tests.join('", "') +
              '". ' +
              proofRound.why.charAt(0).toUpperCase() +
              proofRound.why.slice(1) +
              '.',
          );
        else if (proofRound.what === 'room')
          roomSay(
            proof.room,
            'A check still fails after ' +
              ((proof.rounds || []).length - 1 || 'the first') +
              ((proof.rounds || []).length - 1 === 1
                ? ' round'
                : (proof.rounds || []).length - 1
                  ? ' rounds'
                  : ' run') +
              ', and I cannot settle it by myself.',
          );
        else
          ctx.post(
            proofRound.what === 'code'
              ? 'operations'
              : proofRound.what === 'proof' && proofRound.by && ctx.seat(proofRound.by)
                ? proofRound.by
                : 'steward',
            'Round ' +
              proofRound.n +
              ': ' +
              (proofRound.what === 'check'
                ? 'the mistake was in my own proof, not in the change. ' + proofRound.why + '. I ran the proof again.'
                : proofRound.what === 'code'
                  ? 'the check' +
                    (proofRound.tests.length > 1 ? 's' : '') +
                    ' "' +
                    proofRound.tests.join('", "') +
                    '" showed the change wrong. ' +
                    proofRound.why +
                    ' I put the code right, and the proof was run again.'
                  : proofRound.by
                    ? 'The last proof would not do: ' +
                      String(proofRound.why).replace(/, (?:so|and) [\w ]+ wrote it again$/, '') +
                      '. I wrote it again, my own way.'
                    : 'I wrote the proof again: ' + proofRound.why + '.'),
          );
      // the proof, said and SHOWN: the image is in the chat, to open with a press and to save or copy with a right-click
      ctx.post(
        'steward',
        (proof.blocked
          ? 'I could not prove it: ' + proof.blocked
          : proof.ok
            ? (ctx.onClaude()
                ? 'Proven. '
                : 'Checked, not proven. This team runs on a local model, which wrote both the change and its checks, so read the steps on the proof image before you rely on it. ') +
              (proof.says || 'The proof fails on the code before the change and passes on the code after it.')
            : 'Not proven yet. ' + (proof.says || proof.why || 'The proof did not fail before and pass after.')) +
          (proof.id && proof.image
            ? ' The proof image is below.'
            : proof.id && proof.imageWhy
              ? ' No proof image could be made: ' + proof.imageWhy
              : ''),
        proof.id && proof.image ? { proof: proof.id } : undefined,
      );
      // THE JUDGEMENT, AND THE LOOP. Every requirement of the plan is judged against the change as it now stands. What is not met goes
      // round again, unless this was the last round, or it left exactly what the round before left, or the change cannot be proven.
      planTouch(planMsg, { stage: 'judge', says: 'Judging the change against each requirement' });
      const got = await judgePlan(planMsg, title, made, proof);
      const all = planMsg.plan.reqs.length;
      const reqs = planMsg.plan.reqs.map((r, i) => {
        const v = got.get(i + 1);
        return { text: r.text, state: !v ? 'unknown' : v.met ? 'met' : 'unmet', why: !v ? 'not judged' : v.why };
      });
      const unmet = reqs.map((r, i) => ({ ...r, i: i + 1 })).filter((r) => r.state !== 'met');
      const leftKey = unmet.map((r) => r.i).join(',');
      const stuck = lap > 1 && leftKey === opts.leftKey;
      const again = got.size > 0 && unmet.length > 0 && lap < PLAN_MAX && !stuck && !proof.blocked;
      const tally = all - unmet.length + ' of ' + all + (all === 1 ? ' requirement' : ' requirements') + ' met';
      ctx.post(
        'steward',
        !got.size
          ? 'I could not judge the change against the plan: I got no verdict on any requirement. So it does not land by itself.'
          : 'Round ' +
              lap +
              ': ' +
              (unmet.length
                ? tally +
                  '. Not yet:\n' +
                  unmet.map((r) => r.i + '. ' + r.text + (r.why ? ' (' + r.why + ')' : '')).join('\n')
                : all === 1
                  ? 'the requirement is met.'
                  : 'all ' + all + ' requirements are met.') +
              (unmet.length && !again
                ? stuck
                  ? '\nThat is exactly what round ' +
                    (lap - 1) +
                    ' left, so another round would be the same. I am stopping here.'
                  : proof.blocked
                    ? '\nThe change could not be proven, so it does not go round again.'
                    : lap >= PLAN_MAX
                      ? '\nThat was the last of ' + PLAN_MAX + ' rounds.'
                      : ''
                : ''),
      );
      if (again) {
        planTouch(planMsg, {
          reqs,
          stage: 'again',
          says: 'Round ' + lap + ' ended: ' + tally + '. What is left went round again.',
        });
        const todo = unmet
          .map((r) => r.i + ') ' + r.text + (r.why && r.state === 'unmet' ? ' (what is wrong now: ' + r.why + ')' : ''))
          .join(' ');
        const wayRaw = await ctx.quiet(
          'overseer',
          'A software team is working on this: "' +
            title +
            '". After round ' +
            lap +
            ' these requirements are still not met: ' +
            todo +
            ' In ONE sentence of at most 25 words, say what the builder should do differently in the next round so that they are met. No preamble, no list, no question.',
          { customer: title, lang: opts.lang || '', max: 60, doing: 'Deciding the next round' },
        );
        const way = unsaid(wayRaw) ? '' : String(wayRaw).split('\n')[0].replace(/\*\*/g, '').trim().slice(0, 220);
        ctx.post(
          'overseer',
          'Round ' +
            (lap + 1) +
            ' of ' +
            PLAN_MAX +
            '. Still to do: ' +
            unmet.map((r) => r.i).join(', ') +
            '.' +
            (way ? ' This time: ' + way : ''),
          {
            plan: {
              ...planMsg.plan,
              reqs: reqs.map((r) => (r.state === 'met' ? r : { text: r.text, state: 'todo', why: '', was: r.why })),
              n: lap + 1,
              stage: 'plan',
              says: '',
              way,
              rev: 0,
            },
          },
        );
        return build(title, {
          ...opts,
          plan: ctx.state.chat[ctx.state.chat.length - 1],
          lap: lap + 1,
          leftKey,
          todo,
          way,
          left: unmet.length + ' of ' + all,
        });
      }
      planTouch(planMsg, { reqs, stage: 'judged', says: tally.charAt(0).toUpperCase() + tally.slice(1) });
      const kept = proof.blocked ? null : record(title, proof);
      if (proof.ok && ctx.onClaude() && !unmet.length) {
        // proven, and where it goes was settled before it was built: it lands there. A change that is not proven always waits
        ctx.busy('master', 'Landing it');
        const done = await ctx.engine.work.land(branch, how);
        ctx.busy('master', '');
        if (kept) {
          kept.landed = {
            sha: String((done && (done.branch || done.head || done.sha)) || branch || 'landed').slice(0, 60),
            at: Date.now(),
          };
          ctx.emit('proofs');
        }
        planTouch(planMsg, {
          stage: 'landed',
          says: 'Landed after ' + lap + (lap === 1 ? ' round: ' : ' rounds: ') + landedSays(done, how) + '.',
        });
        ctx.post('master', 'Landed "' + short(title) + '": ' + landedSays(done, how) + '.');
        return {
          landed: true,
          kept: ctx.learn(
            'kept',
            'lesson',
            'Changed in ' +
              workspace.repo +
              ' for "' +
              String(title).slice(0, 90) +
              '": ' +
              changed.slice(0, 6).join(', ') +
              '. Proven, and landed: ' +
              landedSays(done, how) +
              '.',
            title,
          ),
        };
      }
      planTouch(planMsg, {
        stage: 'waiting',
        says: unmet.length
          ? 'It waits for you: ' +
            unmet.length +
            ' of ' +
            all +
            ' not met after ' +
            lap +
            (lap === 1 ? ' round.' : ' rounds.')
          : proof.ok
            ? 'Every requirement is met. It waits for your yes.'
            : 'Every requirement is met, but it is not proven. It waits for you.',
      });
      ctx.post(
        'master',
        (unmet.length
          ? (proof.ok ? 'It is proven, but ' : 'It is not proven, and ') +
            unmet.length +
            ' of ' +
            all +
            (all === 1 ? ' requirement' : ' requirements') +
            (unmet.length === 1 ? ' is' : ' are') +
            ' not met, so it waits for you'
          : proof.ok
            ? ctx.onClaude()
              ? 'It is proven and waits for your yes'
              : 'It is checked, not proven, so it waits for your yes'
            : 'It is not proven, so it waits for you') +
          '. Say "land it"' +
          (branch
            ? ' (it goes on the branch ' + branch + (how.push ? ', pushed' : '') + ')'
            : workspace.kind === 'github'
              ? how.direct
                ? ' (it is committed straight to ' + (workspace.base || 'the default branch') + ')'
                : ' (it opens a pull request)'
              : workspace.current
                ? ' (it is committed onto ' + workspace.current + ')'
                : '') +
          ' or "throw it away".',
      );
      return {
        landed: false,
        kept: ctx.learn(
          'kept',
          'lesson',
          'Changed in ' +
            workspace.repo +
            ' for "' +
            String(title).slice(0, 90) +
            '": ' +
            changed.slice(0, 6).join(', ') +
            '. ' +
            (proof.blocked
              ? 'It could not be proven: ' + String(proof.blocked).slice(0, 140)
              : 'Not proven: ' +
                String(proof.says || proof.why || 'the proof did not fail before and pass after').slice(0, 140)) +
            ' It waits for the customer.',
          title,
        ),
      };
    } catch (e) {
      ctx.state.team.seats.forEach((x) => {
        x.status = 'idle';
        x.line = '';
      });
      ctx.emit('team');
      planTouch(planMsg, { stage: 'stopped', says: 'Stopped: the change could not be finished.' });
      ctx.post('operations', '[The change could not be finished: ' + String((e && e.message) || e).slice(0, 200) + ']');
      return null;
    }
  }

  const planTouch = (m, change) => {
    if (!m || !m.plan) return;
    Object.assign(m.plan, change, { rev: (m.plan.rev || 0) + 1 });
    ctx.emit('chat');
  };

  const planEnd = (stage, says) => {
    const m = [...ctx.state.chat].reverse().find((x) => x.plan && x.plan.stage === 'waiting');
    if (m) planTouch(m, { stage, says });
  }; // the customer's own word on a change that waited

  const ticketSays = () =>
    ctx.state.focus
      ? 'The ticket ' +
        ctx.state.focus.key +
        ': ' +
        ctx.state.focus.summary +
        (ctx.state.focus.description
          ? '. What the ticket says it must do: ' + String(ctx.state.focus.description).slice(0, 1400)
          : '') +
        (ctx.state.focus.media ? ' What its pictures show: ' + String(ctx.state.focus.media).slice(0, 900) : '')
      : '';

  async function planFor(title, o = {}) {
    const old = ctx.state.chat.filter((m) => m.plan && m.plan.title === short(title) && m.plan.stage === 'talk').pop();
    const src = old ? old.plan.source : ctx.state.focus ? 'ticket' : 'request';
    const key = old ? old.plan.key : ctx.state.focus ? ctx.state.focus.key : '';
    let reqs = old ? old.plan.reqs.map((r) => r.text) : []; // talked through before there was a workspace: the same plan is carried on, not read again
    if (!reqs.length) {
      const raw = await ctx.quiet(
        'overseer',
        'A customer asked a software team for this: "' +
          title +
          '".' +
          (o.answers ? ' Asked about it, the customer said: "' + String(o.answers).slice(0, 900) + '".' : '') +
          (ctx.state.focus ? ' It is about a ticket. ' + ticketSays() : '') +
          ' Write the requirements: what must be true when this work is done, as ' +
          (ctx.state.focus ? 'the ticket states' : 'the customer stated') +
          ' it. A numbered list, one requirement on each line, at most six, the most important first. Each is one plain sentence that a test or a person could check as met or not met. Use the names and the numbers ' +
          (ctx.state.focus ? 'the ticket' : 'the request') +
          ' uses. Add nothing that was not asked for, never a question, and no words before or after the list.',
        {
          customer: title,
          lang: o.lang || '',
          max: 260,
          doing: ctx.state.focus ? 'Reading what the ticket must do' : 'Reading what it must do',
        },
      );
      reqs = unsaid(raw) ? [] : reqLines(raw);
    }
    if (!reqs.length) reqs = [short(title)]; // nothing to break it into: the request itself is the one thing to meet
    if (old) planTouch(old, { stage: 'moved', says: 'Carried on further down.' });
    const plan = {
      title: short(title),
      source: src,
      key,
      reqs: reqs.map((text) => ({ text, state: 'todo', why: '' })),
      n: 1,
      max: PLAN_MAX,
      stage: 'plan',
      says: '',
      rev: 0,
    };
    ctx.post(
      'overseer',
      'The plan, from ' +
        (src === 'ticket' ? 'the ticket ' + key : 'your request') +
        ': ' +
        (reqs.length === 1 ? 'one requirement' : reqs.length + ' requirements') +
        '. The work goes round (build, prove, judge) until each is met, ' +
        PLAN_MAX +
        ' rounds at most, and nothing lands by itself while one is not.',
      { plan },
    );
    return ctx.state.chat[ctx.state.chat.length - 1];
  }

  async function judgePlan(planMsg, title, made, proof) {
    if (ctx.engine.work.judge) {
      ctx.busy('steward', 'Judging it against the plan, in the code');
      let said = '';
      try {
        said = String(
          (
            (await ctx.engine.work.judge(
              planMsg.plan.reqs.map((r) => r.text),
              title,
            )) || {}
          ).said || '',
        );
      } catch {
        said = '';
      }
      ctx.busy('steward', '');
      const got = verdicts(said, planMsg.plan.reqs.length);
      if (got.size) return got;
    } // no verdict from there: asked the other way
    let diff = '';
    let cut = false;
    if (ctx.engine.work.diff)
      try {
        const d = await ctx.engine.work.diff();
        diff = String((d && d.diff) || '');
        cut = !!(d && d.cut);
      } catch {
        diff = '';
      }
    const files = (made.changed || [])
      .map((f) => f.path)
      .slice(0, 12)
      .join(', ');
    const raw = await ctx.quiet(
      'steward',
      'A software team was asked for this: "' +
        title +
        '". These are its requirements:\n' +
        planMsg.plan.reqs.map((r, i) => i + 1 + '. ' + r.text).join('\n') +
        '\n\nA change was made (' +
        files +
        '). ' +
        (made.said ? 'The builder says: "' + String(made.said).slice(0, 400).replace(/"/g, "'") + '". ' : '') +
        'The proof ' +
        (proof.blocked
          ? 'could not be run: ' + String(proof.blocked).slice(0, 200)
          : (proof.ok ? 'passes. ' : 'does not pass. ') + String(proof.says || proof.why || '').slice(0, 300)) +
        (diff
          ? '\n\nThe change itself' +
            (cut ? ' (the start of it; it is longer than this)' : '') +
            ':\n' +
            diff.slice(0, 9000)
          : '') +
        '\n\nJudge each requirement against the change' +
        (diff ? ' as it is written above' : '') +
        ', not against what anyone says about it. A requirement that the code already met before this change, and that the change does not touch or break, is MET. For each requirement write one line: its number, then one word, MET or UNMET, then in at most twelve words what in the change shows it, or what is missing. UNMET when the change does not show it. Nothing before or after those lines.',
      { customer: title, max: 240, doing: 'Judging it against the plan' },
    );
    return verdicts(raw, planMsg.plan.reqs.length);
  }

  Object.assign(ctx, { planEnd, planFor, build });
}
