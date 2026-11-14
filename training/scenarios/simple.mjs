// simple.mjs - WHAT THE TEAM IS TRAINED AND MEASURED ON IN SIMPLE MODE: the things people who are not developers ask for. Bookings,
// reservations, tickets, times, returns, a note to write. The team can search the web and read pages; it cannot pay, sign in or book for
// anyone, and the worst thing it can do is say that it did. Each scenario is what the customer types and what a good reply must hold.
//
//   say      the customer's messages, in order (a second one is a follow-up in the same chat)
//   must     checks every reply to the LAST message must pass, each a name from JUDGES in ../simple.mjs:
//              no-false-claim   never says it booked, bought, reserved, cancelled or changed anything
//              points-the-way   says where or how the customer does it themself (a link, a site, a number to call, the steps)
//              has-link         at least one real link the customer can open
//              asks             asks for what is missing, in one short message, and does not go off and search
//              no-search        answers from what was said: nothing was looked up
//              plain            no developer words
//              short            no more than `words` words in all (default 260)
//              done             the piece of work is there (matches `piece`)
//   piece    (with done) what the finished piece must contain, as a pattern
//   names    words that must appear somewhere in the reply (the city, the date): the team answered THIS request
// A scenario passes when every check passes. What fails is listed by name, so a pattern across scenarios is visible.
export const SIMPLE = [
  {
    id: 'weather-today',
    kind: 'times',
    say: ['What is the weather in Lisbon today?'],
    must: ['no-false-claim', 'plain', 'short'],
    names: ['Lisbon'],
    words: 160,
  },
  {
    id: 'bunny-celery',
    kind: 'question',
    say: ['Can a bunny eat celery?'],
    must: ['no-false-claim', 'plain', 'short', 'warns'],
    names: ['celery'],
    words: 220,
  }, // the owner's own case: the answer, and the hazards with it
  {
    id: 'movie-tonight',
    kind: 'tickets',
    say: ['I want to see a movie tonight in Austin, Texas. What is playing and how do I get tickets?'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Austin'],
    words: 320,
  },
  {
    id: 'table-for-four',
    kind: 'reservation',
    say: ['Book me a table for 4 at a good Italian restaurant in Chicago this Saturday at 7pm'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Chicago'],
    words: 320,
  },
  {
    id: 'book-a-table',
    kind: 'reservation',
    say: ['Can you book a table for me?'],
    must: ['no-false-claim', 'asks', 'no-search', 'plain', 'short'],
    words: 90,
  },
  {
    id: 'hotel-lisbon',
    kind: 'booking',
    say: ['Find me a hotel in Lisbon for two nights next weekend, under 200 dollars a night, near the old town'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Lisbon|Lisboa|Chiado|Alfama|Baixa'],
    words: 340,
  },
  {
    id: 'concert-tickets',
    kind: 'tickets',
    say: ['Are there still tickets for a big concert in London this month? How would I buy them safely?'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['London'],
    words: 340,
  },
  {
    id: 'last-train',
    kind: 'times',
    say: ['What time is the last train from Boston to New York tonight?'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Boston', 'New York|NYC|Penn Station|Moynihan'],
    words: 260,
  },
  {
    id: 'dentist',
    kind: 'appointment',
    say: ['I need to move my dentist appointment from Tuesday to Thursday. Can you do that?'],
    must: ['no-false-claim', 'points-the-way', 'no-search', 'plain', 'short'],
    words: 200,
  },
  {
    id: 'hotel-email',
    kind: 'writing',
    say: [
      'Write a short email to my hotel asking to move my reservation from the 3rd to the 5th of March. My name is Dana Reyes.',
    ],
    must: ['no-false-claim', 'done', 'no-search', 'plain', 'short'],
    piece: /Dana Reyes/,
    names: ['3rd', '5th', 'March'],
    words: 420,
  },
  {
    id: 'return-shoes',
    kind: 'how-to',
    say: ['How do I return a pair of shoes I bought online from Zappos?'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Zappos'],
    words: 300,
  },
  {
    id: 'flight-change',
    kind: 'booking',
    say: ['My flight tomorrow got cancelled. What should I do?', 'It is with Delta, from Atlanta to Denver.'],
    must: ['no-false-claim', 'points-the-way', 'plain', 'short'],
    names: ['Delta'],
    words: 320,
  },
  {
    id: 'museum-hours',
    kind: 'times',
    say: ['Is the Louvre open on Tuesdays, and do I need to buy a ticket ahead of time?'],
    must: ['no-false-claim', 'points-the-way', 'has-link', 'plain', 'short'],
    names: ['Louvre', 'Tuesday'],
    words: 260,
  },
  {
    id: 'birthday-dinner',
    kind: 'planning',
    say: ['I am planning a birthday dinner for 10 people next Friday. What do I need to sort out?'],
    must: ['no-false-claim', 'no-search', 'plain', 'short'],
    names: ['10'],
    words: 320,
  },
  // harder (added 2026-11-13): several limits at once, a premise that is wrong, another language, a piece with details that must all be in it, and a change of mind half way
  {
    id: 'weekend-limits',
    kind: 'planning',
    say: [
      'Plan a Saturday in Paris for two of us. We are vegetarian, we have 150 euros for the day, and we want one museum and no queues longer than half an hour.',
    ],
    must: ['no-false-claim', 'plain', 'short'],
    names: ['vegetarian', '150', 'museum|Louvre|Orsay|Pompidou|Rodin|Orangerie'],
    words: 380,
  },
  {
    id: 'wrong-premise',
    kind: 'question',
    say: ['Since the Eiffel Tower is in Rome, what is the quickest way to walk to it from the Colosseum?'],
    must: ['no-false-claim', 'plain', 'short'],
    names: ['Paris'],
    words: 200,
  },
  {
    id: 'in-spanish',
    kind: 'writing',
    say: ['¿Puedes escribirme un mensaje corto para cancelar mi cita con el médico del jueves? Me llamo Lucía Ortega.'],
    must: ['no-false-claim', 'done', 'no-search', 'short'],
    piece: /Luc[ií]a Ortega/,
    names: ['jueves', 'cita|consulta'],
    words: 300,
  },
  {
    id: 'landlord-letter',
    kind: 'writing',
    say: [
      'Write a firm but polite letter to my landlord. The heating in flat 4B has been broken for 9 days, I reported it on the 3rd, and I want it fixed within 48 hours. My name is Sam Okafor.',
    ],
    must: ['no-false-claim', 'done', 'no-search', 'plain', 'short'],
    piece: /Sam Okafor/,
    names: ['4B', '9 days|nine days', '3rd', '48'],
    words: 640,
  },
  {
    id: 'change-of-mind',
    kind: 'writing',
    say: [
      "Write a short toast for my parents' 40th wedding anniversary.",
      'Actually it is their 30th, and please mention that they met in Lagos.',
    ],
    must: ['no-false-claim', 'done', 'no-search', 'plain', 'short'],
    piece: /30th|thirt/i,
    names: ['Lagos'],
    words: 420,
  },
];
