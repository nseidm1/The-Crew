package eth.myfamilyoffice.app;

import android.net.http.SslCertificate;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.Date;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.KeyManager;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509ExtendedKeyManager;
import javax.net.ssl.X509TrustManager;
import javax.security.auth.x500.X500Principal;

/**
 * The phone's half of the phone link. Two rules, the same two the computer keeps:
 *   - this phone is known by its own key, made here in the phone's keystore and never copied out of it;
 *   - the computer is known by the fingerprint of its certificate, learned once at pairing. A certificate with any other fingerprint is
 *     refused, whatever name it carries and whoever signed it. No name is checked, because the computer has an address, not a name.
 */
final class Link {
  static final String ALIAS = "familyoffice-phone";
  private Link() { }

  private static KeyStore store() throws Exception { KeyStore k = KeyStore.getInstance("AndroidKeyStore"); k.load(null); return k; }

  /** Makes this phone's key the first time; after that it is the same key for as long as the app is installed. */
  static synchronized void ensureKey() throws Exception {
    if (store().containsAlias(ALIAS)) return;
    KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
    g.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_NONE, KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA384, KeyProperties.DIGEST_SHA512)   // NONE: TLS hands over what it has already hashed
        .setCertificateSubject(new X500Principal("CN=Family Office phone"))
        .setCertificateNotBefore(new Date(System.currentTimeMillis() - 86400000L))
        .setCertificateNotAfter(new Date(System.currentTimeMillis() + 20L * 365 * 86400000L))
        .build());
    g.generateKeyPair();
  }
  static PrivateKey key() throws Exception { return (PrivateKey) store().getKey(ALIAS, null); }
  static X509Certificate cert() throws Exception { return (X509Certificate) store().getCertificate(ALIAS); }

  /** How a certificate is known to the other side: the SHA-256 of the certificate itself, in 43 letters. */
  static String fingerprint(X509Certificate c) throws Exception {
    return Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(c.getEncoded()), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
  }
  /** The certificate a WebView was shown, as one whose fingerprint can be taken. */
  static X509Certificate of(SslCertificate c) {
    try {
      if (Build.VERSION.SDK_INT >= 29) return c.getX509Certificate();
      Bundle b = SslCertificate.saveState(c); byte[] der = b == null ? null : b.getByteArray("x509-certificate");
      return der == null ? null : (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
    } catch (Exception e) { return null; }
  }

  /** TLS for the app's own requests: it shows this phone's certificate, and accepts the paired computer's and no other. */
  static SSLSocketFactory sockets(final String pin) throws Exception {
    ensureKey();
    final PrivateKey key = key(); final X509Certificate[] chain = { cert() };
    KeyManager km = new X509ExtendedKeyManager() {
      @Override public String chooseClientAlias(String[] t, Principal[] i, Socket s) { return ALIAS; }
      @Override public String chooseEngineClientAlias(String[] t, Principal[] i, SSLEngine e) { return ALIAS; }
      @Override public String[] getClientAliases(String t, Principal[] i) { return new String[] { ALIAS }; }
      @Override public X509Certificate[] getCertificateChain(String a) { return chain; }
      @Override public PrivateKey getPrivateKey(String a) { return key; }
      @Override public String chooseServerAlias(String t, Principal[] i, Socket s) { return null; }
      @Override public String[] getServerAliases(String t, Principal[] i) { return null; }
    };
    TrustManager tm = new X509TrustManager() {
      @Override public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException { throw new CertificateException("this phone is not a server"); }
      @Override public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
        try { if (c != null && c.length > 0 && pin != null && pin.equals(fingerprint(c[0]))) return; } catch (Exception e) { /* refused below */ }
        throw new CertificateException("this is not the computer this phone was paired with");
      }
      @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    };
    SSLContext c = SSLContext.getInstance("TLS"); c.init(new KeyManager[] { km }, new TrustManager[] { tm }, null);
    return c.getSocketFactory();
  }

  /** One request to the computer. The answer is its status, a line break, then its text. Throws when the computer cannot be reached. */
  static String ask(String pin, String url, String method, String body, int ms) throws Exception {
    HttpsURLConnection c = (HttpsURLConnection) new URL(url).openConnection();
    try {
      c.setSSLSocketFactory(sockets(pin)); c.setHostnameVerifier((host, session) -> true);   // the fingerprint is the identity; there is no name to check
      c.setConnectTimeout(ms); c.setReadTimeout(ms); c.setRequestMethod(method); c.setUseCaches(false);
      if (body != null) { c.setDoOutput(true); c.setRequestProperty("content-type", "application/json"); try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); } }
      int code = c.getResponseCode(); ByteArrayOutputStream out = new ByteArrayOutputStream();
      try (InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream()) { if (in != null) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0 && out.size() < 65536) out.write(buf, 0, n); } }
      return code + "\n" + new String(out.toByteArray(), StandardCharsets.UTF_8);
    } finally { c.disconnect(); }
  }
}
