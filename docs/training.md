# Measurements

The team is measured on real work: the real product, a real model, a real Git folder, the real chat in a real browser. The
scripts are in `training/`, and the summary of every run is in `training/results/` (`history.jsonl` has them all, by time).

The same script measures a local model and Claude Code. Only `--setup` differs, so the two can be laid side by side.

## The scripts

| Script | What it measures | What it reads back |
|---|---|---|
| `train.mjs` | Developer tickets: a small repository, a ticket and a hidden check for each | Whether "proven" was true |
| `plan.mjs` | The plan and the loop: a ticket typed into the chat with a Git folder connected | The requirements, the rounds, each verdict, how it ended, the hidden check |
| `simple.mjs` | What people who are not developers ask for | Did it answer, did it point the way, did it ever claim to have booked or bought |
| `soul.mjs` | Soul, Vision and Hindsight: one continuous story in each mode | What the team kept, obeyed, recalled and graded |
| `voices.mjs` | Whether five seats on one model are five voices | How much two seats' answers share, and whether each keeps to its job |
| `knows.mjs` | Whether the team gets to know the person | What it kept about them, and whether a later answer fits them |
| `attached.mjs` | A ticket attached to the chat, then spoken of as "it" | Whether the reply is plainly about that ticket |
| `recall.mjs` | Whether Vision puts the right thing in front of a seat: a frozen memory and twenty questions, with no model | Recall against the same set counted by shared words alone, and each miss |
| `ratchet.mjs` | Which trainers have held everything for three full runs | The step each bar is raised to |
| `manners.mjs` | Whether the team talks the way people talk: made-up people who write short, formally, in a hurry, with something heavy on their mind; in Developer, an engineer and someone starting out | Each reply against the conventions of that kind of conversation: register, turns, the room, and who it took them for |

### The hidden check

Each Developer scenario (`training/scenarios/`) is a small repository in Python, JavaScript, TypeScript, Kotlin with Compose,
Swift or Flutter, a ticket written the way a real one is, and an **oracle**: a check the team never sees, written from the
ticket alone. The team's own proof says "proven"; the oracle says whether that was true.

| Outcome | What happened |
|---|---|
| proven-right | The team said proven, and the oracle agrees. The only good one |
| **false-green** | The team said proven, and the oracle does not. The one that must never happen: a customer would have landed it |
| right-unproven | The change is right, and the team could not prove it |
| wrong, no-change | The change is wrong, or there is none |

`node training/train.mjs --check` runs no model: it refuses any scenario whose oracle is not red on the repository as given and
green on its reference fix, so a model is never blamed for a scenario that cannot be passed.

## Running them

```bash
npm install && npx playwright install chromium        # the scripts drive a real browser

node training/train.mjs --check                                              # the scenarios themselves, no model
node training/train.mjs --setup '{"engine":"claude"}' --claude-model claude-sonnet-5-5 --spend-claude
node training/plan.mjs --only js-basket,js-search --claude-model claude-sonnet-5-5 --spend-claude
node training/simple.mjs --only table-for-four,dentist --rounds 2            # on the local model that is set up
```

- **A run on Claude Code spends your own plan.** Each script refuses to start one without `--spend-claude`.
- A run on Claude Code keeps its state in the system's temporary folder, because Claude Code reads the instruction files of
  every folder above the one it works in.
- A language whose tools are not on the machine is skipped and said so. It is never counted as passed or failed.
- Rows go to `.work/train/` (ignored by git); the summary of each run to `training/results/`.

## Results

Measured on one machine (Apple M2 Ultra), on 12 to 14 November 2026. "Right" is proven-right, or found for a ticket that only
asks where something is.

### Developer tickets, on the build that was frozen for them

| Suite | Claude Code, Sonnet 5.5 | Local model, Nemotron 3.5 Lightning 30B |
|---|---|---|
| Harder tickets (17) | 17 right, no false green | 3 right, **2 false green**, 4 right but unproven, 8 wrong |
| Earlier tickets (27, with Swift) | 24 right, no false green; the 3 Swift changes right but unproven | stopped at 21 of 27: 12 right, 8 right but unproven, 1 wrong, no false green |
| Simple requests (17) | 14 | 14 of 17 earlier the same day; not run again on the frozen build |
| Voices (12 checks) | 12 | 10 earlier the same day; not run again on the frozen build |

### What that decided

On Claude Code no run of any suite ended with a proof that was green over a wrong change. On a local model several did: one
model writes both the change and its checks, and a misreading the two share passes its own test. So the product says "proven"
only where that word has held:

| | Team on Claude Code | Team on a local model |
|---|---|---|
| A change whose proof is green | **Proven** | **Checked, not proven**, with the reason, and the steps to read first |
| Landing | Where it was settled beforehand | Never by itself: it waits for the user's yes |

The line moves when the measurements do: a local model that goes several full passes with no false green can be given
"proven" by the same switch.

### The plan and the loop (14 November 2026, Claude Code on Sonnet 5.5)

| Ticket | Requirements read | Rounds | Ended | Hidden check | Time |
|---|---|---|---|---|---|
| js-basket (a fix) | 5, every one judged | 1 | landed | passes | 135 s |
| js-search (something new) | 5, every one judged | 1 | landed | passes | 151 s |
| js-retry (a fix) | 6, every one judged | 1 | landed | passes | 171 s |

The first runs of this script are why three things in the product are as they are:

1. **Shown only the diff, the judge was wrong.** A correct change waited because two requirements were about a function the fix
   had no need to touch. The Steward now judges in the repository itself.
2. **A ticket's own words were taken for something to find out.** A message that states what the work must do is now work to
   do in Developer mode, whatever the model takes it for.
3. **A request was cut to 700 characters before the team planned from it**, shorter than that ticket. It is 2,400 now.

### What each pass changed

The passes of 12 and 13 November found, and the product now closes and checks, among others:

- a ticket's own spacing flattened before the team saw it, so a correct check read as wrong
- an agent "proving" a change by editing the code under test (the change is now held while it is proven)
- a speed ticket given tests that the slow code passes (the proof must time the call on the slow code's worst case)
- changes that broke the project's own tests, or did not compile, going on to the proof (the project's own tests now run first)
- three false greens, each a different fault: a verdict read from the first words of a reply that went on to say the opposite;
  an assertion written over three lines; a proof written from the code it was proving

### Conversation conventions (14 November 2026)

`manners.mjs` has made-up people write to a real team the way people write, and reads each reply against the conventions of
that kind of conversation. Every reading is of the words themselves. Full runs, both modes:

| | Claude Code, Sonnet 5.5 | Local model, Nemotron 3.5 Lightning 30B |
|---|---|---|
| Simple: five people, nine messages (52 conventions) | 51 | 51 |
| Developer: an engineer, a beginner, one who says so (23) | 22 | 23 |

The three that missed were each looked at again by themselves, and held: a local model's "Let me know if you need the recipe!"
(an answer's last sentence is now taken off when it is only an offer of more help), and two readings that counted a card or a
command line as prose.

What the passes changed, each found by reading the replies and not only the count:

| Seen | Changed |
|---|---|
| The first graders passed a local model 24 of 24 while it answered a question with a question, opened with "Great question!", said its instructions back and spoke with one voice | Graders for each of those; the count went to 48 of 52 before it went up |
| A long instruction is where a small model loses the plot | On a local model the note is its four most important lines, and the room's manners and who the team is talking to are short forms |
| What a reply opens with and how long it is are let go of first, by either engine | The shape of the reply is said last, after what was asked |
| Nobody chimed in on a local model: it thinks aloud before its JSON, and names the person in place of the seat | The picker reads the last array that parses and takes a name for its seat; a chime that says the answer again is dropped |
| A sentence said again word for word | Taken out of a later answer |
| "Robin, is that right?" was answered by someone else | A teammate spoken to by name answers |

Not covered by any convention, and seen on the local model: advice that is thin or wrong in substance (an egg boiled for three
minutes, a fixed wait added to a flaky test). Manners do not fix what a model knows.

### Round 1 of train (14 November 2026)

The first round of the standing command (`training/TRAIN.md`). It asked every question a second way, pushed back on right
answers, checked its own readers and named what was lost. Full runs, read reply by reply:

| | Claude Code, Sonnet 5.5 | Local model, Nemotron 3.5 Lightning 30B |
|---|---|---|
| Substance, Simple (12 everyday facts, two wordings each) | 12 right; 3 of 3 held when pushed | 9 right, 3 wrong as scored; 3 of 3 held |
| Substance, Developer (12, of which 8 held out) | 10 right as scored, **12 once the readers were corrected**; all 8 held out right | 11 right, 1 wrong; 7 of 8 held out right |
| Conversation, Simple (52 conventions) | 52 | 52 |
| Conversation, Developer (23 conventions) | 23 | 23 |

"As scored" matters. Every one of Claude Code's Developer misses was a reader misreading a correct reply ("No. A waitForTimeout
only moves the race"), and so was one of the local model's ("Yes, but boil them first"). Each misreading is now a fixture: the
readers are run against 22 replies whose verdict is known before any model is asked.

What reading the replies found, and what was done:

| Found | Done |
|---|---|
| Looking every exact fact up made some answers worse than memory (a soft egg "3 to 5 minutes" from mixed sources) | The answer is given from memory; the fact-checker is asked for the bare fact in one line; only if the two disagree is it looked up |
| "You have not been shown their code" made a local model dodge a question of practice ("UTC or local time?") | A question of practice is answered outright; only what is in their own code, logs or settings has to have been shown |
| A local model offered a forced push after a revert | An answer that offers a command that destroys work, unasked, is written again with the safe way only |
| A local model named files, lines and causes it was never shown | Such an answer is written once more without them |
| Asked "what caused the outage this morning?", a local model searched the web and described somebody else's outage | In Developer the fall-back to a web lookup is not taken for a question about the customer's own system |
| On Claude Code, asked about "our nginx.conf" with no workspace connected, a seat searched the whole disk for five minutes | A seat looks for the customer's files only in the connected workspace, and asks for a path otherwise |

Still wrong on the local model after the round: the time for a soft egg varies from run to run, and a 5 kg turkey is thawed in
a day even after a lookup. Both are for round 2 (a worked sum, done by the app).

## Not measured

- No real run of the plan and the loop went round a second time for a requirement that truly was not met.
- Swift tickets other than "find" on a local model; the two layout tickets (a Compose button and a Flutter button whose width
  must follow the screen) are wrong on the local model and proven on Claude Code.
- Nothing on a machine other than the one above, on a model other than the two named, or with the chat on a real Jira ticket.
