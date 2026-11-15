// thread.js - ONE OF THE FIVE SETS ANOTHER GOING. In a group chat, what one person says changes what another does next. Robin says
// "those two films are guesses for now", and Sam, whose card it was, says "good catch, let me get you a proper one" and goes and
// gets it. Until now each of the five spoke once and that was that: a doubt was raised and left lying in the chat.
// What a teammate adds to an answer is read (no model is asked) as one of three things:
//   adds       a tip, a warning, the short version: nothing more is needed
//   doubts     it questions whether the answer is true ("that's a guess", "I'd check that", "it may have changed")
//   corrects   it says the answer is wrong, and how ("actually, it is the Tuesday one")
// A doubt, where the team can look things up, is TAKEN UP: the one who answered says so in a line and the team looks it up; what
// comes back is the answer now, and the first one is marked as replaced. A correction, or a doubt where nothing can be looked
// up, is taken up by the one who answered saying it again, put right, and saying first what changed.
// It is the same in both modes, in each one's own words. In Developer a doubt about the customer's OWN system is not looked up on
// the web (that is asked for, not searched for): the answer is given again, saying what is known and what would have to be seen.
// ONCE FOR EACH THING THE PERSON SAYS. What comes back is not doubted again and nobody is asked to add to it, or two of the five
// could set each other going for ever.
import { isSimple } from '../mode.js';
import { seatAs } from './base.js';

export const DOUBTS =
  /\b(guess(es|ed|ing)?|not sure|unsure|i'?d (check|verify|confirm|double-?check)|i would (check|verify|confirm)|double-?check|just check|(might|may) (not )?(be|have)|may have changed|out of date|can'?t (confirm|be sure)|could ?n'?t (confirm|pull|find|settle)|did ?n'?t (confirm|check|find)|before you rely|until (you|we) (check|know|confirm)|for now|rests on one|only one source|sources? (disagree|differ)|unverified|no way to tell)\b/i;
export const CORRECTS =
  /\b(actually|in fact|that'?s not (right|quite right|correct)|that is not (right|correct)|isn'?t (right|correct)|not quite right|one correction|correction:|it'?s the other|wrong (way|one|day|number)|mixed up)\b/i;
// the fact-checker is ASKED to name a claim it would check after every lookup, so "I'd check" there is its job and not a doubt:
// only these, which say the answer may be wrong, set the team going again
export const STRONG =
  /\b(guess(es|ed|ing)?|rests on one|only one source|single source|sources? (disagree|differ|conflict)|contradict\w*|does ?n'?t match|not confirmed|could ?n'?t confirm|unverified|out of date|may have changed|is wrong|looks wrong)\b/i;
const THEIRS =
  /\b(our|ours|my|we|us|last night'?s?|this morning'?s?|yesterday'?s?|the (deploy|deployment|outage|incident|build|pipeline|release|server|database|logs?))\b/i;

export const readAdded = (text) => (CORRECTS.test(text) ? 'corrects' : DOUBTS.test(text) ? 'doubts' : 'adds');

// what to search for: what was asked, and the names and numbers in the doubt that were not in it
export const focusOf = (asked, doubt) => {
  const had = String(asked).toLowerCase();
  const extra = [...new Set(String(doubt).match(/\b(?:[A-Z][a-z]{2,}|\d[\d.:/-]*\d|\d+)\b/g) || [])].filter(
    (w) =>
      !had.includes(w.toLowerCase()) &&
      !/^(Just|Also|You|The|That|Those|These|There|One|Check|Wait|But|And|If|It)$/.test(w),
  );
  return (String(asked).replace(/[?.!]+$/, '') + (extra.length ? ' ' + extra.slice(0, 5).join(' ') : '')).slice(0, 160);
};

export function installThread(ctx) {
  const lastSaid = () => {
    for (let i = ctx.state.chat.length - 1; i >= 0; i--)
      if (ctx.state.chat[i].by === 'you') return ctx.state.chat[i].id;
    return '';
  };

  // lead: who answered. asked: what the person asked. said: the answer. added: [{ by, text }], what the others then said.
  // -> 'looked' | 'again' | '' (nothing was taken up)
  async function takeUp(lead, asked, said, added, opts = {}) {
    const about = lastSaid();
    if (!about || ctx.state.tookUp === about || !ctx.seat(lead)) return '';
    const hit = (added || [])
      .map((a) => ({ ...a, kind: readAdded(a.text) }))
      .find(
        (a) => a.kind !== 'adds' && a.by !== lead && (!opts.strong || a.kind === 'corrects' || STRONG.test(a.text)),
      );
    if (!hit) return '';
    ctx.state.tookUp = about; // once for each thing the person says
    ctx.fault(lead, 'replaced', hit.text);
    const simple = isSimple();
    const who = seatAs(ctx.seat(hit.by)).title;
    const mine = [...ctx.state.chat].reverse().find((m) => m.by === lead && !m.thread && m.text);
    const canLook = !!(ctx.engine && (ctx.engine.tool || ctx.onClaude()));
    const look = hit.kind === 'doubts' && canLook && !(!simple && THEIRS.test(asked));
    ctx.state.threadTrace = { by: hit.by, kind: hit.kind, did: look ? 'looked' : 'again' };
    if (mine) {
      mine.superseded = true; // what replaces it is below
      ctx.emit('chat');
    }
    if (look) {
      ctx.post(
        lead,
        simple
          ? 'Good catch, ' + who + '. Let me look that up properly and get you an updated answer.'
          : (hit.by === 'steward' ? 'The Steward' : who) + ' is right to ask. Checking it now.',
        { thread: 'took' },
      );
      await ctx.research(asked, [simple ? 'operations' : lead], {
        ...opts,
        query: focusOf(asked, hit.text),
        because: hit.text,
      });
      return 'looked';
    }
    const again = await ctx.speak(
      lead,
      (simple ? 'The person asked: "' : 'The customer asked: "') +
        String(asked).slice(0, 500) +
        '". You answered: "' +
        String(said).slice(0, 700) +
        '". Then ' +
        who +
        ' said: "' +
        String(hit.text).slice(0, 300) +
        '".\n\nGive your answer again, put right. Open by saying in a few words what changes, to ' +
        who +
        ' by name ("' +
        who +
        '\'s right: ..."). Then the answer as it now stands. If part of it still cannot be known from here, say exactly which part, and how ' +
        (simple ? 'they' : 'the customer') +
        ' can find it out. Do not say the first answer again.',
      { mode: 'answer', customer: asked, about: asked, lang: opts.lang || '', max: 320, veil: simple },
    );
    const now = [...ctx.state.chat].reverse().find((m) => m.by === lead);
    if (now) now.thread = 'again';
    if (simple && ctx.cardFor) await ctx.cardFor(lead, again, asked, opts.lang).catch(() => {});
    for (const m of ctx.state.chat) if (m.veil && !m.live) delete m.veil;
    ctx.emit('chat');
    return 'again';
  }

  // A MARK, NOT A LINE. A teammate who only agrees, or who has checked an answer and found it right, does not write to say so: it
  // leaves a mark on the answer, the way people do in a group chat. One mark from each of the five on any one message.
  const react = (msg, by, mark) => {
    if (!msg || !ctx.seat(by) || msg.by === by) return;
    const had = (msg.reactions || []).filter((r) => r.by !== by);
    msg.reactions = [...had, { by, mark }].slice(0, 4);
    msg.xrev = (msg.xrev || 0) + 1;
    ctx.emit('chat');
  };

  Object.assign(ctx, { takeUp, react });
}
