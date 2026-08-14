import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const cjs = join(tmpdir(), `cr404-jszip-${process.pid}.cjs`);
writeFileSync(cjs, readFileSync(new URL('../vendor/jszip.min.js', import.meta.url)));
const JSZip = require(cjs);
unlinkSync(cjs);
globalThis.JSZip = JSZip;

const { importComic, ensurePage, evictPage, releaseComic } = await import('../js/importers.js');
const zip = new JSZip();
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
zip.file('001.png', tinyPng);
zip.file('002.png', tinyPng);
const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const pseudoFile = {
  name: 'qa.cbz', type: 'application/vnd.comicbook+zip', size: buffer.length,
  arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
};
const comic = await importComic(pseudoFile);
assert.equal(comic.format, 'CBZ');
assert.equal(comic.pages.length, 2);
const page = await ensurePage(comic.pages[0]);
assert.ok(page.blob instanceof Blob);
assert.ok(page.url.startsWith('blob:'));
const firstUrl = page.url;
evictPage(page);
assert.equal(page.url, null);
const reloaded = await ensurePage(page);
assert.ok(reloaded.url.startsWith('blob:'));
assert.notEqual(reloaded.url, firstUrl);
releaseComic(comic);
assert.equal(page.url, null);
assert.equal(page.released, true);
console.log('cbz-smoke.mjs: PASS');
