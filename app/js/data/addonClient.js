/**
 * data/addonClient.js — Stremio add-on protocol client (documented subset).
 *
 * Resources used: manifest, catalog, meta, stream, subtitles — see
 * https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md
 *
 * Chromium M63 has no AbortController, so requests use XHR with `timeout` and a
 * finished-guard. Nothing is cached here; callers decide what to keep.
 */

var TIMEOUT = 9000;

export function normalizeBase(input) {
  var url = String(input || '').trim();
  if (!url) {
    return null;
  }
  if (!/^https?:\/\//i.test(url)) {
    return null; // add-on transport must be HTTP(S); ipfs:// etc. unsupported
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/manifest\.json$/i, '');
  return url;
}

function requestJson(url, done) {
  var xhr = new XMLHttpRequest();
  var finished = false;

  function finish(err, data) {
    if (finished) {
      return;
    }
    finished = true;
    done(err, data);
  }

  try {
    xhr.open('GET', url, true);
    xhr.timeout = TIMEOUT;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
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
        finish(new Error('network error'));
      } else {
        finish(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.ontimeout = function () {
      finish(new Error('timeout'));
    };
    xhr.onerror = function () {
      finish(new Error('network error'));
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
    requestJson(root + '/manifest.json', cb);
  },

  catalog: function (base, type, id, skip, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    var extra = skip > 0 ? 'skip=' + skip : '';
    requestJson(resourceUrl(root, 'catalog', type, id, extra), cb);
  },

  meta: function (base, type, id, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(resourceUrl(root, 'meta', type, id, ''), cb);
  },

  streams: function (base, type, id, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(resourceUrl(root, 'stream', type, id, ''), cb);
  },

  subtitles: function (base, type, id, extra, cb) {
    var root = normalizeBase(base);
    if (!root) {
      cb(new Error('invalid add-on url'));
      return;
    }
    requestJson(resourceUrl(root, 'subtitles', type, id, extra), cb);
  }
};
