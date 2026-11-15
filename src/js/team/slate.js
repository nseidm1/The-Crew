// slate.js - A BLANK SLATE. A fact-checker does not have to be another model. An agent is a context and a brief; the same model with
// nothing in front of it but one question and one job is, for that moment, somebody who has not heard the answer, is not one of
// the five, has no manner to keep up and nobody to agree with. So a check is a slot of the team's own model, opened empty, given
// a brief, asked once and closed. The team opens one when it is worth it, and only then:
//   fact     asked the question as if for the first time: the fact alone. It never sees the answer, so it cannot lean on it
//   doubt    shown the claim and asked to break it: HOLDS, or WRONG and what is right. Opened only when the fact slate agreed
//            and the question is one a person will act on (whether something is safe; how much; how long)
// What a slate cannot do is know what the model does not know: two empty readings of one model agree when it is wrong the same
// way every time. That is what looking it up is for, and why a disagreement between slates sends the team to look.
// Every slate has a budget (ctx.within): one that is late is not waited for, and the miss is booked.
import { apartOn } from './manners.js';

export const SLATES = {
  fact: 'You are asked one question and you know nothing else: not who is asking, not what anyone has already said about it. You have no manner to keep and nobody to agree with. Reply with the fact alone, in one short line. If you do not know it, reply with the one word UNKNOWN.',
  doubt:
    'You are given a question and a claim made in answer to it. Your one job is to find what is wrong with the claim: a wrong figure, a wrong unit, a yes that should be a no, something unsafe. You did not make the claim and you owe it nothing. If it is wrong, reply "WRONG: " and the right fact in one short line. If you can find nothing wrong with it, reply with the one word HOLDS. No other words.',
};
// a question whose answer somebody acts on: the doubter is opened for these
export const STAKES =
  /\b(safe|dangerous|toxic|poison\w*|allerg\w*|dose|dosage|medicine|medication|tablets?|pills?|baby|infant|pregnan\w*|child(ren)?|dogs?|cats?|pets?|raw|undercooked|defrost|thaw|reheat|expire[sd]?|mix|bleach|electric\w*|gas|temperature|how (long|much|many|hot))\b/i;
const claimOf = (answer) =>
  String(answer || '')
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ')
    .slice(0, 360);

export function installSlates(ctx) {
  // one slot of the team's model, opened empty: the brief is all it is, and the ask is all it sees
  const slate = (kind, ask, o = {}) =>
    ctx.within(
      ctx.quiet(o.shownAs || 'steward', ask, {
        system: SLATES[kind],
        doing: o.doing || 'Checking it afresh',
        max: o.max || 50,
        lang: o.lang || '',
      }),
      o.ms || 20000,
      'a blank slate (' + kind + ')',
    );

  // -> { apart: '' | why, fact: what the slates said, slates: how many were opened }
  async function checkFact(asked, answer, o = {}) {
    const fact = String(
      await slate(
        'fact',
        'Someone asked: "' +
          String(asked).slice(0, 300) +
          '"\nGive only the fact, in one short line: the number with its unit, or a plain yes or no with the reason in five words. Nothing else.',
        {
          doing: 'Checking the figure',
          max: 40,
          lang: o.lang,
        },
      ),
    ).trim();
    const known = fact && !/^\W*unknown\b/i.test(fact);
    let apart = known ? apartOn(answer, fact) : '';
    let slates = 1;
    let said = known ? fact : '';
    if (!apart && STAKES.test(String(asked))) {
      slates = 2;
      const verdict = String(
        await slate(
          'doubt',
          'The question: "' + String(asked).slice(0, 300) + '"\nThe claim: "' + claimOf(answer) + '"',
          { doing: 'Trying to break it', max: 50, lang: o.lang },
        ),
      ).trim();
      const wrong = /^\W*wrong\b\s*[:.-]?\s*(.+)$/is.exec(verdict);
      if (wrong) {
        const right = wrong[1].replace(/\s+/g, ' ').trim().slice(0, 160);
        // the doubter has to SAY something different, in a way that can be read: a yes against a no, or an amount that does not agree
        const differs = apartOn(answer, right);
        if (differs) {
          apart = differs;
          said = right;
        }
      }
    }
    ctx.state.slateTrace = { fact, apart, slates, at: Date.now() };
    return { apart, fact: said, slates };
  }

  Object.assign(ctx, { slate, checkFact });
}
