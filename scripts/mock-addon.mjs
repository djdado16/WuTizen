#!/usr/bin/env node
/**
 * mock-addon.mjs — hermetic Stremio add-on used by the smoke test.
 *
 * Implements the documented subset (manifest, catalog with skip paging, meta,
 * stream) plus one deliberately broken manifest for the error path. Serves CORS
 * headers as the protocol requires. No network access, no credentials.
 */

import { createServer } from 'node:http';

/** 3 s of 8 kHz 8-bit mono PCM — real decodable media for the player tests. */
function wavSample() {
  var rate = 8000;
  var seconds = 20;
  var samples = rate * seconds;
  var buffer = Buffer.alloc(44 + samples);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples, 40);
  for (var i = 0; i < samples; i++) {
    // 440 Hz tone, centred on 128 (8-bit unsigned).
    buffer[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / rate));
  }
  return buffer;
}

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
  var isSeries = id.indexOf('show') === 0;
  return {
    id: id,
    type: isSeries ? 'series' : 'movie',
    name: id === 'mock-1' ? 'Mock Film 1 (Full)' : 'Mock ' + id,
    poster: poster('M'),
    background: poster('B'),
    description: 'Placeholder synopsis served by the mock add-on.',
    releaseInfo: '2001',
    runtime: '112 min',
    imdbRating: '7.5',
    genres: ['Drama', 'Sci-Fi'],
    cast: ['Test Actor', 'Second Actor'],
    // Real episode metadata (Stremio `videos`), so episode selection is real.
    videos: isSeries
      ? [
          { id: id + ':1:1', season: 1, episode: 1, name: 'Pilot' },
          { id: id + ':1:2', season: 1, episode: 2, name: 'Second' }
        ]
      : []
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

    // Real media for the player tests (no network, no encoder needed).
    if (url === '/media/sample.wav') {
      const body = wavSample();
      const range = req.headers.range;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Accept-Ranges', 'bytes');
      if (range) {
        const parts = /bytes=(\d*)-(\d*)/.exec(range);
        const start = parts && parts[1] ? parseInt(parts[1], 10) : 0;
        const end = parts && parts[2] ? parseInt(parts[2], 10) : body.length - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + body.length);
        res.setHeader('Content-Length', String(end - start + 1));
        res.end(body.slice(start, end + 1));
        return;
      }
      res.setHeader('Content-Length', String(body.length));
      res.end(body);
      return;
    }

    // Stream-only and subtitle-only add-ons: no catalogs at all (the shape that
    // used to be skipped during import).
    if (url === '/streamonly/manifest.json') {
      send(200, {
        id: 'org.wutizen.streamonly',
        version: '1.0.0',
        name: 'Stream Only',
        description: 'No catalog, only streams',
        resources: ['stream'],
        types: ['movie', 'series']
      });
      return;
    }

    if (url === '/subonly/manifest.json') {
      send(200, {
        id: 'org.wutizen.subonly',
        version: '1.0.0',
        name: 'Subtitles Only',
        description: 'Object-form resources, subtitles only',
        resources: [{ name: 'subtitles', types: ['movie'] }],
        types: ['movie']
      });
      return;
    }

    // Stream providers (Emby Bridge / TorBox style): stream-only add-ons with
    // idPrefixes and path-level configuration, plus explicit failure modes.
    if (url === '/emby/manifest.json') {
      send(200, {
        id: 'org.wutizen.emby',
        version: '1.0.0',
        name: 'Emby Bridge',
        description: 'Stream provider (Emby Bridge shaped)',
        resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }],
        types: ['movie', 'series']
      });
      return;
    }
    if (url === '/torbox/manifest.json') {
      send(200, {
        id: 'org.wutizen.torbox',
        version: '1.0.0',
        name: 'TorBox',
        description: 'Stream provider (TorBox shaped)',
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: ['tt']
      });
      return;
    }
    if (url === '/noauth/manifest.json') {
      send(200, {
        id: 'org.wutizen.noauth',
        version: '1.0.0',
        name: 'Needs Login',
        description: 'Stream provider that rejects requests (401)',
        resources: ['stream'],
        types: ['movie', 'series']
      });
      return;
    }
    if (url === '/emptyprov/manifest.json') {
      send(200, {
        id: 'org.wutizen.empty',
        version: '1.0.0',
        name: 'Empty Provider',
        description: 'Stream provider that returns no streams',
        resources: ['stream'],
        types: ['movie'],
        idPrefixes: ['tt']
      });
      return;
    }

    if (url === '/stale-emby/manifest.json') {
      // Emby-shaped provider used to simulate an add-on stored by v0.4.x (no
      // resources/idPrefixes metadata in localStorage).
      send(200, {
        id: 'org.wutizen.stale',
        version: '0.9.0',
        name: 'Stale Emby',
        description: 'Stream provider stored without metadata',
        resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }],
        types: ['movie', 'series']
      });
      return;
    }

    let provider = /^\/(emby|torbox|noauth|emptyprov|stale-emby)\/stream\/(movie|series)\/(.+)\.json$/.exec(url);
    if (provider) {
      const which = provider[1];
      const videoId = provider[3];
      const base = 'http://127.0.0.1:' + port;
      if (which === 'stale-emby') {
        send(200, {
          streams: [{ name: 'Stale Emby', url: base + '/media/sample.wav?stale=1' }]
        });
        return;
      }
      if (which === 'noauth') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (which === 'emptyprov') {
        send(200, { streams: [] });
        return;
      }
      if (which === 'emby') {
        send(200, {
          streams: [
            { name: 'Emby 1080p', title: 'Emby direct', url: base + '/media/sample.wav?e=0' },
            // Same URL twice: the resolver must de-duplicate (deterministic).
            { name: 'Emby 1080p duplicate', url: base + '/media/sample.wav?e=0' },
            // Echoes the id: proves the exact id form that reached the provider.
            { name: 'Emby id ' + videoId, url: base + '/media/sample.wav?e=1' }
          ]
        });
        return;
      }
      // TorBox: two distinct direct links plus one torrent entry.
      send(200, {
        streams: [
          { name: 'TorBox 1080p', url: base + '/media/sample.wav?tb=1' },
          { name: 'TorBox 720p', url: base + '/media/sample.wav?tb=2' },
          { name: 'TorBox torrent', infoHash: 'cafebabecafebabecafebabecafebabe', fileIdx: 0 }
        ]
      });
      return;
    }

    // StreamBridge-shaped provider: configuration lives in the URL path, the
    // stream is a direct-play URL with the key in the query, behaviorHints carries
    // notWebReady + filename, and the stream ships its own subtitle list.
    if (/^\/sb\/[^/]+\/manifest\.json$/.test(url)) {
      send(200, {
        id: 'org.wutizen.streambridge',
        version: '1.0.0',
        name: 'StreamBridge',
        description: 'Emby direct play (StreamBridge shaped)',
        resources: [{ name: 'stream', types: ['movie', 'series'] }],
        types: ['movie', 'series']
      });
      return;
    }

    const sbStream = /^\/sb\/[^/]+\/stream\/(movie|series)\/(.+)\.json$/.exec(url);
    if (sbStream) {
      const base = 'http://127.0.0.1:' + port;
      send(200, {
        streams: [
          {
            name: 'StreamBridge',
            title: 'Direct Play · 1080p HDR · HEVC · DDP5.1 · 4.2 GB',
            url: base + '/media/sample.wav?api_key=demo-key&MediaSourceId=ms1',
            behaviorHints: { notWebReady: true, filename: 'Movie.2020.1080p.HDR.HEVC.DDP5.1.mkv' },
            subtitles: [
              { id: 'hr', url: base + '/media/hr.srt', lang: 'hr' },
              { id: 'en', url: base + '/media/en.vtt', lang: 'en' }
            ]
          },
          {
            name: 'StreamBridge',
            title: 'Direct Play · 720p AVC',
            url: base + '/media/sample.wav?api_key=demo-key&ms=2',
            // Needs a request header: players here cannot send one.
            behaviorHints: { proxyHeaders: { request: { 'X-Emby-Token': 'demo-key' } } }
          }
        ]
      });
      return;
    }

    // Subtitle add-on (Stremio `subtitles` resource).
    if (url === '/subs/manifest.json') {
      send(200, {
        id: 'org.wutizen.subs',
        version: '1.0.0',
        name: 'Open Subs',
        description: 'Subtitle provider',
        resources: ['subtitles'],
        types: ['movie', 'series']
      });
      return;
    }
    if (/^\/subs\/subtitles\/(movie|series)\/(.+)\.json$/.test(url)) {
      const base = 'http://127.0.0.1:' + port;
      send(200, {
        subtitles: [{ id: 'hr-sub', url: base + '/media/hr2.srt', lang: 'hr' }]
      });
      return;
    }
    if (url === '/media/hr.srt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(
        '1\n00:00:01,000 --> 00:00:06,000\nPrvi hrvatski titl\n\n' +
          '2\n00:00:06,000 --> 00:00:12,000\nDrugi redak titla\n\n' +
          '3\n00:00:12,000 --> 00:00:18,000\nTreći redak\n'
      );
      return;
    }
    if (url === '/media/hr2.srt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('1\n00:00:02,000 --> 00:00:09,000\nTitl iz dodatka\n');
      return;
    }
    if (url === '/media/en.vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.end('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nEnglish subtitle line\n');
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
          // Playable: a real WAV the HTML5 engine decodes in the smoke test.
          { name: 'Mock 1080p', title: 'Mock 1080p (direct)', url: 'http://127.0.0.1:' + port + '/media/sample.wav' },
          { name: 'Mock 720p', url: 'https://example.invalid/mock-720.mp4' },
          // Refusal path: torrent metadata without an HTTP link.
          { name: 'TorBox 1080p', title: 'TorBox 1080p (torrent)', infoHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', fileIdx: 0 }
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
