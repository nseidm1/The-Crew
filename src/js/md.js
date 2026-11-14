// md.js - A LITTLE MARKDOWN, BOTH WAYS. Jira's connector gives a ticket's description and comments as Markdown, and takes a new
// comment as Markdown. So this file does two things:
//   md(text)          shows Markdown as it is meant to look: paragraphs, lists, quotes, code, bold, italic and links. Every piece is
//                     set as TEXT in an element this file makes; nothing that was read is ever treated as HTML. A link is only ever
//                     an https address, opened in a new tab.
//   mdEditor(opts)    a box to write a comment in: buttons and the usual keys for bold, italic, code, a code block, lists, a quote and
//                     a link; a look at how it will read (Preview); and CODE DETECTION: something pasted that is plainly code, a
//                     command or a stack trace goes in as a code block, with its language named where it is clear.
// FILES: a paperclip, a paste or a drop puts files in the box. A picture is shown, a video shows its first frame, anything else shows
// its kind; a press on one opens it to be looked at, and its x takes it out. The list belongs to whoever made the box (opts.files),
// so it outlives a redraw. What becomes of the files when the comment is sent is the caller's to say (opts.filesSaid).
import { h } from './ui.js';

const SAFE = /^https:\/\/[^\s<>"']+$/i;
const link = (href, words) =>
  SAFE.test(href) ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, words) : words;
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![\w/])_[^_\s][^_\n]*_(?![\w/]))|(\[[^\]\n]+\]\(https:\/\/[^\s)]+\))|(https:\/\/[^\s<>"')\]]+)/g;
function inline(s) {
  const out = [];
  let at = 0;
  for (const m of String(s).matchAll(INLINE)) {
    const t = m[0];
    if (m.index > at) out.push(s.slice(at, m.index));
    if (m[1]) out.push(h('code', null, t.slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, inline(t.slice(2, -2))));
    else if (m[3] || m[4]) out.push(h('em', null, inline(t.slice(1, -1))));
    else if (m[5]) {
      const k = /^\[([^\]]+)\]\((.+)\)$/.exec(t);
      out.push(link(k[2], k[1]));
    } else {
      const url = t.replace(/[.,;:!?]+$/, '');
      out.push(link(url, url));
      if (url.length < t.length) out.push(t.slice(url.length));
    }
    at = m.index + t.length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}
const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;
const QUOTE = /^\s*>\s?/;
const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
export function md(text) {
  const root = h('div', { class: 'md' });
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  let pos = 0;
  let para = [];
  const lined = (el, rows) => {
    rows.forEach((l, k) => {
      if (k) el.append(h('br'));
      el.append(...inline(l));
    });
    return el;
  };
  const flush = () => {
    if (para.length) {
      root.append(lined(h('p'), para));
      para = [];
    }
  };
  while (pos < lines.length) {
    const l = lines[pos];
    const fence = FENCE.exec(l);
    const head = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (fence) {
      flush();
      const body = [];
      pos++;
      while (pos < lines.length && !/^\s*```\s*$/.test(lines[pos])) body.push(lines[pos++]);
      pos++;
      root.append(h('pre', { class: 'md-code', 'data-lang': fence[1] || null }, h('code', null, body.join('\n'))));
    } else if (ITEM.test(l)) {
      flush();
      const list = h(/^\s*\d/.test(l) ? 'ol' : 'ul');
      while (pos < lines.length && ITEM.test(lines[pos]))
        list.append(h('li', null, inline(lines[pos++].replace(ITEM, ''))));
      root.append(list);
    } else if (QUOTE.test(l)) {
      flush();
      const rows = [];
      while (pos < lines.length && QUOTE.test(lines[pos])) rows.push(lines[pos++].replace(QUOTE, ''));
      root.append(lined(h('blockquote'), rows));
    } else if (head) {
      flush();
      root.append(h('p', { class: 'md-h' }, h('strong', null, inline(head[1]))));
      pos++;
    } else if (!l.trim()) {
      flush();
      pos++;
    } else {
      para.push(l);
      pos++;
    }
  }
  flush();
  return root;
}

// ---------- code detection ----------
// Is this pasted text code? Several lines of which most look like code (a brace, a semicolon, an arrow, a tag, an indent, a keyword at
// the start), or a stack trace, or one line that is a command. Ordinary sentences are not: they end in full stops and start with words.
const CODEY =
  /[{};]\s*$|^\s*[})\]]|=>|^\s*<\/?[\w!?-]+[\s>/]|^\s*(?:const|let|var|function|class|import|export|return|if|for|while|else|try|catch|def|fun|val|public|private|protected|package|override|@\w+|#include|SELECT|INSERT|UPDATE|CREATE)\b|^\s*"[^"]+"\s*:|^\s*at\s+[\w.$<>]+\(|^\s*[\w.$]+(?:Exception|Error)\b|^\s*(?:E|W|I|D)\/[\w.]+|^\s{2,}\S|^\t/;
const COMMAND =
  /^\s*(?:\$\s+\S|(?:\.\/gradlew|gradle|adb|git|npm|npx|node|curl|brew|pip|python3?|docker|kubectl|cd|ls|cat|grep|sed|chmod|mkdir|rm|ssh|make)\s+\S)/;
export function looksLikeCode(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim());
  if (!lines.length) return false;
  if (lines.length === 1) return COMMAND.test(lines[0]) && !/[.!?]$/.test(lines[0].trim());
  const hits = lines.filter((l) => CODEY.test(l) || COMMAND.test(l)).length;
  return hits >= 2 && hits / lines.length >= 0.5;
}
// the language to name on the fence, only where it is clear; otherwise none, and the block is still a code block
export function langOf(text) {
  const s = String(text || '').trim();
  if (/^[\[{]/.test(s)) {
    try {
      JSON.parse(s);
      return 'json';
    } catch {
      /* not JSON */
    }
  }
  if (/^\s*at\s+[\w.$<>]+\(/m.test(s) || /^\s*(?:E|W|I|D)\/[\w.]+/m.test(s)) return ''; // a stack trace or a log: no language
  if (/^<\?xml|^<[\w-]+[\s>]/.test(s)) return 'xml';
  if (COMMAND.test(s.split('\n')[0])) return 'sh';
  if (/^\s*(?:SELECT|INSERT|UPDATE|CREATE)\b/im.test(s)) return 'sql';
  if (/\bfun\s+\w+\s*\(|\bval\s+\w+|\boverride\s+fun\b/.test(s)) return 'kotlin';
  if (/^\s*(?:public|private|protected)\s+[\w<>\[\]]+\s+\w+\s*[({;=]/m.test(s)) return 'java';
  if (/^\s*def\s+\w+\(.*\):|^\s*from\s+\w+\s+import\b/m.test(s)) return 'python';
  if (/\b(?:const|let)\s+\w+\s*=|=>|\bfunction\s*\w*\s*\(/.test(s)) return 'js';
  return '';
}

// ---------- the box a comment is written in ----------
// opts: { id, value, label, placeholder, busy, send: 'Comment', hint, onInput(text), onSubmit(text),
//         files: [] (the caller's own list; given, the box takes files), filesSaid: what to say about the files (text or nodes) }
const TOOLS = [
  ['bold', 'B', 'Bold', 'b'],
  ['italic', 'I', 'Italic', 'i'],
  ['code', '<>', 'Code', 'e'],
  ['block', '{ }', 'Code block', ''],
  ['bullets', '• List', 'Bulleted list', ''],
  ['numbers', '1. List', 'Numbered list', ''],
  ['quote', '“ Quote', 'Quote', ''],
  ['link', 'Link', 'Link', 'k'],
];
const sizeOf = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const clipIcon = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  const p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  p.setAttribute(
    'd',
    'M20.5 11.5l-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5l8.4-8.4a3.6 3.6 0 0 1 5.1 5.1l-8.300 8.300a1.800 1.800 0 0 1-2.600-2.600l7.600-7.600',
  );
  s.append(p);
  return s;
};
// one file, looked at: over the page, closed by a press outside it, its x, or Escape
function lookAt(file) {
  const shut = () => {
    document.removeEventListener('keydown', key, true);
    ov.remove();
  };
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      shut();
    }
  };
  const x = h('button', { class: 'mde-light-x', type: 'button', 'aria-label': 'Close', onclick: () => shut() }, '×');
  const ov = h(
    'div',
    {
      class: 'mde-light',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': file.name,
      onclick: (e) => {
        if (e.target === ov) shut();
      },
    },
    x,
    file.kind === 'image'
      ? h('img', { src: file.url, alt: file.name })
      : file.kind === 'video'
        ? h('video', { src: file.url, controls: true, autoplay: true, playsinline: true })
        : h('p', null, 'There is nothing to show for this kind of file.'),
    h('span', { class: 'mde-light-name' }, file.name + ' · ' + sizeOf(file.size)),
  );
  document.addEventListener('keydown', key, true);
  document.body.append(ov);
  x.focus();
}
export function mdEditor(opts) {
  const list = Array.isArray(opts.files) ? opts.files : null; // the caller's list: with one, the box takes files
  const textarea = h('textarea', {
    id: opts.id,
    rows: '3',
    'aria-label': opts.label,
    placeholder: opts.placeholder || '',
    maxlength: '8000',
    value: opts.value || '',
    disabled: !!opts.busy,
  });
  const said = h('p', { class: 'mde-said', role: 'status', hidden: true });
  const view = h('div', { class: 'mde-view', hidden: true });
  const tray = h('div', { class: 'mde-files', id: opts.id + '-files', hidden: true });
  const say = (kids) => {
    said.replaceChildren(...[].concat(kids));
    said.hidden = false;
  };
  const grow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(320, Math.max(84, textarea.scrollHeight + 2)) + 'px';
  };
  const changed = () => {
    if (opts.onInput) opts.onInput(textarea.value);
    goBtn.disabled = !!opts.busy || !textarea.value.trim();
    grow();
  };
  // put text where the selection is, and leave the caret (or a selection) where the next keystroke belongs
  const put = (before, text, after, selFrom, selTo) => {
    const a = textarea.selectionStart;
    const b = textarea.selectionEnd;
    const v = textarea.value;
    textarea.value = v.slice(0, a) + before + text + after + v.slice(b);
    const at = a + before.length;
    textarea.focus();
    textarea.setSelectionRange(at + (selFrom == null ? 0 : selFrom), at + (selTo == null ? text.length : selTo));
    changed();
  };
  const picked = () => textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  const wrap = (mark, empty) => {
    const s = picked();
    put(mark, s || empty, mark);
  };
  const eachLine = (prefix) => {
    const a = textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
    textarea.setSelectionRange(a, textarea.selectionEnd);
    const rows = (picked() || '').split('\n');
    put('', rows.map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l).join('\n'), '');
    textarea.setSelectionRange(textarea.selectionEnd, textarea.selectionEnd);
  };
  const fenced = (text, lang) => {
    const v = textarea.value;
    const a = textarea.selectionStart;
    const lead = a && v[a - 1] !== '\n' ? '\n' : '';
    const tail = v[textarea.selectionEnd] === '\n' || textarea.selectionEnd === v.length ? '' : '\n';
    put(lead + '\x60\x60\x60' + (lang || '') + '\n', text, '\n\x60\x60\x60\n' + tail, text.length, text.length);
  };
  const inFence = () =>
    (textarea.value.slice(0, textarea.selectionStart).match(/^\s*\x60\x60\x60/gm) || []).length % 2 === 1;
  const ACTIONS = {
    bold: () => wrap('**', 'bold text'),
    italic: () => wrap('*', 'italic text'),
    code: () => wrap('\x60', 'code'),
    block: () => {
      const s = picked();
      fenced(s || 'code', s ? langOf(s) : '');
      if (!s) textarea.setSelectionRange(textarea.selectionStart - 4, textarea.selectionStart);
    },
    bullets: () => eachLine('- '),
    numbers: () => eachLine((i) => i + 1 + '. '),
    quote: () => eachLine('> '),
    link: () => {
      const s = picked();
      put('[', s || 'link text', '](https://)', s ? s.length + 10 : 0, s ? s.length + 10 : 9);
    },
  };
  // THE FILES. Each gets an address the page can show it by (made here, given back when it is taken out).
  const paintFiles = () => {
    if (!list) return;
    tray.hidden = !list.length;
    tray.replaceChildren(
      ...list.map((f) =>
        h(
          'div',
          { class: 'mde-file', 'data-kind': f.kind },
          h(
            'button',
            { class: 'mde-thumb', type: 'button', 'aria-label': 'Look at ' + f.name, onclick: () => lookAt(f) },
            f.kind === 'image'
              ? h('img', { src: f.url, alt: '' })
              : f.kind === 'video'
                ? [
                    h('video', { src: f.url, muted: true, preload: 'metadata', playsinline: true }),
                    h('span', { class: 'play', 'aria-hidden': 'true' }, '▶'),
                  ]
                : h('span', { class: 'ext' }, (/\.([a-z0-9]{1,5})$/i.exec(f.name) || [])[1] || 'file'),
          ),
          h('span', { class: 'mde-fname', title: f.name }, f.name),
          h('span', { class: 'mde-fsize' }, sizeOf(f.size)),
          h(
            'button',
            {
              class: 'mde-x',
              type: 'button',
              'aria-label': 'Remove ' + f.name,
              onclick: () => {
                const i = list.indexOf(f);
                if (i >= 0) {
                  list.splice(i, 1);
                  URL.revokeObjectURL(f.url);
                }
                paintFiles();
              },
            },
            '×',
          ),
        ),
      ),
    );
  };
  const addFiles = (fs) => {
    let over = 0;
    for (const file of fs) {
      if (list.length >= 10 || file.size > 100 * 1048576) {
        over++;
        continue;
      }
      list.push({
        id: Math.random().toString(36).slice(2),
        file,
        url: URL.createObjectURL(file),
        name: file.name || 'file',
        type: file.type || '',
        size: file.size,
        kind: /^image\//.test(file.type) ? 'image' : /^video\//.test(file.type) ? 'video' : 'file',
      });
    }
    paintFiles();
    if (over)
      say(over + (over === 1 ? ' file was' : ' files were') + ' left out: at most ten files, each under 100 MB.');
    else said.hidden = true;
  };
  const pick = h('input', {
    type: 'file',
    id: opts.id + '-pick',
    multiple: true,
    hidden: true,
    accept: 'image/*,video/*,.pdf,.txt,.log,.json,.csv,.zip',
    onchange: (e) => {
      addFiles([...e.target.files]);
      e.target.value = '';
    },
  });
  const clip = list
    ? h(
        'button',
        {
          type: 'button',
          class: 'mde-b mde-clip',
          title: 'Attach a picture, a video or a file',
          'aria-label': 'Attach a file',
          onclick: () => pick.click(),
        },
        clipIcon(),
      )
    : null;
  const tools = h(
    'div',
    { class: 'mde-tools', role: 'toolbar', 'aria-label': 'Formatting' },
    TOOLS.map(([k, face, name, key]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'mde-b mde-' + k,
          title: name + (key ? ' (⌘' + key.toUpperCase() + ')' : ''),
          'aria-label': name,
          onclick: () => {
            if (!view.hidden) show(false);
            ACTIONS[k]();
          },
        },
        face,
      ),
    ),
    clip,
  );
  const tabs = h(
    'div',
    { class: 'jseg mde-tabs', role: 'group', 'aria-label': 'Write or preview' },
    [
      ['Write', false],
      ['Preview', true],
    ].map(([name, on]) =>
      h('button', { type: 'button', 'aria-pressed': String(on === false), onclick: () => show(on) }, name),
    ),
  );
  function show(preview) {
    [...tabs.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 1) === preview)));
    view.hidden = !preview;
    textarea.hidden = preview;
    if (preview)
      view.replaceChildren(
        textarea.value.trim() ? md(textarea.value) : h('p', { class: 'muted' }, 'Nothing to preview yet.'),
      );
    else textarea.focus();
  }
  const goBtn = h(
    'button',
    {
      class: 'btn primary small',
      type: 'submit',
      id: opts.id + '-go',
      disabled: !!opts.busy || !String(opts.value || '').trim(),
    },
    opts.busy ? h('i', { class: 'jspin' }) : null,
    opts.busy ? ' Adding…' : opts.send || 'Send',
  );
  const dropped = (fs) => (list ? addFiles(fs) : say('A file cannot be sent from here.'));
  textarea.addEventListener('input', changed);
  textarea.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!goBtn.disabled) form.requestSubmit();
      return;
    }
    const t = TOOLS.find((x) => x[3] && x[3] === e.key.toLowerCase());
    if (t) {
      e.preventDefault();
      ACTIONS[t[0]]();
    }
  });
  textarea.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.files && cd.files.length) {
      e.preventDefault();
      return dropped([...cd.files]);
    }
    const s = cd.getData('text/plain');
    if (!s || inFence() || !looksLikeCode(s)) return;
    e.preventDefault();
    const lang = langOf(s);
    fenced(s.replace(/\s+$/, ''), lang);
    say([
      'Pasted as a code block' + (lang ? ' (' + lang + ')' : '') + '. ',
      h(
        'button',
        {
          type: 'button',
          class: 'mde-undo',
          onclick: () => {
            textarea.value = textarea.value.replace(
              '\x60\x60\x60' + lang + '\n' + s.replace(/\s+$/, '') + '\n\x60\x60\x60\n',
              s,
            );
            said.hidden = true;
            changed();
            textarea.focus();
          },
        },
        'Keep it as plain text',
      ),
    ]);
  });
  const form = h(
    'form',
    {
      class: 'mde' + (opts.busy ? ' busy' : ''),
      onsubmit: (e) => {
        e.preventDefault();
        const text = textarea.value.trim();
        if (text && !opts.busy && opts.onSubmit) opts.onSubmit(text);
      },
      ondragover: (e) => {
        if ([...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files')) {
          e.preventDefault();
          form.classList.add('over');
        }
      },
      ondragleave: () => form.classList.remove('over'),
      ondrop: (e) => {
        form.classList.remove('over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          e.preventDefault();
          dropped([...e.dataTransfer.files]);
        }
      },
    },
    h('div', { class: 'mde-top' }, tools, tabs),
    textarea,
    view,
    tray,
    pick,
    said,
    h('div', { class: 'mde-foot' }, h('span', { class: 'mde-hint' }, opts.hint || 'Markdown. ⌘ Enter sends.'), goBtn),
  );
  paintFiles();
  if (opts.filesSaid) say(opts.filesSaid);
  queueMicrotask(grow);
  return form;
}
