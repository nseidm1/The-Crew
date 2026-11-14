package eth.myfamilyoffice.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ClientCertRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

/**
 * The whole app is one screen. Either it says where things stand (not paired, pairing, cannot reach the computer), or it shows the
 * customer's own Family Office, which is the same pages the computer shows, fetched from the computer through the phone link.
 * Nothing of the team is kept on the phone except what those pages keep for themselves; nothing is sent anywhere but the computer.
 *
 * What the phone remembers (its own settings, private to the app): the computer's certificate fingerprint, the two addresses it was
 * last told the computer has (on the home network, and from outside), the computer's name, and whether pairing finished.
 */
public class MainActivity extends Activity {
  private static final int INK = 0xFF05070C, FOG = 0xFFE9EEF5, MIST = 0xFFA3AFC1, JADE = 0xFF34D399, JADE_INK = 0xFF04251C;
  private final Handler ui = new Handler(Looper.getMainLooper());
  private SharedPreferences prefs;
  private WebView web;
  private ScrollView panel;
  private TextView title, text, digits;
  private Button first, second;
  private volatile int turn = 0;   // a newer attempt makes an older one stop
  private String base = "";        // https://address:port of the computer, once it has answered

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    prefs = getSharedPreferences("link", MODE_PRIVATE);
    getWindow().setStatusBarColor(INK); getWindow().setNavigationBarColor(INK);
    FrameLayout root = new FrameLayout(this); root.setBackgroundColor(INK);
    web = new WebView(this); web.setBackgroundColor(INK); web.setVisibility(View.GONE);
    web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " FamilyOffice-Android/1");   // the pages know by this that the runner is right behind them
    web.setWebViewClient(new Pages());
    root.addView(web, new FrameLayout.LayoutParams(-1, -1));
    panel = new ScrollView(this); panel.setFillViewport(true);
    LinearLayout col = new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL); col.setGravity(Gravity.CENTER_VERTICAL); int pad = dp(28); col.setPadding(pad, pad, pad, pad);
    title = label(30, FOG, true); text = label(17, MIST, false); digits = label(44, FOG, true); digits.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); digits.setLetterSpacing(.08f);
    first = button(true); second = button(false);
    col.addView(title); col.addView(space(14)); col.addView(text); col.addView(space(18)); col.addView(digits); col.addView(space(22)); col.addView(first); col.addView(space(10)); col.addView(second);
    panel.addView(col, new ScrollView.LayoutParams(-1, -1)); root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    // the page draws under the system's bars on newer Android: keep everything clear of them, and of the keyboard
    root.setOnApplyWindowInsetsListener((v, in) -> {
      if (Build.VERSION.SDK_INT >= 30) { android.graphics.Insets b = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime()); v.setPadding(b.left, b.top, b.right, b.bottom); }
      else v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
      return in;
    });
    setContentView(root);
    if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
    open(getIntent());
  }
  @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); open(i); }
  @Override public void onBackPressed() { back(); }
  private void back() { if (web.getVisibility() == View.VISIBLE && web.canGoBack()) web.goBack(); else moveTaskToBack(true); }

  /** What the app was opened with decides what it does: a pairing link pairs; otherwise it connects, if it has ever been paired. */
  private void open(Intent i) {
    Uri u = i == null ? null : i.getData();
    if (u != null && "familyoffice".equals(u.getScheme()) && "pair".equals(u.getHost())) { i.setData(null); pair(u); }
    else if (prefs.getBoolean("paired", false)) connect();
    else if (web.getVisibility() != View.VISIBLE) say("Not paired yet", "On your computer, open Family Office and go to the Remote tab. Switch Remote on, show a pairing code, then point this phone's camera at it and open the link.", "", null, null, null, null);
  }

  // ---------- pairing: say the one-time secret, show the six digits, wait for Allow on the computer ----------
  private void pair(Uri u) {
    final String k = u.getQueryParameter("k"), f = u.getQueryParameter("f"), h = u.getQueryParameter("h"), p = u.getQueryParameter("p"), n = u.getQueryParameter("n");
    if (k == null || f == null || f.length() != 43 || h == null || h.isEmpty()) { say("That code could not be read", "Show a new pairing code on the Remote tab of your computer and scan it again.", "", null, null, null, null); return; }
    final String name = n == null || n.isEmpty() ? "your computer" : n;
    prefs.edit().putString("f", f).putString("h", h).putString("p", p == null ? "" : p).putString("n", name).putBoolean("paired", false).apply();
    final int mine = ++turn; web.setVisibility(View.GONE); base = "";
    say("Pairing with " + name, "Asking it to let this phone in…", "", null, null, null, null);
    new Thread(() -> {
      try {
        Link.ensureKey();
        String at = null, code = null, why = "It did not answer. This phone has to be on the same Wi-Fi as the computer to pair.";
        for (String c : places()) {
          try {
            String r = Link.ask(f, "https://" + c + "/pair", "POST", new JSONObject().put("k", k).put("name", (Build.MANUFACTURER + " " + Build.MODEL).trim()).toString(), 6000);
            if (r.startsWith("200\n")) { JSONObject j = new JSONObject(r.substring(4)); at = c; code = j.optString("code");
              if ("paired".equals(j.optString("state"))) { prefs.edit().putBoolean("paired", true).putString("last", c).commit(); if (mine == turn) ui.post(this::connect); return; }   // this phone was already paired with that computer
              break; }
            if (r.startsWith("403\n")) { why = "That pairing code is no longer the one on the computer. Show a new one on the Remote tab and scan it again."; break; }
          } catch (Exception e) { /* the next address */ }
        }
        if (mine != turn) return;
        if (at == null) { final String w = why; ui.post(() -> say("Could not pair", w, "", "Try again", () -> pair(u), null, null)); return; }
        final String shown = code.length() == 6 ? code.substring(0, 3) + " " + code.substring(3) : code, where = at;
        ui.post(() -> say("Check this code", "The same six digits are on the Remote tab of " + name + ". If they match, press Allow there.", shown, null, null, null, null));
        for (int i = 0; i < 300 && mine == turn; i++) {
          Thread.sleep(2000);
          String state; try { String r = Link.ask(f, "https://" + where + "/pair/state", "GET", null, 6000); state = r.startsWith("200\n") ? new JSONObject(r.substring(4)).optString("state") : ""; } catch (Exception e) { state = ""; }
          if (mine != turn) return;
          if ("paired".equals(state)) { prefs.edit().putBoolean("paired", true).putString("last", where).commit(); ui.post(this::connect); return; }
          if ("refused".equals(state)) { ui.post(() -> say("Not allowed", "The request was refused on the computer.", "", "Close", this::finish, null, null)); return; }
        }
        if (mine == turn) ui.post(() -> say("Nobody pressed Allow", "The pairing code ran out. Show a new one on the Remote tab and scan it again.", "", null, null, null, null));
      } catch (Exception e) {
        if (mine == turn) ui.post(() -> say("Could not pair", "This phone could not make its key: " + e.getMessage(), "", null, null, null, null));
      }
    }).start();
  }

  // ---------- connecting: the address that worked last, then the home one, then the outside one ----------
  private List<String> places() {
    List<String> out = new ArrayList<>();
    for (String c : new String[] { prefs.getString("last", ""), prefs.getString("h", ""), prefs.getString("p", "") }) if (c != null && !c.isEmpty() && !out.contains(c)) out.add(c);
    return out;
  }
  private void connect() {
    final String f = prefs.getString("f", ""), name = prefs.getString("n", "your computer"); final int mine = ++turn;
    if (web.getVisibility() != View.VISIBLE) say("Connecting to " + name, "Looking for it on this network, then from outside.", "", null, null, null, null);
    new Thread(() -> {
      String found = null;
      for (String c : places()) { try { if (Link.ask(f, "https://" + c + "/link/ping", "GET", null, 4000).startsWith("200\n")) { found = c; break; } } catch (Exception e) { /* the next address */ } }
      if (mine != turn) return;
      if (found == null) {
        ui.post(() -> { web.setVisibility(View.GONE); say("Cannot reach " + name, "It did not answer at its home address or from outside. It may be switched off, or Remote may be off on it. If you are away and your home's internet address has changed, open this app once on your home Wi-Fi and it learns the new one.", "", "Try again", this::connect, "Pair again", this::forget); });
        return;
      }
      try {   // every time it connects it is told where the computer is now, so a changed address is learned the first time it gets through
        String r = Link.ask(f, "https://" + found + "/api/link/where", "GET", null, 5000);
        if (r.startsWith("200\n")) { JSONObject w = new JSONObject(r.substring(4)); SharedPreferences.Editor e = prefs.edit().putString("last", found).putString("p", w.optString("pub", ""));
          if (!w.optString("lan", "").isEmpty()) e.putString("h", w.optString("lan")); if (!w.optString("name", "").isEmpty()) e.putString("n", w.optString("name")); e.apply(); }
      } catch (Exception e) { /* it still connects; it is told next time */ }
      final String at = "https://" + found;
      ui.post(() -> { if (mine != turn) return; if (!at.equals(base) || web.getVisibility() != View.VISIBLE) { base = at; web.loadUrl(at + "/app.html"); } panel.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); });
    }).start();
  }
  private void forget() { turn++; prefs.edit().clear().apply(); base = ""; web.setVisibility(View.GONE); web.loadUrl("about:blank"); open(null); }

  /** The pages. The computer's certificate is checked by its fingerprint and nothing else; this phone answers with its own. */
  private final class Pages extends WebViewClient {
    @Override public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) {
      try { X509Certificate c = Link.of(e.getCertificate()); if (c != null && !base.isEmpty() && e.getUrl().startsWith(base) && Link.fingerprint(c).equals(prefs.getString("f", ""))) { h.proceed(); return; } } catch (Exception x) { /* refused below */ }
      h.cancel();
    }
    @Override public void onReceivedClientCertRequest(WebView v, ClientCertRequest r) {
      try { r.proceed(Link.key(), new X509Certificate[] { Link.cert() }); } catch (Exception e) { r.cancel(); }
    }
    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
      String url = r.getUrl().toString();
      if (!base.isEmpty() && url.startsWith(base + "/")) return false;   // the app's own pages stay here
      try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception e) { /* nothing on the phone opens that */ }   // a ticket, a repository: the phone's browser
      return true;
    }
    // the part of the phone that draws pages can be ended by the system (memory) or can fail: the app starts its screen again instead of going down with it
    @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) { try { ((ViewGroup) v.getParent()).removeView(v); v.destroy(); } catch (Exception e) { /* already gone */ } ui.post(MainActivity.this::recreate); return true; }
    @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) { if (r.isForMainFrame()) connect(); }   // the page could not be fetched: look for the computer again, and say so if it is gone
  }

  // ---------- the one status screen ----------
  private void say(String head, String body, String code, String a, Runnable onA, String b, Runnable onB) {
    title.setText(head); text.setText(body); digits.setText(code); digits.setVisibility(code.isEmpty() ? View.GONE : View.VISIBLE);
    act(first, a, onA); act(second, b, onB); panel.setVisibility(View.VISIBLE);
  }
  private void act(Button btn, String name, Runnable run) { btn.setVisibility(name == null ? View.GONE : View.VISIBLE); if (name != null) { btn.setText(name); btn.setOnClickListener((v) -> run.run()); } }
  private int dp(int v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }
  private TextView label(int sp, int color, boolean strong) { TextView t = new TextView(this); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color); t.setLineSpacing(0, 1.25f); if (strong) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return t; }
  private View space(int h) { View s = new View(this); s.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h))); return s; }
  private Button button(boolean main) {
    Button b = new Button(this); b.setAllCaps(false); b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setTextColor(main ? JADE_INK : FOG); b.setStateListAnimator(null); b.setMinHeight(dp(52));
    GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(26)); if (main) g.setColor(JADE); else { g.setColor(Color.TRANSPARENT); g.setStroke(dp(1), 0x66E9EEF5); } b.setBackground(g);
    b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); b.setVisibility(View.GONE); return b;
  }
}
