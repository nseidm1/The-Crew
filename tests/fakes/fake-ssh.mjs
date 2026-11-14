#!/usr/bin/env node
// fake-ssh.mjs - a TEST DOUBLE for the ssh command, used only when FO_BIN_SSH points at it. "The other machine" is this one.
//   a command run     answers as the remote question would: one FO-MODEL line per model on each port in FO_FAKE_SSH_PORTS
//   -N -L a:b:c:d     a real forward from local port b to port d, held open until it is killed
//   the host "nokey"  refuses the way a machine does when this one has no key for it
import net from 'node:net';
const a = process.argv.slice(2);
const dest = a.filter(
  (x, i) => !x.startsWith('-') && !(a[i - 1] === '-o' || a[i - 1] === '-p' || a[i - 1] === '-L'),
)[0];
if (dest === 'nokey' || /@nokey$/.test(dest || '')) {
  console.error(dest + ': Permission denied (publickey).');
  process.exit(255);
}
const fwd = a.indexOf('-L');
if (a.includes('-N') && fwd >= 0) {
  const [, lp, , rp] = a[fwd + 1].split(':');
  net
    .createServer((c) => {
      const up = net.connect(Number(rp), '127.0.0.1');
      c.pipe(up);
      up.pipe(c);
      c.on('error', () => up.destroy());
      up.on('error', () => c.destroy());
    })
    .listen(Number(lp), '127.0.0.1');
  process.on('SIGTERM', () => process.exit(0));
} else {
  for (const p of String(process.env.FO_FAKE_SSH_PORTS || '')
    .split(',')
    .filter(Boolean)) {
    try {
      const r = await fetch('http://127.0.0.1:' + p + '/v1/models');
      if (r.ok) for (const m of (await r.json()).data || []) console.log('FO-MODEL ' + p + ' "id": "' + m.id + '"');
    } catch {
      /* not listening */
    }
  }
  console.log('FO-DONE');
}
