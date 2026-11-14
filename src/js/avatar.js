// avatar.js - THE FIVE, DRAWN ONCE, FOR EVERYWHERE. The film on the landing page (js/universe.js) and every place the app shows a
// seat (js/ui.js: the group chat in either mode, who is here, the team on the landing page, a name being picked) take the body of
// each character from here, so a seat looks the same wherever it is met.
// The body is a soft thing with a TEXTURE (after the play-dough creatures of a style studied at styles.refero.design, "Obviously":
// chubby, matt, a little fuzzy at the edge): it is lit from above and to the left and shaded below and to the right, its surface is
// laid with short fibres, lighter where the light falls and darker where it does not, and its outline is not a line but fibres
// standing out from it. Nothing on it shines. It is drawn once for each size asked for, and kept.
//   felt(g, path, colour, x, y, w, h, { light, tint, seed })   any shape given that body, where it stands (the box x, y, w, h holds it)
//   bodyCanvas(j, size, light, wear)   the body of the j-th of the five (0 Sam, 1 Robin, 2 Alex, 3 Jamie, 4 Pat) as a canvas.
//                                      light: [dx, dy], where a second, pale light comes from (the soul, in the film), or null.
//                                      wear: also draw what it wears that does not move (the film), or the body alone (the app,
//                                      which draws those itself so that they can move)
//   avatarURL(id)                      the body alone as a picture address, for the app's own drawing of the seat; null where
//                                      there is nothing to draw on (then the app keeps its flat shape)
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const WHITE = [255, 255, 255];
const NIGHT = [8, 10, 40];
const mix = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];
const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a).toFixed(3) + ')';
const rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';

// the five, in the order they sit round the soul: the seat's id in the app, its name as a friend, its colour, and its shape in a
// square of 48 (the body's middle at 24, 26.5)
export const ART = [
  {
    id: 'overseer',
    name: 'Sam',
    c: [107, 116, 230],
    body: 'M20 10h8a13 13 0 0 1 13 13v6a13 13 0 0 1-13 13h-8a13 13 0 0 1-13-13v-6a13 13 0 0 1 13-13z',
    blush: true,
  },
  { id: 'steward', name: 'Robin', c: [240, 169, 58], body: 'M7 26.5a17 17 0 1 0 34 0a17 17 0 1 0-34 0z' },
  { id: 'operations', name: 'Alex', c: [32, 179, 166], body: 'M9 22q0-11 15-11t15 11v9q0 11-15 11T9 31z', blush: true },
  { id: 'ask', name: 'Jamie', c: [236, 106, 160], body: 'M8 27q0-15 16-15t16 15q0 15-16 15T8 27z', blush: true },
  {
    id: 'master',
    name: 'Pat',
    c: [34, 176, 125],
    body: 'M23 11h2a15 15 0 0 1 15 15v1a15 15 0 0 1-15 15h-2a15 15 0 0 1-15-15v-1a15 15 0 0 1 15-15z',
    blush: true,
  },
];
export const seatIndex = (id) => ART.findIndex((a) => a.id === id);
const paths = [];
const kept = {};
export const bodyPath = (j) => paths[j] || (paths[j] = new Path2D(ART[j].body));

// A SHAPE GIVEN THE BODY THE FIVE HAVE. p: its outline; c: its colour; x, y, w, h: the box that holds it, in the units it is drawn in.
// Everything about the texture is sized against the shape, so a small hand and a large head are the same stuff.
export function felt(g, p, c, x, y, w, h, o = {}) {
  const m = Math.max(w, h);
  const k = m / 34;
  const seed = o.seed || 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const lite = mix(c, WHITE, 0.46);
  const dark = mix(c, NIGHT, 0.44);
  let gr;
  g.save();
  g.lineCap = 'round';
  gr = g.createRadialGradient(x + w * 0.3, y + h * 0.22, m * 0.03, x + w * 0.45, y + h * 0.47, m * 0.9);
  gr.addColorStop(0, rgb(mix(c, WHITE, 0.3)));
  gr.addColorStop(0.36, rgb(c));
  gr.addColorStop(0.8, rgb(mix(c, NIGHT, 0.36)));
  gr.addColorStop(1, rgb(mix(c, NIGHT, 0.58)));
  g.fillStyle = gr;
  g.fill(p); // matt, lit from above and to the left
  g.save();
  g.clip(p);
  gr = g.createRadialGradient(x + w * 0.86, y + h * 0.95, 0, x + w * 0.86, y + h * 0.95, m * 0.62);
  gr.addColorStop(0, rgba(NIGHT, 0.34));
  gr.addColorStop(1, rgba(NIGHT, 0));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h); // its shaded side
  g.globalCompositeOperation = 'screen';
  if (o.light) {
    const dl = Math.hypot(o.light[0], o.light[1]) || 1;
    const lx = cx + (o.light[0] / dl) * w * 0.5;
    const ly = cy + (o.light[1] / dl) * h * 0.47;
    gr = g.createRadialGradient(lx, ly, 0, lx, ly, m * 0.6);
    gr.addColorStop(0, rgba(o.tint || [214, 232, 255], 0.46));
    gr.addColorStop(1, rgba(o.tint || [214, 232, 255], 0));
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } // a second, pale light on the side that faces it
  gr = g.createRadialGradient(cx, y + h * 1.07, 0, cx, y + h * 1.07, m * 0.47);
  gr.addColorStop(0, rgba(mix(c, WHITE, 0.3), 0.38));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h); // its own colour, coming back up from underneath
  gr = g.createRadialGradient(x + w * 0.3, y + h * 0.22, 0, x + w * 0.3, y + h * 0.22, m * 0.41);
  gr.addColorStop(0, 'rgba(255,255,255,.2)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h); // where the light falls it is paler, not shiny
  g.globalCompositeOperation = 'source-over';
  // ITS TEXTURE: short fibres laid over the surface, turning with it; lighter ones where the light falls, darker ones where it does not
  for (let n = 0; n < 2800; n++) {
    const fx = x + hash(n * 3 + seed + 1) * w;
    const fy = y + hash(n * 5 + seed + 2) * h;
    const lit = 0.55 - ((fx - x) / w + (fy - y) / h - 1) * 0.34;
    const a = Math.atan2(fy - cy, fx - cx) + TAU / 4 + (hash(n * 7 + seed + 3) - 0.5) * 2.4;
    const len = (0.28 + hash(n * 11 + 4) * 0.75) * k;
    g.strokeStyle =
      hash(n * 13 + seed + 5) < lit
        ? rgba(lite, 0.15 + hash(n * 17 + 6) * 0.17)
        : rgba(dark, 0.12 + hash(n * 19 + 7) * 0.16);
    g.lineWidth = (0.13 + hash(n * 23 + 8) * 0.14) * k;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx + Math.cos(a) * len, fy + Math.sin(a) * len);
    g.stroke();
  }
  for (let n = 0; n < 800; n++) {
    g.fillStyle = hash(n * 43 + seed + 11) < 0.5 ? rgba(lite, 0.15) : rgba(dark, 0.15);
    g.beginPath();
    g.arc(
      x + hash(n * 29 + seed + 9) * w,
      y + hash(n * 37 + seed + 10) * h,
      (0.09 + hash(n * 47 + 12) * 0.15) * k,
      0,
      TAU,
    );
    g.fill();
  } // and a grain between them
  g.restore();
  // ITS EDGE is not a line: fibres stand out from it all the way round. The edge is found by going out from the middle, along each
  // of many directions, until the shape ends
  const mask = document.createElement('canvas');
  mask.width = mask.height = 96;
  const mg = mask.getContext('2d');
  const s = 86 / m;
  mg.setTransform(s, 0, 0, s, 48 - cx * s, 48 - cy * s);
  mg.fill(p);
  const d = mg.getImageData(0, 0, 96, 96).data;
  const inside = (px, py) => {
    const X = Math.round(48 + (px - cx) * s);
    const Y = Math.round(48 + (py - cy) * s);
    return X >= 0 && Y >= 0 && X < 96 && Y < 96 && d[(Y * 96 + X) * 4 + 3] > 127;
  };
  for (let n = 0; n < 1000; n++) {
    const a = (n / 1000) * TAU + hash(n * 3 + seed) * 0.02;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let r = m * 0.1;
    while (r < m * 0.9 && inside(cx + ca * r, cy + sa * r)) r += m * 0.007;
    const lit = 0.5 - (ca + sa) * 0.3;
    const tone =
      hash(n * 7 + seed * 3) < lit ? mix(c, WHITE, 0.2 + hash(n * 5) * 0.2) : mix(c, NIGHT, 0.14 + hash(n * 9) * 0.26);
    const b = a + (hash(n * 11 + seed) - 0.5) * 0.9;
    const r0 = r - 0.55 * k;
    const len = (0.32 + hash(n * 13 + seed) * 0.62) * k;
    g.strokeStyle = rgba(tone, 0.55 + hash(n * 17) * 0.4);
    g.lineWidth = (0.13 + hash(n * 19) * 0.13) * k;
    g.beginPath();
    g.moveTo(cx + ca * r0, cy + sa * r0);
    g.lineTo(cx + ca * r0 + Math.cos(b) * len, cy + sa * r0 + Math.sin(b) * len);
    g.stroke();
  }
  g.restore();
}

export function bodyCanvas(j, size = 288, light = null, wear = true) {
  const key = j + ':' + size + ':' + (light ? light.map((v) => v.toFixed(2)).join() : '-') + ':' + (wear ? 1 : 0);
  if (kept[key]) return kept[key];
  const s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d');
  const p = bodyPath(j);
  let gr;
  g.scale(size / 48, size / 48);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // what it wears behind its body
  if (wear && j === 0) {
    g.strokeStyle = '#aab2ff';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(24, 11);
    g.lineTo(24, 5.5);
    g.stroke();
    gr = g.createRadialGradient(23.2, 3.3, 0.2, 24, 4.2, 2.7);
    gr.addColorStop(0, '#fffdf2');
    gr.addColorStop(0.55, '#ffe29a');
    gr.addColorStop(1, '#e2a63c');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(24, 4.2, 2.6, 0, TAU);
    g.fill();
  }
  if (wear && j === 1) {
    g.strokeStyle = '#b9770f';
    g.lineWidth = 2;
    g.stroke(new Path2D('M21 9.5q3-5 6 0'));
  }
  if (wear && j === 2) {
    gr = g.createLinearGradient(22, 1, 28, 14);
    gr.addColorStop(0, '#fff6b8');
    gr.addColorStop(1, '#ffbf1f');
    g.fillStyle = gr;
    g.fill(new Path2D('M27 1.5l-6 7.5h4.5l-2.5 6 8-8.5h-5z'));
  }
  felt(g, p, ART[j].c, 7, 9.5, 34, 34, { light, seed: j * 71 });
  if (ART[j].blush) {
    g.save();
    g.clip(p);
    for (const bx of [14.6, 33.4]) {
      gr = g.createRadialGradient(bx, 31.3, 0, bx, 31.3, 3.6);
      gr.addColorStop(0, 'rgba(255,96,128,.4)');
      gr.addColorStop(1, 'rgba(255,96,128,0)');
      g.fillStyle = gr;
      g.fillRect(bx - 4, 27, 8, 8);
    }
    g.restore();
  }
  if (wear && j === 4) {
    gr = g.createLinearGradient(36, 9, 43, 16);
    gr.addColorStop(0, '#fff0a0');
    gr.addColorStop(1, '#f4b41c');
    g.fillStyle = gr;
    g.fill(new Path2D('M35.5 14.5l6.5-6.5 2.2 2.2-6.5 6.5z'));
    g.fillStyle = '#1d2230';
    g.fill(new Path2D('M35.5 14.5l-1.2 3.4 3.4-1.2z'));
  }
  return (kept[key] = s);
}

const urls = {};
export function avatarURL(id) {
  const j = seatIndex(id);
  if (j < 0) return null;
  if (urls[id] !== undefined) return urls[id];
  try {
    urls[id] = bodyCanvas(j, 192, null, false).toDataURL('image/png');
  } catch (e) {
    urls[id] = null;
  } // nothing to draw on (no canvas here): the app keeps its flat shape
  return urls[id];
}
