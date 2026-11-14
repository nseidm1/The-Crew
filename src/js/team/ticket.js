// ticket.js - THE JIRA TICKET THE CHAT IS ABOUT: reading it when a message names one, and looking at its pictures and recordings so
// that what they show is part of what the team is asked.
import { isSimple } from '../mode.js';

// WHAT THE TICKET'S PICTURES AND RECORDINGS SHOW. A ticket very often says "see the screenshot" and little else. Its pictures and videos
// are fetched to this computer and looked at (runner/media.mjs), Ask says in the chat what each shows, and that goes into what the
// builder and the proof are given. One that could not be looked at is said, with why: the team then works from the ticket's words.
export const MEDIA = /^(image|video)\//i;

export const MEDIA_NAME = /\.(png|jpe?g|gif|webp|bmp|heic|mov|mp4|m4v|webm)$/i;

export function installTicket(ctx) {
  // WHICH TICKET. "Address P2P-12669", "fix this ticket", "do the ticket about the black bar on the offer sheet": the ticket is found
  // among the ones on the Jira page (by its key, by being the one already chosen, or by the words of its summary), read whole from
  // Jira for what it has to do, and becomes what the team is working on. When it cannot tell, it says so and asks; it never guesses.
  const SMALL = new Set([
    'ticket',
    'issue',
    'please',
    'address',
    'about',
    'with',
    'that',
    'this',
    'from',
    'team',
    'could',
    'would',
    'want',
    'need',
    'work',
    'have',
    'the',
    'and',
    'for',
  ]);

  async function ticketFor(text) {
    if (!ctx.engine || !ctx.engine.jira || isSimple()) return null;
    if (
      !/\b(address|fix|do|implement|work on|take on|pick up|build|resolve|handle|start on)\b/i.test(text) ||
      !/\b(ticket|issue)\b|\b[A-Z][A-Z0-9]+-\d+\b/.test(text)
    )
      return null;
    const issues = ctx.engine.jira.issues();
    const key = (/\b([A-Z][A-Z0-9]+-\d+)\b/.exec(text) || [])[1];
    let hit = key ? issues.find((x) => x.key === key) || { key } : null;
    if (!hit && ctx.state.focus && /\b(this|that|the) (ticket|issue)\b/i.test(text) && !/\babout\b/i.test(text))
      hit = { key: ctx.state.focus.key };
    if (!hit) {
      const words = [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((w) => !SMALL.has(w));
      const found = issues
        .map((x) => ({
          x,
          n: words.filter((w) =>
            String(x.summary || '')
              .toLowerCase()
              .includes(w),
          ).length,
        }))
        .filter((r) => r.n >= 2)
        .sort((a, b) => b.n - a.n);
      if (!found.length) {
        ctx.post(
          'overseer',
          issues.length
            ? 'I cannot tell which ticket you mean. Give its key, or open it on the Jira page and press "Talk to the team".'
            : "There are no tickets on the Jira page to choose from yet. Show the board there first, or give the ticket's key.",
        );
        return 'asked';
      }
      if (found[1] && found[1].n === found[0].n) {
        ctx.post(
          'overseer',
          'Which one do you mean? ' +
            found
              .slice(0, 3)
              .map((r) => r.x.key + ', "' + r.x.summary + '"')
              .join('; ') +
            '. Say its key.',
        );
        return 'asked';
      }
      hit = found[0].x;
    }
    ctx.busy('overseer', 'Reading ' + hit.key);
    let ticket = null;
    try {
      ticket = await ctx.engine.jira.read(hit.key);
    } catch (e) {
      ctx.busy('overseer', '');
      const why = String((e && e.message) || e).slice(0, 160);
      if (String(text).split(/\s+/).length >= 14) {
        ctx.post(
          'overseer',
          'I could not read ' + hit.key + ' from Jira (' + why + '), so the team will work from what you wrote.',
        );
        return null;
      }
      ctx.post('overseer', 'I could not read ' + hit.key + ' from Jira: ' + why);
      return 'asked';
    }
    ctx.busy('overseer', '');
    ctx.core.focusTicket({
      key: ticket.key,
      summary: ticket.summary,
      status: ticket.status,
      type: ticket.type,
      priority: ticket.priority,
      assignee: ticket.assignee,
      url: ticket.url,
      description: ticket.description,
    });
    const says = String(ticket.description || '')
      .replace(/\*\*|__|\x60/g, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^#{1,4}\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim(); // as plain words: the marks a ticket is written with are not read out
    ctx.post(
      'overseer',
      'This is about ' +
        ticket.key +
        ', "' +
        ticket.summary +
        '". ' +
        (says
          ? 'What it has to do, from the ticket: ' + says.slice(0, 500) + (says.length > 500 ? '…' : '')
          : 'The ticket has no description, so there is nothing written to build against. Tell me what it must do.'),
    );
    await seeTicket(ticket);
    return ticket;
  }

  const seeing = new Set();

  async function seeTicket(ticket) {
    const files = ((ticket && ticket.attachments) || [])
      .filter((a) => a && a.id && (MEDIA.test(a.type || '') || MEDIA_NAME.test(a.name || '')))
      .slice(0, 6);
    if (!files.length || !ctx.engine || !ctx.engine.jira || !ctx.engine.jira.media || seeing.has(ticket.key))
      return null;
    seeing.add(ticket.key);
    ctx.busy('ask', 'Looking at what is attached to ' + ticket.key);
    let got = null;
    try {
      got = await ctx.engine.jira.media(
        ticket.key,
        files.map((a) => ({ id: a.id, name: a.name, type: a.type })),
        (ticket.summary || '') + '. ' + String(ticket.description || '').slice(0, 500),
      );
    } catch (e) {
      ctx.busy('ask', '');
      seeing.delete(ticket.key);
      ctx.post(
        'ask',
        'I could not look at what is attached to ' +
          ticket.key +
          ': ' +
          String((e && e.message) || e).slice(0, 180) +
          " The team will work from the ticket's words.",
      );
      return null;
    }
    ctx.busy('ask', '');
    seeing.delete(ticket.key);
    const seen = ((got && got.media) || []).filter((m) => m.ok && m.says);
    const not = ((got && got.media) || []).filter((m) => !m.ok);
    if (seen.length)
      ctx.post(
        'ask',
        'I looked at what is attached to ' +
          ticket.key +
          '.\n\n' +
          seen
            .map(
              (m) =>
                m.name +
                (m.kind === 'video'
                  ? ' (a recording' + (m.frames ? ', ' + m.frames + ' moments of it' : '') + ')'
                  : '') +
                ': ' +
                m.says +
                (m.wrong ? '\nWhat I take to be wrong: ' + String(m.wrong).replace(/\.$/, '') + '.' : ''),
            )
            .join('\n\n') +
          (not.length
            ? '\n\nI could not look at ' +
              not.map((m) => m.name + ' (' + String(m.why || 'no reason given').replace(/\.$/, '') + ')').join('; ') +
              '.'
            : '') +
          (seen.some((m) => m.wrong)
            ? '\n\nTell me if I have misread any of it: the team will build on this reading.'
            : ''),
      );
    else
      ctx.post(
        'ask',
        'I could not look at what is attached to ' +
          ticket.key +
          ': ' +
          String((not[0] && not[0].why) || 'nothing came back').replace(/\.$/, '') +
          ". The team will work from the ticket's words.",
      );
    if (ctx.state.focus && ctx.state.focus.key === ticket.key && got && got.note) {
      ctx.state.focus.media = String(got.note).trim().slice(0, 1500);
      ctx.emit('focus');
    }
    return got;
  }

  Object.assign(ctx, { ticketFor, seeTicket });
}
