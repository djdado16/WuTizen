/**
 * data/emby.js — native Emby Server client (documented Emby REST API).
 *
 * STATUS: client only — NOT wired into Settings or the provider picker yet. It
 * implements the stored connection, `connect()`/`info()`/`libraries()`,
 * `items()`/`episodes()`, `findForItem()` (IMDb/TMDb/TVDb → unambiguous
 * title/year), `streamsFor()` (Direct Play + documented `/stream.mp4` transcode)
 * and `subtitlesFor()` (MediaStream DeliveryUrl). Tests drive it through
 * `WuTizenDebug.emby`.
 *
 * POST /Users/AuthenticateByName, GET /System/Info, /Users/{id}/Views,
 * /Users/{id}/Items, /Videos/{id}/stream (direct play) and /stream.mp4 (documented
 * server transcode). Credentials live in localStorage only (not encrypted) and are
 * never logged; UI/diagnostics only see names, hosts and media properties.
 */

import { getItem, setItem } from '../platform/storage.js';

var KEY = 'emby';
var TIMEOUT = 12000;

function store() {
  var data = getItem(KEY, null);
  return data && typeof data === 'object' ? data : null;
}

/** Host only (never the full server URL). */
export function hostOf(url) {
  var match = /^https?:\/\/[^/]+/i.exec(String(url || ''));
  return match ? match[0] : '';
}

export function config() {
  var data = store();
  if (!data || !data.url || !data.token) {
    return null;
  }
  return { url: data.url, token: data.token, userId: data.userId, name: data.name || '' };
}

export function isConfigured() {
  return !!config();
}

export function saveConfig(next) {
  var base = store() || {};
  setItem(KEY, {
    url: String(next.url || '').replace(/\/+$/, ''),
    token: String(next.token || ''),
    userId: String(next.userId || ''),
    name: String(next.name || ''),
    deviceId: base.deviceId || '',
    when: Date.now()
  });
}

/** Removes Emby credentials only; every other key is untouched. */
export function disconnect() {
  setItem(KEY, null);
}

function deviceId() {
  var data = store() || {};
  if (data.deviceId) {
    return data.deviceId;
  }
  var id = 'wutizen-' + String(Math.random()).slice(2, 10);
  data.deviceId = id;
  setItem(KEY, data);
  return id;
}

function authHeader() {
  return (
    'MediaBrowser Client="WuTizen", Device="Samsung TV", DeviceId="' +
    deviceId() +
    '", Version="0.7.0"'
  );
}

function normalizeServer(input) {
  var url = String(input || '').trim();
  if (!url) {
    return '';
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '');
}

/** http server inside an https page is blocked by Chromium (mixed content). */
function protocolError(serverUrl) {
  try {
    if (window.location.protocol === 'https:' && /^http:\/\//i.test(serverUrl)) {
      return 'mixedContent';
    }
  } catch (err) {
    /* ignored */
  }
  return '';
}

function request(options, cb) {
  var cfg = options.config || config();
  if (!cfg) {
    cb(new Error('auth'));
    return;
  }
  var url =
    cfg.url + options.path + (options.path.indexOf('?') > -1 ? '&' : '?') + 'api_key=' + cfg.token;
  var xhr = new XMLHttpRequest();
  var done = false;
  function finish(err, data) {
    if (done) {
      return;
    }
    done = true;
    cb(err, data);
  }
  try {
    xhr.open(options.method || 'GET', url, true);
    xhr.timeout = TIMEOUT;
    xhr.setRequestHeader('X-Emby-Authorization', authHeader());
    xhr.setRequestHeader('Accept', 'application/json');
    if (options.body) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        var data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (err) {
          finish(new Error('http'));
          return;
        }
        finish(null, data);
      } else if (xhr.status === 401 || xhr.status === 403) {
        finish(new Error('auth'));
      } else if (xhr.status === 0) {
        finish(new Error('unreachable'));
      } else {
        finish(new Error('http'));
      }
    };
    xhr.ontimeout = function () {
      finish(new Error('unreachable'));
    };
    xhr.onerror = function () {
      finish(new Error('unreachable'));
    };
    xhr.send(options.body ? JSON.stringify(options.body) : undefined);
  } catch (err2) {
    finish(new Error('unreachable'));
  }
}

/** Authenticate, persist the session, then read the server name. */
export function connect(serverUrl, username, password, cb) {
  var server = normalizeServer(serverUrl);
  if (!server) {
    cb(new Error('http'));
    return;
  }
  var blocked = protocolError(server);
  if (blocked) {
    cb(new Error(blocked));
    return;
  }
  var xhr = new XMLHttpRequest();
  var done = false;
  function finish(err, data) {
    if (done) {
      return;
    }
    done = true;
    cb(err, data);
  }
  try {
    xhr.open('POST', server + '/Users/AuthenticateByName', true);
    xhr.timeout = TIMEOUT;
    xhr.setRequestHeader('X-Emby-Authorization', authHeader());
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status === 401 || xhr.status === 403) {
        finish(new Error('auth'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error(xhr.status === 0 ? 'unreachable' : 'http'));
        return;
      }
      var data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (err) {
        finish(new Error('http'));
        return;
      }
      if (!data || !data.AccessToken || !data.User || !data.User.Id) {
        finish(new Error('auth'));
        return;
      }
      saveConfig({ url: server, token: data.AccessToken, userId: data.User.Id, name: '' });
      info(function (err2, systemInfo) {
        var name = '';
        if (!err2 && systemInfo) {
          name = systemInfo.ServerName;
          saveConfig({ url: server, token: data.AccessToken, userId: data.User.Id, name: name });
        }
        finish(null, { userId: data.User.Id, name: name, host: hostOf(server) });
      });
    };
    xhr.ontimeout = function () {
      finish(new Error('unreachable'));
    };
    xhr.onerror = function () {
      finish(new Error('unreachable'));
    };
    xhr.send(JSON.stringify({ Username: String(username || ''), Pw: String(password || '') }));
  } catch (err3) {
    finish(new Error('unreachable'));
  }
}

export function info(cb) {
  request({ path: '/System/Info' }, function (err, data) {
    if (err) {
      cb(err);
      return;
    }
    cb(null, {
      ServerName: String((data && data.ServerName) || ''),
      Version: String((data && data.Version) || '')
    });
  });
}

export function libraries(cb) {
  var cfg = config();
  if (!cfg) {
    cb(new Error('auth'));
    return;
  }
  request({ path: '/Users/' + cfg.userId + '/Views' }, function (err, data) {
    if (err) {
      cb(err);
      return;
    }
    var raw = (data && data.Items) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      out.push({
        id: String(raw[i].Id || ''),
        name: String(raw[i].Name || ''),
        type: String(raw[i].CollectionType || '')
      });
    }
    cb(null, out);
  });
}

function normalizeItem(raw) {
  var ids = raw.ProviderIds || {};
  return {
    id: String(raw.Id || ''),
    name: String(raw.Name || ''),
    type: String(raw.Type || ''),
    year: parseInt(raw.ProductionYear, 10) || 0,
    season: parseInt(raw.ParentIndexNumber, 10) || 0,
    episode: parseInt(raw.IndexNumber, 10) || 0,
    imdb: String(ids.Imdb || '').toLowerCase(),
    tmdb: String(ids.Tmdb || ''),
    tvdb: String(ids.Tvdb || ''),
    sources: raw.MediaSources || []
  };
}

var ITEM_FIELDS = 'Fields=ProviderIds,ProductionYear,ParentIndexNumber,IndexNumber,MediaSources&Limit=200';

/** Library items (movies + series) of one view. */
export function items(viewId, cb) {
  var cfg = config();
  if (!cfg) {
    cb(new Error('auth'));
    return;
  }
  var query =
    '/Users/' +
    cfg.userId +
    '/Items?ParentId=' +
    encodeURIComponent(viewId) +
    '&Recursive=true&IncludeItemTypes=Movie,Series&' +
    ITEM_FIELDS;
  request({ path: query }, function (err, data) {
    if (err) {
      cb(err);
      return;
    }
    var raw = (data && data.Items) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      out.push(normalizeItem(raw[i]));
    }
    cb(null, out);
  });
}

/** Episodes of one series (documented /Shows/{Id}/Episodes). */
export function episodes(seriesId, cb) {
  var cfg = config();
  if (!cfg) {
    cb(new Error('auth'));
    return;
  }
  request(
    { path: '/Shows/' + encodeURIComponent(seriesId) + '/Episodes?UserId=' + cfg.userId + '&' + ITEM_FIELDS },
    function (err, data) {
      if (err) {
        cb(err);
        return;
      }
      var raw = (data && data.Items) || [];
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        out.push(normalizeItem(raw[i]));
      }
      cb(null, out);
    }
  );
}

function fetchCandidates(type, extra, cb) {
  var cfg = config();
  if (!cfg) {
    cb(new Error('auth'));
    return;
  }
  var query =
    '/Users/' +
    cfg.userId +
    '/Items?Recursive=true&IncludeItemTypes=' +
    type +
    '&' +
    ITEM_FIELDS +
    (extra || '');
  request({ path: query }, function (err, data) {
    if (err) {
      cb(err);
      return;
    }
    var raw = (data && data.Items) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      out.push(normalizeItem(raw[i]));
    }
    cb(null, out);
  });
}

/**
 * Find the Emby item for a WuTizen item.
 * 1) IMDb provider id (primary key), then TMDb/TVDb when supplied on the item;
 * 2) title (+year) fallback ONLY when exactly one candidate matches.
 * @param {function} cb (err, embyItem|null, how) — how: imdb|tmdb|tvdb|title|none|ambiguous
 */
export function findForItem(item, cb) {
  var type = (item && item.kind) === 'series' ? 'Series' : 'Movie';
  var imdb = String((item && item.id) || '').split(':')[0].toLowerCase();
  var tmdb = String((item && item.tmdb) || '');
  var tvdb = String((item && item.tvdb) || '');
  var extra = '';
  if (/^tt\d+$/.test(imdb)) {
    extra = '&AnyProviderIdEquals=imdb.' + encodeURIComponent(imdb);
  } else if (tmdb) {
    extra = '&AnyProviderIdEquals=tmdb.' + encodeURIComponent(tmdb);
  } else if (tvdb) {
    extra = '&AnyProviderIdEquals=tvdb.' + encodeURIComponent(tvdb);
  }
  fetchCandidates(type, extra, function (err, candidates) {
    if (err) {
      cb(err);
      return;
    }
    for (var i = 0; i < candidates.length; i++) {
      if (imdb && candidates[i].imdb === imdb) {
        cb(null, candidates[i], 'imdb');
        return;
      }
      if (tmdb && candidates[i].tmdb === tmdb) {
        cb(null, candidates[i], 'tmdb');
        return;
      }
      if (tvdb && candidates[i].tvdb === tvdb) {
        cb(null, candidates[i], 'tvdb');
        return;
      }
    }
    var title = String((item && item.title && (item.title.hr || item.title.en)) || '')
      .trim()
      .toLowerCase();
    if (!title) {
      cb(null, null, 'none');
      return;
    }
    var year = parseInt(item && item.year, 10) || 0;
    var matches = [];
    for (var c = 0; c < candidates.length; c++) {
      if (candidates[c].name.trim().toLowerCase() !== title) {
        continue;
      }
      if (year && candidates[c].year && candidates[c].year !== year) {
        continue;
      }
      matches.push(candidates[c]);
    }
    if (matches.length === 1) {
      cb(null, matches[0], 'title');
      return;
    }
    cb(null, null, matches.length ? 'ambiguous' : 'none');
  });
}

function mediaLabel(source) {
  var parts = [];
  var height = parseInt(source.Height, 10) || 0;
  if (height >= 2000) {
    parts.push('2160P');
  } else if (height >= 1000) {
    parts.push('1080P');
  } else if (height >= 700) {
    parts.push('720P');
  }
  if (source.VideoCodec) {
    parts.push(String(source.VideoCodec).toUpperCase());
  }
  if (source.Bitrate) {
    parts.push(Math.round(source.Bitrate / 1000000) + ' Mbps');
  }
  var tracks = source.MediaStreams || [];
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i].Type === 'Audio') {
      parts.push(String(tracks[i].DisplayTitle || tracks[i].Codec || ''));
      break;
    }
  }
  var subs = 0;
  for (var s = 0; s < tracks.length; s++) {
    if (tracks[s].Type === 'Subtitle') {
      subs += 1;
    }
  }
  if (subs) {
    parts.push(subs + ' sub');
  }
  return parts.join(' · ');
}

/** Samsung-compatible direct play codecs (H.264/HEVC in MP4/MKV/TS). */
function directPlayOk(source) {
  var codec = String(source.VideoCodec || '').toLowerCase();
  return !codec || codec === 'h264' || codec === 'avc' || codec === 'hevc' || codec === 'h265';
}

function directUrl(cfg, itemId, sourceId) {
  return (
    cfg.url +
    '/Videos/' +
    encodeURIComponent(itemId) +
    '/stream?Static=true&MediaSourceId=' +
    encodeURIComponent(sourceId || '') +
    '&api_key=' +
    cfg.token
  );
}

function transcodeUrl(cfg, itemId, sourceId) {
  // Documented server-side transcode endpoint: H.264/AAC in MP4, seekable.
  return (
    cfg.url +
    '/Videos/' +
    encodeURIComponent(itemId) +
    '/stream.mp4?Static=false&VideoCodec=h264&AudioCodec=aac' +
    '&MaxStreamingBitrate=8000000' +
    (sourceId ? '&MediaSourceId=' + encodeURIComponent(sourceId) : '') +
    '&api_key=' +
    cfg.token
  );
}

/**
 * Stremio-shaped streams for one Emby item: one Direct Play entry per media
 * source, plus a documented transcode entry when the codec is not known-good.
 * URLs are built here only; callers display labels, never the URLs.
 */
export function streamsFor(embyItem) {
  var cfg = config();
  if (!cfg || !embyItem) {
    return [];
  }
  var out = [];
  var sources = embyItem.sources || [];
  for (var i = 0; i < sources.length; i++) {
    var source = sources[i];
    var sourceId = String(source.Id || '');
    var label = mediaLabel(source);
    var ok = directPlayOk(source);
    var subs = subtitlesFor(source);
    out.push({
      name: 'Emby Server',
      title: (ok ? 'Direct Play' : 'Direct Play') + (label ? ' · ' + label : ''),
      url: directUrl(cfg, embyItem.id, sourceId),
      behaviorHints: { notWebReady: true, filename: embyItem.name },
      subtitles: subs
    });
    if (!ok) {
      out.push({
        name: 'Emby Server',
        title: 'Transcode · H.264/AAC' + (label ? ' · ' + label : ''),
        url: transcodeUrl(cfg, embyItem.id, sourceId),
        behaviorHints: { notWebReady: true, filename: embyItem.name },
        subtitles: subs
      });
    }
  }
  return out;
}

/** External subtitle tracks a media source exposes (DeliveryUrl + api_key). */
export function subtitlesFor(source) {
  var cfg = config();
  if (!cfg || !source) {
    return [];
  }
  var out = [];
  var tracks = source.MediaStreams || [];
  for (var i = 0; i < tracks.length; i++) {
    var track = tracks[i];
    if (track.Type !== 'Subtitle' || !track.DeliveryUrl) {
      continue;
    }
    out.push({
      id: 'emby-' + String(track.Index),
      lang: String(track.Language || '').toLowerCase().slice(0, 5),
      url: cfg.url + track.DeliveryUrl + '&api_key=' + cfg.token
    });
  }
  return out;
}

/** Redacted view of the client state (no URL, token or userId). */
export function stateSummary() {
  var cfg = config();
  if (!cfg) {
    return { connected: false, name: '', host: '' };
  }
  return { connected: true, name: cfg.name || '', host: hostOf(cfg.url) };
}
