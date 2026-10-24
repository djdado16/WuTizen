/**
 * rail.js — left navigation rail.
 *
 * The language entry is part of the rail so it is reachable with the D-pad only
 * (no pointer, no separate settings screen in Milestone 0).
 */

import { t } from '../../i18n/index.js';

/* Static, authored icon markup — no interpolated or user-provided content. */
var ICONS = {
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 11.5 12 4.2l8 7.3"/><path d="M6.6 10.4V20h10.8v-9.6"/></svg>',
  catalog:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/>' +
    '<rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4.2 4.2"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.1M12 18.3v2.1M3.6 12h2.1M18.3 12h2.1"/>' +
    '<path d="M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5"/></svg>',
  language:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="8"/><path d="M4.2 12h15.6"/>' +
    '<path d="M12 4c2.3 2.2 3.5 5 3.5 8s-1.2 5.8-3.5 8c-2.3-2.2-3.5-5-3.5-8s1.2-5.8 3.5-8Z"/></svg>'
};

/**
 * @param {{items: Array, onSelect: function(string)}} options
 */
export function createRail(options) {
  var defs = options.items || [];
  var nodes = [];

  var el = document.createElement('nav');
  el.className = 'rail';
  el.setAttribute('aria-label', 'Primary');

  var brand = document.createElement('div');
  brand.className = 'rail__brand';

  var logo = document.createElement('div');
  logo.className = 'rail__logo';
  logo.textContent = 'W';

  var brandText = document.createElement('div');
  brandText.className = 'rail__brand-text';

  var name = document.createElement('div');
  name.className = 'rail__name';
  name.setAttribute('data-i18n', 'app.name');

  var tagline = document.createElement('div');
  tagline.className = 'rail__tagline';
  tagline.setAttribute('data-i18n', 'app.tagline');

  brandText.appendChild(name);
  brandText.appendChild(tagline);
  brand.appendChild(logo);
  brand.appendChild(brandText);
  el.appendChild(brand);

  var nav = document.createElement('div');
  nav.className = 'rail__nav';
  nav.setAttribute('data-focus-region', 'rail');

  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];

    var node = document.createElement('div');
    node.className = 'rail__item';
    node.setAttribute('role', 'button');
    node.setAttribute('data-rail-id', def.id);

    var icon = document.createElement('span');
    icon.className = 'rail__icon';
    icon.innerHTML = ICONS[def.icon] || ICONS.home;

    var label = document.createElement('span');
    label.className = 'rail__label';

    node.appendChild(icon);
    node.appendChild(label);
    nav.appendChild(node);
    nodes.push({ el: node, def: def, label: label });
  }

  el.appendChild(nav);

  var hint = document.createElement('div');
  hint.className = 'rail__hint';
  hint.setAttribute('data-i18n', 'rail.hint');
  el.appendChild(hint);

  function labelFor(entry, lang) {
    if (entry.def.dynamic === 'language') {
      // The globe icon conveys the meaning; the label is just the target
      // language name so it fits the rail without truncation.
      return t('lang.' + lang);
    }
    return t(entry.def.labelKey);
  }

  function updateLanguage(lang) {
    for (var j = 0; j < nodes.length; j++) {
      var text = labelFor(nodes[j], lang);
      nodes[j].label.textContent = text;
      nodes[j].el.setAttribute(
        'aria-label',
        nodes[j].def.dynamic === 'language' ? t('nav.language') + ': ' + text : text
      );
    }
  }

  return { el: el, nodes: nodes, updateLanguage: updateLanguage };
}
