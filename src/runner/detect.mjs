// detect.mjs - model servers that are ALREADY running, so a team can think with one the customer has set up themselves.
// Almost every local model server speaks the same API (GET /v1/models, POST /v1/chat/completions), so one question finds them all.
//   on this machine   the ports the common servers use by default are asked, all at once, with a short wait
//   another machine   the customer names it. It is looked for two ways:
//       directly      its usual ports (or the port they gave) are asked over the network
//       over SSH      for a machine whose model server listens only to itself, the way an inference box is usually set up. With the
//                     keys the customer already has (never a password, never a new host key accepted for them), the machine is asked
//                     which of its own ports answer as a model server, on ANY port. To use one, a private tunnel is opened to it:
//                     ssh -N -L 127.0.0.1:<a free port here>:127.0.0.1:<its port>. The tunnel closes when the team stops.
// Nothing here starts, stops or changes a server. A server that needs a key is not supported yet.
import { spawn } from 'node:child_process';
import net from 'node:net';

const KNOWN = [
  { port: 11434, name: 'Ollama' },
  { port: 1234, name: 'LM Studio' },
  { port: 8080, name: 'llama.cpp or MLX server' },
  { port: 8000, name: 'vLLM or another OpenAI-compatible server' },
  { port: 1337, name: 'Jan' },
  { port: 5000, name: 'text-generation-webui' },
  { port: 5001, name: 'KoboldCpp' },
  { port: 4891, name: 'GPT4All' },
  { port: 8081, name: 'An OpenAI-compatible server' },
];
const nameFor = (port) => (KNOWN.find((k) => k.port === Number(port)) || { name: 'A model server' }).name;

// one address: does it list models the way an OpenAI-compatible server does?
export async function probe(base, ms = 1500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(base + '/v1/models', { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const ids = Array.isArray(j && j.data)
      ? j.data.map((m) => m && m.id).filter((x) => typeof x === 'string' && x)
      : null;
    return ids && ids.length ? { base, models: [...new Set(ids)].slice(0, 60) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
const hostOf = (base) => {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
};
const isHere = (base) => {
  try {
    return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(base).hostname);
  } catch {
    return false;
  }
};
const describe = (found) => {
  const u = new URL(found.base);
  return {
    base: found.base,
    name: nameFor(u.port || (u.protocol === 'https:' ? 443 : 80)),
    where: isHere(found.base) ? 'This machine' : u.hostname,
    here: isHere(found.base),
    host: hostOf(found.base),
    models: found.models,
    ssh: null,
  };
};

// everything answering on this machine's usual ports, except ports that are ours
export async function detectHere(skip = []) {
  const found = await Promise.all(
    KNOWN.filter((k) => !skip.includes(k.port)).map((k) => probe('http://127.0.0.1:' + k.port)),
  );
  return found.filter(Boolean).map(describe);
}
// what the customer typed -> a base address, or why not
export function addressOf(input) {
  let s = String(input || '').trim();
  if (!s) return { why: 'Write an address or an SSH name, for example halo, me@192.168.1.20 or 192.168.1.20:11434' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return { why: 'That is not an address this can reach.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { why: 'Only http and https addresses are asked.' };
  if (u.username || u.password) return { why: 'An address with a name and password in it is not accepted.' };
  return { base: u.protocol + '//' + u.host, port: u.port }; // the path is dropped: /v1 is added when it is asked
}
export async function detectAt(input) {
  const a = addressOf(input);
  if (!a.base) return { ok: false, why: a.why };
  const found = await probe(a.base, 4000);
  return found
    ? { ok: true, server: describe(found) }
    : {
        ok: false,
        why:
          'Nothing at ' +
          hostOf(a.base) +
          ' answered as a model server (it was asked for /v1/models). Check it is running and that this machine can reach it.',
      };
}
export async function detectRemembered(bases = []) {
  return (await Promise.all(bases.map((b) => probe(b, 2500)))).filter(Boolean).map(describe);
}
// a machine named without a port: its usual ports, asked directly over the network
export async function detectHost(host) {
  const found = await Promise.all(KNOWN.map((k) => probe('http://' + host + ':' + k.port, 2000)));
  return found.filter(Boolean).map(describe);
}

// ---------- over SSH ----------
const DEST = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]{0,62}@)?[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/; // user@host or a name from ~/.ssh/config; never starts with "-"
export function sshDest(input) {
  let s = String(input || '')
    .trim()
    .replace(/^ssh:\/\//i, '')
    .replace(/^ssh\s+/i, '');
  let sshPort = 0;
  const m = /^(.*):(\d{1,5})$/.exec(s);
  if (m && m[1].includes('@')) {
    s = m[1];
    sshPort = Number(m[2]);
  }
  if (!DEST.test(s) || sshPort > 65535) return null;
  return { dest: s, sshPort };
}
const sshBin = () => process.env.FO_BIN_SSH || 'ssh';
const sshArgs = (sshPort) => [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=6',
  '-o',
  'ServerAliveInterval=15',
  '-o',
  'ServerAliveCountMax=3',
  ...(sshPort ? ['-p', String(sshPort)] : []),
];
// The question asked of the other machine: which ports are listening, and which of those answer /v1/models. It reads and changes nothing.
// All the ports are asked at once (a machine can have dozens listening), and each model comes back as one short line, so lines from
// different ports cannot run into each other.
export const REMOTE_QUESTION =
  'sh -c \'command -v curl >/dev/null 2>&1 || echo FO-NOCURL; ports=$( { ss -ltnH 2>/dev/null || netstat -an 2>/dev/null | grep LISTEN; } | awk "{print \\$4}" | sed -E "s/.*[:.]([0-9]+)\\$/\\\\1/" | grep -E "^[0-9]+\\$" | sort -un | awk "\\$1>=1024" | head -n 120 ); ' +
  'for p in $ports; do ( r=$(curl -s -m 3 "http://127.0.0.1:$p/v1/models" 2>/dev/null | head -c 60000 | tr -d "\\n"); case "$r" in *\\"data\\"*) echo "$r" | grep -oE "\\"id\\" *: *\\"[^\\"]{1,200}\\"" | head -n 60 | while read -r l; do echo "FO-MODEL $p $l"; done;; esac ) & done; wait; echo FO-DONE\'';
function sshRun(dest, sshPort, command, ms = 25000) {
  return new Promise((done) => {
    let out = '';
    let err = '';
    let over = false;
    const c = spawn(sshBin(), [...sshArgs(sshPort), dest, command], { stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => {
      over = true;
      c.kill('SIGTERM');
    }, ms);
    c.stdout.on('data', (d) => {
      if (out.length < 400000) out += d;
    });
    c.stderr.on('data', (d) => {
      if (err.length < 4000) err += d;
    });
    c.on('error', (e) => {
      clearTimeout(t);
      done({ code: -1, out, err: String(e.message) });
    });
    c.on('close', (code) => {
      clearTimeout(t);
      done({ code: over ? -2 : code, out, err });
    });
  });
}
const whySsh = (dest, r) =>
  r.code === -1
    ? 'this machine has no ssh command'
    : r.code === -2
      ? 'it did not answer in time'
      : /Permission denied|publickey|password/i.test(r.err)
        ? 'it wanted a password or a key this machine does not have. Make "ssh ' +
          dest +
          '" work from Terminal without a password, then look again'
        : /Host key verification failed|authenticity of host/i.test(r.err)
          ? 'this machine has not connected to it before. Run "ssh ' +
            dest +
            '" once in Terminal and accept its key, then look again'
          : /Could not resolve|Name or service not known|nodename nor servname/i.test(r.err)
            ? 'that name was not found'
            : /timed out|No route to host|Connection refused|Network is unreachable/i.test(r.err)
              ? 'it could not be reached'
              : (
                  r.err
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .pop() || 'ssh ended with ' + r.code
                ).slice(0, 160);
// which of that machine's own ports answer as a model server
export async function detectOverSsh(dest, sshPort = 0) {
  const r = await sshRun(dest, sshPort, REMOTE_QUESTION);
  if (!/FO-DONE/.test(r.out)) return { ok: false, why: whySsh(dest, r) };
  const byPort = new Map();
  for (const line of r.out.split('\n')) {
    const m = /^FO-MODEL (\d+) "id"\s*:\s*"(.+)"$/.exec(line.trim());
    if (m) byPort.set(m[1], [...(byPort.get(m[1]) || []), m[2]]);
  }
  const servers = [...byPort]
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([port, ids]) => ({
      base: 'ssh://' + dest + ':' + port,
      name: nameFor(port),
      where: dest + ', over SSH',
      here: false,
      host: dest + ' port ' + port,
      models: [...new Set(ids)].slice(0, 60),
      ssh: { dest, sshPort, port: Number(port) },
    }));
  return { ok: true, servers, nocurl: /FO-NOCURL/.test(r.out) };
}
const freePort = () =>
  new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
// a private tunnel from a free port on this machine to that machine's own model port. Resolves once it answers, with the child to close.
export async function openTunnel({ dest, sshPort = 0, port }) {
  const local = await freePort();
  const base = 'http://127.0.0.1:' + local;
  let err = '';
  let gone = null;
  const child = spawn(
    sshBin(),
    [
      '-N',
      ...sshArgs(sshPort),
      '-o',
      'ExitOnForwardFailure=yes',
      '-L',
      '127.0.0.1:' + local + ':127.0.0.1:' + port,
      dest,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.on('data', (d) => {
    if (err.length < 4000) err += d;
  });
  child.on('error', (e) => {
    gone = { code: -1, err: String(e.message) };
  });
  child.on('close', (code) => {
    gone = gone || { code, err };
  });
  for (let i = 0; i < 40 && !gone; i++) {
    if (await probe(base, 1200)) return { ok: true, base, local, child };
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  return {
    ok: false,
    why:
      'The tunnel to ' +
      dest +
      ' did not open: ' +
      (gone ? whySsh(dest, { code: gone.code, err: gone.err || err }) : 'the model server did not answer through it'),
  };
}

// what the customer typed in the one box -> the model servers found there, directly or over SSH
export async function detectAnywhere(input) {
  const s = String(input || '').trim();
  if (!s) return { ok: false, why: addressOf('').why };
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^ssh:\/\//i.test(s);
  const at = s.includes('@');
  const tried = [];
  if (!at) {
    const a = addressOf(s);
    if (!a.base) return { ok: false, why: a.why };
    if (scheme || a.port) {
      const r = await detectAt(s);
      if (r.ok) return { ok: true, servers: [r.server] };
      tried.push('nothing answered at ' + hostOf(a.base));
      if (scheme) return { ok: false, why: r.why };
    } else {
      const found = await detectHost(new URL(a.base).hostname);
      if (found.length) return { ok: true, servers: found };
      tried.push('nothing answered on its usual model-server ports');
    }
  }
  const d = sshDest(at ? s : s.replace(/:\d+$/, ''));
  if (!d)
    return {
      ok: false,
      why: tried.length
        ? 'Looked at ' + s + ': ' + tried.join('; ') + '.'
        : 'That is not an address or an SSH name this can use.',
    };
  const r = await detectOverSsh(d.dest, d.sshPort);
  if (r.ok && r.servers.length) return { ok: true, servers: r.servers, ssh: d };
  const over = r.ok
    ? r.nocurl
      ? 'SSH to it works, but it has no curl to ask its own ports with'
      : 'SSH to it works, but nothing on that machine answers as a model server'
    : 'SSH to it did not work: ' + r.why;
  return { ok: false, why: 'Looked at ' + d.dest + ': ' + [...tried, over].join('; ') + '.' };
}

// ---------- hints: machines worth looking on ----------
// Nobody remembers an address. So the box is offered the machines THIS machine already knows, read from its own records and nowhere else:
//   used before        the machines a team was started on from here
//   SSH config         the names in ~/.ssh/config (the ones the customer already types after "ssh")
//   Tailscale          the machines on their own private network that are online, when Tailscale is installed
//   connected before   the private addresses in ~/.ssh/known_hosts (home and office machines; public sites like github.com are left out)
// Nothing is contacted to build the list: it is read, not scanned. A machine is only asked anything when the customer presses its name.
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const isPrivate = (h) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) ||
  /\.(local|lan|home|internal|ts\.net|home\.arpa)$/i.test(h) ||
  /^[A-Za-z][A-Za-z0-9_-]*$/.test(h);
export function parseSshConfig(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const m = /^(\S+?)\s*(?:=|\s)\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim().replace(/^"|"$/g, '');
    if (k === 'host') {
      const names = v.split(/\s+/).filter((n) => n && !/[*?!]/.test(n) && DEST.test(n));
      cur = names.length ? { names, host: '', user: '' } : null;
      if (cur) out.push(cur);
    } else if (k === 'match') cur = null;
    else if (cur && k === 'hostname') cur.host = v;
    else if (cur && k === 'user') cur.user = v;
  }
  return out;
}
export function parseKnownHosts(text) {
  const out = new Set();
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#' || line[0] === '|' || line[0] === '@') continue; // hashed names cannot be read back, and are not guessed at
    for (let h of line.split(/\s+/)[0].split(',')) {
      const m = /^\[(.+)\]:\d+$/.exec(h);
      if (m) h = m[1];
      if (DEST.test(h) && isPrivate(h)) out.add(h);
    }
  }
  return [...out];
}
async function tailscalePeers() {
  const bin = process.env.FO_BIN_TAILSCALE || 'tailscale';
  const out = await new Promise((done) => {
    let o = '';
    let c;
    try {
      c = spawn(bin, ['status', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return done('');
    }
    const t = setTimeout(() => {
      try {
        c.kill('SIGTERM');
      } catch {
        /* gone */
      }
    }, 2500);
    c.stdout.on('data', (d) => {
      if (o.length < 2e6) o += d;
    });
    c.on('error', () => {
      clearTimeout(t);
      done('');
    });
    c.on('close', () => {
      clearTimeout(t);
      done(o);
    });
  });
  try {
    return Object.values(JSON.parse(out).Peer || {})
      .filter((p) => p && p.Online && !/^(ios|android|tvos)$/i.test(p.OS || ''))
      .map((p) => ({
        target: String(p.DNSName || (p.TailscaleIPs || [])[0] || '').replace(/\.$/, ''),
        label: String(p.HostName || ''),
      }))
      .filter((p) => p.target && DEST.test(p.target));
  } catch {
    return [];
  }
}
export async function hints({ sshHosts = [], servers = [] } = {}) {
  const dir = process.env.FO_SSH_DIR || path.join(os.homedir(), '.ssh');
  const text = async (f) => {
    try {
      return await readFile(path.join(dir, f), 'utf8');
    } catch {
      return '';
    }
  };
  const out = [];
  const seen = new Set();
  const add = (target, label, from) => {
    if (!target || seen.has(target) || out.length >= 14) return;
    seen.add(target);
    out.push({ target, label: label || '', from });
  };
  for (const x of sshHosts) add(x.sshPort ? x.dest + ':' + x.sshPort : x.dest, '', 'Used before');
  for (const b of servers) {
    try {
      add(new URL(b).host, '', 'Used before');
    } catch {
      /* not an address */
    }
  }
  // a config name is offered when it is the customer's own machine: a short name or a private address, never a code-hosting site
  const GIT = /(github|gitlab|bitbucket|codeberg|sourcehut|sr\.ht|dev\.azure|visualstudio)/i;
  for (const c of parseSshConfig(await text('config')))
    for (const n of c.names) {
      if (GIT.test(n + ' ' + c.host) || !(isPrivate(n) || (c.host && isPrivate(c.host)))) continue;
      add(n, (c.user ? c.user + '@' : '') + (c.host || ''), 'SSH config');
    }
  for (const p of await tailscalePeers()) add(p.target, p.label, 'Tailscale');
  for (const h of parseKnownHosts(await text('known_hosts'))) add(h, '', 'Connected to before');
  return out;
}
