// catalog.js - the engine, the agent and the models Start can offer. Shared by the browser pages and the local runner (runner/*.mjs).
// Every repo, revision and "scope" line is copied from TensorFold's own README ("Pick a model"). estGb is a size ESTIMATE (about 0.6 GB
// per billion parameters at 4 bits) used only until the runner reads the real download size from Hugging Face.
//
// plain, badge and can are what the Start page draws for a person choosing: one friendly sentence, the tag on the card, and what to
// expect of it (0 to 3 for talking, finding things out and changing code; null where we have not tried it).
//
// active is how many billion parameters work on each token: all of them in a dense model, a few in the A3B / A2B kind (read from the
// model's name, not measured). The avatars on the Start page draw it.
//
// did / agent / use are THE RECORD: what local models of that family and size actually did on Family Office's own system, read from its
// ledgers on 11 Nov 2026 (the figures and the files they were read from are kept with that system, not in this repository). Three cautions travel with it:
// the record is from our hardware and our builds, not the customer's Mac; "accepted" means the system's own check took the answer, not
// that a person graded it; and the agent samples are small. Where we never ran a model, the entry says so. The customer's own machine
// replaces all of it with its measured speed and agent check once a model is set up.
export const ENGINE = {
  name: 'TensorFold',
  site: 'https://tensorfold.dev',
  tap: 'ashhart/tensorfold',
  formula: 'ashhart/tensorfold/tensorfold',
  minMacos: [13, 3],
};
export const AGENT = { name: 'Pi', pkg: '@earendil-works/pi-coding-agent', node: [22, 19] };
export const SERVED_NAME = 'fo-local';
export const RECORD = {
  when: '10 Oct to 11 Nov 2026',
  summary:
    'On our own system, local models earn their place on narrow jobs that can be checked: sorting, yes-or-no checks, commit messages and mechanical build steps, where nearly every answer was accepted. Left to work alone as an agent the record is thin and mostly failing: a 27B model passed 4 of 19 test-writing jobs and 1 of 4 fixes. So the team gives a local model one judged step at a time, and nothing it writes lands unproven.',
  caution:
    'From our own hardware and our own model builds, not a Mac. "Accepted" means the system\'s check took the answer. Start measures your machine and replaces this.',
};

export const MODELS = [
  {
    id: 'qwen38-27b',
    name: 'Qwen3.8-27B',
    family: 'Qwen',
    size: 'Large',
    params: 27,
    active: 27,
    quant: 'MLX 4-bit',
    estGb: 17,
    repo: 'TensorFold/Qwen3.8-27B-MLX-4bit',
    rev: null,
    drafter: 'z-lab/Qwen3.8-27B-DFlash2',
    tier: 'Most capable here',
    basis: 'We ran this family and size, in a coder build',
    badge: 'Most capable',
    plain: 'The strongest thinker here. It puts all of itself into every word, so it is also the slowest to answer.',
    can: { talk: 3, find: 3, code: 2 },
    runs: 'Every one of its 27B parameters works on every token: the stronger thinker of the two, and the slower to reply. A small drafter speeds it up.',
    did: 'Yes-or-no checks: 329 of 339 accepted. Commit messages: 104 of 129. Mechanical build steps: 39 of 41.',
    agent:
      'Thin and mostly failing: 4 of 19 test-writing jobs and 1 of 4 fixes passed their judge, and none of 9 whole runs was accepted.',
    use: 'One checkable step at a time, never a whole task. Its work is always judged.',
    scope: 'One Mac (M5 Max and M3 Ultra checked). A 32 GB Mac needs its GPU memory limit raised.',
  },
  {
    id: 'nemotron35-30b',
    name: 'Nemotron 3.5 Lightning 30B',
    family: 'Nemotron',
    size: 'Large',
    params: 30,
    active: 3,
    quant: 'MLX 4-bit',
    estGb: 18,
    repo: 'TensorFold/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-MLX-4bit',
    rev: null,
    drafter: null,
    tier: 'Measured through this app',
    basis: 'We ran this model, through this app, on an Apple M2 Ultra with 64 GB',
    badge: 'Fast, and tested',
    plain:
      'A big model that answers fast: it uses about a tenth of itself for each word. It is the one this app has been exercised on the most.',
    can: { talk: 2, find: 2, code: 2 },
    runs: 'Holds a 30B model but runs about 3B of it per token (the A3B in its name). Measured at about 140 tokens a second on an M2 Ultra.',
    did: 'The agent check: 6 of 6 jobs (files, Python, Android, Swift), usually on its own. Asked for a change from a ticket, the code was right in every run we read. Its proof was green on the first round in about two runs in three; the team goes round again for the rest.',
    agent:
      'It does a whole small change by itself. It writes a file as text far more reliably than through tools, so its proofs are asked for as text, and it gets arithmetic in a check wrong often enough that every failing check is weighed before the code is blamed.',
    use: 'One change at a time, each proven before it lands. It holds 16,384 tokens at once, so name the file and the thing to change.',
    scope:
      "One Mac, M1 to M5 (M2 Ultra with 64 GB checked). Served without the engine's drafts: with them its replies broke down into repetition.",
  },
  // SHELVED (console 2026-11-12): not offered in Developer. The work goes into the two large models above. Simple may still use one.
  {
    id: 'lfm25-24b',
    shelved: true,
    name: 'LFM2.5-24B',
    family: 'LFM',
    size: 'Medium',
    params: 24,
    active: 2,
    quant: 'MLX 4-bit',
    estGb: 14,
    repo: 'LiquidAI/LFM2.5-24B-A2B-MLX-4bit',
    rev: '667408d494bde191c2cb9dd4f4549827816b9275',
    drafter: null,
    tier: 'No record yet',
    basis: 'We have never run this model',
    badge: 'New to us',
    plain: 'The lightest of the three big ones, and quick for the same reason: a small part of it works on each word.',
    can: { talk: null, find: null, code: null },
    runs: 'A 24B model that runs about 2B of itself per token (the A2B in its name): the lightest of the three large ones.',
    did: 'None. We have run neither this model nor one like it.',
    agent: 'Unknown. The agent check on your machine will be the first evidence.',
    use: 'Treat it as untested until Start has measured it here.',
    scope: 'One Mac (M4 Pro checked).',
  },
  {
    id: 'qwen35-2b',
    shelved: true,
    name: 'Qwen3.5-2B',
    family: 'Qwen',
    size: 'Small',
    params: 2,
    active: 2,
    quant: 'MLX 4-bit',
    estGb: 1.5,
    repo: 'mlx-community/Qwen3.5-2B-MLX-4bit',
    rev: '93760be4f1f69842a46bc13dbdc0f19e291392a3',
    drafter: null,
    tier: 'Helper',
    basis: 'We ran models of this size, from an older Qwen',
    badge: 'Starter',
    plain: 'Small enough to start in seconds. Good for a first try and for simple sorting, not for real work.',
    can: { talk: 1, find: 1, code: 0 },
    runs: 'Small enough to load in seconds and leave almost all of the machine free.',
    did: 'Sorting and triage: 8,133 of 8,222 accepted. Yes-or-no checks: 402 of 402. Small one-step tasks: 12 to 22 of 30, better with size.',
    agent: 'We never use a model this small as an agent. Asked to rewrite a whole function, it managed 0 of 44.',
    use: 'Reading, sorting and routing only. The quickest way to see Start work.',
    scope: "One Mac (M5 Max checked). TensorFold's own quick start.",
  },
];

// ADD-ONS: a second, small model beside the one the team thinks with, for one job that model cannot do. It is not a choice of mind: it
// is added or left out whatever the team runs on. Every figure here is copied from the model's own page on Hugging Face at the pinned
// revision: each file's size and SHA-256 (the runner refuses a file that does not match), the license, and what serves it. A GGUF is
// served by llama.cpp, not by TensorFold, so adding one installs that too.
const DIFFUSION = {
  kind: 'release',
  name: 'stable-diffusion.cpp',
  site: 'https://github.com/leejet/stable-diffusion.cpp',
  tag: 'master-1086-465adf3',
  asset: 'sd-master-465adf3-bin-Darwin-macOS-26.7.2-arm64.zip',
  bytes: 38089008,
  sha256: 'f04c897e127fa1f0afa5cf5a0e182804c84c796df5008f5f2706339afa0ed0c9',
}; // its macOS release, pinned
export const ADDONS = [
  {
    id: 'lfm3-omni-2b',
    kind: 'see',
    name: 'LFM3-Omni-2B',
    maker: 'Liquid AI',
    params: 1.7,
    quant: 'GGUF, 4-bit',
    role: 'Reads pictures',
    tick: 'Let it see pictures',
    hint: 'Adds a small helper that reads screenshots, so your team can check how a page looks.',
    repo: 'LiquidAI/LFM3-Omni-2B-GGUF',
    rev: 'd508b88f08a5b4286f2d2805a6a8d69a0ff44c72',
    served: 'fo-eyes',
    context: 16384,
    files: [
      {
        part: 'model',
        name: 'LFM3-Omni-2B-Q4_K_M.gguf',
        bytes: 1099630080,
        sha256: '9f8d30e9d4fd7a9349d586e077988229b3ca0a0e4ad730897563d1eccc9893e2',
      },
      {
        part: 'projector',
        name: 'mmproj-LFM3-Omni-2B-Q8_0.gguf',
        bytes: 506842528,
        sha256: '8a25f9d1931244429de404fccacfb7fb933970a36aa5688d2f5069f29c6b27b1',
      }, // the pairing its own page gives
    ],
    engine: {
      kind: 'brew',
      name: 'llama.cpp',
      formula: 'llama.cpp',
      site: 'https://github.com/ggml-org/llama.cpp',
      min: [0, 8, 0],
      minBuild: 11960,
    },
    license: {
      name: 'LFM Open License v1.0',
      href: 'https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/blob/main/LICENSE',
      says: 'Free to use, commercially too, for a person or company with under $10 million a year in revenue. Above that it is not licensed for commercial use, and Liquid AI licenses it separately.',
    },
    what: 'A local model reads words, not pictures. This one reads pictures, and tells your team what is on them.',
    qa: "When a seat takes a picture of a page or an app, this model reads it: the layout, the words on it, and what looks cut off, overlapping or empty. The seats judge from that and from the page's own words.",
    research:
      'A source that is a picture, or a page with almost no words in it (a chart, a diagram, a page drawn by scripts), is drawn and read the same way instead of being skipped.',
    limits:
      'It is small. It can misread small type, and it describes rather than judges: the seats do the judging, and say when a detail rests on its reading alone.',
    basis:
      'We have never run this model. The check on your machine, reading a number off a test picture, is the first evidence.',
    unused: 'It also takes sound and video. Your team does not use those yet.',
  },
  // PICTURES AND VIDEO, MADE. These run on stable-diffusion.cpp, whose own pages give the files each needs and the command that runs
  // it (docs/flux2.md, docs/wan.md). Every file is pinned to a revision with its size and SHA-256. Where the maker's own
  // repository is gated behind a sign-in, an open copy of the same file is used and named here.
  {
    id: 'flux2-klein-4b',
    kind: 'draw',
    name: 'FLUX.2 klein 4B',
    maker: 'Black Forest Labs',
    params: 4,
    quant: 'GGUF, 4-bit',
    role: 'Makes pictures',
    tick: 'Let it make pictures',
    hint: 'Adds a model that draws from words: a mock-up, an icon, a placeholder picture.',
    repo: 'black-forest-labs/FLUX.2-klein-4B',
    engine: DIFFUSION,
    room: 2,
    minutes: 10,
    args: ['--cfg-scale', '1.0', '--steps', '4'],
    size: ['-W', '1024', '-H', '1024'],
    test: ['-W', '512', '-H', '512'],
    files: [
      {
        part: 'model',
        flag: '--diffusion-model',
        repo: 'leejet/FLUX.2-klein-4B-GGUF',
        rev: '3b1f5a9dc3abb32238b053aeb3d823c30afdacbd',
        name: 'flux-2-klein-4b-Q4_0.gguf',
        bytes: 2460378560,
        sha256: 'd1023499ef3f2f82ff7c50e6778495195c1b6cc34835741778868428111f9ff4',
      },
      {
        part: 'decoder',
        flag: '--vae',
        repo: 'black-forest-labs/FLUX.2-small-decoder',
        rev: 'a3efc24f613ef42d9428af62fdbd6f5fd8856c4a',
        name: 'full_encoder_small_decoder.safetensors',
        bytes: 249519092,
        sha256: 'ea4273f02d1fafbf8e1d1c2cf6018ed8748652eb0bf34f2dd91171f16f15ab62',
      }, // the open decoder its engine names as an option; the usual one sits in a gated repository
      {
        part: 'reader',
        flag: '--llm',
        repo: 'unsloth/Qwen3-4B-GGUF',
        rev: '22c9fc8a8c7700b76a1789366280a6a5a1ad1120',
        name: 'Qwen3-4B-Q4_K_M.gguf',
        bytes: 2497281312,
        sha256: 'f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a',
      },
    ],
    license: {
      name: 'Apache 2.0',
      href: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B',
      says: 'Free to use, commercially too.',
    },
    what: 'A model that turns a sentence into a picture in four steps. It is the smallest and quickest of its kind.',
    notes: [
      ['Good for', 'A mock-up of a screen to react to, an icon, a placeholder picture, an illustration for a page.'],
      ['In the chat', 'Ask the team to draw something. The picture appears in the chat, and you can ask for a change.'],
    ],
    limits:
      'It draws what the words say, not what your design says. Words inside a picture are often wrong, and a mock-up is a sketch to react to, not a screen to build from.',
    basis:
      'We have never run this model on a Mac. The check on your machine, drawing one test picture, is the first evidence.',
  },
  {
    id: 'wan22-ti2v-5b',
    kind: 'film',
    name: 'Wan 2.2 TI2V 5B',
    maker: 'Wan AI',
    params: 5,
    quant: 'GGUF, 4-bit',
    role: 'Makes short videos',
    tick: 'Let it make short videos',
    hint: 'Adds a model that films from words: a couple of seconds of moving picture for a demo or a page.',
    repo: 'Wan-AI/Wan2.2-TI2V-5B',
    engine: DIFFUSION,
    room: 4,
    minutes: 40,
    mode: 'vid_gen',
    args: ['--cfg-scale', '6.0', '--sampling-method', 'euler', '--flow-shift', '3.0', '--offload-to-cpu'],
    size: ['-W', '832', '-H', '480', '--video-frames', '33'],
    test: ['-W', '320', '-H', '320', '--video-frames', '9'],
    negative:
      '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走', // what not to draw, in the words its makers publish for it
    files: [
      {
        part: 'model',
        flag: '--diffusion-model',
        repo: 'QuantStack/Wan2.2-TI2V-5B-GGUF',
        rev: '57437632ddd08bdcbd1508c866aa22e126ed51d2',
        name: 'Wan2.2-TI2V-5B-Q4_K_M.gguf',
        bytes: 3433116000,
        sha256: '95b19697b7f98e65b0a543640e9ca7b4dfec32e2a6e3731e8e10708be52655e2',
      },
      {
        part: 'decoder',
        flag: '--vae',
        repo: 'QuantStack/Wan2.2-TI2V-5B-GGUF',
        rev: '57437632ddd08bdcbd1508c866aa22e126ed51d2',
        name: 'VAE/Wan2.2_VAE.safetensors',
        bytes: 1409400960,
        sha256: 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156',
      },
      {
        part: 'reader',
        flag: '--t5xxl',
        repo: 'city96/umt5-xxl-encoder-gguf',
        rev: 'b535255bee98c2b0a59ea7c0ae2dcd0c6657b3b7',
        name: 'umt5-xxl-encoder-Q4_K_M.gguf',
        bytes: 3655145312,
        sha256: '17cf97a5bbbc60a646d6105b832b6f657ce904a8a1ad970e4b59df0c67584a40',
      },
    ],
    license: {
      name: 'Apache 2.0',
      href: 'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B',
      says: 'Free to use, commercially too.',
    },
    what: 'A model that turns a sentence into a couple of seconds of video.',
    notes: [
      ['Good for', 'A short moving picture for a demo, a landing page or an idea you want to see move.'],
      ['In the chat', 'Ask the team to make a video of something. The clip appears in the chat when it is done.'],
    ],
    limits:
      'It is slow: a clip takes minutes, not seconds, and how many is measured when it is added. Clips are short and small, and what moves in them is not always what was asked for.',
    basis:
      'We have never run this model on a Mac. The check on your machine, making one short test clip, is the first evidence.',
  },
];
export const addonBytes = (a) => a.files.reduce((n, f) => n + f.bytes, 0);
// what a helper takes while it works: its files, 15% on top, and room to work in (1 GB for a picture being read; more for one being
// drawn or filmed). It holds that only while it works.
export function addonFit(a, memoryGb, mainNeedGb = 0) {
  const sizeGb = Math.round((addonBytes(a) / 2 ** 30) * 10) / 10;
  const needGb = Math.round((sizeGb * 1.15 + (a.room || 1)) * 10) / 10;
  return { sizeGb, needGb, fits: needGb + mainNeedGb <= memoryGb * 0.9 }; // beside the main model, short of the whole machine
}

// Does a model fit this machine? The weights, 15% on top for the loaded state, and 3 GB for the context and the agent, inside 70% of the
// machine's memory so the customer's own apps keep running. It is a screen, not a promise: the engine does its own check when it loads.
export const SHARE = 0.7;
export function fitOf(sizeGb, memoryGb) {
  const needGb = Math.round((sizeGb * 1.15 + 3) * 10) / 10;
  return {
    needGb,
    roomGb: Math.round(memoryGb * SHARE * 10) / 10,
    leftGb: Math.round((memoryGb - needGb) * 10) / 10,
    fits: needGb <= memoryGb * SHARE,
  };
}
// The list a page shows: each model with its size (measured when known), its fit, and the largest fitting one marked as the recommendation.
export function optionsFor(host, sizes = {}, measured = {}) {
  const list = MODELS.map((m) => {
    const real = sizes[m.id];
    const sizeGb = real ? real.gb : m.estGb;
    return {
      ...m,
      sizeGb,
      sizeMeasured: !!real,
      ...fitOf(sizeGb, host.memoryGb),
      measured: measured[m.id] || null,
      cached: !!(real && real.cached),
    };
  });
  const best = list.find((m) => m.fits);
  return list.map((m) => ({ ...m, recommended: !!best && m.id === best.id }));
}

// STRATA: the engine for a machine that is NOT an Apple silicon Mac (TensorFold is MLX, which is Apple silicon only). A Linux machine
// with a graphics card runs its local model on Strata instead (github.com/Niko1221/Strata, MIT). Everything here is copied from
// Strata's own pages: its one-line Terminal install (docs/INSTALL.md), the family and size names its launch command takes, and
// the memory each model needs, RAM and graphics memory together (docs/MODELS.md, "Pick by memory"). Download sizes are NOT written
// down: Strata's own plan says them, for this machine, before anything is fetched.
export const STRATA = {
  name: 'Strata',
  site: 'https://github.com/Niko1221/Strata',
  installer: 'https://github.com/Niko1221/Strata/releases/latest/download/install.sh',
  install:
    'curl -fsSL --connect-timeout 15 --max-time 120 https://github.com/Niko1221/Strata/releases/latest/download/install.sh -o install.sh && sh install.sh',
};
const UNTRIED = {
  tier: 'No record yet',
  badge: 'New to us',
  can: { talk: null, find: null, code: null },
  basis: 'We have never run this model through this app',
  did: 'None of our own. Strata publishes its own measurements for it.',
  agent: 'Unknown here. The agent check on your machine will be the first evidence.',
  use: 'Treat it as untested until Start has measured it here.',
  runs: 'Run by Strata, which spreads a model across the graphics card, the RAM and, when it must, the SSD. It reads pictures itself.',
};
export const STRATA_MODELS = [
  {
    ...UNTRIED,
    id: 'strata-qwen38-q2',
    engine: 'strata',
    family: 'qwen',
    pack: 'q2_0',
    name: 'Qwen3.8-Flash-Next, Q2',
    size: 'Large',
    params: 125,
    active: 125,
    quant: 'ISTA-DASLab Q2_0',
    memGb: 37.6,
    pace: 'quick',
    badge: "Strata's first choice",
    plain:
      'A very large model, packed tightly enough for a gaming graphics card with plenty of RAM behind it. It is the size Strata itself recommends first, and the fastest of its packs.',
  },
  {
    ...UNTRIED,
    id: 'strata-qwen38-iq3',
    engine: 'strata',
    family: 'qwen',
    pack: 'iq3_xxs',
    name: 'Qwen3.8-Flash-Next, IQ3',
    size: 'Large',
    params: 125,
    active: 125,
    quant: 'ISTA-DASLab IQ3_XXS',
    memGb: 47,
    pace: 'thorough',
    badge: 'Better answers',
    plain: 'The same very large model, packed less tightly: better answers, slower, and it needs more memory.',
  },
  {
    ...UNTRIED,
    id: 'strata-coder',
    engine: 'strata',
    family: 'coder',
    pack: 'IQ1_M',
    name: 'Qwen3.8-Flash-Next Coder',
    size: 'Large',
    params: 125,
    active: 125,
    quant: 'ISTA-DASLab Coder IQ1_M',
    memGb: 32,
    pace: 'quick',
    badge: 'For code only',
    plain:
      'A version of the very large model kept for coding alone, so it runs in about 32 GB of RAM with a suitable graphics card.',
  },
  {
    ...UNTRIED,
    id: 'strata-qwen36-35b',
    engine: 'strata',
    family: 'qwen36',
    pack: 'ud-q4_k_xl',
    name: 'Qwen3.6-35B-A3B',
    size: 'Medium',
    params: 35,
    active: 3,
    quant: 'Unsloth UD-Q4_K_XL',
    memGb: 32,
    pace: 'quick',
    badge: 'Smaller',
    plain:
      'A smaller model that uses about a tenth of itself for each word, for a machine with less memory. Strata gives 32 to 52 GB of RAM for it.',
  },
];
// Does a Strata model fit? Its own figure is the model's weights in RAM plus graphics memory, so the two are counted together, with
// 6 GB kept for the system and everything else. Strata can also read part of a model from the SSD, much more slowly: its plan says.
export function strataFit(m, host) {
  const pool = Math.round((host.poolGb || host.memoryGb) * 10) / 10;
  return { needGb: m.memGb, roomGb: pool, leftGb: Math.round((pool - m.memGb) * 10) / 10, fits: m.memGb + 6 <= pool };
}
export function strataOptions(host, measured = {}) {
  const list = STRATA_MODELS.map((m) => ({
    ...m,
    sizeGb: null,
    sizeMeasured: false,
    ...strataFit(m, host),
    measured: measured[m.id] || null,
    cached: false,
  }));
  const best = list.find((m) => m.fits);
  return list.map((m) => ({ ...m, recommended: !!best && m.id === best.id }));
}

// LLAMA.CPP: THE LAST ENGINE ON THE WATERFALL. TensorFold needs an Apple silicon Mac with a current macOS; Strata needs a Linux machine
// with a lot of memory. Whatever is left (an Intel Mac, a Linux machine with little memory or no graphics card, an Apple silicon Mac on
// an old macOS) runs a SMALL model on llama.cpp (github.com/ggml-org/llama.cpp, MIT), on its processor.
// The engine is llama.cpp's own build for the machine, from its GitHub release at a PINNED tag (b12359, the build its v1.0.0 names),
// kept only if its SHA-256 is the one here. Sizes and SHA-256 are as GitHub's release listed them on 2026-11-15. A "llama" command
// that is already on the machine and new enough (min, minBuild) is used instead, and nothing is fetched.
export const LLAMA = {
  name: 'llama.cpp',
  site: 'https://github.com/ggml-org/llama.cpp',
  min: [0, 8, 0],
  minBuild: 11960,
  version: '1.0.0', // the release this build is: v1.0.0 names b12359 as the build that carries its files
  tag: 'b12359',
  builds: {
    'darwin-x64': {
      asset: 'llama-b12359-bin-macos-x64.tar.gz',
      bytes: 12661621,
      sha256: '25320d529077ef5a3d16e7b5da26438f221d88c8c0930a32b0c79457f5eede56',
    },
    'darwin-arm64': {
      asset: 'llama-b12359-bin-macos-arm64.tar.gz',
      bytes: 16907811,
      sha256: '82b00abc740160e1b9980e6cc79c117345fa34af058c80e6c0a69aa8ddccde75',
    },
    'linux-x64': {
      asset: 'llama-b12359-bin-ubuntu-x64.tar.gz',
      bytes: 23311084,
      sha256: '0bc1f091e8916102b6d8f2cf944233a620e90a0f856c72d0ce41150c65c2e72e',
    },
    'linux-arm64': {
      asset: 'llama-b12359-bin-ubuntu-arm64.tar.gz',
      bytes: 18949862,
      sha256: 'dc7aa17a67884619b7223870aca9fd6addbc01717713b04a714add1c31137359',
    },
    'win32-x64': {
      asset: 'llama-b12359-bin-win-cpu-x64.zip',
      bytes: 25097509,
      sha256: '837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69',
    },
    'win32-arm64': {
      asset: 'llama-b12359-bin-win-cpu-arm64.zip',
      bytes: 13455326,
      sha256: 'd27564c754478d2832789dfcebfc5ace018e36a224c41d810b7cbc1ba8243ec0',
    },
  },
};
export const llamaBuild = (platform, arch) => LLAMA.builds[platform + '-' + arch] || null;
// THE BUILDS THAT USE A GRAPHICS CARD, through Vulkan: one small download that works with NVIDIA, AMD and Intel cards and needs no
// runtime fetched beside it. (A Mac's build already uses its graphics through Metal.) Same release, same day's sizes and SHA-256.
export const LLAMA_CARD = {
  'win32-x64': {
    asset: 'llama-b12359-bin-win-vulkan-x64.zip',
    bytes: 38090643,
    sha256: 'e8d18c6e4210cca87e7307c2ea78363ac8d158e4e1397358ec96ab70b53a0d5e',
  },
  'win32-arm64': {
    asset: 'llama-b12359-bin-win-vulkan-arm64.zip',
    bytes: 26027698,
    sha256: '62cd50089cffdd825524a91c5a8819041eb75d8e2beacd6eca68194dba50574f',
  },
  'linux-x64': {
    asset: 'llama-b12359-bin-ubuntu-vulkan-x64.tar.gz',
    bytes: 36153377,
    sha256: '19b60f00395a3f4954e46a5037695bc1d843404fc9d3124f82a612ecd8fbe9f0',
  },
  'linux-arm64': {
    asset: 'llama-b12359-bin-ubuntu-vulkan-arm64.tar.gz',
    bytes: 29435221,
    sha256: '3f8ae812a58ac92e5a596ca9fbc988f52854d147c5a7fe1264dddc90c1d085b4',
  },
};
export const llamaCardBuild = (platform, arch) => LLAMA_CARD[platform + '-' + arch] || null;
// The models: one GGUF file each, from Hugging Face at a PINNED revision, with the size and SHA-256 its page listed on 2026-11-12.
// memGb is OUR ESTIMATE, not a measurement: the file, plus about 2 GB of working room for the context it is served with.
const ON_CPU = {
  ...UNTRIED,
  did: 'None of our own.',
  license: 'Apache-2.0',
  runs: "Run by llama.cpp on this machine's processor, with no graphics card needed, so it answers slowly next to a model on a graphics card. It does not read pictures in this setup.",
};
// BONSAI 2 (PrismML, Apache-2.0): a large model packed into very little memory, so a machine that could only hold a small model
// can hold a 27B one. Its Q2_0 packing is the one upstream llama.cpp reads, from build b11556; the other packings need PrismML's
// own build of llama.cpp, which this app does not use. The sampling values are the ones its page gives for answering without thinking.
// All four sizes are listed, for the person to choose from. The two smallest are light enough for any machine and reason less
// well; which of all these is recommended where is a quick pass over the machine until the training scripts have measured them.
const BONSAI = {
  ...ON_CPU,
  engine: 'llama',
  family: 'Bonsai',
  quant: 'PrismML Q2_0',
  needsBuild: 11556,
  // THINKING IS OFF. Its page says a simple question can use 3,000 words of thinking before the answer; on a processor, at a word or
  // two a second, that is half an hour for one reply. These are the values its page gives for answering without it.
  serve: [
    '--reasoning',
    'off',
    '--temp',
    '0.7',
    '--top-p',
    '0.8',
    '--top-k',
    '20',
    '--min-p',
    '0',
    '--presence-penalty',
    '1.5',
  ],
  runs: 'Run by llama.cpp on this machine. It is a large model packed small, so it fits where a model of its size usually does not. It does not read pictures in this setup.',
};
export const LLAMA_MODELS = [
  {
    ...BONSAI,
    id: 'llama-bonsai2-27b',
    name: 'Bonsai 2 27B',
    wantsCard: true, // on a processor alone it wrote 1.3 words a second on a real PC: recommended only where a graphics card can run it
    size: 'Large',
    params: 27,
    active: 27,
    memGb: 9.1,
    pace: 'thorough',
    badge: 'Largest that fits here',
    repo: 'prism-ml/Ternary-Bonsai-2-27B-gguf',
    rev: '839bd57023c1558945afea70a74fa83c054f35f9',
    file: 'Ternary-Bonsai-2-27B-Q2_0.gguf',
    bytes: 7626008928,
    sha256: '4f99aed01b8a877e153f9aa6569a4440fe17c59701cc0953e36d7f460549e70e',
    plain:
      'A 27B model in a 7 GB file. The most capable model a machine like this one can hold. It needs a graphics card to answer at a usable speed: on a processor alone it is very slow.',
  },
  {
    ...BONSAI,
    id: 'llama-bonsai2-9b',
    name: 'Bonsai 2 9B',
    size: 'Medium',
    params: 9,
    active: 9,
    memGb: 4.4,
    pace: 'steady',
    badge: 'For 8 GB of memory',
    repo: 'prism-ml/Ternary-Bonsai-2-9B-gguf',
    rev: '82265ccc78ddaac4700286a35e9badcc32376dd9',
    file: 'Ternary-Bonsai-2-9B-Q2_0.gguf',
    bytes: 2556640128,
    sha256: '1f884aa56aacd2bbbb2e4b7abaead2b1102b74a9c75a23fc33dab916813a384d',
    plain:
      'A 9B model in a 2.4 GB file: it fits a machine with 8 GB of memory, where a model its size usually does not. We have not run it ourselves yet.',
  },
  {
    ...ON_CPU,
    id: 'llama-qwen35-9b',
    engine: 'llama',
    name: 'Qwen3.5-9B',
    size: 'Small',
    params: 9,
    active: 9,
    quant: 'Unsloth Q4_K_M',
    memGb: 7.5,
    pace: 'thorough',
    badge: 'A conventional 9B',
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    rev: '3885219b6810b007914f3a7950a8d1b469d598a5',
    file: 'Qwen3.5-9B-Q4_K_M.gguf',
    bytes: 5680522464,
    sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    plain:
      'A conventional 9B model, for a machine with room for it. Thorough and slow: expect to wait for each answer.',
  },
  {
    ...ON_CPU,
    id: 'llama-qwen35-4b',
    engine: 'llama',
    name: 'Qwen3.5-4B',
    size: 'Small',
    params: 4,
    active: 4,
    quant: 'Unsloth Q4_K_M',
    memGb: 4.5,
    pace: 'thorough',
    badge: 'The middle',
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    rev: 'e87f176479d0855a907a41277aca2f8ee7a09523',
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    bytes: 2740937888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    plain:
      'Half the size: it answers about twice as fast and knows less. A fair choice for a machine with 8 GB of memory.',
  },
  {
    ...BONSAI,
    id: 'llama-bonsai2-4b',
    name: 'Bonsai 2 4B',
    size: 'Small',
    params: 4,
    active: 4,
    memGb: 3.1,
    pace: 'quick',
    badge: 'Light',
    repo: 'prism-ml/Ternary-Bonsai-2-4B-gguf',
    rev: '50ebba61be85e5be07e8083db468ace0fc1bac43',
    file: 'Ternary-Bonsai-2-4B-Q2_0.gguf',
    bytes: 1212103520,
    sha256: '64a5183b44921bdb5ac4a6f5f92007821d6ebe5c66997d3c147fd214ab9433d4',
    plain:
      'A 4B model in a 1.1 GB file. Quick and light on the machine; it reasons less well than the larger ones. We have not run it ourselves yet.',
  },
  {
    ...ON_CPU,
    id: 'llama-qwen35-2b',
    engine: 'llama',
    name: 'Qwen3.5-2B',
    size: 'Small',
    params: 2,
    active: 2,
    quant: 'Unsloth Q4_K_M',
    memGb: 3,
    pace: 'quick',
    badge: 'For a small machine',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    rev: 'f6d5376be1edb4d416d56da11e5397a961aca8ae',
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    bytes: 1280835840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    plain:
      'The smallest. It is the quickest here and good for talking a thing through; do not expect it to change code on its own.',
  },
  {
    ...BONSAI,
    id: 'llama-bonsai2-2b',
    name: 'Bonsai 2 2B',
    size: 'Small',
    params: 2,
    active: 2,
    memGb: 2.5,
    pace: 'quick',
    badge: 'Lightest',
    repo: 'prism-ml/Ternary-Bonsai-2-2B-gguf',
    rev: 'a6032a5089ac27e96be3a80c7b42d1ad0bd89887',
    file: 'Ternary-Bonsai-2-2B-Q2_0.gguf',
    bytes: 546689504,
    sha256: 'c2893fa6f951daee8b7263d5f49b455e57989ef56417a22125b03566dc560650',
    plain:
      'A 2B model in a half-gigabyte file: the lightest here. Good for talking a thing through, not for changing code. We have not run it ourselves yet.',
  },
];
// AN APPLE SILICON MAC CAN RUN BOTH KINDS: TensorFold's models and, through llama.cpp, Bonsai 2. The model chosen for a Mac is the
// first of these that its memory can hold. The order is a quick pass: the large ones we have run first, then Bonsai 2 from large
// to small (a 27B that fits in 16 GB comes before a 2B starter), with the smallest last. The training scripts will replace it.
export const MAC_ORDER = [
  'qwen38-27b',
  'nemotron35-30b',
  'lfm25-24b',
  'llama-bonsai2-27b',
  'llama-bonsai2-9b',
  'llama-bonsai2-4b',
  'qwen35-2b',
  'llama-bonsai2-2b',
];
// Does one fit? It runs in ordinary memory (the build is the processor one, so graphics memory is not counted), with 3 GB kept for the
// system and everything else.
export function llamaFit(m, host) {
  const room = Math.round(host.memoryGb * 10) / 10;
  return { needGb: m.memGb, roomGb: room, leftGb: Math.round((room - m.memGb) * 10) / 10, fits: m.memGb + 3 <= room };
}
// WOULD A MODEL ON THIS MACHINE STRAIN IT? A quick pass over what the machine is, made before anything is fetched. A model run
// on a processor alone takes every core for as long as it writes, so a machine with no graphics card of its own, and not a great
// deal of memory or cores to spare, is slow to answer and slow at everything else while it does. (An Apple silicon Mac, a machine
// with a graphics card, and one Strata can run are not this.) A speed measured on the machine itself outranks the guess.
//   -> null (no strain) | { why: [what it is about this machine], measured: words a second, when one was measured }
export const STRAIN = { memoryGb: 32, cores: 12, tokPerSec: 6 };
export function localStrain(host, best) {
  if (!host || host.engine !== 'llama') return null;
  if ((host.gpus || []).length > 0) return null;
  if (/^macOS/.test(host.os || '') && host.arch === 'arm64') return null; // its build runs on its graphics
  const speed = best && best.measured && Number(best.measured.tokPerSec);
  if (speed)
    return speed < STRAIN.tokPerSec
      ? { why: ['it wrote ' + speed + ' words a second when it was measured here'], measured: speed }
      : null;
  const why = ['it has no graphics card of its own, so the model runs on its processor'];
  if ((host.memoryGb || 0) < STRAIN.memoryGb) why.push(host.memoryGb + ' GB of memory');
  if ((host.cores || 0) < STRAIN.cores) why.push((host.cores || 'few') + ' processor threads');
  return why.length > 1 ? { why, measured: null } : null;
}
// have: which models' files are already on this machine, by id
export function llamaOptions(host, measured = {}, have = {}) {
  const list = LLAMA_MODELS.map((m) => ({
    ...m,
    sizeGb: Math.round((m.bytes / 2 ** 30) * 10) / 10,
    sizeMeasured: true,
    ...llamaFit(m, host),
    measured: measured[m.id] || null,
    cached: !!have[m.id],
  }));
  // the largest that fits, and that this machine can run at a usable speed: a model that wants a graphics card is passed over where
  // there is none (it stays on the list, to be chosen knowingly)
  const card = (host.gpus || []).length > 0;
  const best = list.find((m) => m.fits && (card || !m.wantsCard)) || list.find((m) => m.fits);
  return list.map((m) => ({ ...m, recommended: !!best && m.id === best.id }));
}
