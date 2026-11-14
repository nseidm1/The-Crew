// javascript.mjs - JavaScript tickets: a Node project with a package.json, ES modules, and Node's own test runner.
// The oracle is a node:test file; "@repo/" in it is the team's copy of the repository. See ../scenarios.mjs for what each part is.
const js = String.raw;
const PKG =
  '{\n  "name": "shop-web",\n  "version": "1.0.0",\n  "type": "module",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n';

export const JAVASCRIPT = [
  {
    id: 'js-basket',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-201',
    title: 'The basket total ignores how many of each item there are',
    shape: 'one function, a missing factor',
    ticket:
      "Two mugs at 12.50 show a basket total of 12.50.\n\n**What it must do**\n\n- A line's total is its price times its quantity.\n- A line with no quantity counts as one.\n- An empty basket totals 0.\n\nIt is `lineTotal` in `basket.mjs`; `basketTotal` adds the lines up. Prices are in cents.",
    files: {
      'package.json': PKG,
      'basket.mjs': js`// The basket: what is in it and what it comes to. Prices are in cents.

export function lineTotal(item) {
  return item.price;
}

export function basketTotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
`,
      'basket.test.mjs': js`import test from 'node:test';
import assert from 'node:assert/strict';
import { basketTotal } from './basket.mjs';

test('one of each adds the prices', () => {
  assert.equal(basketTotal([{ price: 1250, quantity: 1 }, { price: 400, quantity: 1 }]), 1650);
});
`,
    },
    oracle: {
      type: 'node',
      text: js`import test from 'node:test';
import assert from 'node:assert/strict';
import { basketTotal, lineTotal } from '@repo/basket.mjs';

test('price times quantity', () => { assert.equal(lineTotal({ price: 1250, quantity: 2 }), 2500); });
test('no quantity counts as one', () => { assert.equal(lineTotal({ price: 1250 }), 1250); });
test('the basket adds the lines', () => { assert.equal(basketTotal([{ price: 1250, quantity: 2 }, { price: 400, quantity: 3 }]), 3700); });
test('an empty basket is 0', () => { assert.equal(basketTotal([]), 0); });
`,
    },
    fix: {
      'basket.mjs': js`// The basket: what is in it and what it comes to. Prices are in cents.

export function lineTotal(item) {
  return item.price * (item.quantity === undefined ? 1 : item.quantity);
}

export function basketTotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
`,
    },
  },
  {
    id: 'js-search',
    lang: 'javascript',
    kind: 'enhance',
    key: 'WEB-214',
    title: 'Product search should match tags and ignore case',
    shape: 'one function, wider matching',
    ticket:
      'Searching for `mug` finds nothing when the product is called `Blue Mug`, and people expect a search for `gift` to find things tagged as gifts.\n\n**What it must do**\n\n- A search matches whatever the case of the query or of the product.\n- A product also matches when one of its `tags` contains the query.\n- A product with no `tags` is still searched by its name.\n- An empty query, or one that is only spaces, gives every product.\n- Results keep the order the products came in.\n\nIt is `searchProducts` in `search.mjs`.',
    files: {
      'package.json': PKG,
      'search.mjs': js`// Product search for the shop's listing page.

export function searchProducts(products, query) {
  return products.filter((product) => product.name.includes(query));
}
`,
      'search.test.mjs': js`import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts } from './search.mjs';

test('finds a product by part of its name', () => {
  assert.deepEqual(searchProducts([{ name: 'Blue Mug' }, { name: 'Teapot' }], 'Mug'), [{ name: 'Blue Mug' }]);
});
`,
    },
    oracle: {
      type: 'node',
      text: js`import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts } from '@repo/search.mjs';

const ALL = [{ name: 'Blue Mug', tags: ['kitchen', 'Gift'] }, { name: 'Teapot' }, { name: 'Card', tags: ['gift wrap'] }];
const names = (list) => list.map((p) => p.name);

test('case does not matter', () => { assert.deepEqual(names(searchProducts(ALL, 'mug')), ['Blue Mug']); });
test('an upper-case query matches too', () => { assert.deepEqual(names(searchProducts(ALL, 'TEAPOT')), ['Teapot']); });
test('tags are searched, in order', () => { assert.deepEqual(names(searchProducts(ALL, 'gift')), ['Blue Mug', 'Card']); });
test('a product with no tags is searched by name', () => { assert.deepEqual(names(searchProducts(ALL, 'tea')), ['Teapot']); });
test('an empty query gives everything', () => { assert.deepEqual(names(searchProducts(ALL, '')), ['Blue Mug', 'Teapot', 'Card']); });
test('a query of spaces gives everything', () => { assert.deepEqual(names(searchProducts(ALL, '   ')), ['Blue Mug', 'Teapot', 'Card']); });
test('nothing found is an empty list', () => { assert.deepEqual(searchProducts(ALL, 'sofa'), []); });
`,
    },
    fix: {
      'search.mjs': js`// Product search for the shop's listing page.

export function searchProducts(products, query) {
  const wanted = String(query || '').trim().toLowerCase();
  if (!wanted) return products.slice();
  return products.filter((product) => product.name.toLowerCase().includes(wanted)
    || (product.tags || []).some((tag) => tag.toLowerCase().includes(wanted)));
}
`,
    },
  },
  {
    id: 'js-unique',
    lang: 'javascript',
    kind: 'improve',
    key: 'WEB-227',
    title: 'The product import takes minutes on a big file',
    shape: 'same result, far less work',
    ticket:
      "Importing the supplier's file of 60,000 products hangs the page. The time goes in `uniqueById`, which looks through the whole list again for every item.\n\n**What it must do**\n\n- Give exactly what it gives now: the first item of each `id` is kept, later ones with the same `id` are dropped, and the order is kept.\n- Handle 60,000 items in well under half a second.\n\nIt is `uniqueById` in `unique.mjs`.",
    files: {
      'package.json': PKG,
      'unique.mjs': js`// Dropping repeated products from a supplier's file.

export function uniqueById(items) {
  return items.filter((item, index) => items.findIndex((other) => other.id === item.id) === index);
}
`,
      'unique.test.mjs': js`import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueById } from './unique.mjs';

test('the first of each id is kept', () => {
  assert.deepEqual(uniqueById([{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }]), [{ id: 1, n: 'a' }, { id: 2, n: 'b' }]);
});
`,
    },
    oracle: {
      type: 'node',
      text: js`import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueById } from '@repo/unique.mjs';

test('the first of each id is kept, in order', () => {
  assert.deepEqual(uniqueById([{ id: 3, n: 'a' }, { id: 1, n: 'b' }, { id: 3, n: 'c' }, { id: 2, n: 'd' }, { id: 1, n: 'e' }]), [{ id: 3, n: 'a' }, { id: 1, n: 'b' }, { id: 2, n: 'd' }]);
});
test('nothing in, nothing out', () => { assert.deepEqual(uniqueById([]), []); });
test('text ids and number ids are different ids', () => { assert.equal(uniqueById([{ id: 1 }, { id: '1' }]).length, 2); });
test('60,000 items in under half a second', () => {
  const items = Array.from({ length: 60000 }, (_, i) => ({ id: i % 50000, n: i })), t0 = performance.now(), out = uniqueById(items), ms = performance.now() - t0;
  assert.equal(out.length, 50000); assert.equal(out[49999].n, 49999); assert.ok(ms < 500, 'it took ' + Math.round(ms) + ' ms');
});
`,
    },
    fix: {
      'unique.mjs': js`// Dropping repeated products from a supplier's file.

export function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
}
`,
    },
  },
  {
    id: 'js-retry',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-233',
    title: 'A failed request is not tried again',
    shape: 'async, a loop that gives up early',
    ticket:
      'When the stock service drops a request the page shows an error at once, though `withRetry` is meant to try again.\n\n**What it must do**\n\n- `withRetry(fn, times)` calls `fn` until one call succeeds, at most `times` calls in all, and gives back what that call gave.\n- After a success it does not call `fn` again.\n- When every call fails it throws the error of the last one.\n- `times` of 1 means one call and no retry.\n\nIt is `withRetry` in `retry.mjs`. `fn` returns a promise.',
    files: {
      'package.json': PKG,
      'retry.mjs': js`// Trying a request again when the service drops it.

export async function withRetry(fn, times) {
  for (let attempt = 1; attempt <= times; attempt++) {
    try {
      return await fn();
    } catch (error) {
      throw error;
    }
  }
}
`,
      'retry.test.mjs': js`import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from './retry.mjs';

test('a call that works is returned', async () => {
  assert.equal(await withRetry(async () => 'stock: 3', 3), 'stock: 3');
});
`,
    },
    oracle: {
      type: 'node',
      text: js`import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '@repo/retry.mjs';

const failing = (failures, value) => { let calls = 0; const fn = async () => { calls++; if (calls <= failures) throw new Error('dropped ' + calls); return value; }; fn.calls = () => calls; return fn; };

test('it tries again after a failure', async () => { const fn = failing(2, 'ok'); assert.equal(await withRetry(fn, 3), 'ok'); assert.equal(fn.calls(), 3); });
test('it stops at the first success', async () => { const fn = failing(0, 'ok'); assert.equal(await withRetry(fn, 5), 'ok'); assert.equal(fn.calls(), 1); });
test('when all fail, the last error is thrown', async () => { const fn = failing(9, 'ok'); await assert.rejects(() => withRetry(fn, 3), /dropped 3/); assert.equal(fn.calls(), 3); });
test('times of 1 is one call', async () => { const fn = failing(9, 'ok'); await assert.rejects(() => withRetry(fn, 1), /dropped 1/); assert.equal(fn.calls(), 1); });
`,
    },
    fix: {
      'retry.mjs': js`// Trying a request again when the service drops it.

export async function withRetry(fn, times) {
  let last;
  for (let attempt = 1; attempt <= times; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
`,
    },
  },
  {
    id: 'js-where-shipping',
    lang: 'javascript',
    kind: 'find',
    key: 'WEB-240',
    title: 'Where is free shipping decided?',
    shape: 'find it: four files, one answer',
    ticket:
      'Marketing wants to raise the order value that earns free shipping. Before anyone changes anything: where in the code is that decided, and what is it today?',
    files: {
      'package.json': PKG,
      'basket.mjs': js`// The basket: what is in it and what it comes to. Prices are in cents.
import { shippingCost } from './delivery/rates.mjs';

export function basketTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function orderTotal(items, country) {
  const goods = basketTotal(items);
  return goods + shippingCost(goods, country);
}
`,
      'delivery/rates.mjs': js`// What delivery costs. Prices are in cents.
import { ZONES } from './zones.mjs';

const NO_CHARGE_FROM = 7500;

export function shippingCost(goods, country) {
  if (goods >= NO_CHARGE_FROM) return 0;
  return ZONES[country] === 'near' ? 495 : 1295;
}
`,
      'delivery/zones.mjs': js`// Which countries are delivered to at the lower rate.
export const ZONES = { US: 'near', CA: 'near', MX: 'near', GB: 'far', DE: 'far', JP: 'far' };
`,
      'banner.mjs': js`// The strip at the top of the shop.
export function bannerText(season) {
  return season === 'winter' ? 'Free shipping on bigger orders, all winter' : 'New in: the autumn range';
}
`,
    },
    find: {
      names: ['rates.mjs', 'NO_CHARGE_FROM'],
      value: ['7500', '75'],
      not: ['banner.mjs is where', 'zones.mjs is where'],
    },
  },
];
