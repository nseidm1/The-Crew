// round.js - THE ROUND OF THE TABLE: what the team does with a request. In Simple, a piece of work done by friendly people, each with
// one plain job. In Developer: look in the code, ask only what nobody else can answer, plan, build and prove.
import { isSimple } from '../mode.js';
import { UI_WORDS, short, unsaid } from './base.js';
import { SHARED, directFrom, pushFrom } from './source.js';
import { NEW_THING, PLATFORM, PLATFORM_ASK } from './manners.js';

export function installRound(ctx) {
  async function simpleRound(title, o = {}) {
    const brief = 'The person asked the team for this: "' + title + '". ';
    const speakOpts = { mode: 'do', customer: title, about: title, lang: o.lang || '' };
    const startedAt = Date.now();
    const visionBefore = ctx.visionShown;
    const cut = (t, n) =>
      String(t || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n);
    ctx.keepWish(title);
    await ctx.speak(
      'overseer',
      brief +
        'In one or two short sentences, speaking as yourself (say "I" and "we", never your own name), tell the person the plan: Alex writes it, Robin checks it, and Pat hands over the final version. Add the one thing you want it to get right. No list.',
      { ...speakOpts, max: 55, doing: 'Working out who does what' },
    );
    const draft = await ctx.speak(
      'operations',
      brief +
        'Do it now, in full: write the thing that was asked for, ready to use, with every detail the person gave in it. Where it needs something only the person knows, such as the name to sign with, leave a clear placeholder in square brackets. Give only the piece itself: no introduction before it and no comment after it.',
      { ...speakOpts, max: 260, doing: 'Working on it' },
    );
    const note = await ctx.speak(
      'steward',
      brief +
        'Your teammate Alex wrote this: "' +
        cut(draft, 1500) +
        '". Check it against what was asked: is every detail the person gave in it, is anything wrong, is anything missing that this kind of thing always has? In at most two sentences say exactly what to fix, or say it is right as it is.',
      { ...speakOpts, max: 70, doing: 'Checking it' },
    );
    const fine =
      /right as it is|nothing (is |was )?(wrong|missing)|no changes? (are |is )?needed/i.test(note) &&
      !/\bbut\b|\bhowever\b|\bshould\b|\bmissing a\b|\bneeds\b/i.test(note);
    if (fine)
      await ctx.speak(
        'master',
        brief +
          "Alex wrote it and Robin checked it and found nothing to fix. In one short sentence tell the person that Alex's version above is ready to use as it is, and offer to change anything. Do not write the piece out again.",
        { ...speakOpts, max: 40, doing: 'Reading it over' },
      );
    else
      await ctx.speak(
        'master',
        brief +
          'The draft: "' +
          cut(draft, 1500) +
          '". What the check found: "' +
          cut(note, 400) +
          '". Write the piece out again with every point from the check put right and everything else kept. Give the finished piece on its own first. Then, on a new line, one short sentence offering to change anything.',
        { ...speakOpts, max: 300, doing: 'Putting the final version together' },
      );
    // THE PIECE ITSELF: Alex's when nothing had to be fixed, Pat's when something did. It can be copied, and steered with a tap.
    {
      const piece = [...ctx.state.chat]
        .reverse()
        .find((m) => m.by === (fine ? 'operations' : 'master') && m.text && !unsaid(m.text));
      if (piece) {
        piece.extras = { ...(piece.extras || {}), draft: true };
        piece.xrev = (piece.xrev || 0) + 1;
        ctx.emit('chat');
      }
    }
    const kept =
      unsaid(note) || fine
        ? null
        : ctx.learn(
            'kept',
            'lesson',
            'Asked for "' +
              cut(title, 90) +
              '". What the check caught, to get right first time next time: ' +
              cut(note, 220),
            title,
          ); // nothing is kept when nothing was caught
    ctx.episode('build', title, startedAt, visionBefore, 4, kept);
  }

  async function round(title, opts = {}) {
    if (isSimple()) return simpleRound(title, opts);
    const brief =
      'The customer asked the team for this: "' +
      title +
      '". ' +
      (opts.answers
        ? 'The customer then answered the team\'s questions: "' +
          String(opts.answers).slice(0, 900) +
          '". Build to those answers. '
        : '');
    const speakOpts = { mode: 'build', customer: title, about: title, lang: opts.lang || '' };
    // ASK ME FIRST: before anyone plans or builds, the Overseer asks what the team needs to know to meet the request (or the ticket
    // it is about), and the round waits for the customer's next message. "go" has the team work from the request as written.
    // Land on green skips this, and so does Simple mode, which has no such setting.
    if (opts.answers === undefined && !isSimple()) {
      let place = null;
      try {
        place = ctx.engine && ctx.engine.work ? await ctx.engine.work.state() : null;
      } catch {
        place = null;
      }
      ctx.teamSkills = (place && place.skills) || {};
      if (place && place.repo && (place.pending || (place.changed || []).length)) {
        ctx.post(
          'overseer',
          'An earlier change is still waiting. Say "land it" or "throw it away" first, then ask again.',
        );
        return;
      }
      // THE TEAM LOOKS BEFORE IT ASKS. With a workspace connected, Operations searches the code for what the request names and says
      // what it found. A question the code answers is then never put to the customer, and the builder starts from where the thing is.
      let found = '';
      ctx.looked = null;
      if (place && place.repo && ctx.engine.work.look) {
        const about =
          title +
          (ctx.state.focus
            ? ' It is about the ticket ' +
              ctx.state.focus.key +
              ': ' +
              ctx.state.focus.summary +
              (ctx.state.focus.description
                ? '. The ticket says: ' + String(ctx.state.focus.description).slice(0, 800)
                : '') +
              (ctx.state.focus.media ? ' ' + String(ctx.state.focus.media).slice(0, 700) : '')
            : '');
        ctx.busy('operations', 'Looking in ' + place.repo);
        try {
          found = String(((await ctx.engine.work.look(about)) || {}).found || '').trim();
        } catch {
          found = '';
        }
        ctx.busy('operations', '');
        if (found) {
          ctx.looked = { title, found };
          ctx.post(
            'operations',
            'I looked in ' + place.repo + ' before anyone asks you anything.\n' + found.slice(0, 700),
          );
        }
      }
      const knows = found
        ? ' The team has already looked in the code and found this: "' +
          found.slice(0, 700).replace(/"/g, "'") +
          '". Never ask for anything that answers.'
        : '';
      // THE QUESTIONS are the model's, and only real ones are kept: a line that ends in a question mark and is not a piece of what
      // it was told. THE SOURCE-CONTROL RECOMMENDATION is the team's own exact words, so the branch that is named is the branch
      // that is used. When there is nothing to ask and nothing for the customer to decide, the team says so and gets on with it.
      const adv = ctx.sourceAdvice(place, title);
      const shared = !!(
        place &&
        place.repo &&
        place.kind !== 'github' &&
        SHARED.test(place.current || place.branch || 'main')
      );
      const branchNow = place ? place.current || place.branch || '' : '';
      const raw = await ctx.quiet(
        'overseer',
        'A customer asked a software team for this: "' +
          title +
          '".' +
          (ctx.state.focus
            ? ' It is about the ticket ' +
              ctx.state.focus.key +
              ': ' +
              ctx.state.focus.summary +
              (ctx.state.focus.description
                ? '. The ticket says: ' + String(ctx.state.focus.description).slice(0, 800)
                : '') +
              (ctx.state.focus.media ? ' ' + String(ctx.state.focus.media).slice(0, 700) : '')
            : '') +
          knows +
          ' Could a competent developer build this and check it exactly as it is written, without asking the customer anything? Answer on the first line with one word: YES or NO. Only if NO: then at most three questions, one on each line, each ending with a question mark, about what the request leaves out and the result would be wrong without. Never ask for anything the request already states, and never about cases nobody mentioned.',
        { customer: title, lang: opts.lang || '', max: 120 },
      );
      const FILLER =
        /\b(non-?numeric|edge cases?|precision|rounding|overflow|input types?|data types?|what types?|which types?|types? (are|is|should|of)|error handling|invalid inputs?|what should (the |it |this )?(function |method )?return|negative numbers?|very large|python version|version requirement|(test|testing) framework|existing tests?|test (file|pattern|style)|naming convention|be named|validat(e|es|ion)|file structure|coding style|style guide|dependenc(y|ies))\b/i; // what a model asks when it has nothing to ask
      let questions = /^\W*(yes|none)\b/i.test(raw)
        ? []
        : raw
            .split('\n')
            .map((l) =>
              l
                .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '')
                .replace(/\*\*/g, '')
                .trim(),
            )
            .filter(
              (l) =>
                /\?$/.test(l) &&
                l.length > 12 &&
                l.length < 240 &&
                !/at most three|ask only|must ask|the request (does not|already|leaves)|write exactly|competent developer/i.test(
                  l,
                ) &&
                !FILLER.test(l),
            )
            .slice(0, 3);
      // EACH QUESTION IS WEIGHED BEFORE THE CUSTOMER SEES IT (the Steward's job: it checks what the team claims to need). A question
      // goes when the request already answers it, when the team can read the answer in the project itself, or when it is about a
      // case nobody raised. A plain keep-or-drop is what a small model does reliably; with no clear verdict the question is dropped.
      if (questions.length) {
        const v = await ctx.quiet(
          'steward',
          'A customer asked a software team for this: "' +
            title +
            '". ' +
            knows +
            ' A teammate wants to ask the customer these questions before building:\n' +
            questions.map((x, i) => i + 1 + '. ' + x).join('\n') +
            '\nFor each question write its number and one word, KEEP or DROP, one on each line. DROP it when the request already answers it, when the team can find the answer itself by reading the project (its files, its tests, its versions, its names, its style), or when it is about a case the customer never mentioned. KEEP it only when nobody but the customer can decide it.',
          { customer: title, max: 40, doing: 'Weighing the questions' },
        );
        const keep = new Set(
          [...v.matchAll(/(\d)\D{0,8}\b(KEEP|DROP)\b/gi)].filter((m) => /keep/i.test(m[2])).map((m) => Number(m[1])),
        );
        questions = questions.filter((_, i) => keep.has(i + 1));
      }
      // AN APP HAS TO RUN ON SOMETHING. A new app, site or game, with nothing in the request, the ticket or the project saying what it
      // runs on, is asked about first: a phone (iPhone, Android), a computer or a website are different builds, and guessing one is the
      // commonest way to build the wrong thing. Asked by the app itself, so that no model's reading of the request can leave it out;
      // not where a workspace is connected (the project there already says).
      const said =
        title +
        ' ' +
        (ctx.state.focus ? (ctx.state.focus.summary || '') + ' ' + (ctx.state.focus.description || '') : '');
      if (NEW_THING.test(said) && !PLATFORM.test(said) && !(place && place.repo))
        questions = [PLATFORM_ASK, ...questions.filter((q) => !PLATFORM.test(q))].slice(0, 3);
      const mine = { suggest: adv.offer, recommend: adv.recommend, pushes: adv.pushes, shared, on: branchNow };
      if (!questions.length && !adv.recommend) {
        // nothing to ask, and where it goes is already settled
        ctx.post('overseer', 'The request says enough to build from.' + (adv.says ? ' ' + adv.says : ''));
        const br = adv.named || '';
        const said = pushFrom(title);
        const pu = said === null && adv.pushes && br ? true : said;
        ctx.keepWays(mine, title, br, said);
        return round(title, { ...opts, answers: '', branch: br, push: pu, direct: directFrom(title) });
      }
      ctx.state.asking = { title, lang: opts.lang || '', at: Date.now(), ...mine };
      ctx.post(
        'overseer',
        (questions.length
          ? 'Before we build, ' +
            (questions.length === 1 ? 'one question' : questions.length + ' questions') +
            ':\n' +
            questions.map((x, i) => i + 1 + '. ' + x).join('\n') +
            '\n\n'
          : 'The request says enough to build from. ') +
          (adv.says ? adv.says + ' ' : '') +
          (questions.length
            ? 'Answer in one message, or say "go" to build it as it is written'
            : 'Say "go" to build it') +
          (adv.recommend ? ', the way I recommended' : '') +
          '.',
      );
      return;
    }
    ctx.state.work.unshift({
      id: 'W-' + ++ctx.state.n,
      title: short(title),
      stage: 'planned',
      proofId: null,
      at: Date.now(),
      talk: true,
    });
    ctx.emit('work'); // on record as talked through: nothing is built until a repo is connected
    const startedAt = Date.now();
    const visionBefore = ctx.visionShown;
    let seats = 4;
    const plan = ctx.engine ? await ctx.planFor(title, opts) : null;
    {
      let place = null;
      try {
        place = ctx.engine && ctx.engine.work && !isSimple() ? await ctx.engine.work.state() : null;
      } catch {
        place = null;
      }
      if (place && place.repo) {
        await ctx.speak(
          'overseer',
          brief +
            'The team works in ' +
            place.repo +
            ' next: Operations makes the change, the Steward proves it, and Master lands it. The requirements are already on the plan card above your words: never list them again. In at most two short sentences say what will be changed and the one check that will show it works. Do not hand out jobs, and do not ask anything.',
          { ...speakOpts, max: 60 },
        );
        const done = await ctx.build(title, { ...opts, plan });
        ctx.episode('build', title, startedAt, visionBefore, 4, done && done.kept);
        await ctx.afterBuild(title, done);
        return;
      }
    }
    await ctx.speak(
      'overseer',
      brief +
        'The requirements are already on the plan card above your words: never list them again. Give the plan in three short steps, naming which seat takes each, and name the one measure it should move.',
      speakOpts,
    );
    const judge = await ctx.speak(
      'steward',
      brief + 'Say which one behaviour your judge would pin first, and why it has to fail before anyone builds.',
      speakOpts,
    );
    await ctx.speak(
      'operations',
      brief + 'Say how you would build it against that judge, and the first thing you would check.',
      speakOpts,
    );
    if (UI_WORDS.test(title)) {
      seats = 5;
      await ctx.speak('ask', brief + 'Say what the person should see first, and one state you would check.', speakOpts);
    }
    await ctx.speak('master', brief + 'Say what you need to see before you would land it.', speakOpts);
    // HINDSIGHT: the team keeps what this round settled, so Vision can bring it back the next time something like it is asked
    const kept = !unsaid(judge)
      ? ctx.learn(
          'kept',
          'lesson',
          'Asked for "' + title + '". The judge to write first: ' + judge.split(/(?<=[.!?])\s/)[0].slice(0, 200),
          title,
        )
      : null;
    ctx.episode('build', title, startedAt, visionBefore, seats, kept);
    await ctx.afterBuild(title, await ctx.build(title, { ...opts, plan })); // and then the change itself, when there is a workspace to make it in; and what it left to open, or to put on a phone
  }

  Object.assign(ctx, { round });
}
