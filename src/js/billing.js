// billing.js - TIERS BY REACH, in one place, read by the pages and the runner.
// What is free is what costs us nothing and proves the product: a whole team on your own Claude Code.
// What is paid is local models: one we set up and keep for you, one you already run on this machine, and the ones on your other
// machines. That is Pro.
// There are two tiers and no more: Free and Pro.
// The Soul (rulings, Vision, Hindsight) is part of the system, for everyone. It is not sold and nothing about it is gated.
//
// A PLAN IS A KEY ON A LOCK. There is no server and no secret of ours anywhere. Each paid tier is an Unlock Protocol lock on Base: a
// customer buys a key (prepaid, in USDC, for the lock's own duration) and the key is a non-transferable NFT in their wallet. The app
// then checks two things, both without us: that the wallet signed for this machine (a signature, no transaction), and that the wallet
// holds a valid key on the lock (read from the chain through public endpoints). The price and the duration are READ FROM THE LOCK, so
// this file never states a price.
//
// NOTHING IS ENFORCED until `enforce` is true and at least one tier has its `lock` address. Until then every feature is open and the
// Plan page says so.
export const FEATURES = {
  claude: 'Your own Claude Code as the engine',
  managed_local: 'A local model set up and kept current for you',
  found_here: 'A model you already run on this machine',
  remote: 'Models on your other machines, found and reached over SSH',
};
export const BILLING = {
  enforce: false,
  chain: { id: 8453, name: 'Base', rpc: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'], explorer: 'https://basescan.org' },
  checkout: 'https://app.unlock-protocol.com/checkout',   // Unlock's own hosted checkout: the wallet, the approval and the purchase happen there, never in this app
  tiers: {
    free: { name: 'Free', blurb: 'A whole team on your own Claude Code.', features: ['claude'] },
    pro: { name: 'Pro', blurb: 'Local models, set up for you or already running, here or on your other machines.', features: ['claude', 'managed_local', 'found_here', 'remote'], lock: '' },   // 'Family Office Pro' on Base, created 2026-11-11
  },
  // ACCESS CODES. A code gives a tier on the machine it is typed into, for a number of days or until a date. Only a slow, salted HASH
  // of each code is here: the code itself is never in the repo or the bundle, so reading this file does not reveal one. Make them with
  // "node tools/make-code.mjs" (it writes the entry below and shows the code once). What a code cannot do, with no server: be limited
  // to a number of uses, or be taken back from a copy of the app that is never updated. So give each one an end date.
  codes: [
  ],
};
export const TIERS = Object.keys(BILLING.tiers);   // lowest first
export const tierWith = (feature) => TIERS.find((t) => BILLING.tiers[t].features.includes(feature)) || TIERS[TIERS.length - 1];
// the address of Unlock's checkout for one lock, coming back to `back` afterwards
// referrer: a wallet address that brought the buyer. Unlock records it with the purchase, and pays it a share if the lock has a referrer fee set.
export const checkoutUrl = (lock, title, back, referrer, b = BILLING) => b.checkout + '?paywallConfig=' + encodeURIComponent(JSON.stringify({ title, pessimistic: true, ...(/^0x[0-9a-fA-F]{40}$/.test(referrer || '') ? { referrer } : {}), locks: { [lock]: { network: b.chain.id } } })) + (back ? '&redirectUri=' + encodeURIComponent(back) : '');
