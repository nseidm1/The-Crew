# The checks

Every check is a plain Node script that prints one line for each thing it checked (`ok` or `FAIL`) and exits non-zero if
anything failed. None of them installs software, signs in anywhere or reaches a real service: every outside program is a
stand-in from `fakes/`.

```bash
npm test                       # core and runner: no browser needed
npm run test:browser           # the app in Chromium (needs Playwright)
npm run test:landing           # the landing page (needs Playwright)
npm run test:all               # everything, one after another
node tests/run.mjs core/plan-loop        # one check
```

Suites are never run two at a time: they start servers on fixed ports and browsers of their own.

## Playwright

The browser checks need Playwright's Chromium:

```bash
npm install
npx playwright install chromium
```

If Playwright is already installed somewhere else on the machine, point at that folder's `package.json` instead:
`FO_PLAYWRIGHT=/path/to/package.json npm run test:browser`.

## What each check covers

### `core/` the team core, in Node, with a stand-in engine

| Check | Covers | Checks |
|---|---|---|
| `plan-loop.mjs` | Requirements from a request or a ticket; build, prove, judge; each way the loop stops; nothing lands with a requirement open | 27 |
| `developer-setup.mjs` | Someone new and someone experienced; a folder to choose; a website served and stopped; a phone absent and plugged in | 18 |
| `answer-cards.mjs` | In Simple: a card made only from an answer's own figures; a warning is never left out; an answer a card stands for is never shown as words first; picks and their pictures | 18 |
| `knows-you.mjs` | What a person says of themself is kept in their own words, shown to every seat, and can be listed and forgotten | 13 |
| `conversation.mjs` | How a person writes is read from their own words and each seat is told what that asks of it; the manners of the room in each mode; an engineer told from someone starting out; the short form a local model is given, the shape of the reply said last, and what is tidied from an answer | 35 |
| `moods.mjs` | What a face shows for a message and for a seat at work, in both modes | 4 |
| `extras.mjs` | What goes under a reply: answers to tap, fields, a timer, a worked sum, a day and its calendar file, commands, seen and not seen | 19 |
| `threads.mjs` | One of the five sets another going; a mark in place of a line; what a reply keeps under it; a plan's sections; a comparison card ; a fact checked by a blank slate, and by a second that tries to break it | 18 |
| `hindsight.mjs` | Experiences, the person's corrections and "told twice", a fault seen twice adding its line, recall by rare words, by what was kept together, by the earlier attempt and by file, a seat given more when it was not told, and what may leave the machine ; the soul's edges and the walk through them | 22 |

### `runner/` the runner, over HTTP

| Check | Covers | Checks |
|---|---|---|
| `self-test.mjs` | The whole runner: setup on every engine and its refusals, the agent check, the workspace, proofs and their rounds, Jira, plans, the phone link, the owner's panel, the launcher and the bundle | 529 |
| `host.mjs` | A plain folder made a workspace; a website served to this computer only; a phone that is or is not plugged in | 14 |
| `banner.mjs` | The installer's banner in a real terminal at every width: it fits, it is plain ASCII, it is drawn again on a resize, and never into a pipe | 9 |
| `run-here.mjs` | Which commands the runner will run for a press in the chat, and which it never will | 3 |

### `browser/` the real pages and the real runner, in Chromium

| Check | Covers | Checks |
|---|---|---|
| `app-pages.mjs` | Start and the app's pages against stand-ins for every engine and connector | 65 |
| `modes.mjs` | Simple and Developer as a person meets them, and switching between them in place | 55 |
| `simple-characters.mjs` | Simple's five characters: in the empty chat, in a reply, while one is writing; at two sizes; with reduced motion | 15 |
| `phone-shell.mjs` | The app on a phone: one toolbar, the chat as the whole screen, the pages in a drawer | 11 |
| `plan-in-chat.mjs` | The plan and its rounds as the chat shows them, on a computer and a phone | 10 |
| `ticket-media.mjs` | A ticket's pictures: read, said in the chat, and kept on the ticket the team is talking about | 13 |
| `claude-sign-in.mjs` | Signing in to Claude as a step of setting up | 8 |
| `runner-restart.mjs` | The app replaced under an open page (an update): the page is connected to the new one again and counted as open | 3 |
| `picture-cards.mjs` | A card of picks with a picture over each name; a picture that is missing or fails; the chat filling the window at any size | 8 |
| `under-a-reply.mjs` | Everything a reply carries under it, painted by the real app in both modes: the timer counts, the calendar file is handed over, a place opens on a map, a plan shows its sections and its choices | 15 |
| `crawl.mjs` | A full pass over every page, hosted and live, at computer and phone sizes; prints an `ISSUE` line for anything wrong | a crawl |

### `landing/` the landing page

These read pages from a running server. `tests/run.mjs landing` starts one for them; run alone, each takes a port
(`node tests/landing/alignment.mjs 5210`).

| Check | Covers |
|---|---|
| `landing-page.mjs` | What is above the fold, the film held still at each scene, the sections under it, a phone, reduced motion (26 checks) |
| `alignment.mjs` | Whether the top of the page is lined up on large screens, measured in pixels |
| `film-smoothness.mjs` | Every frame of one turn of the film compared with the one before it: nothing may switch on or off |
| `film-performance.mjs` | A measurement, not a check: frames a second and what a frame costs to draw |

## Where things go

`support/paths.mjs` says where a check finds the app (`src/`), the stand-ins (`tests/fakes/`), the browser, and a folder for
what it makes (`.work/`, ignored by git). `tests/run.mjs` keeps each check's whole output in `.work/logs/`.

## Adding one

Copy the nearest check, name it for what it checks, and add it to its suite in `run.mjs`.
[docs/development.md](../docs/development.md#how-a-check-is-written) says how one is written.
