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

export const defaults = {
  theme: 'noir',
  defaultMode: 'single',
  rtl: false,
  autoHide: true,
  fit: 'contain',
};

export function loadLibrary() {
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

export function saveLibrary(items) {
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

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(OLD_SETTINGS_KEY) || '{}');
    return normalizeSettings(raw);
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(value) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(value)));
}

export function upsertBook(book) {
  const list = loadLibrary();
  const index = list.findIndex((item) => item.id === book.id);
  const next = normalizeBook(index >= 0 ? { ...list[index], ...book } : book);
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  saveLibrary(list);
  return list;
}

export function patchBook(id, patch) {
  const list = loadLibrary();
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) {
    list[index] = normalizeBook({ ...list[index], ...patch });
    saveLibrary(list);
  }
  return list;
}

export function deleteBook(id) {
  const list = loadLibrary().filter((item) => item.id !== id);
  saveLibrary(list);
  saveHistory(loadHistory().filter((item) => item.bookId !== id));
  return list;
}

export function findBook(id) {
  return loadLibrary().find((item) => item.id === id) || null;
}

export function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return normalizeHistory(raw);
  } catch {
    return [];
  }
}

export function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalizeHistory(items).slice(0, MAX_HISTORY_ITEMS)));
}

export function addHistory(book) {
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

export function getShelves() {
  return [...new Set(loadLibrary().map((item) => item.shelf?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function toggleBookmark(id, page) {
  const book = findBook(id);
  if (!book || book.format === 'PDF') return [];
  const safePage = clampInt(page, 0, Math.max(0, book.total - 1));
  const set = new Set(book.bookmarks || []);
  set.has(safePage) ? set.delete(safePage) : set.add(safePage);
  const bookmarks = [...set].sort((a, b) => a - b);
  patchBook(id, { bookmarks });
  return bookmarks;
}

export function exportBackup() {
  return {
    schema: 'comic-reader-404-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    library: loadLibrary(),
    history: loadHistory(),
    settings: loadSettings(),
  };
}

export function importBackup(data) {
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

export function normalizeBook(book = {}) {
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
