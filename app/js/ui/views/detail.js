/**
 * views/detail.js — Milestone 0 detail overlay.
 *
 * Structure only: no streams, no playback, no metadata fetching. It exists to
 * prove the router + focus-scope behaviour (Enter opens, BACK closes and focus
 * returns to the card that opened it).
 */

import { t } from '../../i18n/index.js';

export function createDetailOverlay() {
  var el = document.createElement('div');
  el.className = 'overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('data-focus-region', 'overlay');

  var panel = document.createElement('div');
  panel.className = 'detail';

  var body = document.createElement('div');
  body.className = 'detail__body';

  var poster = document.createElement('div');
  poster.className = 'detail__poster';

  var text = document.createElement('div');
  text.className = 'detail__text';

  var badge = document.createElement('span');
  badge.className = 'detail__badge';
  badge.setAttribute('data-detail-badge', '1');

  var title = document.createElement('h2');
  title.className = 'detail__title';

  var meta = document.createElement('div');
  meta.className = 'detail__meta';

  var hint = document.createElement('p');
  hint.className = 'detail__hint';

  var actions = document.createElement('div');
  actions.className = 'detail__actions';

  var backButton = document.createElement('div');
  backButton.className = 'btn';
  backButton.setAttribute('role', 'button');
  backButton.setAttribute('data-detail-back', '1');

  var backLabel = document.createElement('span');
  backButton.appendChild(backLabel);
  actions.appendChild(backButton);

  text.appendChild(badge);
  text.appendChild(title);
  text.appendChild(meta);
  text.appendChild(hint);
  text.appendChild(actions);

  body.appendChild(poster);
  body.appendChild(text);
  panel.appendChild(body);
  el.appendChild(panel);

  var currentItem = null;
  var currentLang = 'hr';

  function render() {
    badge.textContent = t('detail.badge');
    hint.textContent = t('detail.hint');
    backLabel.textContent = t('detail.back');
    if (currentItem) {
      poster.className = 'detail__poster poster--' + (currentItem.palette || 1);
      title.textContent = currentItem.title[currentLang] || currentItem.title.hr;
      meta.textContent = t('detail.meta') + ': ' + currentItem.year;
      backButton.setAttribute('aria-label', t('detail.back'));
    }
  }

  function setLanguage(lang) {
    currentLang = lang;
    render();
  }

  return {
    el: el,
    backButton: backButton,
    isOpen: function () {
      return el.classList.contains('is-open');
    },
    setItem: function (item, lang) {
      currentItem = item;
      currentLang = lang || currentLang;
      render();
    },
    setLanguage: setLanguage
  };
}
