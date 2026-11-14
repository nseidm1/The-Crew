// swift.mjs - Swift tickets: a Swift package (ShopKit) with XCTest. The oracle is an XCTest file put into the package's test target and run
// with "swift test". NOT YET RUN ANYWHERE: the machine these were written on has no working swift command, so --check skips them and
// says so. On a machine with Swift, run   node training/train.mjs --check --lang swift   before trusting a result from them.
const sw = String.raw;
const PACKAGE = sw`// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ShopKit",
    targets: [
        .target(name: "ShopKit"),
        .testTarget(name: "ShopKitTests", dependencies: ["ShopKit"]),
    ]
)
`;
const CART = sw`import Foundation

public struct CartLine {
    public let name: String
    public let cents: Int
    public let quantity: Int

    public init(name: String, cents: Int, quantity: Int) {
        self.name = name
        self.cents = cents
        self.quantity = quantity
    }
}

public enum Cart {
    /// The total of a cart, in cents.
    public static func total(_ lines: [CartLine]) -> Int {
        lines.reduce(0) { $0 + $1.cents }
    }

    /// A price in dollars, as text.
    public static func format(cents: Int) -> String {
        "$" + String(Double(cents) / 100)
    }
}
`;
const CART_TESTS = sw`import XCTest
@testable import ShopKit

final class CartTests: XCTestCase {
    func testOneOfEachAddsThePrices() {
        XCTAssertEqual(Cart.total([CartLine(name: "Mug", cents: 1250, quantity: 1), CartLine(name: "Tea", cents: 400, quantity: 1)]), 1650)
    }
}
`;
const BASE = {
  'Package.swift': PACKAGE,
  'Sources/ShopKit/Cart.swift': CART,
  'Tests/ShopKitTests/CartTests.swift': CART_TESTS,
};

export const SWIFT = [
  {
    id: 'swift-total',
    lang: 'swift',
    kind: 'fix',
    key: 'IOS-301',
    title: 'The cart total ignores how many of each item there are',
    shape: 'one function, a missing factor',
    ticket:
      'Two mugs at $12.50 show a cart total of $12.50.\n\n**What it must do**\n\n- A line counts as its price times its quantity.\n- An empty cart totals 0.\n\nIt is `Cart.total` in `Sources/ShopKit/Cart.swift`. Prices are in cents.',
    files: BASE,
    oracle: {
      type: 'swift',
      target: 'ShopKitTests',
      text: sw`import XCTest
@testable import ShopKit

final class OracleTests: XCTestCase {
    func testPriceTimesQuantity() {
        XCTAssertEqual(Cart.total([CartLine(name: "Mug", cents: 1250, quantity: 2)]), 2500)
    }

    func testSeveralLines() {
        XCTAssertEqual(Cart.total([CartLine(name: "Mug", cents: 1250, quantity: 2), CartLine(name: "Tea", cents: 400, quantity: 3)]), 3700)
    }

    func testAnEmptyCart() {
        XCTAssertEqual(Cart.total([]), 0)
    }
}
`,
    },
    fix: {
      'Sources/ShopKit/Cart.swift': CART.replace(
        'lines.reduce(0) { $0 + $1.cents }',
        () => 'lines.reduce(0) { $0 + $1.cents * $1.quantity }',
      ),
    },
  },
  {
    id: 'swift-format',
    lang: 'swift',
    kind: 'fix',
    key: 'IOS-308',
    title: 'Prices are shown as $12.5 and $1234.0',
    shape: 'one function, formatting by rule',
    ticket:
      "Prices in the cart read `$12.5` instead of `$12.50`, and `$1234.0` instead of `$1,234.00`.\n\n**What it must do**\n\n- Every price has exactly two decimals: 1250 cents is `$12.50`, 5 cents is `$0.05`, 0 is `$0.00`.\n- Thousands are separated by a comma: 123400 cents is `$1,234.00`.\n- The result does not depend on the phone's language or region.\n\nIt is `Cart.format(cents:)` in `Sources/ShopKit/Cart.swift`.",
    files: BASE,
    oracle: {
      type: 'swift',
      target: 'ShopKitTests',
      text: sw`import XCTest
@testable import ShopKit

final class OracleTests: XCTestCase {
    func testTwoDecimals() { XCTAssertEqual(Cart.format(cents: 1250), "$12.50") }
    func testCentsOnly() { XCTAssertEqual(Cart.format(cents: 5), "$0.05") }
    func testNothing() { XCTAssertEqual(Cart.format(cents: 0), "$0.00") }
    func testThousands() { XCTAssertEqual(Cart.format(cents: 123400), "$1,234.00") }
    func testMillions() { XCTAssertEqual(Cart.format(cents: 123456789), "$1,234,567.89") }
}
`,
    },
    fix: {
      'Sources/ShopKit/Cart.swift': CART.replace(
        '"$" + String(Double(cents) / 100)',
        () => sw`var whole = String(cents / 100)
        var grouped = ""
        while whole.count > 3 {
            grouped = "," + String(whole.suffix(3)) + grouped
            whole = String(whole.dropLast(3))
        }
        let rest = cents % 100
        return "$" + whole + grouped + "." + (rest < 10 ? "0" : "") + String(rest)`,
      ),
    },
  },
  {
    id: 'swift-badge',
    lang: 'swift',
    kind: 'enhance',
    key: 'IOS-315',
    title: 'Show how many are left when stock is low',
    shape: 'a new function with three cases',
    ticket:
      'People cannot tell when a product is about to run out.\n\n**What it must do**\n\n- Add `StockBadge.text(for count: Int) -> String` in a new file `Sources/ShopKit/StockBadge.swift`, as a public enum `StockBadge` with that public static function.\n- 0, or anything below 0, is `Sold out`.\n- 1 to 5 is `Only N left`, with the number: `Only 3 left`.\n- 6 or more is `In stock`.',
    files: BASE,
    oracle: {
      type: 'swift',
      target: 'ShopKitTests',
      text: sw`import XCTest
@testable import ShopKit

final class OracleTests: XCTestCase {
    func testSoldOut() { XCTAssertEqual(StockBadge.text(for: 0), "Sold out") }
    func testBelowZero() { XCTAssertEqual(StockBadge.text(for: -2), "Sold out") }
    func testOneLeft() { XCTAssertEqual(StockBadge.text(for: 1), "Only 1 left") }
    func testFiveLeft() { XCTAssertEqual(StockBadge.text(for: 5), "Only 5 left") }
    func testSix() { XCTAssertEqual(StockBadge.text(for: 6), "In stock") }
    func testTheCartStillAddsUp() { XCTAssertEqual(Cart.total([CartLine(name: "Mug", cents: 1250, quantity: 1)]), 1250) }
}
`,
    },
    fix: {
      'Sources/ShopKit/StockBadge.swift': sw`import Foundation

public enum StockBadge {
    /// What the product page says about stock.
    public static func text(for count: Int) -> String {
        if count <= 0 { return "Sold out" }
        if count <= 5 { return "Only \(count) left" }
        return "In stock"
    }
}
`,
    },
  },
  {
    id: 'swift-where-delivery',
    lang: 'swift',
    kind: 'find',
    key: 'IOS-322',
    title: 'Where is free delivery decided?',
    shape: 'find it: four files, one answer',
    ticket:
      'Marketing wants to raise the order value that earns free delivery. Before anyone changes anything: where in the code is that decided, and what is it today?',
    files: {
      ...BASE,
      'Sources/ShopKit/Delivery/Rates.swift': sw`import Foundation

public enum Rates {
    static let noChargeFrom = 7500

    /// What delivery costs for an order of this value, in cents.
    public static func delivery(forGoods cents: Int, near: Bool) -> Int {
        if cents >= noChargeFrom { return 0 }
        return near ? 495 : 1295
    }
}
`,
      'Sources/ShopKit/Banner.swift': sw`import Foundation

public enum Banner {
    /// The strip at the top of the shop.
    public static func text(season: String) -> String {
        season == "winter" ? "Free delivery on bigger orders, all winter" : "New in: the autumn range"
    }
}
`,
    },
    find: { names: ['Rates.swift', 'noChargeFrom'], value: ['7500', '75'] },
  },
];
