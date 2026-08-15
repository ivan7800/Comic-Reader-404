#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, re, tempfile, zipfile

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')

def build_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
    html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',html)
    html=re.sub(r'<link rel="manifest"[^>]*>','',html)
    html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
    return html.replace('</head>', f'<style>{(ROOT/"css/app.css").read_text(encoding="utf-8")}</style></head>')

def make_cbz(path: Path):
    xml='<?xml version="1.0"?><ComicInfo><Title>Runtime Smoke</Title><Series>QA</Series><Number>1</Number></ComicInfo>'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_STORED) as z:
        z.writestr('ComicInfo.xml',xml); z.writestr('001.png',PNG); z.writestr('002.png',PNG)

with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
    cbz=Path(td)/'runtime-smoke.cbz'; make_cbz(cbz)
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(build_html(), wait_until='domcontentloaded')
    # set_content has an opaque origin in Chromium; provide a tiny Storage shim so the
    # runtime can be exercised without turning this into an HTTP-origin test.
    page.evaluate("""() => {
      const data = new Map();
      const storage = {
        getItem: (k) => data.has(String(k)) ? data.get(String(k)) : null,
        setItem: (k, v) => { data.set(String(k), String(v)); },
        removeItem: (k) => { data.delete(String(k)); },
        clear: () => data.clear(),
        key: (i) => [...data.keys()][i] ?? null,
      };
      Object.defineProperty(storage, 'length', { get: () => data.size });
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    }""")
    page.evaluate("localStorage.setItem('cr404.settings.v2', JSON.stringify({theme:'noir',defaultMode:'single',rtl:false,autoHide:false,fit:'contain'}))")
    for rel in ['vendor/jszip.min.js','vendor/unrarit.classic.js','js/app.bundle.js','js/v3-enhancements.js']:
        page.add_script_tag(content=(ROOT/rel).read_text(encoding='utf-8'))
    page.wait_for_timeout(100)
    assert page.locator('body').get_attribute('data-runtime') == 'ready'
    assert page.locator('body').get_attribute('data-ultimate') == '3.1'
    assert page.locator('#pageBrowserBtn').count() == 1
    assert page.locator('#smartModeBtn').count() == 1
    assert page.locator('#zoomControls').count() == 1
    with page.expect_file_chooser() as chooser_info:
        page.locator('#importBtn').click()
    chooser_info.value.set_files(str(cbz))
    page.wait_for_function("document.querySelector('#readerView') && !document.querySelector('#readerView').hidden", timeout=10000)
    assert 'Runtime Smoke' in page.locator('#readerTitle').inner_text()
    page.wait_for_function("document.querySelector('#pageCanvas img.loaded')", timeout=5000)
    sizing = page.evaluate("""() => {
      const stage = document.querySelector('#readerStage').getBoundingClientRect();
      const img = document.querySelector('#pageCanvas img.loaded').getBoundingClientRect();
      return {stageW: stage.width, stageH: stage.height, imgW: img.width, imgH: img.height};
    }""")
    assert sizing['imgW'] >= sizing['stageW'] * 0.95, sizing
    assert sizing['imgH'] >= sizing['stageH'] * 0.95, sizing
    fit_bounds = page.locator('#fitBtn').evaluate("e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}")
    assert fit_bounds['top'] >= 0 and fit_bounds['bottom'] <= 844 and fit_bounds['left'] >= 0 and fit_bounds['right'] <= 390, fit_bounds
    page.locator('#fitBtn').click()
    assert page.locator('#readerStage').evaluate("el => el.classList.contains('fit-width')")
    page.locator('#fitBtn').click()
    assert not page.locator('#readerStage').evaluate("el => el.classList.contains('fit-width')")
    page.locator('#zoomInBtn').click()
    assert page.locator('#zoomResetBtn').inner_text() == '125%'
    page.locator('#zoomResetBtn').click()
    assert page.locator('#zoomResetBtn').inner_text() == '100%'
    page.locator('#pageBrowserBtn').click()
    assert page.locator('#pageBrowserDialog').evaluate('(d)=>d.open')
    assert page.locator('#pageBrowserGrid .page-thumb').count() == 2
    page.locator('#pageBrowserDialog').evaluate('(d)=>d.close()')
    page.locator('#backBtn').click()
    page.wait_for_function("document.querySelector('#libraryView') && !document.querySelector('#libraryView').hidden")
    page.locator('#settingsBtn').click()
    assert page.locator('#settingsDialog').evaluate('(d)=>d.open')
    assert page.locator('#v3SettingsSection').count() == 1
    assert page.locator('#layoutSwitcher').count() == 1
    assert not page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not errors, errors
    browser.close()
print('runtime-smoke: PASS · Importar + CBZ + zoom + miniaturas + Ultimate UI + móvil')
