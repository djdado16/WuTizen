/**
 * views/addons.js — Add-on manager (add / remove, presets, custom URL).
 *
 * Remote-only UI: every action is a focusable element. The URL field is a real
 * <input>, so typing depends on the TV's on-screen keyboard / IME being routed
 * to the page (documented limitation; presets avoid it entirely).
 */

import { t } from '../../i18n/index.js';
import { listAddons, PRESETS, hasAddon } from '../../state/addons.js';

export function createAddonsView() {
  var root = document.createElement('div');
  root.className = 'details addons';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-focus-region', 'overlay');

  var scrim = document.createElement('div');
  scrim.className = 'details__scrim';

  var content = document.createElement('div');
  content.className = 'details__content addons__content';

  var title = document.createElement('h1');
  title.className = 'details__title addons__title';

  var hint = document.createElement('p');
  hint.className = 'details__desc addons__hint';

  var status = document.createElement('div');
  status.className = 'addons__status';

  var installedSection = document.createElement('div');
  var presetsSection = document.createElement('div');
  var customSection = document.createElement('div');

  var customInput = document.createElement('input');
  customInput.className = 'addon-input';
  customInput.setAttribute('type', 'text');
  customInput.setAttribute('spellcheck', 'false');
  customInput.setAttribute('placeholder', t('addons.urlPlaceholder'));

  content.appendChild(title);
  content.appendChild(hint);
  content.appendChild(status);
  content.appendChild(installedSection);
  content.appendChild(presetsSection);
  content.appendChild(customSection);

  root.appendChild(scrim);
  root.appendChild(content);

  var handlers = { onAdd: null, onRemove: null };
  var focusables = [];

  function sectionHeading(key) {
    var heading = document.createElement('h3');
    heading.className = 'details__section addons__section';
    heading.textContent = t(key);
    return heading;
  }

  function actionButton(label, id, handler) {
    var button = document.createElement('div');
    button.className = 'btn addons__action';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '-1');
    button.setAttribute('data-addon-action', id);
    var text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener('click', handler);
    focusables.push({ el: button, activate: handler });
    return button;
  }

  function addonRow(nameText, metaText, action) {
    var row = document.createElement('div');
    row.className = 'addon-row';
    var name = document.createElement('span');
    name.className = 'addon-row__name';
    name.textContent = nameText;
    var meta = document.createElement('span');
    meta.className = 'addon-row__meta';
    meta.textContent = metaText;
    row.appendChild(name);
    row.appendChild(meta);
    if (action) {
      row.appendChild(action);
    }
    return row;
  }

  function render() {
    focusables = [];
    installedSection.innerHTML = '';
    presetsSection.innerHTML = '';
    customSection.innerHTML = '';

    title.textContent = t('addons.title');
    hint.textContent = t('addons.hint');

    installedSection.appendChild(sectionHeading('addons.installed'));
    var installed = listAddons();
    if (!installed.length) {
      var empty = document.createElement('div');
      empty.className = 'addons__empty';
      empty.textContent = t('addons.empty');
      installedSection.appendChild(empty);
    } else {
      for (var i = 0; i < installed.length; i++) {
        (function (addon) {
          var resourceText = (addon.resources || []).join(', ');
          var metaText =
            resourceText + ' · ' + (addon.catalogs || []).length + ' ' + t('addons.catalogs');
          installedSection.appendChild(
            addonRow(
              addon.name + (addon.version ? '  v' + addon.version : ''),
              metaText,
              actionButton(t('addons.remove'), 'remove:' + addon.url, function () {
                if (handlers.onRemove) {
                  handlers.onRemove(addon.url);
                }
              })
            )
          );
        })(installed[i]);
      }
    }

    presetsSection.appendChild(sectionHeading('addons.presets'));
    for (var p = 0; p < PRESETS.length; p++) {
      (function (preset) {
        var action = null;
        if (hasAddon(preset.url)) {
          var tag = document.createElement('span');
          tag.className = 'addon-row__meta';
          tag.textContent = t('addons.installedTag');
          action = tag;
        } else {
          action = actionButton(t('addons.add'), 'add:' + preset.url, function () {
            if (handlers.onAdd) {
              handlers.onAdd(preset.url);
            }
          });
        }
        presetsSection.appendChild(addonRow(t(preset.labelKey), preset.url, action));
      })(PRESETS[p]);
    }

    customSection.appendChild(sectionHeading('addons.custom'));
    var customRow = document.createElement('div');
    customRow.className = 'addon-row';
    customRow.appendChild(customInput);
    customRow.appendChild(
      actionButton(t('addons.add'), 'add:custom', function () {
        var value = String(customInput.value || '').trim();
        if (value && handlers.onAdd) {
          handlers.onAdd(value);
        }
      })
    );
    customSection.appendChild(customRow);
    focusables.push({ el: customInput, activate: function () {} });
  }

  function setStatus(message, isError) {
    status.textContent = message || '';
    status.className = 'addons__status' + (isError ? ' is-error' : '');
  }

  return {
    el: root,
    input: customInput,
    render: render,
    setStatus: setStatus,
    focusables: function () {
      return focusables;
    },
    setHandlers: function (next) {
      handlers.onAdd = next.onAdd || null;
      handlers.onRemove = next.onRemove || null;
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    }
  };
}
