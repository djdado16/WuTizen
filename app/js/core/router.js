/**
 * router.js — minimal screen stack.
 *
 * Only the topmost entry is "active". Screens are plain objects provided by the
 * caller:
 *   { name: string, show(): void, hide(): void }
 *
 * Back navigation pops the stack; the caller decides what happens when the
 * stack is empty (exit the app).
 */

import { logInfo } from './log.js';

export function createRouter() {
  var stack = [];

  function active() {
    var entry = stack[stack.length - 1];
    return entry && entry.screen ? entry.screen : null;
  }

  return {
    push: function (screen) {
      var previous = active();
      if (previous && previous.hide) {
        previous.hide();
      }
      stack.push({ screen: screen, scroll: 0 });
      if (screen.show) {
        screen.show();
      }
      logInfo('router: push', screen.name, 'depth', stack.length);
    },

    pop: function () {
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
      logInfo('router: pop', entry.screen.name, 'depth', stack.length);
      return entry.screen;
    },

    peek: function () {
      return active();
    },

    depth: function () {
      return stack.length;
    }
  };
}
