// tune.mjs - HOW THIS MODEL HAS TO BE ASKED, learned on this machine and kept. A local model can break down into one piece repeated
// to the token limit (seen: a 30B model at 4 bits writing "后汉书" hundreds of times). It is not a wrong answer and no instruction
// cures it. Looked at closely on that model, it happens in three places:
//   1. AFTER A FINISHED REPLY. The reply is whole (a complete tool call, a closed sentence) and the model does not stop: it runs on
//      into the repeated piece.
//   2. AFTER A TOOL'S RESULT. Handed the file it asked for, in the server's own tool-result turn, it often answers with the repeated
//      piece from its first token. Given the same exchange as plain turns ("I used the read tool", "Result: ...") it does so less.
//   3. PART-WAY THROUGH. Mid-sentence, or mid-way through a long string it is copying.
// What is done about it, and all of it is learned from the model's own replies, nothing is assumed beforehand:
//   - Every reply is watched as it streams (talk.mjs: guard). Nothing broken is handed on.
//   - THE PIECE IT REPEATS IS LEARNED and from then on given to the model server as a place to stop. A reply that would have run on
//     for a minute ends within a token of going wrong: case 1 simply ends where it was whole, and cases 2 and 3 cost a second, not
//     a minute, before they are asked again.
//   - A reply that broke down part-way is asked again ANOTHER WAY (below). What each way did is counted per model: asked, broke
//     down, refused by the server. The model is asked from then on the way that has broken down least here; a way the server refuses
//     is never tried again. Counts are kept apart for a request that follows a tool's result and one that does not.
// The first way is "as asked", so a model that is sound is never asked differently from how the caller asked.
//   - HOW IT IS SERVED IS LEARNED TOO, and it is the cure that goes deepest. The piece that model repeats is the LAST token of its
//     vocabulary (number 131071 of 131072), which no model chooses: it is the engine's drafting handing back a token that is not a
//     real choice. Measured here on the request that broke down most: served the usual way, 6 of 6 replies broke down; served with
//     --no-drafts, 0 of 6, and all six did the job. No sampling setting, penalty or forbidden-token setting made that difference.
//     So a model whose replies break down three times is served again without drafts, its counts begin again, and that is kept.
import { appendFileSync } from 'node:fs';
import { guard } from './talk.mjs';

// FO_TRACE_MODEL=<file>: one line per request to the model (what was asked last, how it was asked, what came back and whether it
// was sound). Off unless asked for; it is how a model's breakdowns are looked at when its record alone does not explain them.
const trace = (row) => {
  const f = process.env.FO_TRACE_MODEL;
  if (f)
    try {
      appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');
    } catch {
      /* a trace never stops a reply */
    }
};

export const RUNGS = [
  { id: 'asked', name: 'as asked', extra: {} },
  { id: 'flat', name: 'with tool results given as plain turns', flat: true, extra: {} },
  { id: 'rp110', name: 'with a repetition penalty of 1.1', extra: { repetition_penalty: 1.1 } },
  {
    id: 'flat-rp110',
    name: 'with tool results as plain turns and a repetition penalty of 1.1',
    flat: true,
    extra: { repetition_penalty: 1.1 },
  },
  { id: 'rp120', name: 'with a repetition penalty of 1.2', extra: { repetition_penalty: 1.2 } },
  {
    id: 'rp115-calm',
    name: 'with a repetition penalty of 1.15 and less randomness',
    extra: { repetition_penalty: 1.15, temperature: 0.2 },
  },
  { id: 'fp05', name: 'with a frequency penalty of 0.5', extra: { frequency_penalty: 0.5 } },
];
// A way of asking that has never yet been seen sound is first asked for a short reply: a breakdown runs to the reply's limit, and
// some servers hold a broken reply back until it is over, so an unproven way costs seconds, not a minute. A sound reply that was only
// cut short by this is asked again in full, once, the same way, which is by then proven.
const TRIAL = 600;

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : '');
// the same conversation with its tool turns given as plain turns: what the assistant used, and what came back
export function flat(messages) {
  const names = {};
  const out = [];
  const say = (role, content) => {
    const last = out[out.length - 1];
    if (last && last.role === role && role !== 'system') last.content = textOf(last.content) + '\n\n' + content;
    else out.push({ role, content });
  };
  for (const m of messages) {
    if (!m) continue;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const used = m.tool_calls.map((c) => {
        const f = c.function || {};
        names[c.id] = f.name;
        let a = {};
        try {
          a = JSON.parse(f.arguments || '{}');
        } catch {
          /* as it came */
        }
        const args = Object.entries(a)
          .map(([k, v]) => k + ' = ' + JSON.stringify(v).slice(0, 400))
          .join(', ');
        return 'I used the ' + f.name + ' tool' + (args ? ' (' + args + ').' : '.');
      });
      say('assistant', [textOf(m.content).trim(), ...used].filter(Boolean).join('\n'));
    } else if (m.role === 'tool')
      say('user', 'Result of the ' + (names[m.tool_call_id] || 'tool') + ' call:\n' + textOf(m.content).trimEnd());
    else if (m.role === 'user' && out.length && out[out.length - 1].role === 'user') say('user', textOf(m.content));
    else out.push(m);
  }
  const last = out[out.length - 1];
  if (last && last.role === 'user' && messages[messages.length - 1].role === 'tool')
    last.content += '\n\nGo on with the task.';
  return out;
}
// IS IT A FINISHED REPLY? Asked of what was kept of a reply that ran on, and of a reply that ended at a learned stop piece (which
// may have ended it part-way). parts: [[where, text]] in the order they came ('c' the words, 'r' its thinking, a number the tool call
// it belongs to); keep: how much of that to count. Whole means: every tool call's arguments are complete, or, with no tool call, the
// words end where a sentence does. Returns { content, calls } or null.
const ENDS = /[.!?。！？…)\]"”’»`]$/;
function whole(parts, keep, calls) {
  let left = keep;
  let content = '';
  const args = {};
  for (const [w, s] of parts) {
    if (left <= 0) break;
    const take = s.slice(0, left);
    left -= take.length;
    if (w === 'c') content += take;
    else if (w !== 'r') args[w] = (args[w] || '') + take;
  }
  const made = [];
  for (const k of Object.keys(calls)) {
    const a = (args[k] || '').trim();
    if (!a) continue;
    let j;
    try {
      j = JSON.parse(a);
    } catch {
      return null;
    }
    if (!j || typeof j !== 'object' || !calls[k].name) return null;
    made.push({ id: calls[k].id, name: calls[k].name, args: a });
  }
  content = content.trimEnd();
  if (made.length) return { content, calls: made };
  return content.length >= 2 && ENDS.test(content) ? { content, calls: [] } : null;
}
// a repeated piece worth giving the server as a place to stop: short, not plain ASCII (a repeated "the " must never end every
// reply), and not something this very conversation contains
const stopWorthy = (unit) =>
  typeof unit === 'string' &&
  unit.trim().length >= 2 &&
  unit.length <= 24 &&
  /[^\x00-\x7f]/.test(unit) &&
  !/^\s|\s$/.test(unit);

// book: the kept record for one model:
//   first: { <way>: { n, bad } }   requests that do not follow a tool's result: asked, broke down
//   after: { ... }                 requests that do
//   no: { <way>|stop: true }       the server refuses this
//   stops: [{ piece, n }]          the pieces it has been seen repeating, given to the server as places to stop
//   ended                          finished replies that ran on and were ended for it       samples: the last few breakdowns
//   serve: { flags, before, refused }   how the model server is started for it, once learned; before: what it did served the usual way
const NO_DRAFTS = ['--no-drafts'];
const ENOUGH = 3;
export function createTune({ load, save }) {
  const book = (key) => {
    const all = load();
    const b = all[key] || (all[key] = {});
    delete b.rungs;
    b.first = b.first || {};
    b.after = b.after || {};
    b.no = b.no || {};
    b.stops = b.stops || [];
    return b;
  };
  // THE ORDER the ways are tried in: by how seldom each has broken down on this machine (a way not yet seen counts as even odds), the
  // list's own order settling ties. So a model that is sound stays on "as asked", and one that is not settles on what suits it.
  const order = (key, sit = 'first') => {
    const b = book(key);
    const rate = (i) => {
      const r = b[sit][RUNGS[i].id];
      return r ? (r.bad + 1) / (r.n + 2) : 0.5;
    };
    return RUNGS.map((_, i) => i)
      .filter((i) => !b.no[RUNGS[i].id] && (!RUNGS[i].flat || sit === 'after'))
      .sort((x, y) => rate(x) - rate(y) || x - y);
  };
  const mark = async (key, sit, i, what, sample, unit) => {
    const b = book(key);
    const id = RUNGS[i].id;
    if (what === 'no') b.no[id] = true;
    else {
      const r = b[sit][id] || (b[sit][id] = { n: 0, bad: 0 });
      r.n++;
      if (what === 'bad') {
        r.bad++;
        b.samples = [
          { at: Date.now(), way: RUNGS[i].name, after: sit === 'after', was: sample || '' },
          ...(b.samples || []),
        ].slice(0, 6);
      }
      if (what === 'ended') b.ended = (b.ended || 0) + 1;
    }
    if (stopWorthy(unit)) {
      const s = b.stops.find((x) => x.piece === unit);
      if (s) s.n++;
      else b.stops = [...b.stops, { piece: unit, n: 1 }].sort((x, y) => y.n - x.n).slice(0, 4);
    }
    b.at = Date.now();
    await save();
  };
  const says = (key) => {
    const b = book(key);
    const sum = (f) =>
      ['first', 'after'].reduce((n, s) => n + Object.values(b[s]).reduce((k, r) => k + (r[f] || 0), 0), 0);
    const a = RUNGS[order(key, 'first')[0]];
    const c = RUNGS[order(key, 'after')[0]];
    return {
      first: a.id,
      after: c.id,
      name:
        a.id === c.id
          ? a.name
          : a.id === 'asked'
            ? c.name + ' once a tool has been used'
            : a.name + ', and ' + c.name + ' once a tool has been used',
      broke: sum('bad'),
      asked: sum('n'),
      ended: b.ended || 0,
      stops: b.no.stop ? [] : b.stops.map((s) => s.piece),
      serve: b.serve || null,
    };
  };

  // the flags the model server is started with for this model; wants: it has broken down often enough, served the usual way, to be
  // served again without drafts; learnServe: do so from now on, and begin its counts again (they describe the other way of serving)
  const serve = (key) => {
    const b = book(key);
    return b.serve && !b.serve.refused ? b.serve.flags : [];
  };
  const wants = (key) => {
    const b = book(key);
    if (b.serve) return false;
    const s = says(key);
    return s.broke + s.ended >= ENOUGH;
  };
  const learnServe = async (key) => {
    const b = book(key);
    const s = says(key);
    b.serve = {
      flags: NO_DRAFTS,
      at: Date.now(),
      before: { asked: s.asked, broke: s.broke, ended: s.ended, piece: (b.stops[0] || {}).piece || '' },
    };
    b.first = {};
    b.after = {};
    b.ended = 0;
    b.stops = [];
    b.samples = [];
    await save();
    return b.serve.flags;
  };
  const unserve = async (key) => {
    const b = book(key);
    if (b.serve) {
      b.serve.refused = true;
      await save();
    }
  }; // this engine does not know the flag

  // ONE REQUEST to an OpenAI-style chat endpoint, made sound: asked the learned way, watched as it streams, ended where it was whole
  // if it runs on, and asked again another way if it breaks down part-way. Nothing broken is handed on.
  //   onPiece(text)   optional: the words as they come, a little behind the model so that a breakdown is caught before it is shown
  //   onReset(text)   what has been shown is to be replaced by text ('' when the reply is being asked for again)
  // Resolves { ok, status, events (the stream lines of the sound reply), text, usage, rung, tries, ended } or { ok: false, broke, cut }.
  async function ask({ key, url, body, expect = '', signal, onPiece = null, onReset = null, tries = 6 }) {
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const sit = msgs.some((m) => m && m.role === 'tool') ? 'after' : 'first';
    const sent = JSON.stringify(msgs);
    const capKey = body.max_completion_tokens != null ? 'max_completion_tokens' : 'max_tokens';
    const full = Number(body[capKey]) || 0;
    const own = body.stop == null ? [] : [].concat(body.stop);
    let last = null;
    let again = -1;
    let shorts = 0;
    let look = false;
    const tried = new Set();
    for (let attempt = 0; attempt < tries; attempt++) {
      const entry = book(key);
      const list = order(key, sit);
      if (again < 0 && list.every((x) => tried.has(x))) tried.clear(); // every way has been tried for this request: round again, best first
      const choice = again >= 0 ? again : list.find((x) => !tried.has(x));
      const rung = RUNGS[choice];
      const rec = entry[sit][rung.id];
      const capped = !(rec && rec.n > rec.bad) && (!full || full > TRIAL * 2);
      again = -1;
      tried.add(choice);
      const bare = look;
      look = false; // this try is the look without the stop piece
      const stops =
        entry.no.stop || bare
          ? []
          : entry.stops
              .map((s) => s.piece)
              .filter((p) => !sent.includes(p))
              .slice(0, Math.max(0, 4 - own.length)); // never a piece the conversation itself contains
      const startedAt = Date.now();
      const ctl = new AbortController();
      const guardian = guard({ expect });
      const parts = [];
      const calls = {};
      let cut = null;
      let events = [];
      let text = '';
      let usage = null;
      let shown = '';
      let held = '';
      let finish = '';
      const stop = () => ctl.abort();
      if (signal) {
        if (signal.aborted) throw new Error('cancelled');
        signal.addEventListener('abort', stop, { once: true });
      }
      const show = (all) => {
        if (!onPiece) return;
        const out = all ? held : held.slice(0, Math.max(0, held.length - 40));
        if (out) {
          held = held.slice(out.length);
          shown += out;
          onPiece(out);
        }
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...body,
            ...(rung.flat ? { messages: flat(msgs) } : {}),
            ...rung.extra,
            ...(capped ? { [capKey]: TRIAL } : {}),
            ...(stops.length ? { stop: [...own, ...stops] } : {}),
            stream: true,
          }),
        });
        if (!res.ok) {
          const said = (await res.text()).slice(0, 2000);
          const ours = Object.keys(rung.extra).find((k) => said.includes(k));
          if ((res.status === 400 || res.status === 422) && ours) {
            await mark(key, sit, choice, 'no');
            attempt--;
            continue;
          } // the server does not take that setting: never again, and not counted as a try
          if ((res.status === 400 || res.status === 422) && stops.length && /\bstop\b/i.test(said)) {
            entry.no.stop = true;
            await save();
            again = choice;
            attempt--;
            continue;
          } // nor stop pieces
          return { ok: false, status: res.status, error: said, rung: choice, tries: attempt + 1 };
        }
        const dec = new TextDecoder();
        let buf = '';
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const m = /^data:\s*(.*)$/.exec(line.trim());
            if (!m) continue;
            events.push(m[1]);
            if (m[1] === '[DONE]') continue;
            let j;
            try {
              j = JSON.parse(m[1]);
            } catch {
              continue;
            }
            if (j.usage) usage = j.usage;
            const c = j.choices && j.choices[0];
            if (!c) continue;
            if (c.finish_reason) finish = c.finish_reason;
            const d = c.delta;
            if (!d) continue;
            let piece = '';
            if (d.reasoning_content) {
              parts.push(['r', d.reasoning_content]);
              piece += d.reasoning_content;
            }
            if (d.content) {
              parts.push(['c', d.content]);
              piece += d.content;
              held += d.content;
            }
            for (const tc of d.tool_calls || []) {
              const k = tc.index || 0;
              const at = calls[k] || (calls[k] = { id: '', name: '' });
              const f = tc.function || {};
              if (tc.id) at.id = tc.id;
              if (f.name) at.name = f.name;
              if (f.arguments) {
                parts.push([k, f.arguments]);
                piece += f.arguments;
              }
            }
            if (!piece) continue;
            text += piece;
            cut = guardian.feed(piece);
            if (cut) break;
            show(false);
          }
          if (cut) break;
        }
      } catch (e) {
        if (!cut) {
          if (signal && signal.aborted) throw new Error('cancelled');
          throw e;
        }
      } finally {
        if (signal) signal.removeEventListener('abort', stop);
        if (cut) ctl.abort();
      }
      // with a stop piece in force a breakdown is not seen: the reply just ends there. So a reply that ended is asked whether it is whole.
      const done = cut ? whole(parts, cut.keep.length, calls) : null;
      const short = !cut && stops.length > 0 && finish !== 'length' && !whole(parts, text.length, calls);
      trace({
        key,
        way: rung.name,
        after: sit === 'after',
        ms: Date.now() - startedAt,
        result: short ? 'stopped short' : !cut ? 'sound' : done ? 'ended for it' : 'broke down',
        kept: cut ? cut.keep.length : text.length,
        trial: capped,
        stops: stops.length,
        finish,
        head: text.slice(0, 400),
        tail: text.length > 400 ? text.slice(-120) : '',
        asked: msgs
          .slice(-1)
          .map((m) => m.role + ': ' + (textOf(m.content) || JSON.stringify(m.tool_calls || '')).slice(0, 300))[0],
      });
      if (!cut && !short) {
        await mark(key, sit, choice, 'ok');
        if (capped && finish === 'length' && full !== TRIAL) {
          if (shown && onReset) onReset('');
          again = choice;
          attempt--;
          continue;
        } // sound, and only cut short by the trial: once more, in full
        show(true);
        return { ok: true, status: 200, events, text, usage, rung: choice, tries: attempt + 1, cut: last };
      }
      if (done) {
        // it had finished and ran on: ended where it was whole, and handed on as a reply that ended there
        await mark(key, sit, choice, 'ended', '', cut.unit);
        if (onPiece) {
          if (done.content.startsWith(shown)) {
            if (done.content.length > shown.length) onPiece(done.content.slice(shown.length));
          } else if (onReset) onReset(done.content);
        }
        const id = 'chatcmpl-ended';
        const head = { id, object: 'chat.completion.chunk', model: body.model };
        const delta = {
          role: 'assistant',
          ...(done.content ? { content: done.content } : {}),
          ...(done.calls.length
            ? {
                tool_calls: done.calls.map((c, k) => ({
                  index: k,
                  id: c.id || 'call_' + k,
                  type: 'function',
                  function: { name: c.name, arguments: c.args },
                })),
              }
            : {}),
        };
        return {
          ok: true,
          status: 200,
          ended: true,
          events: [
            JSON.stringify({ ...head, choices: [{ index: 0, delta, finish_reason: null }] }),
            JSON.stringify({
              ...head,
              choices: [{ index: 0, delta: {}, finish_reason: done.calls.length ? 'tool_calls' : 'stop' }],
            }),
            '[DONE]',
          ],
          text: done.content,
          usage: null,
          rung: choice,
          tries: attempt + 1,
          cut: last,
        };
      }
      const kept = cut ? cut.keep : text;
      const k0 = Object.keys(calls)[0];
      const content = parts
        .filter((p) => p[0] === 'c')
        .map((p) => p[1])
        .join('');
      await mark(
        key,
        sit,
        choice,
        'bad',
        cut
          ? (kept.slice(-70) + ' >> ' + text.slice(kept.length, kept.length + 30)).trim()
          : (kept.slice(-70) + ' >> (it ended here, at a piece it repeats)').trim(),
        cut && cut.unit,
      );
      last = {
        kind: cut ? cut.kind : 'short',
        keep: kept,
        rung: choice,
        shape: { content: Math.min(content.length, kept.length), call: k0 !== undefined ? calls[k0] : null },
      };
      if (shown && onReset) onReset('');
      // ENDED AT A STOP PIECE, TWICE, WITHOUT LOOKING WHOLE. It may have broken down there, or it may simply be how this reply ends (a
      // list, a bare number): the stop piece hides which. So it is asked once more the same way WITHOUT the stop piece. If the repeated
      // piece comes, it was a breakdown and the tries go on; if the reply ends by itself, that reply is the answer.
      if (short && !Object.keys(calls).length && ++shorts === 2) {
        look = true;
        again = choice;
      }
    }
    return {
      ok: false,
      status: 200,
      broke: true,
      cut: last,
      text: last ? last.keep : '',
      rung: last ? last.rung : 0,
      tries,
    }; // every try broke down: what was sound before the last break is all there is
  }
  return { ask, says, order, serve, wants, learnServe, unserve };
}
