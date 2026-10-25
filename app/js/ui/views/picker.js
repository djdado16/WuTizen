/**
 * ui/views/picker.js — generic remote-first list overlay.
 *
 * Used for the source picker (grouped by add-on) and the subtitle picker
 * (languages + size/position/offset controls). One list implementation keeps the
 * remote contract identical everywhere: UP/DOWN moves, OK activates, BACK closes.
 */

export function createPicker(options) {
  var opts = options || {};

  var root = document.createElement('div');
  root.className = 'details picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('data-focus-region', 'overlay');
  root.setAttribute('data-picker', opts.name || 'picker');

  var scrim = document.createElement('div');
  scrim.className = 'details__scrim';

  var content = document.createElement('div');
  content.className = 'details__content picker__content';

  var title = document.createElement('h1');
  title.className = 'details__title picker__title';

  var note = document.createElement('p');
  note.className = 'details__desc picker__note';

  var list = document.createElement('div');
  list.className = 'picker__list';

  content.appendChild(title);
  content.appendChild(note);
  content.appendChild(list);
  root.appendChild(scrim);
  root.appendChild(content);

  var focusables = [];

  function show(options2) {
    var data = options2 || {};
    focusables = [];
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    title.textContent = data.title || '';
    note.textContent = data.note || '';
    var rows = data.rows || [];
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        if (row.group) {
          var heading = document.createElement('div');
          heading.className = 'picker__group';
          heading.textContent = row.label;
          list.appendChild(heading);
          return;
        }
        var el = document.createElement('div');
        el.className = 'picker-row' + (row.active ? ' is-active' : '');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '-1');
        el.setAttribute('data-picker-row', String(row.id));
        var label = document.createElement('span');
        label.className = 'picker-row__label';
        label.textContent = row.label;
        el.appendChild(label);
        if (row.meta) {
          var meta = document.createElement('span');
          meta.className = 'picker-row__meta';
          meta.textContent = row.meta;
          el.appendChild(meta);
        }
        var activate = function () {
          if (row.onActivate) {
            row.onActivate();
          }
        };
        el.addEventListener('click', activate);
        focusables.push({ el: el, activate: activate });
        list.appendChild(el);
      })(rows[i]);
    }
    root.classList.add('is-open');
  }

  return {
    el: root,
    show: show,
    close: function () {
      root.classList.remove('is-open');
      focusables = [];
    },
    isOpen: function () {
      return root.classList.contains('is-open');
    },
    focusables: function () {
      return focusables;
    }
  };
}
