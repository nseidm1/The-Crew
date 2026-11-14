// claude.mjs - the second engine: Claude Code, already installed and signed in on this machine by the customer. The runner only ever
// starts the customer's own `claude` command, the way they could from a terminal. It never sees, stores or sends a sign-in: there is no
// "log in with Claude" here, and a website may not offer one. Every run starts in a folder of its own outside any project, so no
// project's settings or hooks are picked up.
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { bin, sh } from './host.mjs';
import { run, track } from './engine.mjs';

// Anthropic's own installer, run only when Claude Code is not on the machine. It puts Claude Code in the customer's home folder.
export const CLAUDE_INSTALL = 'curl -fsSL https://claude.ai/install.sh | bash';
export async function installClaude({ onLine, stateDir }) {
  let script = process.env.FO_CLAUDE_INSTALL_SH;
  if (!script) {
    if (process.env.FO_NO_NET === '1') return { ok: false, why: 'the installer could not be fetched (offline)' };
    try {
      const res = await fetch('https://claude.ai/install.sh');
      if (!res.ok) throw new Error('status ' + res.status);
      script = path.join(stateDir, 'claude-install.sh');
      await mkdir(stateDir, { recursive: true });
      await writeFile(script, await res.text());
    } catch (err) {
      return { ok: false, why: 'the installer could not be fetched: ' + String(err.message).slice(0, 80) };
    }
  }
  const r = await run('/bin/bash', [script], { onLine, timeout: 10 * 60000 });
  return r.code === 0 ? { ok: true } : { ok: false, why: r.tail.slice(-2).join(' / ') };
}

const exists = (f) =>
  access(f).then(
    () => true,
    () => false,
  );
export const claudeRoot = () => process.env.FO_CLAUDE_ROOT || path.join(os.tmpdir(), 'familyoffice-claude');
export async function findClaude() {
  const b = await bin('claude');
  if (b) return b;
  if (process.env.FO_BIN_CLAUDE !== undefined) return null;
  for (const c of [path.join(os.homedir(), '.claude/local/claude'), path.join(os.homedir(), '.local/bin/claude')])
    if (await exists(c)) return c;
  return null;
}
export async function claudeVersion(b) {
  const r = await sh(b, ['--version'], { timeout: 15000 });
  return (/(\d+\.\d+\.\d+)/.exec(r.out + ' ' + r.err) || [])[1] || (r.ok ? 'installed' : null);
}
// WHAT THIS CLAUDE CODE CAN BE ASKED FOR, read from its own --help rather than assumed: an older one has no --effort, and a list of
// levels written here would go stale the day a level is added. Model names are its aliases, which always mean the latest of each.
let offers = null;
export async function claudeOffers(b) {
  if (offers && offers.bin === b) return offers;
  const r = await sh(b, ['--help'], { timeout: 15000 });
  const out = r.out + '\n' + r.err;
  const e = /--effort <\w+>[\s\S]{0,240}?\(([^)]+)\)/.exec(out);
  const NAMES = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };
  const levels = e
    ? e[1]
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^[a-z]{2,8}$/.test(x))
    : [];
  const hasModel = /--model </.test(out);
  offers = {
    bin: b,
    models: hasModel
      ? [
          { id: '', name: 'Default model' },
          ...(/'fable'/.test(out) ? [{ id: 'fable', name: 'Fable' }] : []),
          { id: 'opus', name: 'Opus' },
          { id: 'sonnet', name: 'Sonnet' },
          { id: 'haiku', name: 'Haiku' },
        ]
      : [],
    efforts: levels.length
      ? [
          { id: '', name: 'Default effort' },
          ...levels.map((l) => ({ id: l, name: (NAMES[l] || l[0].toUpperCase() + l.slice(1)) + ' effort' })),
        ]
      : [],
  };
  return offers;
}
export const claudeFix = (kind, said) =>
  kind === 'missing'
    ? {
        kind: 'claude',
        title: 'Claude Code is not installed on this machine',
        text: 'This option runs your team on Claude Code. It is not on this machine, and it could not be installed for you just now.',
        steps: [
          'Get Claude Code from claude.com/claude-code and install it.',
          'Come back here and press Try again. We find it, and start its sign-in for you if it needs one.',
        ],
        actions: [],
        link: { href: 'https://claude.com/claude-code', label: 'Get Claude Code' },
      }
    : kind === 'signin'
      ? {
          kind: 'claude-signin',
          title: 'Claude Code is not signed in',
          text: 'Your team runs on your own Claude sign-in, which Claude Code keeps. We start its sign-in for you and never see what you type.',
          steps: [
            'Press "Sign in to Claude". Claude Code opens Anthropic\'s sign-in page in your browser.',
            'Sign in there. If the page shows a code, paste it into the box below.',
            'When it finishes, setup carries on by itself.',
          ],
          actions: [{ id: 'claude-login', label: 'Sign in to Claude' }],
          link: null,
          code: true,
        }
      : {
          kind: 'claude-signin',
          title: 'Claude Code did not answer',
          text:
            'It is installed, but one test question got no reply' +
            (said ? ' ("' + said + '")' : '') +
            '. The usual cause is that its sign-in has lapsed.',
          steps: [
            'Press "Sign in to Claude" and sign in again in your browser.',
            'When it finishes, setup carries on by itself.',
          ],
          actions: [{ id: 'claude-login', label: 'Sign in to Claude' }],
          link: null,
          code: true,
        };

// one Claude Code run, read as it streams. onText gets each piece of the reply; resolves with the whole text and what the run reported.
export function claudeRun({
  bin: claudeBin,
  prompt,
  system,
  cwd,
  onText = () => {},
  tools = false,
  allow = [],
  maxTurns = 30,
  timeout = 5 * 60000,
  signal,
  model = '',
  effort = '',
}) {
  return new Promise(async (ok) => {
    await mkdir(cwd, { recursive: true });
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--max-turns',
      String(maxTurns),
    ];
    const mind = model || process.env.FO_CLAUDE_MODEL || ''; // the seat's own choice (Who is here); else the one this run of the app was started with (a measurement names it); else Claude Code picks as it always does
    if (mind) args.push('--model', mind);
    if (effort) args.push('--effort', effort);
    if (system) args.push('--append-system-prompt', system); // added to Claude Code's own instructions, so it still knows how to use its tools
    // THE AGENTS INHERIT ALL OF CLAUDE CODE'S TOOLS (a decision of the product): its built-in tools and whatever connectors the customer has added.
    // Nothing is named and nothing is removed. What a tool may do without asking is the customer's own Claude Code permission settings,
    // which this runner neither reads nor widens: with nobody at a prompt, a tool those settings would ask about is refused, and the
    // agent says so. A run gets enough turns to use a tool and then answer (one turn is how "Can you connect to Jira?" ended with
    // a tool search and no answer). Only the agent check adds a permission: edits inside its own scratch folder.
    if (tools) args.push('--permission-mode', 'acceptEdits');
    // a connector the customer connected through this product is theirs to use here: its tools are allowed for this run, and only its tools
    if (allow.length) args.push('--allowedTools', allow.join(','));
    const child = track(spawn(claudeBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }));
    const startedAt = Date.now();
    let first = 0;
    let buf = '';
    let text = '';
    let result = null;
    let toolUses = 0;
    let turns = 0;
    let err = '';
    let streamed = false;
    const timer = setTimeout(() => {
      err = 'stopped: it ran past ' + Math.round(timeout / 1000) + ' s';
      child.kill('SIGKILL');
    }, timeout);
    if (signal) signal.addEventListener('abort', () => child.kill('SIGTERM'));
    const take = (line) => {
      if (line[0] !== '{') return;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (
        ev.type === 'stream_event' &&
        ev.event &&
        ev.event.type === 'content_block_delta' &&
        ev.event.delta &&
        ev.event.delta.type === 'text_delta'
      ) {
        if (!first) first = Date.now();
        streamed = true;
        text += ev.event.delta.text;
        onText(ev.event.delta.text);
      }
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        turns++;
        for (const c of ev.message.content) {
          if (c.type === 'tool_use') toolUses++;
          if (c.type === 'text' && !streamed) {
            if (!first) first = Date.now();
            text += c.text;
            onText(c.text);
          }
        }
      }
      if (ev.type === 'result') result = ev;
    };
    child.stdout.on('data', (d) => {
      buf += d;
      const parts = buf.split('\n');
      buf = parts.pop();
      parts.forEach((l) => take(l.trim()));
    });
    child.stderr.on('data', (d) => {
      err = (err + String(d)).slice(-400);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      ok({ ok: false, text, why: e.message, seconds: 0, tools: 0, turns: 0 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim()) take(buf.trim());
      const bad = code !== 0 || (result && result.is_error) || (!text && !tools);
      ok({
        ok: !bad,
        text: text || (result && typeof result.result === 'string' ? result.result : ''),
        why: bad
          ? String(
              (result && (result.result || (result.subtype ? 'Claude Code ended with ' + result.subtype : ''))) ||
                err ||
                'exit ' + code,
            )
              .trim()
              .slice(0, 200)
          : '',
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        firstTokenMs: first ? first - startedAt : null,
        tools: toolUses,
        turns,
        code,
      });
    });
  });
}
// a group-chat turn: the seat's persona is the system prompt, the recent chat is the prompt
export const transcriptOf = (messages) =>
  messages.map((m) => (m.role === 'user' ? '' : 'You said earlier: ') + m.content).join('\n\n');

// ---------- sign-in: Claude Code's own ----------
// "claude auth status" prints JSON with loggedIn (its exit code is 1 when signed out, so only the JSON is read). "claude auth login" opens
// the browser itself; its sign-in address is read from what it prints, a code the page may show is written to it, and it exits 0 when done.
// The runner never supplies a credential, and the code is passed through, never kept or logged.
export async function claudeSignedIn(b) {
  const r = await sh(b, ['auth', 'status'], { timeout: 15000 });
  let j = null;
  try {
    const m = /\{[\s\S]*\}/.exec(r.out + '\n' + r.err);
    j = m && JSON.parse(m[0]);
  } catch {
    /* not JSON */
  }
  if (!j || typeof j.loggedIn !== 'boolean')
    return { signedIn: null, detail: 'Claude Code did not say whether it is signed in' };
  return {
    signedIn: j.loggedIn,
    detail: j.loggedIn
      ? 'Signed in' + (j.email ? ' as ' + j.email : '') + (j.subscriptionType ? ' (' + j.subscriptionType + ')' : '')
      : 'Not signed in',
  };
}
let flow = null; // one sign-in at a time
export const signInState = () =>
  flow ? { state: flow.state, url: flow.url || null, why: flow.why || '' } : { state: 'idle', url: null, why: '' };
export function claudeLogin(b, { dry = false, onChange = () => {} } = {}) {
  if (flow && (flow.state === 'starting' || flow.state === 'awaiting'))
    return { started: true, note: 'already under way', url: flow.url };
  if (dry) {
    flow = { state: 'awaiting', url: 'https://claude.ai/login' };
    onChange();
    return { started: true, note: 'dry run' };
  }
  mkdirSync(claudeRoot(), { recursive: true });
  const child = spawn(b, ['auth', 'login'], { cwd: claudeRoot(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const mine = (flow = { state: 'starting', child, url: null, why: '' });
  const read = (d) => {
    const m = /https:\/\/[^\s"'<>]+/.exec(String(d));
    if (m && !mine.url) {
      mine.url = m[0];
      mine.state = 'awaiting';
      onChange();
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  const timer = setTimeout(() => {
    mine.why = 'the sign-in was not finished within ten minutes';
    child.kill('SIGTERM');
  }, 10 * 60000);
  child.on('error', (e) => {
    clearTimeout(timer);
    mine.state = 'failed';
    mine.why = e.message;
    mine.child = null;
    onChange();
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    mine.child = null;
    mine.state = code === 0 ? 'done' : 'failed';
    if (code !== 0 && !mine.why) mine.why = 'Claude Code ended the sign-in (exit ' + code + ')';
    onChange();
  });
  onChange();
  return { started: true };
}
export function claudeLoginStop() {
  if (flow && flow.child) {
    flow.why = 'the sign-in was stopped';
    try {
      flow.child.kill('SIGTERM');
    } catch {
      /* gone */
    }
  }
} // setup was cancelled while it waited
export function claudeSubmitCode(code) {
  const v = String(code || '').trim();
  if (!v || !flow || !flow.child || flow.state !== 'awaiting') return false;
  flow.child.stdin.write(v + '\n');
  return true;
}
