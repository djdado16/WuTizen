/**
 * views/diagnostics.js — temporary on-TV diagnostics screen.
 *
 * Shows what actually happened to the add-on requests: host only (never the full
 * add-on URL), HTTP status or network error, item counts and the AVPlay probe.
 * Built because the Q60R loaded the module but not Cinemeta's catalogs, and the
 * TV gives us no console access.
 */

import { t } from '../../i18n/index.js';

export function createDiagnosticsView() {
  var root = document.createElement('div');
  root.className = 'details diagnostics';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-focus-region', 'overlay');

  var scrim = document.createElement('div');
  scrim.className = 'details__scrim';

  var content = document.createElement('div');
  content.className = 'details__content diagnostics__content';

  var title = document.createElement('h1');
  title.className = 'details__title diagnostics__title';

  var env = document.createElement('div');
  env.className = 'diagnostics__env';

  var list = document.createElement('div');
  list.className = 'diagnostics__list';

  var actions = document.createElement('div');
  actions.className = 'details__actions';

  var focusables = [];
  var handlers = { onRetry: null, onClose: null };

  function button(label, id, handler) {
    var el = document.createElement('div');
    el.className = 'btn';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-diagnostics-action', id);
    var span = document.createElement('span');
    span.textContent = label;
    el.appendChild(span);
    el.addEventListener('click', handler);
    focusables.push({ el: el, activate: handler });
    actions.appendChild(el);
    return el;
  }

  content.appendChild(title);
  content.appendChild(env);
  content.appendChild(list);
  content.appendChild(actions);
  root.appendChild(scrim);
  root.appendChild(content);

  function render(info) {
    focusables = [];
    actions.innerHTML = '';
    list.innerHTML = '';

    title.textContent = t('diagnostics.title');
    env.textContent = info.environment;
    button(t('diagnostics.retry'), 'retry', function () {
      if (handlers.onRetry) {
        handlers.onRetry();
      }
    });
    button(t('diagnostics.close'), 'close', function () {
      if (handlers.onClose) {
        handlers.onClose();
      }
    });

    if (!info.entries.length) {
      var empty = document.createElement('div');
      empty.className = 'diagnostics__row';
      empty.textContent = t('diagnostics.empty');
      list.appendChild(empty);
      return;
    }

    for (var i = 0; i < info.entries.length; i++) {
      var entry = info.entries[i];
      var row = document.createElement('div');
      row.className = 'diagnostics__row' + (entry.error ? ' is-error' : '');

      var head = document.createElement('span');
      head.className = 'diagnostics__head';
      var label = entry.resource;
      if (entry.type) {
        label += ' ' + entry.type + '/' + entry.id;
      }
      if (entry.skip) {
        label += ' skip=' + entry.skip;
      }
      head.textContent =
        entry.host +
        ' · ' +
        label +
        ' · ' +
        (entry.error ? entry.error + (entry.status ? ' (' + entry.status + ')' : '') : entry.status) +
        ' · ' +
        entry.items +
        ' ' +
        t('diagnostics.items') +
        ' · ' +
        entry.ms +
        ' ms';
      row.appendChild(head);
      list.appendChild(row);
    }
  }

  return {
    el: root,
    render: render,
    focusables: function () {
      return focusables;
    },
    setHandlers: function (next) {
      handlers.onRetry = next.onRetry || null;
      handlers.onClose = next.onClose || null;
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
