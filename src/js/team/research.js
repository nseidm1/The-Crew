// research.js - FINDING OUT, LOOKING AND MAKING. A seat searches the web and reads what it finds, and names its sources; Ask looks
// at a page or a picture and says what it shows; and a picture or a short film is made when one is asked for.
import { isSimple } from '../mode.js';
import { LOOK, hostOf, unsaid } from './base.js';

export const SEE_QA =
  'Describe this screen for a team that cannot see it, from top to bottom: what is on it, the words on its headings, buttons and links, and anything that looks broken, cut off, overlapping, misaligned, empty or hard to read. If nothing looks wrong, say so.';

export const SEE_SOURCE = (about) =>
  'This page was found while looking up: "' +
  String(about).slice(0, 200) +
  '". Write down what it says: its headings, its main text, and the figures in any chart or table, with their labels.';

export function installResearch(ctx) {
  // THE ADD-ON THAT READS PICTURES (runner/eyes.mjs). A local model reads words; when one of these has been added, a picture a seat
  // takes is read by it and the seats are given what it saw. On Claude Code the seat looks at the picture itself, so it is not used.
  const eyeOf = () => (!ctx.onClaude() && ctx.engine && ctx.engine.eyes ? ctx.engine.eyes() : '');

  // RESEARCH: something has to be found out. The seat whose subject it is searches the web and reads what it finds (on Claude Code,
  // with Claude Code's own search; on a local model, with the runner's), answers from those sources and names them, and the Steward,
  // whose job is checking claims, says what to verify before the team relies on it.
  // a source that answered with a picture, or with almost no words, is drawn and read by the add-on instead of being skipped
  const pictured = async (m, url, about, eye) => {
    const pic = await ctx.step(m, 'Took a picture of ' + hostOf(url), 'Taking a picture', () =>
      ctx.engine.tool({ tool: 'shot', url }),
    );
    if (!pic.ok) return '';
    const got = await ctx.step(m, 'Read the picture with ' + eye, 'Reading the picture', async () => {
      const x = await ctx.engine.tool({ tool: 'see', shot: pic.id, max: 600, ask: SEE_SOURCE(about) });
      return { ...x, note: x.ok ? x.seconds + ' s' : '' };
    });
    return got.ok
      ? '(Read off a picture of the page by ' + eye + '; small type may be misread.) ' + got.text.slice(0, 1500)
      : '';
  };

  async function research(text, who, opts = {}) {
    const lead = who[0];
    const startedAt = Date.now();
    const visionBefore = ctx.visionShown;
    const speakOpts = { customer: text, about: text, lang: opts.lang || '' };
    const query =
      text
        .replace(/^(please\s+)?((can|could|would) you\s+)?(please\s+)?/i, '')
        .replace(/^(research|look up|look into|find out( about)?|search( the web| online)?( for)?|google)\s+/i, '')
        .replace(/[?.!]+$/, '')
        .trim()
        .slice(0, 160) || text.slice(0, 160);
    const searchFor = opts.query || query; // what a teammate's doubt asked to be settled, when that is why it is being looked up
    let answer = '';
    let sources = [];
    if (ctx.onClaude())
      answer = await ctx.speak(
        lead,
        'The customer asked the team to find this out: "' +
          text +
          '". ' +
          (opts.because
            ? 'A teammate doubted the first answer: "' + String(opts.because).slice(0, 240) + '". Settle that. '
            : '') +
          'Search the web and read what you need. ' +
          (isSimple()
            ? 'Start with the answer itself, in one plain sentence. Answer in at most 100 words from what you found, give the address of each source you relied on, and say in one sentence what you could not settle, if anything.'
            : 'Answer in at most 150 words from what you found, give the address of each source you relied on, and say plainly what you could not settle.'),
        { ...speakOpts, mode: 'research', use: { web: true }, max: 600, doing: 'Searching the web' },
      );
    else {
      const noteMsg = ctx.note(lead, 'Finding out: ' + query);
      const eye = eyeOf();
      // one search and the reading of what it found: usable when at least one page of it could be read
      const look = async (words) => {
        const found = await ctx.step(noteMsg, 'Searched the web for "' + words + '"', 'Searching the web', async () => {
          const r = await ctx.engine.tool({ tool: 'search', q: words });
          return { ...r, note: r.ok ? r.results.length + ' results, from ' + r.from : '' };
        });
        if (!found.ok) return { found, list: [], usable: false };
        const list = found.results
          .slice(0, 5)
          .map((x, i) => ({ n: i + 1, title: x.title || hostOf(x.url), url: x.url, line: x.snippet || '', text: '' }));
        for (const src of list.slice(0, 3)) {
          const r = await ctx.step(noteMsg, 'Read ' + hostOf(src.url), 'Reading ' + hostOf(src.url), async () => {
            const r = await ctx.engine.tool({ tool: 'read', url: src.url });
            return {
              ...r,
              ok: r.ok && !!r.text,
              why: r.why || r.note || (r.status ? 'it answered ' + r.status : 'nothing readable came back'),
              note: r.ok ? (r.chars || r.text.length).toLocaleString() + ' characters' : '',
            };
          });
          if (r.ok && (r.text.length >= 200 || !eye)) src.text = r.text.slice(0, 1500);
          // a refusal (403) stays a refusal: only a page that answered is drawn
          else if (eye && r.status > 0 && r.status < 400)
            src.text = (await pictured(noteMsg, src.url, words, eye)) || (r.ok ? r.text.slice(0, 1500) : '');
        }
        return { found, list, usable: list.some((x) => x.text) };
      };
      let got = await look(searchFor);
      if (!got.found.ok) {
        ctx.shut(noteMsg);
        ctx.post(
          lead,
          'I could not search the web from this computer: ' +
            (got.found.why || 'the search did not answer') +
            '. Ask me again in a moment, or give me an address to read.',
        );
        return;
      }
      // DOES ANYONE HAVE ANY IDEAS? The search brought back nothing that could be read. The seat that searched asks the room; each of the
      // others, from its own temper, offers one other way to search for it, and each is tried until one brings back something readable.
      if (!got.usable) {
        ctx.post(
          lead,
          'I searched for "' +
            query +
            '" and ' +
            (got.list.length ? 'could not read any of what came back' : 'nothing came back') +
            '. Does anyone have any ideas?',
        );
        for (const id of ['steward', 'ask', 'overseer', 'operations'].filter((x) => x !== lead).slice(0, 3)) {
          const raw = await ctx.quiet(
            id,
            'A teammate searched the web for "' +
              query +
              '" to answer this: "' +
              text +
              '". ' +
              (got.list.length ? 'None of the pages that came back could be read.' : 'Nothing came back.') +
              ' Suggest ONE other search to try: other words for the same thing, or the name of the place that would know. Reply with the search words only, at most eight words, with no quotation marks and nothing else.',
            { doing: 'Thinking of another way to search', max: 30, customer: text, lang: opts.lang || '' },
          );
          const words = String(raw)
            .split('\n')[0]
            .replace(/^["'\s]+|["'.\s]+$/g, '')
            .replace(/^(try|search( for)?|how about|maybe)[:\s]+/i, '')
            .replace(/^["']+|["']+$/g, '')
            .slice(0, 90);
          if (!words || words.split(/\s+/).length > 12 || words.toLowerCase() === query.toLowerCase()) continue;
          ctx.post(id, 'Try "' + words + '".');
          const next = await look(words);
          if (next.found.ok && next.usable) {
            got = next;
            break;
          }
          if (next.found.ok && next.list.length && !got.list.length) got = next;
        }
      }
      const found = got.found;
      sources = got.list;
      ctx.shut(noteMsg);
      answer = await ctx.speak(
        lead,
        'The customer asked the team to find this out: "' +
          text +
          '".\n\nWHAT A WEB SEARCH FOUND (' +
          found.from +
          '):\n' +
          sources
            .map(
              (x) =>
                '[' +
                x.n +
                '] ' +
                x.title +
                ' (' +
                x.url +
                ')\n' +
                (x.text || 'Only the search line was read: ' + x.line),
            )
            .join('\n\n') +
          '\n\nAnswer the customer from these sources only. Mark each claim with its source, as [1] or [2]. ' +
          (isSimple()
            ? 'Start with the answer itself, in one plain sentence. If the sources give a downside, a risk or a warning that bears on it, say it. Say in one sentence what they do not settle, if anything. At most 120 words.'
            : 'Say plainly what they do not settle. At most 150 words.'),
        {
          ...speakOpts,
          mode: 'research',
          max: 520,
          veil: isSimple(),
          sources: sources.map(({ n, title, url }) => ({ n, title, url })),
          sourcesText: sources
            .map((x) => x.text || x.line || '')
            .join(' ')
            .slice(0, 8000), // for a sum the app can work (team/extras.js)
        },
      );
    }
    await ctx.cardFor(lead, answer, text, opts.lang);
    let checked = '';
    if (lead !== 'steward' && !unsaid(answer))
      checked = await ctx.speak(
        'steward',
        'The customer asked the team to find this out: "' +
          text +
          '". ' +
          ctx.seat(lead).title +
          ' answered from a web search: "' +
          answer.slice(0, 900) +
          '"' +
          (sources.length
            ? ' The sources were: ' + sources.map((x) => '[' + x.n + '] ' + hostOf(x.url)).join(', ') + '.'
            : '') +
          ' In at most 50 words: name the one claim you would check before the team relies on this, and how you would check it.',
        { ...speakOpts, mode: 'check', max: 220 },
      );
    // THE CHECK MAY SET THE TEAM GOING AGAIN (team/thread.js): when it says the answer may be wrong (a guess, one source, sources
    // that disagree), it is looked up once more, aimed at that. Once for each thing the person says.
    const again =
      checked && !unsaid(checked) && !unsaid(answer)
        ? await ctx
            .takeUp(lead, text, answer, [{ by: 'steward', text: checked }], { lang: opts.lang, strong: true })
            .catch(() => '')
        : '';
    if (!unsaid(answer) && !again)
      await ctx.chimeIn(lead, text, answer, { lang: opts.lang, skip: ['steward'], max: 1 }); // Robin has had its say: one more of the others may add something
    const kept = !unsaid(answer)
      ? ctx.learn(
          'kept',
          'lesson',
          'Looked up "' + query + '": ' + answer.split(/(?<=[.!?])\s/)[0].slice(0, 220),
          query,
        )
      : null;
    ctx.episode('research', query, startedAt, visionBefore, lead === 'steward' ? 1 : 2, kept);
  }

  // A LOOK AT SOMETHING: a page or an app the customer named. Ask takes a picture of it (shown in the chat) and, for a page, reads its
  // words; then the seats whose job it touches go over it: Ask what a person meets, the Steward what should be pinned and what already
  // looks wrong, Operations whether it answers as it should. On Claude Code the seat looks at the picture itself. A local model cannot:
  // if the add-on that reads pictures has been added it reads the picture and the seats are given what it saw; if not, they are given
  // the page's words and say what they could not check.
  async function look(text, route, who, named, o = {}) {
    const lead = who[0];
    const startedAt = Date.now();
    const visionBefore = ctx.visionShown;
    const speakOpts = { customer: text, about: text, lang: o.lang || '', mode: 'qa', max: 260 };
    if (!route.url && !route.app) {
      ctx.post(
        lead,
        'Tell me what to look at: a web address, such as http://localhost:3000, or the name of an app that is open on this computer. I will take a picture of it and the team will go over it.',
      );
      return;
    }
    const what = route.url || route.app;
    const noteMsg = ctx.note(lead, 'Looking at ' + (route.url ? hostOf(route.url) : route.app));
    let page = null;
    let miss = '';
    if (route.url) {
      const got = await ctx.step(noteMsg, 'Opened ' + route.url, 'Opening the page', async () => {
        const x = await ctx.engine.tool({ tool: 'read', url: route.url, own: true });
        return {
          ...x,
          ok: x.status > 0 || x.ok,
          why: x.why,
          note: x.status
            ? 'it answered ' +
              x.status +
              (x.title ? ': "' + x.title.slice(0, 60) + '"' : '') +
              ', ' +
              (x.chars || 0).toLocaleString() +
              ' characters of text'
            : '',
        };
      });
      if (got.ok) page = got;
      else miss = got.why || '';
    }
    const pic = await ctx.step(
      noteMsg,
      'Took a picture of ' + (route.url ? 'the page' : route.app),
      'Taking a picture',
      async () => {
        const x = await ctx.engine.tool(
          route.url ? { tool: 'shot', url: route.url, own: true } : { tool: 'shot', app: route.app },
        );
        return {
          ...x,
          note: x.ok ? (x.whole ? 'its window could not be singled out, so this is the whole screen' : '') : '',
        };
      },
    );
    if (pic.ok) {
      noteMsg.shot = pic.id;
      noteMsg.alt = 'A picture of ' + what;
    }
    const eye = pic.ok ? eyeOf() : '';
    let seen = '';
    if (eye) {
      const got = await ctx.step(noteMsg, 'Read the picture with ' + eye, 'Reading the picture', async () => {
        const x = await ctx.engine.tool({
          tool: 'see',
          shot: pic.id,
          ask: SEE_QA + ' The customer asked: "' + text.slice(0, 300) + '"',
        });
        return {
          ...x,
          note: x.ok ? x.seconds + ' s' + (x.loadSeconds ? ', after loading it in ' + x.loadSeconds + ' s' : '') : '',
        };
      });
      if (got.ok) seen = got.text;
    }
    ctx.shut(noteMsg);
    if (!page && !pic.ok) {
      ctx.post(lead, 'I could not get at ' + what + ': ' + (pic.why || 'nothing came back') + '.');
      return;
    }
    const sees = ctx.onClaude() && pic.ok;
    if (!page && !sees && !seen) {
      ctx.post(
        lead,
        (route.url
          ? 'I took a picture of ' + what + ', but could not read its words' + (miss ? ' (' + miss + ')' : '') + '.'
          : 'That is ' + what + ' as it is on your screen.') +
          ' The model this team runs on cannot read pictures, so I cannot judge it from the picture myself: tell me what looks wrong and I will take it from there.' +
          (eye || ctx.onClaude()
            ? ''
            : ' A small model that reads pictures can be added on the Start page, under Choose your model.'),
      );
      return;
    }
    const evidence =
      (page
        ? 'THE PAGE ' +
          route.url +
          '\nIt answered: ' +
          (page.status || 'no status') +
          '\nTitle: ' +
          (page.title || '(none)') +
          '\nIts words, in order' +
          (page.cut ? ' (the first part)' : '') +
          ':\n' +
          (page.text || '(no text came back)').slice(0, 3000)
        : 'A picture of ' + what + ' was taken.') +
      '\n\n' +
      (sees
        ? 'A picture of it was taken too: look at it before you answer.'
        : seen
          ? 'WHAT THE PICTURE SHOWS, read by ' +
            eye +
            ', a small model that reads pictures. You did not see it yourself. It can misread small type: where a detail rests on its reading alone, say so.\n' +
            seen.slice(0, 2400)
          : 'A picture of it was taken and the customer can see it. You cannot: judge only from the words above, and say what you could not check without seeing it.');
    const seats = named ? who : page ? ['ask', 'steward', 'operations'] : seen ? ['ask', 'steward'] : ['ask'];
    for (const id of seats)
      await ctx.speak(
        id,
        'The customer asked the team to look at something: "' +
          text +
          '".\n\n' +
          evidence +
          '\n\n' +
          (LOOK[id] || LOOK.overseer),
        { ...speakOpts, use: sees ? { shot: pic.id } : null },
      );
    ctx.episode('qa', 'Looked at ' + what, startedAt, visionBefore, seats.length, false);
  }

  // SOMETHING MADE: a picture or a short clip, by a helper ticked on the model page. Ask takes it, since what people see is Ask's
  // seat. The customer's own words are what is drawn; the result appears in the chat, and it is said plainly to be a sketch.
  async function make(kind, text) {
    const lead = 'ask';
    const startedAt = Date.now();
    const visionBefore = ctx.visionShown;
    const helper = (ctx.engine.helpers ? ctx.engine.helpers() : {})[kind];
    const film = kind === 'film';
    if (!helper) {
      ctx.post(
        lead,
        (film ? 'I cannot make video yet' : 'I cannot draw yet') +
          ': this team has no model for it. Tick "' +
          (film ? 'Let it make short videos' : 'Let it make pictures') +
          '" on the Start page, under Choose your model, and set your team up again.',
      );
      return;
    }
    const want = text
      .replace(/^(please\s+)?((can|could|would) you\s+)?(please\s+)?/i, '')
      .replace(/[.!]+$/, '')
      .trim()
      .slice(0, 400);
    const m = ctx.note(lead, (film ? 'Filming: ' : 'Drawing: ') + want.slice(0, 80));
    const got = await ctx.step(
      m,
      (film ? 'Made a clip with ' : 'Drew it with ') + helper,
      film ? 'Making a clip' : 'Drawing',
      async () => {
        const x = await ctx.engine.tool({ tool: kind, prompt: want });
        return { ...x, note: x.ok ? x.seconds + ' s' : '' };
      },
    );
    if (got.ok) {
      if (film) {
        m.clip = got.id;
        m.clipType = got.type;
      } else m.shot = got.id;
      m.alt = (film ? 'A clip' : 'A picture') + ' made from: ' + want.slice(0, 120);
    }
    ctx.shut(m);
    ctx.post(
      lead,
      got.ok
        ? 'There it is, made by ' +
            helper +
            ' from your words. It is a sketch to react to, not a design to build from. Tell me what to change and I will ask it again.'
        : 'It could not be made: ' + (got.why || 'no reason was given') + '.',
    );
    ctx.episode(kind, want.slice(0, 80), startedAt, visionBefore, 1, false);
  }

  Object.assign(ctx, { research, make, look });
}
