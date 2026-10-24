/**
 * main.js — application entry point (Milestone 0).
 *
 * Responsibilities: mount the shell, own the focus manager / router, translate
 * remote keys into navigation, and expose a small read-only debug snapshot used
 * by the automated browser smoke test.
 *
 * No network access, no playback, no profile data.
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
import { MOCK_ROWS } from './data/mock.js';
import { createRail } from './ui/components/rail.js';
import { createShelf } from './ui/components/shelf.js';
import { createToast } from './ui/components/toast.js';
import { createDetailOverlay } from './ui/views/detail.js';

var STAGE_WIDTH = 1920;
var STAGE_HEIGHT = 1080;

var RAIL_ITEMS = [
  { id: 'home', labelKey: 'nav.home', icon: 'home' },
  { id: 'catalog', labelKey: 'nav.catalog', icon: 'catalog' },
  { id: 'search', labelKey: 'nav.search', icon: 'search' },
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings' },
  { id: 'language', labelKey: 'nav.language', icon: 'language', dynamic: 'language' }
];

function boot() {
  var appEl = document.getElementById('app');
  var stageEl = document.getElementById('stage');

  initLanguage();
  var platformInfo = platform.init();
  logInfo('boot', platformInfo);

  var focusManager = new FocusManager({
    onFocus: function (el) {
      if (typeof el.__reveal === 'function') {
        el.__reveal();
      }
    }
  });
  var router = createRouter();
  var toast = createToast();
  var shelves = [];
  var previousFocus = null;

  /* ---- left rail -------------------------------------------------------- */
  var rail = createRail({ items: RAIL_ITEMS });
  appEl.appendChild(rail.el);

  /* ---- top bar --------------------------------------------------------- */
  var topbar = document.createElement('header');
  topbar.className = 'topbar';

  var greetingWrap = document.createElement('div');

  var greeting = document.createElement('div');
  greeting.className = 'topbar__greeting';
  greeting.setAttribute('data-i18n', 'topbar.greeting');

  var subtitle = document.createElement('div');
  subtitle.className = 'topbar__sub';
  subtitle.setAttribute('data-i18n', 'topbar.subtitle');

  greetingWrap.appendChild(greeting);
  greetingWrap.appendChild(subtitle);

  var badge = document.createElement('div');
  badge.className = 'badge' + (platformInfo.isTizen ? ' is-tizen' : '');

  topbar.appendChild(greetingWrap);
  topbar.appendChild(badge);
  appEl.appendChild(topbar);

  /* ---- content --------------------------------------------------------- */
  var content = document.createElement('main');
  content.className = 'content';
  for (var i = 0; i < MOCK_ROWS.length; i++) {
    var shelf = createShelf({ row: MOCK_ROWS[i] });
    shelves.push(shelf);
    content.appendChild(shelf.el);
  }
  appEl.appendChild(content);

  var hintbar = document.createElement('div');
  hintbar.className = 'hintbar';
  hintbar.setAttribute('data-i18n', 'hint.bar');
  appEl.appendChild(hintbar);

  /* ---- overlays -------------------------------------------------------- */
  appEl.appendChild(toast.el);
  var detail = createDetailOverlay();
  appEl.appendChild(detail.el);

  var detailScreen = {
    name: 'detail',
    show: function () {
      detail.el.classList.add('is-open');
      focusManager.setScope(detail.el);
      focusManager.focus(detail.backButton);
    },
    hide: function () {
      detail.el.classList.remove('is-open');
      focusManager.setScope(null);
      if (previousFocus) {
        focusManager.focus(previousFocus);
        previousFocus = null;
      }
    }
  };

  function openDetail(item) {
    previousFocus = focusManager.getCurrent();
    detail.setItem(item, getLanguage());
    router.push(detailScreen);
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

  /* ---- focus registration --------------------------------------------- */
  for (var r = 0; r < rail.nodes.length; r++) {
    (function (node) {
      focusManager.register(node.el, function () {
        onRailSelect(node.def.id);
      });
    })(rail.nodes[r]);
  }

  for (var s = 0; s < shelves.length; s++) {
    (function (currentShelf) {
      for (var c = 0; c < currentShelf.cards.length; c++) {
        (function (card) {
          card.el.__reveal = function () {
            currentShelf.reveal(card.el);
          };
          focusManager.register(card.el, function () {
            openDetail(card.item);
          });
        })(currentShelf.cards[c]);
      }
    })(shelves[s]);
  }

  // Seed region memory so LEFT from the first card of a row lands on the Home
  // entry, not on whichever rail entry happens to be closest vertically.
  if (rail.nodes.length > 0) {
    focusManager.remember(rail.nodes[0].el);
  }
  for (var q = 0; q < shelves.length; q++) {
    if (shelves[q].cards.length > 0) {
      focusManager.remember(shelves[q].cards[0].el);
    }
  }

  focusManager.register(detail.backButton, function () {
    router.pop();
  });

  /* ---- remote control keys -------------------------------------------- */
  function handleBack() {
    if (router.depth() > 0) {
      router.pop();
      return;
    }
    platform.exitApp();
  }

  function onKeyDown(event) {
    var action = actionFromEvent(event);
    if (!action) {
      return;
    }
    event.preventDefault();
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

  window.addEventListener('keydown', onKeyDown, false);

  /* ---- language -------------------------------------------------------- */
  function renderLanguage() {
    var lang = getLanguage();
    applyStaticText(document);
    rail.updateLanguage(lang);
    for (var n = 0; n < shelves.length; n++) {
      shelves[n].updateLanguage(lang);
    }
    detail.setLanguage(lang);
    badge.textContent = platformInfo.isTizen ? t('platform.tizen') : t('platform.browser');
  }

  onLanguageChange(renderLanguage);

  /* ---- stage scaling (browser preview only) ---------------------------- */
  function fitStage() {
    if (platformInfo.isTizen) {
      return; // the TV gives us a native 1920x1080 CSS viewport
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
        } else if (focused.closest('.overlay')) {
          zone = 'overlay';
        } else {
          zone = 'content';
        }
        focusedId =
          focused.getAttribute('data-item-id') ||
          focused.getAttribute('data-rail-id') ||
          (focused.hasAttribute('data-detail-back') ? 'detail-back' : null);
      }
      var titleEl = focused ? focused.querySelector('.card__title') : null;
      var detailTitleEl = document.querySelector('.detail__title');
      var languageNode = rail.nodes[rail.nodes.length - 1];
      return {
        language: getLanguage(),
        screen: router.depth() > 0 && router.peek() ? router.peek().name : 'home',
        rows: shelves.length,
        cards: document.querySelectorAll('.card').length,
        focusedId: focusedId,
        focusedZone: zone,
        focusedTitle: titleEl ? titleEl.textContent : null,
        railLanguageLabel: languageNode ? languageNode.label.textContent : '',
        detailOpen: detail.isOpen(),
        detailTitle: detailTitleEl ? detailTitleEl.textContent : '',
        platform: platformInfo.label
      };
    }
  };

  logInfo('boot complete', { cards: document.querySelectorAll('.card').length });
}

try {
  boot();
} catch (err) {
  logError('boot failed', err && err.stack ? err.stack : err);
}
