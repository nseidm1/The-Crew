// kotlin.mjs - Android tickets: a Kotlin app with Jetpack Compose (shop-android), tested with JUnit and Robolectric. The "find" tickets need
// no build and run anywhere. The others have a JUnit oracle put into app/src/test and run by Gradle (:app:testDebugUnitTest), the Pay button's
// with Robolectric and a Compose test rule on a 360 dp screen. Checked for real on 2026-11-12 (Android plugin 9.3.3, Gradle 9.5, SDK 37, the
// Compose 1.12 that needs them). The Gradle wrapper is made by train.mjs from a Gradle the machine already has, since a jar cannot be text here.
const kt = String.raw;
const SETTINGS = kt`pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "shop-android"
include(":app")
`;
const ROOT_BUILD = kt`plugins {
    id("com.android.application") version "9.3.3" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.20" apply false
}
`;
const APP_BUILD = kt`plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "shop.harbor"
    compileSdk = 37

    defaultConfig {
        applicationId = "shop.harbor"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.13.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation(platform("androidx.compose:compose-bom:2026.08.00"))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
`;
const MANIFEST = kt`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name" android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
const STRINGS = kt`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Harbor Shop</string>
    <string name="checkout_title">Your order</string>
    <string name="pay_button">Pay</string>
    <string name="winter_banner">Free delivery on bigger orders, all winter</string>
</resources>
`;
const MAIN = kt`package shop.harbor

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import shop.harbor.cart.CartLine
import shop.harbor.checkout.CheckoutScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CheckoutScreen(lines = listOf(CartLine("Mug", 1250, 2)), onPay = {})
        }
    }
}
`;
const CHECKOUT = kt`package shop.harbor.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import shop.harbor.R
import shop.harbor.cart.Cart
import shop.harbor.cart.CartLine

@Composable
fun CheckoutScreen(lines: List<CartLine>, onPay: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = stringResource(R.string.checkout_title))
        Text(text = Cart.format(Cart.total(lines)))
        PayButton(onPay = onPay)
    }
}

@Composable
fun PayButton(onPay: () -> Unit, modifier: Modifier = Modifier) {
    Button(onClick = onPay, modifier = modifier.width(400.dp).height(48.dp).testTag("pay")) {
        Text(text = stringResource(R.string.pay_button))
    }
}
`;
const CART = kt`package shop.harbor.cart

data class CartLine(val name: String, val cents: Int, val quantity: Int)

object Cart {
    /** The total of a cart, in cents. */
    fun total(lines: List<CartLine>): Int = lines.sumOf { it.cents }

    /** A price in dollars, as text. */
    fun format(cents: Int): String = "$" + cents / 100.0
}
`;
const RATES = kt`package shop.harbor.delivery

private const val NO_CHARGE_FROM = 7_500

/** What delivery costs for an order of this value, in cents. */
fun deliveryCost(goodsCents: Int, near: Boolean): Int {
    if (goodsCents >= NO_CHARGE_FROM) return 0
    return if (near) 495 else 1295
}
`;
const CART_TEST = kt`package shop.harbor.cart

import org.junit.Assert.assertEquals
import org.junit.Test

class CartTest {
    @Test
    fun oneOfEachAddsThePrices() {
        assertEquals(1650, Cart.total(listOf(CartLine("Mug", 1250, 1), CartLine("Tea", 400, 1))))
    }
}
`;
const J = 'app/src/main/java/shop/harbor/';
const BASE = {
  'settings.gradle.kts': SETTINGS,
  'build.gradle.kts': ROOT_BUILD,
  'gradle.properties': 'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2g\n',
  'app/build.gradle.kts': APP_BUILD,
  'app/src/main/AndroidManifest.xml': MANIFEST,
  'app/src/main/res/values/strings.xml': STRINGS,
  [J + 'MainActivity.kt']: MAIN,
  [J + 'checkout/CheckoutScreen.kt']: CHECKOUT,
  [J + 'cart/Cart.kt']: CART,
  [J + 'delivery/Rates.kt']: RATES,
  'app/src/test/java/shop/harbor/cart/CartTest.kt': CART_TEST,
  'app/src/test/resources/robolectric.properties': 'sdk=35\n',
};

export const KOTLIN = [
  {
    id: 'kt-total',
    lang: 'kotlin',
    kind: 'fix',
    key: 'AND-501',
    title: 'The cart total ignores how many of each item there are',
    shape: 'one function, a missing factor',
    ticket:
      'Two mugs at $12.50 show a cart total of $12.50.\n\n**What it must do**\n\n- A line counts as its price times its quantity.\n- An empty cart totals 0.\n\nIt is `Cart.total` in `app/src/main/java/shop/harbor/cart/Cart.kt`. Prices are in cents.',
    files: BASE,
    oracle: {
      type: 'gradle',
      file: 'app/src/test/java/oracle/OracleTest.kt',
      test: 'oracle.OracleTest',
      text: kt`package oracle

import org.junit.Assert.assertEquals
import org.junit.Test
import shop.harbor.cart.Cart
import shop.harbor.cart.CartLine

class OracleTest {
    @Test fun priceTimesQuantity() = assertEquals(2500, Cart.total(listOf(CartLine("Mug", 1250, 2))))
    @Test fun severalLines() = assertEquals(3700, Cart.total(listOf(CartLine("Mug", 1250, 2), CartLine("Tea", 400, 3))))
    @Test fun anEmptyCart() = assertEquals(0, Cart.total(emptyList()))
}
`,
    },
    fix: {
      [J + 'cart/Cart.kt']: CART.replace('lines.sumOf { it.cents }', () => 'lines.sumOf { it.cents * it.quantity }'),
    },
  },
  {
    id: 'kt-pay-button',
    lang: 'kotlin',
    kind: 'fix',
    key: 'AND-508',
    title: 'Pay button is cut off on small phones',
    shape: 'a composable whose size must follow the screen',
    ticket:
      'On a phone 360 dp wide the Pay button at the foot of the checkout is drawn 400 dp wide, so its right edge is cut off and people cannot press it.\n\n**What it must do**\n\n- The Pay button is never wider than the screen less a 16 dp margin on each side.\n- On a screen wide enough for it, it stays 400 dp wide.\n- It keeps its test tag `pay`, its height and its text.\n\nIt is the `PayButton` composable in `app/src/main/java/shop/harbor/checkout/CheckoutScreen.kt`.',
    files: BASE,
    oracle: {
      type: 'gradle',
      file: 'app/src/test/java/oracle/OracleTest.kt',
      test: 'oracle.OracleTest',
      text: kt`package oracle

import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import shop.harbor.cart.CartLine
import shop.harbor.checkout.CheckoutScreen

@RunWith(RobolectricTestRunner::class)
class OracleTest {
    @get:Rule val rule = createComposeRule()

    private fun show() = rule.setContent { CheckoutScreen(lines = listOf(CartLine("Mug", 1250, 1)), onPay = {}) }

    @Test @Config(qualifiers = "w360dp-h800dp-mdpi")
    fun aSmallPhoneLeavesAMarginEachSide() { show(); rule.onNodeWithTag("pay").assertWidthIsEqualTo(328.dp) }

    @Test @Config(qualifiers = "w432dp-h800dp-mdpi")
    fun aScreenItJustFits() { show(); rule.onNodeWithTag("pay").assertWidthIsEqualTo(400.dp) }

    @Test @Config(qualifiers = "w800dp-h1280dp-mdpi")
    fun aWideScreenKeepsItAt400() { show(); rule.onNodeWithTag("pay").assertWidthIsEqualTo(400.dp) }

    @Test @Config(qualifiers = "w360dp-h800dp-mdpi")
    fun itStillSaysPayAndCanBePressed() { show(); rule.onNodeWithText("Pay").assertHasClickAction() }
}
`,
    },
    fix: {
      [J + 'checkout/CheckoutScreen.kt']: CHECKOUT.replace(
        'import androidx.compose.foundation.layout.width\n',
        () =>
          'import androidx.compose.foundation.layout.fillMaxWidth\nimport androidx.compose.foundation.layout.padding\nimport androidx.compose.foundation.layout.widthIn\n',
      ).replace(
        'modifier = modifier.width(400.dp).height(48.dp).testTag("pay")',
        () =>
          'modifier = modifier.padding(horizontal = 16.dp).widthIn(max = 400.dp).fillMaxWidth().height(48.dp).testTag("pay")',
      ),
    },
  },
  {
    id: 'kt-badge',
    lang: 'kotlin',
    kind: 'enhance',
    key: 'AND-515',
    title: 'Show how many are left when stock is low',
    shape: 'a new function with three cases',
    ticket:
      'People cannot tell when a product is about to run out.\n\n**What it must do**\n\n- Add `fun stockBadge(count: Int): String` in a new file `app/src/main/java/shop/harbor/stock/StockBadge.kt`, in the package `shop.harbor.stock`.\n- 0, or anything below 0, is `Sold out`.\n- 1 to 5 is `Only N left`, with the number: `Only 3 left`.\n- 6 or more is `In stock`.',
    files: BASE,
    oracle: {
      type: 'gradle',
      file: 'app/src/test/java/oracle/OracleTest.kt',
      test: 'oracle.OracleTest',
      text: kt`package oracle

import org.junit.Assert.assertEquals
import org.junit.Test
import shop.harbor.stock.stockBadge

class OracleTest {
    @Test fun soldOut() = assertEquals("Sold out", stockBadge(0))
    @Test fun belowZero() = assertEquals("Sold out", stockBadge(-2))
    @Test fun oneLeft() = assertEquals("Only 1 left", stockBadge(1))
    @Test fun fiveLeft() = assertEquals("Only 5 left", stockBadge(5))
    @Test fun six() = assertEquals("In stock", stockBadge(6))
}
`,
    },
    fix: {
      [J + 'stock/StockBadge.kt']: kt`package shop.harbor.stock

/** What the product page says about stock. */
fun stockBadge(count: Int): String = when {
    count <= 0 -> "Sold out"
    count <= 5 -> "Only $count left"
    else -> "In stock"
}
`,
    },
  },
  {
    id: 'kt-where-delivery',
    lang: 'kotlin',
    kind: 'find',
    key: 'AND-522',
    title: 'Where is free delivery decided?',
    shape: 'find it: an Android app, one answer',
    ticket:
      'Marketing wants to raise the order value that earns free delivery. Before anyone changes anything: where in the code is that decided, and what is it today?',
    files: BASE,
    find: { names: ['Rates.kt', 'NO_CHARGE_FROM'], value: ['7_500', '7500', '75'] },
  },
  {
    id: 'kt-where-pay-text',
    lang: 'kotlin',
    kind: 'find',
    key: 'AND-529',
    title: 'Where does the Pay button get its text?',
    shape: 'find it: from a screen to its string resource',
    ticket:
      'The button at the foot of the checkout says `Pay`, and marketing wants it to say `Pay now`. Before anyone changes anything: where is that text kept, what is it called there, and which screen shows it?',
    files: BASE,
    find: { names: ['strings.xml', 'pay_button', 'CheckoutScreen.kt'], value: [] },
  },
];
