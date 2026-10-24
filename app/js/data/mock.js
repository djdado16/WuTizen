/**
 * data/mock.js — placeholder catalogue.
 *
 * Deliberately invented titles: no third-party metadata, artwork, trademarks or
 * WuPlay profile data are bundled. Milestone 2 replaces this module with the
 * Stremio add-on client (docs/WUPLAY_API_RESEARCH.md).
 */

var ITEMS = [
  { id: 'm1', title: { hr: 'Planina tišine', en: 'Mountain of Silence' }, year: 2019, kind: 'movie', palette: 1, progress: 0.42 },
  { id: 'm2', title: { hr: 'Posljednji vlak', en: 'The Last Train' }, year: 2021, kind: 'movie', palette: 2 },
  { id: 'm3', title: { hr: 'Sedmi kat', en: 'The Seventh Floor' }, year: 2018, kind: 'series', palette: 3, progress: 0.18 },
  { id: 'm4', title: { hr: 'Hladna obala', en: 'Cold Coast' }, year: 2022, kind: 'series', palette: 4 },
  { id: 'm5', title: { hr: 'Grad pod svjetlima', en: 'City Under Lights' }, year: 2020, kind: 'movie', palette: 5, progress: 0.73 },
  { id: 'm6', title: { hr: 'Tiho ljeto', en: 'Quiet Summer' }, year: 2017, kind: 'movie', palette: 6 },
  { id: 'm7', title: { hr: 'Noćna smjena', en: 'Night Shift' }, year: 2023, kind: 'series', palette: 1, progress: 0.09 },
  { id: 'm8', title: { hr: 'Stakleni vrt', en: 'The Glass Garden' }, year: 2016, kind: 'movie', palette: 2 },
  { id: 'm9', title: { hr: 'Prašina i zvijezde', en: 'Dust and Stars' }, year: 2021, kind: 'movie', palette: 3, progress: 0.55 },
  { id: 'm10', title: { hr: 'Rub svijeta', en: 'Edge of the World' }, year: 2019, kind: 'series', palette: 4 },
  { id: 'm11', title: { hr: 'Duga cesta', en: 'The Long Road' }, year: 2015, kind: 'movie', palette: 5, progress: 0.31 },
  { id: 'm12', title: { hr: 'Zvuk kiše', en: 'The Sound of Rain' }, year: 2022, kind: 'movie', palette: 6 }
];

export var MOCK_ITEMS = ITEMS;

export var MOCK_ROWS = [
  {
    id: 'continue',
    titleKey: 'row.continue',
    items: [ITEMS[0], ITEMS[2], ITEMS[4], ITEMS[6], ITEMS[8], ITEMS[10]]
  },
  {
    id: 'movies',
    titleKey: 'row.movies',
    items: ITEMS
  }
];
