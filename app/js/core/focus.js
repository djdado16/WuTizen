/**
 * focus.js — spatial focus manager for D-pad navigation.
 *
 * Why geometric navigation: the UI is a fixed 1920x1080 stage, so candidate
 * positions are stable and a remote can move between the rail, the shelves and
 * modal overlays without per-screen wiring.
 *
 * Region memory: every focusable element belongs to a region (an ancestor with
 * data-focus-region). When focus crosses into a different region, the element
 * the user last used there is restored instead of the geometrically nearest
 * one — otherwise pressing LEFT from a row lands on whichever rail entry
 * happens to be closest vertically rather than where the user left off.
 *
 * Cost model: rectangles are measured live (getBoundingClientRect) on each key
 * press. With the Milestone 0 element count (~30 focusables) this is well under
 * a millisecond. When catalogue rows grow to hundreds of cards we will switch
 * to cached geometry plus list virtualization (documented in
 * docs/COMPATIBILITY.md).
 *
 * A "scope" narrows navigation to a subtree, so focus cannot escape into the
 * background while a modal overlay is open.
 */

import { logWarn } from './log.js';

var SAME_AXIS_PENALTY = 2.5;

function regionOf(el) {
  if (!el || typeof el.closest !== 'function') {
    return null;
  }
  var host = el.closest('[data-focus-region]');
  return host ? host.getAttribute('data-focus-region') : null;
}

function isAhead(rect, curRect, direction) {
  var x = rect.left + rect.width / 2;
  var y = rect.top + rect.height / 2;
  var curX = curRect.left + curRect.width / 2;
  var curY = curRect.top + curRect.height / 2;
  if (direction === 'left') {
    return x < curX - 1;
  }
  if (direction === 'right') {
    return x > curX + 1;
  }
  if (direction === 'up') {
    return y < curY - 1;
  }
  return y > curY + 1;
}

export function FocusManager(options) {
  var opts = options || {};
  this.items = [];
  this.current = null;
  this.scope = null;
  this.memory = {};
  this.onFocus = opts.onFocus || null;
}

/** Seed a region's memory (e.g. the first rail entry) without moving focus. */
FocusManager.prototype.remember = function (el) {
  var region = regionOf(el);
  if (region) {
    this.memory[region] = el;
  }
};

FocusManager.prototype.register = function (el, onActivate) {
  if (!el) {
    return;
  }
  for (var i = 0; i < this.items.length; i++) {
    if (this.items[i].el === el) {
      this.items[i].onActivate = onActivate;
      return;
    }
  }
  this.items.push({ el: el, onActivate: onActivate });
};

FocusManager.prototype.unregister = function (el) {
  for (var i = this.items.length - 1; i >= 0; i--) {
    if (this.items[i].el === el) {
      this.items.splice(i, 1);
    }
  }
  if (this.current === el) {
    el.classList.remove('is-focused');
    this.current = null;
  }
};

/** Restrict navigation to a subtree (overlay) or clear the restriction (null). */
FocusManager.prototype.setScope = function (el) {
  this.scope = el || null;
};

FocusManager.prototype.isEligible = function (el) {
  if (!el || !el.parentNode) {
    return false;
  }
  if (this.scope && el !== this.scope && !this.scope.contains(el)) {
    return false;
  }
  if (el.hasAttribute('data-disabled')) {
    return false;
  }
  // offsetParent is null for display:none subtrees (closed overlay).
  return el.offsetParent !== null;
};

FocusManager.prototype.candidates = function () {
  var out = [];
  for (var i = 0; i < this.items.length; i++) {
    if (this.isEligible(this.items[i].el)) {
      out.push(this.items[i].el);
    }
  }
  return out;
};

FocusManager.prototype.focus = function (el) {
  if (!this.isEligible(el)) {
    return false;
  }
  if (this.current && this.current !== el) {
    this.current.classList.remove('is-focused');
  }
  this.current = el;
  el.classList.add('is-focused');
  this.remember(el);
  if (this.onFocus) {
    this.onFocus(el);
  }
  return true;
};

FocusManager.prototype.getCurrent = function () {
  return this.current;
};

FocusManager.prototype.focusFirst = function () {
  var list = this.candidates();
  return list.length > 0 ? this.focus(list[0]) : false;
};

FocusManager.prototype.activate = function () {
  var el = this.current;
  if (!el) {
    return false;
  }
  for (var i = 0; i < this.items.length; i++) {
    if (this.items[i].el === el && typeof this.items[i].onActivate === 'function') {
      this.items[i].onActivate(el);
      return true;
    }
  }
  return false;
};

/**
 * Move the logical cursor one step in a direction.
 * @param {string} direction left|right|up|down
 * @returns {boolean} whether focus moved
 */
FocusManager.prototype.move = function (direction) {
  var current = this.current;
  if (!current) {
    return this.focusFirst();
  }

  var curRect = current.getBoundingClientRect();
  var curX = curRect.left + curRect.width / 2;
  var curY = curRect.top + curRect.height / 2;
  var horizontal = direction === 'left' || direction === 'right';
  var forward = direction === 'right' || direction === 'down';

  var list = this.candidates();
  var best = null;
  var bestScore = Infinity;

  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (el === current) {
      continue;
    }
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;

    // Position along the movement axis, and the offset along the other axis.
    var primary = horizontal ? (forward ? x - curX : curX - x) : (forward ? y - curY : curY - y);
    if (primary <= 1) {
      continue; // not in the requested direction
    }
    var secondary = horizontal ? Math.abs(y - curY) : Math.abs(x - curX);
    var score = primary + secondary * SAME_AXIS_PENALTY;

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best) {
    logWarn('focus: no candidate in direction', direction);
    return false;
  }

  // Crossing laterally into another region? Restore what the user last used
  // there. Vertical movement is always geometric, so DOWN/UP keep the column
  // (important for grids of rows).
  var targetRegion = regionOf(best);
  if (horizontal && targetRegion && targetRegion !== regionOf(current)) {
    var remembered = this.memory[targetRegion];
    if (
      remembered &&
      remembered !== best &&
      this.isEligible(remembered) &&
      isAhead(remembered.getBoundingClientRect(), curRect, direction)
    ) {
      best = remembered;
    }
  }

  return this.focus(best);
};
