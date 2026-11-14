// strata.mjs (setup) - SETTING UP A LOCAL MODEL WITH STRATA, for a machine that is not an Apple silicon Mac.
import { measureHost } from '../host.mjs';
import { measureSpeed, stopEngine } from '../engine.mjs';
import { AGENT, LLAMA, STRATA } from '../../js/catalog.js';
import { installStrata, launchStrata, planStrata, strataVersion } from '../strata.mjs';
import { agentCheck, checkLine, ensureAgent, fitFrom } from '../agent.mjs';
import { nodeFix } from '../node.mjs';
import { STRATA_STEPS } from './steps.mjs';

export function installStrataSetup(runner) {
  // A TEAM ON STRATA (a machine that is not an Apple silicon Mac). Strata is installed by its own installer, asked for its plan
  // (what it would download, and whether it can run the model here at all), and told to fetch and serve the model on a port of this
  // app's own. From there it is the same as any model: one timed reply, the agent, and three judged jobs.
  async function runStrataSetup(model, { fetchNode = false } = {}) {
    const progress = (runner.setup = {
      model: { id: model.id, name: model.name },
      steps: STRATA_STEPS.map((x) => ({ ...x, state: 'wait', pct: 0, line: '' })),
      jobs: [],
      result: {},
      done: false,
      error: null,
      startedAt: Date.now(),
    });
    const S = (id) => progress.steps.find((x) => x.id === id);
    const start = (id, detail) => {
      if (runner.cancelled) throw new Error('cancelled');
      const s = S(id);
      s.state = 'run';
      if (detail) s.detail = detail;
      runner.push();
      return s;
    };
    const end = (id, detail) => {
      const s = S(id);
      s.state = 'done';
      s.pct = 1;
      s.line = '';
      if (detail) s.detail = detail;
      runner.push();
    };
    const fail = (id, why, fix) => {
      const s = S(id);
      s.state = 'fail';
      s.line = '';
      progress.error = { step: id, why, fix: fix || null };
      runner.push();
      return false;
    };
    const lineTo = (id) => (line) => {
      S(id).line = String(line).slice(0, 140);
      runner.push();
    };
    const machine = (runner.host = await measureHost(runner.stateDir));
    runner.disk.session = null;
    stopEngine();
    runner.closeTunnel();
    await runner.dropStrata();
    runner.disk.engine = null;
    if (!machine.supported) return fail('engine', machine.blockers[0]);
    // STRATA SAYING NO IS WHAT SENDS THIS MACHINE ONE RUNG DOWN: it is remembered, and the model page then offers llama.cpp's models too
    const down = async (id, why) => {
      runner.disk.strataFailed = { at: Date.now(), why: String(why).slice(0, 200) };
      await runner.save();
      return fail(id, why + ' Smaller models, run by ' + LLAMA.name + ' instead, are now on the model page.');
    };
    let step = start('engine');
    const inst = await installStrata({ stateDir: runner.stateDir, onLine: lineTo('engine') });
    if (!inst.ok) return down('engine', inst.why);
    const ver = await strataVersion();
    progress.result.engine = ver;
    end('engine', STRATA.name + ' ' + ver + (inst.already ? ' was already installed' : ' installed'));
    step = start('plan');
    const plan = await planStrata(model);
    if (!plan.ok) return down('plan', plan.why);
    if (plan.gb && machine.diskFreeGb != null && machine.diskFreeGb < plan.gb * 1.05)
      return fail(
        'plan',
        'Not enough disk: ' +
          STRATA.name +
          ' needs to download ' +
          plan.gb +
          ' GB and ' +
          machine.diskFreeGb +
          ' GB is free.',
      );
    end(
      'plan',
      plan.gb
        ? STRATA.name + ' will download ' + plan.gb + ' GB'
        : plan.plan
          ? 'Everything it needs is already on this machine'
          : plan.says || STRATA.name + ' gave its plan',
    );
    step = start('model', model.name + (plan.gb ? ', ' + plan.gb + ' GB to download' : ''));
    runner.ownStrata = true;
    const launched = await launchStrata(model, { onLine: lineTo('model') });
    if (!launched.ok) return fail('model', launched.why);
    runner.disk.engine = {
      kind: 'strata',
      base: launched.base,
      port: launched.port,
      model: launched.model,
      id: model.id,
    };
    progress.result.loadSeconds = launched.seconds;
    end(
      'model',
      'Served by ' + STRATA.name + ' on 127.0.0.1:' + launched.port + ', where only this machine can reach it',
    );
    const target = { base: launched.base, model: launched.model };
    step = start('speed');
    try {
      progress.result.speed = await measureSpeed(target);
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
    step = start('agent');
    const agent = await ensureAgent(runner.stateDir, machine.tools.node && machine.tools.node.path, {
      onLine: lineTo('agent'),
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
      port: runner.serve(target, model.id),
      via: runner.proxy,
      before: runner.disk.fit[model.id],
      halt: () => runner.cancelled,
      repair: async () => {
        const again = await ensureAgent(runner.stateDir, null, { onLine: lineTo('check'), avoid: [agent.node] });
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
    const fit = (runner.disk.fit[model.id] = runner.tuned(model.id, fitFrom(progress.jobs)));
    end('check', checkLine(progress.jobs));
    const measured = {
      at: Date.now(),
      host:
        machine.chip +
        ', ' +
        machine.memoryGb +
        ' GB' +
        (machine.gpus.length ? ', ' + machine.gpus.map((g) => g.name + ' ' + g.vramGb + ' GB').join(' and ') : ''),
      engine: STRATA.name + ' ' + ver,
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
    runner.disk.measured[model.id] = measured;
    delete runner.disk.strataFailed;
    runner.disk.session = {
      name: 'Local team',
      at: Date.now(),
      model: model.name,
      modelId: model.id,
      engine: STRATA.name + ' ' + ver,
      agent: AGENT.name + ' ' + agent.version,
      host: measured.host,
      kind: 'strata',
      base: launched.base,
      measured,
    };
    progress.done = true;
    await runner.save();
    runner.push();
    return true;
  }

  Object.assign(runner, { runStrataSetup });
}
