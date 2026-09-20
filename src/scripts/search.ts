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
  /** Title words reduced to their stems, so "grapple" can reach "Grappling". */
  wordStems: string[];
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
      const words = title.split(/[\s/-]+/);
      return {
        doc,
        title,
        words,
        wordStems: words.map((w) => stem(w)).filter((w): w is string => !!w),
        label: normalise(doc.label),
        summary: normalise(doc.summary),
        text: normalise(doc.text),
      };
    });
    cache.set(docs, prepared);
  }
  return prepared;
}

const KIND_BOOST: Record<SearchDoc['kind'], number> = { rule: 3, weapon: 2, mastery: 4, property: 1, equipment: 2 };

/**
 * Crude suffix stripping, so "escaping a grapple" finds the Grappling rule (which
 * says "escape DC") and "mounted" finds "mount". Only applied when the typed word
 * matches nothing, and the length guard keeps it off short words where dropping a
 * suffix would match almost anything.
 */
function stem(token: string): string | null {
  // "abilities" -> "ability", so the plural a user types reaches the singular title.
  if (token.endsWith('ies') && token.length >= 5) return `${token.slice(0, -3)}y`;
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }
  return null;
}

/** Where a token matched, strongest field first; 0 when it appears nowhere. */
function fieldScore(p: Prepared, t: string): number {
  if (p.words.some((w) => w.startsWith(t))) return 60;
  // "grapple" against the title "Grappling": the title word stems to "grappl",
  // which the typed word extends. Still a title hit, just a less certain one.
  if (p.wordStems.some((w) => t.startsWith(w))) return 50;
  if (p.title.includes(t)) return 35;
  if (p.label.includes(t)) return 20;
  if (p.summary.includes(t)) return 10;
  if (p.text.includes(t)) return 4;
  return 0;
}

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
      let s = fieldScore(p, t);
      if (!s) {
        // A stemmed hit is weaker evidence than the word the user actually typed,
        // so it scores half — exact matches still sort above it.
        const stemmed = stem(t);
        if (stemmed) s = fieldScore(p, stemmed) * 0.5;
      }
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
