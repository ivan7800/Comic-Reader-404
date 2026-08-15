import {
  loadLibrary, loadSettings, saveSettings, upsertBook, patchBook, deleteBook, findBook,
  loadHistory, addHistory, getShelves, toggleBookmark, exportBackup, importBackup,
} from './storage.js?v=3.0.0';
import {
  bookId, baseName, blobToDataUrl, placeholderCover, naturalCompare, imageCollectionDescriptor,
} from './utils.js?v=3.0.0';
import { importComic, importImages, ensurePage, evictPage, releaseComic } from './importers.js?v=3.0.0';

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
