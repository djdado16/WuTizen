#!/usr/bin/env node
/** scripts/mock-cloud.mjs - runs the REAL Pages Functions logic locally (in-memory KV). */

import { createServer } from 'node:http';
import { handle } from '../cloudflare/public/_lib/session.js';

function memoryKV(map) {
  return {
    get: async (key) => (map.has(key) ? map.get(key) : null),
    put: async (key, value) => {
      map.set(key, String(value));
    },
    delete: async (key) => {
      map.delete(key);
    }
  };
}

function route(url, method) {
  const m = /^\/api\/session(?:\/(\d{6}))?(?:\/(device|commit|confirm|payload))?$/.exec(url.split('?')[0]);
  if (!m) {
    return null;
  }
  const code = m[1] || '';
  const sub = m[2] || '';
  if (!code) {
    return method === 'POST' ? { action: 'create', code } : null;
  }
  if (!sub) {
    return { action: 'poll', code };
  }
  if (sub === 'confirm') {
    return { action: 'confirm-put', code };
  }
  return { action: sub + '-' + (method === 'GET' ? 'get' : 'put'), code };
}

export function startMockCloud(port) {
  const map = new Map();
  const env = { PAIRING: memoryKV(map) };
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    await new Promise((resolve) => req.on('end', resolve));
    const hit = route(url, req.method);
    if (!hit) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"no route"}');
      return;
    }
    const request = new Request('http://local' + url, {
      method: req.method,
      headers: req.headers,
      body: body || undefined
    });
    const response = await handle({ request, env, params: { code: hit.code } }, hit.action);
    const text = await response.text();
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(text);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + port, store: map }));
  });
}

if (process.argv[1] && process.argv[1].endsWith('mock-cloud.mjs')) {
  startMockCloud(parseInt(process.argv[2], 10) || 8790).then(({ url }) => console.log('[mock-cloud] ' + url));
}
