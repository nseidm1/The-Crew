// existing-server.mjs - A TEAM ON A MODEL SERVER THAT IS ALREADY RUNNING, on this machine or on another (directly, or through an SSH
// tunnel the runner opens and closes). Nothing is installed on that server and it is never stopped.
import { measureHost } from '../host.mjs';
import { openTunnel, probe } from '../detect.mjs';
import { measureSpeed, speedLine, stopEngine, track } from '../engine.mjs';
import { agentCheck, checkLine, ensureAgent, fitFrom } from '../agent.mjs';
import { AGENT } from '../../js/catalog.js';
import { nodeFix } from '../node.mjs';
import { EXISTING_STEPS } from './steps.mjs';

export function installExistingSetup(runner) {
  async function runExistingSetup({ base, model, name, where, ssh }, { resume = false, fetchNode = false } = {}) {
    const STEPS = ssh
      ? [
          {
            id: 'engine',
            title: 'Open a private tunnel',
            detail: 'SSH to ' + ssh.dest + ', with the keys this machine already has',
          },
          ...EXISTING_STEPS,
        ]
      : EXISTING_STEPS;
    const progress = (runner.setup = {
      model: { id: 'existing', name: model },
      steps: STEPS.map((x) => ({ ...x, state: 'wait', pct: 0, line: '' })),
      jobs: [],
      result: {},
      done: false,
      error: null,
      startedAt: Date.now(),
    });
    const S = (id) => progress.steps.find((x) => x.id === id);
    const lineTo = (id) => (line) => {
      S(id).line = String(line).slice(0, 140);
      runner.push();
    };
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
    const machine = (runner.host = await measureHost(runner.stateDir));
    // still reachable (the tunnel is still open) and already measured: carry on from the agent
    const kept =
      resume &&
      runner.carry &&
      runner.carry.result.speed &&
      runner.disk.engine &&
      runner.disk.engine.kind === 'existing' &&
      runner.disk.engine.model === model &&
      !!(await probe(runner.disk.engine.base, 3000));
    if (kept) {
      base = runner.disk.engine.base;
      for (const x of progress.steps)
        if (['engine', 'tools', 'speed'].includes(x.id)) end(x.id, runner.carry.details[x.id]);
      progress.result = { ...runner.carry.result };
    } else {
      runner.disk.session = null;
      stopEngine();
      runner.closeTunnel();
      runner.disk.engine = null;
    }
    if (ssh && !kept) {
      start('engine');
      const t = await openTunnel(ssh);
      if (!t.ok) return fail('engine', t.why);
      runner.tunnel = track(t.child);
      base = t.base;
      end('engine', '127.0.0.1:' + t.local + ' on this machine reaches port ' + ssh.port + ' on ' + ssh.dest);
    }
    const target = { base, model };
    const at = ssh ? ssh.dest + ' port ' + ssh.port : new URL(base).host;

    if (!kept) {
      start('tools');
      const found = await probe(base, 4000);
      if (!found) return fail('tools', 'Nothing at ' + at + ' answers as a model server any more.');
      if (!found.models.includes(model))
        return fail('tools', 'The server at ' + at + ' no longer lists ' + model + '.');
      end('tools', name + ' at ' + at + ' lists ' + model);
      runner.disk.engine = { kind: 'existing', base, model, ssh: ssh || null };

      start('speed');
      try {
        progress.result.speed = await measureSpeed(target, { onTick: (t) => lineTo('speed')(speedLine(t)) });
      } catch (e) {
        return fail('speed', 'The model did not answer: ' + String(e.message).slice(0, 160));
      }
      end(
        'speed',
        progress.result.speed.tokPerSec +
          ' tokens a second, first token in ' +
          progress.result.speed.firstTokenMs +
          ' ms',
      );
    }

    let step = start('agent');
    const agent = await ensureAgent(runner.stateDir, machine.tools.node && machine.tools.node.path, {
      onLine: (l) => {
        step.line = String(l).slice(0, 140);
        runner.push();
      },
      fetch: fetchNode,
    });
    if (!agent.ok) return fail('agent', agent.why, agent.fix);
    progress.result.agent = agent.version;
    end(
      'agent',
      AGENT.name +
        ' ' +
        agent.version +
        (agent.already ? ' was already installed' : ' installed') +
        (agent.says ? '. ' + agent.says : ''),
    );

    step = start('check');
    progress.jobs = await agentCheck({
      jobs: runner.checkJobs(),
      learn: true,
      stateDir: runner.stateDir,
      nodeBin: agent.node || (machine.tools.node && machine.tools.node.path),
      cli: agent.cli,
      port: runner.serve(target, 'existing:' + model),
      via: runner.proxy,
      before: runner.disk.fit['existing:' + model],
      halt: () => runner.cancelled,
      repair: async () => {
        const again = await ensureAgent(runner.stateDir, null, {
          onLine: (l) => {
            step.line = String(l).slice(0, 140);
            runner.push();
          },
          avoid: [agent.node],
        });
        return again.ok ? again.node : null;
      },
      onJob: (row) => {
        const i = progress.jobs.findIndex((x) => x.id === row.id);
        if (i >= 0) progress.jobs[i] = row;
        else progress.jobs.push(row);
        step.pct = progress.jobs.filter((x) => x.state === 'done').length / Math.max(1, runner.checkJobs().length);
        runner.push();
      },
    });
    {
      const down = progress.jobs.find((x) => x.crashed);
      if (down && down.engine)
        return fail(
          'check',
          'The model server refused what ' +
            AGENT.name +
            ' asked of it, so the model never saw a job: ' +
            (down.note || 'no reason given') +
            ' Nothing was learned about the model. Try again; if it says the same, choose another model.',
        );
      if (down)
        return fail(
          'check',
          AGENT.name +
            ' stopped before it could try a job, on every Node.js this machine has: ' +
            (down.note || 'no reason given') +
            '. Nothing was learned about the model.',
          nodeFix(AGENT.name + ' could not be kept running here.'),
        );
    }
    const passed = progress.jobs.filter((x) => x.pass).length;
    const fit = (runner.disk.fit['existing:' + model] = runner.tuned('existing:' + model, fitFrom(progress.jobs)));
    end('check', checkLine(progress.jobs));

    const measured = {
      at: Date.now(),
      host: machine.chip + ', ' + machine.memoryGb + ' GB',
      engine: name,
      agent: agent.version,
      tokPerSec: progress.result.speed.tokPerSec,
      firstTokenMs: progress.result.speed.firstTokenMs,
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
    runner.disk.session = {
      name: 'Local team',
      at: Date.now(),
      model,
      modelId: 'existing',
      engine: name + (where === 'This machine' ? ', already running here' : ', served from ' + where),
      agent: AGENT.name + ' ' + agent.version,
      host: measured.host,
      kind: 'existing',
      base,
      measured,
    };
    progress.done = true;
    await runner.save();
    runner.push();
    return true;
  }

  Object.assign(runner, { runExistingSetup });
}
