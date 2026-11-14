// steps.mjs - THE STEPS OF A SETUP, as the Start page shows them, for each way a team can be given a mind: a local model through
// TensorFold, a model server that is already running, Strata, llama.cpp, and Claude Code. Each list is the order the work is done in.
import { AGENT, ENGINE, LLAMA, STRATA } from '../../js/catalog.js';

export const STEPS = [
  { id: 'tools', title: 'Check what the install needs', detail: "Apple's build tools, a signature check, Homebrew" },
  { id: 'engine', title: 'Install the engine', detail: ENGINE.name + ', the local model runtime' },
  { id: 'model', title: 'Fetch the model', detail: '' },
  { id: 'server', title: 'Start the model server', detail: 'A local endpoint only this machine can reach' },
  { id: 'speed', title: 'Measure inference', detail: 'One timed reply' },
  { id: 'agent', title: 'Install the agent', detail: AGENT.name + ", inside this app's own folder" },
  {
    id: 'check',
    title: 'Run the agent check',
    detail: 'Small jobs, each judged. A miss is corrected and tried again, and a local model is taught from its misses',
  },
];

// a model server that was already running: nothing is installed or started for it, only checked
export const EXISTING_STEPS = [
  { id: 'tools', title: 'Check the model server', detail: 'It answers, and lists this model' },
  { id: 'speed', title: 'Measure inference', detail: 'One timed reply' },
  { id: 'agent', title: 'Install the agent', detail: AGENT.name + ", inside this app's own folder" },
  {
    id: 'check',
    title: 'Run the agent check',
    detail: 'Small jobs, each judged. A miss is corrected and tried again, and a local model is taught from its misses',
  },
];

export const tgt = (e) =>
  e && (e.kind === 'existing' || e.kind === 'strata' || e.kind === 'llama')
    ? { base: e.base, model: e.model }
    : e && e.port; // where the engine in use is served

// a machine that is not an Apple silicon Mac: the engine is Strata (strata.mjs), which fetches and serves the model itself
export const STRATA_STEPS = [
  { id: 'engine', title: 'Install the engine', detail: STRATA.name + ', by its own installer' },
  {
    id: 'plan',
    title: 'Ask ' + STRATA.name + ' what this model needs',
    detail: 'Its own plan for this machine. Nothing is downloaded yet',
  },
  { id: 'model', title: 'Download and start the model', detail: '' },
  { id: 'speed', title: 'Measure inference', detail: 'One timed reply' },
  { id: 'agent', title: 'Install the agent', detail: AGENT.name + ", inside this app's own folder" },
  {
    id: 'check',
    title: 'Run the agent check',
    detail: 'Small jobs, each judged. A miss is corrected and tried again, and a local model is taught from its misses',
  },
];

// the last engine on the waterfall (llama.mjs): a small model on the machine's processor, for a machine neither engine above runs on
export const LLAMA_STEPS = [
  {
    id: 'engine',
    title: 'Install the engine',
    detail: LLAMA.name + ', its own build for this machine, checked before it is unpacked',
  },
  { id: 'model', title: 'Fetch the model', detail: 'One file from Hugging Face, kept only if its SHA-256 matches' },
  { id: 'server', title: 'Start the model server', detail: 'A local endpoint only this machine can reach' },
  { id: 'speed', title: 'Measure inference', detail: 'One timed reply' },
  { id: 'agent', title: 'Install the agent', detail: AGENT.name + ", inside this app's own folder" },
  {
    id: 'check',
    title: 'Run the agent check',
    detail: 'Small jobs, each judged. A miss is corrected and tried again, and a local model is taught from its misses',
  },
];

export const INSTALLING = "Installing it for you now, with Anthropic's own installer"; // what the install step says while it runs: words, never the installer's command line

export const ENGINE_NAMES = { tensorfold: ENGINE.name, strata: STRATA.name, llama: LLAMA.name };

export const CLAUDE_STEPS = [
  { id: 'tools', title: 'Find Claude Code', detail: 'Looking for it on this machine' },
  {
    id: 'engine',
    title: 'Install Claude Code',
    detail: "Done for you with Anthropic's own installer, only if it is missing",
  },
  {
    id: 'signin',
    title: 'Sign in to Claude',
    detail: 'Your own Claude sign-in, kept by Claude Code. We never see it.',
  },
  { id: 'speed', title: 'Ask it one question', detail: 'One timed reply' },
  {
    id: 'check',
    title: 'Run the agent check',
    detail: 'Small jobs, each judged. A miss is corrected and tried again, and a local model is taught from its misses',
  },
];
