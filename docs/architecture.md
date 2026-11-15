# Architecture

The Crew is three things that ship together and one thing that publishes them.

| Part | Where | Runs in | Depends on |
|---|---|---|---|
| The pages | `src/*.html`, `src/css/`, `src/js/` | The browser | Nothing: no framework, no build step |
| The runner | `src/server.mjs`, `src/runner/` | Node.js, on the user's machine | Node's standard library only |
| The launcher | `src/myfamilyoffice.sh`, `src/myfamilyoffice.mjs` | A shell, then Node.js | `curl` or `wget`, and nothing else |
| The bundle | `tools/bundle.mjs` → `dist/` | Node.js, on the publisher's machine | Nothing |

`src/` is laid out exactly as it ships. `dist/` is `src/` with what does not ship left out (the owner's panel, the Android
source and its key), plus `manifest.json`.

## The pages

| Page | What it is |
|---|---|
| `index.html` | The landing page: the film above the fold, the two modes, and the technical sections behind them |
| `start.html` | Start: measure the machine, choose how the team thinks, set it up, meet the team |
| `app.html` | The app: the team chat and, in Developer mode, Workspace, Jira, Remote, Soul and Plan |
| `film.html`, `reset.html`, `rsi.html`, `promise.html` | "Nothing Lands Unproven", "Drop the Weight", "The Proof Loop" and "Every Promise Has a Number": the system the team is modelled on, shown and counted |
| `owner.html` | The owner's panel. It exists only when the app runs from source and is never in the bundle |

The app has no router and no reloads: one page, a hash for the view, and every view redrawn from one snapshot of state.

### Browser modules (`src/js/`)

| Module | What it does |
|---|---|
| `app.js` | The app's views over one core; each renders from `core.snapshot()` and re-renders on change |
| `team-core.js` | **The team.** Its record (chat, work, proofs, lessons), how a seat speaks, and the calls every page makes. Its parts are in `team/` |
| `team/base.js` | The five seats, their names in each mode, and helpers that need nothing but their arguments |
| `team/round.js` | The round of the table: what the team does with a request, in Simple and in Developer |
| `team/build.js` | A change from plan to landing: the requirements, build, prove, judge, the loop |
| `team/source.js` | Where a change goes: the branch, whether it is pushed, landing or throwing away at the user's word |
| `team/research.js` | Finding out (with sources), looking at a page or a picture, making a picture or a film |
| `team/cards.js` | In Simple: a card as the reply (picks and pictures on it), a warning never left out, the others chiming in |
| `team/manners.js` | The conventions of a conversation: how the person writes, read from their words, and what that asks of a reply; the manners of the room in each mode |
| `team/you.js` | What the team keeps of what a person says of themself, and of what they rule |
| `team/ticket.js` | The Jira ticket the chat is about, and what its pictures show |
| `team/extras.js` | What goes under a reply besides its words (where it came from, answers to tap, a timer, a worked sum, a day, commands, seen and not seen), each read off the reply with no model asked |
| `team/graph.js` | The soul as a graph: what ties the kept things together (a lesson and its piece of work, a file, a proof, a correction, an earlier attempt, a ruling it replaced), and the walk recall makes through it, two steps out |
| `team/slate.js` | A blank slate: a slot of the team's own model opened empty, with a brief and one question, to check a fact (one that has not heard the answer; one whose only job is to break it) |
| `team/hindsight.js` | Hindsight as experiences, baselines, beliefs and faults: what each finished piece of work came to, what is usual, what the team has come to believe of a lesson, what had to be put right and the line that prevents it; and how the team is doing |
| `team/share.js` | What may leave the machine when contributing is on: lessons only, with everything of the person taken out |
| `team/thread.js` | One of the five sets another going: a doubt or a correction is taken up by the one who answered, once for each thing the person says; and a mark in place of a line |
| `team/mood.js` | What a face shows: the feeling that goes with a message or with what a seat is doing, read off the message itself, the same in both modes |
| `team/host.js` | Who the team is talking to in Developer (an engineer, or someone starting out), and what it needs from this computer: a folder, a website served here, a phone |
| `core-port.js` | The one door through which every page gets its core |
| `team-soul.js` | What each seat is: its role in the proof workflow, its voice, and in Simple mode its temper and tastes |
| `base-lessons.js` | The lessons every new team starts with |
| `views.js` | The group chat and everything shown under a message: cards, the plan and its rounds, sources, proofs |
| `mode.js` | Simple or Developer: read, applied and switched in place |
| `start.js` | The Start flow |
| `runner-client.js` | The pages' client for the runner's HTTP API, or "no runner here" |
| `where.js` | Where the runner is as seen from this page, and whether this page may drive it |
| `alive.js` | Ties the runner's life to the app's: one held connection while any page is open |
| `stream.js` | One held connection to the runner for every tab of a browser |
| `catalog.js` | The engines, the agent and the models Start can offer. Shared with the runner |
| `billing.js`, `plan-panel.js` | The tiers and what each allows; the Plan panel |
| `product.js` | What this version shows (the owner's switches) |
| `github.js` | GitHub's device-flow sign-in, which needs no server and no secret |
| `universe.js`, `avatar.js` | The landing film, drawn on a canvas; the five characters, drawn once for everywhere |
| `site.js`, `pulse.js` | The landing page's moving parts; the dated readings it shows |
| `ui.js`, `glide.js`, `md.js`, `qr.js` | DOM helpers; a chat log that follows its newest line; a little Markdown; a QR code |

### State in the browser

The team's record is kept in `localStorage` under `familyoffice.core.v1`; the mode under `familyoffice.mode`. Nothing of it is
sent anywhere. Clearing site data clears the team's memory, and "Clear all" in the app does the same on purpose.

## The runner

`server.mjs` serves the pages from its own folder and hands every `/api/` request to `runner/index.mjs`. It listens on
`127.0.0.1` only (5210, or the next free port).

### Runner modules (`src/runner/`)

| Module | What it does |
|---|---|
| `index.mjs` | The HTTP API: every route, and the runner's state |
| `setup/` | Each way a team is given a mind, step by step: `tensorfold.mjs`, `existing-server.mjs`, `strata.mjs`, `llama.mjs`, `claude.mjs`; what each would install (`plans.mjs`); the steps the page shows (`steps.mjs`) |
| `seat-replies.mjs` | How a seat is asked and answers: its model and effort, one reply from whichever engine the team is on |
| `host.mjs` | Measures this machine when Start is pressed: chip, memory, disk, and which tools are there |
| `engine.mjs`, `strata.mjs`, `llama.mjs` | The three local engines, in the order they are tried: install, fetch a model, serve, measure |
| `claude.mjs` | Claude Code as the engine: find it, install it, its own sign-in, one run in a folder of its own |
| `detect.mjs` | Model servers already running, here or on another machine (directly, then over SSH) |
| `agent.mjs` | The coding agent on a local model, and the agent check: three small jobs judged by the runner |
| `tune.mjs` | How a given local model has to be asked, learned on this machine and kept |
| `talk.mjs` | What kind of message was sent, and what keeps a seat's reply a reply |
| `web.mjs` | Searching the web and reading a page, for a seat that has to find something out; a picture of a named thing, from Wikipedia, for a card |
| `run-here.mjs` | Which commands the runner will run for a press in the chat: ones that read or test, and nothing else |
| `repo.mjs`, `github.mjs` | The workspace: clone, read the waiting change, land it the way the user chose |
| `pick.mjs` | The machine's own folder chooser |
| `prove.mjs` | The proof of a change: a test that is red before and green after, its rounds, and the proof image |
| `swarm.mjs` | "Does anyone have any ideas?": the other seats' ideas, tried one by one when the builder is stuck |
| `whole.mjs` | A change written out as whole files, for a local model that cannot edit with tools |
| `skills.mjs` | What the team knows about the language it is working in |
| `jira.mjs`, `connectors.mjs`, `media.mjs` | Jira through Claude Code's connector; a ticket's pictures and video |
| `eyes.mjs`, `shot.mjs` | Helper models for jobs the main one cannot do (seeing a picture); a picture of a page or a window |
| `sites.mjs`, `adb.mjs` | Serving a website the team made, on this computer only; a phone plugged in over USB |
| `link.mjs`, `cert.mjs`, `upnp.mjs` | The phone link: pairing, a self-signed certificate, asking the router for a port |
| `license.mjs`, `chain.mjs` | Which tier this machine is on, read from a lock on Base with no server and no secret |
| `node.mjs` | A private Node.js for this app when the machine's own cannot do the job |
| `owner.mjs` | The owner's panel's API. Only when run from source; never in the bundle |

### What the runner is built to refuse

- **Anything not from this machine.** It binds to loopback. The one exception is the phone link, which is off until switched
  on, pairs by a code shown on the computer, and speaks TLS with a certificate made on that computer.
- **Other websites.** The pages are served by the runner itself, so they share its origin. The site the app was fetched from
  may ask exactly two things, `GET /api/hello` and `POST /api/shutdown`; every other route is same-origin.
- **Files outside its folder.** `server.mjs` never serves the runner's code, its state, the bundle, the Android folder or any
  dotfile.
- **Installing by surprise.** Every install is listed with its command before the button that runs it. Nothing asks for a
  password.
- **Secrets.** A GitHub sign-in is handed to `git` for one command, in that command's environment, and never written into a
  clone. Claude Code's sign-in is Claude Code's own; the runner never sees a credential.

### State on the machine

| Where | What |
|---|---|
| `~/.familyoffice/app` | The installed app, fetched by the launcher and checked against the manifest |
| `~/.familyoffice/state` | The installed app's state: settings, measurements, the team's clones, proofs |
| `src/.runner/` | The same state when the app is run from source. Ignored by git, never served |
| `.work/` | What the tests and the training scripts make. Ignored by git |

The runner is tied to the app: when the last page has been gone for 45 seconds it stops what it started (a model server, a
download, a run) and exits. `FO_KEEP=1` turns that off.

## A change, end to end

```
 request or ticket
        │
        ▼
 requirements ──▶ build ──▶ prove ──▶ judge each requirement ──▶ all met and proven? ──▶ land
   (Overseer)   (Operations) (Steward)       (Steward)                  │ no
                    ▲                                                   │
                    └──────────── only what is not met ◀────────────────┘     (three rounds at most)
```

1. **Look.** With a workspace connected, Operations searches the code before anyone asks the user anything.
2. **Ask.** Only what nobody but the user can decide, and where the change should go.
3. **Plan.** The requirements, as a list that can be checked (`planFor` in `js/team/build.js`).
4. **Build.** The runner's builder works in the team's own clone (`POST /api/workspace/task`). The project's own tests run
   after it; what the change broke is put right before the proof.
5. **Prove.** A proof test is written from the task, must fail on the code before and pass after, and may be challenged
   (`POST /api/workspace/prove`, `runner/prove.mjs`).
6. **Judge.** Every requirement against the code as it stands, read in the repository with read-only tools
   (`POST /api/workspace/judge`).
7. **Loop or land.** What is not met goes round again on top of the waiting change. The loop stops after three rounds, when a
   round leaves exactly what the last one left, when a round changes nothing, or when the change cannot be proven.
8. **Land.** A pull request, a branch or a direct commit, as settled beforehand; or the change waits for the user's yes.

On Claude Code a green proof is "Proven". On a local model one model wrote both the change and its checks, so the same result
is "Checked, not proven" and always waits. The switch is `checked` in `proveChange` and `onClaude()` in `team-core.js`.

## The core port

Every page gets its core from `connect()` in `src/js/core-port.js` and from nowhere else. Today that is the core that runs in
the page. A core is an object with:

| Call | What it does |
|---|---|
| `snapshot()` | The whole visible state, synchronously, as a plain object |
| `on(fn)` | `fn(type)` after every change; pages re-render from `snapshot()` |
| `adopt(session)` / `stop()` | The session Start hands over; ending it |
| `useEngine(engine)` | The engine under the team: how a seat speaks, routes a message and works in the workspace |
| `send(text, options)` | A message from the user: the team decides whether it is talk, a question, something to find out or a change |
| `linkWorkspace({ kind, name })` | `github` or `local` |
| `focusTicket(ticket)` | The Jira ticket the chat is about |
| `ask(question)` | Vision: what the team's memory holds on a question, ranked, with where each item came from |
| `setupDo(id, action)` | Something under a message was pressed: choose a folder, open or stop a site, put the app on a phone |

A core that ran somewhere else would be one adapter behind `connect()`, and no page would change.

## The bundle and the launcher

`tools/bundle.mjs` copies what ships from `src/` to `dist/`, refuses the bundle if any page uses a root-absolute path, and
writes `manifest.json`: every file with its SHA-256. The version is a hash of that list, so the same files always give the same
version and the same IPFS address.

`myfamilyoffice.sh` needs nothing installed. It looks for Node.js 22.19 or newer; if there is none it fetches Node's own build
into `~/.familyoffice/node` and checks it against the checksum Node publishes. `myfamilyoffice.mjs` then reads the site's
manifest, fetches the files this machine does not have, refuses to write or start anything that does not match the list,
starts `server.mjs` on `127.0.0.1` and opens it. Run again, it checks the site for a newer copy and starts the installed one if
the site cannot be reached.
