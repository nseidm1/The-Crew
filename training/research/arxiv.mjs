// arxiv.mjs - asks arXiv's own public API for papers on a list of questions and keeps title, date, id and abstract of each.
// It only reads: titles and abstracts, at most one request every three seconds, as arXiv asks. What a round makes of them is in
// training/research.md.
//   node training/research/arxiv.mjs <out.json> "<query>" "<query>" ...      a query is arXiv search syntax, e.g. all:"persona drift" AND all:LLM
import fs from 'fs';
const [out, ...queries] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (xml, tag) => (new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml) || [])[1] || '';
const found = [];
for (const q of queries) {
  const url =
    'https://export.arxiv.org/api/query?search_query=' +
    encodeURIComponent(q) +
    '&start=0&max_results=8&sortBy=relevance&sortOrder=descending';
  let xml = '';
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FamilyOffice-TheCrew-training/1 (https://github.com/nseidm1/The-Crew)' },
    });
    xml = await res.text();
  } catch (e) {
    console.log('FAILED ' + q + ': ' + String(e.message || e));
  }
  const entries = xml.split('<entry>').slice(1);
  console.log(entries.length + '  ' + q);
  for (const e of entries)
    found.push({
      query: q,
      id: pick(e, 'id')
        .replace(/^https?:\/\/arxiv\.org\/abs\//, '')
        .trim(),
      date: pick(e, 'published').slice(0, 10),
      title: pick(e, 'title').replace(/\s+/g, ' ').trim(),
      abstract: pick(e, 'summary').replace(/\s+/g, ' ').trim(),
    });
  await sleep(3200); // arXiv asks for no more than one request every three seconds
}
fs.writeFileSync(out, JSON.stringify(found, null, 1));
console.log(found.length + ' entries -> ' + out);
