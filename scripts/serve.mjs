// A small static file server for local play and the browser tests.
// Usage: node scripts/serve.mjs [port]
// (Python's http.server sometimes left a request unanswered when several browsers
// loaded the app at once, which made the browser tests flaky.)
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4317);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function resolveFile(urlPath) {
  let path;
  try {
    path = normalize(join(ROOT, decodeURIComponent(urlPath)));
  } catch {
    return null;
  }
  if (!path.startsWith(ROOT) || path.split(sep).includes('node_modules')) return null;
  try {
    const info = await stat(path);
    if (info.isDirectory()) return resolveFile(join(urlPath, 'index.html'));
    return { path, size: info.size };
  } catch {
    return null;
  }
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const file = request.method === 'GET' || request.method === 'HEAD' ? await resolveFile(pathname) : null;
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': TYPES[extname(file.path)] ?? 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file.path).pipe(response);
}).listen(PORT, () => console.log(`Serving on http://localhost:${PORT}`));
