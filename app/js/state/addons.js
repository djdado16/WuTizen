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
  var raw = manifest.resources || [];
  for (var i = 0; i < raw.length; i++) {
    if (typeof raw[i] === 'string') {
      resources.push(raw[i]);
    }
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
  return {
    url: url,
    id: String(manifest.id || url),
    name: String(manifest.name || 'Add-on'),
    version: String(manifest.version || ''),
    description: String(manifest.description || ''),
    logo: manifest.logo ? String(manifest.logo) : '',
    resources: resources,
    catalogs: catalogs
  };
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
    cb(new Error('invalid add-on url'));
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
    if (!manifest || !manifest.id || !manifest.resources) {
      cb(new Error('not a Stremio add-on manifest'));
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
