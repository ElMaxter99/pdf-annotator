// Minimal static server with SPA fallback for the production build (dist/pdf-annotator/browser).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/pdf-annotator/browser');
const port = Number(process.env.PORT ?? 4300);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// Test/dev helper only (never shipped): loopback-only, read-only, files confined to `root`.
// snyk:ignore CWE-319 (plain HTTP on 127.0.0.1) and CWE-770 (no rate limiting on a local test server).
const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const requested = resolve(root, `.${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
  const rel = relative(root, requested);
  if (rel.startsWith('..') || isAbsolute(rel) || pathname.includes('\0')) {
    response.writeHead(403).end();
    return;
  }
  let file = requested;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const csr = join(root, 'index.csr.html');
    file = existsSync(csr) ? csr : join(root, 'index.html');
  }
  response.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  });
  stream.pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
