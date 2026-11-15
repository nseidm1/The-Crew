// plans.mjs - WHAT A SETUP WOULD INSTALL, said before anything is installed: each thing, the command that puts it there, where it
// comes from, and what stops it on this machine. The Start page lists exactly this above the button that does it.
import { installRoute } from '../engine.mjs';
import { AGENT, ENGINE, LLAMA, STRATA, llamaBuild, llamaCardBuild } from '../../js/catalog.js';
import { PLATFORM } from '../host.mjs';

export function planFor(model, machine, sized) {
  // exactly what setup would do, in the engine's and npm's own words, shown BEFORE anything runs
  const plan = [];
  const way = installRoute(machine.tools);
  if (way.route === 'signed')
    plan.push({
      what: 'Install ' + ENGINE.name,
      command:
        'curl -fsSL ' +
        ENGINE.site +
        '/install.sh | sh    (a signed release into ~/.tensorfold; your shell profile is not changed)',
      from: ENGINE.site,
    });
  if (way.route === 'brew')
    plan.push({
      what: 'Install ' + ENGINE.name,
      command: 'brew tap ' + ENGINE.tap + ' && brew install ' + ENGINE.formula,
      from: ENGINE.site,
      note:
        "Homebrew builds it, which needs Apple's Command Line Tools" +
        (machine.tools.clt && machine.tools.clt.version
          ? ' (' + machine.tools.clt.version + ' here)'
          : ', and macOS has no record of which version is here') +
        '. Setup checks, and shows you what to do if they are too old.',
    });
  if (way.route === 'own')
    plan.push({
      what: 'Fetch Homebrew, then install ' + ENGINE.name,
      command:
        "Homebrew's own files into this app's folder (no password, and nothing else on this machine is changed), then: brew tap " +
        ENGINE.tap +
        ' && brew install ' +
        ENGINE.formula,
      from: 'github.com/Homebrew/brew, then ' + ENGINE.site,
      note:
        'There is no Homebrew on this machine, so setup uses a copy of its own. A Homebrew in its own folder builds what it installs here, which takes longer' +
        " and needs Apple's Command Line Tools. Homebrew publishes no checksum for its files: they come over https from its own repository.",
    });
  if (way.route === 'none')
    plan.push({
      what: 'Install ' + ENGINE.name,
      command: 'not possible yet',
      from: ENGINE.site,
      blocked: way.fix.title,
      fix: way.fix,
    });
  if (!(sized && sized.cached))
    plan.push({
      what: 'Download ' + model.name,
      command:
        'tensorfold pull ' +
        model.repo +
        (model.rev ? '@' + model.rev.slice(0, 8) : '') +
        (model.drafter ? ' (and its drafter, ' + model.drafter + ')' : ''),
      from: 'huggingface.co/' + model.repo,
      size: sized ? sized.gb + ' GB' : 'about ' + model.estGb + ' GB (not yet read)',
    });
  if (!machine.tools.agent)
    plan.push({
      what: 'Install ' + AGENT.name,
      command: 'npm install --prefix .runner/pi --ignore-scripts ' + AGENT.pkg,
      from: 'registry.npmjs.org',
      blocked: machine.tools.node
        ? ''
        : 'needs Node.js ' +
          AGENT.node.join('.') +
          ' or newer (found: ' +
          (machine.tools.nodeSeen.join(', ') || 'none') +
          ')',
    });
  return plan;
}

// what setting a Strata model up would do, in Strata's own commands, shown BEFORE anything runs. The size is not guessed: Strata's
// own plan says it, for this machine, as the second step of the setup.
export const strataPlan = (m, machine) => [
  ...(machine.tools.engine
    ? []
    : [
        {
          what: 'Install ' + STRATA.name,
          command: STRATA.install,
          from: 'github.com/Niko1221/Strata',
          note: 'Its own installer, into your own folders. It asks for no password.',
        },
      ]),
  {
    what: 'Download and start ' + m.name,
    command: 'strata launch --family ' + m.family + ' --model ' + m.pack + ' --context 32k --yes --no-tui',
    from: STRATA.name,
    size: STRATA.name + ' says how much before it downloads',
    note: "On a port of this app's own, beside any model you already run with Strata.",
  },
  ...(machine.tools.agent
    ? []
    : [
        {
          what: 'Install ' + AGENT.name,
          command: 'npm install --prefix .runner/pi --ignore-scripts ' + AGENT.pkg,
          from: 'registry.npmjs.org',
          blocked: machine.tools.node
            ? ''
            : 'needs Node.js ' +
              AGENT.node.join('.') +
              ' or newer (found: ' +
              (machine.tools.nodeSeen.join(', ') || 'none') +
              ')',
        },
      ]),
];

// what setting a llama.cpp model up would do, shown BEFORE anything runs: the engine's own build (only when the machine has none),
// and the model's one file. Both are pinned, so the sizes are exact.
export const llamaPlan = (model, machine) => {
  const b = llamaBuild(PLATFORM, machine.arch);
  return [
    ...(machine.tools.llama || !b
      ? []
      : [
          {
            what: 'Fetch ' + LLAMA.name,
            command:
              'curl -L -O ' +
              LLAMA.site +
              '/releases/download/' +
              LLAMA.tag +
              '/' +
              b.asset +
              ' && tar -xzf ' +
              b.asset,
            from: 'github.com/ggml-org/llama.cpp',
            size: Math.round(b.bytes / 2 ** 20) + ' MB',
            note:
              'Its own build ' +
              LLAMA.tag +
              ' for this machine, kept only if its SHA-256 begins ' +
              b.sha256.slice(0, 12) +
              ", and unpacked into this app's own folder. Nothing else on the machine changes, and it asks for no password." +
              (llamaCardBuild(PLATFORM, machine.arch)
                ? ' Where this machine has a graphics card, the build that uses it (' +
                  llamaCardBuild(PLATFORM, machine.arch).asset +
                  ', ' +
                  Math.round(llamaCardBuild(PLATFORM, machine.arch).bytes / 2 ** 20) +
                  ' MB) is fetched first and kept if the card answers; this one is fetched only if it does not.'
                : ''),
          },
        ]),
    ...(model.cached
      ? []
      : [
          {
            what: 'Download ' + model.name,
            command: 'curl -L -O https://huggingface.co/' + model.repo + '/resolve/' + model.rev + '/' + model.file,
            from: 'huggingface.co/' + model.repo,
            size: model.sizeGb + ' GB',
            note:
              'Pinned to revision ' +
              model.rev.slice(0, 8) +
              ', and kept only if its SHA-256 is the one that page lists. A download that stops carries on from where it stopped.',
          },
        ]),
    ...(machine.tools.agent
      ? []
      : [
          {
            what: 'Install ' + AGENT.name,
            command: 'npm install --prefix .runner/pi --ignore-scripts ' + AGENT.pkg,
            from: 'registry.npmjs.org',
            blocked: machine.tools.node
              ? ''
              : 'needs Node.js ' +
                AGENT.node.join('.') +
                ' or newer (found: ' +
                (machine.tools.nodeSeen.join(', ') || 'none') +
                ')',
          },
        ]),
  ];
};
