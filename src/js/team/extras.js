// extras.js - WHAT GOES UNDER A REPLY BESIDES ITS WORDS. A reply in a chat can carry things to press and things to look at: where
// it came from, two answers to tap, a timer for the six minutes it just named, the sum behind a number, a command to copy or run.
// Everything here is read off the reply itself (and what was asked), by the app: no model is asked, so it is the same on any
// engine, and nothing is shown that the reply does not bear out. Each reader says nothing when it is not sure.
//   originOf        where the answer came from: looked up (and how many sources), or from memory; and whether it was checked
//   quickReplies    the answers to tap, when the reply ends by asking for one of a few things
//   fieldsIn        the fields to fill, when the reply asks for two or three facts at once
//   timerIn         a duration the reply gives for something the person is about to do
//   sumFor          the working behind an amount: a rate the reply or its sources give, times what the person has
//   dayPlanIn       the times of a day, down a line; icsOf turns them into a calendar file
//   commandsIn      the commands in a Developer reply, and whether each may be run with one press
//   seenIn          what the team was shown of the customer's own things, and what it says it was not
//   mapUrl          where a named place opens on a map
//   extrasOf        all of the above for one finished reply, as the plain object kept on the message

const clip = (t, n) =>
  String(t == null ? '' : t)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
const sentences = (t) =>
  String(t || '')
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
const NUM = {
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
  half: 0.5,
};
const num = (x) => NUM[String(x).toLowerCase()] ?? Number(String(x).replace(',', '.'));

// ---- where it came from
const CHECKABLE =
  /\b(how (long|many|much|hot|cold|often|far|big|heavy|old)|what (temperature|temp|time|date|year|dose|size|weight)|when (is|does|did|was)|safe|dangerous|toxic|poisonous|can (i|we|you|my|our|a|an|the)\b[^?]{0,40}\b(eat|give|take|mix|have|drink|feed|use|put|leave|keep|freeze|reheat)|open(ing)? (hours|times)|price|cost)\b/i;
export const originOf = (m) => {
  if (!m || m.by === 'you' || !m.text) return null;
  const sources = (m.sources || []).length;
  if (sources || m.looked) return { how: 'looked', sources, checked: !!m.checkedBy };
  return { how: 'memory', sources: 0, checked: !!(m.checkedBy && m.checkedBy.agreed) };
};

// ---- answers to tap. Only when the reply's LAST sentence is the question, and only choices the question itself names.
export const quickReplies = (text) => {
  const last = sentences(text).pop() || '';
  if (!/\?\s*$/.test(last) || last.split(/\s+/).length > 28) return [];
  const q = last.replace(/\?\s*$/, '');
  // "X or Y", "X, Y or Z": the choices are what stands either side of the last "or"
  const or =
    /^(?:.*?\b(?:prefer|want|like|rather|be|go with|choose|pick|is it|are you|should (?:i|we)|do you(?: want| need| have)?|would you(?: like| rather| prefer)?)\b\s+)?(.{2,60}?)\s+or\s+(.{2,40})$/i.exec(
      q,
    );
  if (or) {
    const left = or[1]
      .split(/\s*,\s*/)
      .map((x) => x.replace(/^(a|an|the|to|it|them|me|us)\s+/i, '').trim())
      .filter(Boolean);
    const right = or[2].replace(/^(a|an|the|to)\s+/i, '').trim();
    const picks = [...left.slice(-3), right]
      .map((x) => clip(x.replace(/^(either|both)\s+/i, ''), 28))
      .filter((x) => x && x.split(/\s+/).length <= 4);
    if (picks.length >= 2 && new Set(picks.map((x) => x.toLowerCase())).size === picks.length)
      return picks.map((x) => x[0].toUpperCase() + x.slice(1));
  }
  // a question that a yes or a no answers
  if (
    /^(do|does|did|is|are|was|were|will|would|could|can|should|shall|have|has|want)\b/i.test(q.trim()) ||
    /\b(would you like|do you want|shall i|should i|want me to|is that (ok|okay|right))\b/i.test(q)
  )
    return ['Yes', 'No'];
  return [];
};

// ---- fields to fill: "tell me your airline, your flight number and where you are going"
export const fieldsIn = (text) => {
  const all = sentences(text);
  const ask = [...all]
    .reverse()
    .find((s) =>
      /\b(tell me|let me know|what(?:'s| is| are)|i(?:'d| would) need|i need|we need|send me|give me|share)\b/i.test(s),
    );
  if (!ask) return [];
  const m = /\b(?:tell me|let me know|i(?:'d| would) need|i need|we need|send me|give me|share)\s+(.+?)[.?!]?$/i.exec(
    ask,
  );
  if (!m) return [];
  const parts = m[1]
    .split(/\s*,\s*|\s+and\s+/)
    .map((x) =>
      x
        .replace(/^(and|your|the|a|an|me|us|how|what|which)\s+/i, '')
        .replace(/^(your|the)\s+/i, '')
        .trim(),
    )
    .filter((x) => x && x.split(/\s+/).length <= 5 && !/\b(i|we|you)\s+(can|will|could)\b/i.test(x));
  return parts.length >= 2 && parts.length <= 4 ? parts.map((x) => clip(x[0].toUpperCase() + x.slice(1), 32)) : [];
};

// ---- a timer: the person asked how long, about something they do with their hands, and the reply gives minutes
const DOING =
  /\b(boil|cook|bake|roast|fry|simmer|steep|brew|rest|chill|soak|microwave|grill|steam|poach|knead|proof|rise|marinate|stretch|plank|hold|wait|leave it|let it)\b/i;
export const timerIn = (asked, text) => {
  if (!/\bhow long\b|\bhow many minutes\b|\bminutes?\b/i.test(String(asked)) || !DOING.test(asked + ' ' + text))
    return null;
  const m =
    /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)(?:\s*(?:-|–|—|to|or)\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve))?\s*(seconds?|secs?|minutes?|mins?)\b/i.exec(
      String(text),
    );
  if (!m) return null;
  const per = /^s/i.test(m[3]) ? 1 : 60;
  const lo = num(m[1]) * per;
  const hi = m[2] ? num(m[2]) * per : lo;
  if (!(lo > 0) || hi > 3 * 3600) return null;
  return { seconds: Math.round(lo), upTo: Math.round(hi), label: clip(m[0], 24) };
};

// ---- a sum, worked. A rate ("24 hours for every 2 kg", "20 minutes per 500 g") and what the person has ("a 5 kg turkey").
const MASS = {
  kg: 1000,
  kgs: 1000,
  kilo: 1000,
  kilos: 1000,
  kilogram: 1000,
  kilograms: 1000,
  g: 1,
  gram: 1,
  grams: 1,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
};
const TIME = {
  second: 1 / 60,
  seconds: 1 / 60,
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  day: 1440,
  days: 1440,
};
const N = '(\\d+(?:[.,]\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|half)';
const massRe = '(' + Object.keys(MASS).join('|') + ')';
const timeRe = '(' + Object.keys(TIME).join('|') + ')';
const span = (minutes) => {
  if (minutes >= 2 * 1440) return (Math.round((minutes / 1440) * 2) / 2).toString().replace(/\.0$/, '') + ' days';
  if (minutes >= 120) return (Math.round((minutes / 60) * 2) / 2).toString().replace(/\.0$/, '') + ' hours';
  return Math.round(minutes) + ' minutes';
};
export const sumFor = (asked, ...texts) => {
  const have = new RegExp('\\b' + N + '\\s*-?\\s*' + massRe + '\\b', 'i').exec(String(asked));
  if (!have) return null;
  const grams = num(have[1]) * MASS[have[2].toLowerCase()];
  const rate = new RegExp(
    '\\b' +
      N +
      '\\s*' +
      timeRe +
      '\\s*(?:per|for every|for each|every|each|a|/)\\s*' +
      N +
      '?(?:\\s*(?:-|–|—|to|or)\\s*' +
      N +
      ')?\\s*' +
      massRe +
      '\\b',
    'i',
  );
  for (const t of texts) {
    const m = rate.exec(String(t || ''));
    if (!m) continue;
    const minutes = num(m[1]) * TIME[m[2].toLowerCase()];
    const unit = MASS[m[5].toLowerCase()];
    const lo = (m[3] ? num(m[3]) : 1) * unit;
    const hi = (m[4] ? num(m[4]) : m[3] ? num(m[3]) : 1) * unit;
    if (!(minutes > 0) || !(lo > 0) || !(grams > 0)) continue;
    const most = (grams / lo) * minutes; // the smaller amount per unit of time gives the longer total
    const least = (grams / hi) * minutes;
    return {
      rate: clip(m[0], 60),
      amount: clip(have[0], 20),
      least: Math.round(least),
      most: Math.round(most),
      says: least === most ? span(most) : span(least) + ' to ' + span(most),
      working:
        clip(have[0], 20) +
        ' at ' +
        clip(m[0], 60) +
        ': ' +
        (least === most ? span(most) : 'between ' + span(least) + ' and ' + span(most)),
    };
  }
  return null;
};

// ---- a day, down a line: "10:00 the park", "12:30 lunch at ...". Three or more times, each with what happens then.
export const dayPlanIn = (text) => {
  const out = [];
  const re =
    /(?:^|[\n.;]\s*|[-•*]\s*)(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—:,]|\bto\b\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*[-–—:,]?)\s*([^\n.;]{3,90})/gi;
  for (const m of String(text || '').matchAll(re)) {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12;
    if (m[3] && /am/i.test(m[3]) && h === 12) h = 0;
    if (!m[2] && !m[3]) continue; // a bare number is not a time
    if (h > 23 || min > 59) continue;
    out.push({
      at: String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
      what: clip(m[4].replace(/^[\s:,-]+/, ''), 80),
    });
  }
  const seen = new Set();
  const plan = out.filter((x) => x.what && !seen.has(x.at) && seen.add(x.at)).sort((a, b) => (a.at < b.at ? -1 : 1));
  return plan.length >= 3 ? plan.slice(0, 10) : [];
};
// the day it is for, when the words say: today, tonight, tomorrow, or a weekday (the next one). YYYY-MM-DD, or '' when they do not
const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const dayOf = (words, now = Date.now()) => {
  const t = String(words || '').toLowerCase();
  const iso = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const base = new Date(now);
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return iso(base);
  if (/\btomorrow\b/.test(t)) return iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  const m = new RegExp('\\b(' + WEEK.join('|') + ')\\b').exec(t);
  if (!m) return '';
  const ahead = (WEEK.indexOf(m[1]) - base.getDay() + 7) % 7 || 7; // the next one, never today
  return iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() + ahead));
};
// a calendar file of that day (the day is given as YYYY-MM-DD; each thing lasts until the next, the last an hour)
export const icsOf = (plan, day, title = 'Plan') => {
  const d = String(day).replace(/-/g, '');
  const stamp = (at) => d + 'T' + at.replace(':', '') + '00';
  const plus = (at, minutes) => {
    const t = Number(at.slice(0, 2)) * 60 + Number(at.slice(3)) + minutes;
    return String(Math.min(23, Math.floor(t / 60))).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };
  const esc = (t) =>
    String(t)
      .replace(/[\\;,]/g, (c) => '\\' + c)
      .replace(/\n/g, '\\n');
  return (
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Office//The Crew//EN', 'CALSCALE:GREGORIAN']
      .concat(
        plan.flatMap((x, i) => [
          'BEGIN:VEVENT',
          'UID:' + d + '-' + i + '@the-crew',
          'DTSTAMP:' + stamp('00:00'),
          'DTSTART:' + stamp(x.at),
          'DTEND:' + stamp(plan[i + 1] ? plan[i + 1].at : plus(x.at, 60)),
          'SUMMARY:' + esc(x.what),
          'DESCRIPTION:' + esc(title),
          'END:VEVENT',
        ]),
      )
      .concat(['END:VCALENDAR'])
      .join('\r\n') + '\r\n'
  );
};

// ---- commands (Developer). A command is in a fence or in code marks and starts with a tool people run. One that could throw work
// away, or that reaches off the machine, can be copied but is never offered to be run.
const TOOL =
  /^(git|npm|npx|pnpm|yarn|node|deno|bun|python3?|pip3?|pytest|make|cargo|go|gradle|\.\/gradlew|flutter|dart|swift|xcodebuild|docker|kubectl|curl|ls|cat|grep|rg|sed|tsc|eslint|prettier|jest|vitest|playwright)\b/;
const NEVER_RUN =
  /--force\b|--force-with-lease|\s-f\b|reset --hard|\brm\b|\bdrop (table|database)\b|\bchmod\b|\bchown\b|--no-verify|\bsudo\b|[;&|`$<>]|\bcurl\b|\bdocker\b|\bkubectl\b|\bgit (push|checkout|clean|stash|merge|rebase|commit|add|reset|revert|pull|fetch|switch|restore|tag|branch -[dD])\b|\bpublish\b|\binstall\b|\bsed -i\b|<[^>]+>/i;
const READS =
  /^(git (status|log|diff|show|branch|remote -v|rev-parse|blame|bisect (log|view))|ls\b|cat\b|grep\b|rg\b|node --version|npm (test|run (test|lint|build|check|typecheck)\b|ls)|npx (playwright test|tsc|eslint|prettier --check|vitest|jest)\b|pnpm (test|lint)|yarn (test|lint)|pytest\b|python3? -m pytest\b|make (test|check|lint)\b|cargo (test|check|clippy)\b|go (test|vet)\b|flutter (test|analyze)\b|dart (test|analyze)\b|tsc\b|eslint\b|jest\b|vitest\b)/;
export const commandsIn = (text) => {
  const found = [];
  const t = String(text || '');
  for (const m of t.matchAll(/```[a-z]*\n?([\s\S]*?)```/g))
    for (const line of m[1].split('\n')) found.push(line.replace(/^\$\s*/, '').trim());
  for (const m of t.replace(/```[\s\S]*?```/g, ' ').matchAll(/`([^`\n]{3,160})`/g))
    found.push(m[1].replace(/^\$\s*/, '').trim());
  const seen = new Set();
  return found
    .filter((c) => TOOL.test(c) && c.split(/\s+/).length >= 2 && !seen.has(c) && seen.add(c))
    .slice(0, 4)
    .map((cmd) => ({ cmd, run: READS.test(cmd) && !NEVER_RUN.test(cmd) }));
};

// ---- seen, and not seen (Developer): the customer's own files they named or attached, and what the reply says it has not seen
export const seenIn = (asked, reply, shown = []) => {
  const files = [...new Set(String(asked).match(/\b[\w.-]+(?:\/[\w.-]+)*\.[a-z]{1,5}\b/gi) || [])].slice(0, 5);
  const seen = [...new Set([...shown.filter(Boolean), ...files.map((f) => f + ' (named, not opened)')])].slice(0, 6);
  const not = [];
  for (const m of String(reply).matchAll(
    /\b(?:haven'?t|have not|not) (?:seen|been shown|read|opened|found|looked at)\s+(?:your|the|their|any|that)?\s*([a-z][\w .-]{2,40}?)(?=[,;:!?]|\.(?:\s|$)|\s+(?:so|and|but|yet|or)\b|$)/gi,
  ))
    not.push(clip(m[1].replace(/\s+or\s+.*$/, ''), 36));
  for (const m of String(reply).matchAll(
    /\b(?:paste|share|send|attach|show me)\s+(?:me\s+)?(?:your|the|that|a)?\s*([a-z][\w .-]{2,40}?)(?=[,;:!?]|\.(?:\s|$)|\s+(?:so|and|or)\b|$)/gi,
  ))
    not.push(clip(m[1], 36));
  const notSeen = [
    ...new Set(not.map((x) => x.trim()).filter((x) => x && !/^(it|them|that|this|file|one|output|here)$/i.test(x))),
  ].slice(0, 4);
  return notSeen.length ? { seen, notSeen } : null;
};

// ---- a place, on a map (the person's own map application or browser opens it; nothing is asked of a map service by the app)
export const mapUrl = (name, near = '') =>
  'https://www.openstreetmap.org/search?query=' + encodeURIComponent(clip(name + (near ? ', ' + near : ''), 120));

// ---- all of it, for one finished reply. o: { simple, asked, mode, sourcesText, shown, near }
export const extrasOf = (m, o = {}) => {
  const text = String((m && m.text) || '');
  if (!m || m.by === 'you' || !text || /^\[/.test(text)) return null;
  const asked = String(o.asked || '');
  const x = {};
  const answer = o.mode === 'answer' || o.mode === 'research' || o.mode === 'talk';
  if (o.simple) {
    // where it came from is said of an answer that was looked up, and of one from memory that has a fact in it to check (an
    // amount, a time, whether something is safe): a plan for Saturday or a note to a landlord has nothing to look up
    const origin = answer && o.mode !== 'talk' ? originOf(m) : null;
    if (origin && (origin.how === 'looked' || CHECKABLE.test(asked) || (/\d/.test(text) && !dayPlanIn(text).length)))
      x.origin = origin;
    const t = answer ? timerIn(asked, text) : null;
    if (t) x.timer = t;
    const s = answer ? sumFor(asked, text, o.sourcesText || '') : null;
    if (s) x.sum = s;
    const day = dayPlanIn(text);
    if (day.length) {
      x.day = day;
      const on = dayOf(asked + ' ' + text, o.now);
      if (on) x.dayOn = on;
    }
  } else if (answer) {
    const cmds = commandsIn(text);
    if (cmds.length) x.commands = cmds;
    const seen = seenIn(asked, text, o.shown || []);
    if (seen) x.seen = seen;
  }
  if (answer || o.mode === 'do') {
    const fields = fieldsIn(text);
    if (fields.length) x.fields = fields;
    else {
      const replies = quickReplies(text);
      if (replies.length) x.replies = replies;
    }
  }
  return Object.keys(x).length ? x : null;
};
