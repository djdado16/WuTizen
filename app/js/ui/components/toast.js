/**
 * toast.js — non-blocking status message (localized strings are passed in).
 */

export function createToast() {
  var el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  var timer = 0;

  function show(message) {
    el.textContent = message;
    el.classList.add('is-visible');
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(function () {
      el.classList.remove('is-visible');
      timer = 0;
    }, 2600);
  }

  return { el: el, show: show };
}
