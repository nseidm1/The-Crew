// owner.js - the owner's panel (owner.html). It talks only to /api/owner/ on this machine. Each card is one job; nothing here is
// in the bundle a customer gets.
import { $, h } from '../js/ui.js';

const panel = $('#panel');
const saidEl = $('#said');
const get = async (p) => {
  const r = await fetch('api/owner' + p, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'refused');
  return j;
};
const post = async (p, body) => {
  const r = await fetch('api/owner' + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'refused');
  return j;
};
const say = (text, bad) => {
  saidEl.hidden = !text;
  saidEl.textContent = text || '';
  saidEl.className = 'note' + (bad ? ' bad' : '');
  if (text) saidEl.scrollIntoView({ block: 'nearest' });
};
const card = (...kids) => h('section', { class: 'card glass flat' }, kids);
const field = (label, input, hint) => h('label', null, label, input, hint ? h('small', null, hint) : null);
const copyBtn = (text, label = 'Copy') => {
  const b = h('button', { class: 'btn small', type: 'button' }, label);
  b.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text());
      b.textContent = 'Copied';
    } catch {
      b.textContent = 'Select it and copy';
    }
    setTimeout(() => {
      b.textContent = label;
    }, 2000);
  };
  return b;
};
const when = (ms) => (ms ? new Date(ms).toLocaleString() : '');
const cap = (text, control, tag = 'label') => h(tag, { class: 'cap' }, h('span', null, text), control); // a caption over a control; a group of buttons takes 'div'
let status = null;
let locks = null;
let lastCode = null;
let walletSaid = null;
let building = false;

async function run(fn, done) {
  try {
    say('One moment…');
    await fn();
    say(done || '');
  } catch (e) {
    say(String(e.message || e), true);
  }
  await load();
}
async function load() {
  try {
    status = await get('/state');
  } catch (e) {
    panel.replaceChildren(
      h(
        'p',
        { class: 'note bad' },
        "The owner's panel is not available: " +
          e.message +
          '. It only answers when the app is run from its source folder with node server.mjs.',
      ),
    );
    return;
  }
  paint();
  if (!locks)
    get('/locks')
      .then((r) => {
        locks = r.locks;
        paint();
      })
      .catch(() => {});
  if (status.test.running) setTimeout(load, 4000);
}

function billingCard() {
  return card(
    h('h2', null, 'Billing'),
    h(
      'p',
      { class: 'muted' },
      status.enforce
        ? 'Billing is ON: a machine with no plan and no code is on Free.'
        : 'Billing is OFF: every feature is open to everyone, and nothing is checked.',
    ),
    status.lockedOut
      ? h(
          'p',
          { class: 'o-warn' },
          'Billing is on, no lock is set and there is no code: nobody, including you, can get past Free. Make a code below, or set the lock.',
        )
      : null,
    !status.enforce && !status.codes.length
      ? h(
          'p',
          { class: 'o-warn' },
          'Before switching it on, make yourself a code below. Without one you will be on Free like everyone else, unless your own wallet holds a key.',
        )
      : null,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn ' + (status.enforce ? '' : 'primary'),
          type: 'button',
          onclick: () =>
            run(
              () => post('/enforce', { on: !status.enforce }),
              status.enforce
                ? 'Billing is off.'
                : 'Billing is on for this running copy. Build the bundle and publish for it to reach customers.',
            ),
        },
        status.enforce ? 'Switch billing off' : 'Switch billing on',
      ),
    ),
    h(
      'p',
      { class: 'muted small' },
      'This edits js/billing.js. This running copy follows it at once; customers follow it when you build and publish.',
    ),
  );
}

// THE CODES CARD. One row makes a code: what to call it, how long it lasts, when it stops being accepted. The tier is only asked for
// when there is more than one to choose from. The two things that are rarely wanted (a referrer, your own wording) are under "More".
// What is typed is kept across repaints, so making one code does not clear the next.
const draft = { tier: '', label: '', days: '30', until: '', referrer: '', own: '' };
const LASTS = [
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
  ['', 'No limit'],
];
function codesCard() {
  if (!status.tiers.some((x) => x.id === draft.tier)) draft.tier = (status.tiers[0] || { id: 'pro' }).id;
  const keep = (k) => (e) => {
    draft[k] = e.target.value;
  };
  const seg = (key, options, name) => {
    const el = h('div', { class: 'o-seg', role: 'group', 'aria-label': name });
    const draw = () =>
      el.replaceChildren(
        ...options.map(([v, name]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(draft[key] === v),
              onclick: () => {
                draft[key] = v;
                draw();
              },
            },
            name,
          ),
        ),
      );
    draw();
    return el;
  };
  const label = h('input', {
    id: 'code-label',
    type: 'text',
    placeholder: 'launch, friends, mine…',
    maxlength: '24',
    autocomplete: 'off',
    value: draft.label,
    oninput: keep('label'),
  });
  const until = h('input', {
    type: 'date',
    value: draft.until,
    oninput: keep('until'),
    'aria-label': 'Stops being accepted on',
  });
  const make = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post('/codes', {
        tier: draft.tier,
        label: draft.label,
        days: draft.days,
        until: draft.until,
        referrer: draft.referrer,
        own: draft.own,
      });
      lastCode = { ...r, label: draft.label, typed: !!draft.own };
      draft.label = '';
      draft.own = '';
    }, 'Code made. Build the bundle and publish for customers to be able to use it.');
  };
  const site = h('input', {
    type: 'text',
    placeholder: 'https://myfamilyoffice.eth.limo/',
    value: localStorage.getItem('fo.owner.site') || '',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const who = h('input', { type: 'text', placeholder: '0x…', autocomplete: 'off', spellcheck: 'false' });
  const linkOut = h('pre', { class: 'o-out', hidden: '' });
  const link = (e) => {
    e.preventDefault();
    const s = site.value.trim().replace(/\/?$/, '/');
    const w = who.value.trim();
    localStorage.setItem('fo.owner.site', site.value.trim());
    linkOut.hidden = false;
    linkOut.textContent =
      /^https?:\/\//.test(s) && /^0x[0-9a-fA-F]{40}$/.test(w)
        ? s + 'start.html?ref=' + w
        : "Give the site's address and a wallet address.";
  };
  const terms = (c) =>
    (c.days ? c.days + ' days on each machine' : 'No limit on a machine') +
    (c.until ? ' · accepted until ' + c.until : ' · no end date') +
    (c.referrer ? ' · referrer ' + c.referrer.slice(0, 6) + '…' + c.referrer.slice(-4) : '');
  return card(
    h('h2', null, 'Codes'),
    h(
      'p',
      { class: 'muted' },
      'A code opens ' +
        (status.tiers.length === 1 ? status.tiers[0].name : 'a plan') +
        ' on the machine it is typed into. No wallet, no payment.',
    ),
    h(
      'form',
      { class: 'code-maker', onsubmit: make },
      cap('Call it', label),
      status.tiers.length > 1
        ? cap(
            'Opens',
            seg(
              'tier',
              status.tiers.map((x) => [x.id, x.name]),
              'Opens',
            ),
            'div',
          )
        : null,
      cap('Lasts, on each machine', seg('days', LASTS, 'Lasts, on each machine'), 'div'),
      cap('Accepted until', until),
      h('button', { class: 'btn primary', type: 'submit' }, 'Make a code'),
    ),
    h(
      'p',
      { class: 'muted small' },
      'For yourself: No limit, and leave the date empty. To hand out: give it an end date, because a code cannot be capped or taken back.',
    ),
    h(
      'details',
      { class: 'o-more' },
      h('summary', null, 'More: a referrer, or your own wording'),
      h(
        'div',
        { class: 'o-two' },
        cap(
          "Referrer's wallet",
          h('input', {
            type: 'text',
            placeholder: '0x…',
            autocomplete: 'off',
            spellcheck: 'false',
            value: draft.referrer,
            oninput: keep('referrer'),
          }),
        ),
        cap(
          'Your own wording',
          h('input', {
            type: 'text',
            placeholder: 'Leave empty and a strong one is made',
            autocomplete: 'off',
            autocapitalize: 'characters',
            spellcheck: 'false',
            'data-1p-ignore': '',
            'data-lpignore': 'true',
            value: draft.own,
            oninput: keep('own'),
          }),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        'A short wording of your own can be found by trying, since its hash ships with the app. That is fine for a code you mean to hand out.',
      ),
    ),
    lastCode
      ? h(
          'div',
          { class: 'o-code' },
          h(
            'strong',
            null,
            lastCode.typed
              ? 'Made: "' + lastCode.label + '", with the wording you typed.'
              : '"' + lastCode.label + '" is made. This is the only time the code is shown.',
          ),
          lastCode.typed
            ? lastCode.weak
              ? h('span', { class: 'muted' }, 'It is short, so it could be found by trying.')
              : null
            : h('code', null, lastCode.code),
          h(
            'div',
            { class: 'row' },
            lastCode.typed ? null : copyBtn(() => lastCode.code, 'Copy the code'),
            h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: () => {
                  lastCode = null;
                  paint();
                },
              },
              lastCode.typed ? 'Done' : 'I have it',
            ),
          ),
        )
      : null,
    status.codes.length
      ? h(
          'ul',
          { class: 'code-list' },
          status.codes.map((c) =>
            h(
              'li',
              null,
              h(
                'span',
                { class: 't' },
                h('strong', null, c.label),
                h('span', null, (status.tiers.length > 1 ? c.tier + ' · ' : '') + terms(c)),
              ),
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: () =>
                    run(
                      () => post('/codes/remove', { label: c.label }),
                      'Removed. It stops working on a machine once that machine updates.',
                    ),
                },
                'Remove',
              ),
            ),
          ),
        )
      : h('p', { class: 'empty' }, 'No codes yet.'),
    h('h3', null, 'A referral link'),
    h(
      'form',
      { class: 'code-maker link', onsubmit: link },
      cap('Your site', site),
      cap('Their wallet', who),
      h('button', { class: 'btn', type: 'submit' }, 'Make the link'),
    ),
    linkOut,
    h(
      'p',
      { class: 'muted small' },
      'The link remembers who sent the visitor and names them at the checkout. They are paid a share only if the lock has a referrer fee.',
    ),
  );
}

function locksCard() {
  const row = (tier) => {
    const input = h('input', {
      type: 'text',
      value: status.locks[tier],
      placeholder: '0x… the ' + tier + ' lock on ' + status.chain,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const rep = (locks || []).find((x) => x.tier === tier);
    return h(
      'div',
      { class: 'grid' },
      h(
        'div',
        { class: 'o-line' },
        h('b', null, tier),
        input,
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () =>
              run(async () => {
                await post('/locks', { [tier]: input.value.trim() });
                locks = null;
              }, 'Saved.'),
          },
          'Save',
        ),
      ),
      !rep
        ? status.locks[tier]
          ? h('p', { class: 'muted small' }, 'Reading it from ' + status.chain + '…')
          : null
        : !rep.set
          ? h('p', { class: 'muted small' }, 'No lock set: this tier is not on sale.')
          : rep.error
            ? h('p', { class: 'o-warn' }, rep.error)
            : h(
                'div',
                { class: 'grid' },
                h(
                  'p',
                  { class: 'o-facts' },
                  h('span', null, h('b', null, rep.name || 'Unnamed')),
                  h('span', null, h('b', null, rep.price), rep.days ? ' for ' + rep.days + ' days' : ''),
                  h('span', null, h('b', null, String(rep.sold == null ? '?' : rep.sold)), ' sold'),
                  rep.held ? h('span', null, h('b', null, rep.held), ' waiting in the lock') : null,
                  h('a', { href: rep.explorer, target: '_blank', rel: 'noopener' }, 'See it on the explorer'),
                ),
                ...(rep.warn || []).map((w) => h('p', { class: 'o-warn' }, w)),
              ),
    );
  };
  return card(
    h('h2', null, 'Locks'),
    h(
      'p',
      { class: 'muted' },
      'Each paid tier is an Unlock lock on ' +
        status.chain +
        '. Paste its address and it is read live: what it sells, how many it has sold, what is waiting in it, and anything worth a second look. Nothing here can change a lock or move what is in it; that is done from your wallet, in Unlock.',
    ),
    ...status.tiers.map((x) => row(x.id)),
    h(
      'div',
      null,
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            locks = null;
            load();
          },
        },
        'Read them again',
      ),
    ),
  );
}

function githubCard() {
  const input = h('input', {
    type: 'text',
    value: status.githubClientId,
    placeholder: 'The Client ID of your GitHub OAuth App',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  return card(
    h('h2', null, 'GitHub sign-in'),
    h(
      'p',
      { class: 'muted' },
      status.githubClientId
        ? 'Customers can sign in to GitHub from the Workspace page.'
        : 'Not set up: customers can only use a GitHub sign-in already on their machine (the gh command).',
    ),
    h(
      'div',
      { class: 'o-line' },
      h('b', null, 'Client ID'),
      input,
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () =>
            run(
              () => post('/github', { clientId: input.value.trim() }),
              'Saved. Build the bundle and publish for customers to get it.',
            ),
        },
        'Save',
      ),
    ),
    h(
      'p',
      { class: 'muted small' },
      'To get one: on GitHub, Settings, Developer settings, OAuth Apps, New OAuth App. Any homepage and callback address will do. On the app\'s page tick "Enable Device Flow", then copy its Client ID here. There is no secret to copy: the sign-in this uses needs none, and a Client ID is public.',
    ),
  );
}

function walletCard() {
  const input = h('input', {
    type: 'text',
    placeholder: "0x… a customer's wallet",
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const check = (e) => {
    e.preventDefault();
    run(async () => {
      walletSaid = await post('/wallet', { address: input.value.trim() });
    });
  };
  return card(
    h('h2', null, 'Check a wallet'),
    h(
      'p',
      { class: 'muted' },
      'For when a customer says their plan is not working: what their wallet holds, read from the chain.',
    ),
    h(
      'form',
      { class: 'o-line', onsubmit: check },
      h('b', null, 'Wallet'),
      input,
      h('button', { class: 'btn small', type: 'submit' }, 'Check'),
    ),
    walletSaid
      ? h(
          'ul',
          { class: 'rows wrap-text' },
          walletSaid.plans.length
            ? walletSaid.plans.map((p) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'tag ' + (p.holds ? 'ok' : '') }, p.tier),
                  h(
                    'span',
                    { class: 't' },
                    h(
                      'strong',
                      null,
                      p.error ? 'Could not be read: ' + p.error : p.holds ? 'Holds a valid key' : 'No valid key',
                    ),
                    h('span', null, p.until ? 'Runs out ' + when(p.until) : ''),
                  ),
                  h('span', null, ''),
                ),
              )
            : h(
                'li',
                null,
                h('span', null, ''),
                h('span', { class: 't' }, 'No lock is set, so there is nothing to hold.'),
                h('span', null, ''),
              ),
        )
      : null,
  );
}

// THE BUNDLE CARD. Building is also when the landing page gets its next READING (js/pulse.js: one day in the owner's system). The
// day's counts are typed here, or are already filled in when pulse-today.json has been left beside the app, and the one button adds
// the reading and then builds. With the counts left empty it builds without a new reading, and says so.
const READS = [
  ['proofsDay', 'Proofs run that day'],
  ['judges', 'Judges on file'],
  ['measures', 'Measures'],
  ['memories', 'Memories'],
  ['links', 'Links between them'],
  ['commits90', 'Commits, last 90 days'],
  ['resetsWeek', 'Resets, last 7 days'],
  ['shed', 'Shed at a reset, %'],
];
const todayIs = () => {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
};
const dayWords = (d) =>
  new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const reading = { date: todayIs(), from: '' };
const typed = () => READS.some(([k]) => String(reading[k] || '').trim());
function shipCard() {
  const dist = status.dist;
  const test = status.test;
  const pulse = status.pulse;
  const last = pulse && pulse.last;
  const isIn = !!last && last.date >= todayIs();
  if (pulse && pulse.today && reading.from !== pulse.today.date && !typed()) {
    reading.date = pulse.today.date;
    reading.from = pulse.today.date;
    for (const [k] of READS) reading[k] = String(pulse.today[k]);
  } // counts left beside the app: filled in once, still yours to read before they go in
  const buildBtn = h('button', { class: 'btn primary', type: 'button', id: 'build', disabled: building });
  const label = () => {
    buildBtn.textContent = building
      ? 'Building…'
      : pulse && !isIn && typed()
        ? 'Add the reading and build'
        : 'Build the bundle';
  };
  label();
  buildBtn.onclick = async () => {
    let r = null;
    if (pulse && !isIn && typed()) {
      const missing = READS.filter(([k]) => !/^\d+$/.test(String(reading[k] || '').replace(/[\s,]/g, ''))).map(
        ([, name]) => name,
      );
      if (missing.length)
        return say(
          'A reading needs every count as a whole number, or none at all. Still to give: ' + missing.join(', ') + '.',
          true,
        );
      r = {
        date: reading.date,
        ...Object.fromEntries(READS.map(([k]) => [k, String(reading[k]).replace(/[\s,]/g, '')])),
      };
    }
    building = true;
    paint();
    await run(
      async () => {
        const out = await post('/bundle', r ? { reading: r } : {});
        if (r) {
          for (const [k] of READS) reading[k] = '';
          reading.from = r.date;
        }
        if (!out.ok) throw new Error((r ? 'The reading went in, but the bundle did not build: ' : '') + out.said);
      },
      r
        ? 'The reading for ' +
            dayWords(r.date) +
            ' is on the landing page and the bundle is built. Pin dist/ to publish it.'
        : isIn || !pulse
          ? 'Bundle built. Pin dist/ to publish it.'
          : 'Bundle built without a new reading: the landing page still shows ' +
            (last ? dayWords(last.date) : 'no day') +
            '. Pin dist/ to publish it.',
    );
    building = false;
    paint();
  };
  const count = ([k, name]) =>
    cap(
      name,
      h('input', {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        'data-count': k,
        value: reading[k] || '',
        placeholder: last ? last[k].toLocaleString('en-US') + ' last time' : '',
        oninput: (e) => {
          reading[k] = e.target.value;
          label();
        },
      }),
    );
  const block = !pulse
    ? null
    : h(
        'div',
        { class: 'o-reading', id: 'reading' },
        h('h3', null, "The landing page's reading"),
        isIn
          ? h(
              'p',
              { class: 'muted' },
              'The reading for ' +
                dayWords(last.date) +
                ' is in' +
                (pulse.count > 1 ? ', ' + pulse.count + ' so far.' : '.') +
                ' The next one can go in tomorrow.',
            )
          : [
              h(
                'p',
                { class: 'muted' },
                'The landing page shows one day in your system, and what has grown since the reading before. ' +
                  (last
                    ? 'The last reading is ' +
                      dayWords(last.date) +
                      (pulse.count > 1 ? ', ' + pulse.count + ' so far' : ', the only one so far') +
                      '. '
                    : '') +
                  "Give the day's counts and they go in when you build. Leave them empty to build without a new reading.",
              ),
              pulse.today && reading.from === pulse.today.date && typed()
                ? h(
                    'p',
                    { class: 'o-facts' },
                    h('span', { class: 'tag ok' }, 'Filled from ' + pulse.file),
                    h('span', null, 'Read them over before you build.'),
                  )
                : null,
              h(
                'div',
                { class: 'o-counts' },
                cap(
                  'The day',
                  h('input', {
                    type: 'date',
                    value: reading.date,
                    min: last ? last.date : '',
                    max: todayIs(),
                    oninput: (e) => {
                      reading.date = e.target.value;
                    },
                  }),
                ),
                READS.map(count),
              ),
            ],
      );
  return card(
    h('h2', null, 'Bundle and checks'),
    h(
      'p',
      { class: 'o-facts' },
      dist.built
        ? h('span', null, 'Bundle ', h('b', null, dist.version), ', ' + dist.files + ' files, built ' + when(dist.at))
        : h('span', null, 'No bundle built yet.'),
      dist.built && dist.stale
        ? h('span', { class: 'tag warn' }, 'The source has changed since')
        : dist.built
          ? h('span', { class: 'tag ok' }, 'Up to date')
          : null,
    ),
    h(
      'p',
      { class: 'o-facts' },
      test.running
        ? h('span', null, 'The self-test is running (it takes a few minutes)…')
        : test.passed == null
          ? h('span', null, 'The self-test has not been run in this session.')
          : h(
              'span',
              null,
              'Self-test: ',
              h('b', null, test.passed + ' passed'),
              test.failed ? ', ' : '',
              test.failed ? h('b', null, test.failed + ' FAILED') : '',
              ', ' + when(test.at),
            ),
    ),
    test.failed && test.tail ? h('pre', { class: 'o-out' }, test.tail) : null,
    block,
    h(
      'div',
      { class: 'row' },
      buildBtn,
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          disabled: test.running,
          onclick: () => run(() => post('/selftest'), 'The self-test has started.'),
        },
        test.running ? 'Self-test running…' : 'Run the self-test',
      ),
    ),
    h('p', { class: 'muted small' }, 'Building writes dist/. A reading is added, never edited.'),
  );
}

// PIN THE BUNDLE with Pinata. The key is given once and kept on this machine; one button sends dist/ as it stands; what comes back
// is the address the name is pointed at.
let pinDraft = { jwt: '', gateway: null, ens: null };
let pinningNow = false;
let publishing = false;
// POINT THE ENS NAME AT THE BUNDLE, signed in this browser's own wallet. The runner works out what is to be written; the wallet reads
// the name's resolver from the ENS registry, shows the one transaction, and the owner confirms it there. This page signs nothing.
const short = (a) => String(a).slice(0, 6) + '…' + String(a).slice(-4);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const bytesOf = (ret) => {
  const x = String(ret || '').slice(2);
  if (x.length < 128) return '0x';
  const n = parseInt(x.slice(64, 128), 16);
  return '0x' + x.slice(128, 128 + n * 2);
};
async function pointName(plan) {
  const wallet = window.ethereum;
  if (!wallet)
    throw new Error(
      'No wallet was found in this browser. Open this page in the browser that has your wallet, then press "Point ' +
        plan.name +
        ' at it".',
    );
  say('Asking your wallet which account to use…');
  const [from] = await wallet.request({ method: 'eth_requestAccounts' });
  if ((await wallet.request({ method: 'eth_chainId' })) !== plan.chainId) {
    say('Asking your wallet to switch to Ethereum…');
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: plan.chainId }] });
  }
  const found = await wallet.request({
    method: 'eth_call',
    params: [{ to: plan.registry, data: plan.resolverCall }, 'latest'],
  });
  const resolver = '0x' + String(found).slice(-40);
  if (!/^0x[0-9a-f]{40}$/i.test(resolver) || /^0x0{40}$/.test(resolver))
    throw new Error(
      plan.name + ' has no resolver set, so there is nowhere to write the address. Set one in the ENS app first.',
    );
  const read = async () =>
    bytesOf(
      await wallet
        .request({ method: 'eth_call', params: [{ to: resolver, data: plan.readCall }, 'latest'] })
        .catch(() => '0x'),
    ).toLowerCase();
  if ((await read()) === plan.contenthash) {
    await post('/ens/done', { name: plan.name, cid: plan.cid, tx: '' });
    return 'already';
  }
  try {
    await wallet.request({ method: 'eth_estimateGas', params: [{ from, to: resolver, data: plan.setData }] });
  } catch (e) {
    throw new Error(
      'The account ' +
        short(from) +
        ' cannot change ' +
        plan.name +
        ': ' +
        String((e && e.message) || e).slice(0, 140) +
        '. Use the wallet account that manages the name.',
    );
  }
  say('Confirm it in your wallet: ' + plan.name + ' will point at ' + plan.address + '.');
  let tx;
  try {
    tx = await wallet.request({ method: 'eth_sendTransaction', params: [{ from, to: resolver, data: plan.setData }] });
  } catch (e) {
    if (e && e.code === 4001)
      throw new Error(
        'You declined it in the wallet. The bundle is pinned: press "Point ' +
          plan.name +
          ' at it" when you are ready.',
      );
    throw e;
  }
  say('Sent. Waiting for Ethereum to include it…');
  let rc = null;
  for (let i = 0; i < 90 && !rc; i++) {
    await pause(i < 5 ? 1000 : 4000);
    rc = await wallet.request({ method: 'eth_getTransactionReceipt', params: [tx] }).catch(() => null);
  }
  if (!rc) throw new Error('The transaction ' + tx + ' was sent but is not included yet. Look at it in your wallet.');
  if (rc.status !== '0x1') throw new Error('The transaction ' + tx + ' failed on chain. Nothing was changed.');
  if ((await read()) !== plan.contenthash)
    throw new Error('The transaction went through, but the name does not read back as the new address yet.');
  await post('/ens/done', { name: plan.name, cid: plan.cid, tx });
  return tx;
}
const pointed = (r, plan) =>
  r === 'already'
    ? plan.name + ' already points at this bundle.'
    : 'Done. ' + plan.name + ' points at ' + plan.address + '.';
async function publishAll() {
  publishing = true;
  paint();
  try {
    say('Building the bundle and sending it to Pinata…');
    const out = await post('/publish', {});
    if (!out.ok) throw new Error(out.said);
    if (!out.ens)
      say(
        'Bundle ' +
          out.pin.version +
          ' is built and pinned. Give your ENS name here and your wallet can point it at the address.',
      );
    else say('Bundle ' + out.pin.version + ' is built and pinned. ' + pointed(await pointName(out.ens), out.ens));
  } catch (e) {
    say(String((e && e.message) || e), true);
  }
  publishing = false;
  await load();
}
async function pointOnly() {
  publishing = true;
  paint();
  try {
    const plan = await post('/ens/plan', {});
    say(pointed(await pointName(plan), plan));
  } catch (e) {
    say(String((e && e.message) || e), true);
  }
  publishing = false;
  await load();
}
function pinCard() {
  const dist = status.dist;
  const pinState = status.pin || {};
  const last = pinState.last;
  const addr = last ? 'ipfs://' + last.cid : '';
  const key = h('input', {
    type: 'password',
    id: 'pin-key',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: pinState.hasKey
      ? 'Saved, ending ' + pinState.ends + '. Paste another to replace it'
      : 'Paste your Pinata JWT',
    value: pinDraft.jwt,
    oninput: (e) => {
      pinDraft.jwt = e.target.value;
    },
  });
  const gatewayBox = h('input', {
    type: 'text',
    id: 'pin-gateway',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'fun-llama-300.mypinata.cloud',
    value: pinDraft.gateway == null ? pinState.gateway || '' : pinDraft.gateway,
    oninput: (e) => {
      pinDraft.gateway = e.target.value;
    },
  });
  const ens = h('input', {
    type: 'text',
    id: 'pin-ens',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'yourname.eth',
    value: pinDraft.ens == null ? pinState.ens || '' : pinDraft.ens,
    oninput: (e) => {
      pinDraft.ens = e.target.value;
    },
  });
  const save = () => {
    const body = {};
    if (pinDraft.jwt.trim()) body.jwt = pinDraft.jwt.trim();
    if (pinDraft.gateway != null) body.gateway = pinDraft.gateway.trim();
    if (pinDraft.ens != null) body.ens = pinDraft.ens.trim();
    if (!Object.keys(body).length) return say('Paste a key or give a gateway first.', true);
    run(
      async () => {
        const r = await post('/pinata', body);
        pinDraft = { jwt: '', gateway: null, ens: null };
        if (r.note) throw new Error(r.note);
      },
      body.jwt ? 'Pinata accepted the key. It is kept on this machine only.' : 'Saved.',
    );
  };
  const all = h(
    'button',
    {
      class: 'btn primary',
      type: 'button',
      id: 'publish-go',
      disabled: publishing || pinningNow || !pinState.hasKey,
      onclick: publishAll,
    },
    publishing ? 'Working…' : pinState.ens ? 'Build, pin and point ' + pinState.ens : 'Build and pin',
  );
  const point =
    pinState.ens && last
      ? h(
          'button',
          { class: 'btn', type: 'button', id: 'ens-go', disabled: publishing || pinningNow, onclick: pointOnly },
          'Point ' + pinState.ens + ' at it',
        )
      : null;
  const pin = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      id: 'pin-go',
      disabled: publishing || pinningNow || !pinState.hasKey || !dist.built,
    },
    pinningNow
      ? 'Pinning…'
      : dist.built && dist.stale
        ? 'Pin bundle ' + dist.version + ' as it stands'
        : 'Pin bundle ' + (dist.version || ''),
  );
  pin.onclick = async () => {
    pinningNow = true;
    paint();
    await run(() => post('/pin', { stale: !!dist.stale }), 'Pinned. The address is below.');
    pinningNow = false;
    paint();
  };
  return card(
    h('h2', null, 'Publish the bundle'),
    h(
      'p',
      { class: 'o-facts' },
      pinState.from === 'env'
        ? h('span', { class: 'tag ok' }, 'Key from PINATA_JWT')
        : pinState.hasKey
          ? h('span', { class: 'tag ok' }, 'Key saved, ending ' + pinState.ends)
          : h('span', { class: 'tag warn' }, 'No Pinata key yet'),
      dist.built && dist.stale
        ? h('span', { class: 'tag warn' }, 'The source has changed since the bundle was built')
        : null,
    ),
    h(
      'div',
      { class: 'o-form' },
      pinState.from === 'env'
        ? null
        : field(
            'Pinata key (JWT)',
            key,
            'Kept in a file on this machine that only you can read. Never in the source or the bundle.',
          ),
      field('Your gateway', gatewayBox, 'Optional. With it, the pin is read back and checked.'),
      field('Your ENS name', ens, 'Optional. With it, your wallet is asked to point the name at each new bundle.'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', type: 'button', id: 'pin-save', onclick: save }, 'Save'),
        pinState.from === 'saved'
          ? h(
              'button',
              {
                class: 'btn',
                type: 'button',
                id: 'pin-forget',
                onclick: () => run(() => post('/pinata/forget'), 'The key is removed from this machine.'),
              },
              'Forget the key',
            )
          : null,
      ),
    ),
    last
      ? h(
          'div',
          { class: 'o-pin', id: 'pin-last' },
          h(
            'p',
            { class: 'o-facts' },
            h(
              'span',
              null,
              'Bundle ',
              h('b', null, last.version),
              ' pinned ' +
                when(last.at) +
                ', ' +
                last.files +
                ' files' +
                (last.again ? ' (Pinata already had it)' : ''),
            ),
            last.version === dist.version
              ? h('span', { class: 'tag ok' }, 'The bundle that is built')
              : h('span', { class: 'tag warn' }, 'An older bundle'),
            pinState.ensLast && pinState.ensLast.cid === last.cid
              ? h('span', { class: 'tag ok', id: 'ens-points' }, pinState.ensLast.name + ' points at it')
              : pinState.ens
                ? h('span', { class: 'tag warn', id: 'ens-points' }, pinState.ens + ' does not point at it yet')
                : null,
            last.served === 'yes'
              ? h('span', { class: 'tag ok' }, 'Served by your gateway')
              : last.served === 'no'
                ? h('span', { class: 'tag warn' }, 'Your gateway did not serve this bundle')
                : last.served === 'unreached'
                  ? h('span', { class: 'tag warn' }, 'Your gateway did not answer')
                  : null,
          ),
          h(
            'div',
            { class: 'o-line' },
            h('b', null, 'Address'),
            h('code', { id: 'pin-cid' }, addr),
            copyBtn(() => addr),
          ),
          pinState.gateway
            ? h(
                'p',
                null,
                h(
                  'a',
                  {
                    href: 'https://' + pinState.gateway + '/ipfs/' + last.cid + '/',
                    target: '_blank',
                    rel: 'noopener',
                  },
                  'Open it through your gateway',
                ),
              )
            : null,
        )
      : null,
    h('div', { class: 'row' }, all, pin, point),
    h(
      'p',
      { class: 'muted small' },
      'One press builds dist/, sends it to Pinata, and asks the wallet in this browser to point the name at the new address: one transaction on Ethereum, which you confirm there and which costs gas. Nothing is signed by this page.',
    ),
  );
}

// THE REMOTE TAB, on or off for this version of the product, like the billing switch
function remoteCard() {
  const on = !status.product || status.product.remote !== false;
  return card(
    h('h2', null, 'Remote tab'),
    h(
      'p',
      { class: 'muted', id: 'remote-state' },
      on
        ? 'Remote is ON: customers see the Remote tab and can reach their team from their own phone.'
        : 'Remote is OFF: there is no Remote tab, no phone can be paired, and the phone link does not listen.',
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn ' + (on ? '' : 'primary'),
          type: 'button',
          id: 'remote-toggle',
          onclick: () =>
            run(
              () => post('/remote', { on: !on }),
              on
                ? 'Remote is off for this running copy. Build the bundle and publish for it to reach customers.'
                : 'Remote is on for this running copy. Build the bundle and publish for it to reach customers.',
            ),
        },
        on ? 'Switch Remote off' : 'Switch Remote on',
      ),
    ),
    h(
      'p',
      { class: 'muted small' },
      'This edits js/product.js. This running copy follows it at once (an app page that is open follows when it is reloaded); customers follow it when you build and publish.',
    ),
  );
}

function paint() {
  panel.replaceChildren(
    billingCard(),
    remoteCard(),
    codesCard(),
    locksCard(),
    githubCard(),
    walletCard(),
    shipCard(),
    pinCard(),
  );
}
load();
