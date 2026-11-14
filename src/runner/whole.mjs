// whole.mjs - THE FILE, WRITTEN OUT WHOLE: the second way of making a change, for a team on a local model, when editing with tools has
// failed. A local model that edits with tools sometimes leaves a file that no longer parses, or talks about the change and edits
// nothing; asked for a file as text the same model is far steadier (that is how its proofs came right). So each file the task names is
// asked for complete, one file a reply, with the file as it is committed in front of the model and the other named files beside it
// for reference. A reply is kept only if it is a whole file in one code block, has not lost half of what was there, is not the same
// file again, and still builds; otherwise the file is left exactly as it was.
//   writeWhole({ dir, task, idea, fails, askText, builds }) -> how many files were written
//     idea     { seat, name, where, idea }: a seat's idea from the room (swarm.mjs); the file is then written in that seat's temper, at its warmth
//     fails    what an earlier try got wrong, in a line
//     askText  ({ system, prompt, max, temperature, seat }) -> text: the team's model, with no tools
//     builds   (file) -> true | false | null: does it still build with this file as it now is (null: there is no quick way to tell)
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { TEMPER } from '../js/team-soul.js';
import { sh } from './host.mjs';

const SOURCE = /[\w./-]+\.(?:py|mjs|cjs|js|jsx|ts|tsx|kt|swift|dart)\b/g;
const TEST =
  /(^|\/)(test_[\w-]+\.py|[\w-]+_test\.(py|dart)|[\w.-]+\.(test|spec)\.[cm]?[jt]sx?|\w+Tests?\.(swift|kt|java))$/;
const FENCE = /\x60\x60\x60[\w+-]*\n([\s\S]*?)\n\x60\x60\x60/;
// the files a task names that this is allowed to write: inside the repository, not a test
export const namedIn = (task) =>
  [...new Set(String(task).match(SOURCE) || [])]
    .filter((f) => !f.startsWith('/') && !f.startsWith('.') && !f.split('/').includes('..') && !TEST.test(f))
    .slice(0, 4);
// the one file in a reply: the first code block, whole. A block that never closed is a file that was cut short, and is not taken.
export const fileIn = (said) => {
  const m = FENCE.exec(String(said || ''));
  return m && m[1].trim().length >= 20 ? m[1].replace(/\s+$/, '') + '\n' : '';
};
export async function writeWhole({ dir, task, idea = null, fails = '', askText, builds = async () => null }) {
  const named = namedIn(task);
  const t = idea && TEMPER[idea.seat] ? TEMPER[idea.seat] : null;
  let wrote = 0;
  for (const file of named) {
    const at = path.join(dir, file);
    const now = await readFile(at, 'utf8').catch(() => null);
    const head = await sh('git', ['-C', dir, 'show', 'HEAD:' + file], { timeout: 20000 });
    const base = head.ok ? head.out + '\n' : null;
    if (base === null && (now !== null || !/\bnew file\b/i.test(task))) continue; // a name the task only mentions, that is not a file here, is not written
    if ((base || '').length > 8000) continue; // too long to ask for whole
    const others = (
      await Promise.all(
        named
          .filter((g) => g !== file)
          .map(async (g) => {
            const c = await readFile(path.join(dir, g), 'utf8').catch(() => '');
            return c && c.length < 3500 ? 'For reference only, ' + g + ' as it stands now:\n\n' + c : '';
          }),
      )
    )
      .filter(Boolean)
      .join('\n\n');
    const said = await askText({
      seat: idea ? idea.seat : 'operations',
      temperature: t ? Math.min(0.7, t.warmth) : 0,
      max: 3200,
      system:
        'You write one source file. You reply with the complete file in a single code block and nothing else.' +
        (t ? ' You write it as yourself: ' + t.temper + '.' : ''),
      prompt:
        'A repository needs this change:\n\n' +
        task +
        '\n\n' +
        (base !== null
          ? 'The file ' + file + ' as it is today, before the change:\n\n' + base
          : 'The file ' + file + ' does not exist yet: the change adds it.') +
        (others ? '\n\n' + others : '') +
        (fails ? '\n\nAn earlier try at this change failed: ' + fails : '') +
        (idea
          ? '\n\n' +
            idea.name +
            ', on your team, has this idea' +
            (idea.where ? ' (' + idea.where + ')' : '') +
            ': ' +
            idea.idea
          : '') +
        '\n\nWrite the complete new contents of ' +
        file +
        ', with the change made.' +
        (base !== null ? ' If this file needs no change for the task, reply with the single word SAME.' : '') +
        ' Keep everything the task does not ask to change exactly as it is: the imports, the comments, the other functions. Reply with the whole file in one code block and nothing else.',
    }).catch(() => '');
    const body = fileIn(said);
    if (!body) continue;
    if (base !== null && (body.length < base.length * 0.5 || body.trim() === base.trim())) continue; // half of it gone is a loss, not a change; the same again is no change
    await mkdir(path.dirname(at), { recursive: true });
    await writeFile(at, body);
    if ((await builds(file).catch(() => null)) === false) {
      if (now === null) await rm(at, { force: true }).catch(() => {});
      else await writeFile(at, now);
      continue;
    } // it does not build: put back as it was
    wrote++;
  }
  return wrote;
}
