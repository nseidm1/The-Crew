// cert.mjs - a key and a self-signed certificate for it, made with Node alone (no openssl command, no package).
// The phone link (link.mjs) is TLS between two parties that each know the other's certificate by its fingerprint, learned once at
// pairing. Nobody signs anybody: a certificate here is only the standard wrapper TLS needs around a public key, so it is the smallest
// valid one: version 3, a serial, a name, ten years, the key, and its own signature (ECDSA P-256 with SHA-256).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const len = (n) =>
  n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const int = (buf) => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf); // never read as negative
const oid = (hex) => tlv(0x06, Buffer.from(hex, 'hex'));
const time = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z')); // UTCTime: good until 2049
const ECDSA_SHA256 = seq(oid('2a8648ce3d040302'));
const CN = '550403';

export const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const derOf = (pem) =>
  Buffer.from(
    String(pem)
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s+/g, ''),
    'base64',
  );
// how a certificate is known to the other side: the SHA-256 of the certificate itself, in 43 letters
export const fingerprint = (certPemOrDer) =>
  b64url(
    createHash('sha256')
      .update(Buffer.isBuffer(certPemOrDer) ? certPemOrDer : derOf(certPemOrDer))
      .digest(),
  );

export function selfSigned(name = 'Family Office', years = 10) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const who = seq(set(seq(oid(CN), tlv(0x0c, Buffer.from(name.slice(0, 60), 'utf8')))));
  const from = new Date(Date.now() - 86400000);
  const to = new Date(from.getTime() + years * 365 * 86400000);
  const tbs = seq(
    tlv(0xa0, int(Buffer.from([2]))),
    int(Buffer.concat([Buffer.from([1]), randomBytes(8)])),
    ECDSA_SHA256,
    who,
    seq(time(from), time(to)),
    who,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const der = seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.from([0]), sign('sha256', tbs, privateKey)));
  const pem = (label, buf) =>
    '-----BEGIN ' +
    label +
    '-----\n' +
    buf
      .toString('base64')
      .match(/.{1,64}/g)
      .join('\n') +
    '\n-----END ' +
    label +
    '-----\n';
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: pem('CERTIFICATE', der),
    fingerprint: fingerprint(der),
  };
}
