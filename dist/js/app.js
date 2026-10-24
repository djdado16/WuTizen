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
    "nav.profile": "Profil",
    "nav.search": "Pretraga",
    "nav.home": "Početna",
    "nav.catalog": "Otkrij",
    "nav.lists": "Moje liste",
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
    "unit.min": "min",
    "common.wip": "Ova značajka još nije implementirana.",
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
    "unit.min": "min",
    "common.wip": "This feature is not implemented yet.",
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
    if (!item || item.kind !== "series") {
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
    img.setAttribute("data-src", item.image);
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
      title.textContent = t(row.titleKey);
      for (var i = 0; i < cards.length; i++) {
        cards[i].updateLanguage(current2);
      }
    }
    var api = {
      el,
      id: row.id,
      cards,
      measure,
      reveal,
      updateLanguage
    };
    appendCards(INITIAL_CARDS);
    updateLanguage(lang);
    return api;
  }

  // app/js/ui/components/hero.js
  function createHero(item, lang) {
    var current2 = lang || "hr";
    var el = document.createElement("section");
    el.className = "hero";
    var bg = document.createElement("div");
    bg.className = "hero__bg";
    bg.style.backgroundImage = 'url("' + item.image + '")';
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
      title.textContent = item.title[current2] || item.title.hr;
      duration.textContent = item.minutes + " " + t("unit.min");
      year.textContent = String(item.year);
      rating.textContent = item.rating.toFixed(1);
      genres.textContent = item.genres[current2] || item.genres.hr;
      desc.textContent = item.description[current2] || item.description.hr;
      cast.textContent = item.cast.join(", ");
    }
    render();
    return {
      el,
      item,
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
    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(desc);
    content.appendChild(cast);
    content.appendChild(actions);
    content.appendChild(section);
    content.appendChild(episodes);
    root.appendChild(bg);
    root.appendChild(scrim);
    root.appendChild(content);
    var currentItem = null;
    var currentLang = "hr";
    var episodeImages = [];
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
      while (episodes.firstChild) {
        episodes.removeChild(episodes.firstChild);
      }
    }
    function renderEpisodes() {
      clearEpisodes();
      var list = getEpisodes(currentItem);
      var hasEpisodes = list.length > 0;
      section.style.display = hasEpisodes ? "" : "none";
      episodes.style.display = hasEpisodes ? "flex" : "none";
      for (var i2 = 0; i2 < list.length; i2++) {
        var ep = list[i2];
        var card = document.createElement("div");
        card.className = "ep";
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
        badge.textContent = "E" + ep.number;
        frame.appendChild(badge);
        var label2 = document.createElement("div");
        label2.className = "ep__label";
        label2.textContent = (ep.title[currentLang] || ep.title.hr) + " · " + ep.minutes + " " + t("unit.min");
        card.appendChild(frame);
        card.appendChild(label2);
        episodes.appendChild(card);
        observeImage(img);
        episodeImages.push(img);
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
    return {
      el: root,
      buttons: buttonList,
      setItem: setItem2,
      setLanguage: setLanguage2,
      isOpen: function() {
        return root.classList.contains("is-open");
      }
    };
  }

  // app/js/main.js
  var STAGE_WIDTH = 1920;
  var STAGE_HEIGHT = 1080;
  var SCROLL_PAD = 24;
  var RAIL_PUSH = 150;
  var PROFILE_ITEM = { id: "profile", labelKey: "nav.profile", icon: "profile", profile: true };
  var RAIL_ITEMS = [
    { id: "search", labelKey: "nav.search", icon: "search" },
    { id: "home", labelKey: "nav.home", icon: "home", active: true },
    { id: "catalog", labelKey: "nav.catalog", icon: "compass" },
    { id: "lists", labelKey: "nav.lists", icon: "bookmark" },
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
    var scroller = document.createElement("div");
    scroller.className = "scroller";
    var hero = createHero(getHero(), getLanguage());
    scroller.appendChild(hero.el);
    var rowsEl = document.createElement("div");
    rowsEl.className = "rows";
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
    var details = createDetails();
    appEl.appendChild(details.el);
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
    function onFocusChanged(el) {
      var inRail = !!el.closest(".rail");
      rail.setExpanded(inRail);
      setRailPush(inRail ? RAIL_PUSH : 0);
      if (typeof el.__reveal === "function") {
        el.__reveal();
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
        details.el.classList.remove("is-open");
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
      details.setItem(item, getLanguage());
      router.push(detailsScreen);
    }
    function closeDetails() {
      while (router.depth() > 0) {
        router.pop();
      }
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
          toast.show(button.id === "play" ? t("common.media") : t("common.wip"));
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
    function onKeyDown(event) {
      var action = actionFromEvent(event);
      if (!action) {
        return;
      }
      event.preventDefault();
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
        for (var i2 = 0; i2 < ROWS.length; i2++) {
          total += ROWS[i2].items.length;
        }
        return {
          language: getLanguage(),
          screen: router.depth() > 0 ? "details" : "home",
          rows: shelves.length,
          cards: document.querySelectorAll(".card").length,
          totalItems: total,
          focusedId,
          focusedZone: zone,
          focusedTitle: caption ? caption.textContent : null,
          railExpanded: rail.isExpanded(),
          heroTitle: heroTitle ? heroTitle.textContent : "",
          detailsOpen: details.isOpen(),
          detailsTitle: detailsTitle ? detailsTitle.textContent : "",
          episodes: document.querySelectorAll(".ep").length,
          images: lazyStats(),
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
