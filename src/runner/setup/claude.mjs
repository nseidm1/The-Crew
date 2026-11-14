// claude.mjs (setup) - A TEAM ON CLAUDE CODE: find it or install it, its own sign-in, one timed reply, and the agent check.
import { stopEngine } from '../engine.mjs';
import { measureHost } from '../host.mjs';
import {
  claudeFix,
  claudeLogin,
  claudeLoginStop,
  claudeRoot,
  claudeRun,
  claudeSignedIn,
  claudeVersion,
  findClaude,
  installClaude,
  signInState,
} from '../claude.mjs';
import path from 'node:path';
import { agentCheck, checkLine, fitFrom } from '../agent.mjs';
import { CLAUDE_STEPS, INSTALLING } from './steps.mjs';

export function installClaudeSetup(runner) {
  async function runClaudeSetup() {
    const progress = (runner.setup = {
      model: { id: 'claude', name: 'Claude' },
      steps: CLAUDE_STEPS.map((x) => ({ ...x, state: 'wait', pct: 0, line: '' })),
      jobs: [],
      result: {},
      done: false,
      error: null,
      startedAt: Date.now(),
    });
    const S = (id) => progress.steps.find((x) => x.id === id);
    const start = (id) => {
      if (runner.cancelled) throw new Error('cancelled');
      const s = S(id);
      s.state = 'run';
      runner.push();
      return s;
    };
    const end = (id, detail) => {
      const s = S(id);
      s.state = 'done';
      s.pct = 1;
      if (detail) s.detail = detail;
      runner.push();
    };
    const fail = (id, why, fix) => {
      S(id).state = 'fail';
      progress.error = { step: id, why, fix: fix || null };
      runner.push();
      return false;
    };
    runner.disk.session = null;
    stopEngine();
    runner.closeTunnel();
    runner.disk.engine = null;
    const machine = (runner.host = await measureHost(runner.stateDir));

    start('tools');
    let claude = await findClaude();
    end('tools', claude ? 'Found at ' + claude : 'Not on this machine yet');
    const es = start('engine');
    if (!claude) {
      es.detail = INSTALLING;
      runner.push();
      const inst = await installClaude({
        stateDir: runner.stateDir,
        onLine: (l) => {
          es.line = l.slice(0, 140);
          runner.push();
        },
      });
      claude = await findClaude();
      if (!inst.ok || !claude) {
        const fx = claudeFix('missing');
        return fail('engine', 'Claude Code could not be installed: ' + (inst.why || 'it was not found afterwards'), fx);
      }
    }
    const ver = await claudeVersion(claude);
    es.line = '';
    end('engine', 'Claude Code ' + (ver || '') + (es.detail === INSTALLING ? ' installed' : ' was already installed'));

    const si = start('signin');
    let who = await claudeSignedIn(claude);
    if (who.signedIn === false) {
      // SIGNED OUT IS NOT A FAILURE: signing in is this step. Claude Code's own sign-in is started here and now (it opens Claude's page in
      // the customer's browser); the page shows it as the step under way; and setup carries on by itself the moment it is finished.
      // (A test with no network starts the stand-in's sign-in; the real one is never started by a test, since it opens a window.)
      si.detail = 'Waiting for you to sign in to Claude in your browser';
      si.waiting = 'signin';
      runner.push();
      claudeLogin(claude, { dry: process.env.FO_NO_NET === '1' && !process.env.FO_BIN_CLAUDE, onChange: runner.push });
      for (const until = Date.now() + 10 * 60000; ;) {
        if (runner.cancelled) {
          claudeLoginStop();
          throw new Error('cancelled');
        }
        const f = signInState();
        if (f.state === 'done' || f.state === 'failed' || f.state === 'idle' || Date.now() > until) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      who = await claudeSignedIn(claude);
      si.waiting = '';
      si.detail = 'Your own Claude sign-in, kept by Claude Code. We never see it.';
      if (who.signedIn === false) {
        const fx = claudeFix('signin');
        return fail('signin', fx.title, fx);
      }
    }
    end('signin', who.detail || 'Signed in'); // unknown is let through: the one question below settles it

    start('speed');
    const one = await claudeRun({
      bin: claude,
      cwd: path.join(claudeRoot(), 'chat'),
      prompt: 'Reply with one short sentence saying you are ready to work.',
      system: 'You are a helpful engineer. Answer in one sentence.',
    });
    if (!one.ok) {
      const fx = claudeFix('silent', one.why);
      return fail('speed', fx.title, fx);
    }
    progress.result.speed = { replySeconds: one.seconds, firstTokenMs: one.firstTokenMs };
    end(
      'speed',
      'Answered in ' + one.seconds + ' s' + (one.firstTokenMs ? ', first word in ' + one.firstTokenMs + ' ms' : ''),
    );

    const s = start('check');
    progress.jobs = await agentCheck({
      jobs: runner.checkJobs(),
      learn: true,
      stateDir: runner.stateDir,
      root: path.join(claudeRoot(), 'check'),
      nodeBin: machine.tools.node && machine.tools.node.path,
      before: runner.disk.fit.claude,
      halt: () => runner.cancelled,
      runJob: async ({ cwd, prompt }) => {
        const r = await claudeRun({ bin: claude, cwd, prompt, tools: true, maxTurns: 30, timeout: 5 * 60000 });
        return { code: r.ok ? 0 : 1, seconds: r.seconds, tools: r.tools, turns: r.turns, tail: r.why };
      },
      onJob: (row) => {
        const i = progress.jobs.findIndex((y) => y.id === row.id);
        if (i >= 0) progress.jobs[i] = row;
        else progress.jobs.push(row);
        s.pct = progress.jobs.filter((y) => y.state === 'done').length / Math.max(1, runner.checkJobs().length);
        runner.push();
      },
    });
    const passed = progress.jobs.filter((y) => y.pass).length;
    const fit = (runner.disk.fit.claude = fitFrom(progress.jobs));
    end('check', checkLine(progress.jobs));

    const measured = {
      at: Date.now(),
      host: machine.chip + ', ' + machine.memoryGb + ' GB',
      engine: 'Claude Code ' + (ver || ''),
      replySeconds: one.seconds,
      firstTokenMs: one.firstTokenMs,
      passed,
      of: progress.jobs.length,
      fit,
      jobs: progress.jobs.map(({ id, title, pass, seconds, tools, why, how, tries }) => ({
        id,
        title,
        pass,
        seconds,
        tools,
        why,
        how,
        tries,
      })),
    };
    runner.disk.engine = { kind: 'claude', bin: claude };
    runner.disk.measured.claude = measured;
    runner.disk.session = {
      name: 'Claude team',
      at: Date.now(),
      model: 'Claude',
      modelId: 'claude',
      engine: 'Claude Code ' + (ver || ''),
      agent: 'Claude Code',
      host: measured.host,
      kind: 'claude',
      measured,
    };
    progress.done = true;
    await runner.save();
    runner.push();
    return true;
  }

  Object.assign(runner, { runClaudeSetup });
}
