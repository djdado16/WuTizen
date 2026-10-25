/**
 * state/lists.js — local "My Stuff" lists (watchlist / watched).
 *
 * Items store only what is needed to render and re-open them by id: no add-on
 * URLs, tokens or stream links are ever written (a configured add-on URL can
 * carry credentials).
 */

import { getItem, setItem } from '../platform/storage.js';

var KEY = 'lists';
var BUILTIN = [
  { id: 'watchlist', nameKey: 'lists.watchlist' },
  { id: 'watched', nameKey: 'lists.watched' }
];

function normalize(raw) {
  var data = raw && typeof raw === 'object' ? raw : {};
  var lists = Object.prototype.toString.call(data) === '[object Array]' ? data : [];
  return lists;
}

export function allLists() {
  var stored = normalize(getItem(KEY, []));
  if (!stored.length) {
    return BUILTIN.map(function (def) {
      return { id: def.id, nameKey: def.nameKey, items: [] };
    });
  }
  return stored;
}

function persist(lists) {
  setItem(KEY, lists);
}

export function listById(id) {
  var lists = allLists();
  for (var i = 0; i < lists.length; i++) {
    if (lists[i].id === id) {
      return lists[i];
    }
  }
  return null;
}

/** Minimal, privacy-safe snapshot of an item for a list. */
export function itemSnapshot(item) {
  if (!item) {
    return null;
  }
  var title = item.title || { hr: '', en: '' };
  return {
    id: String(item.id || ''),
    kind: String(item.kind || 'movie'),
    title: String(title.hr || title.en || ''),
    year: parseInt(item.year, 10) || 0,
    poster: String(item.poster || item.image || '').slice(0, 400)
  };
}

export function hasItem(listId, itemId) {
  var list = listById(listId);
  if (!list) {
    return false;
  }
  for (var i = 0; i < list.items.length; i++) {
    if (list.items[i].id === String(itemId)) {
      return true;
    }
  }
  return false;
}

export function addItem(listId, item) {
  var snapshot = itemSnapshot(item);
  if (!snapshot || !snapshot.id) {
    return false;
  }
  var lists = allLists();
  for (var i = 0; i < lists.length; i++) {
    if (lists[i].id !== listId) {
      continue;
    }
    if (hasItem(listId, snapshot.id)) {
      return false;
    }
    lists[i].items = lists[i].items || [];
    lists[i].items.unshift(snapshot); // newest first
    persist(lists);
    return true;
  }
  return false;
}

export function removeItem(listId, itemId) {
  var lists = allLists();
  for (var i = 0; i < lists.length; i++) {
    if (lists[i].id !== listId) {
      continue;
    }
    var kept = [];
    var removed = false;
    var items = lists[i].items || [];
    for (var j = 0; j < items.length; j++) {
      if (items[j].id === String(itemId)) {
        removed = true;
      } else {
        kept.push(items[j]);
      }
    }
    lists[i].items = kept;
    persist(lists);
    return removed;
  }
  return false;
}

/** Total number of stored list items (Home/footer counter). */
export function listItemCount() {
  var lists = allLists();
  var total = 0;
  for (var i = 0; i < lists.length; i++) {
    total += (lists[i].items || []).length;
  }
  return total;
}
