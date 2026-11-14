// media.mjs - WHAT A TICKET'S PICTURES AND VIDEO SHOW. A ticket very often says "see the screenshot" or "watch the recording" and nothing
// else, and a team that reads only its words is working on a guess. So what is attached is fetched to this machine, looked at, and
// written down in words the whole team can read: by the picture-reading helper beside a local model (eyes.mjs), or by the customer's
// own Claude Code, which can see. Nothing is sent anywhere else, and the files stay in this app's own folder.
//   kindOf(name, type)                       'image' | 'video' | ''
//   fetchMedia({ url, dest, kind, max })     one file from a short-lived address the Jira connector gave: only https, only Atlassian's
//                                            media hosts, only the kind it was said to be, and no larger than max
//   framesOf(file, outDir, { max })          the frames of a recording that matter: the first, the last, and each side of every moment
//                                            the screen CHANGED (a click that did something), found by comparing small grey copies
//   readMedia({ files, about, dir, see, claude, textAsk, onStep }) -> [{ name, kind, ok, says, frames, seconds, by, why }]
//   mediaNote(list)                          those, as the lines that go into what the team is asked to do
// A recording needs ffmpeg to be taken apart. Where the machine has none, macOS's own Quick Look gives its opening frame, and that is
// said: one frame looked at is not the recording watched.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { which } from './host.mjs';

const IMG = /\.(png|jpe?g|gif|webp|bmp|heic)$/i;
const VID = /\.(mov|mp4|m4v|webm|mkv|avi)$/i;
export const kindOf = (name, type) =>
  /^image\//i.test(String(type || '')) || IMG.test(String(name || ''))
    ? 'image'
    : /^video\//i.test(String(type || '')) || VID.test(String(name || ''))
      ? 'video'
      : '';
export const safeName = (name) =>
  String(name || 'file')
    .replace(/[^\w.() -]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80) || 'file';
const exists = (f) =>
  stat(f).then(
    () => true,
    () => false,
  );
// a command run for its bytes (a string would mangle a picture)
const runBytes = (cmd, args, { timeout = 120000, max = 64 * 2 ** 20 } = {}) =>
  new Promise((ok) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return ok({ code: -1, out: Buffer.alloc(0), err: String(e.message) });
    }
    const parts = [];
    let n = 0;
    let err = '';
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
    }, timeout);
    child.stdout.on('data', (c) => {
      n += c.length;
      if (n <= max) parts.push(c);
    });
    child.stderr.on('data', (c) => {
      err = (err + String(c)).slice(-400);
    });
    child.on('error', (e) => {
      clearTimeout(t);
      ok({ code: -1, out: Buffer.alloc(0), err: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      ok({ code, out: Buffer.concat(parts), err });
    });
  });

// ---------- one file, from the address the connector gave ----------
// The address carries a short-lived token of the customer's, so it is used once, here, and never kept, logged or shown.
const HOSTS = /(^|\.)(atlassian\.com|atlassian\.net|atl-paas\.net|atlassian-us-gov-mod\.com)$/i;
export const mediaHostOk = (u) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && HOSTS.test(x.hostname);
  } catch {
    return false;
  }
};
export async function fetchMedia({ url, dest, kind, max = 120 * 2 ** 20, signal }) {
  const hostOk = process.env.FO_MEDIA_HOST ? String(url).startsWith(process.env.FO_MEDIA_HOST) : mediaHostOk(url); // a test names its own stand-in host
  if (!hostOk) return { ok: false, why: "the address it was given is not one of Atlassian's" };
  if (process.env.FO_NO_NET === '1' && !process.env.FO_MEDIA_HOST)
    return { ok: false, why: 'this machine is not using the network' }; // a test run never reaches the real media host
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal });
  } catch (e) {
    return { ok: false, why: 'it could not be fetched (' + String((e && e.message) || e).slice(0, 80) + ')' };
  }
  if (!process.env.FO_MEDIA_HOST && !mediaHostOk(res.url))
    return { ok: false, why: "the address led somewhere that is not Atlassian's" };
  if (res.status !== 200)
    return {
      ok: false,
      why:
        'Jira answered ' +
        res.status +
        ' for it' +
        (res.status === 401 || res.status === 403 ? ': the address had run out' : ''),
    };
  const type = String(res.headers.get('content-type') || '');
  const len = Number(res.headers.get('content-length') || 0);
  if (kind && type && !new RegExp('^' + kind + '/', 'i').test(type) && !/octet-stream/i.test(type))
    return {
      ok: false,
      why: 'what came back is ' + type.slice(0, 40) + ', not ' + (kind === 'image' ? 'a picture' : 'a video'),
    };
  if (len > max)
    return {
      ok: false,
      why:
        'it is ' + Math.round(len / 2 ** 20) + ' MB, more than the ' + Math.round(max / 2 ** 20) + ' MB this looks at',
    };
  await mkdir(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  const out = createWriteStream(part);
  let n = 0;
  let big = false;
  try {
    for await (const c of res.body) {
      n += c.length;
      if (n > max) {
        big = true;
        break;
      }
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
    }
  } catch (e) {
    await new Promise((r) => out.end(r));
    await rm(part, { force: true });
    return { ok: false, why: 'it stopped part way (' + String((e && e.message) || e).slice(0, 60) + ')' };
  }
  await new Promise((r) => out.end(r));
  if (big || n < 64) {
    await rm(part, { force: true });
    return {
      ok: false,
      why: big ? 'it is larger than the ' + Math.round(max / 2 ** 20) + ' MB this looks at' : 'it came back empty',
    };
  }
  await rename(part, dest);
  return { ok: true, file: dest, bytes: n, type };
}

// ---------- a recording, taken apart ----------
const ffmpeg = async () =>
  process.env.FO_NO_FFMPEG === '1'
    ? null
    : process.env.FO_BIN_FFMPEG !== undefined
      ? (await exists(process.env.FO_BIN_FFMPEG))
        ? process.env.FO_BIN_FFMPEG
        : null
      : await which('ffmpeg');
const stamp = (s) => {
  const t = Math.max(0, Math.round(s));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};
// WHICH MOMENTS MATTER. The recording is sampled a few times a second as tiny grey pictures (32 x 32), and each is compared with the one
// before. Where the difference jumps, the screen changed: the frame just before it and the frame once it has settled are both kept,
// because "before the click" and "after the click" is exactly what a bug report shows. times: the sample times; diffs[i]: i against i-1.
export function pickMoments(times, diffs, max = 6) {
  const frameCount = times.length;
  if (!frameCount) return [];
  if (frameCount <= max)
    return times.map((t, i) => ({
      at: t,
      why: i === 0 ? 'the start' : i === frameCount - 1 ? 'the end' : 'a moment in it',
    }));
  const sorted = [...diffs.slice(1)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const bar = Math.max(2.5, median * 4);
  const picks = new Map([
    [0, 'the start'],
    [frameCount - 1, 'the end'],
  ]);
  const jumps = [];
  for (let i = 1; i < frameCount; i++)
    if (diffs[i] > bar && !(i > 1 && diffs[i - 1] > bar)) {
      let end = i;
      while (end + 1 < frameCount && diffs[end + 1] > bar) end++;
      jumps.push({ i, end, size: Math.max(...diffs.slice(i, end + 1)) });
    } // a run of changing frames is one change
  // the biggest changes, and no two of them close together: a long recording is covered from end to end, not only where it was busiest
  const gap = Math.max(1, Math.floor(frameCount / 12));
  const chosen = [];
  for (const j of jumps.sort((a, b) => b.size - a.size)) {
    if (chosen.length >= Math.max(1, Math.floor((max - 2) / 2))) break;
    if (!chosen.some((c) => Math.abs(c.i - j.i) < gap)) chosen.push(j);
  }
  for (const j of chosen) {
    if (j.i - 1 > 0 && !picks.has(j.i - 1)) picks.set(j.i - 1, 'just before the screen changed');
    const after = Math.min(frameCount - 1, j.end + 1);
    if (!picks.has(after)) picks.set(after, 'just after the screen changed');
  }
  if (picks.size < Math.min(max, 4))
    for (let k = 1; picks.size < Math.min(max, 4) && k < 4; k++) {
      const i = Math.round(((frameCount - 1) * k) / 4);
      if (!picks.has(i)) picks.set(i, 'a moment in it');
    } // nothing much changed: evenly through it
  return [...picks.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, max)
    .map(([i, why]) => ({ at: times[i], why }));
}
export async function framesOf(file, outDir, { max = 6 } = {}) {
  const startedAt = Date.now();
  const ffmpegBin = await ffmpeg();
  await mkdir(outDir, { recursive: true });
  if (!ffmpegBin) {
    // no ffmpeg: macOS's own Quick Look gives the opening frame, and that is all
    if (process.platform === 'darwin' && process.env.FO_NO_QUICKLOOK !== '1') {
      const r = await runBytes('/usr/bin/qlmanage', ['-t', '-s', '1280', '-o', outDir, file], { timeout: 60000 });
      const made = (await readdir(outDir).catch(() => [])).find((n) => /\.png$/i.test(n));
      if (r.code === 0 && made)
        return {
          ok: true,
          frames: [{ file: path.join(outDir, made), at: 0, why: 'its opening frame' }],
          duration: null,
          partial:
            'Only its opening frame was looked at: taking a recording apart needs ffmpeg, which is not on this machine (brew install ffmpeg).',
          by: 'Quick Look',
          seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        };
    }
    return {
      ok: false,
      why: 'A recording is taken apart with ffmpeg, which is not on this machine (brew install ffmpeg).',
    };
  }
  const probe = (await which('ffprobe')) || path.join(path.dirname(ffmpegBin), 'ffprobe');
  const d = await runBytes(probe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    timeout: 30000,
  });
  const duration = Number(String(d.out).trim()) || 0;
  if (!duration)
    return {
      ok: false,
      why:
        'It could not be read as a video' +
        (d.err ? ' (' + d.err.split('\n').filter(Boolean).pop().slice(0, 100) + ')' : '') +
        '.',
    };
  // each sample is a grey picture 64 x 64, compared with the one before in 64 squares of 8 x 8: the difference is that of the square that
  // changed MOST. A number that changes on an otherwise still screen moves one square a lot and the whole picture hardly at all.
  const fps = Math.min(4, Math.max(0.25, 120 / duration));
  const N = 64;
  const B = 8;
  const small = await runBytes(
    ffmpegBin,
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      'fps=' + fps.toFixed(3) + ',scale=' + N + ':' + N + ',format=gray',
      '-f',
      'rawvideo',
      '-',
    ],
    { timeout: 180000 },
  );
  const count = Math.floor(small.out.length / (N * N));
  const times = [];
  const diffs = [];
  for (let i = 0; i < count; i++) {
    times.push(Math.min(duration - 0.05, i / fps));
    let most = 0;
    if (i)
      for (let by = 0; by < N; by += B)
        for (let bx = 0; bx < N; bx += B) {
          let sum = 0;
          for (let y = by; y < by + B; y++)
            for (let x = bx; x < bx + B; x++)
              sum += Math.abs(small.out[i * N * N + y * N + x] - small.out[(i - 1) * N * N + y * N + x]);
          if (sum / (B * B) > most) most = sum / (B * B);
        }
    diffs.push(most);
  }
  const moments = count
    ? pickMoments(times, diffs, max)
    : [
        { at: 0, why: 'the start' },
        { at: Math.max(0, duration / 2), why: 'a moment in it' },
        { at: Math.max(0, duration - 0.2), why: 'the end' },
      ];
  const frames = [];
  for (const [i, m] of moments.entries()) {
    const out = path.join(outDir, 'frame-' + String(i + 1).padStart(2, '0') + '.png');
    const r = await runBytes(
      ffmpegBin,
      [
        '-v',
        'error',
        '-y',
        '-ss',
        m.at.toFixed(2),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        'scale=min(1280\\,iw):-2',
        out,
      ],
      { timeout: 60000 },
    );
    if (r.code === 0 && (await exists(out))) frames.push({ file: out, at: m.at, why: m.why });
  }
  if (!frames.length)
    return {
      ok: false,
      why:
        'No frame could be taken from it' +
        (small.err ? ' (' + small.err.split('\n').filter(Boolean).pop().slice(0, 100) + ')' : '') +
        '.',
    };
  return { ok: true, frames, duration, by: 'ffmpeg', seconds: Math.round((Date.now() - startedAt) / 100) / 10 };
}

// ---------- looked at, and written down ----------
const clip = (s, n) => {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};
const PIC = (about) =>
  'This picture is attached to a software ticket' +
  (about ? ' that says: "' + clip(about, 360) + '"' : '') +
  '. Say what the picture shows. Copy every word and number on it exactly as it is written. If something is circled, arrowed, underlined or highlighted, say exactly what. Finish with one line that starts "WRONG:" and says what looks wrong, or "WRONG: nothing I can see".';
const FRAME = (at, why) =>
  'This is one frame of a screen recording, at ' +
  stamp(at) +
  ' (' +
  why +
  '). Copy the words and numbers on the screen exactly as they are written, and say what is being pressed or pointed at if you can see it. At most four lines.';
// what a reading says is wrong: its WRONG line, unless that line says nothing is, or only says the ticket's own words back
export const wrongIn = (text, about = '') => {
  const m = /(?:^|\n|\s)WRONG:\s*([^\n]+)/i.exec(String(text || ''));
  const w = m ? m[1].trim().replace(/[.\s]+$/, '') : '';
  if (!w || /^(nothing|none|no fault|n\/a)\b/i.test(w)) return '';
  const mine = new Set(
    String(about)
      .toLowerCase()
      .match(/[a-z]{4,}/g) || [],
  );
  const ws = w.toLowerCase().match(/[a-z]{4,}/g) || [];
  return ws.length && ws.filter((x) => mine.has(x)).length / ws.length > 0.8 ? '' : clip(w, 300);
};
const jsonIn = (t) => {
  const a = String(t).indexOf('{');
  const b = String(t).lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(String(t).slice(a, b + 1));
  } catch {
    return null;
  }
};
// files: [{ name, kind, file }]  about: the ticket's own words, so the reader knows what it is looking for
// see({ file, ask, max }) -> { ok, text, by }          the picture-reading helper (a local model's team), or null
// claude({ prompt, cwd }) -> { ok, text, why }         the customer's Claude Code, allowed to read files in cwd and nothing else, or null
// textAsk({ system, prompt, max }) -> text             the team's own model, for putting a recording's frames into one account
export async function readMedia({
  files,
  about = '',
  dir,
  see = null,
  claude = null,
  textAsk = null,
  onStep = () => {},
}) {
  const out = [];
  const startedAt = Date.now();
  const todo = [];
  for (const f of files.slice(0, 8)) {
    const row = { name: f.name, kind: f.kind, ok: false, says: '', frames: 0, seconds: 0, by: '', why: '' };
    out.push(row);
    if (f.kind === 'video') {
      onStep('Taking ' + f.name + ' apart');
      const fr = await framesOf(f.file, path.join(dir, 'frames-' + safeName(f.name).replace(/\W+/g, '-')), { max: 6 });
      if (!fr.ok) {
        row.why = fr.why;
        continue;
      }
      todo.push({ f, row, frames: fr.frames, duration: fr.duration, partial: fr.partial || '' });
      row.frames = fr.frames.length;
      row.duration = fr.duration;
    } else if (f.kind === 'image') todo.push({ f, row, frames: null });
    else row.why = 'it is not a picture or a video';
  }
  if (!todo.length) return out;
  if (!see && !claude) {
    for (const x of todo)
      x.row.why =
        'This team has no way to look at a picture. Add the picture-reading helper on the Start page, or run the team on Claude Code.';
    return out;
  }
  if (claude) {
    // one run, with every file named: it opens each with its Read tool and says what it shows
    onStep('Looking at what is attached');
    const list = todo
      .map((x, i) =>
        x.frames
          ? 'FILE ' +
            (i + 1) +
            ': "' +
            x.f.name +
            '", a screen recording' +
            (x.duration ? ' of ' + Math.round(x.duration) + ' s' : '') +
            '. These are frames from it, in order:\n' +
            x.frames.map((fr) => '  ' + fr.file + '   (at ' + stamp(fr.at) + ', ' + fr.why + ')').join('\n')
          : 'FILE ' + (i + 1) + ': "' + x.f.name + '", a picture:\n  ' + x.f.file,
      )
      .join('\n\n');
    const r = await claude({
      cwd: dir,
      prompt:
        'These files are attached to a software ticket' +
        (about ? ' that says: "' + clip(about, 600) + '"' : '') +
        '. Open every path below with your Read tool and look at it. Change nothing and run nothing.\n\n' +
        list +
        '\n\nFor each FILE say what it shows, for a team that cannot see it: the words and numbers on it that matter, copied exactly; what is circled, arrowed or highlighted; and what is wrong. For a recording, say what happens step by step (what is pressed, and what the screen shows before and after), and what goes wrong. At most 110 words a file, and only what you can see. Then, for each FILE, say separately what is WRONG in it, as plainly as a rule it breaks (for example: each press adds 2 where it should add 1; the number goes past the limit of 5 that the page states), or leave it empty when nothing is.\n\nReply with ONLY one JSON object: {"files":[{"n":1,"says":"...","wrong":"..."}]}',
    });
    const j = r && r.ok ? jsonIn(r.text) : null;
    const rows = (j && Array.isArray(j.files) && j.files) || [];
    todo.forEach((x, i) => {
      const hit = rows.find((q) => Number(q && q.n) === i + 1) || rows[i];
      x.row.by = 'Claude Code';
      if (hit && String(hit.says || '').trim()) {
        x.row.ok = true;
        x.row.says = clip(hit.says, 900) + (x.partial ? ' (' + x.partial + ')' : '');
        x.row.wrong = clip(hit.wrong, 300);
      } else
        x.row.why =
          r && !r.ok
            ? 'Claude Code could not look at it: ' + String(r.why || 'it gave no reason').slice(0, 140)
            : 'Claude Code said nothing about it';
    });
  } else {
    for (const item of todo) {
      const began = Date.now();
      if (!item.frames) {
        onStep('Looking at ' + item.f.name);
        const r = await see({ file: item.f.file, ask: PIC(about), max: 420 });
        item.row.by = r.by || '';
        if (r.ok) {
          item.row.ok = true;
          item.row.says = clip(r.text, 900);
          item.row.wrong = wrongIn(r.text, about);
          // WHAT IS WRONG, SAID AS A RULE, BY THE TEAM'S OWN MODEL. The small model that reads pictures copies what is on one well and says
          // what is wrong with it badly (found for real: its "WRONG:" line repeated the ticket's own words). So what it read is handed to
          // the model the team thinks with, which says in one line what the picture shows to be wrong and what it should be instead.
          if (textAsk) {
            const w = String(
              await textAsk({
                system:
                  "You say what a picture attached to a ticket shows to be wrong: one line, and only what the picture's own words and numbers support.",
                max: 130,
                prompt:
                  'This is what a picture attached to a software ticket shows, read off it word for word:\n\n' +
                  clip(r.text, 900) +
                  '\n\n' +
                  (about ? 'The ticket says: "' + clip(about, 360) + '"\n\n' : '') +
                  'In one line that starts "WRONG:", say what the picture shows to be wrong and what it should be instead, as plainly as a rule, using the picture\'s own words and numbers, and leaving none of the cases it shows out (for example: WRONG: the total reads $12.50 where it should read $25.00 for two mugs). If it shows nothing wrong, reply: WRONG: nothing',
              }).catch(() => ''),
            );
            item.row.wrong = wrongIn(w) || item.row.wrong;
          }
        } else
          item.row.why = r.none
            ? 'This team has no way to look at a picture. Add the picture-reading helper on the Start page.'
            : 'The picture could not be read: ' + String(r.why || '').slice(0, 160);
      } else {
        const notes = [];
        for (const fr of item.frames) {
          onStep('Looking at ' + item.f.name + ' at ' + stamp(fr.at));
          const r = await see({ file: fr.file, ask: FRAME(fr.at, fr.why), max: 200 });
          item.row.by = r.by || item.row.by;
          if (r.ok) notes.push('At ' + stamp(fr.at) + ' (' + fr.why + '): ' + clip(r.text, 320));
          else if (r.none) {
            item.row.why =
              'This team has no way to look at a picture. Add the picture-reading helper on the Start page.';
            break;
          }
        }
        if (notes.length) {
          let told = '';
          if (textAsk && notes.length > 1)
            told = String(
              await textAsk({
                system:
                  'You put notes on the frames of a screen recording into one plain account. You use only what the notes say, and you copy numbers and words exactly.',
                prompt:
                  'These are notes on ' +
                  notes.length +
                  ' frames of one screen recording attached to a software ticket' +
                  (about ? ' that says: "' + clip(about, 360) + '"' : '') +
                  ', in order:\n\n' +
                  notes.join('\n') +
                  '\n\nSay in at most 90 words what happens in the recording, step by step (what the screen shows before and after each change). Use only what the notes say. Then finish with one line that starts "WRONG:" and says each thing that goes wrong, as plainly as a rule it breaks (for example: WRONG: each press adds 2 where it should add 1; the number goes past the limit of 5 that the page states).',
                max: 300,
              }).catch(() => ''),
            ).trim();
          item.row.ok = true;
          item.row.says = clip(told || notes.join(' '), 900) + (item.partial ? ' (' + item.partial + ')' : '');
          item.row.wrong = wrongIn(told, about);
          item.row.notes = notes;
        } else if (!item.row.why) item.row.why = 'No frame of it could be read.';
      }
      item.row.seconds = Math.round((Date.now() - began) / 100) / 10;
    }
  }
  const all = Math.round((Date.now() - startedAt) / 100) / 10;
  if (claude) for (const x of todo) x.row.seconds = all;
  return out;
}
// what went into the team's task: one line a file, said to be the team's own reading (the reporter did not write it)
export const mediaNote = (list) => {
  const seen = (list || []).filter((m) => m && m.ok && m.says);
  const not = (list || []).filter((m) => m && !m.ok);
  return (
    (seen.length
      ? " What the ticket's attachments show, as the team read them: " +
        seen
          .map((m) => m.name + (m.kind === 'video' ? ' (a recording)' : ' (a picture)') + ': ' + clip(m.says, 520))
          .join(' | ')
      : '') +
    (seen.some((m) => m.wrong)
      ? ' What they show to be wrong, which is part of what must be put right: ' +
        seen
          .filter((m) => m.wrong)
          .map((m) => clip(m.wrong, 260))
          .join('; ') +
        '.'
      : '') +
    (not.length
      ? ' Not looked at: ' +
        not
          .map((m) => m.name)
          .slice(0, 4)
          .join(', ') +
        '.'
      : '')
  );
};
export const readBytes = (f) => readFile(f);
