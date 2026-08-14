import { imageExt, naturalCompare, mimeFromName, formatOf } from './utils.js?v=2.5.0';
import { parseComicInfo } from './metadata.js?v=2.5.0';

const MAX_PAGES = 5000;
const MAX_PAGE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED = 3 * 1024 * 1024 * 1024;
const MAX_COMICINFO_BYTES = 2 * 1024 * 1024;
const MAX_SOLID_RAR_DEFAULT_BYTES = 160 * 1024 * 1024;
const MAX_SOLID_RAR_LOW_MEMORY_BYTES = 96 * 1024 * 1024;
const MAX_SOLID_RAR_HIGH_MEMORY_BYTES = 256 * 1024 * 1024;

export async function importComic(file, onStatus = () => {}) {
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

export async function importImages(files) {
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


export async function inspectRarHeader(file) {
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

export async function ensurePage(page) {
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
  enginePromise = import('../vendor/unrarit.module.js?v=2.5.0').catch(() => {
    enginePromise = null;
    throw new Error('No se pudo cargar el motor CBR local. Ejecuta RELEASE_CHECK para comprobar su integridad o PREPARE_GITHUB para restaurarlo.');
  });
  return enginePromise;
}

export function evictPage(page) {
  if (!page || page.released || page.loading) return;
  if (page.url) URL.revokeObjectURL(page.url);
  page.url = null;
  if (page.getBlob) page.blob = null;
}

export function releaseComic(comic) {
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
