/**
 * shelf.js — a titled, horizontally paged row of cards.
 *
 * Performance: cards are rendered in windows (8 first, then 8 at a time as
 * focus approaches the end) so a long catalogue never builds the full DOM.
 * Paging is a translate3d on the track, measured from the live DOM so card
 * size and spacing live only in CSS.
 */

import { t } from '../../i18n/index.js';
import { createCard } from './card.js';

var INITIAL_CARDS = 8;
var CHUNK = 8;
var FALLBACK_STEP = 300;

export function createShelf(options) {
  var row = options.row;
  var lang = options.language;
  var variant = row.variant || 'poster';
  var cards = [];

  var el = document.createElement('section');
  el.className = 'row';
  el.setAttribute('data-shelf-id', row.id);
  el.setAttribute('data-focus-region', 'row:' + row.id);

  var title = document.createElement('h2');
  title.className = 'row__title';

  var viewport = document.createElement('div');
  viewport.className = 'row__viewport';

  var track = document.createElement('div');
  track.className = 'row__track';

  viewport.appendChild(track);
  el.appendChild(title);
  el.appendChild(viewport);

  var startIndex = 0;
  var step = FALLBACK_STEP;
  var visible = 1;

  function appendCards(count) {
    var from = cards.length;
    var to = Math.min(row.items.length, from + count);
    for (var i = from; i < to; i++) {
      var card = createCard(row.items[i], variant, lang);
      cards.push(card);
      track.appendChild(card.el);
      if (typeof options.onCard === 'function') {
        options.onCard(card, api);
      }
    }
  }

  function measure() {
    if (cards.length === 0) {
      return;
    }
    var first = cards[0].el;
    if (cards.length > 1) {
      var delta = cards[1].el.offsetLeft - first.offsetLeft;
      step = delta > 0 ? delta : FALLBACK_STEP;
    } else {
      step = first.offsetWidth + 28;
    }
    var style = window.getComputedStyle(viewport);
    var padding =
      (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var available = Math.max(1, viewport.clientWidth - padding);
    visible = Math.max(1, Math.floor(available / step));
  }

  function applyScroll() {
    track.style.transform = 'translate3d(' + -startIndex * step + 'px, 0, 0)';
  }

  function setStart(next) {
    var maxStart = Math.max(0, cards.length - visible);
    var clamped = Math.max(0, Math.min(next, maxStart));
    if (clamped === startIndex) {
      return;
    }
    startIndex = clamped;
    applyScroll();
  }

  function indexOf(element) {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].el === element) {
        return i;
      }
    }
    return -1;
  }

  /** Extend the rendered window when focus approaches its end. */
  function ensureWindow(index) {
    if (index < cards.length - 2) {
      return;
    }
    if (cards.length >= row.items.length) {
      if (typeof options.onEndReached === 'function') {
        options.onEndReached(api);
      }
      return;
    }
    appendCards(CHUNK);
    measure();
  }

  function reveal(element) {
    measure();
    var index = indexOf(element);
    if (index < 0) {
      return;
    }
    ensureWindow(index + 1);
    if (index < startIndex) {
      setStart(index);
    } else if (index >= startIndex + visible) {
      setStart(index - visible + 1);
    }
  }

  function updateLanguage(current) {
    title.textContent = row.titleText || (row.titleKey ? t(row.titleKey) : '');
    for (var i = 0; i < cards.length; i++) {
      cards[i].updateLanguage(current);
    }
  }

  /** Append a further page of items (used by add-on pagination). */
  function appendItems(items) {
    if (!items || !items.length) {
      return;
    }
    row.items = row.items.concat(items);
    appendCards(CHUNK);
    measure();
  }

  var api = {
    el: el,
    id: row.id,
    row: row,
    cards: cards,
    measure: measure,
    reveal: reveal,
    updateLanguage: updateLanguage,
    appendItems: appendItems
  };

  appendCards(INITIAL_CARDS);
  updateLanguage(lang);

  return api;
}
