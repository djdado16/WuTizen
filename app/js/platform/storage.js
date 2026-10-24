/**
 * platform/storage.js — namespaced localStorage access.
 *
 * Tizen 5.0 web apps get a normal localStorage (5 MB per origin). Access is
 * wrapped because the TV can report quota errors, and a failed write must never
 * crash the UI.
 *
 * Milestone 0 stores only the interface language. Profile data, add-on URLs and
 * credentials are NOT stored here yet; when they are (Milestone 3), they will
 * live behind an explicit opt-in and never inside the repository.
 */

var PREFIX = 'wuplay.';

export function getItem(key, fallback) {
  try {
    var raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null || typeof raw === 'undefined') {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}
