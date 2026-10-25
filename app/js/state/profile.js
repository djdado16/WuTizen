/**
 * state/profile.js — summary of the last WuPlay profile import.
 *
 * Stores only: import time, add-on HOSTS (never full URLs), profile names, list
 * count and import statistics. The raw export and any tokens are never persisted.
 */

import { getItem, setItem } from '../platform/storage.js';

var KEY = 'profile';

export function saveProfileSummary(summary) {
  return setItem(KEY, summary);
}

export function getProfileSummary() {
  return getItem(KEY, null);
}

export function clearProfileSummary() {
  setItem(KEY, null);
}
