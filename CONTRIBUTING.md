# Contributing

Thank you for looking. This page says how to set up, what the conventions are, and what a change has to come with.

## Setting up

```bash
git clone https://github.com/nseidm1/The-Crew.git
cd The-Crew
npm start                # the app on http://127.0.0.1:5210/
npm test                 # the chat core and the runner: no browser, nothing installed
```

The app has no dependencies and no build step. There are two development dependencies: Prettier, which formats the code, and
Playwright, for the browser checks:

```bash
npm install
npx playwright install chromium
npm run test:all
```

[docs/development.md](docs/development.md) has the settings, the layout of a check and how to write one.

## What a change comes with

1. **A check that fails without it.** Behaviour in the runner is checked in `tests/runner/self-test.mjs`, behaviour in the team
   core in `tests/core/`, and anything a person sees in `tests/browser/`. A change with no check is not finished.
2. **A stand-in, never the real thing.** A check does not install software, sign in anywhere, or reach a real service. If the
   runner starts a new outside program, add a stand-in for it in `tests/fakes/`.
3. **`npm test` and `npm run format:check` passing**, and the browser checks for anything on a page.
4. **Words that are true.** Nothing in the app may say the team did something it cannot do. If a claim on a page carries a
   number, the number has a source.
5. **The bundle still building**: `npm run bundle` refuses a page that reaches for a root-absolute path.

## Conventions

### Folders and files

| Thing | Convention | Example |
|---|---|---|
| Folders | lower case, one word where possible, hyphens otherwise | `src/runner/`, `tests/fakes/` |
| Files | lower case with hyphens | `team-core.js`, `plan-in-chat.mjs` |
| Browser modules | `.js` (ES modules, loaded by the pages) | `src/js/views.js` |
| Node scripts | `.mjs` | `src/runner/prove.mjs` |
| One module, one job | a runner module is named for the one thing it does | `repo.mjs`, `prove.mjs`, `detect.mjs` |
| Checks | named for what they check, in a folder named for what they drive | `tests/core/plan-loop.mjs` |
| Stand-ins | `fake-<program>.mjs` | `tests/fakes/fake-claude.mjs` |
| Repository documents | upper case, as GitHub expects them | `README.md`, `CONTRIBUTING.md` |

Android's own files keep Android's conventions (`AndroidManifest.xml`, `ic_launcher.xml`).

### Code

| Thing | Convention | Example |
|---|---|---|
| Functions and variables | `camelCase`; a function is named for what it does or returns | `planFor`, `judgePlan`, `changeOf` |
| Constants that never change | `UPPER_SNAKE_CASE` | `PLAN_MAX`, `REPO_ROOT` |
| Booleans | read as a statement | `isSimple()`, `onClaude()`, `hasApp` |
| Settings from the environment | `FO_` and upper snake case | `FO_STATE_DIR`, `FO_KEEP` |
| CSS classes and element ids | lower case with hyphens; a state is `is-<state>` | `plan-card`, `is-met` |
| Browser storage keys | `familyoffice.<what>` | `familyoffice.mode` |
| Window events | `fo:<what>` | `fo:mode`, `fo:runner-gone` |
| HTTP routes | `/api/<noun>` or `/api/<noun>/<verb>` | `/api/workspace/prove` |

- **One declaration to a statement.** `const a = 1;` and `const b = 2;`, never `const a = 1, b = 2;`.
- **A name says what it holds.** One- and two-letter names are for the parameter of a short callback (`(x) => x.id`), a loop
  index, and the letters of a formula or of drawing code (`x`, `y`, `w`, `h`, `t`). A name that is used more than a screen away
  from where it is declared is a word: `state`, `workspace`, `recipe`, not `s`, `ws`, `r`. A few two-letter words stand as they
  are: `ok`, `id`, `el`, `io`, `at`.
- **Every module starts with a comment that says what it is for**, in a sentence a newcomer can read.
- **A comment says why**, and where something was learned the hard way it says what happened ("Found for real: ...").
- **No dependency is added to the app.** The pages and the runner use what the browser and Node.js provide.
- **No path of one machine, no secret, no personal name** in the repository, in code, comments, fixtures or results.

### Formatting

The code is formatted by [Prettier](https://prettier.io/), and nothing is formatted by hand:

```bash
npm install          # once: Prettier and Playwright, the two development dependencies
npm run format       # format everything
npm run format:check # what a pull request is checked with
```

`.prettierrc.json` has the three settings (120 columns, single quotes, no formatting inside template strings).
`.prettierignore` says what is left alone and why: the pages (`*.html`), whose white space is part of their layout; documents;
and four small files under `src/js/` that the owner's tools edit in place.

### How a large module is divided

Two modules hold a great deal of state that many functions share: the team (`src/js/team-core.js`) and the runner
(`src/runner/index.mjs`). Each is one function, and its parts live beside it (`src/js/team/`, `src/runner/setup/`):

- A part that needs nothing of that state is an ordinary module with ordinary exports.
- A part that does exports one function, `install<Part>(ctx)`. Inside it, what belongs to the whole is reached as
  `ctx.name` (in the runner the object is called `runner`), and what the part offers the others it puts there at its end:
  `Object.assign(ctx, { planFor, build })`.
- State that is assigned again and used by more than one part is a field of that object everywhere (`ctx.state`,
  `runner.setup`), so every part reads and writes the same one.

### Where the code does not meet this yet

Said plainly, so that nobody has to discover it:

- **Long lines that Prettier cannot break.** About 4% of lines are over 120 columns: a prompt written as one string, or a
  comment at the end of a line.
- **Large modules.** `src/js/app.js` (the app's views), `src/runner/prove.mjs`, `src/runner/index.mjs` (now only the routes
  and the runner's state) and `src/js/start.js` are each several thousand lines and hold more than one concern.
- **The pages are not formatted**, and the four film pages each carry a script and styles of their own inside the page.
- **The tests and the training scripts** are formatted, but their names were not gone through: about two hundred one- and
  two-letter names there are used far from where they are declared (`p` for a page, `s` for a snapshot).
- **No linter.** Prettier formats; nothing yet checks for an unused name or a missing `await`.

New code follows the conventions. A change that only renames or moves code travels on its own, apart from any change in
behaviour.

## Commits and pull requests

- One change, one pull request. Formatting never travels with a change in behaviour.
- The subject says what changed, in the imperative: "Judge requirements in the repository, not on the diff".
- The description says why, what was checked, and what was not.

## Reporting a problem

Open an issue with what you did, what you expected and what happened, and the commit you are on (or the `version` in the
published site's `manifest.json`). For anything
that could be a vulnerability, see [SECURITY.md](SECURITY.md) instead.
