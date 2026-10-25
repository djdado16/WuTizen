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
  if (!/^https?:\/\//i.test(url)) {
    return null; // HTTP(S) transport only
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/manifest\.json$/i, '');
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

function resourceUrl(base, resource, type, id, extra) {
  var url = base + '/' + resource + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(id);
  if (extra) {
    url += '/' + extra;
  }
  return url + '.json';
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
  }
};
