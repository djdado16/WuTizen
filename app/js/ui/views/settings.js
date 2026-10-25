/**
 * views/settings.js — Settings screen (Milestone 4: profile import only).
 *
 * Remote-first: both import paths are focusable actions. The URL path is the
 * practical one on a TV (the user serves the file from a PC on the same network);
 * the file picker only works where the platform exposes a picker.
 */

import { t } from '../../i18n/index.js';
import { getProfileSummary } from '../../state/profile.js';

export function createSettingsView() {
  var root = document.createElement('div');
  root.className = 'details settings';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-focus-region', 'overlay');

  var scrim = document.createElement('div');
  scrim.className = 'details__scrim';

  var content = document.createElement('div');
  content.className = 'details__content settings__content';

  var title = document.createElement('h1');
  title.className = 'details__title settings__title';

  var hint = document.createElement('p');
  hint.className = 'details__desc addons__hint';

  var status = document.createElement('div');
  status.className = 'addons__status';

  var summary = document.createElement('div');
  summary.className = 'settings__summary';

  var actions = document.createElement('div');
  actions.className = 'details__actions';

  var urlInput = document.createElement('input');
  urlInput.className = 'addon-input settings__url';
  urlInput.setAttribute('type', 'text');
  urlInput.setAttribute('spellcheck', 'false');
  urlInput.setAttribute('inputmode', 'url'); // TV keyboard opens in URL mode
  urlInput.setAttribute('autocomplete', 'off');
  urlInput.setAttribute('autocapitalize', 'off');
  urlInput.setAttribute('data-settings-field', 'url');
  urlInput.setAttribute('placeholder', t('settings.urlPlaceholder'));

  var fileInput = document.createElement('input');
  fileInput.setAttribute('type', 'file');
  fileInput.setAttribute('accept', '.json,application/json');
  fileInput.className = 'settings__file';

  var focusables = [];
  var handlers = { onImportUrl: null, onImportText: null, onClose: null };
  var importBtn = null;

  function button(label, id, handler) {
    var el = document.createElement('div');
    el.className = 'btn';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-settings-action', id);
    var span = document.createElement('span');
    span.textContent = label;
    el.appendChild(span);
    el.addEventListener('click', handler);
    focusables.push({ el: el, activate: handler });
    actions.appendChild(el);
    if (id === 'import-url') {
      importBtn = el; // what focus lands on after the keyboard commits
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

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file || !handlers.onImportText) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      handlers.onImportText(String(reader.result || ''));
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  function render() {
    focusables = [];
    actions.innerHTML = '';
    title.textContent = t('settings.title');
    hint.textContent = t('settings.importHint');

    button(t('settings.importUrl'), 'import-url', function () {
      var value = String(urlInput.value || '').trim();
      if (value && handlers.onImportUrl) {
        handlers.onImportUrl(value);
      }
    });
    button(t('settings.importFile'), 'import-file', function () {
      try {
        fileInput.click();
      } catch (err) {
        /* picker unavailable on this platform */
      }
    });
    button(t('settings.close'), 'close', function () {
      if (handlers.onClose) {
        handlers.onClose();
      }
    });

    var last = getProfileSummary();
    if (!last) {
      summary.textContent = t('settings.noProfile');
    } else {
      summary.textContent =
        t('settings.imported') +
        ' ' +
        last.imported +
        ' · ' +
        t('settings.skipped') +
        ' ' +
        last.skipped +
        ' · ' +
        (last.profiles || []).length +
        ' ' +
        t('settings.profiles') +
        ' · ' +
        last.lists +
        ' ' +
        t('settings.listItems');
    }

    focusables.push({
      el: urlInput,
      activate: function () {
        // OK on the field itself only re-opens the keyboard; the global key
        // router commits the value and moves to Import (see main.js).
        try {
          urlInput.focus();
        } catch (err) {
          /* ignored */
        }
      }
    });
  }

  return {
    el: root,
    render: render,
    fileInput: fileInput,
    urlInput: urlInput,
    importButton: function () {
      return importBtn;
    },
    setStatus: function (message, isError) {
      status.textContent = message || '';
      status.className = 'addons__status' + (isError ? ' is-error' : '');
    },
    focusables: function () {
      return focusables;
    },
    setHandlers: function (next) {
      handlers.onImportUrl = next.onImportUrl || null;
      handlers.onImportText = next.onImportText || null;
      handlers.onClose = next.onClose || null;
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
