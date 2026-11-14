// scenarios.mjs - WHAT THE TEAM IS TRAINED AND MEASURED ON. Each scenario is a small repository, a ticket written the way a real one is, and an
// ORACLE: a check the team never sees, written from the ticket alone. The team's own proof says "proven"; the oracle says whether that was true.
// The two can disagree, and the disagreements are the point: a proof that is green over wrong code is the failure a customer cannot see.
//   files    the repository as the customer has it (the oracle must FAIL on it)
//   ticket   what the ticket says, in the board's own words and marks
//   oracle   the hidden check, run against the team's change with the team's own proof left out
//   fix      a reference change the oracle must PASS on, so a scenario that cannot be passed is caught before a model is blamed for it
// Adding one: give it all four, then run   node training/train.mjs --check   which refuses a scenario whose oracle is not red on files and green on fix.
const py = String.raw;

export const SCENARIOS = [
  {
    id: 'pay-button',
    key: 'SHOP-142',
    title: 'Pay button is cut off on small phones',
    shape: 'one function, a clamp',
    ticket:
      'On a phone 360 px wide the Pay button at the foot of the checkout is drawn 400 px wide, so its right edge is cut off and people cannot press it.\n\n**What it must do**\n\n- The Pay button is never wider than the screen less a 16 px margin on each side.\n- On a screen wide enough for it, it stays 400 px wide.\n\nThe width comes from `pay_button_width` in `checkout.py`.',
    files: {
      'checkout.py': py`"""The checkout page's layout."""

BUTTON_WIDTH = 400
MARGIN = 16


def pay_button_width(screen_width):
    """How wide the Pay button is drawn, in pixels, on a screen this wide."""
    return BUTTON_WIDTH


def order_total(prices):
    """The total of an order, in cents."""
    return sum(prices)
`,
      'test_checkout.py': py`import unittest

from checkout import order_total, pay_button_width


class CheckoutTest(unittest.TestCase):
    def test_order_total_adds_the_prices(self):
        self.assertEqual(order_total([1200, 350]), 1550)

    def test_pay_button_is_400_wide_on_a_desktop(self):
        self.assertEqual(pay_button_width(1280), 400)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from checkout import order_total, pay_button_width


class Oracle(unittest.TestCase):
    def test_small_phone(self):
        self.assertEqual(pay_button_width(360), 328)

    def test_one_under_the_fit(self):
        self.assertEqual(pay_button_width(431), 399)

    def test_exact_fit(self):
        self.assertEqual(pay_button_width(432), 400)

    def test_wide_screen(self):
        self.assertEqual(pay_button_width(1280), 400)

    def test_the_total_is_untouched(self):
        self.assertEqual(order_total([1200, 350]), 1550)
`,
    fix: {
      'checkout.py': py`"""The checkout page's layout."""

BUTTON_WIDTH = 400
MARGIN = 16


def pay_button_width(screen_width):
    """How wide the Pay button is drawn, in pixels, on a screen this wide."""
    return min(BUTTON_WIDTH, screen_width - 2 * MARGIN)


def order_total(prices):
    """The total of an order, in cents."""
    return sum(prices)
`,
    },
  },
  {
    id: 'discount-code',
    key: 'SHOP-151',
    title: 'An unknown discount code crashes the checkout',
    shape: 'one function, three branches',
    ticket:
      'Typing a code the shop does not know stops the checkout with a KeyError.\n\n**What it must do**\n\n- A code the shop does not know leaves the total as it was.\n- Codes match whatever their case and with spaces around them ignored: ` save10 ` counts as `SAVE10`.\n- An empty code, or no code at all (`None`), leaves the total as it was.\n\nThe codes are in `CODES` in `cart.py`, and the total comes from `apply_discount`.',
    files: {
      'cart.py': py`"""The cart's discount codes."""

CODES = {"SAVE10": 10, "SAVE25": 25}


def apply_discount(total_cents, code):
    """The total after a discount code, in cents."""
    percent = CODES[code]
    return total_cents - total_cents * percent // 100
`,
      'test_cart.py': py`import unittest

from cart import apply_discount


class CartTest(unittest.TestCase):
    def test_save10_takes_a_tenth_off(self):
        self.assertEqual(apply_discount(2000, "SAVE10"), 1800)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from cart import apply_discount


class Oracle(unittest.TestCase):
    def test_unknown_code(self):
        self.assertEqual(apply_discount(2000, "FREESTUFF"), 2000)

    def test_case_and_spaces(self):
        self.assertEqual(apply_discount(2000, " save10 "), 1800)

    def test_empty_code(self):
        self.assertEqual(apply_discount(2000, ""), 2000)

    def test_no_code(self):
        self.assertEqual(apply_discount(2000, None), 2000)

    def test_a_known_code_still_works(self):
        self.assertEqual(apply_discount(1000, "SAVE25"), 750)
`,
    fix: {
      'cart.py': py`"""The cart's discount codes."""

CODES = {"SAVE10": 10, "SAVE25": 25}


def apply_discount(total_cents, code):
    """The total after a discount code, in cents."""
    percent = CODES.get((code or "").strip().upper(), 0)
    return total_cents - total_cents * percent // 100
`,
    },
  },
  {
    id: 'slug',
    key: 'SHOP-163',
    title: 'Product page addresses break on punctuation',
    shape: 'one function, text rules',
    ticket:
      'Product titles with punctuation or double spaces make broken addresses: `Blue  Mug (Large)!` becomes `blue--mug-(large)!`.\n\n**What it must do**\n\n- Only lower-case letters, digits and single dashes appear in the result.\n- Every run of other characters becomes one dash.\n- The result never starts or ends with a dash.\n- `Blue  Mug (Large)!` becomes `blue-mug-large`.\n\nThe address part comes from `slugify` in `slug.py`.',
    files: {
      'slug.py': py`"""Addresses for product pages."""


def slugify(title):
    """The part of a product page's address made from its title."""
    return title.lower().replace(" ", "-")
`,
      'test_slug.py': py`import unittest

from slug import slugify


class SlugTest(unittest.TestCase):
    def test_two_words(self):
        self.assertEqual(slugify("Hello World"), "hello-world")


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from slug import slugify


class Oracle(unittest.TestCase):
    def test_the_ticket_s_own_example(self):
        self.assertEqual(slugify("Blue  Mug (Large)!"), "blue-mug-large")

    def test_two_words(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_edges_are_trimmed(self):
        self.assertEqual(slugify("  A&B  "), "a-b")

    def test_digits_stay(self):
        self.assertEqual(slugify("Tea 2 Go"), "tea-2-go")

    def test_nothing_usable(self):
        self.assertEqual(slugify("---"), "")
`,
    fix: {
      'slug.py': py`"""Addresses for product pages."""

import re


def slugify(title):
    """The part of a product page's address made from its title."""
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
`,
    },
  },
  {
    id: 'pages',
    key: 'SHOP-170',
    title: 'The product listing skips products and loses its last page',
    shape: 'two functions, off by one',
    ticket:
      'Page 1 of the product listing skips the first products, and the last page is missing when the products do not fill it.\n\n**What it must do**\n\n- Page 1 shows the first `size` items, page 2 the next `size`, and so on.\n- `page_count` counts a last page that is only partly full: 7 items at 3 a page is 3 pages.\n- No items is 0 pages.\n- A page past the end is an empty list.\n\nBoth are in `listing.py`: `page_of` and `page_count`.',
    files: {
      'listing.py': py`"""The product listing's pages."""


def page_of(items, page, size):
    """The items shown on a page of the listing. Pages are numbered from 1."""
    start = page * size
    return items[start:start + size]


def page_count(items, size):
    """How many pages the listing has."""
    return len(items) // size
`,
      'test_listing.py': py`import unittest

from listing import page_count


class ListingTest(unittest.TestCase):
    def test_six_items_at_three_a_page(self):
        self.assertEqual(page_count([1, 2, 3, 4, 5, 6], 3), 2)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from listing import page_count, page_of


class Oracle(unittest.TestCase):
    def test_page_one(self):
        self.assertEqual(page_of(list(range(7)), 1, 3), [0, 1, 2])

    def test_page_two(self):
        self.assertEqual(page_of(list(range(7)), 2, 3), [3, 4, 5])

    def test_the_part_full_last_page(self):
        self.assertEqual(page_of(list(range(7)), 3, 3), [6])

    def test_past_the_end(self):
        self.assertEqual(page_of(list(range(7)), 4, 3), [])

    def test_count_with_a_part_full_page(self):
        self.assertEqual(page_count(list(range(7)), 3), 3)

    def test_count_when_full(self):
        self.assertEqual(page_count(list(range(6)), 3), 2)

    def test_count_of_nothing(self):
        self.assertEqual(page_count([], 3), 0)
`,
    fix: {
      'listing.py': py`"""The product listing's pages."""


def page_of(items, page, size):
    """The items shown on a page of the listing. Pages are numbered from 1."""
    start = (page - 1) * size
    return items[start:start + size]


def page_count(items, size):
    """How many pages the listing has."""
    return (len(items) + size - 1) // size
`,
    },
  },
  {
    id: 'receipt',
    key: 'SHOP-178',
    title: 'Prices on receipts are shown wrongly',
    shape: 'two files that must agree',
    ticket:
      "Prices on receipts are shown wrongly: `$12.5` instead of `$12.50`, and `$1234.0` instead of `$1,234.00`.\n\n**What it must do**\n\n- Every price has exactly two decimals and a comma between thousands: 1250 cents is `$12.50`, 123400 cents is `$1,234.00`, 5 cents is `$0.05`.\n- `receipt_line` in `receipt.py` shows its price through `format_price` in `money.py`, so the two always read the same: `receipt_line('Mug', 1250, 2)` is `Mug x2  $25.00`.",
    files: {
      'money.py': py`"""Money, shown to people."""


def format_price(cents):
    """A price in dollars, as text."""
    return "$" + str(cents / 100)
`,
      'receipt.py': py`"""The receipt a customer is sent."""

from money import format_price


def receipt_line(name, cents, quantity):
    """One line of a receipt."""
    return name + " x" + str(quantity) + "  $" + str(cents * quantity / 100)


def receipt_total(lines):
    """The receipt's last line. Each line is (name, cents, quantity)."""
    return "Total  " + format_price(sum(cents * quantity for _, cents, quantity in lines))
`,
      'test_receipt.py': py`import unittest

from receipt import receipt_line


class ReceiptTest(unittest.TestCase):
    def test_a_line_names_the_product_and_how_many(self):
        self.assertTrue(receipt_line("Mug", 1299, 1).startswith("Mug x1  $"))


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from money import format_price
from receipt import receipt_line, receipt_total


class Oracle(unittest.TestCase):
    def test_two_decimals(self):
        self.assertEqual(format_price(1250), "$12.50")

    def test_thousands(self):
        self.assertEqual(format_price(123400), "$1,234.00")

    def test_cents_only(self):
        self.assertEqual(format_price(5), "$0.05")

    def test_nothing(self):
        self.assertEqual(format_price(0), "$0.00")

    def test_a_line(self):
        self.assertEqual(receipt_line("Mug", 1250, 2), "Mug x2  $25.00")

    def test_the_total(self):
        self.assertEqual(receipt_total([("Mug", 1250, 2), ("Tea", 123400, 1)]), "Total  $1,259.00")
`,
    fix: {
      'money.py': py`"""Money, shown to people."""


def format_price(cents):
    """A price in dollars, as text."""
    return "$" + format(cents // 100, ",") + "." + format(cents % 100, "02d")
`,
      'receipt.py': py`"""The receipt a customer is sent."""

from money import format_price


def receipt_line(name, cents, quantity):
    """One line of a receipt."""
    return name + " x" + str(quantity) + "  " + format_price(cents * quantity)


def receipt_total(lines):
    """The receipt's last line. Each line is (name, cents, quantity)."""
    return "Total  " + format_price(sum(cents * quantity for _, cents, quantity in lines))
`,
    },
  },
  {
    id: 'stock',
    key: 'SHOP-185',
    title: 'Orders can take more of a product than the shop has',
    shape: 'a class with state',
    ticket:
      'Orders can take more of a product than the shop has, and its count goes below zero.\n\n**What it must do**\n\n- `take` returns `False` and changes nothing when fewer than `n` are in stock.\n- `take` returns `True` and lowers the count when there are enough.\n- Taking a product the shop has never stocked returns `False`.\n- `available` is never below zero.\n\nIt is the `Stock` class in `inventory.py`.',
    files: {
      'inventory.py': py`"""What the shop has in stock."""


class Stock:
    def __init__(self):
        self.counts = {}

    def add(self, sku, n):
        """Put n of a product into stock."""
        self.counts[sku] = self.counts.get(sku, 0) + n

    def take(self, sku, n):
        """Take n of a product out of stock for an order."""
        self.counts[sku] = self.counts.get(sku, 0) - n
        return True

    def available(self, sku):
        """How many of a product can still be ordered."""
        return self.counts.get(sku, 0)
`,
      'test_inventory.py': py`import unittest

from inventory import Stock


class StockTest(unittest.TestCase):
    def test_what_is_added_is_available(self):
        stock = Stock()
        stock.add("mug", 3)
        self.assertEqual(stock.available("mug"), 3)


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: py`import unittest

from inventory import Stock


class Oracle(unittest.TestCase):
    def test_too_many_is_refused_and_changes_nothing(self):
        stock = Stock()
        stock.add("mug", 3)
        self.assertIs(stock.take("mug", 5), False)
        self.assertEqual(stock.available("mug"), 3)

    def test_enough_is_taken(self):
        stock = Stock()
        stock.add("mug", 3)
        self.assertIs(stock.take("mug", 2), True)
        self.assertEqual(stock.available("mug"), 1)

    def test_all_of_it_can_be_taken(self):
        stock = Stock()
        stock.add("mug", 3)
        self.assertIs(stock.take("mug", 3), True)
        self.assertEqual(stock.available("mug"), 0)

    def test_never_stocked(self):
        stock = Stock()
        self.assertIs(stock.take("teapot", 1), False)
        self.assertEqual(stock.available("teapot"), 0)
`,
    fix: {
      'inventory.py': py`"""What the shop has in stock."""


class Stock:
    def __init__(self):
        self.counts = {}

    def add(self, sku, n):
        """Put n of a product into stock."""
        self.counts[sku] = self.counts.get(sku, 0) + n

    def take(self, sku, n):
        """Take n of a product out of stock for an order."""
        if self.counts.get(sku, 0) < n:
            return False
        self.counts[sku] -= n
        return True

    def available(self, sku):
        """How many of a product can still be ordered."""
        return max(0, self.counts.get(sku, 0))
`,
    },
  },
];

// the request as the chat sends it when a ticket is discussed: what the customer typed, then the ticket behind it
export const taskOf = (s) =>
  'Address ' +
  s.key +
  ': ' +
  s.title +
  ' It is about the ticket ' +
  s.key +
  ': ' +
  s.title +
  '. What the ticket says it must do: ' +
  s.ticket;
