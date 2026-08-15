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
    xml='<?xml version="1.0"?><ComicInfo><Title>Ultimate Smoke</Title><Series>Serie QA</Series><Number>1</Number></ComicInfo>'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_STORED) as z:
        z.writestr('ComicInfo.xml',xml)
        for i in range(1,5): z.writestr(f'{i:03}.png',PNG)

with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
    cbz=Path(td)/'ultimate.cbz'; make_cbz(cbz)
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1024,'height':768})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(build_html(), wait_until='domcontentloaded')
    page.evaluate("""() => { const data=new Map(); const storage={getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear(),key:i=>[...data.keys()][i]??null}; Object.defineProperty(storage,'length',{get:()=>data.size}); Object.defineProperty(window,'localStorage',{value:storage,configurable:true}); }""")
    for rel in ['vendor/jszip.min.js','vendor/unrarit.classic.js','js/app.bundle.js','js/v3-enhancements.js']:
        page.add_script_tag(content=(ROOT/rel).read_text(encoding='utf-8'))
    assert page.locator('body').get_attribute('data-ultimate') == '3.0'
    with page.expect_file_chooser() as fc: page.locator('#importBtn').click()
    fc.value.set_files(str(cbz))
    page.wait_for_function("!document.querySelector('#readerView').hidden")
    page.wait_for_timeout(250)
    # Smart tablet: landscape -> double, but cover stays alone.
    assert page.locator('#smartModeBtn').get_attribute('aria-pressed') == 'true'
    assert page.locator('.mode-btn[data-mode=double]').get_attribute('aria-pressed') == 'true'
    assert page.locator('#pageCanvas img').count() == 1
    page.locator('#nextBtn').click()
    page.wait_for_timeout(100)
    assert page.locator('#pageCanvas img').count() == 2
    pages=page.locator('#pageCanvas img').evaluate_all("els=>els.map(e=>Number(e.dataset.page))")
    assert sorted(pages) == [1,2], pages
    # Portrait tablet -> single page automatically.
    page.set_viewport_size({'width':768,'height':1024})
    page.wait_for_timeout(300)
    assert page.locator('.mode-btn[data-mode=single]').get_attribute('aria-pressed') == 'true'
    # Back and library layouts stay within viewport.
    page.locator('#backBtn').click()
    page.locator('#layout-list').click(); assert page.locator('#libraryContent').get_attribute('data-layout') == 'list'
    page.locator('#layout-shelf').click(); assert page.locator('#libraryContent').get_attribute('data-layout') == 'shelf'
    page.locator('#layout-grid').click(); assert page.locator('#libraryContent').get_attribute('data-layout') == 'grid'
    # Manual reading status + filter.
    page.locator('.more-mini').first.click()
    assert page.locator('#metadataDialog').evaluate('(d)=>d.open')
    page.locator('#metaReadingStatus').select_option('abandoned')
    page.locator('#metadataDialog').evaluate('(d)=>d.close()')
    page.locator('#statusFilter').select_option('abandoned')
    page.wait_for_timeout(80)
    assert page.locator('.comic-card').count() == 1
    assert page.locator('.v3-status-badge').first.inner_text() == 'ABANDONADO'
    assert not page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not errors, errors
    browser.close()
print('ultimate-smoke: PASS · AUTO tablet + doble página física + layouts + responsive')
