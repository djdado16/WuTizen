/**
 * state/addons.js — installed add-ons, persisted locally.
 *
 * Only the manifest summary and the user-entered base URL are stored, on the TV,
 * in localStorage. Nothing is uploaded and no add-on URL is ever logged (it may
 * embed a private key). Profile data from WuPlay is never involved.
 */

import { getItem, setItem } from '../platform/storage.js';
import { addonClient, normalizeBase } from '../data/addonClient.js';

var KEY = 'addons';

/** Public, key-free add-ons, offered as one-tap installs. */
export var PRESETS = [
  { url: 'https://v3-cinemeta.strem.io', labelKey: 'addons.presetCinemeta' },
  { url: 'https://opensubtitles-v3.strem.io', labelKey: 'addons.presetSubs' }
];

function summarize(url, manifest) {
  var resources = [];
  var resourceDetails = [];
  var raw = manifest.resources || [];
  for (var i = 0; i < raw.length && resources.length < 8; i++) {
    // Resources are either plain strings or Stremio's object form
    // ({ name:'stream', types:[…], idPrefixes:[…] }) — both are capabilities.
    var entry = raw[i];
    var name = typeof entry === 'string' ? entry : entry && entry.name ? String(entry.name) : '';
    if (!name || resources.indexOf(name) > -1) {
      continue;
    }
    resources.push(name);
    var detail = { name: name, types: [], idPrefixes: [] };
    if (entry && typeof entry === 'object') {
      var types = entry.types || [];
      for (var ti = 0; ti < types.length && ti < 8; ti++) {
        if (typeof types[ti] === 'string') {
          detail.types.push(types[ti]);
        }
      }
      var prefixes = entry.idPrefixes || [];
      for (var pi = 0; pi < prefixes.length && pi < 8; pi++) {
        if (typeof prefixes[pi] === 'string') {
          detail.idPrefixes.push(prefixes[pi]);
        }
      }
    }
    resourceDetails.push(detail);
  }
  var catalogs = [];
  var rawCats = manifest.catalogs || [];
  for (var c = 0; c < rawCats.length && c < 8; c++) {
    catalogs.push({
      type: rawCats[c].type,
      id: rawCats[c].id,
      name: rawCats[c].name || rawCats[c].id
    });
  }
  var types = [];
  var rawTypes = manifest.types || [];
  for (var t = 0; t < rawTypes.length && types.length < 6; t++) {
    if (typeof rawTypes[t] === 'string') {
      types.push(rawTypes[t]);
    }
  }
  // idPrefixes declared by the stream resource (or the manifest) tell us which
  // id namespaces the add-on can answer — used to skip impossible requests.
  var idPrefixes = [];
  function addPrefix(value) {
    if (typeof value === 'string' && value && idPrefixes.indexOf(value) === -1 && idPrefixes.length < 8) {
      idPrefixes.push(value);
    }
  }
  for (var r2 = 0; r2 < raw.length; r2++) {
    var entry2 = raw[r2];
    if (entry2 && typeof entry2 === 'object' && entry2.name === 'stream' && entry2.idPrefixes) {
      for (var p = 0; p < entry2.idPrefixes.length; p++) {
        addPrefix(entry2.idPrefixes[p]);
      }
    }
  }
  if (!idPrefixes.length && manifest.idPrefixes) {
    for (var p2 = 0; p2 < manifest.idPrefixes.length; p2++) {
      addPrefix(manifest.idPrefixes[p2]);
    }
  }
  return {
    url: url,
    id: String(manifest.id || url),
    name: String(manifest.name || 'Add-on'),
    version: String(manifest.version || ''),
    description: String(manifest.description || ''),
    logo: manifest.logo ? String(manifest.logo) : '',
    resources: resources,
    resourceDetails: resourceDetails,
    types: types,
    idPrefixes: idPrefixes,
    catalogs: catalogs
  };
}

/**
 * Capabilities of a stored add-on: which Stremio resources it serves, with the
 * types/idPrefixes it declared for each (resource-level wins over manifest-level).
 * Add-ons can hold several roles at once (catalog + meta + stream, …).
 */
export function capabilitiesOf(entry) {
  var out = [];
  var list = (entry && entry.resources) || [];
  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    var detail = null;
    var details = (entry && entry.resourceDetails) || [];
    for (var d = 0; d < details.length; d++) {
      if (details[d] && details[d].name === name) {
        detail = details[d];
        break;
      }
    }
    var types = (detail && detail.types && detail.types.length ? detail.types : entry.types) || [];
    var prefixes =
      (detail && detail.idPrefixes && detail.idPrefixes.length ? detail.idPrefixes : entry.idPrefixes) || [];
    out.push({ name: name, types: types, idPrefixes: prefixes });
  }
  return out;
}

/** True when the add-on serves `resource` for this type/id (prefix-aware). */
export function serves(entry, resource, type, id) {
  var caps = capabilitiesOf(entry);
  for (var i = 0; i < caps.length; i++) {
    if (caps[i].name !== resource) {
      continue;
    }
    if (caps[i].types.length && caps[i].types.indexOf(type) === -1) {
      return false;
    }
    if (caps[i].idPrefixes.length) {
      var value = String(id || '');
      for (var p = 0; p < caps[i].idPrefixes.length; p++) {
        if (value.indexOf(caps[i].idPrefixes[p]) === 0) {
          return true;
        }
      }
      return false;
    }
    return true;
  }
  return false;
}

export function listAddons() {
  var list = getItem(KEY, []);
  return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
}

function persist(list) {
  setItem(KEY, list);
}

export function hasAddon(url) {
  var base = normalizeBase(url);
  var list = listAddons();
  for (var i = 0; i < list.length; i++) {
    if (list[i].url === base) {
      return true;
    }
  }
  return false;
}

/** Validates the manifest before anything is stored. */
export function addAddon(url, cb) {
  var base = normalizeBase(url);
  if (!base) {
    var invalidUrl = new Error('invalid add-on url');
    invalidUrl.reason = 'invalidUrl';
    cb(invalidUrl);
    return;
  }
  if (hasAddon(base)) {
    cb(null, null, true); // already installed
    return;
  }
  addonClient.manifest(base, function (err, manifest) {
    if (err) {
      cb(err);
      return;
    }
    if (!manifest || !manifest.id) {
      var notAddon = new Error('not a Stremio add-on manifest');
      notAddon.reason = 'notAddon';
      cb(notAddon);
      return;
    }
    // Stream-only and subtitle-only add-ons are first-class: they carry no
    // catalogs at all. Anything with at least one declarable capability counts.
    var hasResources = !!manifest.resources && manifest.resources.length > 0;
    var hasCatalogs = !!manifest.catalogs && manifest.catalogs.length > 0;
    var hasTypes = !!manifest.types && manifest.types.length > 0;
    if (!hasResources && !hasCatalogs && !hasTypes) {
      var empty = new Error('manifest declares no resources, catalogs or types');
      empty.reason = 'manifest';
      cb(empty);
      return;
    }
    var entry = summarize(base, manifest);
    var list = listAddons();
    list.push(entry);
    persist(list);
    cb(null, entry, false);
  });
}

export function removeAddon(url, cb) {
  var base = normalizeBase(url);
  var list = listAddons();
  var kept = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].url !== base) {
      kept.push(list[i]);
    }
  }
  persist(kept);
  if (cb) {
    cb(null, kept.length !== list.length);
  }
}

/** Promise wrapper for tests/debug tooling (Runtime.evaluate awaitPromise). */
export function addAddonAsync(url) {
  return new Promise(function (resolve, reject) {
    addAddon(url, function (err, entry, already) {
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve({ added: !already, addon: entry });
      }
    });
  });
}

export function removeAddonAsync(url) {
  return new Promise(function (resolve) {
    removeAddon(url, function (err, removed) {
      resolve({ removed: !!removed });
    });
  });
}

/**
 * One-time metadata refresh for entries stored by earlier versions.
 *
 * v0.4.x kept only string-form `resources` and no `idPrefixes`, so an add-on
 * whose manifest declared `resources: [{ name: 'stream', … }]` was stored with
 * `resources: []` and could never be recognised as a stream provider (the TV
 * symptom: "no streams" with Emby Bridge/TorBox installed).
 *
 * Only metadata is merged into existing entries: the stored URL (and therefore
 * its configuration path and authentication) is never changed, nothing is
 * removed, and a failed refresh leaves the entry exactly as it was.
 */
export function refreshAddonMetadata(cb) {
  var list = listAddons();
  var stale = [];
  for (var i = 0; i < list.length; i++) {
    var entry = list[i];
    if (!entry || !entry.url) {
      continue;
    }
    var hasPrefixesField = typeof entry.idPrefixes !== 'undefined';
    var hasResources = !!entry.resources && entry.resources.length > 0;
    if (!hasPrefixesField || !hasResources) {
      stale.push(entry);
    }
  }
  if (!stale.length) {
    if (cb) {
      cb({ refreshed: 0, failed: 0, total: 0 });
    }
    return;
  }

  var index = 0;
  var refreshed = 0;
  var failed = 0;

  function next() {
    if (index >= stale.length) {
      if (cb) {
        cb({ refreshed: refreshed, failed: failed, total: stale.length });
      }
      return;
    }
    var target = stale[index];
    index += 1;
    addonClient.manifest(target.url, function (err, manifest) {
      if (err || !manifest || !manifest.id) {
        failed += 1;
        next();
        return;
      }
      var fresh = summarize(target.url, manifest);
      var current = listAddons();
      for (var j = 0; j < current.length; j++) {
        if (current[j].url !== target.url) {
          continue;
        }
        current[j].resources = fresh.resources;
        current[j].types = fresh.types;
        current[j].idPrefixes = fresh.idPrefixes;
        if (fresh.catalogs.length) {
          current[j].catalogs = fresh.catalogs;
        }
        current[j].name = fresh.name || current[j].name;
        current[j].version = fresh.version || current[j].version;
        current[j].description = fresh.description || current[j].description;
        current[j].logo = fresh.logo || current[j].logo;
      }
      persist(current);
      refreshed += 1;
      next();
    });
  }

  next();
}
