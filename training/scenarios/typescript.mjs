// typescript.mjs - TypeScript tickets: a project with a tsconfig.json whose tests Node runs itself, its types stripped (Node 22.18 and later:
// no compiler and nothing installed). One repository for all five, with nine source files, so the team has to find its way about. The oracle
// is a node:test file; "@repo/" in it is the team's copy. Three of these change more than one file, one has a ticket that blames the wrong
// function, and one changes what a function returns, so a test the project already has must be brought up to date with the task.
const ts = String.raw;
const PKG =
  '{\n  "name": "shop-web-ts",\n  "version": "1.0.0",\n  "type": "module",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n';
const TSCONFIG =
  '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "NodeNext",\n    "moduleResolution": "NodeNext",\n    "strict": true,\n    "noEmit": true,\n    "allowImportingTsExtensions": true,\n    "erasableSyntaxOnly": true\n  },\n  "include": ["src"]\n}\n';
const TYPES = ts`export interface Line {
  sku: string;
  name: string;
  cents: number;
  quantity: number;
}

export type Coupon = { kind: 'percent'; percent: number } | { kind: 'fixed'; cents: number };

export interface Order {
  lines: Line[];
  country: string;
  coupon?: Coupon;
}
`;
const MONEY = ts`/** A price typed in dollars, as whole cents. */
export function toCents(dollars: number): number {
  return Math.floor(dollars * 100);
}

/** Cents as text: 1999 is "$19.99". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return sign + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}
`;
const SHIPPING = ts`export const FREE_FROM_CENTS = 50_00;
const HOME = 4_95;
const ABROAD = 14_95;

/** What shipping costs for goods of this value, in cents. */
export function shippingFor(goodsCents: number, country: string): number {
  if (goodsCents >= FREE_FROM_CENTS) return 0;
  return country === 'US' ? HOME : ABROAD;
}
`;
const CART = ts`import type { Coupon, Line, Order } from './types.ts';
import { shippingFor } from './shipping.ts';

/** The goods, before any coupon or shipping, in cents. */
export function subtotal(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.cents * line.quantity, 0);
}

/** What a coupon takes off an amount, in cents. */
export function discountFor(amountCents: number, coupon?: Coupon): number {
  if (!coupon) return 0;
  if (coupon.kind === 'percent') return Math.round((amountCents * coupon.percent) / 100);
  return coupon.cents;
}

/** What the customer pays, in cents. */
export function orderTotal(order: Order): number {
  const goods = subtotal(order.lines);
  const shipping = shippingFor(goods, order.country);
  return goods + shipping - discountFor(goods + shipping, order.coupon);
}
`;
const CART_FIXED = CART.replace(
  "  if (coupon.kind === 'percent') return Math.round((amountCents * coupon.percent) / 100);\n  return coupon.cents;",
  () =>
    "  const off = coupon.kind === 'percent' ? Math.round((amountCents * coupon.percent) / 100) : coupon.cents;\n  return Math.min(off, amountCents);",
).replace(
  '  return goods + shipping - discountFor(goods + shipping, order.coupon);',
  () => '  return goods - discountFor(goods, order.coupon) + shipping;',
);
const INVOICE = ts`import type { Order } from './types.ts';
import { formatCents } from './money.ts';
import { orderTotal, subtotal } from './cart.ts';
import { shippingFor } from './shipping.ts';

/** The lines of an invoice, as text. */
export function invoiceLines(order: Order): string[] {
  const goods = subtotal(order.lines);
  const shipping = shippingFor(goods, order.country);
  const out = ['Goods: ' + formatCents(goods), 'Shipping: ' + formatCents(shipping)];
  if (order.coupon) {
    const off = order.coupon.kind === 'percent' ? Math.round(((goods + shipping) * order.coupon.percent) / 100) : order.coupon.cents;
    out.push('Discount: -' + formatCents(off));
  }
  out.push('Total: ' + formatCents(orderTotal(order)));
  return out;
}
`;
const INVOICE_FIXED = INVOICE.replace(
  "import { orderTotal, subtotal } from './cart.ts';",
  () => "import { discountFor, orderTotal, subtotal } from './cart.ts';",
).replace(
  "    const off = order.coupon.kind === 'percent' ? Math.round(((goods + shipping) * order.coupon.percent) / 100) : order.coupon.cents;",
  () => '    const off = discountFor(goods, order.coupon);',
);
const CATALOG = ts`import type { Line } from './types.ts';
import { toCents } from './money.ts';

/** A line for the cart, from a price typed in dollars. */
export function lineFor(sku: string, name: string, dollars: number, quantity: number): Line {
  return { sku, name, cents: toCents(dollars), quantity };
}
`;
const INVENTORY = ts`/** What is in stock, by sku. */
export class Inventory {
  private stock = new Map<string, number>();

  constructor(start: Record<string, number> = {}) {
    for (const [sku, count] of Object.entries(start)) this.stock.set(sku, count);
  }

  /** How many of a product are in stock. */
  available(sku: string): number {
    return this.stock.get(sku) ?? 0;
  }
}
`;
const INVENTORY_FIXED = INVENTORY.replace(
  '    return this.stock.get(sku) ?? 0;\n  }\n}',
  () => `    return this.stock.get(sku) ?? 0;
  }

  /** Takes that many out of stock, or says why it could not. */
  reserve(sku: string, quantity: number): { ok: true; left: number } | { ok: false; reason: 'short' | 'unknown'; have: number } {
    if (!this.stock.has(sku)) return { ok: false, reason: 'unknown', have: 0 };
    const have = this.available(sku);
    if (have < quantity) return { ok: false, reason: 'short', have };
    this.stock.set(sku, have - quantity);
    return { ok: true, left: have - quantity };
  }

  /** Puts that many back. */
  release(sku: string, quantity: number): void {
    this.stock.set(sku, this.available(sku) + quantity);
  }
}`,
);
const ORDERS = ts`import type { Line } from './types.ts';
import { Inventory } from './inventory.ts';

/** Places an order: true when every line is in stock. */
export function placeOrder(inventory: Inventory, lines: Line[]): boolean {
  return lines.every((line) => inventory.available(line.sku) >= line.quantity);
}
`;
const ORDERS_FIXED = ts`import type { Line } from './types.ts';
import { Inventory } from './inventory.ts';

/** Places an order: every line is reserved, or none is. */
export function placeOrder(inventory: Inventory, lines: Line[]): { ok: true } | { ok: false; sku: string; reason: 'short' | 'unknown' } {
  const taken: Line[] = [];
  for (const line of lines) {
    const got = inventory.reserve(line.sku, line.quantity);
    if (!got.ok) {
      for (const t of taken) inventory.release(t.sku, t.quantity);
      return { ok: false, sku: line.sku, reason: got.reason };
    }
    taken.push(line);
  }
  return { ok: true };
}
`;
const PRICES = ts`export type FetchPrice = (sku: string) => Promise<number>;

/** Prices from the price service. */
export function makePrices(fetchPrice: FetchPrice) {
  return {
    /** The price of a product, in cents. */
    priceOf(sku: string): Promise<number> {
      return fetchPrice(sku);
    },
  };
}
`;
const PRICES_FIXED = ts`export type FetchPrice = (sku: string) => Promise<number>;

/** Prices from the price service. */
export function makePrices(fetchPrice: FetchPrice) {
  const known = new Map<string, Promise<number>>();
  return {
    /** The price of a product, in cents. */
    priceOf(sku: string): Promise<number> {
      let asked = known.get(sku);
      if (!asked) {
        asked = fetchPrice(sku);
        const mine = asked;
        known.set(sku, mine);
        mine.catch(() => { if (known.get(sku) === mine) known.delete(sku); });
      }
      return asked;
    },
  };
}
`;
const CART_TEST = ts`import test from 'node:test';
import assert from 'node:assert/strict';
import { orderTotal, subtotal } from './cart.ts';

const mugs = [{ sku: 'mug', name: 'Mug', cents: 1250, quantity: 2 }];

test('the goods are price times quantity', () => {
  assert.equal(subtotal(mugs), 2500);
});

test('an order with no coupon is the goods and the shipping', () => {
  assert.equal(orderTotal({ lines: mugs, country: 'US' }), 2995);
});
`;
const ORDERS_TEST = ts`import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from './inventory.ts';
import { placeOrder } from './orders.ts';

test('an order within stock is placed', () => {
  const inventory = new Inventory({ mug: 3 });
  assert.equal(placeOrder(inventory, [{ sku: 'mug', name: 'Mug', cents: 1250, quantity: 2 }]), true);
});
`;
const ORDERS_TEST_FIXED = ORDERS_TEST.replace(
  "assert.equal(placeOrder(inventory, [{ sku: 'mug', name: 'Mug', cents: 1250, quantity: 2 }]), true);",
  () =>
    "assert.deepEqual(placeOrder(inventory, [{ sku: 'mug', name: 'Mug', cents: 1250, quantity: 2 }]), { ok: true });",
);
const PRICES_TEST = ts`import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrices } from './prices.ts';

test('the price is what the service gave', async () => {
  const prices = makePrices(async () => 1250);
  assert.equal(await prices.priceOf('mug'), 1250);
});
`;
const BASE = {
  'package.json': PKG,
  'tsconfig.json': TSCONFIG,
  'src/types.ts': TYPES,
  'src/money.ts': MONEY,
  'src/shipping.ts': SHIPPING,
  'src/cart.ts': CART,
  'src/invoice.ts': INVOICE,
  'src/catalog.ts': CATALOG,
  'src/inventory.ts': INVENTORY,
  'src/orders.ts': ORDERS,
  'src/prices.ts': PRICES,
  'src/cart.test.ts': CART_TEST,
  'src/orders.test.ts': ORDERS_TEST,
  'src/prices.test.ts': PRICES_TEST,
};
const HEAD = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";

export const TYPESCRIPT = [
  {
    id: 'ts-coupon',
    lang: 'typescript',
    kind: 'fix',
    key: 'WEB-301',
    title: 'Coupons take money off the shipping, and can make a total negative',
    shape: 'two files: the same wrong sum written twice',
    ticket:
      "A customer with the 10% coupon was given 10% off the shipping as well. Another, with a $15 gift coupon on a $10 order, was shown a total below nothing.\n\n**What it must do**\n\n- A percent coupon takes its percentage off the goods only, never off the shipping.\n- A fixed coupon takes its amount off the goods, and never more than the goods come to.\n- Shipping is still worked out from the goods before the coupon.\n- The invoice's `Discount:` line shows exactly what was taken off.\n- An order with no coupon is unchanged.\n\nThe total is `orderTotal` in `src/cart.ts`. The invoice is built in `src/invoice.ts`. Amounts are in cents.",
    files: BASE,
    oracle: {
      type: 'node',
      text:
        HEAD +
        ts`import { orderTotal } from '@repo/src/cart.ts';
import { invoiceLines } from '@repo/src/invoice.ts';

const mug = (quantity) => ({ sku: 'mug', name: 'Mug', cents: 1000, quantity });

test('a percent coupon comes off the goods only', () => {
  assert.equal(orderTotal({ lines: [mug(2)], country: 'US', coupon: { kind: 'percent', percent: 10 } }), 2295);
});
test('a fixed coupon never takes more than the goods', () => {
  assert.equal(orderTotal({ lines: [mug(1)], country: 'US', coupon: { kind: 'fixed', cents: 1500 } }), 495);
});
test('a fixed coupon smaller than the goods comes off whole', () => {
  assert.equal(orderTotal({ lines: [mug(3)], country: 'US', coupon: { kind: 'fixed', cents: 500 } }), 2995);
});
test('the invoice shows what was taken off', () => {
  assert.deepEqual(invoiceLines({ lines: [mug(2)], country: 'US', coupon: { kind: 'percent', percent: 10 } }), ['Goods: $20.00', 'Shipping: $4.95', 'Discount: -$2.00', 'Total: $22.95']);
});
test('the invoice of a coupon bigger than the goods', () => {
  assert.deepEqual(invoiceLines({ lines: [mug(1)], country: 'US', coupon: { kind: 'fixed', cents: 1500 } }), ['Goods: $10.00', 'Shipping: $4.95', 'Discount: -$10.00', 'Total: $4.95']);
});
test('no coupon is as before', () => {
  assert.deepEqual(invoiceLines({ lines: [mug(2)], country: 'US' }), ['Goods: $20.00', 'Shipping: $4.95', 'Total: $24.95']);
});
`,
    },
    fix: { 'src/cart.ts': CART_FIXED, 'src/invoice.ts': INVOICE_FIXED },
  },
  {
    id: 'ts-cent',
    lang: 'typescript',
    kind: 'fix',
    key: 'WEB-307',
    title: 'A 19.99 item shows as $19.98 on the invoice',
    shape: 'the ticket blames the wrong function',
    ticket:
      'An item priced 19.99 shows as $19.98 on the invoice. It looks as if `formatCents` in `src/money.ts` drops a cent when it formats the price.\n\n**What it must do**\n\n- An item priced 19.99 is 1999 cents, in the cart and on the invoice.\n- 0.29 is 29 cents, and 4.35 is 435.\n- `formatCents` gives the same text as it does today for every whole number of cents: 1999 is `$19.99`, 5 is `$0.05`, and -250 is `-$2.50`.',
    files: BASE,
    oracle: {
      type: 'node',
      text:
        HEAD +
        ts`import { formatCents, toCents } from '@repo/src/money.ts';
import { lineFor } from '@repo/src/catalog.ts';
import { invoiceLines } from '@repo/src/invoice.ts';

test('19.99 is 1999 cents', () => { assert.equal(toCents(19.99), 1999); });
test('0.29 is 29 cents', () => { assert.equal(toCents(0.29), 29); });
test('4.35 is 435 cents', () => { assert.equal(toCents(4.35), 435); });
test('a whole number of dollars', () => { assert.equal(toCents(12), 1200); });
test('a line made from a typed price', () => { assert.equal(lineFor('mug', 'Mug', 19.99, 1).cents, 1999); });
test('the invoice of that line', () => {
  assert.deepEqual(invoiceLines({ lines: [lineFor('mug', 'Mug', 19.99, 1)], country: 'US' }), ['Goods: $19.99', 'Shipping: $4.95', 'Total: $24.94']);
});
test('formatCents is as it was', () => {
  assert.equal(formatCents(1999), '$19.99');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(-250), '-$2.50');
  assert.equal(formatCents(120000), '$1200.00');
});
`,
    },
    fix: { 'src/money.ts': MONEY.replace('Math.floor(dollars * 100)', () => 'Math.round(dollars * 100)') },
  },
  {
    id: 'ts-reserve',
    lang: 'typescript',
    kind: 'enhance',
    key: 'WEB-312',
    title: 'Two customers can buy the last mug',
    shape: 'two files and a test to bring up to date: all or nothing',
    ticket:
      "Two customers can buy the last mug: placing an order checks the stock and never takes anything out of it.\n\n**What it must do**\n\n- Add `reserve(sku, quantity)` to `Inventory` in `src/inventory.ts`. It takes that many out of stock and returns `{ ok: true, left }` with how many are left. When there are not enough it changes nothing and returns `{ ok: false, reason: 'short', have }` with how many there are. For a product that is not stocked at all it returns `{ ok: false, reason: 'unknown', have: 0 }`.\n- Add `release(sku, quantity)` to `Inventory`, which puts that many back.\n- `placeOrder` in `src/orders.ts` reserves every line of the order. It returns `{ ok: true }`, or `{ ok: false, sku, reason }` for the first line that could not be reserved. In that case nothing stays reserved: the stock is as it was before the order.\n- `available` keeps working as it does.",
    files: BASE,
    oracle: {
      type: 'node',
      text:
        HEAD +
        ts`import { Inventory } from '@repo/src/inventory.ts';
import { placeOrder } from '@repo/src/orders.ts';

const line = (sku, quantity) => ({ sku, name: sku, cents: 100, quantity });

test('reserve takes it out of stock', () => {
  const inv = new Inventory({ mug: 3 });
  assert.deepEqual(inv.reserve('mug', 2), { ok: true, left: 1 });
  assert.equal(inv.available('mug'), 1);
});
test('reserve of more than there is changes nothing', () => {
  const inv = new Inventory({ mug: 3 });
  assert.deepEqual(inv.reserve('mug', 4), { ok: false, reason: 'short', have: 3 });
  assert.equal(inv.available('mug'), 3);
});
test('reserve of a product that is not stocked', () => {
  assert.deepEqual(new Inventory({ mug: 3 }).reserve('teapot', 1), { ok: false, reason: 'unknown', have: 0 });
});
test('release puts it back', () => {
  const inv = new Inventory({ mug: 3 });
  inv.reserve('mug', 2);
  inv.release('mug', 2);
  assert.equal(inv.available('mug'), 3);
});
test('an order that fits is reserved', () => {
  const inv = new Inventory({ mug: 3, tea: 5 });
  assert.deepEqual(placeOrder(inv, [line('mug', 2), line('tea', 5)]), { ok: true });
  assert.equal(inv.available('mug'), 1);
  assert.equal(inv.available('tea'), 0);
});
test('an order that does not fit leaves the stock as it was', () => {
  const inv = new Inventory({ mug: 3, tea: 1 });
  assert.deepEqual(placeOrder(inv, [line('mug', 2), line('tea', 2)]), { ok: false, sku: 'tea', reason: 'short' });
  assert.equal(inv.available('mug'), 3);
  assert.equal(inv.available('tea'), 1);
});
test('the last one cannot be bought twice', () => {
  const inv = new Inventory({ mug: 1 });
  assert.deepEqual(placeOrder(inv, [line('mug', 1)]), { ok: true });
  assert.deepEqual(placeOrder(inv, [line('mug', 1)]), { ok: false, sku: 'mug', reason: 'short' });
});
`,
    },
    fix: {
      'src/inventory.ts': INVENTORY_FIXED,
      'src/orders.ts': ORDERS_FIXED,
      'src/orders.test.ts': ORDERS_TEST_FIXED,
    },
  },
  {
    id: 'ts-prices',
    lang: 'typescript',
    kind: 'improve',
    key: 'WEB-318',
    title: 'The product page asks for the same price forty times',
    shape: 'promises shared while in flight, and a failure not kept',
    ticket:
      "The product page asks the price service for the same product's price about forty times while it loads, and the service is slow.\n\n**What it must do**\n\n- For one `makePrices`, calls to `priceOf` for the same sku share one request to the price service, including calls made while the first request has not come back yet.\n- Different skus each get their own request.\n- A request that fails is not kept: the calls waiting on it fail with its error, and the next call for that sku asks the service again.\n- `priceOf` still resolves to the price the service gave.\n\nIt is `makePrices` in `src/prices.ts`.",
    files: BASE,
    oracle: {
      type: 'node',
      text:
        HEAD +
        ts`import { makePrices } from '@repo/src/prices.ts';

const service = (prices, down = []) => {
  const calls = [], failing = new Set(down);
  const fetchPrice = (sku) => { calls.push(sku); return new Promise((ok, no) => setTimeout(() => (failing.has(sku) ? no(new Error('the price service is down')) : ok(prices[sku])), 5)); };
  return { calls, failing, fetchPrice };
};

test('calls made at the same time share one request', async () => {
  const s = service({ mug: 1250 }), prices = makePrices(s.fetchPrice);
  assert.deepEqual(await Promise.all([prices.priceOf('mug'), prices.priceOf('mug'), prices.priceOf('mug')]), [1250, 1250, 1250]);
  assert.equal(s.calls.length, 1);
});
test('a later call uses what is already known', async () => {
  const s = service({ mug: 1250 }), prices = makePrices(s.fetchPrice);
  assert.equal(await prices.priceOf('mug'), 1250);
  assert.equal(await prices.priceOf('mug'), 1250);
  assert.equal(s.calls.length, 1);
});
test('different products are asked for separately', async () => {
  const s = service({ mug: 1250, tea: 400 }), prices = makePrices(s.fetchPrice);
  assert.deepEqual(await Promise.all([prices.priceOf('mug'), prices.priceOf('tea'), prices.priceOf('mug')]), [1250, 400, 1250]);
  assert.deepEqual([...s.calls].sort(), ['mug', 'tea']);
});
test('a failure is not kept', async () => {
  const s = service({ mug: 1250 }, ['mug']), prices = makePrices(s.fetchPrice);
  await assert.rejects(prices.priceOf('mug'), /down/);
  s.failing.delete('mug');
  assert.equal(await prices.priceOf('mug'), 1250);
  assert.equal(s.calls.length, 2);
});
test('two makePrices do not share', async () => {
  const s = service({ mug: 1250 }), a = makePrices(s.fetchPrice), b = makePrices(s.fetchPrice);
  await Promise.all([a.priceOf('mug'), b.priceOf('mug')]);
  assert.equal(s.calls.length, 2);
});
`,
    },
    fix: { 'src/prices.ts': PRICES_FIXED },
  },
  {
    id: 'ts-where-free-shipping',
    lang: 'typescript',
    kind: 'find',
    key: 'WEB-323',
    title: 'Where does free shipping start, and what uses it?',
    shape: 'find it: nine files, a constant and the function that reads it',
    ticket:
      'Marketing wants free shipping to start at a lower order value. Before anyone changes anything: where in the code is that value set, what is it today, and which function uses it?',
    files: BASE,
    find: {
      names: ['shipping.ts', 'FREE_FROM_CENTS', 'shippingFor'],
      value: ['50_00', '5000', '$50', '50.00', '50 dollars'],
    },
  },
];
