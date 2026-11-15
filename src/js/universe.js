// universe.js - ONE SYSTEM, ONE SOUL, DRAWN. One small film on a canvas, with no picture files and no library, used whole in the
// landing page's hero (a fly-through) and scene by scene further down the page.
// In the middle is THE SOUL: a lit sphere inside a disc of everything the team has settled, pale lights joined by hairlines. It is
// celestial to look at and it MOVES like a mind: signals travel along its hairlines from light to light, and a path that has been
// used stays brighter. Around it are THE FIVE, the same five characters the product has (js/ui.js, buddy()), each joined to the soul.
//   VISION          someone asks. An eye opens in the soul; the few things it knows that bear on the question light up and say what
//                   they are; a signal runs inward from each along the hairlines, they meet at the core, and one goes out to the one
//                   who is about to answer. The answer forms from them
//   FIVE FRIENDS    first, one assistant alone in the dark: one flat answer. Then the soul comes up behind it and the five answer in
//                   turn. Before each speaks, the soul reaches it; then it hops and says its piece, and the others look at it
//   HINDSIGHT       what was learned leaves the one who answered, comes back along its own trail, lands as a light, and the path from
//                   that light to the core is drawn in gold AND STAYS: each turn of the film leaves the soul with one more
//   FIVE ENGINEERS  one assistant alone: "Done. It works." A claim. Then the five, in order round the ring: one plans it, one writes the
//                   test (red), one builds until it is green, one checks the screen, one lands it on the receipt. Proven
//   THE SOUL        up close: a few lights at a time say what they are, because they are things about a person
//   ONE SOUL        all of it: five who share one soul
// IT HAS DEPTH, AND IT IS NEVER STILL (iteration 7). The disc and the ring of the five lie in one plane, tipped back from the viewer;
// the lights sit a little before and behind it; and all of it is seen through one view that sways slowly and leans toward the
// pointer, so that near things pass in front of far ones and are larger. The five and the core are OBJECTS, not flat shapes: each is
// drawn once with a lit side, a shaded side, a shine and a soft edge (the five are lit from the soul's side), and a band of light
// glides across each as the view turns. The one assistant set beside them is left flat and grey, on purpose. Nothing switches on or
// off: whatever changes, changes over a stretch of time.
// Colour is kept for what is happening (after two styles studied at styles.refero.design, a dark observatory and a bioluminescent
// laboratory: a near-monochrome ground with ONE signal). The lights are pale. GOLD is something known being used. Green is proven.
// Only the five have colours of their own. The words stay flat: the objects carry the weight.
// A camera moves through one space, so the fly-through and the single scenes are the same drawing. It runs only while it is on
// screen, and for someone who has asked for less motion it draws one still frame and stops.
//   mountUniverse(canvas, { scene: 'tour' | a scene id, onScene(i, scene), onBeat(i, step, line) })  ->  { seek(i), stop() }
// THE FLIGHT OPENS ON A BUILDING (iteration 8): see THE OPENING below. And it narrates: each scene has steps (beats), and the page
// shows the line for the step that is playing.
// THE FLIGHT IS ABOUT THE FIVE (iteration 9): the opening, THE FIVE (one scene, the same in either mode: someone asks, the soul
// reaches each of the five, each says its part), then the features: Vision, Hindsight, the Soul, and One soul. No lone assistant
// is in it. FIVE FRIENDS and FIVE ENGINEERS, described above, are played only by the two panels further down the page.
// THE FIVE HAVE A TEXTURE (iteration 10): their bodies come from js/avatar.js, the same ones the app shows everywhere: matt, the
// surface laid with short fibres, the outline fibres standing out from it. Nothing on them shines any more.
import { bodyCanvas, bodyPath, felt } from './avatar.js'; // the five's bodies, the same ones every page of the app shows
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t) => 1 - Math.pow(1 - t, 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const bump = (t, a, b, edge = 0.05) => seg(t, a, a + edge) * (1 - seg(t, b - edge, b)); // in, held, out
const spring = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 10.5)); // arrives a little past where it is going, and settles
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const C = {
  fog: [233, 238, 245],
  ice: [198, 214, 255],
  mint: [196, 240, 226],
  warm: [255, 238, 208],
  jade: [52, 211, 153],
  sky: [56, 189, 248],
  vio: [150, 130, 255],
  gilt: [255, 214, 130],
  garnet: [255, 93, 87],
  smoke: [150, 165, 190],
};
const WHITE = [255, 255, 255];
const NIGHT = [8, 10, 40];
const INK = '#161a29';
const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a).toFixed(3) + ')';
const rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
const mix = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

// each scene: how long it is held, where the camera rests (x, y, zoom), and what the page says under it
// beats: the steps of the scene, each [how far into the scene it begins, the line that says what is being looked at]
// A CAPTION IS HELD FOR AS LONG AS IT TAKES TO READ. The flight's words are in one place (the caption under it), and a caption that
// changes before it has been read is worse than none. Reading is taken at fifteen characters a second, the comfortable rate for
// subtitles, and half a second to land on it: readTime(). Each scene is as long as its captions need, and has as few as will do:
// measured before this, sixteen of the eighteen were gone before they could be read. A caption that carries over from the end of
// one scene to the start of the next is one caption (the page does not redraw a line that has not changed).
export const readTime = (text) => Math.max(1.6, String(text).length / 15 + 0.5);
export const SCENES = [
  {
    id: 'office',
    d: 12.5,
    name: 'The Family Office',
    line: 'This is the Family Office. One window is lit.',
    cam: [0, -12, 0.7],
    beats: [
      [0, 'This is the Family Office. One window is lit.'],
      [0.3, 'Inside, someone has sat down at their desk.'],
      [0.58, 'On their screen is this page. Look closer.'],
      [0.86, 'What lives in there: one soul, and five who share it.'],
    ],
  },
  {
    id: 'five',
    d: 13.5,
    name: 'The five',
    line: 'Five agents, each with a job and a voice of its own.',
    cam: [0, -12, 0.7],
    beats: [
      [0, 'What lives in there: one soul, and five who share it.'],
      [0.18, 'Ask once. Each takes its part: plan it, check it, do it, show it, wrap it up.'],
      [0.66, 'Five answers that fit together, because they share one soul.'],
    ],
  },
  {
    id: 'vision',
    d: 15.5,
    name: 'Vision',
    line: 'Before it speaks, it sees what matters.',
    cam: [0, -134, 0.95],
    beats: [
      [0, 'Someone asks the team about dinner on Saturday.'],
      [0.24, 'Before anyone answers, the soul lights up what it knows about them, and sends it to Sam.'],
      [0.69, 'So the answer fits them: a vegetarian place, in their own city.'],
    ],
  },
  {
    id: 'hindsight',
    d: 11.5,
    name: 'Hindsight',
    line: 'After every day, it is wiser.',
    cam: [60, -104, 0.92],
    beats: [
      [0, 'After the answer, what the team learned travels home to the soul.'],
      [0.7, 'It lands as a new light, kept for next time.'],
    ],
  },
  {
    id: 'soul',
    d: 9.5,
    name: 'Soul',
    line: 'It keeps what matters to you.',
    cam: [0, -10, 1.16],
    beats: [
      [0, 'Closer: this is the soul. Every light is something you told the team.'],
      [0.56, 'You can ask what it knows. You can tell it to forget.'],
    ],
  },
  {
    id: 'all',
    d: 5.5,
    name: 'One soul',
    line: 'One system. Five who share it. Now it is yours.',
    cam: [0, 2, 0.72],
    beats: [[0, 'One system. Five who share one soul. Now it is yours.']],
  },
  // only: not part of the flight. Each is the scene of one of the two panels further down the page, which are each about one mode
  {
    id: 'chat',
    d: 10,
    name: 'Five friends',
    line: 'Not one voice. A group chat that knows you.',
    cam: [0, -12, 0.7],
    only: true,
  },
  {
    id: 'proof',
    d: 10.5,
    name: 'Five engineers',
    line: 'Not a claim. A proof, before it reaches your code.',
    cam: [0, -14, 0.68],
    only: true,
  },
];
const TOUR = SCENES.filter((s) => !s.only).length;
const STARTS = SCENES.slice(0, TOUR).reduce((a, s) => [...a, a[a.length - 1] + s.d], [0]);
const LOOP = STARTS[TOUR];
const AT = Object.fromEntries(SCENES.map((s, i) => [s.id, i]));

// ---- the soul's lights: fixed places, so the same sky is drawn every time. They are pale: colour is kept for what happens.
// a, r: where it is in the disc. z: how far before or behind the disc it sits (most near the middle, none at the rim)
const MEM = Array.from({ length: 132 }, (_, i) => {
  const r = 62 + 238 * Math.sqrt(hash(i + 1));
  return {
    a: hash(i * 7 + 3) * TAU,
    r,
    z: (hash(i * 13 + 7) - 0.5) * 240 * Math.sqrt(Math.max(0.06, 1 - (r / 312) * (r / 312))),
    s: 0.8 + hash(i * 3 + 9) * 1.9,
    c: [C.fog, C.ice, C.fog, C.mint, C.fog, C.warm][Math.floor(hash(i * 5 + 2) * 6)],
    w: hash(i * 11 + 5),
  };
});
const at0 = MEM.map((m) => [Math.cos(m.a) * m.r, Math.sin(m.a) * m.r]);
const dist = (i, j) => Math.hypot(at0[i][0] - at0[j][0], at0[i][1] - at0[j][1]);
const NEARBY = MEM.map((_, i) =>
  MEM.map((__, j) => j)
    .filter((j) => j !== i)
    .sort((x, y) => dist(i, x) - dist(i, y))
    .slice(0, 6),
);
const LINKS = [];
MEM.forEach((_, i) => {
  for (const j of NEARBY[i].slice(0, 2)) if (dist(i, j) < 90 && i < j) LINKS.push([i, j]);
});
// THE WAY IN from a light to the core: from light to nearby light, always inward. A signal travels it; a path that is learned is one of these.
const wayIn = (start) => {
  const way = [start];
  let cur = start;
  for (let n = 0; n < 9 && MEM[cur].r > 96; n++) {
    const next = NEARBY[cur]
      .filter((j) => MEM[j].r < MEM[cur].r - 10)
      .sort((a, b) => dist(cur, a) + MEM[a].r * 0.5 - dist(cur, b) - MEM[b].r * 0.5)[0];
    if (next == null) break;
    way.push(next);
    cur = next;
  }
  return way;
};
// THE LIGHTS THAT SAY WHAT THEY ARE: things a person told the team in passing, and things they ruled. The three Vision sees are the
// three, at a readable distance from the core, that sit furthest apart; the others are chosen well away from them.
const gapOf = (a, b) => {
  let d = Math.abs(MEM[a].a - MEM[b].a) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
};
const SEEN = (() => {
  const c = MEM.map((m, j) => j).filter((j) => MEM[j].r >= 150 && MEM[j].r <= 240);
  let best = c.slice(0, 3);
  let far = -1;
  for (let x = 0; x < c.length; x++)
    for (let y = x + 1; y < c.length; y++)
      for (let z = y + 1; z < c.length; z++) {
        const g = Math.min(gapOf(c[x], c[y]), gapOf(c[y], c[z]), gapOf(c[x], c[z]));
        if (g > far) {
          far = g;
          best = [c[x], c[y], c[z]];
        }
      }
  return best;
})();
const apart = (need, gap, taken, lo = 150, hi = 240) => {
  const got = [];
  for (let j = 0; j < MEM.length && got.length < need; j++) {
    if (MEM[j].r < lo || MEM[j].r > hi) continue;
    if ([...taken, ...got].every((q) => gapOf(q, j) >= gap)) got.push(j);
  }
  return got;
};
const SAID = [...SEEN, ...apart(3, 0.8, SEEN)].map((j, n) => [
  j,
  ['vegetarian', 'lives in Porto', 'Mia turns six', 'likes short answers', 'call me Dana', 'every change on a branch'][
    n
  ],
  ['leaf', 'pin', 'cake', 'short', 'name', 'branch'][n],
]);
const SEEN_WAYS = SEEN.map(wayIn);
// WHAT HINDSIGHT HAS KEPT: each turn of the film one more lesson lands, on its own light, and its way in to the core stays gold
const HOMES = apart(6, 0.85, [], 170, 250);
const LEARNED = HOMES.map(wayIn);
const LESSONS = [
  ['“that was too long”', 'keeps it short'],
  ['red: an empty cart', 'tests the empty case first'],
  ['“not before nine”', 'lets you sleep in'],
  ['a build that broke', 'runs the build first'],
  ['“call me Dana”', 'knows your name'],
  ['a flaky test', 'waits for the page'],
];

// ---- THE FIVE, clockwise from the top, which is also the order a change passes between them. will: its part, said the same in
// either mode (the flight); says: as a friend (the Simple panel); does: as an engineer (the Developer panel)
const FIVE = [
  {
    name: 'Sam',
    c: [107, 116, 230],
    will: 'I’ll plan it.',
    sign: 'plan',
    says: 'Park first, cake after.',
    does: 'plans it',
    tone: C.fog,
  },
  {
    name: 'Robin',
    c: [240, 169, 58],
    will: 'I’ll check it.',
    sign: 'look',
    says: 'The café is shut. I checked.',
    does: 'writes the test: red',
    tone: C.garnet,
  },
  {
    name: 'Alex',
    c: [32, 179, 166],
    will: 'I’ll get it done.',
    sign: 'cog',
    says: 'Sunny till six. Go early.',
    does: 'builds until it is green',
    tone: C.jade,
  },
  {
    name: 'Jamie',
    c: [236, 106, 160],
    will: 'I’ll show you.',
    sign: 'picture',
    says: 'I drew Mia a card.',
    does: 'checks the screen',
    tone: C.fog,
  },
  {
    name: 'Pat',
    c: [34, 176, 125],
    will: 'I’ll wrap it up.',
    sign: 'wrap',
    says: 'Short version: go by ten.',
    does: 'lands it, on the receipt',
    tone: C.jade,
  },
];
const RING = 398;
const SIZE = 104;
const angleOf = (j) => -TAU / 4 + (j * TAU) / 5;
const A0 = FIVE.map((f, j) => [Math.cos(angleOf(j)) * RING, Math.sin(angleOf(j)) * RING]);
// THEIR SHAPES AND FACES, as the product draws them (js/ui.js, buddy(): a square of 48, the body's middle at 24, 26.5): Sam has an
// aerial with a lamp on it, Robin a tuft and round glasses, Alex a bolt and a wide grin, Jamie a wink and three sparks, Pat a pencil.
// mouth: from x, at y, to x, how deep the smile is
const WHO = [
  { eyes: [18.5, 29.5], ey: 26, mouth: [19.5, 33, 28.5, 3], blush: true },
  { eyes: [18, 30], ey: 26, mouth: [21, 35.4, 27, 1.8], specs: true },
  { eyes: [18.5, 29.5], ey: 26, mouth: [18, 33.4, 30, 5], grin: true, blush: true },
  { eyes: [18.5, 29.5], ey: 26.4, mouth: [19, 32.5, 29, 4.4], wink: true, blush: true },
  { eyes: [18.5, 29.5], ey: 26, mouth: [20.5, 33.5, 27.5, 2.2], blush: true },
];

// ---- a soft light, drawn once per colour and stamped wherever a light is needed
const sprites = new Map();
function sprite(c) {
  const k = c.join();
  let s = sprites.get(k);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 96;
  const g = s.getContext('2d');
  const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, rgba([255, 255, 255], 1));
  gr.addColorStop(0.18, rgba(c, 0.9));
  gr.addColorStop(0.5, rgba(c, 0.22));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 96, 96);
  sprites.set(k, s);
  return s;
}
const light = (g, x, y, r, c, a) => {
  if (a <= 0.004 || r <= 0) return;
  g.globalAlpha = clamp(a);
  g.drawImage(sprite(c), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
};
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

// ---- THE OBJECTS, each drawn once and stamped: the five bodies, the shade each casts on what is behind it, and the soul's core
const made = {};
const pane = (k, size, paint) => {
  if (made[k]) return made[k];
  const s = document.createElement('canvas');
  s.width = s.height = size;
  paint(s.getContext('2d'));
  return (made[k] = s);
};
// one of the five: its body is the one every page of the app shows (js/avatar.js: matt, with a texture), lit here also from the
// soul's side, with what it wears that does not move
const body = (j) => bodyCanvas(j, 288, [-Math.cos(angleOf(j)), -Math.sin(angleOf(j)) * 0.88], true);
const shade = () =>
  pane('shade', 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(3,5,14,.9)');
    gr.addColorStop(0.55, 'rgba(3,5,14,.5)');
    gr.addColorStop(1, 'rgba(3,5,14,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
// the soul's core: a sphere of light, hottest above and to the left, bluer toward its edge, with the edge itself a little brighter
const orb = () =>
  pane('orb', 256, (g) => {
    let gr = g.createRadialGradient(96, 90, 4, 128, 128, 124);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.28, '#f2f7ff');
    gr.addColorStop(0.6, '#b4ccff');
    gr.addColorStop(0.86, '#6890f2');
    gr.addColorStop(1, '#3d62cf');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, 124, 0, TAU);
    g.fill();
    gr = g.createRadialGradient(128, 128, 98, 128, 128, 125);
    gr.addColorStop(0, 'rgba(214,232,255,0)');
    gr.addColorStop(0.82, 'rgba(214,232,255,.75)');
    gr.addColorStop(1, 'rgba(214,232,255,.2)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, 124, 0, TAU);
    g.fill();
  });

// A SIGNAL ALONG A WAY (a line through points): the way lights up behind it as far as it has got, each light it passes flares, and
// its head is a bright point with a short tail. v: how far along, 0 to 1. Returns where the head is.
function signal(g, pts, v, c, a, wide = 2) {
  if (v <= 0 || a <= 0.01) return pts[0];
  const L = [0];
  for (let i = 1; i < pts.length; i++)
    L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1] || 1;
  const at = (d) => {
    let i = 1;
    while (i < pts.length - 1 && L[i] < d) i++;
    const f = clamp((d - L[i - 1]) / (L[i] - L[i - 1] || 1));
    return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
  };
  const d = clamp(v) * total;
  const head = at(d);
  g.strokeStyle = rgba(c, 0.6 * a);
  g.lineWidth = wide;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && L[i] < d; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.lineTo(head[0], head[1]);
  g.stroke();
  const rise = seg(v, 0, 0.05);
  const fall = 1 - seg(v, 0.93, 1);
  for (let i = 0; i < pts.length; i++) {
    const since = (d - L[i]) / total;
    const up = seg(since, 0, 0.035) * (i ? 1 : rise);
    if (since > 0 && since < 0.22)
      light(g, pts[i][0], pts[i][1], (26 * (1 - since / 0.22) + 8) * (0.5 + 0.5 * up), c, a * (1 - since / 0.22) * up);
  } // each light it passes flares
  if (v < 1) {
    for (let s = 1; s <= 5; s++) {
      const p = at(Math.max(0, d - s * total * 0.022));
      light(g, p[0], p[1], 15 - s * 2, c, a * (1 - s / 6) * rise * fall);
    }
    light(g, head[0], head[1], 20, C.fog, a * rise * fall);
  }
  return head;
}
// SIGNS. In the flight (the hero) nothing is written inside the picture: the caption under it is the one thing to read, and the picture
// shows what the caption says. So where a scene on its own writes a few words in a pill ("I'll plan it.", "vegetarian"), the flight
// draws a sign in the same pill: a list for a plan, a lens for a check, a leaf for what someone eats. Each is line art in a box from
// -1 to 1, in the pill's own colour.
const SIGNS = {
  ask: (g) => {
    g.arc(0, -0.35, 0.4, Math.PI, Math.PI * 0.35);
    g.lineTo(0, 0.25);
    g.moveTo(0.01, 0.72);
    g.lineTo(0, 0.72);
  },
  plan: (g) => {
    for (const y of [-0.5, 0, 0.5]) {
      g.moveTo(-0.66, y);
      g.lineTo(-0.65, y);
      g.moveTo(-0.28, y);
      g.lineTo(0.7, y);
    }
  },
  look: (g) => {
    g.arc(-0.15, -0.15, 0.48, 0, TAU);
    g.moveTo(0.2, 0.2);
    g.lineTo(0.72, 0.72);
  },
  cog: (g) => {
    g.arc(0, 0, 0.26, 0, TAU);
    g.moveTo(0.52, 0);
    g.arc(0, 0, 0.52, 0, TAU);
    for (let s = 0; s < 8; s++) {
      const a = (s * TAU) / 8;
      g.moveTo(Math.cos(a) * 0.52, Math.sin(a) * 0.52);
      g.lineTo(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
    }
  },
  picture: (g) => {
    g.rect(-0.78, -0.6, 1.56, 1.2);
    g.moveTo(-0.62, 0.42);
    g.lineTo(-0.18, -0.08);
    g.lineTo(0.12, 0.22);
    g.lineTo(0.36, -0.02);
    g.lineTo(0.64, 0.42);
    g.moveTo(0.5, -0.3);
    g.arc(0.38, -0.3, 0.12, 0, TAU);
  },
  wrap: (g) => {
    g.rect(-0.66, -0.12, 1.32, 0.84);
    g.moveTo(0, -0.12);
    g.lineTo(0, 0.72);
    g.moveTo(0, -0.14);
    g.bezierCurveTo(-0.6, -0.8, -0.75, -0.2, 0, -0.14);
    g.bezierCurveTo(0.6, -0.8, 0.75, -0.2, 0, -0.14);
  },
  leaf: (g) => {
    g.moveTo(-0.62, 0.62);
    g.bezierCurveTo(-0.72, -0.3, 0, -0.8, 0.72, -0.72);
    g.bezierCurveTo(0.8, 0, 0.3, 0.72, -0.62, 0.62);
    g.lineTo(0.28, -0.28);
  },
  pin: (g) => {
    g.arc(0, -0.25, 0.5, Math.PI * 0.8, Math.PI * 0.2);
    g.lineTo(0, 0.8);
    g.closePath();
    g.moveTo(0.16, -0.25);
    g.arc(0, -0.25, 0.16, 0, TAU);
  },
  cake: (g) => {
    g.rect(-0.62, 0.02, 1.24, 0.66);
    g.moveTo(-0.62, 0.32);
    g.lineTo(0.62, 0.32);
    g.moveTo(0, 0.02);
    g.lineTo(0, -0.4);
    g.moveTo(0.01, -0.68);
    g.lineTo(0, -0.68);
  },
  short: (g) => {
    g.moveTo(-0.7, -0.26);
    g.lineTo(0.34, -0.26);
    g.moveTo(-0.7, 0.26);
    g.lineTo(-0.1, 0.26);
  },
  name: (g) => {
    g.arc(0, -0.34, 0.3, 0, TAU);
    g.moveTo(-0.62, 0.74);
    g.arc(0, 0.74, 0.62, Math.PI, TAU);
  },
  branch: (g) => {
    g.arc(-0.4, -0.56, 0.17, 0, TAU);
    g.moveTo(-0.23, 0.56);
    g.arc(-0.4, 0.56, 0.17, 0, TAU);
    g.moveTo(0.62, -0.2);
    g.arc(0.45, -0.2, 0.17, 0, TAU);
    g.moveTo(-0.4, -0.39);
    g.lineTo(-0.4, 0.39);
    g.moveTo(0.45, -0.03);
    g.quadraticCurveTo(0.45, 0.3, -0.4, 0.3);
  },
  plate: (g) => {
    g.arc(0, 0, 0.46, 0, TAU);
    g.moveTo(0.24, 0);
    g.arc(0, 0, 0.24, 0, TAU);
    g.moveTo(-0.84, -0.62);
    g.lineTo(-0.84, 0.62);
    g.moveTo(0.84, -0.62);
    g.lineTo(0.84, 0.62);
  },
};
const sign = (g, kind, x, y, size, colour) => {
  if (!SIGNS[kind]) return;
  g.save();
  g.translate(x, y);
  g.scale(size / 2, size / 2);
  g.strokeStyle = colour;
  g.lineWidth = 0.17;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  SIGNS[kind](g);
  g.stroke();
  g.restore();
};

// WORDS. They are gathered while the frame is drawn and set down last, on top: each a small pill, never smaller on the screen than can
// be read, kept inside what can be seen, and moved off another by as far as they overlap (gradually, as the other appears). side: 1 right of the point, -1 left, 0 centred on it, and anywhere between.
// pop: how far it has sprung into place (it arrives a little large, and settles).
function setWords(g, list, px, box) {
  g.globalCompositeOperation = 'source-over';
  g.textBaseline = 'middle';
  const placed = [];
  for (const w of list) {
    const f = px * (w.big ? 1.1 : 1);
    g.font = '600 ' + f + 'px Figtree, "Avenir Next", "Segoe UI", system-ui, sans-serif';
    const each = f * 2.3; // a sign's own box, and the space between two of them
    const tw = w.signs ? w.signs.length * each + (w.signs.length - 1) * f * 0.55 : g.measureText(w.text).width;
    const h = w.signs ? f * 3.3 : f * 1.9;
    const pad = f * 0.8;
    const bw = tw + pad * 2;
    const gap = f * 0.3;
    let x = clamp(
      lerp(w.x - f * 0.9 - bw, w.x + f * 0.9, (clamp(w.side, -1, 1) + 1) / 2),
      box[0],
      Math.max(box[0], box[2] - bw),
    );
    let y = clamp(w.y - h / 2, box[1], box[3] - h);
    let move = 0;
    for (const p of placed) {
      if (w.slot && p[4] === w.slot) continue;
      const ox = Math.min(x + bw, p[0] + p[2]) - Math.max(x, p[0]);
      const down = p[1] + p[3] + gap - y;
      const up = y + h + gap - p[1];
      if (ox <= 0 || down <= 0 || up <= 0) continue;
      const lean = clamp(0.5 + (up - down) / (h * 0.6));
      const s2 = lean * lean * (3 - 2 * lean);
      const by = (down * s2 - up * (1 - s2)) * clamp(ox / (f * 2)) * ease(clamp(p[5] * 2));
      move += by;
    }
    y += move;
    placed.push([x, y, bw, h, w.slot || '', w.a]);
    if (w.a <= 0.004) continue;
    const s = w.pop == null ? 1 : Math.max(0.01, w.pop);
    g.save();
    g.translate(x + bw / 2, y + h / 2);
    g.scale(s, s);
    g.globalAlpha = clamp(w.a);
    g.fillStyle = w.fill || 'rgba(8,12,22,.84)';
    g.strokeStyle = rgba(w.c, 0.6);
    g.lineWidth = f * 0.08;
    rr(g, -bw / 2, -h / 2, bw, h, h / 2);
    g.fill();
    g.stroke();
    if (w.signs)
      w.signs.forEach((kind, n) =>
        sign(g, kind, -bw / 2 + pad + each / 2 + n * (each + f * 0.55), 0, each, rgba(w.c, 1)),
      );
    else {
      g.fillStyle = rgba(w.c, 1);
      g.fillText(w.text, -bw / 2 + pad, f * 0.04);
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

// ONE OF THE FIVE. s: how wide its body is. o.a: how much of it is there. o.hop: how much it is the one speaking (0 to 1), and
// o.beat: how far into its hops it is. o.lx, o.ly: where it is looking. o.yaw: how far the view is turned, which is where the band
// of light across it sits. It floats, tips a little, blinks, turns its face the way it looks; speaking, it hops (squashing as it
// lands, stretching as it rises) and its mouth moves.
function face(g, j, x, y, s, t, o) {
  const a = o.a;
  if (a <= 0.01) return;
  const f = FIVE[j];
  const w = WHO[j];
  const hop = o.hop || 0;
  const h = hop * Math.abs(Math.sin(o.beat || 0));
  const yy = y - h * s * 0.3;
  const lx = clamp(o.lx || 0, -1, 1);
  const ly = clamp(o.ly || 0, -1, 1);
  const sq = 1 + hop * (h - 0.42) * 0.2 + (1 - hop) * Math.sin(t * 1.4 + j) * 0.014;
  const tip = Math.sin(t * 0.7 + j * 1.9) * 0.035 * (1 - hop) + lx * 0.05;
  const ph = (t * 0.6 + j * 0.37) % 3.2;
  const lid = 1 - 0.9 * (ph < 0.2 ? Math.sin((ph / 0.2) * Math.PI) : 0);
  const u = s / 34;
  g.globalCompositeOperation = 'lighter';
  light(g, x, yy, s * 1.55, f.c, 0.3 * a);
  if (hop > 0) light(g, x, yy, s * 1.15, C.gilt, 0.3 * hop * a);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = a * 0.6;
  g.drawImage(shade(), x - s * 0.78, yy - s * 0.64, s * 1.56, s * 1.56);
  g.globalAlpha = a;
  g.save();
  g.translate(x, yy);
  g.rotate(tip);
  g.scale((2 - sq) * u, sq * u);
  g.translate(-24, -26.5);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.drawImage(body(j), 0, 0, 48, 48);
  {
    g.save();
    g.clip(bodyPath(j));
    const bx = 24 + clamp((o.yaw || 0) * 150 + (A0[j][0] / RING) * 7, -22, 22);
    const gr = g.createLinearGradient(bx - 7, 20, bx + 3, 24);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,.1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 48, 48);
    g.restore();
  } // the band of light that glides across it as the view turns
  const fx = lx * 1.5;
  const fy = ly * 1.1;
  const mx = (w.mouth[0] + w.mouth[2]) / 2 + fx;
  const my = w.mouth[1] + fy;
  const open = hop * (0.3 + 0.7 * Math.abs(Math.sin(t * 12.5 + j)));
  w.eyes.forEach((e, n) => {
    const cx = e + fx + lx * 0.9;
    const cy = w.ey + fy + ly * 0.7;
    if ((w.wink && n === 1) || (o.glad || 0) > 0.5) {
      // a smiling eye: Jamie's wink, and anyone who is glad (it has just answered, or all of it has come together)
      g.strokeStyle = INK;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(cx - 2.5, cy + 0.7);
      g.quadraticCurveTo(cx, cy - 2, cx + 2.5, cy + 0.7);
      g.stroke();
      return;
    }
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(cx, cy, 2.55, 3.15 * lid, 0, 0, TAU);
    g.fill();
    if (lid > 0.45) {
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath();
      g.arc(cx - 0.85 + (o.yaw || 0) * 3, cy - 1.15 * lid, 0.95, 0, TAU);
      g.fill();
      g.fillStyle = rgba(mix(f.c, WHITE, 0.5), 0.6);
      g.beginPath();
      g.arc(cx + 0.9, cy + 1.25 * lid, 0.5, 0, TAU);
      g.fill();
    }
  });
  if (w.specs) {
    g.strokeStyle = '#1d2230';
    g.lineWidth = 1.5;
    for (const e of w.eyes) {
      g.beginPath();
      g.arc(e + fx, w.ey + fy, 5.4, 0, TAU);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(23.4 + fx, w.ey + fy);
    g.lineTo(24.6 + fx, w.ey + fy);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 0.9;
    for (const e of w.eyes) {
      g.beginPath();
      g.arc(e + fx, w.ey + fy, 4.3, -2.5, -1.75);
      g.stroke();
    }
  }
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 1.9;
  g.beginPath();
  g.moveTo(w.mouth[0] + fx, my);
  if (w.grin || open > 0.02) {
    g.quadraticCurveTo(mx, my + w.mouth[3] * 2 + open * 4.5, w.mouth[2] + fx, my);
    g.quadraticCurveTo(mx, my - open * 0.8, w.mouth[0] + fx, my);
    g.fill();
    g.stroke();
    if (open > 0.25) {
      g.fillStyle = 'rgba(255,128,140,.9)';
      g.beginPath();
      g.ellipse(mx, my + (w.mouth[3] + open * 2.2) * 0.74, 2.1, 0.9 * open + 0.3, 0, 0, TAU);
      g.fill();
    }
  } else {
    g.quadraticCurveTo(mx, my + w.mouth[3] * 2, w.mouth[2] + fx, my);
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'lighter';
  if (j === 0)
    light(
      g,
      x,
      yy - 22.3 * u * sq,
      s * (0.3 + 0.08 * Math.sin(t * 2.2) + 0.2 * hop),
      C.gilt,
      (0.5 + 0.25 * Math.sin(t * 2.2) + 0.25 * hop) * a,
    ); // Sam's lamp
  if (j === 2 && hop > 0) light(g, x - 0.5 * u, yy - 19 * u * sq, s * 0.5, C.gilt, 0.7 * hop * a); // Alex's bolt, when it is his turn
  if (j === 3)
    [
      [0, -24.5, C.gilt],
      [19.5, 6.5, [122, 215, 255]],
      [-19.5, 6.5, [182, 240, 156]],
    ].forEach(([sx, sy, c], n) => {
      const tw = 0.5 + 0.5 * Math.sin(t * 2.6 + n * 2.1);
      light(
        g,
        x + sx * u + Math.sin(t * 1.1 + n) * 1.5 * u,
        yy + sy * u + Math.cos(t * 1.3 + n * 2) * 1.5 * u,
        s * (0.1 + 0.09 * tw),
        c,
        (0.45 + 0.55 * tw) * a,
      );
    }); // Jamie's sparks
  g.globalCompositeOperation = 'source-over';
}
// THE ONE ASSISTANT: left flat and grey on purpose. No light on it, no shine, no smile, and it looks at nothing
function flatFace(g, x, y, s, t, a) {
  if (a <= 0.01) return;
  const lid = (t * 0.6 + 3.3) % 3.2 < 0.12 ? 0.15 : 1;
  g.save();
  g.translate(x, y);
  g.globalAlpha = a;
  g.fillStyle = 'rgb(128,138,158)';
  rr(g, -s * 0.5, -s * 0.5, s, s, s * 0.34);
  g.fill();
  g.fillStyle = '#1d2230';
  for (const dx of [-0.17, 0.17]) {
    g.beginPath();
    g.ellipse(dx * s, -s * 0.04, s * 0.06, s * 0.08 * lid, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = '#1d2230';
  g.lineWidth = s * 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-s * 0.13, s * 0.2);
  g.lineTo(s * 0.13, s * 0.2);
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

// ---- THE VIEW. Everything in the space is set down through it: tipped back, turned a little, and the nearer the larger. It sways
// slowly (two slow swings that never quite repeat) and leans toward the pointer. Returns (x, y, z) -> [x, y, how large, how near].
const EYE = 2200; // how far the eye is from the middle: the nearer, the stronger the depth
function viewAt(t, lean) {
  const pitch = 0.6 + 0.045 * Math.sin(t * 0.23 + 1) + lean[1] * 0.1;
  const yaw = 0.1 * Math.sin(t * 0.17) + 0.045 * Math.sin(t * 0.41 + 2) + lean[0] * 0.15;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const ct = Math.cos(yaw);
  const st = Math.sin(yaw);
  const V = (x, y, z = 0) => {
    const y1 = y * cp - z * sp;
    const z1 = y * sp + z * cp;
    const x2 = x * ct + z1 * st;
    const z2 = z1 * ct - x * st;
    const p = EYE / (EYE - z2);
    return [x2 * p, y1 * p, p, z2];
  };
  V.yaw = yaw;
  return V;
}

// ---- THE OPENING (the flight's first scene). A building at night with one window lit: the Family Office. The camera goes in through
// the window to a desk, to the person sitting at it, to their screen, and on the screen is this page with the film in it; it goes
// on into the film, and from there the film is simply the film. It is four pictures, each drawn inside a hole in the one before
// (the window, the screen, the film's place on the page), and ONE camera that never cuts. Units: 1000 across the frame.
const WIN = [150, 6, 92];
const SCR = [118, -44, 430];
const FILM = [248, 4, 450]; // each hole: its middle in the picture that holds it, and how wide it is there
const MARK = ['M16 3 3 10v3h26v-3z', 'M6 15h3v10H6zm8.5 0h3v10h-3zM23 15h3v10h-3z', 'M3 27h26v2H3z'];
const SWEATER = [84, 102, 168];
const SKIN = [242, 206, 172];
const CUP = [36, 132, 108];
// a curve through points that never overshoots them and is level at both ends: the camera eases away, and eases in
const through = (xs, ys, x) => {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = [0];
  for (let i = 1; i < n - 1; i++)
    m.push(
      d[i - 1] * d[i] <= 0
        ? 0
        : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]),
    );
  m.push(0);
  let i = 0;
  while (x > xs[i + 1]) i++;
  const s = (x - xs[i]) / h[i];
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * ys[i] +
    (s3 - 2 * s2 + s) * h[i] * m[i] +
    (-2 * s3 + 3 * s2) * ys[i + 1] +
    (s3 - s2) * h[i] * m[i + 1]
  );
};
const rrp = (x, y, w, h, r) => {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
};
// A SHAPE OF THE ROOM GIVEN THE BODY THE FIVE HAVE (js/avatar.js felt()): drawn once and kept, then set down where it is in each
// frame. r: how round its corners are; dx, dy: where the screen's light comes from
function form(g, key, x, y, w, h, r, c, dx, dy) {
  const pad = Math.max(w, h) * 0.08;
  const q = 2.4;
  let s = made['form-' + key];
  if (!s) {
    s = made['form-' + key] = document.createElement('canvas');
    s.width = Math.ceil((w + pad * 2) * q);
    s.height = Math.ceil((h + pad * 2) * q);
    const sg = s.getContext('2d');
    sg.scale(q, q);
    felt(sg, rrp(pad, pad, w, h, r), c, pad, pad, w, h, { light: [dx, dy], seed: key.length * 37 });
  }
  g.drawImage(s, x - pad, y - pad, w + pad * 2, h + pad * 2);
}
// THE BUILDING: the mark made solid. A gable with the mark's eye in it, the name on the beam, four columns lit from the left, three
// steps, dark windows; the one lit window is left open here, and the room is drawn in it
function outside(g, t) {
  let gr;
  g.globalCompositeOperation = 'lighter';
  for (let s = 0; s < 110; s++) {
    const x = (hash(s * 5 + 2) - 0.5) * 1500;
    const y = -640 + hash(s * 7 + 4) * 940;
    const a = (0.2 + 0.55 * Math.abs(Math.sin(t * (0.3 + hash(s) * 0.9) + s))) * (0.4 + hash(s * 3) * 0.6);
    const r = 0.9 + hash(s * 9) * 2;
    g.fillStyle = rgba(s % 9 === 0 ? C.warm : s % 5 === 0 ? C.ice : C.fog, a);
    g.fillRect(x, y, r, r);
  }
  g.save();
  g.translate(0, 334);
  g.scale(1, 0.16);
  light(g, 0, 0, 560, C.jade, 0.3);
  g.restore();
  g.globalCompositeOperation = 'source-over';
  gr = g.createLinearGradient(0, 330, 0, 560);
  gr.addColorStop(0, 'rgba(9,15,28,.96)');
  gr.addColorStop(1, 'rgba(5,7,12,0)');
  g.fillStyle = gr;
  g.fillRect(-760, 336, 1520, 230);
  for (const [hw, y] of [
    [336, 300],
    [354, 312],
    [372, 324],
  ]) {
    gr = g.createLinearGradient(0, y, 0, y + 13);
    gr.addColorStop(0, '#33446b');
    gr.addColorStop(1, '#172138');
    g.fillStyle = gr;
    g.fillRect(-hw, y, hw * 2, 13);
    g.fillStyle = 'rgba(198,214,255,.22)';
    g.fillRect(-hw, y, hw * 2, 1.4);
  }
  g.fillStyle = '#26365a';
  g.fillRect(-318, 286, 636, 14);
  gr = g.createLinearGradient(0, -62, 0, 286);
  gr.addColorStop(0, '#0b111f');
  gr.addColorStop(1, '#111b30');
  g.fillStyle = gr;
  g.fillRect(-292, -62, 584, 348);
  for (const [x, y] of [
    [-150, 6],
    [0, 6],
    [-150, 156],
    [150, 156],
  ]) {
    g.fillStyle = '#131e36';
    g.fillRect(x - 46, y - 46, 92, 92);
    g.fillStyle = 'rgba(198,214,255,.05)';
    g.beginPath();
    g.moveTo(x - 46, y + 10);
    g.lineTo(x + 10, y - 46);
    g.lineTo(x + 40, y - 46);
    g.lineTo(x - 46, y + 40);
    g.fill();
    g.strokeStyle = 'rgba(198,214,255,.2)';
    g.lineWidth = 2;
    g.strokeRect(x - 46, y - 46, 92, 92);
    g.beginPath();
    g.moveTo(x, y - 46);
    g.lineTo(x, y + 46);
    g.moveTo(x - 46, y);
    g.lineTo(x + 46, y);
    g.stroke();
  }
  gr = g.createLinearGradient(0, 132, 0, 286);
  gr.addColorStop(0, '#0f2a2c');
  gr.addColorStop(1, '#0a1620');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-40, 286);
  g.lineTo(-40, 172);
  g.arc(0, 172, 40, Math.PI, 0);
  g.lineTo(40, 286);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(52,211,153,.4)';
  g.lineWidth = 2;
  g.stroke();
  for (const x of [-225, -75, 75, 225]) {
    gr = g.createLinearGradient(x - 22, 0, x + 22, 0);
    gr.addColorStop(0, '#93a6d2');
    gr.addColorStop(0.38, '#5b6c98');
    gr.addColorStop(1, '#242f4b');
    g.fillStyle = gr;
    g.fillRect(x - 22, -48, 44, 320);
    g.fillStyle = 'rgba(8,10,40,.2)';
    for (const fx of [-9, 3, 13]) g.fillRect(x + fx, -44, 2.4, 312);
    gr = g.createLinearGradient(x - 31, 0, x + 31, 0);
    gr.addColorStop(0, '#a9b9de');
    gr.addColorStop(1, '#313e61');
    g.fillStyle = gr;
    rr(g, x - 31, -64, 62, 17, 4);
    g.fill();
    rr(g, x - 31, 270, 62, 17, 4);
    g.fill();
  }
  gr = g.createLinearGradient(0, -106, 0, -62);
  gr.addColorStop(0, '#4b5b88');
  gr.addColorStop(1, '#273256');
  g.fillStyle = gr;
  g.fillRect(-320, -106, 640, 44);
  g.fillStyle = rgba(C.fog, 0.92);
  g.font = '600 19px Figtree, "Avenir Next", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('F A M I L Y   O F F I C E', 0, -83);
  g.textAlign = 'start';
  gr = g.createLinearGradient(0, -250, 0, -106);
  gr.addColorStop(0, '#5a6c9a');
  gr.addColorStop(1, '#2b3860');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-340, -106);
  g.lineTo(0, -250);
  g.lineTo(340, -106);
  g.closePath();
  g.fill();
  g.fillStyle = '#121b31';
  g.beginPath();
  g.moveTo(-262, -118);
  g.lineTo(0, -228);
  g.lineTo(262, -118);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(198,214,255,.5)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-340, -106);
  g.lineTo(0, -250);
  g.stroke();
  g.fillStyle = rgb(C.jade);
  g.beginPath();
  g.arc(0, -158, 9, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  light(g, 0, -158, 54 + 8 * Math.sin(t * 1.25), C.jade, 0.6);
  g.globalCompositeOperation = 'source-over';
}
// THE ROOM behind the lit window: a lamp, a shelf (five books in the five's colours, and a plant), a desk with a screen, a keyboard
// and a cup on it, and the person: breathing, blinking, looking at the screen and lit by it, one hand tapping at the keys
function inside(g, t) {
  let gr = g.createLinearGradient(0, -500, 0, 500);
  gr.addColorStop(0, '#17223c');
  gr.addColorStop(1, '#0c1424');
  g.fillStyle = gr;
  g.fillRect(-500, -500, 1000, 1000);
  g.globalCompositeOperation = 'lighter';
  light(g, -400, -250, 560, C.warm, 0.2);
  light(g, SCR[0], SCR[1], 470, C.ice, 0.2 + 0.03 * Math.sin(t * 1.7));
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#080d18';
  g.fillRect(-500, 336, 1000, 164);
  g.fillStyle = 'rgba(198,214,255,.1)';
  g.fillRect(-500, 334, 1000, 2);
  g.fillStyle = '#2b3350';
  g.fillRect(-470, -318, 330, 10);
  FIVE.forEach((f, j) => {
    const tall = 58 + hash(j * 3 + 1) * 26;
    const x = -452 + j * 34;
    gr = g.createLinearGradient(x, 0, x + 26, 0);
    gr.addColorStop(0, rgb(mix(f.c, WHITE, 0.12)));
    gr.addColorStop(1, rgb(mix(f.c, NIGHT, 0.55)));
    g.fillStyle = gr;
    rr(g, x, -318 - tall, 26, tall, 4);
    g.fill();
  });
  g.fillStyle = '#3a4466';
  rr(g, -236, -352, 44, 34, 6);
  g.fill();
  g.strokeStyle = rgb(mix(C.jade, NIGHT, 0.2));
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const [dx, dy] of [
    [-22, -40],
    [2, -52],
    [24, -36],
  ]) {
    g.beginPath();
    g.moveTo(-214, -352);
    g.quadraticCurveTo(-214 + dx * 0.3, -352 + dy * 0.8, -214 + dx, -352 + dy + Math.sin(t * 0.8 + dx) * 2);
    g.stroke();
  }
  g.strokeStyle = '#3a4466';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-446, 336);
  g.lineTo(-446, -150);
  g.stroke();
  g.fillStyle = '#ffe9b8';
  g.beginPath();
  g.moveTo(-486, -150);
  g.lineTo(-406, -150);
  g.lineTo(-422, -214);
  g.lineTo(-470, -214);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'lighter';
  light(g, -446, -170, 240, C.warm, 0.5);
  g.globalCompositeOperation = 'source-over';
  const breath = Math.sin(t * 1.3) * 2;
  const ph = (t * 0.6 + 0.9) % 3.2;
  const lid = 1 - 0.9 * (ph < 0.2 ? Math.sin((ph / 0.2) * Math.PI) : 0);
  const hx = -334;
  const hy = -146 + Math.sin(t * 0.7) * 2 - breath * 0.5;
  g.fillStyle = '#1b2440';
  rr(g, -384, -30, 232, 300, 44);
  g.fill();
  form(g, 'torso', -356, 44 - breath, 204, 240, 78, SWEATER, 1, -0.2);
  form(g, 'head', hx, hy, 164, 164, 68, SKIN, 1, 0);
  g.fillStyle = '#3b2b3f';
  g.beginPath();
  g.moveTo(hx + 6, hy + 62);
  g.bezierCurveTo(hx - 6, hy - 22, hx + 96, hy - 44, hx + 150, hy + 20);
  g.bezierCurveTo(hx + 104, hy + 2, hx + 52, hy + 8, hx + 6, hy + 62);
  g.fill();
  for (const ex of [98, 136]) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(hx + ex, hy + 86, 7.5, 9.5 * lid, 0, 0, TAU);
    g.fill();
    if (lid > 0.45) {
      g.fillStyle = 'rgba(214,232,255,.95)';
      g.fillRect(hx + ex + 0.5, hy + 80, 4.4, 3.4);
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(hx + 96, hy + 116);
  g.quadraticCurveTo(hx + 118, hy + 132, hx + 140, hy + 116);
  g.stroke();
  gr = g.createRadialGradient(hx + 146, hy + 106, 0, hx + 146, hy + 106, 13);
  gr.addColorStop(0, 'rgba(255,96,128,.4)');
  gr.addColorStop(1, 'rgba(255,96,128,0)');
  g.fillStyle = gr;
  g.fillRect(hx + 132, hy + 92, 28, 28);
  gr = g.createLinearGradient(0, 178, 0, 212);
  gr.addColorStop(0, '#5a4648');
  gr.addColorStop(1, '#2b2126');
  g.fillStyle = gr;
  rr(g, -470, 178, 940, 32, 8);
  g.fill();
  g.fillStyle = 'rgba(255,238,208,.22)';
  g.fillRect(-462, 179, 924, 2);
  g.fillStyle = '#151422';
  g.fillRect(-448, 210, 896, 126);
  g.fillStyle = '#1a2136';
  g.fillRect(SCR[0] - 15, SCR[1] + 146, 30, 72);
  rr(g, SCR[0] - 66, 168, 132, 12, 6);
  g.fill();
  g.fillStyle = '#0a0e19';
  rr(g, SCR[0] - 229, SCR[1] - 150, 458, 300, 16);
  g.fill();
  g.strokeStyle = 'rgba(198,214,255,.25)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#2c3554';
  rr(g, -136, 162, 196, 15, 6);
  g.fill();
  g.fillStyle = 'rgba(198,214,255,.25)';
  g.fillRect(-130, 163, 184, 1.6);
  const tap = Math.max(0, Math.sin(t * 9)) * 3 * seg(Math.sin(t * 0.9), -0.4, 0);
  g.strokeStyle = rgb(mix(SWEATER, NIGHT, 0.18));
  g.lineWidth = 46;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-196, 122 - breath);
  g.quadraticCurveTo(-150, 176, -86, 158);
  g.stroke();
  form(g, 'hand', -98, 134 - tap, 44, 36, 16, SKIN, 1, -0.4);
  form(g, 'cup', 322, 132, 50, 46, 10, CUP, -1, -0.2);
  g.strokeStyle = rgb(mix(CUP, NIGHT, 0.3));
  g.lineWidth = 7;
  g.beginPath();
  g.arc(376, 154, 13, -1.2, 1.2);
  g.stroke();
  g.strokeStyle = 'rgba(233,238,245,.22)';
  g.lineWidth = 3;
  for (const sx of [336, 354]) {
    g.beginPath();
    for (let q = 0; q <= 8; q++)
      g[q ? 'lineTo' : 'moveTo'](sx + Math.sin(q * 0.9 + t * 1.6 + sx) * 5 * (q / 8), 126 - q * 8);
    g.stroke();
  }
}
// THE PAGE on the screen: this page. Its bar, its claim in its own face, its way in; the film's place on it is left open
function page(g) {
  g.fillStyle = '#05070c';
  g.fillRect(-500, -316, 1000, 632);
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, c] of [
    [-300, -150, [22, 52, 104]],
    [260, 210, [14, 112, 92]],
  ]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, 460);
    gr.addColorStop(0, rgba(c, 0.5));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(-500, -316, 1000, 632);
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(233,238,245,.12)';
  g.fillRect(-500, -262, 1000, 1.5);
  g.save();
  g.translate(-472, -303);
  g.scale(0.86, 0.86);
  g.fillStyle = rgb(C.jade);
  for (const p of made.mark || (made.mark = MARK.map((d) => new Path2D(d)))) g.fill(p);
  g.restore();
  g.textBaseline = 'middle';
  g.textAlign = 'start';
  g.fillStyle = rgb(C.fog);
  g.font = '700 17px Figtree, "Avenir Next", system-ui, sans-serif';
  g.fillText('Family Office', -436, -289);
  g.fillStyle = 'rgba(168,178,196,.5)';
  for (let n = 0; n < 5; n++) g.fillRect(96 + n * 58, -291, 40, 4);
  g.fillStyle = rgb(C.jade);
  rr(g, 408, -302, 64, 26, 13);
  g.fill();
  g.strokeStyle = 'rgba(52,211,153,.5)';
  g.lineWidth = 1.2;
  g.fillStyle = 'rgba(52,211,153,.09)';
  rr(g, -472, -204, 196, 28, 14);
  g.fill();
  g.stroke();
  g.fillStyle = rgb(C.jade);
  g.font = '600 10.5px Figtree, system-ui, sans-serif';
  g.fillText('ONE SYSTEM. ONE SOUL.', -452, -189.5);
  let x = -472;
  const put = (text, y, it) => {
    g.font = (it ? 'italic ' : '') + '400 50px "Instrument Serif", Georgia, serif';
    g.fillStyle = rgb(it ? C.jade : C.fog);
    g.fillText(text, x, y);
    x += g.measureText(text).width;
  };
  put('The first AI system ', -128, false);
  put('built by', -128, true);
  x = -472;
  put('and ', -76, false);
  put('modeled after', -76, true);
  x = -472;
  put('a real agentic RSI system.', -24, false);
  g.font = '400 15.5px Figtree, system-ui, sans-serif';
  g.fillStyle = 'rgba(233,238,245,.8)';
  [
    'Not one assistant. Five, sharing a soul that',
    'improves itself: they remember you, see what',
    'matters before they speak, and are wiser every day.',
  ].forEach((s, n) => g.fillText(s, -472, 30 + n * 23));
  g.fillStyle = rgb(C.jade);
  rr(g, -472, 112, 150, 40, 20);
  g.fill();
  g.fillStyle = '#04130d';
  g.font = '600 14px Figtree, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('Start your team', -397, 132.5);
  g.strokeStyle = 'rgba(233,238,245,.3)';
  rr(g, -310, 112, 130, 40, 20);
  g.stroke();
  g.fillStyle = rgb(C.fog);
  g.fillText('Meet its soul', -245, 132.5);
  g.textAlign = 'start';
}
// ITS CAMERA, and the three pictures drawn through it. u: how far into the scene. From the second turn of the film on, it first
// comes back out of the film the way it went in. It leaves the canvas clipped to the film's place on the page, and says where that
// is (e: its scale, and where its corner is), so that the film is then drawn there; after() puts the lit window's frame and glow on top
function opening(g, W, H, t, u, turn) {
  const k0 = Math.min(W, H) / 1000;
  const wide = W / Math.min(W, H);
  const r1 = WIN[2] / 1000;
  const r2 = SCR[2] / 1000;
  const Z0 = 0.9;
  const c0 = [0, 18];
  const c1 = [WIN[0], WIN[1]];
  const c2 = [c1[0] + SCR[0] * r1, c1[1] + SCR[1] * r1];
  const c3 = [c2[0] + FILM[0] * r1 * r2, c2[1] + FILM[1] * r1 * r2];
  const Z1 = (1.03 * wide) / r1;
  const Z2 = wide / (r1 * r2);
  const Z3 = W / (FILM[2] * r1 * r2 * k0);
  const Z = Math.exp(
    through(
      [0, 0.1, 0.27, 0.47, 0.57, 0.76, 0.83, 1],
      [
        Math.log(turn > 0 ? Z3 : Z0),
        Math.log(Z0),
        Math.log(Z0 * 1.2),
        Math.log(Z1),
        Math.log(Z1 * 1.12),
        Math.log(Z2),
        Math.log(Z2 * 1.1),
        Math.log(Z3),
      ],
      u,
    ),
  );
  const toward = (a, za, b, zb) => {
    const f = (1 / Z - 1 / zb) / (1 / za - 1 / zb);
    return [b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f];
  };
  const c = Z <= Z1 ? toward(c0, Z0, c1, Z1) : Z <= Z2 ? toward(c1, Z1, c2, Z2) : toward(c2, Z2, c3, Z3);
  const S0 = Z * k0;
  const S1 = S0 * r1;
  const S2 = S1 * r2;
  const X = (x) => W / 2 + (x - c[0]) * S0;
  const Y = (y) => H / 2 + (y - c[1]) * S0;
  const e0 = (FILM[2] * S2) / W;
  const fx = X(c2[0]) + FILM[0] * S2;
  const fy = Y(c2[1]) + FILM[1] * S2;
  const out = Z < Z1 * 1.05;
  if (out) {
    g.setTransform(S0, 0, 0, S0, X(0), Y(0));
    outside(g, t);
  }
  g.save();
  g.setTransform(S1, 0, 0, S1, X(c1[0]), Y(c1[1]));
  g.beginPath();
  g.rect(-500, -500, 1000, 1000);
  g.clip();
  if (Z < Z2 * 1.7) inside(g, t);
  g.setTransform(S2, 0, 0, S2, X(c2[0]), Y(c2[1]));
  g.beginPath();
  g.rect(-500, -316, 1000, 632);
  g.clip();
  page(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  {
    const R = ((e0 * Math.min(W, H)) / 2) * (1 + 0.6 * seg(e0, 0.7, 1));
    const gr = g.createRadialGradient(fx, fy, R * 0.9, fx, fy, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gr;
    g.beginPath();
    g.arc(fx, fy, R, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.arc(fx, fy, R, 0, TAU);
    g.clip();
  } // the film's place: a round hole right through, soft at its rim
  return {
    e: [e0, fx - (e0 * W) / 2, fy - (e0 * H) / 2],
    after() {
      if (!out) return;
      g.setTransform(S0, 0, 0, S0, X(0), Y(0));
      g.strokeStyle = 'rgba(255,238,208,.6)';
      g.lineWidth = 2.4;
      g.strokeRect(WIN[0] - 46, WIN[1] - 46, 92, 92);
      g.globalCompositeOperation = 'lighter';
      light(g, WIN[0], WIN[1], 150, C.warm, 0.34 * (1 - seg(Z, 1.6, 5)));
      g.globalCompositeOperation = 'source-over';
    },
  };
}

// ---- one frame. t: seconds into the film. fixed: a scene index when this canvas shows one scene only. dpr: screen pixels to a CSS
// pixel. lean: where the pointer is over the picture (-1 to 1 each way), which the view leans toward a little.
function draw(g, W, H, t, fixed, dpr, lean) {
  const n = fixed == null ? TOUR : SCENES.length;
  let i = fixed;
  let u;
  let turn;
  if (fixed == null) {
    const tt = ((t % LOOP) + LOOP) % LOOP;
    i = 0;
    while (i < n - 1 && tt >= STARTS[i + 1]) i++;
    u = (tt - STARTS[i]) / SCENES[i].d;
    turn = Math.floor(t / LOOP);
  } else {
    u = (t % SCENES[i].d) / SCENES[i].d;
    turn = Math.floor(t / SCENES[i].d);
  }
  const sc = SCENES[i];
  const prev = SCENES[(i + n - 1) % n];
  const moves = fixed == null && prev.id !== 'office';
  const flying = moves ? seg(u * sc.d, 0, 2) : 1;
  const fly = ease(flying);
  const speed = moves ? Math.sin(flying * Math.PI) : 0; // the scene after the opening begins where the opening ended: the camera is already there
  const breathe = 1 + Math.sin(t * 0.31) * 0.008;
  const pushIn = fixed == null ? 0.035 : 0;
  const push = sc.id === 'office' ? 0 : pushIn; // the camera is never quite still: it breathes, and through each scene of the flight it moves in a little
  const cam = [
    lerp(prev.cam[0], sc.cam[0], fly) + lean[0] * 8,
    lerp(prev.cam[1], sc.cam[1], fly) + lean[1] * 6 + Math.sin(t * 0.23) * 4,
    Math.exp(lerp(Math.log(prev.cam[2] * (1 + pushIn)), Math.log(sc.cam[2] * (1 + push * u)), fly)) *
      breathe *
      (fixed != null && (sc.id === 'chat' || sc.id === 'proof') ? 1.22 : 1),
  ]; // on its own, a scene with the five in it is drawn a fifth larger
  const k = (cam[2] * Math.min(W, H)) / 1000;
  const is = (id) => sc.id === id;
  const px = (13 * dpr) / k;
  const near = fixed != null ? 1 : seg(fly, 0.5, 0.9);
  const narrow = W / dpr < 560;
  const words = [];
  const V = viewAt(t, lean);
  const wordless = fixed == null; // the flight: the caption under it is the one text, so nothing is written in the picture
  const say = (x, y, text, a, c = C.fog, side = 1, o = {}) => {
    if (wordless && !o.signs) return;
    if (near > 0) words.push({ x, y, text, a: a * near, c, side, ...o, signs: wordless ? o.signs : null });
  };
  const inset = fixed == null ? 0.16 : 0.04;
  const box = [
    cam[0] - (W * (0.5 - inset)) / k,
    cam[1] - (H * (0.5 - (fixed == null ? 0.16 : 0.06))) / k,
    cam[0] + (W * (0.5 - inset)) / k,
    cam[1] + (H * (0.5 - (fixed == null ? 0.23 : 0.2))) / k,
  ]; // what of the picture can be read: its middle, clear of the faded edges and the caption
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  // in the opening the film is drawn inside the page that is on the screen that is in the room: e0 is its scale there, (e1, e2) its corner
  const op = fixed == null && sc.id === 'office' ? opening(g, W, H, t, u, turn) : null;
  const e0 = op ? op.e[0] : 1;
  const e1 = op ? op.e[1] : 0;
  const e2 = op ? op.e[2] : 0;
  g.setTransform(e0, 0, 0, e0, e1, e2);
  g.globalCompositeOperation = 'lighter';
  // the far stars, in three depths: they slide as the camera moves and as the view turns, twinkle, and streak outward while it flies
  for (let s = 0; s < 170; s++) {
    const d = 0.1 + hash(s * 3 + 1) * 0.6;
    const x =
      ((((hash(s + 11) * 1.3 * W - (cam[0] + V.yaw * 900) * k * d * 0.3) % (W * 1.3)) + W * 1.3) % (W * 1.3)) -
      W * 0.15;
    const y = ((((hash(s * 2 + 5) * 1.3 * H - cam[1] * k * d * 0.3) % (H * 1.3)) + H * 1.3) % (H * 1.3)) - H * 0.15;
    const a = (0.16 + 0.5 * Math.abs(Math.sin(t * (0.3 + hash(s) * 0.9) + s))) * (0.35 + d);
    const r = (0.5 + hash(s * 9) * 1.3) * (W / 520);
    const col = s % 9 === 0 ? C.warm : s % 5 === 0 ? C.ice : C.fog;
    if (speed > 0.08) {
      const dx = x - W / 2;
      const dy = y - H / 2;
      const m = Math.hypot(dx, dy) || 1;
      const len = speed * W * 0.03 * (d + 0.25);
      g.strokeStyle = rgba(col, a);
      g.lineWidth = r * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (dx / m) * len, y + (dy / m) * len);
      g.stroke();
    } else {
      g.fillStyle = rgba(col, a);
      g.fillRect(x, y, r, r);
    }
  }
  {
    const p = (t % 9) / 9;
    const x0 = hash(Math.floor(t / 9) + 3) * W * 0.7;
    const y0 = hash(Math.floor(t / 9) + 8) * H * 0.35;
    if (p < 0.12) {
      const q = p / 0.12;
      g.strokeStyle = rgba(C.fog, 0.7 * Math.sin(q * Math.PI));
      g.lineWidth = W / 420;
      g.beginPath();
      g.moveTo(x0 + q * W * 0.22, y0 + q * H * 0.1);
      g.lineTo(x0 + q * W * 0.22 - W * 0.07, y0 + q * H * 0.1 - H * 0.032);
      g.stroke();
    }
  } // a shooting star, now and then
  g.setTransform(k * e0, 0, 0, k * e0, e1 + (W / 2 - cam[0] * k) * e0, e2 + (H / 2 - cam[1] * k) * e0);

  // where the five are (each bobs a little on its own), and what this scene has them do. In the two scenes that set them beside one
  // assistant, the stage is dark first.
  const A = A0.map(([x, y], j) => {
    const p = V(x, y);
    return [p[0] + Math.sin(t * 0.5 + j * 2.3) * 3, p[1] + Math.sin(t * 0.8 + j * 1.7) * 5, p[2]];
  });
  const NOW = A[0];
  const chat = is('chat') ? u : 0;
  const proof = is('proof') ? u : 0;
  const five = is('five') ? u : 0;
  const team = chat || proof || five;
  const alone = chat || proof ? seg(team, 0.02, 0.08) * (1 - seg(team, 0.25, 0.33)) : 0; // five: the flight's own scene of them, with no lone assistant before it
  const turnOf = (j) => (five ? 0.2 + j * 0.14 : chat ? 0.36 + j * 0.112 : 0.36 + j * 0.116);
  const speaks = (j) => (team ? seg(team, turnOf(j), turnOf(j) + 0.03) * (1 - seg(team, 0.965, 1)) : 0);
  const vis = is('vision') ? u : 0;
  const hind = is('hindsight') ? u : 0;
  // who has the floor, as a share each (one hands over to the next across a moment, so eyes turn; they do not jump)
  const floor = FIVE.map((f, j) =>
    team
      ? seg(team, turnOf(j) - 0.015, turnOf(j) + 0.02) *
        (j < 4 ? 1 - seg(team, turnOf(j + 1) - 0.015, turnOf(j + 1) + 0.02) : 1 - seg(team, 0.95, 0.985))
      : j === 0
        ? bump(vis, 0.68, 0.96, 0.03)
        : 0,
  );
  const heard = Math.min(
    1,
    floor.reduce((a, b) => a + b, 0),
  );
  const talker = floor.reduce((p, w, j) => [p[0] + w * A[j][0], p[1] + w * A[j][1]], [0, 0]);

  // each of the five is joined to the soul. What it knows goes out to them (gold): faintly all the time, and plainly just before one speaks
  FIVE.forEach((f, j) => {
    const [x0, y0] = A0[j];
    const S = V((x0 * 74) / RING, (y0 * 74) / RING);
    const E = V((x0 * (RING - 72)) / RING, (y0 * (RING - 72)) / RING);
    const talking = team ? seg(team, turnOf(j) - 0.07, turnOf(j) - 0.03) : 0;
    g.strokeStyle = rgba(mix(C.fog, C.gilt, talking), (0.13 + 0.17 * talking) * (1 - alone));
    g.lineWidth = 1.2;
    g.setLineDash([2, 8]);
    g.beginPath();
    g.moveTo(S[0], S[1]);
    g.lineTo(E[0], E[1]);
    g.stroke();
    g.setLineDash([]);
    const q = (t * 0.13 + j * 0.21) % 1;
    light(
      g,
      lerp(S[0], E[0], q),
      lerp(S[1], E[1], q),
      11 * lerp(S[2], E[2], q),
      C.gilt,
      0.5 * Math.sin(q * Math.PI) * (1 - alone),
    );
    if (team) {
      const reach = seg(team, turnOf(j) - 0.05, turnOf(j) + 0.005);
      if (reach > 0 && reach < 1)
        signal(
          g,
          [
            [S[0], S[1]],
            [E[0], E[1]],
          ],
          reach,
          C.gilt,
          Math.sin(reach * Math.PI) * 0.6 + 0.4,
          2.4,
        );
    }
  });

  // ---- THE SOUL
  const learnedNow = Math.min(
    LEARNED.length,
    fixed == null ? turn + (i > AT.hindsight ? 1 : 0) : is('hindsight') ? turn : 2,
  );
  const lesson = Math.min(turn, LEARNED.length - 1) % LEARNED.length;
  const landed = seg(hind, 0.7, 0.78);
  const done = proof ? seg(proof, 0.9, 0.94) * (1 - seg(proof, 0.975, 1)) : 0;
  const meet = vis ? bump(vis, 0.64, 0.74, 0.03) : 0;
  const boost = (hind ? Math.sin(seg(hind, 0.7, 0.97) * Math.PI) : 0) + done * 0.6 + meet * 0.7;
  const rot = t * 0.022;
  const pulse = 1 + 0.05 * Math.sin(t * 1.25) + boost * 0.24;
  const P = MEM.map((m) => {
    const r = m.r + Math.sin(t * 0.5 + m.w * 9) * 4;
    return V(Math.cos(m.a + rot) * r, Math.sin(m.a + rot) * r, m.z + Math.sin(t * 0.4 + m.w * 20) * 6);
  });
  const lit = (j) =>
    SEEN.includes(j)
      ? seg(vis, 0.25 + SEEN.indexOf(j) * 0.06, 0.34 + SEEN.indexOf(j) * 0.06) * (1 - seg(vis, 0.95, 1))
      : 0;
  const told = (n2) => (is('soul') ? bump(u, 0.16 + n2 * 0.105, 0.42 + n2 * 0.105) : 0); // in the soul's own scene the lights say, a few at a time, what they are
  g.lineWidth = 0.8;
  for (const [a, b] of LINKS) {
    const born = is('soul') ? Math.max(1 - seg(u, 0, 0.05), seg(u, 0.06 + (a % 40) / 90, 0.26 + (a % 40) / 90)) : 1;
    g.strokeStyle = rgba(
      C.fog,
      (0.1 + 0.25 * Math.max(lit(a), lit(b))) * born * Math.min(1, (P[a][2] + P[b][2]) * 0.5),
    );
    g.beginPath();
    g.moveTo(P[a][0], P[a][1]);
    g.lineTo(P[b][0], P[b][1]);
    g.stroke();
  }
  // it is never quite idle: here and there a signal crosses from one light to the next
  for (let s = 0; s < 5; s++) {
    const clock = t / 1.9 + s * 0.37;
    const q = clock % 1;
    const [a, b] = LINKS[Math.floor(hash(Math.floor(clock) * 7 + s * 13) * LINKS.length)];
    const f = Math.sin(q * Math.PI);
    g.strokeStyle = rgba(C.ice, 0.5 * f);
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(P[a][0], P[a][1]);
    g.lineTo(P[b][0], P[b][1]);
    g.stroke();
    light(g, lerp(P[a][0], P[b][0], q), lerp(P[a][1], P[b][1], q), 12, C.ice, 0.9 * f);
  }
  // what hindsight has kept: the ways in that were learned stay gold, with a slow shimmer going down each to the core. The one being
  // learned in this scene comes up as its signal reaches the core, so that it is simply there when the scene ends
  for (let w = 0; w < Math.min(LEARNED.length, learnedNow + (hind ? 1 : 0)); w++) {
    const here = w < learnedNow ? 1 : seg(hind, 0.86, 0.97);
    const pts = [...LEARNED[w].map((j) => P[j]), [0, 0]];
    g.strokeStyle = rgba(C.gilt, 0.34 * here);
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    g.beginPath();
    pts.forEach((p, n2) => g[n2 ? 'lineTo' : 'moveTo'](p[0], p[1]));
    g.stroke();
    light(g, pts[0][0], pts[0][1], 16, C.gilt, 0.7 * here);
    const q = (t * 0.11 + w * 0.29) % 1;
    const at = q * (pts.length - 1);
    const n2 = Math.min(pts.length - 2, Math.floor(at));
    light(
      g,
      lerp(pts[n2][0], pts[n2 + 1][0], at - n2),
      lerp(pts[n2][1], pts[n2 + 1][1], at - n2),
      12,
      C.gilt,
      0.8 * Math.sin(q * Math.PI) * here,
    );
  }
  // its hoops: three thin rings round the core, each turning about an axis of its own, like the rings of an instrument for reading
  // the sky. The half of a hoop that is behind the core is drawn before it, and fainter; the half in front, after it
  const hoops = [0, 1, 2].map((o) => {
    const R = 96 + o * 36;
    const ax = 1.1 + o * 1.05 + t * (0.19 + o * 0.05);
    const az = o * 2.1 + t * (0.06 + o * 0.025);
    const ca = Math.cos(ax);
    const sa = Math.sin(ax);
    const cz = Math.cos(az);
    const sz = Math.sin(az);
    const on = (b) => {
      const x = R * Math.cos(b);
      const y = R * Math.sin(b) * ca;
      return V(x * cz - y * sz, x * sz + y * cz, R * Math.sin(b) * sa);
    };
    return { pts: Array.from({ length: 49 }, (_, n2) => on((n2 * TAU) / 48)), bead: on(t * (0.8 - o * 0.17) + o * 2) };
  });
  const hoop = (h, front) => {
    g.strokeStyle = rgba(C.ice, (front ? 0.36 : 0.13) + boost * 0.1);
    g.lineWidth = front ? 1.3 : 0.8;
    g.beginPath();
    for (let n2 = 0; n2 < 48; n2++) {
      const a = h.pts[n2];
      const b = h.pts[n2 + 1];
      if (a[3] + b[3] > 0 !== front) continue;
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.stroke();
    const near2 = clamp(0.5 + h.bead[3] / 60);
    light(
      g,
      h.bead[0],
      h.bead[1],
      lerp(6, 12, near2) * h.bead[2],
      C.fog,
      h.bead[3] > 0 === front ? lerp(0.35, 1, near2) : 0,
    );
  };
  hoops.forEach((h) => hoop(h, false));
  for (let j = 0; j < 10; j++) {
    const a = (j * TAU) / 10 + t * 0.04;
    const len = 230 + 70 * Math.sin(t * 0.6 + j * 1.3);
    g.fillStyle = rgba(j % 2 ? C.ice : C.mint, 0.028 * pulse);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a - 0.045) * len, Math.sin(a - 0.045) * len);
    g.lineTo(Math.cos(a + 0.045) * len, Math.sin(a + 0.045) * len);
    g.fill();
  } // its rays
  // the lights: the nearer, the larger and the brighter
  MEM.forEach((m, j) => {
    const tw = 0.55 + 0.45 * Math.sin(t * (1 + m.w) + m.w * 30);
    const n2 = SAID.findIndex((x) => x[0] === j);
    const l = Math.max(lit(j), n2 >= 0 ? told(n2) : 0);
    const p = P[j][2];
    light(
      g,
      P[j][0],
      P[j][1],
      (5 + m.s * 3.1) * (1 + l * 2.2) * p * p,
      l > 0 ? C.gilt : m.c,
      (0.46 + 0.4 * tw) * (1 + l) * clamp(0.5 + (p - 0.88) * 2.2, 0.42, 1.2),
    );
  });
  light(g, 0, 0, 200 * pulse, C.sky, 0.34);
  light(g, 0, 0, 124 * pulse, C.ice, 0.5);
  light(g, 0, 0, 70 * pulse, C.fog, 0.9);
  // the core: a lit sphere. Bands of brighter light go round it, and a brighter patch rides each band across its face and round the back
  {
    const R = 38 * pulse;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(orb(), -R, -R, R * 2, R * 2);
    g.save();
    g.beginPath();
    g.arc(0, 0, R * 0.97, 0, TAU);
    g.clip();
    g.rotate(-0.42 + Math.sin(t * 0.13) * 0.14 + V.yaw);
    g.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const lat = (b - 1) * 0.55;
      const cy = Math.sin(lat) * R;
      const rx = Math.cos(lat) * R;
      const ry = rx * 0.3;
      const s = t * (0.5 + b * 0.13) + b * 2.1;
      const front = Math.sin(s);
      g.strokeStyle = rgba(C.fog, 0.2);
      g.lineWidth = R * 0.07;
      g.beginPath();
      g.ellipse(0, cy, rx, ry, 0, 0, Math.PI);
      g.stroke();
      if (front > 0) light(g, Math.cos(s) * rx, cy + front * ry, R * 0.36 * (0.5 + 0.5 * front), C.fog, 0.85 * front);
    }
    g.restore();
    g.globalCompositeOperation = 'lighter';
    light(g, -R * 0.3, -R * 0.34, R * 0.7, C.fog, 0.5);
    for (let s = 0; s < 4; s++) {
      const a = (s * TAU) / 4 + 0.2 + Math.sin(t * 0.11) * 0.1 + V.yaw * 0.5;
      const len = (s % 2 ? 110 : 180) * pulse;
      const wx = Math.cos(a + TAU / 4) * 2.4;
      const wy = Math.sin(a + TAU / 4) * 2.4;
      g.fillStyle = rgba(C.fog, 0.15 + boost * 0.1);
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(-wx, -wy);
      g.fill();
    }
  } // and four fine points, as a bright star has through a lens
  hoops.forEach((h) => hoop(h, true));
  if (boost > 0.02 && (hind || proof)) {
    const q = hind ? seg(hind, 0.7, 0.97) : seg(proof, 0.9, 0.99);
    for (let ring = 0; ring < 2; ring++) {
      const qq = clamp(q * 1.25 - ring * 0.25);
      if (qq <= 0) continue;
      g.strokeStyle = rgba(hind ? C.gilt : C.jade, 0.55 * (1 - qq));
      g.lineWidth = 3 * (1 - qq) + 0.5;
      g.beginPath();
      g.ellipse(0, 0, 60 + qq * 340, (60 + qq * 340) * 0.88, 0, 0, TAU);
      g.stroke();
    }
  } // the soul takes in what was learned, or what was proven: rings go out through it
  SAID.forEach(([j, text, drawn], n2) => {
    const a = Math.max(told(n2), lit(j));
    say(
      P[j][0],
      P[j][1] + (narrow ? clamp(P[j][1] / 40, -1, 1) * px * 1.7 : 0),
      text,
      a,
      C.gilt,
      narrow ? 0 : clamp(P[j][0] / 30, -1, 1) * (1 - 2 * seg(Math.abs(P[j][0]), 130, 170)),
      { pop: 0.7 + 0.3 * spring(a), signs: [drawn] },
    );
  });

  // ---- VISION: someone asks; the eye opens; from each thing that bears on it a signal runs inward along the hairlines; they meet at
  // the core; one goes out to the one who is about to answer; the answer forms
  if (vis > 0) {
    const open = out(seg(vis, 0.1, 0.26)) * (1 - seg(vis, 0.95, 1));
    const ans = seg(vis, 0.78, 0.86) * (1 - seg(vis, 0.96, 1));
    g.strokeStyle = rgba(C.fog, 0.34 * open);
    g.lineWidth = 1.4;
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(-340, 0);
      g.quadraticCurveTo(0, sgn * 240 * open, 340, 0);
      g.stroke();
    }
    SEEN_WAYS.forEach((way, n2) =>
      signal(
        g,
        [...way.map((j) => P[j]), [0, 0]],
        ease(seg(vis, 0.36 + n2 * 0.05, 0.62 + n2 * 0.05)),
        C.gilt,
        open,
        2.2,
      ),
    );
    const d = Math.hypot(NOW[0], NOW[1]);
    signal(
      g,
      [
        [(NOW[0] / d) * 60, (NOW[1] / d) * 60],
        [NOW[0], NOW[1] + SIZE * NOW[2] * 0.56 + px * 2],
      ],
      ease(seg(vis, 0.68, 0.79)),
      C.gilt,
      open,
      3,
    );
    light(g, NOW[0], NOW[1], 70 + 60 * ans, C.gilt, 0.55 * ans);
    say(
      narrow ? NOW[0] : NOW[0] - 54,
      narrow ? NOW[1] - SIZE * NOW[2] * 1.14 - px * 1.2 : NOW[1] - 8,
      '“Dinner on Saturday?”',
      open * (1 - ans * (narrow ? 1 : 0.3)),
      C.fog,
      narrow ? 0 : -1,
      { big: !narrow, up: true, slot: narrow ? 'ask' : '', pop: spring(seg(vis, 0.1, 0.2)), signs: ['plate', 'ask'] },
    );
    say(
      narrow ? NOW[0] : NOW[0] + 54,
      narrow ? NOW[1] - SIZE * NOW[2] * 1.14 - px * 1.2 : NOW[1] - 8,
      'a vegetarian place in Porto',
      ans,
      C.gilt,
      narrow ? 0 : 1,
      {
        big: !narrow,
        up: true,
        slot: narrow ? 'ask' : '',
        pop: spring(seg(vis, 0.78, 0.88)),
        signs: ['plate', 'leaf', 'pin'],
      },
    );
  }

  // ---- HINDSIGHT: what was learned leaves the one who answered and comes back along its own trail. It lands on a light, the way in
  // from that light to the core is drawn in gold, and it stays: that is what the film shows of "wiser"
  if (hind > 0) {
    const way = LEARNED[lesson];
    const m = MEM[way[0]];
    const home = P[way[0]];
    const flat = [Math.cos(m.a + rot) * m.r, Math.sin(m.a + rot) * m.r];
    const q = ease(seg(hind, 0.18, 0.7));
    const pos = (v) => {
      const b = bez(A0[0], [470, -430], [520, 130], flat, v);
      return V(b[0], b[1], m.z * v);
    };
    const head = pos(q);
    const said = LESSONS[lesson % LESSONS.length];
    for (let s = 30; s >= 0; s--) {
      const v = q - s * 0.011;
      if (v < 0) continue;
      const p = pos(v);
      const f = 1 - s / 31;
      light(g, p[0], p[1], 6 + 22 * f * (1 - landed * 0.7), s ? C.gilt : C.fog, f * f * (1 - landed));
    }
    if (landed > 0) {
      light(g, home[0], home[1], 22 + 30 * Math.sin(seg(hind, 0.7, 0.95) * Math.PI), C.gilt, 0.95 * landed);
      for (let s = 0; s < 9; s++) {
        const a = (s * TAU) / 9 + 1;
        const qq = seg(hind, 0.7, 0.86);
        light(g, home[0] + Math.cos(a) * qq * 62, home[1] + Math.sin(a) * qq * 62, 7 * (1 - qq), C.gilt, 1 - qq);
      } // it lands, and throws off sparks
      signal(g, [...way.map((j) => P[j]), [0, 0]], ease(seg(hind, 0.76, 0.95)), C.gilt, 1 - seg(hind, 0.96, 1), 2.6);
    }
    say(head[0], head[1] - px * 1.8, said[0], bump(hind, 0.1, 0.7, 0.06), C.fog, -clamp((head[0] - 200) / 50, -1, 1), {
      big: true,
      pop: spring(seg(hind, 0.1, 0.2)),
    });
    say(home[0], home[1] + px * 2, said[1], bump(hind, 0.74, 0.99, 0.05), C.gilt, -clamp(home[0] / 40, -1, 1), {
      big: true,
      pop: spring(seg(hind, 0.74, 0.84)),
    });
  }

  // ---- THE FIVE, each with its name. In their two scenes each takes its turn: the soul reaches it, it hops, a ring goes out from
  // it, and it says its piece; the others turn to look at it. With nobody speaking, they look toward the soul
  g.globalCompositeOperation = 'source-over';
  FIVE.forEach((f, j) => {
    const [x, y, p] = A[j];
    const on = speaks(j);
    const hid =
      (1 - seg(y, box[3] - 30, box[3] + 30)) *
      seg(y, box[1] - 20, box[1] + 40) *
      seg(x, box[0] - 70, box[0] - 10) *
      (1 - seg(x, box[2] + 10, box[2] + 70));
    const t0 = turnOf(j);
    const mine = team ? bump(team, t0, t0 + 0.09, 0.012) : 0;
    const answering = j === 0 ? bump(vis, 0.7, 0.96, 0.02) : 0;
    const hop = Math.max(mine, answering);
    const own = floor[j];
    const s = SIZE * p * (1 + 0.12 * hop);
    const lx = ((talker[0] - x * heard) / 300) * (1 - own) + (-x / RING) * 0.45 * (1 - heard);
    const ly =
      ((talker[1] - y * heard) / 300) * (1 - own) +
      (-y / RING) * 0.45 * (1 - heard) +
      Math.sin(t * 0.37 + j * 2.6) * 0.12 * (1 - heard);
    if (team) {
      const ring = seg(team, t0, t0 + 0.07);
      if (ring > 0 && ring < 1) {
        g.strokeStyle = rgba(f.c, 0.7 * (1 - ring));
        g.lineWidth = 2.4 * (1 - ring) + 0.4;
        g.beginPath();
        g.arc(x, y, s * 0.55 + ring * 60, 0, TAU);
        g.stroke();
      }
    }
    face(g, j, x, y, s, t, {
      a: (1 - alone * 0.92) * hid,
      hop,
      beat: (team ? team - t0 : vis - 0.7) * sc.d * 6.2,
      lx,
      ly,
      yaw: V.yaw,
      // THE FILM'S FIVE SHOW IT TOO: glad once each has said its part, when the answer fits, and when it is all one
      glad: is('all')
        ? seg(u, 0.12, 0.3)
        : j === 0 && vis
          ? seg(vis, 0.84, 0.9)
          : team
            ? seg(team, t0 + 0.1, t0 + 0.14)
            : 0,
    });
    g.globalAlpha = (1 - alone) * 0.9 * hid;
    g.font = '600 ' + px * 0.95 + 'px Figtree, "Avenir Next", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = rgba(C.fog, 0.82);
    if (!wordless) g.fillText(f.name, x, y + s * 0.52 + px * 0.66);
    g.textAlign = 'start';
    g.globalAlpha = 1;
    if (team) {
      const hold = narrow ? bump(team, t0, t0 + 0.14, 0.025) : on;
      say(
        x,
        y - s * (j === 1 || j === 4 ? 0.7 : 0.98) - px * 1.1,
        chat ? f.says : proof ? f.does : f.will,
        hold,
        proof ? f.tone : C.fog,
        0,
        { big: !narrow, up: true, pop: spring(seg(team, t0, t0 + 0.06)), signs: [f.sign] },
      );
    }
  });
  g.globalCompositeOperation = 'lighter';
  // in the engineers' scene the change itself passes round the ring from one to the next, leaving a trail
  if (proof)
    for (let j = 0; j < 4; j++) {
      const q = seg(proof, turnOf(j) + 0.05, turnOf(j + 1));
      if (q <= 0 || q >= 1) continue;
      const col = j === 0 ? C.fog : j === 1 ? C.garnet : C.jade;
      for (let s = 0; s < 7; s++) {
        const a = lerp(angleOf(j), angleOf(j + 1), ease(clamp(q - s * 0.03)));
        const p = V(Math.cos(a) * RING, Math.sin(a) * RING);
        light(g, p[0], p[1], (24 - s * 2.6) * p[2], col, (1 - s / 7) * Math.sin(q * Math.PI) ** 0.35);
      }
    }

  // ---- THE PROOF, under the soul: the checks of one change, as five small tiles. Unset, then red (the test fails first: they
  // shake), then green (the same test passes), then a tick on each, and sparks
  if (proof) {
    const red = seg(proof, turnOf(1) + 0.02, turnOf(1) + 0.08);
    const green = seg(proof, turnOf(2) + 0.03, turnOf(2) + 0.09);
    const show = seg(proof, 0.35, 0.41) * (1 - seg(proof, 0.97, 1));
    g.globalCompositeOperation = 'source-over';
    for (let c = 0; c < 5; c++) {
      const r2 = seg(red, c * 0.12, c * 0.12 + 0.5);
      const g2 = seg(green, c * 0.12, c * 0.12 + 0.5);
      const col = g2 > 0 ? mix(C.garnet, C.jade, g2) : mix(C.smoke, C.garnet, r2);
      const shake =
        r2 > 0 && g2 === 0
          ? Math.sin(t * 38 + c) * 2.2 * Math.sin(seg(proof, turnOf(1) + 0.02, turnOf(2) + 0.03) * Math.PI)
          : 0;
      const grow = 1 + 0.18 * Math.sin(clamp(g2) * Math.PI);
      const sz = 34 * grow;
      const x0 = -101 + c * 42 + shake - (sz - 34) / 2;
      const y0 = 236 - (sz - 34) / 2;
      const al = (0.4 + 0.55 * Math.max(r2, g2)) * show;
      g.fillStyle = rgba(col, al);
      rr(g, x0, y0, sz, sz, 9);
      g.fill();
      g.fillStyle = rgba(WHITE, 0.2 * al);
      rr(g, x0 + 2.5, y0 + 2.5, sz - 5, sz * 0.42, 6.5);
      g.fill();
      g.fillStyle = rgba(NIGHT, 0.22 * al);
      rr(g, x0 + 2.5, y0 + sz * 0.66, sz - 5, sz * 0.34 - 2.5, 4);
      g.fill();
    } // each tile has a lit top and a shaded foot
    if (done > 0) {
      g.strokeStyle = rgba(C.fog, done);
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let c = 0; c < 5; c++) {
        const x0 = -101 + c * 42;
        const d2 = seg(proof, 0.9 + c * 0.008, 0.93 + c * 0.008);
        if (d2 <= 0) continue;
        g.beginPath();
        g.moveTo(x0 + 9, 254);
        g.lineTo(lerp(x0 + 9, x0 + 15, seg(d2, 0, 0.4)), lerp(254, 261, seg(d2, 0, 0.4)));
        if (d2 > 0.4) g.lineTo(lerp(x0 + 15, x0 + 26, seg(d2, 0.4, 1)), lerp(261, 246, seg(d2, 0.4, 1)));
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'lighter';
    light(g, 0, 253, 180 * done, C.jade, 0.45 * done);
    {
      const q = seg(proof, 0.915, 0.985);
      if (q > 0 && q < 1)
        for (let s = 0; s < 14; s++) {
          const a = (s * TAU) / 14 + 0.3;
          const r2 = 40 + q * (120 + hash(s) * 90);
          light(g, Math.cos(a) * r2, 253 + Math.sin(a) * r2 * 0.7, 9 * (1 - q), s % 3 ? C.jade : C.gilt, 1 - q);
        }
    }
    say(0, 236 + 34 + px * 1.6, 'proven', done, C.jade, 0, { big: true, pop: spring(seg(proof, 0.9, 0.96)) });
  }

  // ---- ONE ASSISTANT, ALONE. The stage goes dark; there is one grey face, with one flat answer. Then the soul comes up behind it.
  if (alone > 0) {
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(5,7,12,' + (0.86 * alone).toFixed(3) + ')';
    g.fillRect(box[0] - 600, box[1] - 600, box[2] - box[0] + 1200, box[3] - box[1] + 1200);
    const a = bump(team, 0.06, 0.31, 0.04);
    flatFace(g, 0, 0, 96, t, a);
    g.globalAlpha = a * 0.85 * near;
    g.font = '600 ' + px + 'px Figtree, "Avenir Next", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = rgba(C.smoke, 1);
    g.fillText('one assistant', 0, 68 + px);
    g.textAlign = 'start';
    g.globalAlpha = 1;
    say(
      0,
      -70 - px,
      chat ? 'Here are 10 ideas for your Saturday.' : 'Done. It works.',
      bump(team, 0.1, 0.31, 0.04),
      C.smoke,
      0,
      { big: true, up: true },
    );
    if (proof) say(0, 68 + px * 3.6, 'a claim', bump(team, 0.16, 0.31, 0.04), C.smoke, 0);
  }
  if (team)
    say(
      0,
      -134,
      chat ? '“A Saturday with Mia?”' : proof ? '“Fix the checkout total.”' : '“Can you help me with this?”',
      bump(team, 0.04, 0.97, 0.04),
      C.fog,
      0,
      { big: true, fill: 'rgba(40,52,84,.92)', pop: spring(seg(team, 0.04, 0.12)), signs: ['ask'] },
    ); // what the person asked, in both halves of the scene

  // as the film is first met (the end of the opening, the start of the scene after it) two things in it are named
  {
    const meet = is('office') ? seg(u, 0.87, 0.94) : is('five') && fixed == null ? 1 - seg(u, 0.05, 0.09) : 0;
    if (meet > 0) {
      const j = SAID[4][0];
      say(0, 66, 'the soul', meet, C.ice, 0, { big: true });
      say(P[j][0], P[j][1] + px * 1.7, 'something it knows about you', meet, C.fog, 0);
    }
  }
  setWords(g, words, px, box);
  g.globalCompositeOperation = 'source-over';
  if (op) {
    g.restore();
    op.after();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return i + Math.min(0.999, u);
}

export function mountUniverse(canvas, { scene = 'tour', onScene = null, onBeat = null } = {}) {
  const g = canvas.getContext('2d');
  if (!g) return { seek() {}, stop() {} };
  const fixed =
    scene === 'tour'
      ? null
      : Math.max(
          0,
          SCENES.findIndex((s) => s.id === scene),
        );
  const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // a page address may hold the film still at a moment (?uni=seconds), which is how its pictures are taken
  const held = Number(new URLSearchParams(location.search).get('uni'));
  const hold = Number.isFinite(held) && location.search.includes('uni=') ? held : null;
  let raf = 0;
  let on = false;
  let t0 = performance.now();
  let offset = 0;
  let last = -1;
  let beat = -1;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let quality = 1;
  let slow = 0;
  let counted = 0;
  let before = 0;
  const lean = [0, 0];
  const want = [0, 0];
  const size = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1) * quality;
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    if (w !== W || h !== H) {
      W = canvas.width = w;
      H = canvas.height = h;
    }
  };
  const cost = (canvas.__uni = { ms: 0, frames: 0, at: (t) => paint(t) }); // what drawing has cost so far, and the frame at any moment, for whoever measures it
  const paint = (t, dt = 16.7) => {
    size();
    const pull = 1 - Math.pow(0.94, dt / 16.7);
    lean[0] += (want[0] - lean[0]) * pull;
    lean[1] += (want[1] - lean[1]) * pull;
    const began = performance.now();
    const r = draw(g, W, H, t, fixed, dpr, lean);
    const i = Math.floor(r);
    cost.ms += performance.now() - began;
    cost.frames++;
    cost.quality = quality;
    if (i !== last) {
      last = i;
      beat = -1;
      if (onScene) onScene(i, SCENES[i]);
    }
    const bs = SCENES[i].beats;
    if (bs && onBeat) {
      let b = 0;
      while (b < bs.length - 1 && r - i >= bs[b + 1][0]) b++;
      if (b !== beat) {
        beat = b;
        onBeat(i, b, bs[b][1]);
      }
    }
  }; // the scene, and the step of it, are told to the page when they change
  const best = (i) =>
    (({ five: 0.86, vision: 0.88, hindsight: 0.5, soul: 0.5, all: 0.75, chat: 0.93, proof: 0.945 })[SCENES[i].id] ||
      0.72) * SCENES[i].d; // the moment of a scene that says most
  const still = () => paint(hold != null ? hold : fixed == null ? STARTS[AT.vision] + best(AT.vision) : best(fixed)); // held still, the flight shows Vision at its height: a question, what is known, the answer
  // ITS OWN PACE: over each forty frames, if they came slower than 25 a second, the picture is drawn smaller (and the words keep their size)
  const tick = (now) => {
    if (!on) return;
    const dt = before ? Math.min(100, now - before) : 16.7;
    if (before && now - before < 400) {
      slow += now - before;
      if (++counted >= 40) {
        if (slow / counted > 40 && quality > 0.45) quality = Math.max(0.45, quality * 0.7);
        slow = counted = 0;
      }
    }
    before = now;
    paint(offset + (performance.now() - t0) / 1000, dt);
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (on || calm || hold != null) return;
    on = true;
    before = 0;
    t0 = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!on) return;
    offset += (performance.now() - t0) / 1000;
    on = false;
    cancelAnimationFrame(raf);
  };
  still();
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => {
      if (!on) still();
    }); // the words are drawn again once the page's own face has arrived
  if (calm || hold != null) {
    window.addEventListener('resize', still);
    return {
      seek(i) {
        last = -1;
        paint(STARTS[i] + best(i));
      },
      stop() {},
    };
  }
  // the view leans a little toward the pointer, where there is one
  if (fixed == null && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    const host = canvas.parentElement || canvas;
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      want[0] = clamp((e.clientX - r.left) / r.width, 0, 1) * 2 - 1;
      want[1] = clamp((e.clientY - r.top) / r.height, 0, 1) * 2 - 1;
    });
    host.addEventListener('pointerleave', () => {
      want[0] = want[1] = 0;
    });
  }
  if ('IntersectionObserver' in window)
    new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting && !document.hidden) start();
          else stop();
        }
      },
      { threshold: 0.15 },
    ).observe(canvas);
  else start();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else {
      const r = canvas.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) start();
    }
  });
  return {
    seek(i) {
      offset = STARTS[i] + 0.01;
      t0 = performance.now();
    },
    stop,
  };
}
