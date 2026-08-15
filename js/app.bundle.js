/* Comic Reader 404 Ultimate v3.0.0 core runtime bundle. HTTP(S) + file:// */
'use strict';

/* === utils.js === */
const imageExt = /\.(jpe?g|png|webp|avif|gif)$/i;

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function baseName(name) {
  return String(name || '')
    .replace(/\.(cbz|cbr|zip|rar|pdf)$/i, '')
    .replace(/[._]+/g, ' ')
    .trim();
}

function formatOf(name, type = '') {
  const normalized = String(name || '').toLowerCase();
  if (normalized.endsWith('.cbz') || normalized.endsWith('.zip')) return 'CBZ';
  if (normalized.endsWith('.cbr') || normalized.endsWith('.rar')) return 'CBR';
  if (normalized.endsWith('.pdf') || type === 'application/pdf') return 'PDF';
  return 'IMG';
}

function bookId(file) {
  if (file?.idKey) return String(file.idKey);
  return `${file?.name || 'comic'}|${Number(file?.size) || 0}|${Number(file?.lastModified) || 0}`;
}

function imageCollectionDescriptor(files) {
  const list = [...files]
    .filter(Boolean)
    .sort((a, b) => naturalCompare(a.webkitRelativePath || a.name || '', b.webkitRelativePath || b.name || ''));
  if (!list.length) return { name: 'Colección de imágenes', size: 0, lastModified: 0, type: 'image/*', idKey: 'images:empty' };

  const first = list[0];
  const relative = first.webkitRelativePath || '';
  const parent = relative.includes('/') ? relative.split('/').slice(0, -1).join('/') : '';
  const label = parent ? parent.split('/').at(-1) : `${baseName(first.name)}${list.length > 1 ? ` + ${list.length - 1}` : ''}`;
  const size = list.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const lastModified = Math.max(...list.map((file) => Number(file.lastModified) || 0));
  return {
    name: label || baseName(first.name) || 'Colección de imágenes',
    size,
    lastModified,
    type: 'image/*',
    idKey: `images:${collectionHash(list)}:${list.length}:${size}`,
  };
}

function collectionHash(files) {
  let hash = 2166136261;
  for (const file of files) {
    const token = `${file.webkitRelativePath || file.name || ''}|${Number(file.size) || 0}|${Number(file.lastModified) || 0};`;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}

async function blobToDataUrl(blob, maxW = 360, maxH = 540, quality = 0.78) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxW / image.naturalWidth, maxH / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function placeholderCover(title) {
  const words = String(title || 'COMIC').replace(/\s+/g, ' ').trim().slice(0, 54).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > 16 && line) {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < 3) lines.push(line);
  const tspans = lines.slice(0, 3).map((text, index) => `<tspan x="50" dy="${index ? 68 : 0}">${escapeHtml(text)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#15171c"/><stop offset="1" stop-color="#2a0d09"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><text x="50" y="110" fill="#ff4d2e" font-family="Arial,sans-serif" font-size="34" font-weight="900">COMIC READER 404</text><text x="50" y="350" fill="#ffffff" font-family="Arial,sans-serif" font-size="58" font-weight="900">${tspans}</text><text x="50" y="825" fill="#999999" font-family="Arial,sans-serif" font-size="24">LOCAL LIBRARY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function mimeFromName(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.avif')) return 'image/avif';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/* === metadata.js === */
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

function parseComicInfo(xmlText = '') {
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

function normalizeComicInfo(raw = {}) {
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

/* === storage.js === */
const LIB_KEY = 'cr404.library.v2';
const OLD_LIB_KEY = 'cr404.library.v1';
const SETTINGS_KEY = 'cr404.settings.v2';
const OLD_SETTINGS_KEY = 'cr404.settings.v1';
const HISTORY_KEY = 'cr404.history.v2';

const MAX_LIBRARY_ITEMS = 500;
const MAX_HISTORY_ITEMS = 300;
const MAX_COVER_CHARS = 400_000;
const VALID_THEMES = new Set(['noir', 'oled', 'paper', 'retro', 'universe']);
const VALID_MODES = new Set(['single', 'double', 'webtoon']);
const VALID_FITS = new Set(['contain', 'width']);

const defaults = {
  theme: 'noir',
  defaultMode: 'single',
  rtl: false,
  autoHide: true,
  fit: 'contain',
};

function loadLibrary() {
  try {
    let raw = localStorage.getItem(LIB_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_LIB_KEY);
      if (raw) {
        const migrated = normalizeLibrary(JSON.parse(raw));
        saveLibrary(migrated);
        return migrated;
      }
    }
    const items = normalizeLibrary(JSON.parse(raw || '[]'));
    return migrateStartedState(items);
  } catch {
    return [];
  }
}

function saveLibrary(items) {
  const capped = normalizeLibrary(items).slice(0, MAX_LIBRARY_ITEMS);
  const coverBudgets = [capped.length, 50, 15, 0];
  let lastError;

  for (const keepCovers of coverBudgets) {
    const candidate = keepCovers >= capped.length
      ? capped
      : capped.map((book, index) => (index < keepCovers ? book : { ...book, cover: '' }));
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(candidate));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`No hay espacio local suficiente para guardar los metadatos. Exporta una copia y reduce la biblioteca.${lastError?.message ? ` (${lastError.message})` : ''}`);
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(OLD_SETTINGS_KEY) || '{}');
    return normalizeSettings(raw);
  } catch {
    return { ...defaults };
  }
}

function saveSettings(value) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(value)));
}

function upsertBook(book) {
  const list = loadLibrary();
  const index = list.findIndex((item) => item.id === book.id);
  const next = normalizeBook(index >= 0 ? { ...list[index], ...book } : book);
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  saveLibrary(list);
  return list;
}

function patchBook(id, patch) {
  const list = loadLibrary();
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) {
    list[index] = normalizeBook({ ...list[index], ...patch });
    saveLibrary(list);
  }
  return list;
}

function deleteBook(id) {
  const list = loadLibrary().filter((item) => item.id !== id);
  saveLibrary(list);
  saveHistory(loadHistory().filter((item) => item.bookId !== id));
  return list;
}

function findBook(id) {
  return loadLibrary().find((item) => item.id === id) || null;
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return normalizeHistory(raw);
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalizeHistory(items).slice(0, MAX_HISTORY_ITEMS)));
}

function addHistory(book) {
  const list = loadHistory();
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bookId: book.id,
    title: book.title,
    series: book.series || '',
    page: Math.max(1, (book.progress || 0) + 1),
    total: book.total || 0,
    at: Date.now(),
  });
  saveHistory(list);
  return list;
}

function getShelves() {
  return [...new Set(loadLibrary().map((item) => item.shelf?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function toggleBookmark(id, page) {
  const book = findBook(id);
  if (!book || book.format === 'PDF') return [];
  const safePage = clampInt(page, 0, Math.max(0, book.total - 1));
  const set = new Set(book.bookmarks || []);
  set.has(safePage) ? set.delete(safePage) : set.add(safePage);
  const bookmarks = [...set].sort((a, b) => a - b);
  patchBook(id, { bookmarks });
  return bookmarks;
}

function exportBackup() {
  return {
    schema: 'comic-reader-404-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    library: loadLibrary(),
    history: loadHistory(),
    settings: loadSettings(),
  };
}

function importBackup(data) {
  if (!data || data.schema !== 'comic-reader-404-backup' || !Array.isArray(data.library)) {
    throw new Error('El archivo no es una copia válida de Comic Reader 404.');
  }
  if (data.library.length > MAX_LIBRARY_ITEMS) {
    throw new Error(`La copia contiene más de ${MAX_LIBRARY_ITEMS} títulos y se ha rechazado para evitar una importación desproporcionada.`);
  }

  saveLibrary(data.library);
  if (Array.isArray(data.history)) saveHistory(data.history);
  if (data.settings && typeof data.settings === 'object') saveSettings(data.settings);
  return true;
}

function normalizeBook(book = {}) {
  const total = clampInt(book.total, 1, 5000, 1);
  const progress = clampInt(book.progress, 0, Math.max(0, total - 1), 0);
  const bookmarks = Array.isArray(book.bookmarks)
    ? [...new Set(book.bookmarks.map(Number).filter(Number.isInteger).filter((value) => value >= 0 && value < total))]
        .sort((a, b) => a - b)
        .slice(0, 5000)
    : [];

  return {
    id: cleanText(book.id, 500),
    title: cleanText(book.title || 'Cómic', 160) || 'Cómic',
    format: cleanText(book.format, 8).toUpperCase(),
    total,
    progress,
    favorite: Boolean(book.favorite),
    cover: cleanCover(book.cover),
    lastOpened: safeTimestamp(book.lastOpened),
    startedAt: safeTimestamp(book.startedAt),
    addedAt: safeTimestamp(book.addedAt) || safeTimestamp(book.lastOpened) || Date.now(),
    size: clampNumber(book.size, 0, Number.MAX_SAFE_INTEGER, 0),
    fileName: cleanText(book.fileName, 260),
    fileNames: normalizeFileNames(book.fileNames),
    series: cleanText(book.series, 160),
    number: cleanText(book.number, 24),
    count: cleanText(book.count, 24),
    volume: cleanText(book.volume, 24),
    summary: cleanText(book.summary, 3000),
    year: cleanText(book.year, 4),
    writer: cleanText(book.writer, 220),
    penciller: cleanText(book.penciller, 220),
    publisher: cleanText(book.publisher, 160),
    genre: cleanText(book.genre, 240),
    tags: cleanText(book.tags, 500),
    language: cleanText(book.language, 24),
    shelf: cleanText(book.shelf, 80),
    rtl: Boolean(book.rtl),
    hasComicInfo: Boolean(book.hasComicInfo),
    metadataEdited: Boolean(book.metadataEdited),
    bookmarks,
  };
}

function normalizeLibrary(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_LIBRARY_ITEMS).map(normalizeBook).filter((book) => book.id);
}

function normalizeSettings(value = {}) {
  const theme = VALID_THEMES.has(value.theme) ? value.theme : defaults.theme;
  const defaultMode = VALID_MODES.has(value.defaultMode) ? value.defaultMode : defaults.defaultMode;
  const fit = VALID_FITS.has(value.fit) ? value.fit : defaults.fit;
  return {
    theme,
    defaultMode,
    rtl: Boolean(value.rtl),
    autoHide: value.autoHide === undefined ? defaults.autoHide : Boolean(value.autoHide),
    fit,
  };
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_HISTORY_ITEMS).map((item) => ({
    id: cleanText(item?.id, 80) || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bookId: cleanText(item?.bookId, 500),
    title: cleanText(item?.title, 160),
    series: cleanText(item?.series, 160),
    page: clampInt(item?.page, 1, 5000, 1),
    total: clampInt(item?.total, 0, 5000, 0),
    at: safeTimestamp(item?.at) || Date.now(),
  })).filter((item) => item.bookId);
}

function migrateStartedState(items) {
  let changed = false;
  let history = [];
  try {
    history = normalizeHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'));
  } catch {
    history = [];
  }
  const firstRead = new Map();
  for (const entry of history) {
    const previous = firstRead.get(entry.bookId);
    if (!previous || entry.at < previous) firstRead.set(entry.bookId, entry.at);
  }
  const migrated = items.map((book) => {
    if (book.startedAt || !firstRead.has(book.id)) return book;
    changed = true;
    return { ...book, startedAt: firstRead.get(book.id) };
  });
  if (changed) {
    try { saveLibrary(migrated); } catch { /* Keep readable data even if quota is tight. */ }
  }
  return migrated;
}

function normalizeFileNames(value) {
  if (!Array.isArray(value)) return [];
  return value.map((name) => cleanText(name, 260)).filter(Boolean).slice(0, 5000);
}

function cleanCover(value) {
  if (typeof value !== 'string' || value.length > MAX_COVER_CHARS) return '';
  if (!value.startsWith('data:image/')) return '';
  return value;
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

function safeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number < 8.64e15 ? Math.trunc(number) : 0;
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/* === importers.js === */
const MAX_PAGES = 5000;
const MAX_PAGE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED = 3 * 1024 * 1024 * 1024;
const MAX_COMICINFO_BYTES = 2 * 1024 * 1024;
const MAX_SOLID_RAR_DEFAULT_BYTES = 160 * 1024 * 1024;
const MAX_SOLID_RAR_LOW_MEMORY_BYTES = 96 * 1024 * 1024;
const MAX_SOLID_RAR_HIGH_MEMORY_BYTES = 256 * 1024 * 1024;

async function importComic(file, onStatus = () => {}) {
  if (!file || typeof file.name !== 'string') throw new Error('No se ha recibido un archivo válido.');
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('El archivo supera 768 MB y se ha bloqueado para evitar agotar la memoria del navegador, especialmente en móvil.');
  }

  const format = formatOf(file.name, file.type);
  if (format === 'CBZ') return importCbz(file, onStatus);
  if (format === 'CBR') return importCbr(file, onStatus);
  if (format === 'PDF') {
    return { kind: 'pdf', format: 'PDF', pages: [], pdfUrl: URL.createObjectURL(file), source: file, metadata: {} };
  }
  if (file.type.startsWith('image/') || imageExt.test(file.name)) return importImages([file]);
  throw new Error('Formato no compatible. Usa CBZ, CBR, PDF o imágenes.');
}

async function importImages(files) {
  const pages = [...files]
    .filter((file) => file.type.startsWith('image/') || imageExt.test(file.name))
    .sort((a, b) => naturalCompare(a.name, b.name))
    .map((file) => ({ name: file.name, blob: file, url: null, getBlob: null, released: false }));

  if (pages.length > MAX_PAGES) throw new Error(`La selección supera el límite de seguridad de ${MAX_PAGES} imágenes.`);
  if (!pages.length) throw new Error('No se encontraron imágenes compatibles.');
  for (const page of pages) {
    if (page.blob.size > MAX_PAGE_BYTES) throw new Error(`La imagen ${page.name} supera 100 MB.`);
  }

  return { kind: 'images', format: 'IMG', pages, source: files[0], sourceFiles: [...files], metadata: {} };
}

async function importCbz(file, onStatus) {
  if (!globalThis.JSZip) throw new Error('El motor ZIP no se ha cargado. Recarga la aplicación.');
  onStatus('Indexando archivo CBZ…');

  // JSZip necesita el archivo comprimido en memoria; por eso existe un límite de tamaño de origen.
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let metadata = {};
  const xmlEntry = Object.values(zip.files).find((entry) => !entry.dir && /(^|\/)comicinfo\.xml$/i.test(entry.name));
  if (xmlEntry) {
    try {
      const xmlBytes = Number(xmlEntry?._data?.uncompressedSize) || 0;
      if (!xmlBytes || xmlBytes <= MAX_COMICINFO_BYTES) metadata = parseComicInfo(await xmlEntry.async('text'));
    } catch {
      metadata = {};
    }
  }

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && imageExt.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  validateZipEntries(entries);
  if (!entries.length) throw new Error('No se encontraron imágenes dentro del CBZ.');

  const pages = entries.map((entry) => ({
    name: entry.name,
    blob: null,
    url: null,
    released: false,
    getBlob: async () => {
      const blob = await entry.async('blob');
      return blob.type === mimeFromName(entry.name) ? blob : blob.slice(0, blob.size, mimeFromName(entry.name));
    },
  }));

  return { kind: 'images', format: 'CBZ', pages, source: file, metadata };
}

async function importCbr(file, onStatus) {
  const preflight = await inspectRarHeader(file);
  if (preflight.volume) throw new Error('Los CBR/RAR multivolumen no son compatibles. Une el archivo antes de importarlo.');
  if (preflight.encrypted) throw new Error('Los CBR/RAR cifrados no son compatibles.');
  if (preflight.solid) {
    const limit = solidRarSourceLimit();
    if (file.size > limit) {
      throw new Error(`Este RAR sólido ocupa ${formatMiB(file.size)}. Para evitar agotar la memoria se limita a ${formatMiB(limit)} en este dispositivo. Convierte el cómic a CBZ o a RAR no sólido.`);
    }
  }

  onStatus('Cargando motor RAR…');
  const engine = await loadUnrarEngine();
  onStatus('Indexando archivo CBR…');

  let result;
  try {
    result = await engine.unrar(file);
  } catch (error) {
    throw new Error(`No se pudo descomprimir el CBR: ${error?.message || error}`);
  }

  const all = Object.entries(result.entries || {});
  let metadata = {};
  const xml = all.find(([name, entry]) => !entry.isDirectory && /(^|\/)comicinfo\.xml$/i.test(name));
  if (xml) {
    try {
      if (!Number.isFinite(xml[1].size) || xml[1].size <= MAX_COMICINFO_BYTES) metadata = parseComicInfo(await xml[1].text());
    } catch {
      metadata = {};
    }
  }

  const entries = all
    .filter(([name, entry]) => !entry.isDirectory && imageExt.test(name))
    .sort((a, b) => naturalCompare(a[0], b[0]));

  validateRarEntries(entries);
  if (!entries.length) {
    result.rar?.dispose?.();
    throw new Error('No se encontraron imágenes dentro del CBR.');
  }

  const pages = entries.map(([name, entry]) => ({
    name,
    blob: null,
    url: null,
    released: false,
    getBlob: () => entry.blob(mimeFromName(name)),
  }));

  return {
    kind: 'images',
    format: 'CBR',
    pages,
    source: file,
    metadata,
    rarInfo: preflight,
    cleanup: () => {
      result?.rar?.dispose?.();
      engine.cleanup?.();
    },
  };
}


async function inspectRarHeader(file) {
  if (!file?.slice) throw new Error('Archivo RAR no válido.');
  const head = new Uint8Array(await file.slice(0, Math.min(file.size || 0, 4096)).arrayBuffer());
  if (head.length < 8) throw new Error('El archivo es demasiado pequeño para ser un RAR válido.');

  const rar4 = [0x52,0x61,0x72,0x21,0x1a,0x07,0x00].every((value, index) => head[index] === value);
  const rar5 = [0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00].every((value, index) => head[index] === value);
  if (!rar4 && !rar5) throw new Error('La firma del archivo no corresponde a RAR4/RAR5.');

  if (rar4) {
    const pos = 7;
    if (head.length < pos + 13 || head[pos + 2] !== 0x73) return { version: 4, solid: false, volume: false, encrypted: false, conservative: true };
    const flags = head[pos + 3] | (head[pos + 4] << 8);
    return {
      version: 4,
      solid: Boolean(flags & 0x0008),
      volume: Boolean(flags & 0x0001),
      encrypted: Boolean(flags & 0x0080),
      conservative: false,
    };
  }

  let offset = 8 + 4; // signature + CRC32
  const headerSize = readRarVint(head, offset);
  offset += headerSize.bytes;
  const contentEnd = Math.min(head.length, offset + headerSize.value);
  if (offset >= contentEnd) return { version: 5, solid: false, volume: false, encrypted: false, conservative: true };
  const blockType = readRarVint(head, offset); offset += blockType.bytes;
  const blockFlags = readRarVint(head, offset); offset += blockFlags.bytes;
  if (blockFlags.value & 0x0001) { const extra = readRarVint(head, offset); offset += extra.bytes; }
  if (blockFlags.value & 0x0002) { const data = readRarVint(head, offset); offset += data.bytes; }
  if (blockType.value !== 1 || offset >= contentEnd) return { version: 5, solid: false, volume: false, encrypted: false, conservative: true };
  const archiveFlags = readRarVint(head, offset).value;
  return {
    version: 5,
    solid: Boolean(archiveFlags & 0x0004),
    volume: Boolean(archiveFlags & 0x0001),
    encrypted: false,
    conservative: false,
  };
}

function readRarVint(bytes, offset) {
  let value = 0;
  let factor = 1;
  let count = 0;
  for (let index = 0; index < 8; index += 1) {
    if (offset + index >= bytes.length) throw new Error('Cabecera RAR incompleta.');
    const byte = bytes[offset + index];
    value += (byte & 0x7f) * factor;
    factor *= 128;
    count += 1;
    if (!(byte & 0x80)) return { value, bytes: count };
  }
  throw new Error('Cabecera RAR inválida.');
}

function solidRarSourceLimit() {
  const memory = Number(globalThis.navigator?.deviceMemory);
  if (Number.isFinite(memory) && memory <= 4) return MAX_SOLID_RAR_LOW_MEMORY_BYTES;
  if (Number.isFinite(memory) && memory >= 12) return MAX_SOLID_RAR_HIGH_MEMORY_BYTES;
  return MAX_SOLID_RAR_DEFAULT_BYTES;
}

function formatMiB(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

async function ensurePage(page) {
  if (!page) throw new Error('Página no disponible.');
  if (page.released) throw new Error('La página ya no está activa.');
  if (page.url) return page;
  if (page.loading) return page.loading;

  page.loading = (async () => {
    const blob = page.blob || await page.getBlob?.();
    if (!blob) throw new Error(`No se pudo extraer ${page.name || 'la página'}.`);
    if (blob.size > MAX_PAGE_BYTES) throw new Error(`La página ${page.name || ''} supera 100 MB.`);
    if (page.released) throw new Error('La página ya no está activa.');
    page.blob = blob;
    page.url = URL.createObjectURL(blob);
    return page;
  })();

  try {
    return await page.loading;
  } finally {
    page.loading = null;
  }
}

function validateZipEntries(entries) {
  if (entries.length > MAX_PAGES) throw new Error(`El CBZ contiene más de ${MAX_PAGES} páginas y se ha bloqueado por seguridad.`);
  let total = 0;
  for (const entry of entries) {
    const size = Number(entry?._data?.uncompressedSize) || 0;
    if (size > MAX_PAGE_BYTES) throw new Error(`Una página del CBZ supera 100 MB (${entry.name}).`);
    total += size;
  }
  if (total > MAX_ARCHIVE_UNCOMPRESSED) throw new Error('El CBZ declara más de 3 GB descomprimidos y se ha bloqueado por seguridad.');
}

function validateRarEntries(entries) {
  if (entries.length > MAX_PAGES) throw new Error(`El CBR contiene más de ${MAX_PAGES} páginas y se ha bloqueado por seguridad.`);
  let total = 0;
  for (const [name, entry] of entries) {
    const size = Number(entry.size);
    if (Number.isFinite(size) && size > MAX_PAGE_BYTES) throw new Error(`Una página del CBR supera 100 MB (${name}).`);
    if (Number.isFinite(size) && size > 0) total += size;
  }
  if (total > MAX_ARCHIVE_UNCOMPRESSED) throw new Error('El CBR declara más de 3 GB descomprimidos y se ha bloqueado por seguridad.');
}

let enginePromise;
async function loadUnrarEngine() {
  if (enginePromise) return enginePromise;
  if (!globalThis.Unrarit404?.unrar) {
    throw new Error('No se pudo cargar el motor CBR local. Comprueba vendor/unrarit.classic.js.');
  }
  enginePromise = Promise.resolve(globalThis.Unrarit404);
  return enginePromise;
}

function evictPage(page) {
  if (!page || page.released || page.loading) return;
  if (page.url) URL.revokeObjectURL(page.url);
  page.url = null;
  if (page.getBlob) page.blob = null;
}

function releaseComic(comic) {
  if (!comic) return;
  comic.released = true;
  for (const page of comic.pages || []) {
    page.released = true;
    if (page.url) URL.revokeObjectURL(page.url);
    page.url = null;
    if (page.getBlob) page.blob = null;
  }
  if (comic.pdfUrl) URL.revokeObjectURL(comic.pdfUrl);
  try { comic.cleanup?.(); } catch { /* Best-effort cleanup. */ }
}

/* === app.js === */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  libraryView: $('#libraryView'),
  readerView: $('#readerView'),
  content: $('#libraryContent'),
  empty: $('#emptyState'),
  stats: $('#libraryStats'),
  file: $('#fileInput'),
  folder: $('#folderInput'),
  backup: $('#backupInput'),
  loading: $('#loadingDialog'),
  loadingText: $('#loadingText'),
  loadingProgress: $('#loadingProgress'),
  error: $('#errorDialog'),
  errorText: $('#errorText'),
  title: $('#readerTitle'),
  counter: $('#readerCounter'),
  canvas: $('#pageCanvas'),
  stage: $('#readerStage'),
  range: $('#pageRange'),
  fav: $('#favoriteBtn'),
  bookmark: $('#bookmarkBtn'),
  bookmarks: $('#bookmarksBtn'),
  searchBtn: $('#searchBtn'),
  searchField: $('#searchField'),
  searchInput: $('#searchInput'),
  sort: $('#sortSelect'),
  toast: $('#toast'),
  readerTopbar: $('#readerTopbar'),
  readerControls: $('#readerControls'),
  updateBanner: $('#updateBanner'),
  updateNow: $('#updateNowBtn'),
};

let webtoonObserver = null;
let settings = loadSettings();
let library = loadLibrary();
let current = null;
let currentMeta = null;
let page = 0;
let mode = settings.defaultMode;
let rtl = settings.rtl;
let fit = settings.fit;
let libraryViewMode = 'all';
let controlsTimer = null;
let rangeTimer = null;
let search = '';
let pendingBook = null;
let editingBookId = null;
let webtoonTick = false;
let toastTimer = null;
let swRefreshPending = false;
let importInProgress = false;
const WEBTOON_CACHE_RADIUS = 6;
const WEBTOON_DOM_LIMIT = 1500;

try {
  applySettings();
  initializeTabs();
  renderLibrary();
  registerEvents();
  registerSW();
  document.body.dataset.runtime = 'ready';
} catch (startupError) {
  document.body.dataset.runtime = 'error';
  console.error('Comic Reader 404 no pudo iniciar:', startupError);
  const box = document.createElement('div');
  box.className = 'startup-error';
  box.setAttribute('role', 'alert');
  box.textContent = `La aplicación no pudo iniciar: ${startupError?.message || startupError}. Recarga la página o borra la caché de la PWA.`;
  document.body.prepend(box);
}


function registerEvents() {
  ['#importBtn', '#heroImportBtn', '#emptyImportBtn'].forEach((id) => {
    bindClick(id, () => {
      pendingBook = null;
      openNativePicker(els.file);
    });
  });

  bindClick('#importFolderBtn', () => openNativePicker(els.folder));
  els.updateNow?.addEventListener('click', applyWaitingServiceWorker);
  els.file?.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    const expected = pendingBook;
    pendingBook = null;
    await runImportOperation(() => handleSelectedFiles(files, expected));
  });
  els.folder?.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await runImportOperation(() => importBatch(files));
  });
  registerDropImport();

  $('#homeBtn').addEventListener('click', closeReader);
  $('#backBtn').addEventListener('click', closeReader);
  $('#prevBtn').addEventListener('click', () => move(-1));
  $('#nextBtn').addEventListener('click', () => move(1));
  $('#prevHotspot').addEventListener('click', () => move(rtl ? 1 : -1));
  $('#nextHotspot').addEventListener('click', () => move(rtl ? -1 : 1));

  els.range.addEventListener('input', (event) => {
    page = Number(event.target.value) - 1;
    updateReaderCounter();
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(renderPage, 80);
  });
  els.range.addEventListener('change', () => {
    clearTimeout(rangeTimer);
    renderPage();
  });

  $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
  els.fav.addEventListener('click', toggleFavorite);
  els.bookmark.addEventListener('click', toggleCurrentBookmark);
  els.bookmarks.addEventListener('click', openBookmarks);
  $('#rtlBtn').addEventListener('click', () => {
    if (!currentMeta || current?.kind === 'pdf') return;
    rtl = !rtl;
    currentMeta.rtl = rtl;
    library = patchBook(currentMeta.id, { rtl });
    $('#rtlBtn').classList.toggle('active', rtl);
    $('#rtlBtn').setAttribute('aria-pressed', String(rtl));
    renderPage();
  });
  $('#fitBtn').addEventListener('click', () => {
    if (current?.kind === 'pdf') return;
    fit = fit === 'contain' ? 'width' : 'contain';
    settings.fit = fit;
    saveSettings(settings);
    els.stage.classList.toggle('fit-width', fit === 'width');
    updateFitButton();
  });
  $$('.mode-btn[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));

  els.stage.addEventListener('click', (event) => {
    if (event.target === els.stage || event.target === els.canvas) toggleControls();
  });
  els.stage.addEventListener('pointermove', wakeControls);
  els.stage.addEventListener('scroll', () => {
    if (mode === 'webtoon' && !webtoonTick) {
      webtoonTick = true;
      requestAnimationFrame(() => {
        webtoonTick = false;
        updateWebtoonProgress();
      });
    }
  }, { passive: true });

  let touchX = 0;
  let touchY = 0;
  els.stage.addEventListener('touchstart', (event) => {
    touchX = event.changedTouches[0].screenX;
    touchY = event.changedTouches[0].screenY;
  }, { passive: true });
  els.stage.addEventListener('touchend', (event) => {
    if (mode === 'webtoon') return;
    const dx = event.changedTouches[0].screenX - touchX;
    const dy = event.changedTouches[0].screenY - touchY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) move((dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
  }, { passive: true });

  document.addEventListener('keydown', handleReaderKeydown);
  els.readerTopbar.addEventListener('focusin', wakeControls);
  els.readerControls.addEventListener('focusin', wakeControls);
  els.readerTopbar.addEventListener('focusout', wakeControls);
  els.readerControls.addEventListener('focusout', wakeControls);

  const libraryTabs = $$('.segment[data-view]');
  libraryTabs.forEach((button) => button.addEventListener('click', () => setLibraryView(button.dataset.view)));
  document.querySelector('.library-nav')?.addEventListener('keydown', (event) => handleLibraryTabKeydown(event, libraryTabs));
  els.searchBtn.addEventListener('click', toggleSearch);
  els.searchInput.addEventListener('input', (event) => {
    search = event.target.value.toLowerCase().trim();
    renderLibrary();
  });
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSearch();
  });
  els.sort.addEventListener('change', renderLibrary);

  $('#settingsBtn').addEventListener('click', () => openDialog($('#settingsDialog')));
  $('#themeSelect').addEventListener('change', (event) => {
    settings.theme = event.target.value;
    persistSettings();
  });
  $('#defaultModeSelect').addEventListener('change', (event) => {
    settings.defaultMode = event.target.value;
    persistSettings();
  });
  $('#defaultRtl').addEventListener('change', (event) => {
    settings.rtl = event.target.checked;
    persistSettings();
  });
  $('#autoHide').addEventListener('change', (event) => {
    settings.autoHide = event.target.checked;
    persistSettings();
  });

  $('#metadataForm').addEventListener('submit', saveMetadata);
  $('#deleteBookBtn').addEventListener('click', removeEditingBook);
  $('#exportBackupBtn').addEventListener('click', downloadBackup);
  bindClick('#importBackupBtn', () => openNativePicker(els.backup));
  els.backup.addEventListener('change', restoreBackup);

  window.addEventListener('pagehide', saveProgress);
}

function bindClick(selector, handler) {
  const element = $(selector);
  if (!element) {
    console.warn(`Control no encontrado: ${selector}`);
    return;
  }
  element.addEventListener('click', handler);
}

function openNativePicker(input) {
  if (!input) {
    showError('El selector de archivos no está disponible. Recarga la aplicación.');
    return;
  }
  // showPicker mantiene la activación de usuario en navegadores modernos. El fallback
  // click() cubre Safari/iOS y motores que todavía no implementan showPicker.
  try {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  } catch (firstError) {
    try {
      input.click();
    } catch (secondError) {
      console.error('No se pudo abrir el selector nativo:', firstError, secondError);
      showError('No se pudo abrir el selector de archivos. Prueba a recargar la app o arrastra los cómics sobre la biblioteca.');
    }
  }
}

async function runImportOperation(operation) {
  if (importInProgress) {
    showToast('Ya hay una importación en curso.');
    return;
  }
  importInProgress = true;
  setImportBusy(true);
  try {
    await operation();
  } finally {
    importInProgress = false;
    setImportBusy(false);
  }
}

function setImportBusy(busy) {
  $('#appShell')?.setAttribute('aria-busy', String(Boolean(busy)));
  ['#importBtn', '#heroImportBtn', '#emptyImportBtn', '#importFolderBtn'].forEach((selector) => {
    const button = $(selector);
    if (button) button.disabled = Boolean(busy);
  });
}

function registerDropImport() {
  if (!els.libraryView) return;
  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  els.libraryView.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    els.libraryView.classList.add('drag-active');
  });
  els.libraryView.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  els.libraryView.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.libraryView.classList.remove('drag-active');
  });
  els.libraryView.addEventListener('drop', async (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    els.libraryView.classList.remove('drag-active');
    pendingBook = null;
    const files = [...(event.dataTransfer?.files || [])];
    await runImportOperation(() => handleSelectedFiles(files));
  });
}

function openDialog(dialog) {
  if (!dialog || dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function handleSelectedFiles(files, expected = null) {
  if (!files.length) return;

  if (expected) {
    if (expected.format === 'IMG' && expected.fileNames?.length > 1) {
      const wanted = [...expected.fileNames].sort(naturalCompare);
      const selected = files.map((file) => file.name).sort(naturalCompare);
      if (wanted.length !== selected.length || wanted.some((name, index) => name !== selected[index])) {
        showError(`Para continuar “${expected.title}”, selecciona de nuevo las ${wanted.length} imágenes originales.`);
        return;
      }
      let comic = null;
      try {
        comic = await withLoading(() => importImages(files), 0);
        await openImported(comic, imageCollectionDescriptor(files), expected);
        comic = null;
      } catch (error) {
        if (comic && current !== comic) releaseComic(comic);
        showError(error?.message || String(error));
      }
      return;
    }

    const file = files[0];
    if (expected.fileName && file.name !== expected.fileName) {
      showError(`Para continuar “${expected.title}”, selecciona el archivo original: ${expected.fileName}`);
      return;
    }
    await openFile(file, expected);
    return;
  }

  if (files.every((file) => file.type.startsWith('image/'))) {
    let comic = null;
    try {
      comic = await withLoading(() => importImages(files), 0);
      await openImported(comic, imageCollectionDescriptor(files));
      comic = null;
    } catch (error) {
      if (comic && current !== comic) releaseComic(comic);
      showError(error?.message || String(error));
    }
    return;
  }

  if (files.length === 1) {
    await openFile(files[0]);
    return;
  }

  await importBatch(files);
}

async function openFile(file, expected = null) {
  let comic = null;
  try {
    comic = await withLoading((status) => importComic(file, status), 0);
    await openImported(comic, file, expected);
    comic = null; // Ownership transferred to the reader.
  } catch (error) {
    if (comic && current !== comic) releaseComic(comic);
    showError(error?.message || String(error));
  }
}

async function importBatch(files) {
  const tasks = buildBatchTasks(files);
  if (!tasks.length) {
    showError('No se encontraron archivos compatibles en la selección.');
    return;
  }

  let ok = 0;
  const failed = [];
  els.loadingProgress.value = 0;
  openDialog(els.loading);

  try {
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      els.loadingText.textContent = `${index + 1}/${tasks.length} · ${task.label}`;
      els.loadingProgress.value = Math.round(index / tasks.length * 100);
      let comic = null;
      try {
        if (task.kind === 'images') {
          comic = await importImages(task.files);
          await saveImportedToLibrary(comic, imageCollectionDescriptor(task.files));
        } else {
          comic = await importComic(task.file, (text) => {
            els.loadingText.textContent = `${index + 1}/${tasks.length} · ${text}`;
          });
          await saveImportedToLibrary(comic, task.file);
        }
        ok += 1;
      } catch (error) {
        failed.push(`${task.label}: ${error?.message || error}`);
      } finally {
        releaseComic(comic);
      }
      els.loadingProgress.value = Math.round((index + 1) / tasks.length * 100);
    }
  } finally {
    if (els.loading.open) els.loading.close();
  }

  renderLibrary();
  if (ok) showToast(`${ok} ${ok === 1 ? 'cómic importado' : 'cómics importados'} en la biblioteca.`);
  if (failed.length) {
    showError(`Se importaron ${ok} archivos o colecciones. Fallaron ${failed.length}:\n\n${failed.slice(0, 6).join('\n')}${failed.length > 6 ? '\n…' : ''}`);
  }
}

function buildBatchTasks(files) {
  const tasks = [];
  const imageGroups = new Map();

  for (const file of files) {
    const isArchive = /\.(cbz|zip|cbr|rar|pdf)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name);
    if (isArchive) {
      tasks.push({ kind: 'file', file, label: file.name });
      continue;
    }
    if (!isImage) continue;

    const relative = file.webkitRelativePath || '';
    const parent = relative.includes('/') ? relative.split('/').slice(0, -1).join('/') : '__selection__';
    if (!imageGroups.has(parent)) imageGroups.set(parent, []);
    imageGroups.get(parent).push(file);
  }

  for (const group of imageGroups.values()) {
    const descriptor = imageCollectionDescriptor(group);
    tasks.push({ kind: 'images', files: group, label: descriptor.name });
  }
  return tasks;
}

async function withLoading(fn, progress = 0) {
  els.loadingText.textContent = 'Preparando lector…';
  els.loadingProgress.value = progress;
  openDialog(els.loading);
  try {
    return await fn((text) => { els.loadingText.textContent = text; });
  } finally {
    if (els.loading.open) els.loading.close();
  }
}

async function saveImportedToLibrary(comic, file, expected = null) {
  const id = expected?.id || bookId(file);
  const existing = expected || findBook(id);
  const metadata = comic.metadata || {};
  let cover = existing?.cover;

  if (!cover && comic.pages?.length) {
    const coverIndex = Math.min(Math.max(Number(metadata.coverPage) || 0, 0), comic.pages.length - 1);
    try {
      const coverPage = await ensurePage(comic.pages[coverIndex]);
      cover = await blobToDataUrl(coverPage.blob, 220, 330, 0.65);
    } catch {
      // A placeholder will be used if the cover cannot be decoded.
    }
  }

  const meta = buildBookMeta({ comic, file, id, existing, cover, metadata });
  library = upsertBook(meta);
  return meta;
}

async function openImported(comic, file = comic.source, expected = null) {
  const nextMeta = await saveImportedToLibrary(comic, file, expected);
  releaseComic(current);
  current = comic;
  currentMeta = nextMeta;
  page = Math.min(currentMeta.progress || 0, Math.max(0, currentMeta.total - 1));
  mode = settings.defaultMode;
  rtl = currentMeta.rtl;
  fit = settings.fit;

  const now = Date.now();
  currentMeta.startedAt = currentMeta.startedAt || now;
  currentMeta.lastOpened = now;
  library = patchBook(currentMeta.id, { startedAt: currentMeta.startedAt, lastOpened: now });
  addHistory({ ...currentMeta, progress: page });

  openReader();
  renderPage();
}

function buildBookMeta({ comic, file, id, existing, cover, metadata }) {
  const fallback = baseName(file?.name || comic.pages?.[0]?.name || 'Cómic');
  const preserveExisting = Boolean(existing) && (Boolean(existing.metadataEdited) || Boolean(existing.hasComicInfo));
  const value = (key, fallbackValue = '') => {
    if (preserveExisting && existing[key] !== undefined && existing[key] !== '') return existing[key];
    if (metadata[key] !== undefined && metadata[key] !== '') return metadata[key];
    return existing?.[key] ?? fallbackValue;
  };
  const importedRtl = metadata.hasComicInfo ? Boolean(metadata.rtl) : (existing ? Boolean(existing.rtl) : Boolean(settings.rtl));
  const fileNames = comic.format === 'IMG' && comic.sourceFiles?.length > 1
    ? comic.sourceFiles.map((item) => item.name)
    : (existing?.fileNames || []);

  return {
    id,
    title: value('title', metadata.title || fallback),
    format: comic.format,
    total: comic.pages?.length || existing?.total || 1,
    progress: existing?.progress || 0,
    favorite: Boolean(existing?.favorite),
    cover: cover || placeholderCover(metadata.title || fallback),
    lastOpened: existing?.lastOpened || 0,
    startedAt: existing?.startedAt || 0,
    addedAt: existing?.addedAt || Date.now(),
    size: file?.size || 0,
    fileName: file?.name || existing?.fileName || '',
    fileNames,
    series: value('series'),
    number: value('number'),
    count: value('count'),
    volume: value('volume'),
    summary: value('summary'),
    year: value('year'),
    writer: value('writer'),
    penciller: value('penciller'),
    publisher: value('publisher'),
    genre: value('genre'),
    tags: value('tags'),
    language: value('language'),
    shelf: existing?.shelf || '',
    rtl: existing?.metadataEdited ? Boolean(existing.rtl) : importedRtl,
    hasComicInfo: Boolean(metadata.hasComicInfo) || Boolean(existing?.hasComicInfo),
    metadataEdited: Boolean(existing?.metadataEdited),
    bookmarks: existing?.bookmarks || [],
  };
}

function openReader() {
  const isPdf = current?.kind === 'pdf';
  els.libraryView.hidden = true;
  els.readerView.hidden = false;
  els.readerView.classList.toggle('is-pdf', isPdf);
  els.title.textContent = readerDisplayTitle(currentMeta);
  els.fav.textContent = currentMeta.favorite ? '★' : '☆';
  els.fav.setAttribute('aria-pressed', String(Boolean(currentMeta.favorite)));
  $('#rtlBtn').classList.toggle('active', rtl);
  $('#rtlBtn').setAttribute('aria-pressed', String(rtl));
  setMode(mode, false);
  els.stage.classList.toggle('fit-width', fit === 'width');
  els.bookmark.disabled = isPdf;
  els.bookmarks.disabled = isPdf;
  updateFitButton();
  updateBookmarkButton();
  wakeControls();
  els.stage.focus({ preventScroll: true });
}

function closeReader() {
  if (els.readerView.hidden) return;
  saveProgress();
  releaseComic(current);
  current = null;
  currentMeta = null;
  els.canvas.replaceChildren();
  els.readerView.hidden = true;
  els.libraryView.hidden = false;
  exitFullscreenSafely();
  renderLibrary();
}

function move(delta) {
  if (!current || current.kind === 'pdf' || mode === 'webtoon') return;
  const step = mode === 'double' ? 2 : 1;
  page = Math.max(0, Math.min(currentMeta.total - 1, page + delta * step));
  renderPage();
  saveProgress();
  wakeControls();
}

function setMode(next, rerender = true) {
  if (!['single', 'double', 'webtoon'].includes(next)) next = 'single';
  if (next === 'webtoon' && currentMeta?.total > WEBTOON_DOM_LIMIT) {
    next = 'single';
    showToast(`Webtoon se limita a ${WEBTOON_DOM_LIMIT} páginas para proteger la memoria. Usa 1P o 2P en este cómic.`);
  }
  mode = next;
  $$('.mode-btn[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  els.stage.classList.toggle('mode-webtoon', mode === 'webtoon');
  els.stage.classList.toggle('mode-double', mode === 'double');
  if (rerender && current?.kind !== 'pdf') renderPage();
}

function renderPage() {
  if (!current) return;
  webtoonObserver?.disconnect();
  webtoonObserver = null;
  els.canvas.replaceChildren();

  if (current.kind === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = current.pdfUrl;
    iframe.title = `PDF: ${currentMeta.title}`;
    iframe.className = 'pdf-frame';
    els.canvas.append(iframe);
    els.counter.textContent = 'Documento PDF · progreso gestionado por el visor';
    els.range.hidden = true;
    return;
  }

  els.range.hidden = false;
  els.range.max = String(currentMeta.total);
  els.range.value = String(page + 1);

  if (mode === 'webtoon') {
    if ('IntersectionObserver' in window) {
      webtoonObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadPageImage(entry.target);
        }
      }, { root: els.stage, rootMargin: '100% 0px' });
    }

    current.pages.forEach((_, index) => {
      const image = makeImgShell(index);
      els.canvas.append(image);
      if (webtoonObserver) webtoonObserver.observe(image);
      else loadPageImage(image);
    });
    updateReaderCounter();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.canvas.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'center' });
    }));
    updateBookmarkButton();
    return;
  }

  const indices = [page];
  if (mode === 'double' && page + 1 < currentMeta.total) indices.push(page + 1);
  if (mode === 'double' && rtl) indices.reverse();
  indices.forEach((index) => {
    const image = makeImgShell(index);
    els.canvas.append(image);
    loadPageImage(image);
  });

  updateReaderCounter(indices);
  preload(page + (mode === 'double' ? 2 : 1));
  trimPageCache(indices);
  saveProgress();
  updateBookmarkButton();
}

function makeImgShell(index) {
  const image = document.createElement('img');
  image.alt = `Página ${index + 1}`;
  image.dataset.page = String(index);
  image.className = 'page-placeholder';
  image.decoding = 'async';
  image.loading = 'lazy';
  return image;
}

async function loadPageImage(image) {
  const index = Number(image.dataset.page);
  const comicAtStart = current;
  const pageItem = comicAtStart?.pages?.[index];
  if (!pageItem) return;
  try {
    const ready = await ensurePage(pageItem);
    if (!image.isConnected || current !== comicAtStart) return;
    image.src = ready.url;
    image.addEventListener('load', () => {
      if (image.naturalWidth && image.naturalHeight) {
        image.dataset.ratio = `${image.naturalWidth}/${image.naturalHeight}`;
        image.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
      }
    }, { once: true });
    image.classList.remove('page-placeholder');
    image.classList.add('loaded');
  } catch (error) {
    if (!image.isConnected) return;
    image.classList.remove('page-placeholder');
    image.classList.add('page-error');
    image.alt = `Error al cargar página ${index + 1}`;
    image.title = error?.message || 'No se pudo cargar la página';
  }
}

function preload(start) {
  for (let index = start; index < start + 2; index += 1) {
    const pageItem = current?.pages?.[index];
    if (pageItem) ensurePage(pageItem).catch(() => {});
  }
}

function trimPageCache(visibleIndices = [page]) {
  if (!current?.pages || mode === 'webtoon') return;
  const keep = new Set(visibleIndices);
  const min = Math.max(0, page - 2);
  const max = Math.min(current.pages.length - 1, page + (mode === 'double' ? 4 : 3));
  for (let index = min; index <= max; index += 1) keep.add(index);
  current.pages.forEach((pageItem, index) => {
    if (!keep.has(index)) evictPage(pageItem);
  });
}

function updateWebtoonProgress() {
  if (!currentMeta || mode !== 'webtoon') return;
  const images = [...els.canvas.querySelectorAll('img[data-page]')];
  if (!images.length) return;

  const center = els.stage.getBoundingClientRect().top + els.stage.clientHeight / 2;
  let best = images[0];
  let distance = Infinity;
  for (const image of images) {
    const rect = image.getBoundingClientRect();
    const nextDistance = Math.abs((rect.top + rect.bottom) / 2 - center);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = image;
    }
  }

  const next = Number(best.dataset.page);
  if (Number.isFinite(next) && next !== page) {
    page = next;
    els.range.value = String(page + 1);
    updateReaderCounter();
    saveProgress();
    updateBookmarkButton();
  }
  if (Number.isFinite(next)) trimWebtoonCache(next);
}

function trimWebtoonCache(centerIndex) {
  if (!current?.pages || mode !== 'webtoon') return;
  const min = Math.max(0, centerIndex - WEBTOON_CACHE_RADIUS);
  const max = Math.min(current.pages.length - 1, centerIndex + WEBTOON_CACHE_RADIUS);
  current.pages.forEach((pageItem, index) => {
    if (index >= min && index <= max) return;
    if (!pageItem.url && !pageItem.blob) return;
    evictPage(pageItem);
    const image = els.canvas.querySelector(`img[data-page="${index}"]`);
    if (!image) return;
    image.removeAttribute('src');
    image.classList.remove('loaded', 'page-error');
    image.classList.add('page-placeholder');
    image.alt = `Página ${index + 1}`;
  });
}

function updateReaderCounter(indices = null) {
  if (!currentMeta) return;
  if (current?.kind === 'pdf') {
    els.counter.textContent = 'Documento PDF · progreso gestionado por el visor';
    return;
  }
  if (mode === 'webtoon') {
    els.counter.textContent = `Página ${page + 1} / ${currentMeta.total} · Webtoon`;
    return;
  }
  const pair = indices || [page, ...(mode === 'double' && page + 1 < currentMeta.total ? [page + 1] : [])];
  els.counter.textContent = mode === 'double' && pair.length > 1
    ? `Páginas ${page + 1}–${page + 2} / ${currentMeta.total}`
    : `Página ${page + 1} / ${currentMeta.total}`;
}

function saveProgress() {
  if (!currentMeta) return;
  currentMeta.lastOpened = Date.now();
  currentMeta.startedAt = currentMeta.startedAt || currentMeta.lastOpened;
  const patch = { lastOpened: currentMeta.lastOpened, startedAt: currentMeta.startedAt };
  if (currentMeta.format !== 'PDF') {
    currentMeta.progress = page;
    patch.progress = page;
  }
  library = patchBook(currentMeta.id, patch);
}

function toggleFavorite() {
  if (!currentMeta) return;
  currentMeta.favorite = !currentMeta.favorite;
  els.fav.textContent = currentMeta.favorite ? '★' : '☆';
  els.fav.setAttribute('aria-pressed', String(currentMeta.favorite));
  library = patchBook(currentMeta.id, { favorite: currentMeta.favorite });
}

function toggleCurrentBookmark() {
  if (!currentMeta || current?.kind === 'pdf') return;
  currentMeta.bookmarks = toggleBookmark(currentMeta.id, page);
  updateBookmarkButton();
  showToast(currentMeta.bookmarks.includes(page) ? `Página ${page + 1} guardada.` : `Marcador de página ${page + 1} eliminado.`);
}

function updateBookmarkButton() {
  if (!currentMeta) return;
  const unavailable = current?.kind === 'pdf';
  const marked = !unavailable && (currentMeta.bookmarks || []).includes(page);
  els.bookmark.textContent = marked ? '◆' : '◇';
  els.bookmark.classList.toggle('active', marked);
  els.bookmark.setAttribute('aria-pressed', String(marked));
  els.bookmark.setAttribute('aria-label', unavailable
    ? 'Marcadores de página no disponibles para PDF'
    : (marked ? 'Eliminar marcador de esta página' : 'Marcar esta página'));
}

function openBookmarks() {
  if (!currentMeta || current?.kind === 'pdf') return;
  const box = $('#bookmarksList');
  box.replaceChildren();
  const marks = currentMeta.bookmarks || [];
  if (!marks.length) {
    const paragraph = document.createElement('p');
    paragraph.className = 'muted';
    paragraph.textContent = 'Todavía no has guardado ninguna página.';
    box.append(paragraph);
  } else {
    for (const pageNumber of marks) {
      const row = document.createElement('div');
      row.className = 'bookmark-row';
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'bookmark-jump';
      jump.textContent = `Página ${pageNumber + 1}`;
      jump.addEventListener('click', () => {
        page = pageNumber;
        $('#bookmarksDialog').close();
        renderPage();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = '×';
      del.ariaLabel = `Eliminar marcador de página ${pageNumber + 1}`;
      del.addEventListener('click', () => {
        currentMeta.bookmarks = toggleBookmark(currentMeta.id, pageNumber);
        openBookmarksRefresh();
      });
      row.append(jump, del);
      box.append(row);
    }
  }
  openDialog($('#bookmarksDialog'));
}

function openBookmarksRefresh() {
  const dialog = $('#bookmarksDialog');
  if (dialog.open) dialog.close();
  openBookmarks();
}

function handleReaderKeydown(event) {
  if (els.readerView.hidden || current?.kind === 'pdf') return;
  if (document.querySelector('dialog[open]')) return;
  if (isEditableTarget(event.target)) return;
  wakeControls();

  if (mode === 'webtoon' && ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(event.key)) {
    return;
  }

  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault();
    move(rtl ? -1 : 1);
  } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    move(rtl ? 1 : -1);
  } else if (event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleCurrentBookmark();
  } else if (event.key === 'Escape' && !document.fullscreenElement) {
    closeReader();
  }
}

function isEditableTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
}

function wakeControls() {
  els.readerView.classList.remove('controls-hidden');
  clearTimeout(controlsTimer);
  if (!settings.autoHide) return;
  controlsTimer = setTimeout(() => {
    if (controlsHaveFocus()) return;
    els.readerView.classList.add('controls-hidden');
  }, 2600);
}

function controlsHaveFocus() {
  const active = document.activeElement;
  return els.readerTopbar.contains(active) || els.readerControls.contains(active);
}

function toggleControls() {
  els.readerView.classList.toggle('controls-hidden');
  if (!els.readerView.classList.contains('controls-hidden')) wakeControls();
}

function initializeTabs() {
  $$('.segment[data-view]').forEach((button) => {
    const selected = button.dataset.view === libraryViewMode;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  els.searchBtn.setAttribute('aria-expanded', String(!els.searchField.hidden));
}

function setLibraryView(view) {
  libraryViewMode = view;
  $$('.segment[data-view]').forEach((button) => {
    const selected = button.dataset.view === libraryViewMode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && button.id) els.content.setAttribute('aria-labelledby', button.id);
  });
  renderLibrary();
}

function toggleSearch() {
  if (!els.searchField.hidden) {
    closeSearch();
    return;
  }
  els.searchField.hidden = false;
  els.searchBtn.setAttribute('aria-expanded', 'true');
  els.searchInput.focus();
}

function closeSearch() {
  const hadQuery = Boolean(search);
  els.searchField.hidden = true;
  els.searchBtn.setAttribute('aria-expanded', 'false');
  els.searchInput.value = '';
  search = '';
  els.searchBtn.focus();
  if (hadQuery) renderLibrary();
}

function handleLibraryTabKeydown(event, tabs) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const activeIndex = tabs.indexOf(document.activeElement);
  if (activeIndex < 0) return;
  event.preventDefault();
  let nextIndex = activeIndex;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (event.key === 'ArrowRight') nextIndex = (activeIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  setLibraryView(next.dataset.view);
  next.focus();
}

function renderLibrary() {
  library = loadLibrary();
  renderStats();
  updateShelfOptions();
  els.content.replaceChildren();
  els.empty.hidden = library.length > 0;
  els.content.hidden = library.length === 0;
  if (!library.length) return;

  if (libraryViewMode === 'history') {
    renderHistory();
    return;
  }

  const items = filteredItems(library);
  if (!items.length) {
    renderNoResults();
    return;
  }
  if (libraryViewMode === 'series') {
    renderGroups(groupBy(items, (book) => book.series || 'Sin serie'), 'series');
    return;
  }
  if (libraryViewMode === 'shelves') {
    renderGroups(groupBy(items, (book) => book.shelf || 'Sin estantería'), 'shelf');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'library-grid';
  for (const book of sortedItems(items)) grid.append(makeCard(book));
  els.content.append(grid);
}

function filteredItems(items) {
  let output = [...items];
  if (libraryViewMode === 'favorite') output = output.filter((book) => book.favorite);
  if (libraryViewMode === 'unfinished') output = output.filter((book) => {
    const pct = progressPct(book);
    return book.startedAt && pct !== null && pct < 100;
  });
  if (search) output = output.filter((book) => searchBlob(book).includes(search));
  return output;
}

function sortedItems(items) {
  const output = [...items];
  const sort = els.sort.value;
  if (sort === 'title') output.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  else if (sort === 'series') output.sort((a, b) => seriesKey(a).localeCompare(seriesKey(b), undefined, { numeric: true, sensitivity: 'base' }));
  else if (sort === 'progress') output.sort((a, b) => (progressPct(b) ?? -1) - (progressPct(a) ?? -1));
  else if (sort === 'year') output.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  else output.sort((a, b) => (b.lastOpened || b.addedAt || 0) - (a.lastOpened || a.addedAt || 0));
  return output;
}

function renderGroups(groups, type) {
  const wrap = document.createElement('div');
  wrap.className = 'group-list';
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
  for (const [name, books] of entries) {
    const section = document.createElement('section');
    section.className = 'library-group';
    const head = document.createElement('div');
    head.className = 'group-heading';
    const heading = document.createElement('h2');
    heading.textContent = name;
    const meta = document.createElement('span');
    meta.textContent = `${books.length} ${books.length === 1 ? 'título' : 'títulos'}`;
    head.append(heading, meta);
    const grid = document.createElement('div');
    grid.className = 'library-grid';
    const ordered = type === 'series' ? [...books].sort(issueSort) : sortedItems(books);
    for (const book of ordered) grid.append(makeCard(book));
    section.append(head, grid);
    wrap.append(section);
  }
  els.content.append(wrap);
}

function renderHistory() {
  const history = loadHistory();
  const booksById = new Map(library.map((book) => [book.id, book]));
  const list = document.createElement('div');
  list.className = 'history-list';
  const visible = history.filter((item) => {
    const book = booksById.get(item.bookId);
    return book && (!search || searchBlob(book).includes(search));
  }).slice(0, 120);

  if (!visible.length) {
    const paragraph = document.createElement('p');
    paragraph.className = 'empty-inline';
    paragraph.textContent = search ? 'No hay lecturas que coincidan con la búsqueda.' : 'Aún no hay lecturas en el historial.';
    list.append(paragraph);
  }

  for (const item of visible) {
    const book = booksById.get(item.bookId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-row';
    row.setAttribute('aria-label', `Continuar ${book.title}`);
    const cover = document.createElement('img');
    cover.src = book.cover || placeholderCover(book.title);
    cover.alt = '';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = book.title;
    const sub = document.createElement('small');
    const progress = book.format === 'PDF' ? 'PDF' : `pág. ${item.page}/${item.total || book.total}`;
    sub.textContent = `${book.series ? `${book.series} · ` : ''}${progress} · ${relativeTime(item.at)}`;
    copy.append(title, sub);
    row.append(cover, copy);
    row.addEventListener('click', () => requestReopen(book));
    list.append(row);
  }
  els.content.append(list);
}

function renderNoResults() {
  const box = document.createElement('div');
  box.className = 'filter-empty';
  const heading = document.createElement('h2');
  heading.textContent = search ? 'No hay coincidencias.' : 'No hay títulos en esta vista.';
  const paragraph = document.createElement('p');
  paragraph.textContent = search ? 'Prueba con otro título, serie, autor, editorial, género o estantería.' : 'Importa más cómics o cambia de sección.';
  box.append(heading, paragraph);
  els.content.append(box);
}

function makeCard(book) {
  const node = $('#comicCardTemplate').content.firstElementChild.cloneNode(true);
  const coverButton = node.querySelector('.cover-button');
  coverButton.setAttribute('aria-label', `Abrir ${book.title}`);
  const cover = node.querySelector('.cover');
  cover.src = book.cover || placeholderCover(book.title);
  cover.alt = `Portada de ${book.title}`;
  node.querySelector('.format-badge').textContent = book.format;

  const pct = progressPct(book);
  const readBadge = node.querySelector('.read-badge');
  readBadge.hidden = pct !== 100;
  node.querySelector('.card-title').textContent = book.title;
  const series = node.querySelector('.card-series');
  series.textContent = book.series ? `${book.series}${book.number ? ` · #${book.number}` : ''}` : (book.writer || 'Sin serie');

  const cardMeta = [book.year, book.publisher];
  if (book.format === 'PDF') cardMeta.push('Progreso no disponible');
  else cardMeta.push(`${book.total || '?'} pág.`, `${pct ?? 0}%`);
  node.querySelector('.card-meta').textContent = cardMeta.filter(Boolean).join(' · ');

  const progressTrack = node.querySelector('.progress-track');
  progressTrack.hidden = pct === null;
  progressTrack.querySelector('i').style.width = `${pct ?? 0}%`;

  const fav = node.querySelector('.fav-mini');
  fav.textContent = book.favorite ? '★' : '☆';
  fav.setAttribute('aria-pressed', String(book.favorite));
  fav.setAttribute('aria-label', book.favorite ? `Quitar ${book.title} de favoritos` : `Añadir ${book.title} a favoritos`);
  fav.addEventListener('click', (event) => {
    event.stopPropagation();
    library = patchBook(book.id, { favorite: !book.favorite });
    renderLibrary();
  });

  const more = node.querySelector('.more-mini');
  more.setAttribute('aria-label', `Editar metadatos de ${book.title}`);
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    openMetadata(book.id);
  });
  coverButton.addEventListener('click', () => requestReopen(book));
  return node;
}

function requestReopen(book) {
  pendingBook = book;
  const count = book.fileNames?.length || 0;
  if (book.format === 'IMG' && count > 1) showToast(`Selecciona de nuevo las ${count} imágenes de “${book.title}”.`);
  else showToast(`Selecciona de nuevo “${book.fileName || book.title}” para continuar donde lo dejaste.`);
  openNativePicker(els.file);
}

function renderStats() {
  const series = new Set(library.map((book) => book.series).filter(Boolean)).size;
  const reading = library.filter((book) => {
    const pct = progressPct(book);
    return book.startedAt && pct !== null && pct < 100;
  }).length;
  const bookmarks = library.reduce((total, book) => total + (book.bookmarks?.length || 0), 0);
  els.stats.replaceChildren();
  [['Títulos', library.length], ['Series', series], ['En lectura', reading], ['Marcadores', bookmarks]].forEach(([label, value]) => {
    const item = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = label;
    item.append(strong, span);
    els.stats.append(item);
  });
}

function openMetadata(id) {
  const book = findBook(id);
  if (!book) return;
  editingBookId = id;
  $('#metadataCover').src = book.cover || placeholderCover(book.title);
  $('#metadataCover').alt = `Portada de ${book.title}`;
  $('#metaTitle').value = book.title || '';
  $('#metaSeries').value = book.series || '';
  $('#metaNumber').value = book.number || '';
  $('#metaVolume').value = book.volume || '';
  $('#metaYear').value = book.year || '';
  $('#metaWriter').value = book.writer || '';
  $('#metaPublisher').value = book.publisher || '';
  $('#metaGenre').value = book.genre || '';
  $('#metaShelf').value = book.shelf || '';
  $('#metaSummary').value = book.summary || '';
  $('#metaRtl').checked = Boolean(book.rtl);
  openDialog($('#metadataDialog'));
}

function saveMetadata(event) {
  event.preventDefault();
  if (!editingBookId) return;
  const patch = {
    title: $('#metaTitle').value.trim() || 'Cómic',
    series: $('#metaSeries').value.trim(),
    number: $('#metaNumber').value.trim(),
    volume: $('#metaVolume').value.trim(),
    year: $('#metaYear').value.trim(),
    writer: $('#metaWriter').value.trim(),
    publisher: $('#metaPublisher').value.trim(),
    genre: $('#metaGenre').value.trim(),
    shelf: $('#metaShelf').value.trim(),
    summary: $('#metaSummary').value.trim(),
    rtl: $('#metaRtl').checked,
    metadataEdited: true,
  };
  library = patchBook(editingBookId, patch);
  if (currentMeta?.id === editingBookId) currentMeta = { ...currentMeta, ...patch };
  $('#metadataDialog').close();
  renderLibrary();
  showToast('Metadatos guardados.');
}

function removeEditingBook() {
  if (!editingBookId) return;
  const book = findBook(editingBookId);
  if (!book) return;
  if (!confirm(`¿Eliminar “${book.title}” de la biblioteca? El archivo original no se borrará.`)) return;
  library = deleteBook(editingBookId);
  editingBookId = null;
  $('#metadataDialog').close();
  renderLibrary();
  showToast('Eliminado de la biblioteca.');
}

function updateShelfOptions() {
  const list = $('#shelfOptions');
  list.replaceChildren();
  for (const shelf of getShelves()) {
    const option = document.createElement('option');
    option.value = shelf;
    list.append(option);
  }
}

function downloadBackup() {
  const data = JSON.stringify(exportBackup(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `comic-reader-404-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Copia de seguridad exportada.');
}

async function restoreBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showError('La copia supera 5 MB y se ha rechazado por seguridad.');
    return;
  }
  if (!confirm('Restaurar una copia sustituirá la biblioteca local, el historial y los ajustes actuales. ¿Continuar?')) return;
  try {
    const data = JSON.parse(await file.text());
    importBackup(data);
    settings = loadSettings();
    applySettings();
    renderLibrary();
    showToast('Biblioteca restaurada.');
  } catch (error) {
    showError(error.message || 'No se pudo restaurar la copia.');
  }
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  const themeColors = { noir: '#0a0a0c', oled: '#000000', paper: '#ede7db', retro: '#17120f', universe: '#080b12' };
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[settings.theme] || themeColors.noir);
  $('#themeSelect').value = settings.theme;
  $('#defaultModeSelect').value = settings.defaultMode;
  $('#defaultRtl').checked = settings.rtl;
  $('#autoHide').checked = settings.autoHide;
}

function persistSettings() {
  saveSettings(settings);
  settings = loadSettings();
  applySettings();
  if (!settings.autoHide) {
    clearTimeout(controlsTimer);
    els.readerView.classList.remove('controls-hidden');
  }
}

function updateFitButton() {
  const button = $('#fitBtn');
  button.setAttribute('aria-pressed', String(fit === 'width'));
  button.setAttribute('aria-label', fit === 'width' ? 'Ajustar página a pantalla' : 'Ajustar página al ancho');
  button.title = button.getAttribute('aria-label');
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      if (!document.exitFullscreen) throw new Error('Fullscreen API unavailable');
      await document.exitFullscreen();
      return;
    }
    if (!els.readerView.requestFullscreen) {
      showToast('La pantalla completa no está disponible en este navegador.');
      return;
    }
    await els.readerView.requestFullscreen();
  } catch {
    showToast('La pantalla completa no está disponible en este navegador.');
  }
}

function exitFullscreenSafely() {
  if (!document.fullscreenElement) return;
  Promise.resolve(document.exitFullscreen?.()).catch(() => {});
}

function showError(message) {
  const text = String(message || 'No se pudo completar la operación.');
  if (!els.error || !els.errorText) {
    console.error(text);
    return;
  }
  els.errorText.textContent = text;
  if (els.error.open) els.error.close();
  if (typeof els.error.showModal === 'function') els.error.showModal();
  else window.alert?.(text);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3400);
}

let swRegistration = null;

async function registerSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js');
    if (swRegistration.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    swRegistration.addEventListener('updatefound', () => {
      const worker = swRegistration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swRefreshPending) return;
      swRefreshPending = false;
      location.reload();
    });
  } catch (error) {
    console.warn('No se pudo registrar el service worker:', error);
  }
}

function showUpdateBanner() {
  if (els.updateBanner) els.updateBanner.hidden = false;
}

function applyWaitingServiceWorker() {
  const worker = swRegistration?.waiting;
  if (!worker) return;
  swRefreshPending = true;
  worker.postMessage({ type: 'SKIP_WAITING' });
}

function searchBlob(book) {
  return [book.title, book.series, book.number, book.volume, book.writer, book.publisher, book.genre, book.tags, book.shelf, book.year]
    .join(' ')
    .toLowerCase();
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function issueSort(a, b) {
  const aVolume = Number(a.volume) || 0;
  const bVolume = Number(b.volume) || 0;
  if (aVolume !== bVolume) return aVolume - bVolume;
  const aNumber = parseFloat(a.number);
  const bNumber = parseFloat(b.number);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
  return naturalCompare(a.title, b.title);
}

function seriesKey(book) {
  return `${book.series || '~'} ${String(book.volume || '').padStart(5, '0')} ${String(book.number || '').padStart(8, '0')} ${book.title}`;
}

function progressPct(book) {
  if (book.format === 'PDF') return null;
  if (!book.startedAt) return 0;
  if (!book.total) return 0;
  if ((book.progress || 0) >= book.total - 1) return 100;
  return Math.max(0, Math.min(99, Math.round(((book.progress || 0) + 1) / book.total * 100)));
}

function readerDisplayTitle(book) {
  return book.series ? `${book.series}${book.number ? ` #${book.number}` : ''} · ${book.title}` : book.title;
}

function relativeTime(timestamp) {
  const delta = Math.max(0, Date.now() - Number(timestamp || 0));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(timestamp).toLocaleDateString('es-ES');
}
