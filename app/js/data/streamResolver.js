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

import { addonClient, failureReason, diagnosticsList } from './addonClient.js';
import { capabilitiesOf } from '../state/addons.js';

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

/** Installed add-ons that can answer a stream request, with the skip reasons. */
export function streamCandidates(addons, type, id) {
  var out = [];
  var skipped = [];
  var list = addons || [];
  var value = String(id || '');
  for (var i = 0; i < list.length; i++) {
    var entry = list[i];
    if (!entry || !entry.url) {
      continue;
    }
    var known = !!entry.resources && entry.resources.length > 0;
    var cap = null;
    if (known) {
      var caps = capabilitiesOf(entry);
      for (var c = 0; c < caps.length; c++) {
        if (caps[c].name === 'stream') {
          cap = caps[c];
          break;
        }
      }
    }
    if (known && !cap) {
      skipped.push({ name: String(entry.name || 'Add-on'), host: hostOf(entry.url), reason: 'noStreamResource' });
      continue;
    }
    if (cap && cap.types.length && cap.types.indexOf(type) === -1) {
      skipped.push({ name: String(entry.name || 'Add-on'), host: hostOf(entry.url), reason: 'typeMismatch' });
      continue;
    }
    if (cap && cap.idPrefixes.length) {
      var matched = false;
      for (var p = 0; p < cap.idPrefixes.length; p++) {
        if (value.indexOf(cap.idPrefixes[p]) === 0) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        skipped.push({ name: String(entry.name || 'Add-on'), host: hostOf(entry.url), reason: 'idPrefixes' });
        continue;
      }
    }
    if (out.length >= MAX_PROVIDERS) {
      skipped.push({ name: String(entry.name || 'Add-on'), host: hostOf(entry.url), reason: 'limit' });
      continue;
    }
    // Unknown metadata (stored before v0.5.0): still ask it — it may well be a
    // stream provider, and a 404 costs one request.
    out.push({ entry: entry, unverified: !known, key: out.length });
  }
  return { providers: out, skipped: skipped };
}

/** Installed add-ons that can answer a stream request for this type/id. */
export function streamProviders(addons, type, id) {
  var found = streamCandidates(addons, type, id);
  var out = [];
  for (var i = 0; i < found.providers.length; i++) {
    out.push(found.providers[i].entry);
  }
  return out;
}

var lastReport = null;

/** The last resolve result (used by the Diagnostics screen and debug API). */
export function lastStreamReport() {
  return lastReport;
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
 * @param {function} done ({streams, providers, skipped, candidates, attempted, id, type})
 *   providers[i] = { name, host, status:'ok'|'empty'|'error', reason, httpStatus, count }
 *   skipped[i]   = { name, host, reason }  (noStreamResource|typeMismatch|idPrefixes|limit)
 *   host + name + reason only: no URL, path or token.
 */
export function resolveStreams(options, done) {
  var opts = options || {};
  var item = opts.item || {};
  var type = opts.type || item.kind || 'movie';
  var id = opts.videoId || item.id;
  var found = streamCandidates(opts.addons || [], type, id);
  var providers = found.providers;
  var report = [];
  var providerStreams = [];
  var streams = [];
  var seen = {};
  var pending = providers.length;
  var logStart = Date.now() - 1;

  function statusFor(entry) {
    // HTTP status / item count recorded by the add-on client for this request.
    // Matched by time + host + resource + id: the log is a ring buffer, so
    // indices shift and must not be used.
    var log = diagnosticsList();
    var host = hostOf(entry.url);
    for (var i = log.length - 1; i >= 0; i--) {
      if (
        log[i].when >= logStart &&
        log[i].resource === 'stream' &&
        log[i].host === host &&
        String(log[i].id) === String(id)
      ) {
        return log[i];
      }
    }
    return null;
  }

  function finish() {
    var ordered = report.slice().sort(function (a, b) {
      return a.index - b.index;
    });
    var result = {
      streams: streams.slice(0, MAX_STREAMS),
      providers: ordered,
      skipped: found.skipped,
      candidates: providers.length,
      attempted: providers.length,
      id: String(id || ''),
      type: type,
      // Each provider's OWN answers (not the merged/de-duplicated list): the
      // second picker stage must show what that add-on returned, even when every
      // URL it returned was already served by an earlier add-on.
      providerStreams: providerStreams,
      when: Date.now()
    };
    // The diagnostics snapshot is redacted: counts only, never stream objects
    // (they carry URLs with signed queries).
    lastReport = {
      streamCount: result.streams.length,
      providers: ordered,
      skipped: found.skipped,
      candidates: result.candidates,
      attempted: result.attempted,
      id: result.id,
      type: result.type,
      when: result.when
    };
    done(result);
  }

  if (!id) {
    lastReport = {
      streamCount: 0,
      providers: [],
      skipped: found.skipped,
      candidates: 0,
      attempted: 0,
      id: '',
      type: type,
      when: Date.now()
    };
    done({
      streams: [],
      providers: [],
      skipped: found.skipped,
      candidates: 0,
      attempted: 0,
      id: '',
      type: type
    });
    return;
  }

  if (!pending) {
    finish();
    return;
  }

  function settle(index, provider, status, reason, list) {
    var entry = provider.entry;
    var kept = [];
    var own = [];
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
        // Annotate a copy so the picker can group by add-on without mutating the
        // provider's object. `provider` is a display name, never a URL.
        var copy = {};
        for (var field in stream) {
          if (Object.prototype.hasOwnProperty.call(stream, field)) {
            copy[field] = stream[field];
          }
        }
        copy.provider = String(entry.name || 'Add-on');
        copy.providerKey = typeof provider.key === 'number' ? provider.key : -1;
        kept.push(copy);
        streams.push(copy);
      }
      for (var o = 0; o < list.length && o < 20; o++) {
        var mine = list[o];
        if (!mine || typeof mine !== 'object') {
          continue;
        }
        var mineCopy = {};
        for (var f2 in mine) {
          if (Object.prototype.hasOwnProperty.call(mine, f2)) {
            mineCopy[f2] = mine[f2];
          }
        }
        mineCopy.provider = String(entry.name || 'Add-on');
        mineCopy.providerKey = typeof provider.key === 'number' ? provider.key : -1;
        own.push(mineCopy);
      }
    }
    var logEntry = statusFor(entry);
    providerStreams[index] = own;
    report.push({
      index: index,
      name: String(entry.name || 'Add-on'),
      host: hostOf(entry.url),
      status: status,
      reason: reason || '',
      httpStatus: logEntry ? logEntry.status : 0,
      count: kept.length,
      answered: own.length
    });
    pending -= 1;
    if (pending === 0) {
      finish();
    }
  }

  for (var p = 0; p < providers.length; p++) {
    (function (provider, index) {
      var entry = provider.entry;
      addonClient.streams(entry.url, type, id, function (err, data) {
        if (err) {
          settle(index, provider, 'error', failureReason(err), null);
          return;
        }
        var list = data && data.streams && data.streams.length ? data.streams : [];
        settle(index, provider, list.length ? 'ok' : 'empty', '', list);
      });
    })(providers[p], p);
  }
}
