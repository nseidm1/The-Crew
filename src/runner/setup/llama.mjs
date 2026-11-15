// llama.mjs (setup) - SETTING UP A LOCAL MODEL WITH LLAMA.CPP, the last rung of the engine waterfall.
import { measureHost } from '../host.mjs';
import { measureSpeed, speedLine, stopEngine } from '../engine.mjs';
import { ensureLlamaEngine, fetchLlamaModel, haveLlamaModel, serveLlama } from '../llama.mjs';
import { AGENT, LLAMA, SERVED_NAME } from '../../js/catalog.js';
import { agentCheck, checkLine, ensureAgent, fitFrom } from '../agent.mjs';
import { nodeFix } from '../node.mjs';
import { LLAMA_STEPS } from './steps.mjs';
import { updateFormula } from '../updates.mjs';

export function installLlamaSetup(runner) {
  // A TEAM ON LLAMA.CPP, the last engine on the waterfall (llama.mjs). The engine is one already on the machine, or its own pinned
  // build fetched into this app's folder; the model is one pinned file; both are kept only if their SHA-256 matches. From there it is
  // the same as any model: one timed reply, the agent, and three judged jobs. Pressing Try again carries a stopped download on.
  async function runLlamaSetup(model, { fetchNode = false } = {}) {
    const progress = (runner.setup = {
      model: { id: model.id, name: model.name },
      steps: LLAMA_STEPS.map((x) => ({ ...x, state: 'wait', pct: 0, line: '' })),
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
    const toGb = (n) => Math.round((n / 2 ** 30) * 10) / 10;
    const machine = (runner.host = await measureHost(runner.stateDir));
    runner.disk.session = null;
    stopEngine();
    runner.closeTunnel();
    await runner.dropStrata();
    runner.disk.engine = null;
    if (!machine.supported) return fail('engine', machine.blockers[0]);
    const ctl = (runner.seeCtl = new AbortController());
    const gone = () => {
      if (runner.seeCtl === ctl) runner.seeCtl = null;
    }; // Cancel stops a download where it is
    let step = start('engine');
    let eng;
    let got;
    try {
      eng = await ensureLlamaEngine({
        stateDir: runner.stateDir,
        arch: machine.arch,
        signal: ctl.signal,
        onBytes: (n) => {
          step.line = LLAMA.name + ', ' + Math.round(n / 2 ** 20) + ' MB';
          runner.push();
        },
      });
    } catch (e) {
      gone();
      throw e;
    }
    if (!eng.ok) {
      gone();
      return fail('engine', eng.why);
    }
    // a llama.cpp the machine already had, put there by Homebrew, is upgraded when a newer one is out (this app's own copy follows the catalog)
    if (eng.already && !eng.e.own)
      await updateFormula({
        stateDir: runner.stateDir,
        formula: 'llama.cpp',
        name: LLAMA.name,
        file: eng.e.file,
        onLine: (l) => {
          step.line = l;
          runner.push();
        },
      }).catch(() => {});
    const ver = eng.ver.text;
    progress.result.engine = ver;
    machine.tools.llama = { path: eng.e.file, version: ver, own: eng.e.own, card: (eng.gpu || [])[0] || '' };
    progress.result.card = (eng.gpu || [])[0] || ''; // the graphics card the engine says it can use, if any
    if (machine.engine === 'llama') machine.tools.engine = machine.tools.llama; // the model page's plan no longer lists the engine as something to fetch
    end(
      'engine',
      LLAMA.name +
        ' ' +
        ver +
        (eng.already
          ? eng.e.own
            ? ", this app's own copy"
            : ' was already on this machine'
          : " fetched, checked against its SHA-256 and unpacked into this app's own folder" +
            (eng.beside
              ? '. The ' + eng.beside + ' already on this machine was too old for these models, and was left as it is'
              : '')) +
        (eng.gpu && eng.gpu.length
          ? '. It runs the model on this graphics card: ' + eng.gpu[0]
          : eng.e.own
            ? ". It runs the model on this machine's processor"
            : ''),
    );
    const sizeGb = toGb(model.bytes);
    step = start('model', model.name + ', ' + sizeGb + ' GB');
    if (await haveLlamaModel(runner.stateDir, model)) end('model', model.name + ' was already on this machine');
    else {
      if (machine.diskFreeGb != null && machine.diskFreeGb < sizeGb * 1.1) {
        gone();
        return fail(
          'model',
          'Not enough disk: the model needs ' + sizeGb + ' GB and ' + machine.diskFreeGb + ' GB is free.',
        );
      }
      try {
        got = await fetchLlamaModel(model, {
          stateDir: runner.stateDir,
          signal: ctl.signal,
          onBytes: (n) => {
            step.pct = Math.min(1, n / model.bytes);
            step.detail = model.name + ', ' + toGb(n) + ' of ' + sizeGb + ' GB';
            runner.push();
          },
        });
      } catch (e) {
        gone();
        throw e;
      }
      if (!got.ok) {
        gone();
        return fail('model', got.why);
      }
      end('model', model.name + ', ' + sizeGb + ' GB, checked against the SHA-256 its Hugging Face page lists');
    }
    gone();
    step = start('server', 'Loading ' + model.name + ' into memory');
    const launched = await serveLlama(model, eng.e, { stateDir: runner.stateDir, onLine: lineTo('server') });
    if (!launched.ok) return fail('server', 'The model did not start: ' + launched.why);
    runner.disk.engine = {
      kind: 'llama',
      base: launched.base,
      port: launched.port,
      pid: launched.pid,
      model: SERVED_NAME,
      id: model.id,
    };
    progress.result.loadSeconds = Math.round(launched.loadMs / 100) / 10;
    end(
      'server',
      'Serving on 127.0.0.1:' +
        launched.port +
        ' as ' +
        SERVED_NAME +
        ', loaded in ' +
        progress.result.loadSeconds +
        ' s',
    );
    const target = { base: launched.base, model: SERVED_NAME };
    step = start('speed');
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
      const lost = progress.jobs.find((x) => x.crashed);
      if (lost && lost.engine)
        return fail(
          'check',
          'The model server refused what ' +
            AGENT.name +
            ' asked of it, so the model never saw a job: ' +
            (lost.note || 'no reason given') +
            ' Nothing was learned about the model. Try again; if it says the same, choose another model.',
        );
      if (lost)
        return fail(
          'check',
          AGENT.name +
            ' stopped before it could try a job, on every Node.js this machine has: ' +
            (lost.note || 'no reason given') +
            '. Nothing was learned about the model.',
          nodeFix(AGENT.name + ' could not be kept running here.'),
        );
    }
    const passed = progress.jobs.filter((x) => x.pass).length;
    const fit = (runner.disk.fit[model.id] = runner.tuned(model.id, fitFrom(progress.jobs)));
    end('check', checkLine(progress.jobs));
    const measured = {
      at: Date.now(),
      host: machine.chip + ', ' + machine.memoryGb + ' GB',
      engine: LLAMA.name + ' ' + ver,
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
    runner.disk.session = {
      name: 'Local team',
      at: Date.now(),
      model: model.name,
      modelId: model.id,
      engine: LLAMA.name + ' ' + ver,
      agent: AGENT.name + ' ' + agent.version,
      host: measured.host,
      kind: 'llama',
      base: launched.base,
      measured,
    };
    progress.done = true;
    await runner.save();
    runner.push();
    return true;
  }

  Object.assign(runner, { runLlamaSetup });
}
