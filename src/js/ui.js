// ui.js - the few DOM helpers every page shares. No framework, no build step.
import { avatarURL } from './avatar.js'; // the five's bodies, the same ones the film on the landing page shows
export const BRAND = 'Family Office';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// h('div', { class: 'x', onclick: fn }, 'text', child, [children]) - text is always set as text, never as HTML
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 50) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}

// a line shape for a seat. Since the five have one character each everywhere (figure(), below), this is drawn only for something
// that is not one of the five, or where there is nothing to draw a character on
const SHAPES = {
  overseer: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z',
  steward: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9zM12 10.2v3.6',
  operations: 'M4.5 12.5l4.5 4.5L19.5 6.5',
  ask: 'M4 6.5h16v11H4zM4 10h16M8 13.5h4',
  master: 'M7.5 3.5h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z',
};
export function seatMark(id, small) {
  const fig = figure(id);
  if (fig) return h('span', { class: 'seat-mark av' + (small ? ' sm' : '') }, fig); // one of the five: its character
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const p = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  p.setAttribute('d', SHAPES[id] || SHAPES.master);
  svg.append(p);
  return h('span', { class: 'seat-mark' + (small ? ' sm' : '') }, svg);
}

// A FACE FOR EACH SEAT, for where the team is shown as people (Who is here): one colour and one look each, so a seat is recognised at
// a glance. Overseer: a monocle, watching. Steward: round glasses, exacting. Operations: a hard hat. Ask: a beret and a wink. Master: a
// captain's cap. Drawn here, with no image to fetch. (The small shape marks above stay where a seat is a label, not a person.)
const FACE = (bg, skin, extra) =>
  '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="' +
  bg +
  '"/><circle cx="24" cy="27" r="13" fill="' +
  skin +
  '"/>' +
  extra +
  '</svg>';
const EYES = '<circle cx="19" cy="26" r="1.7" fill="#1d2230"/><circle cx="29" cy="26" r="1.7" fill="#1d2230"/>';
const INK = ' fill="none" stroke="#1d2230" stroke-width="1.5" stroke-linecap="round"/>';
const FACES = {
  overseer: FACE(
    '#5b63d6',
    '#f1ddc8',
    '<path d="M11 24a13 13 0 0 1 26 0c-3-5-8-7-13-7s-10 2-13 7z" fill="#262a52"/>' +
      EYES +
      '<circle cx="29" cy="26" r="4.6" fill="none" stroke="#ffe29a" stroke-width="1.5"/><path d="M33.4 27.5q3 4 1.5 9" fill="none" stroke="#ffe29a" stroke-width="1"/><path d="M20 33q4 2.4 8 0"' +
      INK,
  ),
  steward: FACE(
    '#d99a2b',
    '#e6c3a0',
    '<path d="M11.5 23a12.5 12.5 0 0 1 25 0c-4-3.5-8-5-12.5-5s-8.5 1.5-12.5 5z" fill="#5a3a1c"/><circle cx="24" cy="12.5" r="4" fill="#5a3a1c"/>' +
      EYES +
      '<circle cx="19" cy="26" r="4.2" fill="none" stroke="#1d2230" stroke-width="1.4"/><circle cx="29" cy="26" r="4.2" fill="none" stroke="#1d2230" stroke-width="1.4"/><path d="M23.2 26h1.6M20.5 33.5h7"' +
      INK,
  ),
  operations: FACE(
    '#1c9d93',
    '#c58f69',
    '<path d="M10.5 22a13.5 13.5 0 0 1 27 0z" fill="#ffd23f"/><path d="M8.5 22h31" stroke="#e0a800" stroke-width="2.6" stroke-linecap="round"/><path d="M22 9.5h4v7h-4z" fill="#e0a800"/>' +
      EYES +
      '<path d="M16.5 23.3l5 1M31.5 23.3l-5 1M20.5 33.5h7"' +
      INK,
  ),
  ask: FACE(
    '#d85a8d',
    '#f4dccb',
    '<ellipse cx="22" cy="14.5" rx="13" ry="6" fill="#4a1f3f" transform="rotate(-12 22 14.5)"/><circle cx="31" cy="8.5" r="1.8" fill="#4a1f3f"/><circle cx="19" cy="26" r="1.7" fill="#1d2230"/><path d="M27 26.3q2 -1.8 4 0"' +
      INK +
      '<path d="M19.5 32.5q4.5 3.6 9 0"' +
      INK +
      '<circle cx="16" cy="30.5" r="1.8" fill="#f2a0b8" opacity=".8"/><circle cx="32" cy="30.5" r="1.8" fill="#f2a0b8" opacity=".8"/>',
  ),
  master: FACE(
    '#16a374',
    '#8a5a3c',
    '<path d="M11 21.5q13 -7 26 0v-3.5q-13 -9 -26 0z" fill="#f4f6f8"/><path d="M10.5 21h27v3h-27z" fill="#11203a"/><circle cx="24" cy="15.5" r="2" fill="#e8b970"/>' +
      EYES +
      '<path d="M20 33q5 2.2 8.5 -.8"' +
      INK,
  ),
};
export function seatFace(id) {
  const fig = figure(id);
  if (fig) return h('span', { class: 'seat-face av' }, fig); // one of the five: its character, the same as everywhere
  if (!FACES[id]) return seatMark(id, true);
  const t = document.createElement('template');
  t.innerHTML = FACES[id]; // static markup, written above: never data
  return h('span', { class: 'seat-face' }, t.content.firstChild);
}

// THE FIVE, AS SIMPLE SHOWS THEM (Sam, Robin, Alex, Jamie, Pat): static markup written here, never data; the motion is in css/app.css
const EYE = (x) =>
  '<ellipse cx="' +
  x +
  '" cy="26" rx="2" ry="2.5" fill="#1d2230"/><circle cx="' +
  (x + 0.7) +
  '" cy="25.1" r=".7" fill="#fff"/>';
const BUD = (id, body, face, extra) =>
  '<svg viewBox="0 0 48 48" class="bd bd-' +
  id +
  '" aria-hidden="true">' +
  extra[0] +
  '<g class="bd-body">' +
  body +
  '<g class="bd-eyes">' +
  face +
  '</g>' +
  extra[1] +
  '</g></svg>';
const SMILE = (d) => '<path d="' + d + '" fill="none" stroke="#1d2230" stroke-width="1.7" stroke-linecap="round"/>';
const BLUSH =
  '<circle class="bd-blush" cx="13.5" cy="31" r="2.5" fill="#ff7fa6" opacity=".34"/><circle class="bd-blush" cx="34.5" cy="31" r="2.5" fill="#ff7fa6" opacity=".34"/>';
const BUDDIES = {
  overseer: BUD(
    'overseer',
    '<path d="M24 10V5.5" stroke="#aab2ff" stroke-width="1.8" stroke-linecap="round"/><circle class="bd-bulb" cx="24" cy="4.2" r="2.6" fill="#ffe29a"/><rect class="bd-shape" x="7" y="10" width="34" height="32" rx="13" fill="#6b74e6"/>',
    EYE(18.5) + EYE(29.5),
    ['', BLUSH + SMILE('M19.5 33q4.5 3 9 0')],
  ),
  steward: BUD(
    'steward',
    '<circle class="bd-shape" cx="24" cy="26.5" r="17" fill="#f0a93a"/><path d="M21 9.5q3-5 6 0" fill="none" stroke="#b9770f" stroke-width="2" stroke-linecap="round"/>',
    '<g class="bd-look">' + EYE(18) + EYE(30) + '</g>',
    [
      '',
      '<circle cx="18" cy="26" r="5.4" fill="none" stroke="#1d2230" stroke-width="1.5"/><circle cx="30" cy="26" r="5.4" fill="none" stroke="#1d2230" stroke-width="1.5"/><path d="M23.4 26h1.2" stroke="#1d2230" stroke-width="1.5"/>' +
        SMILE('M21 35.5q3 1.6 6 0'),
    ],
  ),
  operations: BUD(
    'operations',
    '<path class="bd-shape" d="M9 22q0-11 15-11t15 11v9q0 11-15 11T9 31z" fill="#20b3a6"/>',
    EYE(18.5) + EYE(29.5),
    [
      '<path class="bd-zap" d="M27 1.5l-6 7.5h4.5l-2.5 6 8-8.5h-5z" fill="#ffd23f"/>',
      BLUSH + '<path d="M18 33.5q6 5 12 0z" fill="#1d2230"/>',
    ],
  ),
  ask: BUD(
    'ask',
    '<path class="bd-shape" d="M8 27q0-15 16-15t16 15q0 15-16 15T8 27z" fill="#ec6aa0"/>',
    EYE(18.5) +
      '<path d="M27 26.6q2.5-2.6 5 0" fill="none" stroke="#1d2230" stroke-width="1.8" stroke-linecap="round"/>',
    [
      '<g class="bd-spark"><circle cx="24" cy="2.5" r="2" fill="#ffd23f"/><circle cx="43" cy="33" r="1.8" fill="#7ad7ff"/><circle cx="5" cy="33" r="1.8" fill="#b6f09c"/></g>',
      BLUSH + SMILE('M19 32.5q5 4.4 10 0'),
    ],
  ),
  master: BUD(
    'master',
    '<rect class="bd-shape" x="8" y="11" width="32" height="31" rx="15" fill="#22b07d"/>',
    EYE(18.5) + EYE(29.5),
    [
      '',
      BLUSH +
        SMILE('M20.5 33.5q3.5 2 7 0') +
        '<g class="bd-pencil"><path d="M35.5 14.5l6.5-6.5 2.2 2.2-6.5 6.5z" fill="#ffd23f"/><path d="M35.5 14.5l-1.2 3.4 3.4-1.2z" fill="#1d2230"/></g>',
    ],
  ),
};
// THE SYMBOL ON AN ANSWER CARD (js/views.js cardOf): static markup, drawn here; the motion is in css/app.css
const iconSvg = (inner) => '<svg viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
const CLOUD = (up) =>
  '<g' +
  (up ? ' transform="translate(0 -6)"' : '') +
  '><g class="ic-cloud" fill="#e6ecf7"><circle cx="17" cy="27" r="7"/><circle cx="26" cy="22" r="9"/><circle cx="33" cy="28" r="6"/><rect x="12" y="27" width="26" height="7" rx="3.5"/></g></g>';
const SUN =
  '<g class="ic-spin"><circle cx="24" cy="24" r="9" fill="#ffd23f"/><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/></g>';
const LINES = (d) =>
  '<g class="ic-drift" fill="none" stroke="#cfd8ea" stroke-width="3.2" stroke-linecap="round"><path d="' +
  d +
  '"/></g>';
const CARD_ICONS = {
  sun: iconSvg(SUN),
  cloud: iconSvg(CLOUD(false)),
  part: iconSvg('<g transform="translate(13 -4) scale(.62)">' + SUN + '</g>' + CLOUD(false)),
  rain: iconSvg(
    CLOUD(true) +
      '<g class="ic-drops" stroke="#7ad7ff" stroke-width="3" stroke-linecap="round"><path d="M18 33l-2 6M26 33l-2 6M34 33l-2 6"/></g>',
  ),
  storm: iconSvg(CLOUD(true) + '<path class="ic-flash" d="M27 29l-7 9h5l-2 7 8-10h-5z" fill="#ffd23f"/>'),
  snow: iconSvg(
    CLOUD(true) +
      '<g class="ic-drops" fill="#fff"><circle cx="17" cy="35" r="2"/><circle cx="25" cy="38" r="2"/><circle cx="33" cy="35" r="2"/></g>',
  ),
  fog: iconSvg(LINES('M9 16h26M13 24h28M9 32h22')),
  wind: iconSvg(LINES('M7 19h20a5 5 0 1 0-5-5M7 28h29a5 5 0 1 1-5 5M7 36h12')),
  clock: iconSvg(
    '<circle cx="24" cy="24" r="16" fill="none" stroke="#cfd8ea" stroke-width="3"/><path d="M24 24V13.5" stroke="#cfd8ea" stroke-width="3" stroke-linecap="round"/><path class="ic-hand" d="M24 24h8.5" stroke="#34d399" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="2" fill="#cfd8ea"/>',
  ),
  tag: iconSvg(
    '<g class="ic-swing"><path d="M9 9h13l17 17-13 13L9 22z" fill="#f0a93a"/><circle cx="16.5" cy="16.5" r="3" fill="#0b0f18"/></g>',
  ),
  star: iconSvg(
    '<path class="ic-twinkle" d="M24 6l5.3 11.3 12.2 1.5-9 8.5 2.3 12.2L24 33.6 13.2 39.5l2.3-12.2-9-8.5 12.2-1.5z" fill="#ffd23f"/>',
  ),
  pin: iconSvg(
    '<g class="ic-bounce"><path d="M24 43s13-12.5 13-22a13 13 0 1 0-26 0c0 9.5 13 22 13 22z" fill="#ec6aa0"/><circle cx="24" cy="21" r="5" fill="#0b0f18"/></g>',
  ),
  check: iconSvg(
    '<rect x="8" y="8" width="32" height="32" rx="9" fill="#22b07d"/><path class="ic-draw" pathLength="1" d="M16 24.5l6 6 11-12.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  steps: iconSvg(
    '<g class="ic-steps" fill="#7ad7ff"><rect x="8" y="30" width="9" height="10" rx="2.5"/><rect x="19.5" y="21" width="9" height="19" rx="2.5"/><rect x="31" y="12" width="9" height="28" rx="2.5"/></g>',
  ),
  bulb: iconSvg(
    '<path class="ic-glow" d="M24 6a12 12 0 0 0-7 21.7V32h14v-4.3A12 12 0 0 0 24 6z" fill="#ffd23f"/><path d="M18.5 36.5h11M20.5 41.5h7" stroke="#cfd8ea" stroke-width="3" stroke-linecap="round"/>',
  ),
  calendar: iconSvg(
    '<rect x="8" y="11" width="32" height="29" rx="6" fill="#e6ecf7"/><path d="M8 17a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v4H8z" fill="#ec6aa0"/><path d="M16 7v7M32 7v7" stroke="#cfd8ea" stroke-width="3" stroke-linecap="round"/><circle class="ic-pulse" cx="24" cy="30.5" r="4" fill="#ec6aa0"/>',
  ),
  plane: iconSvg(
    '<g class="ic-fly"><path d="M6 25l36-16-11 31-8-11z" fill="#7ad7ff"/><path d="M23 29l19-20-13 23" fill="#4fb6e6"/></g>',
  ),
  fork: iconSvg(
    '<circle cx="24" cy="26" r="11" fill="none" stroke="#e6ecf7" stroke-width="3"/><circle class="ic-pulse" cx="24" cy="26" r="5" fill="#f0a93a"/><path d="M7 9v8a3 3 0 0 0 3 3v20M41 9c-4 3-4 9 0 12v19" fill="none" stroke="#cfd8ea" stroke-width="3" stroke-linecap="round"/>',
  ),
};
const GLYPHS = {
  clip: '<path d="M20.5 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2"/>',
  ticket:
    '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14 6.5v11" stroke-dasharray="2 2.4"/>',
};
export function glyph(name) {
  const t = document.createElement('template');
  t.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (GLYPHS[name] || '') +
    '</svg>';
  return t.content.firstChild;
}
export function cardIcon(name) {
  const t = document.createElement('template');
  t.innerHTML = CARD_ICONS[name] || CARD_ICONS.pin;
  return t.content.firstChild;
}
// ONE SET OF AVATARS. Wherever a seat is shown it is the same character: in the group chat in either mode, in who is here, on the
// landing page, in a list of names. figure(id) is that character's own drawing; its body is the textured one from js/avatar.js
// (the flat shape written above is what is left where there is nothing to draw on). The three functions that hand out an avatar
// (buddy, seatMark, seatFace) differ only in the box they put it in.
function figure(id) {
  if (!BUDDIES[id]) return null;
  const t = document.createElement('template');
  t.innerHTML = BUDDIES[id];
  const svg = t.content.firstChild;
  const shape = svg.querySelector('.bd-shape');
  const url = avatarURL(id);
  if (shape && url) {
    const im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    im.setAttribute('class', 'bd-shape');
    im.setAttribute('href', url);
    im.setAttribute('x', '0');
    im.setAttribute('y', '0');
    im.setAttribute('width', '48');
    im.setAttribute('height', '48');
    shape.replaceWith(im);
    for (const b of svg.querySelectorAll('.bd-blush')) b.remove();
  } // the textured body has its cheeks in it
  return svg;
}
export function buddy(id) {
  const fig = figure(id);
  return fig ? h('span', { class: 'buddy' }, fig) : seatMark(id);
}

export function store(key) {
  return {
    get(fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(v) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch (e) {
        /* private window or blocked storage: the page still works */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* same */
      }
    },
  };
}
