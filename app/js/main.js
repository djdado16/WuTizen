/**
 * main.js — application entry point (Milestone 2, WuPlay-style redesign).
 *
 * Owns: shell composition (rail / hero / rows / details), the focus manager,
 * the router, vertical + horizontal scrolling, language switching and the
 * read-only debug snapshot used by the smoke test.
 *
 * Still no network, no playback and no profile data.
 */

import { actionFromEvent } from './core/keys.js';
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
import { addonClient } from './data/addonClient.js';
import { normalizeMeta, fetchCatalogPage, loadCatalogRows } from './data/catalogs.js';
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

  function onFocusChanged(el) {
    var inRail = !!el.closest('.rail');
    rail.setExpanded(inRail);
    setRailPush(inRail ? RAIL_PUSH : 0);
    if (typeof el.__reveal === 'function') {
      el.__reveal();
    }
    if (el.tagName === 'INPUT') {
      try {
        el.focus(); // let the TV IME attach to the add-on URL field
      } catch (err) {
        /* ignored */
      }
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
      details.el.classList.remove('is-open');
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
    details.setItem(item, getLanguage());
    details.setStreams([]);
    router.push(detailsScreen);

    if (!item.addonUrl) {
      return;
    }
    var type = item.kind || 'movie';
    // Full metadata and stream list come from the add-on (read-only).
    addonClient.meta(item.addonUrl, type, item.id, function (err, data) {
      if (!err && data && data.meta && details.isOpen()) {
        details.setItem(normalizeMeta(data.meta, item.addonUrl), getLanguage());
      }
    });
    addonClient.streams(item.addonUrl, type, item.id, function (err, data) {
      if (details.isOpen()) {
        details.setStreams(!err && data && data.streams ? data.streams : []);
      }
    });
  }

  /** Dismiss the top layer in one call, whatever the stack depth grew to. */
  function closeDetails() {
    while (router.depth() > 0) {
      router.pop();
    }
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
    }
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
    loadCatalogRows(addons, 3, 2, function (rows) {
      catalogLoading = false;
      if (!rows.length) {
        toast.show(t('addons.unreachable'));
        return;
      }
      renderAddonRows(rows);
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
        toast.show(button.id === 'play' ? t('common.media') : t('common.wip'));
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

  function onKeyDown(event) {
    var action = actionFromEvent(event);
    if (!action) {
      return;
    }
    event.preventDefault(); // never let the page scroll on arrow keys

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
    if (action === 'media') {
      toast.show(t('common.media'));
      return;
    }
    if (action === 'enter') {
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
