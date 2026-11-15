// claude.mjs - the second engine: Claude Code, already installed and signed in on this machine by the customer. The runner only ever
// starts the customer's own `claude` command, the way they could from a terminal. It never sees, stores or sends a sign-in: there is no
// "log in with Claude" here, and a website may not offer one. Every run starts in a folder of its own outside any project, so no
// project's settings or hooks are picked up.
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { bin, sh } from './host.mjs';
import { run, track } from './engine.mjs';
import { openPage } from './connectors.mjs';

// Anthropic's own installer, run only when Claude Code is not on the machine. It puts Claude Code in the customer's home folder.
// On Windows it is their PowerShell installer: it needs no administrator rights and puts claude.exe in the person's own folder.
const WIN = process.platform === 'win32';
export const CLAUDE_INSTALL = WIN
  ? 'irm https://claude.ai/install.ps1 | iex'
  : 'curl -fsSL https://claude.ai/install.sh | bash';
export const CLAUDE_DOCS = 'https://code.claude.com/docs/en/setup';
export async function installClaude({ onLine, stateDir }) {
  let script = process.env.FO_CLAUDE_INSTALL_SH;
  if (!script) {
    if (process.env.FO_NO_NET === '1') return { ok: false, why: 'the installer could not be fetched (offline)' };
    try {
      const res = await fetch(WIN ? 'https://claude.ai/install.ps1' : 'https://claude.ai/install.sh');
      if (!res.ok) throw new Error('status ' + res.status);
      script = path.join(stateDir, WIN ? 'claude-install.ps1' : 'claude-install.sh');
      await mkdir(stateDir, { recursive: true });
      await writeFile(script, await res.text());
    } catch (err) {
      return { ok: false, why: 'the installer could not be fetched: ' + String(err.message).slice(0, 80) };
    }
  }
  // the installer is a file on this machine by now, run by the system's own shell for it
  const r = /\.ps1$/i.test(script)
    ? await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
        onLine,
        timeout: 10 * 60000,
      })
    : await run('/bin/bash', [script], { onLine, timeout: 10 * 60000 });
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
  // where Anthropic's installers put it (a server started before the install does not have it on its PATH yet)
  for (const c of [
    path.join(os.homedir(), '.claude/local/claude'),
    path.join(os.homedir(), '.local/bin/claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
    path.join(os.homedir(), '.claude', 'local', 'claude.exe'),
  ])
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
export const claudeFix = (kind, said, who) =>
  kind === 'missing'
    ? {
        kind: 'claude',
        title: 'Claude Code is not installed on this machine',
        text: 'This option runs your team on Claude Code. It is not on this machine, and it could not be installed for you just now.',
        steps: [
          // (a card never gives a person something to type: it sends them to Anthropic's own page, which has the steps for their system)
          'Open code.claude.com/docs/en/setup and install Claude Code from there. It is a separate program from the Claude desktop app, and the desktop app alone is not enough for a team.',
          'Come back here and press Try again. We find it, and start its sign-in for you if it needs one.',
        ],
        actions: [],
        link: { href: CLAUDE_DOCS, label: "Anthropic's install page for Claude Code" },
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
            '. ' +
            (who ? 'Claude Code is ' + who.replace(/^S/, 's') + '. ' : '') +
            'The usual causes are that its sign-in has lapsed, or that this account has no plan that includes Claude Code.',
          steps: [
            'Press "Sign in to Claude" to sign in again as the same account.',
            'Or press "Use another account": Claude Code is signed out, and setup starts again at its sign-in step.',
            'When the sign-in finishes, setup carries on by itself.',
          ],
          actions: [
            { id: 'claude-login', label: 'Sign in to Claude' },
            { id: 'claude-other', label: 'Use another account' },
          ],
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
// sign Claude Code out, with its own command, so the next sign-in can be as someone else. Nothing of the account is read or kept here.
export async function claudeSignOut(b) {
  const r = await sh(b, ['auth', 'logout'], { timeout: 20000 });
  afresh = true; // the sign-in that follows is for a different account (see freshSignInUrl)
  const now = await claudeSignedIn(b);
  // only "still signed in" is a failure: where Claude Code does not say either way, its sign-out is taken at its word
  return now.signedIn !== true
    ? { ok: true }
    : { ok: false, why: (r.err || r.out || 'Claude Code is still signed in').split('\n')[0].slice(0, 160) };
}
let flow = null; // one sign-in at a time
let afresh = false; // Claude Code was signed out on purpose: the sign-in that follows is for a different account

// SIGNING CLAUDE CODE OUT DOES NOT SIGN THE BROWSER OUT. Claude Code's own sign-out clears what Claude Code keeps on this machine,
// and nothing else: the browser is still signed in to claude.ai, so the sign-in page that follows goes straight through on the
// same account and the person is never asked who they are. Claude's own sign-in screen has a form for this, the one its page
// uses after a sign-out there: the login screen, asked to sign in again, which then returns to the authorization it was given.
// That address is what a sign-in for a different account is opened on. The plain address Claude Code prints is kept beside it
// (`plain`): it is the contract, and it still works if Claude ever changes its login screen.
export function freshSignInUrl(authorizeUrl) {
  if (!authorizeUrl) return null;
  try {
    const u = new URL(authorizeUrl);
    if (!/(^|\.)claude\.(ai|com)$/.test(u.hostname)) return null;
    const back = u.pathname.replace(/^\/cai/, '') + u.search; // claude.com serves it under /cai; the login screen is on claude.ai, which has no such prefix
    return 'https://claude.ai/login?reauth=1&from=logout&returnTo=' + encodeURIComponent(back);
  } catch {
    return null;
  }
}
// THE ONE PAGE OF A SIGN-IN, AND WHO OPENS IT. Claude Code has two addresses for one sign-in: the one it opens in the browser by
// itself, which comes back to Claude Code on this machine and finishes with nothing more to do; and the one it prints, for when no
// browser opened, which ends on a code to paste back. Left to itself it opens the first in a tab of its own, and a sign-in that
// is then started again leaves that tab behind, still open, finishing against a sign-in that is no longer waiting ("Sign-in did
// not complete": found on a real machine). So Claude Code is told to hand the address to this app instead of opening it (its own
// BROWSER setting, measured: it is given the address that finishes by itself), and this app opens ONE page: that address, or
// Claude's sign-in screen in front of it when the sign-in is for a different account. Where Claude Code does not hand it over
// (a system where its BROWSER setting is not honoured), the printed address is used, and the page says a code will be shown.
const pageOf = (f) => {
  const to = f.auto || f.url || null;
  return (f.fresh && freshSignInUrl(to)) || to;
};
export const signInState = () =>
  flow
    ? {
        state: flow.state,
        url: pageOf(flow),
        plain: flow.url || null,
        fresh: !!flow.fresh,
        code: !flow.auto, // no address that finishes by itself: Claude's page will show a code to paste
        why: flow.why || '',
      }
    : { state: 'idle', url: null, plain: null, fresh: false, code: false, why: '' };
// what Claude Code is given as its browser: a small program that writes down the address it was asked to open
function pageCatcher() {
  const dir = claudeRoot();
  mkdirSync(dir, { recursive: true });
  const note = path.join(dir, 'sign-in-page.txt');
  rmSync(note, { force: true });
  if (process.platform === 'win32') {
    const js = path.join(dir, 'catch-page.cjs');
    writeFileSync(js, "require('fs').writeFileSync(" + JSON.stringify(note) + ", process.argv.slice(2).join(' '));\n");
    const cmd = path.join(dir, 'catch-page.cmd');
    writeFileSync(cmd, '@echo off\r\n"' + process.execPath + '" "' + js + '" %*\r\n');
    return { browser: cmd, note };
  }
  const sh0 = path.join(dir, 'catch-page.sh');
  writeFileSync(sh0, "#!/bin/sh\nprintf '%s' \"$1\" > '" + note.replace(/'/g, "'\\''") + "'\n");
  chmodSync(sh0, 0o755);
  return { browser: sh0, note };
}
export function claudeLogin(b, { dry = false, onChange = () => {} } = {}) {
  if (flow && (flow.state === 'starting' || flow.state === 'awaiting'))
    return { started: true, note: 'already under way', url: flow.url };
  const fresh = afresh; // this sign-in follows a deliberate sign-out: it is opened on Claude's sign-in screen
  afresh = false;
  if (dry) {
    flow = { state: 'awaiting', url: 'https://claude.ai/login', fresh };
    onChange();
    return { started: true, note: 'dry run' };
  }
  const caught = pageCatcher();
  const child = spawn(b, ['auth', 'login'], {
    cwd: claudeRoot(),
    env: { ...process.env, BROWSER: caught.browser },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const mine = (flow = { state: 'starting', child, url: null, auto: null, why: '', fresh, opened: false });
  // the one page is opened once: as soon as Claude Code has handed its address over, or a moment after it printed one without doing so
  const open = () => {
    if (mine.opened || flow !== mine || mine.state !== 'awaiting') return;
    mine.opened = true;
    openPage(pageOf(mine));
    onChange();
  };
  const look = setInterval(() => {
    if (flow !== mine || mine.opened || !mine.child) return clearInterval(look);
    let got = '';
    try {
      got = readFileSync(caught.note, 'utf8').trim();
    } catch {
      got = '';
    }
    if (/^https:\/\//.test(got)) {
      mine.auto = got;
      if (mine.state === 'starting') mine.state = 'awaiting';
      clearInterval(look);
      open();
    }
  }, 150);
  const read = (d) => {
    const m = /https:\/\/[^\s"'<>]+/.exec(String(d));
    if (m && !mine.url) {
      mine.url = m[0];
      mine.state = 'awaiting';
      onChange();
      setTimeout(open, 2500); // it has printed where to go: if it has not handed the other address over by now, this is the one
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
