// cards.js - A CARD IS THE REPLY (Simple): an answer that suits one is shown as a card made only from the answer's own figures, a
// warning is never left out of it, and the others at the table chime in when they have something to add.
import { isSimple } from '../mode.js';
import { caresOf } from '../team-soul.js';
import { seatAs, unsaid } from './base.js';
import { overlap } from './manners.js';

// THE CARD OF AN ANSWER, kept only as far as the answer itself bears it out: every number on it is one the answer gave, and its
// words are the answer's own (all of the main line's, most of any other line's). A card shows a main line, or rows of facts side by
// side, or a list of steps or of things to sort out; one that would show none of these is not shown.
export const CARD_ICON =
  /^(sun|cloud|part|rain|storm|snow|fog|wind|clock|calendar|tag|star|pin|check|steps|bulb|plane|fork)$/;

export const cardFrom = (card, answer) => {
  if (!card || !card.kind || card.kind === 'none') return null;
  const clip = (v, n) =>
    String(v == null ? '' : v)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  const nums = (v) => String(v == null ? '' : v).match(/\d+(?:[.,:]\d+)?/g) || [];
  const low = String(answer).toLowerCase();
  const wordsOf = (v) =>
    String(v == null ? '' : v)
      .toLowerCase()
      .match(/[a-zà-ÿ]{4,}/g) || [];
  const share = (v) => {
    const w = wordsOf(v);
    return w.length ? w.filter((x) => low.includes(x.replace(/(es|s)$/, ''))).length / w.length : 1;
  };
  const backed = (v, part) => nums(v).every((n) => String(answer).includes(n)) && share(v) >= part;
  const line = (v, n) => (clip(v, n) && backed(v, 0.6) ? clip(v, n) : '');
  const list = (v, n, len) =>
    (Array.isArray(v) ? v : [])
      .map((x) => clip(x, len))
      .filter((x) => x && backed(x, 0.6))
      .slice(0, n);
  const title = clip(card.title, 44);
  const big = clip(card.big, 28);
  const bigOk = !!big && (nums(big).length ? backed(big, 0) : wordsOf(big).length > 0 && backed(big, 1));
  const rows = (Array.isArray(card.rows) ? card.rows : [])
    .filter((r) => Array.isArray(r) && clip(r[0], 30) && clip(r[1], 60) && backed(r[1], 0.6))
    .slice(0, 6)
    .map((r) => [clip(r[0], 30), clip(r[1], 60)]);
  const items = list(card.items, 7, 90);
  const listed = items.length >= 2 && (/^(steps|list)$/.test(card.kind) || rows.length < 2);
  const good = list(card.good, 4, 90);
  const bad = list(card.bad, 4, 90);
  const warn = line(card.warn, 200);
  const note = line(card.note, 180);
  // PICKS: several named things to choose between, or in an order (films, places, books, dishes). A name is the answer's own, letter
  // for letter; what is said of it is held to the answer like any other line. And the one named thing a card is about (picture).
  const named = (v) => {
    const name = clip(v, 60);
    return name.length >= 2 && low.includes(name.toLowerCase()) ? name : '';
  };
  const picks = (Array.isArray(card.picks) ? card.picks : [])
    .map((p) => ({
      name: named(p && p.name),
      note: p && clip(p.note, 90) && backed(p.note, 0.6) ? clip(p.note, 90) : '',
    }))
    .filter((p) => p.name)
    .slice(0, 6);
  const picked = picks.length >= 2;
  // SIDE BY SIDE: two or three options weighed on the same points. The options are the answer's own names; a row is kept when what
  // it says of each option is borne out by the answer.
  const cmp = card.compare && typeof card.compare === 'object' ? card.compare : null;
  const options = (cmp && Array.isArray(cmp.options) ? cmp.options : []).map(named).filter(Boolean).slice(0, 3);
  const compared =
    options.length >= 2
      ? (Array.isArray(cmp.rows) ? cmp.rows : [])
          .filter((r) => Array.isArray(r) && clip(r[0], 24) && r.length >= options.length + 1)
          .map((r) => [clip(r[0], 24), ...options.map((_, i) => (backed(r[i + 1], 0.5) ? clip(r[i + 1], 44) : ''))])
          .filter((r) => r.slice(1).filter(Boolean).length === options.length)
          .slice(0, 5)
      : [];
  const sideBySide = compared.length >= 2;
  if (!title || !(bigOk || listed || picked || sideBySide || rows.length >= 2 || good.length + bad.length >= 2 || warn))
    return null;
  return {
    kind: clip(card.kind, 12),
    icon: CARD_ICON.test(card.icon)
      ? card.icon
      : card.kind === 'steps'
        ? 'steps'
        : card.kind === 'list'
          ? 'check'
          : 'pin',
    title,
    big: bigOk ? big : '',
    small: line(card.small, 90),
    rows: listed || picked || sideBySide ? [] : rows,
    compare: sideBySide ? { options, rows: compared } : null,
    items: listed && !picked ? items : [],
    picks: picked ? picks : [],
    picture: named(card.picture),
    numbered: card.kind === 'steps',
    good,
    bad,
    warn,
    note,
  };
};

// THE CARD IS THE REPLY, so it has to carry the answer. It does not when it leaves out too many of the answer's figures (a source
// mark, [1], is not a figure), or when the answer gives a warning and the card has nowhere said one. Says why not, or nothing.
export const WARNS =
  /\b(warning|careful|caution|danger(ous)?|risk(y|s)?|hazard|harm(ful|s)?|toxic|poison(ous)?|chok(e|es|ing)|unsafe|not safe|avoid|too much|in moderation|sparingly|side effects?|allerg(y|ic)|fatal|emergency|see a (vet|doctor)|(never|do not|don't|should not|shouldn't) (feed|give|eat|use|mix|take|leave|let))\b/i;

export const carries = (card, answer) => {
  const a = String(answer)
    .replace(/\[[^\]\n]*\]\([^)\s]*\)|https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+\/\S*/g, ' ')
    .replace(/\[\d+\]/g, ' ');
  const all = [...new Set(a.match(/\d+(?:[.,:]\d+)?/g) || [])];
  const on = [
    card.title,
    card.big,
    card.small,
    card.note,
    card.warn,
    ...card.rows.flat(),
    ...card.items,
    ...(card.picks || []).flatMap((p) => [p.name, p.note]),
    ...(card.compare ? [...card.compare.options, ...card.compare.rows.flat()] : []),
    ...card.good,
    ...card.bad,
  ].join(' ');
  if (all.length >= 2 && all.filter((n) => on.includes(n)).length / all.length < 0.6)
    return "it leaves out too many of the answer's figures";
  return WARNS.test(a) && !(card.warn || card.bad.length || card.note)
    ? 'the answer gives a warning and the card does not'
    : '';
};

// A CARD FOR ANY REPLY THAT SUITS ONE (Simple). The seat that answered is asked, quietly, whether a card would help the person take
// the answer in, and what goes on it; what comes back is held to the answer (cardFrom). A looked-up answer is always asked about;
// any other is asked about when it has something to show (figures, steps, a list, or some length), and small talk never is.
export const CARD_ASK = (answer) =>
  'Here is an answer that was just given to a person:\n\n"' +
  answer.slice(0, 1300) +
  '"\n\nWould a small card help them take it in at a glance? The card is shown INSTEAD of the answer, so it has to hold everything in it that the person needs. A card suits: a yes or a no with its reasons; the weather; opening hours, a timetable or a date; a price or a budget; a score or a result; a place, or a few to choose between; steps to follow; a list of things to sort out or to bring; a few facts side by side. A card does not suit: a letter or a message written for them, small talk, a question back to them, an opinion, or an answer too long or too fine to fit on a card.\n' +
  'If one would help, reply with ONLY one JSON object and no other words:\n{"kind":"weather|times|price|score|place|steps|list|facts|picks|compare","icon":"sun|cloud|part|rain|storm|snow|fog|wind|clock|calendar|tag|star|pin|check|steps|bulb|plane|fork","title":"<the place, the thing or the question, at most six words>","big":"<the one figure or the few words that answer it, such as 18°C, 23:40, Closed Tuesdays or Yes, in small amounts; leave it empty when there is none>","small":"<a few words>","rows":[["<a label>","<a value>"]],"items":["<one step, or one thing to sort out, in at most twelve words>"],"good":["<one upside the answer gives, in at most twelve words>"],"bad":["<one downside the answer gives, in at most twelve words>"],"picks":[{"name":"<the exact name of one film, place, book, dish or thing, written as the answer writes it>","note":"<what the answer says of it, in at most twelve words>"}],"picture":"<the exact name, as the answer writes it, of the ONE film, place, person, animal, dish or thing the whole card is about, when a picture of it would help; otherwise empty>","warn":"<any warning the answer gives, in its own words: what could go wrong, and how to avoid it; leave it empty when the answer gives none>","note":"<one sentence the person still needs that fits nowhere else; leave it empty when there is none>"}\n' +
  'Use rows for facts side by side (at most six), or items for steps or a list (at most seven): not both. When the answer weighs two or three options against each other on the same points (which to buy, which way to go), add "compare":{"options":["<the first, as the answer names it>","<the second>"],"rows":[["<the point, in a word or two>","<what the answer says of the first>","<of the second>"]]} with two to five rows, and leave rows and items out. When the answer names several things to choose between, or ranks them (films, places, books, dishes, products), use picks instead of rows or items: one for each, at most six, each under its own name; a picture of each is found for the card. If the answer gives upsides, downsides or a warning, they go on the card (good, bad, warn): a warning is never left off. Use only what the answer says, in its own words and its own numbers, and leave out nothing that matters. If a card would not help, or could not hold it all, reply {"kind":"none"}.';

export const cardWorthy = (answer) => {
  const a = String(answer || '').trim();
  const words = a.split(/\s+/).filter(Boolean).length;
  if (unsaid(a) || words < 30 || (/\?$/.test(a) && words < 60)) return false;
  return (
    (a.match(/\d+(?:[.,:]\d+)?/g) || []).length >= 2 ||
    (a.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length >= 3 ||
    (a.match(/\b(first|then|next|after that|finally|step)\b/gi) || []).length >= 2 ||
    words >= 80
  );
};

// THE REST OF THE TEAM CHIMES IN (Simple): the person is mostly talking to one of the five, and it is a group chat. After an
// answer, whoever gave it is asked, quietly, which of the other four has something genuinely useful to add from its own job: a
// correction, a risk or a warning the answer missed, a practical tip, the short version of a long answer. At most two. Each of
// those then writes its line in its own voice (the shade over the chat says it is writing), or passes; a pass is never shown.
// Nobody chimes in to agree, to repeat or to praise. Each of the five has things it cares about (team-soul.js TEMPER.cares), and
// whoever answered is shown them: the one whose subject it is is the one who speaks up.
export const CHIME_ASK = (asked, by, said, others) =>
  (isSimple()
    ? 'A person asked their team, in a group chat: "'
    : 'A customer asked their software team, in the team channel: "') +
  asked.slice(0, 500) +
  '"\n' +
  by +
  ' answered: "' +
  said.slice(0, 900) +
  '"\n\nThe others on the team are:\n' +
  others
    .map(
      (x) =>
        '- ' +
        x.id +
        ': ' +
        x.title +
        ', who ' +
        (x.role || x.short || 'helps') +
        (caresOf(x.id) ? '. Cares about: ' + caresOf(x.id) : ''),
    )
    .join('\n') +
  '\n\nWould any of them have something genuinely useful to add from their own job: a correction, a risk or a warning the answer missed, a practical tip, an easier way, or the short version of a long answer? Or does it touch something one of them cares about, so that they would have a real, specific thing to say about it? Pick the one whose subject it is. Agreeing, repeating and praising are not useful. Reply with ONLY a JSON array of at most two, and no other words: [{"seat":"<one of the ids above>","point":"<what they would add, in at most 20 words>"}]. If nothing useful is left to add, reply [].';

// the same question for a small local model: short, with the one form of reply it is to give
export const CHIME_ASK_BRIEF = (asked, by, said, others) =>
  'QUESTION: "' +
  asked.slice(0, 300) +
  '"\nANSWER, by ' +
  by +
  ': "' +
  said.slice(0, 600) +
  '"\n\nTEAMMATES:\n' +
  others.map((x) => '- ' + x.id + ' (' + x.title + '): ' + (caresOf(x.id) || x.role || 'helps')).join('\n') +
  '\n\nCould ONE teammate add something useful that is NOT in the answer: a warning, a practical tip, or a correction? Reply with JSON only, on one line: [{"seat":"<id>","point":"<the new thing, at most 15 words>"}]. If the answer already covers it, reply [].';

// WHO WAS PICKED, read from what a model really writes. A small one thinks aloud first ("[]", a closing think mark, then the
// answer), fences its JSON, or names the person in place of the seat: the last array in the reply that parses is the answer, and a
// name is taken for its seat.
export const picksIn = (raw, pool, nameOf) => {
  const text = String(raw || '');
  const tail = text.slice(text.lastIndexOf('</think>') + 1 ? text.lastIndexOf('</think>') + 8 : 0);
  const arrays = (tail.match(/\[[^\[\]]*\]/g) || []).reverse();
  for (const a of arrays) {
    let got;
    try {
      got = JSON.parse(a);
    } catch {
      continue;
    }
    if (!Array.isArray(got)) continue;
    return got
      .filter((p) => p && typeof p === 'object')
      .map((p) => {
        const said = String(p.seat || '').toLowerCase();
        const id = pool.find((x) => x === said || String(nameOf(x)).toLowerCase() === said);
        return { seat: id || '', point: String(p.point || '').trim() };
      })
      .filter((p) => p.seat && p.point);
  }
  return [];
};

export function installCards(ctx) {
  // A PICTURE FOR WHAT A CARD IS ABOUT: a film's poster, a place, a dish. The runner on this machine finds one by the thing's name
  // (runner/web.mjs picture). A card with no picture found is the same card without one; nothing waits long for it.
  async function picturesFor(card, asked) {
    const names = [...new Set([card.picture, ...card.picks.map((p) => p.name)].filter(Boolean))].slice(0, 7);
    if (!names.length || !ctx.engine || !ctx.engine.tool) return;
    try {
      const hint = /\b(film|films|movie|movies|cinema|box office)\b/i.test(asked + ' ' + card.title) ? 'film' : '';
      const got = await ctx.engine.tool({ tool: 'picture', names, hint });
      const found = new Map(
        ((got && got.pictures) || [])
          .filter((x) => x && x.ok && x.url)
          .map((x) => [x.name, { url: x.url, page: x.page || '', from: x.from || '' }]),
      );
      if (found.has(card.picture)) card.image = found.get(card.picture);
      for (const p of card.picks) if (found.has(p.name)) p.image = found.get(p.name);
    } catch {
      /* no pictures could be found: the card stands without them */
    }
  }
  async function cardFor(lead, answer, text, lang) {
    const replyMsg = [...ctx.state.chat].reverse().find((x) => x.by === lead && x.kind !== 'tools' && x.text); // the reply the card would stand for
    try {
      if (!isSimple() || unsaid(answer)) return null;
      const raw = await ctx.quiet(lead, CARD_ASK(String(answer)), {
        doing: 'Drawing it',
        max: 460,
        customer: text,
        lang: lang || '',
      });
      ctx.state.cardTrace = { raw: String(raw).slice(0, 700), came: 'no JSON in the reply' };
      const a = raw.indexOf('{');
      const b = raw.lastIndexOf('}');
      const card = cardFrom(a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null, answer);
      const short = card ? carries(card, answer) : '';
      ctx.state.cardTrace.came =
        card && short
          ? 'a card, but ' + short + ': the words are shown instead'
          : card && replyMsg
            ? 'a card'
            : card
              ? 'a card, and no reply to put it on'
              : a >= 0 && b > a
                ? 'the reply was not a card the answer bears out'
                : 'no JSON in the reply';
      if (card && !short) await picturesFor(card, text);
      if (card && !short && replyMsg) {
        replyMsg.card = card;
        replyMsg.cardOnly = true;
      } // THE CARD IS THE REPLY: its words are kept (the team's memory, a reply to it) and not shown
      return card && !short ? card : null;
    } catch (e) {
      ctx.state.cardTrace = {
        ...(ctx.state.cardTrace || {}),
        came: 'it failed: ' + String((e && e.message) || e).slice(0, 120),
      };
      return null;
    } finally {
      if (replyMsg && (replyMsg.veil || replyMsg.card)) {
        delete replyMsg.veil;
        ctx.emit('chat');
      }
    } // card or no card, the reply is shown now
  }

  async function chimeIn(lead, asked, said, opts = {}) {
    if (unsaid(said) || !ctx.seat(lead)) return [];
    const simple = isSimple();
    const now = ctx.register();
    if (now && now.thanks) return []; // thanks is answered once, by one
    const pool = ['overseer', 'steward', 'operations', 'ask', 'master'].filter(
      (id) => id !== lead && !(opts.skip || []).includes(id) && ctx.seat(id),
    );
    const out = [];
    try {
      const raw = await ctx.quiet(
        lead,
        (ctx.onClaude() ? CHIME_ASK : CHIME_ASK_BRIEF)(
          String(asked),
          seatAs(ctx.seat(lead)).title,
          String(said),
          pool.map((id) => ({ id, ...seatAs(ctx.seat(id)) })),
        ),
        { doing: 'Seeing who has something to add', max: 170, customer: asked, lang: opts.lang || '' },
      );
      const picks = picksIn(raw, pool, (id) => seatAs(ctx.seat(id)).title)
        .filter((p) => overlap(p.point, said) < 0.75) // "the new thing" that is the answer again is not new
        .filter((p, i, all) => all.findIndex((q) => q.seat === p.seat) === i)
        .slice(0, opts.max || (simple ? 2 : 1)); // a team channel takes one more voice, a group chat two
      ctx.state.chimeTrace = { raw: String(raw).slice(0, 400), picked: picks.map((p) => p.seat), said: [] };
      for (const pick of picks) {
        const text = await ctx.quiet(
          pick.seat,
          ctx.mannerNote() +
            (simple
              ? 'You are in the group chat. The person asked the team: "'
              : 'You are in the team channel. The customer asked the team: "') +
            String(asked).slice(0, 500) +
            '". ' +
            seatAs(ctx.seat(lead)).title +
            ' has answered: "' +
            String(said).slice(0, 900) +
            '"' +
            (out.length
              ? ' Then ' +
                out.map((x) => seatAs(ctx.seat(x.by)).title + ' added: "' + x.text + '"').join(', and ') +
                '.'
              : '') +
            '\n\nYou are chiming in because you may have this to add from your own job: ' +
            String(pick.point).slice(0, 200) +
            '\nSay it to the person in at most 35 words, as yourself, the way you would drop a line into a group chat; if it is something you care about, let that show. ' +
            (ctx.onClaude()
              ? 'If you are building on what a teammate said, or see it differently, you can name them in passing ("Alex has it. One thing though..."). '
              : 'Say only the new thing. ') +
            'Do not repeat what was already said, do not greet them, and do not praise the answer. If, reading it again, nothing useful is left to add, reply with the one word PASS.',
          { doing: 'Writing', max: 130, customer: asked, lang: opts.lang || '' },
        );
        const line = text
          .replace(/\*\*([^*\n]+)\*\*/g, '$1')
          .replace(/^["“]|["”]$/g, '')
          .trim();
        const own = seatAs(ctx.seat(pick.seat)).title;
        if (
          !line ||
          unsaid(line) ||
          /^\W*pass\b\W*$/i.test(line) ||
          line.split(/\s+/).length > 70 ||
          overlap(line, said) >= 0.75 || // it says the answer again
          new RegExp('^\\W*' + own + '\\b', 'i').test(line) // it speaks of itself by name: a line copied, not meant
        ) {
          ctx.state.chimeTrace.said.push(pick.seat + ': passed');
          // it had nothing new, only agreement: that is a mark on the answer, not a line
          if (line && !unsaid(line) && overlap(line, said) >= 0.75) {
            const answered = [...ctx.state.chat].reverse().find((m) => m.by === lead && m.text);
            if (answered) ctx.react(answered, pick.seat, 'agreed');
          }
          continue;
        }
        ctx.post(pick.seat, line, { chime: true });
        out.push({ by: pick.seat, text: line });
        ctx.state.chimeTrace.said.push(pick.seat + ': spoke');
      }
    } catch (e) {
      ctx.state.chimeTrace = { ...(ctx.state.chimeTrace || {}), failed: String((e && e.message) || e).slice(0, 120) };
    }
    // what one of them added may set the one who answered going again (team/thread.js): a doubt is looked up, a correction taken
    if (out.length && !opts.settled) await ctx.takeUp(lead, asked, said, out, opts).catch(() => '');
    return out;
  }

  Object.assign(ctx, { cardFor, chimeIn });
}
