// runner/index.mjs - the local runner behind Start. server.mjs hands it every /api/ request.
//   GET  /api/host      measure this machine NOW (the Start press)
//   GET  /api/models    the model options for it: real download sizes, what fits, what was measured here before, and what setup would install
//   POST /api/setup     { model }  install the engine, fetch the model, serve it, measure it, install Pi, run the agent check
//   GET  /api/setup     where that stands;  GET /api/events  the same, pushed on every change
//   POST /api/chat      { text }   one streamed reply from the local model
//   POST /api/stop      stop the model server and end the session
//   GET  /api/addons    the add-on models (one that reads pictures), with what adding each would do;  POST /api/addon { id, action }
// Loopback only, and a browser page on another site cannot drive it: the Host must be this server and a POST must come from this origin.
// State (sizes, measurements, Pi, the agent's work folders) lives in .runner/ beside this file's folder (or where FO_STATE_DIR says), which is never served and never committed.
import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import {
  MODELS,
  STRATA,
  STRATA_MODELS,
  LLAMA,
  LLAMA_MODELS,
  MAC_ORDER,
  optionsFor,
  fitOf,
  strataFit,
  strataOptions,
  llamaFit,
  llamaOptions,
} from '../js/catalog.js';
import { haveLlamaModel } from './llama.mjs';
import { stopStrata, strataVersion as strataThere } from './strata.mjs';
import { createEyes } from './eyes.mjs';
import { measureHost, setBrewHome, sh } from './host.mjs';
import { createLicense, machineId, messageFor } from './license.mjs';
import { createGithub } from './github.mjs';
import { BILLING, tierWith } from '../js/billing.js';
import { PRODUCT } from '../js/product.js';
import { detectAnywhere, detectAt, detectHere, detectOverSsh, detectRemembered, hints, sshDest } from './detect.mjs';
import { alive, cachedBytes, downloadsBytes, dropDownloads, killAll, sizeOf, stopEngine, where } from './engine.mjs';
import { ensureAgent, jobsFor, runAgent } from './agent.mjs';
import {
  changeOf,
  cloneFolder,
  cloneNameOf,
  cloneRepo,
  cloneUrl,
  discard,
  land,
  landFolder,
  startFolder,
  statusOf,
  validBranch,
  validCloneUrl,
} from './repo.mjs';
import { createSites } from './sites.mjs';
import { phones as adbPhones, install as adbInstall, builtApp } from './adb.mjs';
import { pickFolder } from './pick.mjs';
import {
  addKotlinImports,
  importsBelowPackage,
  mendKotlin,
  mendNames,
  ownTests,
  proveChange,
  restoreImports,
} from './prove.mjs';
import { askRoom, backTo, roomLines, snapOf, tryIdeas } from './swarm.mjs';
import { fetchMedia, kindOf, mediaNote, safeName } from './media.mjs';
import { connectState, connectTo, connectorList } from './connectors.mjs';
import {
  jiraAttach,
  jiraBoardConf,
  jiraBoards,
  jiraComment,
  jiraFaces,
  jiraIssue,
  jiraLogout,
  jiraMediaLinks,
  jiraMove,
  jiraProjects,
  jiraQuick,
  jiraTake,
  searchJira,
} from './jira.mjs';
import { createLink } from './link.mjs';
import { randomBytes } from 'node:crypto';
import { createTune } from './tune.mjs';
import { ROUTE_ASK, guessRoute, parseRoute, seatFor } from './talk.mjs';
import { spawn as runSpawn } from 'node:child_process';
import { runRefusal } from './run-here.mjs';
import { allowed, picture, read as readPage, search } from './web.mjs';
import { shotApp, shotPage } from './shot.mjs';
import { langsOf, skillFor, seatSkills } from './skills.mjs';
import { TEMPER } from '../js/team-soul.js';
import {
  claudeLogin,
  claudeSignOut,
  claudeSignedIn,
  claudeSubmitCode,
  signInState,
  claudeRun,
  findClaude,
} from './claude.mjs';
import { installTensorfoldSetup } from './setup/tensorfold.mjs';
import { installExistingSetup } from './setup/existing-server.mjs';
import { installStrataSetup } from './setup/strata.mjs';
import { installLlamaSetup } from './setup/llama.mjs';
import { installClaudeSetup } from './setup/claude.mjs';
import { SEAT_IDS, installSeatReplies } from './seat-replies.mjs';
import { llamaPlan, planFor, strataPlan } from './setup/plans.mjs';
import { ENGINE_NAMES, tgt } from './setup/steps.mjs';

export function createRunner({ root, port }) {
  // what the parts of this module share: each part (see runner/) reads what it needs from here and puts here what the others use of it
  const runner = {};
  const stateDir = process.env.FO_STATE_DIR || path.join(root, '.runner');
  setBrewHome(path.join(stateDir, 'homebrew'));
  const file = path.join(stateDir, 'state.json');
  runner.disk = { sizes: {}, measured: {}, fit: {}, jira: {}, work: {}, session: null, engine: null, connectors: [] };
  runner.host = null;
  runner.setup = null;
  let busy = false;
  runner.cancelled = false;
  const subs = new Set();
  let pushT = null;
  const ready = (async () => {
    await mkdir(stateDir, { recursive: true });
    try {
      runner.disk = { ...runner.disk, ...JSON.parse(await readFile(file, 'utf8')) };
    } catch {
      /* first run */
    }
    if (runner.disk.engine && runner.disk.engine.kind !== 'claude' && !(await alive(tgt(runner.disk.engine)))) {
      runner.disk.engine = null;
      runner.disk.session = null;
      await save();
    } else if (runner.disk.engine && runner.disk.engine.kind === 'strata') runner.ownStrata = true; // the server died with the last runner
  })();
  async function save() {
    await writeFile(file, JSON.stringify(runner.disk, null, 2)).catch(() => {});
  }
  // HOW EACH LOCAL MODEL HAS TO BE ASKED (tune.mjs), learned here and kept with the state. Every reply from a local model, to a seat
  // or to the agent, is asked through it. 'serving' is the model server the agent's requests go to while a setup is still checking it.
  const tune = createTune({ load: () => runner.disk.tune || (runner.disk.tune = {}), save });
  const proxy = 'http://127.0.0.1:' + port + '/api/model';
  const shotDir = path.join(stateDir, 'shots');
  const CHAT = '/v1/chat/completions';
  let serving = null;
  let brokeRun = 0;
  const serve = (target, key) => {
    serving = { target, key };
    brokeRun = 0;
    return target;
  }; // brokeRun: replies in a row that broke down however they were asked
  const engineKey = () =>
    runner.disk.engine && runner.disk.engine.kind === 'existing'
      ? 'existing:' + runner.disk.engine.model
      : (runner.disk.session && runner.disk.session.modelId) || (serving && serving.key) || 'local';
  // what was learned about how this model has to be asked goes on its record, in plain words, beside what its check showed
  const tuned = (key, fit) => {
    const tuning = tune.says(key);
    const times = (n) => n + (n === 1 ? ' time' : ' times');
    const sv = tuning.serve && !tuning.serve.refused ? tuning.serve : null;
    if (!tuning.broke && !tuning.ended && !sv) return fit;
    fit.tune = {
      name: tuning.name,
      broke: tuning.broke,
      ended: tuning.ended,
      asked: tuning.asked,
      stops: tuning.stops,
      serve: sv ? { flags: sv.flags, before: sv.before } : null,
    };
    if (sv)
      fit.says +=
        ' Served the usual way, its replies kept breaking down into one piece repeated without end' +
        (sv.before.piece ? ' ("' + sv.before.piece + '")' : '') +
        ': ' +
        (sv.before.broke + sv.before.ended) +
        ' of the first ' +
        sv.before.asked +
        " requests. It is now served without the engine's drafts, and everything here was measured that way.";
    if (tuning.ended)
      fit.says +=
        ' It does not always stop when it has finished: ' +
        times(tuning.ended) +
        ' a finished reply ran on into one piece repeated without end, and was ended for it where it was whole.';
    if (tuning.broke)
      fit.says +=
        ' ' +
        times(tuning.broke) +
        ' in ' +
        tuning.asked +
        ' requests a reply broke down part-way; each was cut and asked again another way. It is now asked ' +
        tuning.name +
        ', the way that has broken down least on this machine.';
    if (tuning.stops.length)
      fit.says +=
        ' The piece it repeats (' +
        tuning.stops.map((s) => '"' + s + '"').join(', ') +
        ') is now given to the model server as a place to stop, so a reply that goes wrong ends at once instead of running to its limit.';
    return fit;
  };
  // the phone link (link.mjs): off until the customer switches it on in the Remote tab; if it was on, it comes back on with the runner
  // WHAT THIS VERSION SHOWS (js/product.js). With Remote switched off there, the phone link is never started and its routes say so.
  let product = PRODUCT;
  const remoteOn = () => !product || product.remote !== false;
  const sites = createSites(); // the workspace's website, served on this computer while the team is running
  const link = createLink({ root, stateDir, port, disk: () => runner.disk, save });
  ready.then(() => {
    if (remoteOn()) link.boot();
  });
  // AN ADD-ON MODEL THAT READS PICTURES (eyes.mjs), beside whatever the team thinks with: added from the Start page, used by the seats' tools
  const eyes = createEyes({ stateDir, disk: () => runner.disk, save, push: () => push() });
  // WHAT A TICKET'S PICTURES AND VIDEO SHOW (media.mjs). On Claude Code the customer's own Claude looks, allowed to read files and nothing
  // else; beside a local model the picture-reading helper looks, and the team's model puts a recording's frames into one account.
  const mediaDir = path.join(stateDir, 'media');
  const view = () => ({
    product: { remote: remoteOn() },
    signin: signInState(),
    connect: connectState(),
    addon: eyes.view(),
    helpers: eyes.has(),
    setup: runner.setup,
    session: runner.disk.session,
    engine: runner.disk.engine
      ? {
          kind: runner.disk.engine.kind || 'local',
          port: runner.disk.engine.port || null,
          model: runner.disk.engine.model || null,
        }
      : null,
    busy,
  });
  function push() {
    if (pushT) return;
    pushT = setTimeout(() => {
      pushT = null;
      const data = 'data: ' + JSON.stringify(view()) + '\n\n';
      for (const res of subs) res.write(data);
    }, 120);
  }

  async function sizes() {
    // read once a day, and whenever a size is still unknown
    // THE PAGE IS NEVER KEPT WAITING ON HUGGING FACE: what has answered within eight seconds is used and the rest is shown as an
    // estimate. A size that arrives later is kept for the next look.
    const asked = Promise.all(
      MODELS.map(async (m) => {
        const have = runner.disk.sizes[m.id];
        if (have && Date.now() - have.at < 86400000) return;
        const s = await sizeOf(m);
        if (s) runner.disk.sizes[m.id] = { ...s, at: Date.now() };
      }),
    ).catch(() => {});
    let t;
    await Promise.race([
      asked,
      new Promise((r) => {
        t = setTimeout(r, Number(process.env.FO_SIZES_WAIT_MS) || 8000);
      }),
    ]);
    clearTimeout(t);
    const out = {};
    for (const m of MODELS) {
      const s = runner.disk.sizes[m.id];
      if (s) out[m.id] = { ...s, cached: (await cachedBytes(m)) >= s.bytes * 0.97 };
    }
    await save();
    return out;
  }
  // the one recommended on a machine that can run both kinds: the first in MAC_ORDER that its memory can hold
  const bestFirst = (all) => {
    const pick = MAC_ORDER.map((id) => all.find((m) => m.id === id)).find((m) => m && m.fits);
    return all.map((m) => ({ ...m, recommended: !!pick && m.id === pick.id }));
  };
  async function models() {
    if (!runner.host) runner.host = await measureHost(stateDir);
    // THE WATERFALL, AS THE PAGE SEES IT. Strata's models are offered where Strata is the engine. llama.cpp's small ones are offered
    // where it is the only engine, and below Strata's once Strata has said here that it cannot be installed or cannot run a model.
    const engs = runner.host.engines || [runner.host.engine];
    if (engs.includes('strata') || engs.includes('llama')) {
      const out = engs.includes('strata')
        ? strataOptions(runner.host, runner.disk.measured).map((m) => ({
            ...m,
            plan: strataPlan(m, runner.host),
            running: !!(runner.disk.engine && runner.disk.engine.id === m.id),
          }))
        : [];
      if (engs.includes('llama') && (!engs.includes('strata') || runner.disk.strataFailed)) {
        const have = {};
        for (const m of LLAMA_MODELS) have[m.id] = await haveLlamaModel(stateDir, m);
        out.push(
          ...llamaOptions(runner.host, runner.disk.measured, have).map((m) => ({
            ...m,
            recommended: m.recommended && !out.length,
            plan: llamaPlan(m, runner.host),
            running: !!(runner.disk.engine && runner.disk.engine.id === m.id),
          })),
        );
      }
      return {
        host: runner.host,
        models: out,
        fellBack:
          engs.includes('strata') && runner.disk.strataFailed
            ? { from: STRATA.name, to: LLAMA.name, why: runner.disk.strataFailed.why }
            : null,
      };
    }
    const sz = await sizes();
    // BONSAI 2 ON AN APPLE SILICON MAC: listed after TensorFold's own models. llama.cpp runs it (its Mac build uses the Mac's own
    // graphics), so choosing it chooses that engine with it. Which one is recommended is settled over both kinds together (MAC_ORDER).
    const have = {};
    for (const m of LLAMA_MODELS) if (m.family === 'Bonsai') have[m.id] = await haveLlamaModel(stateDir, m);
    const bonsai = llamaOptions(runner.host, runner.disk.measured, have)
      .filter((m) => m.family === 'Bonsai')
      .map((m) => ({
        ...m,
        badge: m.params >= 27 ? 'Large, in little memory' : m.params >= 9 ? 'Small and light' : m.badge,
        runs: "Run by llama.cpp on this Mac's own graphics. It is a large model packed small, so it leaves most of the Mac's memory free. It does not read pictures in this setup.",
        plain:
          'A ' +
          m.params +
          'B model in a ' +
          m.sizeGb +
          ' GB file: far less memory than a model its size usually takes. We have not run it ourselves yet, so nothing here says how well it works.',
        plan: llamaPlan(m, runner.host),
        running: !!(runner.disk.engine && runner.disk.engine.id === m.id),
      }));
    return {
      host: runner.host,
      all: process.env.FO_ALL_MODELS === '1',
      models: bestFirst([
        ...optionsFor(runner.host, sz, runner.disk.measured).map((m) => ({
          ...m,
          plan: planFor(m, runner.host, sz[m.id]),
          running: !!(runner.disk.engine && runner.disk.engine.model === m.id),
          proofs: (runner.disk.proofs || {})[m.id] || null,
        })),
        ...bonsai,
      ]),
    }; // proofs: { runs, proven, rounds } on this machine, counted as the team works
  }

  // CONTINUITY. When a setup stops at a late step (installing the agent, the agent check), what it had already done is KEPT: the model
  // server stays up, a tunnel stays open, the measured speed stays measured. "Continue" (POST /api/setup { resume: true }) runs the same
  // job again and skips every step whose result still holds, so it picks up at the step that failed. Everything is let go when the
  // customer cancels, chooses something else, stops the team, or the runner exits.
  // TIERS BY REACH (js/billing.js). Free: your own Claude Code, or a model already running on this machine. Pro: a local model set up
  // and kept for you, and other machines. A plan is a key the customer's wallet holds on a lock on Base (license.mjs). A feature the plan does not cover answers 402 with which tier has it; with billing not
  // switched on, everything is open.
  const lic = createLicense(stateDir);
  const github = createGithub(stateDir); // the customer's own GitHub sign-in, for the Workspace
  // THE OWNER'S PANEL (owner.mjs): only when the app is run from its source folder. A copy the launcher started never loads it, and the
  // bundle does not carry it.
  let owner = null;
  const ownerReady =
    process.env.FO_LAUNCHED === '1'
      ? null
      : import('./owner.mjs').then(
          (m) => {
            owner = m.createOwner({
              root,
              github,
              stateDir,
              onProduct: async (now) => {
                product = now || product;
                if (!remoteOn() && link.on()) await Promise.resolve(link.turn(false)).catch(() => {});
                push();
              },
            });
          },
          () => {
            /* not in this copy */
          },
        );
  const needs = async (res, feature, what) => {
    if (await lic.allows(feature)) return false;
    const tier = tierWith(feature);
    json(res, 402, { error: what + ' is part of ' + BILLING.tiers[tier].name + '.', upgrade: tier, feature });
    return true;
  };
  const HERE = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i;
  let checkMode = ''; // 'simple' or 'developer', as the Start page says when a setup is asked for: which jobs the agent check runs
  const checkJobs = () => jobsFor({ mode: checkMode, helpers: eyes.has() });
  let lastJob = null;
  runner.carry = null;
  runner.seeCtl = null;
  runner.ownStrata = false; // ownStrata: a model this app started on Strata, which runs on in the background until this app stops it
  const dropStrata = async () => {
    if (!runner.ownStrata) return;
    runner.ownStrata = false;
    await stopStrata().catch(() => {});
  }; // only ever the launch named for this app   // seeCtl: stops the add-on's download when a setup that includes it is cancelled
  const LATE = ['agent', 'check'];
  const failed = (e) => {
    if (runner.setup && !runner.setup.error)
      runner.setup.error = {
        step: (runner.setup.steps.find((y) => y.state === 'run') || {}).id || 'tools',
        why: String((e && e.message) || e).slice(0, 200),
        fix: null,
      };
  };
  const settle = async () => {
    busy = false;
    if (runner.cancelled) {
      runner.cancelled = false;
      runner.setup = null;
      runner.carry = null;
      stopEngine();
      closeTunnel();
      await dropStrata();
      runner.disk.engine = null;
      runner.disk.session = null;
    } else if (runner.setup && runner.setup.error) {
      runner.setup.steps.forEach((y) => {
        if (y.state === 'run') y.state = 'fail';
      });
      runner.disk.session = null;
      if (LATE.includes(runner.setup.error.step) && runner.disk.engine) {
        runner.carry = {
          result: { ...runner.setup.result },
          details: Object.fromEntries(
            runner.setup.steps.filter((y) => y.state === 'done').map((y) => [y.id, y.detail]),
          ),
        };
        runner.setup.error.resumable = true;
      } else {
        runner.carry = null;
        stopEngine();
        closeTunnel();
        await dropStrata();
        runner.disk.engine = null;
      }
    } else runner.carry = null;
    await save();
    push();
  };

  // A team on a model server that was ALREADY running (here or on another machine). Nothing is installed on that server and it is
  // never stopped: it is asked whether it still lists the model, timed once, and put through the same three judged agent jobs.
  // When that server is on another machine and listens only to itself, it is reached through a private SSH tunnel this runner opens
  // and owns: closed when the team stops, when another engine is chosen, and when the runner exits.
  let workBusy = false; // one thing at a time in the clone: a clone, a change, a landing
  runner.tunnel = null;
  let jiraBusy = 0;
  let jiraTurn = Promise.resolve();
  let jiraSeen = null; // one read of Jira at a time; whether it is signed in is asked of Claude Code at most every 15 seconds
  function closeTunnel() {
    if (runner.tunnel) {
      try {
        runner.tunnel.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      runner.tunnel = null;
    }
  }

  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const bodyOf = (req) =>
    new Promise((ok, no) => {
      let n = 0;
      const parts = [];
      req.on('data', (c) => {
        n += c.length;
        if (n > 65536) {
          no(new Error('body too large'));
          req.destroy();
        } else parts.push(c);
      });
      req.on('end', () => {
        try {
          ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'));
        } catch {
          no(new Error('body is not JSON'));
        }
      });
      req.on('error', no);
    });
  const mine = new Set(['127.0.0.1:' + port, 'localhost:' + port]);

  // ---------- the runner lives only while the app is open ----------
  // The app holds a connection to /api/events while it is open: one for all the tabs of a browser (js/stream.js). /api/presence is the
  // same thing without the state, kept for a page from an older copy of the site.
  // Every page of the app holds one connection to /api/presence (js/alive.js). When the last one closes and none comes back within the
  // grace period (a reload, or a move between pages, takes far less), the runner stops what it started - the model server, a download,
  // a run - and exits. A runner nobody ever opened exits too. FO_KEEP=1 turns this off (development, the self-test).
  const keep = process.env.FO_KEEP === '1';
  const grace = Number(process.env.FO_GRACE_MS) || 45000;
  const bootGrace = Number(process.env.FO_BOOT_GRACE_MS) || 300000;
  const pages = new Set();
  let leave = null;
  const shutdown = (why) => {
    console.log('Family Office: ' + why + ', so the runner is stopping. Nothing is left running.');
    try {
      killAll();
      stopEngine();
    } catch {
      /* already gone */
    }
    Promise.race([
      Promise.all([link.release(), dropStrata()]),
      new Promise((r) => setTimeout(r, runner.ownStrata ? 8000 : 1500)),
    ]).finally(() => process.exit(0));
  }; // a model this app started on Strata is stopped too: it would otherwise run on in the background   // the port asked of the router is given back first, if it answers in time
  const arm = (ms, why) => {
    clearTimeout(leave);
    leave = null;
    if (keep || pages.size || link.on()) return;
    leave = setTimeout(() => {
      if (!pages.size && !link.on()) shutdown(why);
    }, ms);
  }; // with the phone link on, the runner stays up for a phone that may come later
  arm(bootGrace, 'nobody opened the app');
  const startCmd = (
    process.env.FO_LAUNCHED === '1'
      ? process.platform === 'win32'
        ? 'powershell -ExecutionPolicy Bypass -File "' + path.join(root, 'myfamilyoffice.ps1') + '"'
        : 'sh ' + path.join(root, 'myfamilyoffice.sh')
      : 'node ' + path.join(root, 'server.mjs')
  ).replace(process.platform === 'win32' ? '\0' : process.env.HOME || '\0', '~');

  // THE SITE THIS APP CAME FROM may reach it across origins, so the page the command was copied from carries on as the app instead of
  // a second page opening. Only that site (the launcher records it): the customer already ran that site's script on this machine, so it
  // is trusted that far and no further. Any other site is refused, as before.
  // One condition: the site must have an address of its own (it sits at the root, like name.eth.limo). On a shared gateway address
  // (gateway.example/ipfs/<id>/) every other page on that gateway has the same origin, so there the site may only ask whether the
  // runner is up and shut it down, and the app opens from the runner itself.
  const site = new Set();
  try {
    const u = new URL(process.env.FO_SOURCE || '');
    site.add(u.origin);
    if (u.hostname === '127.0.0.1') site.add(u.protocol + '//localhost' + (u.port ? ':' + u.port : ''));
  } catch {
    /* not launched from a site */
  }
  let drive = false;
  try {
    drive = new URL(process.env.FO_SOURCE || '').pathname === '/';
  } catch {
    /* no site */
  }
  const cors = (req) => {
    const o = req.headers.origin;
    return o && site.has(o)
      ? { 'access-control-allow-origin': o, vary: 'Origin', 'access-control-allow-private-network': 'true' }
      : null;
  };
  let version = 'dev';
  import('node:fs').then((f) => {
    try {
      version = JSON.parse(f.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version || version;
    } catch {
      /* run from the source folder */
    }
  });
  Object.assign(runner, {
    eyes,
    push,
    stateDir,
    closeTunnel,
    tune,
    checkJobs,
    serve,
    proxy,
    tuned,
    save,
    dropStrata,
    shotDir,
    engineKey,
    CHAT,
  });
  installTensorfoldSetup(runner);
  installExistingSetup(runner);
  installStrataSetup(runner);
  installLlamaSetup(runner);
  installClaudeSetup(runner);
  installSeatReplies(runner);

  return async function handle(req, res, url) {
    await ready;
    const fromSite = cors(req);
    const open = url.pathname === '/api/hello' || url.pathname === '/api/shutdown';
    const may = !!fromSite && (open || drive);
    if (may) for (const [k, v] of Object.entries(fromSite)) res.setHeader(k, v); // every answer to that site carries its permission
    if (req.method === 'OPTIONS') {
      if (!may) {
        res.writeHead(403);
        return res.end();
      }
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
      });
      return res.end();
    }
    if (!mine.has(String(req.headers.host || '')))
      return json(res, 403, { error: 'this runner answers only as 127.0.0.1 or localhost' });
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && !mine.has(origin.replace(/^https?:\/\//, '')) && !may)
        return json(res, 403, { error: 'another site cannot drive this runner' });
      if (
        !/^application\/json/.test(String(req.headers['content-type'] || '')) &&
        !(url.pathname === '/api/media' && /^(image|video)\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')))
      )
        return json(res, 415, { error: 'send JSON' });
    }
    try {
      const route = url.pathname;
      if (req.method === 'GET' && route === '/api/hello') {
        // who is on this port, in what state, and how to start it again
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(fromSite || {}) });
        return res.end(
          JSON.stringify({
            app: 'familyoffice',
            ok: true,
            state: 'active',
            version,
            port,
            drive,
            owner: !!owner,
            pages: pages.size,
            busy: !!busy,
            team: !!runner.disk.session,
            start: startCmd,
          }),
        );
      }
      if (req.method === 'POST' && route === '/api/shutdown') {
        // the customer pressed Shut down, in the app or on the site it came from
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(fromSite || {}) });
        res.end('{"ok":true}');
        setTimeout(() => shutdown('you shut it down'), 150);
        return;
      }
      if (req.method === 'GET' && route === '/api/presence') {
        // one open page of the app
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write('data: {"here":true}\n\n');
        pages.add(res);
        clearTimeout(leave);
        leave = null;
        const beat = setInterval(() => res.write(': here\n\n'), 20000);
        req.on('close', () => {
          clearInterval(beat);
          pages.delete(res);
          arm(grace, 'the app was closed');
        });
        return;
      }
      if (req.method === 'GET' && route === '/api/host') {
        runner.host = await measureHost(stateDir);
        return json(res, 200, runner.host);
      }
      if (req.method === 'GET' && route === '/api/models') return json(res, 200, await models());
      if (req.method === 'GET' && route === '/api/minds') return json(res, 200, await runner.mindsView());
      if (req.method === 'GET' && route === '/api/setup') return json(res, 200, view());
      if (req.method === 'GET' && route === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write('data: ' + JSON.stringify(view()) + '\n\n');
        subs.add(res);
        pages.add(res);
        clearTimeout(leave);
        leave = null; // holding this is also what says the app is open
        const beat = setInterval(() => res.write(': here\n\n'), 20000);
        req.on('close', () => {
          clearInterval(beat);
          subs.delete(res);
          pages.delete(res);
          arm(grace, 'the app was closed');
        });
        return;
      }
      if (route.startsWith('/api/github')) {
        // sign in to GitHub and choose a repository. The token never leaves this machine and is never sent to the page.
        try {
          if (req.method === 'GET' && route === '/api/github') return json(res, 200, await github.status());
          if (req.method === 'GET' && route === '/api/github/repos')
            return json(res, 200, { repos: await github.repos(url.searchParams.get('q') || '') });
          if (req.method === 'POST' && route === '/api/github/login') return json(res, 200, await github.start());
          if (req.method === 'POST' && route === '/api/github/gh') return json(res, 200, await github.useGh());
          if (req.method === 'POST' && route === '/api/github/gh/install')
            return json(res, 200, await github.ghInstall());
          if (req.method === 'POST' && route === '/api/github/gh/login') return json(res, 200, await github.ghLogin());
          if (req.method === 'POST' && route === '/api/github/logout') return json(res, 200, await github.signOut());
          if (req.method === 'POST' && route === '/api/github/create') {
            const b = await bodyOf(req);
            return json(
              res,
              200,
              await github.create({
                name: String(b.name || '').trim(),
                private: b.private !== false,
                description: b.description,
              }),
            );
          } // a new repository, private unless public is asked for
        } catch (e) {
          return json(res, 400, { error: String(e.message || e).slice(0, 240) });
        }
        return json(res, 404, { error: 'not found' });
      }
      if (route.startsWith('/api/owner/')) {
        await ownerReady;
        if (!owner || fromSite) return json(res, 404, { error: 'not found' });
        return owner(req, res, url, { json, bodyOf });
      }
      if (req.method === 'GET' && route === '/api/license') {
        const machine = await machineId();
        return json(res, 200, {
          ...(await lic.state()),
          machine,
          message: messageFor(machine),
          offers: await lic.offers(),
        });
      }
      if (req.method === 'POST' && route.startsWith('/api/license')) {
        const b = await bodyOf(req);
        try {
          if (route === '/api/license/wallet')
            return json(res, 200, await lic.bind({ message: b.message, signature: b.signature })); // the customer's wallet signed for this machine
          if (route === '/api/license/recheck') return json(res, 200, await lic.recheck()); // after buying: read the chain now
          if (route === '/api/license/code') return json(res, 200, await lic.redeem(String(b.code || '').slice(0, 80))); // an access code typed in (empty removes it)
          if (route === '/api/license/buy')
            return json(res, 200, await lic.quote(String(b.wallet || ''), String(b.referrer || ''))); // what the wallet would be asked to send: built here, sent by the wallet, never by this app
          if (route === '/api/license/release') return json(res, 200, await lic.release()); // forget the wallet here
        } catch (e) {
          return json(res, e.status || 400, { error: String(e.message || e).slice(0, 240) });
        }
        return json(res, 404, { error: 'not found' });
      }
      if (req.method === 'GET' && route === '/api/detect') {
        // model servers already running: this machine's usual ports, and the other machines the customer has named before
        if (url.searchParams.get('hints') === '1')
          return json(res, 200, {
            hints: await hints({ sshHosts: runner.disk.sshHosts || [], servers: runner.disk.servers || [] }),
          }); // machines worth looking on: read from this machine's own records, nothing contacted
        if (url.searchParams.get('far') === 'ssh') {
          // the machines reached over SSH before: asked again, apart from the rest because it takes longer
          if (!(await lic.allows('remote'))) return json(res, 200, { servers: [] });
          const found = await Promise.all((runner.disk.sshHosts || []).map((x) => detectOverSsh(x.dest, x.sshPort)));
          return json(res, 200, { servers: found.filter((x) => x.ok).flatMap((x) => x.servers) });
        }
        const here = await detectHere(runner.disk.engine && runner.disk.engine.port ? [runner.disk.engine.port] : []);
        const far = await detectRemembered((runner.disk.servers || []).filter((x) => !here.some((y) => y.base === x)));
        return json(res, 200, {
          servers: [...here, ...far],
          using:
            runner.disk.engine && runner.disk.engine.kind === 'existing'
              ? { base: runner.disk.engine.base, model: runner.disk.engine.model }
              : null,
        });
      }
      if (req.method === 'POST' && route === '/api/detect') {
        // another machine, by the address the customer gives
        const address = String((await bodyOf(req)).address || '').slice(0, 300);
        if (!HERE.test(address.trim()) && (await needs(res, 'remote', 'Looking for models on another machine'))) return;
        const got = await detectAnywhere(address); // directly, then over SSH
        if (!got.ok) return json(res, 400, { error: got.why });
        if (got.ssh)
          runner.disk.sshHosts = [
            got.ssh,
            ...(runner.disk.sshHosts || []).filter((x) => x.dest !== got.ssh.dest),
          ].slice(0, 6);
        else {
          const far = got.servers.filter((x) => !x.here).map((x) => x.base);
          if (far.length) runner.disk.servers = [...new Set([...far, ...(runner.disk.servers || [])])].slice(0, 8);
        }
        await save();
        return json(res, 200, { servers: got.servers, server: got.servers[0] });
      }
      if (req.method === 'GET' && route === '/api/addons') {
        // what the Start page shows under the models: the add-on, its size and license, and what adding it would run
        if (!runner.host) runner.host = await measureHost(stateDir);
        if (runner.host.engine === 'strata' || runner.host.engine === 'llama')
          return json(res, 200, { list: [], claude: false }); // on Strata the model reads pictures itself, and the helpers' engines are built for a Mac
        const main =
          runner.disk.engine && runner.disk.engine.kind === 'local'
            ? MODELS.find((x) => x.id === runner.disk.engine.model)
            : null;
        const sz = main && runner.disk.sizes[main.id];
        return json(res, 200, {
          list: await eyes.list(runner.host, main ? fitOf(sz ? sz.gb : main.estGb, runner.host.memoryGb).needGb : 0),
          claude: !!(runner.disk.engine && runner.disk.engine.kind === 'claude'),
        });
      }
      if (req.method === 'POST' && route === '/api/addon') {
        const b = await bodyOf(req);
        const id = String(b.id || '');
        const act = String(b.action || '');
        if (act === 'cancel') {
          eyes.cancel();
          return json(res, 200, { ok: true });
        }
        if (act === 'remove') {
          const r = await eyes.remove(id);
          return json(res, r.ok ? 200 : 400, r.ok ? r : { error: r.why });
        }
        if (act !== 'add') return json(res, 400, { error: 'no such action' });
        if (busy) return json(res, 409, { error: 'A setup is running. Add it when that has finished.' });
        if (await needs(res, 'managed_local', 'A model set up and kept for you')) return;
        runner.host = await measureHost(stateDir); // what is on the machine now, so the plan it was shown is the plan that runs
        const r = eyes.add(id);
        return json(res, r.ok ? 202 : 400, r.ok ? r : { error: r.why });
      }
      if (req.method === 'POST' && route === '/api/setup') {
        const body = await bodyOf(req);
        if (body.mode === 'simple' || body.mode === 'developer') {
          checkMode = body.mode;
          runner.disk.mode = body.mode;
        } // which jobs the agent check runs: the ones for what this team is for
        if (eyes.adding())
          return json(res, 409, {
            error: 'An add-on is being installed. Start this when that has finished, or cancel it.',
          });
        if (body.resume === true) {
          // Continue: the same job again, picking up where it stopped
          if (busy) return json(res, 409, { error: 'a setup is already running' });
          if (!lastJob) return json(res, 400, { error: 'there is nothing to continue: start again' });
          if (
            (lastJob.kind === 'local' || lastJob.kind === 'strata' || lastJob.kind === 'llama') &&
            (await needs(res, 'managed_local', 'Setting up a local model for you'))
          )
            return;
          if (lastJob.kind === 'existing' && (await needs(res, 'found_here', 'Using a model you already run'))) return;
          if (
            lastJob.kind === 'existing' &&
            (lastJob.job.ssh || !HERE.test(lastJob.job.base || '')) &&
            (await needs(res, 'remote', 'A model on another machine'))
          )
            return;
          const o = { resume: true, fetchNode: body.fetchNode === true };
          busy = true;
          push();
          (lastJob.kind === 'existing'
            ? runner.runExistingSetup(lastJob.job, o)
            : lastJob.kind === 'claude'
              ? runner.runClaudeSetup()
              : lastJob.kind === 'strata'
                ? runner.runStrataSetup(lastJob.model, o)
                : lastJob.kind === 'llama'
                  ? runner.runLlamaSetup(lastJob.model, o)
                  : runner.runSetup(lastJob.model, { ...o, addons: lastJob.addons || [] })
          )
            .catch(failed)
            .finally(settle);
          return json(res, 202, { ok: true });
        }
        if (body.engine === 'existing') {
          if (busy) return json(res, 409, { error: 'a setup is already running' });
          if (await needs(res, 'found_here', 'Using a model you already run')) return;
          let job;
          if (body.ssh && typeof body.ssh === 'object') {
            // on another machine, through a tunnel: the model list is checked once the tunnel is open
            const d = sshDest(String(body.ssh.dest || ''));
            const rp = Number(body.ssh.port);
            const sp = Number(body.ssh.sshPort) || 0;
            if (!d || !(rp > 0 && rp < 65536) || sp < 0 || sp > 65535)
              return json(res, 400, { error: 'that is not an SSH name and port this can use' });
            if (await needs(res, 'remote', 'A model on another machine')) return;
            job = {
              ssh: { dest: d.dest, sshPort: sp, port: rp },
              model: String(body.model).slice(0, 200),
              name: 'A model server',
              where: d.dest + ', over SSH',
            };
          } else {
            const got = await detectAt(String(body.base || '').slice(0, 300));
            if (!got.ok) return json(res, 400, { error: got.why });
            if (!got.server.models.includes(String(body.model)))
              return json(res, 400, { error: 'that server does not list ' + String(body.model).slice(0, 80) });
            if (!got.server.here && (await needs(res, 'remote', 'A model on another machine'))) return;
            job = { base: got.server.base, model: String(body.model), name: got.server.name, where: got.server.where };
          }
          busy = true;
          push();
          lastJob = { kind: 'existing', job };
          runner
            .runExistingSetup(job)
            .catch((e) => {
              if (runner.setup)
                runner.setup.error = {
                  step: (runner.setup.steps.find((y) => y.state === 'run') || {}).id || 'tools',
                  why: String((e && e.message) || e).slice(0, 200),
                };
            })
            .finally(settle);
          return json(res, 202, { ok: true });
        }
        if (body.engine === 'claude') {
          if (busy) return json(res, 409, { error: 'a setup is already running' });
          busy = true;
          push();
          lastJob = { kind: 'claude' };
          runner
            .runClaudeSetup()
            .catch((e) => {
              if (runner.setup)
                runner.setup.error = {
                  step: (runner.setup.steps.find((y) => y.state === 'run') || {}).id || 'tools',
                  why: String((e && e.message) || e).slice(0, 200),
                };
            })
            .finally(settle);
          return json(res, 202, { ok: true });
        }
        const model =
          MODELS.find((x) => x.id === body.model) ||
          STRATA_MODELS.find((x) => x.id === body.model) ||
          LLAMA_MODELS.find((x) => x.id === body.model);
        const eng = model ? model.engine || 'tensorfold' : '';
        if (!model) return json(res, 400, { error: 'no such model' });
        const addons = [
          ...new Set(
            [...(Array.isArray(body.addons) ? body.addons : []), ...(body.addon ? [body.addon] : [])].map(String),
          ),
        ]
          .slice(0, 8)
          .map((id) => eyes.byId(id));
        if (addons.some((a) => !a)) return json(res, 400, { error: 'no such add-on' }); // the helpers ticked on the model page
        if (await needs(res, 'managed_local', 'Setting up a local model for you')) return;
        if (busy) return json(res, 409, { error: 'a setup is already running' });
        if (!runner.host) runner.host = await measureHost(stateDir);
        // (a Bonsai model on an Apple silicon Mac brings llama.cpp with it: see models())
        const bonsaiOnMac = eng === 'llama' && model.family === 'Bonsai' && runner.host.engine === 'tensorfold';
        if (runner.host.engines && runner.host.engines.length && !runner.host.engines.includes(eng) && !bonsaiOnMac)
          return json(res, 400, {
            error: model.name + ' is run by ' + ENGINE_NAMES[eng] + ', which is not the engine for this machine',
          });
        const sz = runner.disk.sizes[model.id];
        const fit =
          eng === 'strata'
            ? strataFit(model, runner.host)
            : eng === 'llama'
              ? llamaFit(model, runner.host)
              : fitOf(sz ? sz.gb : model.estGb, runner.host.memoryGb);
        if (!fit.fits && body.force !== true)
          return json(res, 400, {
            error:
              model.name + ' needs about ' + fit.needGb + ' GB and this machine can give a model ' + fit.roomGb + ' GB',
          });
        busy = true;
        push();
        lastJob =
          eng === 'strata'
            ? { kind: 'strata', model: model }
            : eng === 'llama'
              ? { kind: 'llama', model: model }
              : { kind: 'local', model: model, addons };
        (eng === 'strata'
          ? runner.runStrataSetup(model)
          : eng === 'llama'
            ? runner.runLlamaSetup(model)
            : runner.runSetup(model, { addons })
        )
          .catch((e) => {
            if (runner.setup)
              runner.setup.error = {
                step: (runner.setup.steps.find((x) => x.state === 'run') || {}).id || 'engine',
                why: String((e && e.message) || e).slice(0, 200),
              };
          })
          .finally(settle);
        return json(res, 202, { ok: true });
      }
      if (req.method === 'POST' && route === '/api/fix') {
        // the two things a fix card may press. Neither needs a password; both only open Apple's own window.
        const b = await bodyOf(req);
        const FIX = {
          'software-update': ['open', ['x-apple.systempreferences:com.apple.Software-Update-Settings.extension']],
          'clt-install': ['xcode-select', ['--install']],
        }[b.action];
        if (b.action === 'claude-login') {
          // Claude Code's own sign-in, started for the customer. It opens Anthropic's page in their browser; the runner never sees what is typed there.
          const cb = await findClaude();
          if (!cb) return json(res, 200, { ok: false, said: 'Claude Code is not installed' });
          const r = claudeLogin(cb, { dry: process.env.FO_NO_NET === '1', onChange: push });
          return json(res, 200, { ok: r.started, said: r.why || r.note || '', url: r.url || null });
        }
        if (b.action === 'claude-logout') {
          // "Use another account": Claude Code is signed out, and the setup that follows starts its sign-in afresh
          if (busy) return json(res, 409, { error: 'a setup is running' });
          const cb = await findClaude();
          if (!cb) return json(res, 200, { ok: false, said: 'Claude Code is not installed' });
          const r = await claudeSignOut(cb);
          return json(res, 200, { ok: r.ok, said: r.why || '' });
        }
        if (b.action === 'wsl-setup') {
          // WSL, set up because the person asked (the model page offers it on a PC with an NVIDIA card). The start script does it, in a
          // window of its own so Windows' request for administrator approval and what follows can be seen. Nothing here is elevated.
          if (process.platform !== 'win32' && process.env.FO_PLATFORM !== 'win32')
            return json(res, 400, { error: 'this is not a Windows machine' });
          const ps1 = path.join(root, 'myfamilyoffice.ps1');
          const args = [
            '-ExecutionPolicy',
            'Bypass',
            '-NoExit',
            '-File',
            ps1,
            '-SetupWsl',
            process.env.FO_SOURCE || '',
          ];
          if (process.env.FO_NO_NET === '1')
            return json(res, 200, { ok: true, dry: true, command: 'powershell ' + args.join(' ') });
          try {
            runSpawn('cmd', ['/c', 'start', '', 'powershell', ...args], { stdio: 'ignore', detached: true }).on(
              'error',
              () => {},
            );
            return json(res, 200, {
              ok: true,
              said: 'A PowerShell window has opened. Windows will ask for approval there.',
            });
          } catch (e) {
            return json(res, 200, { ok: false, said: String((e && e.message) || e).slice(0, 160) });
          }
        }
        if (!FIX) return json(res, 400, { error: 'no such fix' });
        if (process.env.FO_NO_NET === '1') return json(res, 200, { ok: true, dry: true }); // tests never open a window
        const r = await sh(FIX[0], FIX[1]);
        return json(res, 200, { ok: r.ok, said: (r.out || r.err).slice(0, 200) });
      }
      if (req.method === 'POST' && route === '/api/signin') {
        const b = await bodyOf(req);
        return json(res, 200, { ok: claudeSubmitCode(String(b.code || '').slice(0, 400)) });
      } // the code Anthropic's page may show; passed straight to Claude Code, never kept or logged
      // who Claude Code on this machine is signed in as, for the page to say before it is used (its own answer; nothing is kept)
      if (req.method === 'GET' && route === '/api/claude/account') {
        const cb = await findClaude();
        if (!cb) return json(res, 200, { installed: false, signedIn: null, detail: '' });
        const who = await claudeSignedIn(cb);
        return json(res, 200, { installed: true, signedIn: who.signedIn, detail: who.detail });
      }
      if (req.method === 'GET' && route === '/api/connectors')
        return json(res, 200, { list: await connectorList(await findClaude()) });
      if (req.method === 'POST' && route === '/api/connect') {
        // the customer pressed Connect: add it to their Claude Code, start its sign-in, and let the team use it
        const b = await bodyOf(req);
        const r = await connectTo(await findClaude(), String(b.id || ''), { onChange: push });
        if (r.ok && !(runner.disk.connectors || []).includes(b.id)) {
          runner.disk.connectors = [...(runner.disk.connectors || []), b.id];
          await save();
        }
        return json(res, 200, r);
      }
      // THE WORKSPACE ON GITHUB (runner/repo.mjs). A chosen repository is cloned into this app's own folder. The team makes a change
      // there and it WAITS there; it reaches GitHub only when it is landed, and only the way the customer chose: a pull request (the
      // default) or a direct commit to the default branch.
      // THE WEBSITE THE TEAM MADE, served on this computer (sites.mjs): what is running, start the workspace's, stop one. It serves
      // the team's own copy, so a change that still waits for a yes can be looked at before it is landed.
      if (route === '/api/sites' || route.startsWith('/api/sites/')) {
        const W = runner.disk.work || {};
        if (req.method === 'GET' && route === '/api/sites') return json(res, 200, { sites: sites.list() });
        if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
        const b = await bodyOf(req);
        if (route === '/api/sites/start') {
          const got =
            W.repo && W.dir ? await sites.start(W.dir, W.repo) : { ok: false, why: 'No workspace is connected.' };
          return json(res, 200, { ...got, sites: sites.list() });
        }
        if (route === '/api/sites/stop') {
          await sites.stop(String(b.id || '').slice(0, 40), 'you stopped it');
          return json(res, 200, { ok: true, sites: sites.list() });
        }
        return json(res, 404, { error: 'not found' });
      }
      // THE PHONE PLUGGED INTO THIS COMPUTER (adb.mjs), for an app the team built: is Android's adb here, which phones it sees and
      // whether each has accepted this computer, and whether the workspace holds a built app to put on one
      if (route === '/api/devices' && req.method === 'GET') {
        const W = runner.disk.work || {};
        const got = await adbPhones();
        const built = W.dir ? await builtApp(W.dir) : null;
        return json(res, 200, { ...got, built: built ? built.rel : null });
      }
      if (route === '/api/devices/install' && req.method === 'POST') {
        const b = await bodyOf(req);
        const W = runner.disk.work || {};
        const serial = String(b.serial || '');
        const built = W.dir ? await builtApp(W.dir) : null;
        if (!/^[\w.:-]{1,64}$/.test(serial))
          return json(res, 200, { ok: false, why: 'That is not a phone this computer can see.' });
        if (!built)
          return json(res, 200, {
            ok: false,
            why: 'There is no built app in the workspace yet. The team builds it first; then it can go on the phone.',
          });
        return json(res, 200, await adbInstall(serial, built.file));
      }
      if (route === '/api/workspace' || route.startsWith('/api/workspace/')) {
        const work = runner.disk.work || (runner.disk.work = {});
        const asked = (v, kept) => (v === true || v === false ? v : kept === true); // HOW A CHANGE LANDS IS SAID, never set beforehand: in the landing itself, or kept from when the change was asked for. With nothing said, a branch is not pushed and GitHub gets a pull request
        // the languages the workspace is written in, read from its files and kept for ten minutes: every job in it is given what its seat knows of them
        const langsNow = async () => {
          if (!work.repo) return [];
          if (
            !Array.isArray(work.langs) ||
            work.langsFor !== work.dir ||
            Date.now() - (work.langsAt || 0) > 10 * 60000
          ) {
            work.langs = await langsOf(work.dir).catch(() => []);
            work.langsFor = work.dir;
            work.langsAt = Date.now();
          }
          return work.langs;
        };
        const skillLine = async (role) => {
          const t = skillFor(role, await langsNow());
          return t ? '\n\n' + t : '';
        };
        const state = async () => {
          const st = work.repo ? await statusOf(work.dir).catch(() => null) : null;
          const waiting = !!(st && st.changed.length);
          const langs = await langsNow();
          return {
            repo: work.repo || null,
            dir: work.repo ? work.dir : null,
            kind: work.repo ? (work.kind === 'folder' ? 'folder' : 'github') : null,
            folder: work.kind === 'folder' ? work.folder : null,
            current: work.kind === 'folder' ? work.current || '' : null,
            branches: work.kind === 'folder' ? work.branches || [] : [],
            remote: work.kind === 'folder' ? work.remote || null : null,
            hasOrigin: work.kind === 'folder' ? !!work.hasOrigin : null,
            uncommitted: work.kind === 'folder' ? work.uncommitted || 0 : null,
            busy: workBusy,
            branch: st ? st.branch : null,
            base: st ? st.base : null,
            head: st ? st.head : null,
            subject: st ? st.subject : '',
            changed: st ? st.changed : [],
            pending: waiting
              ? {
                  task: (work.pending && work.pending.task) || '',
                  said: (work.pending && work.pending.said) || '',
                  branch: (work.pending && work.pending.branch) || '',
                  push: !!(work.pending && work.pending.push),
                  direct: !!(work.pending && work.pending.direct),
                }
              : null,
            proof: waiting && work.proof ? work.proof : null,
            last: work.last || null,
            langs,
            skills: work.repo ? seatSkills(langs) : {},
          }; // a proof belongs to the change that is waiting, and goes when it does
        };
        if (req.method === 'GET' && route === '/api/workspace') return json(res, 200, await state());
        if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
        const body = await bodyOf(req);
        try {
          if (workBusy)
            return json(res, 409, { error: 'The team is already at work in this repository. Give it a moment.' });
          if (route === '/api/workspace/use') {
            const repo = String(body.repo || '').trim();
            const t = await github.token();
            if (!t) throw new Error('Sign in to GitHub first.');
            workBusy = true;
            try {
              const st = await cloneRepo({ stateDir, repo, token: t });
              work.kind = 'github';
              work.folder = null;
              work.remote = null;
              work.repo = repo;
              work.dir = st.dir;
              work.pending = null;
              work.proof = null;
              await save();
            } finally {
              workBusy = false;
            }
            return json(res, 200, await state());
          }
          // A FOLDER THAT IS ALREADY ON THIS MACHINE (repo.mjs). With no path the machine's own folder chooser is opened (pick.mjs), and
          // closing it changes nothing. The team gets its own copy of the folder; the customer's files there are never touched.
          // CLONE FROM AN ADDRESS: the customer says where it goes in the machine's own folder window, it is cloned there with the
          // machine's own Git sign-in, and it is then connected as the Git folder it now is (repo.mjs cloneUrl).
          if (route === '/api/workspace/clone') {
            const url = String(body.url || '').trim();
            if (!validCloneUrl(url))
              throw new Error(
                'That is not a repository address. Paste the HTTPS or SSH address your Git host shows under Clone.',
              );
            let into = String(body.into || '')
              .trim()
              .slice(0, 1000);
            if (!into) {
              workBusy = true;
              let got;
              try {
                got = await pickFolder('Choose where to put ' + cloneNameOf(url));
              } finally {
                workBusy = false;
              }
              if (got.cancelled) return json(res, 200, { ...(await state()), cancelled: true });
              if (got.error) throw new Error(got.error);
              into = got.path;
            }
            workBusy = true;
            try {
              const made = await cloneUrl({ url, into });
              const st = await cloneFolder({ stateDir, folder: made.folder });
              work.kind = 'folder';
              work.repo = st.info.name;
              work.dir = st.dir;
              work.folder = st.info.folder;
              work.remote = st.info.remote;
              work.hasOrigin = st.info.hasOrigin;
              work.uncommitted = st.info.uncommitted;
              work.current = st.info.branch;
              work.branches = st.info.branches;
              work.pending = null;
              work.proof = null;
              await save();
            } finally {
              workBusy = false;
            }
            return json(res, 200, await state());
          }
          if (route === '/api/workspace/folder') {
            let where = String(body.path || '')
              .trim()
              .slice(0, 1000);
            if (!where) {
              workBusy = true;
              let got;
              try {
                got = await pickFolder();
              } finally {
                workBusy = false;
              }
              if (got.cancelled) return json(res, 200, { ...(await state()), cancelled: true });
              if (got.error) throw new Error(got.error);
              where = got.path;
            }
            workBusy = true;
            try {
              if (body.start === true) await startFolder(where); // someone new: any folder they choose is made a Git folder first (repo.mjs)
              const st = await cloneFolder({ stateDir, folder: where });
              work.kind = 'folder';
              work.repo = st.info.name;
              work.dir = st.dir;
              work.folder = st.info.folder;
              work.remote = st.info.remote;
              work.hasOrigin = st.info.hasOrigin;
              work.uncommitted = st.info.uncommitted;
              work.current = st.info.branch;
              work.branches = st.info.branches;
              work.pending = null;
              work.proof = null;
              await save();
            } finally {
              workBusy = false;
            }
            return json(res, 200, await state());
          }
          // DISCONNECT: the team stops working in this repository or folder. Nothing is deleted: the team's own copy stays where it is,
          // with a change that was waiting still in it, so connecting the same one again carries on from there. The customer's own
          // folder and the repository on GitHub are not touched at all.
          if (route === '/api/workspace/disconnect') {
            const was = work.repo
              ? {
                  repo: work.repo,
                  kind: work.kind === 'folder' ? 'folder' : 'github',
                  dir: work.dir,
                  waiting: ((await statusOf(work.dir).catch(() => null)) || { changed: [] }).changed.length,
                }
              : null;
            work.repo = null;
            work.dir = null;
            work.kind = null;
            work.folder = null;
            work.remote = null;
            work.hasOrigin = false;
            work.uncommitted = 0;
            work.pending = null;
            work.proof = null;
            work.last = null;
            await save();
            await sites.stopAll('the workspace was disconnected');
            return json(res, 200, { ...(await state()), was });
          }
          if (!work.repo) throw new Error('Choose a repository first.');
          if (route === '/api/workspace/discard') {
            await discard(work.dir);
            work.pending = null;
            work.proof = null;
            await save();
            return json(res, 200, await state());
          }
          if (route === '/api/workspace/land' && work.kind === 'folder') {
            // back to the customer's folder as a branch, and on to its origin if they chose that
            workBusy = true;
            try {
              const said = (work.pending && work.pending.said) || '';
              const info =
                ((await cloneFolder({ stateDir, folder: work.folder }).catch(() => null)) || {}).info || null;
              const who = {
                name: (info && info.who.name) || 'Family Office team',
                email: (info && info.who.email) || 'team@familyoffice.invalid',
              };
              const want = String(body.branch || (work.pending && work.pending.branch) || '');
              if (want && !validBranch(want)) throw new Error('That is not a branch name: ' + want.slice(0, 60));
              work.last = {
                at: Date.now(),
                ...(await landFolder({
                  dir: work.dir,
                  folder: work.folder,
                  current: (info && info.branch) || work.current || '',
                  branch: want,
                  remote: work.remote,
                  hasOrigin: work.hasOrigin,
                  push: asked(body.push, work.pending && work.pending.push),
                  title: String(body.title || (work.pending && work.pending.task) || 'A change from your team'),
                  body: (said ? said + '\n\n' : '') + 'Made by your Family Office team.',
                  who,
                })),
              };
              work.pending = null;
              work.proof = null;
              await save();
              return json(res, 200, work.last);
            } finally {
              workBusy = false;
            }
          }
          if (route === '/api/workspace/land') {
            const t = await github.token();
            const who = await github.who();
            if (!t || !who) throw new Error('Sign in to GitHub first.');
            workBusy = true;
            try {
              const said = (work.pending && work.pending.said) || '';
              work.last = {
                at: Date.now(),
                ...(await land({
                  dir: work.dir,
                  repo: work.repo,
                  token: t,
                  how: asked(body.direct, work.pending && work.pending.direct) ? 'direct' : 'pr',
                  branch: validBranch(body.branch || (work.pending && work.pending.branch))
                    ? String(body.branch || work.pending.branch)
                    : '',
                  title: String(body.title || (work.pending && work.pending.task) || 'A change from your team'),
                  body: (said ? said + '\n\n' : '') + 'Made by your Family Office team.',
                  who,
                  openPull: github.openPull,
                })),
              };
              work.pending = null;
              work.proof = null;
              await save();
              return json(res, 200, work.last);
            } finally {
              workBusy = false;
            }
          }
          // PROVE THE CHANGE THAT IS WAITING (prove.mjs): the team writes one proof test, it is run on the code before the change and on
          // the code after it, and the result is a table and one proof image. The proof file never enters the change.
          if (route === '/api/workspace/prove') {
            if (!runner.disk.session || !runner.disk.engine)
              throw new Error('Start your team first: it needs a mind to think with.');
            const was = await statusOf(work.dir);
            if (!was.changed.length) throw new Error('There is no change waiting to prove.');
            workBusy = true;
            try {
              const write = async ({ prompt }) => {
                if (runner.disk.engine.kind === 'claude') {
                  const r = await claudeRun({
                    bin: runner.disk.engine.bin,
                    cwd: work.dir,
                    prompt,
                    tools: true,
                    maxTurns: 40,
                    timeout: 10 * 60000,
                    ...(await runner.mindFor('steward')),
                  });
                  return { ok: r.ok, said: r.text || '', why: r.why };
                }
                const hh = runner.host || (runner.host = await measureHost(stateDir));
                const pi = await ensureAgent(stateDir, hh.tools.node && hh.tools.node.path, { onLine() {} });
                if (!pi.ok) throw new Error(pi.why);
                const r = await runAgent({
                  stateDir,
                  nodeBin: pi.node || (hh.tools.node && hh.tools.node.path),
                  cli: pi.cli,
                  port: tgt(runner.disk.engine),
                  via: proxy,
                  cwd: work.dir,
                  prompt,
                  timeout: 10 * 60000,
                  repo: true,
                });
                return {
                  ok: r.code === 0 && !r.engineError && !r.crashed,
                  said: r.said || '',
                  why: r.engineError || r.error || r.tail,
                };
              };
              const stepsFor = async ({ task, rows }) => {
                let said = '';
                await runner.reply({
                  seat: 'steward',
                  system:
                    'You write the steps a person follows to check a change by hand. Plain text, one step a line, numbered, at most six. Each step is a check ("Look for", "Confirm that"), never an order not to do something. Each step says how it behaves AFTER the change, and uses no number that is not in the change or the checks below.',
                  maxTokens: 300,
                  temperature: 0,
                  onText: (d) => {
                    said += d;
                  },
                  onReset: (t) => {
                    said = t || '';
                  },
                  messages: [
                    {
                      role: 'user',
                      content:
                        'The change: ' +
                        task +
                        '\nWhat the automated proof checked:\n' +
                        rows.map((x) => '- ' + x.test + ' (' + x.label + ')').join('\n') +
                        '\n\nWrite the steps.',
                    },
                  ],
                });
                return said
                  .split('\n')
                  .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
                  .filter((l) => l.length > 8 && l.length < 240)
                  .slice(0, 6);
              };
              const ask = async ({ system, prompt, max, temperature = 0, seat = 'steward' }) => {
                let said = '';
                await runner.reply({
                  seat,
                  system,
                  maxTokens: max || 600,
                  temperature,
                  onText: (d) => {
                    said += d;
                  },
                  onReset: (t) => {
                    said = t || '';
                  },
                  messages: [{ role: 'user', content: prompt }],
                });
                return said;
              }; // the team's model, asked for words with no tools: for weighing what failed, on every engine; and, on a local model, for the proof itself as text
              const got = await proveChange({
                stateDir,
                dir: work.dir,
                repo: work.repo,
                task: (work.pending && work.pending.task) || 'The change that is waiting',
                changed: was.changed,
                write,
                ask,
                textProof: runner.disk.engine.kind !== 'claude',
                stepsFor,
                checked: runner.disk.engine.kind !== 'claude', // a local model wrote both the change and its checks: the result is said to be checked, not proven
                independent:
                  runner.disk.engine.kind === 'claude' &&
                  new Set(Object.values(runner.disk.minds || {}).map((m) => (m && m.model) || '')).size > 1 &&
                  Object.keys(runner.disk.minds || {}).length > 1, // the seats do not all think with one model
                rewrite:
                  runner.disk.engine.kind !== 'claude'
                    ? ({ idea, fails }) =>
                        runner.wholeFiles({
                          dir: work.dir,
                          task: (work.pending && work.pending.task) || '',
                          idea,
                          fails,
                        })
                    : null,
                skill: skillFor('prove', await langsNow()),
              });
              if (got.blocked) return json(res, 200, { blocked: got.blocked });
              const now = await statusOf(work.dir);
              const touched = now.changed.map((c) => c.path).filter((f) => !was.changed.some((c) => c.path === f)); // the proof was to change nothing else: if it did, the customer is told
              if (!got.blocked && runner.disk.engine) {
                const ps = runner.disk.proofs || (runner.disk.proofs = {});
                const k = runner.disk.engine.model || runner.disk.engine.kind;
                const st = ps[k] || (ps[k] = { runs: 0, proven: 0, rounds: 0 });
                st.runs++;
                if (got.ok) st.proven++;
                st.rounds += (got.rounds || []).length + 1;
              } // what this model has proven here: shown on its card
              work.proof = got.id
                ? { ...got, touched }
                : { ok: false, at: Date.now(), why: got.why, rows: [], steps: [], touched };
              await save();
              return json(res, 200, work.proof);
            } finally {
              workBusy = false;
            }
          }
          // LOOK BEFORE ASKING. The team was asking the customer things the code already says ("how wide is the button today?"). Before a
          // question is put, and for a ticket that only asks where something is, a seat searches the repository and reads what it finds:
          // read-only tools, nothing written. What it found goes to the chat, and into what the builder is given.
          // THE JUDGEMENT OF A PLAN: each requirement against the code as it stands with the waiting change in it. The Steward's mind
          // reads the files (read-only tools, nothing written). Found for real: shown only the diff, the judge called "basketTotal adds
          // the lines up" unmet because that function was not in the diff, though it had been right all along.
          if (route === '/api/workspace/judge') {
            const reqs = (Array.isArray(body.requirements) ? body.requirements : [])
              .map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 300))
              .filter(Boolean)
              .slice(0, 6);
            if (!reqs.length) throw new Error('Say what the requirements are.');
            if (!runner.disk.session || !runner.disk.engine)
              throw new Error('Start your team first: it needs a mind to think with.');
            if (!(await statusOf(work.dir)).changed.length) throw new Error('There is no change waiting to judge.');
            workBusy = true;
            try {
              const c = await changeOf(work.dir, 6000);
              const prompt =
                'You are judging a change in the repository ' +
                work.repo +
                ', in the current folder. Change nothing. The change is made in the files here and is not committed.\n\nWhat was asked: ' +
                String(body.task || '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 1200) +
                '\n\nThe requirements:\n' +
                reqs.map((r, i) => i + 1 + '. ' + r).join('\n') +
                '\n\nWhat was changed' +
                (c.cut ? ' (the start of it; it is longer than this)' : '') +
                ':\n' +
                c.diff +
                '\n\nRead the code as it stands now: open the files the requirements are about, and what they call. A requirement is MET when the code as it stands now does it, whether this change made it so, or it was already so and the change did not break it. It is UNMET when the code does not do it, or you cannot find where it does.\n\nReply with one line for each requirement and nothing else: its number, then MET or UNMET, then in at most twelve words the file and what in it shows it, or what is missing.';
              let said = '';
              let ok = true;
              let why = '';
              if (runner.disk.engine.kind === 'claude') {
                const r = await claudeRun({
                  bin: runner.disk.engine.bin,
                  cwd: work.dir,
                  prompt,
                  maxTurns: 24,
                  timeout: 4 * 60000,
                  ...(await runner.mindFor('steward')),
                });
                said = r.text || '';
                ok = r.ok;
                why = r.why;
              } else {
                const hh = runner.host || (runner.host = await measureHost(stateDir));
                const pi = await ensureAgent(stateDir, hh.tools.node && hh.tools.node.path, { onLine() {} });
                if (!pi.ok) throw new Error(pi.why);
                const r = await runAgent({
                  stateDir,
                  nodeBin: pi.node || (hh.tools.node && hh.tools.node.path),
                  cli: pi.cli,
                  port: tgt(runner.disk.engine),
                  via: proxy,
                  cwd: work.dir,
                  prompt,
                  timeout: 4 * 60000,
                  repo: true,
                  tools: 'read,grep,find,ls',
                  full: true,
                });
                said = r.said || '';
                ok = r.code === 0 && !r.engineError && !r.crashed;
                why = r.engineError || r.error || r.tail;
              }
              if (!ok && !said)
                throw new Error('The team could not judge it: ' + String(why || 'no answer').slice(0, 200));
              return json(res, 200, { said: said.replace(/\*\*/g, '').trim().slice(0, 2000) });
            } finally {
              workBusy = false;
            }
          }
          // WHAT IS WAITING, AS TEXT: the change in the clone (git's diff, and each new file), bounded. The Steward judges each
          // requirement of the plan against this, not against what the builder said it did.
          // RUN IT HERE: one command a reply gave, run in the connected workspace when the customer presses for it. Only a command
          // that reads or tests (the same list the page uses, held again here: a page is never trusted with what may run), with no
          // shell in between, for at most two minutes, and what it printed is cut to what a chat can show.
          if (route === '/api/workspace/run') {
            const cmd = String(body.cmd || '')
              .trim()
              .slice(0, 300);
            const why = runRefusal(cmd);
            if (why) return json(res, 200, { ok: false, why });
            if (!work.repo || !work.dir) return json(res, 200, { ok: false, why: 'No workspace is connected.' });
            const argv = cmd.match(/"[^"]*"|'[^']*'|\S+/g).map((a) => a.replace(/^(["'])(.*)\1$/, '$2'));
            const ran = await new Promise((done) => {
              let out = '';
              let child;
              try {
                child = runSpawn(argv[0], argv.slice(1), {
                  cwd: work.dir,
                  shell: false,
                  env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
                });
              } catch (e) {
                return done({ ok: false, why: String((e && e.message) || e).slice(0, 200) });
              }
              const stop = setTimeout(() => {
                out += '\n[stopped after two minutes]';
                child.kill('SIGKILL');
              }, 120000);
              const take = (d) => {
                if (out.length < 24000) out += d.toString();
              };
              child.stdout.on('data', take);
              child.stderr.on('data', take);
              child.on('error', (e) => {
                clearTimeout(stop);
                done({
                  ok: false,
                  why:
                    e.code === 'ENOENT'
                      ? argv[0] + ' is not installed on this machine.'
                      : String(e.message).slice(0, 200),
                });
              });
              child.on('close', (code) => {
                clearTimeout(stop);
                done({ ok: code === 0, code, out: out.replace(/\u001b\[[0-9;]*m/g, '').slice(-6000) });
              });
            });
            return json(res, 200, ran);
          }
          if (route === '/api/workspace/diff') {
            const st = await statusOf(work.dir);
            if (!st.changed.length) return json(res, 200, { diff: '', files: [], cut: false });
            const c = await changeOf(work.dir);
            return json(res, 200, { diff: c.diff, files: st.changed.map((x) => x.path).slice(0, 60), cut: c.cut });
          }
          if (route === '/api/workspace/look') {
            const task = String(body.task || '')
              .replace(/[\t\r\n]+/g, ' ')
              .trim()
              .slice(0, 3600);
            if (!task) throw new Error('Say what the team should look for.');
            if (!runner.disk.session || !runner.disk.engine)
              throw new Error('Start your team first: it needs a mind to think with.');
            workBusy = true;
            try {
              const prompt =
                'You are looking through the repository ' +
                work.repo +
                ', in the current folder. Change nothing. This came in:\n\n' +
                task +
                '\n\nFind the code it is about. Search the files for the names and the words it uses (search for a word, then read the file it is in), and follow what that code calls until you reach where the thing is really decided. A file that only mentions the word is not the answer. Then reply in at most five short lines:\n- the file, and the function, constant or class in it, by their exact names\n- what that code does or what the value is today, quoting its line\n- anything the request names that is not in the repository\nSay only what you read. If you did not find it, say so plainly.' +
                (await skillLine('find'));
              let said = '';
              let ok = true;
              let why = '';
              if (runner.disk.engine.kind === 'claude') {
                const r = await claudeRun({
                  bin: runner.disk.engine.bin,
                  cwd: work.dir,
                  prompt,
                  maxTurns: 24,
                  timeout: 4 * 60000,
                  ...(await runner.mindFor('operations')),
                });
                said = r.text || '';
                ok = r.ok;
                why = r.why;
              } else {
                const hh = runner.host || (runner.host = await measureHost(stateDir));
                const pi = await ensureAgent(stateDir, hh.tools.node && hh.tools.node.path, { onLine() {} });
                if (!pi.ok) throw new Error(pi.why);
                const r = await runAgent({
                  stateDir,
                  nodeBin: pi.node || (hh.tools.node && hh.tools.node.path),
                  cli: pi.cli,
                  port: tgt(runner.disk.engine),
                  via: proxy,
                  cwd: work.dir,
                  prompt,
                  timeout: 4 * 60000,
                  repo: true,
                  tools: 'read,grep,find,ls',
                  full: true,
                });
                said = r.said || '';
                ok = r.code === 0 && !r.engineError && !r.crashed;
                why = r.engineError || r.error || r.tail;
              }
              if (!ok && !said) throw new Error('The team could not look: ' + String(why || 'no answer').slice(0, 200));
              // WHAT IT NAMES MUST BE THERE. Found for real: asked where a button's text comes from, the answer named a file "PayButton" that
              // the repository does not have. Every path the answer gives is looked for among the repository's files; one that is not
              // there is said back, once, and the answer is given again.
              const tracked = (await sh('git', ['-C', work.dir, 'ls-files'], { timeout: 20000 })).out
                .split('\n')
                .filter(Boolean);
              const bases = new Set(tracked.map((f) => f.split('/').pop()));
              const notThere = (t) =>
                [
                  ...new Set(
                    (
                      String(t)
                        .replace(/\*\*|\x60/g, '')
                        .match(
                          /[\w.-]+(?:\/[\w.-]+)+|\b[\w-]+\.(?:py|mjs|cjs|js|jsx|ts|tsx|kt|kts|java|swift|dart|xml|json|ya?ml|gradle|md|html|css)\b/g,
                        ) || []
                    ).map((x) => x.replace(/[.,:;]+$/, '')),
                  ),
                ]
                  .filter(
                    (x) =>
                      !/^(https?|www)\b/.test(x) &&
                      !tracked.some(
                        (f) => f === x || f.startsWith(x + '/') || f.startsWith(x + '.') || f.endsWith('/' + x),
                      ) &&
                      !bases.has(x.split('/').pop()) &&
                      !/^\d+(\.\d+)*$/.test(x) &&
                      (x.includes('/') ? x.split('/').length >= 3 : true),
                  )
                  .slice(0, 4);
              const lost = tracked.length ? notThere(said) : [];
              if (lost.length) {
                const first = said;
                const again =
                  prompt +
                  '\n\nYour first answer named ' +
                  lost.join(', ') +
                  ', which ' +
                  (lost.length === 1 ? 'is' : 'are') +
                  ' not in this repository. Open the file you mean, and name each file by the path you opened it at.';
                if (runner.disk.engine.kind === 'claude') {
                  const r = await claudeRun({
                    bin: runner.disk.engine.bin,
                    cwd: work.dir,
                    prompt: again,
                    maxTurns: 24,
                    timeout: 4 * 60000,
                    ...(await runner.mindFor('operations')),
                  });
                  said = r.text || first;
                } else {
                  const hh = runner.host || (runner.host = await measureHost(stateDir));
                  const pi = await ensureAgent(stateDir, hh.tools.node && hh.tools.node.path, { onLine() {} });
                  const r = pi.ok
                    ? await runAgent({
                        stateDir,
                        nodeBin: pi.node || (hh.tools.node && hh.tools.node.path),
                        cli: pi.cli,
                        port: tgt(runner.disk.engine),
                        via: proxy,
                        cwd: work.dir,
                        prompt: again,
                        timeout: 4 * 60000,
                        repo: true,
                        tools: 'read,grep,find,ls',
                        full: true,
                      })
                    : { said: '' };
                  said = r.said || first;
                }
              }
              return json(res, 200, { found: said.replace(/\*\*/g, '').trim().slice(0, 1500) });
            } finally {
              workBusy = false;
            }
          }
          if (route === '/api/workspace/task') {
            const task = String(body.task || '')
              .replace(/[\t\r\n]+/g, ' ')
              .trim()
              .slice(0, 3600);
            if (!task) throw new Error('Say what the team should change.'); // line ends become a space; the spaces inside a quoted value are the author's and are kept
            if (!runner.disk.session || !runner.disk.engine)
              throw new Error('Start your team first: it needs a mind to think with.');
            // A FURTHER ROUND (more: true; the chat's plan, when a requirement is not met yet): the builder goes on from the change that
            // is waiting. Without it a second change is still refused while one waits.
            const further = body.more === true && (await statusOf(work.dir)).changed.length > 0;
            const sigBefore = further ? (await changeOf(work.dir)).sig : '';
            if (!further && (await statusOf(work.dir)).changed.length)
              return json(res, 409, { error: 'The last change is still waiting. Land it or throw it away first.' });
            if (work.kind === 'folder' && !further) {
              const st = await cloneFolder({ stateDir, folder: work.folder });
              work.uncommitted = st.info.uncommitted;
              work.current = st.info.branch;
              work.branches = st.info.branches;
            } // the copy is brought up to the folder's last commit before the team starts
            workBusy = true;
            try {
              const prompt =
                'You are working in a clone of the repository ' +
                work.repo +
                ', in the current folder. ' +
                (further
                  ? 'A change toward the task below is already made here and is not committed: the files are as it left them. It does not yet do all that was asked. Keep what is right in it and finish the work, and nothing else:\n\n'
                  : 'Make this change, and nothing else:\n\n') +
                task +
                '\n\nFind the code first: search for the names the task uses, and read the files you need. Change only what the task needs. Do not run git: the change is committed for you afterwards. When it is done, say in one or two sentences what you changed.' +
                (await skillLine('build'));
              let said = '';
              let ok = true;
              let why = '';
              const build = async (prompt) => {
                // one run of the builder, on whichever engine the team has
                if (runner.disk.engine.kind === 'claude') {
                  const r = await claudeRun({
                    bin: runner.disk.engine.bin,
                    cwd: work.dir,
                    prompt,
                    tools: true,
                    maxTurns: 40,
                    timeout: 10 * 60000,
                    ...(await runner.mindFor('operations')),
                  });
                  said = r.text || '';
                  ok = r.ok;
                  why = r.why;
                } else {
                  const hh = runner.host || (runner.host = await measureHost(stateDir));
                  const pi = await ensureAgent(stateDir, hh.tools.node && hh.tools.node.path, { onLine() {} });
                  if (!pi.ok) throw new Error(pi.why);
                  const r = await runAgent({
                    stateDir,
                    nodeBin: pi.node || (hh.tools.node && hh.tools.node.path),
                    cli: pi.cli,
                    port: tgt(runner.disk.engine),
                    via: proxy,
                    cwd: work.dir,
                    prompt,
                    timeout: 10 * 60000,
                    repo: true,
                    tools: 'read,write,edit,ls,grep,find',
                  }); // in a repository it reads that repository's own instruction files, and it can search
                  said = r.said || '';
                  ok = r.code === 0 && !r.engineError && !r.crashed;
                  const big = /maximum context length is (\d+) tokens.*?prompt has (\d+)/.exec(r.engineError || '');
                  why = big
                    ? 'it would have to hold ' +
                      Number(big[2]).toLocaleString('en-US') +
                      ' tokens at once, and this model holds ' +
                      Number(big[1]).toLocaleString('en-US') +
                      ' here. Ask for a smaller piece: name the one file and the one thing to change in it'
                    : r.engineError
                      ? "the model server refused the agent's request: " + r.engineError
                      : r.crashed
                        ? r.error
                        : r.tail;
                }
              };
              await build(prompt);
              // it said it would and did nothing (found for real: "I need to create the directory", and no file): asked once more, plainly
              if (ok && !(await statusOf(work.dir)).changed.length)
                await build(
                  prompt +
                    "\n\nYou were asked this once and changed nothing. Make the change now, with the write and edit tools: a new file's folders are made for you when you write it.",
                );
              // THE PROJECT'S OWN TESTS ARE RUN AFTER THE CHANGE. Found for real: a change made a list quick and broke what it returned, and a
              // test the project already had would have said so; nobody ran it, and the fault went on to the proof. What fails now and did
              // not fail before is the change's doing: the builder is shown it, once, and puts the code right (or brings a test up to date
              // where the task itself changed what the code must do). Tests that were failing already are left alone, and said.
              let tests = null;
              let room = null;
              const notTest = (f) =>
                !/(^|\/)(test_[\w-]+\.py|[\w-]+_test\.(py|dart)|[\w.-]+\.(test|spec)\.[cm]?[jt]sx?|\w+Tests?\.(swift|kt|java))$/.test(
                  f,
                );
              const touched = async () => (await statusOf(work.dir)).changed.map((c) => c.path || c);
              const ownNow = async () => ownTests(work.dir, { changed: await touched() }).catch(() => null);
              // what an editor does without being asked: an import the change took away while the file still uses it is put back, and a
              // Compose or JUnit name the compiler cannot find is imported
              const mend = async () => {
                const back = await restoreImports(work.dir, await touched()).catch(() => []);
                const moved = await importsBelowPackage(work.dir, await touched()).catch(() => 0);
                return back.length + moved;
              };
              const autoImport = async (out) => {
                let n = 0;
                const by = new Map();
                for (const m of String(out || '').matchAll(
                  /([\w./-]+\.kt):\d+:\d+:? (?:error: )?Unresolved reference:? '?(\w+)'?/g,
                )) {
                  const f = (await touched()).find((t) => t.endsWith(m[1].split('/').pop()));
                  if (f) by.set(f, [...(by.get(f) || []), m[2]]);
                }
                for (const [f, names] of by) {
                  const was = await readFile(path.join(work.dir, f), 'utf8').catch(() => '');
                  const now = addKotlinImports(was, [...new Set(names)]);
                  if (was && now !== was) {
                    await writeFile(path.join(work.dir, f), now);
                    n++;
                  }
                }
                for (const f of (await touched()).filter((x) => /\.kt$/.test(x))) {
                  const was = await readFile(path.join(work.dir, f), 'utf8').catch(() => '');
                  const now = was ? mendKotlin(was, String(out || '').split('\n'), f.split('/').pop()) : null;
                  if (now) {
                    await writeFile(path.join(work.dir, f), now);
                    n++;
                  }
                }
                n += await mendNames(work.dir, await touched(), out).catch(() => 0);
                return n;
              };
              // asked twice, and still nothing: on a local model the files the task names are written out whole (wholeFiles)
              if (ok && runner.disk.engine.kind !== 'claude' && !(await statusOf(work.dir)).changed.length) {
                const n = await runner.wholeFiles({ dir: work.dir, task }).catch(() => 0);
                if (n) said = 'I wrote ' + (n === 1 ? 'the file' : n + ' files') + ' out whole, with the change made.';
              }
              if (ok && !(await statusOf(work.dir)).changed.length && process.env.FO_NO_ROOM !== '1') {
                const askSeat = async ({ system, prompt: q, max, temperature, seat }) => {
                  let s2 = '';
                  await runner.reply({
                    seat: seat || 'operations',
                    system,
                    maxTokens: max || 320,
                    temperature: temperature == null ? 0 : temperature,
                    onText: (d) => {
                      s2 += d;
                    },
                    onReset: (t) => {
                      s2 = t || '';
                    },
                    messages: [{ role: 'user', content: q }],
                  });
                  return s2;
                };
                const named = [
                  ...new Set(task.match(/[\w./-]+\.(?:py|mjs|cjs|js|jsx|ts|tsx|kt|swift|dart)\b/g) || []),
                ].slice(0, 3);
                const code = (
                  await Promise.all(
                    named.map(async (f) => {
                      const t = await readFile(path.join(work.dir, f), 'utf8').catch(() => '');
                      return t ? 'The file ' + f + ':\n' + t.slice(0, 3500) : '';
                    }),
                  )
                )
                  .filter(Boolean)
                  .join('\n\n');
                const answers = await askRoom({
                  ask: askSeat,
                  seats: ['steward', 'ask', 'master', 'overseer'],
                  problem: {
                    task,
                    code,
                    fails: ['the builder read the code, said what it thought, and changed no file'],
                    tried: said
                      ? ['what the builder said, without doing it: ' + said.replace(/\s+/g, ' ').slice(0, 400)]
                      : [],
                  },
                });
                const got = await tryIdeas({
                  ideas: answers.filter((a) => a.idea),
                  snap: new Map(),
                  dir: work.dir,
                  start: 1000,
                  limit: 3,
                  until: Date.now() + 8 * 60000,
                  apply: async (idea) => {
                    if (
                      runner.disk.engine.kind !== 'claude' &&
                      (await runner.wholeFiles({ dir: work.dir, task, idea }).catch(() => 0))
                    )
                      return;
                    await build(
                      prompt +
                        '\n\n' +
                        idea.name +
                        ', on your team, says where to start' +
                        (idea.where ? ' (' + idea.where + ')' : '') +
                        ': ' +
                        idea.idea +
                        '\n\nOpen that file and make the change now, with the edit tool. Do not explain it first.',
                    );
                  },
                  score: async () => {
                    if (!(await statusOf(work.dir)).changed.length) return { ok: false, failing: 1000 };
                    await mend();
                    const t = await ownNow();
                    return { ok: !t || t.ok || !!t.none, failing: !t || t.ok || t.none ? 0 : t.failed.length || 500 };
                  },
                });
                room = {
                  why: 'I read the code and did not settle on a change.',
                  asked: answers.length,
                  lines: roomLines(answers, got.tries),
                  came: got.best.idea
                    ? got.best.idea.name +
                      "'s idea got the change made" +
                      (got.best.ok ? '' : ", though the project's own tests do not pass with it yet")
                    : got.tries.length
                      ? 'the ideas were tried, and still no file was changed'
                      : 'nobody had an idea',
                };
              }
              if (ok && (await statusOf(work.dir)).changed.length) {
                await mend();
                tests = await ownNow();
                for (let k = 0; k < 3 && tests && !tests.ok && !tests.none && (await autoImport(tests.said)); k++)
                  tests = await ownNow();
                if (tests && !tests.ok && !tests.none) {
                  const base = await ownTests(work.dir, { at: 'HEAD' }).catch(() => null);
                  const fresh = tests.failed.filter((n) => !(base && base.failed.includes(n)));
                  if (base && !base.ok && !fresh.length)
                    tests.old = true; // they failed before the change as well: not this change's doing
                  else {
                    const first = said;
                    await build(
                      'You are working in a clone of the repository ' +
                        work.repo +
                        ', in the current folder. You just made this change:\n\n' +
                        task +
                        "\n\nThe project's own tests were then run (" +
                        tests.command +
                        '), ' +
                        ((fresh.length ? fresh : tests.failed).length
                          ? 'and these fail now:\n' +
                            (fresh.length ? fresh : tests.failed).map((n) => '- ' + n).join('\n')
                          : 'and they no longer run: the project does not build, or a test file does not load.') +
                        (tests.said ? '\n\nWhat the run said:\n' + tests.said : '') +
                        '\n\nRead those tests and the code they test. If your change broke something the task did not ask to change, put the code right. If a test fails only because the task changed what the code must do, bring that test up to date with the task. Never delete a test, and change nothing else. Do not run git. When it is done, say in one sentence what you did.',
                    );
                    await mend();
                    let after = await ownNow();
                    if (after && !after.ok && (await autoImport(after.said))) after = await ownNow();
                    tests = { ...(after || tests), repaired: true };
                    if (!tests.ok && !tests.none && !tests.failed.length) {
                      // it still does not build: once more, with what the build says now
                      await build(
                        'You are working in a clone of the repository ' +
                          work.repo +
                          ', in the current folder. You made this change, and then tried to repair it:\n\n' +
                          task +
                          '\n\nThe project still does not build.' +
                          (tests.said ? ' What the build says now:\n' + tests.said : '') +
                          '\n\nOpen each file and line it names and put exactly that right: an import that is missing or doubled, a name that does not exist, a bracket. Change nothing else. Do not run git. When it is done, say in one sentence what you did.',
                      );
                      await mend();
                      let again = await ownNow();
                      if (again && !again.ok && (await autoImport(again.said))) again = await ownNow();
                      tests = { ...(again || tests), repaired: true };
                    }
                    if (!tests.ok && !tests.none && runner.disk.engine.kind !== 'claude') {
                      // a local model: the files written out whole (whole.mjs), kept only if the tests are then better
                      const snap0 = await snapOf(work.dir);
                      const was = tests.failed.length || 1000;
                      if (
                        await runner
                          .wholeFiles({
                            dir: work.dir,
                            task,
                            fails:
                              (tests.failed.length
                                ? 'these tests of the project fail: ' + tests.failed.slice(0, 4).join(', ') + '. '
                                : 'the project no longer builds. ') + String(tests.said || '').slice(0, 400),
                          })
                          .catch(() => 0)
                      ) {
                        await mend();
                        const t2 = await ownNow();
                        const now = !t2 ? 1000 : t2.ok || t2.none ? 0 : t2.failed.length || 1000;
                        if (now < was) tests = { ...t2, repaired: true, whole: true };
                        else await backTo(work.dir, snap0);
                      }
                    }
                    // DOES ANYONE HAVE ANY IDEAS? (swarm.mjs) The change has been repaired and the project's own tests still fail, or it still
                    // does not build. The builder asks the room; each seat's idea is tried from where the change stands (the Overseer's from
                    // a clean start), and the project's own tests decide. The one that got furthest is what goes on to be proven.
                    if (!tests.ok && !tests.none && process.env.FO_NO_ROOM !== '1') {
                      const roomAsk = async ({ system, prompt, max, temperature, seat }) => {
                        let s2 = '';
                        await runner.reply({
                          seat: seat || 'operations',
                          system,
                          maxTokens: max || 320,
                          temperature: temperature == null ? 0 : temperature,
                          onText: (d) => {
                            s2 += d;
                          },
                          onReset: (t) => {
                            s2 = t || '';
                          },
                          messages: [{ role: 'user', content: prompt }],
                        });
                        return s2;
                      };
                      const files = (await touched()).filter(notTest).slice(0, 3);
                      const code = (
                        await Promise.all(
                          files.map(
                            async (f) =>
                              'The file ' +
                              f +
                              ':\n' +
                              (await readFile(path.join(work.dir, f), 'utf8').catch(() => '')).slice(0, 3500),
                          ),
                        )
                      ).join('\n\n');
                      const fails = tests.failed.length
                        ? [
                            ...tests.failed.slice(0, 4).map((n) => 'the project\'s own test "' + n + '"'),
                            ...(tests.said ? ['what the run said: ' + tests.said.slice(0, 500)] : []),
                          ]
                        : [
                            'the project no longer builds: ' +
                              String(tests.said || 'the build gave no reason').slice(0, 700),
                          ];
                      const answers = await askRoom({
                        ask: roomAsk,
                        seats: ['overseer', 'steward', 'ask', 'master'],
                        problem: {
                          task,
                          code,
                          fails,
                          tried: ['the builder was shown what failed and repaired the change, and it still fails'],
                        },
                      });
                      const snap = await snapOf(work.dir);
                      const skill = await skillLine('build');
                      const got = await tryIdeas({
                        ideas: answers
                          .filter((a) => a.idea)
                          .map((a) => (a.seat === 'overseer' ? { ...a, fresh: true } : a)),
                        snap,
                        dir: work.dir,
                        start: tests.failed.length || 1000,
                        limit: 3,
                        until: Date.now() + 9 * 60000,
                        apply: async (idea) => {
                          if (
                            runner.disk.engine.kind !== 'claude' &&
                            (await runner
                              .wholeFiles({
                                dir: work.dir,
                                task,
                                idea,
                                fails: fails.join('; ').slice(0, 600),
                              })
                              .catch(() => 0))
                          ) {
                            await mend();
                            return;
                          }
                          await build(
                            'You are working in a clone of the repository ' +
                              work.repo +
                              ', in the current folder. ' +
                              (idea.fresh
                                ? 'A first try at the change below did not hold and was thrown away: the files are as they were. Make the change again, from the start.'
                                : 'The change below was made here, and it does not hold yet.') +
                              '\n\n' +
                              task +
                              '\n\nWhat failed:\n' +
                              fails.map((f) => '- ' + f).join('\n') +
                              '\n\n' +
                              idea.name +
                              ', on your team, has this idea' +
                              (idea.where ? ' (' + idea.where + ')' : '') +
                              ':\n\n' +
                              idea.idea +
                              '\n\nDo it that way. Read the files first. Change only what the task needs, and delete no test. Do not run git. When it is done, say in one sentence what you changed.' +
                              skill,
                          );
                          await mend();
                        },
                        score: async () => {
                          if (!(await statusOf(work.dir)).changed.length)
                            return { ok: false, failing: 1000, why: 'it left no change at all' }; // the project's own tests pass on code nobody touched: that is not a try that passed
                          let t = await ownNow();
                          if (t && !t.ok && (await autoImport(t.said))) t = await ownNow();
                          return {
                            ok: !!(t && (t.ok || t.none)),
                            failing: !t ? 1000 : t.ok ? 0 : t.failed.length || 1000,
                          };
                        },
                      });
                      const after = await ownNow();
                      tests = { ...(after || tests), repaired: true };
                      room = {
                        why: "I repaired my change and the project's own tests still fail.",
                        asked: answers.length,
                        lines: roomLines(answers, got.tries),
                        came: got.best.ok
                          ? got.best.idea.name + "'s idea was tried, and with it the project's own tests pass"
                          : got.tries.length
                            ? "the ideas were tried, and the project's own tests still fail"
                            : 'nobody had an idea',
                      };
                    }
                    said = (
                      first +
                      ' ' +
                      (tests.ok
                        ? "The project's own tests failed after that, so I put it right: they pass now."
                        : "The project's own tests still fail after a repair: " + tests.failed.join(', ') + '.')
                    ).trim();
                    if (room) said = (said + ' I asked the room for ideas: ' + room.came + '.').trim();
                    ok = true;
                  }
                }
              }
              const st = await statusOf(work.dir);
              work.pending = st.changed.length
                ? {
                    task: further && work.pending && work.pending.task ? work.pending.task : task,
                    said: said.slice(0, 600),
                    at: Date.now(),
                    branch: validBranch(body.branch) ? String(body.branch) : '',
                    push: body.push === true,
                    direct: body.direct === true,
                  }
                : null;
              if (further) work.proof = null;
              await save();
              if (!st.changed.length && !ok)
                throw new Error('The team could not do it: ' + (why || 'it gave no reason'));
              return json(res, 200, {
                changed: st.changed,
                said: said.slice(0, 600),
                tests: tests
                  ? {
                      ok: tests.ok,
                      none: !!tests.none,
                      failed: tests.failed,
                      repaired: !!tests.repaired,
                      old: !!tests.old,
                    }
                  : null,
                room,
                ...(further ? { further: true, same: (await changeOf(work.dir)).sig === sigBefore } : {}),
              });
            } finally {
              workBusy = false;
            }
          }
        } catch (e) {
          return json(res, e.status || 400, { error: String((e && e.message) || e).slice(0, 300) });
        }
        return json(res, 404, { error: 'not found' });
      }
      // THE PHONE LINK (runner/link.mjs), driven from the Remote tab on this computer only: a request that came in over the link itself
      // never reaches these (the link refuses them, and they are refused here again).
      if (route === '/api/link' || route.startsWith('/api/link/')) {
        if (req.headers['x-fo-phone'])
          return json(res, 403, { error: 'That is done on the computer itself, not from a phone.' });
        if (!remoteOn())
          return json(res, 404, { error: 'Remote is switched off in this version of the app.', off: true });
        if (req.method === 'GET' && route === '/api/link')
          return json(res, 200, await link.status({ usb: url.searchParams.get('usb') !== '0' }));
        if (req.method === 'POST') {
          const b = await bodyOf(req);
          try {
            if (route === '/api/link/on') {
              const s = await link.turn(b.on === true);
              if (!s.on) arm(grace, 'the app was closed');
              return json(res, 200, s);
            }
            if (route === '/api/link/pairing') {
              link.openWindow();
              return json(res, 200, await link.status());
            }
            if (route === '/api/link/decide')
              return json(res, 200, await link.decide(String(b.fp || ''), b.ok === true));
            if (route === '/api/link/revoke') return json(res, 200, await link.revoke(String(b.id || '')));
            if (route === '/api/link/sideload') return json(res, 200, await link.sideload(String(b.serial || '')));
          } catch (e) {
            return json(res, 400, { error: String((e && e.message) || e).slice(0, 300) });
          }
        }
        return json(res, 404, { error: 'not found' });
      }
      // A PICTURE OR A RECORDING HANDED TO THE TEAM (media.mjs): the file itself arrives as the body of the request, is kept in this app's
      // own folder under a name of its own, and is looked at when the team is asked to. Only a picture or a video, and no larger than
      // the team looks at.
      if (route === '/api/media' && req.method === 'POST') {
        const name = safeName(url.searchParams.get('name') || '');
        const kind = kindOf('', req.headers['content-type']);
        if (!kind || !kindOf(name, '')) return json(res, 400, { error: 'That is not a picture or a video.' });
        const id = randomBytes(6).toString('hex');
        const max = (kind === 'video' ? 150 : 25) * 2 ** 20;
        const parts = [];
        let n = 0;
        try {
          for await (const c of req) {
            n += c.length;
            if (n > max) break;
            parts.push(c);
          }
        } catch {
          return json(res, 400, { error: 'The file did not arrive whole.' });
        }
        if (n > max)
          return json(res, 413, {
            error: 'That file is larger than the ' + Math.round(max / 2 ** 20) + ' MB the team looks at.',
          });
        if (n < 64) return json(res, 400, { error: 'That file is empty.' });
        try {
          await mkdir(path.join(mediaDir, 'in', id), { recursive: true });
          await writeFile(path.join(mediaDir, 'in', id, name), Buffer.concat(parts));
        } catch (e) {
          return json(res, 500, {
            error: 'The file could not be kept: ' + String((e && e.message) || e).slice(0, 200),
          });
        }
        return json(res, 200, { id, name, kind, bytes: n });
      }
      if (route === '/api/media/read' && req.method === 'POST') {
        const b = await bodyOf(req);
        const ids = (Array.isArray(b.ids) ? b.ids : [])
          .map(String)
          .filter((x) => /^[a-f0-9]{12}$/.test(x))
          .slice(0, 8);
        const files = [];
        if (!runner.disk.session || !runner.disk.engine)
          return json(res, 400, { error: 'Start your team first: it needs a mind to look with.' });
        for (const id of ids) {
          const d = path.join(mediaDir, 'in', id);
          const name = (await readdir(d).catch(() => [])).find((f) => kindOf(f, ''));
          if (name) files.push({ name, kind: kindOf(name, ''), file: path.join(d, name) });
        }
        if (!files.length) return json(res, 400, { error: 'There is nothing to look at.' });
        try {
          const list = await runner.lookAt(
            files,
            String(b.about || '').slice(0, 800),
            path.join(mediaDir, 'in', ids[0]),
          );
          return json(res, 200, { media: list, note: mediaNote(list) });
        } catch (e) {
          return json(res, 500, { error: String((e && e.message) || e).slice(0, 300) });
        }
      }
      // JIRA (runner/jira.mjs): whether the connector is signed in, the last tickets read, and a read with the page's filters.
      // Signing in is /api/connect, as for any connector.
      if (route === '/api/jira' || route.startsWith('/api/jira/')) {
        const claude = await findClaude();
        const jira = runner.disk.jira || (runner.disk.jira = {});
        const signedIn = async (fresh) => {
          if (!claude) return 'unavailable';
          if (!fresh && jiraSeen && Date.now() - jiraSeen.at < 15000) return jiraSeen.state;
          const st = (await connectorList(claude)).find((x) => x.id === 'atlassian').state;
          jiraSeen = { at: Date.now(), state: st };
          return st;
        };
        if (req.method === 'GET' && route === '/api/jira')
          return json(res, 200, {
            state: await signedIn(url.searchParams.get('fresh') === '1'),
            busy: jiraBusy > 0,
            site: jira.site || '',
            filters: jira.filters || null,
            last: jira.last || null,
            statuses: jira.statuses || [],
            projects: jira.projects || null,
            me: jira.me || '',
            boards: jira.boards || null,
            quick: jira.quick ? { ...jira.quick, list: jira.quick.list.map((q) => ({ name: q.name })) } : null,
            signin: connectState(),
          });
        if (req.method === 'POST') {
          const body = await bodyOf(req);
          if (route === '/api/jira/logout') {
            if (!claude) return json(res, 400, { error: 'Claude Code is not on this machine.' });
            await jiraLogout(claude);
            jiraSeen = null;
            runner.disk.jira = {};
            await save();
            return json(res, 200, { state: await signedIn(true) });
          }
          if (
            ![
              '/api/jira/search',
              '/api/jira/projects',
              '/api/jira/quick',
              '/api/jira/boards',
              '/api/jira/issue',
              '/api/jira/move',
              '/api/jira/comment',
              '/api/jira/take',
              '/api/jira/faces',
              '/api/jira/attach',
              '/api/jira/media',
            ].includes(route)
          )
            return json(res, 404, { error: 'not found' });
          if ((await signedIn(true)) !== 'connected') return json(res, 400, { error: 'Sign in to Jira first.' });
          // ONE READ OF JIRA AT A TIME, and a second one WAITS ITS TURN instead of being refused: a page that is opened again while its
          // boards are still being read, or a Show tickets pressed during that read, simply gets its answer a little later. A list
          // that was read while this request waited is given as it stands, so the same read is not run twice.
          const before = jiraTurn;
          const waited = jiraBusy > 0;
          const recent = (x) => !!x && waited && Date.now() - x.at < 120000;
          let done;
          jiraTurn = new Promise((r) => {
            done = r;
          });
          jiraBusy++;
          await before;
          try {
            if (route === '/api/jira/boards' && recent(jira.boards))
              return json(res, 200, { boards: jira.boards, projects: jira.projects, me: jira.me || '' });
            if (
              route === '/api/jira/quick' &&
              recent(jira.quick) &&
              ((body.board && jira.quick.boardId === Number(body.board)) ||
                (!body.board &&
                  body.project &&
                  String(jira.quick.project || '').toUpperCase() === String(body.project).toUpperCase()))
            )
              return json(res, 200, { ...jira.quick, list: jira.quick.list.map((q) => ({ name: q.name })) });
            if (route === '/api/jira/boards') {
              const got = await jiraBoards(claude);
              jira.boards = { at: got.at, note: got.note, list: got.boards };
              jira.projects = { at: got.at, site: got.site, list: got.projects };
              jira.site = got.site || jira.site || '';
              if (got.me) jira.me = got.me;
              await save();
              return json(res, 200, { boards: jira.boards, projects: jira.projects, me: jira.me || '' });
            }
            if (route === '/api/jira/quick') {
              const bd = body.board
                ? ((jira.boards && jira.boards.list) || []).find((x) => x.id === Number(body.board)) || null
                : null;
              jira.quick = await jiraQuick(claude, { project: body.project || (bd && bd.project) || '', board: bd });
              await save();
              return json(res, 200, { ...jira.quick, list: jira.quick.list.map((q) => ({ name: q.name })) });
            } // the page is given their names; their searches stay here
            if (route === '/api/jira/search') {
              // a board that was chosen is read by ITS OWN filter and columns, read once through the connector and kept a day. If they
              // cannot be read, its project is searched instead and the page is told so.
              const bid = Number(body.board) || 0;
              const bd = bid ? ((jira.boards && jira.boards.list) || []).find((x) => x.id === bid) || null : null;
              let conf = bd ? (jira.conf || {})[bid] || null : null;
              let boardNote = '';
              if (bd && (!conf || Date.now() - conf.at > 86400000)) {
                try {
                  conf = await jiraBoardConf(claude, bd);
                  (jira.conf || (jira.conf = {}))[bid] = conf;
                } catch (e) {
                  conf = null;
                  boardNote =
                    "This board's own filter and columns could not be read (" +
                    String((e && e.message) || e).slice(0, 160) +
                    '), so its project was searched instead.';
                }
              }
              if (conf && !conf.filter)
                boardNote =
                  "This board's saved filter could not be used as it came, so its project was searched for the statuses in its columns.";
              const got = {
                ...(await searchJira(
                  claude,
                  { ...body, board: bd ? bid : 0, project: body.project || (bd && bd.project) || '' },
                  (jira.quick && jira.quick.list) || [],
                  60,
                  conf,
                )),
                boardNote,
                board: bd ? bd.name : '',
              };
              jira.site = got.site || jira.site || '';
              jira.filters = got.filters;
              jira.last = got;
              {
                const who = [...new Set(got.issues.map((x) => x.assignee).filter(Boolean))];
                if (got.filters.mine && who.length === 1) jira.me = who[0];
              }
              for (const x of got.issues)
                if (!x.avatar && jira.faces && jira.faces[x.assignee] && jira.faces[x.assignee].avatar)
                  x.avatar = jira.faces[x.assignee].avatar; // a picture that was looked up before goes on at once
              for (const x of got.issues) {
                const all = jira.statuses || (jira.statuses = []);
                if (x.status && !all.some((y) => y.name.toLowerCase() === x.status.toLowerCase()))
                  all.push({ name: x.status, category: x.category });
              }
              await save();
              return json(res, 200, { ...got, statuses: jira.statuses, me: jira.me || '' });
            }
            // ONE TICKET, and the three things the customer can do to it from the board. A status seen anywhere (a ticket's own, or one it
            // can move to) is remembered, so the board can offer a column that happens to be empty.
            const know = (name, category) => {
              if (!name) return;
              const all = jira.statuses || (jira.statuses = []);
              const had = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
              if (had) {
                if (category) had.category = category;
              } else all.push({ name, category: category || '' });
              if (all.length > 40) all.shift();
            };
            const patch = (key, o) => {
              const x = jira.last && jira.last.issues.find((i) => i.key === key);
              if (x) Object.assign(x, o);
            };
            if (route === '/api/jira/issue') {
              const got = await jiraIssue(claude, body.key);
              know(got.status, got.category);
              for (const t of got.transitions) know(t.to, '');
              patch(got.key, {
                status: got.status,
                category: got.category,
                summary: got.summary,
                assignee: got.assignee,
              });
              await save();
              return json(res, 200, got);
            }
            if (route === '/api/jira/move') {
              const got = await jiraMove(claude, body.key, body.to);
              know(got.status, got.category);
              patch(got.key, { status: got.status, category: got.category, since: Date.now(), updated: Date.now() });
              await save();
              return json(res, 200, got);
            }
            if (route === '/api/jira/comment') return json(res, 200, await jiraComment(claude, body.key, body.text));
            // THE PEOPLE'S PICTURES, for the board that was last read. The search names each assignee without a picture, so the ones still
            // missing are looked up once and kept: a month for a picture, a day for "none", so nobody is asked about on every read.
            if (route === '/api/jira/faces') {
              const issues = (jira.last && jira.last.issues) || [];
              const kept = jira.faces || (jira.faces = {});
              const good = (c) => !!c && Date.now() - c.at < (c.avatar ? 30 : 1) * 86400000;
              const need = [];
              for (const x of issues)
                if (x.assignee && !x.avatar && !good(kept[x.assignee]) && !need.some((n) => n.name === x.assignee))
                  need.push({ name: x.assignee, key: x.key });
              let note = '';
              if (need.length) {
                const got = await jiraFaces(claude, need);
                note = got.note;
                for (const n of need)
                  if (n.name in got.faces) kept[n.name] = { avatar: got.faces[n.name], at: Date.now() };
              }
              const faces = {};
              for (const x of issues) {
                if (!x.avatar && kept[x.assignee] && kept[x.assignee].avatar) x.avatar = kept[x.assignee].avatar;
                if (x.assignee && x.avatar) faces[x.assignee] = x.avatar;
              }
              await save();
              return json(res, 200, { faces, asked: need.length, note });
            }
            if (route === '/api/jira/take') {
              const got = await jiraTake(claude, body.key);
              if (got.assignee && got.assignee !== 'You') jira.me = got.assignee;
              patch(got.key, { assignee: got.assignee, updated: Date.now() });
              await save();
              return json(res, 200, { ...got, me: jira.me || '' });
            }
            // A TICKET'S PICTURES AND VIDEO, LOOKED AT. The page names the ticket and its attachments (as the ticket's own read gave them);
            // the connector is asked for a short-lived address for each picture and video, the runner fetches them itself, and the team
            // looks. What it saw is kept with the ticket, so opening it again does not fetch and look again.
            if (route === '/api/jira/media') {
              const key = String(body.key || '')
                .toUpperCase()
                .replace(/[^A-Z0-9_-]/g, '')
                .slice(0, 40);
              const atts = (Array.isArray(body.files) ? body.files : [])
                .filter((a) => a && /^\d{1,18}$/.test(String(a.id || '')) && kindOf(a.name, a.type))
                .slice(0, 6);
              if (!key || !atts.length) return json(res, 200, { key: key, media: [], note: '' });
              const sig = atts.map((a) => a.id).join(',') + '|' + (runner.disk.engine ? runner.disk.engine.kind : '');
              const kept = (jira.media || (jira.media = {}))[key];
              if (kept && kept.sig === sig && kept.list.some((m) => m.ok))
                return json(res, 200, { key: key, media: kept.list, note: mediaNote(kept.list), kept: true });
              if (!runner.disk.session || !runner.disk.engine)
                return json(res, 400, { error: 'Start your team first: it needs a mind to look with.' });
              const { links } = await jiraMediaLinks(claude, key, atts);
              const dir = path.join(mediaDir, 'jira', key);
              const files = [];
              const missed = [];
              await rm(dir, { recursive: true, force: true }).catch(() => {});
              for (const a of atts) {
                const l = links.find((x) => x.id === String(a.id));
                const kind = kindOf(a.name, a.type);
                const name = String(a.name).slice(0, 120);
                if (!l) {
                  missed.push({ name, kind, ok: false, says: '', why: 'Jira gave no address to fetch it from' });
                  continue;
                }
                const got = await fetchMedia({
                  url: l.url,
                  dest: path.join(dir, l.id + '-' + safeName(name)),
                  kind,
                  max: (kind === 'video' ? 150 : 25) * 2 ** 20,
                });
                if (got.ok) files.push({ name, kind, file: got.file });
                else missed.push({ name, kind, ok: false, says: '', why: got.why });
              }
              const list = [
                ...(files.length ? await runner.lookAt(files, String(body.about || '').slice(0, 800), dir) : []),
                ...missed,
              ];
              jira.media[key] = { at: Date.now(), sig, list };
              for (const old of Object.keys(jira.media)
                .sort((x, y) => jira.media[y].at - jira.media[x].at)
                .slice(24))
                delete jira.media[old];
              await save();
              return json(res, 200, { key: key, media: list, note: mediaNote(list) });
            }
            if (route === '/api/jira/attach') return json(res, 200, await jiraAttach(claude, body.key, body.files));
            jira.projects = await jiraProjects(claude);
            jira.site = jira.projects.site || jira.site || '';
            await save();
            return json(res, 200, jira.projects);
          } catch (e) {
            return json(res, 502, { error: String((e && e.message) || e).slice(0, 300) });
          } finally {
            jiraBusy--;
            done();
          }
        }
        return json(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && route === '/api/cancel') {
        if (!busy) return json(res, 200, { ok: true, idle: true });
        runner.cancelled = true;
        if (runner.seeCtl) runner.seeCtl.abort();
        killAll();
        stopEngine();
        eyes.rest();
        return json(res, 202, { ok: true });
      } // ends the setup under way; it clears itself as its step stops
      // CLEAR ALL: the app as it was when first started. The team is stopped. What the team did and learned on this machine is deleted:
      // its copies of repositories, its proofs, the pictures it took; the workspace it was connected to; the Jira sign-in and what was
      // read from Jira; the GitHub sign-in; and how each model was measured and has to be asked. KEPT, because they are the customer's
      // downloads and purchase, not the team's history: the engines, the models and the helpers already on this machine, and the plan
      // and any code. EVERY PAIRED PHONE IS UNPAIRED (a decision of the product): each would have to be paired again, and remote access is
      // turned off. THE MODELS GO TOO ONLY WHEN THE DIALOG'S BOX IS TICKED ({ models: true }): the models this app offers, the ones it
      // fetched for llama.cpp and the helpers (engine.mjs downloadDirs); never an engine, and never anything else in the shared model
      // cache. Nothing in the customer's own folders or on GitHub or Jira is touched. A GET says what would go, counted now.
      if (req.method === 'GET' && route === '/api/reset') {
        const bytes = await downloadsBytes(stateDir, MODELS).catch(() => 0);
        return json(res, 200, {
          phones: ((runner.disk.link || {}).devices || []).length,
          bytes,
          gb: Math.round((bytes / 2 ** 30) * 10) / 10,
          strata: !!(await strataThere().catch(() => null)),
        });
      }
      if (req.method === 'POST' && route === '/api/reset') {
        if (busy) return json(res, 409, { error: 'a setup is running' });
        const body = await bodyOf(req);
        if (body.sure !== true) return json(res, 400, { error: 'Clearing everything has to be asked for plainly.' });
        if (body.models === true && eyes.adding())
          return json(res, 409, {
            error: 'A helper is being downloaded. Cancel that first, or clear without deleting the models.',
          });
        stopEngine();
        eyes.rest();
        closeTunnel();
        await dropStrata();
        const cbin = await findClaude().catch(() => null);
        if (cbin && runner.disk.jira && Object.keys(runner.disk.jira).length) await jiraLogout(cbin).catch(() => {});
        await Promise.resolve(github.signOut()).catch(() => {});
        {
          const { rm: wipe } = await import('node:fs/promises');
          for (const d of ['work', 'proofs', 'shots', 'clips'])
            await wipe(path.join(stateDir, d), { recursive: true, force: true }).catch(() => {});
        }
        let phones = 0;
        let bytes = 0;
        for (const d of ((runner.disk.link || {}).devices || []).slice())
          await link.revoke(d.id).then(
            () => {
              phones++;
            },
            () => {},
          ); // its open connections are closed as it goes
        if (link.on()) await Promise.resolve(link.turn(false)).catch(() => {});
        if (body.models === true) {
          bytes = await downloadsBytes(stateDir, MODELS).catch(() => 0);
          await dropDownloads(stateDir, MODELS).catch(() => {});
          runner.disk.addons = {};
        }
        jiraSeen = null;
        runner.disk.jira = {};
        runner.disk.work = {};
        runner.disk.measured = {};
        runner.disk.fit = {};
        runner.disk.tune = {};
        runner.disk.connectors = [];
        delete runner.disk.strataFailed;
        delete runner.disk.mode;
        delete runner.disk.proofs;
        delete runner.disk.minds;
        checkMode = '';
        runner.disk.engine = null;
        runner.disk.session = null;
        runner.setup = null;
        runner.carry = null;
        lastJob = null;
        await save();
        push();
        return json(res, 200, {
          ok: true,
          phones,
          models: body.models === true,
          gb: Math.round((bytes / 2 ** 30) * 10) / 10,
        });
      }
      if (req.method === 'POST' && route === '/api/stop') {
        if (busy) return json(res, 409, { error: 'a setup is running' });
        stopEngine();
        sites.stopAll();
        eyes.rest();
        closeTunnel();
        await dropStrata();
        runner.disk.engine = null;
        runner.disk.session = null;
        runner.setup = null;
        runner.carry = null;
        lastJob = null;
        await save();
        push();
        return json(res, 200, { ok: true });
      }
      // THE AGENT'S DOOR TO THE MODEL. The agent (Pi) is pointed here instead of at the model server, so its requests are asked the way
      // this model has been learned to need, and a reply that breaks down part-way (a tool call that turns into one piece repeated to
      // the token limit) is cut and asked again before the agent sees any of it. A refusal by the server is passed on in its own words.
      if (route.startsWith('/api/model/v1/')) {
        const running =
          runner.disk.engine && runner.disk.engine.kind !== 'claude'
            ? { target: tgt(runner.disk.engine), key: engineKey() }
            : null;
        const server = busy && serving ? serving : running || serving;
        const oops = // while a setup is checking a model, that model; otherwise the one the team runs on
          (code, message) => json(res, code, { error: { message, type: 'runner' } });
        if (!server) return oops(503, 'no model is being served');
        const target = where(server.target);
        if (req.method === 'GET' && route === '/api/model/v1/models') {
          const r = await fetch(target.base + '/v1/models').catch(() => null);
          if (!r) return oops(502, 'the model server did not answer');
          res.writeHead(r.status, { 'content-type': 'application/json' });
          return res.end(await r.text());
        }
        if (req.method !== 'POST' || route !== '/api/model' + CHAT) return oops(404, 'not found');
        const raw = await new Promise((ok, no) => {
          let n = 0;
          const parts = [];
          req.on('data', (c) => {
            n += c.length;
            if (n > 8e6) {
              no(new Error('the request is too large'));
              req.destroy();
            } else parts.push(c);
          });
          req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
          req.on('error', no);
        });
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return oops(400, 'the request is not JSON');
        }
        const stream = body.stream === true;
        const ctl = new AbortController();
        body.model = target.model;
        res.on('close', () => {
          if (!res.writableEnded) ctl.abort();
        });
        // MADE PLAIN FOR A LOCAL MODEL. The agent's own instructions name long full paths (its manual, and the folder it is working in),
        // and its tools say a path may be "relative or absolute". A small model copies the full path into its tool call, and a long
        // unfamiliar string is exactly where one breaks down (seen: every breakdown of a 30B model in the agent check was part-way
        // through "/Users/..."). So the manual's paths are left out, the folder is given as ".", and paths are asked for relative to it.
        // The tools resolve them against the same folder, so nothing else changes.
        const plain = (s) =>
          String(s)
            .replace(/<docs>[\s\S]*?<\/docs>\s*/g, '')
            .replace(
              /<cwd>[\s\S]*?<\/cwd>/g,
              '<cwd>\n.\n</cwd>\nEvery path you give is relative to this folder. Write numbers.txt or src/app.js. Never give a path that starts with "/".',
            );
        for (const m of Array.isArray(body.messages) ? body.messages : [])
          if (m && m.role === 'system') {
            if (typeof m.content === 'string') m.content = plain(m.content);
            else if (Array.isArray(m.content))
              for (const c of m.content) if (c && typeof c.text === 'string') c.text = plain(c.text);
          }
        for (const tl of Array.isArray(body.tools) ? body.tools : []) {
          const pr = tl && tl.function && tl.function.parameters && tl.function.parameters.properties;
          if (pr && pr.path && typeof pr.path.description === 'string')
            pr.path.description = pr.path.description.replace(
              /\(relative or absolute\)/,
              '(relative to the current folder)',
            );
        }
        let answer;
        try {
          answer = await tune.ask({ key: server.key, url: target.base + CHAT, body, signal: ctl.signal });
        } catch (e) {
          return oops(502, 'the model server did not answer: ' + String((e && e.message) || e).slice(0, 160));
        }
        if (!answer.ok && !answer.broke) {
          let said = String(answer.error || 'refused');
          try {
            said = JSON.parse(said).error.message || said;
          } catch {
            /* its own words, as they came */
          }
          return oops(answer.status >= 400 ? answer.status : 502, said);
        }
        // EVERY TRY BROKE DOWN. The agent is handed the part that was sound, marked as cut short (finish_reason "length"): an agent knows
        // that case, does not run a tool call that was cut, and tells the model so, which is one more chance at no cost. An error here
        // would only make the agent ask again the same way, several times, with nothing changed.
        if (answer.broke && ++brokeRun >= 4) {
          brokeRun = 0;
          return oops(
            400,
            "BROKE DOWN: the model's replies kept breaking down into one piece repeated without end, however they were asked.",
          );
        } // four in a row: this run of the agent is over, said in a way the agent does not ask again
        if (!answer.broke) brokeRun = 0;
        if (answer.broke) {
          const c = answer.cut || { keep: '', shape: { content: 0, call: null } };
          const sh = c.shape || { content: 0, call: null };
          const said = c.keep.slice(0, sh.call ? sh.content : c.keep.length);
          const args = sh.call ? c.keep.slice(sh.content) : '';
          const delta = {
            role: 'assistant',
            ...(said ? { content: said } : {}),
            ...(sh.call
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: sh.call.id || 'call_cut',
                      type: 'function',
                      function: { name: sh.call.name || 'unknown', arguments: args },
                    },
                  ],
                }
              : {}),
          };
          if (!stream)
            return json(res, 200, {
              id: 'chatcmpl-cut',
              object: 'chat.completion',
              model: target.model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: said || null,
                    ...(delta.tool_calls ? { tool_calls: delta.tool_calls.map(({ index, ...k }) => k) } : {}),
                  },
                  finish_reason: 'length',
                },
              ],
            });
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
          res.write(
            'data: ' +
              JSON.stringify({
                id: 'chatcmpl-cut',
                object: 'chat.completion.chunk',
                model: target.model,
                choices: [{ index: 0, delta, finish_reason: null }],
              }) +
              '\n\n',
          );
          res.write(
            'data: ' +
              JSON.stringify({
                id: 'chatcmpl-cut',
                object: 'chat.completion.chunk',
                model: target.model,
                choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
              }) +
              '\n\ndata: [DONE]\n\n',
          );
          return res.end();
        }
        if (stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
          for (const ev of answer.events) res.write('data: ' + ev + '\n\n');
          return res.end();
        }
        // asked for in one piece: the pieces put back together
        const msg = { role: 'assistant', content: '' };
        const calls = [];
        let finish = 'stop';
        let id = 'chatcmpl-runner';
        for (const ev of answer.events) {
          let j;
          try {
            j = JSON.parse(ev);
          } catch {
            continue;
          }
          if (j.id) id = j.id;
          const c = j.choices && j.choices[0];
          if (!c) continue;
          if (c.finish_reason) finish = c.finish_reason;
          const d = c.delta || {};
          if (d.content) msg.content += d.content;
          for (const tc of d.tool_calls || []) {
            const k = tc.index || 0;
            const at = calls[k] || (calls[k] = { id: '', type: 'function', function: { name: '', arguments: '' } });
            if (tc.id) at.id = tc.id;
            if (tc.function && tc.function.name) at.function.name = tc.function.name;
            if (tc.function && tc.function.arguments) at.function.arguments += tc.function.arguments;
          }
        }
        if (calls.length) {
          msg.tool_calls = calls.filter(Boolean);
          if (!msg.content) msg.content = null;
        }
        return json(res, 200, {
          id,
          object: 'chat.completion',
          model: target.model,
          choices: [{ index: 0, message: msg, finish_reason: finish }],
          usage: answer.usage || undefined,
        });
      }
      // WHAT KIND OF MESSAGE the customer sent (talk.mjs): by its own words when they settle it, by one short question to the model when
      // they do not. It decides who answers and what the team does: talk, answer, find out, look at something, or build.
      if (req.method === 'POST' && route === '/api/route') {
        const b = await bodyOf(req);
        const text = String(b.text || '').slice(0, 2000);
        const simple = b.simple === true;
        const guess = guessRoute(text, { simple });
        if (guess.sure || !runner.disk.engine) return json(res, 200, { ...guess, by: 'words' });
        try {
          let said = '';
          await runner.reply({
            system: 'You sort messages. You answer with one line and nothing else.',
            messages: [{ role: 'user', content: ROUTE_ASK(text, simple) }],
            maxTokens: 40,
            temperature: 0,
            onText: (d) => {
              said += d;
            },
            onReset: () => {
              said = '';
            },
          });
          const m = parseRoute(said);
          if (m)
            return json(res, 200, {
              ...guess,
              kind: m.kind,
              seat: simple
                ? guessRoute(text, { simple }).seat === 'ask' || m.kind === 'draw'
                  ? 'ask'
                  : m.kind === 'research'
                    ? 'operations'
                    : 'overseer'
                : m.seat || seatFor(text, m.kind),
              language: m.language,
              sure: true,
              by: 'model',
            });
        } catch {
          /* the words decide */
        }
        return json(res, 200, { ...guess, by: 'words' });
      }
      // THE SEATS' TOOLS (web.mjs, shot.mjs, eyes.mjs): search the web, read a page, take a picture of a page or of an application's
      // window, and have a picture read by the add-on model. Each
      // is one request from the app's own page, made because of what the customer asked, and each is shown in the chat.
      if (req.method === 'POST' && route === '/api/tool') {
        const body = await bodyOf(req);
        const tool = String(body.tool || '');
        const self = [port, (runner.disk.link && runner.disk.link.port) || 0];
        const own = body.own === true;
        if (tool === 'search') return json(res, 200, await search(String(body.q || '')));
        // a picture for each named thing a card is about (web.mjs picture): at most seven
        if (tool === 'picture') {
          const names = (Array.isArray(body.names) ? body.names : []).map((x) => String(x)).slice(0, 7);
          const pictures = [];
          for (const name of names) pictures.push(await picture(name, String(body.hint || ''))); // one after another: the search is a shared service
          return json(res, 200, { ok: true, pictures });
        }
        if (tool === 'read') return json(res, 200, await readPage(String(body.url || ''), { own, selfPorts: self }));
        if (tool === 'shot') {
          const id = randomBytes(6).toString('hex');
          const file = path.join(shotDir, id + '.png');
          let r;
          if (body.url) {
            let href;
            try {
              href = await allowed(String(body.url), { own, selfPorts: self });
            } catch (e) {
              return json(res, 200, { ok: false, why: e.message });
            }
            r = await shotPage({ url: href, file, profile: path.join(shotDir, '.profile-' + id) });
          } else r = await shotApp({ app: String(body.app || '').slice(0, 40), file });
          return json(res, 200, r.ok ? { ok: true, id, whole: !!r.whole } : { ok: false, why: r.why });
        }
        if (tool === 'draw' || tool === 'film') {
          // something MADE by a helper (eyes.mjs): a picture, or a short clip, kept with the pictures the team takes
          const prompt = String(body.prompt || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 600);
          if (!prompt) return json(res, 200, { ok: false, why: 'say what to ' + (tool === 'film' ? 'film' : 'draw') });
          const id = randomBytes(6).toString('hex');
          const ref = /^[a-f0-9]{12}$/.test(String(body.ref || '')) ? path.join(shotDir, body.ref + '.png') : '';
          await mkdir(shotDir, { recursive: true });
          const r = await eyes.make(tool, { prompt, ref, out: path.join(shotDir, id) });
          return json(
            res,
            200,
            r.ok
              ? { ok: true, id, type: r.type, seconds: r.seconds, by: r.by }
              : { ok: false, none: !!r.none, why: r.why },
          );
        }
        if (tool === 'see') {
          // a picture that was taken, read by the add-on model (eyes.mjs). Without one it says so, and the seat says what it could not see
          if (!/^[a-f0-9]{12}$/.test(String(body.shot || '')))
            return json(res, 200, { ok: false, why: 'that is not a picture that was taken' });
          return json(
            res,
            200,
            await eyes.see({
              file: path.join(shotDir, body.shot + '.png'),
              ask: String(body.ask || '').slice(0, 1500),
              max: Math.min(700, Math.max(60, Number(body.max) || 420)),
            }),
          );
        }
        return json(res, 400, { error: 'no such tool' });
      }
      if (req.method === 'GET' && /^\/api\/clip\/[a-f0-9]{12}$/.test(route)) {
        // a clip a helper made: a WebM where the engine wrote one, else an AVI to open as a file
        for (const [ext, type] of [
          ['webm', 'video/webm'],
          ['avi', 'video/x-msvideo'],
        ]) {
          const buf = await readFile(path.join(shotDir, route.slice(10) + '.' + ext)).catch(() => null);
          if (buf) {
            res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' });
            return res.end(buf);
          }
        }
        return json(res, 404, { error: 'that clip is no longer kept' });
      }
      if (req.method === 'GET' && /^\/api\/proof\/[a-f0-9]{12}\.png$/.test(route)) {
        // a proof image, kept in this app's own folder
        try {
          const buf = await readFile(path.join(stateDir, 'proofs', route.slice(11, 23), 'proof.png'));
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' });
          return res.end(buf);
        } catch {
          return json(res, 404, { error: 'that proof image is no longer kept' });
        }
      }
      if (req.method === 'GET' && /^\/api\/shot\/[a-f0-9]{12}$/.test(route)) {
        try {
          const buf = await readFile(path.join(shotDir, route.slice(10) + '.png'));
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' });
          return res.end(buf);
        } catch {
          return json(res, 404, { error: 'that picture is no longer kept' });
        }
      }
      if (req.method === 'POST' && route === '/api/minds') {
        // { seat: one of the five, or 'all', model?, effort? }
        const b = await bodyOf(req);
        const v = await runner.mindsView();
        const who = b.seat === 'all' ? SEAT_IDS : SEAT_IDS.includes(b.seat) ? [b.seat] : null;
        if (!v.on)
          return json(res, 400, {
            error: 'A model and an effort are chosen by seat when the team runs on Claude Code.',
          });
        if (!who) return json(res, 400, { error: 'There is no seat called that.' });
        if (b.model !== undefined && !v.models.some((x) => x.id === b.model))
          return json(res, 400, { error: 'This Claude Code does not offer that model.' });
        if (b.effort !== undefined && !v.efforts.some((x) => x.id === b.effort))
          return json(res, 400, { error: 'This Claude Code does not offer that effort.' });
        runner.disk.minds = runner.disk.minds || {};
        for (const id of who)
          runner.disk.minds[id] = {
            model: b.model !== undefined ? b.model : v.seats[id].model,
            effort: b.effort !== undefined ? b.effort : v.seats[id].effort,
          };
        await save();
        return json(res, 200, await runner.mindsView());
      }
      if (req.method === 'POST' && (route === '/api/chat' || route === '/api/seat')) {
        // /api/chat: one line to the model. /api/seat: a seat of the team speaking, with its persona as the system line and the recent chat as context.
        const body = await bodyOf(req);
        const seat = route === '/api/seat';
        const system = seat
          ? String(body.system || '').slice(0, 4000)
          : "You are the model behind a Family Office team, answering its customer in the quick check on the Start page. Answer plainly, in at most four sentences. You have the tools and connectors of this machine's Claude Code. If you are asked to connect to or act in another system, such as Jira or GitHub, look at what you actually have, and say plainly what you found and what is missing.";
        const messages = seat
          ? (Array.isArray(body.messages) ? body.messages : [])
              .slice(-12)
              .map((m) => ({
                role: m && m.role === 'assistant' ? 'assistant' : 'user',
                content: String((m && m.content) || '').slice(0, 40000),
              }))
              .filter((m) => m.content)
          : [{ role: 'user', content: String(body.text || '').slice(0, 4000) }];
        if (!runner.disk.engine) return json(res, 400, { error: 'no model is running' });
        if (!messages.length || !messages[messages.length - 1].content.trim())
          return json(res, 400, { error: 'say something' });
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        const ctl = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) ctl.abort();
        });
        try {
          const use =
            seat && body.use && typeof body.use === 'object'
              ? { web: body.use.web === true, shot: String(body.use.shot || '') }
              : null;
          const r = await runner.reply({
            system,
            messages,
            signal: ctl.signal,
            seat: seat ? String(body.seat || '').slice(0, 20) : '',
            maxTokens: seat ? Math.min(700, Math.max(60, Number(body.max) || 260)) : 512,
            customer: seat ? String(body.customer || '').slice(0, 800) : String(body.text || '').slice(0, 800),
            lang: String(body.lang || '').slice(0, 30),
            use,
            temperature:
              seat && TEMPER[String(body.seat || '')]
                ? Math.round((0.55 + TEMPER[String(body.seat)].warmth * 0.3) * 100) / 100
                : 0.7,
            onText: (d) => res.write('data: ' + JSON.stringify({ text: d }) + '\n\n'),
            onReset: (t) => res.write('data: ' + JSON.stringify({ reset: t || '' }) + '\n\n'),
          });
          res.write('data: ' + JSON.stringify({ done: true, ...r }) + '\n\n');
        } catch (e) {
          res.write('data: ' + JSON.stringify({ error: String((e && e.message) || e).slice(0, 200) }) + '\n\n');
        }
        return res.end();
      }
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      return json(res, 400, { error: String((e && e.message) || e).slice(0, 200) });
    }
  };
}
