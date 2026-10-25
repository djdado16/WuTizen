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
    415: "media-play",
    19: "media-pause",
    10252: "media-toggle",
    417: "media-ff",
    412: "media-rew"
  };
  function isMediaAction(action) {
    return typeof action === "string" && action.indexOf("media-") === 0;
  }
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
    "nav.profile": "Profil",
    "nav.search": "Pretraga",
    "nav.home": "Početna",
    "nav.catalog": "Otkrij",
    "nav.lists": "Moje liste",
    "nav.addons": "Dodaci",
    "nav.settings": "Postavke",
    "nav.language": "Jezik",
    "row.movies": "Najbolje od najboljeg – filmovi",
    "row.continue": "Nastavi gledati",
    "row.series": "Serije",
    "details.play": "Reproduciraj",
    "details.trailer": "Najava",
    "details.watchlist": "Na listi",
    "details.markWatched": "Označi kao gledano",
    "details.episodes": "Epizode",
    "details.sources": "Izvori",
    "details.loadingSources": "Traženje izvora po dodacima…",
    "details.sourcesFrom": "izvora · dodataka odgovorilo:",
    "details.providerEmpty": "nema izvora",
    "addons.title": "Dodaci",
    "addons.hint": "Stremio-kompatibilni dodaci. Adresa se pohranjuje samo na ovom televizoru.",
    "addons.installed": "Instalirani dodaci",
    "addons.presets": "Preporučeni javni dodaci",
    "addons.custom": "Dodaj po adresi",
    "addons.urlPlaceholder": "URL dodatka",
    "addons.diagnostics": "Dijagnostika",
    "diagnostics.title": "Dijagnostika",
    "diagnostics.items": "stavki",
    "diagnostics.empty": "Nema zabilježenih zahtjeva.",
    "diagnostics.retry": "Ponovi",
    "diagnostics.close": "Zatvori",
    "diagnostics.sources": "Izvori (zadnje traženje)",
    "diagnostics.sourcesNone": "Izvori još nisu traženi.",
    "diagnostics.candidates": "kandidata:",
    "diagnostics.noCandidates": 'Nema kandidata — nijedan dodatak ne nudi "stream".',
    "diagnostics.skipNoStream": "preskočen: nema stream resurs",
    "diagnostics.skipType": "preskočen: ne podržava ovaj tip",
    "diagnostics.skipPrefix": "preskočen: idPrefixes",
    "diagnostics.skipLimit": "preskočen: previše dodataka",
    "diagnostics.resultOk": "ok",
    "diagnostics.resultEmpty": "nema izvora",
    "diagnostics.resultError": "greška",
    "settings.title": "Postavke",
    "settings.importHint": "Uvezite WuPlay profil (JSON). Adresa se pohranjuje samo na ovom televizoru.",
    "settings.importUrl": "Uvezi s adrese",
    "settings.importFile": "Odaberi datoteku",
    "settings.urlPlaceholder": "Adresa profile-data.json",
    "settings.close": "Zatvori",
    "settings.noProfile": "Profil još nije uvezen.",
    "settings.imported": "Uvezeno dodataka:",
    "settings.skipped": "Preskočeno:",
    "settings.profiles": "profila",
    "settings.listItems": "stavki na listama",
    "settings.invalid": "Neispravna datoteka profila.",
    "settings.done": "Uvoz završen.",
    "settings.seeDiagnostics": "Pojedinosti: Dijagnostika",
    "row.error": "Katalog nije dostupan",
    "row.retryHint": "Provjerite vezu i pokušajte ponovno.",
    "addons.add": "Dodaj",
    "addons.remove": "Ukloni",
    "addons.empty": "Nema instaliranih dodataka.",
    "addons.catalogs": "kataloga",
    "addons.installedTag": "Instalirano",
    "addons.presetCinemeta": "Cinemeta (katalog i detalji)",
    "addons.presetSubs": "OpenSubtitles v3 (titlovi)",
    "addons.added": "Dodatak je dodan.",
    "addons.removed": "Dodatak je uklonjen.",
    "addons.unreachable": "Dodatak nije dostupan.",
    "addons.invalid": "Neispravna adresa dodatka.",
    "unit.min": "min",
    "player.loading": "Priprema reprodukcije…",
    "player.hint": "OK: pauza · ←/→: 10 s · BACK: izlaz",
    "player.ended": "Kraj reprodukcije.",
    "player.torrent": "Torrent izvori nisu podržani. Potreban je dodatak koji daje HTTP vezu (npr. TorBox ili Emby Bridge).",
    "player.notWebReady": "Ovaj izvor traži vanjski player i nije podržan.",
    "player.external": "Ovaj izvor se otvara u drugoj aplikaciji i nije podržan.",
    "player.unsupported": "Format nije podržan na ovom televizoru.",
    "player.codec": "Kodek nije podržan (npr. HEVC ili DTS). Pokušajte drugi izvor.",
    "player.network": "Veza s izvorom je prekinuta.",
    "player.expired": "Veza je istekla ili je izvor uklonjen. Osvježite popis izvora.",
    "player.timeout": "Izvor nije odgovorio na vrijeme.",
    "player.noSources": "Nema dostupnih izvora za ovu stavku.",
    "player.titleFallback": "Reprodukcija",
    "player.backendAvplay": "AVPlay",
    "player.backendHtml5": "HTML5",
    "import.auth": "traži autorizaciju",
    "import.notFound": "nije pronađen",
    "import.server": "greška poslužitelja",
    "import.timeout": "isteklo vrijeme",
    "import.notAddon": "nije Stremio dodatak",
    "import.invalidUrl": "neispravna adresa",
    "import.unreachable": "nedostupan",
    "details.mockEpisode": "Demo epizoda nema stvarni izvor.",
    "common.wip": "Ova značajka još nije implementirana.",
    "common.loading": "Učitavanje…",
    "common.media": "Reprodukcija nije dio ovog milestona.",
    "lang.hr": "Hrvatski",
    "lang.en": "English",
    "toast.language": "Jezik sučelja: Hrvatski"
  };

  // app/js/i18n/en.js
  var en_default = {
    "app.name": "WuTizen",
    "nav.profile": "Profile",
    "nav.search": "Search",
    "nav.home": "Home",
    "nav.catalog": "Discover",
    "nav.lists": "My Lists",
    "nav.addons": "Add-ons",
    "nav.settings": "Settings",
    "nav.language": "Language",
    "row.movies": "Best of the Best – Movies",
    "row.continue": "Continue watching",
    "row.series": "Series",
    "details.play": "Play",
    "details.trailer": "Trailer",
    "details.watchlist": "In Watchlist",
    "details.markWatched": "Mark Watched",
    "details.episodes": "Episodes",
    "details.sources": "Sources",
    "details.loadingSources": "Asking add-ons for sources…",
    "details.sourcesFrom": "sources · add-ons answered:",
    "details.providerEmpty": "no sources",
    "addons.title": "Add-ons",
    "addons.hint": "Stremio-compatible add-ons. The address is stored on this TV only.",
    "addons.installed": "Installed add-ons",
    "addons.presets": "Recommended public add-ons",
    "addons.custom": "Add by address",
    "addons.urlPlaceholder": "Add-on URL",
    "addons.diagnostics": "Diagnostics",
    "diagnostics.title": "Diagnostics",
    "diagnostics.items": "items",
    "diagnostics.empty": "No requests recorded.",
    "diagnostics.retry": "Retry",
    "diagnostics.close": "Close",
    "diagnostics.sources": "Sources (last request)",
    "diagnostics.sourcesNone": "No source request yet.",
    "diagnostics.candidates": "candidates:",
    "diagnostics.noCandidates": 'No candidates — no add-on advertises "stream".',
    "diagnostics.skipNoStream": "skipped: no stream resource",
    "diagnostics.skipType": "skipped: unsupported type",
    "diagnostics.skipPrefix": "skipped: idPrefixes",
    "diagnostics.skipLimit": "skipped: too many add-ons",
    "diagnostics.resultOk": "ok",
    "diagnostics.resultEmpty": "no sources",
    "diagnostics.resultError": "error",
    "settings.title": "Settings",
    "settings.importHint": "Import a WuPlay profile (JSON). The address is stored on this TV only.",
    "settings.importUrl": "Import from address",
    "settings.importFile": "Choose file",
    "settings.urlPlaceholder": "profile-data.json address",
    "settings.close": "Close",
    "settings.noProfile": "No profile imported yet.",
    "settings.imported": "Add-ons imported:",
    "settings.skipped": "Skipped:",
    "settings.profiles": "profiles",
    "settings.listItems": "list items",
    "settings.invalid": "Invalid profile file.",
    "settings.done": "Import finished.",
    "settings.seeDiagnostics": "Details: Diagnostics",
    "row.error": "Catalog unavailable",
    "row.retryHint": "Check the connection and try again.",
    "addons.add": "Add",
    "addons.remove": "Remove",
    "addons.empty": "No add-ons installed.",
    "addons.catalogs": "catalogs",
    "addons.installedTag": "Installed",
    "addons.presetCinemeta": "Cinemeta (catalog and details)",
    "addons.presetSubs": "OpenSubtitles v3 (subtitles)",
    "addons.added": "Add-on added.",
    "addons.removed": "Add-on removed.",
    "addons.unreachable": "Add-on is not reachable.",
    "addons.invalid": "Invalid add-on address.",
    "unit.min": "min",
    "player.loading": "Preparing playback…",
    "player.hint": "OK: pause · ←/→: 10 s · BACK: exit",
    "player.ended": "Playback finished.",
    "player.torrent": "Torrent sources are not supported. An add-on that returns an HTTP link is required (e.g. TorBox or Emby Bridge).",
    "player.notWebReady": "This source needs an external player and is not supported.",
    "player.external": "This source opens in another app and is not supported.",
    "player.unsupported": "This format is not supported on this TV.",
    "player.codec": "Unsupported codec (e.g. HEVC or DTS). Try another source.",
    "player.network": "The connection to the source dropped.",
    "player.expired": "The link expired or the source was removed. Refresh the source list.",
    "player.timeout": "The source did not respond in time.",
    "player.noSources": "No sources available for this item.",
    "player.titleFallback": "Playback",
    "player.backendAvplay": "AVPlay",
    "player.backendHtml5": "HTML5",
    "import.auth": "requires authorisation",
    "import.notFound": "not found",
    "import.server": "server error",
    "import.timeout": "timed out",
    "import.notAddon": "not a Stremio add-on",
    "import.invalidUrl": "invalid address",
    "import.unreachable": "unreachable",
    "details.mockEpisode": "Demo episodes have no real source.",
    "common.wip": "This feature is not implemented yet.",
    "common.loading": "Loading…",
    "common.media": "Playback is not part of this milestone.",
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
    /** AVPlay availability probe (TizenBrew runs the module in its own app shell). */
    probeAvPlay: function() {
      var hasWebapis = typeof window !== "undefined" && !!window.webapis;
      var hasAvplay = typeof window !== "undefined" && !!(window.avplay || window.webapis && window.webapis.avplay);
      return { webapis: hasWebapis, avplay: hasAvplay };
    },
    /**
     * The AVPlay module object (`webapis.avplay`), or null.
     * Samsung ships it as `webapis.avplay`; some shells expose it as `avplay`.
     */
    avplayApi: function() {
      if (typeof window === "undefined") {
        return null;
      }
      if (window.webapis && window.webapis.avplay) {
        return window.webapis.avplay;
      }
      if (window.avplay) {
        return window.avplay;
      }
      return null;
    },
    /**
     * AVPlay renders into a *native* video plane below the web layer, so it can only
     * be used when this document is the top-level document. Inside a host shell
     * iframe (possible with TizenBrew) the plane cannot be composited and the
     * result is a black screen — the player then uses the HTML5 engine instead.
     */
    canUseAvPlay: function() {
      var api = this.avplayApi();
      if (!api) {
        return false;
      }
      try {
        if (window.top && window.top !== window.self) {
          return false;
        }
      } catch (err) {
        return false;
      }
      return true;
    },
    /** Display rectangle (device pixels) for the AVPlay plane. */
    displayRect: function() {
      if (typeof window === "undefined") {
        return { x: 0, y: 0, w: 1920, h: 1080 };
      }
      return {
        x: 0,
        y: 0,
        w: window.innerWidth || 1920,
        h: window.innerHeight || 1080
      };
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

  // app/js/platform/lazy.js
  var MAX_LIVE = 18;
  var live = [];
  var visible = [];
  var observer = null;
  var stats = { attached: 0, released: 0 };
  function isLoaded(img) {
    return img.getAttribute("data-loaded") === "1";
  }
  function indexIn(list, img) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === img) {
        return i;
      }
    }
    return -1;
  }
  function setVisible(img, value) {
    var at = indexIn(visible, img);
    if (value && at < 0) {
      visible.push(img);
    } else if (!value && at > -1) {
      visible.splice(at, 1);
    }
  }
  function release(img) {
    var at = indexIn(live, img);
    if (at > -1) {
      live.splice(at, 1);
    }
    if (!isLoaded(img)) {
      return;
    }
    img.removeAttribute("data-loaded");
    img.removeAttribute("src");
    stats.released += 1;
  }
  function evictOverflow() {
    while (live.length > MAX_LIVE) {
      var victim = null;
      for (var i = 0; i < live.length; i++) {
        if (indexIn(visible, live[i]) === -1) {
          victim = live[i];
          break;
        }
      }
      if (!victim) {
        return;
      }
      release(victim);
    }
  }
  function attach(img) {
    if (isLoaded(img)) {
      return;
    }
    var src = img.getAttribute("data-src");
    if (!src) {
      return;
    }
    img.setAttribute("src", src);
    img.setAttribute("data-loaded", "1");
    stats.attached += 1;
    live.push(img);
    evictOverflow();
  }
  function getObserver() {
    if (observer || typeof window === "undefined" || !window.IntersectionObserver) {
      return observer;
    }
    observer = new window.IntersectionObserver(
      function(entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          setVisible(entry.target, entry.isIntersecting);
          if (entry.isIntersecting) {
            attach(entry.target);
          } else {
            release(entry.target);
          }
        }
      },
      { rootMargin: "300px 0px 300px 0px", threshold: 0 }
    );
    return observer;
  }
  function observeImage(img) {
    var io = getObserver();
    if (!io) {
      attach(img);
      return;
    }
    io.observe(img);
  }
  function forgetImage(img) {
    var io = getObserver();
    if (io) {
      io.unobserve(img);
    }
    setVisible(img, false);
    release(img);
  }
  function lazyStats() {
    return { attached: stats.attached, released: stats.released, live: live.length };
  }

  // app/js/data/mock.js
  var CAST = ["Marta Kovač", "Luka Novak", "Ivana Radić"];
  function make(id, kind, hr, en, year, minutes, rating, genreHr, genreEn, descHr, descEn, img) {
    return {
      id,
      kind,
      mock: true,
      poster: "assets/ph/ph-0" + (Number(img) % 6 + 1) + ".png",
      title: { hr, en },
      year,
      minutes,
      rating,
      genres: { hr: genreHr, en: genreEn },
      description: { hr: descHr, en: descEn },
      cast: CAST,
      image: "assets/ph/ph-0" + (Number(img) % 6 + 1) + ".png"
    };
  }
  var MOVIES = [
    make(
      "mv1",
      "movie",
      "Tišina svemira",
      "Silence of Space",
      2019,
      118,
      8.1,
      "Znanstvena fantastika | Drama",
      "Sci-Fi | Drama",
      "Posada izgubljene postaje hvata signal koji ne bi smio postojati i mora odlučiti hoće li odgovoriti.",
      "The crew of a lost station picks up a signal that should not exist and must decide whether to answer it.",
      "01"
    ),
    make(
      "mv2",
      "movie",
      "Crveni horizont",
      "Red Horizon",
      2021,
      104,
      7.4,
      "Avantura | SF",
      "Adventure | Sci-Fi",
      "Prva ekspedicija na rub crvene pustinje otkriva da horizont nije ono što izgleda.",
      "The first expedition to the edge of the red desert discovers the horizon is not what it seems.",
      "02"
    ),
    make(
      "mv3",
      "movie",
      "Zvjezdana prašina",
      "Stardust",
      2018,
      96,
      6.9,
      "Drama | SF",
      "Drama | Sci-Fi",
      "Dvoje istraživača provode godinu dana skupljajući prašinu komete i vlastite uspomene.",
      "Two researchers spend a year collecting comet dust and their own memories.",
      "03"
    ),
    make(
      "mv4",
      "movie",
      "Orbita",
      "Orbit",
      2022,
      127,
      7.8,
      "Triler | SF",
      "Thriller | Sci-Fi",
      "Jedan krug oko planeta postaje pitanje života i smrti kada otkaže sustav za održavanje.",
      "One lap around the planet becomes a matter of life and death when life support fails.",
      "04"
    ),
    make(
      "mv5",
      "movie",
      "Noć na Marsu",
      "Night on Mars",
      2020,
      111,
      7.1,
      "SF | Horor",
      "Sci-Fi | Horror",
      "Istraživačka baza ostaje bez veze sa Zemljom, a netko ili nešto kuca po vanjskom otvoru.",
      "A research base loses contact with Earth, and someone or something knocks on the outer hatch.",
      "05"
    ),
    make(
      "mv6",
      "movie",
      "Posljednji signal",
      "The Last Signal",
      2023,
      134,
      8.3,
      "Misterij | SF",
      "Mystery | Sci-Fi",
      "Radio astronom otkriva ponavljajući uzorak koji seže dalje od granice promatranog svemira.",
      "A radio astronomer finds a repeating pattern reaching beyond the observable universe.",
      "06"
    ),
    make(
      "mv7",
      "movie",
      "Treći mjesec",
      "The Third Moon",
      2017,
      89,
      6.5,
      "Avantura",
      "Adventure",
      "Kartografi otkrivaju treći, nenavedeni mjesec i pokušavaju ga ucrtati prije oluje.",
      "Cartographers discover an unlisted third moon and try to chart it before the storm arrives.",
      "07"
    ),
    make(
      "mv8",
      "movie",
      "Duboko polje",
      "Deep Field",
      2021,
      121,
      7.9,
      "Dokumentarni",
      "Documentary",
      "Godina rada jednog teleskopa sažeta u priču o tisućama galaksija u jednoj točki neba.",
      "A year of telescope work condensed into a story of thousands of galaxies in one point of sky.",
      "08"
    ),
    make(
      "mv9",
      "movie",
      "Bijeli div",
      "White Giant",
      2016,
      102,
      7.2,
      "Drama",
      "Drama",
      "Astronaut se vraća kući nakon dvadeset godina i otkriva da ga nitko više ne prepoznaje.",
      "An astronaut returns home after twenty years and finds nobody recognises him anymore.",
      "09"
    ),
    make(
      "mv10",
      "movie",
      "Izvan dosega",
      "Out of Reach",
      2022,
      115,
      6.8,
      "Akcija | SF",
      "Action | Sci-Fi",
      "Kurir mora prenijeti uzorak kroz tri kolonije prije nego ga presretne lovac na nagrade.",
      "A courier must carry a sample through three colonies before a bounty hunter intercepts him.",
      "10"
    )
  ];
  var SERIES = [
    make(
      "sr1",
      "series",
      "Kolonija",
      "The Colony",
      2021,
      45,
      8,
      "SF | Drama",
      "Sci-Fi | Drama",
      "Prva generacija rođena izvan Zemlje suočava se s odlukom svojih roditelja.",
      "The first generation born off Earth confronts the decision their parents made.",
      "04"
    ),
    make(
      "sr2",
      "series",
      "Signal iz tame",
      "Signal from the Dark",
      2022,
      52,
      7.6,
      "Misterij",
      "Mystery",
      "Istražiteljica svake noći bilježi isti tihi impuls, a svaki dolazi s drugog mjesta.",
      "An investigator records the same quiet pulse every night, each from a different place.",
      "06"
    ),
    make(
      "sr3",
      "series",
      "Mjesečevi ljudi",
      "Moon People",
      2020,
      41,
      7,
      "SF",
      "Sci-Fi",
      "Mala posada rudarske stanice otkriva tragove koji nisu njihovi.",
      "A small mining-station crew finds traces that are not their own.",
      "02"
    ),
    make(
      "sr4",
      "series",
      "Tihi prolaz",
      "Silent Pass",
      2019,
      48,
      6.7,
      "Drama",
      "Drama",
      "Dvije obitelji dijele karantenu u prolazu prema unutrašnjosti planeta.",
      "Two families share a quarantine in a pass leading to the planet interior.",
      "08"
    ),
    make(
      "sr5",
      "series",
      "Deveta stanica",
      "Station Nine",
      2023,
      55,
      8.4,
      "SF | Triler",
      "Sci-Fi | Thriller",
      "Stanica koja službeno ne postoji prima hitne pozive s planeta koji je napušten.",
      "A station that officially does not exist receives distress calls from an abandoned planet.",
      "10"
    ),
    make(
      "sr6",
      "series",
      "Pustinja leda",
      "Desert of Ice",
      2018,
      44,
      7.3,
      "Avantura",
      "Adventure",
      "Ekspedicija prelazi zaleđenu visoravan i pritom budi ono što je pod njom spavalo.",
      "An expedition crosses a frozen plateau and wakes what slept beneath it.",
      "03"
    ),
    make(
      "sr7",
      "series",
      "Visina",
      "Altitude",
      2022,
      39,
      6.6,
      "Drama",
      "Drama",
      "Tim na orbiti uči kako živjeti bez gravitacije i bez starih navika.",
      "A team in orbit learns to live without gravity and without old habits.",
      "05"
    ),
    make(
      "sr8",
      "series",
      "Noćni sat",
      "Night Hour",
      2021,
      50,
      7.7,
      "Horor",
      "Horror",
      "Svake noći u isto vrijeme baza izgubi struju na točno četrdeset sekundi.",
      "Every night at the same time the base loses power for exactly forty seconds.",
      "07"
    )
  ];
  var HERO_ID = "mv1";
  var ROWS = [
    { id: "movies", titleKey: "row.movies", variant: "poster", items: MOVIES },
    {
      id: "continue",
      titleKey: "row.continue",
      variant: "landscape",
      items: [
        { item: MOVIES[2], progress: 0.42, badge: "S1 E3" },
        { item: MOVIES[4], progress: 0.18, badge: "S2 E1" },
        { item: MOVIES[5], progress: 0.73, badge: "S1 E7" },
        { item: MOVIES[7], progress: 0.31 },
        { item: MOVIES[1], progress: 0.55, badge: "S3 E2" },
        { item: MOVIES[8], progress: 0.09 }
      ]
    },
    { id: "series", titleKey: "row.series", variant: "poster", items: SERIES }
  ];
  var ALL = MOVIES.concat(SERIES);
  function getItem2(id) {
    for (var i = 0; i < ALL.length; i++) {
      if (ALL[i].id === id) {
        return ALL[i];
      }
    }
    return MOVIES[0];
  }
  function getHero() {
    return getItem2(HERO_ID);
  }
  function getEpisodes(item) {
    if (!item || item.mock !== true || item.kind !== "series") {
      return [];
    }
    var list = [];
    for (var n = 1; n <= 6; n++) {
      list.push({
        id: item.id + "-e" + n,
        number: n,
        title: { hr: "Epizoda " + n, en: "Episode " + n },
        minutes: 38 + n * 2,
        image: item.image
      });
    }
    return list;
  }

  // app/js/ui/components/rail.js
  var ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.6" cy="10.6" r="6.1"/><path d="m15.2 15.2 4.6 4.6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 11.4 12 3.9l8.4 7.5"/><path d="M6.2 10.2V20h11.6v-9.8"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><path d="m9 15 1.9-4.1L15 9l-1.9 4.1z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6.5 4.2h11v16l-5.5-4-5.5 4z"/></svg>',
    addons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.8" y="3.8" width="7.2" height="7.2" rx="1.6"/><rect x="13" y="3.8" width="7.2" height="7.2" rx="1.6"/><rect x="3.8" y="13" width="7.2" height="7.2" rx="1.6"/><path d="M16.6 13.2v6.8M13.2 16.6h6.8"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M3.9 12h16.2"/><path d="M12 3.8c2.3 2.3 3.5 5.1 3.5 8.2s-1.2 5.9-3.5 8.2c-2.3-2.3-3.5-5.1-3.5-8.2S9.7 6.1 12 3.8Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.1M12 18.3v2.1M3.6 12h2.1M18.3 12h2.1"/><path d="M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5"/></svg>'
  };
  function buildItem(def, lang) {
    var el = document.createElement("div");
    el.className = "rail__item";
    if (def.active) {
      el.className += " is-active";
    }
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "-1");
    el.setAttribute("data-rail-id", def.id);
    var icon = document.createElement("span");
    icon.className = "rail__icon";
    if (def.profile) {
      var avatar = document.createElement("div");
      avatar.className = "rail__avatar";
      avatar.textContent = "DJ";
      icon.appendChild(avatar);
    } else {
      icon.innerHTML = ICONS[def.icon] || ICONS.home;
    }
    var label = document.createElement("span");
    label.className = "rail__label";
    el.appendChild(icon);
    el.appendChild(label);
    return { el, def, label, lang };
  }
  function createRail(options) {
    var defs = options.items || [];
    var lang = options.language || "hr";
    var nodes = [];
    var el = document.createElement("nav");
    el.className = "rail";
    el.setAttribute("data-focus-region", "rail");
    el.setAttribute("aria-label", "Primary");
    var panel = document.createElement("div");
    panel.className = "rail__panel";
    el.appendChild(panel);
    var itemsEl = document.createElement("div");
    itemsEl.className = "rail__items";
    if (options.profile) {
      var profileNode = buildItem(options.profile, lang);
      nodes.push(profileNode);
      itemsEl.appendChild(profileNode.el);
    }
    var bottomNodes = [];
    for (var i = 0; i < defs.length; i++) {
      var node = buildItem(defs[i], lang);
      nodes.push(node);
      if (defs[i].bottom) {
        bottomNodes.push(node);
      } else {
        itemsEl.appendChild(node.el);
      }
    }
    var spacer = document.createElement("div");
    spacer.className = "rail__spacer";
    itemsEl.appendChild(spacer);
    for (var j = 0; j < bottomNodes.length; j++) {
      itemsEl.appendChild(bottomNodes[j].el);
    }
    el.appendChild(itemsEl);
    function labelFor(node2, current2) {
      if (node2.def.dynamic === "language") {
        return t("lang." + current2);
      }
      return t(node2.def.labelKey);
    }
    function updateLanguage(current2) {
      for (var k = 0; k < nodes.length; k++) {
        var text = labelFor(nodes[k], current2);
        nodes[k].label.textContent = text;
        nodes[k].el.setAttribute("aria-label", text);
      }
    }
    function setExpanded(value) {
      if (value) {
        el.classList.add("is-expanded");
      } else {
        el.classList.remove("is-expanded");
      }
    }
    updateLanguage(lang);
    return {
      el,
      nodes,
      setExpanded,
      isExpanded: function() {
        return el.classList.contains("is-expanded");
      },
      updateLanguage
    };
  }

  // app/js/ui/components/card.js
  function createCard(entry, variant, lang) {
    var item = entry.item || entry;
    var el = document.createElement("div");
    el.className = "card card--" + variant;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "-1");
    el.setAttribute("data-item-id", item.id);
    var frame = document.createElement("div");
    frame.className = "card__frame";
    var img = document.createElement("img");
    img.className = "card__img";
    img.setAttribute("data-src", item.poster || item.image);
    img.setAttribute("alt", "");
    img.setAttribute("draggable", "false");
    frame.appendChild(img);
    if (typeof entry.progress === "number") {
      var progress = document.createElement("div");
      progress.className = "card__progress";
      var fill = document.createElement("div");
      fill.className = "card__progress-fill";
      fill.style.width = Math.round(entry.progress * 100) + "%";
      progress.appendChild(fill);
      frame.appendChild(progress);
    }
    if (entry.badge) {
      var badge = document.createElement("span");
      badge.className = "card__badge";
      badge.textContent = entry.badge;
      frame.appendChild(badge);
    }
    el.appendChild(frame);
    var caption = null;
    if (variant === "landscape") {
      caption = document.createElement("div");
      caption.className = "card__title";
      el.appendChild(caption);
    }
    function updateLanguage(current2) {
      var text = item.title[current2] || item.title.hr;
      el.setAttribute("aria-label", text + ", " + item.year);
      if (caption) {
        caption.textContent = text;
      }
    }
    updateLanguage(lang);
    observeImage(img);
    return { el, item, img, updateLanguage };
  }

  // app/js/ui/components/shelf.js
  var INITIAL_CARDS = 8;
  var CHUNK = 8;
  var FALLBACK_STEP = 300;
  function createShelf(options) {
    var row = options.row;
    var lang = options.language;
    var variant = row.variant || "poster";
    var cards = [];
    var el = document.createElement("section");
    el.className = "row";
    el.setAttribute("data-shelf-id", row.id);
    el.setAttribute("data-focus-region", "row:" + row.id);
    var title = document.createElement("h2");
    title.className = "row__title";
    var viewport = document.createElement("div");
    viewport.className = "row__viewport";
    var track = document.createElement("div");
    track.className = "row__track";
    viewport.appendChild(track);
    el.appendChild(title);
    el.appendChild(viewport);
    var startIndex = 0;
    var step = FALLBACK_STEP;
    var visible2 = 1;
    function appendCards(count) {
      var from = cards.length;
      var to = Math.min(row.items.length, from + count);
      for (var i = from; i < to; i++) {
        var card = createCard(row.items[i], variant, lang);
        cards.push(card);
        track.appendChild(card.el);
        if (typeof options.onCard === "function") {
          options.onCard(card, api);
        }
      }
    }
    function measure() {
      if (cards.length === 0) {
        return;
      }
      var first = cards[0].el;
      if (cards.length > 1) {
        var delta = cards[1].el.offsetLeft - first.offsetLeft;
        step = delta > 0 ? delta : FALLBACK_STEP;
      } else {
        step = first.offsetWidth + 28;
      }
      var style = window.getComputedStyle(viewport);
      var padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      var available = Math.max(1, viewport.clientWidth - padding);
      visible2 = Math.max(1, Math.floor(available / step));
    }
    function applyScroll() {
      track.style.transform = "translate3d(" + -startIndex * step + "px, 0, 0)";
    }
    function setStart(next) {
      var maxStart = Math.max(0, cards.length - visible2);
      var clamped = Math.max(0, Math.min(next, maxStart));
      if (clamped === startIndex) {
        return;
      }
      startIndex = clamped;
      applyScroll();
    }
    function indexOf(element) {
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].el === element) {
          return i;
        }
      }
      return -1;
    }
    function ensureWindow(index) {
      if (index < cards.length - 2) {
        return;
      }
      if (cards.length >= row.items.length) {
        if (typeof options.onEndReached === "function") {
          options.onEndReached(api);
        }
        return;
      }
      appendCards(CHUNK);
      measure();
    }
    function reveal(element) {
      measure();
      var index = indexOf(element);
      if (index < 0) {
        return;
      }
      ensureWindow(index + 1);
      if (index < startIndex) {
        setStart(index);
      } else if (index >= startIndex + visible2) {
        setStart(index - visible2 + 1);
      }
    }
    function updateLanguage(current2) {
      title.textContent = row.titleText || (row.titleKey ? t(row.titleKey) : "");
      for (var i = 0; i < cards.length; i++) {
        cards[i].updateLanguage(current2);
      }
    }
    function appendItems(items) {
      if (!items || !items.length) {
        return;
      }
      row.items = row.items.concat(items);
      appendCards(CHUNK);
      measure();
    }
    var api = {
      el,
      id: row.id,
      row,
      cards,
      measure,
      reveal,
      updateLanguage,
      appendItems
    };
    appendCards(INITIAL_CARDS);
    updateLanguage(lang);
    return api;
  }

  // app/js/ui/components/hero.js
  function createHero(initialItem, lang) {
    var current2 = lang || "hr";
    var data = initialItem;
    var el = document.createElement("section");
    el.className = "hero";
    var bg = document.createElement("div");
    bg.className = "hero__bg";
    bg.style.backgroundImage = 'url("' + data.image + '")';
    var scrim = document.createElement("div");
    scrim.className = "hero__scrim";
    var content = document.createElement("div");
    content.className = "hero__content";
    var title = document.createElement("h1");
    title.className = "hero__title";
    var meta = document.createElement("div");
    meta.className = "hero__meta";
    var duration = document.createElement("span");
    duration.className = "hero__duration";
    var year = document.createElement("span");
    year.className = "hero__year";
    var rating = document.createElement("span");
    rating.className = "rating";
    var genres = document.createElement("span");
    genres.className = "hero__genres";
    meta.appendChild(duration);
    meta.appendChild(year);
    meta.appendChild(rating);
    meta.appendChild(genres);
    var desc = document.createElement("p");
    desc.className = "hero__desc";
    var cast = document.createElement("div");
    cast.className = "hero__cast";
    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(desc);
    content.appendChild(cast);
    el.appendChild(bg);
    el.appendChild(scrim);
    el.appendChild(content);
    function render() {
      title.textContent = data.title[current2] || data.title.hr;
      duration.textContent = data.minutes + " " + t("unit.min");
      year.textContent = String(data.year);
      rating.textContent = (data.rating || 0).toFixed(1);
      genres.textContent = data.genres[current2] || data.genres.hr;
      desc.textContent = data.description[current2] || data.description.hr;
      cast.textContent = (data.cast || []).join(", ");
    }
    render();
    return {
      el,
      item: data,
      setItem: function(next) {
        if (!next) {
          return;
        }
        data = next;
        el.__item = next;
        bg.style.backgroundImage = 'url("' + (next.image || "") + '")';
        render();
      },
      updateLanguage: function(next) {
        current2 = next;
        render();
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
  var ACTION_DEFS = [
    { id: "play", labelKey: "details.play", primary: true },
    { id: "trailer", labelKey: "details.trailer" },
    { id: "watchlist", labelKey: "details.watchlist" },
    { id: "watched", labelKey: "details.markWatched" }
  ];
  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>';
  function createDetails() {
    var root = document.createElement("div");
    root.className = "details";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("data-focus-region", "overlay");
    var bg = document.createElement("div");
    bg.className = "details__bg";
    var scrim = document.createElement("div");
    scrim.className = "details__scrim";
    var content = document.createElement("div");
    content.className = "details__content";
    var title = document.createElement("h1");
    title.className = "details__title";
    var meta = document.createElement("div");
    meta.className = "details__meta";
    var metaDuration = document.createElement("span");
    var metaYear = document.createElement("span");
    var metaRating = document.createElement("span");
    metaRating.className = "rating";
    var metaGenres = document.createElement("span");
    meta.appendChild(metaDuration);
    meta.appendChild(metaYear);
    meta.appendChild(metaRating);
    meta.appendChild(metaGenres);
    var desc = document.createElement("p");
    desc.className = "details__desc";
    var cast = document.createElement("div");
    cast.className = "details__cast";
    var actions = document.createElement("div");
    actions.className = "details__actions";
    var buttonList = [];
    for (var i = 0; i < ACTION_DEFS.length; i++) {
      var def = ACTION_DEFS[i];
      var btn = document.createElement("div");
      btn.className = def.primary ? "btn btn--primary" : "btn";
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "-1");
      btn.setAttribute("data-detail-action", def.id);
      if (def.primary) {
        var icon = document.createElement("span");
        icon.className = "btn__icon";
        icon.innerHTML = PLAY_ICON;
        btn.appendChild(icon);
      }
      var label = document.createElement("span");
      btn.appendChild(label);
      actions.appendChild(btn);
      buttonList.push({ id: def.id, el: btn, label, labelKey: def.labelKey });
    }
    var section = document.createElement("h3");
    section.className = "details__section";
    var episodes = document.createElement("div");
    episodes.className = "episodes";
    var sourcesHeading = document.createElement("h3");
    sourcesHeading.className = "details__section";
    sourcesHeading.setAttribute("data-detail-section", "sources");
    var sources = document.createElement("div");
    sources.className = "details__sources";
    var sourcesInfo = document.createElement("div");
    sourcesInfo.className = "details__sourcesInfo";
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
    var currentLang = "hr";
    var episodeImages = [];
    var episodeCards = [];
    var sourceRowList = [];
    var streamList = [];
    function renderText() {
      if (!currentItem) {
        return;
      }
      title.textContent = currentItem.title[currentLang] || currentItem.title.hr;
      metaDuration.textContent = currentItem.minutes + " " + t("unit.min");
      metaYear.textContent = String(currentItem.year);
      metaRating.textContent = currentItem.rating.toFixed(1);
      metaGenres.textContent = currentItem.genres[currentLang] || currentItem.genres.hr;
      desc.textContent = currentItem.description[currentLang] || currentItem.description.hr;
      cast.textContent = currentItem.cast.join(", ");
      section.textContent = t("details.episodes");
      sourcesHeading.textContent = t("details.sources");
      for (var i2 = 0; i2 < buttonList.length; i2++) {
        var text = t(buttonList[i2].labelKey);
        buttonList[i2].label.textContent = text;
        buttonList[i2].el.setAttribute("aria-label", text);
      }
    }
    function clearEpisodes() {
      for (var i2 = 0; i2 < episodeImages.length; i2++) {
        forgetImage(episodeImages[i2]);
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
        for (var r = 0; r < reals.length && r < 24; r++) {
          var video = reals[r];
          var fallback = "S" + video.season + " E" + video.episode;
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
            id: "",
            number: mockList[m].number,
            season: 0,
            label: mockList[m].title,
            minutes: mockList[m].minutes,
            image: mockList[m].image
          });
        }
      }
      var hasEpisodes = cards.length > 0;
      section.style.display = hasEpisodes ? "" : "none";
      episodes.style.display = hasEpisodes ? "flex" : "none";
      for (var i2 = 0; i2 < cards.length; i2++) {
        var ep = cards[i2];
        var card = document.createElement("div");
        card.className = "ep";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "-1");
        card.setAttribute("data-episode-id", ep.id || "");
        card.setAttribute("data-episode-number", String(ep.number || 0));
        var frame = document.createElement("div");
        frame.className = "ep__frame";
        var img = document.createElement("img");
        img.className = "card__img";
        img.setAttribute("data-src", ep.image);
        img.setAttribute("alt", "");
        img.setAttribute("draggable", "false");
        frame.appendChild(img);
        var badge = document.createElement("span");
        badge.className = "card__badge";
        badge.textContent = ep.season > 0 ? "S" + ep.season + "E" + ep.number : "E" + ep.number;
        frame.appendChild(badge);
        var label2 = document.createElement("div");
        label2.className = "ep__label";
        var text = ep.label[currentLang] || ep.label.hr;
        label2.textContent = ep.minutes > 0 ? text + " · " + ep.minutes + " " + t("unit.min") : text;
        card.appendChild(frame);
        card.appendChild(label2);
        episodes.appendChild(card);
        observeImage(img);
        episodeImages.push(img);
        episodeCards.push({ el: card, videoId: ep.id || "", label: text });
      }
    }
    function setItem2(item, lang) {
      currentItem = item;
      currentLang = lang || currentLang;
      bg.style.backgroundImage = 'url("' + item.image + '")';
      renderText();
      renderEpisodes();
    }
    function setLanguage2(lang) {
      currentLang = lang;
      renderText();
      renderEpisodes();
    }
    function describeStream(stream) {
      var label2 = String(stream.name || stream.title || stream.description || "stream");
      var filename = stream.behaviorHints && stream.behaviorHints.filename ? String(stream.behaviorHints.filename) : "";
      var haystack = label2 + " " + String(stream.description || "") + " " + filename;
      var quality = /(2160p|1080p|720p|480p|\b4k\b|\bhdr\b|\buhd\b)/i.exec(haystack);
      var language = /\b(hr|sr|bs|sl|en|de|fr|es|it|pl|ru|tr)\b/i.exec(haystack);
      var parts = [label2];
      if (quality) {
        parts.push(quality[1].toUpperCase());
      }
      if (language) {
        parts.push(language[1].toUpperCase());
      }
      return parts.join(" · ");
    }
    function reasonLabel(reason) {
      if (reason === "auth") {
        return t("import.auth");
      }
      if (reason === "notFound") {
        return t("import.notFound");
      }
      if (reason === "server") {
        return t("import.server");
      }
      if (reason === "timeout") {
        return t("import.timeout");
      }
      if (reason === "notAddon") {
        return t("import.notAddon");
      }
      return t("import.unreachable");
    }
    function setStreams(list, settled, report) {
      while (sources.firstChild) {
        sources.removeChild(sources.firstChild);
      }
      while (sourcesInfo.firstChild) {
        sourcesInfo.removeChild(sourcesInfo.firstChild);
      }
      sourceRowList = [];
      streamList = list || [];
      var visible2 = Math.min(streamList.length, 8);
      var isReal = !!(currentItem && currentItem.addonUrl);
      var providers = report && report.providers || [];
      sourcesHeading.style.display = visible2 > 0 || isReal && settled === true ? "" : "none";
      if (settled === true && isReal) {
        var summary = document.createElement("div");
        summary.className = "details__sourceSummary";
        if (visible2 > 0) {
          var answered = 0;
          for (var a = 0; a < providers.length; a++) {
            if (providers[a].status === "ok") {
              answered += 1;
            }
          }
          summary.textContent = streamList.length + " " + t("details.sourcesFrom") + " " + answered + "/" + providers.length;
        } else {
          summary.textContent = t("player.noSources");
        }
        sourcesInfo.appendChild(summary);
        for (var p = 0; p < providers.length && p < 4; p++) {
          var provider = providers[p];
          if (provider.status === "ok") {
            continue;
          }
          var line = document.createElement("div");
          line.className = "details__provider is-" + provider.status;
          var label2 = provider.name + " (" + provider.host + ")";
          line.textContent = label2 + " · " + (provider.status === "empty" ? t("details.providerEmpty") : reasonLabel(provider.reason));
          sourcesInfo.appendChild(line);
        }
      }
      if (visible2 === 0) {
        return;
      }
      for (var i2 = 0; i2 < visible2; i2++) {
        var row = document.createElement("div");
        row.className = "source-row";
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "-1");
        row.setAttribute("data-stream-index", String(i2));
        row.textContent = describeStream(streamList[i2] || {});
        sources.appendChild(row);
        sourceRowList.push({ el: row, stream: streamList[i2] || {}, index: i2 });
      }
    }
    function setSourcesStatus(state) {
      while (sourcesInfo.firstChild) {
        sourcesInfo.removeChild(sourcesInfo.firstChild);
      }
      sourcesHeading.style.display = "";
      if (state === "loading") {
        var line = document.createElement("div");
        line.className = "details__sourceSummary";
        line.textContent = t("details.loadingSources");
        sourcesInfo.appendChild(line);
      }
    }
    return {
      el: root,
      buttons: buttonList,
      setItem: setItem2,
      setLanguage: setLanguage2,
      setStreams,
      setSourcesStatus,
      title: function() {
        if (!currentItem) {
          return "";
        }
        return currentItem.title[currentLang] || currentItem.title.hr;
      },
      currentItem: function() {
        return currentItem;
      },
      sourceRows: function() {
        return sourceRowList;
      },
      episodeCards: function() {
        return episodeCards;
      },
      isOpen: function() {
        return root.classList.contains("is-open");
      }
    };
  }

  // app/js/data/addonClient.js
  var TIMEOUT = 9e3;
  var LOG_LIMIT = 40;
  var log = [];
  function diagnosticsList() {
    return log.slice(0);
  }
  function clearDiagnostics() {
    log = [];
  }
  function hostOf(url) {
    var match = /^https?:\/\/[^/]+/i.exec(url || "");
    return match ? match[0] : "(no host)";
  }
  function reasonOfError(err) {
    var message = String(err && err.message || "");
    if (message === "timeout") {
      return "timeout";
    }
    var http = /^HTTP (\d{3})/.exec(message);
    if (http) {
      var status = parseInt(http[1], 10);
      if (status === 401 || status === 403) {
        return "auth";
      }
      if (status === 404) {
        return "notFound";
      }
      return status >= 500 ? "server" : "http";
    }
    if (/invalid JSON/i.test(message)) {
      return "notAddon";
    }
    if (/not a Stremio add-on/i.test(message)) {
      return "notAddon";
    }
    if (/invalid add-on url/i.test(message)) {
      return "invalidUrl";
    }
    return "unreachable";
  }
  function describeFailure(url, err) {
    return { host: hostOf(url), reason: err && err.reason || reasonOfError(err) };
  }
  function record(entry) {
    entry.when = Date.now();
    log.push(entry);
    if (log.length > LOG_LIMIT) {
      log.shift();
    }
  }
  function normalizeBase(input) {
    var url = String(input || "").trim();
    if (!url) {
      return null;
    }
    if (/^stremio:https?:\/\//i.test(url)) {
      url = url.replace(/^stremio:/i, "");
    } else if (/^stremio:\/\//i.test(url)) {
      url = url.replace(/^stremio:\/\//i, "https://");
    }
    if (!/^https?:\/\//i.test(url)) {
      return null;
    }
    var hash = url.indexOf("#");
    if (hash > -1) {
      url = url.slice(0, hash);
    }
    var query = url.indexOf("?");
    if (query > -1) {
      url = url.slice(0, query);
    }
    url = url.replace(/\/+$/, "");
    url = url.replace(/\/manifest\.json$/i, "");
    url = url.replace(/\/+$/, "");
    if (!/^https?:\/\/[^/]+/i.test(url)) {
      return null;
    }
    return url;
  }
  function requestJson(url, ctx, done) {
    var started = Date.now();
    var xhr = new XMLHttpRequest();
    var finished = false;
    var status = 0;
    function finish(err, data) {
      if (finished) {
        return;
      }
      finished = true;
      var items = -1;
      if (!err && data) {
        if (data.metas) {
          items = data.metas.length;
        } else if (data.meta) {
          items = 1;
        } else if (data.streams) {
          items = data.streams.length;
        } else if (data.subtitles) {
          items = data.subtitles.length;
        }
      }
      record({
        host: ctx.host,
        resource: ctx.resource,
        type: ctx.type || "",
        id: ctx.id || "",
        skip: ctx.skip || 0,
        status,
        error: err ? err.message : "",
        items,
        ms: Date.now() - started
      });
      done(err, data);
    }
    try {
      xhr.open("GET", url, true);
      xhr.timeout = TIMEOUT;
      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) {
          return;
        }
        status = xhr.status;
        if (xhr.status >= 200 && xhr.status < 300) {
          var data = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch (parseError) {
            finish(new Error("invalid JSON"));
            return;
          }
          finish(null, data);
        } else if (xhr.status === 0) {
          finish(new Error("network or TLS error"));
        } else {
          finish(new Error("HTTP " + xhr.status));
        }
      };
      xhr.ontimeout = function() {
        finish(new Error("timeout"));
      };
      xhr.onerror = function() {
        finish(new Error("network or TLS error"));
      };
      xhr.send();
    } catch (err) {
      finish(new Error("request failed"));
    }
  }
  function encodeId(id) {
    return encodeURIComponent(String(id)).replace(/%3A/gi, ":");
  }
  function resourceUrl(base, resource, type, id, extra) {
    var url = base + "/" + resource + "/" + encodeURIComponent(type) + "/" + encodeId(id);
    if (extra) {
      url += "/" + extra;
    }
    return url + ".json";
  }
  function failureReason(err) {
    return reasonOfError(err);
  }
  var addonClient = {
    manifest: function(base, cb) {
      var root = normalizeBase(base);
      if (!root) {
        cb(new Error("invalid add-on url"));
        return;
      }
      requestJson(root + "/manifest.json", { host: hostOf(root), resource: "manifest" }, cb);
    },
    catalog: function(base, type, id, skip, cb) {
      var root = normalizeBase(base);
      if (!root) {
        cb(new Error("invalid add-on url"));
        return;
      }
      var extra = skip > 0 ? "skip=" + skip : "";
      requestJson(
        resourceUrl(root, "catalog", type, id, extra),
        { host: hostOf(root), resource: "catalog", type, id, skip: skip || 0 },
        cb
      );
    },
    meta: function(base, type, id, cb) {
      var root = normalizeBase(base);
      if (!root) {
        cb(new Error("invalid add-on url"));
        return;
      }
      requestJson(
        resourceUrl(root, "meta", type, id, ""),
        { host: hostOf(root), resource: "meta", type, id },
        cb
      );
    },
    streams: function(base, type, id, cb) {
      var root = normalizeBase(base);
      if (!root) {
        cb(new Error("invalid add-on url"));
        return;
      }
      requestJson(
        resourceUrl(root, "stream", type, id, ""),
        { host: hostOf(root), resource: "stream", type, id },
        cb
      );
    },
    subtitles: function(base, type, id, extra, cb) {
      var root = normalizeBase(base);
      if (!root) {
        cb(new Error("invalid add-on url"));
        return;
      }
      requestJson(
        resourceUrl(root, "subtitles", type, id, extra),
        { host: hostOf(root), resource: "subtitles", type, id },
        cb
      );
    },
    /** Arbitrary JSON GET (used by the profile-import-by-URL path). */
    json: function(url, cb) {
      var target = String(url || "").trim();
      if (!/^https?:\/\//i.test(target)) {
        cb(new Error("invalid url"));
        return;
      }
      requestJson(target, { host: hostOf(target), resource: "import" }, cb);
    }
  };

  // app/js/state/addons.js
  var KEY = "addons";
  var PRESETS = [
    { url: "https://v3-cinemeta.strem.io", labelKey: "addons.presetCinemeta" },
    { url: "https://opensubtitles-v3.strem.io", labelKey: "addons.presetSubs" }
  ];
  function summarize(url, manifest) {
    var resources = [];
    var raw = manifest.resources || [];
    for (var i = 0; i < raw.length && resources.length < 8; i++) {
      var entry = raw[i];
      var name = typeof entry === "string" ? entry : entry && entry.name ? String(entry.name) : "";
      if (name && resources.indexOf(name) === -1) {
        resources.push(name);
      }
    }
    var catalogs = [];
    var rawCats = manifest.catalogs || [];
    for (var c = 0; c < rawCats.length && c < 8; c++) {
      catalogs.push({
        type: rawCats[c].type,
        id: rawCats[c].id,
        name: rawCats[c].name || rawCats[c].id
      });
    }
    var types = [];
    var rawTypes = manifest.types || [];
    for (var t2 = 0; t2 < rawTypes.length && types.length < 6; t2++) {
      if (typeof rawTypes[t2] === "string") {
        types.push(rawTypes[t2]);
      }
    }
    var idPrefixes = [];
    function addPrefix(value) {
      if (typeof value === "string" && value && idPrefixes.indexOf(value) === -1 && idPrefixes.length < 8) {
        idPrefixes.push(value);
      }
    }
    for (var r2 = 0; r2 < raw.length; r2++) {
      var entry2 = raw[r2];
      if (entry2 && typeof entry2 === "object" && entry2.name === "stream" && entry2.idPrefixes) {
        for (var p = 0; p < entry2.idPrefixes.length; p++) {
          addPrefix(entry2.idPrefixes[p]);
        }
      }
    }
    if (!idPrefixes.length && manifest.idPrefixes) {
      for (var p2 = 0; p2 < manifest.idPrefixes.length; p2++) {
        addPrefix(manifest.idPrefixes[p2]);
      }
    }
    return {
      url,
      id: String(manifest.id || url),
      name: String(manifest.name || "Add-on"),
      version: String(manifest.version || ""),
      description: String(manifest.description || ""),
      logo: manifest.logo ? String(manifest.logo) : "",
      resources,
      types,
      idPrefixes,
      catalogs
    };
  }
  function listAddons() {
    var list = getItem(KEY, []);
    return Object.prototype.toString.call(list) === "[object Array]" ? list : [];
  }
  function persist(list) {
    setItem(KEY, list);
  }
  function hasAddon(url) {
    var base = normalizeBase(url);
    var list = listAddons();
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === base) {
        return true;
      }
    }
    return false;
  }
  function addAddon(url, cb) {
    var base = normalizeBase(url);
    if (!base) {
      var invalidUrl = new Error("invalid add-on url");
      invalidUrl.reason = "invalidUrl";
      cb(invalidUrl);
      return;
    }
    if (hasAddon(base)) {
      cb(null, null, true);
      return;
    }
    addonClient.manifest(base, function(err, manifest) {
      if (err) {
        cb(err);
        return;
      }
      if (!manifest || !manifest.id) {
        var notAddon = new Error("not a Stremio add-on manifest");
        notAddon.reason = "notAddon";
        cb(notAddon);
        return;
      }
      var hasResources = !!manifest.resources && manifest.resources.length > 0;
      var hasCatalogs = !!manifest.catalogs && manifest.catalogs.length > 0;
      var hasTypes = !!manifest.types && manifest.types.length > 0;
      if (!hasResources && !hasCatalogs && !hasTypes) {
        var empty = new Error("manifest declares no resources, catalogs or types");
        empty.reason = "manifest";
        cb(empty);
        return;
      }
      var entry = summarize(base, manifest);
      var list = listAddons();
      list.push(entry);
      persist(list);
      cb(null, entry, false);
    });
  }
  function removeAddon(url, cb) {
    var base = normalizeBase(url);
    var list = listAddons();
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].url !== base) {
        kept.push(list[i]);
      }
    }
    persist(kept);
    if (cb) {
      cb(null, kept.length !== list.length);
    }
  }
  function addAddonAsync(url) {
    return new Promise(function(resolve, reject) {
      addAddon(url, function(err, entry, already) {
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve({ added: !already, addon: entry });
        }
      });
    });
  }
  function removeAddonAsync(url) {
    return new Promise(function(resolve) {
      removeAddon(url, function(err, removed) {
        resolve({ removed: !!removed });
      });
    });
  }
  function refreshAddonMetadata(cb) {
    var list = listAddons();
    var stale = [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || !entry.url) {
        continue;
      }
      var hasPrefixesField = typeof entry.idPrefixes !== "undefined";
      var hasResources = !!entry.resources && entry.resources.length > 0;
      if (!hasPrefixesField || !hasResources) {
        stale.push(entry);
      }
    }
    if (!stale.length) {
      if (cb) {
        cb({ refreshed: 0, failed: 0, total: 0 });
      }
      return;
    }
    var index = 0;
    var refreshed = 0;
    var failed = 0;
    function next() {
      if (index >= stale.length) {
        if (cb) {
          cb({ refreshed, failed, total: stale.length });
        }
        return;
      }
      var target = stale[index];
      index += 1;
      addonClient.manifest(target.url, function(err, manifest) {
        if (err || !manifest || !manifest.id) {
          failed += 1;
          next();
          return;
        }
        var fresh = summarize(target.url, manifest);
        var current2 = listAddons();
        for (var j = 0; j < current2.length; j++) {
          if (current2[j].url !== target.url) {
            continue;
          }
          current2[j].resources = fresh.resources;
          current2[j].types = fresh.types;
          current2[j].idPrefixes = fresh.idPrefixes;
          if (fresh.catalogs.length) {
            current2[j].catalogs = fresh.catalogs;
          }
          current2[j].name = fresh.name || current2[j].name;
          current2[j].version = fresh.version || current2[j].version;
          current2[j].description = fresh.description || current2[j].description;
          current2[j].logo = fresh.logo || current2[j].logo;
        }
        persist(current2);
        refreshed += 1;
        next();
      });
    }
    next();
  }

  // app/js/ui/views/addons.js
  function createAddonsView() {
    var root = document.createElement("div");
    root.className = "details addons";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("data-focus-region", "overlay");
    var scrim = document.createElement("div");
    scrim.className = "details__scrim";
    var content = document.createElement("div");
    content.className = "details__content addons__content";
    var title = document.createElement("h1");
    title.className = "details__title addons__title";
    var hint = document.createElement("p");
    hint.className = "details__desc addons__hint";
    var status = document.createElement("div");
    status.className = "addons__status";
    var installedSection = document.createElement("div");
    var presetsSection = document.createElement("div");
    var customSection = document.createElement("div");
    var customInput = document.createElement("input");
    customInput.className = "addon-input";
    customInput.setAttribute("type", "text");
    customInput.setAttribute("spellcheck", "false");
    customInput.setAttribute("placeholder", t("addons.urlPlaceholder"));
    content.appendChild(title);
    content.appendChild(hint);
    content.appendChild(status);
    content.appendChild(installedSection);
    content.appendChild(presetsSection);
    content.appendChild(customSection);
    root.appendChild(scrim);
    root.appendChild(content);
    var handlers = { onAdd: null, onRemove: null };
    var focusables = [];
    function sectionHeading(key) {
      var heading = document.createElement("h3");
      heading.className = "details__section addons__section";
      heading.textContent = t(key);
      return heading;
    }
    function actionButton(label, id, handler) {
      var button = document.createElement("div");
      button.className = "btn addons__action";
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "-1");
      button.setAttribute("data-addon-action", id);
      var text = document.createElement("span");
      text.textContent = label;
      button.appendChild(text);
      button.addEventListener("click", handler);
      focusables.push({ el: button, activate: handler });
      return button;
    }
    function addonRow(nameText, metaText, action) {
      var row = document.createElement("div");
      row.className = "addon-row";
      var name = document.createElement("span");
      name.className = "addon-row__name";
      name.textContent = nameText;
      var meta = document.createElement("span");
      meta.className = "addon-row__meta";
      meta.textContent = metaText;
      row.appendChild(name);
      row.appendChild(meta);
      if (action) {
        row.appendChild(action);
      }
      return row;
    }
    function render() {
      focusables = [];
      installedSection.innerHTML = "";
      presetsSection.innerHTML = "";
      customSection.innerHTML = "";
      title.textContent = t("addons.title");
      hint.textContent = t("addons.hint");
      installedSection.appendChild(sectionHeading("addons.installed"));
      var installed = listAddons();
      if (!installed.length) {
        var empty = document.createElement("div");
        empty.className = "addons__empty";
        empty.textContent = t("addons.empty");
        installedSection.appendChild(empty);
      } else {
        for (var i = 0; i < installed.length; i++) {
          (function(addon) {
            var resourceText = (addon.resources || []).join(", ");
            var metaText = resourceText + " · " + (addon.catalogs || []).length + " " + t("addons.catalogs");
            installedSection.appendChild(
              addonRow(
                addon.name + (addon.version ? "  v" + addon.version : ""),
                metaText,
                actionButton(t("addons.remove"), "remove:" + addon.url, function() {
                  if (handlers.onRemove) {
                    handlers.onRemove(addon.url);
                  }
                })
              )
            );
          })(installed[i]);
        }
      }
      presetsSection.appendChild(sectionHeading("addons.presets"));
      for (var p = 0; p < PRESETS.length; p++) {
        (function(preset) {
          var action = null;
          if (hasAddon(preset.url)) {
            var tag = document.createElement("span");
            tag.className = "addon-row__meta";
            tag.textContent = t("addons.installedTag");
            action = tag;
          } else {
            action = actionButton(t("addons.add"), "add:" + preset.url, function() {
              if (handlers.onAdd) {
                handlers.onAdd(preset.url);
              }
            });
          }
          presetsSection.appendChild(addonRow(t(preset.labelKey), preset.url, action));
        })(PRESETS[p]);
      }
      customSection.appendChild(sectionHeading("addons.custom"));
      var customRow = document.createElement("div");
      customRow.className = "addon-row";
      customRow.appendChild(customInput);
      customRow.appendChild(
        actionButton(t("addons.add"), "add:custom", function() {
          var value = String(customInput.value || "").trim();
          if (value && handlers.onAdd) {
            handlers.onAdd(value);
          }
        })
      );
      customSection.appendChild(customRow);
      var diagRow = document.createElement("div");
      diagRow.className = "addon-row";
      diagRow.appendChild(
        actionButton(t("addons.diagnostics"), "diagnostics", function() {
          if (handlers.onDiagnostics) {
            handlers.onDiagnostics();
          }
        })
      );
      customSection.appendChild(diagRow);
      focusables.push({ el: customInput, activate: function() {
      } });
    }
    function setStatus(message, isError) {
      status.textContent = message || "";
      status.className = "addons__status" + (isError ? " is-error" : "");
    }
    return {
      el: root,
      input: customInput,
      render,
      setStatus,
      focusables: function() {
        return focusables;
      },
      setHandlers: function(next) {
        handlers.onAdd = next.onAdd || null;
        handlers.onRemove = next.onRemove || null;
        handlers.onDiagnostics = next.onDiagnostics || null;
      },
      isOpen: function() {
        return root.classList.contains("is-open");
      }
    };
  }

  // app/js/ui/views/diagnostics.js
  function createDiagnosticsView() {
    var root = document.createElement("div");
    root.className = "details diagnostics";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("data-focus-region", "overlay");
    var scrim = document.createElement("div");
    scrim.className = "details__scrim";
    var content = document.createElement("div");
    content.className = "details__content diagnostics__content";
    var title = document.createElement("h1");
    title.className = "details__title diagnostics__title";
    var env = document.createElement("div");
    env.className = "diagnostics__env";
    var sources = document.createElement("div");
    sources.className = "diagnostics__sources";
    var list = document.createElement("div");
    list.className = "diagnostics__list";
    var actions = document.createElement("div");
    actions.className = "details__actions";
    var focusables = [];
    var handlers = { onRetry: null, onClose: null };
    function button(label, id, handler) {
      var el = document.createElement("div");
      el.className = "btn";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "-1");
      el.setAttribute("data-diagnostics-action", id);
      var span = document.createElement("span");
      span.textContent = label;
      el.appendChild(span);
      el.addEventListener("click", handler);
      focusables.push({ el, activate: handler });
      actions.appendChild(el);
      return el;
    }
    content.appendChild(title);
    content.appendChild(env);
    content.appendChild(sources);
    content.appendChild(list);
    content.appendChild(actions);
    root.appendChild(scrim);
    root.appendChild(content);
    function skipLabel(reason) {
      if (reason === "noStreamResource") {
        return t("diagnostics.skipNoStream");
      }
      if (reason === "typeMismatch") {
        return t("diagnostics.skipType");
      }
      if (reason === "idPrefixes") {
        return t("diagnostics.skipPrefix");
      }
      return t("diagnostics.skipLimit");
    }
    function renderSources(report) {
      sources.innerHTML = "";
      var heading = document.createElement("div");
      heading.className = "diagnostics__section";
      heading.textContent = t("diagnostics.sources");
      sources.appendChild(heading);
      if (!report) {
        var none = document.createElement("div");
        none.className = "diagnostics__row";
        none.textContent = t("diagnostics.sourcesNone");
        sources.appendChild(none);
        return;
      }
      var summary = document.createElement("div");
      summary.className = "diagnostics__row";
      summary.textContent = report.type + "/" + report.id + " · " + t("diagnostics.candidates") + " " + report.candidates + " · " + (report.streamCount || 0) + " " + t("diagnostics.items");
      sources.appendChild(summary);
      if (!report.candidates) {
        var noCandidates = document.createElement("div");
        noCandidates.className = "diagnostics__row";
        noCandidates.textContent = t("diagnostics.noCandidates");
        sources.appendChild(noCandidates);
      }
      for (var i = 0; i < report.providers.length; i++) {
        var provider = report.providers[i];
        var row = document.createElement("div");
        row.className = "diagnostics__row" + (provider.status === "error" ? " is-error" : "");
        var statusText = provider.status === "ok" ? t("diagnostics.resultOk") : provider.status === "empty" ? t("diagnostics.resultEmpty") : t("diagnostics.resultError");
        row.textContent = provider.name + " (" + provider.host + ") · " + statusText + (provider.reason ? " · " + provider.reason : "") + (provider.httpStatus ? " · HTTP " + provider.httpStatus : "") + " · " + provider.count + " " + t("diagnostics.items");
        sources.appendChild(row);
      }
      for (var s = 0; s < report.skipped.length; s++) {
        var skipped = report.skipped[s];
        var skipRow = document.createElement("div");
        skipRow.className = "diagnostics__row";
        skipRow.textContent = skipped.name + " (" + skipped.host + ") · " + skipLabel(skipped.reason);
        sources.appendChild(skipRow);
      }
    }
    function render(info) {
      focusables = [];
      actions.innerHTML = "";
      list.innerHTML = "";
      title.textContent = t("diagnostics.title");
      env.textContent = info.environment;
      renderSources(info.sources);
      button(t("diagnostics.retry"), "retry", function() {
        if (handlers.onRetry) {
          handlers.onRetry();
        }
      });
      button(t("diagnostics.close"), "close", function() {
        if (handlers.onClose) {
          handlers.onClose();
        }
      });
      if (!info.entries.length) {
        var empty = document.createElement("div");
        empty.className = "diagnostics__row";
        empty.textContent = t("diagnostics.empty");
        list.appendChild(empty);
        return;
      }
      for (var i = 0; i < info.entries.length; i++) {
        var entry = info.entries[i];
        var row = document.createElement("div");
        row.className = "diagnostics__row" + (entry.error ? " is-error" : "");
        var head = document.createElement("span");
        head.className = "diagnostics__head";
        var label = entry.resource;
        if (entry.type) {
          label += " " + entry.type + "/" + entry.id;
        }
        if (entry.skip) {
          label += " skip=" + entry.skip;
        }
        head.textContent = entry.host + " · " + label + " · " + (entry.error ? entry.error + (entry.status ? " (" + entry.status + ")" : "") : entry.status) + " · " + entry.items + " " + t("diagnostics.items") + " · " + entry.ms + " ms";
        row.appendChild(head);
        list.appendChild(row);
      }
    }
    return {
      el: root,
      render,
      focusables: function() {
        return focusables;
      },
      setHandlers: function(next) {
        handlers.onRetry = next.onRetry || null;
        handlers.onClose = next.onClose || null;
      },
      isOpen: function() {
        return root.classList.contains("is-open");
      }
    };
  }

  // app/js/state/profile.js
  var KEY2 = "profile";
  function saveProfileSummary(summary) {
    return setItem(KEY2, summary);
  }
  function getProfileSummary() {
    return getItem(KEY2, null);
  }

  // app/js/ui/views/settings.js
  function createSettingsView() {
    function reasonLabel(reason) {
      if (reason === "auth") {
        return t("import.auth");
      }
      if (reason === "notFound") {
        return t("import.notFound");
      }
      if (reason === "server") {
        return t("import.server");
      }
      if (reason === "timeout") {
        return t("import.timeout");
      }
      if (reason === "notAddon" || reason === "manifest") {
        return t("import.notAddon");
      }
      if (reason === "invalidUrl") {
        return t("import.invalidUrl");
      }
      return t("import.unreachable");
    }
    var root = document.createElement("div");
    root.className = "details settings";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("data-focus-region", "overlay");
    var scrim = document.createElement("div");
    scrim.className = "details__scrim";
    var content = document.createElement("div");
    content.className = "details__content settings__content";
    var title = document.createElement("h1");
    title.className = "details__title settings__title";
    var hint = document.createElement("p");
    hint.className = "details__desc addons__hint";
    var status = document.createElement("div");
    status.className = "addons__status";
    var summary = document.createElement("div");
    summary.className = "settings__summary";
    var actions = document.createElement("div");
    actions.className = "details__actions";
    var urlInput = document.createElement("input");
    urlInput.className = "addon-input settings__url";
    urlInput.setAttribute("type", "text");
    urlInput.setAttribute("spellcheck", "false");
    urlInput.setAttribute("inputmode", "url");
    urlInput.setAttribute("autocomplete", "off");
    urlInput.setAttribute("autocapitalize", "off");
    urlInput.setAttribute("data-settings-field", "url");
    urlInput.setAttribute("placeholder", t("settings.urlPlaceholder"));
    var fileInput = document.createElement("input");
    fileInput.setAttribute("type", "file");
    fileInput.setAttribute("accept", ".json,application/json");
    fileInput.className = "settings__file";
    var focusables = [];
    var handlers = { onImportUrl: null, onImportText: null, onClose: null };
    var importBtn = null;
    function button(label, id, handler) {
      var el = document.createElement("div");
      el.className = "btn";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "-1");
      el.setAttribute("data-settings-action", id);
      var span = document.createElement("span");
      span.textContent = label;
      el.appendChild(span);
      el.addEventListener("click", handler);
      focusables.push({ el, activate: handler });
      actions.appendChild(el);
      if (id === "import-url") {
        importBtn = el;
      }
      return el;
    }
    content.appendChild(title);
    content.appendChild(hint);
    content.appendChild(urlInput);
    content.appendChild(status);
    content.appendChild(summary);
    content.appendChild(actions);
    content.appendChild(fileInput);
    root.appendChild(scrim);
    root.appendChild(content);
    fileInput.addEventListener("change", function() {
      var file = fileInput.files && fileInput.files[0];
      if (!file || !handlers.onImportText) {
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        handlers.onImportText(String(reader.result || ""));
      };
      reader.readAsText(file);
      fileInput.value = "";
    });
    function render() {
      focusables = [];
      actions.innerHTML = "";
      title.textContent = t("settings.title");
      hint.textContent = t("settings.importHint");
      button(t("settings.importUrl"), "import-url", function() {
        var value = String(urlInput.value || "").trim();
        if (value && handlers.onImportUrl) {
          handlers.onImportUrl(value);
        }
      });
      button(t("settings.importFile"), "import-file", function() {
        try {
          fileInput.click();
        } catch (err) {
        }
      });
      button(t("settings.close"), "close", function() {
        if (handlers.onClose) {
          handlers.onClose();
        }
      });
      var last = getProfileSummary();
      if (!last) {
        summary.textContent = t("settings.noProfile");
      } else {
        summary.textContent = t("settings.imported") + " " + last.imported + " · " + t("settings.skipped") + " " + last.skipped + " · " + (last.profiles || []).length + " " + t("settings.profiles") + " · " + last.lists + " " + t("settings.listItems");
        var failures = last.failures || [];
        if (failures.length) {
          var list = document.createElement("div");
          list.className = "settings__failures";
          for (var i = 0; i < failures.length; i++) {
            var line = document.createElement("div");
            line.className = "settings__failure";
            line.textContent = failures[i].host + " · " + reasonLabel(failures[i].reason);
            list.appendChild(line);
          }
          summary.appendChild(list);
        }
      }
      focusables.push({
        el: urlInput,
        activate: function() {
          try {
            urlInput.focus();
          } catch (err) {
          }
        }
      });
    }
    return {
      el: root,
      render,
      fileInput,
      urlInput,
      importButton: function() {
        return importBtn;
      },
      setStatus: function(message, isError) {
        status.textContent = message || "";
        status.className = "addons__status" + (isError ? " is-error" : "");
      },
      focusables: function() {
        return focusables;
      },
      setHandlers: function(next) {
        handlers.onImportUrl = next.onImportUrl || null;
        handlers.onImportText = next.onImportText || null;
        handlers.onClose = next.onClose || null;
      },
      isOpen: function() {
        return root.classList.contains("is-open");
      }
    };
  }

  // app/js/data/profileImport.js
  var MAX_DEPTH = 6;
  var MAX_NODES = 5e3;
  var MAX_ADDONS = 20;
  var MAX_PROFILES = 8;
  var ADDON_KEY = /^(transportUrl|transport_url|addonUrl|addon_url|manifestUrl|manifest_url|url|uri|src)$/i;
  var MEDIA_KEY = /(logo|poster|background|image|avatar|icon|banner)/i;
  var PROFILE_KEY = /^(profiles?|users?)$/i;
  var LIST_KEY = /(lists?|watchlist|watchLater|bookmarks|favorites|library|history|continueWatching)/i;
  var ADDON_URL = /^(?:https?|stremio):\/\//i;
  function parseProfile(input) {
    var data = input;
    if (typeof input === "string") {
      try {
        data = JSON.parse(input);
      } catch (err) {
        return { ok: false, error: "invalid JSON" };
      }
    }
    if (!data || typeof data !== "object") {
      return { ok: false, error: "not a profile object" };
    }
    var addonUrls = [];
    var seen = {};
    var profiles = [];
    var lists = 0;
    var nodes = 0;
    var skippedTooMany = 0;
    function addAddon2(url) {
      if (addonUrls.length >= MAX_ADDONS) {
        skippedTooMany += 1;
        return;
      }
      if (!seen[url]) {
        seen[url] = true;
        addonUrls.push(url);
      }
    }
    function addProfile(name) {
      var clean = String(name).trim().slice(0, 40);
      if (clean && profiles.indexOf(clean) === -1 && profiles.length < MAX_PROFILES) {
        profiles.push(clean);
      }
    }
    function walk(node, depth) {
      if (!node || typeof node !== "object") {
        return;
      }
      if (nodes++ > MAX_NODES || depth > MAX_DEPTH) {
        return;
      }
      if (Object.prototype.toString.call(node) === "[object Array]") {
        for (var i = 0; i < node.length; i++) {
          walk(node[i], depth + 1);
        }
        return;
      }
      for (var key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) {
          continue;
        }
        var value = node[key];
        if (typeof value === "string") {
          var text = value.trim();
          if (!MEDIA_KEY.test(key) && ADDON_URL.test(text)) {
            var base = normalizeBase(text);
            if (base && (ADDON_KEY.test(key) || /\/manifest\.json(?:[?#]|$)/i.test(text))) {
              addAddon2(base);
            }
          }
        } else if (value && typeof value === "object") {
          if (Object.prototype.toString.call(value) === "[object Array]") {
            if (LIST_KEY.test(key)) {
              lists += value.length;
            }
            if (PROFILE_KEY.test(key)) {
              for (var p = 0; p < value.length; p++) {
                if (value[p] && (value[p].name || value[p].title)) {
                  addProfile(value[p].name || value[p].title);
                }
              }
            }
          } else if (PROFILE_KEY.test(key) && (value.name || value.title)) {
            addProfile(value.name || value.title);
          }
          walk(value, depth + 1);
        }
      }
    }
    walk(data, 0);
    return {
      ok: true,
      addons: addonUrls,
      profiles,
      lists,
      truncated: skippedTooMany
    };
  }
  function summarizeImport(parsed, imported, skipped, failures) {
    var hosts = [];
    for (var i = 0; i < parsed.addons.length; i++) {
      var match = /^https?:\/\/[^/]+/i.exec(parsed.addons[i]);
      if (match && hosts.indexOf(match[0]) === -1) {
        hosts.push(match[0]);
      }
    }
    return {
      importedAt: Date.now(),
      addonHosts: hosts,
      profiles: parsed.profiles,
      lists: parsed.lists,
      imported,
      skipped,
      // Host + reason only: enough to see *which* add-on was skipped without
      // storing its path, configuration or token.
      failures: (failures || []).slice(0, 8)
    };
  }

  // app/js/data/catalogs.js
  function normalizeMeta(meta, addonUrl) {
    var source = meta || {};
    var title = String(source.name || source.id || "Untitled");
    var yearMatch = /(\d{4})/.exec(String(source.releaseInfo || source.year || ""));
    var minutes = 0;
    var runtimeMatch = /(\d+)/.exec(String(source.runtime || ""));
    if (runtimeMatch) {
      minutes = parseInt(runtimeMatch[1], 10);
    }
    var genres = "";
    if (source.genres && source.genres.length) {
      genres = source.genres.slice(0, 3).join(" | ");
    } else if (source.genre) {
      genres = String(source.genre);
    }
    var poster = source.poster ? String(source.poster) : "";
    var videos = [];
    if (source.videos && source.videos.length) {
      for (var v = 0; v < source.videos.length && v < 60; v++) {
        var video = source.videos[v] || {};
        if (!video.id) {
          continue;
        }
        videos.push({
          id: String(video.id),
          season: parseInt(video.season, 10) || 0,
          episode: parseInt(video.episode, 10) || 0,
          name: String(video.name || video.title || ""),
          thumbnail: video.thumbnail ? String(video.thumbnail) : ""
        });
      }
    }
    return {
      id: String(source.id || title),
      mock: false,
      addonUrl: addonUrl || "",
      kind: String(source.type || "movie"),
      title: { hr: title, en: title },
      year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
      minutes,
      rating: parseFloat(source.imdbRating || source.rating || 0) || 0,
      genres: { hr: genres, en: genres },
      description: { hr: String(source.description || ""), en: String(source.description || "") },
      cast: source.cast && source.cast.length ? source.cast.slice(0, 3) : [],
      poster,
      image: source.background ? String(source.background) : poster,
      videos
    };
  }
  function fetchCatalogPage(addon, catalog, skip, cb) {
    addonClient.catalog(addon.url, catalog.type, catalog.id, skip || 0, function(err, data) {
      if (err) {
        cb(err);
        return;
      }
      var metas = data && data.metas ? data.metas : [];
      var items = [];
      for (var i = 0; i < metas.length; i++) {
        if (metas[i] && metas[i].id) {
          items.push(normalizeMeta(metas[i], addon.url));
        }
      }
      cb(null, items);
    });
  }
  function loadCatalogRows(addons, maxAddons, maxCatalogs, done) {
    var rows = [];
    var failures = [];
    var pending = 0;
    var startCount = 0;
    for (var a = 0; a < addons.length && a < maxAddons; a++) {
      var catalogs = addons[a].catalogs || [];
      for (var c = 0; c < catalogs.length && c < maxCatalogs; c++) {
        startCount += 1;
        pending += 1;
        (function(addon, catalog) {
          fetchCatalogPage(addon, catalog, 0, function(err, items) {
            pending -= 1;
            if (err) {
              failures.push({ addon, catalog, error: err.message });
            } else if (!items.length) {
              failures.push({ addon, catalog, error: "empty catalog" });
            } else {
              rows.push({ addon, catalog, items });
            }
            if (pending === 0) {
              done({ rows, failures, attempted: startCount });
            }
          });
        })(addons[a], catalogs[c]);
      }
    }
    if (startCount === 0) {
      done({ rows, failures, attempted: 0 });
    }
  }

  // app/js/data/streamResolver.js
  var MAX_PROVIDERS = 10;
  var MAX_STREAMS = 40;
  function hostOf2(url) {
    var match = /^https?:\/\/[^/]+/i.exec(String(url || ""));
    return match ? match[0] : "(no host)";
  }
  function advertises(entry, resource) {
    var list = entry && entry.resources || [];
    return list.indexOf(resource) > -1;
  }
  function typeAllowed(entry, type) {
    var types = entry && entry.types || [];
    return types.length === 0 || types.indexOf(type) > -1;
  }
  function prefixAllowed(entry, id) {
    var prefixes = entry && entry.idPrefixes || [];
    if (!prefixes.length) {
      return true;
    }
    var value = String(id);
    for (var i = 0; i < prefixes.length; i++) {
      if (value.indexOf(prefixes[i]) === 0) {
        return true;
      }
    }
    return false;
  }
  function streamCandidates(addons, type, id) {
    var out = [];
    var skipped = [];
    var list = addons || [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || !entry.url) {
        continue;
      }
      var known = !!entry.resources && entry.resources.length > 0;
      if (known && !advertises(entry, "stream")) {
        skipped.push({ name: String(entry.name || "Add-on"), host: hostOf2(entry.url), reason: "noStreamResource" });
        continue;
      }
      if (!typeAllowed(entry, type)) {
        skipped.push({ name: String(entry.name || "Add-on"), host: hostOf2(entry.url), reason: "typeMismatch" });
        continue;
      }
      if (!prefixAllowed(entry, id)) {
        skipped.push({ name: String(entry.name || "Add-on"), host: hostOf2(entry.url), reason: "idPrefixes" });
        continue;
      }
      if (out.length >= MAX_PROVIDERS) {
        skipped.push({ name: String(entry.name || "Add-on"), host: hostOf2(entry.url), reason: "limit" });
        continue;
      }
      out.push({ entry, unverified: !known });
    }
    return { providers: out, skipped };
  }
  function streamProviders(addons, type, id) {
    var found = streamCandidates(addons, type, id);
    var out = [];
    for (var i = 0; i < found.providers.length; i++) {
      out.push(found.providers[i].entry);
    }
    return out;
  }
  var lastReport = null;
  function lastStreamReport() {
    return lastReport;
  }
  function streamKey(stream) {
    if (stream.url) {
      return "u:" + String(stream.url);
    }
    if (stream.infoHash) {
      return "h:" + String(stream.infoHash) + ":" + String(stream.fileIdx || 0);
    }
    if (stream.externalUrl) {
      return "e:" + String(stream.externalUrl);
    }
    if (stream.ytId) {
      return "y:" + String(stream.ytId);
    }
    return "n:" + String(stream.name || "") + "|" + String(stream.title || "");
  }
  function resolveStreams(options, done) {
    var opts = options || {};
    var item = opts.item || {};
    var type = opts.type || item.kind || "movie";
    var id = opts.videoId || item.id;
    var found = streamCandidates(opts.addons || [], type, id);
    var providers = found.providers;
    var report = [];
    var streams = [];
    var seen = {};
    var pending = providers.length;
    var logStart = Date.now() - 1;
    function statusFor(entry) {
      var log2 = diagnosticsList();
      var host = hostOf2(entry.url);
      for (var i = log2.length - 1; i >= 0; i--) {
        if (log2[i].when >= logStart && log2[i].resource === "stream" && log2[i].host === host && String(log2[i].id) === String(id)) {
          return log2[i];
        }
      }
      return null;
    }
    function finish() {
      var ordered = report.slice().sort(function(a, b) {
        return a.index - b.index;
      });
      var result = {
        streams: streams.slice(0, MAX_STREAMS),
        providers: ordered,
        skipped: found.skipped,
        candidates: providers.length,
        attempted: providers.length,
        id: String(id || ""),
        type,
        when: Date.now()
      };
      lastReport = {
        streamCount: result.streams.length,
        providers: ordered,
        skipped: found.skipped,
        candidates: result.candidates,
        attempted: result.attempted,
        id: result.id,
        type: result.type,
        when: result.when
      };
      done(result);
    }
    if (!id) {
      lastReport = {
        streamCount: 0,
        providers: [],
        skipped: found.skipped,
        candidates: 0,
        attempted: 0,
        id: "",
        type,
        when: Date.now()
      };
      done({
        streams: [],
        providers: [],
        skipped: found.skipped,
        candidates: 0,
        attempted: 0,
        id: "",
        type
      });
      return;
    }
    if (!pending) {
      finish();
      return;
    }
    function settle(index, entry, status, reason, list) {
      var kept = [];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var stream = list[i];
          if (!stream || typeof stream !== "object") {
            continue;
          }
          var key = streamKey(stream);
          if (seen[key]) {
            continue;
          }
          seen[key] = true;
          kept.push(stream);
          streams.push(stream);
        }
      }
      var logEntry = statusFor(entry);
      report.push({
        index,
        name: String(entry.name || "Add-on"),
        host: hostOf2(entry.url),
        status,
        reason: reason || "",
        httpStatus: logEntry ? logEntry.status : 0,
        count: kept.length
      });
      pending -= 1;
      if (pending === 0) {
        finish();
      }
    }
    for (var p = 0; p < providers.length; p++) {
      (function(provider, index) {
        var entry = provider.entry;
        addonClient.streams(entry.url, type, id, function(err, data) {
          if (err) {
            settle(index, entry, "error", failureReason(err), null);
            return;
          }
          var list = data && data.streams && data.streams.length ? data.streams : [];
          settle(index, entry, list.length ? "ok" : "empty", "", list);
        });
      })(providers[p], p);
    }
  }

  // app/js/playback/player.js
  var TICK_MS = 400;
  var HUD_HIDE_MS = 5e3;
  var OPEN_TIMEOUT_MS = 25e3;
  var PREPARE_TIMEOUT_MS = 12e3;
  var SEEK_STEP_MS = 1e4;
  var FF_STEP_MS = 3e4;
  function formatTime(ms) {
    var total = Math.max(0, Math.round((ms || 0) / 1e3));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }
  function reasonText(reason) {
    if (reason === "torrent" || reason === "magnet" || reason === "infoHash") {
      return t("player.torrent");
    }
    if (reason === "notWebReady") {
      return t("player.notWebReady");
    }
    if (reason === "external" || reason === "yt" || reason === "scheme") {
      return t("player.external");
    }
    if (reason === "expired") {
      return t("player.expired");
    }
    if (reason === "codec") {
      return t("player.codec");
    }
    if (reason === "network") {
      return t("player.network");
    }
    if (reason === "timeout") {
      return t("player.timeout");
    }
    if (reason === "empty" || reason === "noUrl") {
      return t("player.noSources");
    }
    return t("player.unsupported");
  }
  function html5Reason(error) {
    if (!error) {
      return "unsupported";
    }
    if (error.code === 2) {
      return "network";
    }
    if (error.code === 3) {
      return "codec";
    }
    if (error.code === 4) {
      return "expired";
    }
    return "unsupported";
  }
  function createPlayer(options) {
    var opts = options || {};
    var root = document.createElement("div");
    root.className = "player";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("data-player", "1");
    var video = document.createElement("video");
    video.className = "player__video";
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "metadata");
    video.setAttribute("data-backend", "html5");
    var hud = document.createElement("div");
    hud.className = "player__hud";
    var top = document.createElement("div");
    top.className = "player__top";
    var titleEl = document.createElement("h2");
    titleEl.className = "player__title";
    var backendEl = document.createElement("span");
    backendEl.className = "player__backend";
    top.appendChild(titleEl);
    top.appendChild(backendEl);
    var center = document.createElement("div");
    center.className = "player__center";
    var spinner = document.createElement("div");
    spinner.className = "player__spinner";
    var errorBox = document.createElement("div");
    errorBox.className = "player__error";
    var errorText = document.createElement("div");
    errorText.className = "player__errorText";
    var errorHint = document.createElement("div");
    errorHint.className = "player__errorHint";
    errorBox.appendChild(errorText);
    errorBox.appendChild(errorHint);
    center.appendChild(spinner);
    center.appendChild(errorBox);
    var bottom = document.createElement("div");
    bottom.className = "player__bottom";
    var bar = document.createElement("div");
    bar.className = "player__bar";
    var buffered = document.createElement("div");
    buffered.className = "player__buffered";
    var played = document.createElement("div");
    played.className = "player__played";
    var knob = document.createElement("div");
    knob.className = "player__knob";
    bar.appendChild(buffered);
    bar.appendChild(played);
    bar.appendChild(knob);
    var row = document.createElement("div");
    row.className = "player__row";
    var timeEl = document.createElement("span");
    timeEl.className = "player__time";
    var statusEl = document.createElement("span");
    statusEl.className = "player__status";
    var hintEl = document.createElement("span");
    hintEl.className = "player__hint";
    hintEl.textContent = t("player.hint");
    row.appendChild(timeEl);
    row.appendChild(statusEl);
    row.appendChild(hintEl);
    bottom.appendChild(bar);
    bottom.appendChild(row);
    hud.appendChild(top);
    hud.appendChild(center);
    hud.appendChild(bottom);
    root.appendChild(video);
    root.appendChild(hud);
    var state = {
      open: false,
      backend: "",
      status: "idle",
      // idle | loading | buffering | playing | paused | ended | error
      position: 0,
      duration: 0,
      buffered: 0,
      error: "",
      url: "",
      type: "",
      title: ""
    };
    var backend = null;
    var backendOrder = [];
    var ticker = null;
    var hudTimer = null;
    var openTimer = null;
    var onClose = opts.onClose || null;
    var forcedBackend = opts.forceBackend || "";
    function avplayActive() {
      return state.backend === "avplay";
    }
    function rootClass() {
      return "player" + (state.open ? " is-open" : "") + (state.error ? " has-error" : "") + (avplayActive() ? " is-avplay" : "") + (hud.className.indexOf("is-idle") > -1 ? " is-idle" : "");
    }
    function paint() {
      if (!state.open) {
        return;
      }
      var pct = state.duration > 0 ? Math.min(100, state.position / state.duration * 100) : 0;
      var bPct = state.duration > 0 ? Math.min(100, state.buffered / state.duration * 100) : 0;
      played.style.width = pct + "%";
      buffered.style.width = bPct + "%";
      knob.style.left = pct + "%";
      bar.className = "player__bar" + (state.duration > 0 ? "" : " is-live");
      timeEl.textContent = formatTime(state.position) + " / " + formatTime(state.duration);
      var statusText = "";
      if (state.status === "buffering" || state.status === "loading") {
        statusText = t("player.loading");
      } else if (state.status === "ended") {
        statusText = t("player.ended");
      }
      statusEl.textContent = statusText;
      var busy = state.status === "buffering" || state.status === "loading";
      spinner.className = "player__spinner" + (busy && !state.error ? "" : " is-hidden");
      errorBox.className = "player__error" + (state.error ? " is-visible" : "");
      root.className = rootClass();
      backendEl.textContent = state.backend === "avplay" ? t("player.backendAvplay") : t("player.backendHtml5");
    }
    function showHud() {
      hud.className = "player__hud";
      if (hudTimer) {
        clearTimeout(hudTimer);
        hudTimer = null;
      }
      root.className = rootClass();
      if (state.status === "playing") {
        hudTimer = setTimeout(function() {
          hud.className = "player__hud is-idle";
          root.className = rootClass();
        }, HUD_HIDE_MS);
      }
    }
    var html5 = {
      name: "html5",
      open: function(url, type, done) {
        video.setAttribute("data-type", type || "auto");
        try {
          video.setAttribute("src", url);
          video.load();
          var attempt = video.play();
          if (attempt && typeof attempt.catch === "function") {
            attempt.catch(function() {
            });
          }
        } catch (err) {
          done(err);
          return;
        }
        done(null);
      },
      play: function() {
        var attempt = video.play();
        if (attempt && typeof attempt.catch === "function") {
          attempt.catch(function() {
          });
        }
      },
      pause: function() {
        try {
          video.pause();
        } catch (err) {
        }
      },
      seek: function(ms) {
        try {
          video.currentTime = ms / 1e3;
        } catch (err) {
        }
      },
      stop: function() {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch (err) {
        }
      },
      time: function() {
        return (video.currentTime || 0) * 1e3;
      },
      duration: function() {
        var value = video.duration;
        return isFinite(value) ? value * 1e3 : 0;
      },
      buffered: function() {
        try {
          if (video.buffered && video.buffered.length > 0) {
            return video.buffered.end(video.buffered.length - 1) * 1e3;
          }
        } catch (err) {
        }
        return 0;
      }
    };
    video.addEventListener("loadedmetadata", function() {
      state.duration = html5.duration();
      if (state.status === "loading") {
        state.status = "buffering";
      }
      paint();
    });
    video.addEventListener("playing", function() {
      clearOpenTimer();
      state.status = "playing";
      showHud();
      paint();
    });
    video.addEventListener("pause", function() {
      if (state.status === "ended" || state.status === "error") {
        return;
      }
      state.status = "paused";
      showHud();
      paint();
    });
    video.addEventListener("waiting", function() {
      if (state.status === "playing") {
        state.status = "buffering";
        paint();
      }
    });
    video.addEventListener("progress", function() {
      state.buffered = html5.buffered();
      paint();
    });
    video.addEventListener("ended", function() {
      state.status = "ended";
      state.position = state.duration;
      stopTicker();
      showHud();
      paint();
    });
    video.addEventListener("error", function() {
      if (!state.open || avplayActive()) {
        return;
      }
      fail(html5Reason(video.error), video.error ? String(video.error.message || "") : "");
    });
    function createAvPlay(api) {
      var rect = platform.displayRect ? platform.displayRect() : { x: 0, y: 0, w: 1920, h: 1080 };
      var listener = {
        onbufferingstart: function() {
          state.status = "buffering";
          paint();
        },
        onbufferingprogress: function() {
          state.status = "buffering";
        },
        onbufferingcomplete: function() {
          state.status = "playing";
          showHud();
          paint();
        },
        oncurrentplaytime: function(ms) {
          state.position = ms;
        },
        onstreamcompleted: function() {
          state.status = "ended";
          state.position = state.duration;
          stopTicker();
          showHud();
          paint();
        },
        onerror: function(err) {
          var code = err && (err.code || err.error_code);
          fail(code === 1 ? "network" : "unsupported", String(err && err.message || code || ""));
        },
        onplaying: function() {
          clearOpenTimer();
          state.status = "playing";
          showHud();
          paint();
        }
      };
      return {
        name: "avplay",
        open: function(url, type, done) {
          var settled = false;
          try {
            api.open(url);
            if (api.setDisplayRect) {
              api.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
            }
            if (api.setListener) {
              api.setListener(listener);
            }
          } catch (err) {
            done(err);
            return;
          }
          var guard = setTimeout(function() {
            if (!settled) {
              settled = true;
              done(new Error("prepare timeout"));
            }
          }, PREPARE_TIMEOUT_MS);
          try {
            api.prepareAsync(
              function() {
                if (settled) {
                  return;
                }
                settled = true;
                clearTimeout(guard);
                try {
                  state.duration = api.getDuration ? api.getDuration() : 0;
                  api.play();
                } catch (err) {
                  done(err);
                  return;
                }
                done(null);
              },
              function(err) {
                if (settled) {
                  return;
                }
                settled = true;
                clearTimeout(guard);
                done(err || new Error("prepare failed"));
              }
            );
          } catch (err2) {
            settled = true;
            clearTimeout(guard);
            done(err2);
          }
        },
        play: function() {
          try {
            api.play();
          } catch (err) {
          }
        },
        pause: function() {
          try {
            api.pause();
          } catch (err) {
          }
        },
        seek: function(ms) {
          try {
            api.seekTo(ms);
          } catch (err) {
          }
        },
        stop: function() {
          try {
            api.stop();
          } catch (err) {
          }
          try {
            api.close();
          } catch (err2) {
          }
        },
        time: function() {
          try {
            return api.getCurrentTime ? api.getCurrentTime() : state.position;
          } catch (err) {
            return state.position;
          }
        },
        duration: function() {
          try {
            return api.getDuration ? api.getDuration() : state.duration;
          } catch (err) {
            return state.duration;
          }
        },
        buffered: function() {
          try {
            if (api.getBufferedAmount) {
              return api.getBufferedAmount() / 100 * state.duration;
            }
          } catch (err) {
          }
          return 0;
        }
      };
    }
    function clearOpenTimer() {
      if (openTimer) {
        clearTimeout(openTimer);
        openTimer = null;
      }
    }
    function stopTicker() {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    }
    function startTicker() {
      stopTicker();
      ticker = setInterval(function() {
        if (!backend || !state.open || state.status === "error") {
          return;
        }
        var time = backend.time();
        var duration = backend.duration();
        if (duration > 0) {
          state.duration = duration;
        }
        if (time >= 0) {
          state.position = time;
        }
        var bufferedAmount = backend.buffered();
        if (bufferedAmount > 0) {
          state.buffered = bufferedAmount;
        }
        paint();
      }, TICK_MS);
    }
    function teardown() {
      stopTicker();
      clearOpenTimer();
      if (hudTimer) {
        clearTimeout(hudTimer);
        hudTimer = null;
      }
      if (backend) {
        try {
          backend.stop();
        } catch (err) {
          logWarn("player: backend stop failed", err && err.message);
        }
        backend = null;
      }
      var html = document.documentElement;
      if (html.className.indexOf("is-avplay") > -1) {
        html.className = html.className.replace(/\s*is-avplay/g, "").replace(/^\s+/, "");
      }
    }
    function fail(reason, detail) {
      stopTicker();
      clearOpenTimer();
      state.status = "error";
      state.error = reason;
      errorText.textContent = reasonText(reason);
      errorHint.textContent = detail ? String(detail).slice(0, 120) : t("player.hint");
      spinner.className = "player__spinner is-hidden";
      errorBox.className = "player__error is-visible";
      hud.className = "player__hud";
      root.className = "player is-open has-error" + (avplayActive() ? " is-avplay" : "");
      if (detail) {
        logWarn("player: " + reason);
      }
    }
    function tryBackend(index) {
      if (index >= backendOrder.length) {
        fail(state.error || "unsupported", "");
        return;
      }
      var name = backendOrder[index];
      if (name === "avplay") {
        var api = platform.avplayApi ? platform.avplayApi() : null;
        if (!api) {
          tryBackend(index + 1);
          return;
        }
        backend = createAvPlay(api);
        state.backend = "avplay";
        video.setAttribute("data-backend", "avplay");
        video.removeAttribute("src");
        document.documentElement.className = (document.documentElement.className + " is-avplay").replace(/^\s+/, "");
      } else {
        backend = html5;
        state.backend = "html5";
        video.setAttribute("data-backend", "html5");
      }
      state.status = "loading";
      paint();
      backend.open(state.url, state.type, function(err) {
        if (!state.open) {
          return;
        }
        if (err) {
          logWarn("player: " + name + " could not open the source", err && err.message);
          try {
            backend.stop();
          } catch (stopErr) {
          }
          backend = null;
          tryBackend(index + 1);
          return;
        }
        startTicker();
        paint();
      });
    }
    function open(source, meta) {
      if (state.open) {
        close(false);
      }
      var info = meta || {};
      state.open = true;
      state.backend = "";
      state.status = "loading";
      state.position = 0;
      state.duration = 0;
      state.buffered = 0;
      state.error = "";
      state.url = source && source.url ? source.url : "";
      state.type = source && source.type ? source.type : "auto";
      state.title = info.title || t("player.titleFallback");
      titleEl.textContent = state.title;
      errorText.textContent = "";
      errorHint.textContent = "";
      hud.className = "player__hud";
      root.className = "player is-open";
      backendEl.textContent = "";
      paint();
      if (!source || source.ok !== true || !state.url) {
        fail(source && source.reason || "noUrl", "");
        return;
      }
      backendOrder = [];
      if (forcedBackend === "html5") {
        backendOrder.push("html5");
      } else if (forcedBackend === "avplay") {
        backendOrder.push("avplay", "html5");
      } else {
        if (platform.canUseAvPlay && platform.canUseAvPlay()) {
          backendOrder.push("avplay");
        }
        backendOrder.push("html5");
      }
      logInfo("player: engines " + backendOrder.join(",") + " type=" + state.type);
      clearOpenTimer();
      openTimer = setTimeout(function() {
        if (state.open && state.status !== "playing" && state.status !== "paused" && !state.error) {
          fail("timeout", state.status);
        }
      }, OPEN_TIMEOUT_MS);
      tryBackend(0);
    }
    function play() {
      if (!backend || state.error) {
        return;
      }
      backend.play();
      state.status = "playing";
      showHud();
      paint();
    }
    function pause() {
      if (!backend || state.error) {
        return;
      }
      backend.pause();
      state.status = "paused";
      showHud();
      paint();
    }
    function toggle() {
      if (!backend || state.error) {
        return;
      }
      if (state.status === "playing") {
        pause();
      } else {
        play();
      }
    }
    function seekTo(ms) {
      if (!backend || state.error) {
        return;
      }
      var limit = state.duration > 0 ? state.duration - 1e3 : ms;
      var target = Math.max(0, Math.min(ms || 0, limit));
      backend.seek(target);
      state.position = target;
      showHud();
      paint();
    }
    function seekBy(deltaMs) {
      seekTo(state.position + deltaMs);
    }
    function close(notify) {
      var wasOpen = state.open;
      teardown();
      state.open = false;
      state.status = "idle";
      state.backend = "";
      state.error = "";
      state.position = 0;
      state.duration = 0;
      state.buffered = 0;
      state.url = "";
      root.className = "player";
      hud.className = "player__hud";
      errorBox.className = "player__error";
      timeEl.textContent = "";
      statusEl.textContent = "";
      if (wasOpen && notify !== false && onClose) {
        onClose();
      }
    }
    function handleAction(action) {
      if (!state.open) {
        return false;
      }
      if (action === "enter") {
        toggle();
        return true;
      }
      if (action === "left") {
        seekBy(-SEEK_STEP_MS);
        return true;
      }
      if (action === "right") {
        seekBy(SEEK_STEP_MS);
        return true;
      }
      if (action === "up" || action === "down") {
        showHud();
        return true;
      }
      if (action === "media-play") {
        play();
        return true;
      }
      if (action === "media-pause") {
        pause();
        return true;
      }
      if (action === "media-toggle") {
        toggle();
        return true;
      }
      if (action === "media-ff") {
        seekBy(FF_STEP_MS);
        return true;
      }
      if (action === "media-rew") {
        seekBy(-FF_STEP_MS);
        return true;
      }
      return false;
    }
    return {
      el: root,
      video,
      isOpen: function() {
        return state.open;
      },
      open,
      close,
      play,
      pause,
      toggle,
      seekBy,
      seekTo,
      handleAction,
      showHud,
      state: function() {
        return {
          open: state.open,
          backend: state.backend,
          status: state.status,
          position: Math.round(state.position),
          duration: Math.round(state.duration),
          buffered: Math.round(state.buffered),
          error: state.error,
          type: state.type,
          title: state.title
        };
      },
      setOnClose: function(fn) {
        onClose = fn;
      }
    };
  }

  // app/js/playback/sources.js
  var HLS = /\.m3u8(?:[?#]|$)/i;
  var DASH = /\.mpd(?:[?#]|$)/i;
  var PROGRESSIVE = /\.(?:mp4|m4v|mov|webm|mkv|ts|avi|mp3|m4a|aac|wav|ogg)(?:[?#]|$)/i;
  var HLS_HINT = /(?:type=m3u8|format=hls|\/hls\/|:hls)/i;
  var DASH_HINT = /(?:type=mpd|format=dash|\/dash\/|:dash)/i;
  var KIND = {
    HTTP: "http",
    TORRENT: "torrent",
    EXTERNAL: "external",
    INVALID: "invalid"
  };
  function typeOf(text) {
    var value = String(text || "");
    if (HLS.test(value) || HLS_HINT.test(value)) {
      return "hls";
    }
    if (DASH.test(value) || DASH_HINT.test(value)) {
      return "dash";
    }
    if (PROGRESSIVE.test(value)) {
      return "progressive";
    }
    return "auto";
  }
  function labelOf(stream) {
    var s = stream || {};
    var hints = s.behaviorHints || {};
    var parts = [];
    if (s.name) {
      parts.push(String(s.name));
    }
    if (s.title && String(s.title) !== String(s.name || "")) {
      parts.push(String(s.title));
    }
    if (!parts.length && hints.filename) {
      parts.push(String(hints.filename));
    }
    if (!parts.length) {
      parts.push("stream");
    }
    return parts.join(" · ");
  }
  function classifyStream(stream) {
    var s = stream || {};
    var hints = s.behaviorHints || {};
    var label = labelOf(s);
    if (!s || typeof s !== "object") {
      return { ok: false, kind: KIND.INVALID, url: "", type: "", label, reason: "empty" };
    }
    var url = s.url ? String(s.url).trim() : "";
    if (!url) {
      if (s.infoHash || s.btih || typeof s.fileIdx === "number" || s.sources) {
        return { ok: false, kind: KIND.TORRENT, url: "", type: "", label, reason: "torrent" };
      }
      if (s.ytId) {
        return { ok: false, kind: KIND.EXTERNAL, url: "", type: "", label, reason: "yt" };
      }
      if (s.externalUrl) {
        return {
          ok: false,
          kind: KIND.EXTERNAL,
          url: String(s.externalUrl),
          type: "",
          label,
          reason: "external"
        };
      }
      return { ok: false, kind: KIND.INVALID, url: "", type: "", label, reason: "noUrl" };
    }
    if (/^magnet:/i.test(url)) {
      return { ok: false, kind: KIND.TORRENT, url: "", type: "", label, reason: "torrent" };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, kind: KIND.INVALID, url: "", type: "", label, reason: "scheme" };
    }
    if (hints.notWebReady === true) {
      return { ok: false, kind: KIND.EXTERNAL, url, type: "", label, reason: "notWebReady" };
    }
    var type = typeOf(url);
    if (type === "auto" && hints.filename) {
      type = typeOf(hints.filename);
    }
    return { ok: true, kind: KIND.HTTP, url, type, label, reason: "" };
  }

  // app/js/main.js
  var STAGE_WIDTH = 1920;
  var STAGE_HEIGHT = 1080;
  var SCROLL_PAD = 24;
  var RAIL_PUSH_FALLBACK = 150;
  var PROFILE_ITEM = { id: "profile", labelKey: "nav.profile", icon: "profile", profile: true };
  var RAIL_ITEMS = [
    { id: "search", labelKey: "nav.search", icon: "search" },
    { id: "home", labelKey: "nav.home", icon: "home", active: true },
    { id: "catalog", labelKey: "nav.catalog", icon: "compass" },
    { id: "lists", labelKey: "nav.lists", icon: "bookmark" },
    { id: "addons", labelKey: "nav.addons", icon: "addons" },
    { id: "language", labelKey: "nav.language", icon: "globe", dynamic: "language", bottom: true },
    { id: "settings", labelKey: "nav.settings", icon: "settings", bottom: true }
  ];
  function boot() {
    var appEl = document.getElementById("app");
    var stageEl = document.getElementById("stage");
    initLanguage();
    var platformInfo = platform.init();
    logInfo("boot", platformInfo);
    var focusManager = new FocusManager({ onFocus: onFocusChanged });
    var router = createRouter();
    var toast = createToast();
    var shelves = [];
    var previousFocus = null;
    var scrollY = 0;
    var railPush = 0;
    var rail = createRail({ profile: PROFILE_ITEM, items: RAIL_ITEMS, language: getLanguage() });
    appEl.appendChild(rail.el);
    var railPushAmount = RAIL_PUSH_FALLBACK;
    function measureRailPush() {
      var panel = rail.el.querySelector(".rail__panel");
      if (panel) {
        var width = panel.getBoundingClientRect().width;
        if (width > 0) {
          railPushAmount = Math.round(width);
        }
      }
      return railPushAmount;
    }
    var scroller = document.createElement("div");
    scroller.className = "scroller";
    var hero = createHero(getHero(), getLanguage());
    scroller.appendChild(hero.el);
    var rowsEl = document.createElement("div");
    rowsEl.className = "rows";
    scroller.appendChild(rowsEl);
    appEl.appendChild(scroller);
    buildMockRows();
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
    function applyScroller() {
      scroller.style.transform = "translate3d(" + railPush + "px," + -scrollY + "px,0)";
    }
    function setRailPush(px) {
      if (railPush === px) {
        return;
      }
      railPush = px;
      applyScroller();
    }
    function scrollToRow(row) {
      if (row === rowsEl.firstElementChild) {
        scrollY = 0;
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
    var imeField = null;
    function releaseIme() {
      var field = imeField;
      if (!field) {
        return false;
      }
      imeField = null;
      try {
        field.blur();
      } catch (err) {
      }
      return true;
    }
    function onFocusChanged(el) {
      var inRail = !!el.closest(".rail");
      rail.setExpanded(inRail);
      setRailPush(inRail ? measureRailPush() : 0);
      if (typeof el.__reveal === "function") {
        el.__reveal();
      }
      if (el.tagName === "INPUT") {
        imeField = el;
        try {
          el.focus();
        } catch (err) {
        }
      } else {
        releaseIme();
      }
      var row = el.closest(".row");
      if (row) {
        scrollToRow(row);
      }
    }
    var detailsScreen = {
      name: "details",
      show: function() {
        details.el.classList.add("is-open");
        focusManager.setScope(details.el);
        if (!focusManager.focus(details.buttons[0].el)) {
          focusManager.focusFirst();
        }
      },
      hide: function() {
        if (player.isOpen()) {
          player.close(false);
        }
        details.el.classList.remove("is-open");
        unregisterList(streamFocusables);
        streamFocusables = [];
        unregisterList(episodeFocusables);
        episodeFocusables = [];
        focusManager.setScope(null);
        var restored = previousFocus ? focusManager.focus(previousFocus) : false;
        previousFocus = null;
        if (!restored) {
          focusManager.focusFirst();
        }
      }
    };
    function openDetails(item) {
      if (details.isOpen() || router.depth() > 0) {
        return;
      }
      previousFocus = focusManager.getCurrent();
      selectedVideoId = item.id;
      selectedVideoLabel = "";
      details.setItem(item, getLanguage());
      details.setStreams([]);
      syncEpisodeFocusables();
      syncStreamFocusables();
      router.push(detailsScreen);
      if (!item.addonUrl) {
        return;
      }
      var type = item.kind || "movie";
      addonClient.meta(item.addonUrl, type, item.id, function(err, data) {
        if (!err && data && data.meta && details.isOpen()) {
          details.setItem(normalizeMeta(data.meta, item.addonUrl), getLanguage());
          syncEpisodeFocusables();
        }
      });
      loadStreams(item.id, false);
    }
    function closeDetails() {
      while (router.depth() > 0) {
        router.pop();
      }
    }
    var playerReturnFocus = null;
    var streamFocusables = [];
    var episodeFocusables = [];
    var selectedVideoId = "";
    var selectedVideoLabel = "";
    function playerTitle() {
      var item = details.currentItem();
      var parts = [];
      if (item) {
        parts.push(details.title());
      }
      if (selectedVideoLabel) {
        parts.push(selectedVideoLabel);
      }
      return parts.join(" · ");
    }
    function playStream(stream) {
      var info = classifyStream(stream);
      playerReturnFocus = focusManager.getCurrent();
      player.open(info, { title: playerTitle() });
      logInfo("playback: " + (info.ok ? info.type : "refused:" + info.reason));
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
    function playCurrent() {
      var item = details.currentItem();
      if (!item || !item.addonUrl) {
        toast.show(t("common.wip"));
        return;
      }
      var stream = firstPlayableStream();
      if (!stream) {
        player.open({ ok: false, reason: "noUrl", url: "", type: "", label: "" }, {
          title: playerTitle()
        });
        return;
      }
      playStream(stream);
    }
    player.setOnClose(function() {
      focusManager.setScope(details.el);
      var restored = playerReturnFocus ? focusManager.focus(playerReturnFocus) : false;
      playerReturnFocus = null;
      if (!restored && details.sourceRows().length) {
        focusManager.focus(details.sourceRows()[0].el);
      }
    });
    function loadStreams(videoId, focusFirst) {
      var item = details.currentItem();
      if (!item || !item.addonUrl) {
        details.setStreams([], true, null);
        syncStreamFocusables();
        return;
      }
      details.setStreams([], false);
      details.setSourcesStatus("loading");
      syncStreamFocusables();
      resolveStreams(
        {
          item,
          type: item.kind || "movie",
          videoId: videoId || "",
          addons: listAddons()
        },
        function(result) {
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
        (function(row) {
          focusManager.register(row.el, function() {
            playStream(row.stream);
          });
          streamFocusables.push(row.el);
        })(rows[i]);
      }
    }
    function syncEpisodeFocusables() {
      unregisterList(episodeFocusables);
      episodeFocusables = [];
      var cards = details.episodeCards();
      for (var i = 0; i < cards.length; i++) {
        (function(card) {
          card.el.__reveal = null;
          focusManager.register(card.el, function() {
            if (!card.videoId) {
              toast.show(t("details.mockEpisode"));
              return;
            }
            selectEpisode(card);
          });
          episodeFocusables.push(card.el);
        })(cards[i]);
      }
    }
    function selectEpisode(card) {
      var item = details.currentItem();
      if (!item || !item.addonUrl) {
        return;
      }
      selectedVideoId = card.videoId;
      selectedVideoLabel = card.label || "";
      loadStreams(card.videoId, true);
    }
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
      onAdd: function(url) {
        addonsView.setStatus(t("common.loading"));
        addAddon(url, function(err, entry, already) {
          if (err) {
            addonsView.setStatus(t("addons.unreachable") + " · " + err.message, true);
            return;
          }
          addonsView.setStatus(already ? t("addons.installedTag") : t("addons.added"));
          addonsView.render();
          refocusAddons();
          loadAddonCatalogs();
        });
      },
      onRemove: function(url) {
        removeAddon(url);
        addonsView.setStatus(t("addons.removed"));
        addonsView.render();
        refocusAddons();
        loadAddonCatalogs();
      },
      onDiagnostics: openDiagnostics
    });
    var addonsScreen = {
      name: "addons",
      show: function() {
        addonsView.el.classList.add("is-open");
        addonsView.render();
        addonsView.setStatus("");
        focusManager.setScope(addonsView.el);
        registerAddonFocusables();
        var list = addonsView.focusables();
        if (list.length) {
          focusManager.focus(list[0].el);
        } else {
          focusManager.focusFirst();
        }
      },
      hide: function() {
        addonsView.el.classList.remove("is-open");
        unregisterAddonFocusables();
        focusManager.setScope(null);
        var restored = addonsReturnFocus ? focusManager.focus(addonsReturnFocus) : false;
        addonsReturnFocus = null;
        if (!restored) {
          focusManager.focusFirst();
        }
      }
    };
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
    function importProfile(input) {
      return new Promise(function(resolve, reject) {
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
              imported,
              skipped,
              profiles: parsed.profiles.length,
              lists: parsed.lists,
              failures: failures.slice(0, 8)
            });
            return;
          }
          var url = urls[index];
          index += 1;
          addAddon(url, function(err) {
            if (err) {
              skipped += 1;
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
    function focusImportAction() {
      var target = settingsView.importButton();
      if (target && focusManager.focus(target)) {
        return true;
      }
      return focusManager.focusFirst();
    }
    function runImport(promiseSource) {
      if (importing) {
        return;
      }
      importing = true;
      settingsView.setStatus(t("common.loading"));
      promiseSource().then(
        function(result) {
          importing = false;
          settingsView.setStatus(
            t("settings.done") + " " + result.imported + " / " + (result.imported + result.skipped) + (result.skipped ? " · " + t("settings.seeDiagnostics") : "")
          );
          settingsView.render();
          registerSettings();
          focusImportAction();
        },
        function(err) {
          importing = false;
          settingsView.setStatus(t("settings.invalid") + " · " + err.message, true);
          focusImportAction();
        }
      );
    }
    settingsView.setHandlers({
      onImportUrl: function(url) {
        runImport(function() {
          return new Promise(function(resolve, reject) {
            addonClient.json(url, function(err, data) {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          }).then(function(data) {
            return importProfile(data);
          });
        });
      },
      onImportText: function(text) {
        runImport(function() {
          return importProfile(text);
        });
      },
      onClose: function() {
        router.pop();
      }
    });
    var settingsScreen = {
      name: "settings",
      show: function() {
        settingsView.el.classList.add("is-open");
        settingsView.render();
        settingsView.setStatus("");
        focusManager.setScope(settingsView.el);
        registerSettings();
        var list = settingsView.focusables();
        if (list.length) {
          focusManager.focus(list[0].el);
        } else {
          focusManager.focusFirst();
        }
      },
      hide: function() {
        settingsView.el.classList.remove("is-open");
        unregisterSettings();
        focusManager.setScope(null);
        var restored = settingsReturnFocus ? focusManager.focus(settingsReturnFocus) : false;
        settingsReturnFocus = null;
        if (!restored) {
          focusManager.focusFirst();
        }
      }
    };
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
      return "origin=" + (typeof location !== "undefined" ? location.origin : "?") + " · avplay=" + (probe.avplay ? "yes" : "no") + " · webapis=" + (probe.webapis ? "yes" : "no") + " · " + (typeof navigator !== "undefined" ? navigator.userAgent : "");
    }
    function renderDiagnostics() {
      diagnosticsView.render({
        environment: envSummary(),
        entries: diagnosticsList(),
        sources: lastStreamReport()
      });
    }
    function openDiagnostics() {
      diagnosticsReturnFocus = focusManager.getCurrent();
      router.push(diagnosticsScreen);
    }
    var diagnosticsScreen = {
      name: "diagnostics",
      show: function() {
        diagnosticsView.el.classList.add("is-open");
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
      hide: function() {
        diagnosticsView.el.classList.remove("is-open");
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
      onRetry: function() {
        clearDiagnostics();
        loadAddonCatalogs();
        renderDiagnostics();
      },
      onClose: function() {
        router.pop();
      }
    });
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
      var errors = rowsEl.querySelectorAll("[data-error-row]");
      for (var e = 0; e < errors.length; e++) {
        rowsEl.removeChild(errors[e]);
      }
    }
    function makePager(rowDef, source) {
      var loading = false;
      var exhausted = false;
      return function(shelfApi) {
        if (loading || exhausted) {
          return;
        }
        loading = true;
        fetchCatalogPage(source.addon, source.catalog, rowDef.items.length, function(err, items) {
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
        (function(source, index) {
          var rowDef = {
            id: "addon-" + index,
            titleText: source.catalog.name,
            variant: "poster",
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
        (function(failure) {
          var row = document.createElement("section");
          row.className = "row row--error";
          row.setAttribute("data-error-row", "1");
          var title = document.createElement("h2");
          title.className = "row__title";
          title.textContent = failure.catalog && failure.catalog.name || t("row.error");
          var message = document.createElement("div");
          message.className = "row__error";
          message.textContent = t("row.error") + " · " + failure.error;
          var hint = document.createElement("div");
          hint.className = "row__hint";
          hint.textContent = t("row.retryHint");
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
        buildMockRows();
        return;
      }
      if (catalogLoading) {
        return;
      }
      catalogLoading = true;
      loadCatalogRows(addons, 3, 2, function(result) {
        catalogLoading = false;
        if (result.rows.length) {
          renderAddonRows(result.rows);
        } else {
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
      if (id === "language") {
        toggleLanguage();
        toast.show(t("toast.language"));
        return;
      }
      if (id === "addons") {
        addonsReturnFocus = focusManager.getCurrent();
        router.push(addonsScreen);
        return;
      }
      if (id === "settings") {
        openSettings();
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
    function registerCard(card, shelfApi) {
      card.el.__reveal = function() {
        shelfApi.reveal(card.el);
      };
      focusManager.register(card.el, function() {
        openDetails(card.item);
      });
    }
    for (var s = 0; s < shelves.length; s++) {
      shelves[s].measure();
    }
    for (var b = 0; b < details.buttons.length; b++) {
      (function(button) {
        focusManager.register(button.el, function() {
          if (button.id === "play") {
            playCurrent();
            return;
          }
          toast.show(t("common.wip"));
        });
      })(details.buttons[b]);
    }
    for (var rn = 0; rn < rail.nodes.length; rn++) {
      if (rail.nodes[rn].def.id === "home") {
        focusManager.remember(rail.nodes[rn].el);
      }
    }
    for (var sn = 0; sn < shelves.length; sn++) {
      if (shelves[sn].cards.length > 0) {
        focusManager.remember(shelves[sn].cards[0].el);
      }
    }
    var pressed = {};
    var inputBound = false;
    function keyIdOf(event) {
      return event.keyCode || event.which || event.key || "unknown";
    }
    function clearPressed() {
      pressed = {};
    }
    function handleBack() {
      if (details.isOpen() || router.depth() > 0) {
        closeDetails();
        return;
      }
      platform.exitApp();
    }
    function editableFieldOf(el) {
      if (!el || el.tagName !== "INPUT" || !appEl.contains(el)) {
        return null;
      }
      var type = String(el.getAttribute("type") || "text").toLowerCase();
      return type === "text" || type === "search" || type === "url" ? el : null;
    }
    function commitField(field, moveFocus) {
      if (!field) {
        return;
      }
      field.value = String(field.value || "").trim();
      if (!releaseIme()) {
        try {
          field.blur();
        } catch (err) {
        }
      }
      if (moveFocus && focusManager.getCurrent() === field) {
        var target = settingsView.isOpen() ? settingsView.importButton() : null;
        if (target) {
          focusManager.focus(target);
        } else {
          focusManager.move("right");
        }
      }
    }
    function handleFieldKey(event, field, action) {
      if (event.keyCode === 8 || event.which === 8 || event.key === "Backspace") {
        return true;
      }
      if (action === "enter" || action === "down") {
        if (action === "enter" && event.repeat) {
          return true;
        }
        event.preventDefault();
        commitField(field, true);
        return true;
      }
      if (action === "back") {
        event.preventDefault();
        commitField(field, false);
        return true;
      }
      if (action === "left" || action === "right" || action === "up") {
        return true;
      }
      return false;
    }
    function onKeyDown(event) {
      var action = actionFromEvent(event);
      if (!action) {
        return;
      }
      if (player.isOpen()) {
        var isPlayerTransition = action === "back" || action === "enter" || action === "exit";
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
        if (action === "back") {
          player.close();
          return;
        }
        if (action === "exit") {
          platform.exitApp();
          return;
        }
        player.handleAction(action);
        return;
      }
      var field = editableFieldOf(document.activeElement);
      if (field && handleFieldKey(event, field, action)) {
        return;
      }
      if (!field) {
        event.preventDefault();
      }
      var isTransition = action === "back" || action === "enter" || action === "exit";
      if (isTransition) {
        if (event.repeat) {
          return;
        }
        var id = keyIdOf(event);
        if (pressed[id]) {
          return;
        }
        clearPressed();
        pressed[id] = true;
      }
      if (action === "back") {
        handleBack();
        return;
      }
      if (action === "exit") {
        platform.exitApp();
        return;
      }
      if (isMediaAction(action)) {
        toast.show(t("common.media"));
        return;
      }
      if (action === "enter") {
        var current2 = focusManager.getCurrent();
        if (editableFieldOf(current2)) {
          commitField(current2, true);
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
        return;
      }
      inputBound = true;
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", clearPressed, false);
      document.addEventListener("visibilitychange", clearPressed, false);
    }
    bindInput();
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
        measureRailPush();
        applyScroller();
        for (var n = 0; n < shelves.length; n++) {
          shelves[n].measure();
        }
      },
      false
    );
    renderLanguage();
    fitStage();
    measureRailPush();
    for (var m = 0; m < shelves.length; m++) {
      shelves[m].measure();
    }
    if (shelves.length > 0 && shelves[0].cards.length > 0) {
      focusManager.focus(shelves[0].cards[0].el);
    } else {
      focusManager.focusFirst();
    }
    loadAddonCatalogs();
    refreshAddonMetadata(function(info) {
      if (info && info.refreshed) {
        logInfo("addons: metadata refreshed " + info.refreshed + "/" + info.total);
        loadAddonCatalogs();
      }
    });
    window.WuTizenDebug = {
      profile: {
        importText: function(text) {
          return importProfile(text);
        },
        summary: function() {
          return getProfileSummary();
        }
      },
      openSettings: function() {
        openSettings();
        return true;
      },
      diagnostics: function() {
        return diagnosticsList();
      },
      streams: {
        resolve: function(id, type, videoId) {
          return new Promise(function(resolve) {
            resolveStreams(
              {
                item: { id, kind: type || "movie" },
                type: type || "movie",
                videoId: videoId || "",
                addons: listAddons()
              },
              resolve
            );
          });
        },
        providers: function() {
          return streamProviders(listAddons(), "movie", "tt0000000");
        },
        last: function() {
          return lastStreamReport();
        }
      },
      addonRefresh: function() {
        return new Promise(function(resolve) {
          refreshAddonMetadata(resolve);
        });
      },
      player: {
        state: function() {
          return player.state();
        },
        open: function(stream) {
          player.open(classifyStream(stream), { title: "Debug" });
          return player.state();
        },
        close: function() {
          player.close();
          return player.state();
        },
        toggle: function() {
          player.toggle();
          return player.state();
        },
        seek: function(ms) {
          player.seekTo(ms);
          return player.state();
        },
        handle: function(action) {
          return player.handleAction(action);
        },
        classify: function(stream) {
          return classifyStream(stream);
        }
      },
      addon: {
        add: function(url) {
          return addAddonAsync(url);
        },
        remove: function(url) {
          return removeAddonAsync(url);
        },
        list: function() {
          return listAddons();
        },
        reload: function() {
          loadAddonCatalogs();
          return true;
        },
        openDiagnostics: function() {
          openDiagnostics();
          return true;
        },
        focusFirstCard: function() {
          if (shelves.length && shelves[0].cards.length) {
            return focusManager.focus(shelves[0].cards[0].el);
          }
          return focusManager.focusFirst();
        }
      },
      snapshot: function() {
        var focused = focusManager.getCurrent();
        var zone = "none";
        var focusedId = null;
        if (focused) {
          if (focused.closest(".rail")) {
            zone = "rail";
          } else if (focused.closest(".details")) {
            zone = "overlay";
          } else {
            zone = "content";
          }
          focusedId = focused.getAttribute("data-item-id") || focused.getAttribute("data-rail-id") || focused.getAttribute("data-detail-action");
        }
        var caption = focused ? focused.querySelector(".card__title") : null;
        var detailsTitle = document.querySelector(".details__title");
        var heroTitle = document.querySelector(".hero__title");
        var total = 0;
        for (var i = 0; i < ROWS.length; i++) {
          total += ROWS[i].items.length;
        }
        return {
          language: getLanguage(),
          screen: router.depth() > 0 ? details.isOpen() ? "details" : "overlay" : "home",
          rows: shelves.length,
          cards: document.querySelectorAll(".card").length,
          totalItems: total,
          focusedId,
          focusedZone: zone,
          focusedTitle: caption ? caption.textContent : null,
          railExpanded: rail.isExpanded(),
          railPush,
          railPushAmount,
          heroTitle: heroTitle ? heroTitle.textContent : "",
          detailsOpen: details.isOpen(),
          detailsTitle: detailsTitle ? detailsTitle.textContent : "",
          episodes: document.querySelectorAll(".ep").length,
          sources: document.querySelectorAll(".source-row").length,
          addons: listAddons().length,
          diagnostics: diagnosticsList().length,
          errorRows: document.querySelectorAll("[data-error-row]").length,
          diagnosticsOpen: diagnosticsView.isOpen(),
          settingsOpen: settingsView.isOpen(),
          profileImported: (getProfileSummary() || {}).imported || 0,
          rowTitles: Array.prototype.map.call(document.querySelectorAll(".row__title"), function(n) {
            return n.textContent;
          }),
          images: lazyStats(),
          avplay: platform.probeAvPlay(),
          platform: platformInfo.label
        };
      }
    };
    logInfo("boot complete", { cards: document.querySelectorAll(".card").length });
  }
  var booted = false;
  function start() {
    if (booted) {
      return;
    }
    booted = true;
    try {
      boot();
    } catch (err) {
      logError("boot failed", err && err.stack ? err.stack : err);
    }
  }
  start();
})();
