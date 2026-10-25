/**
 * platform/tizen.js — the single seam between the UI and Samsung Tizen APIs.
 *
 * Every call is capability-guarded, so the exact same bundle runs in Chrome for
 * fast iteration and on the TV unchanged. Nothing here reads or transmits user
 * data.
 *
 * Playback engines: AVPlay (native, DASH/HLS/HEVC capable) via `avplayApi()`,
 * HTML5 `<video>` (M63: progressive MP4 + HLS) as the fallback.
 */

import { MEDIA_KEY_NAMES } from '../core/keys.js';
import { logInfo, logWarn } from '../core/log.js';

function tizenGlobal() {
  if (typeof window === 'undefined' || !window.tizen) {
    return null;
  }
  return window.tizen;
}

var onTizen = !!tizenGlobal();

export var platform = {
  isTizen: onTizen,

  /** Short label used by the on-screen platform badge. */
  label: function () {
    return onTizen ? 'tizen' : 'browser';
  },

  /**
   * Register media keys with the TV. Without this, Tizen 5.0 never delivers
   * play/pause/rewind key events to the web app.
   * Requires the http://tizen.org/privilege/tv.inputdevice privilege.
   */
  registerKeys: function (names) {
    var tizen = tizenGlobal();
    var list = names || [];
    if (!tizen || !tizen.tvinputdevice || list.length === 0) {
      return false;
    }
    try {
      if (typeof tizen.tvinputdevice.registerKeyBatch === 'function') {
        tizen.tvinputdevice.registerKeyBatch(list);
        return true;
      }
      if (typeof tizen.tvinputdevice.registerKey === 'function') {
        for (var i = 0; i < list.length; i++) {
          tizen.tvinputdevice.registerKey(list[i]);
        }
        return true;
      }
    } catch (err) {
      logWarn('platform: key registration failed', err && err.message);
    }
    return false;
  },

  /** Leave the application (Samsung EXIT key or BACK on the root screen). */
  exitApp: function () {
    var tizen = tizenGlobal();
    if (tizen && tizen.application && typeof tizen.application.getCurrentApplication === 'function') {
      try {
        tizen.application.getCurrentApplication().exit();
        return true;
      } catch (err) {
        logWarn('platform: exit failed', err && err.message);
      }
    }
    // Browser preview: window.close() only works for script-opened windows.
    try {
      window.close();
    } catch (err2) {
      /* ignored */
    }
    return false;
  },

  /** AVPlay availability probe (TizenBrew runs the module in its own app shell). */
  probeAvPlay: function () {
    var hasWebapis = typeof window !== 'undefined' && !!window.webapis;
    var hasAvplay =
      typeof window !== 'undefined' &&
      !!(window.avplay || (window.webapis && window.webapis.avplay));
    return { webapis: hasWebapis, avplay: hasAvplay };
  },

  /**
   * The AVPlay module object (`webapis.avplay`), or null.
   * Samsung ships it as `webapis.avplay`; some shells expose it as `avplay`.
   */
  avplayApi: function () {
    if (typeof window === 'undefined') {
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
  canUseAvPlay: function () {
    var api = this.avplayApi();
    if (!api) {
      return false;
    }
    try {
      if (window.top && window.top !== window.self) {
        return false;
      }
    } catch (err) {
      return false; // cross-origin parent: cannot reason about the plane
    }
    return true;
  },

  /** Display rectangle (device pixels) for the AVPlay plane. */
  displayRect: function () {
    if (typeof window === 'undefined') {
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
  init: function () {
    if (onTizen) {
      this.registerKeys(MEDIA_KEY_NAMES);
      logInfo('platform: Tizen runtime detected; media keys registered');
    } else {
      logInfo('platform: browser preview (Tizen APIs unavailable)');
    }
    return { isTizen: onTizen, label: this.label() };
  }
};
