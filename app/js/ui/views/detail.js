/**
 * views/detail.js — full-screen details view (WuPlay details.png layout).
 *
 * Backdrop fills the stage, content sits in the left column under the rail.
 * Structure only: Play/Trailer/Watchlist/Mark-watched give feedback but do not
 * stream anything yet (Milestone 4). Episodes are display-only in this milestone.
 */

import { t } from '../../i18n/index.js';
import { getEpisodes } from '../../data/mock.js';
import { observeImage, forgetImage } from '../../platform/lazy.js';

var ACTION_DEFS = [
  { id: 'play', labelKey: 'details.play', primary: true },
  { id: 'trailer', labelKey: 'details.trailer' },
  { id: 'watchlist', labelKey: 'details.watchlist' },
  { id: 'watched', labelKey: 'details.markWatched' }
];

var PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>';

export function createDetails() {
  var root = document.createElement('div');
  root.className = 'details';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-focus-region', 'overlay');

  var bg = document.createElement('div');
  bg.className = 'details__bg';

  var scrim = document.createElement('div');
  scrim.className = 'details__scrim';

  var content = document.createElement('div');
  content.className = 'details__content';

  var title = document.createElement('h1');
  title.className = 'details__title';

  var meta = document.createElement('div');
  meta.className = 'details__meta';
  var metaDuration = document.createElement('span');
  var metaYear = document.createElement('span');
  var metaRating = document.createElement('span');
  metaRating.className = 'rating';
  var metaGenres = document.createElement('span');
  meta.appendChild(metaDuration);
  meta.appendChild(metaYear);
  meta.appendChild(metaRating);
  meta.appendChild(metaGenres);

  var desc = document.createElement('p');
  desc.className = 'details__desc';

  var cast = document.createElement('div');
  cast.className = 'details__cast';

  var actions = document.createElement('div');
  actions.className = 'details__actions';

  var buttonList = [];
  for (var i = 0; i < ACTION_DEFS.length; i++) {
    var def = ACTION_DEFS[i];
    var btn = document.createElement('div');
    btn.className = def.primary ? 'btn btn--primary' : 'btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('data-detail-action', def.id);

    if (def.primary) {
      var icon = document.createElement('span');
      icon.className = 'btn__icon';
      icon.innerHTML = PLAY_ICON;
      btn.appendChild(icon);
    }

    var label = document.createElement('span');
    btn.appendChild(label);

    actions.appendChild(btn);
    buttonList.push({ id: def.id, el: btn, label: label, labelKey: def.labelKey });
  }

  var section = document.createElement('h3');
  section.className = 'details__section';

  var episodes = document.createElement('div');
  episodes.className = 'episodes';

  var sourcesHeading = document.createElement('h3');
  sourcesHeading.className = 'details__section';
  sourcesHeading.setAttribute('data-detail-section', 'sources');

  var sources = document.createElement('div');
  sources.className = 'details__sources';

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(desc);
  content.appendChild(cast);
  content.appendChild(actions);
  content.appendChild(section);
  content.appendChild(episodes);
  content.appendChild(sourcesHeading);
  content.appendChild(sources);

  root.appendChild(bg);
  root.appendChild(scrim);
  root.appendChild(content);

  var currentItem = null;
  var currentLang = 'hr';
  var episodeImages = [];

  function renderText() {
    if (!currentItem) {
      return;
    }
    title.textContent = currentItem.title[currentLang] || currentItem.title.hr;
    metaDuration.textContent = currentItem.minutes + ' ' + t('unit.min');
    metaYear.textContent = String(currentItem.year);
    metaRating.textContent = currentItem.rating.toFixed(1);
    metaGenres.textContent = currentItem.genres[currentLang] || currentItem.genres.hr;
    desc.textContent = currentItem.description[currentLang] || currentItem.description.hr;
    cast.textContent = currentItem.cast.join(', ');
    section.textContent = t('details.episodes');
    sourcesHeading.textContent = t('details.sources');

    for (var i = 0; i < buttonList.length; i++) {
      var text = t(buttonList[i].labelKey);
      buttonList[i].label.textContent = text;
      buttonList[i].el.setAttribute('aria-label', text);
    }
  }

  function clearEpisodes() {
    for (var i = 0; i < episodeImages.length; i++) {
      forgetImage(episodeImages[i]);
    }
    episodeImages = [];
    while (episodes.firstChild) {
      episodes.removeChild(episodes.firstChild);
    }
  }

  function renderEpisodes() {
    clearEpisodes();
    var list = getEpisodes(currentItem);
    var hasEpisodes = list.length > 0;
    section.style.display = hasEpisodes ? '' : 'none';
    episodes.style.display = hasEpisodes ? 'flex' : 'none';

    for (var i = 0; i < list.length; i++) {
      var ep = list[i];

      var card = document.createElement('div');
      card.className = 'ep';

      var frame = document.createElement('div');
      frame.className = 'ep__frame';

      var img = document.createElement('img');
      img.className = 'card__img';
      img.setAttribute('data-src', ep.image);
      img.setAttribute('alt', '');
      img.setAttribute('draggable', 'false');
      frame.appendChild(img);

      var badge = document.createElement('span');
      badge.className = 'card__badge';
      badge.textContent = 'E' + ep.number;
      frame.appendChild(badge);

      var label = document.createElement('div');
      label.className = 'ep__label';
      label.textContent =
        (ep.title[currentLang] || ep.title.hr) + ' · ' + ep.minutes + ' ' + t('unit.min');

      card.appendChild(frame);
      card.appendChild(label);
      episodes.appendChild(card);
      observeImage(img);
      episodeImages.push(img);
    }
  }

  function setItem(item, lang) {
    currentItem = item;
    currentLang = lang || currentLang;
    bg.style.backgroundImage = 'url("' + item.image + '")';
    renderText();
    renderEpisodes();
  }

  function setLanguage(lang) {
    currentLang = lang;
    renderText();
    renderEpisodes();
  }

  /** Stream list for the current item (display only in this milestone). */
  function setStreams(list) {
    while (sources.firstChild) {
      sources.removeChild(sources.firstChild);
    }
    var streams = list || [];
    var visible = Math.min(streams.length, 4);
    sourcesHeading.style.display = visible > 0 ? '' : 'none';
    for (var i = 0; i < visible; i++) {
      var row = document.createElement('div');
      row.className = 'source-row';
      var label = streams[i].name || streams[i].title || streams[i].description || 'stream';
      var quality = streams[i].behaviorHints && streams[i].behaviorHints.filename;
      row.textContent = quality ? label + ' · ' + quality : String(label);
      sources.appendChild(row);
    }
  }

  return {
    el: root,
    buttons: buttonList,
    setItem: setItem,
    setLanguage: setLanguage,
    setStreams: setStreams,
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
