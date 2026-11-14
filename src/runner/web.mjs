// web.mjs - the two things a seat needs to find something out: search the web, and read a page. Both run on the customer's own
// machine, with no key and no account, and only when the team is asked something that needs them; the chat shows each one.
//   search(q)            -> { ok, results: [{ title, url, snippet }], from }     DuckDuckGo's plain HTML page; Wikipedia's search if that gives nothing
//   read(url, { own })   -> { ok, url, status, title, text }                    the page as text: scripts, styles and markup removed, cut to size
// WHAT A SEAT MAY REACH. A model chooses what to read, so an address is checked before anything is fetched: http or https only, no
// sign-in in the address, and never this machine or the home network (loopback, private and link-local addresses, by name or after the
// name is looked up) unless the customer themself named that address (own: true): asking the team to look at http://localhost:3000 is
// the customer's own request; a page telling the team to fetch the router is not. The runner's own port is never fetched.
import dns from 'node:dns/promises';
import net from 'node:net';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const INNER =
  /^(?:10\.|127\.|0\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
const inner = (ip) =>
  net.isIPv6(ip)
    ? /^(?:::1|::|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|::ffff:(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.))/i.test(
        ip,
      )
    : INNER.test(ip);
const offline = () => process.env.FO_NO_NET === '1' && !process.env.FO_WEB_SEARCH;

// may this address be fetched? resolves the address to use, or throws the reason in plain words
export async function allowed(url, { own = false, selfPorts = [] } = {}) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    throw new Error('that is not a web address');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http and https addresses are read');
  if (u.username || u.password) throw new Error('an address with a sign-in in it is not read');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host.endsWith('.localhost');
  if (selfPorts.includes(Number(u.port)) && (local || inner(host))) throw new Error('that is this app itself');
  if (process.env.FO_WEB_ANY === '1') return u.href; // tests: a stand-in on this machine plays the web
  let ips = net.isIP(host) ? [host] : local ? ['127.0.0.1'] : [];
  if (!ips.length) {
    try {
      ips = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new Error('that name could not be found');
    }
  }
  if (ips.some(inner) && !own)
    throw new Error(
      'that address is on this machine or the home network, and the team only reads those when you name them yourself',
    );
  return u.href;
}
const ENT = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
  '#34': '"',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};
const plain = (html) =>
  String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) =>
      ENT[e.toLowerCase()] != null
        ? ENT[e.toLowerCase()]
        : /^#x/i.test(e)
          ? String.fromCodePoint(parseInt(e.slice(2), 16) || 32)
          : /^#/.test(e)
            ? String.fromCodePoint(Number(e.slice(1)) || 32)
            : ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
async function get(
  url,
  { ms = 12000, max = 1500000, accept = 'text/html,application/xhtml+xml,text/plain,application/json' } = {},
) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-US,en;q=0.8' },
    });
    const type = String(res.headers.get('content-type') || '');
    const parts = [];
    let n = 0;
    if (res.body)
      for await (const c of res.body) {
        n += c.length;
        parts.push(c);
        if (n > max) {
          ctl.abort();
          break;
        }
      }
    return { status: res.status, type, url: res.url || url, body: Buffer.concat(parts).toString('utf8') };
  } finally {
    clearTimeout(t);
  }
}

export async function search(query, limit = 5) {
  query = String(query || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (!query) return { ok: false, why: 'nothing to search for', results: [] };
  if (offline()) return { ok: false, why: 'this machine is not using the network', results: [] };
  const out = [];
  const seen = new Set();
  const add = (title, url, snippet) => {
    if (!/^https?:\/\//.test(url) || seen.has(url) || out.length >= limit) return;
    seen.add(url);
    out.push({ title: plain(title).slice(0, 140), url, snippet: plain(snippet).slice(0, 300) });
  };
  let from = '';
  let why = '';
  try {
    // DuckDuckGo's page for browsers without scripts: one result block per answer; its links pass through a redirect that names the real address
    const r = await get(
      (process.env.FO_WEB_SEARCH || 'https://html.duckduckgo.com/html/') + '?q=' + encodeURIComponent(query),
    );
    if (r.status === 200)
      for (const block of r.body.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/).slice(1)) {
        const a = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
        if (!a) continue;
        let url = a[1].replace(/&amp;/g, '&');
        const via = /[?&]uddg=([^&]+)/.exec(url);
        if (via) {
          try {
            url = decodeURIComponent(via[1]);
          } catch {
            continue;
          }
        }
        if (url.startsWith('//')) url = 'https:' + url;
        if (/duckduckgo\.com\/y\.js|\/\/duckduckgo\.com\/l\/\?.*ad_/.test(url)) continue; // an advert, not an answer
        add(a[2], url, (/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block) || [])[1] || '');
      }
    else why = 'the search page answered ' + r.status;
    if (out.length) from = 'DuckDuckGo';
  } catch (e) {
    why = 'the search page could not be reached';
  }
  if (!out.length && !process.env.FO_WEB_SEARCH)
    try {
      // a second source, so a search still finds something when the first refuses
      const r = await get(
        'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' +
          limit +
          '&srsearch=' +
          encodeURIComponent(query),
        { accept: 'application/json' },
      );
      for (const x of (JSON.parse(r.body).query || {}).search || [])
        add(
          x.title,
          'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(x.title).replace(/ /g, '_')),
          x.snippet,
        );
      if (out.length) from = 'Wikipedia';
    } catch {
      /* nothing from there either */
    }
  return out.length
    ? { ok: true, q: query, results: out, from }
    : { ok: false, q: query, why: why || 'the search gave no results', results: [] };
}

export async function read(url, { own = false, selfPorts = [], max = 6000 } = {}) {
  if (offline() && !own) return { ok: false, url, why: 'this machine is not using the network' };
  let href;
  try {
    href = await allowed(url, { own, selfPorts });
  } catch (e) {
    return { ok: false, url, why: e.message };
  }
  // "localhost" is this machine under either of its two addresses, and a dev server listens on whichever its tool chose: each is tried
  const ways = (() => {
    const u = new URL(href);
    if (u.hostname !== 'localhost') return [href];
    const a = new URL(href);
    const b = new URL(href);
    a.hostname = '127.0.0.1';
    b.hostname = '[::1]';
    return [href, a.href, b.href];
  })();
  let response = null;
  for (const way of ways) {
    try {
      response = await get(way);
      href = way;
      break;
    } catch {
      /* the next way of saying this machine */
    }
  }
  if (!response) return { ok: false, url: href, why: 'the page did not answer' };
  try {
    if (response.url !== href) await allowed(response.url, { own, selfPorts });
  } catch (e) {
    return { ok: false, url: href, why: 'it sent the team on to an address that is not read: ' + e.message };
  } // a page may not redirect the team inwards
  if (!/html|text|json|xml/i.test(response.type))
    return {
      ok: response.status < 400,
      url: response.url,
      status: response.status,
      title: '',
      text: '',
      note: 'It is not a page of text (' + (response.type.split(';')[0] || 'no type given') + ').',
    };
  const title = plain((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(response.body) || [])[1] || '').slice(0, 160);
  const text =
    /html/i.test(response.type) || /<html/i.test(response.body.slice(0, 500))
      ? plain(
          response.body
            .replace(/<(script|style|noscript|svg|template|head|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' '),
        )
      : response.body.replace(/\s+/g, ' ').trim();
  return {
    ok: response.status < 400,
    url: response.url,
    status: response.status,
    title,
    text: text.slice(0, max),
    cut: text.length > max,
    chars: text.length,
  };
}
