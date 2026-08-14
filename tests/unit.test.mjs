import assert from 'node:assert/strict';

class LocalStorageMock {
  #store = new Map();
  limit = Infinity;
  getItem(key) { return this.#store.has(key) ? this.#store.get(key) : null; }
  setItem(key, value) {
    const text = String(value);
    if (text.length > this.limit) throw new Error('QuotaExceededError');
    this.#store.set(String(key), text);
  }
  removeItem(key) { this.#store.delete(String(key)); }
  clear() { this.#store.clear(); }
}

globalThis.localStorage = new LocalStorageMock();

const storage = await import('../js/storage.js');
const metadata = await import('../js/metadata.js');
const utils = await import('../js/utils.js');
const importers = await import('../js/importers.js');

localStorage.setItem('cr404.library.v2', JSON.stringify([{
  id: 'a', title: ' X '.repeat(200), total: 12, progress: 999,
  bookmarks: [-2, 0, 1, 999, '2'], cover: 'javascript:bad',
  format: 'CBZ', fileNames: ['a.jpg', null, 'b.jpg'], startedAt: -5
}]));
const loaded = storage.loadLibrary();
assert.equal(loaded.length, 1);
assert.equal(loaded[0].progress, 11, 'progress must be clamped to the last page');
assert.deepEqual(loaded[0].bookmarks, [0, 1, 2], 'bookmarks must be normalized and clamped');
assert.equal(loaded[0].cover, '', 'non-image data URLs must be rejected');
assert.ok(loaded[0].title.length <= 160, 'title must be bounded');
assert.equal(loaded[0].startedAt, 0, 'invalid timestamps must be cleared');

localStorage.setItem('cr404.settings.v2', JSON.stringify({ theme: 'evil', defaultMode: 'other', fit: 'zoom', autoHide: 'yes' }));
const settings = storage.loadSettings();
assert.equal(settings.theme, 'noir');
assert.equal(settings.defaultMode, 'single');
assert.equal(settings.fit, 'contain');
assert.equal(settings.autoHide, true);

assert.throws(() => storage.importBackup(null), /copia válida/i);
assert.throws(() => storage.importBackup({ library: 'bad' }), /copia válida/i);
const backupResult = storage.importBackup({
  schema: 'comic-reader-404-backup',
  library: [{ id: 'b', title: 'Book', total: 2, progress: 1, bookmarks: [1] }],
  history: [{ id: 'h', bookId: 'b', title: 'Book', page: 2, total: 2, at: Date.now() }],
  settings: { theme: 'paper', defaultMode: 'double', rtl: true, autoHide: false, fit: 'width' }
});
assert.equal(backupResult, true);
assert.equal(storage.loadSettings().theme, 'paper');
assert.equal(storage.exportBackup().version, 3);

localStorage.limit = 1800;
storage.saveLibrary([
  { id: 'quota-a', title: 'A', total: 2, cover: `data:image/png;base64,${'A'.repeat(5000)}` },
  { id: 'quota-b', title: 'B', total: 2, cover: `data:image/png;base64,${'B'.repeat(5000)}` },
]);
localStorage.limit = Infinity;
const quotaLibrary = storage.loadLibrary();
assert.equal(quotaLibrary.length, 2);
assert.equal(quotaLibrary.every((book) => book.cover === ''), true, 'quota fallback must preserve metadata after dropping covers');

const info = metadata.normalizeComicInfo({
  Title: 'T'.repeat(300), Series: 'Serie', Number: '7', Volume: 2, Year: 2026,
  Summary: 'S'.repeat(5000), Manga: 'YesAndRightToLeft', Pages: [{ image: 3, type: 'FrontCover' }]
});
assert.equal(info.title.length, 160);
assert.equal(info.summary.length, 3000);
assert.equal(info.rtl, true);
assert.equal(info.coverPage, 3);
assert.equal(info.hasComicInfo, true);

const descriptor = utils.imageCollectionDescriptor([
  { name: '001.jpg', size: 10, lastModified: 100 },
  { name: '002.jpg', size: 20, lastModified: 200 }
]);
assert.equal(descriptor.size, 30);
assert.equal(descriptor.lastModified, 200);
assert.match(descriptor.name, /\+ 1$/);
const descriptorReversed = utils.imageCollectionDescriptor([
  { name: '002.jpg', size: 20, lastModified: 200 },
  { name: '001.jpg', size: 10, lastModified: 100 }
]);
assert.equal(descriptor.idKey, descriptorReversed.idKey, 'image collection id must not depend on selection order');
assert.equal(utils.bookId(descriptor), descriptor.idKey);
assert.equal(utils.formatOf('comic.CBZ'), 'CBZ');
assert.equal(utils.mimeFromName('page.webp'), 'image/webp');



function rar4Header(flags = 0) {
  const bytes = new Uint8Array(20);
  bytes.set([0x52,0x61,0x72,0x21,0x1a,0x07,0x00], 0);
  const p = 7;
  bytes[p+2] = 0x73;
  bytes[p+3] = flags & 0xff; bytes[p+4] = (flags >> 8) & 0xff;
  bytes[p+5] = 13; bytes[p+6] = 0;
  return new Blob([bytes]);
}
const rarPlain = await importers.inspectRarHeader(rar4Header());
assert.deepEqual({version:rarPlain.version, solid:rarPlain.solid, volume:rarPlain.volume, encrypted:rarPlain.encrypted}, {version:4,solid:false,volume:false,encrypted:false});
const rarSolid = await importers.inspectRarHeader(rar4Header(0x0008));
assert.equal(rarSolid.solid, true);
const rarVolumeEncrypted = await importers.inspectRarHeader(rar4Header(0x0081));
assert.equal(rarVolumeEncrypted.volume, true);
assert.equal(rarVolumeEncrypted.encrypted, true);
await assert.rejects(() => importers.inspectRarHeader(new Blob([new Uint8Array(8)])), /firma/i);

console.log('unit.test.mjs: assertions OK');
