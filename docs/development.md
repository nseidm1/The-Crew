# Development

## Running from source

```bash
npm start                    # node src/server.mjs  ->  http://127.0.0.1:5210/
```

There is no build step and nothing to install. Edit a file under `src/` and reload the page; restart the server after a change
under `src/runner/` or to `src/server.mjs`.

The owner's panel is at `/owner.html` when the app runs from source. It is not in the bundle.

### Settings

Every setting is an environment variable. The ones a developer uses:

| Setting | What it does |
|---|---|
| `PORT` | The port to listen on (5210 by default) |
| `FO_KEEP=1` | Do not stop when the last page closes |
| `FO_GRACE_MS`, `FO_BOOT_GRACE_MS` | How long the runner waits after the last page closes (45 s), and for a first page to open (5 min) |
| `FO_STATE_DIR` | Where the runner keeps its state. From source it is `src/.runner/`; the installed app uses `~/.familyoffice/state` |
| `FO_NO_OPEN=1` | Never open a browser or a folder window |
| `FO_NO_NET=1` | Never reach the network (the checks set this) |
| `FO_PRODUCT_FILE` | A copy of `src/js/product.js` to serve instead of the real one, so a check does not depend on the publisher's switches |
| `FO_CLAUDE_MODEL` | The model every Claude Code run uses, where a seat has none of its own |
| `FO_SITE_IDLE_MS` | How long a website the team made stays served with nobody opening it (45 min) |
| `FO_PLAYWRIGHT` | For the browser checks: the `package.json` of a folder that has Playwright, if this repository's `node_modules` does not |

The runner reads about ninety more, nearly all of them for the checks: `FO_BIN_<PROGRAM>` names a stand-in for an outside
program (`FO_BIN_CLAUDE`, `FO_BIN_ADB`, `FO_BIN_SSH`, ...), and the rest point a download or an API at a local stand-in.
`grep -o "process.env.FO_[A-Z_0-9]*" -r src | sort -u` lists them.

## The checks

```
tests/
  run.mjs        runs suites one after another and says how each ended
  support/       where a check finds the app, the stand-ins, its working folder and the browser
  fakes/         stand-ins for outside programs
  core/          the team core in Node, with a stand-in engine
  runner/        the runner over HTTP
  browser/       the app in Chromium
  landing/       the landing page and its film
```

```bash
npm test                              # core and runner
node tests/run.mjs core/plan-loop     # one check
node tests/core/plan-loop.mjs         # the same, with its own output
```

Never run two suites at once: they start servers on fixed ports and browsers of their own. `tests/run.mjs` runs them in order
for that reason. What a run makes (state, pictures, logs) goes to `.work/`, which is ignored by git.

[tests/README.md](../tests/README.md) lists every check and what it covers.

### How a check is written

A check is a plain Node script. It prints one line for each thing it checked and exits non-zero if any failed:

```js
let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got)));
  if (!ok) failed++;
};

check('nothing lands by itself while a requirement is not met', !landed && plan.stage === 'waiting', plan);

process.exit(failed ? 1 : 0);
```

- **The name is a sentence that is true when the check passes.** Someone reading only the output should learn what the
  product does.
- **What it got is printed when it fails**, so a failure can be read without running it again.
- **A core check** builds the core with `createTeamCore({ persist: false })` and hands it an engine made of plain functions:
  `tests/core/plan-loop.mjs` is the model to copy.
- **A runner check** starts `src/server.mjs` on a port of its own with `FO_STATE_DIR` in `.work/` and `FO_BIN_*` pointing at
  stand-ins.
- **A browser check** does the same and drives Chromium through Playwright, at a computer's size and a phone's.

### Stand-ins

`tests/fakes/` holds a small script for each outside program the runner starts. Each behaves like the real one for the cases
the checks need and can be told to misbehave through `FO_FAKE_*` settings (signed out, an old version, a refused install).
`fake-claude.mjs` is the largest: it answers as a seat, edits a file as a builder would, writes a proof, and stands in for the
Jira connector.

When the runner starts a new program, add its stand-in here and a check that uses it. A check must never install, sign in to
or change anything real.

## Measuring on a real team

The scripts in `training/` run the real product with a real model. They spend real time, and on Claude Code they spend your
plan, so each asks for `--spend-claude` before it starts. See [training.md](training.md).

## Where things are kept

| Path | What | In git |
|---|---|---|
| `src/.runner/` | The app's state when run from source | no |
| `.work/` | What checks and training runs make | no |
| `dist/` | The bundle | no |
| `training/results/` | The summary of each measurement | yes |

## Formatting

```bash
npm install            # once
npm run format         # Prettier, over everything it is not told to leave alone
npm run format:check
```

The pages (`*.html`), the documents and four small files the owner's tools edit in place are left alone; `.prettierignore`
says why for each.

## Conventions

[CONTRIBUTING.md](../CONTRIBUTING.md#conventions) has the naming conventions, how the two large modules are divided into
parts, and where the code does not meet the conventions yet.
