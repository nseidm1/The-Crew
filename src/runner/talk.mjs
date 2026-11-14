// talk.mjs - what keeps a seat's reply a reply, and what decides what kind of message the customer sent. No model is needed for any of
// it: these are the checks around the model.
//   scriptOf(text)        the writing system a piece of text is mostly in (latin, han, cyrillic, ...), '' when it has too few letters
//   languageLine(text)    the instruction that keeps a seat in the customer's language
//   guard({ expect })     watches a reply as it streams and says when it has BROKEN DOWN: the same few characters over and over (a
//                         small model's loop), or a slide into a writing system the customer did not use. feed(piece) returns null
//                         while the reply is sound, or { kind, keep, unit } where keep is how much of the reply was still sound
//                         and unit is the piece it was repeating.
//   guessRoute(text)      what kind of message this is, by its own words: talk, question, research, qa or build, the seat whose
//                         job it is, and the page or app it names. sure: false when the words do not settle it (then the model is asked)
//   ROUTE_ASK / parseRoute   the one-line question put to the model for that, and how its answer is read
const SCRIPTS = [
  ['han', /\p{Script=Han}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
  ['greek', /\p{Script=Greek}/u],
  ['latin', /\p{Script=Latin}/u],
];
const scriptOfChar = (c) => {
  for (const [name, re] of SCRIPTS) if (re.test(c)) return name;
  return '';
};
export function scriptOf(text) {
  const n = {};
  let all = 0;
  for (const c of String(text || '')) {
    const s = scriptOfChar(c);
    if (s) {
      n[s] = (n[s] || 0) + 1;
      all++;
    }
  }
  if (all < 2) return '';
  const [top, count] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top === 'kana' || (top === 'han' && n.kana) ? 'kana' : count * 2 >= all ? top : ''; // Japanese mixes kana and han: kana settles it
}
const NAMES = {
  han: 'Chinese',
  kana: 'Japanese',
  hangul: 'Korean',
  cyrillic: "the customer's language (written in Cyrillic)",
  arabic: "the customer's language (written in Arabic script)",
  hebrew: 'Hebrew',
  devanagari: "the customer's language (written in Devanagari)",
  thai: 'Thai',
  greek: 'Greek',
};
export function languageLine(customer, named) {
  const s = scriptOf(customer);
  const lang = /^[A-Za-z][A-Za-z ]{1,24}$/.test(String(named || '').trim())
    ? String(named).trim()
    : s === 'latin'
      ? ''
      : NAMES[s] || '';
  return (
    'LANGUAGE: reply in ' +
    (lang || 'the same language the customer wrote in') +
    ', and only in it. Do not switch language or writing system part-way, and do not repeat yourself.'
  );
}

export function guard({ expect = '' } = {}) {
  let text = '';
  let checked = 0;
  const looped = () => {
    // the reply ends in one short piece said again and again
    const end = text.length;
    for (let L = 1; L <= 60 && L * 4 <= end; L++) {
      const unit = text.slice(end - L);
      if (!/[\p{L}\p{N}]/u.test(unit)) continue;
      let k = 1;
      while (end - L * (k + 1) >= 0 && text.slice(end - L * (k + 1), end - L * k) === unit) k++;
      if (L * k >= 24 && k >= (L <= 3 ? 10 : L <= 12 ? 6 : 4)) {
        let at = end - L * k;
        while (at > 0 && text[at - 1] === text[at - 1 + L]) at--;
        return { at, unit: text.slice(at, at + L) };
      } // walked back to where the repeating really began, so the piece is named from its own start
    }
    return null;
  };
  const strayed = () => {
    // the last stretch is in a writing system the customer did not use (latin inside another script is fine: names, code)
    if (!expect) return -1;
    let foreign = 0;
    let letters = 0;
    let from = -1;
    const chars = [...text];
    let at = text.length;
    for (let i = chars.length - 1; i >= 0 && letters < 24; i--) {
      at -= chars[i].length;
      const s = scriptOfChar(chars[i]);
      if (!s) continue;
      letters++;
      const kin = s === expect || (expect === 'kana' && s === 'han');
      if (!kin && s !== 'latin') {
        foreign++;
        from = at;
      }
    }
    return letters >= 12 && foreign * 3 >= letters * 2 ? from : -1;
  };
  return {
    get text() {
      return text;
    },
    feed(piece) {
      text += piece;
      if (text.length - checked < 12) return null;
      checked = text.length;
      const lp = looped();
      if (lp) return { kind: 'loop', keep: text.slice(0, lp.at).trimEnd(), unit: lp.unit };
      const out = strayed();
      if (out >= 0) return { kind: 'script', keep: text.slice(0, out).trimEnd() };
      return null;
    },
  };
}

// ---------- what kind of message is this ----------
export const KINDS = ['talk', 'question', 'research', 'qa', 'build', 'draw', 'film'];
export const SEAT_IDS = ['overseer', 'steward', 'operations', 'ask', 'master'];
const URL_RE = /\b((?:https?:\/\/|localhost:\d+|127\.0\.0\.1:\d+)[^\s"'<>)]*)/i;
// whose job a subject is, by the seats' own responsibilities
export function seatFor(text, kind) {
  const t = String(text).toLowerCase();
  if (kind === 'qa' || kind === 'draw' || kind === 'film') return 'ask'; // what people see is Ask's
  const named = /\b(?:the |our |@)?(overseer|steward|operations|master)\b/.exec(t);
  if (named && kind !== 'build') return named[1]; // "what does the Steward do?" is the Steward's to answer
  if (
    /\b(design|screen|ui\b|ux\b|layout|colou?rs?|button|page looks?|look and feel|font|spacing|mobile width|responsive|logo|icon)\b/.test(
      t,
    )
  )
    return 'ask';
  if (
    /\b(judge|judges|test|tests|testing|proof|prove|verify|verification|acceptance|done means|criteria|regression)\b/.test(
      t,
    )
  )
    return 'steward';
  if (
    /\b(deploy|server|servers|run|running|build|pipeline|ci\b|database|api\b|install|docker|logs?|performance|latency|infra|hosting|script)\b/.test(
      t,
    )
  )
    return 'operations';
  if (
    /\b(land|landing|merge|merging|receipt|ship|shipping|rollback|roll back|revert|(our|the|this|that|a|next) release|release (it|this|that|now|today))\b/.test(
      t,
    )
  )
    return 'master'; // "the latest Node.js release" is not about landing our work
  return 'overseer';
}
// WHAT CHANGES FROM DAY TO DAY IS LOOKED UP, NOT REMEMBERED (Simple mode). Times, opening hours, what is on, tickets, bookings, prices,
// travel, the weather, a shop's own rules: a question about any of these is research, so the answer comes with where it was read.
// A request that names nothing to look for ("can you book a table for me?") is not: the team asks what is missing first.
const LIVE =
  /\b(opening (hours|times)|open (on|at|today|tonight|now|late|until)|closed (on|today)|what time|showtimes?|what(?:'s| is) (playing|on|showing)|playing (tonight|today|now)|tickets?|book (a|me|us|my)|booking|reserv(e|ation|ations)|table for|availab(le|ility)|in stock|sold out|how much (is|are|does|do|would)|price of|prices? (for|of|in)|cheapest|fares?|timetable|schedule for|(last|first|next) (train|bus|flight|ferry|tram|subway)|flights?|airlines?|trains? (to|from)|hotels?|motels?|hostels?|restaurants?|weather|forecast|return policy|refund policy|warranty|how do i (return|cancel|book|buy|renew|contact|get to|get a refund)|phone number (for|of)|find me|where can i (find|buy|get|watch|eat|stay))\b/i;
const NAMES_SOMETHING = (t) => /[a-z,;:]\s+[A-Z][a-z]{2,}|\d/.test(t) || t.split(/\s+/).length > 9; // a place, a name, a date or a number: there is something to search for
export function guessRoute(text, { simple = false } = {}) {
  const message = String(text || '').trim();
  const low = message.toLowerCase();
  const url = (URL_RE.exec(message) || [])[1] || '';
  const app =
    (/\b(?:screenshot|screen shot|capture|picture) of (?:the |my |our )?([A-Z][\w .&+-]{1,30}?)(?: app| window| application)?(?:[.,!?]|$)/.exec(
      message,
    ) || [])[1] || '';
  // in Simple the five are friends with plain jobs: the Doer looks things up, the Artist draws, and the Organizer takes everything else
  const out = (kind, sure) => ({
    kind,
    sure,
    seat: simple
      ? kind === 'draw' || kind === 'film' || kind === 'qa'
        ? 'ask'
        : kind === 'research'
          ? 'operations'
          : 'overseer'
      : seatFor(message, kind),
    url: url ? (/^https?:/i.test(url) ? url : 'http://' + url) : '',
    app: url ? '' : app.trim(),
  });
  if (
    /^(hi|hello|hey|yo|hiya|howdy|good (morning|afternoon|evening|day)|thanks|thank you|thx|ok|okay|cool|great|nice|got it|bye|goodbye|see you)\b[\s\w]{0,14}[!.?]*$/i.test(
      message,
    ) ||
    (message.split(/\s+/).length <= 2 &&
      !/[?]/.test(message) &&
      !url &&
      /^[\p{L}\s!.,']+$/u.test(message) &&
      !/^(add|fix|build|make|test|check|deploy|ship|research|find)\b/i.test(message))
  )
    return out('talk', scriptOf(message) === 'latin' || scriptOf(message) === '');
  const asks =
    /^(how|why|what|when|where|who|which|should|explain|tell me|describe)\b/i.test(message) &&
    !url &&
    !/screen ?shot|picture of/i.test(message); // "how do we test the login flow?" wants an answer, not a look at the page
  if (
    (!asks &&
      /\b(screenshot|screen shot|take a picture|qa\b|smoke test|try (it|this|that) out|(does|is) (it|this|that|the|my|our) [\w\s]{0,40}(work|working|broken|load|loading|up)\b|(check|test|look at|inspect|review|open) (the|this|that|my|our|how) [\w\s]{0,40}(page|site|app|screen|url|link|form|button|flow|looks?))\b/i.test(
        message,
      )) ||
    (!asks && url && /\b(check|test|look|inspect|review|open|see|try|qa|verify)\b/i.test(low))
  )
    return out('qa', true);
  // SOMETHING TO MAKE: a picture or a short video, asked for as one ("draw ...", "make a logo for ...", "a video of ..."). A change to the
  // code that merely mentions a picture ("create an image upload form") is not one: the thing has to be named as what is wanted.
  const maker =
    /^(please\s+|can you\s+|could you\s+)?(draw|sketch|paint|illustrate|generate|make|create|design|render|film|animate)\b/i.test(
      message,
    );
  const OF = '\\s+(of|for|showing|that shows|with)\\b';
  if (!url && maker && new RegExp('\\b(video|clip|animation)' + OF, 'i').test(low)) return out('film', true);
  if (
    !url &&
    (/^(please\s+|can you\s+|could you\s+)?(draw|sketch|paint|illustrate)\b/i.test(message) ||
      (maker &&
        new RegExp(
          '\\b(picture|image|logo|icon|illustration|drawing|mock-?up|banner|avatar|poster|photo)' + OF,
          'i',
        ).test(low)))
  )
    return out('draw', true);
  if (
    /\b(research|look up|look into|find out|search (for|the web|online)|google|compare|comparison|what are the (best|options|alternatives)|alternatives to|latest|news (about|on)|state of the art|survey|market|competitors?|pricing of|price of|who (is|are|makes)|benchmark)\b/i.test(
      message,
    )
  )
    return out('research', true);
  if (
    /^(please\s+|can you\s+|could you\s+|let'?s\s+|we need to\s+|i need you to\s+|i want you to\s+)?(add|fix|build|implement|create|make|change|update|remove|delete|refactor|rename|write|set up|wire|migrate|upgrade|install|support|allow|show|hide|move|replace|convert|enable|disable|optimi[sz]e|clean up)\b/i.test(
      message,
    )
  )
    return out('build', true);
  if (simple && LIVE.test(message) && NAMES_SOMETHING(message)) return out('research', true);
  if (
    /\?\s*$/.test(message) ||
    /^(what|why|how|when|where|who|which|can|could|is|are|do|does|did|should|would|will|tell me|explain|describe)\b/i.test(
      message,
    )
  )
    return out('question', true);
  return out(message.split(/\s+/).length <= 6 ? 'talk' : 'question', false);
}
export const ROUTE_ASK = (text, simple = false) =>
  (simple
    ? 'A person wrote this to the small team that helps them:'
    : 'A customer wrote this to their software team:') +
  '\n"""\n' +
  String(text).slice(0, 600) +
  '\n"""\nClassify it. Answer with exactly one line in this form and nothing else:\nkind=<talk|question|research|qa|build> seat=<overseer|steward|operations|ask|master> language=<the language it is written in, one English word>\n' +
  "talk: a greeting, thanks or small talk. question: they want an answer, not a change. research: it needs finding things out on the web, or its answer depends on facts that change (times, opening hours, prices, tickets, bookings, travel, a company's own rules). qa: they want a page or app looked at, tried or checked. build: they want something made or changed in their code. " +
  'seat: overseer plans and measures, steward writes tests and checks claims, operations builds and runs systems, ask designs what people see, master lands finished work.';
export function parseRoute(said) {
  const s = String(said || '');
  const kind = (/kind\s*[=:]\s*([a-z]+)/i.exec(s) || [])[1];
  const seat = (/seat\s*[=:]\s*([a-z]+)/i.exec(s) || [])[1];
  const language = (/language\s*[=:]\s*([A-Za-z]+)/i.exec(s) || [])[1] || '';
  return kind && KINDS.includes(kind.toLowerCase())
    ? {
        kind: kind.toLowerCase(),
        seat: seat && SEAT_IDS.includes(seat.toLowerCase()) ? seat.toLowerCase() : '',
        language,
      }
    : null;
}
