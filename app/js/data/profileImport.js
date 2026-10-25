/**
 * data/profileImport.js — tolerant, redacting parser for a WuPlay profile export.
 *
 * The export format is not published, so this parser does NOT assume field names:
 * it walks the JSON and recognises (a) HTTP(S) add-on URLs, (b) profile names,
 * (c) list/watchlist array sizes. Everything else is ignored.
 *
 * Security: the raw export is never stored, logged or returned. Only normalised
 * add-on base URLs (needed to install them) and host names (for the summary)
 * leave this module — tokens embedded in add-on URLs stay in memory only.
 */

import { normalizeBase } from './addonClient.js';

var MAX_DEPTH = 6;
var MAX_NODES = 5000;
var MAX_ADDONS = 20;
var MAX_PROFILES = 8;

var ADDON_KEY = /^(transportUrl|transport_url|addonUrl|addon_url|manifestUrl|manifest_url|url|uri|src)$/i;
var MEDIA_KEY = /(logo|poster|background|image|avatar|icon|banner)/i;
var PROFILE_KEY = /^(profiles?|users?)$/i;
var LIST_KEY = /(lists?|watchlist|watchLater|bookmarks|favorites|library|history|continueWatching)/i;
/** Add-on transports in an export: https, but also Stremio's own scheme. */
var ADDON_URL = /^(?:https?|stremio):\/\//i;

export function parseProfile(input) {
  var data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (err) {
      return { ok: false, error: 'invalid JSON' };
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'not a profile object' };
  }

  var addonUrls = [];
  var seen = {};
  var profiles = [];
  var lists = 0;
  var nodes = 0;
  var skippedTooMany = 0;

  function addAddon(url) {
    if (addonUrls.length >= MAX_ADDONS) {
      skippedTooMany += 1;
      return;
    }
    if (!seen[url]) {
      seen[url] = true;
      addonUrls.push(url);
    }
  }

  function addProfile(name) {
    var clean = String(name).trim().slice(0, 40);
    if (clean && profiles.indexOf(clean) === -1 && profiles.length < MAX_PROFILES) {
      profiles.push(clean);
    }
  }

  function walk(node, depth) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (nodes++ > MAX_NODES || depth > MAX_DEPTH) {
      return;
    }
    if (Object.prototype.toString.call(node) === '[object Array]') {
      for (var i = 0; i < node.length; i++) {
        walk(node[i], depth + 1);
      }
      return;
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) {
        continue;
      }
      var value = node[key];
      if (typeof value === 'string') {
        var text = value.trim();
        if (!MEDIA_KEY.test(key) && ADDON_URL.test(text)) {
          var base = normalizeBase(text);
          if (base && (ADDON_KEY.test(key) || /\/manifest\.json(?:[?#]|$)/i.test(text))) {
            addAddon(base);
          }
        }
      } else if (value && typeof value === 'object') {
        if (Object.prototype.toString.call(value) === '[object Array]') {
          if (LIST_KEY.test(key)) {
            lists += value.length;
          }
          if (PROFILE_KEY.test(key)) {
            for (var p = 0; p < value.length; p++) {
              if (value[p] && (value[p].name || value[p].title)) {
                addProfile(value[p].name || value[p].title);
              }
            }
          }
        } else if (PROFILE_KEY.test(key) && (value.name || value.title)) {
          addProfile(value.name || value.title);
        }
        walk(value, depth + 1);
      }
    }
  }

  walk(data, 0);

  return {
    ok: true,
    addons: addonUrls,
    profiles: profiles,
    lists: lists,
    truncated: skippedTooMany
  };
}

/** Host-only summary (never the full add-on URL). */
export function summarizeImport(parsed, imported, skipped, failures) {
  var hosts = [];
  for (var i = 0; i < parsed.addons.length; i++) {
    var match = /^https?:\/\/[^/]+/i.exec(parsed.addons[i]);
    if (match && hosts.indexOf(match[0]) === -1) {
      hosts.push(match[0]);
    }
  }
  return {
    importedAt: Date.now(),
    addonHosts: hosts,
    profiles: parsed.profiles,
    lists: parsed.lists,
    imported: imported,
    skipped: skipped,
    // Host + reason only: enough to see *which* add-on was skipped without
    // storing its path, configuration or token.
    failures: (failures || []).slice(0, 8)
  };
}

/** Host of an add-on URL (for failure descriptions). */
export function hostOfUrl(url) {
  var match = /^https?:\/\/[^/]+/i.exec(String(url || ''));
  return match ? match[0] : '(no host)';
}
