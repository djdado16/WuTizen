(() => {
  // app/js/core/keys.js
  var MEDIA_KEY_NAMES = [
    "MediaPlay",
    "MediaPause",
    "MediaPlayPause",
    "MediaFastForward",
    "MediaRewind"
  ];
  var CODE_TO_ACTION = {
    37: "left",
    38: "up",
    39: "right",
    40: "down",
    13: "enter",
    27: "back",
    8: "back",
    461: "back",
    10009: "back",
    10182: "exit",
    415: "media",
    19: "media",
    10252: "media",
    417: "media",
    412: "media"
  };
  var NAME_TO_ACTION = {
    ArrowLeft: "left",
    ArrowUp: "up",
    ArrowRight: "right",
    ArrowDown: "down",
    Enter: "enter",
    Escape: "back",
    Backspace: "back",
    " ": "enter"
  };
  function actionFromEvent(event) {
    if (!event) {
      return null;
    }
    var code = event.keyCode || event.which;
    if (code && CODE_TO_ACTION[code]) {
      return CODE_TO_ACTION[code];
    }
    if (event.key && NAME_TO_ACTION[event.key]) {
      return NAME_TO_ACTION[event.key];
    }
    return null;
  }

  // app/js/core/log.js
  var PREFIX = "[wuplay]";
  var enabled = true;
  function logInfo() {
    if (!enabled) {
      return;
    }
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    console.log.apply(console, args);
  }
  function logWarn() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    console.warn.apply(console, args);
  }
  function logError() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    console.error.apply(console, args);
  }

  // app/js/core/focus.js
  var SAME_AXIS_PENALTY = 2.5;
  function regionOf(el) {
    if (!el || typeof el.closest !== "function") {
      return null;
    }
    var host = el.closest("[data-focus-region]");
    return host ? host.getAttribute("data-focus-region") : null;
  }
  function isAhead(rect, curRect, direction) {
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var curX = curRect.left + curRect.width / 2;
    var curY = curRect.top + curRect.height / 2;
    if (direction === "left") {
      return x < curX - 1;
    }
    if (direction === "right") {
      return x > curX + 1;
    }
    if (direction === "up") {
      return y < curY - 1;
    }
    return y > curY + 1;
  }
  function FocusManager(options) {
    var opts = options || {};
    this.items = [];
    this.current = null;
    this.scope = null;
    this.memory = {};
    this.onFocus = opts.onFocus || null;
  }
  FocusManager.prototype.remember = function(el) {
    var region = regionOf(el);
    if (region) {
      this.memory[region] = el;
    }
  };
  FocusManager.prototype.register = function(el, onActivate) {
    if (!el) {
      return;
    }
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].el === el) {
        this.items[i].onActivate = onActivate;
        return;
      }
    }
    this.items.push({ el, onActivate });
  };
  FocusManager.prototype.unregister = function(el) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].el === el) {
        this.items.splice(i, 1);
      }
    }
    if (this.current === el) {
      el.classList.remove("is-focused");
      this.current = null;
    }
  };
  FocusManager.prototype.setScope = function(el) {
    this.scope = el || null;
  };
  FocusManager.prototype.isEligible = function(el) {
    if (!el || !el.parentNode) {
      return false;
    }
    if (this.scope && el !== this.scope && !this.scope.contains(el)) {
      return false;
    }
    if (el.hasAttribute("data-disabled")) {
      return false;
    }
    return el.offsetParent !== null;
  };
  FocusManager.prototype.candidates = function() {
    var out = [];
    for (var i = 0; i < this.items.length; i++) {
      if (this.isEligible(this.items[i].el)) {
        out.push(this.items[i].el);
      }
    }
    return out;
  };
  FocusManager.prototype.focus = function(el) {
    if (!this.isEligible(el)) {
      return false;
    }
    if (this.current && this.current !== el) {
      this.current.classList.remove("is-focused");
    }
    this.current = el;
    el.classList.add("is-focused");
    this.remember(el);
    if (this.onFocus) {
      this.onFocus(el);
    }
    return true;
  };
  FocusManager.prototype.getCurrent = function() {
    return this.current;
  };
  FocusManager.prototype.focusFirst = function() {
    var list = this.candidates();
    return list.length > 0 ? this.focus(list[0]) : false;
  };
  FocusManager.prototype.activate = function() {
    var el = this.current;
    if (!el) {
      return false;
    }
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].el === el && typeof this.items[i].onActivate === "function") {
        this.items[i].onActivate(el);
        return true;
      }
    }
    return false;
  };
  FocusManager.prototype.move = function(direction) {
    var current2 = this.current;
    if (!current2) {
      return this.focusFirst();
    }
    var curRect = current2.getBoundingClientRect();
    var curX = curRect.left + curRect.width / 2;
    var curY = curRect.top + curRect.height / 2;
    var horizontal = direction === "left" || direction === "right";
    var forward = direction === "right" || direction === "down";
    var list = this.candidates();
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === current2) {
        continue;
      }
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var primary = horizontal ? forward ? x - curX : curX - x : forward ? y - curY : curY - y;
      if (primary <= 1) {
        continue;
      }
      var secondary = horizontal ? Math.abs(y - curY) : Math.abs(x - curX);
      var score = primary + secondary * SAME_AXIS_PENALTY;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) {
      logWarn("focus: no candidate in direction", direction);
      return false;
    }
    var targetRegion = regionOf(best);
    if (horizontal && targetRegion && targetRegion !== regionOf(current2)) {
      var remembered = this.memory[targetRegion];
      if (remembered && remembered !== best && this.isEligible(remembered) && isAhead(remembered.getBoundingClientRect(), curRect, direction)) {
        best = remembered;
      }
    }
    return this.focus(best);
  };

  // app/js/core/router.js
  function createRouter() {
    var stack = [];
    function active() {
      var entry = stack[stack.length - 1];
      return entry && entry.screen ? entry.screen : null;
    }
    return {
      push: function(screen) {
        var previous = active();
        if (previous && previous.hide) {
          previous.hide();
        }
        stack.push({ screen, scroll: 0 });
        if (screen.show) {
          screen.show();
        }
        logInfo("router: push", screen.name, "depth", stack.length);
      },
      pop: function() {
        if (stack.length === 0) {
          return null;
        }
        var entry = stack.pop();
        if (entry.screen && entry.screen.hide) {
          entry.screen.hide();
        }
        var next = active();
        if (next && next.show) {
          next.show();
        }
        logInfo("router: pop", entry.screen.name, "depth", stack.length);
        return entry.screen;
      },
      peek: function() {
        return active();
      },
      depth: function() {
        return stack.length;
      }
    };
  }

  // app/js/i18n/hr.js
  var hr_default = {
    "app.name": "WuTizen",
    "app.tagline": "Tizen TV klijent",
    "nav.home": "Početna",
    "nav.catalog": "Katalog",
    "nav.search": "Pretraga",
    "nav.settings": "Postavke",
    "nav.language": "Jezik",
    "topbar.greeting": "Dobrodošli natrag",
    "topbar.subtitle": "Pregled sučelja — Milestone 0",
    "row.continue": "Nastavi gledati",
    "row.movies": "Filmovi",
    "hint.bar": "↑ ↓ ← → navigacija   ·   OK odabir   ·   BACK povratak",
    "rail.hint": "Strelicama se krećete, OK potvrđuje, BACK vraća korak unatrag.",
    "detail.badge": "Pregled stavke",
    "detail.meta": "Godina",
    "detail.hint": "Detalji, sezone, titlovi i reprodukcija dolaze u sljedećim fazama. Ovo je prikaz strukture sučelja s lažnim podacima.",
    "detail.back": "Natrag",
    "common.wip": "Ova značajka još nije implementirana.",
    "common.media": "Reprodukcija nije dio Milestonea 0.",
    "platform.browser": "Pregled u pregledniku",
    "platform.tizen": "Tizen TV",
    "lang.hr": "Hrvatski",
    "lang.en": "English",
    "toast.language": "Jezik sučelja: Hrvatski"
  };

  // app/js/i18n/en.js
  var en_default = {
    "app.name": "WuTizen",
    "app.tagline": "Tizen TV client",
    "nav.home": "Home",
    "nav.catalog": "Catalog",
    "nav.search": "Search",
    "nav.settings": "Settings",
    "nav.language": "Language",
    "topbar.greeting": "Welcome back",
    "topbar.subtitle": "Interface preview — Milestone 0",
    "row.continue": "Continue watching",
    "row.movies": "Movies",
    "hint.bar": "↑ ↓ ← → navigate   ·   OK select   ·   BACK go back",
    "rail.hint": "Use the arrows to move, OK to confirm, BACK to go back one step.",
    "detail.badge": "Item preview",
    "detail.meta": "Year",
    "detail.hint": "Details, seasons, subtitles and playback arrive in later milestones. This is a structure preview with placeholder data.",
    "detail.back": "Back",
    "common.wip": "This feature is not implemented yet.",
    "common.media": "Playback is not part of Milestone 0.",
    "platform.browser": "Browser preview",
    "platform.tizen": "Tizen TV",
    "lang.hr": "Hrvatski",
    "lang.en": "English",
    "toast.language": "Interface language: English"
  };

  // app/js/platform/storage.js
  var PREFIX2 = "wuplay.";
  function getItem(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX2 + key);
      if (raw === null || typeof raw === "undefined") {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }
  function setItem(key, value) {
    try {
      window.localStorage.setItem(PREFIX2 + key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  // app/js/i18n/index.js
  var DICTS = { hr: hr_default, en: en_default };
  var DEFAULT_LANGUAGE = "hr";
  var STORAGE_KEY = "language";
  var current = DEFAULT_LANGUAGE;
  var listeners = [];
  function initLanguage() {
    var stored = getItem(STORAGE_KEY, null);
    if (stored && DICTS[stored]) {
      current = stored;
    }
    document.documentElement.setAttribute("lang", current);
    return current;
  }
  function getLanguage() {
    return current;
  }
  function setLanguage(lang) {
    if (!DICTS[lang] || lang === current) {
      return current;
    }
    current = lang;
    setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang);
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](current);
    }
    return current;
  }
  function toggleLanguage() {
    return setLanguage(current === "hr" ? "en" : "hr");
  }
  function onLanguageChange(fn) {
    listeners.push(fn);
  }
  function t(key) {
    var dict = DICTS[current] || DICTS[DEFAULT_LANGUAGE];
    if (typeof dict[key] !== "undefined") {
      return dict[key];
    }
    var fallback = DICTS[DEFAULT_LANGUAGE][key];
    return typeof fallback === "undefined" ? key : fallback;
  }
  function applyStaticText(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    }
    var ariaNodes = scope.querySelectorAll("[data-i18n-aria]");
    for (var j = 0; j < ariaNodes.length; j++) {
      ariaNodes[j].setAttribute("aria-label", t(ariaNodes[j].getAttribute("data-i18n-aria")));
    }
    var titleNodes = scope.querySelectorAll("[data-i18n-title]");
    for (var k = 0; k < titleNodes.length; k++) {
      titleNodes[k].setAttribute("title", t(titleNodes[k].getAttribute("data-i18n-title")));
    }
  }

  // app/js/platform/tizen.js
  function tizenGlobal() {
    if (typeof window === "undefined" || !window.tizen) {
      return null;
    }
    return window.tizen;
  }
  var onTizen = !!tizenGlobal();
  var platform = {
    isTizen: onTizen,
    /** Short label used by the on-screen platform badge. */
    label: function() {
      return onTizen ? "tizen" : "browser";
    },
    /**
     * Register media keys with the TV. Without this, Tizen 5.0 never delivers
     * play/pause/rewind key events to the web app.
     * Requires the http://tizen.org/privilege/tv.inputdevice privilege.
     */
    registerKeys: function(names) {
      var tizen = tizenGlobal();
      var list = names || [];
      if (!tizen || !tizen.tvinputdevice || list.length === 0) {
        return false;
      }
      try {
        if (typeof tizen.tvinputdevice.registerKeyBatch === "function") {
          tizen.tvinputdevice.registerKeyBatch(list);
          return true;
        }
        if (typeof tizen.tvinputdevice.registerKey === "function") {
          for (var i = 0; i < list.length; i++) {
            tizen.tvinputdevice.registerKey(list[i]);
          }
          return true;
        }
      } catch (err) {
        logWarn("platform: key registration failed", err && err.message);
      }
      return false;
    },
    /** Leave the application (Samsung EXIT key or BACK on the root screen). */
    exitApp: function() {
      var tizen = tizenGlobal();
      if (tizen && tizen.application && typeof tizen.application.getCurrentApplication === "function") {
        try {
          tizen.application.getCurrentApplication().exit();
          return true;
        } catch (err) {
          logWarn("platform: exit failed", err && err.message);
        }
      }
      try {
        window.close();
      } catch (err2) {
      }
      return false;
    },
    /** Called once at boot. */
    init: function() {
      if (onTizen) {
        this.registerKeys(MEDIA_KEY_NAMES);
        logInfo("platform: Tizen runtime detected; media keys registered");
      } else {
        logInfo("platform: browser preview (Tizen APIs unavailable)");
      }
      return { isTizen: onTizen, label: this.label() };
    }
  };

  // app/js/data/mock.js
  var ITEMS = [
    { id: "m1", title: { hr: "Planina tišine", en: "Mountain of Silence" }, year: 2019, kind: "movie", palette: 1, progress: 0.42 },
    { id: "m2", title: { hr: "Posljednji vlak", en: "The Last Train" }, year: 2021, kind: "movie", palette: 2 },
    { id: "m3", title: { hr: "Sedmi kat", en: "The Seventh Floor" }, year: 2018, kind: "series", palette: 3, progress: 0.18 },
    { id: "m4", title: { hr: "Hladna obala", en: "Cold Coast" }, year: 2022, kind: "series", palette: 4 },
    { id: "m5", title: { hr: "Grad pod svjetlima", en: "City Under Lights" }, year: 2020, kind: "movie", palette: 5, progress: 0.73 },
    { id: "m6", title: { hr: "Tiho ljeto", en: "Quiet Summer" }, year: 2017, kind: "movie", palette: 6 },
    { id: "m7", title: { hr: "Noćna smjena", en: "Night Shift" }, year: 2023, kind: "series", palette: 1, progress: 0.09 },
    { id: "m8", title: { hr: "Stakleni vrt", en: "The Glass Garden" }, year: 2016, kind: "movie", palette: 2 },
    { id: "m9", title: { hr: "Prašina i zvijezde", en: "Dust and Stars" }, year: 2021, kind: "movie", palette: 3, progress: 0.55 },
    { id: "m10", title: { hr: "Rub svijeta", en: "Edge of the World" }, year: 2019, kind: "series", palette: 4 },
    { id: "m11", title: { hr: "Duga cesta", en: "The Long Road" }, year: 2015, kind: "movie", palette: 5, progress: 0.31 },
    { id: "m12", title: { hr: "Zvuk kiše", en: "The Sound of Rain" }, year: 2022, kind: "movie", palette: 6 }
  ];
  var MOCK_ROWS = [
    {
      id: "continue",
      titleKey: "row.continue",
      items: [ITEMS[0], ITEMS[2], ITEMS[4], ITEMS[6], ITEMS[8], ITEMS[10]]
    },
    {
      id: "movies",
      titleKey: "row.movies",
      items: ITEMS
    }
  ];

  // app/js/ui/components/rail.js
  var ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4.2l8 7.3"/><path d="M6.6 10.4V20h10.8v-9.6"/></svg>',
    catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4.2 4.2"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.1M12 18.3v2.1M3.6 12h2.1M18.3 12h2.1"/><path d="M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5"/></svg>',
    language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M4.2 12h15.6"/><path d="M12 4c2.3 2.2 3.5 5 3.5 8s-1.2 5.8-3.5 8c-2.3-2.2-3.5-5-3.5-8s1.2-5.8 3.5-8Z"/></svg>'
  };
  function createRail(options) {
    var defs = options.items || [];
    var nodes = [];
    var el = document.createElement("nav");
    el.className = "rail";
    el.setAttribute("aria-label", "Primary");
    var brand = document.createElement("div");
    brand.className = "rail__brand";
    var logo = document.createElement("div");
    logo.className = "rail__logo";
    logo.textContent = "W";
    var brandText = document.createElement("div");
    brandText.className = "rail__brand-text";
    var name = document.createElement("div");
    name.className = "rail__name";
    name.setAttribute("data-i18n", "app.name");
    var tagline = document.createElement("div");
    tagline.className = "rail__tagline";
    tagline.setAttribute("data-i18n", "app.tagline");
    brandText.appendChild(name);
    brandText.appendChild(tagline);
    brand.appendChild(logo);
    brand.appendChild(brandText);
    el.appendChild(brand);
    var nav = document.createElement("div");
    nav.className = "rail__nav";
    nav.setAttribute("data-focus-region", "rail");
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      var node = document.createElement("div");
      node.className = "rail__item";
      node.setAttribute("role", "button");
      node.setAttribute("data-rail-id", def.id);
      var icon = document.createElement("span");
      icon.className = "rail__icon";
      icon.innerHTML = ICONS[def.icon] || ICONS.home;
      var label = document.createElement("span");
      label.className = "rail__label";
      node.appendChild(icon);
      node.appendChild(label);
      nav.appendChild(node);
      nodes.push({ el: node, def, label });
    }
    el.appendChild(nav);
    var hint = document.createElement("div");
    hint.className = "rail__hint";
    hint.setAttribute("data-i18n", "rail.hint");
    el.appendChild(hint);
    function labelFor(entry, lang) {
      if (entry.def.dynamic === "language") {
        return t("lang." + lang);
      }
      return t(entry.def.labelKey);
    }
    function updateLanguage(lang) {
      for (var j = 0; j < nodes.length; j++) {
        var text = labelFor(nodes[j], lang);
        nodes[j].label.textContent = text;
        nodes[j].el.setAttribute(
          "aria-label",
          nodes[j].def.dynamic === "language" ? t("nav.language") + ": " + text : text
        );
      }
    }
    return { el, nodes, updateLanguage };
  }

  // app/js/ui/components/card.js
  function createCard(item) {
    var el = document.createElement("div");
    el.className = "card";
    el.setAttribute("role", "button");
    el.setAttribute("data-item-id", item.id);
    var poster = document.createElement("div");
    poster.className = "card__poster poster--" + (item.palette || 1);
    var year = document.createElement("span");
    year.className = "card__year";
    year.textContent = String(item.year);
    poster.appendChild(year);
    if (typeof item.progress === "number") {
      var progress = document.createElement("div");
      progress.className = "card__progress";
      var fill = document.createElement("div");
      fill.className = "card__progress-fill";
      fill.style.width = Math.round(item.progress * 100) + "%";
      progress.appendChild(fill);
      poster.appendChild(progress);
    }
    var title = document.createElement("div");
    title.className = "card__title";
    el.appendChild(poster);
    el.appendChild(title);
    function updateLanguage(lang) {
      var text = item.title[lang] || item.title.hr;
      title.textContent = text;
      el.setAttribute("aria-label", text + ", " + item.year);
    }
    return {
      el,
      item,
      updateLanguage
    };
  }

  // app/js/ui/components/shelf.js
  var FALLBACK_STEP = 254;
  function createShelf(options) {
    var row = options.row;
    var cards = [];
    var el = document.createElement("section");
    el.className = "shelf";
    el.setAttribute("data-shelf-id", row.id);
    el.setAttribute("data-focus-region", "shelf:" + row.id);
    var head = document.createElement("div");
    head.className = "shelf__head";
    var title = document.createElement("h2");
    title.className = "shelf__title";
    var count = document.createElement("span");
    count.className = "shelf__count";
    count.textContent = String(row.items.length);
    head.appendChild(title);
    head.appendChild(count);
    var viewport = document.createElement("div");
    viewport.className = "shelf__viewport";
    var track = document.createElement("div");
    track.className = "shelf__track";
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
      var style = window.getComputedStyle(viewport);
      var paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      var available = Math.max(1, viewport.clientWidth - paddingX);
      visible = Math.max(1, Math.floor(available / step));
    }
    function applyScroll() {
      track.style.transform = "translate3d(" + -startIndex * step + "px, 0, 0)";
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
      el,
      id: row.id,
      cards,
      measure,
      reveal,
      updateLanguage,
      getStartIndex: function() {
        return startIndex;
      }
    };
  }

  // app/js/ui/components/toast.js
  function createToast() {
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    var timer = 0;
    function show(message) {
      el.textContent = message;
      el.classList.add("is-visible");
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(function() {
        el.classList.remove("is-visible");
        timer = 0;
      }, 2600);
    }
    return { el, show };
  }

  // app/js/ui/views/detail.js
  function createDetailOverlay() {
    var el = document.createElement("div");
    el.className = "overlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("data-focus-region", "overlay");
    var panel = document.createElement("div");
    panel.className = "detail";
    var body = document.createElement("div");
    body.className = "detail__body";
    var poster = document.createElement("div");
    poster.className = "detail__poster";
    var text = document.createElement("div");
    text.className = "detail__text";
    var badge = document.createElement("span");
    badge.className = "detail__badge";
    badge.setAttribute("data-detail-badge", "1");
    var title = document.createElement("h2");
    title.className = "detail__title";
    var meta = document.createElement("div");
    meta.className = "detail__meta";
    var hint = document.createElement("p");
    hint.className = "detail__hint";
    var actions = document.createElement("div");
    actions.className = "detail__actions";
    var backButton = document.createElement("div");
    backButton.className = "btn";
    backButton.setAttribute("role", "button");
    backButton.setAttribute("data-detail-back", "1");
    var backLabel = document.createElement("span");
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
    var currentLang = "hr";
    function render() {
      badge.textContent = t("detail.badge");
      hint.textContent = t("detail.hint");
      backLabel.textContent = t("detail.back");
      if (currentItem) {
        poster.className = "detail__poster poster--" + (currentItem.palette || 1);
        title.textContent = currentItem.title[currentLang] || currentItem.title.hr;
        meta.textContent = t("detail.meta") + ": " + currentItem.year;
        backButton.setAttribute("aria-label", t("detail.back"));
      }
    }
    function setLanguage2(lang) {
      currentLang = lang;
      render();
    }
    return {
      el,
      backButton,
      isOpen: function() {
        return el.classList.contains("is-open");
      },
      setItem: function(item, lang) {
        currentItem = item;
        currentLang = lang || currentLang;
        render();
      },
      setLanguage: setLanguage2
    };
  }

  // app/js/main.js
  var STAGE_WIDTH = 1920;
  var STAGE_HEIGHT = 1080;
  var RAIL_ITEMS = [
    { id: "home", labelKey: "nav.home", icon: "home" },
    { id: "catalog", labelKey: "nav.catalog", icon: "catalog" },
    { id: "search", labelKey: "nav.search", icon: "search" },
    { id: "settings", labelKey: "nav.settings", icon: "settings" },
    { id: "language", labelKey: "nav.language", icon: "language", dynamic: "language" }
  ];
  function boot() {
    var appEl = document.getElementById("app");
    var stageEl = document.getElementById("stage");
    initLanguage();
    var platformInfo = platform.init();
    logInfo("boot", platformInfo);
    var focusManager = new FocusManager({
      onFocus: function(el) {
        if (typeof el.__reveal === "function") {
          el.__reveal();
        }
      }
    });
    var router = createRouter();
    var toast = createToast();
    var shelves = [];
    var previousFocus = null;
    var rail = createRail({ items: RAIL_ITEMS });
    appEl.appendChild(rail.el);
    var topbar = document.createElement("header");
    topbar.className = "topbar";
    var greetingWrap = document.createElement("div");
    var greeting = document.createElement("div");
    greeting.className = "topbar__greeting";
    greeting.setAttribute("data-i18n", "topbar.greeting");
    var subtitle = document.createElement("div");
    subtitle.className = "topbar__sub";
    subtitle.setAttribute("data-i18n", "topbar.subtitle");
    greetingWrap.appendChild(greeting);
    greetingWrap.appendChild(subtitle);
    var badge = document.createElement("div");
    badge.className = "badge" + (platformInfo.isTizen ? " is-tizen" : "");
    topbar.appendChild(greetingWrap);
    topbar.appendChild(badge);
    appEl.appendChild(topbar);
    var content = document.createElement("main");
    content.className = "content";
    for (var i = 0; i < MOCK_ROWS.length; i++) {
      var shelf = createShelf({ row: MOCK_ROWS[i] });
      shelves.push(shelf);
      content.appendChild(shelf.el);
    }
    appEl.appendChild(content);
    var hintbar = document.createElement("div");
    hintbar.className = "hintbar";
    hintbar.setAttribute("data-i18n", "hint.bar");
    appEl.appendChild(hintbar);
    appEl.appendChild(toast.el);
    var detail = createDetailOverlay();
    appEl.appendChild(detail.el);
    var detailScreen = {
      name: "detail",
      show: function() {
        detail.el.classList.add("is-open");
        focusManager.setScope(detail.el);
        focusManager.focus(detail.backButton);
      },
      hide: function() {
        detail.el.classList.remove("is-open");
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
      if (id === "language") {
        toggleLanguage();
        toast.show(t("toast.language"));
        return;
      }
      if (id === "home") {
        if (shelves.length > 0 && shelves[0].cards.length > 0) {
          focusManager.focus(shelves[0].cards[0].el);
        }
        return;
      }
      toast.show(t("common.wip"));
    }
    for (var r = 0; r < rail.nodes.length; r++) {
      (function(node) {
        focusManager.register(node.el, function() {
          onRailSelect(node.def.id);
        });
      })(rail.nodes[r]);
    }
    for (var s = 0; s < shelves.length; s++) {
      (function(currentShelf) {
        for (var c = 0; c < currentShelf.cards.length; c++) {
          (function(card) {
            card.el.__reveal = function() {
              currentShelf.reveal(card.el);
            };
            focusManager.register(card.el, function() {
              openDetail(card.item);
            });
          })(currentShelf.cards[c]);
        }
      })(shelves[s]);
    }
    if (rail.nodes.length > 0) {
      focusManager.remember(rail.nodes[0].el);
    }
    for (var q = 0; q < shelves.length; q++) {
      if (shelves[q].cards.length > 0) {
        focusManager.remember(shelves[q].cards[0].el);
      }
    }
    focusManager.register(detail.backButton, function() {
      router.pop();
    });
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
      if (action === "back") {
        handleBack();
        return;
      }
      if (action === "exit") {
        platform.exitApp();
        return;
      }
      if (action === "media") {
        toast.show(t("common.media"));
        return;
      }
      if (action === "enter") {
        focusManager.activate();
        return;
      }
      focusManager.move(action);
    }
    window.addEventListener("keydown", onKeyDown, false);
    function renderLanguage() {
      var lang = getLanguage();
      applyStaticText(document);
      rail.updateLanguage(lang);
      for (var n = 0; n < shelves.length; n++) {
        shelves[n].updateLanguage(lang);
      }
      detail.setLanguage(lang);
      badge.textContent = platformInfo.isTizen ? t("platform.tizen") : t("platform.browser");
    }
    onLanguageChange(renderLanguage);
    function fitStage() {
      if (platformInfo.isTizen) {
        return;
      }
      var scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
      stageEl.style.transform = "scale(" + scale + ")";
      stageEl.style.left = Math.round((window.innerWidth - STAGE_WIDTH * scale) / 2) + "px";
      stageEl.style.top = Math.round((window.innerHeight - STAGE_HEIGHT * scale) / 2) + "px";
    }
    window.addEventListener(
      "resize",
      function() {
        fitStage();
        for (var n = 0; n < shelves.length; n++) {
          shelves[n].measure();
        }
      },
      false
    );
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
    window.WuTizenDebug = {
      snapshot: function() {
        var focused = focusManager.getCurrent();
        var zone = "none";
        var focusedId = null;
        if (focused) {
          if (focused.closest(".rail")) {
            zone = "rail";
          } else if (focused.closest(".overlay")) {
            zone = "overlay";
          } else {
            zone = "content";
          }
          focusedId = focused.getAttribute("data-item-id") || focused.getAttribute("data-rail-id") || (focused.hasAttribute("data-detail-back") ? "detail-back" : null);
        }
        var titleEl = focused ? focused.querySelector(".card__title") : null;
        var detailTitleEl = document.querySelector(".detail__title");
        var languageNode = rail.nodes[rail.nodes.length - 1];
        return {
          language: getLanguage(),
          screen: router.depth() > 0 && router.peek() ? router.peek().name : "home",
          rows: shelves.length,
          cards: document.querySelectorAll(".card").length,
          focusedId,
          focusedZone: zone,
          focusedTitle: titleEl ? titleEl.textContent : null,
          railLanguageLabel: languageNode ? languageNode.label.textContent : "",
          detailOpen: detail.isOpen(),
          detailTitle: detailTitleEl ? detailTitleEl.textContent : "",
          platform: platformInfo.label
        };
      }
    };
    logInfo("boot complete", { cards: document.querySelectorAll(".card").length });
  }
  try {
    boot();
  } catch (err) {
    logError("boot failed", err && err.stack ? err.stack : err);
  }
})();
