/**
 * data/addonClient.js — Stremio add-on protocol client (documented subset).
 *
 * Resources: manifest, catalog, meta, stream, subtitles —
 * https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md
 *
 * Every request is recorded in an in-memory diagnostics log (host, resource,
 * HTTP status or network error, duration, item count). The log keeps only
 * scheme+host of the add-on — never the full URL — so private add-on paths or
 * query strings can not end up on screen.
 *
 * Chromium M63 has no AbortController → XHR with `timeout` + finished-guard.
 */

var TIMEOUT = 9000;
var LOG_LIMIT = 40;
var log = [];

export function diagnosticsList() {
  return log.slice(0);
}

export function clearDiagnostics() {
  log = [];
}

function hostOf(url) {
  var match = /^https?:\/\/[^/]+/i.exec(url || '');
  return match ? match[0] : '(no host)';
}

/** Reason code for a failed manifest request (host-safe, no URL). */
function reasonOfError(err) {
  var message = String((err && err.message) || '');
  if (message === 'timeout') {
    return 'timeout';
  }
  var http = /^HTTP (\d{3})/.exec(message);
  if (http) {
    var status = parseInt(http[1], 10);
    if (status === 401 || status === 403) {
      return 'auth';
    }
    if (status === 404) {
      return 'notFound';
    }
    return status >= 500 ? 'server' : 'http';
  }
  if (/invalid JSON/i.test(message)) {
    return 'notAddon';
  }
  if (/not a Stremio add-on/i.test(message)) {
    return 'notAddon';
  }
  if (/invalid add-on url/i.test(message)) {
    return 'invalidUrl';
  }
  return 'unreachable';
}

/**
 * Host-only description of why an add-on was skipped. Used by the import
 * summary and Settings; never contains the URL, its path or its query string.
 */
export function describeFailure(url, err) {
  return { host: hostOf(url), reason: (err && err.reason) || reasonOfError(err) };
}

function record(entry) {
  entry.when = Date.now();
  log.push(entry);
  if (log.length > LOG_LIMIT) {
    log.shift();
  }
}

export function normalizeBase(input) {
  var url = String(input || '').trim();
  if (!url) {
    return null;
  }
  // WuPlay/Stremio exports carry the base address both with the Stremio scheme
  // prefix and with `https`. Both mean HTTPS to the same host.
  if (/^stremio:https?:\/\//i.test(url)) {
    url = url.replace(/^stremio:/i, '');
  } else if (/^stremio:\/\//i.test(url)) {
    url = url.replace(/^stremio:\/\//i, 'https://');
  }
  if (!/^https?:\/\//i.test(url)) {
    return null; // HTTP(S) transport only (ipfs:// and friends are not fetchable)
  }
  var hash = url.indexOf('#');
  if (hash > -1) {
    url = url.slice(0, hash);
  }
  // Configured add-ons put their configuration in the PATH (/<config>/manifest.json),
  // which is preserved. A query string is not part of the Stremio base and would
  // corrupt resource URLs ("…/manifest.json?k=v/catalog/…"), so it is dropped.
  var query = url.indexOf('?');
  if (query > -1) {
    url = url.slice(0, query);
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/manifest\.json$/i, '');
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/i.test(url)) {
    return null;
  }
  return url;
}

function requestJson(url, ctx, done) {
  var started = Date.now();
  var xhr = new XMLHttpRequest();
  var finished = false;
  var status = 0;

  function finish(err, data) {
    if (finished) {
      return;
    }
    finished = true;
    var items = -1;
    if (!err && data) {
      if (data.metas) {
        items = data.metas.length;
      } else if (data.meta) {
        items = 1;
      } else if (data.streams) {
        items = data.streams.length;
      } else if (data.subtitles) {
        items = data.subtitles.length;
      }
    }
    record({
      host: ctx.host,
      resource: ctx.resource,
      type: ctx.type || '',
      id: ctx.id || '',
      skip: ctx.skip || 0,
      status: status,
      error: err ? err.message : '',
      items: items,
      ms: Date.now() - started
    });
    done(err, data);
  }

  try {
    xhr.open('GET', url, true);
    xhr.timeout = TIMEOUT;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      status = xhr.status;
      if (xhr.status >= 200 && xhr.status < 300) {
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (parseError) {
          finish(new Error('invalid JSON'));
          return;
        }
        finish(null, data);
      } else if (xhr.status === 0) {
        finish(new Error('network or TLS error'));
      } else {
        finish(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.ontimeout = function () {
      finish(new Error('timeout'));
    };
    xhr.onerror = function () {
      finish(new Error('network or TLS error'));
    };
    xhr.send();
  } catch (err) {
    finish(new Error('request failed'));
  }
}

/**
 * Path segment for a Stremio id. Colons stay literal because the protocol uses
 * them for series episodes (`tt0944947:1:1`); percent-encoding them breaks
 * providers that parse the segment (Emby Bridge, TorBox and others).
 */
function encodeId(id) {
  return encodeURIComponent(String(id)).replace(/%3A/gi, ':');
}

function resourceUrl(base, resource, type, id, extra) {
  var url = base + '/' + resource + '/' + encodeURIComponent(type) + '/' + encodeId(id);
  if (extra) {
    url += '/' + extra;
  }
  return url + '.json';
}

/**
 * Reason code for a failed request (host-safe). Shared by the import summary and
 * the stream resolver so both report the same vocabulary.
 */
export function failureReason(err) {
  return reasonOfError(err);
}

/** Callback API: cb(error, json). */
export var addonClient = {
  manifest: function (base, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(root + '/manifest.json', { host: hostOf(root), resource: 'manifest' }, cb);
  },

  catalog: function (base, type, id, skip, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    var extra = skip > 0 ? 'skip=' + skip : '';
    requestJson(
      resourceUrl(root, 'catalog', type, id, extra),
      { host: hostOf(root), resource: 'catalog', type: type, id: id, skip: skip || 0 },
      cb
    );
  },

  meta: function (base, type, id, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(
      resourceUrl(root, 'meta', type, id, ''),
      { host: hostOf(root), resource: 'meta', type: type, id: id },
      cb
    );
  },

  streams: function (base, type, id, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(
      resourceUrl(root, 'stream', type, id, ''),
      { host: hostOf(root), resource: 'stream', type: type, id: id },
      cb
    );
  },

  subtitles: function (base, type, id, extra, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(
      resourceUrl(root, 'subtitles', type, id, extra),
      { host: hostOf(root), resource: 'subtitles', type: type, id: id },
      cb
    );
  },

  /** Arbitrary JSON GET (used by the profile-import-by-URL path). */
  json: function (url, cb) {
    var target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) {
      cb(new Error('invalid url'));
      return;
    }
    requestJson(target, { host: hostOf(target), resource: 'import' }, cb);
  }
};
