// license.mjs - which tier this machine is on. There is no licence server and no secret: a plan is a key on an Unlock Protocol lock
// on Base, held by the customer's wallet (js/billing.js). Two things are checked, both here and both without us:
//   THE WALLET IS THE CUSTOMER'S   they sign one plain message that names THIS machine. A signature, not a transaction: no gas, no
//                                   funds, nothing sent. Who signed is recovered from the signature (chain.mjs) and kept with it.
//   THE WALLET HOLDS A VALID KEY    the lock is read through public RPC endpoints: getHasValidKey(address). The highest tier is asked
//                                   first. The key's expiry is read too, to say when the plan runs out.
// A good reading is remembered for two weeks, so a machine that is offline keeps its plan for that long; after that it is on Free.
// Nothing is deleted when it is. With billing not switched on (enforce: false, or no lock set) every feature is open.
// What this is and is not: a check on the customer's own machine. It stops casual copying, not someone who edits the app.
import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BILLING, FEATURES } from '../js/billing.js';
import { sh } from './host.mjs';
import { call, encode, isAddress, personalHash, recover, selector, uint } from './chain.mjs';

// the plans in force: what js/billing.js said when the app started, or what the owner's panel has changed it to since (owner.mjs)
let LIVE = BILLING;
export const useBilling = (b) => {
  if (b && b.tiers) LIVE = b;
};
export const billing = () => {
  let o = {};
  try {
    o = JSON.parse(process.env.FO_BILLING || '{}');
  } catch {
    /* not set */
  }
  return { ...LIVE, ...o };
};
const paid = (b) =>
  Object.keys(b.tiers)
    .reverse()
    .filter((t) => isAddress((b.tiers[t] || {}).lock)); // the tiers that are on sale, highest first
const enforced = (b = billing()) => !!(b.enforce && (paid(b).length || (b.codes || []).length));
// ACCESS CODES (js/billing.js codes). What is typed is normalised (case, spaces and dashes do not matter) and run through scrypt with the
// entry's own salt: slow on purpose, so the hashes that ship with the app cannot be searched quickly. The code itself is never stored.
const RANK = Object.fromEntries(Object.keys(BILLING.tiers).map((t, i) => [t, i]));
export const normalCode = (code) =>
  String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export const hashCode = (code, saltHex) =>
  scryptSync(normalCode(code), Buffer.from(saltHex, 'hex'), 32, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex');
const entryFor = (code, b) => {
  const n = normalCode(code);
  if (n.length < 6) return null;
  for (const e of b.codes || []) {
    try {
      if (timingSafeEqual(Buffer.from(hashCode(n, e.salt), 'hex'), Buffer.from(e.hash, 'hex'))) return e;
    } catch {
      /* a malformed entry */
    }
  }
  return null;
};
// is a redeemed code still good: it is still listed, its date has not passed, and its days on this machine have not run out
const grantOf = (got, b) => {
  const g = got.grant;
  const e = g && (b.codes || []).find((x) => x.hash === g.hash);
  if (!e || !RANK[e.tier]) return null;
  const ends = [e.until ? Date.parse(e.until) : Infinity, e.days ? g.at + e.days * 86400000 : Infinity].filter(
    (x) => !Number.isNaN(x),
  );
  const until = Math.min(...ends);
  return Date.now() < until
    ? { tier: e.tier, label: e.label || 'a code', until: until === Infinity ? null : until, referrer: e.referrer || '' }
    : null;
};
const GRACE = 14 * 86400000;

let mid = null;
export async function machineId() {
  // one stable name for this machine, hashed so the hardware id itself never leaves it
  if (mid) return mid;
  let raw = process.env.FO_MACHINE_ID || '';
  if (!raw && process.platform === 'darwin') {
    const r = await sh('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    raw = (/"IOPlatformUUID" = "([^"]+)"/.exec(r.out || '') || [])[1] || '';
  }
  if (!raw)
    raw = await readFile('/etc/machine-id', 'utf8').then(
      (x) => x.trim(),
      () => '',
    );
  if (!raw) raw = os.hostname() + ':' + os.userInfo().username;
  return (mid = createHash('sha256')
    .update('familyoffice:' + raw)
    .digest('hex')
    .slice(0, 32));
}
// the words a wallet signs. Plain, so the wallet shows the customer exactly what they are agreeing to.
export const messageFor = (machine) =>
  'Family Office: use my plan on this machine.\n\nThis is a signature, not a transaction. It costs nothing and moves nothing.\n\nMachine: ' +
  machine;
// who signed, if the message is the one for this machine
export const signerOf = (message, signature, machine) =>
  message === messageFor(machine) ? recover(personalHash(message), signature) : null;

// what a lock sells: read from the lock itself, so no price is ever written down here
export async function lockFacts(lock, b = billing()) {
  const rpc = b.chain.rpc;
  const [price, secs, token] = await Promise.all([
    call(rpc, lock, encode('keyPrice()')),
    call(rpc, lock, encode('expirationDuration()')),
    call(rpc, lock, encode('tokenAddress()')),
  ]);
  const erc20 = '0x' + token.slice(-40);
  const native = /^0x0{40}$/.test(erc20);
  const [dec, sym] = native
    ? ['0x12', null]
    : await Promise.all([
        call(rpc, erc20, encode('decimals()')),
        call(rpc, erc20, encode('symbol()')).catch(() => '0x'),
      ]);
  const symbol = native
    ? 'ETH'
    : Buffer.from((sym || '').slice(2), 'hex')
        .toString('utf8')
        .replace(/[^\x20-\x7e]/g, '')
        .trim() || 'tokens';
  const d = Number(uint(dec));
  const whole = uint(price);
  const amount = Number(whole) / 10 ** d;
  const days = Number(uint(secs)) / 86400;
  return {
    lock,
    price: (amount % 1 ? amount.toFixed(2) : String(amount)) + ' ' + symbol,
    days: days > 36500 ? null : Math.round(days),
  };
}

export function createLicense(stateDir) {
  const file = path.join(stateDir, 'license.json');
  const load = async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = async (o) => {
    await mkdir(stateDir, { recursive: true });
    await writeFile(file, JSON.stringify(o));
  };
  const free = (why, wallet) => ({
    enforce: true,
    tier: 'free',
    name: BILLING.tiers.free.name,
    features: BILLING.tiers.free.features,
    why: why || '',
    until: null,
    stale: false,
    wallet: wallet || null,
  });
  let facts = null;
  let factsAt = 0;
  let tries = [];
  // ask the chain: which tier does this wallet hold a valid key for, and until when
  async function read(wallet, b) {
    for (const tier of paid(b)) {
      const lock = b.tiers[tier].lock;
      if (uint(await call(b.chain.rpc, lock, encode('getHasValidKey(address)', wallet))) === 0n) continue;
      let until = null;
      try {
        const id = uint(await call(b.chain.rpc, lock, encode('tokenOfOwnerByIndex(address,uint256)', wallet, 0)));
        const t = Number(uint(await call(b.chain.rpc, lock, encode('keyExpirationTimestampFor(uint256)', id))));
        until = t > 0 && t < 4e10 ? t * 1000 : null;
      } catch {
        /* a lock that does not say */
      }
      return { tier, until };
    }
    return { tier: 'free', until: null };
  }
  const api = {
    // the tier in force now. Never throws: anything wrong reads as Free, with the reason.
    async state() {
      const plans = billing();
      if (!enforced(plans))
        return {
          enforce: false,
          tier: 'open',
          name: 'Everything is open',
          features: Object.keys(FEATURES),
          why: 'billing is not switched on',
          until: null,
          stale: false,
          wallet: null,
          code: null,
        };
      const machine = await machineId();
      const got = await load();
      const grant = grantOf(got, plans);
      const byCode = (base) =>
        grant && RANK[grant.tier] > RANK[base.tier]
          ? {
              ...base,
              tier: grant.tier,
              name: plans.tiers[grant.tier].name,
              features: plans.tiers[grant.tier].features,
              until: grant.until,
              why: '',
              stale: false,
              code: { label: grant.label, until: grant.until },
            }
          : { ...base, code: grant ? { label: grant.label, until: grant.until } : null };
      const out = await (async () => {
        if (!got.signature) return free();
        const wallet = signerOf(got.message, got.signature, machine);
        if (!wallet) return free("the wallet's signature is not for this machine");
        let seen = got.seen && got.seen.wallet === wallet ? got.seen : null;
        let stale = false;
        let why = '';
        if (!seen || Date.now() - seen.at > 10 * 60000) {
          // read the chain again at most every ten minutes
          try {
            seen = { wallet, at: Date.now(), ...(await read(wallet, plans)) };
            await save({ ...got, seen });
          } catch (e) {
            if (seen && Date.now() - seen.at < GRACE) {
              stale = true;
              why = 'Base could not be reached, so the last reading stands';
            } else
              return free(
                seen
                  ? 'Base has not been reachable for two weeks'
                  : 'Base could not be reached: ' + String(e.message).slice(0, 120),
                wallet,
              );
          }
        }
        if (seen.tier === 'free' || (seen.until && seen.until < Date.now()))
          return free(
            seen.until && seen.until < Date.now()
              ? 'the plan ran out on ' + new Date(seen.until).toLocaleDateString()
              : 'this wallet holds no plan',
            wallet,
          );
        return {
          enforce: true,
          tier: seen.tier,
          name: plans.tiers[seen.tier].name,
          features: plans.tiers[seen.tier].features,
          why,
          until: seen.until,
          stale,
          wallet,
        };
      })();
      return byCode(out);
    },
    async allows(feature) {
      return (await api.state()).features.includes(feature);
    },
    // the customer's wallet signed for this machine
    async bind({ message, signature }) {
      const machine = await machineId();
      const wallet = signerOf(String(message || ''), String(signature || '').trim(), machine);
      if (!wallet) throw new Error('That signature is not for this machine. Sign the message exactly as shown.');
      await save({ message: String(message), signature: String(signature).trim() });
      return api.state();
    },
    // a code typed in: an empty one removes the code from this machine. Wrong guesses are slowed down.
    async redeem(code) {
      const got = await load();
      if (!normalCode(code)) {
        delete got.grant;
        await save(got);
        return api.state();
      }
      const now = Date.now();
      tries = tries.filter((x) => now - x < 60000);
      if (tries.length >= 5) throw Object.assign(new Error('Too many tries. Wait a minute.'), { status: 429 });
      tries.push(now);
      const e = entryFor(code, billing());
      if (!e) throw new Error('That is not a code this version of the app knows.');
      if (e.until && Date.now() > Date.parse(e.until))
        throw new Error('That code ended on ' + new Date(e.until).toLocaleDateString() + '.');
      if (!(got.grant && got.grant.hash === e.hash)) {
        got.grant = { hash: e.hash, at: now };
        await save(got);
      } // typing it again does not restart its days
      tries = [];
      return api.state();
    },
    async release() {
      const got = await load();
      if (got.grant) await save({ grant: got.grant });
      else await rm(file, { force: true });
      return api.state();
    }, // forget the wallet on this machine. The key in the wallet is untouched.
    async recheck() {
      const got = await load();
      if (got.seen) {
        delete got.seen;
        await save(got);
      }
      return api.state();
    }, // after buying: read the chain now
    // WHAT A WALLET WOULD BE ASKED TO SEND TO BUY A KEY. It is worked out here, on the customer's own machine, from the lock itself,
    // and handed to the page, which asks the wallet in that browser to send it. This app never sends anything and holds no key: the
    // wallet shows each step and the customer confirms it there. Two steps for a lock priced in a token: allow the lock to take
    // EXACTLY the price (never more), then buy one key for the wallet itself. Checked against the real Pro lock by simulation
    // (eth_call): the purchase reaches the token's transfer, and offering one unit less than the price is turned down by the lock.
    async quote(wallet, referrer) {
      const plans = billing();
      if (!enforced(plans)) throw new Error('Billing is not switched on, so nothing is on sale.');
      if (!isAddress(wallet)) throw new Error('That is not a wallet address.');
      const tier = paid(plans)[0];
      if (!tier) throw new Error('No plan is on sale yet.');
      const lock = plans.tiers[tier].lock;
      const rpc = plans.chain.rpc;
      const name = plans.tiers[tier].name;
      const ref = isAddress(referrer) ? referrer : null;
      const ZERO_WORD = '0'.repeat(64);
      const word = (v) => BigInt(v).toString(16).padStart(64, '0');
      const addressWord = (x) => x.slice(2).toLowerCase().padStart(64, '0');
      const [tok, secs, has, cost] = await Promise.all([
        call(rpc, lock, encode('tokenAddress()')),
        call(rpc, lock, encode('expirationDuration()')),
        call(rpc, lock, encode('getHasValidKey(address)', wallet)),
        call(
          rpc,
          lock,
          '0x' +
            selector('purchasePriceFor(address,address,bytes)') +
            addressWord(wallet) +
            (ref ? addressWord(ref) : ZERO_WORD) +
            word(0x60) +
            word(0),
        ),
      ]); // the price for THIS buyer, as the lock itself would charge it
      const token = '0x' + tok.slice(-40);
      const native = /^0x0{40}$/.test(token);
      const price = uint(cost);
      const days = Number(uint(secs)) / 86400;
      if (price === 0n) throw new Error('The lock did not say what a key costs, so nothing was prepared.');
      const [dec, sym, bal, allowed] = native
        ? ['0x12', null, '0x0', '0x0']
        : await Promise.all([
            call(rpc, token, encode('decimals()')),
            call(rpc, token, encode('symbol()')).catch(() => '0x'),
            call(rpc, token, encode('balanceOf(address)', wallet)),
            call(rpc, token, encode('allowance(address,address)', wallet, lock)),
          ]);
      const symbol = native
        ? 'ETH'
        : Buffer.from((sym || '').slice(2), 'hex')
            .toString('utf8')
            .replace(/[^\x20-\x7e]/g, '')
            .trim() || 'tokens';
      const d = Number(uint(dec));
      const cash = (u) => {
        const n = Number(u) / 10 ** d;
        return (n % 1 ? n.toFixed(2) : String(n)) + ' ' + symbol;
      };
      const priceText = cash(price);
      const out = {
        tier,
        name,
        lock,
        token: native ? null : token,
        symbol,
        price: priceText,
        days: days > 36500 ? null : Math.round(days),
        have: native ? null : cash(uint(bal)),
        short: !native && uint(bal) < price,
        held: uint(has) !== 0n,
        txs: [],
        chain: {
          id: plans.chain.id,
          hex: '0x' + Number(plans.chain.id).toString(16),
          name: plans.chain.name,
          rpc: plans.chain.rpc.slice(0, 1),
          explorer: plans.chain.explorer || '',
        },
      };
      if (out.held) return out; // this wallet already holds a key: there is nothing to buy
      if (!native && uint(allowed) < price)
        out.txs.push({
          what: 'allow the ' + name + ' lock to take ' + priceText + ' from this wallet, and no more',
          to: token,
          data: encode('approve(address,uint256)', lock, price),
          value: '0x0',
        });
      // purchase(uint256[] values, address[] recipients, address[] referrers, address[] keyManagers, bytes[] data): one key, for the wallet itself, managed by nobody else
      out.txs.push({
        what: 'buy ' + name + ' for ' + priceText + (out.days ? ', good for ' + out.days + ' days' : ''),
        to: lock,
        value: native ? '0x' + price.toString(16) : '0x0',
        data:
          '0x' +
          selector('purchase(uint256[],address[],address[],address[],bytes[])') +
          [
            word(0xa0),
            word(0xe0),
            word(0x120),
            word(0x160),
            word(0x1a0),
            word(1),
            word(price),
            word(1),
            addressWord(wallet),
            word(1),
            ref ? addressWord(ref) : ZERO_WORD,
            word(1),
            ZERO_WORD,
            word(1),
            word(0x20),
            word(0),
          ].join(''),
      });
      return out;
    },
    // what each paid tier costs and how long a key lasts, from the locks themselves (read at most every ten minutes)
    async offers() {
      const b = billing();
      if (facts && Date.now() - factsAt < 10 * 60000) return facts;
      const out = {};
      for (const tier of paid(b)) {
        try {
          out[tier] = await lockFacts(b.tiers[tier].lock, b);
        } catch (e) {
          out[tier] = { lock: b.tiers[tier].lock, error: String(e.message).slice(0, 120) };
        }
      }
      facts = out;
      factsAt = Date.now();
      return out;
    },
  };
  return api;
}
