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

## Not measured

- No real run of the plan and the loop went round a second time for a requirement that truly was not met.
- Swift tickets other than "find" on a local model; the two layout tickets (a Compose button and a Flutter button whose width
  must follow the screen) are wrong on the local model and proven on Claude Code.
- Nothing on a machine other than the one above, on a model other than the two named, or with the chat on a real Jira ticket.
