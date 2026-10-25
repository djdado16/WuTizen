/**
 * data/streamResolver.js — asks EVERY installed add-on that advertises the
 * `stream` resource, then merges and de-duplicates the answers.
 *
 * Why this exists: a catalog add-on (Cinemeta and friends) is usually NOT the
 * stream provider. WuPlay-class setups install Emby Bridge / TorBox as
 * stream-only add-ons, so querying only the add-on that produced the catalog item
 * finds nothing and the details screen says "no sources" even though the
 * providers are installed and healthy.
 *
 * Rules (Stremio protocol):
 *   - candidate = installed add-on whose `resources` contains `stream`;
 *   - skip candidates whose `types` exclude the requested type;
 *   - skip candidates whose `idPrefixes` cannot match the id (`tt…`, `kitsu:…`);
 *   - each answer is kept as-is, duplicates removed by url / infoHash+fileIdx /
 *     externalUrl / ytId / name+title — a valid HTTP stream is never dropped.
 */

import { addonClient, failureReason } from './addonClient.js';

var MAX_PROVIDERS = 10;
var MAX_STREAMS = 40;

function hostOf(url) {
  var match = /^https?:\/\/[^/]+/i.exec(String(url || ''));
  return match ? match[0] : '(no host)';
}

/** Does a stored add-on advertise this resource? */
export function advertises(entry, resource) {
  var list = (entry && entry.resources) || [];
  return list.indexOf(resource) > -1;
}

function typeAllowed(entry, type) {
  var types = (entry && entry.types) || [];
  return types.length === 0 || types.indexOf(type) > -1;
}

function prefixAllowed(entry, id) {
  var prefixes = (entry && entry.idPrefixes) || [];
  if (!prefixes.length) {
    return true; // no declaration: the add-on accepts every namespace
  }
  var value = String(id);
  for (var i = 0; i < prefixes.length; i++) {
    if (value.indexOf(prefixes[i]) === 0) {
      return true;
    }
  }
  return false;
}

/** Installed add-ons that can answer a stream request for this type/id. */
export function streamProviders(addons, type, id) {
  var out = [];
  var list = addons || [];
  for (var i = 0; i < list.length && out.length < MAX_PROVIDERS; i++) {
    var entry = list[i];
    if (!entry || !entry.url || !advertises(entry, 'stream')) {
      continue;
    }
    if (!typeAllowed(entry, type) || !prefixAllowed(entry, id)) {
      continue;
    }
    out.push(entry);
  }
  return out;
}

function streamKey(stream) {
  if (stream.url) {
    return 'u:' + String(stream.url);
  }
  if (stream.infoHash) {
    return 'h:' + String(stream.infoHash) + ':' + String(stream.fileIdx || 0);
  }
  if (stream.externalUrl) {
    return 'e:' + String(stream.externalUrl);
  }
  if (stream.ytId) {
    return 'y:' + String(stream.ytId);
  }
  return 'n:' + String(stream.name || '') + '|' + String(stream.title || '');
}

/**
 * Query all stream providers and merge the results.
 * @param {{item:object, type:string, videoId:string, addons:object[]}} options
 * @param {function} done ({streams, providers, attempted, id, type})
 *   providers[i] = { name, host, status:'ok'|'empty'|'error', reason, count }
 *   — host + name + reason only: no URL, path or token.
 */
export function resolveStreams(options, done) {
  var opts = options || {};
  var item = opts.item || {};
  var type = opts.type || item.kind || 'movie';
  var id = opts.videoId || item.id;
  var providers = streamProviders(opts.addons || [], type, id);
  var report = [];
  var streams = [];
  var seen = {};
  var pending = providers.length;
  var attempted = 0;

  function finish() {
    var ordered = report.slice().sort(function (a, b) {
      return a.index - b.index;
    });
    done({
      streams: streams.slice(0, MAX_STREAMS),
      providers: ordered,
      attempted: attempted,
      id: String(id || ''),
      type: type
    });
  }

  if (!id || !pending) {
    done({ streams: [], providers: [], attempted: 0, id: String(id || ''), type: type });
    return;
  }

  function settle(index, entry, status, reason, list) {
    var kept = [];
    if (list) {
      for (var i = 0; i < list.length; i++) {
        var stream = list[i];
        if (!stream || typeof stream !== 'object') {
          continue;
        }
        var key = streamKey(stream);
        if (seen[key]) {
          continue; // same source from two providers
        }
        seen[key] = true;
        kept.push(stream);
        streams.push(stream);
      }
    }
    report.push({
      index: index,
      name: String(entry.name || 'Add-on'),
      host: hostOf(entry.url),
      status: status,
      reason: reason || '',
      count: kept.length
    });
    pending -= 1;
    if (pending === 0) {
      finish();
    }
  }

  attempted = providers.length;

  for (var p = 0; p < providers.length; p++) {
    (function (entry, index) {
      addonClient.streams(entry.url, type, id, function (err, data) {
        if (err) {
          settle(index, entry, 'error', failureReason(err), null);
          return;
        }
        var list = data && data.streams && data.streams.length ? data.streams : [];
        settle(index, entry, list.length ? 'ok' : 'empty', '', list);
      });
    })(providers[p], p);
  }
}
