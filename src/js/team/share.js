// share.js - WHAT MAY LEAVE THIS MACHINE. A team can be set to contribute what it learns (off unless the person turns it on). What it
// learned was learned from this person's work, so before a lesson may leave, everything of theirs is taken out of it: an address,
// an email, a key or a long number, an identifier, a repository, a path, a file's name, and any run of eight or more of their own
// words. What is left is method: "pin the empty case first", not "the basket in src/cart.js". A lesson that is nothing but their
// own (who they are, what they like, something they told the team, how they put it right) is not contributed at all.
// Nothing here sends anything. It says what a sender would be handed.
const RULES = [
  ['address', /https?:\/\/[^\s,;)\]]+/g],
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['key', /\b(?:ghp_\w{20,}|sk-\w{16,}|[0-9a-fA-F]{32,})\b/g],
  [
    'identifier',
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b|\b[A-Z][A-Z0-9]+-\d+\b/g,
  ],
  ['repository', /\b(?:github|gitlab|bitbucket)\.(?:com|org)\/[\w.-]+\/[\w.-]+/g],
  ['path', /(?:^|(?<=[\s("']))(?:\.{1,2}\/|\/)?[\w.-]+(?:\/[\w.-]+)+/g],
  [
    'file',
    /\b[\w-]+(?:\.[\w-]+)*\.(?:tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|cs|cpp|php|swift|dart|sql|json|ya?ml|toml|md|sh|conf|env|log)\b/g,
  ],
];
export const COPIED_WORDS = 8;
const norm = (w) =>
  String(w)
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ]+/g, '');
const tokens = (t) =>
  String(t == null ? '' : t)
    .split(/\s+/)
    .filter(Boolean);

// what in a lesson is the person's own: [{ kind, match }]
export const theirsIn = (text, theirWords = []) => {
  const t = String(text == null ? '' : text);
  const out = [];
  for (const [kind, re] of RULES) for (const m of t.matchAll(re)) out.push({ kind, match: m[0] });
  const toks = tokens(t);
  const n = toks.map(norm);
  const hit = new Set();
  for (const said of theirWords) {
    const hay = ' ' + tokens(said).map(norm).filter(Boolean).join(' ') + ' ';
    for (let i = 0; i + COPIED_WORDS <= n.length; i++) {
      const run = n.slice(i, i + COPIED_WORDS);
      if (run.some((w) => !w)) continue;
      if (hay.includes(' ' + run.join(' ') + ' ')) for (let k = i; k < i + COPIED_WORDS; k++) hit.add(k);
    }
  }
  let run = [];
  for (let i = 0; i <= toks.length; i++) {
    if (hit.has(i)) run.push(toks[i]);
    else if (run.length) {
      out.push({ kind: 'their words', match: run.join(' ') });
      run = [];
    }
  }
  return out;
};
// the lesson with all of that taken out, or '' when too little is left to be a lesson
export const stripped = (text, theirWords = []) => {
  let t = String(text == null ? '' : text);
  for (const f of theirsIn(t, theirWords).sort((a, b) => b.match.length - a.match.length))
    t = t.split(f.match).join(' ');
  t = t
    .replace(/["“”][^"“”]{0,200}["“”]/g, ' ') // what was quoted was theirs
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/([:,;])\s*([.,;:])/g, '$2')
    .trim();
  return t.split(/\s+/).filter((w) => /[a-zà-ÿ]{3,}/i.test(w)).length >= 5 ? t : '';
};
// the lessons a sender would be handed: method only, and none that is about the person
export const forSharing = (ledger = [], theirWords = []) =>
  (ledger || [])
    .filter((x) => x && x.kind === 'lesson' && x.dir !== 'out')
    .map((x) => ({ text: stripped(x.text, theirWords), kind: 'lesson' }))
    .filter((x) => x.text && !theirsIn(x.text, theirWords).length);
