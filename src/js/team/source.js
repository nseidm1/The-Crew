// source.js - WHERE A CHANGE GOES. The branch a request names or the team suggests, whether it is pushed, whether it lands straight on
// the default branch; what the customer has said about that before; and landing or throwing away a waiting change at their word.
import { isSimple } from '../mode.js';

// A REQUEST FOR A CHANGE: a round of the table. Each seat says, in its own words, what it would do with it.
// THE CHANGE ITSELF. Once the table has talked a request through, and a workspace is connected, the team makes the change in its
// own copy of the repository, proves it (failing on the code before, passing on the code after), and then does what was chosen:
//   Ask me first    the change waits on the Workspace page for the customer's yes
//   Land on green   a change that is proven is landed the way the Workspace says; one that is not proven waits, and the team says why
// With no workspace, or an earlier change still waiting there, nothing is built and the Overseer says so. Simple mode builds
// nothing: it has no workspace page.
// A BRANCH NAME, from what the customer said. Only a plain statement counts: "no branch" or "the current branch" means none; a
// name is a word after "branch" that looks like one (it has a slash, a dash or an underscore); and "yes, a new branch" takes the
// name that was offered. Anything less clear is no branch, and the change goes where their checkout is.
export const branchFrom = (text, offered) => {
  const t = String(text || '');
  if (/\b(no (new )?branch|current branch|same branch|this branch|stay on)\b/i.test(t)) return '';
  const m = /\bbranch(?:\s+(?:called|named|name|is))?\s*[:=]?\s*["'\x60]?([A-Za-z0-9][\w./-]{2,80})/i.exec(t);
  const name = m ? m[1].replace(/[.,;:]+$/, '') : '';
  if (name && /[/_-]/.test(name)) return name;
  return offered && /\b(yes|yep|sure|ok(ay)?)\b[^.]*\bbranch\b|\bnew branch\b|\buse (that|the) (name|branch)\b/i.test(t)
    ? offered
    : '';
};

// PUSHED, OR NOT, from what the customer said: true, false, or null when they did not say. And a straight commit to GitHub's
// default branch, which only a plain statement asks for. Neither is ever a setting: it is said with the request, in the answer to
// the team's questions, or when a waiting change is landed.
export const pushFrom = (text) => {
  const t = String(text || '');
  if (
    /\b(do not|don't|dont|no|not|without|never)\s+(be\s+)?push|\bkeep it (local|here|on this machine)|\bnothing (is |gets )?pushed/i.test(
      t,
    )
  )
    return false;
  return /\bpush(ed|ing)?\b|\b(pull|merge) request\b|\b(PR|MR)\b/.test(t) ? true : null;
};

export const directFrom = (text) =>
  /\b(commit|push|land)( it)? (straight|directly|direct)\b|\bdirect commit\b|\b(no|without a) pull request\b|\bstraight (to|onto) (main|master|the default)/i.test(
    String(text || ''),
  );

export const landedSays = (done, how) =>
  done.how === 'pr'
    ? 'a pull request is open' + (done.url ? ' at ' + done.url : '')
    : done.how === 'commit'
      ? 'committed onto ' +
        done.branch +
        ' in your folder, not pushed' +
        (how && how.push ? '. I do not push the branch you have checked out: name a branch and I will push that' : '')
      : done.how === 'branch'
        ? (done.fell ? done.why + ' ' : '') +
          'the branch ' +
          done.branch +
          ' is in your folder' +
          (done.pushed
            ? ' and pushed' + (done.url ? '. A request for it is opened at ' + done.url : '')
            : how && how.push && done.why && !done.fell
              ? ', but it was not pushed: ' + done.why
              : '') +
          (done.pushed
            ? ''
            : '. It is not on ' +
              (done.base || 'the branch you have checked out') +
              ' yet: merge it when you are ready')
        : 'committed to ' + done.branch + ' and pushed';

// A CHANGE IS WAITING, and what happens to it is said here: "land it" (with a branch name, "and push it", "as a pull request",
// "straight to main") or "throw it away". With nothing waiting, the same words are an ordinary message.
export const SETTLES =
  /^(?:(?:ok(?:ay)?|yes|sure|please|go ahead and)[,.! ]+)*(?:land|ship|commit|merge|push|open a (?:pull|merge) request|throw|discard|drop)\b.{0,120}$/i;

export const SHARED = /^(main|master|trunk|develop|development|dev|staging|stage|production|prod|release([/-].+)?)$/i;

export const STAYS = /\b(no (new )?branch|current branch|same branch|this branch|stay on)\b/i;

export function installSource(ctx) {
  async function settle(text) {
    if (!ctx.engine || !ctx.engine.work || isSimple()) return false;
    const workspace = await ctx.engine.work.state();
    if (!workspace || !workspace.repo || !(workspace.pending || (workspace.changed || []).length)) return false;
    if (/\b(throw|discard|drop)\b/i.test(text)) {
      if (!ctx.engine.work.discard) return false;
      const what = (workspace.pending && workspace.pending.task) || 'the change that was waiting';
      await ctx.engine.work.discard();
      ctx.planEnd('thrown', 'Thrown away at your word. Nothing left this machine.');
      ctx.post('master', 'Thrown away. Nothing left this machine.');
      ctx.learn(
        'kept',
        'lesson',
        'Thrown away in ' +
          workspace.repo +
          ', at the customer\'s word: "' +
          String(what).slice(0, 90) +
          '". It is not in the code.',
        what,
      );
      return true;
    }
    const branch = branchFrom(text, '');
    const push = pushFrom(text);
    const how = { ...(push === null ? {} : { push }), ...(directFrom(text) ? { direct: true } : {}) };
    if (branch) {
      ctx.state.branchNames = [branch, ...(ctx.state.branchNames || []).filter((n) => n !== branch)].slice(0, 12);
      ctx.emit('work');
    }
    ctx.busy('master', 'Landing it');
    try {
      const done = await ctx.engine.work.land(branch, how);
      const what = (workspace.pending && workspace.pending.task) || 'the change that was waiting';
      ctx.planEnd('landed', 'Landed at your word: ' + landedSays(done, how) + '.');
      ctx.post('master', 'Landed: ' + landedSays(done, how) + '.');
      ctx.learn(
        'kept',
        'lesson',
        'Landed in ' + workspace.repo + ', "' + String(what).slice(0, 90) + '": ' + landedSays(done, how) + '.',
        what,
      );
    } catch (e) {
      ctx.post('master', '[It could not be landed: ' + String((e && e.message) || e).slice(0, 200) + ']');
    }
    ctx.busy('master', '');
    return true;
  }

  // SOURCE CONTROL, THE WAY A DEVELOPMENT TEAM DOES IT. Nothing here is a setting: the team looks at what is checked out, recommends,
  // and learns from what the customer then chooses.
  //   a shared branch (main, master, develop, a release branch): work never goes straight onto it. A new branch is recommended, named
  //     the way this customer names theirs, or by the usual convention when they have none yet: feature/ for something new, bugfix/
  //     for something broken, with the ticket's key when there is one. On main or master in a repository that has a develop branch,
  //     it says so: that is usually where work starts.
  //   a working branch: the change belongs there, and a new branch is only offered.
  //   GitHub: a pull request from a branch, so nothing reaches the default branch unreviewed.
  //   nothing is pushed unless the customer asks.
  // WHAT IT LEARNS (s.ways, and a lesson in the Soul each time the practice is first seen or changes): whether this customer takes the
  // branch or stays on the shared one, and whether they want branches pushed. Twice the same way, and more often than the other, and
  // the recommendation follows them: it says what they did before and does that unless told otherwise.
  const DULL = new Set([
    'a',
    'an',
    'the',
    'to',
    'that',
    'of',
    'in',
    'on',
    'for',
    'with',
    'and',
    'it',
    'its',
    'is',
    'be',
    'this',
    'please',
    'should',
    'which',
    'so',
    'from',
    'into',
    'at',
    'as',
    'by',
    'returns',
    'return',
  ]);

  const branchSlug = (t) => {
    const out = [];
    for (const w of String(t || '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []) {
      if (DULL.has(w)) continue;
      if (out.join('-').length + w.length > 38 || out.length >= 5) break;
      out.push(w);
    }
    return out.join('-') || 'change';
  }; // whole words, never cut in the middle of one

  const waysNow = () => ctx.state.ways || (ctx.state.ways = { branch: 0, stay: 0, push: 0, local: 0, said: '' });

  const sourceAdvice = (place, title) => {
    if (!place || !place.repo) return { offer: '', recommend: false, pushes: false, says: '' };
    const offer = suggestBranch(title, place.branches);
    const ways = waysNow();
    const pushes = !!place.hasOrigin && ways.push >= 2 && ways.push > ways.local;
    const named = branchFrom(title, '');
    const stays = !named && STAYS.test(title); // named, stays: the request itself says where it goes
    if (place.kind === 'github')
      return {
        offer: named || offer,
        named,
        recommend: !named,
        pushes: false,
        says: named
          ? 'It comes back as a pull request from the branch you named, ' + named + '.'
          : 'It comes back as a pull request from a branch I would call ' +
            offer +
            ', so nothing reaches ' +
            (place.base || 'the default branch') +
            ' until it is reviewed and merged. Tell me if you want another name.',
      };
    const branchNow = place.current || place.branch || '';
    const shared = !branchNow || SHARED.test(branchNow);
    const dev = (place.branches || []).find((b) => /^(develop|development|dev)$/i.test(b));
    const push = !place.hasOrigin
      ? ''
      : pushes
        ? ' I will push the branch, as you have asked before: say so if not this time.'
        : ' Nothing is pushed unless you ask.';
    if (named)
      return {
        offer: named,
        named,
        recommend: false,
        pushes,
        says: 'It goes on the branch you named, ' + named + '.' + push,
      };
    if (stays)
      return {
        offer,
        stays: true,
        recommend: false,
        pushes: false,
        says: 'You said to stay on ' + (branchNow || 'the branch you have checked out') + ', so it goes there.',
      };
    if (shared && ways.stay >= 2 && ways.stay > ways.branch)
      return {
        offer,
        recommend: false,
        pushes: false,
        says:
          'You have ' +
          branchNow +
          ' checked out. You have kept your changes on it before, so this one goes there too. Say so if you want a branch this time: I would call it ' +
          offer +
          '.',
      };
    if (shared)
      return {
        offer,
        recommend: true,
        pushes,
        says:
          'You have ' +
          (branchNow || 'a shared branch') +
          ' checked out, which is a shared branch, so I recommend a new branch for this: ' +
          offer +
          '.' +
          (dev && branchNow && !/^dev/i.test(branchNow)
            ? ' This repository also has ' + dev + ': if work starts from there, check it out first.'
            : '') +
          ' Say yes, give another name, or say to stay on ' +
          (branchNow || 'it') +
          '.' +
          push,
      };
    return {
      offer,
      recommend: false,
      pushes,
      says:
        'You have ' +
        branchNow +
        ' checked out, a working branch, so the change goes there. Say so if you want a new branch instead: I would call it ' +
        offer +
        '.' +
        (pushes ? push : ''),
    };
  };

  // what the customer chose, kept: counted for the next recommendation, and written to the Soul when it is new or has changed
  const keepWays = (was, text, branch, push) => {
    if (!was.suggest) return;
    const w = waysNow();
    const told = [];
    if (was.shared) {
      if (branch) {
        w.branch++;
        told.push('works on a branch for each change' + (/[/]/.test(branch) ? ', named like ' + branch : ''));
      } else if (STAYS.test(text)) {
        w.stay++;
        told.push('keeps changes on ' + (was.on || 'the shared branch') + ' rather than taking a new branch');
      }
    }
    if (branch && push === true) {
      w.push++;
      told.push('wants a branch pushed');
    } else if (branch && push === false) {
      w.local++;
      told.push('wants a branch kept on this machine');
    }
    const said = told.join(', and ');
    if (said && said !== w.said) {
      w.said = said;
      ctx.learn('kept', 'lesson', 'Source control, as this customer does it: ' + said + '.', 'source control');
    }
    ctx.emit('work');
  };

  // A NAME TO OFFER, in this customer's own style: the prefix their branches most often carry ("feature/"), a ticket's key when their
  // names carry keys, then a few words of what it is. Names they gave here before count first, then the repository's own branches.
  const suggestBranch = (title, names) => {
    const seen = [...(ctx.state.branchNames || []), ...(names || [])].filter(
      (n) => n && !/^familyoffice\//.test(n) && !SHARED.test(n),
    );
    const tally = {};
    const usual =
      /\b(fix(es|ed)?|bug|broken|crash(es)?|errors?|regression|fails?|wrong)\b/i.test(title) ||
      (ctx.state.focus && /bug|defect/i.test(ctx.state.focus.type || ''))
        ? 'bugfix/'
        : 'feature/';
    for (const n of seen) {
      const i = n.indexOf('/');
      if (i > 0) tally[n.slice(0, i)] = (tally[n.slice(0, i)] || 0) + 1;
    }
    // a ruling about branch names comes first: the prefix the customer said, and the ticket's key when they said names carry one
    const key = ctx.state.focus ? ctx.state.focus.key : (/\b([A-Z][A-Z0-9]+-\d+)\b/.exec(title) || [])[1] || '';
    const best = ctx.state.branchPrefix
      ? [ctx.state.branchPrefix]
      : Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const keyed =
      !!key &&
      (ctx.state.branchKeyed ||
        (ctx.state.focus && (!seen.length || seen.some((n) => /[A-Za-z][A-Za-z0-9]+-\d+/.test(n)))));
    return (
      (best ? best[0] + '/' : seen.length ? '' : usual) +
      (keyed ? key + '-' : '') +
      branchSlug(
        ctx.state.focus
          ? ctx.state.focus.summary
          : title.replace(
              /^\s*(please\s+)?(address|fix|do|implement|resolve|handle)\s+[A-Z][A-Z0-9]+-\d+\s*:?\s*/i,
              '',
            ),
      )
    );
  };

  Object.assign(ctx, { waysNow, sourceAdvice, keepWays, settle });
}
