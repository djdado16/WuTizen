#!/usr/bin/env node
/**
 * mock-addon.mjs — hermetic Stremio add-on used by the smoke test.
 *
 * Implements the documented subset (manifest, catalog with skip paging, meta,
 * stream) plus one deliberately broken manifest for the error path. Serves CORS
 * headers as the protocol requires. No network access, no credentials.
 */

import { createServer } from 'node:http';

function poster(label) {
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180">' +
    '<rect width="120" height="180" fill="#101116"/>' +
    '<text x="60" y="96" fill="#ff3d7f" font-family="sans-serif" font-size="18" ' +
    'text-anchor="middle">' +
    label +
    '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function movie(n) {
  return {
    id: 'mock-' + n,
    type: 'movie',
    name: 'Mock Film ' + n,
    poster: poster('F' + n),
    releaseInfo: String(2000 + n)
  };
}

const TOP = [];
for (let n = 1; n <= 14; n++) {
  TOP.push(movie(n));
}
const SHOWS = [
  { id: 'show-1', type: 'series', name: 'Mock Show 1', poster: poster('S1'), releaseInfo: '2019' },
  { id: 'show-2', type: 'series', name: 'Mock Show 2', poster: poster('S2'), releaseInfo: '2021' }
];

function metaFor(id) {
  return {
    id: id,
    type: id.indexOf('show') === 0 ? 'series' : 'movie',
    name: id === 'mock-1' ? 'Mock Film 1 (Full)' : 'Mock ' + id,
    poster: poster('M'),
    background: poster('B'),
    description: 'Placeholder synopsis served by the mock add-on.',
    releaseInfo: '2001',
    runtime: '112 min',
    imdbRating: '7.5',
    genres: ['Drama', 'Sci-Fi'],
    cast: ['Test Actor', 'Second Actor']
  };
}

const MANIFEST = {
  id: 'org.wutizen.test',
  version: '1.0.0',
  name: 'WuTizen Test Add-on',
  description: 'Hermetic add-on for automated tests',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'top', name: 'Test Top' },
    { type: 'series', id: 'shows', name: 'Test Shows' }
  ]
};

export function startMockAddon(port) {
  const profileExport = {
    profiles: [{ name: 'Imported over LAN' }],
    // A configured add-on: models what a real WuPlay export contains.
    addons: [{ transportUrl: 'http://127.0.0.1:' + port + '/cfg-ime-token/manifest.json' }],
    watchlist: [{ id: 'tt9' }]
  };

  const server = createServer((req, res) => {
    let url = (req.url || '/').split('?')[0];
    // Configured add-ons carry their configuration in the path: strip a
    // "/cfg-<token>" prefix so the same fixtures serve them.
    const stripped = url.replace(/^\/cfg-[^/]+/, '');
    url = stripped || '/';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const send = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (url === '/bad/manifest.json') {
      res.statusCode = 200;
      res.end('{ this is not json ');
      return;
    }

    if (url === '/manifest.json') {
      send(200, MANIFEST);
      return;
    }

    // WuPlay-shaped profile export, served for the "import from a LAN address"
    // flow (the Settings URL field points here instead of at a manifest).
    if (url === '/profile.json') {
      send(200, profileExport);
      return;
    }

    // Failing add-on: manifest is valid, every catalog request returns HTTP 500.
    if (url === '/fail/manifest.json') {
      send(200, {
        id: 'org.wutizen.fail',
        version: '1.0.0',
        name: 'WuTizen Failing Add-on',
        description: 'Always fails (error-path fixture)',
        resources: ['catalog'],
        types: ['movie'],
        catalogs: [{ type: 'movie', id: 'broken', name: 'Test Broken' }]
      });
      return;
    }

    if (url === '/catalog/movie/broken.json') {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }

    let match = /^\/catalog\/movie\/top(?:\/skip=(\d+))?\.json$/.exec(url);
    if (match) {
      const skip = match[1] ? parseInt(match[1], 10) : 0;
      send(200, { metas: TOP.slice(skip, skip + 10) });
      return;
    }

    if (url === '/catalog/series/shows.json') {
      send(200, { metas: SHOWS });
      return;
    }

    match = /^\/meta\/(movie|series)\/(.+)\.json$/.exec(url);
    if (match) {
      send(200, { meta: metaFor(decodeURIComponent(match[2])) });
      return;
    }

    match = /^\/stream\/(movie|series)\/(.+)\.json$/.exec(url);
    if (match) {
      send(200, {
        streams: [
          { name: 'Mock 1080p', url: 'https://example.invalid/mock-1080.mp4' },
          { name: 'Mock 720p', url: 'https://example.invalid/mock-720.mp4' }
        ]
      });
      return;
    }

    send(404, { error: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({ server, url: 'http://127.0.0.1:' + port })
    );
  });
}
