# Research

What each round of [`train`](TRAIN.md) read, and what it made of it. Every entry here was read **as an abstract**, through arXiv's
public API (`research/arxiv.mjs`), unless it says the full text was read. An abstract says what a paper claims, not how well it
holds, so nothing below is taken as settled: each is a reason to measure something here, and the measurement decides.

Status: **adopted** (in the trainers or the product, with where), **parked** (worth doing, with what would start it),
**set aside** (read, and not for us, with why).

## Standing questions

Asked again every round, with whatever the last round left open added:

| Question | Search |
|---|---|
| Can a model's reading of another model be trusted? | `all:"LLM-as-a-judge" AND all:reliability` |
| How is a made-up or wrong fact caught without a second, larger model? | `all:"self-consistency" AND all:hallucination AND all:detection` |
| When should a small model look something up? | `all:"retrieval" AND all:"when to retrieve" AND all:adaptive` |
| Do several characters on one model stay apart? | `all:"persona" AND all:"consistency" AND all:"role-playing" AND all:evaluation` |
| Does the answer hold when the person pushes back? | `all:"sycophancy" AND all:"language models"` |
| What do small models do with instructions? | `all:"small language models" AND all:prompting AND all:instruction following` |
| What can a chat show besides text? | `all:"generative user interface" AND all:LLM` |

## Round 1 (14 November 2026)

Fourteen searches, 101 abstracts, nineteen read closely.

### Adopted

| Paper | What it says | What it became here |
|---|---|---|
| SAC3: semantic-aware cross-check consistency ([2311.01740](https://arxiv.org/abs/2311.01740)) | Asking the same question once more does not catch a model that is consistently wrong; asking it in other words catches more | `substance.mjs` asks every question a second way. A verdict that changes with the wording is **unstable**, and the question counts as its worse verdict |
| Drowzee: metamorphic testing for fact-conflicting hallucination ([2405.00648](https://arxiv.org/abs/2405.00648)); CheckList ([2005.04118](https://arxiv.org/abs/2005.04118)) | Test behaviour with relations that must hold (the same fact, differently put), not only with a fixed list and its answers | The same second wordings; and the conversation trainer's made-up people are behaviours (short, formal, hurried, heavy), not a list |
| Regression bugs are in your model ([2105.03048](https://arxiv.org/abs/2105.03048)) | An update that scores higher overall still breaks things that worked; count those separately (the negative flip rate) | Every full round names what was right last round and is not now. A flip makes the run exit non-zero |
| TRUTH DECAY ([2503.11656](https://arxiv.org/abs/2503.11656)); anti-sycophancy and rational updating ([2608.26511](https://arxiv.org/abs/2608.26511)) | Models give way over several turns; and a fix for that can stop them updating when the person is right | A right answer is pushed back on with insistence and no evidence, and must hold. The second half (updating on real evidence) is parked below |
| Flaw or artifact? Rethinking prompt sensitivity ([2509.01790](https://arxiv.org/abs/2509.01790)) | Much reported sensitivity to wording comes from rigid answer matching, not from the model | `substance.mjs --check`: the readers are run against replies whose verdict is known, before any model is asked. It found one misreading on its first run |
| Reliability and biases of a model as judge ([2412.12509](https://arxiv.org/abs/2412.12509), [2410.02736](https://arxiv.org/abs/2410.02736), [2506.13639](https://arxiv.org/abs/2506.13639)) | A model's judgement of other models varies with design choices and carries biases of its own | No trainer grades with a model, except the voices' reader, and that reader is now tried first on answers anyone could tell apart: if it cannot, its reading is void. On the local model it passed that trial and then named none of the real five, so the miss stands: there the five are not yet told apart by a reader |
| Prompt echoing in small instruct models ([2609.15045](https://arxiv.org/abs/2609.15045)) | Small models mirror their prompt, driven by copying mechanisms more than by memory of training data | Confirms what was seen ("No warm-up needed", "Alex has it" copied from an example). The local wording carries no quotable example, and the trainer reads for instructions said back |
| Creative multi-agent debate and diversity ([2609.00683](https://arxiv.org/abs/2609.00683)) | Agents that converse converge; a distinct, persistent lens for each keeps them apart | Each Simple voice has a way of speaking of its own, and the voices are read for it without a reader |

### Parked

| Paper | What it says | What would start it |
|---|---|---|
| Second Guess: abstention and answer stability in small models ([2605.25394](https://arxiv.org/abs/2605.25394)); training-free adaptive retrieval gating ([2511.09803](https://arxiv.org/abs/2511.09803)) | A small model that knows an answer gives it consistently; one that does not, wavers. A short draft's instability can decide when to look something up | Today a lookup in Simple is decided by the words of the question. Replacing that with two quick drafts that must agree is the next hardening if the word list misses questions or looks up too much |
| Verify when uncertain ([2502.15845](https://arxiv.org/abs/2502.15845)) | Self-consistency is close to its ceiling; a second, different model checking only the uncertain cases adds more | No second model is needed (the owner's ruling: an agent is a context and a brief). The fact-checker is a blank slate of the team's own model: `team/slate.js`. What it cannot catch is what the model gets wrong the same way every time, which is why a disagreement sends the team to look it up | Built |
| Abstention can be a prompt artifact ([2507.16199](https://arxiv.org/abs/2507.16199)) | Telling a model it may not know makes it refuse things it does know | The "you have not been shown their code" rule could do this. Watched through the **unsure** count on questions that need no file; a rise there starts the work |
| Quantifying persona faithfulness ([2405.07726](https://arxiv.org/abs/2405.07726)) | A character's reply should follow from the statements that bear on the question and contradict none of the rest | A trainer for the five's stated tastes: asked about what one cares for, does it show; asked about what it does not, does it stay out |
| Rational updating ([2608.26511](https://arxiv.org/abs/2608.26511)) | Holding under pressure and updating on evidence are different, and trade off | A second push that does carry evidence ("the packet says medium eggs"), after which the answer should change |
| Generative interfaces for language models ([2508.19227](https://arxiv.org/abs/2508.19227)); conformant generative UI ([2609.21285](https://arxiv.org/abs/2609.21285)) | A reply can be a small task-specific interface built from a structured description; what is generated still has to conform to the design | The cards are this, kept narrow: a fixed set of forms, each line the answer's own. See `ideas.md` |

### Set aside

| Paper | Why |
|---|---|
| Hallucination detection from a model's internal states ([2402.03744](https://arxiv.org/abs/2402.03744)) and from decoding memories ([2508.21228](https://arxiv.org/abs/2508.21228)) | The team reaches its model through an ordinary chat endpoint; internal states are not available on Claude Code at all |
| Persona consistency through contrastive training ([2503.17662](https://arxiv.org/abs/2503.17662)) and pinpoint tuning against sycophancy ([2409.01658](https://arxiv.org/abs/2409.01658)) | Training-time methods. Nothing here trains a model |
| User simulators for conversational recommenders ([2403.16416](https://arxiv.org/abs/2403.16416), [2604.24977](https://arxiv.org/abs/2604.24977)) | The first reports that simulated users leak and flatter. The trainers' people stay scripted until a reason appears to simulate them |

## From the system this team comes from (15 November 2026)

The Crew is modelled on a working system. At the owner's word its source was read for ideas: read only, nothing copied, and none
of its tools run (its own memory could not be queried from here; only the code that implements it was read). What its Vision
does that The Crew's does not yet, as ideas to measure here:

| What it does there | What it would be here | Status |
|---|---|---|
| Memory is pushed and can be pulled. A short block is put in front of a seat at the start of a turn, and a seat that needs more asks the same memory a question in the middle of one | Today a seat is shown three things before it speaks and cannot ask for more. A seat that says it does not remember, or that was not told, would ask the team's memory, the way one that does not know now has it looked up | Built: a seat that says it was not told is given the rest of what the team holds, once |
| The hint to ask is a ready question, chosen by what the turn is about: a failure names its earlier failures and their fixes, a thing worked before names what happened last time, "again" and "still" name the earlier attempt | When the person says "again", "still", "like last time" or "why does this keep", recall is aimed at the earlier attempt and how it ended, not at the words of the new message | Built: "again", "still" and "like last time" bring back the earlier attempt first |
| A lesson that matches the work is shown as a check to apply, and has to be answered (applied, or does not apply, with a line saying how) before the work goes on | In Developer a recalled lesson would become a line on the plan card that the round has to answer, beside the requirements, where today it is shown to the seat and may be passed over | Built, last of the Hindsight pieces: lessons are lines on the plan card that the round answers; one left unanswered is skipped and says so |
| What was shown is graded by whether it was then used, and the grade re-orders what is shown next: used things rise, things shown often and never used sink but are not removed | The Crew already counts shown and used for each lesson. The count does not yet change the order | Built: a lesson that has helped rises in recall, one shown three times and never used sinks |
| Every read has a time budget, a one-step off switch, and a book of misses; a read that fails or is late adds nothing and the turn goes on as before | The second opinion, the take-up of a doubt and Check this have no budget and keep no record of the times they did not answer | Built: a budget on the second opinion, the reading back of a command and the answering of lessons, and a book of the times each did not answer |
| A new gate runs in shadow first: for a day it only records what it would have refused, and that record is read before it is allowed to refuse anything | The rewrites added this round (a file never shown, a command that destroys) went straight to acting. The next such check records first | Adopted as a rule of the round: see `TRAIN.md` |

### Its Soul and its Hindsight

Read the same way, the same day. What is kept, and what is learned from it:

| What it does there | What it would be here | Status |
|---|---|---|
| The Soul is one graph. Everything kept is a node, and what produced what is an edge; recall starts from what the turn names and walks two steps out, so a related thing comes along even when it shares no words | The Crew's memory is a list matched on shared words. A lesson would be linked to the request, the proof and the ruling it came from, and recall would follow those links | Built: `team/graph.js`. Everything kept is a node, what produced what is an edge, and recall seeds and walks it two steps out. On the recall set: 29 of 29, against 20 by shared words |
| Rare words weigh more. A word found in many things seeds nothing | A lesson is recalled here when it shares two of the question's words, whichever they are. Common words would count for less | Built: measured by `recall.mjs`, 0.68 to 0.95 on its set together with the two below |
| A ruling that amends an earlier one supersedes it by naming it. Only the newest wording is served, and a reader can still see both and which governs | Rulings here supersede by subject. Asked what the team knows of them, the person is shown the earlier wording beside the one in force | Built |
| Nothing is changed in place. A later row replaces an earlier one and the earlier one is still there | A thing the person said of themself keeps its earlier wording beside the new one | Built |
| Every correction from the person in charge is kept as a lesson, tied to the message that made it, with the check that now enforces it (empty until one exists) | When the person puts the team right ("no, I said Tuesday"), that is kept as a lesson tied to their message, apart from what they like and who they are | Built: a correction is a lesson of its own, tied to what the person said |
| It counts repeats: a lesson that had to be given twice. Compounding is the share of corrections that were not repeats | "Were you ever told this twice?" is counted, shown under Soul and said when the team is asked how it is doing | Built |
| It counts landed lessons: the share whose check exists in code. A lesson that is only shown to a model is not landed | This round turned three lessons into checks (a reply's length, a file never shown, a command that destroys). The share is measured: of the kinds of fault seen, how many the app now catches itself | Built |
| Recall is scored without a model: a set of questions, each with the fact that answers it, and a stand-in answerer that hands back what it was shown. The score is exact | A trainer that asks only whether Vision put the needed thing in front of the seat. It costs nothing to run and cannot be argued with | Built: `recall.mjs`. On its first run it found three faults in how words were matched |
| The turns it is graded on are frozen, so every round grades the same ones, and what the grade cannot see is written beside it | The recall trainer's memory and questions are frozen in the script. Real chats from the runs are still not kept as a set | Built in part |
| Each part measures itself and files its own next fix. An improvement records before and after, and one that gained nothing is undone or filed again. A target that has been held tightens | A round here records before and after by hand. The bar would tighten by itself: a convention held for three rounds is asked for a little more | Built: `ratchet.mjs` raises a trainer's bar a step for every three clean full runs, and puts it back on a miss |
| No fix is silent. Whatever was put right by hand is counted under a class of fault | When the app rewrites a reply (a file never shown, a destructive command) or an answer is replaced after a teammate's doubt, that is a fault of a kind, and it is kept: what kind, how often, on which seat. Shown to the seat next time, it is Hindsight on the team's own mistakes | Built: every rewrite, removal and replaced answer is a fault of a kind, counted by seat |

### Its Hindsight, more closely

Its design for Hindsight was read as well as the code. There Hindsight is four kinds of thing and three acts, and one number that
says whether it helps:

| What it is there | What it would be here | Status |
|---|---|---|
| **Experiences.** One record for each finished piece of work: how many turns it took, how long, which lessons were put in front of the seat, and which it applied or passed over | The Crew keeps the lesson a round produced and not the round. A landed change, a piece handed over, an answer that had to be replaced: each would be kept as what happened, how many rounds it took, what was recalled and whether it was used | Built |
| **Baselines.** For each kind of work, the usual number of turns and the usual time, worked from past experiences | The usual rounds and time for each kind of work in each mode, once there are five to go by | Built |
| **Beliefs.** A lesson has a confidence that its outcomes move: applied and the work went better than usual, up; applied and it went no better, or passed over and the same thing went wrong again, down | A lesson here has counts of shown and used and no notion of whether using it helped. A lesson that keeps not helping is shown less. It is not yet offered to the person to remove | Built in part |
| **Facts.** Everything else that is kept | The same as today | Kept |
| **Retain, recall, reflect.** Reflect is the one The Crew lacks: a lesson that matches the work has to be answered, applied or does not apply and why, before the work goes on. It refuses once, then lets the work pass and records that the lesson was skipped | Already logged above as the lesson that has to be answered. It never blocks at all here: a skip is recorded and shown | Built |
| **One number, with a counterfactual.** Turns saved on work where a lesson was shown and applied, against the same kind of work where nothing was shown. Below five comparable pieces it reads unmeasured, never helpful | `soul.mjs` measures what was kept, obeyed, recalled and graded. It does not measure whether any of it made the work shorter or better. That is the number Hindsight exists for | Built: it reads unmeasured until there are five pieces of work of a kind with a lesson used and five with none |
| **Measure first, the costly step last.** The step that makes a seat stop and answer costs turns, so it was put last, after the part that can show whether it pays | The order for building it here: experiences and baselines, then the number, then beliefs, and only then making a seat answer a lesson | Adopted as the order |
| **One definition.** "Helpful" is defined once and every reading of it is that one | A lesson is used when the reply drew on it or the round answered it as applied; both are kept on the experience as one list | Built |
| **A read before acting names the files.** Before a seat works, it reads what is known about the question and about the files in play, and a read that fails says so and the work goes on | In Developer, lessons would be tied to the files a change touched, and recalled when those files are named again, whatever words the new request uses | Built |

### Its lessons

How the system this team comes from keeps and uses lessons, read from its code the same day:

| What it does there | What it would be here | Status |
|---|---|---|
| A lesson is booked for every decision on someone's work, with one of three outcomes: taken first time, corrected, or rejected. A decision cannot be made without its row, so the book never falls behind | Every reply would end as one of: stood, corrected (by the person, by a teammate, by the app) or replaced. **First-pass share**, by seat, mode and engine, is then a number the trainers and the product both have | Built: under Soul, and in the chat when the team is asked how it is doing |
| Each correction names its class, and "the line that would have prevented it". Classes corrected twice or more have their line put into the next brief by themselves | A reply that had to be corrected would record what kind of fault it was and the one instruction that prevents it. A kind seen twice adds its line to what that seat is told, without anyone writing a prompt | Built: a kind of fault seen twice from one seat adds its line to what that seat is told; three lines at most, and a kind not seen for a week comes off |
| Faults are sorted into named classes by ordered rules, and each class names the check that should catch the next one of its kind before a person has to | The classes seen so far here: answered with a question, opened with praise, said its instructions back, named what it was never shown, offered a command that destroys, repeated a teammate, gave way when pushed. Each already has a reader in a trainer; each names the check that catches it in the app, where there is one | Built |
| The rules that sort faults were narrowed one misfire at a time, each with the case that caused it written beside the rule | The same as the readers' fixtures in `substance.mjs --check` | Kept |
| A lesson is placed as high as it will honestly go: a refusal in code, then a check, then a standing instruction, then a note. A lesson in one seat's memory teaches one seat; in a gate it teaches every seat there will ever be | Here the ladder is: the app does it (a length the reply is held to, a rewrite), then a reader in a trainer, then a line in what a seat is told, then a lesson shown by Vision. This round's work moved several things up it. Each new lesson would be asked how high it can go | Adopted as a rule of the round |
| A lesson learned from a customer's session keeps method only. Before it may leave their machine, every path, file name, repository, address, email, token, identifier and run of their own words is taken out | The Crew has a setting for contributing what a team learns, off by default. Whatever it sends when on has to pass the same strip, on the machine, before anything leaves | Checked and built: the setting sends nothing today. What a sender would be handed is now made by `team/share.js`: lessons only, with everything of the person taken out |
