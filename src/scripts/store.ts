// Small localStorage-backed stores. Storage can be unavailable (private mode,
// blocked site data), so every access is guarded and falls back to in-memory.

import type { SearchDoc } from '../pages/search-index.json';

const memory = new Map<string, string>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? memory.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* storage unavailable */
  }
}

const FAVS = 'dnd-ref:favourites';
const RECENT = 'dnd-ref:recent';

export const getFavourites = () => read<string[]>(FAVS, []);

export function toggleFavourite(id: string) {
  const favs = getFavourites();
  const next = favs.includes(id) ? favs.filter((f) => f !== id) : [id, ...favs];
  write(FAVS, next);
  document.dispatchEvent(new CustomEvent('favourites-change', { detail: next }));
  return next.includes(id);
}

export const getRecent = () => read<string[]>(RECENT, []);

export function pushRecent(id: string) {
  write(RECENT, [id, ...getRecent().filter((r) => r !== id)].slice(0, 8));
}

export function getTheme(): 'light' | 'dark' | null {
  try {
    const t = localStorage.getItem('dnd-ref:theme');
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function setTheme(theme: 'light' | 'dark') {
  try {
    localStorage.setItem('dnd-ref:theme', theme);
  } catch {
    /* storage unavailable */
  }
}

let indexPromise: Promise<SearchDoc[]> | undefined;

export function loadIndex(): Promise<SearchDoc[]> {
  indexPromise ??= fetch(`${document.body.dataset.base}search-index.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Search index ${r.status}`))))
    .catch((err) => {
      indexPromise = undefined;
      throw err;
    });
  return indexPromise;
}
