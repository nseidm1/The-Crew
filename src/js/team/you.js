// you.js - THE TEAM GETS TO KNOW THE PERSON. What someone says of themself in passing is kept, in their own words; a standing
// instruction ("always...", "from now on...") and a stated taste are kept as rulings; and all of it can be listed and forgotten.
import { isSimple } from '../mode.js';
import { STAYS } from './source.js';

export const STANDS =
  /^(please\s+)?(from now on|going forward|in future|as a rule|by default|always|never|don'?t ever|do not ever|remember( that)?|keep in mind|note that|call me|address me as|i('d| would)? prefer|we (always|never|only)|our rule|house rule)\b/i;

export const LATER = /\b(from now on|going forward|in future)\b/i;

export const TOPICS = [
  [/\b(call me|address me|my name is)\b/i, 'name'],
  [/\bbranch(es)?\b/i, 'branch'],
  [/\b(push|pushed|pushing|pull requests?)\b/i, 'push'],
  [/\b(sentences?|words|short|shorter|brief|concise|long|longer|detail(ed)?)\b/i, 'length'],
  [/\b(formal|casual|funny|serious|tone|polite)\b/i, 'tone'],
  [/\b(english|spanish|french|german|italian|portuguese|japanese|chinese|language)\b/i, 'language'],
];

export const standingIn = (text) => {
  const t = String(text || '').trim();
  if (/\?\s*$/.test(t) || t.split(/\s+/).length > 45 || !(STANDS.test(t) || LATER.test(t))) return null;
  const whole = STANDS.test(t) || !/[.!]\s+\S/.test(t); // the message is nothing but the instruction (it opens as one, or it is one sentence)
  const part = whole ? t : t.split(/[.!]\s+/).find((x) => LATER.test(x)) || '';
  const clauses = part
    .split(/\s*;\s*|,\s*and\s+|\s+and\s+(?=(?:always|never|keep|call|use|name|make|don'?t|do not|push|ask)\b)|[.!]\s+/)
    .map((c) =>
      c
        .replace(/^(please|and|also|then)\s+/i, '')
        .replace(/^(from now on|going forward|in future)[,:]?\s*/i, '')
        .replace(/[\s.!]+$/, '')
        .trim(),
    )
    .filter((c) => c.split(/\s+/).length >= 2);
  return clauses.length ? { whole, clauses } : null;
};

export const LIKES = [
  [/\btoo (formal|stiff|serious|dry)\b|\bless formal\b/i, 'tone', 'a lighter, more relaxed tone'],
  [/\btoo (jokey|silly|casual|chatty)\b/i, 'tone', 'a plainer, more serious tone'],
  [/\btoo (complicated|technical)\b/i, 'words', 'simpler words'],
  [/\b(funn(y|ier)|humou?r(ous)?|jok(e|es|ey)|playful|light-?hearted)\b/i, 'tone', 'a lighter, funnier tone'],
  [/\b(more formal|formal|professional|more serious)\b/i, 'tone', 'a more formal tone'],
  [/\b(warmer|friendlier|kinder|more personal)\b/i, 'tone', 'a warmer, more personal tone'],
  [/\b(firmer|more direct|stronger|blunter|more assertive)\b/i, 'tone', 'a firmer, more direct tone'],
  [/\b(shorter|more concise|briefer|less wordy|too long)\b/i, 'length', 'things kept shorter'],
  [/\b(longer|more detail(ed)?|too short)\b/i, 'length', 'things longer, with more detail'],
  [/\b(simpler|plainer|easier to read)\b/i, 'words', 'simpler words'],
];

export const wishIn = (text) =>
  ((/\b(make|can you|could you|please|i(')?d like|i want)\b/i.test(text) && /\b(it|that|this|them)\b/i.test(text)) ||
  (/\btoo (long|short|wordy|formal|stiff|serious|dry|jokey|silly|casual|chatty|complicated|technical)\b/i.test(text) &&
    String(text).split(/\s+/).length <= 16)
    ? LIKES.find(([re]) => re.test(text))
    : null) || null;

// GETTING TO KNOW THE PERSON (Hindsight, on their own words). After the team has answered, a message in which the person says something
// of themself is read once more, quietly: does it tell the team anything LASTING about who they are, what they like, or how they want
// to be answered? What is found is kept as "about you" and is in front of every seat from then on. Nothing is kept that they did not
// say: at least half the words of a line must be words of their message. The same thing said again, or put differently, replaces the
// earlier wording; at most 24 are kept. A message that says nothing of the person is never read twice (no model is asked).
export const SELF =
  /\b(i am|i'm|i've|i have|i live|i work|i like|i love|i hate|i prefer|i need|i can't|i cannot|i don't|i do not|i usually|i always|i never|my|we are|we're|we have|we live|we like|we love|we prefer|we always|we never|our)\b|\b(me llamo|soy|vivo en|mi|mis|je suis|j'habite|mon|ma|mes|ich bin|ich wohne|mein|meine)\b/i;

export function installYou(ctx) {
  // ABOUT YOU: what the team has learned about the person from things they said (kind 'you' in the same ledger as every lesson, so it
  // is listed under Soul and graded by Hindsight). The newest eight are in front of every seat before it speaks: see speak() and notice().
  const YOU_DULL = new Set([
    'they',
    'their',
    'them',
    'this',
    'that',
    'person',
    'customer',
    'want',
    'wants',
    'like',
    'likes',
    'prefer',
    'prefers',
    'have',
    'with',
    'from',
    'when',
    'called',
    'named',
    'things',
    'answers',
    'answer',
    'team',
    'would',
    'should',
    'about',
    'what',
    'forget',
  ]);

  const youWords = (t) =>
    (
      String(t || '')
        .toLowerCase()
        .match(/[a-zà-ÿ0-9]{4,}/g) || []
    )
      .filter((w) => !YOU_DULL.has(w))
      .map((w) => w.replace(/(ies|es|s|ing|ed)$/, '').slice(0, 7));

  const youKnown = () =>
    (ctx.soulKeeps == null ? ctx.state.learning.ledger : ctx.state.learning.ledger.slice(0, ctx.soulKeeps))
      .filter((x) => x.kind === 'you')
      .slice(0, 8);

  const keepStanding = (found) =>
    found.clauses.map((c) => {
      const text = c[0].toUpperCase() + c.slice(1) + '.';
      const topic = (TOPICS.find(([re]) => re.test(c)) || [])[1];
      const w = ctx.waysNow();
      if (/^(remember|keep in mind|note that)\b/i.test(c)) {
        const fact = text.replace(/^(Remember( that)?|Keep in mind( that)?|Note that)\s+/i, '');
        ctx.learn('kept', 'told', 'The customer told the team: ' + fact, 'told');
        return { told: fact };
      }
      ctx.rule(topic ? 'standing-' + topic : 'standing', text);
      if (topic === 'branch') {
        const pre = /\b([a-z][a-z0-9-]{1,20})\/(?=[<\[{(A-Za-z])/.exec(c);
        if (pre) ctx.state.branchPrefix = pre[1];
        if (/\b(ticket|key|issue|number)\b/i.test(c)) ctx.state.branchKeyed = true;
        if (STAYS.test(c)) w.stay += 2;
        else if (
          /\b(never|not|don'?t)\b[^.]*\b(main|master|trunk|shared)\b|\bevery (change|fix|feature|branch)\b|\balways\b[^.]*\bbranch\b|\bname\b[^.]*\bbranch/i.test(
            c,
          )
        )
          w.branch += 2;
      }
      if (/\bpush/i.test(c)) {
        if (/\b(never|don'?t|do not|without asking|ask (me )?(first|before))\b/i.test(c)) w.local += 2;
        else if (/\balways\b/i.test(c)) w.push += 2;
      }
      return text;
    });

  // a wish about how things are written is kept as theirs wherever it is said: after a piece ("make it funnier") or about an answer ("that was too long")
  const keepWish = (text) => {
    const wish = wishIn(text);
    if (!wish) return null;
    const now = ctx.state.rulings.find((r) => r.kind === 'likes-' + wish[1] && !r.superseded);
    if (now && Date.now() - now.at < 20000 && now.text.includes(wish[2])) return wish;
    ctx.rule(
      'likes-' + wish[1],
      'This person likes ' +
        wish[2] +
        ' in what the team writes for them. Do that from the start, unless they say otherwise.',
    );
    ctx.learn(
      'kept',
      'lesson',
      'How this person likes things: ' +
        wish[2] +
        '. They asked for it after seeing a piece: "' +
        String(text).replace(/\s+/g, ' ').trim().slice(0, 80) +
        '".',
      'how this person likes things',
    );
    return wish;
  };

  async function notice(body) {
    if (!ctx.engine || body.split(/\s+/).length < 4 || body.length > 700 || !SELF.test(body)) return [];
    const raw = await ctx.quiet(
      'overseer',
      (isSimple() ? 'The person the team helps' : "The team's customer") +
        ' just wrote this in the chat:\n\n"' +
        body +
        '"\n\nDoes it tell the team anything LASTING about them? Three kinds of thing count: WHO they are (their name, where they live, their family, their work, what they eat or cannot), what they LIKE, and how they WANT the team to work with them or to answer them. Something that is only about this one request does not count, and neither does anything you would have to guess.\n' +
        'Reply with at most two lines and nothing else, each starting WHO:, LIKES: or WANTS:, then one short sentence of at most 14 words that starts with "They". If there is nothing lasting, reply with the one word NONE.',
      { doing: isSimple() ? 'Getting to know you' : 'Keeping what it learned about you', max: 90, customer: body },
    );
    const mine = new Set(youWords(body));
    const kept = [];
    for (const line of String(raw).split('\n')) {
      const m = /^\s*[-*]?\s*\**(WHO|LIKES|WANTS)\**\s*:\s*(.+?)\s*$/i.exec(line);
      if (!m) continue;
      const text = m[2]
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 140);
      const ws = youWords(text);
      if (!/^They\b/i.test(text) || !ws.length) continue;
      if (ws.filter((w) => mine.has(w)).length * 2 < ws.length) continue; // not their own words: not kept
      const old = ctx.state.learning.ledger.find((x) => {
        if (x.kind !== 'you') return false;
        const a = youWords(x.text);
        const n = a.filter((w) => ws.includes(w)).length;
        return n * 10 >= Math.min(a.length, ws.length) * 7;
      });
      if (old) {
        if (old.text !== text) old.was = [...(old.was || []), old.text].slice(-3); // the earlier wording is kept beside the new one
        old.text = text;
        old.at = Date.now();
        kept.push(old);
        continue;
      }
      const x = ctx.learn('kept', 'you', text, body.replace(/\s+/g, ' ').slice(0, 80));
      x.sort = m[1].toLowerCase();
      kept.push(x);
    }
    const all = ctx.state.learning.ledger.filter((x) => x.kind === 'you');
    if (all.length > 24) {
      const drop = new Set(all.slice(24));
      ctx.state.learning.ledger = ctx.state.learning.ledger.filter((x) => !drop.has(x));
    }
    if (kept.length) ctx.emit('learning');
    return kept;
  }

  // WHAT DO YOU KNOW ABOUT ME? and FORGET THAT. What is kept about a person is theirs to see and to remove, in the chat itself, in
  // either mode; no model is asked. (In Developer it is also listed under Soul, each with a Forget button.)
  const aboutMe = (body) => {
    const facts = ctx.state.learning.ledger.filter((x) => x.kind === 'you');
    const wishes = ctx.state.rulings.filter((r) => !r.superseded && /^(standing|likes)/.test(r.kind));
    if (
      /\bwhat (do|did|have) (you|y'all|the team)( all| guys)? (know|remember|learned?|picked up|got|kept)\b.{0,14}\b(about|on) me\b/i.test(
        body,
      )
    ) {
      ctx.post(
        'overseer',
        facts.length || wishes.length
          ? (isSimple()
              ? "Here's what we've picked up about you so far:"
              : 'What the team has learned about you, and what you have asked of it:') +
              '\n' +
              [
                ...facts.map(
                  (x) =>
                    '- ' + x.text + (x.was && x.was.length ? ' (before that: ' + x.was[x.was.length - 1] + ')' : ''),
                ),
                ...wishes.map((r) => '- You asked: ' + r.text),
                ...ctx.state.rulings
                  .filter((r) => r.superseded && /^(standing|likes)/.test(r.kind))
                  .slice(0, 3)
                  .map((r) => '- Before that you had asked: ' + r.text + ' (no longer in force)'),
              ].join('\n') +
              '\n' +
              (isSimple()
                ? 'If any of it is wrong, say "forget that ..." and it\'s gone. "Forget everything about me" clears the lot.'
                : 'Say "forget that ..." to drop one, or "forget everything about me". It is all under Soul.')
          : isSimple()
            ? 'Nothing yet, honestly. We pick things up as you tell us about yourself, and use them to fit our answers to you.'
            : 'Nothing yet. The team keeps what you tell it about yourself and how you like to work, and every seat is shown it.',
      );
      return true;
    }
    if (
      /^(please\s+)?forget (everything|all of (it|that)|it all|all)( (that )?you (know|have|learned|kept))?( about me)?[.!\s]*$/i.test(
        body,
      )
    ) {
      ctx.state.learning.ledger = ctx.state.learning.ledger.filter((x) => x.kind !== 'you');
      ctx.emit('learning');
      ctx.post(
        'overseer',
        facts.length
          ? (isSimple()
              ? "Done. Everything we'd picked up about you is gone."
              : 'Done: the ' + facts.length + ' things the team had learned about you are removed.') +
              (wishes.length ? ' What you asked us to always do still stands.' : '')
          : 'There was nothing kept about you to forget.',
      );
      return true;
    }
    const one = /^(please\s+)?forget (?:that |about )?(.{3,90}?)[.!\s]*$/i.exec(body);
    if (one && facts.length) {
      const want = youWords(one[2]);
      const hit = facts.filter((x) => {
        const a = youWords(x.text);
        return want.length > 0 && want.filter((w) => a.includes(w)).length * 2 >= want.length;
      });
      if (hit.length) {
        const gone = new Set(hit);
        ctx.state.learning.ledger = ctx.state.learning.ledger.filter((x) => !gone.has(x));
        ctx.emit('learning');
        ctx.post('overseer', (isSimple() ? 'Forgotten: ' : 'Removed: ') + hit.map((x) => x.text).join(' '));
        return true;
      }
    }
    return false;
  };

  Object.assign(ctx, { youKnown, youWords, keepWish, aboutMe, keepStanding, notice });
}
