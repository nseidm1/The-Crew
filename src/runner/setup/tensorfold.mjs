// tensorfold.mjs - SETTING UP A LOCAL MODEL WITH TENSORFOLD (Apple silicon): the tools it needs, the engine, the model, the server,
// one timed reply, the agent, and the agent check. Each step is shown as it happens, and a setup that stopped carries on from there.
import { measureHost } from '../host.mjs';
import {
  alive,
  engineVersion,
  installEngine,
  installRoute,
  isCached,
  measureSpeed,
  speedLine,
  pullModel,
  serveModel,
  sizeOf,
  stopEngine,
} from '../engine.mjs';
import { AGENT, ENGINE, SERVED_NAME } from '../../js/catalog.js';
import { agentCheck, checkLine, ensureAgent, fitFrom } from '../agent.mjs';
import { nodeFix } from '../node.mjs';
import { STEPS } from './steps.mjs';
import { updateEngine } from '../updates.mjs';

export function installTensorfoldSetup(runner) {
  // addon: the add-on that reads pictures, when the customer ticked it on the model page. Its four steps (eyes.mjs) are the last steps
  // of this setup, after the team itself has passed its check. If they fail, the team is still set up: the step says why.
  async function runSetup(model, { resume = false, fetchNode = false, addons = [] } = {}) {
    const pre = (a) => (a.kind === 'see' ? 'see' : a.id) + '-'; // each helper's steps carry its own prefix
    const progress = (runner.setup = {
      model: { id: model.id, name: model.name },
      steps: [...STEPS, ...addons.flatMap((a) => runner.eyes.steps(a).map((x) => ({ ...x, id: pre(a) + x.id })))].map(
        (x) => ({
          ...x,
          state: 'wait',
          pct: 0,
          line: '',
        }),
      ),
      jobs: [],
      result: {},
      done: false,
      error: null,
      startedAt: Date.now(),
    });
    const stepOf = (id) => progress.steps.find((x) => x.id === id);
    const start = (id, detail) => {
      if (runner.cancelled) throw new Error('cancelled');
      const s = stepOf(id);
      s.state = 'run';
      if (detail) s.detail = detail;
      runner.push();
      return s;
    };
    const end = (id, detail) => {
      const s = stepOf(id);
      s.state = 'done';
      s.pct = 1;
      s.line = '';
      if (detail) s.detail = detail;
      runner.push();
    };
    const fail = (id, why, fix) => {
      const s = stepOf(id);
      s.state = 'fail';
      s.line = '';
      progress.error = { step: id, why, fix: fix || null };
      runner.push();
      return false;
    };
    const lineTo = (id) => (line) => {
      stepOf(id).line = line.slice(0, 140);
      runner.push();
    };
    const machine = (runner.host = await measureHost(runner.stateDir));
    const kept =
      resume &&
      runner.carry &&
      runner.carry.result.speed &&
      runner.disk.engine &&
      runner.disk.engine.kind === 'local' &&
      runner.disk.engine.model === model.id &&
      (await alive(runner.disk.engine.port)); // the model is still served and measured: carry on from the agent
    let step;
    let srv;
    let ver;
    if (kept) {
      for (const id of ['tools', 'engine', 'model', 'server', 'speed']) end(id, runner.carry.details[id]);
      progress.result = { ...runner.carry.result };
      srv = { port: runner.disk.engine.port };
      ver = runner.carry.result.engine;
    } else {
      runner.disk.session = null;
      stopEngine();
      runner.closeTunnel();
      runner.disk.engine = null;
      if (!machine.supported) return fail('engine', machine.blockers[0]);

      step = start('tools');
      const way = installRoute(machine.tools);
      const c = machine.tools.clt;
      if (way.route === 'none') return fail('tools', way.fix.title, way.fix);
      end(
        'tools',
        way.route === 'have'
          ? ENGINE.name + ' is already installed: nothing more is needed'
          : way.route === 'signed'
            ? 'A signed release can be installed directly: no build tools needed'
            : 'Homebrew will build it. Command Line Tools: ' +
              (c && c.installed ? c.version || 'installed' : 'not checked'),
      );

      step = start('engine');
      const eng = await installEngine({ onLine: lineTo('engine'), tools: machine.tools, stateDir: runner.stateDir });
      if (!eng.ok) return fail('engine', eng.why, eng.fix);
      // already here: brought up to date the way it was installed. A failed update is said and the one here is used.
      if (eng.already) await updateEngine({ stateDir: runner.stateDir, onLine: lineTo('engine') }).catch(() => {});
      ver = await engineVersion();
      progress.result.engine = ver;
      end(
        'engine',
        eng.already ? ENGINE.name + ' ' + ver + ' was already installed' : ENGINE.name + ' ' + ver + ' installed',
      );

      const size = runner.disk.sizes[model.id] || (await sizeOf(model));
      const sizeGb = size ? size.gb : model.estGb;
      step = start('model', model.name + ', ' + (size ? size.gb : 'about ' + model.estGb) + ' GB');
      if (await isCached(model)) end('model', model.name + ' was already on this machine');
      else {
        if (machine.diskFreeGb != null && machine.diskFreeGb < sizeGb * 1.1)
          return fail(
            'model',
            'Not enough disk: the model needs ' + sizeGb + ' GB and ' + machine.diskFreeGb + ' GB is free.',
          );
        const got = await pullModel(model, {
          onLine: lineTo('model'),
          totalBytes: size ? size.bytes : 0,
          onProgress: (pct, have) => {
            step.pct = pct;
            step.detail = model.name + ', ' + Math.round((have / 2 ** 30) * 10) / 10 + ' of ' + sizeGb + ' GB';
            runner.push();
          },
        });
        if (!got.ok) return fail('model', got.why);
        end('model', model.name + ', ' + sizeGb + ' GB, checked against Hugging Face by the engine');
      }

      step = start('server', 'Loading ' + model.name + ' into memory');
      srv = await serveModel(model, { onLine: lineTo('server'), flags: runner.tune.serve(model.id) });
      if (!srv.ok) return fail('server', srv.why);
      const plainly = runner.tune.serve(model.id).length > 0 && srv.args.includes(runner.tune.serve(model.id)[0]);
      if (runner.tune.serve(model.id).length && !plainly) await runner.tune.unserve(model.id);
      runner.disk.engine = { kind: 'local', port: srv.port, pid: srv.pid, model: model.id };
      progress.result.loadSeconds = Math.round(srv.loadMs / 100) / 10;
      end(
        'server',
        'Serving on 127.0.0.1:' +
          srv.port +
          ' as ' +
          SERVED_NAME +
          ', loaded in ' +
          progress.result.loadSeconds +
          ' s' +
          (plainly ? ". Served without the engine's drafts: with them its replies broke down on this machine" : ''),
      );

      step = start('speed');
      try {
        progress.result.speed = await measureSpeed(srv.port, { onTick: (t) => lineTo('speed')(speedLine(t)) });
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
    // LEARNED IN THE MIDDLE OF THE CHECK (tune.mjs). A model whose replies keep breaking down into one repeated piece is not being
    // checked: its engine is. So the check stops as soon as that has happened three times, the model is served again without the
    // engine's drafts, timed again, and the check starts over. What it did the first way is kept on its record.
    const relearn = () => runner.tune.wants(model.id);
    const check = (halt) =>
      agentCheck({
        jobs: runner.checkJobs(),
        learn: true,
        stateDir: runner.stateDir,
        nodeBin: agent.node || (machine.tools.node && machine.tools.node.path),
        cli: agent.cli,
        port: runner.serve(srv.port, model.id),
        via: runner.proxy,
        before: runner.disk.fit[model.id],
        halt,
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
    try {
      progress.jobs = await check(() => runner.cancelled || relearn());
    } catch (e) {
      if (runner.cancelled || !relearn()) throw e;
    }
    if (!runner.cancelled && relearn()) {
      const was = runner.tune.says(model.id);
      await runner.tune.learnServe(model.id);
      progress.jobs = [];
      step.pct = 0;
      step.detail =
        'Its replies kept breaking down into one piece repeated without end (' +
        (was.broke + was.ended) +
        ' of ' +
        was.asked +
        " so far). Serving it again without the engine's drafts, then starting the check over";
      runner.push();
      stopEngine();
      const again = await serveModel(model, { onLine: lineTo('check'), flags: runner.tune.serve(model.id) });
      if (!again.ok) return fail('check', 'The model server did not come back up: ' + again.why);
      const took = again.args.includes(runner.tune.serve(model.id)[0]);
      if (!took) await runner.tune.unserve(model.id);
      srv = again;
      runner.disk.engine = { kind: 'local', port: srv.port, pid: srv.pid, model: model.id };
      if (took)
        stepOf('server').detail =
          'Serving on 127.0.0.1:' +
          srv.port +
          ' as ' +
          SERVED_NAME +
          ", without the engine's drafts: with them its replies broke down on this machine";
      try {
        progress.result.speed = await measureSpeed(srv.port, { onTick: (t) => lineTo('speed')(speedLine(t)) });
        stepOf('speed').detail =
          progress.result.speed.tokPerSec +
          ' tokens a second, first token in ' +
          progress.result.speed.firstTokenMs +
          ' ms' +
          (took ? ', measured again without drafts' : '');
      } catch {
        /* the first measure stands */
      }
      step.line = '';
      step.detail = took
        ? "Three small jobs that need tools, from the start: it is now served without the engine's drafts"
        : 'Three small jobs that need tools, from the start. This engine cannot be served without drafts, so each reply that breaks down is cut and asked again';
      runner.push();
      progress.jobs = await check(() => runner.cancelled);
    }
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
      host: machine.chip + ', ' + machine.memoryGb + ' GB',
      engine: ver,
      agent: agent.version,
      tokPerSec: progress.result.speed.tokPerSec,
      firstTokenMs: progress.result.speed.firstTokenMs,
      loadSeconds: progress.result.loadSeconds,
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
      engine: ENGINE.name + ' ' + ver,
      agent: AGENT.name + ' ' + agent.version,
      host: measured.host,
      port: srv.port,
      measured,
    };
    await runner.save();
    runner.push();
    // THE HELPERS TICKED FOR THIS TEAM are the ones it uses: one that is downloaded but was not ticked is left on disk and left alone.
    // Each ticked one is installed if it is not here, then started and checked, as the last steps of this setup.
    await runner.eyes.use(addons.map((a) => a.id));
    progress.addons = [];
    for (const addon of addons) {
      runner.seeCtl = new AbortController();
      const sid = (id) => pre(addon) + id;
      const lost = (why, fix) => {
        progress.addons.push({ id: addon.id, name: addon.name, kind: addon.kind, ok: false, why, fix: fix || null });
      };
      const io = {
        signal: runner.seeCtl.signal,
        start: (id) => start(sid(id)),
        end: (id, detail) => end(sid(id), detail),
        line: (id, t) => lineTo(sid(id))(t),
        progress: (id, pct, detail) => {
          const x = stepOf(sid(id));
          x.pct = pct;
          if (detail) x.detail = detail;
          runner.push();
        },
        fail: (id, why, fix) => {
          if (runner.cancelled) throw new Error('cancelled');
          const x = stepOf(sid(id));
          x.state = 'fail';
          x.line = '';
          lost(why, fix);
          runner.push();
          return false;
        },
      };
      let ok = false;
      try {
        ok = await runner.eyes.install(addon, io);
      } catch (e) {
        if (runner.cancelled) throw e;
        const x = progress.steps.find((y) => y.state === 'run');
        if (x) x.state = 'fail';
        lost(String((e && e.message) || e).slice(0, 200));
      }
      if (ok) progress.addons.push({ id: addon.id, name: addon.name, kind: addon.kind, ok: true });
      runner.seeCtl = null;
    }
    progress.addon = progress.addons.find((x) => x.kind === 'see') || null; // the reader, as an older page reads it
    progress.done = true;
    await runner.save();
    runner.push();
    return true;
  }

  Object.assign(runner, { runSetup });
}
