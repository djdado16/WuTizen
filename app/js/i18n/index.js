/**
 * i18n/index.js — translation lookup, language switching and static binding.
 *
 * Language is persisted in localStorage; Croatian is the default when nothing
 * has been stored. The original WuPlay export/profile data is never touched by
 * this module.
 */

import hr from './hr.js';
import en from './en.js';
import { getItem, setItem } from '../platform/storage.js';

var DICTS = { hr: hr, en: en };
var DEFAULT_LANGUAGE = 'hr';
var STORAGE_KEY = 'language';

var current = DEFAULT_LANGUAGE;
var listeners = [];

export function initLanguage() {
  var stored = getItem(STORAGE_KEY, null);
  if (stored && DICTS[stored]) {
    current = stored;
  }
  document.documentElement.setAttribute('lang', current);
  return current;
}

export function getLanguage() {
  return current;
}

export function setLanguage(lang) {
  if (!DICTS[lang] || lang === current) {
    return current;
  }
  current = lang;
  setItem(STORAGE_KEY, lang);
  document.documentElement.setAttribute('lang', lang);
  for (var i = 0; i < listeners.length; i++) {
    listeners[i](current);
  }
  return current;
}

/** Croatian <-> English. */
export function toggleLanguage() {
  return setLanguage(current === 'hr' ? 'en' : 'hr');
}

export function onLanguageChange(fn) {
  listeners.push(fn);
}

/**
 * Translate a key. Falls back to the default language, then to the key itself,
 * so a missing translation is visible but never throws.
 */
export function t(key) {
  var dict = DICTS[current] || DICTS[DEFAULT_LANGUAGE];
  if (typeof dict[key] !== 'undefined') {
    return dict[key];
  }
  var fallback = DICTS[DEFAULT_LANGUAGE][key];
  return typeof fallback === 'undefined' ? key : fallback;
}

/**
 * Bind static markup: elements carrying data-i18n / data-i18n-aria /
 * data-i18n-title receive the current translation. Call again after a
 * language switch.
 */
export function applyStaticText(root) {
  var scope = root || document;

  var nodes = scope.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
  }

  var ariaNodes = scope.querySelectorAll('[data-i18n-aria]');
  for (var j = 0; j < ariaNodes.length; j++) {
    ariaNodes[j].setAttribute('aria-label', t(ariaNodes[j].getAttribute('data-i18n-aria')));
  }

  var titleNodes = scope.querySelectorAll('[data-i18n-title]');
  for (var k = 0; k < titleNodes.length; k++) {
    titleNodes[k].setAttribute('title', t(titleNodes[k].getAttribute('data-i18n-title')));
  }
}

/** Keys of a dictionary — used by the verification script. */
export function getDictionary(lang) {
  return DICTS[lang] || {};
}

export { DEFAULT_LANGUAGE };
