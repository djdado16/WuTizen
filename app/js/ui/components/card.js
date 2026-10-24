/**
 * card.js — poster or landscape card with lazy artwork, progress and badge.
 *
 * No caption is rendered for poster cards (matches the WuPlay home rows); the
 * human-readable title lives in the aria-label. Landscape cards carry a caption
 * because they represent an in-progress episode.
 */

import { observeImage } from '../../platform/lazy.js';

export function createCard(entry, variant, lang) {
  var item = entry.item || entry;

  var el = document.createElement('div');
  el.className = 'card card--' + variant;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '-1');
  el.setAttribute('data-item-id', item.id);

  var frame = document.createElement('div');
  frame.className = 'card__frame';

  var img = document.createElement('img');
  img.className = 'card__img';
  img.setAttribute('data-src', item.poster || item.image);
  img.setAttribute('alt', '');
  img.setAttribute('draggable', 'false');
  frame.appendChild(img);

  if (typeof entry.progress === 'number') {
    var progress = document.createElement('div');
    progress.className = 'card__progress';
    var fill = document.createElement('div');
    fill.className = 'card__progress-fill';
    fill.style.width = Math.round(entry.progress * 100) + '%';
    progress.appendChild(fill);
    frame.appendChild(progress);
  }

  if (entry.badge) {
    var badge = document.createElement('span');
    badge.className = 'card__badge';
    badge.textContent = entry.badge;
    frame.appendChild(badge);
  }

  el.appendChild(frame);

  var caption = null;
  if (variant === 'landscape') {
    caption = document.createElement('div');
    caption.className = 'card__title';
    el.appendChild(caption);
  }

  function updateLanguage(current) {
    var text = item.title[current] || item.title.hr;
    el.setAttribute('aria-label', text + ', ' + item.year);
    if (caption) {
      caption.textContent = text;
    }
  }

  updateLanguage(lang);
  observeImage(img);

  return { el: el, item: item, img: img, updateLanguage: updateLanguage };
}
