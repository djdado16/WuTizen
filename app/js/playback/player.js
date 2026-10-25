/**
 * playback/player.js — full-screen video player (AVPlay first, HTML5 fallback).
 *
 * Why two engines:
 *   - AVPlay is Tizen's native player: MP4/TS, HLS, DASH, HEVC/AC3 — everything
 *     the panel can decode, with no MSE limits. It renders into a native plane
 *     *below* the web layer, so the page background is transparent while it plays
 *     (html.is-avplay, see components.css).
 *   - HTML5 <video> is the fallback: works everywhere (including desktop Chrome
 *     for tests) and on Tizen 5.0 handles progressive MP4 and HLS. DASH needs
 *     MSE + dash.js, which this app does not ship.
 *
 * The player owns no add-on logic: it receives an already classified source
 * (playback/sources.js) and either plays it or reports a typed reason. Stream
 * URLs are never logged.
 */

import { t } from '../i18n/index.js';
import { platform } from '../platform/tizen.js';
import { logInfo, logWarn } from '../core/log.js';

var TICK_MS = 400;
var HUD_HIDE_MS = 5000;
var OPEN_TIMEOUT_MS = 25000;
var PREPARE_TIMEOUT_MS = 12000;
var SEEK_STEP_MS = 10000;
var FF_STEP_MS = 30000;

function formatTime(ms) {
  var total = Math.max(0, Math.round((ms || 0) / 1000));
  var minutes = Math.floor(total / 60);
  var seconds = total % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

/** User-facing text for a refusal/error reason (keys are literal for i18n checks). */
function reasonText(reason) {
  if (reason === 'torrent' || reason === 'magnet' || reason === 'infoHash') {
    return t('player.torrent');
  }
  if (reason === 'notWebReady') {
    return t('player.notWebReady');
  }
  if (reason === 'external' || reason === 'yt' || reason === 'scheme') {
    return t('player.external');
  }
  if (reason === 'expired') {
    return t('player.expired');
  }
  if (reason === 'codec') {
    return t('player.codec');
  }
  if (reason === 'network') {
    return t('player.network');
  }
  if (reason === 'timeout') {
    return t('player.timeout');
  }
  if (reason === 'empty' || reason === 'noUrl') {
    return t('player.noSources');
  }
  return t('player.unsupported');
}

/** Map an HTML5 MediaError to a reason code. */
function html5Reason(error) {
  if (!error) {
    return 'unsupported';
  }
  if (error.code === 2) {
    return 'network';
  }
  if (error.code === 3) {
    return 'codec';
  }
  if (error.code === 4) {
    // MEDIA_ERR_SRC_NOT_SUPPORTED: an expired/403 link looks exactly like this,
    // so the message covers both and suggests refreshing the source list.
    return 'expired';
  }
  return 'unsupported';
}

export function createPlayer(options) {
  var opts = options || {};

  var root = document.createElement('div');
  root.className = 'player';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-player', '1');

  var video = document.createElement('video');
  video.className = 'player__video';
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'metadata');
  video.setAttribute('data-backend', 'html5');

  var hud = document.createElement('div');
  hud.className = 'player__hud';

  var top = document.createElement('div');
  top.className = 'player__top';
  var titleEl = document.createElement('h2');
  titleEl.className = 'player__title';
  var backendEl = document.createElement('span');
  backendEl.className = 'player__backend';
  top.appendChild(titleEl);
  top.appendChild(backendEl);

  var center = document.createElement('div');
  center.className = 'player__center';
  var spinner = document.createElement('div');
  spinner.className = 'player__spinner';
  var errorBox = document.createElement('div');
  errorBox.className = 'player__error';
  var errorText = document.createElement('div');
  errorText.className = 'player__errorText';
  var errorHint = document.createElement('div');
  errorHint.className = 'player__errorHint';
  errorBox.appendChild(errorText);
  errorBox.appendChild(errorHint);
  center.appendChild(spinner);
  center.appendChild(errorBox);

  var bottom = document.createElement('div');
  bottom.className = 'player__bottom';
  var bar = document.createElement('div');
  bar.className = 'player__bar';
  var buffered = document.createElement('div');
  buffered.className = 'player__buffered';
  var played = document.createElement('div');
  played.className = 'player__played';
  var knob = document.createElement('div');
  knob.className = 'player__knob';
  bar.appendChild(buffered);
  bar.appendChild(played);
  bar.appendChild(knob);

  var row = document.createElement('div');
  row.className = 'player__row';
  var timeEl = document.createElement('span');
  timeEl.className = 'player__time';
  var statusEl = document.createElement('span');
  statusEl.className = 'player__status';
  var hintEl = document.createElement('span');
  hintEl.className = 'player__hint';
  hintEl.textContent = t('player.hint');
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

  /* ---- state ------------------------------------------------------------- */

  var state = {
    open: false,
    backend: '',
    status: 'idle', // idle | loading | buffering | playing | paused | ended | error
    position: 0,
    duration: 0,
    buffered: 0,
    error: '',
    url: '',
    type: '',
    title: ''
  };

  var backend = null;
  var backendOrder = [];
  var ticker = null;
  var hudTimer = null;
  var openTimer = null;
  var onClose = opts.onClose || null;
  var forcedBackend = opts.forceBackend || '';

  function avplayActive() {
    return state.backend === 'avplay';
  }

  function rootClass() {
    return (
      'player' +
      (state.open ? ' is-open' : '') +
      (state.error ? ' has-error' : '') +
      (avplayActive() ? ' is-avplay' : '') +
      (hud.className.indexOf('is-idle') > -1 ? ' is-idle' : '')
    );
  }

  function paint() {
    if (!state.open) {
      return;
    }
    var pct = state.duration > 0 ? Math.min(100, (state.position / state.duration) * 100) : 0;
    var bPct = state.duration > 0 ? Math.min(100, (state.buffered / state.duration) * 100) : 0;
    played.style.width = pct + '%';
    buffered.style.width = bPct + '%';
    knob.style.left = pct + '%';
    bar.className = 'player__bar' + (state.duration > 0 ? '' : ' is-live');
    timeEl.textContent = formatTime(state.position) + ' / ' + formatTime(state.duration);

    var statusText = '';
    if (state.status === 'buffering' || state.status === 'loading') {
      statusText = t('player.loading');
    } else if (state.status === 'ended') {
      statusText = t('player.ended');
    }
    statusEl.textContent = statusText;

    var busy = state.status === 'buffering' || state.status === 'loading';
    spinner.className = 'player__spinner' + (busy && !state.error ? '' : ' is-hidden');
    errorBox.className = 'player__error' + (state.error ? ' is-visible' : '');
    root.className = rootClass();
    backendEl.textContent =
      state.backend === 'avplay' ? t('player.backendAvplay') : t('player.backendHtml5');
  }

  function showHud() {
    hud.className = 'player__hud';
    if (hudTimer) {
      clearTimeout(hudTimer);
      hudTimer = null;
    }
    root.className = rootClass();
    if (state.status === 'playing') {
      hudTimer = setTimeout(function () {
        hud.className = 'player__hud is-idle';
        root.className = rootClass();
      }, HUD_HIDE_MS);
    }
  }

  /* ---- HTML5 engine ------------------------------------------------------ */

  var html5 = {
    name: 'html5',
    open: function (url, type, done) {
      video.setAttribute('data-type', type || 'auto');
      try {
        video.setAttribute('src', url);
        video.load();
        var attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(function () {
            /* autoplay refusal is surfaced through the media error path */
          });
        }
      } catch (err) {
        done(err);
        return;
      }
      done(null);
    },
    play: function () {
      var attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(function () {
          /* ignored */
        });
      }
    },
    pause: function () {
      try {
        video.pause();
      } catch (err) {
        /* ignored */
      }
    },
    seek: function (ms) {
      try {
        video.currentTime = ms / 1000;
      } catch (err) {
        /* ignored */
      }
    },
    stop: function () {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (err) {
        /* ignored */
      }
    },
    time: function () {
      return (video.currentTime || 0) * 1000;
    },
    duration: function () {
      var value = video.duration;
      return isFinite(value) ? value * 1000 : 0;
    },
    buffered: function () {
      try {
        if (video.buffered && video.buffered.length > 0) {
          return video.buffered.end(video.buffered.length - 1) * 1000;
        }
      } catch (err) {
        /* ignored */
      }
      return 0;
    }
  };

  video.addEventListener('loadedmetadata', function () {
    state.duration = html5.duration();
    if (state.status === 'loading') {
      state.status = 'buffering';
    }
    paint();
  });
  video.addEventListener('playing', function () {
    clearOpenTimer();
    state.status = 'playing';
    showHud();
    paint();
  });
  video.addEventListener('pause', function () {
    if (state.status === 'ended' || state.status === 'error') {
      return;
    }
    state.status = 'paused';
    showHud();
    paint();
  });
  video.addEventListener('waiting', function () {
    if (state.status === 'playing') {
      state.status = 'buffering';
      paint();
    }
  });
  video.addEventListener('progress', function () {
    state.buffered = html5.buffered();
    paint();
  });
  video.addEventListener('ended', function () {
    state.status = 'ended';
    state.position = state.duration;
    stopTicker();
    showHud();
    paint();
  });
  video.addEventListener('error', function () {
    if (!state.open || avplayActive()) {
      return;
    }
    fail(html5Reason(video.error), video.error ? String(video.error.message || '') : '');
  });

  /* ---- AVPlay engine ----------------------------------------------------- */

  function createAvPlay(api) {
    var rect = platform.displayRect ? platform.displayRect() : { x: 0, y: 0, w: 1920, h: 1080 };
    var listener = {
      onbufferingstart: function () {
        state.status = 'buffering';
        paint();
      },
      onbufferingprogress: function () {
        state.status = 'buffering';
      },
      onbufferingcomplete: function () {
        state.status = 'playing';
        showHud();
        paint();
      },
      oncurrentplaytime: function (ms) {
        state.position = ms;
      },
      onstreamcompleted: function () {
        state.status = 'ended';
        state.position = state.duration;
        stopTicker();
        showHud();
        paint();
      },
      onerror: function (err) {
        var code = err && (err.code || err.error_code);
        fail(code === 1 ? 'network' : 'unsupported', String((err && err.message) || code || ''));
      },
      onplaying: function () {
        clearOpenTimer();
        state.status = 'playing';
        showHud();
        paint();
      }
    };
    return {
      name: 'avplay',
      open: function (url, type, done) {
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
        var guard = setTimeout(function () {
          if (!settled) {
            settled = true;
            done(new Error('prepare timeout'));
          }
        }, PREPARE_TIMEOUT_MS);
        try {
          api.prepareAsync(
            function () {
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
            function (err) {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(guard);
              done(err || new Error('prepare failed'));
            }
          );
        } catch (err2) {
          settled = true;
          clearTimeout(guard);
          done(err2);
        }
      },
      play: function () {
        try {
          api.play();
        } catch (err) {
          /* ignored */
        }
      },
      pause: function () {
        try {
          api.pause();
        } catch (err) {
          /* ignored */
        }
      },
      seek: function (ms) {
        try {
          api.seekTo(ms);
        } catch (err) {
          /* ignored */
        }
      },
      stop: function () {
        try {
          api.stop();
        } catch (err) {
          /* ignored */
        }
        try {
          api.close();
        } catch (err2) {
          /* ignored */
        }
      },
      time: function () {
        try {
          return api.getCurrentTime ? api.getCurrentTime() : state.position;
        } catch (err) {
          return state.position;
        }
      },
      duration: function () {
        try {
          return api.getDuration ? api.getDuration() : state.duration;
        } catch (err) {
          return state.duration;
        }
      },
      buffered: function () {
        try {
          if (api.getBufferedAmount) {
            // AVPlay reports a percentage of the duration.
            return (api.getBufferedAmount() / 100) * state.duration;
          }
        } catch (err) {
          /* ignored */
        }
        return 0;
      }
    };
  }

  /* ---- lifecycle --------------------------------------------------------- */

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
    ticker = setInterval(function () {
      if (!backend || !state.open || state.status === 'error') {
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
        logWarn('player: backend stop failed', err && err.message);
      }
      backend = null;
    }
    // The AVPlay plane sits below the page: restore the normal (opaque) stage.
    var html = document.documentElement;
    if (html.className.indexOf('is-avplay') > -1) {
      html.className = html.className.replace(/\s*is-avplay/g, '').replace(/^\s+/, '');
    }
  }

  function fail(reason, detail) {
    stopTicker();
    clearOpenTimer();
    state.status = 'error';
    state.error = reason;
    errorText.textContent = reasonText(reason);
    errorHint.textContent = detail ? String(detail).slice(0, 120) : t('player.hint');
    spinner.className = 'player__spinner is-hidden';
    errorBox.className = 'player__error is-visible';
    hud.className = 'player__hud';
    root.className = 'player is-open has-error' + (avplayActive() ? ' is-avplay' : '');
    if (detail) {
      // Only the reason is logged: a media error message is engine-supplied and
      // must never be able to carry the stream URL into a log.
      logWarn('player: ' + reason);
    }
  }

  function tryBackend(index) {
    if (index >= backendOrder.length) {
      fail(state.error || 'unsupported', '');
      return;
    }
    var name = backendOrder[index];
    if (name === 'avplay') {
      var api = platform.avplayApi ? platform.avplayApi() : null;
      if (!api) {
        tryBackend(index + 1);
        return;
      }
      backend = createAvPlay(api);
      state.backend = 'avplay';
      video.setAttribute('data-backend', 'avplay');
      video.removeAttribute('src');
      document.documentElement.className = (
        document.documentElement.className + ' is-avplay'
      ).replace(/^\s+/, '');
    } else {
      backend = html5;
      state.backend = 'html5';
      video.setAttribute('data-backend', 'html5');
    }
    state.status = 'loading';
    paint();
    backend.open(state.url, state.type, function (err) {
      if (!state.open) {
        return; // closed while preparing
      }
      if (err) {
        logWarn('player: ' + name + ' could not open the source', err && err.message);
        try {
          backend.stop();
        } catch (stopErr) {
          /* ignored */
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
    state.backend = '';
    state.status = 'loading';
    state.position = 0;
    state.duration = 0;
    state.buffered = 0;
    state.error = '';
    state.url = source && source.url ? source.url : '';
    state.type = source && source.type ? source.type : 'auto';
    state.title = info.title || t('player.titleFallback');
    titleEl.textContent = state.title;
    errorText.textContent = '';
    errorHint.textContent = '';
    hud.className = 'player__hud';
    root.className = 'player is-open';
    backendEl.textContent = '';
    paint();

    if (!source || source.ok !== true || !state.url) {
      fail((source && source.reason) || 'noUrl', '');
      return;
    }

    backendOrder = [];
    if (forcedBackend === 'html5') {
      backendOrder.push('html5');
    } else if (forcedBackend === 'avplay') {
      backendOrder.push('avplay', 'html5');
    } else {
      if (platform.canUseAvPlay && platform.canUseAvPlay()) {
        backendOrder.push('avplay');
      }
      backendOrder.push('html5');
    }
    logInfo('player: engines ' + backendOrder.join(',') + ' type=' + state.type);

    clearOpenTimer();
    openTimer = setTimeout(function () {
      if (state.open && state.status !== 'playing' && state.status !== 'paused' && !state.error) {
        fail('timeout', state.status);
      }
    }, OPEN_TIMEOUT_MS);

    tryBackend(0);
  }

  function play() {
    if (!backend || state.error) {
      return;
    }
    backend.play();
    state.status = 'playing';
    showHud();
    paint();
  }

  function pause() {
    if (!backend || state.error) {
      return;
    }
    backend.pause();
    state.status = 'paused';
    showHud();
    paint();
  }

  function toggle() {
    if (!backend || state.error) {
      return;
    }
    if (state.status === 'playing') {
      pause();
    } else {
      play();
    }
  }

  function seekTo(ms) {
    if (!backend || state.error) {
      return;
    }
    var limit = state.duration > 0 ? state.duration - 1000 : ms;
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
    state.status = 'idle';
    state.backend = '';
    state.error = '';
    state.position = 0;
    state.duration = 0;
    state.buffered = 0;
    state.url = '';
    root.className = 'player';
    hud.className = 'player__hud';
    errorBox.className = 'player__error';
    timeEl.textContent = '';
    statusEl.textContent = '';
    if (wasOpen && notify !== false && onClose) {
      onClose();
    }
  }

  /** Remote mapping while the player is open. Returns true when consumed. */
  function handleAction(action) {
    if (!state.open) {
      return false;
    }
    if (action === 'enter') {
      toggle();
      return true;
    }
    if (action === 'left') {
      seekBy(-SEEK_STEP_MS);
      return true;
    }
    if (action === 'right') {
      seekBy(SEEK_STEP_MS);
      return true;
    }
    if (action === 'up' || action === 'down') {
      showHud();
      return true;
    }
    if (action === 'media-play') {
      play();
      return true;
    }
    if (action === 'media-pause') {
      pause();
      return true;
    }
    if (action === 'media-toggle') {
      toggle();
      return true;
    }
    if (action === 'media-ff') {
      seekBy(FF_STEP_MS);
      return true;
    }
    if (action === 'media-rew') {
      seekBy(-FF_STEP_MS);
      return true;
    }
    return false;
  }

  return {
    el: root,
    video: video,
    isOpen: function () {
      return state.open;
    },
    open: open,
    close: close,
    play: play,
    pause: pause,
    toggle: toggle,
    seekBy: seekBy,
    seekTo: seekTo,
    handleAction: handleAction,
    showHud: showHud,
    state: function () {
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
    setOnClose: function (fn) {
      onClose = fn;
    }
  };
}
