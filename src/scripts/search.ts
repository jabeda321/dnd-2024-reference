import type { SearchDoc } from '../pages/search-index.json';

export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'");

interface Prepared {
  doc: SearchDoc;
  title: string;
  words: string[];
  label: string;
  summary: string;
  text: string;
}

const cache = new WeakMap<SearchDoc[], Prepared[]>();

function prepare(docs: SearchDoc[]) {
  let prepared = cache.get(docs);
  if (!prepared) {
    prepared = docs.map((doc) => {
      const title = normalise(doc.title);
      return {
        doc,
        title,
        words: title.split(/[\s/-]+/),
        label: normalise(doc.label),
        summary: normalise(doc.summary),
        text: normalise(doc.text),
      };
    });
    cache.set(docs, prepared);
  }
  return prepared;
}

const KIND_BOOST: Record<SearchDoc['kind'], number> = { rule: 3, weapon: 2, mastery: 4, property: 1 };

/** Rank documents: title matches first, then labels, summaries and full text. Every token must match. */
export function search(docs: SearchDoc[], query: string, kind = '', limit = 60): SearchDoc[] {
  const q = normalise(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/);

  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const p of prepare(docs)) {
    if (kind && p.doc.kind !== kind) continue;
    let score = 0;
    if (p.title === q) score += 1000;
    else if (p.title.startsWith(q)) score += 400;
    else if (p.title.includes(q)) score += 200;

    let ok = true;
    for (const t of tokens) {
      let s = 0;
      if (p.words.some((w) => w.startsWith(t))) s = 60;
      else if (p.title.includes(t)) s = 35;
      else if (p.label.includes(t)) s = 20;
      else if (p.summary.includes(t)) s = 10;
      else if (p.text.includes(t)) s = 4;
      if (!s) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    scored.push({ doc: p.doc, score: score + KIND_BOOST[p.doc.kind] - p.title.length * 0.1 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.doc);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Escape `text` and wrap case-insensitive occurrences of query tokens in <mark>. */
export function highlight(text: string, query: string) {
  const tokens = normalise(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return escapeHtml(text);
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}

export { escapeHtml };
