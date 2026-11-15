// start.js - the Start flow. One card, five stages: intro, the machine (measured when Start is pressed), the model, set up, ready.
// It talks only to the runner (runner-client.js): the one on the customer's own machine. Where there is none yet (the site, before the command has been run) the page only offers the command.
import { $, $$, h } from './ui.js';
import { connect } from './core-port.js';
import { connectRunner, noRunner } from './runner-client.js';
import { hideBar, watchRunner } from './alive.js';
import { follow } from './glide.js';
import { APP, ask, look, markRan, ran } from './where.js';
import { ENGINE, AGENT, MODELS, RECORD, localStrain } from './catalog.js'; // (the add-on's own entry arrives from the runner, with its state)
import { BILLING } from './billing.js';
import { applyMode, chosenMode, setMode } from './mode.js';
applyMode();
// THE STEPS ALONG THE TOP. Developer has four (the machine, the model, the setup, ready). Simple has three, in its own words: the
// machine is looked at for it, so there is nothing to read there.
const railNames = () => {
  const simple = chosenMode() === 'simple';
  const name = (k, text) => {
    const li = document.querySelector('#rail li[data-k="' + k + '"]');
    if (li) li.textContent = text;
  };
  name('model', simple ? 'Choose' : 'Your model');
  name('setup', simple ? 'Getting ready' : 'Set up');
};
railNames();
window.addEventListener('fo:mode', railNames);
window.addEventListener('fo:mode', () => {
  for (const b of document.querySelectorAll('#mode-toggle button'))
    b.setAttribute('aria-pressed', String(b.getAttribute('data-mode-is') === chosenMode()));
}); // the toggle at the top follows the mode, however it was set
import { buyWithWallet, onPaid, paidOffer, planAllows, planPanel, planSentence } from './plan-panel.js';

const stage = $('#stage');
const core = connect();
let runner = await connectRunner(); // the runner under this page can change while it is open (it comes up, it is shut down): see adopt()
let host = null;
let list = [];
let picked = null;
let off = null;
let fellBack = null; // set when the first engine said no on this machine and the next one's models are offered too (the runner's models())
let addons = [];
let wants = {}; // the helpers (catalog.js: ADDONS) as the runner reports them, and which are ticked
// THE PLAN on this machine, as the runner reports it. It is read whenever the runner under the page changes and after anything that can
// change it. Until it has answered nothing is held back on the page: the runner itself refuses what a plan does not cover.
let lic = null;
let planSaid = '';
async function readLic() {
  const r = runner;
  let got = null;
  try {
    got = r.live ? await r.license() : null;
  } catch {
    got = null;
  }
  if (r === runner) {
    lic = got;
    paintPlanStrip();
  }
  return lic;
}
// a choice the plan may not cover: pressing it goes on if it does, and to the Plan step if it does not (which then offers to go on)
const gated = (feature, go) => () => (planAllows(lic, feature) ? go() : getPro());
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// WHERE THIS TAB GOT TO. The page never jumps to a screen because of what the runner happens to hold from before (a team from last
// time, a setup that stopped): those are OFFERED on the first screen. It only returns to a screen this tab itself reached, so a
// reload stays where it was. Kept for the tab alone, and forgotten when the runner under the page goes away.
const here = (v) => {
  try {
    if (v === undefined) return sessionStorage.getItem('familyoffice.at') || '';
    if (v) sessionStorage.setItem('familyoffice.at', v);
    else sessionStorage.removeItem('familyoffice.at');
  } catch {
    /* no storage */
  }
  return '';
};
// the screen to show for the runner as it is now: a setup that is running is always shown; anything else left over is not jumped to
function resume() {
  const st = runner.state();
  if (st.busy || (here() === 'setup' && st.setup && !st.setup.done)) working();
  else if (here() === 'ready' && st.session) ready(st);
  else if (runner.live && location.hash === '#plan') plan();
  else intro();
}

const tag = (cls, text) => h('span', { class: 'tag ' + cls }, text);
const html = (markup) => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}; // static markup only, never data
function rail(k) {
  const order = ['host', 'model', 'setup', 'ready'];
  const at = order.indexOf(k);
  $$('#rail li').forEach((li, i) => {
    li.classList.toggle('on', i < at || k === 'ready');
    li.classList.toggle('now', i === at && k !== 'ready');
  });
}
function show(k, ...kids) {
  if (off && k !== 'setup') {
    off();
    off = null;
  }
  rail(k); // leaving the setup screen stops watching it
  const card = stage.closest('.start-card');
  card.dataset.stage = k;
  card.dataset.wide = runner.live ? '1' : '0'; // with the app running, the steps use the width of the screen (css/start.css)
  stage.replaceChildren(...kids.flat().filter(Boolean));
}
// a number that counts up to its value
function count(el, to, { ms = 900, fixed = 0, suffix = '' } = {}) {
  if (reduce || !Number.isFinite(to)) {
    el.textContent = (Number.isFinite(to) ? to.toFixed(fixed) : to) + suffix;
    return el;
  }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - (1 - p) ** 3;
    el.textContent = (to * e).toFixed(fixed) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return el;
}

// THE HEADER says what is true now and, while the runner is up, offers the way to stop it. It is redrawn whenever the runner changes.
{
  const tagEl = $('#mode');
  const box = h('span', { class: 'mode-box' });
  tagEl.replaceWith(box);
  box.append(tagEl);
  tagEl.hidden = false;
}
const shutFlag = (v) => {
  try {
    if (v) sessionStorage.setItem('familyoffice.shut', '1');
    else sessionStorage.removeItem('familyoffice.shut');
  } catch {
    /* no storage */
  }
};
function header() {
  const tagEl = $('#mode');
  const old = $('#shut');
  if (old) old.remove();
  tagEl.className = 'tag ' + (runner.live ? 'ok' : '');
  tagEl.textContent = runner.live ? (APP ? 'Connected to your computer' : 'Running on this machine') : 'Not started';
  const oldToggle = $('#mode-toggle');
  if (oldToggle) oldToggle.remove();
  tagEl.style.display = '';
  if (!runner.live || APP) return;
  // ON THE COMPUTER, WITH THE APP RUNNING: where the tag said so, the choice of mode. That it is running is already plain from the
  // Shut down button beside it. Pressing a side sets the mode and the page picks up where the app stands, in that mode: nothing reloads.
  const side = (m, name) =>
    h(
      'button',
      {
        type: 'button',
        'data-mode-is': m,
        'aria-pressed': String(chosenMode() === m),
        onclick: () => {
          if (chosenMode() === m) return;
          setMode(m);
          resume();
        },
      },
      name,
    );
  const toggle = h(
    'div',
    { class: 'mode-toggle', id: 'mode-toggle', role: 'group', 'aria-label': 'Mode' },
    side('simple', 'Simple'),
    side('developer', 'Developer'),
  );
  tagEl.style.display = 'none';
  tagEl.after(toggle); // on the phone there is nothing here to shut down: that is the computer's
  const btn = h('button', { class: 'btn small', type: 'button', id: 'shut' }, 'Shut down');
  btn.onclick = async () => {
    if (btn.dataset.sure !== '1') {
      btn.dataset.sure = '1';
      btn.textContent = 'Really shut down?';
      setTimeout(() => {
        if (btn.isConnected && !btn.disabled) {
          btn.dataset.sure = '';
          btn.textContent = 'Shut down';
        }
      }, 3500);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Shutting down…';
    shutFlag(true);
    const was = runner;
    try {
      await was.shutdown();
    } catch {
      /* it may already be gone */
    }
    if (was.remote) lost();
    else {
      tagEl.className = 'tag warn';
      tagEl.textContent = 'Shut down';
      tagEl.style.display = '';
      toggle.remove();
      btn.remove();
    } // a page the runner itself served can only say so
  };
  toggle.after(btn);
}
// THE RUNNER UNDER THIS PAGE CHANGED. Carry on from where it is: a setup under way, a team already started, or the beginning.
// Nothing reloads: the page keeps its place and only what is true changes.
function adopt(next) {
  if (off) {
    off();
    off = null;
  }
  if (runner !== next && runner.close) runner.close();
  runner = next;
  header();
  lic = null;
  readLic();
  resume();
}
// the runner this page was driving is gone (shut down here, or stopped): back to the start, with the command, ready to be run again
function lost() {
  hideBar();
  if (!runner.live) return;
  core.stop();
  here('');
  adopt(noRunner());
}
// (when this page already shows that nothing is running, with the command to start it, the bar along the bottom would only say it twice)
addEventListener('fo:runner-gone', (e) => {
  if (runner.remote) {
    e.preventDefault();
    lost();
  } else if (!runner.live) {
    e.preventDefault();
    hideBar();
  }
});
addEventListener('fo:runner-back', (e) => {
  e.preventDefault();
  connectRunner({ fresh: true }).then((next) => {
    if (next.live) adopt(next);
  });
});

// ---------- intro ----------
// ---------- Simple or Developer: asked once, before anything else, and changeable from here or from the top of the app ----------
function choose() {
  here('');
  rail('intro');
  const one = (id, k, title, text, points, label) =>
    h(
      'article',
      { class: 'way', 'data-way': id },
      h('span', { class: 'k' }, k),
      h('h3', null, title),
      h('p', { class: 'muted' }, text),
      h(
        'ul',
        null,
        points.map((p) => h('li', null, p)),
      ),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          id: 'mode-' + id,
          onclick: () => {
            setMode(id);
            intro();
          },
        },
        label,
      ),
    );
  show(
    'intro',
    h(
      'div',
      { class: 'pick-head' },
      h('h1', { id: 'st-title' }, 'Start your ', h('em', null, 'team')),
      h(
        'p',
        { class: 'lede' },
        'Two ways to use it. Choose the one that sounds like you: it can be changed at any time, and nothing is lost when you do.',
      ),
    ),
    runner.remote ? launchCard() : null,
    h(
      'div',
      { class: 'ways two', id: 'modes' },
      one(
        'simple',
        'Simple',
        'Just talk to it',
        'Ask it things, have it look something up, show it a page or a picture, and ask it for pictures and video.',
        [
          'One choice to make, then Start',
          'It thinks on this computer, or with Claude',
          'No code, no tickets, nothing to learn first',
        ],
        'Use Simple',
      ),
      one(
        'developer',
        'Developer',
        'A team that ships code',
        'Choose the model yourself, connect a repository and Jira, and have every change proven before it lands.',
        [
          'Every model this computer can run, with what we measured',
          'GitHub, a Git folder on this machine, and Jira',
          'Proofs, and what the team has learned',
        ],
        'Use Developer',
      ),
    ),
  );
}
// SIMPLE: one choice, in plain words: where the team thinks. On this computer, where we choose the model that suits it and nothing
// that is said ever leaves; or with Claude, where nothing is downloaded. Whichever suits the computer is marked, and already chosen.
let simpleMind = '';
let simpleSeq = 0;
let simpleRepaint = null; // simpleRepaint: draws Simple's choice again when the plan changes (a code was used)
async function simple() {
  if (runner.state().busy) return working();
  here('');
  rail('intro');
  const head = h(
    'div',
    { class: 'pick-head' },
    h('h1', { id: 'st-title' }, 'Start your ', h('em', null, 'team')),
    h(
      'p',
      { class: 'lede' },
      'Talk to it, have it look things up, show it a page or a picture, and ask it for pictures and video. First, one choice: where it thinks.',
    ),
  );
  const mine = ++simpleSeq;
  simpleRepaint = null;
  show('intro', head, reading('Looking at this computer…', 'Still looking. This takes a moment the first time.')); // no runner card here: the top of the page already says it is running
  rail('model'); // Simple's first step is the choice (after show, which sets the steps for the page it draws)
  let got = null;
  let extras = [];
  try {
    got = await runner.models();
    host = got.host;
  } catch {
    got = null;
  }
  try {
    extras = got ? (await runner.addons()).list || [] : [];
  } catch {
    extras = [];
  }
  if (!lic) await readLic().catch(() => null); // what the plan allows is part of the choice
  if (mine !== simpleSeq || chosenMode() !== 'simple' || runner.state().busy) return; // the person moved on while this was being read
  const best = got ? got.models.find((m) => m.recommended && m.fits) || got.models.find((m) => m.fits) || null : null;
  const sizeGb = best ? best.sizeGb || best.estGb || 0 : 0;
  const onHand = !!(best && (best.cached || best.running));
  const why = !got
    ? 'This computer could not be read just now.'
    : (got.host.blockers || [])[0] || 'This computer does not have the memory for one.';
  // WHICH IS CHOSEN. What the person chose before is kept only while the machine and the plan still allow it: a mind on this computer
  // that the plan no longer covers (a code was switched off, a paid month ran out) is not left chosen. Until they press one themself
  // on this visit, the choice follows the two: on this computer where both allow it, Claude otherwise. It is settled again on every
  // draw, so it moves the moment the plan changes.
  let saved = '';
  let pressed = false;
  try {
    saved = localStorage.getItem('familyoffice.simple.mind') || '';
  } catch {
    saved = '';
  }
  const canLocal = () => !!best && (!lic || !lic.enforce || planAllows(lic, 'managed_local'));
  // a machine a model would strain: Claude is chosen for it, and the computer stays there to be chosen knowingly
  const strain = got ? localStrain(got.host, best) : null;
  const settle = () => {
    if (!pressed) simpleMind = canLocal() && saved !== 'claude' && !(strain && saved !== 'local') ? 'local' : 'claude';
  };
  settle();
  wants = helpersWanted(extras);
  const box = h('div', { class: 'simple' });
  const paint = () => {
    settle();
    // WHAT THE PLAN ALLOWS, on each choice. open: billing is not switched on, and nothing is said. Otherwise a mind on this computer is
    // in the plan or needs the paid one, and Claude is in every plan.
    const open = !lic || !lic.enforce;
    const allowed = planAllows(lic, 'managed_local');
    const offer = open ? null : paidOffer(lic);
    const paidName = (offer && offer.name) || 'Pro';
    const opt = (id, kind, title, text, points, off, rec, mark) => {
      const on = simpleMind === id;
      const pick = () => {
        if (off) return;
        simpleMind = id;
        pressed = true;
        saved = id;
        try {
          localStorage.setItem('familyoffice.simple.mind', id);
        } catch {
          /* a private window */
        }
        paint();
        $('#mind-' + id).focus();
      };
      return h(
        'div',
        {
          class: 'way pickable',
          role: 'radio',
          id: 'mind-' + id,
          tabindex: off ? '-1' : '0',
          'aria-checked': String(on),
          'aria-disabled': off ? 'true' : null,
          onclick: pick,
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick();
            }
          },
        },
        h('span', { class: 'k' }, kind, rec ? h('span', { class: 'rec' }, 'Suits this computer') : null, mark || null),
        h('h3', null, title),
        h('p', { class: 'muted' }, text),
        h(
          'ul',
          null,
          points.map((p) => h('li', null, p)),
        ),
      );
    };
    const ticked = extras.filter((a) => wants[a.id]);
    box.replaceChildren(
      ...[
        // a list, so a part that is not there is left out and never printed as the word null
        h(
          'div',
          { class: 'ways two', role: 'radiogroup', 'aria-label': 'Where your team thinks' },
          opt(
            'local',
            'Private',
            'On this computer',
            best
              ? 'A mind that lives on ' + HERE() + '. What you say never leaves it, and it costs nothing to use.'
              : why,
            best
              ? [
                  onHand
                    ? 'It is already on ' + HERE() + ': ready in about a minute'
                    : sizeGb
                      ? 'First a download of about ' + sizeGb + ' GB, once'
                      : 'First a download, once. Its size is said before it starts',
                  'We chose ' + best.name + ' for ' + HERE(),
                  strain
                    ? 'It would be slow here, and ' + HERE() + ' would feel busy while it thinks: ' + strain.why[0]
                    : 'It takes its time with an answer',
                  open || allowed
                    ? null
                    : 'It needs ' + paidName + ': use a code or get ' + paidName + ' in the bar above',
                ].filter(Boolean)
              : ['Your team can think with Claude instead'],
            !best,
            !!best && (open || allowed) && !strain, // marked as the one to take only when the plan lets it start, and the machine is up to it
            open
              ? null
              : h(
                  'span',
                  { class: 'plan-mark ' + (allowed ? 'ok' : 'need'), id: 'plan-mark-local' },
                  allowed ? 'In your ' + ((lic && lic.name) || 'plan') + ' plan' : 'Needs ' + paidName,
                ),
          ),
          opt(
            'claude',
            'Quickest',
            'With Claude',
            'The Claude you already have, through Claude Code on ' + HERE() + '.',
            [
              'Nothing to download: ready in about a minute',
              'It counts against your own Claude plan',
              'What you ask is sent to Claude',
            ],
            false,
            !best || !!strain,
            open ? null : h('span', { class: 'plan-mark', id: 'plan-mark-claude' }, 'In every plan'),
          ),
        ),
        simpleMind === 'local' && extras.length && (open || allowed)
          ? h(
              'fieldset',
              { class: 'extras', id: 'extras' },
              h('legend', null, 'Also let it'),
              extras.map((a) =>
                h(
                  'label',
                  { class: 'extra' },
                  h('input', {
                    type: 'checkbox',
                    id: 'extra-' + a.id,
                    checked: !!wants[a.id],
                    onchange: (e) => {
                      wants = helpersWanted(null, { ...wants, [a.id]: e.target.checked });
                      paint();
                    },
                  }),
                  h(
                    'span',
                    null,
                    h('strong', null, a.tick),
                    h(
                      'span',
                      { class: 'muted' },
                      a.state === 'ready' || a.state === 'off'
                        ? 'Already on ' + HERE()
                        : 'About ' + a.sizeGb + ' GB more to download',
                    ),
                  ),
                ),
              ),
            )
          : null,
        h(
          'div',
          { class: 'simple-go' },
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              id: 'simple-start',
              onclick: () =>
                simpleMind === 'claude'
                  ? begin('claude')
                  : gated('managed_local', () => begin({ model: best.id, addons: ticked.map((a) => a.id) }))(),
            },
            simpleMind === 'local' && !open && !allowed ? 'Get ' + paidName + ' to start' : 'Start',
          ),
          h(
            'span',
            { class: 'muted' },
            simpleMind === 'claude'
              ? 'Claude Code is found or installed, signed in as you, and tried once.'
              : 'It is set up and tried once before you talk to it' +
                  (ticked.length ? ', with ' + ticked.length + (ticked.length === 1 ? ' extra' : ' extras') : '') +
                  '.',
          ),
        ),
        simpleMind === 'claude' ? claudeWho() : null,
      ].filter(Boolean),
    );
  };
  // the plan, with its code box, sits above the choice exactly as it does in Developer; when it changes, the choice is drawn again
  // a team that is still set up is offered here too, never jumped to
  paint();
  show('intro', head, resumeStrip(), h('div', { class: 'plan-strip', id: 'plan-strip', hidden: true }), box);
  simpleRepaint = () => {
    if (box.isConnected) paint();
    else simpleRepaint = null;
  };
  paintPlanStrip();
  rail('model');
}
function intro() {
  if (runner.state().busy) return working(); // a setup is under way: show it, never a second Start
  here('');
  rail('intro');
  const way = (id, k, title, text, points, label, go) =>
    h(
      'article',
      { class: 'way', 'data-way': id },
      h('span', { class: 'k' }, k),
      h('h3', null, title),
      h('p', { class: 'muted' }, text),
      h(
        'ul',
        null,
        points.map((p) => h('li', null, p)),
      ),
      h('button', { class: 'btn primary', type: 'button', id: 'go-' + id, onclick: go }, label),
      id === 'claude' ? claudeWho() : null,
    );
  const half = (title, sub, ...kids) =>
    h(
      'section',
      { class: 'half real', 'aria-labelledby': 'real-h' },
      h('header', { class: 'half-head' }, h('h2', { id: 'real-h' }, title), h('p', { class: 'muted' }, sub)),
      ...kids.filter(Boolean),
    );
  const LOCAL = [
    'No account and no key',
    'We measure this machine and show what it can run',
    'Best at one checked step at a time',
  ];
  const CLAUDE = [
    'Uses your own Claude sign-in, kept by Claude Code',
    "Installed for you if it is missing, with Anthropic's own installer",
    'If it is signed out, you sign in to Claude right here',
    'Counts against your own Claude plan',
  ];
  if (runner.live && !chosenMode()) return choose(); // first of all: Simple or Developer
  if (runner.live && chosenMode() === 'simple') return simple();
  if (runner.live) {
    show(
      'intro', // the runner is up on this machine: choose how the team thinks. The three ways are the page: nothing frames them.
      h(
        'div',
        { class: 'pick-head' },
        h('h1', { id: 'st-title' }, 'Start your ', h('em', null, 'team')),
        h(
          'p',
          { class: 'lede' },
          'Your team needs a mind to think with. Choose where it runs. Either way it works on this machine, in your repo, and nothing is hosted by us.',
        ),
      ),
      runner.remote ? launchCard() : null,
      resumeStrip(),
      h('div', { class: 'plan-strip', id: 'plan-strip', hidden: true }), // the plan on this machine: filled by paintPlanStrip() when the runner has answered
      h(
        'div',
        { class: 'ways three' },
        way(
          'local',
          'On this machine',
          'A local model',
          'Open models, run by ' + ((host && host.engineName) || ENGINE.name) + ' on the hardware you already own.',
          LOCAL,
          'Start local',
          gated('managed_local', machine),
        ),
        way(
          'existing',
          'Already running',
          'A model you already serve',
          'A model server that is already up: on this machine, or on another one you can reach.',
          [
            'Finds Ollama, LM Studio, llama.cpp, vLLM and the like on this machine',
            'Add another machine by its address',
            'Nothing is installed on it, and it is never stopped',
          ],
          'Find running models',
          gated('found_here', existing),
        ),
        way(
          'claude',
          'With Claude',
          'Claude Code',
          'Claude Code on this machine, signed in as you. We set it up for you if it is not there yet.',
          CLAUDE,
          'Start with Claude',
          () => begin('claude'),
        ),
      ),
    );
    paintPlanStrip();
    if (!lic) readLic();
    return;
  }
  show(
    'intro', // the site, with nothing started on this machine yet: one command, and this page becomes the team
    h('h1', { id: 'st-title' }, 'Start your ', h('em', null, 'team')),
    h('p', { class: 'lede' }, 'Your team runs on your own machine, in your repo, and nothing is hosted by us.'),
    half(
      'Start your team on this machine',
      'One command, and this page becomes your team. Then you choose how it thinks: a local model, or your own Claude Code.',
      launchCard(),
      BILLING.enforce
        ? h(
            'p',
            { class: 'muted small' },
            'Free with your own Claude Code. Pro adds local models; it, or a code, is chosen on this same page once your team is running.',
          )
        : null,
    ),
  );
}

// WHAT THE RUNNER STILL HOLDS FROM BEFORE is offered on the first screen, never jumped to: a setup that stopped, or a team that is
// still set up. The three choices stay in front of the customer; this is one more thing they may press.
function resumeStrip() {
  const st = runner.state();
  const ses = st.session;
  const stopped = st.setup && !st.setup.done && !st.busy ? st.setup : null;
  if (!runner.live || (!ses && !stopped)) return null;
  const short = (m) =>
    String(m || '')
      .split('/')
      .pop()
      .replace(/\.(gguf|safetensors|bin)$/i, '');
  return h(
    'div',
    { class: 'plan-strip resume', id: 'resume-strip' },
    h('span', { class: 'tag ' + (stopped ? 'warn' : 'ok') }, stopped ? 'Stopped' : 'Set up'),
    h(
      'span',
      { class: 't' },
      h(
        'strong',
        null,
        stopped
          ? chosenMode() === 'simple'
            ? 'Getting your team ready stopped before it finished'
            : 'A setup of ' + short(stopped.model && stopped.model.name) + ' stopped before it finished'
          : chosenMode() === 'simple'
            ? 'Your team is still here, ' +
              (ses.kind === 'claude' ? 'thinking with Claude' : 'thinking on this computer')
            : 'Your team from before is still set up, on ' + (ses.kind === 'claude' ? 'Claude Code' : short(ses.model)),
      ),
      h(
        'span',
        null,
        stopped
          ? 'See where it stopped and continue it, or choose again below.'
          : 'Carry on with it, or choose again below.',
      ),
    ),
    h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        id: 'resume-go',
        onclick: () => (stopped ? working() : ready(runner.state())),
      },
      stopped ? 'See where it stopped' : 'Carry on with this team',
    ),
  );
}

// WHO CLAUDE CODE IS SIGNED IN AS, beside the choice to use it, with the way to another account. It fills itself in once the
// machine has answered. Where Claude Code is missing or signed out it says that instead (the setup's own steps deal with both).
function claudeWho() {
  const el = h('p', { class: 'muted small claude-who', role: 'status' });
  if (!runner.live || !runner.claudeAccount) return el;
  runner
    .claudeAccount()
    .then((who) => {
      if (!who) return;
      // said in every state, so the line is never simply missing: not installed, signed out, or who it is signed in as
      if (!who.installed)
        return void el.replaceChildren('Claude Code is not on this machine yet. Starting installs it for you.');
      if (who.signedIn !== true)
        return void el.replaceChildren(
          who.signedIn === false
            ? 'Claude Code on this machine is signed out. Starting opens its sign-in for you.'
            : 'Claude Code is on this machine. It did not say whether it is signed in; starting finds out.',
        );
      const other = h('button', { class: 'linkish', type: 'button', id: 'claude-other' }, 'Use another account');
      other.onclick = async (e) => {
        e.stopPropagation();
        other.disabled = true;
        other.textContent = 'Signing out…';
        const r = await runner.fix('claude-logout').catch((x) => ({ ok: false, said: x.message }));
        if (!r.ok) {
          other.disabled = false;
          other.textContent = 'Use another account';
          el.append(' That could not be done' + (r.said ? ': ' + r.said : '.'));
          return;
        }
        begin('claude'); // signed out now: the setup opens Claude's sign-in page as its sign-in step
      };
      el.replaceChildren((who.detail || 'Signed in') + ' to Claude on this machine. ', other);
    })
    .catch(() => {});
  return el;
}

// On the hosted site: the one command that fetches this app's runner from this same address and starts it on the customer's machine.
function launchCard() {
  const base = new URL('.', location.href).href;
  // the address is this page's own: whatever site serves it. A Windows machine is given the PowerShell command, which does the same.
  const win = /Windows/i.test(navigator.userAgent);
  // It runs in the PowerShell window it is pasted into and starts no second one: a PowerShell started with a command that fetches and
  // runs a script is refused by security software ("Access is denied"). The two parts may wrap inside the box: neither is short.
  const psSite = "$env:FO_SITE='" + base + "';";
  const psGet = 'irm ' + base + 'myfamilyoffice.ps1 | iex';
  const cmd = win ? psSite + ' ' + psGet : 'curl -fsSL ' + base + 'myfamilyoffice.sh | sh -s ' + base;
  const code = win
    ? h('code', { id: 'win-cmd' }, h('span', null, psSite), ' ', h('span', null, psGet))
    : h(
        'code',
        null,
        h('span', { class: 'nb' }, 'curl -fsSL ' + base + 'myfamilyoffice.sh'),
        ' | ',
        h('span', { class: 'nb' }, 'sh -s ' + base),
      );
  const copy = h('button', { class: 'btn primary', type: 'button' }, 'Copy');
  // THE LIVE STATE of what the command started, read from this machine. When the app comes up, THIS page attaches to it and carries on
  // as the app: no second page opens. The page asks the machine only after the command has been copied here once, so a first visit
  // never makes the browser ask for permission to look at this machine.
  const status = h('div', { class: 'run-state', role: 'status', 'aria-live': 'polite', hidden: '' });
  const flag = (k, v) => {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* no storage */
    }
    return null;
  };
  let state = runner.remote ? 'active' : flag('familyoffice.shut') === '1' ? 'stopped' : ran() ? 'rest' : 'idle';
  let info = null;
  let port = 0;
  let timer = 0;
  let since = 0;
  // the version this site serves now: a runner started from an older copy is told apart, and the page says how to update it
  let siteVersion = '';
  fetch('manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      siteVersion = (m && m.version) || '';
      if (status.isConnected && state === 'active') paint();
    })
    .catch(() => {});
  const stale = () => !!(info && siteVersion && info.version && info.version !== 'dev' && info.version !== siteVersion);
  const copyCmd = () => {
    const b = h('button', { class: 'btn primary small', type: 'button' }, 'Copy the command');
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(cmd);
        b.textContent = 'Copied';
      } catch {
        b.textContent = cmd;
      }
      markRan();
    };
    return b;
  };
  const EVERY = {
    waiting: 1200,
    setup: 800,
    stopping: 700,
    joining: 700,
    active: 3000,
    rest: 2500,
    stopped: 2000,
    failed: 2500,
  };
  const paint = () => {
    status.hidden = state === 'idle';
    status.dataset.state = state === 'joining' ? 'setup' : state;
    const line = (mark, strong, text, ...acts) =>
      status.replaceChildren(
        mark,
        h('span', { class: 't' }, h('strong', null, strong), text ? h('span', null, text) : null),
        ...acts.filter(Boolean),
      );
    const dot = (c) => h('span', { class: 'dot ' + c, 'aria-hidden': 'true' });
    const dots = () => h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    const spin = () => h('span', { class: 'spin', 'aria-hidden': 'true' });
    const facts = () =>
      info
        ? 'Version ' +
          info.version +
          (info.busy ? ' · a setup is under way' : info.team ? ' · your team is started' : ' · no team started yet')
        : 'Checking…';
    if (state === 'waiting')
      line(
        dots(),
        'Waiting for the command',
        Date.now() - since > 90000
          ? 'Nothing seen yet. If Terminal says your team is running, this browser is not letting the page reach this machine; the app opens at its own address instead.'
          : 'Paste it into Terminal and press Return. This page carries on by itself.',
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              state = 'idle';
              paint();
            },
          },
          'Stop looking',
        ),
      );
    else if (state === 'setup') line(spin(), 'Setting up on this machine', (info && info.step) || 'starting');
    else if (state === 'joining') line(spin(), 'Running on this machine', 'Bringing this page over to it…');
    else if (state === 'active' && runner.remote && stale())
      line(
        dot('is-run'),
        'Running on this machine, but an older version',
        'It is version ' +
          info.version +
          ' and this site now has ' +
          siteVersion +
          '. Run the command again in Terminal: it stops the old one, fetches the new one, and this page carries on.',
        copyCmd(),
        h('button', { class: 'btn small', type: 'button', onclick: shut }, 'Shut down'),
      );
    else if (state === 'active' && runner.remote)
      line(
        dot('is-green'),
        'Running on this machine, and this page is in control of it',
        facts() + '. Close this page and it stops by itself.',
        h('button', { class: 'btn small', type: 'button', onclick: shut }, 'Shut down'),
      );
    else if (state === 'active')
      line(
        dot('is-green'),
        'Running on this machine',
        facts(),
        info
          ? h(
              'a',
              {
                class: 'btn primary small',
                href: 'http://127.0.0.1:' + info.port + '/' + (info.team ? 'app.html' : 'start.html'),
                target: '_blank',
                rel: 'noopener',
              },
              'Open my team',
            )
          : null,
        h('button', { class: 'btn small', type: 'button', onclick: shut }, 'Shut down'),
      );
    else if (state === 'stopping') line(dots(), 'Shutting down', 'Stopping what it started on this machine.');
    else if (state === 'stopped')
      line(
        dot('is-off'),
        'Shut down',
        'Nothing is running on this machine. Run the command again and this page carries on by itself.',
      );
    else if (state === 'failed')
      line(
        dot('is-red'),
        'It stopped before it finished',
        'Terminal says why. Run the command again once that is sorted.',
      );
    else if (state === 'rest')
      line(dot('is-off'), 'Not running right now', 'Run the command to start your team on this machine.');
  };
  // the app is up and will let this page drive it: this page becomes the app, in place. If the browser will not allow it, the page says
  // so once and offers the app at its own address instead.
  let refused = false;
  let missed = 0;
  const join = async () => {
    state = 'joining';
    paint();
    const next = await connectRunner({ fresh: true }).catch(() => null);
    if (next && next.live) {
      flag('familyoffice.shut', null);
      await watchRunner({ fresh: true });
      adopt(next);
      return true;
    }
    refused = true;
    state = 'active';
    return false;
  };
  const tick = async () => {
    clearTimeout(timer);
    if (!status.isConnected || state === 'idle' || state === 'joining') return; // the card has gone, nobody is looking, or the page is on its way over
    const was = state;
    let found = await look(port || undefined);
    if (!found && port) found = await look();
    if (!found && runner.remote && was === 'active' && ++missed < 3) {
      timer = setTimeout(tick, 1500);
      return;
    } // attached and running a moment ago: look twice more before believing it has gone
    port = found ? found.port : 0;
    if (found) {
      missed = 0;
      info = found;
      markRan(found.port);
      state = found.state === 'setting-up' ? 'setup' : was === 'stopping' ? 'stopping' : 'active';
      if (state === 'active' && !runner.remote && found.drive && !refused && (await join())) return;
    } else if (was === 'active' || was === 'stopping') {
      if (was === 'stopping') flag('familyoffice.shut', '1');
      if (runner.remote) return lost();
      state = 'stopped';
    } // gone: this page returns to its start, command and all
    else if (was === 'setup') {
      await new Promise((r) => setTimeout(r, 1500));
      const again = await look();
      if (again) {
        info = again;
        port = again.port;
        state = again.state === 'setting-up' ? 'setup' : 'active';
      } else state = 'failed';
    } // the hand-over from the launcher to the app takes a moment
    else if (was === 'waiting' && Date.now() - since > 15 * 60000) state = 'rest';
    paint();
    timer = setTimeout(tick, EVERY[state] || 3000);
  };
  async function shut() {
    state = 'stopping';
    paint();
    flag('familyoffice.shut', '1');
    try {
      await fetch('http://127.0.0.1:' + (info ? info.port : port) + '/api/shutdown', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } catch {
      /* it may already be gone */
    }
    if (runner.remote) return lost();
    tick();
  }
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      copy.textContent = 'Copied';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(code);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      copy.textContent = 'Selected: copy it';
    }
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, 2400);
    markRan();
    flag('familyoffice.shut', null);
    refused = false;
    if (state !== 'active' && state !== 'setup') {
      state = 'waiting';
      since = Date.now();
      paint();
    }
    tick();
  };
  if (state !== 'idle') {
    setTimeout(paint, 0);
    setTimeout(tick, state === 'stopped' ? 1800 : 0);
  } // just shut down: give it a moment to be gone before looking again
  if (runner.remote)
    return h(
      'section',
      { class: 'launch', 'aria-labelledby': 'launch-h' }, // already attached: the state and the way to stop it, nothing to copy
      h('h3', { id: 'launch-h' }, "Your team's runner is up"),
      status,
    );
  return h(
    'section',
    { class: 'launch', 'aria-labelledby': 'launch-h' },
    h(
      'h3',
      { id: 'launch-h' },
      win ? 'Paste this one command into PowerShell' : 'Paste this one command into Terminal',
    ),
    /iPhone|iPad|Android/i.test(navigator.userAgent)
      ? h(
          'p',
          { class: 'note' },
          'Your team runs on a computer, not on a phone. Open this page on your computer to start it there.',
        )
      : null,
    win
      ? h(
          'p',
          { class: 'note', id: 'win-note' },
          'This is the command for Windows: open PowerShell from the Start menu and paste it there. We have checked each step of it, but have not yet run it from start to finish on a Windows machine of our own.',
        )
      : null,
    h('div', { class: 'cmd' }, code, copy),
    status,
    h(
      'ul',
      null,
      h(
        'li',
        null,
        win
          ? 'Paste it into PowerShell. Nothing has to be installed first, and it never asks for a password or for administrator rights.'
          : 'Paste it into Terminal. Nothing has to be installed first, and it never asks for a password.',
      ),
      h(
        'li',
        null,
        win
          ? "If this PC has no Node.js 22, it fetches Node's own build into the .familyoffice folder in your user folder, for this app only. Nothing else on the PC is changed. If the PC already has Windows' Linux layer (WSL), your team runs there instead."
          : "If this machine has no Node.js 22, it fetches Node's own build into ~/.familyoffice, for this app only. No Homebrew, and nothing else on the machine is changed.",
      ),
      h(
        'li',
        null,
        "It fetches this app from this address, checks every file against the site's own list, and starts it on 127.0.0.1, where only this machine can reach it. Then this page carries on as your team: no new page opens.",
      ),
      h(
        'li',
        null,
        'It stops by itself when you close this page, or when you press Shut down. Nothing is left running.',
      ),
    ),
    h(
      'p',
      { class: 'muted small' },
      'Read it first if you like, it is two short files: ',
      win
        ? h('a', { href: 'myfamilyoffice.ps1' }, 'myfamilyoffice.ps1')
        : h('a', { href: 'myfamilyoffice.sh' }, 'myfamilyoffice.sh'),
      ' and ',
      h('a', { href: 'myfamilyoffice.mjs' }, 'myfamilyoffice.mjs'),
      '.',
    ),
  );
}

// ---------- the plan ----------
// THE STRIP on the first screen says what this machine is on and offers the two ways to more: take the paid plan, or type a code. A
// choice the plan does not cover says so on its own card. It is filled in place when the runner answers, so nothing on the screen jumps.
function paintPlanStrip() {
  if (simpleRepaint) simpleRepaint(); // Simple's choice says what the plan allows, so it follows the plan
  const el = $('#plan-strip');
  if (!el) return;
  if (!runner.live || !lic) {
    el.hidden = true;
    return;
  }
  const offer = paidOffer(lic);
  const cost = offer && offer.price ? offer.price + (offer.days ? ' for ' + offer.days + ' days' : '') : '';
  const said = (strong, ...rest) => h('span', { class: 't' }, h('strong', null, strong), h('span', null, rest));
  const btn = (label, go, id, primary) =>
    h('button', { class: 'btn small' + (primary ? ' primary' : ''), type: 'button', id, onclick: go }, label);
  el.hidden = false;
  el.dataset.plan = !lic.enforce ? 'open' : onPaid(lic) ? 'paid' : 'free';
  if (!lic.enforce)
    el.replaceChildren(
      h('span', { class: 'tag' }, 'Plan'),
      said('Everything is open for now', 'Billing is not switched on yet. Nothing here can charge you.'),
      btn('See the plans', () => plan(), 'plan-open'),
    );
  else if (onPaid(lic))
    el.replaceChildren(
      h('span', { class: 'tag ok' }, lic.name),
      h(
        'span',
        { class: 't' },
        strip.said ? h('strong', { id: 'strip-said' }, strip.said) : null,
        h('span', null, planSentence(lic)),
      ),
      btn('Your plan', () => plan(), 'plan-open'),
    );
  else {
    // on Free: paying and typing a code both happen here, in place, and what they say is said here
    const status = strip.said
      ? h(
          'p',
          { class: 'strip-said', role: 'status', id: 'strip-said' },
          strip.busy ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : null,
          h('span', null, strip.said),
        )
      : null;
    const head = [
      h('span', { class: 'tag ok' }, 'Free'),
      said(
        'You are on Free: your team runs on your own Claude Code',
        offer
          ? offer.name +
              (cost ? ', ' + cost : '') +
              ', adds ' +
              offer.blurb.charAt(0).toLowerCase() +
              offer.blurb.slice(1)
          : '',
      ),
    ];
    const box = h('input', {
      id: 'strip-code',
      type: 'text',
      placeholder: 'Your code',
      'aria-label': 'Access code',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '80',
      value: strip.code,
      oninput: (e) => {
        strip.code = e.target.value;
      },
    });
    const acts =
      strip.mode === 'code'
        ? [
            h(
              'form',
              { class: 'strip-code', onsubmit: useCode },
              box,
              h('button', { class: 'btn small primary', type: 'submit', disabled: strip.busy }, 'Use this code'),
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: () => {
                    strip.mode = '';
                    strip.said = '';
                    paintPlanStrip();
                  },
                },
                'Cancel',
              ),
            ),
          ]
        : strip.busy
          ? []
          : [
              offer ? btn('Get ' + offer.name, getPro, 'plan-open', true) : null,
              btn(
                'I have a code',
                () => {
                  strip.mode = 'code';
                  strip.said = '';
                  paintPlanStrip();
                },
                'plan-code-open',
              ),
              strip.noWallet ? btn('Other ways to pay', () => plan(), 'plan-other') : null,
            ];
    el.replaceChildren(...[...head, ...acts, status].filter(Boolean));
    if (strip.mode === 'code' && !strip.busy)
      setTimeout(() => {
        if (box.isConnected) box.focus({ preventScroll: true });
      }, 0);
  }
  // each way says where it stands on this plan. On Free, what Free covers is marked Free and lit; what needs the paid plan is marked
  // with its name and steps back, and its button says what pressing it leads to. On the paid plan, or with billing off, nothing is marked.
  const free = lic.enforce && !onPaid(lic);
  const name = offer ? offer.name : 'Pro';
  const mark = (id, feature, label, lockedLabel) => {
    const card = $('[data-way="' + id + '"]');
    const go = $('#go-' + id);
    if (!card || !go) return;
    const locked = !planAllows(lic, feature);
    card.classList.toggle('locked', locked);
    card.classList.toggle('free-here', free && !locked);
    if (locked || free) card.dataset.plan = locked ? name : 'Free';
    else delete card.dataset.plan;
    go.textContent = locked ? lockedLabel : label;
    go.classList.toggle('primary', !locked);
  };
  mark('local', 'managed_local', 'Start local', 'Get ' + name + ' to start local');
  mark('existing', 'found_here', 'Find running models', 'Get ' + name + ' to use yours');
  mark('claude', 'claude', free ? 'Start free with Claude' : 'Start with Claude', 'Start with Claude');
  const far = $('[data-way="existing"]');
  if (far) far.classList.toggle('no-remote', planAllows(lic, 'found_here') && !planAllows(lic, 'remote'));
}
// GET PRO, in place: the wallet in this browser connects, signs for this machine and pays, and the strip says each step as it happens.
// No other screen opens. With no wallet in this browser the strip says so and offers the other ways.
const strip = { mode: '', said: '', busy: false, code: '', noWallet: false };
async function getPro() {
  if (strip.busy) return;
  const el = $('#plan-strip');
  if (el) el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  strip.busy = true;
  strip.mode = '';
  strip.noWallet = false;
  const r = await buyWithWallet({
    runner,
    say: (text) => {
      strip.said = text;
      paintPlanStrip();
    },
  });
  strip.busy = false;
  strip.noWallet = !!r.none;
  strip.said = r.ok ? (r.had ? 'That wallet already holds the plan.' : 'Paid.') : r.why;
  await readLic();
}
// A CODE, typed in place. A wrong one says so and keeps what was typed.
async function useCode(e) {
  e.preventDefault();
  const v = strip.code.trim();
  if (!v || strip.busy) return;
  strip.busy = true;
  strip.said = 'Checking the code…';
  paintPlanStrip();
  try {
    await runner.redeem(v);
    strip.said = '';
    strip.mode = '';
    strip.code = '';
  } catch (err) {
    strip.said = String((err && err.message) || err);
  }
  strip.busy = false;
  await readLic();
}
// THE PLAN STEP: the same panel as the Plan page of the app, here because a plan can be taken, or a code typed, before a team is
// started. It is reached from the strip on the first screen or from a choice the plan does not cover, and it always offers the way
// back. When the plan covers what was being chosen it offers to carry on with that; it never moves on by itself.
function plan({ then = null, next = '', why = '', focus = '' } = {}) {
  if (!runner.live) return intro();
  const top = h('div', { class: 'plan-top' });
  const hold = h('div', { class: 'plan-hold' });
  const leave = (to) => {
    planSaid = '';
    history.replaceState(null, '', location.pathname + location.search);
    (to || intro)();
  };
  const fill = (f) => {
    top.replaceChildren(
      ...(onPaid(lic)
        ? [
            h(
              'p',
              { class: 'plan-done', role: 'status' },
              h('span', { class: 'mark', 'aria-hidden': 'true' }, '✓'),
              h(
                'span',
                { class: 't' },
                h('strong', null, lic.name + ' is on for this machine. '),
                then ? 'Carry on where you were.' : 'Go back and choose how your team thinks.',
              ),
              h(
                'button',
                { class: 'btn primary', type: 'button', id: 'plan-continue', onclick: () => leave(then) },
                then ? next || 'Carry on' : 'Choose how your team thinks',
              ),
            ),
          ]
        : []),
    );
    hold.replaceChildren(
      planPanel({
        lic,
        said: planSaid,
        runner,
        back: location.origin + location.pathname + location.search + '#plan',
        focus: f,
        say: (t) => {
          planSaid = t;
          fill();
        },
        changed: async (t) => {
          planSaid = t;
          await readLic();
          if (hold.isConnected) fill();
        },
      }),
    );
  };
  history.replaceState(null, '', '#plan');
  show(
    'plan',
    h(
      'p',
      { class: 'plan-back' },
      h(
        'button',
        { class: 'btn small', type: 'button', id: 'plan-back', onclick: () => leave() },
        '← Back to Start your team',
      ),
    ),
    h('h1', { id: 'st-title' }, 'Your ', h('em', null, 'plan')),
    h(
      'p',
      { class: 'lede' },
      why
        ? why + ' Take it here, or type a code, then carry on.'
        : 'Free runs your whole team on your own Claude Code. Pro adds local models and the whole Soul. Take it here, or type a code, then go back and choose how your team thinks.',
    ),
    top,
    hold,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => leave() }, '← Back to Start your team'),
    ),
  );
  fill(focus);
  if (!lic)
    readLic().then(() => {
      if (hold.isConnected) fill(focus);
    });
}

// ---------- models already running ----------
// A model server the customer already has up: found on this machine by asking its usual ports, or on another machine by the name they
// give. Another machine is looked for directly and then over SSH, the way an inference box is usually reached. The team uses it as it is.
function existing() {
  const list = h('div', { class: 'servers', 'aria-live': 'polite' });
  const err = h('p', { class: 'note bad', role: 'alert', hidden: '' });
  const input = h('input', {
    type: 'text',
    placeholder: 'Another machine: its address or SSH name, for example halo, me@192.168.50.1 or 192.168.1.20:11434',
    'aria-label': 'Address or SSH name of another machine',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '300',
  });
  const add = h('button', { class: 'btn', type: 'submit' }, 'Look there');
  const use = h('button', { class: 'btn primary', type: 'button', id: 'use-existing' }, 'Use this model');
  use.disabled = true;
  let servers = [];
  let pick = null;
  let looking = true;
  let far = false;
  let alive = true;
  // machines this one already knows, offered as names to press instead of an address to remember
  const hintRow = h('div', { class: 'hints', hidden: '' });
  const merge = (more) => {
    servers = [...more, ...servers.filter((x) => !more.some((y) => y.base === x.base))];
  };
  const paint = () => {
    use.disabled = !pick;
    const rows = servers.map((sv) =>
      h(
        'article',
        { class: 'server' },
        h(
          'header',
          null,
          h('strong', null, sv.name),
          h('span', { class: 'tag ' + (sv.here ? 'ok' : '') }, sv.where),
          h('code', null, sv.host),
        ),
        h(
          'div',
          { class: 'model-chips', role: 'group', 'aria-label': 'Models served at ' + sv.host },
          sv.models.map((m) =>
            h(
              'button',
              {
                class: 'chipbtn',
                type: 'button',
                'aria-pressed': String(!!pick && pick.base === sv.base && pick.model === m),
                onclick: () => {
                  pick = { base: sv.base, model: m, ssh: sv.ssh || null };
                  paint();
                },
              },
              m,
            ),
          ),
        ),
      ),
    );
    const busy =
      looking || far
        ? h(
            'p',
            { class: 'muted looking' },
            h('span', { class: 'spin', 'aria-hidden': 'true' }),
            looking ? 'Looking on this machine…' : 'Looking on the machines you reached over SSH before…',
          )
        : null;
    const none =
      !servers.length && !looking && !far
        ? h(
            'p',
            { class: 'empty' },
            'No model server answered on this machine. If one is running on another machine, name it below. To set one up from nothing, go back and choose a local model.',
          )
        : null;
    list.replaceChildren(...[...rows, busy, none].filter(Boolean));
  };
  const load = async () => {
    looking = true;
    far = true;
    pick = null;
    servers = [];
    paint();
    runner
      .detectFar()
      .then((r) => {
        if (alive) merge((r && r.servers) || []);
      })
      .catch(() => {})
      .finally(() => {
        far = false;
        if (alive) paint();
      }); // SSH takes longer: it arrives when it arrives
    try {
      merge((await runner.detect()).servers || []);
    } catch {
      /* nothing found */
    }
    looking = false;
    paint();
  };
  const form = h(
    'form',
    {
      class: 'add-server',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        err.hidden = true;
        add.disabled = true;
        add.textContent = 'Looking…';
        try {
          const r = await runner.addServer(input.value.trim());
          merge(r.servers || (r.server ? [r.server] : []));
          input.value = '';
          paint();
        } catch (ex) {
          err.replaceChildren(
            ex.message,
            ex.upgrade ? ' ' : '',
            ex.upgrade
              ? h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    onclick: () => {
                      alive = false;
                      plan({
                        then: existing,
                        next: 'Find running models',
                        why: 'Models on your other machines are part of Pro.',
                      });
                    },
                  },
                  'See the plans',
                )
              : '',
          );
          err.hidden = false;
        }
        add.disabled = false;
        add.textContent = 'Look there';
      },
    },
    input,
    add,
  );
  runner
    .hints()
    .then((r) => {
      const hs = (r && r.hints) || [];
      if (!alive || !hs.length) return;
      hintRow.replaceChildren(
        h('span', { class: 'hints-k' }, 'Machines this one already knows'),
        ...hs.map((x) =>
          h(
            'button',
            {
              class: 'chipbtn hint',
              type: 'button',
              title: x.from + (x.label ? ': ' + x.label : ''),
              onclick: () => {
                input.value = x.target;
                form.requestSubmit();
              },
            },
            h('b', null, x.target),
            x.label && x.label !== x.target ? h('span', null, x.label) : null,
            h('small', null, x.from),
          ),
        ),
      );
      hintRow.hidden = false;
    })
    .catch(() => {});
  use.onclick = () => {
    if (!pick) return;
    alive = false;
    begin(
      pick.ssh
        ? { engine: 'existing', ssh: pick.ssh, model: pick.model }
        : { engine: 'existing', base: pick.base, model: pick.model },
    );
  };
  show(
    'model',
    h('h1', { id: 'st-title' }, 'Models already ', h('em', null, 'running')),
    h(
      'p',
      { class: 'lede' },
      'Pick a model that is already being served. Your team uses it as it is: nothing is installed on that server, and it is never stopped.',
    ),
    list,
    form,
    hintRow,
    err,
    h(
      'p',
      { class: 'muted small' },
      "Another machine is looked for two ways. First directly, on the usual model-server ports or the port you give. Then over SSH, with the keys this machine already has and never a password: it is asked which of its own ports serve a model, and a private tunnel is opened to the one you pick. It is remembered and looked for again next time. The names offered above are read from this machine's own records (its SSH config, the private addresses it has connected to before, its Tailscale network); nothing is contacted until you press one. A server that needs a key of its own is not supported yet.",
    ),
    h(
      'div',
      { class: 'row' },
      use,
      h('button', { class: 'btn', type: 'button', onclick: load }, 'Look again'),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            alive = false;
            intro();
          },
        },
        'Back',
      ),
    ),
    h(
      'p',
      { class: 'note' },
      'Then the same checks run as for any model: one timed reply, and a set of small agent jobs, each judged. Our own record says small models are weak when left to work alone, so read the agent check before you rely on it.',
    ),
  );
  load();
}

// ---------- the machine ----------
const CHIP =
  '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(232,185,112,0)"/><stop offset=".5" stop-color="rgba(232,185,112,.55)"/><stop offset="1" stop-color="rgba(232,185,112,0)"/></linearGradient></defs>' +
  [26, 48, 70, 92, 114].map((p) => `<path class="pin" d="M${p} 4v10M${p} 126v10M4 ${p}h10M126 ${p}h10"/>`).join('') +
  '<rect class="body" x="14" y="14" width="112" height="112" rx="16"/>' +
  Array.from(
    { length: 16 },
    (_, i) =>
      `<rect class="cell" style="--i:${i}" x="${30 + (i % 4) * 21}" y="${30 + Math.floor(i / 4) * 21}" width="17" height="17" rx="4"/>`,
  ).join('') +
  '<rect class="beam" x="14" y="8" width="112" height="14"/></svg>';
async function machine() {
  const chip = h('div', { class: 'chip reading' }, html(CHIP));
  const reads = h('dl', { class: 'reads' });
  const title = h('h1', { id: 'st-title' }, 'Reading your ', h('em', null, 'machine'));
  const sub = h('p', { class: 'lede' }, 'Chip, memory, disk and what is already installed. Nothing is changed.');
  show('host', title, sub, h('div', { class: 'scan' }, chip, reads));
  try {
    [host] = await Promise.all([runner.host(), new Promise((r) => setTimeout(r, reduce ? 0 : 1300))]);
  } catch (e) {
    return show(
      'host',
      title,
      h('p', { class: 'note bad' }, 'The machine could not be read: ' + e.message),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: machine }, 'Try again')),
    );
  }
  chip.className = 'chip read';
  title.replaceChildren('Your ', h('em', null, 'machine'));
  const read = (k, v, small) =>
    h('div', null, h('dt', null, k), h('dd', null, v, small ? h('small', null, ' ' + small) : null));
  reads.replaceChildren(
    ...[
      read(
        'Chip',
        host.chip,
        host.perfCores
          ? host.perfCores + ' performance, ' + host.effCores + ' efficiency cores'
          : host.cores + ' cores',
      ),
      read('Memory', count(h('span'), host.memoryGb, { suffix: ' GB' }), host.availableGb + ' GB free right now'),
      read('Free disk', host.diskFreeGb == null ? 'Unknown' : count(h('span'), host.diskFreeGb, { suffix: ' GB' })),
      read('System', host.os, host.engine === 'tensorfold' ? 'Apple silicon' : host.arch),
      host.gpus && host.gpus.length
        ? read('Graphics', host.gpus.map((g) => g.name).join(', '), host.vramGb + ' GB of graphics memory')
        : null,
    ].filter(Boolean),
  );
  const t = host.tools;
  const have = h(
    'div',
    { class: 'have' },
    tag(
      t.engine ? 'ok' : '',
      (host.engineName || ENGINE.name) + (t.engine ? ' ' + t.engine.version : ': not installed'),
    ),
    tag(t.agent ? 'ok' : '', AGENT.name + (t.agent ? ' ' + t.agent.version : ': not installed')),
    tag(t.node ? 'ok' : 'warn', t.node ? 'Node ' + t.node.version : 'No Node ' + AGENT.node.join('.') + '+'),
    host.engine === 'strata' || host.engine === 'llama'
      ? null
      : tag(t.brew ? 'ok' : 'warn', t.brew ? 'Homebrew' : 'No Homebrew'),
    t.clt
      ? tag(
          t.clt.installed ? 'ok' : 'warn',
          'Apple build tools: ' + (!t.clt.installed ? 'not installed' : t.clt.version || 'installed'),
        )
      : null,
    host.engine === 'strata' || host.engine === 'llama'
      ? null
      : tag(t.openssl3 ? 'ok' : '', t.openssl3 ? 'Signature check ready' : 'No OpenSSL 3'),
  );
  stage.append(
    have,
    host.supported
      ? h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', id: 'next', onclick: models }, 'See what it can run'),
          h('button', { class: 'btn', type: 'button', onclick: machine }, 'Measure again'),
        )
      : h('p', { class: 'note bad' }, host.blockers.join(' ')),
  );
}

// ---------- the model ----------
// WAITING, SHOWN: a ring with a comet running round it and a halo breathing behind, beside one line that says what is being read. If
// it goes on, the line says so, and what happens if no answer comes.
const READING =
  '<span class="reading-ring" aria-hidden="true"><i class="halo"></i><svg viewBox="0 0 64 64"><defs><linearGradient id="read-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd682"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs>' +
  '<circle class="track" cx="32" cy="32" r="26"/><circle class="comet" cx="32" cy="32" r="26"/></svg></span>';
function reading(text, slow) {
  const line = h('span', { class: 'reading-line' }, text);
  const el = h('div', { class: 'reading-wait', role: 'status' }, html(READING), line);
  setTimeout(() => {
    if (el.isConnected) line.textContent = slow;
  }, 6000);
  return el;
}
async function models() {
  show(
    'model',
    h('h1', { id: 'st-title' }, 'Choose your ', h('em', null, 'model')),
    reading(
      'Reading model sizes…',
      'Still reading. Hugging Face is slow to answer. If it does not, the sizes shown will be estimates.',
    ),
  );
  let got;
  try {
    got = await runner.models();
  } catch (e) {
    return show(
      'model',
      h('p', { class: 'note bad' }, 'The model list could not be read: ' + e.message),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: models }, 'Try again')),
    );
  }
  // what a model offers is the page's own catalogue; the runner adds what it measured (sizes, fit, speed, the agent check)
  host = got.host;
  fellBack = got.fellBack || null;
  list = got.models
    .filter((m) => got.all || isSimpleNow() || !(MODELS.find((x) => x.id === m.id) || {}).shelved)
    .map((m) => ({
      ...(MODELS.find((x) => x.id === m.id) || {}),
      ...m,
      leftGb: m.leftGb != null ? m.leftGb : Math.round((host.memoryGb - m.needGb) * 10) / 10,
    }));
  picked = (list.find((m) => m.recommended) || list.find((m) => m.fits) || {}).id || null;
  try {
    addons = (await runner.addons()).list || [];
  } catch {
    addons = [];
  } // an older runner has none: the ticks are simply not offered
  wants = helpersWanted(addons);
  try {
    paintModels();
  } catch (e) {
    show(
      'model',
      h('h1', { id: 'st-title' }, 'Choose your ', h('em', null, 'model')),
      h(
        'p',
        { class: 'note bad', id: 'model-broke' },
        'The models were read, but this page could not show them: ' + ((e && e.message) || e),
      ),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: models }, 'Try again')),
    );
  }
}
// A model's avatar is its weights, drawn: one point for every third of a billion parameters, on a slowly turning sphere sized by the
// model. A lit point is a weight at work on the current token. A dense model lights all of them, in waves; a model that runs a few
// billion of its parameters at a time (the A3B, A2B kind) lights only that share, moving. So size shows what it holds, light what it uses.
function avatar(option) {
  const cv = h('canvas', { width: '320', height: '320', 'aria-hidden': 'true' });
  const ctx = cv.getContext('2d');
  const n = Math.max(8, Math.round(option.params * 3));
  const share = (option.active || option.params) / option.params;
  const dense = share >= 1;
  const R = 46 + 78 * Math.min(1.15, Math.sqrt(option.params / 30));
  const pts = Array.from({ length: n }, (_, i) => {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const ang = i * 2.39996;
    return [Math.cos(ang) * r, y, Math.sin(ang) * r];
  });
  const lit = option.fits ? [95, 227, 184] : [255, 93, 87];
  const dim = [190, 205, 228];
  return {
    cv,
    draw(time, on) {
      const rot = time * (on ? 0.55 : 0.22);
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const tilt = 0.42;
      const ct = Math.cos(tilt);
      const st2 = Math.sin(tilt);
      ctx.clearRect(0, 0, 320, 320);
      const g = ctx.createRadialGradient(160, 160, 0, 160, 160, R * 1.15);
      g.addColorStop(0, 'rgba(' + lit + ',' + (on ? 0.26 : 0.12) + ')');
      g.addColorStop(1, 'rgba(' + lit + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 320, 320);
      const out = pts
        .map((p, i) => {
          const x = p[0] * cs + p[2] * sn;
          const z0 = -p[0] * sn + p[2] * cs;
          const y = p[1] * ct - z0 * st2;
          const z = p[1] * st2 + z0 * ct;
          const act = !option.fits
            ? 0.16
            : dense
              ? 0.5 + 0.5 * Math.sin(time * 2.2 + i * 0.37)
              : (i * 0.618034 + time * 0.28) % 1 < share
                ? 1
                : 0.08;
          return { x: 160 + x * R, y: 160 + y * R, z, act };
        })
        .sort((p, q) => p.z - q.z);
      ctx.lineWidth = 1;
      for (const p of out) {
        if (p.act < 0.45) continue;
        ctx.strokeStyle = 'rgba(' + lit + ',' + (0.05 + (0.1 * p.act * (p.z + 1)) / 2).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(160, 160);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      for (const p of out) {
        const depth = (p.z + 1) / 2;
        const r = (1.6 + 2.6 * depth) * (p.act > 0.45 ? 1.25 : 1);
        const col = p.act > 0.45 ? lit : dim;
        const al = (0.18 + 0.82 * p.act) * (0.35 + 0.65 * depth);
        if (p.act > 0.45) {
          ctx.shadowColor = 'rgba(' + lit + ',.9)';
          ctx.shadowBlur = 10 * depth;
        } else ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.2832);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    },
  };
}
// QUANTITIES ARE DRAWN, NOT STATED. A five-step meter for how much (size, speed), a bar for the room it takes, and three dots for what
// to expect of a kind of work. Where something is not known yet the graphic is hollow and the words say so: nothing is filled in on a guess
// without being marked as one.
const meter = (n, guess) =>
  h(
    'span',
    { class: 'meter' + (guess ? ' guess' : ''), role: 'img', 'aria-label': n + ' of 5' + (guess ? ', expected' : '') },
    Array.from({ length: 5 }, (_, i) => h('i', { class: i < n ? 'on' : '' })),
  );
const dots3 = (n) =>
  h(
    'span',
    {
      class: 'dots3' + (n == null ? ' unknown' : ''),
      role: 'img',
      'aria-label': n == null ? 'not tried yet' : n + ' of 3',
    },
    Array.from({ length: 3 }, (_, i) => h('i', { class: n != null && i < n ? 'on' : '' })),
  );
const sizeSteps = (p) => Math.max(1, Math.min(5, Math.round(p / 6)));
const speedSteps = (m) => {
  const s = m.measured && m.measured.tokPerSec;
  if (s) return s >= 100 ? 5 : s >= 60 ? 4 : s >= 30 ? 3 : s >= 15 ? 2 : 1;
  const a = m.active || m.params;
  return a <= 3 ? 4 : a <= 10 ? 3 : 2;
};
const isSimpleNow = () => chosenMode() === 'simple'; // (Developer lists every model the machine's engines can run, and the person chooses)
const CAN = {
  talk: ['Not suited to it', 'Short, simple answers', 'Good', 'Good'],
  find: ['Not suited to it', 'Simple lookups', 'Good', 'Good'],
  code: ['Not for code', 'Small edits only', 'Small steps, each one checked', 'Good'],
};
const ICON = {
  see: '<svg class="eye-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  draw: '<svg class="eye-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19l-4 1Z"/><path d="M14.500 6.500l3 3"/></svg>',
  film: '<svg class="eye-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="M10 9.500v5l4.500-2.500L10 9.500Z"/></svg>',
};
const TEST = {
  see: ['Test that it can see', 'it reads a number off a picture'],
  draw: ['Test that it can draw', 'it draws one small picture'],
  film: ['Test that it can film', 'it makes one short clip'],
};
const WITH = { see: 'eyes', draw: 'a pencil', film: 'a camera' };
// WHICH HELPERS ARE TICKED, kept in this browser. One that was never ticked here starts as the runner has it: ticked when the team uses it now.
const helpersWanted = (list, set) => {
  if (set) {
    try {
      localStorage.setItem('familyoffice.helpers', JSON.stringify(set));
    } catch {
      /* a private window */
    }
    return set;
  }
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('familyoffice.helpers') || '{}') || {};
  } catch {
    saved = {};
  }
  return Object.fromEntries(
    list.map((a) => [a.id, typeof saved[a.id] === 'boolean' ? saved[a.id] : a.state === 'ready']),
  );
};
const HERE = () => (host && host.os && !/^macOS/.test(host.os) ? 'this machine' : 'this Mac'); // a Linux machine is not called a Mac
function paintModels() {
  const room = host.poolGb || host.memoryGb;
  const line = (k, v) => h('span', { class: 'ln' }, h('b', null, k), h('span', null, v));
  const avs = list.map((o) => ({ o, a: avatar(o) }));
  const card = ({ o, a: av }) =>
    h(
      'button',
      {
        class: 'av',
        type: 'button',
        'aria-pressed': String(o.id === picked),
        disabled: !o.fits,
        'data-id': o.id,
        'aria-label': o.name + ', ' + (o.fits ? o.badge : 'too big for ' + HERE()),
        onclick: () => select(o.id),
      },
      av.cv,
      h('h3', null, o.name),
      h(
        'span',
        { class: 'cap' },
        (o.params >= 20 ? 'Large' : 'Small') +
          ', ' +
          (o.pace || ((o.active || o.params) < o.params || o.params < 20 ? 'quick' : 'thorough')),
      ),
      h(
        'span',
        { class: 'tags' },
        o.fits ? (o.recommended ? tag('ok', 'Recommended') : tag('', o.badge)) : tag('bad', 'Too big for ' + HERE()),
        o.running ? tag('ok', 'Running') : null,
      ),
    );
  const detail = h('div', { id: 'detail', class: 'pick-detail' });
  const acts = h('div', { class: 'pick-acts' });
  const row = (k, graphic, text) => h('div', { class: 'cap-row' }, h('b', null, k), graphic, h('span', null, text));
  // THE HELPERS: a tick each on the model, not things of their own. Ticked, a helper is installed if it is not here yet, then started
  // and tested, as the last steps of the same setup. A TICK STAYS A TICK once the helper is downloaded: unticked, the team is set up
  // without it and its files are left where they are; ticked again, it is started and tested again with nothing to download.
  const helperOpts = () =>
    addons.map((addon) => {
      const here = addon.state === 'ready' || addon.state === 'off';
      const wanted = !!wants[addon.id];
      const box = h('input', {
        type: 'checkbox',
        id: 'helper-' + addon.id,
        'data-kind': addon.kind,
        'aria-label': addon.tick,
        checked: wanted,
        onchange: (e) => {
          wants = helpersWanted(addons, { ...wants, [addon.id]: e.target.checked });
          paintDetail();
        },
      });
      return h(
        'div',
        { class: 'eyes-opt' + (wanted ? ' on' : ''), 'data-id': addon.id },
        h(
          'label',
          { for: 'helper-' + addon.id },
          box,
          html(ICON[addon.kind] || ICON.see),
          h(
            'span',
            { class: 't' },
            h('strong', null, addon.tick),
            h(
              'span',
              null,
              addon.hint +
                ' ' +
                (here
                  ? 'Already downloaded on this Mac' +
                    (wanted ? ': setting up starts it and tests it.' : ': untick leaves it out, and its files stay.')
                  : addon.sizeGb + ' GB more to download.'),
            ),
          ),
        ),
        here
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                'data-remove': addon.id,
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await runner.addon(addon.id, 'remove');
                    addons = (await runner.addons()).list || [];
                    wants = helpersWanted(addons, { ...wants, [addon.id]: false });
                  } catch {
                    /* it stays as it was */
                  }
                  paintDetail();
                },
              },
              'Remove',
            )
          : null,
        h(
          'details',
          { class: 'more' },
          h('summary', null, 'About this helper'),
          h(
            'span',
            { class: 'gives' },
            line('What it is', addon.name + ', by ' + addon.maker + '. ' + addon.what),
            (
              addon.notes || [
                ['Checking pages', addon.qa],
                ['Research', addon.research],
              ]
            ).map(([k, v]) => line(k, v)),
            line('Its limits', addon.limits),
            line(
              'What it takes',
              addon.sizeGb + ' GB on disk, and about ' + addon.needGb + ' GB of memory while it works.',
            ),
            line('License', [
              addon.license.name + '. ' + addon.license.says + ' ',
              h('a', { href: addon.license.href, target: '_blank', rel: 'noopener' }, 'Read the license'),
            ]),
            line('Our record', addon.basis),
          ),
        ),
      );
    });
  const paintDetail = () => {
    const model = list.find((x) => x.id === picked);
    const seen = model && model.measured;
    const can = model ? { ...(model.can || {}) } : {};
    const ticked = addons.filter((a) => wants[a.id]);
    const adds = model ? ticked.flatMap((a) => a.plan) : [];
    const plan = model ? [...model.plan, ...adds] : [];
    const blocked = plan.filter((p) => p.blocked);
    if (seen) can.code = seen.passed === seen.of ? Math.max(can.code || 0, 2) : seen.passed ? 1 : 0; // what this Mac's own test showed outranks what we expected
    const expect = (k, label) =>
      row(
        label,
        dots3(can[k]),
        k === 'code' && seen
          ? 'Passed ' + seen.passed + ' of ' + seen.of + ' test jobs on ' + HERE()
          : can[k] == null
            ? 'We have not tried it. The test on ' + HERE().replace('this', 'your') + ' will show'
            : CAN[k][can[k]],
      );
    detail.replaceChildren(
      ...[
        model
          ? h(
              'div',
              { class: 'plan chosen friendly' },
              h('h4', null, model.name),
              h('p', { class: 'plain' }, model.plain),
              h(
                'div',
                { class: 'caps' },
                row(
                  'Size',
                  meter(sizeSteps(model.params)),
                  model.params >= 20 ? 'Large: it knows a lot' : 'Small: it knows a little',
                ),
                row(
                  'Speed',
                  meter(speedSteps(model), !seen),
                  seen
                    ? Math.round(seen.tokPerSec) + ' tokens a second, measured on ' + HERE()
                    : ((
                        model.pace
                          ? model.pace === 'quick'
                          : (model.active || model.params) < model.params || model.params < 20
                      )
                        ? 'Should be quick'
                        : 'Should be unhurried') + '. Not measured here yet',
                ),
                row(
                  'Room',
                  h(
                    'span',
                    {
                      class: 'roombar',
                      role: 'img',
                      'aria-label': model.needGb + ' of ' + room + ' GB',
                      style:
                        '--w:' +
                        Math.min(100, (model.needGb / room) * 100).toFixed(1) +
                        ';--room:' +
                        ((model.roomGb / room) * 100).toFixed(1),
                    },
                    h('i'),
                    h('b'),
                  ),
                  'Takes about ' +
                    model.needGb +
                    ' of your ' +
                    room +
                    ' GB of memory' +
                    (host.vramGb ? ' (RAM and graphics memory together)' : '') +
                    ', leaving ' +
                    model.leftGb +
                    ' GB for everything else',
                ),
              ),
              h('h5', null, 'What to expect'),
              h(
                'div',
                { class: 'caps' },
                expect('talk', 'Talking it through'),
                expect('find', 'Finding things out'),
                expect('code', 'Changing code'),
                model.proofs && model.proofs.runs
                  ? row(
                      'Proving a change',
                      dots3(
                        model.proofs.proven / model.proofs.runs >= 0.9
                          ? 3
                          : model.proofs.proven / model.proofs.runs >= 0.6
                            ? 2
                            : 1,
                      ),
                      model.proofs.proven +
                        ' of ' +
                        model.proofs.runs +
                        (model.proofs.runs === 1 ? ' change' : ' changes') +
                        ' proven on ' +
                        HERE() +
                        ', in ' +
                        Math.round((model.proofs.rounds / model.proofs.runs) * 10) / 10 +
                        (model.proofs.rounds === model.proofs.runs ? ' round each' : ' rounds each'),
                    )
                  : null,
              ),
              helperOpts(),
              h(
                'details',
                { class: 'more' },
                h('summary', null, 'Our record in detail'),
                h(
                  'span',
                  { class: 'gives' },
                  line('Our record', model.basis + '. ' + model.did),
                  line('Working alone', model.agent),
                  line('How to use it', model.use),
                  line('How it runs', model.runs),
                ),
              ),
            )
          : null,
        model
          ? h(
              'div',
              { class: 'plan' },
              h('h4', null, plan.length ? 'What the button does' : 'Nothing to download'),
              h('ol', { class: 'steps-plain' }, [
                ...plan.map((p) =>
                  h(
                    'li',
                    null,
                    h('strong', null, p.what),
                    p.size ? h('span', { class: 'sz' }, p.size) : null,
                    p.blocked
                      ? h('span', { class: 'blocked' }, 'Blocked: ' + p.blocked + (p.fix ? '. ' + p.fix.steps[0] : ''))
                      : null,
                  ),
                ),
                h(
                  'li',
                  null,
                  h('strong', null, 'Start it and test it'),
                  h('span', { class: 'sz' }, 'one timed answer, a set of small jobs'),
                ),
                ...ticked.map((a) =>
                  h(
                    'li',
                    null,
                    h(
                      'strong',
                      null,
                      TEST[a.kind][0] + (ticked.filter((x) => x.kind === a.kind).length > 1 ? ' with ' + a.name : ''),
                    ),
                    h('span', { class: 'sz' }, TEST[a.kind][1]),
                  ),
                ),
              ]),
              h(
                'details',
                { class: 'more' },
                h('summary', null, 'The exact commands'),
                plan.length
                  ? h(
                      'ol',
                      null,
                      plan.map((p) =>
                        h(
                          'li',
                          null,
                          h(
                            'span',
                            { class: 'what' },
                            h('strong', null, p.what),
                            h('span', { class: 'sub muted' }, 'from ' + p.from),
                          ),
                          h('code', null, p.command),
                          p.note ? h('span', { class: 'sub muted' }, p.note) : null,
                        ),
                      ),
                    )
                  : null,
                h(
                  'p',
                  { class: 'muted' },
                  'Then the model is started on 127.0.0.1, where only this machine can reach it, one answer is timed, and a set of small jobs is run in a scratch folder. The agent can read, write, edit and list files there, and has no shell.',
                ),
              ),
            )
          : null,
      ].filter(Boolean),
    );
    // the way on is its own strip: under the models on a wide screen, and held at the foot of the window on a narrow one, so it is in
    // reach wherever the page has been scrolled to. It names the model it will set up.
    acts.replaceChildren(
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          id: 'setup',
          disabled: !model || blocked.length > 0,
          onclick: () => begin({ model: model.id, addons: ticked.map((a) => a.id) }),
        },
        model && plan.length ? 'Download and set up' : 'Set up',
      ), // the helpers that are ticked go with it: those are the ones this team will use
      h('button', { class: 'btn', type: 'button', onclick: machine }, 'Back'),
      model
        ? h(
            'span',
            { class: 'pick-name' },
            blocked.length
              ? model.name + ' cannot be set up yet: see what is blocked.'
              : model.name +
                  (ticked.length ? ', with ' + [...new Set(ticked.map((a) => WITH[a.kind]))].join(' and ') : ''),
          )
        : null,
    );
  };
  // choosing a model changes two things only: which avatar is lit, and the panel beside them. Nothing else is redrawn.
  const select = (id) => {
    if (id === picked) return;
    picked = id;
    $$('.av', stage).forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.id === picked)));
    paintDetail();
  };
  const rowEl = h('div', { class: 'avs' }, avs.map(card));
  // where this machine stands on the engine waterfall, said only when it is not on the first rung
  const small = list.length > 0 && list.every((m) => m.engine === 'llama');
  const waterNote = () =>
    fellBack
      ? h(
          'p',
          { class: 'note', id: 'fell-back' },
          fellBack.from +
            ' could not be used on ' +
            HERE() +
            ', so the smaller models at the end are run by ' +
            fellBack.to +
            ' instead.',
        )
      : small
        ? h(
            'p',
            { class: 'note', id: 'small-engine' },
            HERE().replace(/^t/, 'T') +
              ' runs these on its processor with ' +
              (host.engineName || 'llama.cpp') +
              ', so each answer takes a while. An Apple silicon Mac, or a Linux machine with a graphics card, runs larger ones faster.',
          )
        : null;
  // A MACHINE A MODEL WOULD STRAIN (js/catalog.js localStrain): said before anything is fetched, with the way over to Claude Code.
  // The models stay below it: this discourages, it does not forbid.
  const strainNote = () => {
    const st = localStrain(host, list.find((m) => m.recommended) || null);
    if (!st) return null;
    return h(
      'div',
      { class: 'note', id: 'local-strain' },
      h(
        'p',
        null,
        'A model on ' +
          HERE() +
          ' would be slow, and the machine would be busy while it writes: ' +
          st.why.join(', ') +
          '. Claude Code is the better mind for this machine: nothing to download, and it answers at once.',
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn primary', type: 'button', id: 'strain-claude', onclick: () => begin('claude') },
          'Start with Claude instead',
        ),
      ),
    );
  };
  // A WINDOWS PC WITH AN NVIDIA CARD: the engine that uses the card runs under Windows' Linux layer (WSL). It is offered, never done
  // unasked, because Windows asks for administrator approval and, the first time, a restart.
  const gpuCard = (host.gpus || [])[0];
  const wslOffer = () => {
    if (!/^Windows/.test(host.os || '') || !gpuCard) return null;
    const ready = !!(host.tools && host.tools.wsl && host.tools.wsl.ready);
    const said = h('span', { class: 'muted small', role: 'status' });
    const go = h(
      'button',
      { class: 'btn', type: 'button', id: 'wsl-go' },
      ready ? 'Move my team to WSL' : 'Set up WSL',
    );
    go.onclick = async () => {
      go.disabled = true;
      try {
        const r = await runner.fix('wsl-setup');
        said.textContent = r.ok
          ? 'A PowerShell window has opened. Follow it there' +
            (ready ? '.' : ': approve when Windows asks, and restart if it says to.')
          : 'That could not be started' + (r.said ? ': ' + r.said : '.');
      } catch (e) {
        said.textContent = 'That could not be started: ' + e.message;
      }
      go.disabled = false;
    };
    return h(
      'div',
      { class: 'note', id: 'wsl-offer' },
      h(
        'p',
        null,
        'This PC has a graphics card (' +
          gpuCard.name +
          (gpuCard.vramGb ? ', ' + gpuCard.vramGb + ' GB' : '') +
          "), and these models run on it here. A second engine, with larger models, runs only under Windows' Linux layer (WSL)" +
          (ready
            ? ', which this PC already has. Moving your team there sets its model up again.'
            : '. Setting WSL up asks for administrator approval and, the first time, a restart; your team then starts there by itself, and its model is set up again.'),
      ),
      h('div', { class: 'row' }, go, said),
    );
  };
  // THE WIDTH OF THE SCREEN IS USED: the models on the left, the chosen one and what setting it up does on the right, so choosing and
  // starting are both in view without scrolling. On a narrow screen the two stack, models first. (The card widens for this step.)
  show(
    'model',
    h(
      'div',
      { class: 'pick-head' },
      h('h1', { id: 'st-title' }, 'Choose your ', h('em', null, 'model')),
      h(
        'p',
        { class: 'lede' },
        'Pick the mind your team thinks with. A bigger one thinks harder and answers slower. The lit points are the part of it at work on each word.',
      ),
      waterNote(),
      strainNote(),
      wslOffer(),
    ),
    h('div', { class: 'pick' }, rowEl, detail, acts),
    h(
      'div',
      { class: 'plan record' },
      h('h4', null, 'What we have seen ourselves · ' + RECORD.when),
      h('p', null, RECORD.summary),
      h('p', { class: 'muted small' }, RECORD.caution),
    ),
  );
  paintDetail();
  // one clock for all four; it stops by itself when this stage is replaced
  const t0 = performance.now();
  const frame = (now) => {
    if (!rowEl.isConnected) return;
    const time = (now - t0) / 1000;
    for (const { o, a: av } of avs) av.draw(time, o.id === picked);
    if (!reduce) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- set up ----------
const C = 2 * Math.PI * 100;
// how a job of the agent check passed, and what it is doing while it corrects itself (runner/agent.mjs: the ways a job is given)
const HOW = {
  alone: 'on its own',
  corrected: 'after correcting itself',
  guided: 'with the way of working spelled out',
  steps: 'one checked step at a time',
};
const NOW = {
  corrected: 'correcting itself',
  guided: 'again, with the way of working spelled out',
  steps: 'one checked step at a time',
  learning: 'again from the start, with what its misses taught it',
};
async function begin(id) {
  if (runner.state().busy) return working(); // one is already under way: watch it
  try {
    await runner.setup(id === 'claude' ? { engine: 'claude' } : id, chosenMode() === 'simple' ? 'simple' : 'developer');
  } catch (e) {
    // a model id, 'claude', or { engine: 'existing', base, model }
    if (/already running/.test(e.message)) return working();
    const old = $('#start-err');
    if (old) old.remove();
    stage.append(
      h(
        'p',
        { class: 'note bad', id: 'start-err', role: 'alert' },
        e.message,
        e.upgrade
          ? [' ', h('button', { class: 'btn small', type: 'button', onclick: () => plan() }, 'See the plans')]
          : null,
      ),
    );
    return;
  }
  working();
}
// WHAT IS HAPPENING, IN PLAIN WORDS (Simple). One line for the step that is under way, with how far a download has got.
const PLAIN = {
  tools: 'Checking this computer',
  engine: 'Installing what it runs on',
  plan: 'Working out what it needs',
  model: 'Downloading its mind',
  server: 'Waking it up',
  speed: 'Asking it a first question',
  agent: 'Giving it hands to work with',
  check: 'Trying it out',
  signin: 'Checking that you are signed in to Claude',
};
const SHORT = {
  tools: 'Checking',
  engine: 'Installing',
  plan: 'Planning',
  model: 'Downloading',
  server: 'Waking up',
  speed: 'First question',
  agent: 'Installing',
  check: 'Trying it out',
  signin: 'Signing in',
};
function plainStep(x, s) {
  if (!x) return 'Starting…';
  const tail = x.id.includes('-') ? x.id.split('-').pop() : '';
  const size = (/([\d.]+ of [\d.]+ GB)/.exec(x.detail || '') || [])[1];
  if (tail)
    return (
      ({
        engine: 'Adding an extra',
        model: 'Downloading an extra',
        server: 'Starting the extra',
        check: 'Trying the extra out',
      }[tail] || 'Adding an extra') + (size ? ': ' + size : '')
    ); // a helper's step
  if (x.id === 'signin' && x.waiting) return 'Waiting for you to sign in to Claude';
  if (x.id === 'check' && s.jobs.length)
    return (
      'Trying it out: ' +
      s.jobs.filter((j) => j.state === 'done').length +
      ' of ' +
      Math.max(3, s.jobs.length) +
      ' done'
    );
  return (PLAIN[x.id] || x.title) + (x.id === 'model' && size ? ': ' + size : '');
}
function working() {
  here('setup');
  const simple = chosenMode() === 'simple';
  const ring = h(
    'div',
    { class: 'ring' },
    html(
      '<svg viewBox="0 0 220 220" aria-hidden="true"><defs><linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#f7a94b"/><stop offset="1" stop-color="#ff7a59"/></linearGradient></defs>' +
        '<circle class="track" cx="110" cy="110" r="100"/><circle class="sweep" cx="110" cy="110" r="100"/><circle class="arc" cx="110" cy="110" r="100" stroke-dasharray="' +
        C.toFixed(1) +
        '" stroke-dashoffset="' +
        C.toFixed(1) +
        '"/><g class="tip-turn"><circle class="tip" cx="210" cy="110" r="5.5"/></g></svg>',
    ),
    h('div', { class: 'ripple' }),
    h('div', { class: 'ripple two' }),
    h('div', { class: 'halo' }),
    h('div', { class: 'mid' }, h('b', { id: 'pct' }, '0'), h('span', { id: 'what' }, 'Starting')),
  );
  const todo = h('ul', { class: 'todo' });
  const title = h(
    'h1',
    { id: 'st-title' },
    simple ? 'Getting it ' : 'Setting ',
    h('em', null, simple ? 'ready' : 'up'),
  );
  const foot = h('div', { class: 'row' });
  // SIMPLE: the ring, and beside it ONE line that says what is happening now. Every step is still there, folded away for whoever
  // wants to see it; nothing is hidden, it is just not the first thing read.
  const now = h('p', { class: 'plain-now', id: 'plain-now', role: 'status' }, 'Starting…');
  show(
    'setup',
    title,
    simple
      ? h(
          'div',
          { class: 'work plain' },
          ring,
          h(
            'div',
            { class: 'plain-side' },
            now,
            h(
              'p',
              { class: 'muted plain-sub' },
              'This is done once. Leave this page open: you can do something else while it works.',
            ),
            h('details', { class: 'more', id: 'plain-more' }, h('summary', null, 'Show each step'), todo),
          ),
        )
      : h('div', { class: 'work' }, ring, todo),
    foot,
  );
  const arc = $('.arc', ring);
  const tip = $('.tip-turn', ring);
  const paint = (status) => {
    const setup = status.setup;
    if (!setup) return;
    // SIGN IN TO CLAUDE, as a step. Claude Code was signed out, so its sign-in was started and Claude's page is open in the browser. This
    // panel is the step: the page's address to open again, a box for a code if the page gives one, and nothing to press when it is done.
    // It is drawn once, so what is typed in the box is not lost to a repaint, and it goes by itself when the sign-in has finished.
    const signStep = setup.steps.find((x) => x.state === 'run' && x.id === 'signin' && x.waiting === 'signin');
    const waitSign = !!signStep && status.busy && !setup.error;
    const si0 = status.signin || {};
    if (waitSign && foot.dataset.sign !== String(setup.startedAt)) {
      foot.dataset.sign = String(setup.startedAt);
      foot.dataset.cancel = '';
      const said = h('span', { class: 'muted small', role: 'status' });
      foot.replaceChildren(
        h(
          'div',
          { class: 'plan signin-step', id: 'signin-step' },
          h('h4', null, 'Sign in to Claude'),
          h(
            'p',
            null,
            "Claude's sign-in page has opened in your browser. Sign in there with your own Claude account, and this carries on by itself. We never see what you type.",
          ),
          h(
            'div',
            { class: 'row' },
            h(
              'a',
              { class: 'btn primary', id: 'signin-open', target: '_blank', rel: 'noopener noreferrer', hidden: '' },
              "Open Claude's sign-in page",
            ),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                id: 'cancel',
                onclick: async (e) => {
                  e.target.disabled = true;
                  e.target.textContent = 'Stopping…';
                  await runner.cancel().catch(() => {});
                  for (let i = 0; i < 40 && runner.state().busy; i++) await new Promise((r) => setTimeout(r, 150));
                  intro();
                },
              },
              'Cancel setup',
            ),
          ),
          h(
            'form',
            {
              class: 'send',
              id: 'codeform',
              onsubmit: async (e) => {
                e.preventDefault();
                const i = e.target.elements.code;
                const v = i.value.trim();
                if (!v) return;
                i.value = '';
                const ok = await runner.code(v).catch(() => false);
                said.textContent = ok ? 'Code passed on. Carrying on…' : 'No code is being waited for right now.';
              },
            },
            h('input', {
              type: 'text',
              name: 'code',
              autocomplete: 'off',
              placeholder: 'A code from the sign-in page, if it shows one',
              'aria-label': 'Code from the sign-in page',
            }),
            h('button', { class: 'btn', type: 'submit' }, 'Send code'),
          ),
          h('span', { id: 'signin-wait', class: 'muted small', role: 'status' }),
          said,
        ),
      );
    }
    if (waitSign) {
      const a = $('#signin-open');
      const line = $('#signin-wait');
      if (a && si0.url) {
        a.href = si0.url;
        a.hidden = false;
      }
      if (line)
        line.textContent =
          si0.state === 'starting' ? "Starting Claude's sign-in…" : 'Waiting for you to finish signing in…';
    }
    if (!waitSign && foot.dataset.sign) {
      foot.dataset.sign = '';
      foot.dataset.cancel = '';
      foot.replaceChildren();
    }
    if (status.busy && !setup.error && !waitSign && foot.dataset.cancel !== '1') {
      foot.dataset.cancel = '1';
      foot.replaceChildren(
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            id: 'cancel',
            onclick: async (e) => {
              e.target.disabled = true;
              e.target.textContent = 'Stopping…';
              await runner.cancel().catch(() => {});
              for (let i = 0; i < 40 && runner.state().busy; i++) await new Promise((r) => setTimeout(r, 150));
              intro();
            },
          },
          'Cancel setup',
        ),
      );
    }
    if (!status.busy && foot.dataset.cancel === '1') {
      foot.dataset.cancel = '';
      foot.replaceChildren();
    }
    const done = setup.steps.filter((x) => x.state === 'done').length;
    const cur = setup.steps.find((x) => x.state === 'run');
    const all = (done + (cur ? cur.pct : 0)) / setup.steps.length;
    arc.setAttribute('stroke-dashoffset', (C * (1 - all)).toFixed(1));
    tip.style.transform = 'rotate(' + (all * 360).toFixed(1) + 'deg)';
    ring.classList.toggle('going', status.busy && !setup.error && !setup.done && all > 0); // the tip rides the leading edge of the arc
    $('#pct').textContent = Math.round(all * 100) + '%';
    $('#what').textContent = setup.error
      ? 'Stopped'
      : simple
        ? setup.done
          ? 'Ready'
          : cur
            ? SHORT[cur.id] || (cur.id.includes('-') ? 'An extra' : 'Working')
            : 'Starting'
        : setup.done
          ? setup.model.name
          : cur
            ? cur.title
            : 'Starting';
    if (simple)
      now.textContent = setup.error ? 'It stopped before it was ready.' : setup.done ? 'Ready.' : plainStep(cur, setup);
    ring.classList.toggle('done', !!setup.done);
    ring.classList.toggle('fail', !!setup.error);
    const fresh = setup.steps.map((x) =>
      h(
        'li',
        { class: x.state },
        h('span', { class: 'mark' }),
        h('strong', null, x.title),
        h('span', { class: 'd' }, x.detail),
        x.state === 'run' && x.line ? h('span', { class: 'term' }, x.line) : null,
        x.id === 'check' && setup.jobs.length
          ? h(
              'ul',
              { class: 'jobs' },
              setup.jobs.map((j) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'dot ' + (j.state === 'run' ? 'is-run' : j.pass ? 'is-green' : 'is-red') }),
                  j.title +
                    (j.state === 'done'
                      ? (j.pass
                          ? ': passed' +
                            (HOW[j.how] ? ' ' + HOW[j.how] : '') +
                            (j.learned ? ', once it had been taught from its own misses' : '')
                          : ': failed, ' + j.why) +
                        ' (' +
                        j.seconds +
                        ' s, ' +
                        j.tools +
                        ' tool calls' +
                        (j.tries > 1 ? ', ' + j.tries + ' tries' : '') +
                        (j.again ? ', ' + j.again + ' more while learning' : '') +
                        ')'
                      : j.how === 'learning'
                        ? ': ' + NOW.learning + (j.tries > 1 ? ', try ' + j.tries : '')
                        : j.tries > 1
                          ? ': ' +
                            (NOW[j.how] || 'trying again') +
                            ', try ' +
                            j.tries +
                            (j.last ? ' (' + j.last + ')' : '')
                          : ': running'),
                ),
              ),
            )
          : null,
      ),
    );
    // THE LIST IS CHANGED IN PLACE, never drawn again. A download reports its progress many times a second, and drawing every line
    // anew each time started the turning mark of the step under way from the beginning each time: it stuttered. A line that has
    // not changed is left alone; one whose words changed keeps its mark and takes the new words; only a line whose state changed
    // (waiting, under way, done, failed) is replaced.
    fresh.forEach((li, i) => {
      const old = todo.children[i];
      if (!old) return void todo.append(li);
      if (old.className !== li.className) return void old.replaceWith(li);
      if (old.innerHTML === li.innerHTML) return;
      const mark = old.querySelector(':scope > .mark');
      old.replaceChildren(mark, ...[...li.childNodes].filter((n) => !(n.classList && n.classList.contains('mark'))));
    });
    while (todo.children.length > fresh.length) todo.lastElementChild.remove();
    if (setup.error) {
      title.replaceChildren(simple ? 'It ' : 'Set up ', h('em', null, 'stopped'));
      // RECOVERY FROM THE SCREEN. Continue runs the same setup again and keeps what is already done; a fix is a button, not a command to
      // type; and choosing something else lets go of what was being kept (a model server, a tunnel).
      const kind = setup.model.id;
      const keeps = !!setup.error.resumable;
      const fix = setup.error.fix;
      const again = h(
        'button',
        { class: 'btn primary', type: 'button', id: 'continue', onclick: () => begin({ resume: true }) },
        keeps ? 'Continue from here' : 'Try again',
      );
      const other = h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            await runner.stop().catch(() => {});
            (kind === 'claude' || simple ? intro : kind === 'existing' ? existing : models)();
          },
        },
        kind === 'claude' || simple ? 'Back' : 'Choose another model',
      );
      const keptLine = keeps
        ? h(
            'p',
            { class: 'muted small kept' },
            'Already done, and kept: ' +
              setup.steps
                .filter((x) => x.state === 'done')
                .map((x) => x.title.toLowerCase())
                .join('; ') +
              '. Carrying on picks up at "' +
              ((setup.steps.find((x) => x.id === setup.error.step) || {}).title || 'the step that stopped') +
              '".',
          )
        : null;
      if (!fix)
        foot.replaceChildren(
          ...[h('p', { class: 'note bad' }, setup.error.why), keptLine, again, other].filter(Boolean),
        );
      else if (foot.dataset.shown !== fix.kind + setup.startedAt) {
        // drawn once per failure, so a button press is not lost to a repaint
        foot.dataset.shown = fix.kind + setup.startedAt;
        const said = h('span', { class: 'muted small', role: 'status' });
        foot.replaceChildren(
          h(
            'div',
            { class: 'plan fix' },
            h('h4', null, 'One thing to do, then setup carries on'),
            h('p', null, h('strong', null, fix.title + '. '), fix.text),
            h(
              'ol',
              null,
              fix.steps.map((x) => h('li', null, x)),
            ),
            h(
              'div',
              { class: 'row' },
              fix.actions.map((a) =>
                h(
                  'button',
                  {
                    class: a.id === 'node-fetch' ? 'btn primary' : 'btn',
                    type: 'button',
                    'data-fix': a.id,
                    onclick: async () => {
                      if (a.id === 'node-fetch') return begin({ resume: true, fetchNode: true }); // the fix IS the next step: do it and carry on
                      if (a.id === 'claude-other') {
                        // signed out with Claude Code's own command; the setup then starts at its sign-in step
                        said.textContent = 'Signing Claude Code out…';
                        const out = await runner.fix('claude-logout').catch((x) => ({ ok: false, said: x.message }));
                        if (!out.ok)
                          return void (said.textContent =
                            'That could not be done' + (out.said ? ': ' + out.said : '.'));
                        return begin('claude');
                      }
                      said.textContent = 'Opening…';
                      try {
                        const r = await runner.fix(a.id);
                        said.textContent = r.ok
                          ? 'Opened. Finish it there, then press ' + (keeps ? 'Continue from here' : 'Try again') + '.'
                          : 'macOS said: ' + (r.said || 'it could not open');
                      } catch (err) {
                        said.textContent = err.message;
                      }
                    },
                  },
                  a.label,
                ),
              ),
              fix.link
                ? h(
                    'a',
                    { class: 'btn', href: fix.link.href, target: '_blank', rel: 'noopener noreferrer' },
                    fix.link.label,
                  )
                : null,
              fix.actions.some((a) => a.id === 'node-fetch') ? null : again,
              other,
            ),
            keptLine,
            fix.code
              ? h(
                  'form',
                  {
                    class: 'send',
                    id: 'codeform',
                    onsubmit: async (e) => {
                      e.preventDefault();
                      const i = e.target.elements.code;
                      const v = i.value.trim();
                      if (!v) return;
                      i.value = '';
                      const ok = await runner.code(v).catch(() => false);
                      said.textContent = ok
                        ? 'Code passed to Claude Code.'
                        : 'Claude Code is not waiting for a code right now.';
                    },
                  },
                  h('input', {
                    type: 'text',
                    name: 'code',
                    autocomplete: 'off',
                    placeholder: 'A code from the sign-in page, if it shows one',
                    'aria-label': 'Code from the sign-in page',
                  }),
                  h('button', { class: 'btn', type: 'submit' }, 'Send code'),
                )
              : null,
            h('span', { id: 'signin-line', class: 'muted small' }),
            said,
          ),
        );
      }
      const si = status.signin;
      const line = $('#signin-line');
      if (line && si && fix && fix.code) {
        line.replaceChildren(
          ...(si.state === 'awaiting'
            ? [
                'Waiting for you to finish in the browser. ',
                si.url
                  ? h(
                      'a',
                      { href: si.url, target: '_blank', rel: 'noopener noreferrer' },
                      'Open the sign-in page again',
                    )
                  : '',
              ]
            : si.state === 'starting'
              ? ["Starting Claude Code's sign-in…"]
              : si.state === 'failed'
                ? ['The sign-in did not finish: ' + si.why]
                : si.state === 'done'
                  ? ['Signed in. Carrying on…']
                  : []),
        );
        if (si.state === 'done' && foot.dataset.resumed !== String(setup.startedAt)) {
          foot.dataset.resumed = String(setup.startedAt);
          begin({ resume: true });
        }
      }
    } else if (setup.done && status.session) {
      if (off) off();
      off = null;
      setTimeout(() => ready(status), reduce ? 0 : 900);
    }
  };
  if (off) off();
  off = runner.on(paint);
  paint(runner.state());
}

// ---------- ready ----------
// SIMPLE: what it is, what it can do, and one way on. How its try-out went is kept, folded away.
function readySimple(st, ses, measured) {
  const adds = (st.setup && st.setup.addons) || [];
  const CAN = { see: 'look at pictures', draw: 'make pictures', film: 'make short videos' };
  const NOT = { see: 'Looking at pictures', draw: 'Making pictures', film: 'Making videos' };
  const can = adds
    .filter((x) => x.ok)
    .map((x) => CAN[x.kind])
    .filter(Boolean);
  const said = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' : '') + xs[xs.length - 1];
  show(
    'ready',
    h('h1', { id: 'st-title' }, 'Your team is ', h('em', null, 'ready')),
    h(
      'p',
      { class: 'lede', id: 'ready-lede' },
      (ses.kind === 'claude' ? 'It thinks with Claude.' : 'It thinks on ' + HERE() + ', and what you say stays here.') +
        ' Ask it anything, have it look something up, or show it a page.' +
        (can.length ? ' It can also ' + said(can) + '.' : ''),
    ),
    adds
      .filter((x) => !x.ok)
      .map((x) =>
        h(
          'p',
          { class: 'note', 'data-helper-said': x.id },
          h('strong', null, (NOT[x.kind] || 'An extra') + ' could not be set up. '),
          x.why + ' Your team is ready without it.',
        ),
      ),
    h(
      'div',
      { class: 'big-acts' },
      h(
        'a',
        { class: 'big go', href: 'app.html', id: 'meet' },
        h('b', null, 'Start talking'),
        h('span', null, 'Your team is waiting'),
      ),
      h(
        'button',
        { class: 'big back', type: 'button', id: 'again', onclick: intro },
        h('b', null, 'Choose again'),
        h('span', null, 'Change where it thinks'),
      ),
    ),
    h(
      'details',
      { class: 'more', id: 'tryout' },
      h('summary', null, 'How its try-out went'),
      h(
        'p',
        { class: 'muted' },
        String(ses.model)
          .split('/')
          .pop()
          .replace(/\.(gguf|safetensors|bin)$/i, '') +
          ' on ' +
          ses.engine +
          ', on ' +
          ses.host +
          '. ' +
          (measured.tokPerSec != null
            ? Math.round(measured.tokPerSec) + ' tokens a second. '
            : measured.replySeconds != null
              ? 'One reply in ' + measured.replySeconds + ' s. '
              : '') +
          (measured.of ? measured.passed + ' of ' + measured.of + ' try-out jobs passed.' : ''),
      ),
      measured.fit && measured.fit.says ? h('p', { class: 'muted' }, measured.fit.says) : null,
    ),
  );
}
function ready(status) {
  here('ready');
  const ses = status.session;
  const measured = ses.measured || {};
  const jobs = (status.setup && status.setup.jobs) || measured.jobs || [];
  // the helpers this team uses run beside its model: when there are any, it is models that are running, and they are named
  const also = ses.kind === 'claude' ? [] : [...new Set(Object.values(status.helpers || {}).filter(Boolean))];
  core.adopt({
    model: ses.model,
    engine: ses.engine,
    agent: ses.agent,
    host: ses.host,
    kind: ses.kind || 'local',
    live: runner.live,
    tokPerSec: measured.tokPerSec,
    passed: measured.passed,
    of: measured.of,
  });
  if (chosenMode() === 'simple') return readySimple(status, ses, measured);
  show(
    'ready',
    h(
      'h1',
      { id: 'st-title' },
      ses.kind === 'claude' ? 'Claude is ' : also.length ? 'Your models are ' : 'Your model is ',
      h('em', null, ses.kind === 'claude' ? 'ready' : 'running'),
    ),
    h(
      'p',
      { class: 'lede', id: 'ready-lede' },
      String(ses.model)
        .split('/')
        .pop()
        .replace(/\.(gguf|safetensors|bin)$/i, '') +
        ' on ' +
        ses.engine +
        (also.length
          ? ', with ' +
            (also.length > 1 ? also.slice(0, -1).join(', ') + ' and ' : '') +
            also[also.length - 1] +
            ' beside it'
          : '') +
        ', on ' +
        ses.host +
        '.',
    ),
    h(
      'div',
      { class: 'tiles' },
      measured.tokPerSec != null
        ? h(
            'div',
            { class: 'tile' },
            count(h('b'), measured.tokPerSec, { fixed: 1 }),
            h('span', null, 'Tokens a second'),
            h('small', null, 'One timed reply'),
          )
        : h(
            'div',
            { class: 'tile' },
            count(h('b'), measured.replySeconds, { fixed: 1, suffix: ' s' }),
            h('span', null, 'One reply'),
            h('small', null, 'From question to finished answer'),
          ),
      h(
        'div',
        { class: 'tile' },
        count(h('b'), measured.firstTokenMs, { suffix: ' ms' }),
        h('span', null, 'First token'),
        h('small', null, 'From request to first word'),
      ),
      h(
        'div',
        { class: 'tile' },
        h('b', null, measured.passed + ' of ' + measured.of),
        h('span', null, 'Agent check'),
        h(
          'small',
          null,
          jobs
            .filter((j) => j.pass === false)
            .map((j) => j.title)
            .join(', ') ||
            (jobs.some((j) => j.how && j.how !== 'alone')
              ? 'Every job passed, ' +
                jobs.filter((j) => j.how && j.how !== 'alone').length +
                ' after it corrected itself'
              : 'Every job judged and passed'),
        ),
      ),
    ),
    measured.fit && measured.fit.says
      ? h(
          'p',
          { class: 'fit', id: 'fit' },
          h('strong', null, 'How your team works with this model. '),
          measured.fit.says,
        )
      : null,
    ((status.setup && status.setup.addons) || []).map((x) => {
      const can = {
        see: ['It can see pictures. ', 'read its test picture', 'Seeing pictures is not on. '],
        draw: ['It can make pictures. ', 'drew its test picture', 'Making pictures is not on. '],
        film: ['It can make short videos. ', 'made its test clip', 'Making videos is not on. '],
      }[x.kind] || ['', 'passed its check', 'A helper is not on. '];
      return h(
        'p',
        { class: x.ok ? 'fit' : 'note', 'data-helper-said': x.id },
        x.ok
          ? [h('strong', null, can[0]), x.name + ' is set up and ' + can[1] + '.']
          : [
              h('strong', null, can[2]),
              x.name +
                ': ' +
                x.why +
                ' Your team is ready without it. Tick it again on Choose your model to try once more.',
            ],
      );
    }),
    // two ways on, and nothing else to read: into the team, or back to choose again
    h(
      'div',
      { class: 'big-acts' },
      h(
        'a',
        { class: 'big go', href: 'app.html', id: 'meet' },
        h('b', null, 'Meet your team'),
        h('span', null, 'Five seats, ready to work' + (ses.kind === 'claude' ? ' on Claude Code' : ' on this model')),
      ),
      h(
        'button',
        { class: 'big back', type: 'button', id: 'again', onclick: intro },
        h('b', null, 'Choose again'),
        h('span', null, 'Pick a different way for your team to think'),
      ),
    ),
    h('p', { class: 'muted small' }, 'Your team is not connected to a repo yet: that is the first thing inside.'),
  );
}

header();
// pick up where the runner is: a setup under way, a model already running, or the beginning
resume();
readLic();
