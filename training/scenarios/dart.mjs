// dart.mjs - Flutter tickets: a Flutter app (shop_app) with flutter_test. The oracle is a test file put under test/ and run with
// "flutter test". Checked for real on 2026-11-12 with Flutter 3.50 (Dart 3.14).
const d = String.raw;
const PUBSPEC = d`name: shop_app
description: The Harbor Shop.
publish_to: none
version: 1.0.0

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter

dev_dependencies:
  flutter_test:
    sdk: flutter

flutter:
  uses-material-design: true
`;
const CART = d`class CartLine {
  const CartLine({required this.name, required this.cents, required this.quantity});

  final String name;
  final int cents;
  final int quantity;
}

/// The total of a cart, in cents.
int cartTotal(List<CartLine> lines) {
  return lines.fold(0, (sum, line) => sum + line.cents);
}
`;
const PAY = d`import 'package:flutter/material.dart';

/// The Pay button at the foot of the checkout.
class PayButton extends StatelessWidget {
  const PayButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 400,
      height: 48,
      child: ElevatedButton(onPressed: onPressed, child: const Text('Pay')),
    );
  }
}
`;
const CART_TEST = d`import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/cart.dart';

void main() {
  test('one of each adds the prices', () {
    expect(cartTotal(const [CartLine(name: 'Mug', cents: 1250, quantity: 1), CartLine(name: 'Tea', cents: 400, quantity: 1)]), 1650);
  });
}
`;
const BASE = {
  'pubspec.yaml': PUBSPEC,
  'lib/cart.dart': CART,
  'lib/pay_button.dart': PAY,
  'test/cart_test.dart': CART_TEST,
};

export const DART = [
  {
    id: 'dart-total',
    lang: 'dart',
    kind: 'fix',
    key: 'APP-401',
    title: 'The cart total ignores how many of each item there are',
    shape: 'one function, a missing factor',
    ticket:
      'Two mugs at 12.50 show a cart total of 12.50.\n\n**What it must do**\n\n- A line counts as its price times its quantity.\n- An empty cart totals 0.\n\nIt is `cartTotal` in `lib/cart.dart`. Prices are in cents.',
    files: BASE,
    oracle: {
      type: 'flutter',
      text: d`import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/cart.dart';

void main() {
  test('price times quantity', () {
    expect(cartTotal(const [CartLine(name: 'Mug', cents: 1250, quantity: 2)]), 2500);
  });
  test('several lines', () {
    expect(cartTotal(const [CartLine(name: 'Mug', cents: 1250, quantity: 2), CartLine(name: 'Tea', cents: 400, quantity: 3)]), 3700);
  });
  test('an empty cart', () {
    expect(cartTotal(const []), 0);
  });
}
`,
    },
    fix: { 'lib/cart.dart': CART.replace('sum + line.cents)', () => 'sum + line.cents * line.quantity)') },
  },
  {
    id: 'dart-pay-button',
    lang: 'dart',
    kind: 'fix',
    key: 'APP-408',
    title: 'The Pay button touches both edges on small phones',
    shape: 'a widget whose size must follow the screen',
    ticket:
      'On a phone 360 wide the Pay button at the foot of the checkout runs from one edge of the screen to the other, with no margin.\n\n**What it must do**\n\n- The Pay button is never wider than the screen less a margin of 16 on each side.\n- On a screen wide enough for it, it stays 400 wide.\n- It still says `Pay` and still calls `onPressed` when it is pressed.\n\nIt is the `PayButton` widget in `lib/pay_button.dart`.',
    files: BASE,
    oracle: {
      type: 'flutter',
      text: d`import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/pay_button.dart';

Future<double> widthOn(WidgetTester tester, double screen, {VoidCallback? onPressed}) async {
  tester.view.physicalSize = Size(screen, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: PayButton(onPressed: onPressed ?? () {})))));
  return tester.getSize(find.byType(ElevatedButton)).width;
}

void main() {
  testWidgets('a small phone leaves a margin of 16 each side', (tester) async {
    expect(await widthOn(tester, 360), 328);
  });
  testWidgets('a screen it just fits', (tester) async {
    expect(await widthOn(tester, 432), 400);
  });
  testWidgets('a wide screen keeps it at 400', (tester) async {
    expect(await widthOn(tester, 1280), 400);
  });
  testWidgets('it says Pay and can be pressed', (tester) async {
    var pressed = 0;
    await widthOn(tester, 360, onPressed: () => pressed++);
    expect(find.text('Pay'), findsOneWidget);
    await tester.tap(find.byType(ElevatedButton));
    expect(pressed, 1);
  });
}
`,
    },
    fix: {
      'lib/pay_button.dart': PAY.replace(
        '    return SizedBox(\n      width: 400,',
        () =>
          '    final available = MediaQuery.sizeOf(context).width - 32;\n    return SizedBox(\n      width: available < 400 ? available : 400,',
      ),
    },
  },
  {
    id: 'dart-badge',
    lang: 'dart',
    kind: 'enhance',
    key: 'APP-415',
    title: 'Show how many are left when stock is low',
    shape: 'a new function with three cases',
    ticket:
      'People cannot tell when a product is about to run out.\n\n**What it must do**\n\n- Add `String stockBadge(int count)` in a new file `lib/stock_badge.dart`.\n- 0, or anything below 0, is `Sold out`.\n- 1 to 5 is `Only N left`, with the number: `Only 3 left`.\n- 6 or more is `In stock`.',
    files: BASE,
    oracle: {
      type: 'flutter',
      text: d`import 'package:flutter_test/flutter_test.dart';
import 'package:shop_app/stock_badge.dart';

void main() {
  test('sold out', () => expect(stockBadge(0), 'Sold out'));
  test('below zero', () => expect(stockBadge(-2), 'Sold out'));
  test('one left', () => expect(stockBadge(1), 'Only 1 left'));
  test('five left', () => expect(stockBadge(5), 'Only 5 left'));
  test('six', () => expect(stockBadge(6), 'In stock'));
}
`,
    },
    fix: {
      'lib/stock_badge.dart': d`/// What the product page says about stock.
String stockBadge(int count) {
  if (count <= 0) return 'Sold out';
  if (count <= 5) return 'Only $count left';
  return 'In stock';
}
`,
    },
  },
  {
    id: 'dart-where-delivery',
    lang: 'dart',
    kind: 'find',
    key: 'APP-422',
    title: 'Where is free delivery decided?',
    shape: 'find it: five files, one answer',
    ticket:
      'Marketing wants to raise the order value that earns free delivery. Before anyone changes anything: where in the code is that decided, and what is it today?',
    files: {
      ...BASE,
      'lib/delivery/rates.dart': d`const int _noChargeFrom = 7500;

/// What delivery costs for an order of this value, in cents.
int deliveryCost(int goodsCents, {required bool near}) {
  if (goodsCents >= _noChargeFrom) return 0;
  return near ? 495 : 1295;
}
`,
      'lib/banner.dart': d`/// The strip at the top of the shop.
String bannerText(String season) {
  return season == 'winter' ? 'Free delivery on bigger orders, all winter' : 'New in: the autumn range';
}
`,
    },
    find: { names: ['rates.dart', '_noChargeFrom'], value: ['7500', '75'] },
  },
];
