/**
 * platform/lazy.js — image loading with a bounded live-image budget.
 *
 * Chromium M63 has no native `loading="lazy"` (Chrome 77), so images are
 * observed with IntersectionObserver (supported since M51) and their `src` is
 * only assigned when they approach the viewport. Images that leave the viewport
 * release their `src` again, which keeps the number of decoded bitmaps — the
 * main memory pressure on a 2019 TV — bounded.
 */

var MAX_LIVE = 18;
var live = [];
var visible = [];
var observer = null;
var stats = { attached: 0, released: 0 };

function isLoaded(img) {
  return img.getAttribute('data-loaded') === '1';
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
  img.removeAttribute('data-loaded');
  img.removeAttribute('src');
  stats.released += 1;
}

/**
 * Evict the oldest image that is currently OFF screen. Images that are on screen
 * are never evicted, otherwise the user sees empty frames (the budget is a soft
 * cap and may be exceeded when more than MAX_LIVE images are visible at once).
 */
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
  var src = img.getAttribute('data-src');
  if (!src) {
    return;
  }
  img.setAttribute('src', src);
  img.setAttribute('data-loaded', '1');
  stats.attached += 1;
  live.push(img);
  evictOverflow();
}

function getObserver() {
  if (observer || typeof window === 'undefined' || !window.IntersectionObserver) {
    return observer;
  }
  observer = new window.IntersectionObserver(
    function (entries) {
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
    { rootMargin: '300px 0px 300px 0px', threshold: 0 }
  );
  return observer;
}

/** Start observing an <img data-src="…"> created by a card. */
export function observeImage(img) {
  var io = getObserver();
  if (!io) {
    attach(img); // very old engine: degrade to eager loading
    return;
  }
  io.observe(img);
}

/** Stop observing and free the decoded bitmap (used when a view is torn down). */
export function forgetImage(img) {
  var io = getObserver();
  if (io) {
    io.unobserve(img);
  }
  setVisible(img, false);
  release(img);
}

/** Diagnostics for the debug snapshot / smoke test. */
export function lazyStats() {
  return { attached: stats.attached, released: stats.released, live: live.length };
}
