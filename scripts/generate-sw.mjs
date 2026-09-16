// Writes dist/sw.js: a cache-first service worker that precaches every built file,
// so the whole reference works offline after the first visit.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = '/dnd-2024-reference/';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(DIST)).filter((f) => !f.endsWith('sw.js') && !f.endsWith('.map'));
const hash = createHash('sha256');
const urls = [];
for (const file of files.sort()) {
  hash.update(await readFile(file));
  const rel = relative(DIST, file).split(sep).join('/');
  urls.push(BASE + rel.replace(/(^|\/)index\.html$/, '$1'));
}
const version = hash.digest('hex').slice(0, 12);

const sw = `const CACHE = 'dnd-ref-${version}';
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dnd-ref-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => caches.match('${BASE}404.html')),
    ),
  );
});
`;
await writeFile(join(DIST, 'sw.js'), sw);
console.log(`sw.js: precached ${urls.length} files (cache ${version})`);
