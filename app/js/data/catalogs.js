/**
 * data/catalogs.js — turns Stremio meta objects into the internal item shape.
 *
 * Meta fields are optional in the protocol, so every value is defaulted; a
 * missing poster keeps the neutral placeholder, never a broken image.
 */

import { addonClient } from './addonClient.js';

export function normalizeMeta(meta, addonUrl) {
  var source = meta || {};
  var title = String(source.name || source.id || 'Untitled');
  var yearMatch = /(\d{4})/.exec(String(source.releaseInfo || source.year || ''));
  var minutes = 0;
  var runtimeMatch = /(\d+)/.exec(String(source.runtime || ''));
  if (runtimeMatch) {
    minutes = parseInt(runtimeMatch[1], 10);
  }
  var genres = '';
  if (source.genres && source.genres.length) {
    genres = source.genres.slice(0, 3).join(' | ');
  } else if (source.genre) {
    genres = String(source.genre);
  }
  var poster = source.poster ? String(source.poster) : '';
  return {
    id: String(source.id || title),
    mock: false,
    addonUrl: addonUrl || '',
    kind: String(source.type || 'movie'),
    title: { hr: title, en: title },
    year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
    minutes: minutes,
    rating: parseFloat(source.imdbRating || source.rating || 0) || 0,
    genres: { hr: genres, en: genres },
    description: { hr: String(source.description || ''), en: String(source.description || '') },
    cast: source.cast && source.cast.length ? source.cast.slice(0, 3) : [],
    poster: poster,
    image: source.background ? String(source.background) : poster
  };
}

/** Fetch one catalog page. cb(error, items[]). */
export function fetchCatalogPage(addon, catalog, skip, cb) {
  addonClient.catalog(addon.url, catalog.type, catalog.id, skip || 0, function (err, data) {
    if (err) {
      cb(err);
      return;
    }
    var metas = data && data.metas ? data.metas : [];
    var items = [];
    for (var i = 0; i < metas.length; i++) {
      if (metas[i] && metas[i].id) {
        items.push(normalizeMeta(metas[i], addon.url));
      }
    }
    cb(null, items);
  });
}

/** First page of every catalog of every installed add-on (bounded). */
export function loadCatalogRows(addons, maxAddons, maxCatalogs, done) {
  var rows = [];
  var pending = 0;
  var startCount = 0;

  for (var a = 0; a < addons.length && a < maxAddons; a++) {
    var catalogs = addons[a].catalogs || [];
    for (var c = 0; c < catalogs.length && c < maxCatalogs; c++) {
      startCount += 1;
      pending += 1;
      (function (addon, catalog) {
        fetchCatalogPage(addon, catalog, 0, function (err, items) {
          pending -= 1;
          if (!err && items.length) {
            rows.push({ addon: addon, catalog: catalog, items: items });
          }
          if (pending === 0) {
            done(rows, startCount);
          }
        });
      })(addons[a], catalogs[c]);
    }
  }

  if (startCount === 0) {
    done(rows, 0);
  }
}
