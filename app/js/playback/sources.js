/**
 * playback/sources.js — turns a Stremio `stream` object into something the
 * player can actually attempt, or a typed refusal with a user-facing reason.
 *
 * Stremio stream objects come in three shapes:
 *   1. { url: "https://…" }                  → playable (progressive / HLS / DASH)
 *   2. { infoHash, fileIdx, sources }        → torrent: NOT playable without a
 *                                              debrid/resolver add-on that returns
 *                                              an HTTP URL (TorBox, Emby Bridge do)
 *   3. { externalUrl } / { ytId }            → belongs to another app
 *
 * The classifier never fetches anything and never logs the URL: stream links are
 * private (signed, per-user) so only the *type* and the reason leave this module.
 */

var HLS = /\.m3u8(?:[?#]|$)/i;
var DASH = /\.mpd(?:[?#]|$)/i;
var PROGRESSIVE = /\.(?:mp4|m4v|mov|webm|mkv|ts|avi|mp3|m4a|aac|wav|ogg)(?:[?#]|$)/i;
var HLS_HINT = /(?:type=m3u8|format=hls|\/hls\/|:hls)/i;
var DASH_HINT = /(?:type=mpd|format=dash|\/dash\/|:dash)/i;

/** Stream kind constants (kept as strings: they appear in the debug snapshot). */
export var KIND = {
  HTTP: 'http',
  TORRENT: 'torrent',
  EXTERNAL: 'external',
  INVALID: 'invalid'
};

/**
 * True when this stream needs request headers we cannot send. `<video>` and
 * AVPlay take a URL only, so `behaviorHints.proxyHeaders.request` (Streamio's
 * "needs a proxy" marker) is the one thing that genuinely cannot be played.
 */
export function requiresHeaders(stream) {
  var hints = (stream && stream.behaviorHints) || {};
  var proxy = hints.proxyHeaders;
  if (!proxy) {
    return false;
  }
  var request = proxy.request || proxy;
  if (!request || typeof request !== 'object') {
    return false;
  }
  for (var key in request) {
    if (Object.prototype.hasOwnProperty.call(request, key)) {
      return true;
    }
  }
  return false;
}

/** Scheme of the page we are running in ('https:' / 'http:' / 'file:'). */
export function pageProtocol() {
  try {
    return String(window.location.protocol || '');
  } catch (err) {
    return '';
  }
}

/**
 * @param {string} text url or filename
 * @returns {string} hls|dash|progressive|auto
 */
export function typeOf(text) {
  var value = String(text || '');
  if (HLS.test(value) || HLS_HINT.test(value)) {
    return 'hls';
  }
  if (DASH.test(value) || DASH_HINT.test(value)) {
    return 'dash';
  }
  if (PROGRESSIVE.test(value)) {
    return 'progressive';
  }
  // TorBox / Emby Bridge hand out extension-less endpoints (`/stream/xyz`), so an
  // unknown suffix is not an error: the player lets the engine sniff the container.
  return 'auto';
}

/** Human label for the source (name → title → filename → host-free default). */
export function labelOf(stream) {
  var s = stream || {};
  var hints = s.behaviorHints || {};
  var parts = [];
  if (s.name) {
    parts.push(String(s.name));
  }
  if (s.title && String(s.title) !== String(s.name || '')) {
    parts.push(String(s.title));
  }
  if (!parts.length && hints.filename) {
    parts.push(String(hints.filename));
  }
  if (!parts.length) {
    parts.push('stream');
  }
  return parts.join(' · ');
}

/**
 * @param {object} stream Stremio stream object
 * @param {{pageProtocol?:string}} [options] page scheme for the mixed-content check
 * @returns {{ok:boolean, kind:string, url:string, type:string, label:string, reason:string}}
 *   `reason` is an i18n key suffix: torrent | requiresHeaders | mixedContent |
 *   external | yt | scheme | empty | notWebReady | noUrl
 */
export function classifyStream(stream, options) {
  var s = stream || {};
  var opts = options || {};
  var hints = s.behaviorHints || {};
  var label = labelOf(s);

  if (!s || typeof s !== 'object') {
    return { ok: false, kind: KIND.INVALID, url: '', type: '', label: label, reason: 'empty' };
  }

  var url = s.url ? String(s.url).trim() : '';

  if (!url) {
    // No direct link: torrent metadata, a YouTube id or an external app.
    if (s.infoHash || s.btih || typeof s.fileIdx === 'number' || s.sources) {
      return { ok: false, kind: KIND.TORRENT, url: '', type: '', label: label, reason: 'torrent' };
    }
    if (s.ytId) {
      return { ok: false, kind: KIND.EXTERNAL, url: '', type: '', label: label, reason: 'yt' };
    }
    if (s.externalUrl) {
      return {
        ok: false,
        kind: KIND.EXTERNAL,
        url: String(s.externalUrl),
        type: '',
        label: label,
        reason: 'external'
      };
    }
    return { ok: false, kind: KIND.INVALID, url: '', type: '', label: label, reason: 'noUrl' };
  }

  if (/^magnet:/i.test(url)) {
    return { ok: false, kind: KIND.TORRENT, url: '', type: '', label: label, reason: 'torrent' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, kind: KIND.INVALID, url: '', type: '', label: label, reason: 'scheme' };
  }
  if (hints.notWebReady === true) {
    // `notWebReady` only means "not guaranteed to be web-playable" (Stremio uses
    // it to prefer handing the URL to a native/external player). StreamBridge
    // marks direct-play links this way and they do play, so this is NOT a
    // refusal — it is only reported when the engine cannot take the URL at all.
    // Fall through: the URL is attempted below.
    void hints;
  }
  if (requiresHeaders(s)) {
    // proxyHeaders.request: an HTTP header set is required and neither <video>
    // nor AVPlay can send one. This is the only honest refusal here.
    return { ok: false, kind: KIND.EXTERNAL, url: url, type: '', label: label, reason: 'requiresHeaders' };
  }
  var proto = opts.pageProtocol || pageProtocol();
  if (proto === 'https:' && /^http:\/\//i.test(url)) {
    // Chromium blocks http media inside an https page (mixed content); the
    // StreamBridge README documents exactly this ("an HTTPS page cannot connect
    // to an HTTP server"). Report it instead of an opaque network error.
    return { ok: false, kind: KIND.HTTP, url: url, type: '', label: label, reason: 'mixedContent' };
  }

  var type = typeOf(url);
  if (type === 'auto' && hints.filename) {
    type = typeOf(hints.filename);
  }
  return { ok: true, kind: KIND.HTTP, url: url, type: type, label: label, reason: '' };
}

/** True when this stream needs a resolver add-on (debrid) to become playable. */
export function isTorrentStream(stream) {
  var info = classifyStream(stream);
  return info.kind === KIND.TORRENT;
}
