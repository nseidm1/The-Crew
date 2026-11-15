// plan-panel.js - THE PLAN, as one panel. It is shown in two places and is the same thing in both: the Plan page of the app, and the
// Plan step of Start your team, because a plan can be taken (or a code typed) before a team is started. What is free costs us nothing
// and proves the product; what is paid is what we set up, keep, or reach for the customer.
//   A plan is a key on a lock on Base, in the customer's own wallet. Buying happens on Unlock's own checkout, never in this app; here
//   the wallet only SIGNS, to say that it is the customer's and that the plan may be used on this machine. A code opens a plan on this
//   machine with no wallet at all. The runner checks all of it; this panel only shows what the runner says and passes on what is typed.
import { h } from './ui.js';
import { BILLING, FEATURES, TIERS, checkoutUrl } from './billing.js';

export const referrer = () => {
  try {
    return localStorage.getItem('familyoffice.ref') || '';
  } catch {
    return '';
  }
};
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const day = (t) => new Date(t).toLocaleDateString();

// is the plan in force a paid one? (false while billing is off: then nothing is being sold)
export const onPaid = (lic) => !!lic && lic.enforce && lic.tier !== 'free';
// may this machine use the feature? While billing is off, or before the runner has answered, nothing is held back.
export const planAllows = (lic, feature) => !lic || !lic.enforce || lic.features.includes(feature);
// the plan in force, as the parts of one sentence
export function planSentence(lic) {
  if (!lic || !lic.enforce) return ['Billing is not switched on yet, so everything is open.'];
  return [
    'You are on ',
    h('strong', null, lic.name),
    lic.until ? ' until ' + day(lic.until) : '',
    lic.code && lic.code.label
      ? ', through the code "' + lic.code.label + '"'
      : lic.wallet
        ? ', with the wallet ' + short(lic.wallet)
        : '',
    '.',
    lic.why ? ' ' + lic.why[0].toUpperCase() + lic.why.slice(1) + '.' : '',
  ];
}
// the first paid tier and what it costs, when the lock could be read: { id, name, price, days }
export function paidOffer(lic) {
  const id = TIERS.find((x) => x !== 'free');
  const o = id && lic && lic.offers && lic.offers[id];
  return id
    ? {
        id,
        name: BILLING.tiers[id].name,
        blurb: BILLING.tiers[id].blurb,
        price: (o && o.price) || '',
        days: (o && o.days) || 0,
      }
    : null;
}

// GET THE PAID PLAN WITH THE WALLET IN THIS BROWSER, in place: no other page. In order, each one confirmed by the customer in the wallet:
//   connect        the wallet says which account
//   sign           one message naming this machine (a signature, not a transaction), unless that wallet already signed for it
//   pay            only if that wallet holds no key: switch to the lock's chain, allow the lock to take exactly the price, buy the key
// The transactions are worked out by the runner on this machine from the lock itself (runner/license.mjs quote) and SENT BY THE WALLET;
// this page never holds a key. say(text) reports each step. It answers { ok, had, none, why }: had = the wallet already held the plan,
// none = there is no wallet in this browser.
const hexOf = (text) =>
  '0x' +
  Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function buyWithWallet({ runner, say }) {
  const eth = window.ethereum;
  if (!eth)
    return {
      ok: false,
      none: true,
      why: 'No wallet was found in this browser. Open this page in the browser where your wallet is (MetaMask, Rabby, Coinbase Wallet).',
    };
  let sending = false;
  try {
    say('Waiting for your wallet to connect…');
    const [addr] = await eth.request({ method: 'eth_requestAccounts' });
    if (!addr) return { ok: false, why: 'The wallet gave no account.' };
    let lic = await runner.license();
    if (!lic.enforce) return { ok: false, why: 'Billing is not switched on, so there is nothing to buy.' };
    if (!lic.wallet || lic.wallet.toLowerCase() !== addr.toLowerCase()) {
      say(
        "Sign the message in your wallet. It says this wallet's plan may be used on this machine. It is a signature, not a transaction.",
      );
      lic = await runner.bindWallet(
        lic.message,
        await eth.request({ method: 'personal_sign', params: [hexOf(lic.message), addr] }),
      );
    }
    if (onPaid(lic)) return { ok: true, had: true };
    say('Reading the price from the lock…');
    const quote = await runner.buyPlan(addr, referrer());
    if (quote.held) {
      for (let n = 0; n < 6; n++) {
        if (onPaid(await runner.recheck())) return { ok: true, had: true };
        await pause(1500);
      }
      return {
        ok: false,
        why: 'That wallet holds a key, but it could not be read yet. Press it again in a minute: it will not charge twice.',
      };
    }
    if (quote.short)
      return {
        ok: false,
        why:
          'That wallet holds ' +
          quote.have +
          ' on ' +
          quote.chain.name +
          ', and ' +
          quote.name +
          ' costs ' +
          quote.price +
          '. Add ' +
          quote.symbol +
          ' on ' +
          quote.chain.name +
          ' to it, then press it again. Nothing was sent.',
      };
    const onChain = async () => String(await eth.request({ method: 'eth_chainId' })).toLowerCase() === quote.chain.hex;
    if (!(await onChain())) {
      say('Your wallet will ask to switch to ' + quote.chain.name + '.');
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: quote.chain.hex }] });
      } catch (e) {
        if (!e || e.code !== 4902) throw e;
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: quote.chain.hex,
              chainName: quote.chain.name,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: quote.chain.rpc,
              blockExplorerUrls: quote.chain.explorer ? [quote.chain.explorer] : [],
            },
          ],
        });
      }
      if (!(await onChain()))
        return { ok: false, why: 'The wallet is not on ' + quote.chain.name + ', so nothing was sent.' };
    }
    for (let i = 0; i < quote.txs.length; i++) {
      const tx = quote.txs[i];
      const step = 'Step ' + (i + 1) + ' of ' + quote.txs.length;
      say(step + ': ' + tx.what + '. Confirm it in your wallet.');
      sending = true;
      const hash = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: addr, to: tx.to, data: tx.data, value: tx.value }],
      });
      sending = false;
      say(step + ' is sent. Waiting for ' + quote.chain.name + ' to confirm it…');
      let rc = null;
      for (let n = 0; n < 90 && !rc; n++) {
        await pause(n ? 2000 : 600);
        rc = await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
      }
      if (!rc)
        return {
          ok: false,
          why:
            step +
            ' was sent but ' +
            quote.chain.name +
            ' has not confirmed it yet. Give it a minute, then press it again: nothing is charged twice.',
        };
      if (Number(rc.status) !== 1)
        return { ok: false, why: quote.chain.name + ' turned ' + step.toLowerCase() + ' down, so nothing was bought.' };
    }
    say('Paid. Reading your key from ' + quote.chain.name + '…');
    for (let n = 0; n < 10; n++) {
      if (onPaid(await runner.recheck())) return { ok: true };
      await pause(1500);
    }
    return {
      ok: false,
      why: 'The purchase is confirmed, but the key could not be read yet. Give it a minute, then press it again: it will not charge twice.',
    };
  } catch (e) {
    return {
      ok: false,
      why:
        (e && e.code === 4001
          ? 'You declined it in your wallet. Nothing more was sent.'
          : 'It stopped: ' + String((e && e.message) || e).slice(0, 160)) +
        (sending && !(e && e.code === 4001)
          ? ' A purchase on Base also needs a little ETH on Base for the network fee.'
          : ''),
    };
  }
}

// lic      what the runner says about the plan on this machine (runner.license()), or null
// said     the last thing to tell the customer, shown above the tiers
// back     where Unlock's checkout sends the customer when they have paid
// say(t)   show t now          changed(t)   something may have changed: read the plan again, then show t
// focus    'code' puts the cursor in the code box
export function planPanel({ lic, said, runner, back, say, changed, focus }) {
  const open = !lic || !lic.enforce;
  const mine = lic ? lic.tier : 'open';
  const offers = (lic && lic.offers) || {};
  const card = (cls, ...kids) => h('section', { class: 'plan-card glass flat ' + cls }, kids);
  const act = async (fn, done) => {
    let text = done;
    try {
      await fn();
    } catch (e) {
      text = String((e && e.message) || e);
    }
    changed(text);
  };
  const connect = async () => {
    if (!window.ethereum)
      return say(
        'No wallet was found in this browser. Open this page in the browser where your wallet is (MetaMask, Rabby, Coinbase Wallet).',
      );
    say('Waiting for your wallet. It will ask you to sign a message, not to send anything.');
    try {
      const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const hex =
        '0x' +
        Array.from(new TextEncoder().encode(lic.message))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      const sig = await window.ethereum.request({ method: 'personal_sign', params: [hex, addr] });
      await act(() => runner.bindWallet(lic.message, sig), 'Your wallet is connected to this machine.');
    } catch (e) {
      say('The wallet did not sign: ' + String((e && e.message) || e).slice(0, 160));
    }
  };
  const codeBox = h('input', {
    id: 'plan-code',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: 'A code',
    'aria-label': 'Access code',
    maxlength: '80',
  });
  if (focus === 'code' && !open)
    setTimeout(() => {
      if (codeBox.isConnected) {
        codeBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
        codeBox.focus({ preventScroll: true });
      }
    }, 60);
  return h(
    'div',
    { class: 'plan-panel' },
    h(
      'p',
      { class: 'plan-lede' },
      ...(open
        ? [
            'Billing is not switched on yet. Everything is open, and nothing on this page can charge you. This is how the plans will read.',
          ]
        : planSentence(lic)),
    ),
    said ? h('p', { class: 'plan-said', role: 'status' }, said) : null,
    h(
      'div',
      { class: 'plan-tiers' },
      TIERS.map((id) => {
        const tier = BILLING.tiers[id];
        const offer = offers[id];
        const cur = mine === id;
        return card(
          'tier' + (cur ? ' on' : ''),
          cur ? h('span', { class: 'plan-on' }, '✓ Your plan') : null,
          h('h2', null, tier.name),
          h(
            'p',
            { class: 'price' },
            id === 'free' ? 'No charge' : offer && offer.price ? offer.price : 'Not on sale yet',
            offer && offer.days ? h('span', null, ' for ' + offer.days + ' days') : null,
          ),
          h('p', { class: 'muted' }, tier.blurb),
          h(
            'ul',
            { class: 'feats' },
            Object.keys(FEATURES).map((f) => h('li', { class: tier.features.includes(f) ? 'yes' : 'no' }, FEATURES[f])),
          ),
          id === 'free'
            ? null
            : h(
                'p',
                { class: 'muted small' },
                'Paid ahead in USDC on ' +
                  BILLING.chain.name +
                  '. It does not renew by itself, and it cannot be transferred.',
              ),
          id === 'free' || !offer || !offer.price || open
            ? null
            : cur || !window.ethereum
              ? h(
                  'div',
                  { class: 'plan-acts' },
                  h(
                    'a',
                    {
                      class: 'btn primary',
                      id: 'plan-buy',
                      href: checkoutUrl(offer.lock, 'Family Office ' + tier.name, back, referrer()),
                      target: '_blank',
                      rel: 'noopener',
                    },
                    cur ? 'Add more time' : 'Get ' + tier.name,
                  ),
                  cur
                    ? null
                    : h(
                        'span',
                        { class: 'muted small' },
                        "No wallet was found in this browser, so this opens Unlock's checkout. When you have paid, connect that wallet below.",
                      ),
                )
              : h(
                  'div',
                  { class: 'plan-acts' },
                  h(
                    'button',
                    {
                      class: 'btn primary',
                      type: 'button',
                      id: 'plan-buy',
                      onclick: async () => {
                        const r = await buyWithWallet({ runner, say });
                        changed(
                          r.ok
                            ? (r.had ? 'That wallet already holds the plan. ' : 'Paid. ') +
                                tier.name +
                                ' is on for this machine.'
                            : r.why,
                        );
                      },
                    },
                    'Get ' + tier.name,
                  ),
                  h(
                    'span',
                    { class: 'muted small' },
                    'Your wallet asks you to confirm each step. Or pay on ',
                    h(
                      'a',
                      {
                        href: checkoutUrl(offer.lock, 'Family Office ' + tier.name, back, referrer()),
                        target: '_blank',
                        rel: 'noopener',
                      },
                      "Unlock's checkout",
                    ),
                    ' and connect that wallet below.',
                  ),
                ),
        );
      }),
    ),
    open
      ? null
      : card(
          lic.code ? 'on' : '',
          lic.code ? h('span', { class: 'plan-on' }, '✓ In use') : null,
          h('h2', null, 'Have a code?'),
          lic.code
            ? h(
                'div',
                { class: 'code-on' },
                h(
                  'p',
                  { class: 'muted' },
                  'This machine is using the code "' +
                    lic.code.label +
                    '"' +
                    (lic.code.until ? ', good until ' + day(lic.code.until) : '') +
                    '.',
                ),
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    id: 'code-remove',
                    onclick: () => act(() => runner.redeem(''), 'The code has been removed from this machine.'),
                  },
                  'Remove the code',
                ),
              )
            : h(
                'p',
                { class: 'muted' },
                'A code opens a plan on this machine for a while, with no wallet and no payment.',
              ),
          h(
            'form',
            {
              class: 'plan-field',
              onsubmit: (e) => {
                e.preventDefault();
                const v = codeBox.value.trim();
                if (v) act(() => runner.redeem(v), 'The code is in use on this machine.');
              },
            },
            codeBox,
            h('button', { class: 'btn', type: 'submit' }, 'Use this code'),
          ),
          null,
        ),
    open
      ? null
      : card(
          '',
          h('h2', null, 'Your wallet and this machine'),
          h(
            'p',
            { class: 'muted' },
            'A plan is a key in your own wallet. To use it here, the wallet signs one message that names this machine. That is a signature, not a transaction: it costs nothing and moves nothing. This app then reads ' +
              BILLING.chain.name +
              ' to see that the wallet holds a key. Nothing is sent to us, because there is no us to send it to.',
          ),
          h(
            'div',
            { class: 'plan-acts' },
            h(
              'button',
              { class: 'btn primary', type: 'button', onclick: connect },
              lic.wallet ? 'Connect a different wallet' : 'Connect my wallet',
            ),
            lic.wallet
              ? h(
                  'button',
                  {
                    class: 'btn',
                    type: 'button',
                    onclick: () => act(() => runner.recheck(), 'Read again from ' + BILLING.chain.name + '.'),
                  },
                  'I have paid: check again',
                )
              : null,
            lic.wallet
              ? h(
                  'button',
                  {
                    class: 'btn',
                    type: 'button',
                    onclick: () =>
                      act(
                        () => runner.release(),
                        'This machine has forgotten the wallet. The key in the wallet is untouched.',
                      ),
                  },
                  'Forget this wallet here',
                )
              : null,
          ),
        ),
  );
}
