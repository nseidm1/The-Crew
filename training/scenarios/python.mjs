// python.mjs - Python tickets. The six fixes in python-base.mjs, and an enhancement, an improvement and a find.
// The oracle is a unittest file run with the team's copy of the repository on its path. See ../scenarios.mjs for what each part is.
import { SCENARIOS as BASE } from './python-base.mjs';
const py = String.raw;

const MORE = [
  {
    id: 'py-columns',
    lang: 'python',
    kind: 'enhance',
    key: 'SHOP-192',
    title: 'Let finance choose the columns of the orders report',
    shape: 'a new optional parameter, old behaviour kept',
    ticket:
      'The finance team wants to choose which columns the orders report has, and in what order.\n\n**What it must do**\n\n- `to_csv(rows, columns=None)`: with `columns` given, only those columns appear, in that order.\n- A row that lacks one of the columns has an empty value there.\n- With no `columns`, it works exactly as it does today.\n- With no rows and `columns` given, only the header line is returned.\n\nIt is `to_csv` in `report.py`.',
    files: {
      'report.py': py`"""The orders report, as CSV."""


def to_csv(rows):
    """Rows (dicts) as CSV text: a header line, then one line a row."""
    if not rows:
        return ""
    names = list(rows[0].keys())
    lines = [",".join(names)]
    for row in rows:
        lines.append(",".join(str(row[name]) for name in names))
    return "\n".join(lines) + "\n"
`,
      'test_report.py': py`import unittest

from report import to_csv


class ReportTest(unittest.TestCase):
    def test_a_header_and_a_line_for_each_row(self):
        self.assertEqual(to_csv([{"id": 1, "total": 5}, {"id": 2, "total": 7}]), "id,total\n1,5\n2,7\n")


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: {
      type: 'unittest',
      text: py`import unittest

from report import to_csv


class Oracle(unittest.TestCase):
    def test_chosen_columns_in_the_chosen_order(self):
        self.assertEqual(to_csv([{"id": 1, "total": 5, "name": "a"}], columns=["name", "id"]), "name,id\na,1\n")

    def test_a_missing_value_is_empty(self):
        self.assertEqual(to_csv([{"id": 1}], columns=["id", "note"]), "id,note\n1,\n")

    def test_no_columns_is_as_before(self):
        self.assertEqual(to_csv([{"id": 1, "total": 5}, {"id": 2, "total": 7}]), "id,total\n1,5\n2,7\n")

    def test_no_rows_with_columns_is_the_header(self):
        self.assertEqual(to_csv([], columns=["id", "total"]), "id,total\n")

    def test_no_rows_and_no_columns_is_nothing(self):
        self.assertEqual(to_csv([]), "")
`,
    },
    fix: {
      'report.py': py`"""The orders report, as CSV."""


def to_csv(rows, columns=None):
    """Rows (dicts) as CSV text: a header line, then one line a row."""
    if columns is None:
        if not rows:
            return ""
        columns = list(rows[0].keys())
    lines = [",".join(columns)]
    for row in rows:
        lines.append(",".join(str(row.get(name, "")) for name in columns))
    return "\n".join(lines) + "\n"
`,
    },
  },
  {
    id: 'py-ship-check',
    lang: 'python',
    kind: 'improve',
    key: 'SHOP-198',
    title: 'Checking a wholesale order takes most of a minute',
    shape: 'same answers, far less work',
    ticket:
      'Checking a big wholesale order is slow: `order_can_ship` walks the whole product list again for every line of the order.\n\n**What it must do**\n\n- Give the same answers as today.\n- Check an order of 30,000 lines against 30,000 products in under half a second.\n- `stock_of` keeps working as it does.\n\nBoth are in `shipping.py`.',
    files: {
      'shipping.py': py`"""Can an order ship from what is in stock?"""


def stock_of(products, sku):
    """How many of a product are in stock. products is a list of (sku, count) pairs."""
    for name, count in products:
        if name == sku:
            return count
    return 0


def order_can_ship(products, order):
    """True when every line of the order is in stock. order is a list of (sku, wanted) pairs."""
    return all(stock_of(products, sku) >= wanted for sku, wanted in order)
`,
      'test_shipping.py': py`import unittest

from shipping import order_can_ship, stock_of


class ShippingTest(unittest.TestCase):
    def test_stock_of_a_known_product(self):
        self.assertEqual(stock_of([("mug", 3), ("tea", 9)], "tea"), 9)

    def test_an_order_within_stock_ships(self):
        self.assertTrue(order_can_ship([("mug", 3), ("tea", 9)], [("mug", 2), ("tea", 9)]))


if __name__ == "__main__":
    unittest.main()
`,
    },
    oracle: {
      type: 'unittest',
      text: py`import time
import unittest

from shipping import order_can_ship, stock_of


class Oracle(unittest.TestCase):
    def test_within_stock(self):
        self.assertTrue(order_can_ship([("mug", 3), ("tea", 9)], [("mug", 3), ("tea", 1)]))

    def test_one_line_short(self):
        self.assertFalse(order_can_ship([("mug", 3), ("tea", 9)], [("mug", 4), ("tea", 1)]))

    def test_a_product_not_stocked(self):
        self.assertFalse(order_can_ship([("mug", 3)], [("teapot", 1)]))

    def test_an_empty_order_ships(self):
        self.assertTrue(order_can_ship([("mug", 3)], []))

    def test_stock_of_still_works(self):
        self.assertEqual(stock_of([("mug", 3), ("tea", 9)], "tea"), 9)
        self.assertEqual(stock_of([("mug", 3)], "teapot"), 0)

    def test_a_big_order_is_quick(self):
        products = [("sku%d" % i, 5) for i in range(30000)]
        order = [("sku%d" % i, 5) for i in range(29999, -1, -1)]
        start = time.perf_counter()
        self.assertTrue(order_can_ship(products, order))
        took = time.perf_counter() - start
        self.assertLess(took, 0.5, "it took %.2f s" % took)
`,
    },
    fix: {
      'shipping.py': py`"""Can an order ship from what is in stock?"""


def stock_of(products, sku):
    """How many of a product are in stock. products is a list of (sku, count) pairs."""
    for name, count in products:
        if name == sku:
            return count
    return 0


def order_can_ship(products, order):
    """True when every line of the order is in stock. order is a list of (sku, wanted) pairs."""
    counts = {}
    for name, count in products:
        counts.setdefault(name, count)
    return all(counts.get(sku, 0) >= wanted for sku, wanted in order)
`,
    },
  },
  {
    id: 'py-where-levy',
    lang: 'python',
    kind: 'find',
    key: 'SHOP-203',
    title: 'Where is the sales tax set, and what is it today?',
    shape: 'find it: four files, one answer',
    ticket:
      'Finance says the sales tax changes next month. Before anyone changes anything: where in the code is the rate set, where is it applied to an order, and what is the rate today?',
    files: {
      'orders.py': py`"""An order, and what it comes to."""

from pricing.rules import add_levy


def order_total(lines):
    """What the customer pays, in cents. Each line is (cents, quantity)."""
    goods = sum(cents * quantity for cents, quantity in lines)
    return add_levy(goods)
`,
      'pricing/__init__.py': '',
      'pricing/rules.py': py`"""Pricing rules that apply to every order."""

SALES_LEVY = 0.08


def add_levy(cents):
    """An amount with the levy added, rounded to the cent."""
    return round(cents * (1 + SALES_LEVY))
`,
      'invoice.py': py`"""The invoice a customer is sent."""


def invoice_footer(country):
    """The small print at the foot of an invoice."""
    return "Prices include tax where it applies. Tax is shown for orders in " + country + "."
`,
      'test_orders.py': py`import unittest

from orders import order_total


class OrdersTest(unittest.TestCase):
    def test_an_order_with_the_levy(self):
        self.assertEqual(order_total([(1000, 1)]), 1080)


if __name__ == "__main__":
    unittest.main()
`,
    },
    find: { names: ['rules.py', 'SALES_LEVY', 'add_levy'], value: ['0.08', '8%', '8 %', '8 percent', 'eight percent'] },
  },
];

export const PYTHON = [
  ...BASE.map((s) => ({ lang: 'python', kind: 'fix', ...s, oracle: { type: 'unittest', text: s.oracle } })),
  ...MORE,
];
