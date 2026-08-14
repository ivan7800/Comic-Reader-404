const fields = [
  'Title', 'Series', 'Number', 'Count', 'Volume', 'Summary', 'Year', 'Month', 'Day',
  'Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'CoverArtist', 'Editor',
  'Publisher', 'Imprint', 'Genre', 'Tags', 'Web', 'LanguageISO', 'Format', 'AgeRating',
  'Manga', 'Characters', 'Teams', 'Locations', 'StoryArc', 'SeriesGroup', 'PageCount',
];

const MAX_XML_CHARS = 2_000_000;
const LIMITS = {
  Title: 160,
  Series: 160,
  Number: 24,
  Count: 24,
  Volume: 24,
  Summary: 3000,
  Year: 4,
  Month: 2,
  Day: 2,
  Writer: 220,
  Penciller: 220,
  Inker: 220,
  Colorist: 220,
  Letterer: 220,
  CoverArtist: 220,
  Editor: 220,
  Publisher: 160,
  Imprint: 160,
  Genre: 240,
  Tags: 500,
  Web: 500,
  LanguageISO: 24,
  Format: 80,
  AgeRating: 80,
  Manga: 80,
  Characters: 1000,
  Teams: 1000,
  Locations: 1000,
  StoryArc: 220,
  SeriesGroup: 220,
  PageCount: 8,
};

export function parseComicInfo(xmlText = '') {
  if (!xmlText || typeof DOMParser === 'undefined') return {};
  if (xmlText.length > MAX_XML_CHARS) return {};

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) return {};

  const out = {};
  for (const key of fields) {
    const element = doc.querySelector(key);
    const value = element?.textContent?.trim();
    if (value) out[key] = clean(value, LIMITS[key] || 500);
  }

  const pages = [...doc.querySelectorAll('Pages > Page')]
    .slice(0, 5000)
    .map((element) => ({
      image: num(element.getAttribute('Image')),
      type: clean(element.getAttribute('Type') || '', 80),
      doublePage: element.getAttribute('DoublePage') === 'true',
    }));
  if (pages.length) out.Pages = pages;

  return normalizeComicInfo(out);
}

export function normalizeComicInfo(raw = {}) {
  const manga = String(raw.Manga || '').toLowerCase();
  const rtl = manga.includes('righttoleft') || manga === 'yes' || manga === 'true';
  const coverPage = Array.isArray(raw.Pages)
    ? raw.Pages.find((page) => /frontcover|innercover/i.test(page.type))?.image
    : undefined;

  return {
    title: clean(raw.Title, 160),
    series: clean(raw.Series, 160),
    number: clean(raw.Number, 24),
    count: cleanNum(raw.Count, 24),
    volume: cleanNum(raw.Volume, 24),
    summary: clean(raw.Summary, 3000),
    year: cleanNum(raw.Year, 4),
    month: cleanNum(raw.Month, 2),
    day: cleanNum(raw.Day, 2),
    writer: clean(raw.Writer, 220),
    penciller: clean(raw.Penciller, 220),
    inker: clean(raw.Inker, 220),
    colorist: clean(raw.Colorist, 220),
    coverArtist: clean(raw.CoverArtist, 220),
    publisher: clean(raw.Publisher, 160),
    imprint: clean(raw.Imprint, 160),
    genre: clean(raw.Genre, 240),
    tags: clean(raw.Tags, 500),
    language: clean(raw.LanguageISO, 24),
    ageRating: clean(raw.AgeRating, 80),
    storyArc: clean(raw.StoryArc, 220),
    seriesGroup: clean(raw.SeriesGroup, 220),
    characters: clean(raw.Characters, 1000),
    rtl,
    coverPage: Number.isInteger(coverPage) && coverPage >= 0 && coverPage < 5000 ? coverPage : 0,
    hasComicInfo: Object.keys(raw).length > 0,
  };
}

function cleanNum(value, max) {
  if (value === undefined || value === null || value === '' || value === '-1') return '';
  return clean(value, max);
}

function clean(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}
