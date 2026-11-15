# Ideas

What else the team could put in front of a person. Each round of [`train`](TRAIN.md) adds to this list, re-ranks it, and builds
the top idea that needs no decision from the owner.

An idea earns its place the way a card does now: it shows only what the team actually said or did, it never claims something
that did not happen, and it works without the network unless looking something up is the point.

## What exists today

| In the chat | Mode | What it is |
|---|---|---|
| Answer card | Simple | Steps, a warning, or several picks with pictures, each line the answer's own |
| Sources | Both | Where a looked-up answer was read |
| Plan card | Developer | The requirements, each round's verdicts, how it ended |
| Setup card | Developer | A button for what the team needs from this computer: a folder, a site, a phone |
| Landing | Developer | A yes or a no on a proven change |

## Ranked

Value is what it does for the person; cost is the size of the change; **needs** says whether the owner has to decide something
first. All fourteen are now clear to build: the four that needed a word have it.

| # | Idea | Mode | What the person gets | Why now | Needs |
|---|---|---|---|---|---|
| 1 | **Where this came from**, with **Check this** | Simple | A quiet line under an answer: *looked up, 3 sources* or *from memory*. Under a from-memory answer, a button that looks it up and says whether it held | The local model is confidently wrong about some everyday facts, and the person cannot tell which. Measured in `substance.mjs` | Nothing |
| 2 | **Quick replies** | Both | When the team asks one question back, two to four answers to tap, taken from the choices the reply itself named | People in a chat answer a question with a tap. It also removes a round trip the trainers show happening often | Nothing |
| 3 | **Seen, and not seen** | Developer | Under an answer about the customer's code: what the team was shown, what it was not, and a button to attach the missing thing (a log, a file) | The fault a local model kept making was describing files nobody showed it. This makes the gap visible and closable | Nothing |
| 4 | **A sum, worked** | Simple | A card that shows the working for an answer that is arithmetic ("a day for every 2 kg, 5 kg: two and a half days"), done by the app and not by the model | The one Simple fact still wrong after a lookup was a unit conversion the model got wrong with the right source in front of it | Nothing |
| 5 | **A timer on the card** | Simple | An answer that is a duration ("six minutes") carries a Start button; it counts down in the chat and says when it is done | The card already knows the number. It turns an answer into the thing the person was about to do next | Nothing |
| 6 | **Proof strip** | Developer | The runs of a proof as a row: red, red, green, each with its time, each opening to its output. For a change to a screen, before and after side by side | Proofs are the product's claim. Today they are read on their own page; this puts the evidence where the yes is given | Nothing |
| 7 | **A draft you can steer** | Simple | A letter or message in a card with Copy, and three taps under it: warmer, shorter, firmer. A tap is kept as how this person likes things | The wish is already kept when typed ("make it shorter"). A tap makes it one motion | Nothing |
| 8 | **Side by side** | Both | Two or three options as columns with the same rows (cost, time, best for), when the question is which | A comparison in sentences is the hardest thing to read in a chat | Nothing |
| 9 | **A small form** | Both | When the team needs two or three facts before it can start, one card with a field for each, not three questions in a row | The trainers show a local model asking again for what it was told | Nothing |
| 10 | **More than yes and no** | Developer | On a proven change: land it, hold it for a review, or show me the diff first | A yes-or-no on landing leaves out the two things people most often want | Nothing |
| 11 | **Day plan** | Simple | An outing as times down a line, with a file for the calendar | Plans are what the organizer is for | Approved by the owner, 14 November 2026: the person may be handed a calendar file to save |
| 12 | **Reactions** | Simple | A teammate marks an answer (agreed, checked) without writing a line | It is how a group chat agrees. Fewer chimes that only agree | Approved, 14 November 2026: a teammate may mark an answer. Marks are for reactions only; what the five write stays as it is |
| 13 | **Open it on a map** | Simple | A place pick opens in the person's map application | Picks already carry a picture and a name | Approved, 14 November 2026: a pick may link out to a map |
| 14 | **Run it here** | Developer | A command in a card with Copy and Run; the output folds in under it | It closes the gap between advice and doing | Approved, 14 November 2026: a command may be run with one press. It still says what it will run before it runs, and only in the connected workspace |

## Ways to answer that are not typing

Kept apart because each is a mechanism several ideas above would share.

| Mechanism | Used by | Note |
|---|---|---|
| A tap that sends words | Quick replies, a draft you can steer, more than yes and no | The tap is a message from the person, shown in the chat as what they said |
| A field in a card | A small form, seen and not seen (attach) | What is typed is theirs and is read like any message |
| A control that stays in the card | A timer, a checklist that keeps its ticks | It changes nothing the team knows unless the person says so |
| A press that makes the team act | Check this, run it here | It says what it will do before it does it, and what happened after |

## The five's faces

Built on 14 November 2026: fourteen expressions for each of the five (`src/js/ui.js`, `src/js/team/mood.js`), the same in both
modes, each set by what the seat is doing or has just said. What could come next, in the order it would add most:

| # | Idea | What the person sees | Note |
|---|---|---|---|
| 1 | **They look at who is speaking** | While one of the five writes, the others in the strip above the chat turn their eyes to it; when the person types, all five look down at the box | The film already does this. The eyes are already separate parts |
| 2 | **A feeling that passes** | A reaction lasts a few seconds and settles back to rest: surprise when the person corrects the team, a wince when a proof goes red | Today a face holds the mood of its message. This needs a clock, and a rule for what outranks what |
| 3 | **Hands** | A wave on hello, a thumb up on done, a hand to the chin while thinking, a shrug when it does not know | The largest step in what a body can say. Each needs drawing for five shapes |
| 4 | **How much, not only which** | A little worried and very worried are different faces: the brows, the eyes and the sweat scale with it | The parts are already driven by one attribute; a second one for strength fits the same stylesheet |
| 5 | **Each in its own way** | Robin's doubt is a raised brow over the glasses; Jamie's joy throws sparks; Pat's pride is the smallest smile on the page | The same fourteen, drawn with each character's accent. It deepens the personalities the conversation trainer measures |
| 6 | **The film uses them** | In the landing page's flight the five show the same faces: listening when asked, pleased when the answer fits | The film draws its faces on a canvas, apart from the app's. They would be drawn from the same list |
| 7 | **Small restlessness** | At rest for a long while: a glance aside, a stretch, Alex's bolt flickering, Sam's lamp dimming | Keeps a quiet chat alive. Off for anyone who has asked for less motion |

## Built

Everything on this page was built on 14 and 15 November 2026. The lists above are kept as they were written, as the record of
what was asked for and why. How each came out:

| Idea | How it was built | Read off the reply, or chosen by the model |
|---|---|---|
| Where this came from, with Check this | A line under an answer that was looked up, or that is from memory and has a fact in it. Check this looks it up and says whether it held | Read off the reply |
| Quick replies | The choices a reply's last question itself names, or Yes and No; gone once the person has written again | Read off the reply |
| Seen, and not seen | What the customer named or attached, what the reply says it has not seen, and Attach it | Read off the reply |
| A sum, worked | A rate from the reply or its sources, times the amount in the question, worked by the app and shown with its working | Read off the reply |
| A timer | A duration given for something the person is about to do; counts down in the chat | Read off the reply |
| Proof strip | The runs of a proof under the message that carries it, red to green, each with why | The proof's own record |
| A draft you can steer | Copy, Warmer, Shorter, Firmer under a finished piece; a tap is kept as how this person likes things | The round that wrote it |
| Side by side | A table on a card: the options across, a row for each point, each cell held to the answer | Chosen by the model, held to the answer |
| A small form | A field for each of the two to four facts a reply asks for at once | Read off the reply |
| More than yes and no | Land it, Show me the diff first, Hold it for a review, Throw it away, on a proven change | The plan's own state |
| Day plan | Three or more times with what happens then, down a line, and a calendar file of it | Read off the reply |
| Reactions | The fact-checker's agreement, and a teammate who had nothing new to add, are a mark on the answer | What the team did |
| Open it on a map | A link on each pick of a card of places, narrowed by where the person lives if the team knows | The card |
| Run it here | Copy on every command; Run on one that only reads or tests, in the connected workspace, decided again by the runner | Read off the reply |
| A plan that carries what its planner chose | Files, cases, the risk and the requirement that matters most, on the plan card | Chosen by the planner, each kept only when it says something |
| One of the five sets another going | A doubt is taken up and looked up; a correction is taken up by saying the answer again, put right; once for each thing the person says | Read off what was added |
| They look at who is speaking | The five above the chat turn their eyes to whoever writes, and down at the box while the person types | The chat's state |
| A feeling that passes | The five listen when the person writes, smile at a thank-you, start at being put right, then settle | What the person wrote |
| Hands | To the chin while thinking, out in a shrug when unsure, up when pleased, together when sorry | The mood |
| How much, not only which | Three strengths of worried, pleased, unsure, sorry and proud | Read off the reply |
| Each in its own way | Sam's lamp, Robin's brow over the glasses, Alex's bolt, Jamie's sparks, Pat's small smile | The mood |
| The film uses them | In the landing page's flight each of the five smiles once it has answered, and all five at the end | The film's own clock |
| Small restlessness | A glance aside now and then, each at its own moment | Always, at rest |

## Built after that

| Idea | How it was built |
|---|---|
| Run it here, read back | What a command printed is read by the seat that gave it, which says what it shows and the next step |
| A timer that says so | When the chat is not in front, the tab's title says the timer is done, and a notice does if the person allowed one (asked once, when a timer is started) |
| A day plan with its day | Today, tomorrow or the next of a weekday named in the question; the calendar file is made for it |
| A lesson that has to be answered | On the plan card: each lesson the team's memory holds on the work, answered by the round as applied, does not apply, or skipped |
| A seat that can ask the memory for more | A seat that says it was not told is given the rest of what the team holds on the question, and answers once more |
| "Again" and "still" recall the earlier attempt | The piece of work most like the question, how it ended and what had to be put right, put first |
| The soul as a graph | Everything kept is tied to what produced it, and recall walks two steps out from what a question names |
| A blank slate as fact-checker | A slot of the team's own model, opened empty with a brief: one that has not heard the answer, and for what someone will act on, one whose job is to break it |
| How the team is doing | Under Soul, and in the chat when asked: how much stood as first given, how often the person put it right and whether ever twice, what kinds of fault there were, and whether keeping lessons made the work shorter |

## What to look at next

| Idea | Why |
|---|---|
| A local model choosing a side-by-side card, plan sections and answering lessons | The three things a model has to produce in a form. Checked with a stand-in; not yet seen from a local model |
| A lesson that keeps not helping, offered to the person to remove | Its confidence already falls; nobody is told |
| First-pass share in the trainers | The product counts it. The trainers could read it from each run and lay engines side by side |
