// pulse.js - READINGS of Family Office's own system, the one a customer's team is built from. One reading per publish, each dated.
// The landing page shows the newest one above the fold as "one day in the system", and once there are two it says what moved since the
// one before; with three or more it draws the line. A reading is ADDED (node tools/pulse.mjs add ...), never edited: the page's
// claim is that the system keeps learning, and the only honest way to show that is readings taken on different days.
//   proofsDay    proofs run in one day (that day's count)
//   judges       judges on file            measures    measures of itself, each with a target
//   memories     memories in the graph     links       links between them
//   commits90    commits to its own system in the three months before the reading
//   resetsWeek   context resets in the week before the reading       shed    the share of what a seat carries that a reset sheds, in percent
export const KEYS = ['proofsDay', 'judges', 'measures', 'memories', 'links', 'commits90', 'resetsWeek', 'shed'];   // every reading gives all of them
export const PULSE = {
  readings: [
    { date: '2026-11-10', proofsDay: 2981, judges: 8808, measures: 292, memories: 95025, links: 442777, commits90: 23443, resetsWeek: 726, shed: 61 },
  ],
};
// what a day looks like, from a reading: one day's proofs as counted; commits and resets as the average of their own windows
export const dayOf = (r) => ({ proofs: r.proofsDay, commits: r.commits90 / 92, resets: r.resetsWeek / 7, measures: r.measures });
// the counts that only make sense as "more than last time"
export const GROWS = [['judges', 'judges'], ['memories', 'memories'], ['links', 'links'], ['measures', 'measures']];
