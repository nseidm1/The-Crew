# Train

`train` is a standing command. One word starts one round, and every round does the same things in the same order: read what is
new, make the trainers better, run them, harden the product on what they show, and widen what the team can put in front of a
person. A round ends with numbers that can be compared with the last round's, and with nothing lost that was not named.

The trainers are the scripts in this folder. They measure a real team (the product from `src/`, a real model, a real browser)
and read each reply by its own words. Nothing in a round fine-tunes a model: what improves is the product's instructions, its
routing, its checks and what it shows.

## A round, in order

| Step | What is done | What it leaves behind |
|---|---|---|
| 1. Read | `research.md`, `ideas.md`, and the last rows of `results/history.jsonl`: where the last round stopped and what it parked | Nothing |
| 2. Research | New papers from arXiv on the questions the last round left open (`research/arxiv.mjs`; the standing questions are at the top of `research.md`, and each round adds its own) | An entry in `research.md` for each paper that bears on the trainers or the product: what it found, what it means here, and whether it is adopted, parked or set aside |
| 3. Improve the trainers | At least one change to how the team is measured, taken from the research or from a reply the readers got wrong. `node training/substance.mjs --check` must pass before any model is asked | The change, and a reader fixture for every misreading found |
| 4. Measure | The trainers below, on the local model and on Claude Code, in Simple and in Developer | Rows in `.work/train/`, a summary in `results/` |
| 5. Read the replies | Every reply that is not right is read, and so is a sample of the ones that are. A count is believed only after the words behind it have been | The faults, named, in the round's notes |
| 6. Harden | One mechanism for each fault, the most general one that fits: a route, a check on the reply, a shorter instruction, a lesson. Anything written with a known question in mind is marked taught, and the held-out questions are reported apart | The change, and a check in `tests/` for it |
| 7. Measure again | The same trainers. What was right and is not now is a **flip**, and is named and explained or put right | The round's numbers |
| 8. Explore | What else the team could put in front of a person: cards, proof displays, buttons, ways to answer (`ideas.md`). Ideas are added and ranked; the top one that needs no decision from the owner is built, with its checks | A built idea, or the reason none was |
| 9. Close | Every suite (`tests/run.mjs all`), the formatter, the bundle, the documents. The report says what changed, the numbers before and after, each flip, what is unverified and what the next round starts from | The report |

## The trainers

| Script | Measures | Each round |
|---|---|---|
| `substance.mjs` | Whether what the team says is true: every question two ways, a right answer pushed back on, flips since the last round | Both modes, both engines |
| `recall.mjs` | Whether Vision puts the right thing in front of a seat. No model, a few seconds | Every round, first, and after any change to recall |
| `ratchet.mjs --write` | Which bars have been held for three full runs, and raises them | At the end of every round |
| `manners.mjs` | Whether it talks the way people talk: register, turns, the room, who it took the person for | Both modes, both engines |
| `voices.mjs` | Whether five seats on one model are five voices | The local model; Claude Code when a voice was changed |
| `knows.mjs`, `simple.mjs`, `soul.mjs`, `attached.mjs` | Memory, everyday requests, Soul and Hindsight, an attached ticket | When the round touched what they measure |
| `plan.mjs`, `train.mjs` | The plan and the loop; Developer tickets against a hidden check | When the round touched building or proving |
| `discuss.mjs` | Whether the team talks an idea through with someone who is thinking it over, and builds only when they say to start; asks what an app should run on (phones, a computer, the web) where nobody said; an engineer who asks outright is still built for | Both modes, when the round touched routing, the round's questions or how the team reads who it is talking to |

## Rules a round keeps

- **Words before counts.** The first run of the conversation trainer scored a local model 24 of 24 while it answered questions
  with questions and spoke with one voice. Every round reads replies first.
- **A reader is checked before it is believed.** A reader that misreads a reply blames or excuses the team for nothing. Each
  misreading becomes a fixture in `--check`.
- **Held out stays held out.** A question the product was given a lesson for is marked `taught` and reported apart. A round
  never adds a lesson for a held-out question; it moves the question to taught and writes a new held-out one.
- **A model that reads other models is tried first.** Where a model is the reader (the voices), it is first given answers anyone
  could tell apart. If it cannot, its reading is void.
- **No flip goes unnamed.** A total that rose by one can hide one that was lost.
- **A new check watches before it acts.** A check that would change or refuse a reply runs first in shadow: it records what it
  would have done, the record is read, and only then is it allowed to act. A check that fires on replies that were fine is found
  this way, before anyone meets it.
- **A change that gained nothing is undone.** Each hardening is measured before and after on the trainer that showed the fault. If
  the number did not move, it is taken out or filed again with what was learned: it is not left in as something that might help.
- **A bar that is held tightens.** A convention or a reader that has held for three rounds on both engines is asked for a little
  more in the next (a shorter reply, a stricter reading), so that a round is never only a repeat of the last.
- **A lesson goes as high as it honestly can.** In order: the app does it itself (a length a reply is held to, a rewrite), a reader in
  a trainer catches it, a line in what a seat is told asks for it, Vision shows it as a lesson. Something that can be done by the
  app is not left as a line in a prompt.
- **One round, one build.** Step 8 builds one idea, small enough to check in the same round.
- **Spend is said.** A run on Claude Code spends the owner's plan and refuses to start without `--spend-claude`. The local model
  costs nothing and is run first.
- **Nothing is committed, pushed or published by a round.** Those are the owner's.

## Running a round's measurements by hand

```bash
node training/substance.mjs --check                                   # the readers, against replies whose verdict is known
node training/substance.mjs --mode simple                             # the local model that is set up
node training/substance.mjs --mode developer
node training/manners.mjs --mode simple --setup '{"model":"nemotron35-30b"}'
node training/manners.mjs --mode developer --setup '{"model":"nemotron35-30b"}'
node training/voices.mjs
node training/discuss.mjs --check                                    # its readers, against replies whose verdict is known
node training/discuss.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
node training/substance.mjs --mode simple --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
node training/research/arxiv.mjs .work/research.json 'all:"prompt echoing" AND all:"small language models"'
```
