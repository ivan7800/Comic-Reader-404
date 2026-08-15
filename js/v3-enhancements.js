/* Comic Reader 404 Ultimate v3.0 enhancements. Classic script: HTTP(S) + file:// */
'use strict';

(() => {
  const V3_KEY = 'cr404.v3.settings';
  const STATUS_KEY = 'cr404.v3.statuses';
  const BOOK_PREFS_KEY = 'cr404.v3.bookprefs';
  const DB_NAME = 'cr404-fs-v1';
  const DB_STORE = 'handles';
  const MAX_THUMBS = 1200;
  const MIN_ZOOM = 0.75;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.25;

  const v3Defaults = {
    libraryLayout: 'grid',
    smartTablet: true,
    prefetch: 2,
    linkedFolderName: '',
    statusFilter: 'all',
    readerBrightness: 100,
    readerBackground: 'black',
  };

  let v3 = loadV3();
  let statuses = loadStatuses();
  let bookPrefs = loadBookPrefs();
  let zoom = 1;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let lastTapAt = 0;
  let thumbObserver = null;

  function loadV3() {
    try { return { ...v3Defaults, ...JSON.parse(localStorage.getItem(V3_KEY) || '{}') }; }
    catch { return { ...v3Defaults }; }
  }
  function saveV3() {
    localStorage.setItem(V3_KEY, JSON.stringify(v3));
  }
  function loadStatuses() {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveStatuses() {
    localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
  }
  function loadBookPrefs() {
    try { return JSON.parse(localStorage.getItem(BOOK_PREFS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveBookPrefs() {
    const entries = Object.entries(bookPrefs).slice(-500);
    localStorage.setItem(BOOK_PREFS_KEY, JSON.stringify(Object.fromEntries(entries)));
  }
  function saveCurrentBookPref(patch = {}) {
    if (!currentMeta?.id) return;
    bookPrefs[currentMeta.id] = { ...(bookPrefs[currentMeta.id] || {}), ...patch };
    saveBookPrefs();
  }

  function injectUi() {
    const topActions = document.querySelector('.reader-top-actions');
    if (topActions && !document.querySelector('#pageBrowserBtn')) {
      const pageBrowser = button('pageBrowserBtn', '▦', 'Miniaturas de páginas');
      topActions.prepend(pageBrowser);
      pageBrowser.addEventListener('click', openPageBrowser);
    }

    const modes = document.querySelector('.reader-mode-actions');
    if (modes && !document.querySelector('#smartModeBtn')) {
      const smart = button('smartModeBtn', 'AUTO', 'Modo tablet inteligente');
      smart.className = 'mode-btn smart-mode-btn';
      smart.setAttribute('aria-pressed', String(v3.smartTablet));
      modes.prepend(smart);
      smart.addEventListener('click', () => {
        v3.smartTablet = !v3.smartTablet;
        saveV3();
        updateSmartButton();
        if (v3.smartTablet) applySmartMode();
        showToast(v3.smartTablet ? 'Modo inteligente activado.' : 'Modo inteligente desactivado.');
      });
    }

    const controls = document.querySelector('#readerControls');
    if (controls && !document.querySelector('#zoomControls')) {
      const wrap = document.createElement('div');
      wrap.id = 'zoomControls';
      wrap.className = 'zoom-controls';
      wrap.setAttribute('aria-label', 'Zoom');
      const minus = button('zoomOutBtn', '−', 'Reducir zoom');
      const reset = button('zoomResetBtn', '100%', 'Restablecer zoom');
      const plus = button('zoomInBtn', '+', 'Aumentar zoom');
      minus.className = reset.className = plus.className = 'mode-btn zoom-btn';
      wrap.append(minus, reset, plus);
      controls.append(wrap);
      minus.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
      reset.addEventListener('click', () => setZoom(1));
      plus.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
    }

    const toolbarRight = document.querySelector('.toolbar-right');
    if (toolbarRight && !document.querySelector('#layoutSwitcher')) {
      const switcher = document.createElement('div');
      switcher.id = 'layoutSwitcher';
      switcher.className = 'layout-switcher';
      switcher.setAttribute('aria-label', 'Diseño de biblioteca');
      [['grid','▦','Cuadrícula'],['list','▤','Lista'],['shelf','▥','Estantería']].forEach(([value, icon, label]) => {
        const b = button(`layout-${value}`, icon, label);
        b.className = 'icon-btn layout-btn';
        b.dataset.layout = value;
        b.addEventListener('click', () => {
          v3.libraryLayout = value;
          saveV3();
          applyLibraryLayout();
        });
        switcher.append(b);
      });
      toolbarRight.prepend(switcher);
      const statusFilter = document.createElement('select');
      statusFilter.id = 'statusFilter';
      statusFilter.setAttribute('aria-label', 'Filtrar por estado de lectura');
      statusFilter.innerHTML = '<option value="all">Todos los estados</option><option value="new">Sin empezar</option><option value="reading">Leyendo</option><option value="finished">Terminados</option><option value="abandoned">Abandonados</option>';
      statusFilter.value = v3.statusFilter || 'all';
      statusFilter.addEventListener('change', () => {
        v3.statusFilter = statusFilter.value;
        saveV3();
        renderLibrary();
      });
      toolbarRight.append(statusFilter);
    }

    injectSettings();
    injectMetadataStatus();
    injectPageBrowserDialog();
    updateSmartButton();
    applyLibraryLayout();
    decorateLibrary();
  }

  function button(id, text, label) {
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  }

  function injectSettings() {
    const form = document.querySelector('#settingsDialog form');
    const backup = document.querySelector('#settingsDialog .settings-section');
    if (!form || document.querySelector('#v3SettingsSection')) return;
    const section = document.createElement('section');
    section.id = 'v3SettingsSection';
    section.className = 'settings-section v3-settings';
    section.innerHTML = `
      <h3>Ultimate 3.0</h3>
      <div class="v3-setting-grid">
        <label class="toggle-row"><span>Modo tablet inteligente</span><input id="smartTabletSetting" type="checkbox"></label>
        <label>Precarga de páginas<select id="prefetchSetting"><option value="1">1 página</option><option value="2">2 páginas</option><option value="3">3 páginas</option></select></label>
        <label>Brillo del lector<input id="readerBrightnessSetting" type="range" min="70" max="130" step="5" value="100"><output id="readerBrightnessValue">100%</output></label>
        <label>Fondo del lector<select id="readerBackgroundSetting"><option value="black">Negro</option><option value="gray">Gris</option><option value="white">Blanco</option></select></label>
      </div>
      <div class="linked-folder-card">
        <div><strong>Carpeta vinculada</strong><small id="linkedFolderLabel">Ninguna</small></div>
        <div class="button-row"><button id="linkFolderBtn" class="secondary-btn" type="button">Vincular carpeta</button><button id="syncFolderBtn" class="secondary-btn" type="button">Actualizar</button></div>
      </div>
      <div id="v3Stats" class="v3-stats" aria-label="Estadísticas locales"></div>`;
    backup?.before(section) || form.querySelector('menu')?.before(section);

    const smart = section.querySelector('#smartTabletSetting');
    smart.checked = Boolean(v3.smartTablet);
    smart.addEventListener('change', () => {
      v3.smartTablet = smart.checked;
      saveV3(); updateSmartButton(); if (v3.smartTablet) applySmartMode();
    });
    const prefetch = section.querySelector('#prefetchSetting');
    prefetch.value = String(v3.prefetch || 2);
    prefetch.addEventListener('change', () => { v3.prefetch = Number(prefetch.value) || 2; saveV3(); });
    const brightness = section.querySelector('#readerBrightnessSetting');
    const brightnessOut = section.querySelector('#readerBrightnessValue');
    brightness.value = String(v3.readerBrightness || 100); brightnessOut.value = `${brightness.value}%`; brightnessOut.textContent = `${brightness.value}%`;
    brightness.addEventListener('input', () => { v3.readerBrightness = Number(brightness.value) || 100; brightnessOut.value = `${brightness.value}%`; brightnessOut.textContent = `${brightness.value}%`; saveV3(); applyReaderAppearance(); });
    const background = section.querySelector('#readerBackgroundSetting');
    background.value = v3.readerBackground || 'black';
    background.addEventListener('change', () => { v3.readerBackground = background.value; saveV3(); applyReaderAppearance(); });
    section.querySelector('#linkFolderBtn').addEventListener('click', linkFolder);
    section.querySelector('#syncFolderBtn').addEventListener('click', syncLinkedFolder);
    updateFolderLabel();
    updateV3Stats();
  }

  function injectMetadataStatus() {
    const fields = document.querySelector('#metadataDialog .metadata-fields');
    if (!fields || document.querySelector('#metaReadingStatus')) return;
    const label = document.createElement('label');
    label.textContent = 'Estado de lectura';
    const select = document.createElement('select');
    select.id = 'metaReadingStatus';
    select.innerHTML = '<option value="auto">Automático</option><option value="new">Nuevo</option><option value="reading">Leyendo</option><option value="finished">Terminado</option><option value="abandoned">Abandonado</option>';
    label.append(select);
    fields.append(label);
    select.addEventListener('change', () => {
      if (!editingBookId) return;
      if (select.value === 'auto') delete statuses[editingBookId];
      else statuses[editingBookId] = select.value;
      saveStatuses();
      decorateLibrary();
    });

    const originalOpenMetadata = openMetadata;
    openMetadata = function enhancedOpenMetadata(id) {
      originalOpenMetadata(id);
      const book = findBook(id);
      select.value = statuses[id] || 'auto';
      if (book) select.dataset.autoStatus = automaticStatus(book);
    };
  }

  function injectPageBrowserDialog() {
    if (document.querySelector('#pageBrowserDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'pageBrowserDialog';
    dialog.className = 'panel-dialog page-browser-dialog';
    dialog.setAttribute('aria-labelledby', 'pageBrowserTitle');
    dialog.innerHTML = `<form method="dialog"><header><div><p class="dialog-kicker">LECTOR</p><h2 id="pageBrowserTitle">Páginas</h2></div><button class="icon-btn" value="cancel" aria-label="Cerrar">×</button></header><div id="pageBrowserGrid" class="page-browser-grid"></div><p id="pageBrowserNote" class="muted"></p><menu><button value="cancel" class="secondary-btn">Cerrar</button></menu></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => thumbObserver?.disconnect());
  }

  function openPageBrowser() {
    if (!current || current.kind === 'pdf' || !current.pages?.length) {
      showToast('Las miniaturas están disponibles para CBZ, CBR e imágenes.');
      return;
    }
    const dialog = document.querySelector('#pageBrowserDialog');
    const grid = document.querySelector('#pageBrowserGrid');
    const note = document.querySelector('#pageBrowserNote');
    grid.replaceChildren();
    const total = Math.min(current.pages.length, MAX_THUMBS);
    for (let index = 0; index < total; index += 1) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-thumb';
      b.dataset.page = String(index);
      b.setAttribute('aria-label', `Ir a página ${index + 1}`);
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      const n = document.createElement('span');
      n.textContent = String(index + 1);
      b.append(img, n);
      b.addEventListener('click', () => {
        page = index;
        els.range.value = String(page + 1);
        renderPage();
        dialog.close();
      });
      grid.append(b);
    }
    note.textContent = current.pages.length > MAX_THUMBS ? `Mostrando las primeras ${MAX_THUMBS} de ${current.pages.length} páginas.` : `${current.pages.length} páginas`;
    openDialog(dialog);
    thumbObserver?.disconnect();
    thumbObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) loadThumb(entry.target);
    }), { root: grid, rootMargin: '300px' });
    grid.querySelectorAll('.page-thumb').forEach((b) => thumbObserver.observe(b));
    requestAnimationFrame(() => grid.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'center' }));
  }

  async function loadThumb(buttonNode) {
    if (buttonNode.dataset.loaded) return;
    buttonNode.dataset.loaded = '1';
    thumbObserver?.unobserve(buttonNode);
    const index = Number(buttonNode.dataset.page);
    const item = current?.pages?.[index];
    if (!item) return;
    try {
      const ready = await ensurePage(item);
      const img = buttonNode.querySelector('img');
      if (img && buttonNode.isConnected) img.src = ready.url;
      buttonNode.classList.toggle('current', index === page);
      if (Math.abs(index - page) > 8) setTimeout(() => {
        if (!document.querySelector('#pageBrowserDialog')?.open) evictPage(item);
      }, 500);
    } catch { buttonNode.classList.add('page-thumb-error'); }
  }

  function setZoom(value) {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
    saveCurrentBookPref({ zoom });
    const reset = document.querySelector('#zoomResetBtn');
    if (reset) reset.textContent = `${Math.round(zoom * 100)}%`;
    const stage = document.querySelector('#readerStage');
    const canvas = document.querySelector('#pageCanvas');
    if (!stage || !canvas) return;
    stage.classList.toggle('zoomed', zoom !== 1);
    if (mode === 'webtoon') {
      canvas.style.width = zoom === 1 ? '' : `${Math.round(zoom * 100)}%`;
      canvas.style.height = '';
    } else if (fit === 'width') {
      canvas.style.width = `${Math.round(zoom * 100)}%`;
      canvas.style.height = '';
    } else {
      canvas.style.width = `${Math.round(zoom * 100)}%`;
      canvas.style.height = `${Math.round(zoom * 100)}%`;
    }
  }

  function installZoomGestures() {
    const stage = document.querySelector('#readerStage');
    if (!stage || stage.dataset.v3Gestures) return;
    stage.dataset.v3Gestures = '1';
    stage.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) {
        pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
        pinchStartZoom = zoom;
      }
    }, { passive: true });
    stage.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 2 || !pinchStartDistance) return;
      event.preventDefault();
      setZoom(pinchStartZoom * touchDistance(event.touches[0], event.touches[1]) / pinchStartDistance);
    }, { passive: false });
    stage.addEventListener('touchend', (event) => {
      if (event.touches.length < 2) pinchStartDistance = 0;
    }, { passive: true });
    stage.addEventListener('dblclick', (event) => {
      if (event.target.closest('img')) setZoom(zoom > 1 ? 1 : 2);
    });
    stage.addEventListener('touchend', (event) => {
      if (event.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - lastTapAt < 320 && event.target.closest?.('img')) setZoom(zoom > 1 ? 1 : 2);
      lastTapAt = now;
    }, { passive: true });
    stage.addEventListener('wheel', (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }, { passive: false });
  }

  function touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function updateSmartButton() {
    const b = document.querySelector('#smartModeBtn');
    if (!b) return;
    b.classList.toggle('active', Boolean(v3.smartTablet));
    b.setAttribute('aria-pressed', String(Boolean(v3.smartTablet)));
  }

  function applyReaderAppearance() {
    const stage = document.querySelector('#readerStage');
    if (!stage) return;
    stage.dataset.readerBg = v3.readerBackground || 'black';
    stage.style.setProperty('--reader-brightness', `${Math.max(70, Math.min(130, Number(v3.readerBrightness) || 100))}%`);
  }

  function applySmartMode() {
    if (!v3.smartTablet || !current || current.kind === 'pdf' || mode === 'webtoon') return;
    const tablet = Math.min(innerWidth, innerHeight) >= 600 || innerWidth >= 900;
    if (!tablet) return;
    const next = innerWidth > innerHeight ? 'double' : 'single';
    if (mode !== next) setMode(next);
  }

  function applyLibraryLayout() {
    const content = document.querySelector('#libraryContent');
    if (!content) return;
    content.dataset.layout = v3.libraryLayout;
    document.querySelectorAll('.layout-btn').forEach((b) => {
      const active = b.dataset.layout === v3.libraryLayout;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  function automaticStatus(book) {
    const pct = progressPct(book);
    if (pct === 100) return 'finished';
    if (book.startedAt) return 'reading';
    return 'new';
  }
  function statusFor(book) { return statuses[book.id] || automaticStatus(book); }
  function statusLabel(status) {
    return ({ new: 'NUEVO', reading: 'LEYENDO', finished: 'TERMINADO', abandoned: 'ABANDONADO' })[status] || 'NUEVO';
  }

  function decorateLibrary() {
    applyLibraryLayout();
    const books = new Map(loadLibrary().map((b) => [b.title, b]));
    document.querySelectorAll('.comic-card').forEach((card) => {
      const title = card.querySelector('.card-title')?.textContent;
      const book = books.get(title);
      if (!book) return;
      let badge = card.querySelector('.v3-status-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'v3-status-badge';
        card.querySelector('.cover-wrap')?.append(badge);
      }
      card.dataset.bookId = book.id;
      const status = statusFor(book);
      badge.dataset.status = status;
      badge.textContent = statusLabel(status);
    });

    if (libraryViewMode === 'series') enhanceSeriesGroups();
  }

  function enhanceSeriesGroups() {
    document.querySelectorAll('.library-group').forEach((group) => {
      if (group.dataset.v3Series) return;
      group.dataset.v3Series = '1';
      const cards = group.querySelectorAll('.comic-card');
      if (cards.length <= 1) return;
      group.classList.add('series-collapsed');
      const head = group.querySelector('.group-heading');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'secondary-btn series-toggle';
      toggle.textContent = `Ver ${cards.length} números`;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const expanded = group.classList.toggle('series-expanded');
        group.classList.toggle('series-collapsed', !expanded);
        toggle.textContent = expanded ? 'Contraer serie' : `Ver ${cards.length} números`;
        toggle.setAttribute('aria-expanded', String(expanded));
      });
      head?.append(toggle);
    });
  }

  function updateV3Stats() {
    const box = document.querySelector('#v3Stats');
    if (!box) return;
    const books = loadLibrary();
    const finished = books.filter((b) => statusFor(b) === 'finished').length;
    const reading = books.filter((b) => statusFor(b) === 'reading').length;
    const favorites = books.filter((b) => b.favorite).length;
    const pages = books.filter((b) => b.format !== 'PDF').reduce((sum, b) => sum + Math.min((b.progress || 0) + (b.startedAt ? 1 : 0), b.total || 0), 0);
    box.innerHTML = `<div><strong>${finished}</strong><span>Terminados</span></div><div><strong>${reading}</strong><span>Leyendo</span></div><div><strong>${favorites}</strong><span>Favoritos</span></div><div><strong>${pages}</strong><span>Páginas de progreso</span></div>`;
  }

  async function openFsDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveFolderHandle(handle) {
    const db = await openFsDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, 'library');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  async function getFolderHandle() {
    const db = await openFsDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get('library');
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
    db.close(); return value;
  }

  async function linkFolder() {
    if (!window.showDirectoryPicker) {
      showToast('La carpeta vinculada requiere Chrome o Edge de escritorio. Puedes seguir usando “Carpeta” en cualquier navegador compatible.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await saveFolderHandle(handle);
      v3.linkedFolderName = handle.name || 'Biblioteca';
      saveV3(); updateFolderLabel();
      await syncHandle(handle);
    } catch (error) {
      if (error?.name !== 'AbortError') showError(`No se pudo vincular la carpeta: ${error?.message || error}`);
    }
  }

  async function syncLinkedFolder() {
    try {
      const handle = await getFolderHandle();
      if (!handle) { showToast('Primero vincula una carpeta.'); return; }
      if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted') {
        const permission = await handle.requestPermission({ mode: 'read' });
        if (permission !== 'granted') return;
      }
      await syncHandle(handle);
    } catch (error) { showError(`No se pudo actualizar la carpeta: ${error?.message || error}`); }
  }

  async function syncHandle(handle) {
    const files = [];
    await collectFiles(handle, '', files, 1000);
    if (!files.length) { showToast('No se encontraron cómics compatibles en la carpeta.'); return; }
    await runImportOperation(() => importBatch(files));
    updateV3Stats();
  }

  async function collectFiles(dir, prefix, output, limit) {
    for await (const [name, handle] of dir.entries()) {
      if (output.length >= limit) break;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') await collectFiles(handle, path, output, limit);
      else if (/\.(cbz|zip|cbr|rar|pdf|jpe?g|png|webp|avif|gif)$/i.test(name)) {
        const file = await handle.getFile();
        try { Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true }); } catch { /* optional */ }
        output.push(file);
      }
    }
  }

  function updateFolderLabel() {
    const label = document.querySelector('#linkedFolderLabel');
    const sync = document.querySelector('#syncFolderBtn');
    if (label) label.textContent = v3.linkedFolderName || 'Ninguna';
    if (sync) sync.disabled = !v3.linkedFolderName;
  }

  function installHooks() {
    const originalExportBackup = exportBackup;
    exportBackup = function v3ExportBackup() {
      return { ...originalExportBackup(), ultimate: { version: 3, settings: v3, statuses, bookPrefs } };
    };
    const originalImportBackup = importBackup;
    importBackup = function v3ImportBackup(data) {
      const result = originalImportBackup(data);
      if (data?.ultimate?.settings) { v3 = { ...v3Defaults, ...data.ultimate.settings }; saveV3(); }
      if (data?.ultimate?.statuses && typeof data.ultimate.statuses === 'object') { statuses = data.ultimate.statuses; saveStatuses(); }
      if (data?.ultimate?.bookPrefs && typeof data.ultimate.bookPrefs === 'object') { bookPrefs = data.ultimate.bookPrefs; saveBookPrefs(); }
      applyLibraryLayout(); applyReaderAppearance(); updateSmartButton();
      return result;
    };

    preload = function v3Preload(start) {
      const count = Math.max(1, Math.min(3, Number(v3.prefetch) || 2));
      for (let index = start; index < start + count; index += 1) {
        const item = current?.pages?.[index];
        if (item) ensurePage(item).catch(() => {});
      }
    };

    const originalFilteredItems = filteredItems;
    filteredItems = function v3FilteredItems(items) {
      const output = originalFilteredItems(items);
      const wanted = v3.statusFilter || 'all';
      return wanted === 'all' ? output : output.filter((book) => statusFor(book) === wanted);
    };

    const originalRenderLibrary = renderLibrary;
    renderLibrary = function v3RenderLibrary(...args) {
      const result = originalRenderLibrary(...args);
      requestAnimationFrame(() => { decorateLibrary(); updateV3Stats(); });
      return result;
    };

    const originalRenderPage = renderPage;
    renderPage = function v3RenderPage(...args) {
      if (current && current.kind !== 'pdf' && mode === 'double') {
        webtoonObserver?.disconnect(); webtoonObserver = null; els.canvas.replaceChildren();
        els.range.hidden = false; els.range.max = String(currentMeta.total);
        if (page > 0 && page % 2 === 0) page -= 1;
        els.range.value = String(page + 1);
        const indices = page === 0 ? [0] : [page];
        if (page > 0 && page + 1 < currentMeta.total) indices.push(page + 1);
        if (rtl && indices.length > 1) indices.reverse();
        indices.forEach((index) => { const image = makeImgShell(index); els.canvas.append(image); loadPageImage(image); });
        updateReaderCounter(indices); preload((page === 0 ? 1 : page + 2)); trimPageCache(indices); saveProgress(); updateBookmarkButton();
        requestAnimationFrame(() => setZoom(zoom));
        return;
      }
      const result = originalRenderPage(...args);
      requestAnimationFrame(() => setZoom(zoom));
      return result;
    };

    const originalOpenReader = openReader;
    openReader = function v3OpenReader(...args) {
      const result = originalOpenReader(...args);
      const pref = currentMeta?.id ? bookPrefs[currentMeta.id] : null;
      zoom = Number(pref?.zoom) || 1;
      requestAnimationFrame(() => {
        applyReaderAppearance();
        if (pref?.mode && ['single','double','webtoon'].includes(pref.mode) && !v3.smartTablet) setMode(pref.mode);
        setZoom(zoom); applySmartMode();
      });
      return result;
    };

    const originalSetMode = setMode;
    setMode = function v3SetMode(next, rerender = true) {
      const result = originalSetMode(next, rerender);
      saveCurrentBookPref({ mode: next });
      requestAnimationFrame(() => setZoom(zoom));
      return result;
    };
  }

  function installResize() {
    let timer = null;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(applySmartMode, 180);
    }, { passive: true });
    screen.orientation?.addEventListener?.('change', () => setTimeout(applySmartMode, 120));
  }

  try {
    injectUi();
    installHooks();
    installZoomGestures();
    installResize();
    applyReaderAppearance();
    document.querySelector('#fitBtn')?.addEventListener('click', () => setTimeout(() => saveCurrentBookPref({ fit }), 0));
    document.body.dataset.ultimate = '3.0';
  } catch (error) {
    console.error('Comic Reader 404 Ultimate 3.0 enhancements:', error);
    showToast?.('Las mejoras Ultimate no pudieron iniciarse; el lector básico sigue disponible.');
  }
})();
