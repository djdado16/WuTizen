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

  // Loading / per-add-on status for the source list (hosts only, never URLs).
  var sourcesInfo = document.createElement('div');
  sourcesInfo.className = 'details__sourcesInfo';

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(desc);
  content.appendChild(cast);
  content.appendChild(actions);
  content.appendChild(section);
  content.appendChild(episodes);
  content.appendChild(sourcesHeading);
  content.appendChild(sourcesInfo);
  content.appendChild(sources);

  root.appendChild(bg);
  root.appendChild(scrim);
  root.appendChild(content);

  var currentItem = null;
  var currentLang = 'hr';
  var episodeImages = [];
  var episodeCards = [];
  var sourceRowList = [];
  var streamList = [];

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
    episodeCards = [];
    while (episodes.firstChild) {
      episodes.removeChild(episodes.firstChild);
    }
  }

  function renderEpisodes() {
    clearEpisodes();
    var cards = [];
    var reals = currentItem && currentItem.videos && currentItem.videos.length ? currentItem.videos : null;
    if (reals) {
      // Real series metadata from the add-on: one card per video (episode).
      for (var r = 0; r < reals.length && r < 24; r++) {
        var video = reals[r];
        var fallback = 'S' + video.season + ' E' + video.episode;
        cards.push({
          id: video.id,
          number: video.episode,
          season: video.season,
          label: { hr: video.name || fallback, en: video.name || fallback },
          minutes: 0,
          image: video.thumbnail
        });
      }
    } else {
      var mockList = getEpisodes(currentItem);
      for (var m = 0; m < mockList.length; m++) {
        cards.push({
          id: '',
          number: mockList[m].number,
          season: 0,
          label: mockList[m].title,
          minutes: mockList[m].minutes,
          image: mockList[m].image
        });
      }
    }

    var hasEpisodes = cards.length > 0;
    section.style.display = hasEpisodes ? '' : 'none';
    episodes.style.display = hasEpisodes ? 'flex' : 'none';

    for (var i = 0; i < cards.length; i++) {
      var ep = cards[i];

      var card = document.createElement('div');
      card.className = 'ep';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '-1');
      card.setAttribute('data-episode-id', ep.id || '');
      card.setAttribute('data-episode-number', String(ep.number || 0));

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
      badge.textContent = ep.season > 0 ? 'S' + ep.season + 'E' + ep.number : 'E' + ep.number;
      frame.appendChild(badge);

      var label = document.createElement('div');
      label.className = 'ep__label';
      var text = ep.label[currentLang] || ep.label.hr;
      label.textContent = ep.minutes > 0 ? text + ' · ' + ep.minutes + ' ' + t('unit.min') : text;

      card.appendChild(frame);
      card.appendChild(label);
      episodes.appendChild(card);
      observeImage(img);
      episodeImages.push(img);
      episodeCards.push({ el: card, videoId: ep.id || '', label: text });
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
  function describeStream(stream) {
    var label = String(stream.name || stream.title || stream.description || 'stream');
    var filename =
      stream.behaviorHints && stream.behaviorHints.filename
        ? String(stream.behaviorHints.filename)
        : '';
    var haystack = label + ' ' + String(stream.description || '') + ' ' + filename;
    var quality = /(2160p|1080p|720p|480p|\b4k\b|\bhdr\b|\buhd\b)/i.exec(haystack);
    var language = /\b(hr|sr|bs|sl|en|de|fr|es|it|pl|ru|tr)\b/i.exec(haystack);
    var parts = [label];
    if (quality) {
      parts.push(quality[1].toUpperCase());
    }
    if (language) {
      parts.push(language[1].toUpperCase());
    }
    return parts.join(' · ');
  }

  /** Short, redacted reason for a provider that did not answer with sources. */
  function reasonLabel(reason) {
    if (reason === 'auth') {
      return t('import.auth');
    }
    if (reason === 'notFound') {
      return t('import.notFound');
    }
    if (reason === 'server') {
      return t('import.server');
    }
    if (reason === 'timeout') {
      return t('import.timeout');
    }
    if (reason === 'notAddon') {
      return t('import.notAddon');
    }
    return t('import.unreachable');
  }

  /**
   * Stream list for the current item. Rows are focusable: activating one plays
   * that stream (main.js registers them). Kept to 8 rows so the details screen
   * stays navigable with a remote.
   */
  function setStreams(list, settled, report) {
    while (sources.firstChild) {
      sources.removeChild(sources.firstChild);
    }
    while (sourcesInfo.firstChild) {
      sourcesInfo.removeChild(sourcesInfo.firstChild);
    }
    sourceRowList = [];
    streamList = list || [];
    var visible = Math.min(streamList.length, 8);
    var isReal = !!(currentItem && currentItem.addonUrl);
    var providers = (report && report.providers) || [];
    sourcesHeading.style.display = visible > 0 || (isReal && settled === true) ? '' : 'none';

    if (settled === true && isReal) {
      var summary = document.createElement('div');
      summary.className = 'details__sourceSummary';
      if (visible > 0) {
        var answered = 0;
        for (var a = 0; a < providers.length; a++) {
          if (providers[a].status === 'ok') {
            answered += 1;
          }
        }
        summary.textContent =
          streamList.length + ' ' + t('details.sourcesFrom') + ' ' + answered + '/' + providers.length;
      } else {
        summary.textContent = t('player.noSources');
      }
      sourcesInfo.appendChild(summary);

      // Which add-on failed and why — distinguishable from "returned nothing".
      for (var p = 0; p < providers.length && p < 4; p++) {
        var provider = providers[p];
        if (provider.status === 'ok') {
          continue;
        }
        var line = document.createElement('div');
        line.className = 'details__provider is-' + provider.status;
        var label = provider.name + ' (' + provider.host + ')';
        line.textContent =
          label + ' · ' + (provider.status === 'empty' ? t('details.providerEmpty') : reasonLabel(provider.reason));
        sourcesInfo.appendChild(line);
      }
    }

    if (visible === 0) {
      return;
    }

    for (var i = 0; i < visible; i++) {
      var row = document.createElement('div');
      row.className = 'source-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '-1');
      row.setAttribute('data-stream-index', String(i));
      row.textContent = describeStream(streamList[i] || {});
      sources.appendChild(row);
      sourceRowList.push({ el: row, stream: streamList[i] || {}, index: i });
    }
  }

  /** 'loading' while providers are being asked, '' to clear. */
  function setSourcesStatus(state) {
    while (sourcesInfo.firstChild) {
      sourcesInfo.removeChild(sourcesInfo.firstChild);
    }
    sourcesHeading.style.display = '';
    if (state === 'loading') {
      var line = document.createElement('div');
      line.className = 'details__sourceSummary';
      line.textContent = t('details.loadingSources');
      sourcesInfo.appendChild(line);
    }
  }

  return {
    el: root,
    buttons: buttonList,
    setItem: setItem,
    setLanguage: setLanguage,
    setStreams: setStreams,
    setSourcesStatus: setSourcesStatus,
    title: function () {
      if (!currentItem) {
        return '';
      }
      return currentItem.title[currentLang] || currentItem.title.hr;
    },
    currentItem: function () {
      return currentItem;
    },
    sourceRows: function () {
      return sourceRowList;
    },
    /** Every stream returned by the providers (the picker lists all of them). */
    allStreams: function () {
      return streamList.slice(0);
    },
    episodeCards: function () {
      return episodeCards;
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
