// make-code.mjs - makes an access code and writes its entry into js/billing.js. You run it; the code is shown once, in your terminal,
// and is never written to the repo or the bundle (only a slow, salted hash of it is).
//   node tools/make-code.mjs --tier pro --label debug                          a debug code: everything, no end
//   node tools/make-code.mjs --tier pro --days 30 --until 2027-01-31 --label launch
//   node tools/make-code.mjs --tier pro --days 14 --label friends --referrer 0xYourWallet
//   node tools/make-code.mjs --list                                            what is in js/billing.js (labels and terms, never codes)
//   node tools/make-code.mjs --remove launch                                   take one out (it stops working once people update)
//   ... --own                                                                    type your own code instead of a made-up one (it is not echoed)
// --tier pro   --days N (on each machine, from when it is typed there; omit for no limit)   --until YYYY-MM-DD (omit for no end)
// After adding or removing a code: node tools/bundle.mjs, and publish. A code works on any machine and any number of times: give
// marketing codes an end date, and keep the debug code to yourself.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCode, normalCode } from '../src/runner/license.mjs';
import { BILLING } from '../src/js/billing.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNED = path.join(REPO_ROOT, '.owner', 'billing.js'); // the publisher's own plans and codes, which git never sees
const FILE = existsSync(OWNED) ? OWNED : path.join(REPO_ROOT, 'src', 'js', 'billing.js');
const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : null;
};
const stop = (m) => {
  console.error(m);
  process.exit(1);
};
const src = readFileSync(FILE, 'utf8');
const open = src.indexOf('  codes: [');
const close = src.indexOf('\n  ],', open);
if (open < 0 || close < 0) stop('js/billing.js has no codes list to write to.');
const lines = src
  .slice(open + 10, close)
  .split('\n')
  .filter((l) => l.trim());
const write = (ls) =>
  writeFileSync(FILE, src.slice(0, open + 10) + (ls.length ? '\n' + ls.join('\n') : '') + src.slice(close));
if (args.includes('--list')) {
  console.log(
    BILLING.codes.length
      ? BILLING.codes
          .map(
            (c) =>
              '  ' +
              c.label.padEnd(16) +
              c.tier.padEnd(6) +
              (c.days ? c.days + ' days on each machine' : 'no day limit').padEnd(26) +
              (c.until ? 'ends ' + c.until : 'no end date') +
              (c.referrer ? '  referrer ' + c.referrer : ''),
          )
          .join('\n')
      : '  no codes yet',
  );
  process.exit(0);
}
if (opt('remove')) {
  const left = lines.filter((l) => !l.includes("label: '" + opt('remove') + "'"));
  if (left.length === lines.length) stop('No code is labelled ' + opt('remove') + '.');
  write(left);
  console.log(
    'Removed "' + opt('remove') + '". Rebuild and publish; it stops working on a machine once that machine updates.',
  );
  process.exit(0);
}

const tier = opt('tier');
const label = opt('label');
const days = opt('days') ? Number(opt('days')) : null;
const until = opt('until');
const referrer = opt('referrer') || '';
const SOLD = Object.keys(BILLING.tiers).filter((x) => x !== 'free');
if (!SOLD.includes(tier)) stop('Say which tier it opens: ' + SOLD.map((x) => '--tier ' + x).join(' or ') + '.');
if (!/^[a-z0-9][a-z0-9 _-]{0,23}$/i.test(label || '')) stop('Give it a short label you will recognise: --label launch');
if (BILLING.codes.some((c) => c.label === label))
  stop('There is already a code labelled ' + label + '. Remove it first, or pick another label.');
if (days != null && !(days > 0 && days < 3660)) stop('--days must be a number of days.');
if (until && Number.isNaN(Date.parse(until))) stop('--until must be a date, like 2027-01-31.');
if (referrer && !/^0x[0-9a-fA-F]{40}$/.test(referrer)) stop('--referrer must be a wallet address.');
let code;
if (args.includes('--own')) {
  // typed, not echoed, and never an argument (so it is not in your shell history)
  process.stdout.write('Type the code (it will not show), then Return: ');
  code = await new Promise((done) => {
    let s = '';
    process.stdin.setRawMode && process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (d) => {
      for (const ch of String(d)) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode && process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          return done(s);
        }
        if (ch === '\u0003') process.exit(1);
        if (ch === '\u007f') s = s.slice(0, -1);
        else s += ch;
      }
    });
  });
  if (normalCode(code).length < 12)
    console.log(
      'Note: that is short. A hash of it ships with the app, so a short code can be found by trying. Fine for a code you mean to hand out; not for a secret one.',
    );
  if (normalCode(code).length < 6) stop('A code needs at least six letters or digits.');
} else {
  const ABC = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const raw = [...randomBytes(20)].map((b) => ABC[b % ABC.length]).join('');
  code = raw.match(/.{5}/g).join('-');
} // 20 characters, about 98 bits: cannot be found by trying
const salt = randomBytes(16).toString('hex');
const hash = hashCode(code, salt);
write([
  ...lines,
  "    { label: '" +
    label +
    "', tier: '" +
    tier +
    "', days: " +
    (days == null ? 'null' : days) +
    ', until: ' +
    (until ? "'" + until + "'" : 'null') +
    ", referrer: '" +
    referrer +
    "', salt: '" +
    salt +
    "', hash: '" +
    hash +
    "' },",
]);
console.log(
  '\nAdded "' +
    label +
    '": ' +
    tier +
    (days ? ', ' + days + ' days on each machine' : ', no day limit') +
    (until ? ', ends ' + until : ', no end date') +
    '.',
);
if (!args.includes('--own')) console.log('\nTHE CODE (shown once; it is not saved anywhere):\n\n    ' + code + '\n');
console.log('Next: node tools/bundle.mjs, then publish. It is typed on the Plan page, under "Have a code?".');
