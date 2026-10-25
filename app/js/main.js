/**
 * main.js — application entry point.
 *
 * Owns: shell composition (rail / hero / rows / details), the focus manager,
 * the router, vertical + horizontal scrolling, language switching, playback
 * (Milestone 5) and the read-only debug snapshot used by the smoke test.
 */

import { actionFromEvent, isMediaAction } from './core/keys.js';
import { FocusManager } from './core/focus.js';
import { createRouter } from './core/router.js';
import { logInfo, logError } from './core/log.js';
import {
  initLanguage,
  getLanguage,
  t,
  toggleLanguage,
  onLanguageChange,
  applyStaticText
} from './i18n/index.js';
import { platform } from './platform/tizen.js';
import { lazyStats } from './platform/lazy.js';
import { ROWS, getHero } from './data/mock.js';
import { createRail } from './ui/components/rail.js';
import { createShelf } from './ui/components/shelf.js';
import { createHero } from './ui/components/hero.js';
import { createToast } from './ui/components/toast.js';
import { createDetails } from './ui/views/detail.js';
import { createAddonsView } from './ui/views/addons.js';
import { addonClient, diagnosticsList, clearDiagnostics, describeFailure } from './data/addonClient.js';
import { createDiagnosticsView } from './ui/views/diagnostics.js';
import { createSettingsView } from './ui/views/settings.js';
import { parseProfile, summarizeImport } from './data/profileImport.js';
import { saveProfileSummary, getProfileSummary } from './state/profile.js';
import { normalizeMeta, fetchCatalogPage, loadCatalogRows } from './data/catalogs.js';
import { resolveStreams, streamProviders } from './data/streamResolver.js';
import { createPlayer } from './playback/player.js';
import { classifyStream } from './playback/sources.js';
import {
  listAddons,
  addAddon,
  removeAddon,
  addAddonAsync,
  removeAddonAsync
} from './state/addons.js';

var STAGE_WIDTH = 1920;
var STAGE_HEIGHT = 1080;
var SCROLL_PAD = 24;
var RAIL_PUSH = 150;

var PROFILE_ITEM = { id: 'profile', labelKey: 'nav.profile', icon: 'profile', profile: true };

var RAIL_ITEMS = [
  { id: 'search', labelKey: 'nav.search', icon: 'search' },
  { id: 'home', labelKey: 'nav.home', icon: 'home', active: true },
  { id: 'catalog', labelKey: 'nav.catalog', icon: 'compass' },
  { id: 'lists', labelKey: 'nav.lists', icon: 'bookmark' },
  { id: 'addons', labelKey: 'nav.addons', icon: 'addons' },
  { id: 'language', labelKey: 'nav.language', icon: 'globe', dynamic: 'language', bottom: true },
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings', bottom: true }
];

function boot() {
  var appEl = document.getElementById('app');
  var stageEl = document.getElementById('stage');

  initLanguage();
  var platformInfo = platform.init();
  logInfo('boot', platformInfo);

  var focusManager = new FocusManager({ onFocus: onFocusChanged });
  var router = createRouter();
  var toast = createToast();
  var shelves = [];
  var previousFocus = null;
  var scrollY = 0;
  var railPush = 0;

  /* ---- rail ------------------------------------------------------------ */
  var rail = createRail({ profile: PROFILE_ITEM, items: RAIL_ITEMS, language: getLanguage() });
  appEl.appendChild(rail.el);

  /* ---- hero + rows (one vertically scrolling layer) -------------------- */
  var scroller = document.createElement('div');
  scroller.className = 'scroller';

  var hero = createHero(getHero(), getLanguage());
  scroller.appendChild(hero.el);

  var rowsEl = document.createElement('div');
  rowsEl.className = 'rows';
  scroller.appendChild(rowsEl);
  appEl.appendChild(scroller);
  buildMockRows();

  /* ---- details view + toast -------------------------------------------- */
  var details = createDetails();
  appEl.appendChild(details.el);

  var addonsView = createAddonsView();
  appEl.appendChild(addonsView.el);

  var diagnosticsView = createDiagnosticsView();
  appEl.appendChild(diagnosticsView.el);

  var settingsView = createSettingsView();
  appEl.appendChild(settingsView.el);

  var player = createPlayer();
  appEl.appendChild(player.el);

  appEl.appendChild(toast.el);

  /* ---- focus behaviour ------------------------------------------------- */
  function applyScroller() {
    scroller.style.transform = 'translate3d(' + railPush + 'px,' + -scrollY + 'px,0)';
  }

  /** Content slides right while the rail is expanded, so nothing is covered. */
  function setRailPush(px) {
    if (railPush === px) {
      return;
    }
    railPush = px;
    applyScroller();
  }

  function scrollToRow(row) {
    if (row === rowsEl.firstElementChild) {
      scrollY = 0; // returning to the first row also brings the hero back
    } else {
      var top = row.offsetTop;
      var height = row.offsetHeight;
      if (top - SCROLL_PAD < scrollY) {
        scrollY = top - SCROLL_PAD;
      } else if (top + height + SCROLL_PAD > scrollY + STAGE_HEIGHT) {
        scrollY = top + height + SCROLL_PAD - STAGE_HEIGHT;
      }
    }
    if (scrollY < 0) {
      scrollY = 0;
    }
    applyScroller();
  }

  /* The <input> that currently owns real DOM focus — on Tizen that is exactly
     the condition that keeps the on-screen keyboard attached. It must be
     released explicitly (blur) as soon as the remote moves on: leaving DOM
     focus on the field is what made the Samsung IME re-open on every OK press
     instead of activating the Import button. */
  var imeField = null;

  function releaseIme() {
    var field = imeField;
    if (!field) {
      return false;
    }
    imeField = null;
    try {
      field.blur(); // closes the TV keyboard
    } catch (err) {
      /* ignored */
    }
    return true;
  }

  function onFocusChanged(el) {
    var inRail = !!el.closest('.rail');
    rail.setExpanded(inRail);
    setRailPush(inRail ? RAIL_PUSH : 0);
    if (typeof el.__reveal === 'function') {
      el.__reveal();
    }
    if (el.tagName === 'INPUT') {
      imeField = el;
      try {
        el.focus(); // let the TV IME attach to the URL field
      } catch (err) {
        /* ignored */
      }
    } else {
      releaseIme();
    }
    var row = el.closest('.row');
    if (row) {
      scrollToRow(row);
    }
  }

  /* ---- details screen -------------------------------------------------- */
  var detailsScreen = {
    name: 'details',
    show: function () {
      details.el.classList.add('is-open');
      focusManager.setScope(details.el);
      if (!focusManager.focus(details.buttons[0].el)) {
        focusManager.focusFirst();
      }
    },
    hide: function () {
      if (player.isOpen()) {
        player.close(false); // leaving details must never leave video running
      }
      details.el.classList.remove('is-open');
      unregisterList(streamFocusables);
      streamFocusables = [];
      unregisterList(episodeFocusables);
      episodeFocusables = [];
      focusManager.setScope(null);
      // Never leave the app without a focused element: a null cursor makes OK
      // do nothing and the remote feel dead.
      var restored = previousFocus ? focusManager.focus(previousFocus) : false;
      previousFocus = null;
      if (!restored) {
        focusManager.focusFirst();
      }
    }
  };

  function openDetails(item) {
    // One overlay at a time: an echoed/duplicated OK must not stack layers,
    // which is what forced several BACK presses to get back to the home screen.
    if (details.isOpen() || router.depth() > 0) {
      return;
    }
    previousFocus = focusManager.getCurrent();
    selectedVideoId = item.id;
    selectedVideoLabel = '';
    details.setItem(item, getLanguage());
    details.setStreams([]);
    syncEpisodeFocusables();
    syncStreamFocusables();
    router.push(detailsScreen);

    if (!item.addonUrl) {
      return;
    }
    var type = item.kind || 'movie';
    // Full metadata and stream list come from the add-on (read-only).
    addonClient.meta(item.addonUrl, type, item.id, function (err, data) {
      if (!err && data && data.meta && details.isOpen()) {
        details.setItem(normalizeMeta(data.meta, item.addonUrl), getLanguage());
        syncEpisodeFocusables();
      }
    });
    loadStreams(item.id, false);
  }

  /** Dismiss the top layer in one call, whatever the stack depth grew to. */
  function closeDetails() {
    while (router.depth() > 0) {
      router.pop();
    }
  }

  /* ---- playback (Milestone 5) -------------------------------------------
     Two engines: AVPlay when the shell exposes it, HTML5 <video> otherwise.
     Stream rows and episodes are ordinary focusables; the player itself is a
     modal that takes the remote, so BACK closes it without touching the details
     layer underneath and focus returns to the row that started playback. */

  var playerReturnFocus = null;
  var streamFocusables = [];
  var episodeFocusables = [];
  var selectedVideoId = '';
  var selectedVideoLabel = '';

  function playerTitle() {
    var item = details.currentItem();
    var parts = [];
    if (item) {
      parts.push(details.title());
    }
    if (selectedVideoLabel) {
      parts.push(selectedVideoLabel);
    }
    return parts.join(' · ');
  }

  /**
   * Plays one Stremio stream object. Refusals (torrent, external, unsupported)
   * still open the player: it explains *why* instead of failing silently.
   */
  function playStream(stream) {
    var info = classifyStream(stream);
    playerReturnFocus = focusManager.getCurrent();
    player.open(info, { title: playerTitle() });
    logInfo('playback: ' + (info.ok ? info.type : 'refused:' + info.reason));
    return info;
  }

  function firstPlayableStream() {
    var rows = details.sourceRows();
    for (var i = 0; i < rows.length; i++) {
      if (classifyStream(rows[i].stream).ok) {
        return rows[i].stream;
      }
    }
    return rows.length > 0 ? rows[0].stream : null;
  }

  /** Play button: first playable source of the current item/episode. */
  function playCurrent() {
    var item = details.currentItem();
    if (!item || !item.addonUrl) {
      toast.show(t('common.wip'));
      return;
    }
    var stream = firstPlayableStream();
    if (!stream) {
      player.open({ ok: false, reason: 'noUrl', url: '', type: '', label: '' }, {
        title: playerTitle()
      });
      return;
    }
    playStream(stream);
  }

  player.setOnClose(function () {
    focusManager.setScope(details.el);
    var restored = playerReturnFocus ? focusManager.focus(playerReturnFocus) : false;
    playerReturnFocus = null;
    if (!restored && details.sourceRows().length) {
      focusManager.focus(details.sourceRows()[0].el);
    }
  });

  /* ---- stream discovery (all providers, not just the catalog add-on) -----
     Emby Bridge / TorBox are stream-only add-ons, so the catalog add-on that
     produced the item usually answers nothing. Every installed add-on that
     advertises `stream` is asked, and the answers are merged. */

  function loadStreams(videoId, focusFirst) {
    var item = details.currentItem();
    if (!item || !item.addonUrl) {
      details.setStreams([], true, null);
      syncStreamFocusables();
      return;
    }
    details.setStreams([], false); // clear while loading
    details.setSourcesStatus('loading');
    syncStreamFocusables();
    resolveStreams(
      {
        item: item,
        type: item.kind || 'movie',
        videoId: videoId || '',
        addons: listAddons()
      },
      function (result) {
        if (!details.isOpen()) {
          return;
        }
        details.setStreams(result.streams, true, result);
        syncStreamFocusables();
        if (focusFirst && details.sourceRows().length) {
          focusManager.focus(details.sourceRows()[0].el);
        }
      }
    );
  }

  function unregisterList(list) {
    for (var i = 0; i < list.length; i++) {
      focusManager.unregister(list[i]);
    }
  }

  function syncStreamFocusables() {
    unregisterList(streamFocusables);
    streamFocusables = [];
    var rows = details.sourceRows();
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        focusManager.register(row.el, function () {
          playStream(row.stream);
        });
        streamFocusables.push(row.el);
      })(rows[i]);
    }
  }

  /* ---- episodes --------------------------------------------------------- */

  function syncEpisodeFocusables() {
    unregisterList(episodeFocusables);
    episodeFocusables = [];
    var cards = details.episodeCards();
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.el.__reveal = null;
        focusManager.register(card.el, function () {
          if (!card.videoId) {
            toast.show(t('details.mockEpisode'));
            return;
          }
          selectEpisode(card);
        });
        episodeFocusables.push(card.el);
      })(cards[i]);
    }
  }

  /** Episode picked: fetch that episode's sources and focus the first one. */
  function selectEpisode(card) {
    var item = details.currentItem();
    if (!item || !item.addonUrl) {
      return;
    }
    selectedVideoId = card.videoId;
    selectedVideoLabel = card.label || '';
    loadStreams(card.videoId, true);
  }

  /* ---- add-on manager screen -------------------------------------------- */
  var addonsReturnFocus = null;
  var addonFocusables = [];

  function unregisterAddonFocusables() {
    for (var i = 0; i < addonFocusables.length; i++) {
      focusManager.unregister(addonFocusables[i]);
    }
    addonFocusables = [];
  }

  function registerAddonFocusables() {
    unregisterAddonFocusables();
    var list = addonsView.focusables();
    for (var i = 0; i < list.length; i++) {
      addonFocusables.push(list[i].el);
      focusManager.register(list[i].el, list[i].activate);
    }
  }

  function refocusAddons() {
    registerAddonFocusables();
    var list = addonsView.focusables();
    if (list.length) {
      focusManager.focus(list[0].el);
    }
  }

  addonsView.setHandlers({
    onAdd: function (url) {
      addonsView.setStatus(t('common.loading'));
      addAddon(url, function (err, entry, already) {
        if (err) {
          addonsView.setStatus(t('addons.unreachable') + ' · ' + err.message, true);
          return;
        }
        addonsView.setStatus(already ? t('addons.installedTag') : t('addons.added'));
        addonsView.render();
        refocusAddons();
        loadAddonCatalogs();
      });
    },
    onRemove: function (url) {
      removeAddon(url);
      addonsView.setStatus(t('addons.removed'));
      addonsView.render();
      refocusAddons();
      loadAddonCatalogs();
    },
    onDiagnostics: openDiagnostics
  });

  var addonsScreen = {
    name: 'addons',
    show: function () {
      addonsView.el.classList.add('is-open');
      addonsView.render();
      addonsView.setStatus('');
      focusManager.setScope(addonsView.el);
      registerAddonFocusables();
      var list = addonsView.focusables();
      if (list.length) {
        focusManager.focus(list[0].el);
      } else {
        focusManager.focusFirst();
      }
    },
    hide: function () {
      addonsView.el.classList.remove('is-open');
      unregisterAddonFocusables();
      focusManager.setScope(null);
      var restored = addonsReturnFocus ? focusManager.focus(addonsReturnFocus) : false;
      addonsReturnFocus = null;
      if (!restored) {
        focusManager.focusFirst();
      }
    }
  };

  /* ---- settings screen (WuPlay profile import) -------------------------- */
  var settingsReturnFocus = null;
  var settingsFocusables = [];

  function unregisterSettings() {
    for (var i = 0; i < settingsFocusables.length; i++) {
      focusManager.unregister(settingsFocusables[i]);
    }
    settingsFocusables = [];
  }

  function registerSettings() {
    unregisterSettings();
    var list = settingsView.focusables();
    for (var i = 0; i < list.length; i++) {
      settingsFocusables.push(list[i].el);
      focusManager.register(list[i].el, list[i].activate);
    }
  }

  function openSettings() {
    settingsReturnFocus = focusManager.getCurrent();
    router.push(settingsScreen);
  }

  /**
   * Imports a parsed profile: installs its add-ons through the normal validated
   * path and stores only a host-level summary. Never stores the raw export.
   */
  function importProfile(input) {
    return new Promise(function (resolve, reject) {
      var parsed = parseProfile(input);
      if (!parsed.ok) {
        reject(new Error(parsed.error));
        return;
      }
      var urls = parsed.addons;
      var imported = 0;
      var skipped = 0;
      var failures = [];
      var index = 0;

      function next() {
        if (index >= urls.length) {
          saveProfileSummary(summarizeImport(parsed, imported, skipped, failures));
          loadAddonCatalogs();
          resolve({
            imported: imported,
            skipped: skipped,
            profiles: parsed.profiles.length,
            lists: parsed.lists,
            failures: failures.slice(0, 8)
          });
          return;
        }
        var url = urls[index];
        index += 1;
        addAddon(url, function (err) {
          if (err) {
            skipped += 1;
            // Host + reason only: never the URL, its path or its token.
            var failure = describeFailure(url, err);
            failures.push({ host: failure.host, reason: failure.reason });
          } else {
            imported += 1;
          }
          next();
        });
      }

      next();
    });
  }

  var importing = false;

  /** Focus the Import action (never the URL field: that re-opens the IME). */
  function focusImportAction() {
    var target = settingsView.importButton();
    if (target && focusManager.focus(target)) {
      return true;
    }
    return focusManager.focusFirst();
  }

  function runImport(promiseSource) {
    if (importing) {
      return; // one OK press = one import, even when the key echoes
    }
    importing = true;
    settingsView.setStatus(t('common.loading'));
    promiseSource().then(
      function (result) {
        importing = false;
        settingsView.setStatus(
          t('settings.done') +
            ' ' +
            result.imported +
            ' / ' +
            (result.imported + result.skipped) +
            (result.skipped ? ' · ' + t('settings.seeDiagnostics') : '')
        );
        settingsView.render();
        registerSettings();
        focusImportAction();
      },
      function (err) {
        importing = false;
        settingsView.setStatus(t('settings.invalid') + ' · ' + err.message, true);
        focusImportAction();
      }
    );
  }

  settingsView.setHandlers({
    onImportUrl: function (url) {
      runImport(function () {
        return new Promise(function (resolve, reject) {
          addonClient.json(url, function (err, data) {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        }).then(function (data) {
          return importProfile(data);
        });
      });
    },
    onImportText: function (text) {
      runImport(function () {
        return importProfile(text);
      });
    },
    onClose: function () {
      router.pop();
    }
  });

  var settingsScreen = {
    name: 'settings',
    show: function () {
      settingsView.el.classList.add('is-open');
      settingsView.render();
      settingsView.setStatus('');
      focusManager.setScope(settingsView.el);
      registerSettings();
      var list = settingsView.focusables();
      if (list.length) {
        focusManager.focus(list[0].el);
      } else {
        focusManager.focusFirst();
      }
    },
    hide: function () {
      settingsView.el.classList.remove('is-open');
      unregisterSettings();
      focusManager.setScope(null);
      var restored = settingsReturnFocus ? focusManager.focus(settingsReturnFocus) : false;
      settingsReturnFocus = null;
      if (!restored) {
        focusManager.focusFirst();
      }
    }
  };

  /* ---- diagnostics screen ----------------------------------------------- */
  var diagnosticsReturnFocus = null;
  var diagnosticsFocusables = [];

  function unregisterDiagnostics() {
    for (var i = 0; i < diagnosticsFocusables.length; i++) {
      focusManager.unregister(diagnosticsFocusables[i]);
    }
    diagnosticsFocusables = [];
  }

  function envSummary() {
    var probe = platform.probeAvPlay();
    return (
      'origin=' +
      (typeof location !== 'undefined' ? location.origin : '?') +
      ' · avplay=' +
      (probe.avplay ? 'yes' : 'no') +
      ' · webapis=' +
      (probe.webapis ? 'yes' : 'no') +
      ' · ' +
      (typeof navigator !== 'undefined' ? navigator.userAgent : '')
    );
  }

  function renderDiagnostics() {
    diagnosticsView.render({ environment: envSummary(), entries: diagnosticsList() });
  }

  function openDiagnostics() {
    diagnosticsReturnFocus = focusManager.getCurrent();
    router.push(diagnosticsScreen);
  }

  var diagnosticsScreen = {
    name: 'diagnostics',
    show: function () {
      diagnosticsView.el.classList.add('is-open');
      renderDiagnostics();
      unregisterDiagnostics();
      var list = diagnosticsView.focusables();
      for (var i = 0; i < list.length; i++) {
        diagnosticsFocusables.push(list[i].el);
        focusManager.register(list[i].el, list[i].activate);
      }
      focusManager.setScope(diagnosticsView.el);
      if (list.length) {
        focusManager.focus(list[0].el);
      } else {
        focusManager.focusFirst();
      }
    },
    hide: function () {
      diagnosticsView.el.classList.remove('is-open');
      unregisterDiagnostics();
      focusManager.setScope(null);
      var restored = diagnosticsReturnFocus ? focusManager.focus(diagnosticsReturnFocus) : false;
      diagnosticsReturnFocus = null;
      if (!restored) {
        focusManager.focusFirst();
      }
    }
  };

  diagnosticsView.setHandlers({
    onRetry: function () {
      clearDiagnostics();
      loadAddonCatalogs();
      renderDiagnostics();
    },
    onClose: function () {
      router.pop();
    }
  });

  /* ---- add-on catalog rows ---------------------------------------------- */
  var catalogLoading = false;

  function clearShelves() {
    for (var i = 0; i < shelves.length; i++) {
      var cards = shelves[i].cards;
      for (var c = 0; c < cards.length; c++) {
        focusManager.unregister(cards[c].el);
      }
      if (shelves[i].el.parentNode === rowsEl) {
        rowsEl.removeChild(shelves[i].el);
      }
    }
    shelves = [];
    var errors = rowsEl.querySelectorAll('[data-error-row]');
    for (var e = 0; e < errors.length; e++) {
      rowsEl.removeChild(errors[e]);
    }
  }

  /** Fetches the next catalog page when focus reaches the end of a row. */
  function makePager(rowDef, source) {
    var loading = false;
    var exhausted = false;
    return function (shelfApi) {
      if (loading || exhausted) {
        return;
      }
      loading = true;
      fetchCatalogPage(source.addon, source.catalog, rowDef.items.length, function (err, items) {
        loading = false;
        if (err || !items.length) {
          exhausted = true;
          return;
        }
        shelfApi.appendItems(items);
      });
    };
  }

  function renderAddonRows(rows) {
    clearShelves();
    for (var i = 0; i < rows.length; i++) {
      (function (source, index) {
        var rowDef = {
          id: 'addon-' + index,
          titleText: source.catalog.name,
          variant: 'poster',
          items: source.items
        };
        var shelf = createShelf({
          row: rowDef,
          language: getLanguage(),
          onCard: registerCard,
          onEndReached: makePager(rowDef, source)
        });
        shelves.push(shelf);
        rowsEl.appendChild(shelf.el);
        shelf.measure();
      })(rows[i], i);
    }
    if (rows.length && rows[0].items.length) {
      hero.setItem(rows[0].items[0]);
    }
    scrollY = 0;
    applyScroller();

    // The previous focus target was just removed with the mock rows.
    var focused = focusManager.getCurrent();
    if (!focused || !focused.parentNode) {
      if (shelves.length && shelves[0].cards.length) {
        focusManager.focus(shelves[0].cards[0].el);
      } else {
        focusManager.focusFirst();
      }
    }
  }

  function appendErrorRows(failures) {
    if (!failures || !failures.length) {
      return;
    }
    for (var i = 0; i < failures.length; i++) {
      (function (failure) {
        var row = document.createElement('section');
        row.className = 'row row--error';
        row.setAttribute('data-error-row', '1');

        var title = document.createElement('h2');
        title.className = 'row__title';
        title.textContent = (failure.catalog && failure.catalog.name) || t('row.error');

        var message = document.createElement('div');
        message.className = 'row__error';
        message.textContent = t('row.error') + ' · ' + failure.error;

        var hint = document.createElement('div');
        hint.className = 'row__hint';
        hint.textContent = t('row.retryHint');

        row.appendChild(title);
        row.appendChild(message);
        row.appendChild(hint);
        rowsEl.appendChild(row);
      })(failures[i]);
    }
  }

  function loadAddonCatalogs() {
    var addons = listAddons();
    if (!addons.length) {
      // Nothing installed: keep the placeholder catalogue on screen.
      buildMockRows();
      return;
    }
    if (catalogLoading) {
      return;
    }
    catalogLoading = true;
    loadCatalogRows(addons, 3, 2, function (result) {
      catalogLoading = false;
      if (result.rows.length) {
        renderAddonRows(result.rows);
      } else {
        // Add-ons are installed but nothing loaded: never silently keep the
        // placeholder rows, show the failure instead.
        clearShelves();
        scrollY = 0;
        applyScroller();
      }
      appendErrorRows(result.failures);
      if (!result.rows.length) {
        var focused = focusManager.getCurrent();
        if (!focused || !focused.parentNode) {
          focusManager.focusFirst();
        }
      }
    });
  }

  /** Placeholder catalogue (also used after the last add-on is removed). */
  function buildMockRows() {
    clearShelves();
    for (var i = 0; i < ROWS.length; i++) {
      var shelf = createShelf({
        row: ROWS[i],
        language: getLanguage(),
        onCard: registerCard
      });
      shelves.push(shelf);
      rowsEl.appendChild(shelf.el);
      shelf.measure();
    }
    hero.setItem(getHero());
    scrollY = 0;
    applyScroller();
    var focused = focusManager.getCurrent();
    if (!focused || !focused.parentNode) {
      if (shelves.length && shelves[0].cards.length) {
        focusManager.focus(shelves[0].cards[0].el);
      }
    }
  }

  function onRailSelect(id) {
    if (id === 'language') {
      toggleLanguage();
      toast.show(t('toast.language'));
      return;
    }
    if (id === 'addons') {
      addonsReturnFocus = focusManager.getCurrent();
      router.push(addonsScreen);
      return;
    }
    if (id === 'settings') {
      openSettings();
      return;
    }
    if (id === 'home') {
      if (shelves.length > 0 && shelves[0].cards.length > 0) {
        focusManager.focus(shelves[0].cards[0].el);
      }
      return;
    }
    toast.show(t('common.wip'));
  }

  /* ---- registration ---------------------------------------------------- */
  for (var r = 0; r < rail.nodes.length; r++) {
    (function (node) {
      focusManager.register(node.el, function () {
        onRailSelect(node.def.id);
      });
    })(rail.nodes[r]);
  }

  function registerCard(card, shelfApi) {
    card.el.__reveal = function () {
      shelfApi.reveal(card.el);
    };
    focusManager.register(card.el, function () {
      openDetails(card.item);
    });
  }

  for (var s = 0; s < shelves.length; s++) {
    shelves[s].measure();
  }

  for (var b = 0; b < details.buttons.length; b++) {
    (function (button) {
      focusManager.register(button.el, function () {
        if (button.id === 'play') {
          playCurrent();
          return;
        }
        toast.show(t('common.wip'));
      });
    })(details.buttons[b]);
  }

  /* Seed region memory: LEFT from the first card lands on Home, and returning
     to a row restores the card the user left. */
  for (var rn = 0; rn < rail.nodes.length; rn++) {
    if (rail.nodes[rn].def.id === 'home') {
      focusManager.remember(rail.nodes[rn].el);
    }
  }
  for (var sn = 0; sn < shelves.length; sn++) {
    if (shelves[sn].cards.length > 0) {
      focusManager.remember(shelves[sn].cards[0].el);
    }
  }

  /* ---- remote input -----------------------------------------------------
     Single capture-phase listener on the document.

     Why capture: the app can run inside a host shell (TizenBrew). Any bubble
     phase listener in that shell that calls stopPropagation() would hide remote
     keys from a window-level bubble listener, which shows up on the TV as
     "the remote sometimes does not respond". Capture runs before those handlers.

     Why a press guard: TV remotes deliver repeat/echo keydown events for one
     physical press. Acting on every echo is what stacked overlays and moved
     focus twice. Transitions (BACK / OK / EXIT) therefore fire once per press:
     an event is ignored while its key is still held (`event.repeat` or a
     keydown without the matching keyup), and the guard clears on keyup, on
     window blur and on visibility change so it can never stick.
     ------------------------------------------------------------------------ */
  var pressed = {};
  var inputBound = false;

  function keyIdOf(event) {
    return event.keyCode || event.which || event.key || 'unknown';
  }

  function clearPressed() {
    pressed = {};
  }

  function handleBack() {
    // Exactly one BACK press must dismiss the details view.
    if (details.isOpen() || router.depth() > 0) {
      closeDetails();
      return;
    }
    platform.exitApp();
  }

  /** The text field the TV keyboard can type into, if one owns DOM focus. */
  function editableFieldOf(el) {
    if (!el || el.tagName !== 'INPUT' || !appEl.contains(el)) {
      return null;
    }
    var type = String(el.getAttribute('type') || 'text').toLowerCase();
    return type === 'text' || type === 'search' || type === 'url' ? el : null;
  }

  /**
   * Commits the typed value, closes the TV keyboard and — when the remote is
   * moving on — hands focus to the Import action that consumes the value.
   */
  function commitField(field, moveFocus) {
    if (!field) {
      return;
    }
    field.value = String(field.value || '').trim(); // Done commits the text
    if (!releaseIme()) {
      try {
        field.blur();
      } catch (err) {
        /* ignored */
      }
    }
    if (moveFocus && focusManager.getCurrent() === field) {
      var target = settingsView.isOpen() ? settingsView.importButton() : null;
      if (target) {
        focusManager.focus(target);
      } else {
        // Add-ons view: the field's action sits to its right.
        focusManager.move('right');
      }
    }
  }

  /**
   * Keys while the TV keyboard is typing into a field.
   * @returns {boolean} true when the key was consumed here
   */
  function handleFieldKey(event, field, action) {
    if (event.keyCode === 8 || event.which === 8 || event.key === 'Backspace') {
      // Backspace deletes a character. It used to be normalized to BACK, which
      // closed Settings while the user was editing the address.
      return true;
    }
    if (action === 'enter' || action === 'down') {
      if (action === 'enter' && event.repeat) {
        return true;
      }
      event.preventDefault();
      // "Done"/DOWN: commit + focus Import. Import itself needs its own OK, so
      // one press can never both commit and start a request.
      commitField(field, true);
      return true;
    }
    if (action === 'back') {
      event.preventDefault();
      commitField(field, false); // keyboard closes, Settings stays open
      return true;
    }
    if (action === 'left' || action === 'right' || action === 'up') {
      return true; // caret movement / IME navigation belongs to the field
    }
    return false; // EXIT and media keys keep their meaning
  }

  function onKeyDown(event) {
    var action = actionFromEvent(event);
    if (!action) {
      return;
    }

    /* The player is modal: it takes every remote key while it is open, so BACK
       closes playback and not the details layer underneath. */
    if (player.isOpen()) {
      var isPlayerTransition = action === 'back' || action === 'enter' || action === 'exit';
      if (isPlayerTransition) {
        if (event.repeat) {
          return;
        }
        var playerKey = keyIdOf(event);
        if (pressed[playerKey]) {
          return;
        }
        clearPressed();
        pressed[playerKey] = true;
      }
      event.preventDefault();
      if (action === 'back') {
        player.close();
        return;
      }
      if (action === 'exit') {
        platform.exitApp();
        return;
      }
      player.handleAction(action);
      return;
    }

    /* While the TV keyboard is typing, the field owns the keys: Backspace
       deletes, LEFT/RIGHT move the caret, Done commits and moves to Import.
       Only real remote navigation (DOWN / BACK) leaves the field. */
    var field = editableFieldOf(document.activeElement);
    if (field && handleFieldKey(event, field, action)) {
      return;
    }
    if (!field) {
      event.preventDefault(); // never let the page scroll on arrow keys
    }

    var isTransition = action === 'back' || action === 'enter' || action === 'exit';
    if (isTransition) {
      if (event.repeat) {
        return; // auto-repeat of BACK/OK is the same press
      }
      var id = keyIdOf(event);
      if (pressed[id]) {
        return; // duplicate keydown for a press we already handled
      }
      clearPressed();
      pressed[id] = true;
    }

    if (action === 'back') {
      handleBack();
      return;
    }
    if (action === 'exit') {
      platform.exitApp();
      return;
    }
    if (isMediaAction(action)) {
      toast.show(t('common.media'));
      return;
    }
    if (action === 'enter') {
      var current = focusManager.getCurrent();
      if (editableFieldOf(current)) {
        // Done already closed the keyboard but left the cursor on the field:
        // commit and move to Import instead of re-opening the IME.
        commitField(current, true);
        return;
      }
      focusManager.activate();
      return;
    }
    focusManager.move(action);
  }

  function onKeyUp() {
    clearPressed();
  }

  function bindInput() {
    if (inputBound) {
      return; // a re-executed bundle must not attach a second listener
    }
    inputBound = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', clearPressed, false);
    document.addEventListener('visibilitychange', clearPressed, false);
  }

  bindInput();

  /* ---- language -------------------------------------------------------- */
  function renderLanguage() {
    var lang = getLanguage();
    applyStaticText(document);
    rail.updateLanguage(lang);
    hero.updateLanguage(lang);
    for (var n = 0; n < shelves.length; n++) {
      shelves[n].updateLanguage(lang);
    }
    details.setLanguage(lang);
  }

  onLanguageChange(renderLanguage);

  /* ---- stage scaling (browser preview only) ---------------------------- */
  function fitStage() {
    if (platformInfo.isTizen) {
      return;
    }
    var scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
    stageEl.style.transform = 'scale(' + scale + ')';
    stageEl.style.left = Math.round((window.innerWidth - STAGE_WIDTH * scale) / 2) + 'px';
    stageEl.style.top = Math.round((window.innerHeight - STAGE_HEIGHT * scale) / 2) + 'px';
  }

  window.addEventListener(
    'resize',
    function () {
      fitStage();
      for (var n = 0; n < shelves.length; n++) {
        shelves[n].measure();
      }
    },
    false
  );

  /* ---- first paint ----------------------------------------------------- */
  renderLanguage();
  fitStage();
  for (var m = 0; m < shelves.length; m++) {
    shelves[m].measure();
  }
  if (shelves.length > 0 && shelves[0].cards.length > 0) {
    focusManager.focus(shelves[0].cards[0].el);
  } else {
    focusManager.focusFirst();
  }

  // Real catalogs replace the placeholder rows once add-ons are installed.
  loadAddonCatalogs();

  /* ---- debug surface (read-only; drives scripts/browser-smoke.mjs) ----- */
  window.WuTizenDebug = {
    profile: {
      importText: function (text) {
        return importProfile(text);
      },
      summary: function () {
        return getProfileSummary();
      }
    },
    openSettings: function () {
      openSettings();
      return true;
    },
    diagnostics: function () {
      return diagnosticsList();
    },
    streams: {
      resolve: function (id, type, videoId) {
        return new Promise(function (resolve) {
          resolveStreams(
            {
              item: { id: id, kind: type || 'movie' },
              type: type || 'movie',
              videoId: videoId || '',
              addons: listAddons()
            },
            resolve
          );
        });
      },
      providers: function () {
        return streamProviders(listAddons(), 'movie', 'tt0000000');
      }
    },
    player: {
      state: function () {
        return player.state();
      },
      open: function (stream) {
        player.open(classifyStream(stream), { title: 'Debug' });
        return player.state();
      },
      close: function () {
        player.close();
        return player.state();
      },
      toggle: function () {
        player.toggle();
        return player.state();
      },
      seek: function (ms) {
        player.seekTo(ms);
        return player.state();
      },
      handle: function (action) {
        return player.handleAction(action);
      },
      classify: function (stream) {
        return classifyStream(stream);
      }
    },
    addon: {
      add: function (url) {
        return addAddonAsync(url);
      },
      remove: function (url) {
        return removeAddonAsync(url);
      },
      list: function () {
        return listAddons();
      },
      reload: function () {
        loadAddonCatalogs();
        return true;
      },
      openDiagnostics: function () {
        openDiagnostics();
        return true;
      },
      focusFirstCard: function () {
        if (shelves.length && shelves[0].cards.length) {
          return focusManager.focus(shelves[0].cards[0].el);
        }
        return focusManager.focusFirst();
      }
    },
    snapshot: function () {
      var focused = focusManager.getCurrent();
      var zone = 'none';
      var focusedId = null;
      if (focused) {
        if (focused.closest('.rail')) {
          zone = 'rail';
        } else if (focused.closest('.details')) {
          zone = 'overlay';
        } else {
          zone = 'content';
        }
        focusedId =
          focused.getAttribute('data-item-id') ||
          focused.getAttribute('data-rail-id') ||
          focused.getAttribute('data-detail-action');
      }
      var caption = focused ? focused.querySelector('.card__title') : null;
      var detailsTitle = document.querySelector('.details__title');
      var heroTitle = document.querySelector('.hero__title');
      var total = 0;
      for (var i = 0; i < ROWS.length; i++) {
        total += ROWS[i].items.length;
      }
      return {
        language: getLanguage(),
        screen: router.depth() > 0 ? (details.isOpen() ? 'details' : 'overlay') : 'home',
        rows: shelves.length,
        cards: document.querySelectorAll('.card').length,
        totalItems: total,
        focusedId: focusedId,
        focusedZone: zone,
        focusedTitle: caption ? caption.textContent : null,
        railExpanded: rail.isExpanded(),
        heroTitle: heroTitle ? heroTitle.textContent : '',
        detailsOpen: details.isOpen(),
        detailsTitle: detailsTitle ? detailsTitle.textContent : '',
        episodes: document.querySelectorAll('.ep').length,
        sources: document.querySelectorAll('.source-row').length,
        addons: listAddons().length,
        diagnostics: diagnosticsList().length,
        errorRows: document.querySelectorAll('[data-error-row]').length,
        diagnosticsOpen: diagnosticsView.isOpen(),
        settingsOpen: settingsView.isOpen(),
        profileImported: (getProfileSummary() || {}).imported || 0,
        rowTitles: Array.prototype.map.call(document.querySelectorAll('.row__title'), function (n) {
          return n.textContent;
        }),
        images: lazyStats(),
        avplay: platform.probeAvPlay(),
        platform: platformInfo.label
      };
    }
  };

  logInfo('boot complete', { cards: document.querySelectorAll('.card').length });
}

var booted = false;

function start() {
  if (booted) {
    return; // a re-executed bundle must never create a second app instance
  }
  booted = true;
  try {
    boot();
  } catch (err) {
    logError('boot failed', err && err.stack ? err.stack : err);
  }
}

start();
