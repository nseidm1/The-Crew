// connectors.mjs - the systems a team can reach beyond the repo (Jira first), added and signed in to with Claude Code's own commands:
//   claude mcp list                       what is configured, and whether each is connected, needs a sign-in, or is not answering
//   claude mcp add --transport http ...   add one, for this customer, in every project (user scope)
//   claude mcp login <name> --no-browser  its sign-in: Claude Code prints the provider's page and waits for it to come back; the runner
//                                         opens that page in the customer's browser and hands the same address to the page as a link
// Adding one changes the customer's Claude Code configuration, so it happens only when they press Connect. The provider's sign-in is
// always the customer, in their own browser.
import os from 'node:os';
import { spawn } from 'node:child_process';
import { sh } from './host.mjs';
import { run, track } from './engine.mjs';

// only connectors whose address comes from the provider's own documentation
export const CONNECTORS = [
  {
    id: 'atlassian',
    name: 'Jira',
    covers: 'Jira and Confluence',
    transport: 'http',
    url: 'https://mcp.atlassian.com/v2/mcp',
    words: ['jira', 'atlassian', 'confluence'],
  },
];
const stateOf = (line) =>
  /Connected/i.test(line) && !/Failed/i.test(line)
    ? 'connected'
    : /Needs authentication/i.test(line)
      ? 'needs-auth'
      : /Failed/i.test(line)
        ? 'failed'
        : 'connected';
export async function connectorList(bin) {
  if (!bin)
    return CONNECTORS.map((c) => ({ id: c.id, name: c.name, covers: c.covers, words: c.words, state: 'unavailable' }));
  const r = await sh(bin, ['mcp', 'list'], { timeout: 45000 });
  const lines = (r.out + '\n' + r.err).split('\n');
  return CONNECTORS.map((c) => {
    const line = lines.find((l) => c.words.some((w) => l.toLowerCase().includes(w)));
    return { id: c.id, name: c.name, covers: c.covers, words: c.words, state: line ? stateOf(line) : 'missing' };
  });
}
let flow = null; // one connection at a time
export const connectState = () =>
  flow ? { id: flow.id, state: flow.state, url: flow.url || null, opened: !!flow.opened, why: flow.why || '' } : null;

// CLAUDE CODE WILL NOT RUN A SIGN-IN WITHOUT A TERMINAL ("stdin isn't a terminal"), and a runner has none. So the command is given a
// pseudo-terminal by the system's own 'script', with no input attached (macOS's script refuses a pipe as its input). Measured on
// Claude Code 2.1.293: started this way it prints the page to visit, listens on this machine for the provider to come back, and waits.
const quote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const inTerminal = (bin, args) =>
  process.platform === 'darwin'
    ? ['script', ['-q', '/dev/null', bin, ...args]]
    : ['script', ['-qfec', [bin, ...args].map(quote).join(' '), '/dev/null']];
const plain = (s) =>
  String(s)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
// the page to visit, whole: from the terminal hyperlink Claude Code writes, or from the lines before "Waiting" (a long address is wrapped)
const pageIn = (buf) => {
  const link = /\x1b\]8;[^;]*;(https:\/\/[^\x07\x1b\s]+)(?:\x07|\x1b\\)/.exec(buf);
  if (link) return link[1];
  const m = /(https:\/\/\S+(?:\r?\n\S+)*?)\s*\r?\n\s*Waiting/.exec(plain(buf));
  return m ? m[1].replace(/\s+/g, '') : null;
};
const lastWords = (buf) =>
  plain(buf)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) => l && l !== '^D' && !/mcp-sdk|^https?:|Waiting for|paste the redirect|^Visit this|^Starting auth/i.test(l),
    )
    .slice(-1)[0] || '';
// open a page in the customer's own browser. Only ever an https address, only when they pressed the button, and never in a test run.
export function openPage(url) {
  const stub = process.env.FO_BIN_OPEN;
  if (!/^https:\/\//.test(url) || (!stub && (process.env.FO_NO_OPEN === '1' || process.env.FO_NO_NET === '1')))
    return false;
  const [cmd, args] = stub
    ? [stub, [url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]] // not "cmd /c start": cmd cuts an address at its first "&", and a sign-in address is full of them
        : process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release()))
          ? ['explorer.exe', [url]] // inside WSL: the person's Windows browser
          : ['xdg-open', [url]];
  try {
    const ch = spawn(cmd, args, { stdio: 'ignore', detached: true });
    ch.on('error', () => {});
    ch.unref();
    return true;
  } catch {
    return false;
  }
}

// add it if it is not there, then start its sign-in. Resolves once the sign-in page is known (or it is already connected, or it could
// not be started); the rest is the customer's, in their browser. It answers { ok, state, url, opened }: 'opened' is whether this
// machine was asked to open the page, and 'url' is always given so the page can offer it as a link if no window came up.
export async function connectTo(bin, id, { onChange = () => {} } = {}) {
  const connector = CONNECTORS.find((x) => x.id === id);
  if (!connector) return { ok: false, why: 'no such connector' };
  if (!bin) return { ok: false, why: 'Claude Code is not on this machine' };
  if (flow && flow.state === 'awaiting')
    return {
      ok: true,
      state: 'needs-auth',
      url: flow.url,
      opened: openPage(flow.url),
      note: 'a sign-in is already under way',
    }; // pressed again: the same page, opened again
  let now = (await connectorList(bin)).find((x) => x.id === id).state;
  if (now === 'missing') {
    const add = await run(
      bin,
      ['mcp', 'add', '--transport', connector.transport, '--scope', 'user', connector.id, connector.url],
      {
        timeout: 60000,
      },
    );
    if (add.code !== 0) return { ok: false, why: 'Claude Code would not add it: ' + add.tail.slice(-2).join(' / ') };
    now = (await connectorList(bin)).find((x) => x.id === id).state;
  }
  if (now === 'connected') return { ok: true, state: 'connected' };
  const mine = (flow = { id, state: 'starting', url: null, opened: false, why: '', child: null });
  let out = '';
  let args = ['mcp', 'login', connector.id, '--no-browser'];
  let selfOpens = false;
  const timer = setTimeout(() => {
    mine.why = 'the sign-in was not finished within ten minutes';
    if (mine.child) mine.child.kill('SIGTERM');
  }, 10 * 60000);
  const read = (d) => {
    out = (out + String(d)).slice(-12000);
    if (mine.url) return;
    const u = pageIn(out);
    if (!u) return;
    mine.url = u;
    mine.state = 'awaiting';
    mine.opened = selfOpens || openPage(u);
    onChange();
  };
  const start = (pty) => {
    const [cmd, argv] = pty ? inTerminal(bin, args) : [bin, args];
    const child = (mine.child = track(spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })));
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', (e) => {
      if (mine.child !== child) return;
      if (pty && e.code === 'ENOENT') return start(false); // no 'script' on this machine: try it as it is
      clearTimeout(timer);
      mine.state = 'failed';
      mine.why = e.message;
      onChange();
    });
    child.on('close', (code) => {
      if (mine.child !== child) return;
      if (code !== 0 && !mine.url && !selfOpens && /unknown option|--no-browser/i.test(plain(out))) {
        selfOpens = true;
        args = args.slice(0, 3);
        out = '';
        return start(pty);
      } // an older Claude Code: it opens the page itself
      clearTimeout(timer);
      mine.state = code === 0 ? 'done' : 'failed';
      if (code !== 0 && !mine.why)
        mine.why = /isn.t a terminal/i.test(out)
          ? 'Claude Code will only run this sign-in in a terminal. In Terminal, run "claude mcp login ' +
            connector.id +
            '" and finish it there, then press Sign in here to check.'
          : (lastWords(out) || 'Claude Code ended the sign-in (exit ' + code + ')').slice(0, 240);
      onChange();
    });
  };
  start(true);
  await new Promise((ok) => {
    let n = 0;
    const iv = setInterval(() => {
      if (mine.state !== 'starting' || ++n > 60) {
        clearInterval(iv);
        ok();
      }
    }, 150);
  }); // until the page is known, or nine seconds
  if (mine.state === 'starting') {
    mine.state = 'failed';
    mine.why = ('Claude Code did not show a sign-in page. ' + lastWords(out)).trim().slice(0, 240);
    clearTimeout(timer);
    if (mine.child) mine.child.kill('SIGTERM');
  }
  onChange();
  return mine.state === 'failed'
    ? { ok: false, why: mine.why }
    : { ok: true, state: mine.state === 'done' ? 'connected' : 'needs-auth', url: mine.url, opened: mine.opened };
}
