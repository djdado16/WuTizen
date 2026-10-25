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
  /** Short label for an import failure reason (all keys are literal). */
  function reasonLabel(reason) {
    if (reason === 'auth') {
      return t('import.auth');
    }
    if (reason === 'notFound') {
      return t('import.notFound');
    }
    if (reason === 'server') {
      return t('import.server');
    }
    if (reason === 'timeout') {
      return t('import.timeout');
    }
    if (reason === 'notAddon' || reason === 'manifest') {
      return t('import.notAddon');
    }
    if (reason === 'invalidUrl') {
      return t('import.invalidUrl');
    }
    return t('import.unreachable');
  }

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

  // --- Emby Server section (native, independent of Stremio add-ons) ---------
  var embySection = document.createElement('div');
  embySection.className = 'settings__emby';
  var embyHeading = document.createElement('h3');
  embyHeading.className = 'details__section settings__embyTitle';
  var embyStatus = document.createElement('div');
  embyStatus.className = 'addons__status';
  var embyUrl = document.createElement('input');
  embyUrl.className = 'addon-input settings__embyUrl';
  embyUrl.setAttribute('type', 'text');
  embyUrl.setAttribute('spellcheck', 'false');
  embyUrl.setAttribute('inputmode', 'url');
  embyUrl.setAttribute('autocomplete', 'off');
  embyUrl.setAttribute('data-settings-field', 'emby-url');
  var embyUser = document.createElement('input');
  embyUser.className = 'addon-input settings__embyUser';
  embyUser.setAttribute('type', 'text');
  embyUser.setAttribute('spellcheck', 'false');
  embyUser.setAttribute('autocomplete', 'off');
  embyUser.setAttribute('data-settings-field', 'emby-user');
  var embyPass = document.createElement('input');
  embyPass.className = 'addon-input settings__embyPass';
  embyPass.setAttribute('type', 'password');
  embyPass.setAttribute('spellcheck', 'false');
  embyPass.setAttribute('autocomplete', 'off');
  embyPass.setAttribute('data-settings-field', 'emby-pass');
  var embyActions = document.createElement('div');
  embyActions.className = 'details__actions';

  // --- PC/Mobile configurator -------------------------------------------------
  var confHeading = document.createElement('h3');
  confHeading.className = 'details__section settings__confTitle';
  var confStatus = document.createElement('div');
  confStatus.className = 'addons__status';
  var confHost = document.createElement('input');
  confHost.className = 'addon-input settings__confHost';
  confHost.setAttribute('type', 'text');
  confHost.setAttribute('spellcheck', 'false');
  confHost.setAttribute('inputmode', 'url');
  confHost.setAttribute('autocomplete', 'off');
  // Read-only: the permanent Cloudflare URL is never typed on the TV.
  confHost.setAttribute('readonly', 'readonly');
  confHost.setAttribute('tabindex', '-1');
  var confCode = document.createElement('input');
  confCode.className = 'addon-input settings__confCode';
  confCode.setAttribute('type', 'text');
  confCode.setAttribute('spellcheck', 'false');
  confCode.setAttribute('autocomplete', 'off');
  confCode.setAttribute('placeholder', '000000');
  // Hidden: the TV shows the code as text and the user types it on the phone.
  confCode.style.display = 'none';
  var confActions = document.createElement('div');
  confActions.className = 'details__actions';
  embySection.appendChild(embyHeading);
  embySection.appendChild(embyStatus);
  embySection.appendChild(embyUrl);
  embySection.appendChild(embyUser);
  embySection.appendChild(embyPass);
  embySection.appendChild(embyActions);
  content.appendChild(confHeading);
  content.appendChild(confStatus);
  content.appendChild(confHost);
  content.appendChild(confCode);
  content.appendChild(confActions);

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
  var importFileBtn = null;
  var closeBtn = null;
  var embyConnectBtn = null;
  var embyDisconnectBtn = null;
  var confStartBtn = null;
  var confApplyBtn = null;

  /**
   * Visual/logical navigation order of the Settings panel. D-pad movement inside
   * Settings follows this list instead of element geometry, so each block's action
   * row is always reached right after its own fields.
   */
  function settingsOrder() {
    return [
      embyUrl,
      embyUser,
      embyPass,
      embyConnectBtn,
      embyDisconnectBtn,
      urlInput,
      importBtn,
      importFileBtn,
      closeBtn,
      confHost,
      confStartBtn,
      confApplyBtn
    ];
  }

  /** Next/previous focusable in Settings order, or null at the ends. */
  function nextFrom(field, direction) {
    var order = settingsOrder();
    var idx = order.indexOf(field);
    if (idx === -1) {
      return null;
    }
    var step = direction === 'up' ? -1 : 1;
    for (var i = idx + step; i >= 0 && i < order.length; i += step) {
      if (order[i]) {
        return order[i];
      }
    }
    return null;
  }

  function button(label, id, handler, target) {
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
    (target || actions).appendChild(el);
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
  content.appendChild(embySection);
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
    importBtn = focusables[focusables.length - 1].el;
    button(t('settings.importFile'), 'import-file', function () {
      try {
        fileInput.click();
      } catch (err) {
        /* picker unavailable on this platform */
      }
    });
    importFileBtn = focusables[focusables.length - 1].el;
    button(t('settings.close'), 'close', function () {
      if (handlers.onClose) {
        handlers.onClose();
      }
    });
    closeBtn = focusables[focusables.length - 1].el;

    embyHeading.textContent = t('settings.emby');
    embyUrl.setAttribute('placeholder', t('settings.embyUrl'));
    embyUser.setAttribute('placeholder', t('settings.embyUser'));
    embyPass.setAttribute('placeholder', t('settings.embyPass'));
    var embyState = handlers.embyState ? handlers.embyState() : null;
    if (embyState && embyState.connected) {
      embyStatus.textContent =
        t('settings.embyConnected') + ' ' + (embyState.name || '') + ' (' + (embyState.host || '') + ')';
      embyStatus.className = 'addons__status';
    } else {
      embyStatus.textContent = t('settings.embyDisconnected');
      embyStatus.className = 'addons__status is-error';
    }
    button(
      t('settings.embyConnect'),
      'emby-connect',
      function () {
        if (handlers.onEmbyConnect) {
          handlers.onEmbyConnect(
            String(embyUrl.value || '').trim(),
            String(embyUser.value || '').trim(),
            String(embyPass.value || '')
          );
        }
      },
      embyActions
    );
    embyConnectBtn = focusables[focusables.length - 1].el;
    button(
      t('settings.embyDisconnect'),
      'emby-disconnect',
      function () {
        if (handlers.onEmbyDisconnect) {
          handlers.onEmbyDisconnect();
        }
      },
      embyActions
    );
    embyDisconnectBtn = focusables[focusables.length - 1].el;
    // The three fields use the same IME-aware editing mode as the import URL.
    var embyFields = [embyUrl, embyUser, embyPass];
    for (var f = 0; f < embyFields.length; f++) {
      (function (field) {
        focusables.push({
          el: field,
          activate: function () {
            try {
              field.focus();
            } catch (err) {
              /* ignored */
            }
          }
        });
      })(embyFields[f]);
    }

    confHeading.textContent = t('settings.conf');
    confHost.setAttribute('placeholder', t('settings.confHost'));
    confCode.setAttribute('placeholder', t('settings.confCode'));
    if (handlers.confHost) {
      var saved = handlers.confHost();
      if (saved && !confHost.value) {
        confHost.value = saved;
      }
    }
    confStatus.textContent = handlers.confStatus ? handlers.confStatus() : t('settings.confIdle');
    button(
      t('settings.confStart'),
      'conf-start',
      function () {
        if (handlers.onConfStart) {
          handlers.onConfStart(String(confHost.value || '').trim(), String(confCode.value || '').trim());
        }
      },
      confActions
    );
    button(
      t('settings.confApply'),
      'conf-apply',
      function () {
        if (handlers.onConfApply) {
          handlers.onConfApply();
        }
      },
      confActions
    );
    var confButtons = focusables.filter(function (item) {
      var id = item.el.getAttribute ? item.el.getAttribute('data-settings-action') : null;
      return !!id && id.indexOf('conf-') === 0;
    });
    confStartBtn = confButtons.length > 0 ? confButtons[0].el : null;
    confApplyBtn = confButtons.length > 1 ? confButtons[1].el : null;

    // Keep the pairing block contiguous: its fields must be immediately followed
    // by its own action row. The block used to be created early but have its
    // actions appended 170 lines later, so DOWN from the code field landed on the
    // import URL field instead of the pairing actions.
    content.appendChild(confHeading);
    content.appendChild(confHost);
    content.appendChild(confCode);
    content.appendChild(confActions);

    var confFields = [confHost, confCode];
    for (var cf = 0; cf < confFields.length; cf++) {
      (function (field) {
        focusables.push({
          el: field,
          activate: function () {
            try {
              field.focus();
            } catch (err) {
              /* ignored */
            }
          }
        });
      })(confFields[cf]);
    }

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
      // Skipped add-ons, host + reason only (never the configured path/token).
      var failures = last.failures || [];
      if (failures.length) {
        var list = document.createElement('div');
        list.className = 'settings__failures';
        for (var i = 0; i < failures.length; i++) {
          var line = document.createElement('div');
          line.className = 'settings__failure';
          line.textContent =
            failures[i].host + ' · ' + reasonLabel(failures[i].reason);
          list.appendChild(line);
        }
        summary.appendChild(list);
      }
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
    setEmbyStatus: function (message, isError) {
      embyStatus.textContent = message || '';
      embyStatus.className = 'addons__status' + (isError ? ' is-error' : '');
    },
    embyFields: function () {
      return { url: embyUrl, user: embyUser, pass: embyPass };
    },
    setConfStatus: function (message) {
      confStatus.textContent = message || '';
      confStatus.className = 'addons__status';
    },
    nextFrom: nextFrom,
    confFields: function () {
      return { host: confHost, code: confCode };
    },
    focusables: function () {
      return focusables;
    },
    setHandlers: function (next) {
      handlers.onImportUrl = next.onImportUrl || null;
      handlers.onImportText = next.onImportText || null;
      handlers.onClose = next.onClose || null;
      handlers.embyState = next.embyState || null;
      handlers.onEmbyConnect = next.onEmbyConnect || null;
      handlers.onEmbyDisconnect = next.onEmbyDisconnect || null;
      handlers.confHost = next.confHost || null;
      handlers.confStatus = next.confStatus || null;
      handlers.onConfStart = next.onConfStart || null;
      handlers.onConfApply = next.onConfApply || null;
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
