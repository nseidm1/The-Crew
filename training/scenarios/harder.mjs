// harder.mjs - HARDER TICKETS: changes that cross files, screens, a ticket whose words are not enough, and tickets whose only evidence is
// a picture or a screen recording. Same parts as every other scenario (../scenarios.mjs), and two more for a ticket with attachments:
//   media   [{ name, kind: 'image' | 'video', html, steps }]  what is attached to the ticket. train.mjs draws each from its html with a
//           browser (a picture), or records the page while it plays its steps (a video); the team is handed the files, never the html.
//   see     [patterns]  what the team's own account of the attachments must hold for it to count as having SEEN them. Reported beside
//           the verdict, never in place of it: the oracle still decides whether the change is right.
import { KOTLIN } from './kotlin.mjs';
import { DART } from './dart.mjs';
const t = String.raw;
const PKG =
  '{\n  "name": "shop-web",\n  "version": "1.0.0",\n  "type": "module",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n';
const HEAD = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";

// ---------- JavaScript: a view over three files, an event bus, a parameter through three layers ----------
const CART_VIEW = t`// The cart panel, as HTML.
import { cartTotal } from '../cart.mjs';
import { dollars } from './money.mjs';

export function renderCart(lines) {
  const rows = lines.map((line) => '<li>' + line.name + ' x ' + line.quantity + '</li>').join('');
  return '<section class="cart">'
    + '<h2>Your cart</h2>'
    + '<p class="count">' + lines.count + ' items</p>'
    + '<ul>' + rows + '</ul>'
    + '<p class="total">' + dollars(cartTotal(lines)) + '</p>'
    + '<button class="checkout">Checkout</button>'
    + '</section>';
}
`;
const CART_VIEW_FIXED = t`// The cart panel, as HTML.
import { cartTotal, countItems } from '../cart.mjs';
import { dollars } from './money.mjs';
import { escapeHtml } from './escape.mjs';

export function renderCart(lines) {
  const empty = lines.length === 0, count = countItems(lines);
  const rows = lines.map((line) => '<li>' + escapeHtml(line.name) + ' x ' + line.quantity + '</li>').join('');
  return '<section class="cart">'
    + '<h2>Your cart</h2>'
    + (empty ? '<p class="empty">Your cart is empty</p>'
      : '<p class="count">' + count + (count === 1 ? ' item' : ' items') + '</p>' + '<ul>' + rows + '</ul>' + '<p class="total">' + dollars(cartTotal(lines)) + '</p>')
    + '<button class="checkout"' + (empty ? ' disabled' : '') + '>Checkout</button>'
    + '</section>';
}
`;
const BUS = t`// A small event bus.
export function createBus() {
  const listeners = new Map();
  const list = (name) => { if (!listeners.has(name)) listeners.set(name, []); return listeners.get(name); };
  return {
    on(name, fn) { list(name).push(fn); return () => this.off(name, fn); },
    once(name, fn) { const wrapped = (...args) => { this.off(name, wrapped); fn(...args); }; return this.on(name, wrapped); },
    off(name, fn) { const all = list(name), at = all.indexOf(fn); if (at >= 0) all.splice(at, 1); },
    emit(name, ...args) { const all = list(name); for (let i = 0; i < all.length; i++) all[i](...args); return all.length; },
  };
}
`;
const STORE = t`// The products, as they are stored.
const PRODUCTS = [
  { id: 1, name: 'Mug', price: 1250 },
  { id: 2, name: 'Apron', price: 2400 },
  { id: 3, name: 'Tea', price: 400 },
  { id: 4, name: 'Kettle', price: 3900 },
];

export function allProducts() {
  return PRODUCTS.map((p) => ({ ...p }));
}
`;
const QUERY = t`import { allProducts } from './store.mjs';

// The products that match, in stored order. options: { maxPrice }
export function findProducts(options = {}) {
  const { maxPrice } = options;
  return allProducts().filter((p) => maxPrice === undefined || p.price <= maxPrice);
}
`;
const API = t`import { findProducts } from './query.mjs';

// GET /products?maxPrice=2000  ->  { status, body }
export function getProducts(params = {}) {
  const maxPrice = params.maxPrice === undefined ? undefined : Number(params.maxPrice);
  if (maxPrice !== undefined && Number.isNaN(maxPrice)) return { status: 400, body: { error: 'maxPrice must be a number' } };
  return { status: 200, body: { products: findProducts({ maxPrice }) } };
}
`;

// ---------- Python: a refund across three files, and a cache keyed by too little ----------
const STOCK_PY = t`"""What is in the warehouse."""


class Stock:
    def __init__(self, counts=None):
        self.counts = dict(counts or {})

    def take(self, sku, quantity):
        """Takes that many out. Raises ValueError when there are not enough."""
        if self.counts.get(sku, 0) < quantity:
            raise ValueError("not enough " + sku)
        self.counts[sku] -= quantity

    def put_back(self, sku, quantity):
        """Puts that many back."""
        self.counts[sku] = self.counts.get(sku, 0) + quantity
`;
const LEDGER_PY = t`"""Money in and money out, in cents. Money in is positive, money out is negative."""


class Ledger:
    def __init__(self):
        self.entries = []

    def record_payment(self, order_id, cents):
        self.entries.append({"order": order_id, "kind": "payment", "cents": cents})

    def record_refund(self, order_id, cents):
        self.entries.append({"order": order_id, "kind": "refund", "cents": cents})

    def balance(self):
        return sum(entry["cents"] for entry in self.entries)
`;
const ORDERS_PY = t`"""Orders: paying for one, and refunding it."""


class Order:
    def __init__(self, order_id, lines):
        """lines is a list of (sku, cents, quantity)."""
        self.order_id = order_id
        self.lines = list(lines)
        self.status = "new"

    def total(self):
        return sum(cents * quantity for _sku, cents, quantity in self.lines)


def pay_order(order, stock, ledger):
    """Takes the goods out of stock and records the payment."""
    for sku, _cents, quantity in order.lines:
        stock.take(sku, quantity)
    ledger.record_payment(order.order_id, order.total())
    order.status = "paid"


def refund_order(order, stock, ledger):
    """Gives the customer their money back."""
    ledger.record_refund(order.order_id, order.total())
    order.status = "refunded"
`;
const PRICING_PY = t`"""Prices, by customer tier. Asking the price service is slow, so each price is kept once it is known."""

_known = {}


def price_for(sku, tier, lookup):
    """The price of a product for a customer of this tier, in cents. lookup(sku, tier) asks the price service."""
    if sku not in _known:
        _known[sku] = lookup(sku, tier)
    return _known[sku]


def forget_prices():
    """Forgets every price, so the next call asks again."""
    _known.clear()
`;

// ---------- Android and Flutter: the shop as it is once its cart total counts quantities ----------
const J = 'app/src/main/java/shop/harbor/';
const KT = { ...KOTLIN[0].files, ...KOTLIN[0].fix };
const FL = { ...DART[0].files, ...DART[0].fix };
const KT_ORACLE_HEAD = t`package oracle

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
`;
const STEPPER_KT = t`package shop.harbor.cart

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** Lets a person choose how many. It keeps no state: the quantity is the one it is given. */
@Composable
fun QuantityStepper(quantity: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier, max: Int = 9) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Button(onClick = { onChange(quantity - 1) }, enabled = quantity > 1, modifier = Modifier.testTag("minus")) { Text("-") }
        Text(text = quantity.toString(), modifier = Modifier.testTag("qty"))
        Button(onClick = { onChange(quantity + 1) }, enabled = quantity < max, modifier = Modifier.testTag("plus")) { Text("+") }
    }
}
`;
const STEPPER_DART = t`import 'package:flutter/material.dart';

/// Lets a person choose how many. It keeps no state: the quantity is the one it is given.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.quantity, required this.onChanged, this.max = 9});

  final int quantity;
  final ValueChanged<int> onChanged;
  final int max;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(key: const Key('minus'), icon: const Icon(Icons.remove), onPressed: quantity > 1 ? () => onChanged(quantity - 1) : null),
        Text('$quantity', key: const Key('qty')),
        IconButton(key: const Key('plus'), icon: const Icon(Icons.add), onPressed: quantity < max ? () => onChanged(quantity + 1) : null),
      ],
    );
  }
}
`;
const SUMMARY_DART = t`import 'package:flutter/material.dart';

import 'cart.dart';

/// The count and the total, under the cart's list.
class CartSummary extends StatelessWidget {
  const CartSummary({super.key, required this.lines});

  final List<CartLine> lines;

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) return const Text('Your cart is empty');
    final count = cartCount(lines);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(count == 1 ? '1 item' : '$count items'),
        Text(formatCents(cartTotal(lines))),
      ],
    );
  }
}
`;

// ---------- what is attached to a ticket: a page drawn as a picture, or recorded while it plays ----------
const PAGE = (body, css = '') =>
  '<!doctype html><html><head><meta charset="utf-8"><title>Harbor Shop</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#1c1c1c;font:28px/1.4 Helvetica,Arial,sans-serif;padding:56px 72px}h1{font-size:44px;margin:0 0 28px}.card{background:#fff;border:2px solid #d9d3c5;border-radius:18px;padding:36px 44px;width:860px;position:relative}' +
  '.price{font-size:40px;font-weight:700;margin:6px 0 18px}.badge{display:inline-block;padding:10px 22px;border-radius:999px;background:#fde8e8;color:#9b1c1c;font-weight:700;font-size:34px}.ring{outline:6px solid #e02424;outline-offset:10px;border-radius:999px}' +
  '.note{position:absolute;right:-300px;top:120px;width:360px;background:#fff7a8;border:2px solid #d4b106;padding:22px 26px;font-size:30px;line-height:1.3;transform:rotate(2deg);box-shadow:4px 6px 0 rgba(0,0,0,.12)}.arrow{position:absolute;right:70px;top:196px;font-size:64px;color:#e02424;font-weight:700}' +
  'pre{background:#161616;color:#f3f3f3;font:26px/1.45 Menlo,Consolas,monospace;padding:30px 34px;border-radius:14px;width:1100px;white-space:pre-wrap}.err{color:#ff6b6b;font-weight:700}' +
  css +
  '</style></head><body>' +
  body +
  '</body></html>';
const BADGE_PAGE = PAGE(
  '<h1>Harbor Shop</h1><div class="card"><div>Harbor Mug, stoneware</div><div class="price">$12.50</div><span class="badge ring">Only -2 left</span><div class="arrow">&larr;</div><div class="note">Should say:<br><b>Sold out</b><br>(for 0 as well)</div></div>',
);
const CRASH_PAGE = PAGE(
  '<h1>Morning dashboard</h1><pre>Traceback (most recent call last):\n  File "dashboard.py", line 31, in render\n    row("Average order", average_order(orders))\n  File "report.py", line 9, in average_order\n    return sum(orders) / len(orders)\n<span class="err">ZeroDivisionError: division by zero</span></pre>' +
    '<div class="card" style="margin-top:34px;width:1100px;background:#fff7a8;border-color:#d4b106">Ops note: this happens on a day with <b>no orders</b>. The dashboard should show <b>0.00</b> for the average, not crash.</div>',
);
// the recording: a product page whose + is pressed three times, a pointer shown moving to it, the number changing each time
const STEPPER_PAGE = PAGE(
  '<h1>Harbor Mug</h1><div class="card"><div class="price">$12.50</div><div class="row"><button id="minus">&minus;</button><span id="q">Quantity: 1</span><button id="plus">+</button></div><div class="limit">Limit: 5 per order</div><div id="said" class="said">&nbsp;</div></div><div id="ptr"></div>' +
    '<script>let q=1,n=0;const el=document.getElementById("q"),said=document.getElementById("said"),ptr=document.getElementById("ptr"),plus=document.getElementById("plus");' +
    'function press(){n++;const r=plus.getBoundingClientRect();ptr.style.left=(r.left+r.width/2-18)+"px";ptr.style.top=(r.top+r.height/2-18)+"px";ptr.classList.add("down");plus.classList.add("on");setTimeout(()=>{q+=2;el.textContent="Quantity: "+q;said.textContent="+ pressed "+n+(n===1?" time":" times");ptr.classList.remove("down");plus.classList.remove("on")},350)}' +
    'window.play=()=>{setTimeout(press,1500);setTimeout(press,4000);setTimeout(press,6500)};</script>',
  '.row{display:flex;align-items:center;gap:34px;margin:26px 0}.row button{width:96px;height:96px;font-size:56px;border-radius:20px;border:3px solid #1c1c1c;background:#fff}.row button.on{background:#ffd9a8}#q{font-size:64px;font-weight:700;min-width:420px;text-align:center}.limit{font-size:34px;color:#555}.said{font-size:30px;color:#9b1c1c;margin-top:18px}#ptr{position:fixed;left:200px;top:700px;width:36px;height:36px;border-radius:50%;background:rgba(224,36,36,.85);transition:left .6s,top .6s}#ptr.down{box-shadow:0 0 0 22px rgba(224,36,36,.3)}',
);

export const HARDER = [
  // ----- JavaScript -----
  {
    id: 'js-cart-view',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-231',
    title: 'The cart panel says "undefined items" and breaks on some product names',
    shape: 'what people see: a view built from three files',
    ticket:
      'The cart panel is wrong in three ways. It says `undefined items`, whatever is in the cart. With nothing in the cart it still offers a Checkout button people can press. And a product called `Salt & Pepper <set>` breaks the page.\n\n**What it must do**\n\n- The count line reads `1 item` for one thing and `N items` otherwise, counting quantities: two mugs and a tea are `3 items`.\n- An empty cart shows `<p class="empty">Your cart is empty</p>` in place of the count, the list and the total.\n- The Checkout button carries the `disabled` attribute when the cart is empty, and does not carry it otherwise.\n- Every product name goes through `escapeHtml`, from `view/escape.mjs`, before it is put into the page.\n\nIt is `renderCart` in `view/cart-view.mjs`.',
    files: {
      'package.json': PKG,
      'cart.mjs': t`// The cart: lines of { name, price, quantity }. Prices are in cents.

export function countItems(lines) {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

export function cartTotal(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}
`,
      'view/escape.mjs': t`// Text made safe to put into a page.
const MARKS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => MARKS[c]);
}
`,
      'view/money.mjs': t`// Cents as dollars, for the page.
export function dollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}
`,
      'view/cart-view.mjs': CART_VIEW,
      'view/cart-view.test.mjs': t`import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCart } from './cart-view.mjs';

test('the total of the cart is shown', () => {
  assert.match(renderCart([{ name: 'Mug', price: 1250, quantity: 1 }]), /<p class="total">\$12\.50<\/p>/);
});
`,
    },
    oracle: {
      type: 'node',
      text:
        HEAD +
        t`import { renderCart } from '@repo/view/cart-view.mjs';

const mug = { name: 'Mug', price: 1250, quantity: 2 }, tea = { name: 'Tea', price: 400, quantity: 1 };

test('the count adds up the quantities', () => { assert.match(renderCart([mug, tea]), /<p class="count">3 items<\/p>/); });
test('one thing is one item', () => { assert.match(renderCart([tea]), /<p class="count">1 item<\/p>/); });
test('an empty cart says so, and shows nothing else', () => {
  const html = renderCart([]);
  assert.match(html, /<p class="empty">Your cart is empty<\/p>/);
  assert.doesNotMatch(html, /class="count"|<ul>|class="total"|undefined/);
});
test('checkout cannot be pressed on an empty cart', () => { assert.match(renderCart([]), /<button[^>]*\bdisabled\b[^>]*>Checkout<\/button>/); });
test('checkout can be pressed otherwise', () => { assert.doesNotMatch(/<button[^>]*>Checkout<\/button>/.exec(renderCart([mug]))[0], /disabled/); });
test('a name is made safe', () => {
  const html = renderCart([{ name: 'Salt & Pepper <set>', price: 900, quantity: 1 }]);
  assert.match(html, /Salt &amp; Pepper &lt;set&gt;/);
  assert.doesNotMatch(html, /<set>/);
});
test('the total is still shown', () => { assert.match(renderCart([mug, tea]), /<p class="total">\$29\.00<\/p>/); });
`,
    },
    fix: { 'view/cart-view.mjs': CART_VIEW_FIXED },
  },
  {
    id: 'js-bus',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-238',
    title: 'The confirmation email is sometimes never sent',
    shape: 'a list changed while it is walked',
    ticket:
      "When an order is placed, the confirmation email is sometimes never sent. The `order` event has a one-time listener registered before the email's listener, and whenever the one-time listener runs, the listener after it is skipped.\n\n**What it must do**\n\n- No listener is skipped because an earlier one removed itself during the emit: listeners run in the order they were registered.\n- A listener that another listener removes before its turn is not called in that emit.\n- A listener added during an emit is first called on the next emit.\n- `emit` returns the number of listeners it called.\n- A `once` listener runs only once.\n\nIt is `createBus` in `events.mjs`.",
    files: {
      'package.json': PKG,
      'events.mjs': BUS,
      'events.test.mjs': t`import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from './events.mjs';

test('a listener hears what is sent', () => {
  const bus = createBus(), heard = [];
  bus.on('order', (id) => heard.push(id));
  bus.emit('order', 7);
  assert.deepEqual(heard, [7]);
});
`,
    },
    oracle: {
      type: 'node',
      text:
        HEAD +
        t`import { createBus } from '@repo/events.mjs';

test('a once listener does not make the next one miss its turn', () => {
  const bus = createBus(), calls = [];
  bus.once('order', () => calls.push('once'));
  bus.on('order', () => calls.push('email'));
  bus.emit('order');
  assert.deepEqual(calls, ['once', 'email']);
});
test('a listener that removes itself keeps the order', () => {
  const bus = createBus(), calls = [];
  const b = () => { calls.push('b'); bus.off('order', b); };
  bus.on('order', () => calls.push('a')); bus.on('order', b); bus.on('order', () => calls.push('c'));
  bus.emit('order');
  assert.deepEqual(calls, ['a', 'b', 'c']);
});
test('a listener removed before its turn is not called', () => {
  const bus = createBus(), calls = [];
  const c = () => calls.push('c');
  bus.on('order', () => { calls.push('a'); bus.off('order', c); }); bus.on('order', () => calls.push('b')); bus.on('order', c);
  assert.equal(bus.emit('order'), 2);
  assert.deepEqual(calls, ['a', 'b']);
});
test('a listener added during an emit waits for the next one', () => {
  const bus = createBus(), calls = []; let added = false;
  bus.on('order', () => { calls.push('a'); if (!added) { added = true; bus.on('order', () => calls.push('late')); } });
  assert.equal(bus.emit('order'), 1);
  assert.deepEqual(calls, ['a']);
  assert.equal(bus.emit('order'), 2);
  assert.deepEqual(calls, ['a', 'a', 'late']);
});
test('emit says how many it called', () => {
  const bus = createBus();
  assert.equal(bus.emit('order'), 0);
  bus.on('order', () => {}); bus.on('order', () => {});
  assert.equal(bus.emit('order'), 2);
});
test('a once listener runs only once', () => {
  const bus = createBus(); let n = 0;
  bus.once('order', () => n++);
  bus.emit('order'); bus.emit('order');
  assert.equal(n, 1);
});
`,
    },
    fix: {
      'events.mjs': BUS.replace(
        'emit(name, ...args) { const all = list(name); for (let i = 0; i < all.length; i++) all[i](...args); return all.length; },',
        () =>
          'emit(name, ...args) { const all = list(name), now = [...all]; let called = 0; for (const fn of now) { if (!all.includes(fn)) continue; fn(...args); called++; } return called; },',
      ),
    },
  },
  {
    id: 'js-sort',
    lang: 'javascript',
    kind: 'enhance',
    key: 'WEB-244',
    title: 'Let the shop page sort the product list',
    shape: 'one new parameter, through three files',
    ticket:
      "The shop page needs the product list sorted, and today the API only returns it in stored order.\n\n**What it must do**\n\n- `getProducts` in `api.mjs` takes a `sort` parameter: `price` (cheapest first), `-price` (dearest first) or `name` (A to Z).\n- Any other `sort` is answered with status 400 and the body `{ error: 'sort must be price, -price or name' }`.\n- The sorting itself is done by `findProducts` in `query.mjs`, which takes `sort` in its options.\n- With no `sort`, the order is the stored order, as today.\n- `maxPrice` and `sort` work together.\n- Sorting never changes the stored products: a later call with no `sort` is still in stored order.",
    files: {
      'package.json': PKG,
      'store.mjs': STORE,
      'query.mjs': QUERY,
      'api.mjs': API,
      'api.test.mjs': t`import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts } from './api.mjs';

test('the products come back in stored order', () => {
  assert.deepEqual(getProducts().body.products.map((p) => p.name), ['Mug', 'Apron', 'Tea', 'Kettle']);
});

test('a price limit leaves out what costs more', () => {
  assert.deepEqual(getProducts({ maxPrice: '1300' }).body.products.map((p) => p.name), ['Mug', 'Tea']);
});
`,
    },
    oracle: {
      type: 'node',
      text:
        HEAD +
        t`import { getProducts } from '@repo/api.mjs';
import { findProducts } from '@repo/query.mjs';

const names = (r) => r.body.products.map((p) => p.name);

test('cheapest first', () => { assert.deepEqual(names(getProducts({ sort: 'price' })), ['Tea', 'Mug', 'Apron', 'Kettle']); });
test('dearest first', () => { assert.deepEqual(names(getProducts({ sort: '-price' })), ['Kettle', 'Apron', 'Mug', 'Tea']); });
test('by name', () => { assert.deepEqual(names(getProducts({ sort: 'name' })), ['Apron', 'Kettle', 'Mug', 'Tea']); });
test('an unknown sort is refused', () => { assert.deepEqual(getProducts({ sort: 'stock' }), { status: 400, body: { error: 'sort must be price, -price or name' } }); });
test('findProducts sorts', () => { assert.deepEqual(findProducts({ sort: 'price' }).map((p) => p.name), ['Tea', 'Mug', 'Apron', 'Kettle']); });
test('a price limit and a sort together', () => { assert.deepEqual(names(getProducts({ maxPrice: '2400', sort: '-price' })), ['Apron', 'Mug', 'Tea']); });
test('no sort is the stored order, even after a sorted call', () => {
  getProducts({ sort: 'price' });
  assert.deepEqual(names(getProducts()), ['Mug', 'Apron', 'Tea', 'Kettle']);
});
`,
    },
    fix: {
      'query.mjs': t`import { allProducts } from './store.mjs';

// The products that match. options: { maxPrice, sort }: sort is 'price', '-price' or 'name'; with none, stored order.
export function findProducts(options = {}) {
  const { maxPrice, sort } = options;
  const found = allProducts().filter((p) => maxPrice === undefined || p.price <= maxPrice);
  if (sort === 'price') found.sort((a, b) => a.price - b.price);
  else if (sort === '-price') found.sort((a, b) => b.price - a.price);
  else if (sort === 'name') found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}
`,
      'api.mjs': t`import { findProducts } from './query.mjs';

const SORTS = ['price', '-price', 'name'];

// GET /products?maxPrice=2000&sort=price  ->  { status, body }
export function getProducts(params = {}) {
  const maxPrice = params.maxPrice === undefined ? undefined : Number(params.maxPrice);
  if (maxPrice !== undefined && Number.isNaN(maxPrice)) return { status: 400, body: { error: 'maxPrice must be a number' } };
  if (params.sort !== undefined && !SORTS.includes(params.sort)) return { status: 400, body: { error: 'sort must be price, -price or name' } };
  return { status: 200, body: { products: findProducts({ maxPrice, sort: params.sort }) } };
}
`,
    },
  },
  // ----- Python -----
  {
    id: 'py-refund',
    lang: 'python',
    kind: 'fix',
    key: 'SHOP-221',
    title: 'A refund leaves the books and the shelves wrong',
    shape: 'three files, and nothing may change when it is refused',
    ticket:
      "After a refund the books are wrong twice over: the day's balance goes up instead of down, and the goods never go back on the shelf. Support also refunded one order twice last week.\n\n**What it must do**\n\n- A refund is money out: the ledger's refund entry is minus the order's total, so paying for an order and then refunding it leaves the balance where it started.\n- A refund puts every line of the order back in stock.\n- Only a paid order can be refunded. Refunding an order that is `new`, or one that is already `refunded`, raises `ValueError` and changes nothing: not the stock, not the ledger, not the order's status.\n- Paying for an order works as it does today.\n\nThe refund is `refund_order` in `orders.py`. The ledger is in `ledger.py` and the stock in `stock.py`.",
    files: {
      'stock.py': STOCK_PY,
      'ledger.py': LEDGER_PY,
      'orders.py': ORDERS_PY,
      'test_orders.py': t`import unittest

from ledger import Ledger
from orders import Order, pay_order
from stock import Stock


class OrdersTest(unittest.TestCase):
    def test_paying_takes_the_goods_and_records_the_money(self):
        stock, ledger, order = Stock({"mug": 5}), Ledger(), Order(1, [("mug", 1250, 2)])
        pay_order(order, stock, ledger)
        self.assertEqual(stock.counts, {"mug": 3})
        self.assertEqual(ledger.balance(), 2500)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: {
      type: 'unittest',
      text: t`import unittest

from ledger import Ledger
from orders import Order, pay_order, refund_order
from stock import Stock


def shop():
    return Stock({"mug": 5, "tea": 2}), Ledger(), Order(7, [("mug", 1250, 2), ("tea", 400, 1)])


class Oracle(unittest.TestCase):
    def test_a_refund_is_money_out(self):
        stock, ledger, order = shop()
        pay_order(order, stock, ledger)
        refund_order(order, stock, ledger)
        self.assertEqual(ledger.balance(), 0)
        self.assertEqual(ledger.entries[-1]["kind"], "refund")
        self.assertEqual(ledger.entries[-1]["cents"], -2900)

    def test_a_refund_puts_the_goods_back(self):
        stock, ledger, order = shop()
        pay_order(order, stock, ledger)
        refund_order(order, stock, ledger)
        self.assertEqual(stock.counts, {"mug": 5, "tea": 2})
        self.assertEqual(order.status, "refunded")

    def test_refunding_twice_raises_and_changes_nothing(self):
        stock, ledger, order = shop()
        pay_order(order, stock, ledger)
        refund_order(order, stock, ledger)
        with self.assertRaises(ValueError):
            refund_order(order, stock, ledger)
        self.assertEqual(stock.counts, {"mug": 5, "tea": 2})
        self.assertEqual(len(ledger.entries), 2)
        self.assertEqual(order.status, "refunded")

    def test_an_order_not_paid_for_cannot_be_refunded(self):
        stock, ledger, order = shop()
        with self.assertRaises(ValueError):
            refund_order(order, stock, ledger)
        self.assertEqual(stock.counts, {"mug": 5, "tea": 2})
        self.assertEqual(ledger.entries, [])
        self.assertEqual(order.status, "new")

    def test_paying_is_as_before(self):
        stock, ledger, order = shop()
        pay_order(order, stock, ledger)
        self.assertEqual(stock.counts, {"mug": 3, "tea": 1})
        self.assertEqual(ledger.balance(), 2900)
        self.assertEqual(order.status, "paid")
`,
    },
    fix: {
      'orders.py': ORDERS_PY.replace(
        '    ledger.record_refund(order.order_id, order.total())\n    order.status = "refunded"',
        () =>
          '    if order.status != "paid":\n        raise ValueError("only a paid order can be refunded")\n    for sku, _cents, quantity in order.lines:\n        stock.put_back(sku, quantity)\n    ledger.record_refund(order.order_id, order.total())\n    order.status = "refunded"',
      ),
      'ledger.py': LEDGER_PY.replace('"kind": "refund", "cents": cents}', () => '"kind": "refund", "cents": -cents}'),
    },
  },
  {
    id: 'py-tier',
    lang: 'python',
    kind: 'fix',
    key: 'SHOP-228',
    title: 'Gold customers are sometimes charged the regular price',
    shape: 'the easy fix breaks a rule the ticket also states',
    ticket:
      'Gold customers are sometimes charged the regular price, and regular customers sometimes get the gold one. It depends on who looked at the product first that day.\n\n**What it must do**\n\n- `price_for(sku, tier, lookup)` gives the price for that tier, whoever asked first.\n- The price service is slow, so `lookup` is still called only once for each product and tier, until `forget_prices()` is called.\n- `forget_prices()` keeps working: after it, the next call asks the price service again.\n\nIt is `price_for` in `pricing.py`.',
    files: {
      'pricing.py': PRICING_PY,
      'test_pricing.py': t`import unittest

from pricing import forget_prices, price_for


class PricingTest(unittest.TestCase):
    def setUp(self):
        forget_prices()

    def test_the_price_is_what_the_service_gives(self):
        self.assertEqual(price_for("mug", "regular", lambda sku, tier: 1250), 1250)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: {
      type: 'unittest',
      text: t`import unittest

from pricing import forget_prices, price_for


def service():
    calls = []

    def lookup(sku, tier):
        calls.append((sku, tier))
        return {"regular": 1250, "gold": 1000}[tier] + (0 if sku == "mug" else 150)

    return calls, lookup


class Oracle(unittest.TestCase):
    def setUp(self):
        forget_prices()

    def test_each_tier_gets_its_own_price(self):
        calls, lookup = service()
        self.assertEqual(price_for("mug", "regular", lookup), 1250)
        self.assertEqual(price_for("mug", "gold", lookup), 1000)

    def test_the_other_way_round(self):
        calls, lookup = service()
        self.assertEqual(price_for("mug", "gold", lookup), 1000)
        self.assertEqual(price_for("mug", "regular", lookup), 1250)

    def test_each_product_and_tier_is_asked_for_once(self):
        calls, lookup = service()
        for _ in range(3):
            price_for("mug", "regular", lookup)
        for _ in range(2):
            price_for("mug", "gold", lookup)
        self.assertEqual(calls, [("mug", "regular"), ("mug", "gold")])

    def test_products_are_kept_apart(self):
        calls, lookup = service()
        self.assertEqual(price_for("tea", "gold", lookup), 1150)
        self.assertEqual(price_for("mug", "gold", lookup), 1000)

    def test_forgetting_asks_again(self):
        calls, lookup = service()
        price_for("mug", "regular", lookup)
        forget_prices()
        price_for("mug", "regular", lookup)
        self.assertEqual(len(calls), 2)
`,
    },
    fix: {
      'pricing.py': PRICING_PY.replace(
        '    if sku not in _known:\n        _known[sku] = lookup(sku, tier)\n    return _known[sku]',
        () =>
          '    key = (sku, tier)\n    if key not in _known:\n        _known[key] = lookup(sku, tier)\n    return _known[key]',
      ),
    },
  },
  // ----- Android -----
  {
    id: 'kt-checkout-total',
    lang: 'kotlin',
    kind: 'fix',
    key: 'AND-540',
    title: 'The checkout shows $25.0 and leaves out delivery',
    shape: 'a format, a screen and a rule from a third file',
    ticket:
      'The checkout shows `$25.0` for two mugs, and the amount leaves out delivery, so people are charged more than the screen told them.\n\n**What it must do**\n\n- `Cart.format` always shows two digits of cents: 2500 is `$25.00`, 5 is `$0.05`, and 1999 is `$19.99`.\n- The checkout shows what the customer pays: the goods plus delivery, where delivery is `deliveryCost(goods, near = true)` from `Rates.kt`.\n- That amount is shown in a `Text` with the test tag `total`, formatted with `Cart.format`.\n- The Pay button and the title stay as they are.\n\nThe format is in `app/src/main/java/shop/harbor/cart/Cart.kt`. The screen is `CheckoutScreen` in `app/src/main/java/shop/harbor/checkout/CheckoutScreen.kt`.',
    files: KT,
    oracle: {
      type: 'gradle',
      file: 'app/src/test/java/oracle/OracleTest.kt',
      test: 'oracle.OracleTest',
      text:
        KT_ORACLE_HEAD +
        t`import shop.harbor.cart.Cart
import shop.harbor.cart.CartLine
import shop.harbor.checkout.CheckoutScreen

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w800dp-h1280dp-mdpi")
class OracleTest {
    @get:Rule val rule = createComposeRule()

    @Test fun twoDigitsOfCents() {
        assertEquals("$25.00", Cart.format(2500))
        assertEquals("$0.05", Cart.format(5))
        assertEquals("$19.99", Cart.format(1999))
        assertEquals("$0.00", Cart.format(0))
    }

    @Test fun theCheckoutAddsDelivery() {
        rule.setContent { CheckoutScreen(lines = listOf(CartLine("Mug", 1250, 2)), onPay = {}) }
        rule.onNodeWithTag("total").assertTextEquals("$29.95")
    }

    @Test fun aBigOrderIsDeliveredFree() {
        rule.setContent { CheckoutScreen(lines = listOf(CartLine("Kettle", 3900, 2)), onPay = {}) }
        rule.onNodeWithTag("total").assertTextEquals("$78.00")
    }

    @Test fun thePayButtonAndTheTitleStay() {
        rule.setContent { CheckoutScreen(lines = listOf(CartLine("Mug", 1250, 2)), onPay = {}) }
        rule.onNodeWithTag("pay").assertIsDisplayed()
        rule.onNodeWithText("Your order").assertIsDisplayed()
    }
}
`,
    },
    fix: {
      [J + 'cart/Cart.kt']: KT[J + 'cart/Cart.kt'].replace(
        'fun format(cents: Int): String = "$" + cents / 100.0',
        () => 'fun format(cents: Int): String = "$" + cents / 100 + "." + (cents % 100).toString().padStart(2, \'0\')',
      ),
      [J + 'checkout/CheckoutScreen.kt']: KT[J + 'checkout/CheckoutScreen.kt']
        .replace(
          'import shop.harbor.cart.CartLine\n',
          () => 'import shop.harbor.cart.CartLine\nimport shop.harbor.delivery.deliveryCost\n',
        )
        .replace(
          '        Text(text = Cart.format(Cart.total(lines)))',
          () =>
            '        val goods = Cart.total(lines)\n        Text(text = Cart.format(goods + deliveryCost(goods, near = true)), modifier = Modifier.testTag("total"))',
        ),
    },
  },
  {
    id: 'kt-stepper',
    lang: 'kotlin',
    kind: 'enhance',
    key: 'AND-547',
    title: 'Let people choose how many of an item they want',
    shape: 'a new composable: what it shows, what it sends, when it is off',
    ticket:
      'People can only buy one of each item. They need a control to choose how many.\n\n**What it must do**\n\n- Add a composable `QuantityStepper(quantity: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier, max: Int = 9)` in a new file `app/src/main/java/shop/harbor/cart/QuantityStepper.kt`, in the package `shop.harbor.cart`.\n- It shows the quantity in a `Text` with the test tag `qty`.\n- A button with the test tag `minus` calls `onChange(quantity - 1)`. It is disabled when the quantity is 1.\n- A button with the test tag `plus` calls `onChange(quantity + 1)`. It is disabled when the quantity is `max`.\n- It keeps no state of its own: the quantity it shows is the one it is given.',
    files: KT,
    oracle: {
      type: 'gradle',
      file: 'app/src/test/java/oracle/OracleTest.kt',
      test: 'oracle.OracleTest',
      text:
        KT_ORACLE_HEAD +
        t`import shop.harbor.cart.QuantityStepper

@RunWith(RobolectricTestRunner::class)
class OracleTest {
    @get:Rule val rule = createComposeRule()
    private val seen = mutableListOf<Int>()

    private fun show(quantity: Int, max: Int = 9) = rule.setContent { QuantityStepper(quantity = quantity, onChange = { seen.add(it) }, max = max) }

    @Test fun itShowsTheQuantity() { show(3); rule.onNodeWithTag("qty").assertTextEquals("3") }

    @Test fun plusAsksForOneMore() { show(3); rule.onNodeWithTag("plus").performClick(); assertEquals(listOf(4), seen) }

    @Test fun minusAsksForOneFewer() { show(3); rule.onNodeWithTag("minus").performClick(); assertEquals(listOf(2), seen) }

    @Test fun minusIsOffAtOne() { show(1); rule.onNodeWithTag("minus").assertIsNotEnabled(); rule.onNodeWithTag("plus").assertIsEnabled() }

    @Test fun plusIsOffAtTheMost() { show(5, max = 5); rule.onNodeWithTag("plus").assertIsNotEnabled(); rule.onNodeWithTag("minus").assertIsEnabled() }

    @Test fun itKeepsNoStateOfItsOwn() { show(3); rule.onNodeWithTag("plus").performClick(); rule.onNodeWithTag("qty").assertTextEquals("3") }
}
`,
    },
    fix: { [J + 'cart/QuantityStepper.kt']: STEPPER_KT },
  },
  // ----- Flutter -----
  {
    id: 'dart-stepper',
    lang: 'dart',
    kind: 'enhance',
    key: 'APP-431',
    title: 'Let people choose how many of an item they want',
    shape: 'a new widget: what it shows, what it sends, when it is off',
    ticket:
      "People can only buy one of each item. They need a control to choose how many.\n\n**What it must do**\n\n- Add a widget `QuantityStepper` in a new file `lib/quantity_stepper.dart`, with the constructor `const QuantityStepper({super.key, required this.quantity, required this.onChanged, this.max = 9})`, where `onChanged` is a `ValueChanged<int>`.\n- It shows the quantity in a `Text` with the key `Key('qty')`.\n- An `IconButton` with the key `Key('minus')` calls `onChanged(quantity - 1)`. It is disabled (its `onPressed` is null) when the quantity is 1.\n- An `IconButton` with the key `Key('plus')` calls `onChanged(quantity + 1)`. It is disabled when the quantity is `max`.\n- It keeps no state of its own: the quantity it shows is the one it is given.",
    files: FL,
    oracle: {
      type: 'flutter',
      text: t`import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/quantity_stepper.dart';

Future<List<int>> show(WidgetTester tester, int quantity, {int max = 9}) async {
  final seen = <int>[];
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: QuantityStepper(quantity: quantity, onChanged: seen.add, max: max)))));
  return seen;
}

IconButton button(WidgetTester tester, String key) => tester.widget<IconButton>(find.byKey(Key(key)));
String? shown(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('qty'))).data;

void main() {
  testWidgets('it shows the quantity', (tester) async {
    await show(tester, 3);
    expect(shown(tester), '3');
  });
  testWidgets('plus asks for one more', (tester) async {
    final seen = await show(tester, 3);
    await tester.tap(find.byKey(const Key('plus')));
    expect(seen, [4]);
  });
  testWidgets('minus asks for one fewer', (tester) async {
    final seen = await show(tester, 3);
    await tester.tap(find.byKey(const Key('minus')));
    expect(seen, [2]);
  });
  testWidgets('minus is off at one', (tester) async {
    await show(tester, 1);
    expect(button(tester, 'minus').onPressed, isNull);
    expect(button(tester, 'plus').onPressed, isNotNull);
  });
  testWidgets('plus is off at the most', (tester) async {
    await show(tester, 5, max: 5);
    expect(button(tester, 'plus').onPressed, isNull);
    expect(button(tester, 'minus').onPressed, isNotNull);
  });
  testWidgets('it keeps no state of its own', (tester) async {
    await show(tester, 3);
    await tester.tap(find.byKey(const Key('plus')));
    await tester.pump();
    expect(shown(tester), '3');
  });
}
`,
    },
    fix: { 'lib/quantity_stepper.dart': STEPPER_DART },
  },
  {
    id: 'dart-summary',
    lang: 'dart',
    kind: 'enhance',
    key: 'APP-438',
    title: 'Show the count and the total under the cart',
    shape: 'two new functions and a new widget, in two files',
    ticket:
      'Under the list of the cart there is nothing that says how many things are in it or what they come to.\n\n**What it must do**\n\n- Add `String formatCents(int cents)` to `lib/cart.dart`: 2500 is `$25.00`, 5 is `$0.05`, and 1999 is `$19.99`.\n- Add `int cartCount(List<CartLine> lines)` to `lib/cart.dart`: the quantities added up.\n- Add a widget `CartSummary` in a new file `lib/cart_summary.dart`, with the constructor `const CartSummary({super.key, required this.lines})`.\n- It shows the count as `1 item` or `N items`, and the total as `formatCents(cartTotal(lines))`, each in a `Text` of its own.\n- With no lines it shows only `Your cart is empty`.',
    files: FL,
    oracle: {
      type: 'flutter',
      text: t`import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/cart.dart';
import 'package:shop_app/cart_summary.dart';

const mug = CartLine(name: 'Mug', cents: 1250, quantity: 2), tea = CartLine(name: 'Tea', cents: 400, quantity: 1);
Future<void> show(WidgetTester tester, List<CartLine> lines) => tester.pumpWidget(MaterialApp(home: Scaffold(body: CartSummary(lines: lines))));

void main() {
  test('two digits of cents', () {
    expect(formatCents(2500), r'$25.00');
    expect(formatCents(5), r'$0.05');
    expect(formatCents(1999), r'$19.99');
  });
  test('the count adds the quantities', () {
    expect(cartCount(const [mug, tea]), 3);
    expect(cartCount(const []), 0);
  });
  testWidgets('the summary shows the count and the total', (tester) async {
    await show(tester, const [mug, tea]);
    expect(find.text('3 items'), findsOneWidget);
    expect(find.text(r'$29.00'), findsOneWidget);
  });
  testWidgets('one thing is one item', (tester) async {
    await show(tester, const [tea]);
    expect(find.text('1 item'), findsOneWidget);
    expect(find.text(r'$4.00'), findsOneWidget);
  });
  testWidgets('an empty cart says so and nothing else', (tester) async {
    await show(tester, const []);
    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.textContaining('item'), findsNothing);
    expect(find.textContaining(r'$'), findsNothing);
  });
}
`,
    },
    fix: {
      'lib/cart.dart':
        FL['lib/cart.dart'] +
        t`
/// How many things are in a cart.
int cartCount(List<CartLine> lines) {
  return lines.fold(0, (sum, line) => sum + line.quantity);
}

/// Cents as text: 2500 is "$25.00".
String formatCents(int cents) {
  return '\$' + (cents ~/ 100).toString() + '.' + (cents % 100).toString().padLeft(2, '0');
}
`,
      'lib/cart_summary.dart': SUMMARY_DART,
    },
  },
  // ----- a ticket whose evidence is attached, not written -----
  {
    id: 'media-badge',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-251',
    title: 'The stock badge reads wrong on some products',
    shape: 'a screenshot: what is wrong, and the words it should say, are only in the picture',
    ticket:
      "The stock badge on the product page reads wrong for some products. A screenshot is attached: the arrow points at the badge, and the note on it says what it should read.\n\nThe badge's text comes from `stockBadge` in `stock-badge.mjs`.",
    media: [{ name: 'product-page.png', kind: 'image', html: BADGE_PAGE }],
    see: [/sold out/i, /-\s?2/],
    files: {
      'package.json': PKG,
      'stock-badge.mjs': t`// What the product page says about stock.
export function stockBadge(count) {
  if (count > 5) return 'In stock';
  return 'Only ' + count + ' left';
}
`,
      'stock-badge.test.mjs': t`import test from 'node:test';
import assert from 'node:assert/strict';
import { stockBadge } from './stock-badge.mjs';

test('plenty in stock', () => {
  assert.equal(stockBadge(40), 'In stock');
});
`,
    },
    oracle: {
      type: 'node',
      text:
        HEAD +
        t`import { stockBadge } from '@repo/stock-badge.mjs';

test('fewer than none is sold out', () => { assert.equal(stockBadge(-2), 'Sold out'); });
test('none is sold out', () => { assert.equal(stockBadge(0), 'Sold out'); });
test('one left', () => { assert.equal(stockBadge(1), 'Only 1 left'); });
test('five left', () => { assert.equal(stockBadge(5), 'Only 5 left'); });
test('six is in stock', () => { assert.equal(stockBadge(6), 'In stock'); });
`,
    },
    fix: {
      'stock-badge.mjs': t`// What the product page says about stock.
export function stockBadge(count) {
  if (count > 5) return 'In stock';
  if (count <= 0) return 'Sold out';
  return 'Only ' + count + ' left';
}
`,
    },
  },
  {
    id: 'media-crash',
    lang: 'python',
    kind: 'fix',
    key: 'SHOP-235',
    title: 'The morning dashboard crashes on some days',
    shape: 'a screenshot of an error, with a note that says what it should show',
    ticket:
      'The morning dashboard crashes on some days and shows nothing at all. A screenshot of what the ops team sees is attached, with their note on it.',
    media: [{ name: 'dashboard-error.png', kind: 'image', html: CRASH_PAGE }],
    see: [/ZeroDivision|division by zero/i, /average_order|report\.py/i],
    files: {
      'report.py': t`"""Numbers for the morning dashboard."""


def order_count(orders):
    """How many orders there were. orders is a list of totals, in dollars."""
    return len(orders)


def average_order(orders):
    """The average order, in dollars."""
    return sum(orders) / len(orders)
`,
      'dashboard.py': t`"""The morning dashboard, as text."""

from report import average_order, order_count


def row(label, value):
    return "%-16s %10.2f" % (label, value)


def render(orders):
    return "\n".join([row("Orders", order_count(orders)), row("Average order", average_order(orders))])
`,
      'test_report.py': t`import unittest

from report import average_order


class ReportTest(unittest.TestCase):
    def test_the_average_of_two_orders(self):
        self.assertEqual(average_order([10.0, 20.0]), 15.0)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: {
      type: 'unittest',
      text: t`import unittest

from dashboard import render
from report import average_order


class Oracle(unittest.TestCase):
    def test_a_day_with_no_orders_averages_nothing(self):
        self.assertEqual(average_order([]), 0)

    def test_the_dashboard_of_a_day_with_no_orders(self):
        lines = render([]).split("\n")
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[1].startswith("Average order"))
        self.assertTrue(lines[1].endswith("0.00"))

    def test_a_usual_day_is_as_before(self):
        self.assertEqual(average_order([10.0, 20.0, 60.0]), 30.0)
        self.assertTrue(render([10.0, 20.0]).split("\n")[1].endswith("15.00"))
`,
    },
    fix: {
      'report.py': t`"""Numbers for the morning dashboard."""


def order_count(orders):
    """How many orders there were. orders is a list of totals, in dollars."""
    return len(orders)


def average_order(orders):
    """The average order, in dollars. A day with no orders averages 0."""
    if not orders:
        return 0.0
    return sum(orders) / len(orders)
`,
    },
  },
  {
    id: 'media-stepper',
    lang: 'javascript',
    kind: 'fix',
    key: 'WEB-257',
    title: 'The quantity control on the product page misbehaves',
    shape: 'a screen recording: what each press does, and the limit on the page, are only in the video',
    ticket:
      'The quantity control on the product page misbehaves. A screen recording is attached: watch what the number does each time + is pressed, and what the page says under it.\n\nIt is `createStepper` in `stepper.mjs`.',
    media: [{ name: 'quantity-control.webm', kind: 'video', html: STEPPER_PAGE, seconds: 9 }],
    see: [/\b3\b/, /\b[57]\b/, /limit|5 per order/i],
    files: {
      'package.json': PKG,
      'stepper.mjs': t`// The quantity control on the product page: how many of a product a person wants.
export function createStepper({ start = 1, limit = 5 } = {}) {
  let quantity = start;
  return {
    limit,
    get quantity() { return quantity; },
    plus() { quantity += 2; return quantity; },
    minus() { quantity = Math.max(1, quantity - 1); return quantity; },
  };
}
`,
      'stepper.test.mjs': t`import test from 'node:test';
import assert from 'node:assert/strict';
import { createStepper } from './stepper.mjs';

test('it starts at one', () => {
  assert.equal(createStepper().quantity, 1);
});

test('minus never goes below one', () => {
  const stepper = createStepper();
  stepper.minus();
  assert.equal(stepper.quantity, 1);
});
`,
    },
    oracle: {
      type: 'node',
      text:
        HEAD +
        t`import { createStepper } from '@repo/stepper.mjs';

test('one press of plus adds one', () => { const s = createStepper(); assert.equal(s.plus(), 2); assert.equal(s.quantity, 2); });
test('plus stops at the limit', () => { const s = createStepper(); for (let i = 0; i < 10; i++) s.plus(); assert.equal(s.quantity, 5); });
test('a limit of its own is kept', () => { const s = createStepper({ limit: 3 }); for (let i = 0; i < 10; i++) s.plus(); assert.equal(s.quantity, 3); });
test('minus takes one off and stops at one', () => { const s = createStepper({ start: 3 }); assert.equal(s.minus(), 2); s.minus(); s.minus(); assert.equal(s.quantity, 1); });
`,
    },
    fix: {
      'stepper.mjs': t`// The quantity control on the product page: how many of a product a person wants.
export function createStepper({ start = 1, limit = 5 } = {}) {
  let quantity = start;
  return {
    limit,
    get quantity() { return quantity; },
    plus() { quantity = Math.min(limit, quantity + 1); return quantity; },
    minus() { quantity = Math.max(1, quantity - 1); return quantity; },
  };
}
`,
    },
  },
];
