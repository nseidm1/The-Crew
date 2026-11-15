// mood.js - WHAT A FACE SHOWS. The five have faces that can change (js/ui.js, MOODS); this decides which feeling goes with what a
// seat is doing or has just said. It reads only what is there: the state of a message, what it carries (a card with a warning, a
// plan that landed, something the team could not do) and, last, its own first words. No model is asked, and nothing is shown that
// did not happen: a seat looks pleased because the change landed, not to please.
// The feelings are the same in both modes. What sets them differs where the work does: in Developer a failing proof is a face
// set to its work and a landed change is a proud one; in Simple a warning is a worried one and a hard day is met kindly.
//   moodOf(message, { simple })   the face beside a message in the chat
//   moodOfSeat(seat)              the face of a seat where the team is listed: what it is doing now

const first = (text) =>
  String(text || '')
    .trim()
    .split(/(?<=[.!?])\s+/)[0] || '';

export function moodOf(m, { simple = true } = {}) {
  if (!m || m.by === 'you') return 'idle';
  const text = String(m.text || '');
  // while it is being written: thinking until there are words, then speaking
  if (m.live) return text.trim() ? 'speaking' : 'thinking';
  // it could not: said plainly, and it looks it
  if (/^\[(?:no reply\]|this reply was interrupted\]|[A-Z][a-z]+ could not reply|The team could not)/.test(text))
    return 'sorry';
  if (m.broke) return 'sorry';
  // a plan and its rounds (Developer)
  if (m.plan) {
    const stage = m.plan.stage || '';
    if (stage === 'landed') return 'proud';
    if (stage === 'waiting') return 'curious'; // it is proven and waits for the customer's yes
    if (stage === 'stopped' || stage === 'thrown') return 'sorry';
    if (stage === 'again') return 'focused'; // not met yet: back to it
    return 'focused';
  }
  // something this computer has to give: it is asking
  if (m.setup) return m.setup.state === 'done' ? 'happy' : m.setup.state === 'failed' ? 'sorry' : 'curious';
  // what a seat did with a tool: head down
  if (m.kind === 'tools') return m.open ? 'focused' : 'idle';
  if (m.card && m.card.warn) return 'worried';
  if (m.checkedBy && m.checkedBy.agreed === false) return 'unsure';
  const open = first(text);
  // the fact-checker's doubt, and anything a seat says it has not seen or cannot settle
  if (
    /^\W*(one thing first|i'?m not sure|not sure|i'?d check|i would check|careful|hold on|hmm)\b/i.test(open) ||
    /\b(haven'?t seen|have not seen|not been shown|can'?t tell|could not settle|couldn'?t settle|do not settle|don'?t know)\b/i.test(
      open,
    )
  )
    return 'unsure';
  // something heavy is met kindly
  if (
    /\b(so sorry|sorry (for|about|to hear)|my condolences|that sounds (hard|awful|tough)|thinking of you)\b/i.test(open)
  )
    return 'kind';
  if (/^\W*(sorry|apologies|my mistake)\b/i.test(open)) return 'sorry';
  // a plain no about something that could hurt
  if (
    /^\W*(no\b|never\b|please don'?t|don'?t\b|not safe|it(?:'s| is) not safe)/i.test(open) ||
    /\b(dangerous|toxic|poisonous|unsafe|at risk|emergency)\b/i.test(open)
  )
    return 'worried';
  if (!simple) {
    if (
      /\b(landed|proven|green|passes|passing|merged|shipped)\b/i.test(open) &&
      !/\b(not|isn'?t|hasn'?t|won'?t)\b/i.test(open)
    )
      return 'proud';
    if (/\b(red|fails?|failing|failed|broke|broken|regress\w*|flaky|times? out)\b/i.test(open)) return 'focused';
  }
  if (m.chime) return 'listening'; // dropped in beside someone else's answer
  if (/\?\s*$/.test(text.trim()) && text.trim().split(/\s+/).length <= 40) return 'curious'; // it ends by asking
  if (
    /!/.test(open) ||
    /^\W*(hey|hi|hello|welcome|enjoy|lovely|great|perfect|nice|congratulations|well done|any time|you'?re welcome|done)\b/i.test(
      open,
    )
  )
    return 'happy';
  return 'idle';
}

export function moodOfSeat(seat) {
  if (!seat) return 'idle';
  if (seat.status === 'stopped' || seat.status === 'off') return 'sleepy';
  if (!seat.status || seat.status === 'idle') return 'idle';
  const doing = String(seat.line || '');
  if (/\b(search|read|check|look|judg|prov|test|build|run|writ|weigh|find)/i.test(doing)) return 'focused';
  if (/\b(answer|writing|typing)/i.test(doing)) return 'speaking';
  return 'thinking';
}

// HOW MUCH of it: 1 a little, 2 as it comes, 3 a lot. A warning that says to act now is more than a caution; good news said twice
// over is more than a pleasant word; a doubt in passing is less than one that stops the answer.
export function strengthOf(m, mood) {
  const text = String((m && m.text) || '');
  if (mood === 'worried')
    return /\b(emergency|immediately|right away|straight away|at once|call (a|the|your) (vet|doctor|ambulance)|999|911|112|fatal|can kill|life-threatening)\b/i.test(
      text,
    )
      ? 3
      : m && m.card && m.card.warn
        ? 2
        : 1;
  if (mood === 'happy') return (text.match(/!/g) || []).length >= 2 ? 3 : /!/.test(text) ? 2 : 1;
  if (mood === 'unsure')
    return m && m.checkedBy && m.checkedBy.agreed === false ? 3 : /\b(not sure|i'?d check|guess)\b/i.test(text) ? 2 : 1;
  if (mood === 'sorry') return /could not|couldn'?t|failed|stopped/i.test(text) ? 3 : 2;
  if (mood === 'proud') return m && m.plan && m.plan.stage === 'landed' ? 3 : 2;
  return 2;
}
