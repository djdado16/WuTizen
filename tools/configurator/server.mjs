#!/usr/bin/env node
/**
 * tools/configurator/server.mjs — local-network configurator for WuTizen.
 *
 * Why this shape (Tizen research): a TizenBrew module runs in a TV webview with
 * no sockets, so the TV can never host an HTTP server. The PC hosts it instead;
 * the TV only makes outbound requests (the direction the TV allows). Everything
 * stays on the LAN: no cloud storage, no relay, no paid service.
 *
 * Pairing: a 6-digit code, valid for 8 minutes, single use. The payload is only
 * handed to the TV after the user explicitly presses “Approve & send” in the
 * browser, and only once. Nothing secret is ever logged.
 *
 * Usage:  node tools/configurator/server.mjs [port]
 *         node tools/configurator/server.mjs --lan     (listen on 0.0.0.0)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TTL_MS = 8 * 60 * 1000;
const MAX_PAYLOAD = 256 * 1024;
const sessions = new Map();

function newCode() {
  let code = String(randomInt(100000, 999999));
  while (sessions.has(code)) {
    code = String(randomInt(100000, 999999));
  }
  return code;
}

function prune() {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.created > TTL_MS) {
      sessions.delete(code);
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function startConfigurator(port, options) {
  const opts = options || {};
  const server = createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];

    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return;
    }

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      try {
        const html = await readFile(path.join(HERE, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      } catch (err) {
        res.writeHead(500);
        res.end('index.html missing');
      }
      return;
    }

    // Create a pairing session (browser UI).
    if (req.method === 'POST' && url === '/api/session') {
      prune();
      const code = newCode();
      sessions.set(code, { created: Date.now(), payload: null, delivered: false });
      console.log('[configurator] pairing session created (code shown in the browser)');
      json(res, 200, { code, ttlMs: TTL_MS });
      return;
    }

    const approve = /^\/api\/session\/(\d{6})\/approve$/.exec(url);
    if (req.method === 'POST' && approve) {
      const session = sessions.get(approve[1]);
      if (!session) {
        json(res, 404, { error: 'unknown or expired code' });
        return;
      }
      const body = await readBody(req, MAX_PAYLOAD);
      if (!body) {
        json(res, 413, { error: 'payload too large' });
        return;
      }
      try {
        session.payload = JSON.parse(body);
      } catch (err) {
        json(res, 400, { error: 'invalid JSON' });
        return;
      }
      console.log('[configurator] payload approved for transfer');
      json(res, 200, { approved: true });
      return;
    }

    // TV polls this. Returns the payload only after approval, and only once.
    const claim = /^\/api\/session\/(\d{6})\/claim$/.exec(url);
    if (req.method === 'GET' && claim) {
      const session = sessions.get(claim[1]);
      if (!session || Date.now() - session.created > TTL_MS) {
        json(res, 404, { state: 'expired' });
        return;
      }
      if (!session.payload) {
        json(res, 200, { state: 'waiting' });
        return;
      }
      if (session.delivered) {
        json(res, 409, { state: 'delivered' });
        return;
      }
      session.delivered = true;
      console.log('[configurator] payload delivered to the TV; session closed');
      sessions.delete(claim[1]);
      json(res, 200, { state: 'ready', payload: session.payload });
      return;
    }

    json(res, 404, { error: 'not found' });
  });

  const host = opts.lan ? '0.0.0.0' : '127.0.0.1';
  return new Promise((resolve) => {
    server.listen(port, host, () =>
      resolve({ server, url: 'http://' + lanAddress() + ':' + port, port })
    );
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = parseInt(process.argv[2], 10) || 8765;
  const lan = process.argv.indexOf('--lan') > -1;
  startConfigurator(port, { lan }).then(({ url }) => {
    console.log('[configurator] open ' + url + '/ on your PC or phone');
    console.log('[configurator] on the TV: Settings → Konfigurator s računala, enter this address');
    console.log('[configurator] stop this process when the transfer is done');
  });
}
