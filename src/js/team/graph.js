// graph.js - THE SOUL IS A GRAPH. Everything the team keeps is a node: a lesson, something the person said of themself, a correction,
// a ruling, a proof, a piece of work and how it ended, a plan, a file, a kind of fault. What produced what is an edge: a lesson
// was kept in a piece of work, that work touched a file, it was proved by a proof, a correction was about it, it was a second go
// at an earlier piece, a ruling replaced an older one.
// RECALL WALKS IT. A question lands on the nodes that hold its words (rarer words weighing more) and on the files it names. From
// each of those the walk goes out two steps along the edges, losing a part of its weight at every step, and whatever it reaches
// is recalled with what it found by words. So a thing that shares no word with the question comes back when it is tied to
// something that does: the other lesson from the same piece of work, what was learned on the same file, the ruling that replaced
// the one that matched, the earlier attempt.
// (After the system this team is modelled on, whose memory is one graph that a turn's recall seeds and walks.)
// No model is asked and there is no clock in it: the same memory and the same question give the same answer.
//   edgesOf(state)                     every edge, as [from, to, kind]
//   walk({ seeds, edges, steps })      from each seed outward: Map id -> { rank, via, hops }
//   KEEP                               how much of its weight a step along each kind of edge keeps

export const KEEP = {
  together: 0.8, // two lessons kept in the same piece of work
  'kept-in': 0.7, // a lesson and the piece of work it was kept in
  file: 0.8, // a lesson, or a piece of work, and a file it touched
  used: 0.5, // a lesson and a piece of work it was used in
  about: 0.7, // a correction and the piece of work it put right
  again: 0.6, // a piece of work and an earlier go at the same thing
  plan: 0.8, // a piece of work and its plan
  proof: 0.7, // a plan and the proof of it
  replaced: 0.5, // a ruling and the one it replaced
  request: 0.7, // two things kept from the same request
  fault: 0.4, // a piece of work and a kind of fault it had
};
const SAYS = {
  together: 'kept in the same piece of work',
  'kept-in': 'the piece of work it was kept in',
  file: 'learned on a file this names',
  used: 'used in work like this',
  about: 'what the person put right there',
  again: 'an earlier go at the same thing',
  plan: 'the plan of that work',
  proof: 'the proof of that work',
  replaced: 'the ruling this replaced',
  request: 'kept from the same request',
  fault: 'what had to be put right then',
};
export const reachedBy = (kind) => SAYS[kind] || 'tied to what matched';

const words = (t) =>
  new Set(
    String(t || '')
      .toLowerCase()
      .replace(/[^a-z0-9à-ÿ ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
const alike = (a, b) => {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((w) => y.has(w)).length / Math.min(x.size, y.size);
};
export const fileId = (path) => 'F:' + String(path).toLowerCase();

// every edge of the memory. Ids: a lesson's own id; 'E-…' a piece of work; 'P:<title>' a plan; a proof's id; 'R-…' a ruling;
// 'F:<path>' a file; 'X:<kind>' a kind of fault.
export function edgesOf(state) {
  const out = [];
  const add = (a, b, kind) => {
    if (a && b && a !== b) out.push([a, b, kind]);
  };
  const ledger = (state.learning && state.learning.ledger) || [];
  const episodes = state.episodes || [];
  const byEp = new Map();
  const byRequest = new Map();
  for (const x of ledger) {
    if (x.ep) {
      add(x.id, x.ep, 'kept-in');
      byEp.set(x.ep, [...(byEp.get(x.ep) || []), x.id]);
    }
    for (const f of x.files || []) add(x.id, fileId(f), 'file');
    if (x.about) add(x.id, x.about, 'about');
    if (x.cites && x.kind !== 'you') byRequest.set(x.cites, [...(byRequest.get(x.cites) || []), x.id]);
  }
  for (const ids of byEp.values())
    for (let i = 0; i < ids.length; i++)
      for (let k = i + 1; k < ids.length && k < i + 6; k++) add(ids[i], ids[k], 'together');
  for (const ids of byRequest.values())
    for (let i = 0; i < ids.length; i++)
      for (let k = i + 1; k < ids.length && k < i + 4; k++) add(ids[i], ids[k], 'request');
  episodes.forEach((e, i) => {
    for (const f of e.files || []) add(e.id, fileId(f), 'file');
    for (const id of e.used || []) add(id, e.id, 'used');
    for (const k of e.faults || []) add(e.id, 'X:' + k, 'fault');
    if (e.kind === 'build') add(e.id, 'P:' + e.title, 'plan');
    // an earlier go at the same thing: the nearest older piece of work whose title is mostly the same words
    for (let k = i + 1; k < episodes.length && k < i + 40; k++)
      if (alike(e.title, episodes[k].title) >= 0.6) {
        add(e.id, episodes[k].id, 'again');
        break;
      }
  });
  for (const p of state.proofs || []) add('P:' + p.title, p.id, 'proof');
  const rulings = state.rulings || [];
  rulings.forEach((r, i) => {
    if (r.superseded) return;
    const old = rulings
      .slice(i + 1)
      .find((o) => o.superseded && o.kind === r.kind && r.kind !== 'answer' && r.kind !== 'standing');
    if (old) add(r.id, old.id, 'replaced');
  });
  return out;
}

// from each seed outward, `steps` steps. seeds: Map id -> rank. What is reached keeps the best rank any path gives it, and how
// it was reached (the kind of the last edge, and how many steps out). A node already seeded is never lowered by a walk.
export function walk({ seeds, edges, steps = 2, cap = 400 } = {}) {
  const next = new Map();
  for (const [a, b, kind] of edges || []) {
    next.set(a, [...(next.get(a) || []), [b, kind]]);
    next.set(b, [...(next.get(b) || []), [a, kind]]);
  }
  const found = new Map([...seeds].map(([id, rank]) => [id, { rank, via: '', hops: 0 }]));
  let edge = [...seeds.keys()];
  for (let hop = 1; hop <= steps && edge.length; hop++) {
    const reached = [];
    for (const id of edge) {
      const from = found.get(id);
      for (const [to, kind] of next.get(id) || []) {
        const rank = from.rank * (KEEP[kind] || 0.4);
        const had = found.get(to);
        if (had && had.rank >= rank) continue;
        if (!had && found.size >= cap) continue;
        found.set(to, { rank, via: had && had.hops === 0 ? '' : kind, hops: had && had.hops === 0 ? 0 : hop });
        reached.push(to);
      }
    }
    edge = reached;
  }
  return found;
}
