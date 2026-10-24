/**
 * hero.js — cinematic hero for the featured title.
 *
 * Backdrop is a single CSS background image (already loaded, no JS layout work);
 * the left-to-right and bottom-up scrims are pure CSS gradients so the layout
 * stays identical on Chromium M63 and in the browser preview.
 */

import { t } from '../../i18n/index.js';

export function createHero(item, lang) {
  var current = lang || 'hr';

  var el = document.createElement('section');
  el.className = 'hero';

  var bg = document.createElement('div');
  bg.className = 'hero__bg';
  bg.style.backgroundImage = 'url("' + item.image + '")';

  var scrim = document.createElement('div');
  scrim.className = 'hero__scrim';

  var content = document.createElement('div');
  content.className = 'hero__content';

  var title = document.createElement('h1');
  title.className = 'hero__title';

  var meta = document.createElement('div');
  meta.className = 'hero__meta';

  var duration = document.createElement('span');
  duration.className = 'hero__duration';

  var year = document.createElement('span');
  year.className = 'hero__year';

  var rating = document.createElement('span');
  rating.className = 'rating';

  var genres = document.createElement('span');
  genres.className = 'hero__genres';

  meta.appendChild(duration);
  meta.appendChild(year);
  meta.appendChild(rating);
  meta.appendChild(genres);

  var desc = document.createElement('p');
  desc.className = 'hero__desc';

  var cast = document.createElement('div');
  cast.className = 'hero__cast';

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(desc);
  content.appendChild(cast);

  el.appendChild(bg);
  el.appendChild(scrim);
  el.appendChild(content);

  function render() {
    title.textContent = item.title[current] || item.title.hr;
    duration.textContent = item.minutes + ' ' + t('unit.min');
    year.textContent = String(item.year);
    rating.textContent = item.rating.toFixed(1);
    genres.textContent = item.genres[current] || item.genres.hr;
    desc.textContent = item.description[current] || item.description.hr;
    cast.textContent = item.cast.join(', ');
  }

  render();

  return {
    el: el,
    item: item,
    updateLanguage: function (next) {
      current = next;
      render();
    }
  };
}
