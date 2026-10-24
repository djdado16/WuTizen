/**
 * rail.js — icon-only navigation rail that expands when it has focus.
 *
 * Collapsed: icons only, no background (the hero shows through, as in the
 * WuPlay reference). Expanded: a translucent panel slides in (translate3d on
 * .rail__panel — no width animation) and the labels fade in. Focus is marked
 * with the pink brand border (see layout.css).
 */

import { t } from '../../i18n/index.js';

/* Static, authored icon markup — no interpolated or user content. */
var ICONS = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<circle cx="10.6" cy="10.6" r="6.1"/><path d="m15.2 15.2 4.6 4.6"/></svg>',
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3.6 11.4 12 3.9l8.4 7.5"/><path d="M6.2 10.2V20h11.6v-9.8"/></svg>',
  compass:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="8.3"/><path d="m9 15 1.9-4.1L15 9l-1.9 4.1z"/></svg>',
  bookmark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
    '<path d="M6.5 4.2h11v16l-5.5-4-5.5 4z"/></svg>',
  addons:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">' +
    '<rect x="3.8" y="3.8" width="7.2" height="7.2" rx="1.6"/>' +
    '<rect x="13" y="3.8" width="7.2" height="7.2" rx="1.6"/>' +
    '<rect x="3.8" y="13" width="7.2" height="7.2" rx="1.6"/>' +
    '<path d="M16.6 13.2v6.8M13.2 16.6h6.8"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="8.2"/><path d="M3.9 12h16.2"/>' +
    '<path d="M12 3.8c2.3 2.3 3.5 5.1 3.5 8.2s-1.2 5.9-3.5 8.2c-2.3-2.3-3.5-5.1-3.5-8.2S9.7 6.1 12 3.8Z"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.1M12 18.3v2.1M3.6 12h2.1M18.3 12h2.1"/>' +
    '<path d="M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5"/></svg>'
};

function buildItem(def, lang) {
  var el = document.createElement('div');
  el.className = 'rail__item';
  if (def.active) {
    el.className += ' is-active';
  }
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '-1');
  el.setAttribute('data-rail-id', def.id);

  var icon = document.createElement('span');
  icon.className = 'rail__icon';

  if (def.profile) {
    var avatar = document.createElement('div');
    avatar.className = 'rail__avatar';
    avatar.textContent = 'DJ';
    icon.appendChild(avatar);
  } else {
    icon.innerHTML = ICONS[def.icon] || ICONS.home;
  }

  var label = document.createElement('span');
  label.className = 'rail__label';

  el.appendChild(icon);
  el.appendChild(label);

  return { el: el, def: def, label: label, lang: lang };
}

export function createRail(options) {
  var defs = options.items || [];
  var lang = options.language || 'hr';
  var nodes = [];

  var el = document.createElement('nav');
  el.className = 'rail';
  el.setAttribute('data-focus-region', 'rail');
  el.setAttribute('aria-label', 'Primary');

  var panel = document.createElement('div');
  panel.className = 'rail__panel';
  el.appendChild(panel);

  var itemsEl = document.createElement('div');
  itemsEl.className = 'rail__items';

  if (options.profile) {
    var profileNode = buildItem(options.profile, lang);
    nodes.push(profileNode);
    itemsEl.appendChild(profileNode.el);
  }

  var bottomNodes = [];
  for (var i = 0; i < defs.length; i++) {
    var node = buildItem(defs[i], lang);
    nodes.push(node);
    if (defs[i].bottom) {
      bottomNodes.push(node);
    } else {
      itemsEl.appendChild(node.el);
    }
  }

  var spacer = document.createElement('div');
  spacer.className = 'rail__spacer';
  itemsEl.appendChild(spacer);

  for (var j = 0; j < bottomNodes.length; j++) {
    itemsEl.appendChild(bottomNodes[j].el);
  }

  el.appendChild(itemsEl);

  function labelFor(node, current) {
    if (node.def.dynamic === 'language') {
      return t('lang.' + current);
    }
    return t(node.def.labelKey);
  }

  function updateLanguage(current) {
    for (var k = 0; k < nodes.length; k++) {
      var text = labelFor(nodes[k], current);
      nodes[k].label.textContent = text;
      nodes[k].el.setAttribute('aria-label', text);
    }
  }

  function setExpanded(value) {
    if (value) {
      el.classList.add('is-expanded');
    } else {
      el.classList.remove('is-expanded');
    }
  }

  updateLanguage(lang);

  return {
    el: el,
    nodes: nodes,
    setExpanded: setExpanded,
    isExpanded: function () {
      return el.classList.contains('is-expanded');
    },
    updateLanguage: updateLanguage
  };
}
