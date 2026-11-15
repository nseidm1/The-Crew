// views.js - the two views the playground and the admin share: the group chat, and the life of one proof.
import { h, clock, seatMark, buddy, cardIcon, glyph, setMood, flashMood, lookAt } from './ui.js';
import { moodOf, strengthOf } from './team/mood.js';
import { icsOf, mapUrl } from './team/extras.js';
import { SEATS, seatAs } from './team-core.js';
import { follow } from './glide.js';

const SEAT = Object.fromEntries(SEATS.map((s) => [s.id, s]));

// Something the team proposes and the customer answers: a landing to approve, or a change to how the team works.
export function paintOffer(el, p, core) {
  const open = p.state === 'open';
  el.className = 'offer' + (open ? '' : ' done');
  el.replaceChildren(
    h('strong', null, p.title),
    h('span', { class: 'muted' }, p.why),
    h('span', { class: 'mono dim' }, p.evidence),
    open
      ? h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn small primary', type: 'button', onclick: () => core.answerProposal(p.id, true) },
            p.kind === 'landing' ? 'Land it' : 'Approve',
          ),
          h(
            'button',
            { class: 'btn small', type: 'button', onclick: () => core.answerProposal(p.id, false) },
            'Not now',
          ),
        )
      : h(
          'span',
          { class: 'tag ' + (p.state === 'approved' ? 'ok' : '') },
          p.state === 'approved' ? (p.kind === 'landing' ? 'You landed it' : 'Approved') : 'Declined',
        ),
  );
  return el;
}

// The chat only ever appends, so typing in the composer and the scroll position survive every update.
export function chatView(log, core, opts = {}) {
  // opts.onReply(message): draws a Reply button on every seat's message
  let shown = 0;
  const offers = new Map();
  const live = new Map();
  const tools = new Map();
  const cards = new Map();
  const setups = new Map();
  const plans = new Map(); // cards: the latest replies, each with what is under it, for a card that comes after the reply is whole
  // the steps of a seat's tool work: what it did, and what it found or why it failed; then the picture, which opens full size
  const paintTools = (box, msg) => {
    const src = msg.shot && core.shotUrl ? core.shotUrl(msg.shot) : '';
    const clip = msg.clip && core.clipUrl ? core.clipUrl(msg.clip) : '';
    const proof = msg.proof && core.proofUrl ? core.proofUrl(msg.proof) : '';
    box.replaceChildren(
      ...[
        h('p', { class: 'tool-title' }, msg.title),
        h(
          'ul',
          { class: 'tool-steps' },
          msg.steps.map((st) =>
            h(
              'li',
              { class: 'tool-step is-' + st.state },
              h('span', { class: 'mark', 'aria-hidden': 'true' }),
              h('span', { class: 'what' }, st.text + (st.state === 'run' ? '…' : '')),
              st.note
                ? h('span', { class: 'found' }, (st.state === 'fail' ? 'It did not work: ' : '') + st.note)
                : null,
            ),
          ),
        ),
        src
          ? h(
              'a',
              { class: 'shot', href: src, target: '_blank', rel: 'noopener', title: 'Open the picture full size' },
              h('img', {
                src,
                alt: msg.alt || 'A picture the team took',
                loading: 'lazy',
                onerror: (e) => {
                  const a = e.target.closest('a');
                  if (a)
                    a.replaceWith(h('p', { class: 'tool-gone' }, 'The picture is no longer kept on this computer.'));
                },
              }),
            )
          : null,
        // a clip a helper made: played here when it is a WebM; an AVI cannot be played by a page, so it is offered as a file
        // THE PROOF IMAGE of a change: a press opens it at full size; a right-click on it saves or copies it, as on any picture
        proof
          ? h(
              'a',
              { class: 'chat-proof', href: proof, target: '_blank', rel: 'noopener', title: 'Open the proof image' },
              h('img', {
                class: 'shot',
                src: proof,
                alt: 'The proof image: the verdict, each check on the code before and after the change, and the steps to check it by hand',
                loading: 'lazy',
              }),
            )
          : null,
        clip
          ? msg.clipType === 'avi'
            ? h('a', { class: 'btn small clip-file', href: clip, download: 'clip.avi' }, 'Open the clip (AVI)')
            : h('video', {
                class: 'shot clip',
                src: clip,
                controls: true,
                loop: true,
                muted: true,
                playsinline: true,
                preload: 'metadata',
                'aria-label': msg.alt || 'A clip the team made',
              })
          : null,
      ].filter(Boolean),
    ); // replaceChildren(null) would write the word
  };
  // under a seat's reply: the sources it answered from, each a link that opens in a new tab
  // a picture of the answer: a symbol, what it is about, the one figure that matters, and a few lines (team-core: cardFrom)
  // it is the reply itself (the words are not shown beside it), so it is read as text, not as a picture: what it is about, the one
  // line that answers, rows or a list, what is good about it and what is not, a warning, and a closing note
  // a picture on a card: shown from where it is, and never sent where the page came from; one that does not load leaves no hole
  const cardPicture = (image, name, cls, instead) =>
    h('img', {
      class: cls,
      src: image.url,
      alt: name,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
      onerror: (e) => (instead ? e.target.replaceWith(instead()) : e.target.remove()),
    });
  const cardOf = (m) => {
    const card = m.card;
    // picks that are places open on a map; where the person is, if the team knows, narrows it
    const isPlace = !!card && /^(place|picks)$/.test(card.kind) && /^(pin|fork|plane)$/.test(card.icon);
    const home = ((core.snapshot().learning || {}).ledger || []).find(
      (y) => y.kind === 'you' && /\b(live|lives|based|moved) (in|to) ([A-Z][\w-]+)/.test(y.text),
    );
    const near = home ? /\b(?:in|to) ([A-Z][\w-]+(?: [A-Z][\w-]+)?)/.exec(home.text)[1] : '';
    const picks = (card && card.picks) || [];
    const credits = card ? [card.image, ...picks.map((p) => p.image)].filter((x) => x && x.from) : [];
    const good = (card && card.good) || [];
    const bad = (card && card.bad) || [];
    if (
      !card ||
      !(
        card.big ||
        card.compare ||
        (card.rows || []).length ||
        (card.items || []).length ||
        (card.picks || []).length ||
        good.length ||
        bad.length ||
        card.warn
      )
    )
      return [];
    return [
      h(
        'figure',
        {
          class:
            'answer-card' +
            (card.big ? '' : ' no-big') +
            (card.image ? ' has-picture' : '') +
            (picks.length ? ' has-picks' : ''),
          role: 'group',
          'aria-label': card.title,
        },
        h('div', { class: 'ac-icon', 'aria-hidden': 'true' }, cardIcon(card.icon)),
        h(
          'div',
          { class: 'ac-main' },
          h('span', { class: 'ac-title' }, card.title),
          card.big ? h('strong', { class: 'ac-big' }, card.big) : null,
          card.small ? h('span', { class: 'ac-small' }, card.small) : null,
        ),
        card.image ? cardPicture(card.image, card.picture || card.title, 'ac-picture') : null,
        picks.length
          ? h(
              'ol',
              { class: 'ac-picks' },
              picks.map((p, i) => {
                // where a pick has no picture, or its picture does not load: its number, in the same place and shape
                const number = () => h('span', { class: 'ac-pick-art none', 'aria-hidden': 'true' }, String(i + 1));
                return h(
                  'li',
                  null,
                  p.image ? cardPicture(p.image, p.name, 'ac-pick-art', number) : number(),
                  h('strong', null, p.name),
                  isPlace
                    ? h(
                        'a',
                        { class: 'ac-map', href: mapUrl(p.name, near), target: '_blank', rel: 'noopener noreferrer' },
                        'Map',
                      )
                    : null,
                  p.note ? h('span', null, p.note) : null,
                );
              }),
            )
          : null,
        (card.rows || []).length
          ? h(
              'dl',
              { class: 'ac-rows' },
              card.rows.map((r) => h('div', null, h('dt', null, r[0]), h('dd', null, r[1]))),
            )
          : null,
        card.compare
          ? h(
              'table',
              { class: 'ac-compare' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', null, ''),
                  card.compare.options.map((o) => h('th', { scope: 'col' }, o)),
                ),
              ),
              h(
                'tbody',
                null,
                card.compare.rows.map((r) =>
                  h(
                    'tr',
                    null,
                    h('th', { scope: 'row' }, r[0]),
                    r.slice(1).map((v) => h('td', null, v)),
                  ),
                ),
              ),
            )
          : null,
        (card.items || []).length
          ? h(
              card.numbered ? 'ol' : 'ul',
              { class: 'ac-items' + (card.numbered ? ' numbered' : '') },
              card.items.map((x) => h('li', null, x)),
            )
          : null,
        good.length || bad.length
          ? h(
              'div',
              { class: 'ac-sides' },
              good.length
                ? h(
                    'div',
                    { class: 'ac-good' },
                    h('b', null, 'Good'),
                    h(
                      'ul',
                      null,
                      good.map((x) => h('li', null, x)),
                    ),
                  )
                : null,
              bad.length
                ? h(
                    'div',
                    { class: 'ac-bad' },
                    h('b', null, 'Not so good'),
                    h(
                      'ul',
                      null,
                      bad.map((x) => h('li', null, x)),
                    ),
                  )
                : null,
            )
          : null,
        card.warn
          ? h(
              'p',
              { class: 'ac-warn', role: 'note' },
              h('i', { 'aria-hidden': 'true' }, '!'),
              h('span', null, h('b', null, 'Careful: '), card.warn),
            )
          : null,
        card.note ? h('p', { class: 'ac-note' }, card.note) : null,
        credits.length
          ? h(
              'p',
              { class: 'ac-credit' },
              'Pictures: ',
              credits[0].page
                ? h('a', { href: credits[0].page, target: '_blank', rel: 'noopener noreferrer' }, credits[0].from)
                : credits[0].from,
            )
          : null,
      ),
    ];
  };
  // THE WORDS OF A REPLY, and when they are shown. Not while a card is being drawn for a looked-up answer (m.veil: the one answering
  // is shown writing instead), and not once a card is the reply (m.cardOnly): then they fold away, and the card stands in their place
  const dots = () => h('span', { class: 'dots' }, h('i'), h('i'), h('i'));
  const stateOf = (m) => (m.live ? 'L' : '') + (m.veil ? 'V' : '') + (m.card ? 'C' : '');
  const calmly = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const showWords = (para, m) => {
    const veiled = !!m.veil && !m.card;
    const only = !!(m.card && m.cardOnly);
    const had = !para.hidden && !para.querySelector('.dots') && !!para.textContent.trim();
    para.classList.toggle('typing', veiled);
    if (veiled) {
      if (!para.querySelector('.dots')) para.replaceChildren(dots());
    } else para.replaceChildren(...rich(m.text));
    if (only && had && !calmly()) {
      para.style.maxHeight = para.offsetHeight + 'px';
      requestAnimationFrame(() => para.classList.add('folded'));
      setTimeout(() => {
        para.hidden = true;
        para.classList.remove('folded');
        para.style.maxHeight = '';
      }, 460);
    } else para.hidden = only;
  };
  // WHAT GOES UNDER A REPLY BESIDES ITS WORDS (team/extras.js reads it off the reply; the core keeps it on the message as
  // msg.extras, and msg.reactions, msg.proof). Each piece is small, says what it is, and does one thing when pressed.
  const timers = new Map(); // message id -> { left, tick }: a timer goes on counting when the chat is painted again
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.max(0, s % 60)).padStart(2, '0');
  const tiny = (label, onclick, cls = '') => h('button', { class: 'btn tiny ' + cls, type: 'button', onclick }, label);
  const say = (text) => {
    if (core.send && core.isLive && core.isLive()) core.send(text);
  };
  const copy = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
      const was = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = was), 1400);
    } catch {
      btn.textContent = 'Could not copy';
    }
  };
  const extrasOf = (m) => {
    const x = m.extras || {};
    const out = [];
    const snap = core.snapshot();
    // the runs of a proof, red to green
    const proof = m.proof ? (snap.proofs || []).find((p) => p.id === 'PF-' + m.proof || p.id === m.proof) : null;
    if (proof && proof.runs && proof.runs.length)
      out.push(
        h(
          'ol',
          { class: 'x-runs', 'aria-label': 'The runs of this proof' },
          proof.runs.map((r) =>
            h(
              'li',
              { class: 'is-' + r.result, title: r.why || '' },
              h('b', null, 'Run ' + r.n),
              h('span', null, r.result === 'green' ? 'green' : 'red'),
              r.why ? h('em', null, r.why) : null,
            ),
          ),
        ),
      );
    // a sum the app worked
    if (x.sum)
      out.push(
        h(
          'div',
          { class: 'x-sum' },
          h('b', null, 'Worked out'),
          h('span', null, x.sum.working),
          h('em', null, 'The sum is done by the app, from the rate given.'),
        ),
      );
    // a timer
    if (x.timer) {
      const t = timers.get(m.id) || { left: x.timer.seconds, tick: 0 };
      timers.set(m.id, t);
      const face = h('output', { class: 'x-clock' }, mmss(t.left));
      const go = tiny(
        t.tick ? 'Stop' : t.left <= 0 ? 'Again' : 'Start',
        () => {
          if (t.tick) {
            clearInterval(t.tick);
            t.tick = 0;
            go.textContent = 'Start';
            return;
          }
          if (t.left <= 0) t.left = x.timer.seconds;
          go.textContent = 'Stop';
          box.classList.remove('is-done');
          try {
            // asked once, at the moment a timer is started: may it say so when it is done and the chat is not in front?
            if (window.Notification && Notification.permission === 'default')
              Notification.requestPermission().catch(() => {});
          } catch {
            /* no notices here */
          }
          t.tick = setInterval(() => {
            t.left -= 1;
            face.textContent = t.left > 0 ? mmss(t.left) : 'Done';
            if (t.left <= 0) {
              clearInterval(t.tick);
              t.tick = 0;
              go.textContent = 'Again';
              box.classList.add('is-done');
              // when the chat is not in front, it says so: a notice if the person allowed one, and the tab's own title either way
              if (document.hidden) {
                const was = document.title;
                document.title = 'Timer done: ' + x.timer.label;
                const back = () => {
                  if (!document.hidden) {
                    document.title = was;
                    document.removeEventListener('visibilitychange', back);
                  }
                };
                document.addEventListener('visibilitychange', back);
                try {
                  if (window.Notification && Notification.permission === 'granted')
                    new Notification('Timer done', { body: x.timer.label });
                } catch {
                  /* no notices here: the title says it */
                }
              }
            }
          }, 1000);
        },
        'primary',
      );
      const box = h(
        'div',
        { class: 'x-timer' + (t.left <= 0 ? ' is-done' : '') },
        h('b', null, 'Timer'),
        face,
        go,
        h('em', null, x.timer.label),
      );
      out.push(box);
    }
    // a day, down a line, and a file of it for the calendar
    if (x.day)
      out.push(
        h(
          'div',
          { class: 'x-day' },
          h(
            'ol',
            null,
            x.day.map((d) => h('li', null, h('time', null, d.at), h('span', null, d.what))),
          ),
          tiny('Add to calendar', () => {
            const day = x.dayOn || new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
            const url = URL.createObjectURL(new Blob([icsOf(x.day, day, 'From your team')], { type: 'text/calendar' }));
            const a = h('a', { href: url, download: 'plan-' + day + '.ics' });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
          }),
          h(
            'em',
            null,
            x.dayOn
              ? 'Saved as a calendar file for ' +
                  new Date(x.dayOn + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  }) +
                  '.'
              : 'Saved as a calendar file for tomorrow: change the day when you open it.',
          ),
        ),
      );
    // commands, to copy or to run
    if (x.commands)
      out.push(
        h(
          'ul',
          { class: 'x-cmds', 'aria-label': 'Commands in this reply' },
          x.commands.map((c, i) => {
            const cp = tiny('Copy', () => copy(c.cmd, cp));
            const canRun = c.run && core.runCommand && snap.workspace && snap.workspace.kind;
            return h(
              'li',
              { class: c.state ? 'is-' + c.state : '' },
              h('code', null, c.cmd),
              cp,
              canRun
                ? tiny(
                    c.state === 'running' ? 'Running' : c.state ? 'Run again' : 'Run here',
                    () => core.runCommand(m.id, i),
                    'primary',
                  )
                : c.run
                  ? h('em', null, 'Connect a workspace to run it here')
                  : h('em', null, 'Copy only: it changes things'),
              c.out ? h('pre', null, c.out) : null,
            );
          }),
        ),
      );
    // what was seen, and what was not
    if (x.seen)
      out.push(
        h(
          'div',
          { class: 'x-seen' },
          x.seen.seen.length ? h('p', null, h('b', null, 'Seen'), x.seen.seen.join(', ')) : null,
          h('p', { class: 'not' }, h('b', null, 'Not seen'), x.seen.notSeen.join(', ')),
          tiny('Attach it', () => {
            const clip = document.getElementById('attach');
            if (clip) clip.click();
          }),
        ),
      );
    // a finished piece: copy it, or steer it
    if (x.draft) {
      const cp = tiny('Copy', () => copy(m.text, cp), 'primary');
      out.push(
        h(
          'div',
          { class: 'x-draft' },
          cp,
          tiny('Warmer', () => say('Make it warmer')),
          tiny('Shorter', () => say('Make it shorter')),
          tiny('Firmer', () => say('Make it firmer')),
        ),
      );
    }
    // fields to fill, or answers to tap: only under the latest thing the team said (css hides them once the chat has moved on)
    if (x.fields) {
      const inputs = x.fields.map((f) =>
        h('input', { type: 'text', 'aria-label': f, placeholder: f, autocomplete: 'off' }),
      );
      out.push(
        h(
          'form',
          {
            class: 'x-form',
            onsubmit: (e) => {
              e.preventDefault();
              const got = x.fields.map((f, i) => [f, inputs[i].value.trim()]).filter(([, v]) => v);
              if (got.length) say(got.map(([f, v]) => f + ': ' + v).join('; '));
            },
          },
          x.fields.map((f, i) => h('label', null, h('span', null, f), inputs[i])),
          h('button', { class: 'btn tiny primary', type: 'submit' }, 'Send'),
        ),
      );
    } else if (x.replies)
      out.push(
        h(
          'div',
          { class: 'x-replies', role: 'group', 'aria-label': 'Answers to tap' },
          x.replies.map((r) => tiny(r, () => say(r))),
        ),
      );
    // where it came from
    if (x.origin) {
      const o = x.origin;
      const canCheck = o.how === 'memory' && !o.checked && !o.checking && core.checkThis;
      out.push(
        h(
          'p',
          { class: 'x-origin is-' + o.how },
          h('i', { 'aria-hidden': 'true' }),
          o.how === 'looked'
            ? 'Looked up' + (o.sources ? ', ' + o.sources + (o.sources === 1 ? ' source' : ' sources') : '')
            : 'From memory',
          o.checking
            ? ' · checking it now'
            : o.checked
              ? o.held === false
                ? ' · checked, and it did not hold'
                : ' · checked'
              : '',
          canCheck ? tiny('Check this', () => core.checkThis(m.id)) : null,
        ),
      );
    }
    // marks from teammates
    if (m.reactions && m.reactions.length)
      out.push(
        h(
          'div',
          { class: 'x-reacts', role: 'group', 'aria-label': 'What the others made of it' },
          m.reactions.map((r) => {
            const who = seatAs(SEAT[r.by] || { title: r.by }).title;
            return h(
              'span',
              { class: 'x-react is-' + r.mark, title: who + (r.mark === 'checked' ? ' checked it' : ' agrees') },
              seatMark(r.by, true, r.mark === 'checked' ? 'proud' : 'happy'),
              h('i', { 'aria-hidden': 'true' }),
              h('em', null, who + (r.mark === 'checked' ? ' checked it' : ' agrees')),
            );
          }),
        ),
      );
    return out;
  };
  const paintExtra = (el, msg) => {
    el.dataset.x = String(msg.xrev || 0);
    const proof = msg.proof && core.proofUrl ? core.proofUrl(msg.proof) : '';
    el.replaceChildren(
      ...(proof
        ? [
            h(
              'a',
              { class: 'chat-proof', href: proof, target: '_blank', rel: 'noopener', title: 'Open the proof image' },
              h('img', {
                class: 'shot',
                src: proof,
                alt: 'The proof image: the verdict, each check on the code before and after the change, and the steps to check it by hand',
                loading: 'lazy',
              }),
            ),
          ]
        : []),
      ...cardOf(msg),
      ...extrasOf(msg),
      ...(msg.sources && msg.sources.length
        ? [
            h(
              'ol',
              { class: 'sources', 'aria-label': 'Sources' },
              msg.sources.map((x) => {
                let host = '';
                try {
                  host = new URL(x.url).host.replace(/^www\./, '');
                } catch {
                  /* shown without it */
                }
                return h(
                  'li',
                  { value: String(x.n) },
                  h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title || host),
                  host ? h('span', null, host) : null,
                );
              }),
            ),
          ]
        : []),
    );
    el.hidden = !el.childNodes.length;
  };
  // THE PLAN AND ITS ROUNDS (Developer; team-core: m.plan): under the message that opens a round. Whose plan and which round; where
  // the round is (the track), with the way back for what is not met; each requirement, its state as a shape and in words; a bar
  // with a piece for each requirement; and one line that says where things stand. Nothing here is told by colour alone.
  const TRACK = ['Plan', 'Build', 'Prove', 'Judge', 'Land'];
  const REQ_SAYS = { todo: 'To do', doing: 'Being worked on', met: 'Met', unmet: 'Not met', unknown: 'Not judged' };
  const paintPlan = (el, msg) => {
    const plan = msg.plan;
    const all = plan.reqs.length;
    const met = plan.reqs.filter((r) => r.state === 'met').length;
    const at = { plan: 0, build: 1, prove: 2, judge: 3, judged: 4 }[plan.stage];
    const live = at !== undefined;
    const step = (i) =>
      plan.stage === 'landed'
        ? 'done'
        : plan.stage === 'waiting'
          ? i < 4
            ? 'done'
            : 'wait'
          : plan.stage === 'again' || plan.stage === 'thrown'
            ? i < 4
              ? 'done'
              : 'skip'
            : !live
              ? 'todo'
              : i < at
                ? 'done'
                : i === at
                  ? 'now'
                  : 'todo';
    const says =
      plan.says ||
      (plan.stage === 'plan' ? (plan.n > 1 ? 'Ready for round ' + plan.n : 'Planned. Building comes next.') : '');
    el.className = 'round-card is-' + plan.stage + (live ? ' is-live' : '');
    el.dataset.round = String(plan.n);
    el.dataset.stage = plan.stage;
    el.replaceChildren(
      h(
        'div',
        { class: 'plan-head' },
        h('b', null, plan.n > 1 ? 'Plan, round ' + plan.n : 'Plan'),
        h(
          'span',
          { class: 'plan-src' },
          plan.source === 'ticket' ? 'from the ticket ' + plan.key : 'from your request',
        ),
        h(
          'span',
          { class: 'plan-lap' },
          h('span', null, 'Round ' + plan.n + ' of ' + plan.max),
          h(
            'span',
            { class: 'plan-pips', 'aria-hidden': 'true' },
            Array.from({ length: plan.max }, (_, i) =>
              h('i', {
                class:
                  i + 1 < plan.n || (i + 1 === plan.n && !live && plan.stage !== 'talk' && plan.stage !== 'moved')
                    ? 'done'
                    : i + 1 === plan.n
                      ? 'now'
                      : '',
              }),
            ),
          ),
        ),
      ),
      h(
        'ol',
        { class: 'plan-track', 'aria-label': 'Where this round is' },
        TRACK.map((name, i) => {
          const k = step(i);
          return h(
            'li',
            { class: 'is-' + k, ...(k === 'now' ? { 'aria-current': 'step' } : {}) },
            h('i', { 'aria-hidden': 'true' }),
            h(
              'span',
              null,
              k === 'wait'
                ? 'Waits for you'
                : k === 'skip'
                  ? plan.stage === 'thrown'
                    ? 'Thrown away'
                    : 'Not yet'
                  : name,
            ),
          );
        }),
      ),
      h(
        'p',
        { class: 'plan-loop' + (plan.n > 1 || plan.stage === 'again' ? ' on' : '') },
        h(
          'span',
          null,
          plan.stage === 'again'
            ? 'Not all met: it went round again'
            : plan.n > 1
              ? 'Round ' + plan.n + ': only what was not met'
              : 'What is not met goes round again',
        ),
      ),
      h(
        'ol',
        { class: 'plan-reqs', 'aria-label': 'The requirements' },
        plan.reqs.map((r) =>
          h(
            'li',
            { class: 'is-' + r.state },
            h('i', { class: 'plan-mark', role: 'img', 'aria-label': REQ_SAYS[r.state] || 'To do' }),
            h(
              'span',
              {
                class:
                  'plan-req' + (plan.sections && plan.sections.lead === plan.reqs.indexOf(r) + 1 ? ' is-lead' : ''),
              },
              plan.sections && plan.sections.lead === plan.reqs.indexOf(r) + 1
                ? h('b', { class: 'plan-lead' }, 'Matters most')
                : null,
              r.text,
              r.why
                ? h('em', null, (REQ_SAYS[r.state] || '') + ': ' + r.why)
                : r.was && r.state !== 'met'
                  ? h('em', null, 'Last round: ' + r.was)
                  : null,
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'plan-bar', role: 'img', 'aria-label': met + ' of ' + all + ' met' },
        plan.reqs.map((r) => h('i', { class: 'is-' + r.state })),
      ),
      // THE LESSONS THIS ROUND MUST ANSWER (team/build.js answerChecks): what the team had learned that bears on this work, each
      // answered against the change: applied, and how; does not apply, and why; or skipped, which is said and never hidden
      plan.checks && plan.checks.length
        ? h(
            'ul',
            { class: 'plan-checks', 'aria-label': 'What the team had learned that bears on this' },
            plan.checks.map((c) =>
              h(
                'li',
                { class: 'is-' + c.state },
                h(
                  'b',
                  null,
                  { open: 'To answer', applied: 'Applied', 'not-applicable': 'Does not apply', skipped: 'Skipped' }[
                    c.state
                  ] || 'To answer',
                ),
                h('span', null, c.text),
                c.line && c.state !== 'open' ? h('em', null, c.line) : null,
              ),
            ),
          )
        : null,
      // THE SECTIONS THIS PLAN CARRIES (team/build.js planSections): chosen by the planner for this piece of work, drawn here.
      // Which files it expects to touch, the step most likely to go wrong and how it is undone, the cases the check will pin.
      plan.sections && (plan.sections.files || plan.sections.risk || plan.sections.cases)
        ? h(
            'div',
            { class: 'plan-more' },
            plan.sections.files
              ? h(
                  'p',
                  { class: 'plan-files' },
                  h('b', null, 'Files'),
                  plan.sections.files.map((f) => h('code', null, f)),
                )
              : null,
            plan.sections.cases
              ? h(
                  'p',
                  { class: 'plan-cases' },
                  h('b', null, 'Cases'),
                  plan.sections.cases.map((c) => h('span', null, c)),
                )
              : null,
            plan.sections.risk ? h('p', { class: 'plan-risk' }, h('b', null, 'Risk'), plan.sections.risk) : null,
          )
        : null,
      says ? h('p', { class: 'plan-says', role: 'status' }, says) : null,
      // MORE THAN YES AND NO: a change that is proven and waits can be landed, looked at first, held for someone else, or thrown away
      plan.stage === 'waiting' && core.send && core.isLive && core.isLive()
        ? h(
            'div',
            { class: 'plan-choices', role: 'group', 'aria-label': 'What to do with this change' },
            h('button', { class: 'btn tiny primary', type: 'button', onclick: () => core.send('Land it') }, 'Land it'),
            core.planDiff && !plan.diff
              ? h(
                  'button',
                  { class: 'btn tiny', type: 'button', onclick: () => core.planDiff(msg.id) },
                  'Show me the diff first',
                )
              : null,
            core.planHold
              ? h(
                  'button',
                  {
                    class: 'btn tiny',
                    type: 'button',
                    disabled: plan.held ? '' : null,
                    onclick: () => core.planHold(msg.id),
                  },
                  plan.held ? 'Held for a review' : 'Hold it for a review',
                )
              : null,
            h(
              'button',
              { class: 'btn tiny danger', type: 'button', onclick: () => core.send('Throw it away') },
              'Throw it away',
            ),
          )
        : null,
      plan.diff
        ? h(
            'details',
            { class: 'plan-diff', open: '' },
            h(
              'summary',
              null,
              plan.diff.why
                ? 'The diff could not be read'
                : 'The diff: ' + plan.diff.files.length + (plan.diff.files.length === 1 ? ' file' : ' files'),
            ),
            plan.diff.why ? h('p', null, plan.diff.why) : null,
            plan.diff.files.length
              ? h(
                  'p',
                  { class: 'plan-files' },
                  plan.diff.files.map((f) => h('code', null, f)),
                )
              : null,
            plan.diff.text
              ? h(
                  'pre',
                  null,
                  plan.diff.text.split('\n').map((l) =>
                    h(
                      'span',
                      {
                        class: /^\+(?!\+\+)/.test(l) ? 'add' : /^-(?!--)/.test(l) ? 'del' : /^@@/.test(l) ? 'at' : '',
                      },
                      l + '\n',
                    ),
                  ),
                )
              : null,
            plan.diff.cut ? h('p', null, 'Cut: the whole change is in the workspace.') : null,
          )
        : null,
    );
    // a part that is not there is passed as nothing, and replaceChildren would write the word for it: bare text is never part of this card
    for (const n of [...el.childNodes]) if (n.nodeType === 3) n.remove();
    return el;
  };
  // WHAT THE TEAM NEEDS FROM THIS COMPUTER (Developer; team-core: m.setup): under a message, the thing to press and the state it is
  // in now. A folder to choose; the site's address, with whether it is running; a phone, with what to do when none is seen.
  const paintSetup = (el, msg) => {
    const setup = msg.setup;
    const kids = [];
    const btn = (label, act, primary) =>
      h(
        'button',
        {
          class: 'btn small' + (primary ? ' primary' : ''),
          type: 'button',
          disabled: !!setup.busy,
          'data-act': act,
          onclick: () => core.setupDo && core.setupDo(msg.id, act),
        },
        label,
      );
    const bare = (u) =>
      String(u || '')
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
    el.className = 'setup-card is-' + setup.kind + ' is-' + (setup.state || 'open');
    if (setup.kind === 'folder')
      kids.push(
        setup.state === 'done'
          ? h(
              'p',
              { class: 'setup-line' },
              h('i', { class: 'dot is-green' }),
              h('span', null, 'Working in ', h('b', null, setup.name)),
            )
          : h(
              'div',
              { class: 'row' },
              btn(setup.busy ? 'Choosing…' : 'Choose a folder', 'choose', true),
              h('a', { class: 'btn small', href: '#workspace' }, 'Workspace page'),
            ),
      );
    if (setup.kind === 'site') {
      const online = setup.state === 'online';
      kids.push(
        h(
          'p',
          { class: 'setup-line', role: 'status' },
          h('i', { class: 'dot ' + (online ? 'is-green' : 'is-clear') }),
          online
            ? h(
                'span',
                null,
                'Running at ',
                h('a', { href: setup.url, target: '_blank', rel: 'noopener' }, bare(setup.url)),
              )
            : h(
                'span',
                null,
                'Not running' + (setup.why ? ': ' + setup.why : '') + '. It was at ',
                h('span', { class: 'mono' }, bare(setup.url)),
              ),
        ),
        h(
          'div',
          { class: 'row' },
          online
            ? h(
                'a',
                { class: 'btn small primary', href: setup.url, target: '_blank', rel: 'noopener', 'data-act': 'open' },
                'Open it',
              )
            : btn('Start it again', 'start', true),
          online ? btn('Stop it', 'stop') : null,
        ),
      );
    }
    if (setup.kind === 'phone')
      kids.push(
        h(
          'p',
          { class: 'setup-line', role: 'status' },
          h('i', {
            class: 'dot ' + (setup.state === 'ready' ? 'is-green' : setup.state === 'waiting' ? 'is-run' : 'is-clear'),
          }),
          h('span', null, setup.text),
        ),
        (setup.steps || []).length
          ? h(
              'ol',
              { class: 'setup-steps' },
              setup.steps.map((x) => h('li', null, x)),
            )
          : null,
        h(
          'div',
          { class: 'row' },
          setup.state === 'ready' && setup.built
            ? btn(setup.busy ? 'Putting it on…' : 'Put it on the phone', 'install', true)
            : null,
          btn('Check again', 'check'),
        ),
      );
    if (setup.note) kids.push(h('p', { class: 'setup-note', role: 'status' }, setup.note));
    el.replaceChildren(...kids.filter(Boolean));
    return el;
  };
  const narr = h('div', { class: 'narr-bar', 'aria-live': 'polite' }); // the shade: it slides down over the top of the chat while a seat is at work, and back up when the room is quiet

  // AN ADDRESS IN A REPLY IS A LINK. A seat that searched gives its sources as [title](address) or as a bare address; shown as text, nobody
  // could open them. Only http and https addresses become links, they open in a new tab, and nothing else in the reply is treated as markup.
  function rich(text) {
    const out = [];
    const re = /\[([^\]\n]{1,140})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'\]]+)/g;
    const t = String(text || '');
    let at = 0;
    let m;
    while ((m = re.exec(t))) {
      let url = m[2] || m[3];
      let label = m[1] || '';
      let end = re.lastIndex;
      if (!m[2]) {
        const trim = /[.,;:!?)]+$/.exec(url);
        if (trim) {
          url = url.slice(0, -trim[0].length);
          end -= trim[0].length;
          re.lastIndex = end;
        }
      }
      let host = '';
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      if (m.index > at) out.push(t.slice(at, m.index));
      out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label || host));
      at = end;
    }
    if (at < t.length) out.push(t.slice(at));
    return out.length ? out : [t];
  }
  function msgEl(msg, snap) {
    if (msg.by === 'you')
      return h(
        'div',
        { class: 'msg you' },
        h(
          'p',
          null,
          msg.re
            ? h(
                'span',
                { class: 're' },
                'Replying to ' +
                  (seatAs(SEAT[msg.re.by] || {}).title || msg.re.by) +
                  ': ' +
                  msg.re.text +
                  (msg.re.text.length >= 160 ? '…' : ''),
              )
            : null,
          msg.to && msg.to.length
            ? h('span', { class: 'to' }, 'To ' + msg.to.map((id) => (SEAT[id] || {}).title || id).join(', '))
            : null,
          msg.files && msg.files.length
            ? h(
                'span',
                { class: 'sent-files' },
                msg.files.map((f) => h('span', { class: 'sent-file' }, glyph('clip'), f.name)),
              )
            : null,
          msg.text,
        ),
      );
    const seat = seatAs(SEAT[msg.by] || { title: msg.by, tone: '' }); // in Simple: a first name and a plain job
    if (msg.kind === 'tools') {
      // what a seat did with a tool: its steps as they happen, and the picture if one was taken
      const box = h('div', { class: 'tool-work' });
      paintTools(box, msg);
      if (msg.open) tools.set(msg.id, { box, rev: msg.rev });
      return h(
        'div',
        { class: 'msg' },
        seat.short
          ? buddy(msg.by, moodOf(msg, { simple: true }))
          : seatMark(msg.by, false, moodOf(msg, { simple: false })),
        h(
          'div',
          null,
          h(
            'div',
            { class: 'msg-head' },
            h('strong', null, seat.title),
            h('span', null, 'at work'),
            h('time', null, clock(msg.at)),
          ),
          box,
        ),
      );
    }
    const veiled = !!msg.veil && !msg.card;
    const para = h(
      'p',
      { class: msg.live || veiled ? 'typing' : '' },
      (msg.live && !msg.text) || veiled ? dots() : msg.live ? msg.text : rich(msg.text),
    );
    if (msg.card && msg.cardOnly) para.hidden = true; // the card is the reply
    if (msg.live && !veiled) {
      para.dataset.n = String(msg.text.length);
      para.dataset.r = String(msg.resets || 0);
    }
    const extra = h('div', { class: 'msg-extra' });
    paintExtra(extra, msg);
    cards.set(msg.id, { extra, para, state: stateOf(msg) });
    if (cards.size > 12) cards.delete(cards.keys().next().value);
    if (msg.live && !veiled) live.set(msg.id, { para, extra }); // a seat speaking through a real engine: its words arrive as they are written
    const body = h(
      'div',
      null,
      h(
        'div',
        { class: 'msg-head' },
        h('strong', null, seat.title),
        h('span', null, seat.short || seat.tone),
        h('time', null, clock(msg.at)),
        msg.vision
          ? h(
              'span',
              { class: 'vis', title: "What the team's memory held on this, shown to the seat before it spoke" },
              'Vision ' + msg.vision,
            )
          : null,
        opts.onReply
          ? h(
              'button',
              {
                class: 'reply',
                type: 'button',
                'aria-label': 'Reply to ' + seat.title,
                onclick: () => opts.onReply(msg),
              },
              'Reply',
            )
          : null,
      ),
      para,
      extra,
    );
    if (msg.plan) {
      const el = paintPlan(h('div'), msg);
      plans.set(msg.id, { el, rev: msg.plan.rev || 0 });
      body.append(el);
    }
    if (msg.setup) {
      const el = paintSetup(h('div'), msg);
      setups.set(msg.id, { el, rev: msg.setup.rev || 0 });
      body.append(el);
    } // something this computer has to give: a folder, the site's address, a phone
    if (msg.proposal) {
      const p = snap.proposals.find((x) => x.id === msg.proposal);
      if (p) {
        const el = paintOffer(h('div'), p, core);
        offers.set(p.id, el);
        body.append(el);
      }
    }
    return h(
      'div',
      { class: 'msg' },
      seat.short
        ? buddy(msg.by, moodOf(msg, { simple: true }))
        : seatMark(msg.by, false, moodOf(msg, { simple: false })),
      body,
    ); // in Simple a seat is a person (it has a short job name there): its own little character, not a line shape
  }

  const tail = follow(log);
  let heard = ''; // the last thing the person wrote that the five have reacted to
  function update() {
    const snap = core.snapshot();
    if (snap.chat.length < shown) {
      log.replaceChildren();
      offers.clear();
      live.clear();
      tools.clear();
      cards.clear();
      setups.clear();
      plans.clear();
      shown = 0;
    }
    const first = !shown;
    for (; shown < snap.chat.length; shown++) log.append(msgEl(snap.chat[shown], snap));
    for (const [id, { para, extra }] of live) {
      const m = snap.chat.find((x) => x.id === id);
      if (!m) {
        live.delete(id);
        continue;
      }
      const have = Number(para.dataset.n || 0);
      const resets = String(m.resets || 0);
      if (para.dataset.r !== resets) {
        para.dataset.r = resets;
        para.textContent = m.text;
        para.dataset.n = String(m.text.length);
      } // the reply was cut and is being written again: what was shown is replaced, not added to
      else if (m.text.length > have) {
        if (!have) para.replaceChildren();
        para.append(h('span', { class: 'w' }, m.text.slice(have)));
        para.dataset.n = String(m.text.length);
      }
      if (!m.live) {
        para.classList.remove('typing');
        para.replaceChildren(...rich(m.text));
        paintExtra(extra, m);
        live.delete(id);
      }
    }
    // THE FIVE ABOVE THE CHAT LOOK AT WHOEVER IS SPEAKING, and a feeling passes over them when the person writes: they listen; a
    // thank-you gets a smile; being put right gets a start. (The strip is drawn by js/app.js, in the order the five sit.)
    {
      const strip = [...document.querySelectorAll('.crew .crew-one')];
      if (strip.length) {
        const speaking = snap.chat.find((m) => m.live && m.by !== 'you');
        const at = speaking ? SEATS.findIndex((x) => x.id === speaking.by) : -1;
        strip.forEach((one, i) => lookAt(one, at < 0 || i === at ? '' : i < at ? 'right' : 'left'));
        const newest = snap.chat[snap.chat.length - 1];
        if (newest && newest.by === 'you' && heard !== newest.id) {
          heard = newest.id;
          const t = String(newest.text || '');
          const feeling = /\b(thanks|thank you|cheers|brilliant|perfect|love it)\b/i.test(t)
            ? 'happy'
            : /^\W*(no[,.! ]|that'?s (wrong|not right)|actually|you'?re wrong|not what i)/i.test(t)
              ? 'surprised'
              : 'listening';
          strip.forEach((one, i) =>
            setTimeout(() => flashMood(one, feeling, feeling === 'listening' ? 1300 : 2000), i * 70),
          );
        }
      }
    }
    // THE FACES FOLLOW THE CHAT: the face beside each of the latest messages shows what that message is now (being thought about,
    // being said, a warning, a change that landed). Only the last few can still change.
    for (let i = Math.max(0, snap.chat.length - 14); i < snap.chat.length; i++) {
      const m = snap.chat[i];
      const el = log.children[i];
      if (el && m.by !== 'you') {
        const mood = moodOf(m, { simple: !!seatAs(SEAT[m.by] || {}).short });
        setMood(el, mood, strengthOf(m, mood));
      }
      if (el) el.classList.toggle('superseded', !!m.superseded); // a teammate's doubt was taken up: what replaces this is below
      if (el)
        el.classList.toggle('spent', i < snap.chat.length - 1 && snap.chat.slice(i + 1).some((n) => n.by === 'you')); // the person has answered since
      const under = el && m.by !== 'you' && !m.live ? el.querySelector('.msg-extra') : null;
      if (under && under.dataset.x !== String(m.xrev || 0)) paintExtra(under, m); // something under it changed: a check came back, a command ran
    }
    for (const [id, t] of tools) {
      const m = snap.chat.find((x) => x.id === id);
      if (!m) {
        tools.delete(id);
        continue;
      }
      if (m.rev !== t.rev) {
        t.rev = m.rev;
        paintTools(t.box, m);
      }
      if (!m.open) tools.delete(id);
    }
    for (const [id, c] of cards) {
      const m = snap.chat.find((x) => x.id === id);
      if (!m) {
        cards.delete(id);
        continue;
      }
      const now = stateOf(m);
      if (now !== c.state && !m.live) {
        c.state = now;
        showWords(c.para, m);
        paintExtra(c.extra, m);
      }
    } // it has finished, or its card has come (or will not): the words and what is under them are set again
    for (const [id, c] of plans) {
      const m = snap.chat.find((x) => x.id === id);
      if (!m || !m.plan) {
        plans.delete(id);
        continue;
      }
      if ((m.plan.rev || 0) !== c.rev) {
        c.rev = m.plan.rev || 0;
        paintPlan(c.el, m);
      }
    }
    for (const [id, c] of setups) {
      const m = snap.chat.find((x) => x.id === id);
      if (!m || !m.setup) {
        setups.delete(id);
        continue;
      }
      if ((m.setup.rev || 0) !== c.rev) {
        c.rev = m.setup.rev || 0;
        paintSetup(c.el, m);
      }
    }
    for (const [id, el] of offers) {
      const p = snap.proposals.find((x) => x.id === id);
      if (p) paintOffer(el, p, core);
    }
    if (!narr.isConnected && log.parentNode) {
      log.parentNode.classList.add('has-shade');
      log.parentNode.prepend(narr);
    }
    const at = snap.team.seats.filter((q) => q.status === 'working');
    const say = at.map((q) => seatAs(q).title + ' is ' + String(q.line || 'working').toLowerCase()).join(' · ');
    narr.classList.toggle('on', at.length > 0);
    if (at.length && narr.dataset.t !== say) {
      narr.dataset.t = say;
      narr.replaceChildren(h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), say + '…');
    }
    if (log.parentNode) log.parentNode.classList.toggle('is-empty', !snap.chat.length);
    if (first) tail.pin();
    else tail.go(); // a view that just opened starts at the bottom; after that it eases to each new line
  }
  update();
  return { update, tail };
}

// A task is anything that is not a question: "@seat ..." or a line ending in "?" is just talk.
export const isTalk = (text) => /^@\w+/.test(text.trim()) || /\?\s*$/.test(text.trim());

export function composer(form, input, core, opts = {}) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (core.send && core.isLive()) core.send(text);
    else if (isTalk(text)) core.say(text);
    else core.request(text, opts);
  });
}

// THE ADDRESSED COMPOSER (the team chat). Who a message is for is chosen three ways that all end in the same place, the chips:
//   the chips      press one or several seats; "Whole team" clears them
//   typing @       a list of seats opens and narrows as you type; Enter, Tab or a click picks one, and it becomes a chip
//   Reply          on any seat's message: that seat is picked and it is told what it said
// With seats picked (or a reply), the message is talk to those seats, each answering in turn. With none, it is the team's as before:
// a request is planned and proved, a question goes to the Overseer.
export function richComposer({ form, input, core, files = null }) {
  // files.take(): what is waiting in the message box, handed over and cleared
  // while the person types, the five above the chat look down at what is being written
  let typing = 0;
  input.addEventListener('input', () => {
    document.body.dataset.typing = '1';
    clearTimeout(typing);
    typing = setTimeout(() => delete document.body.dataset.typing, 1300);
  });
  const picked = new Set();
  let replyTo = null;
  let found = [];
  let caret = 0;
  const chips = h('div', { class: 'to-chips', role: 'group', 'aria-label': 'Who this message is for' });
  const replyBar = h('div', { class: 'reply-bar', hidden: '' });
  const list = h('ul', { class: 'at-menu', role: 'listbox', 'aria-label': 'Seats', hidden: '' });
  const bar = h(
    'div',
    { class: 'talk-bar' },
    list,
    replyBar,
    h('div', { class: 'to-row' }, h('span', { class: 'to-k' }, 'To'), chips),
    h(
      'p',
      { class: 'hint' },
      'Type @ to pick a seat. With none picked, the team decides who answers and what it takes: an answer, a search of the web, a look at a page you name, or the whole team for a change.',
    ),
  );
  const paintChips = () => {
    chips.replaceChildren(
      h(
        'button',
        {
          class: 'to-chip',
          type: 'button',
          'aria-pressed': String(!picked.size),
          onclick: () => {
            picked.clear();
            paintChips();
            input.focus();
          },
        },
        'Whole team',
      ),
      ...SEATS.map((x) =>
        h(
          'button',
          {
            class: 'to-chip',
            type: 'button',
            'aria-pressed': String(picked.has(x.id)),
            onclick: () => {
              if (picked.has(x.id)) picked.delete(x.id);
              else picked.add(x.id);
              paintChips();
              input.focus();
            },
          },
          x.title,
        ),
      ),
    );
    input.placeholder = picked.size
      ? 'Message ' + [...picked].map((id) => SEAT[id].title).join(', ')
      : 'Say hello, ask, send them to find out, or ask for a change';
  };
  const setReply = (m) => {
    replyTo = m || null;
    replyBar.hidden = !replyTo;
    if (!replyTo) return;
    replyBar.replaceChildren(
      h(
        'span',
        { class: 't' },
        h('strong', null, 'Replying to ' + (seatAs(SEAT[m.by] || {}).title || m.by)),
        h('span', null, m.text.slice(0, 120) + (m.text.length > 120 ? '…' : '')),
      ),
      h(
        'button',
        {
          class: 'x',
          type: 'button',
          'aria-label': 'Stop replying',
          onclick: () => {
            setReply(null);
            input.focus();
          },
        },
        '×',
      ),
    );
  };
  // the piece of text being typed after an "@", if the caret is in one
  const frag = () => {
    const v = input.value.slice(0, input.selectionStart == null ? input.value.length : input.selectionStart);
    const m = /(^|\s)@(\w*)$/.exec(v);
    return m ? { start: v.length - m[2].length - 1, end: v.length, q: m[2].toLowerCase() } : null;
  };
  const shut = () => {
    list.hidden = true;
    found = [];
    input.removeAttribute('aria-activedescendant');
  };
  const choose = (x) => {
    const f = frag();
    if (f) {
      input.value = (input.value.slice(0, f.start) + input.value.slice(f.end)).replace(/^\s+/, '');
      const c = Math.min(f.start, input.value.length);
      input.setSelectionRange(c, c);
    }
    picked.add(x.id);
    paintChips();
    shut();
    input.focus();
  };
  const open = () => {
    const f = frag();
    if (!f) return shut();
    found = SEATS.filter((x) => x.id.startsWith(f.q) || x.title.toLowerCase().startsWith(f.q));
    if (!found.length) return shut();
    caret = Math.min(caret, found.length - 1);
    list.replaceChildren(
      ...found.map((x, i) =>
        h(
          'li',
          {
            role: 'option',
            id: 'at-' + x.id,
            'aria-selected': String(i === caret),
            onmousedown: (e) => {
              e.preventDefault();
              choose(x);
            },
          },
          seatMark(x.id, true),
          h('strong', null, x.title),
          h('span', null, x.role),
        ),
      ),
    );
    list.hidden = false;
    input.setAttribute('aria-activedescendant', 'at-' + found[caret].id);
  };
  input.addEventListener('input', () => {
    caret = 0;
    open();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) {
      if (e.key === 'Escape' && replyTo) setReply(null);
      if (e.key === 'Backspace' && !input.value && picked.size) {
        picked.delete([...picked].pop());
        paintChips();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      caret = (caret + 1) % found.length;
      open();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      caret = (caret - 1 + found.length) % found.length;
      open();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(found[caret]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      shut();
    }
  });
  input.addEventListener('blur', () => setTimeout(shut, 150));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!list.hidden && found.length) return choose(found[caret]);
    const text = input.value.trim();
    const got = files ? files.take() : [];
    if (!text && !got.length) return;
    input.value = '';
    if (got.length && core.sendWith) core.sendWith(text, got, { to: [...picked], re: replyTo ? replyTo.id : null });
    else if (text) core.send(text, { to: [...picked], re: replyTo ? replyTo.id : null }); // the team works out what kind of message it is: talk, a question, research, a look at something, or a change
    setReply(null);
  });
  paintChips();
  return {
    bar,
    reply(m) {
      setReply(m);
      picked.clear();
      picked.add(m.by);
      paintChips();
      input.focus();
    },
  };
}

const stageOf = (p) => (p.landed ? 4 : p.receipt ? 3 : p.runs.length > 1 ? 2 : p.runs.length ? 1 : 0);
export const proofState = (p) =>
  p.landed
    ? { tag: 'ok', text: 'Landed' }
    : p.receipt
      ? { tag: 'warn', text: 'Proven, not landed' }
      : p.runs.length > 1
        ? { tag: 'bad', text: 'Red' }
        : { tag: 'warn', text: 'In proof' };

export function proofDetail(proof) {
  const at = stageOf(proof);
  return h(
    'div',
    { class: 'proof-detail' },
    h(
      'ol',
      { class: 'track', 'aria-label': 'Stage' },
      ['Plan', 'Judge', 'Build', 'Proven', 'Landed'].map((name, i) => h('li', { class: i <= at ? 'on' : '' }, name)),
    ),
    h('p', { class: 'mono muted' }, proof.judge),
    h(
      'ol',
      { class: 'runs', 'aria-label': 'Proof runs' },
      proof.runs.map((r) =>
        h(
          'li',
          { class: 'run ' + r.result },
          h('span', { class: 'dot ' + (r.result === 'green' ? 'is-green' : 'is-red') }),
          'Run ' + r.n,
          r.why ? h('span', { class: 'dim' }, r.why) : null,
        ),
      ),
    ),
    proof.receipt
      ? h(
          'div',
          { class: 'receipt' },
          h('h4', null, 'RECEIPT'),
          h(
            'dl',
            null,
            h('dt', null, 'id'),
            h('dd', null, proof.receipt.id),
            h('dt', null, 'key'),
            h(
              'dd',
              null,
              proof.real ? proof.receipt.key : proof.receipt.key + '  (bytes of every path, its tests, its judge)',
            ),
            h('dt', null, 'head'),
            h('dd', null, proof.receipt.head),
            h('dt', null, 'proof'),
            h('dd', null, proof.receipt.state),
            h('dt', null, 'landed'),
            h('dd', null, proof.landed ? proof.landed.sha + ' at ' + clock(proof.landed.at) : 'not yet'),
          ),
          h('span', { class: 'dim' }, 'Good until a path it proved changes.'),
        )
      : h('p', { class: 'muted' }, 'No receipt yet. A receipt is issued when the judge that went red goes green.'),
  );
}
