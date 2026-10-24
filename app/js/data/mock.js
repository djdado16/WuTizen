/**
 * data/mock.js — placeholder catalogue for the WuPlay-style layout.
 *
 * Every title, synopsis, duration, rating and episode is invented. The artwork
 * is public-domain NASA material (see app/assets/sample/CREDITS.md). Nothing
 * here comes from a WuPlay profile, add-on or private export.
 */

var CAST = ['Marta Kovač', 'Luka Novak', 'Ivana Radić'];

function make(id, kind, hr, en, year, minutes, rating, genreHr, genreEn, descHr, descEn, img) {
  return {
    id: id,
    kind: kind,
    title: { hr: hr, en: en },
    year: year,
    minutes: minutes,
    rating: rating,
    genres: { hr: genreHr, en: genreEn },
    description: { hr: descHr, en: descEn },
    cast: CAST,
    image: 'assets/sample/space-' + img + '.jpg'
  };
}

var MOVIES = [
  make('mv1', 'movie', 'Tišina svemira', 'Silence of Space', 2019, 118, 8.1, 'Znanstvena fantastika | Drama', 'Sci-Fi | Drama',
    'Posada izgubljene postaje hvata signal koji ne bi smio postojati i mora odlučiti hoće li odgovoriti.',
    'The crew of a lost station picks up a signal that should not exist and must decide whether to answer it.',
    '01'),
  make('mv2', 'movie', 'Crveni horizont', 'Red Horizon', 2021, 104, 7.4, 'Avantura | SF', 'Adventure | Sci-Fi',
    'Prva ekspedicija na rub crvene pustinje otkriva da horizont nije ono što izgleda.',
    'The first expedition to the edge of the red desert discovers the horizon is not what it seems.',
    '02'),
  make('mv3', 'movie', 'Zvjezdana prašina', 'Stardust', 2018, 96, 6.9, 'Drama | SF', 'Drama | Sci-Fi',
    'Dvoje istraživača provode godinu dana skupljajući prašinu komete i vlastite uspomene.',
    'Two researchers spend a year collecting comet dust and their own memories.',
    '03'),
  make('mv4', 'movie', 'Orbita', 'Orbit', 2022, 127, 7.8, 'Triler | SF', 'Thriller | Sci-Fi',
    'Jedan krug oko planeta postaje pitanje života i smrti kada otkaže sustav za održavanje.',
    'One lap around the planet becomes a matter of life and death when life support fails.',
    '04'),
  make('mv5', 'movie', 'Noć na Marsu', 'Night on Mars', 2020, 111, 7.1, 'SF | Horor', 'Sci-Fi | Horror',
    'Istraživačka baza ostaje bez veze sa Zemljom, a netko ili nešto kuca po vanjskom otvoru.',
    'A research base loses contact with Earth, and someone or something knocks on the outer hatch.',
    '05'),
  make('mv6', 'movie', 'Posljednji signal', 'The Last Signal', 2023, 134, 8.3, 'Misterij | SF', 'Mystery | Sci-Fi',
    'Radio astronom otkriva ponavljajući uzorak koji seže dalje od granice promatranog svemira.',
    'A radio astronomer finds a repeating pattern reaching beyond the observable universe.',
    '06'),
  make('mv7', 'movie', 'Treći mjesec', 'The Third Moon', 2017, 89, 6.5, 'Avantura', 'Adventure',
    'Kartografi otkrivaju treći, nenavedeni mjesec i pokušavaju ga ucrtati prije oluje.',
    'Cartographers discover an unlisted third moon and try to chart it before the storm arrives.',
    '07'),
  make('mv8', 'movie', 'Duboko polje', 'Deep Field', 2021, 121, 7.9, 'Dokumentarni', 'Documentary',
    'Godina rada jednog teleskopa sažeta u priču o tisućama galaksija u jednoj točki neba.',
    'A year of telescope work condensed into a story of thousands of galaxies in one point of sky.',
    '08'),
  make('mv9', 'movie', 'Bijeli div', 'White Giant', 2016, 102, 7.2, 'Drama', 'Drama',
    'Astronaut se vraća kući nakon dvadeset godina i otkriva da ga nitko više ne prepoznaje.',
    'An astronaut returns home after twenty years and finds nobody recognises him anymore.',
    '09'),
  make('mv10', 'movie', 'Izvan dosega', 'Out of Reach', 2022, 115, 6.8, 'Akcija | SF', 'Action | Sci-Fi',
    'Kurir mora prenijeti uzorak kroz tri kolonije prije nego ga presretne lovac na nagrade.',
    'A courier must carry a sample through three colonies before a bounty hunter intercepts him.',
    '10')
];

var SERIES = [
  make('sr1', 'series', 'Kolonija', 'The Colony', 2021, 45, 8.0, 'SF | Drama', 'Sci-Fi | Drama',
    'Prva generacija rođena izvan Zemlje suočava se s odlukom svojih roditelja.',
    'The first generation born off Earth confronts the decision their parents made.',
    '04'),
  make('sr2', 'series', 'Signal iz tame', 'Signal from the Dark', 2022, 52, 7.6, 'Misterij', 'Mystery',
    'Istražiteljica svake noći bilježi isti tihi impuls, a svaki dolazi s drugog mjesta.',
    'An investigator records the same quiet pulse every night, each from a different place.',
    '06'),
  make('sr3', 'series', 'Mjesečevi ljudi', 'Moon People', 2020, 41, 7.0, 'SF', 'Sci-Fi',
    'Mala posada rudarske stanice otkriva tragove koji nisu njihovi.',
    'A small mining-station crew finds traces that are not their own.',
    '02'),
  make('sr4', 'series', 'Tihi prolaz', 'Silent Pass', 2019, 48, 6.7, 'Drama', 'Drama',
    'Dvije obitelji dijele karantenu u prolazu prema unutrašnjosti planeta.',
    'Two families share a quarantine in a pass leading to the planet interior.',
    '08'),
  make('sr5', 'series', 'Deveta stanica', 'Station Nine', 2023, 55, 8.4, 'SF | Triler', 'Sci-Fi | Thriller',
    'Stanica koja službeno ne postoji prima hitne pozive s planeta koji je napušten.',
    'A station that officially does not exist receives distress calls from an abandoned planet.',
    '10'),
  make('sr6', 'series', 'Pustinja leda', 'Desert of Ice', 2018, 44, 7.3, 'Avantura', 'Adventure',
    'Ekspedicija prelazi zaleđenu visoravan i pritom budi ono što je pod njom spavalo.',
    'An expedition crosses a frozen plateau and wakes what slept beneath it.',
    '03'),
  make('sr7', 'series', 'Visina', 'Altitude', 2022, 39, 6.6, 'Drama', 'Drama',
    'Tim na orbiti uči kako živjeti bez gravitacije i bez starih navika.',
    'A team in orbit learns to live without gravity and without old habits.',
    '05'),
  make('sr8', 'series', 'Noćni sat', 'Night Hour', 2021, 50, 7.7, 'Horor', 'Horror',
    'Svake noći u isto vrijeme baza izgubi struju na točno četrdeset sekundi.',
    'Every night at the same time the base loses power for exactly forty seconds.',
    '07')
];

export var HERO_ID = 'mv1';

export var ROWS = [
  { id: 'movies', titleKey: 'row.movies', variant: 'poster', items: MOVIES },
  {
    id: 'continue',
    titleKey: 'row.continue',
    variant: 'landscape',
    items: [
      { item: MOVIES[2], progress: 0.42, badge: 'S1 E3' },
      { item: MOVIES[4], progress: 0.18, badge: 'S2 E1' },
      { item: MOVIES[5], progress: 0.73, badge: 'S1 E7' },
      { item: MOVIES[7], progress: 0.31 },
      { item: MOVIES[1], progress: 0.55, badge: 'S3 E2' },
      { item: MOVIES[8], progress: 0.09 }
    ]
  },
  { id: 'series', titleKey: 'row.series', variant: 'poster', items: SERIES }
];

var ALL = MOVIES.concat(SERIES);

export function getItem(id) {
  for (var i = 0; i < ALL.length; i++) {
    if (ALL[i].id === id) {
      return ALL[i];
    }
  }
  return MOVIES[0];
}

export function getHero() {
  return getItem(HERO_ID);
}

/** Episodes exist only for series; generated deterministically (placeholder). */
export function getEpisodes(item) {
  if (!item || item.kind !== 'series') {
    return [];
  }
  var list = [];
  for (var n = 1; n <= 6; n++) {
    list.push({
      id: item.id + '-e' + n,
      number: n,
      title: { hr: 'Epizoda ' + n, en: 'Episode ' + n },
      minutes: 38 + n * 2,
      image: item.image
    });
  }
  return list;
}

