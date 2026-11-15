// manners.js - THE CONVENTIONS OF A CONVERSATION. A group chat with people in it has manners nobody writes down: you answer in the
// register you were spoken to in, you greet once and not again, "thanks" gets a word and not a paragraph, you do not repeat what the
// person next to you just said, and you name them when you build on it or differ. Developers have their own: lead with the
// finding, name the file, skip the pep talk. This file reads how the person writes (no model is asked) and says, before a seat
// speaks, what that asks of the reply. What is constant about the room is ROOM (in the seat's system line); what changes with the
// person is the note.
import { isSimple } from '../mode.js';

const count = (re, t) => (String(t).match(re) || []).length;

const CASUAL =
  /\b(hey|heya|hiya|yo|sup|gonna|wanna|gotta|kinda|sorta|dunno|lol|lmao|haha+|hehe|thx|ty|pls|plz|ya|yeah|yep|nope|nah|cheers|btw|idk|tbh|imo|omg|ok|okay|cool|awesome|u|ur|bc|cuz)\b/gi;

const FORMAL =
  /\b(dear|good (morning|afternoon|evening)|would you (kindly|please|be so kind)|could you please|i would like to|i would be grateful|i should like|please advise|kind regards|best regards|yours (sincerely|faithfully)|thank you in advance|at your earliest convenience|i am writing to)\b/gi;

const BRITISH =
  /\b(colours?|favour(ite|ites|s)?|flavours?|neighbours?|behaviours?|honours?|organis(e|ed|es|ing|ation)|realis(e|ed|es|ing)|recognis(e|ed|es|ing)|apologis(e|ed|es|ing)|centres?|theatres?|metres?|litres?|travell(ed|ing|er)|cancell(ed|ing)|programme|whilst|cheque|grey|mum|holiday|flat|queue|fortnight|rubbish|lorry|petrol)\b/gi;

const AMERICAN =
  /\b(colors?|favor(ite|ites|s)?|flavors?|neighbors?|behaviors?|honors?|organiz(e|ed|es|ing|ation)|realiz(e|ed|es|ing)|recogniz(e|ed|es|ing)|apologiz(e|ed|es|ing)|centers?|theaters?|traveled|traveling|canceled|gray|mom|vacation|apartment|trash|gasoline)\b/gi;

// words that are British in one sense and ordinary in another are not counted on their own
const BRITISH_WEAK = /^(holiday|flat|queue|rubbish|grey|mum)$/i;

export const GREETS = /^\W*(hi|hey|heya|hiya|hello|yo|howdy|good (morning|afternoon|evening)|morning|evening)\b/i;
export const THANKS = /\b(thanks|thank you|thx|ty|cheers|much appreciated|appreciate it|you'?re the best|legend)\b/i;
export const HURRIED =
  /\b(asap|quick(ly)?|urgent(ly)?|in a (hurry|rush)|right now|no time|running late|hurry|real quick|short on time)\b/i;
export const HEAVY =
  /\b(upset|worried|scared|frightened|anxious|stressed|furious|devastated|died|passed away|funeral|grief|grieving|laid off|redundant|got fired|diagnos\w+|in hospital|can'?t cope|crying|heartbroken|divorce|miscarriage|lonely|overwhelmed|panic\w*)\b/i;
export const JOKING = /\b(lol|lmao|haha+|hehe+|jk|just kidding)\b|[😂🤣😅😆]/iu;
export const EMOJI = /\p{Extended_Pictographic}/u;

// ONE MESSAGE, as written: how long, how formal, which spelling, and what kind of turn it is
export const readWriting = (text) => {
  const t = String(text || '').trim();
  const words = t ? t.split(/\s+/).length : 0;
  const british = (t.match(BRITISH) || []).filter((w) => !BRITISH_WEAK.test(w)).length;
  return {
    words,
    casual:
      count(CASUAL, t) +
      (words >= 3 && /^[a-z]/.test(t) && !/[.!?]$/.test(t) ? 1 : 0) +
      (/\b(i|im|dont|cant)\b/.test(t) ? 1 : 0),
    formal: count(FORMAL, t),
    british,
    american: count(AMERICAN, t),
    greets: GREETS.test(t),
    thanks: THANKS.test(t) && words <= 9 && !/\?/.test(t),
    hurried: HURRIED.test(t),
    heavy: HEAVY.test(t),
    joking: JOKING.test(t),
    emoji: EMOJI.test(t),
    asks: /\?/.test(t),
  };
};

// HOW THIS PERSON WRITES: their last few messages for what lasts (length, formality, spelling, emoji), the newest for what kind of
// turn this is (a greeting, thanks, a hurry, something heavy, a joke). `said` is what they wrote, oldest first.
export const registerOf = (said) => {
  const all = (said || [])
    .slice(-6)
    .map(readWriting)
    .filter((r) => r.words);
  if (!all.length) return null;
  const now = all[all.length - 1];
  const sum = (k) => all.reduce((n, r) => n + r[k], 0);
  const mean = sum('words') / all.length;
  const casual = sum('casual');
  const formal = sum('formal');
  const british = sum('british');
  const american = sum('american');
  return {
    length: mean <= 9 ? 'short' : mean >= 45 ? 'long' : 'middling',
    tone:
      formal > 0 && formal >= casual ? 'formal' : casual >= 2 || (casual >= 1 && all.length <= 2) ? 'casual' : 'plain',
    spelling: british > american ? 'british' : american > british ? 'american' : '',
    emoji: all.some((r) => r.emoji),
    greets: now.greets,
    thanks: now.thanks,
    hurried: now.hurried,
    heavy: now.heavy,
    joking: now.joking && !now.heavy,
    words: now.words,
  };
};

// WHAT THAT ASKS OF THE REPLY, put in front of a seat before it speaks. `going` is whether the team has already spoken in this chat.
export const mannersNote = (register, { simple = true, going = false, brief = false } = {}) => {
  const r = register;
  if (!r) return '';
  const them = 'They';
  const lines = [];
  if (r.thanks)
    lines.push(
      them +
        ' just said thanks. Take it in a few words, the way you would in a chat. Add nothing new, ask nothing, and do not sum up what was done.',
    );
  if (r.heavy)
    lines.push(
      'Something is weighing on them. Open with one plain, kind sentence about that; then help with what they asked, gently and practically. Keep jokes, exclamation marks and silver linings out of it.',
    );
  if (r.hurried)
    lines.push(
      them +
        ' are in a hurry. Put the answer in your first sentence and stop soon after: at most 40 words, and leave the sources out.',
    );
  if (r.greets && !going) lines.push(them + ' said hello. Say it back in a word or two, then get to what they asked.');
  else if (going)
    lines.push(
      'The chat is already going. Do not open with a greeting or with their name, and do not sign off: just say your piece.',
    );
  if (!r.thanks && !r.heavy) {
    if (r.length === 'short')
      lines.push(
        them +
          ' write short messages. Answer in kind: two or three sentences unless the question truly needs more, and no list where a sentence will do.',
      );
    else if (r.length === 'long')
      lines.push(
        them +
          ' write at length and with care. You can take the room to answer properly: every point they raised gets an answer.',
      );
    if (r.tone === 'casual')
      lines.push(
        simple
          ? 'They write casually. So do you: relaxed, contractions, the words they use. Do not be more correct than they are.'
          : 'They write casually. Keep it relaxed and direct: no ceremony, no formal openers.',
      );
    else if (r.tone === 'formal')
      lines.push(
        them +
          ' write formally. Meet them there: whole sentences, no slang, no jokes at their expense, and courteous without being stiff.',
      );
    if (r.joking) lines.push('They are joking around. You can play along for a line, then answer.');
  }
  if (r.spelling === 'british')
    lines.push('They spell the British way (colour, organise, centre). Spell that way too.');
  if (r.spelling === 'american')
    lines.push('They spell the American way (color, organize, center). Spell that way too.');
  if (simple && r.emoji && !r.heavy) lines.push('They use emoji. One is fine where it fits; more than one is not.');
  else if (simple && !brief) lines.push('They do not use emoji here. Neither do you.');
  // a small model keeps a short note and loses a long one: it is given the four lines that matter most, which are the first four
  const kept = brief ? lines.slice(0, 4) : lines;
  return kept.length
    ? (simple
        ? 'HOW THIS PERSON WRITES, AND WHAT THAT ASKS OF YOU'
        : 'HOW THE CUSTOMER WRITES, AND WHAT THAT ASKS OF YOU') +
        ' (read from their own messages; never mention it):\n' +
        kept.map((l) => '- ' + l).join('\n') +
        '\n\n'
    : '';
};

// THE SHAPE OF THIS REPLY, said last, after what was asked: where a model reads it just before it writes. What a reply must open
// with and how long it may be are the two conventions a model lets go of first (a local one answers a question with a question, or
// with "Great question!"; a large one writes three times the length), so they are not left in the middle of a long instruction.
//   kind   'answer' (a question was asked) or 'talk' (conversation)      level   in Developer: 'seasoned', 'new' or ''
export const replyShape = (register, { simple = true, kind = 'answer', level = '', going = true } = {}) => {
  const r = register;
  if (!r || (kind !== 'answer' && kind !== 'talk')) return '';
  if (r.thanks) return '\n\nYOUR REPLY: a few warm words, at most 20, and nothing else.';
  if (kind === 'talk') return '';
  if (r.heavy)
    return '\n\nYOUR REPLY: one kind sentence first, then real help with what they asked. At most 110 words.';
  if (!simple)
    return level === 'seasoned'
      ? '\n\nYOUR REPLY: begin with the thing itself (where to look, or what you decided), then why. At most ' +
          (r.hurried ? 40 : 110) +
          ' words; a list only for commands. A question of good practice is answered outright. Only what is in their own code, logs or settings has to have been shown to you: of that, say what you would look at, never what is there or what caused something.'
      : level === 'new'
        ? '\n\nYOUR REPLY: the answer to their question first, in plain words, then the one next step. At most 120 words. A general question is answered outright; of their own files or site, say only what you were shown.'
        : '';
  return (
    '\n\nYOUR REPLY: ' +
    (r.greets && !going ? 'say hello back in a word, then give' : 'open with') +
    ' the answer itself, or your best suggestion if a detail is missing. Do not open with a remark about the question, and do not answer with a question. At most ' +
    (r.hurried ? 40 : r.length === 'short' ? 60 : 110) +
    ' words.'
  );
};

// NOT SAID TWICE. A sentence a seat has already said in this chat, word for word, is taken out of a later reply: it is the one
// thing a small model does that no person in a group chat would. Only whole sentences of eight words or more, only when something
// is left, and never from a piece written for the person (speak() uses it on answers alone).
const plain = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const withoutRepeats = (text, earlier) => {
  const said = new Set();
  for (const t of earlier || [])
    for (const x of String(t).split(/(?<=[.!?])\s+/)) if (x.split(/\s+/).length >= 8) said.add(plain(x));
  if (!said.size) return text;
  const parts = String(text).split(/(?<=[.!?])\s+/);
  const kept = parts.filter((x) => !(x.split(/\s+/).length >= 8 && said.has(plain(x))));
  return kept.length && kept.length < parts.length && kept.join(' ').split(/\s+/).length >= 6 ? kept.join(' ') : text;
};

// NO SIGNING OFF. The last sentence of an answer is taken off when it is only an offer of more help ("Let me know if you need the
// recipe!"): nobody in a group chat ends a message that way, and a small model ends most of them so.
const SIGNS_OFF =
  /^(let me know (if|when|what|how)|feel free to|just (say the word|let me know|ask)|happy to help|hope (this|that|it) helps|don'?t hesitate|i'?m here if|if you (need|want|'d like) (anything|more|any)|reach out)\b[^?]*[.!]?$/i;
export const withoutSignOff = (text) => {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  return parts.length > 1 && SIGNS_OFF.test(parts[parts.length - 1].trim()) ? parts.slice(0, -1).join(' ') : text;
};

// how much of one reply is already in another: the words they share, over the words of the shorter
export const overlap = (a, b) => {
  const words = (t) =>
    new Set(
      plain(t)
        .split(' ')
        .filter((w) => w.length > 3),
    );
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((w) => y.has(w)).length / Math.min(x.size, y.size);
};

// AN EXACT FACT (Simple). How long, how hot, how much, how many, and whether something is safe to eat, give or mix: a question whose
// answer is a number or a yes that someone will act on. A small model answers these from memory with full confidence, and is wrong
// often enough to matter (measured: a 5 kg turkey "defrosts in a day"). So on a local model they are looked up, like anything
// else that has to be right, unless the person is in a hurry: then the quick answer is given, and it is the fact-checker's to catch.
export const EXACT =
  /\b(how (long|many|much|hot|cold|often|far|big|heavy)|what (temperature|temp|dose|dosage|size|weight)|at what (temperature|age)|how old|safe (to|for)|is it (safe|ok|okay|fine|dangerous|bad) (to|for|if)|can (i|we|you|my|our|a|an|the)\b[^?]{0,40}\b(eat|give|take|mix|have|drink|feed|use|put|leave|keep|freeze|reheat)|toxic|poisonous|go off|expire[sd]?|use by|best before|defrost|thaw)\b/i;

// A SECOND OPINION ON A FACT (Simple, a local model). Looking every exact fact up was tried and measured: mixed sources made some
// answers worse than the model's own memory. What a small model does show is DISAGREEMENT with itself when it is unsure (after
// "Second Guess", arXiv 2605.25394, and adaptive retrieval gating, 2511.09803). So the fact-checker is asked for the bare fact in
// one line, and the two are compared: a yes against a no, or two amounts that do not overlap, and the team looks it up.
const MINUTES = {
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  day: 1440,
  days: 1440,
  week: 10080,
  weeks: 10080,
};
const NUMBER = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};
const num = (x) => NUMBER[String(x).toLowerCase()] ?? Number(x);
// every amount in a text, as { lo, hi, unit }: times in minutes, so that "36 hours" and "a day and a half" can be compared
export const amountsIn = (text) => {
  const n = '(\\d+(?:\\.\\d+)?|' + Object.keys(NUMBER).join('|') + ')';
  const re = new RegExp(
    '\\b' +
      n +
      '(?:\\s*(?:-|–|—|to|or)\\s*' +
      n +
      ')?\\s*(°\\s*[CF]\\b|degrees?(?: (?:celsius|fahrenheit|[CF])\\b)?|[a-z]+)',
    'gi',
  );
  const out = [];
  for (const m of String(text || '').matchAll(re)) {
    const unit = m[3].toLowerCase().replace(/\s+/g, '');
    const lo = num(m[1]);
    const hi = m[2] ? num(m[2]) : lo;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    const scale = MINUTES[unit];
    out.push(scale ? { lo: lo * scale, hi: hi * scale, unit: 'time' } : { lo, hi, unit });
  }
  return out;
};
const saysOf = (text) => {
  const t = String(text || '').trim();
  return /^\W*(no|never|don'?t|do not|not safe|it'?s not|it is not|please don'?t)\b/i.test(t)
    ? 'no'
    : /^\W*(yes|sure|you can|absolutely|it'?s fine|that'?s fine|go ahead)\b/i.test(t)
      ? 'yes'
      : '';
};
// the fact-checker's line gives one fact. The answer is apart from it when it opens the other way (yes against no), or when none
// of its amounts in the same unit comes within a third of the fact-checker's
export const apartOn = (answer, second) => {
  const a = saysOf(answer);
  const b = saysOf(second);
  if (a && b && a !== b) return 'one says ' + a + ' and the other ' + b;
  const fact = amountsIn(second)[0];
  if (!fact) return '';
  const same = amountsIn(answer).filter((x) => x.unit === fact.unit);
  if (!same.length) return '';
  const near = (x) => Math.max(x.lo, fact.lo) <= Math.min(x.hi, fact.hi) * 1.3;
  return same.some(near) ? '' : 'the amounts do not agree';
};

// A COMMAND THAT DESTROYS (Developer). A reply that offers a way to throw away work or data, when the customer did not ask for
// it by name: a forced push, a hard reset, a recursive delete, dropping a table, skipping the checks. A warning against it is not
// an offer: the clause it stands in is read for one. Found on a local model: "git revert ... then force-push".
const DESTROYS =
  /git push[^\n.;]{0,30}(--force\b|--force-with-lease|\s-f\b)|\bforce[- ]push\w*|\breset --hard\b|\brm -rf?\b|\bdrop (table|database)\b|\bchmod (-R )?777\b|--no-verify\b|\btruncate table\b/gi;
const WARNS =
  /\b(don'?t|do not|never|avoid|not|no|rather than|instead of|without|isn'?t|shouldn'?t|unsafe|dangerous)\b/i;
export const destroysIn = (reply, given) => {
  const had = String(given).toLowerCase();
  const out = [];
  for (const m of String(reply).matchAll(DESTROYS)) {
    const clause = String(reply)
      .slice(Math.max(0, m.index - 80), m.index)
      .split(/[,;:.!?]\s/)
      .pop();
    const after = String(reply).slice(m.index, m.index + m[0].length + 60);
    if (
      WARNS.test(clause) ||
      /\b(is not|isn'?t|not offered|discards?|erases?|destroys?|loses?|would lose)\b/i.test(after)
    )
      continue;
    const name = m[0].toLowerCase().replace(/\s+/g, ' ');
    if (!had.includes(name.replace(/^git push.*/, 'force'))) out.push(m[0].trim());
  }
  return [...new Set(out)].slice(0, 3);
};

// WHAT IT WAS NEVER SHOWN (Developer). A seat that has not been shown the customer's code, logs or settings sometimes answers as if
// it had: a file path nobody named, what is on a line, the cause of a failure it knows nothing about. Found on a local model:
// "the deploy failed because a schema migration ran first". These are read off the reply (no model is asked): a path with a folder
// in it that is nowhere in what the seat was given, a line number likewise, and a stated cause of the customer's own failure.
const EVERYWHERE =
  /^(package(-lock)?\.json|tsconfig\.json|playwright\.config\.(ts|js)|jest\.config\.(ts|js)|vite\.config\.(ts|js)|docker-compose\.ya?ml|\.env|requirements\.txt|pyproject\.toml|build\.gradle(\.kts)?|pubspec\.yaml|cargo\.toml|go\.mod)$/i; // files a project of its kind has: naming one describes nobody's code
// the files a reply speaks of as if it knew them. Not: a web address (rfc-editor.org/rfc/rfc9110.html), nor a place it only offers to
// look or asks to be sent ("or its path, such as /etc/nginx/nginx.conf", "I'd fetch ...", "send me ...").
const OFFERED =
  /\b(such as|e\.g\.|for example|for instance|like|usually|typically|often|by default|somewhere else|i'?d (fetch|read|open|look)|i would (fetch|read|open|look)|(send|paste|share|show|point) (me|us)\b|its path|the path)\b/i;
export const pathsIn = (t) => {
  const text = String(t);
  const out = [];
  for (const m of text.matchAll(/\b[\w.-]+(?:\/[\w.-]+)+\.[a-z]{1,5}\b/gi)) {
    if (/^(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:org|com|net|io|dev|edu|gov|app|co)\//i.test(m[0])) continue;
    const from = Math.max(text.lastIndexOf('. ', m.index), text.lastIndexOf('? ', m.index), 0);
    if (OFFERED.test(text.slice(from, m.index))) continue;
    out.push(m[0]);
  }
  return [...new Set(out)];
};
// a cause is named: "it failed because", "the cause was". Not "until the cause is confirmed" or "the cause is not known"
export const NAMES_CAUSE =
  /\b(failed|broke|crashed|went down) because\b|\bthe (cause|reason|problem|culprit) (was|is)\b(?! (?:not|un\w+|confirmed|known|found|clear|settled|established|still)\b)/i;
export const unseenIn = (reply, given) => {
  const had = String(given).toLowerCase();
  const out = [];
  for (const p of pathsIn(reply)) if (!had.includes(p.toLowerCase())) out.push(p);
  for (const m of String(reply).matchAll(/\bline \d+\b/gi)) if (!had.includes(m[0].toLowerCase())) out.push(m[0]);
  // a file named in code marks that is the customer's own (not one every project of its kind has), and a time of day: "the
  // `pipeline.yml` run at 19:00" was said of a deploy nobody had described
  for (const m of String(reply).matchAll(
    /`([\w.-]+\.(?:ya?ml|conf|log|env|ini|toml|sql|sh|json|ts|tsx|js|py|kt|swift|dart|go|rs))`/gi,
  ))
    if (!had.includes(m[1].toLowerCase()) && !EVERYWHERE.test(m[1])) out.push(m[1]);
  for (const m of String(reply).matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g))
    if (!had.includes(m[0])) out.push('the time ' + m[0]);
  if (
    /\b(why|what) (did|caused|made|broke|went wrong)\b|\bwhat happened\b/i.test(had.slice(-1200)) &&
    NAMES_CAUSE.test(reply)
  )
    out.push('a cause it was not shown');
  return [...new Set(out)].slice(0, 4);
};

// WHAT IS CONSTANT ABOUT THE ROOM. In Simple it is a group chat among people; in Developer it is a team channel among engineers.
export const ROOM = {
  simple:
    'THE MANNERS OF A GROUP CHAT. Everyone here can read what the others wrote, so never say it again: if a teammate has covered it, leave it. When you build on what a teammate said, or see it differently, say their name and do it kindly, in a few words ("Alex is right about the oven. One thing I\'d add..."); disagreeing is fine, talking down is not. One point to a message. Ask at most one question at a time, and only if the answer changes what you would say. Talk to the person, never about them, and never about the team behind their back. Do not correct how they write, do not lecture, and do not tell them how to feel. Do not start with praise for the question, and do not end by offering more help: they know where you are. ',
  // the same manners for a small local model: the few it does not keep by itself, each said once and plainly
  simpleBrief:
    'GROUP CHAT MANNERS. Do not repeat anything a teammate or you already said in this chat: add something new, or keep it short. Give your answer or your best suggestion before you ask anything, and ask at most one question. One point to a message. Never say that a button, a page or a place exists unless it is in front of you. ',
  developerBrief:
    'TEAM CHANNEL MANNERS. Do not repeat a teammate: add to it. Lead with the finding. Keep apart what you know, what you assumed and what you have not checked. One point to a message. Never say that a button, a page, a file or a setting exists unless it was shown to you. ',
  developer:
    "THE MANNERS OF A TEAM CHANNEL. Everyone reads the thread, so do not repeat a teammate: add to it, or say nothing. When you build on a teammate's point or disagree with it, name the seat and say what evidence would settle it; you argue with the claim, never with the person. One point to a message. No greeting, no sign-off, no praise for the question, and no offer of further help. Say what you know, what you assumed and what you have not checked, and keep those three apart. ",
};

// THE TWO KINDS OF PERSON A DEVELOPER TEAM TALKS TO (host.js works out which). The first sentence of each is what the team is told
// about them; the rest is how the conversation goes with them, and what it tends to be about.
export const SHOP = {
  seasoned:
    'WHO YOU ARE TALKING TO: an experienced developer. Be brief and exact, use the proper terms, and leave out explanations they do not need. ' +
    'Talk the way engineers do in a team channel: lead with the finding or the decision, then the reason in a clause; four sentences is a long message here, and a list is for commands. Name the file, the function, the command or the error exactly, in backticks; give the command or the change itself in place of a description of it. The shorthand of the trade is welcome where it is exact (repro, regression, flaky, nit, rollback, no-op). Say the trade-off you chose and the one you turned down. What they want to hear about: the diff, the tests and CI, review, failure modes, performance, how it ships and how it is rolled back. What they do not: encouragement, what a term means, or the same thing twice.',
  new:
    'WHO YOU ARE TALKING TO: someone new to building software. Use plain words; when you must use a term, say in a few words what it means; say what happens next; and never ask them for a path, a branch or a command to run: the chat gives them a button for what this computer needs. ' +
    'Talk like a colleague showing a friend round the workshop: encouraging without flattery, and one step at a time. Say what they will see on their screen and what to press, and say it when something is normal ("that takes a minute"). None of the trade\'s shorthand. Never make a question sound basic, and never say "simply" or "just" about something they have not done before. What they want to hear about: what it will look like, whether it works, how to try it, how long it takes and what it costs. What can wait until they ask: branches, pipelines, tests and how the team is organised.',
};

// the same two, for a small local model: who they are, and the three things to do about it
export const SHOP_BRIEF = {
  seasoned:
    'WHO YOU ARE TALKING TO: an experienced developer. Be brief and exact, use the proper terms, and leave out explanations they do not need. Name files, functions and commands exactly, in backticks. Say the trade-off. No encouragement.',
  new: 'WHO YOU ARE TALKING TO: someone new to building software. Use plain words; when you must use a term, say in a few words what it means; say what happens next; and never ask them for a path, a branch or a command to run. One step at a time. Never make a question sound basic. Leave branches, pipelines and tests out unless they ask.',
};

export function installManners(ctx) {
  // what the person has written in this chat, oldest first (what they attached or pressed is not their writing)
  const written = () => ctx.state.chat.filter((m) => m.by === 'you' && m.text).map((m) => m.text);

  const register = () => registerOf(written());

  // the note for the seat about to speak: the team has "already spoken" once any seat has said something before the newest message
  const going = () => {
    const chat = ctx.state.chat;
    let newest = -1;
    for (let i = chat.length - 1; i >= 0; i--)
      if (chat[i].by === 'you') {
        newest = i;
        break;
      }
    return chat.slice(0, Math.max(newest, 0)).some((m) => m.by !== 'you' && m.text && !m.live);
  };

  const mannerNote = () => mannersNote(register(), { simple: isSimple(), going: going(), brief: !ctx.onClaude() });

  // what the seats have said in this chat before the reply being written now
  const saidSoFar = (but) =>
    ctx.state.chat.filter((m) => m.by !== 'you' && m !== but && m.text && !m.live).map((m) => m.text);

  // said last, after what was asked (see replyShape). mode: the kind of reply the seat is writing (speak's own modes)
  const shapeNote = (mode) =>
    replyShape(register(), {
      simple: isSimple(),
      kind: mode === 'answer' || mode === 'talk' ? mode : '',
      level: (ctx.state.dev && ctx.state.dev.level) || '',
      going: going(),
    });

  Object.assign(ctx, { register, mannerNote, shapeNote, saidSoFar });
}
