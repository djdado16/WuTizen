/**
 * shelf.js — a titled, horizontally scrolling row of cards.
 *
 * Scrolling is page-based (translate3d on the track) rather than smooth
 * scrolling, because transform animation is composited on the TV SoC while
 * scrollLeft repaints. Geometry is measured from the DOM, so card size and
 * spacing live only in CSS.
 */

import { t } from '../../i18n/index.js';
import { createCard } from './card.js';

var FALLBACK_STEP = 254; // card width + margin, used until the DOM is measured

/**
 * @param {{row: {id: string, titleKey: string, items: Array}}} options
 */
export function createShelf(options) {
  var row = options.row;
  var cards = [];

  var el = document.createElement('section');
  el.className = 'shelf';
  el.setAttribute('data-shelf-id', row.id);
  el.setAttribute('data-focus-region', 'shelf:' + row.id);

  var head = document.createElement('div');
  head.className = 'shelf__head';

  var title = document.createElement('h2');
  title.className = 'shelf__title';

  var count = document.createElement('span');
  count.className = 'shelf__count';
  count.textContent = String(row.items.length);

  head.appendChild(title);
  head.appendChild(count);

  var viewport = document.createElement('div');
  viewport.className = 'shelf__viewport';

  var track = document.createElement('div');
  track.className = 'shelf__track';

  for (var i = 0; i < row.items.length; i++) {
    var card = createCard(row.items[i]);
    cards.push(card);
    track.appendChild(card.el);
  }

  viewport.appendChild(track);
  el.appendChild(head);
  el.appendChild(viewport);

  var startIndex = 0;
  var step = FALLBACK_STEP;
  var visible = 1;

  function measure() {
    if (cards.length === 0) {
      return;
    }
    var first = cards[0].el;
    var width = first.offsetWidth;
    if (cards.length > 1) {
      var delta = cards[1].el.offsetLeft - first.offsetLeft;
      step = delta > 0 ? delta : width + 26;
    } else {
      step = width + 26;
    }
    if (!step || step < 1) {
      step = FALLBACK_STEP;
    }
    // The viewport carries padding (see layout.css) so the scaled focused card
    // is not clipped; subtract it when deciding how many cards fit.
    var style = window.getComputedStyle(viewport);
    var paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var available = Math.max(1, viewport.clientWidth - paddingX);
    visible = Math.max(1, Math.floor(available / step));
  }

  function applyScroll() {
    track.style.transform = 'translate3d(' + (-startIndex * step) + 'px, 0, 0)';
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

  /** Keep the focused card fully inside the viewport. */
  function reveal(element) {
    if (cards.length === 0) {
      return;
    }
    measure();
    var index = -1;
    for (var k = 0; k < cards.length; k++) {
      if (cards[k].el === element) {
        index = k;
        break;
      }
    }
    if (index < 0) {
      return;
    }
    if (index < startIndex) {
      setStart(index);
    } else if (index >= startIndex + visible) {
      setStart(index - visible + 1);
    }
  }

  function updateLanguage(lang) {
    title.textContent = t(row.titleKey);
    for (var m = 0; m < cards.length; m++) {
      cards[m].updateLanguage(lang);
    }
  }

  return {
    el: el,
    id: row.id,
    cards: cards,
    measure: measure,
    reveal: reveal,
    updateLanguage: updateLanguage,
    getStartIndex: function () {
      return startIndex;
    }
  };
}
