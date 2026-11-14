// seat-replies.mjs - HOW A SEAT IS ASKED AND ANSWERS: the model and the effort each seat thinks with, one reply from whichever engine
// the team is on (with what was learned about how that model has to be asked), and a seat looking at a picture.
import { claudeOffers, claudeRoot, claudeRun } from './claude.mjs';
import { readMedia } from './media.mjs';
import { writeWhole } from './whole.mjs';
import { ownTests } from './prove.mjs';
import { languageLine, scriptOf } from './talk.mjs';
import path from 'node:path';
import { where } from './engine.mjs';
import { tgt } from './setup/steps.mjs';

// one reply from whichever engine is running: a system line (who is speaking), the conversation, and each piece as it is written
// customer: what the customer wrote (the reply is kept in its language and writing system). use: what this turn may use on Claude
// Code beyond its connectors ({ web, shot }). onReset(text): what has been shown is to be replaced by text (a local model's reply
// broke down and was cut, and is being asked again).
// WHO IS HERE, ON CLAUDE CODE: each seat thinks with the model and at the effort the customer picked for it. Kept by seat in disk.minds;
// a seat with none runs as Claude Code would by itself. A choice this Claude Code no longer takes (it was changed under us) is left out.
export const SEAT_IDS = ['overseer', 'steward', 'operations', 'ask', 'master'];

export function installSeatReplies(runner) {
  async function lookAt(files, about, dir) {
    const onClaude = !!(runner.disk.engine && runner.disk.engine.kind === 'claude');
    const claude = onClaude
      ? async ({ prompt, cwd }) =>
          claudeRun({
            bin: runner.disk.engine.bin,
            cwd,
            prompt,
            allow: ['Read'],
            maxTurns: 30,
            timeout: 6 * 60000,
            ...(await mindFor('ask')),
          })
      : null;
    const see = !onClaude && runner.eyes.has().see ? (o) => runner.eyes.see(o) : null;
    const textAsk = async ({ system, prompt, max }) => {
      let said = '';
      await reply({
        seat: 'ask',
        system,
        maxTokens: max || 260,
        temperature: 0,
        onText: (d) => {
          said += d;
        },
        onReset: (t) => {
          said = t || '';
        },
        messages: [{ role: 'user', content: prompt }],
      });
      return said;
    };
    return readMedia({ files, about, dir, see, claude, textAsk });
  }

  // THE FILE, WRITTEN OUT WHOLE (a team on a local model): the second way of making a change, for when editing with tools has failed.
  // Each file the task names is asked for as text, complete, one file a reply, with the file as it is committed in front of the model
  // and the other named files beside it for reference. A reply is kept only if it is a whole file in one code block, has not lost
  // half of what was there, and still builds; otherwise the file is put back as it was. -> how many files were written
  const askText = async ({ system, prompt, max, temperature = 0, seat = 'operations' }) => {
    let said = '';
    await reply({
      seat,
      system,
      maxTokens: max || 600,
      temperature,
      onText: (d) => {
        said += d;
      },
      onReset: (t) => {
        said = t || '';
      },
      messages: [{ role: 'user', content: prompt }],
    });
    return said;
  };

  const wholeFiles = ({ dir, task, idea = null, fails = '' }) =>
    writeWhole({
      dir,
      task,
      idea,
      fails,
      askText,
      builds: async (f) => {
        const b = await ownTests(dir, { changed: [f], buildOnly: true }).catch(() => null);
        return b ? b.builds !== false : null;
      },
    }); // whole.mjs

  async function mindsView() {
    const on = !!(runner.disk.engine && runner.disk.engine.kind === 'claude');
    const o = on ? await claudeOffers(runner.disk.engine.bin) : { models: [], efforts: [] };
    const kept = runner.disk.minds || {};
    const has = (list, v) => list.some((x) => x.id === v);
    return {
      on,
      models: o.models,
      efforts: o.efforts,
      seats: Object.fromEntries(
        SEAT_IDS.map((id) => [
          id,
          {
            model: has(o.models, (kept[id] || {}).model) ? kept[id].model : '',
            effort: has(o.efforts, (kept[id] || {}).effort) ? kept[id].effort : '',
          },
        ]),
      ),
    };
  }

  async function mindFor(seat) {
    if (
      !runner.disk.engine ||
      runner.disk.engine.kind !== 'claude' ||
      !SEAT_IDS.includes(seat) ||
      !runner.disk.minds ||
      !runner.disk.minds[seat]
    )
      return { model: '', effort: '' };
    return (await mindsView()).seats[seat];
  }

  async function reply({
    system,
    messages,
    onText,
    onReset = () => {},
    signal,
    maxTokens = 400,
    temperature = 0.7,
    customer = '',
    lang = '',
    use = null,
    seat = '',
  }) {
    const startedAt = Date.now();
    let first = 0;
    let tries = 0;
    const fit = runner.disk.session && runner.disk.session.measured && runner.disk.session.measured.fit;
    if (fit && fit.seat) system = [system, fit.seat].filter(Boolean).join('\n\n');
    if (customer) system = [system, languageLine(customer, lang)].filter(Boolean).join('\n\n');
    if (runner.disk.engine.kind === 'claude') {
      let prompt = messages.map((m) => m.content).join('\n\n');
      const mind = await mindFor(seat);
      const allow = (runner.disk.connectors || []).map((id) => 'mcp__' + id + '__*');
      if (use && use.web) allow.push('WebSearch', 'WebFetch'); // this turn was asked to find something out: Claude Code's own search and fetch, on the customer's own plan
      if (use && /^[a-f0-9]{12}$/.test(use.shot || ''))
        prompt +=
          '\n\nThe picture that was taken is the file ' +
          path.join(runner.shotDir, use.shot + '.png') +
          '. Open it with your Read tool and look at it before you answer.';
      const r = await claudeRun({
        bin: runner.disk.engine.bin,
        cwd: path.join(claudeRoot(), 'chat'),
        prompt,
        system,
        signal,
        allow,
        ...mind,
        onText: (d) => {
          tries++;
          onText(d);
        },
      });
      if (!r.ok)
        throw new Error(
          (mind.model ? 'Claude Code, asked for ' + mind.model + ': ' : '') + (r.why || 'Claude Code did not answer'),
        );
      return { tokens: null, tokPerSec: null, firstTokenMs: r.firstTokenMs, seconds: r.seconds };
    }
    // a local model: asked the way it has been learned to need, watched as it streams, cut and asked again if it breaks down (tune.mjs)
    const t = where(tgt(runner.disk.engine));
    const answer = await runner.tune.ask({
      key: runner.engineKey(),
      url: t.base + runner.CHAT,
      expect: scriptOf(customer),
      signal,
      body: {
        model: t.model,
        messages: [system ? { role: 'system', content: system } : null, ...messages].filter(Boolean),
        max_tokens: maxTokens,
        temperature,
      },
      onPiece: (d) => {
        if (!first) first = Date.now();
        tries++;
        onText(d);
      },
      onReset: (text = '') => {
        if (!text) tries = 0;
        onReset(text);
      },
    });
    if (!answer.ok && !answer.broke)
      throw new Error('the model server answered ' + answer.status + ': ' + String(answer.error || '').slice(0, 160));
    const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
    if (answer.broke) {
      onReset(
        (answer.text ? answer.text + ' ' : '') +
          '[The rest of this reply broke down into repetition, however it was asked, and was cut.]',
      );
      return { tokens: tries, tokPerSec: null, firstTokenMs: first ? first - startedAt : null, seconds, broke: true };
    }
    const tokens = (answer.usage && Number(answer.usage.completion_tokens)) || tries;
    const secs = Math.max(0.001, (Date.now() - (first || startedAt)) / 1000);
    return {
      tokens,
      tokPerSec: Math.round((tokens / secs) * 10) / 10,
      firstTokenMs: first ? first - startedAt : null,
      seconds,
      ...(answer.tries > 1 ? { askedAgain: answer.tries - 1 } : {}),
    };
  }

  Object.assign(runner, { mindsView, mindFor, reply, wholeFiles, lookAt });
}
