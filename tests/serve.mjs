// Minimal static file server for dist/, mounted under the deploy base path.
// Used instead of `astro preview` because that command daemonizes and exits
// immediately in this Astro version, which is incompatible with Playwright's
// webServer (which needs a foreground, long-running process).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const BASE = '/dnd-2024-reference/';
const PORT = Number(process.env.PORT) || 4322;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

async function resolveFile(pathname) {
  // Strip the base path.
  let rel = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  rel = decodeURIComponent(rel);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  const full = normalize(join(DIST, rel));
  if (!full.startsWith(normalize(DIST))) return null; // path traversal guard

  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      const indexPath = join(full, 'index.html');
      await stat(indexPath);
      return indexPath;
    }
    return full;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = await resolveFile(url.pathname);
    let status = 200;

    if (!filePath) {
      status = 404;
      filePath = join(DIST, '404.html');
    }

    const body = await readFile(filePath);
    res.writeHead(status, { 'Content-Type': contentTypeFor(filePath), 'Content-Length': body.length });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal error: ${err?.message ?? err}`);
  }
});

server.listen(PORT, () => {
  console.log(`Static dist/ server listening on http://localhost:${PORT}${BASE}`);
});
