// site.js - the landing page's moving parts. The page reads complete without it: every number and section is in the HTML.
import { $, $$, h, seatMark } from './ui.js';
import { SEATS } from './team-core.js';
import { PULSE, GROWS, dayOf } from './pulse.js';
import { LOCAL } from './where.js';
import { mountUniverse } from './universe.js';

// THE OWNER'S PANEL is offered beside Start, and only on the owner's own copy: the app run from its source folder says so in
// api/hello. A customer's copy and the published site never show it. Only a page served from this machine asks at all.
if (LOCAL)
  fetch('api/hello', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const cta = $('.nav-cta');
      if (j && j.owner && cta && !$('#owner-link'))
        cta.prepend(h('a', { class: 'btn small', id: 'owner-link', href: 'owner.html' }, 'Owner'));
    })
    .catch(() => {
      /* not the app's own server */
    });

const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');
// the hero runs from the bar to the fold, so the page is told how tall the bar really is
{
  const bar = $('.nav');
  const tell = () => document.documentElement.style.setProperty('--bar', bar.getBoundingClientRect().height + 'px');
  if (bar) {
    tell();
    addEventListener('resize', tell);
  }
}

// THE UNIVERSE (universe.js): the flight in the hero, whose caption and dots follow the scene, and one scene each further down the page
{
  const cv = $('#uni');
  const cap = $('.uni-cap');
  const name = $('#uni-name');
  const line = $('#uni-line');
  const dots = $$('#uni-dots button');
  if (cv) {
    const film = mountUniverse(cv, {
      scene: 'tour',
      onScene: (i, s) => {
        dots.forEach((d, j) => {
          d.style.setProperty('--d', s.d + 's');
          d.setAttribute('aria-current', String(j === i));
        });
        if (!cap) return;
        name.classList.add('swap');
        setTimeout(
          () => {
            name.textContent = s.name;
            name.classList.remove('swap');
          },
          calm ? 0 : 220,
        );
      },
      // THE NARRATION: under the scene's name, one line for each step of the scene, saying what is being looked at
      onBeat: (i, b, text) => {
        if (!line) return;
        line.classList.add('swap');
        setTimeout(
          () => {
            line.textContent = text;
            line.classList.remove('swap');
          },
          calm ? 0 : 200,
        );
      },
    });
    dots.forEach((d, j) => d.addEventListener('click', () => film.seek(j)));
  }
  $$('canvas[data-uni]').forEach((c) => mountUniverse(c, { scene: c.dataset.uni }));
}

// THE CLAIM ARRIVES WORD BY WORD: each word of the headline rises into place a moment after the one before it. The words are the
// same words in the same order (a screen reader, a search engine and a copy all get the sentence whole); only their arrival is staged.
{
  const h1 = $('.hero h1');
  if (h1 && !calm) {
    let n = 0;
    const wrap = (node) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.style.setProperty('--i', String(n++));
      s.append(node);
      return s;
    };
    for (const node of [...h1.childNodes]) {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of node.textContent.split(/( +)/)) {
          if (part) frag.append(/^ +$/.test(part) ? document.createTextNode(' ') : wrap(document.createTextNode(part)));
        }
        node.replaceWith(frag);
      } else if (node.nodeType === 1 && node.tagName !== 'BR') node.replaceWith(wrap(node.cloneNode(true)));
    }
    h1.classList.add('rise-words');
  }
}
// BEHIND THE SCENES: six pages side by side. One is on screen at a time; a swipe, a tab, a dot, an arrow or an arrow key turns to
// another, and the frame takes the height of the page it shows. Nothing turns by itself. A link to one of the pages (from the bar,
// or anywhere on this page) turns to it and brings the tabs to the top of the screen.
{
  const deck = $('#deck');
  const pages = deck ? $$('.page', deck) : [];
  const tabBox = $('#deck-tabs');
  const tabs = $$('#deck-tabs button');
  const pips = $$('#deck-dots button');
  const prev = $('#deck-prev');
  const next = $('#deck-next');
  let at = -1;
  let aim = -1;
  let timer = 0;
  if (deck && pages.length) {
    const fit = () => {
      if (at >= 0) deck.style.height = pages[at].offsetHeight + 'px';
    };
    const mark = (i) => {
      if (i === at) return;
      at = i;
      for (const set of [tabs, pips]) set.forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
      prev.disabled = i === 0;
      next.disabled = i === pages.length - 1;
      fit();
      if (tabs[i]) tabBox.scrollTo({ left: tabs[i].offsetLeft - 24, behavior: calm ? 'auto' : 'smooth' });
    };
    const showPage = (i, jump) => {
      i = Math.max(0, Math.min(pages.length - 1, i));
      aim = i;
      clearTimeout(timer);
      timer = setTimeout(() => {
        aim = -1;
      }, 1200);
      deck.scrollTo({ left: pages[i].offsetLeft, behavior: calm || jump ? 'auto' : 'smooth' });
      mark(i);
    };
    let waiting = false;
    deck.addEventListener(
      'scroll',
      () => {
        if (waiting) return;
        waiting = true;
        requestAnimationFrame(() => {
          waiting = false;
          if (aim >= 0) {
            if (Math.abs(pages[aim].offsetLeft - deck.scrollLeft) < 4) aim = -1;
            return;
          }
          let best = 0;
          let d = Infinity;
          pages.forEach((p, i) => {
            const off = Math.abs(p.offsetLeft - deck.scrollLeft);
            if (off < d) {
              d = off;
              best = i;
            }
          });
          mark(best);
        });
      },
      { passive: true },
    );
    tabs.forEach((b, i) => b.addEventListener('click', () => showPage(i)));
    pips.forEach((b, i) => b.addEventListener('click', () => showPage(i)));
    prev.addEventListener('click', () => showPage(at - 1));
    next.addEventListener('click', () => showPage(at + 1));
    deck.addEventListener('keydown', (e) => {
      if (e.target !== deck || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      e.preventDefault();
      showPage(at + (e.key === 'ArrowRight' ? 1 : -1));
    });
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(fit);
      pages.forEach((p) => ro.observe(p));
    }
    addEventListener('resize', () => {
      fit();
      if (at > 0) deck.scrollTo({ left: pages[at].offsetLeft });
    });
    const open = (id, jump) => {
      const i = pages.findIndex((p) => p.id === id);
      if (i < 0) return false;
      showPage(i, jump);
      tabBox.scrollIntoView({ block: 'start', behavior: calm || jump ? 'auto' : 'smooth' });
      return true;
    };
    document.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (a && open(a.getAttribute('href').slice(1))) {
        e.preventDefault();
        history.replaceState(null, '', a.getAttribute('href'));
      }
    });
    mark(0);
    if (location.hash.length > 1) requestAnimationFrame(() => open(location.hash.slice(1), true));
  }
}
// A CARD IS LIT FROM WHERE THE POINTER IS
for (const el of $$('.power, .world'))
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px');
    el.style.setProperty('--my', e.clientY - r.top + 'px');
  });

const SAID = {
  overseer: 'Three landed, one red, nothing waiting on you.',
  steward: 'It is red, as it should be. Nothing does this yet.',
  operations: 'Run 2 is red: the empty case. Fixing.',
  ask: 'I drew it before it was built.',
  master: 'The receipt holds. Landed.',
};

// THE PULSE, above the fold: the newest reading of the system as one day in it. With a reading before it, the page says what moved
// since then; with three or more, it draws the line. Nothing is worked out beyond the readings: no counter ticks between them.
{
  const box = $('#pulse');
  const rs = PULSE.readings;
  if (box && rs.length) {
    const now = rs[rs.length - 1];
    const prev = rs[rs.length - 2];
    const day = dayOf(now);
    const whole = (x) => Math.round(x).toLocaleString('en-US');
    const when = (d) =>
      new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    const about = (x) => [h('small', null, 'about'), ' ' + whole(x >= 100 ? Math.round(x / 10) * 10 : x)];
    $('#pulse-date').textContent = 'Read ' + when(now.date);
    $('#pulse-rates').replaceChildren(
      h('li', null, h('strong', null, whole(day.proofs)), h('span', null, 'proofs run')),
      h('li', null, h('strong', null, about(day.commits)), h('span', null, 'commits landed')),
      h('li', null, h('strong', null, about(day.resets)), h('span', null, 'contexts reset')),
      h('li', null, h('strong', null, whole(day.measures)), h('span', null, 'measures watched')),
    );
    if (prev) {
      // what grew since the reading before: only what really did
      const grew = GROWS.map(([k, name]) => [now[k] - prev[k], name]).filter(([d]) => d > 0);
      const moved = $('#pulse-moved');
      if (grew.length) {
        const spark = (k) => {
          if (rs.length < 3) return null;
          const v = rs.slice(-12).map((r) => r[k]);
          const lo = Math.min(...v);
          const hi = Math.max(...v);
          const w = 64;
          const hh = 18;
          const pt = (x, i) =>
            ((i * w) / (v.length - 1)).toFixed(1) +
            ',' +
            (hh - 2 - (hi === lo ? 0 : (x - lo) / (hi - lo)) * (hh - 4)).toFixed(1);
          const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          s.setAttribute('viewBox', '0 0 ' + w + ' ' + hh);
          s.setAttribute('class', 'spark');
          s.setAttribute('aria-hidden', 'true');
          s.innerHTML =
            '<polyline points="' +
            v.map(pt).join(' ') +
            '"/><circle cx="' +
            w +
            '" cy="' +
            pt(v[v.length - 1], v.length - 1).split(',')[1] +
            '" r="2.4"/>';
          return s;
        };
        moved.replaceChildren(
          h('span', { class: 'since' }, 'Since ' + when(prev.date)),
          ...grew.map(([d, name]) =>
            h(
              'span',
              { class: 'mv' },
              h('b', null, '+' + whole(d)),
              ' ' + name,
              name === 'judges' || name === 'memories' ? spark(name) : null,
            ),
          ),
        );
        moved.hidden = false;
      }
    }
  }
}

const seats = $('#seats');
if (seats)
  seats.append(
    ...SEATS.map((s, i) =>
      h(
        'article',
        { class: 'seat glass flat reveal', style: '--d:' + i * 0.07 + 's' },
        h(
          'header',
          null,
          seatMark(s.id),
          h('div', null, h('h3', null, s.title), h('p', { class: 'mono dim' }, s.tone)),
        ),
        h('p', { class: 'muted' }, s.role + '.'),
        h('blockquote', null, SAID[s.id]),
      ),
    ),
  );

// THE WORKFLOW BETWEEN THE SEATS, MOVING. One request passes along the row: the Overseer plans it, the Steward writes the judge it must
// pass, Operations builds until it passes, Ask checks how it looks, and the Master lands it. Each card carries its step, numbered, so
// the order reads without any motion at all. With motion: the seat whose turn it is lights, then a point of light crosses to the next
// seat along a line that draws itself; a seat that has had its turn keeps a quiet mark until the round starts again.
// It runs only while the row is on screen, and not at all for someone who has asked for less motion: they see the numbered steps.
const FLOW = {
  overseer: 'Plans it',
  steward: 'Writes the judge',
  operations: 'Builds until it passes',
  ask: 'Checks how it looks',
  master: 'Lands it',
};
if (seats) {
  const cards = [...seats.children];
  const NS = 'http://www.w3.org/2000/svg';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  cards.forEach((c, i) => {
    c.dataset.seat = SEATS[i].id;
    c.querySelector('header').after(h('p', { class: 'seat-step' }, h('i', null, String(i + 1)), FLOW[SEATS[i].id]));
  });
  const svg = document.createElementNS(NS, 'svg');
  const line = document.createElementNS(NS, 'path');
  const dot = document.createElementNS(NS, 'circle');
  svg.setAttribute('class', 'flow');
  svg.setAttribute('aria-hidden', 'true');
  line.setAttribute('class', 'flow-line');
  dot.setAttribute('class', 'flow-dot');
  dot.setAttribute('r', '5');
  svg.append(line, dot);
  seats.append(svg);
  let round = 0;
  // from one card to the next: over the top when they sit in one row, down the gap when the next is on the row below
  const hop = (a, b, mine) =>
    new Promise((done) => {
      const box = seats.getBoundingClientRect();
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const row = Math.abs(ra.top - rb.top) < 8;
      const x1 = ra.left + ra.width / 2 - box.left;
      const x2 = rb.left + rb.width / 2 - box.left;
      const y1 = (row ? ra.top : ra.bottom) - box.top;
      const y2 = rb.top - box.top;
      line.setAttribute(
        'd',
        row
          ? 'M' + x1 + ' ' + y1 + ' Q' + (x1 + x2) / 2 + ' ' + (y1 - 44) + ' ' + x2 + ' ' + y2
          : 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + 34) + ' ' + x2 + ' ' + (y2 - 34) + ' ' + x2 + ' ' + y2,
      );
      const len = line.getTotalLength();
      const ms = Math.max(650, Math.min(1100, len * 3));
      const t0 = performance.now();
      line.style.strokeDasharray = len + ' ' + len;
      line.style.opacity = '1';
      dot.style.opacity = '1';
      const step = (now) => {
        if (mine !== round) {
          line.style.opacity = '0';
          dot.style.opacity = '0';
          return done();
        }
        const u = Math.min(1, (now - t0) / ms);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const p = line.getPointAtLength(len * e);
        line.style.strokeDashoffset = String(len * (1 - e));
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        if (u < 1) return requestAnimationFrame(step);
        dot.style.opacity = '0';
        line.style.opacity = '0';
        done();
      };
      requestAnimationFrame(step);
    });
  const play = async () => {
    const mine = ++round;
    seats.classList.add('flowing');
    while (mine === round) {
      cards.forEach((c) => c.classList.remove('on', 'done'));
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.add('on');
        await wait(1500);
        if (mine !== round) return;
        if (i < cards.length - 1) {
          await hop(cards[i], cards[i + 1], mine);
          if (mine !== round) return;
          cards[i].classList.remove('on');
          cards[i].classList.add('done');
        }
      }
      await wait(2400);
      if (mine !== round) return; // landed: the last seat stays lit a moment, then the round starts again
    }
  };
  const rest = () => {
    round++;
    seats.classList.remove('flowing');
    cards.forEach((c) => c.classList.remove('on', 'done'));
  };
  if (!calm && 'IntersectionObserver' in window)
    new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) play();
          else rest();
        }
      },
      { threshold: 0.35 },
    ).observe(seats);
}

// the scenes in "What the team is made of" play only while their card is on screen
if (!calm && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) e.target.classList.toggle('playing', e.isIntersecting);
    },
    { threshold: 0.3 },
  );
  $$('.traits article').forEach((a) => io.observe(a));
}

// numbers count up once, the first time they are seen; the HTML already holds the final value
function countUp(el) {
  const to = Number(el.dataset.count);
  const t0 = performance.now();
  const ms = 1500;
  const step = (now) => {
    const u = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - u, 3);
    el.textContent = Math.round(to * e).toLocaleString('en-US');
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        seen.unobserve(e.target);
        if (!calm) $$('[data-count]', e.target).forEach(countUp);
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
  );
  $$('.reveal').forEach((el) => seen.observe(el));

  // a film plays only while it is on screen, so two canvases never run behind the reader's back
  const tell = (frame, play) => {
    try {
      frame.contentWindow.postMessage({ fo: 'film', play }, '*');
    } catch (e) {
      /* not loaded yet: its load event tells it */
    }
  };
  const films = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        e.target.dataset.on = e.isIntersecting ? '1' : '';
        tell(e.target, e.isIntersecting);
      }
    },
    { threshold: 0.35 },
  );
  $$('.film iframe').forEach((f) => {
    films.observe(f);
    f.addEventListener('load', () => tell(f, f.dataset.on === '1'));
  });

  // the nav shows which section is being read
  const links = new Map($$('#sections a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          links.forEach((a) => a.classList.remove('here'));
          const a = links.get(e.target.id);
          if (a) a.classList.add('here');
        }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  links.forEach((_, id) => {
    const s = document.getElementById(id);
    if (s) spy.observe(s);
  });
} else {
  $$('.reveal').forEach((el) => el.classList.add('in'));
}
