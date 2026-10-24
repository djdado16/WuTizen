/**
 * card.js — one poster card.
 *
 * Artwork is a CSS gradient placeholder on purpose: no third-party poster
 * images are downloaded or bundled in Milestone 0.
 */

export function createCard(item) {
  var el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'button');
  el.setAttribute('data-item-id', item.id);

  var poster = document.createElement('div');
  poster.className = 'card__poster poster--' + (item.palette || 1);

  var year = document.createElement('span');
  year.className = 'card__year';
  year.textContent = String(item.year);
  poster.appendChild(year);

  if (typeof item.progress === 'number') {
    var progress = document.createElement('div');
    progress.className = 'card__progress';
    var fill = document.createElement('div');
    fill.className = 'card__progress-fill';
    fill.style.width = Math.round(item.progress * 100) + '%';
    progress.appendChild(fill);
    poster.appendChild(progress);
  }

  var title = document.createElement('div');
  title.className = 'card__title';

  el.appendChild(poster);
  el.appendChild(title);

  function updateLanguage(lang) {
    var text = item.title[lang] || item.title.hr;
    title.textContent = text;
    el.setAttribute('aria-label', text + ', ' + item.year);
  }

  return {
    el: el,
    item: item,
    updateLanguage: updateLanguage
  };
}
