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
  for (var i = 0; i < ROWS.length; i++) {
    var shelf = createShelf({
      row: ROWS[i],
      language: getLanguage(),
      onCard: registerCard
    });
    shelves.push(shelf);
    rowsEl.appendChild(shelf.el);
  }
  scroller.appendChild(rowsEl);
  appEl.appendChild(scroller);

  /* ---- details view + toast -------------------------------------------- */
  var details = createDetails();
  appEl.appendChild(details.el);
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
    router.push(detailsScreen);
  }

  /** Dismiss the top layer in one call, whatever the stack depth grew to. */
  function closeDetails() {
    while (router.depth() > 0) {
      router.pop();
    }
  }

  function onRailSelect(id) {
    if (id === 'language') {
      toggleLanguage();
      toast.show(t('toast.language'));
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

  /* ---- debug surface (read-only; drives scripts/browser-smoke.mjs) ----- */
  window.WuTizenDebug = {
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
        screen: router.depth() > 0 ? 'details' : 'home',
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
        images: lazyStats(),
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
