// paths.mjs - where a check finds things, said once: the app it drives, the stand-ins for outside programs, a folder for what it
// makes, and the browser. Nothing here is a path on one person's machine.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = path.join(REPO_ROOT, 'src'); // the app as it ships: the pages, the runner, server.mjs
export const FAKES = path.join(REPO_ROOT, 'tests', 'fakes'); // stand-ins for Claude Code, gh, adb, ssh, the model engines and the rest
export const WORK = path.join(REPO_ROOT, '.work'); // state, pictures and logs a run makes; never committed
// The browser checks use Playwright's Chromium. It is found the ordinary way, from this repository's node_modules (npm install),
// or from the folder of another package.json that has it: FO_PLAYWRIGHT=/path/to/package.json
export const PLAYWRIGHT_FROM = process.env.FO_PLAYWRIGHT || path.join(REPO_ROOT, 'package.json');
