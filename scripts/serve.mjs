#!/usr/bin/env node
/**
 * serve.mjs — zero-dependency static server for dist/.
 *
 * Used for the Chrome preview and by scripts/browser-smoke.mjs. It serves only
 * files inside dist/ (path traversal is rejected) and sends no credentials.
 *
 * Usage: node scripts/serve.mjs [--port 8080]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST_DIR = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

export function startServer(port) {
  const server = createServer(async (req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      const target = path.resolve(DIST_DIR, relative);

      // Reject anything that escapes dist/.
      if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
      }

      const info = await stat(target);
      if (!info.isFile()) {
        throw new Error('not a file');
      }

      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': info.size,
        'Cache-Control': 'no-store'
      });
      createReadStream(target).pipe(res);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  });
}

function cliPort() {
  const index = process.argv.indexOf('--port');
  if (index > -1) {
    const value = parseInt(process.argv[index + 1], 10);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return 8080;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const port = cliPort();
  const started = await startServer(port);
  console.log('[serve] http://localhost:' + started.port + '/  (serving dist/)');
  console.log('[serve] open Chrome at 1920x1080 for a 1:1 preview');
}
