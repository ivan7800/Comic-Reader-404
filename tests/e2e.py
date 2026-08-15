#!/usr/bin/env python3
from __future__ import annotations
from playwright.sync_api import sync_playwright, Error as PlaywrightError
from browser_harness import staged_server, make_cbz, chromium_path, PROFILES

def assert_true(value, message):
    if not value: raise AssertionError(message)

def launch(p, engine):
    if engine == 'chromium':
        exe = chromium_path()
        kwargs = {'headless': True, 'args': ['--no-sandbox']}
        if exe: kwargs['executable_path'] = exe
        return p.chromium.launch(**kwargs)
    return p.webkit.launch(headless=True)

def run_profile(browser, base_url, fixture, name):
    context=browser.new_context(**PROFILES[name])
    page=context.new_page(); console=[]; page_errors=[]
    page.on('console',lambda msg: console.append((msg.type,msg.text)) if msg.type=='error' else None)
    page.on('pageerror',lambda exc: page_errors.append(str(exc)))
    response=page.goto(base_url, wait_until='domcontentloaded', timeout=20000)
    assert_true(response and response.ok, f'{name}: carga HTTP fallida')
    page.wait_for_selector('#libraryTitle')
    overflow=page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
    assert_true(not overflow, f'{name}: scroll horizontal inicial')
    picker_by_profile={'desktop':'#importBtn','android':'#heroImportBtn','iphone':'#emptyImportBtn','ipad':'#importBtn'}
    picker_selector=picker_by_profile.get(name,'#importBtn')
    with page.expect_file_chooser(timeout=5000) as chooser_info:
        page.locator(picker_selector).click()
    chooser_info.value.set_files(str(fixture))
    page.wait_for_function("!document.querySelector('#readerView').hidden", timeout=20000)
    page.wait_for_selector('#pageCanvas img.loaded', timeout=20000)
    assert_true(page.locator('#readerTitle').inner_text()=='QA Comic', f'{name}: ComicInfo no aplicado')
    page.locator('[data-mode="webtoon"]').click(); page.wait_for_timeout(250)
    overflow=page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
    assert_true(not overflow, f'{name}: scroll horizontal en lector')
    page.locator('#backBtn').click(); page.wait_for_function("!document.querySelector('#libraryView').hidden")
    assert_true(not page_errors, f'{name}: pageerror: {page_errors}')
    benign=[text for typ,text in console if 'favicon' not in text.lower()]
    assert_true(not benign, f'{name}: console errors: {benign}')
    context.close()

def test_offline(browser, base_url):
    context=browser.new_context(**PROFILES['desktop']); page=context.new_page(); page.goto(base_url, wait_until='load')
    page.evaluate("navigator.serviceWorker.ready.then(()=>true)"); page.wait_for_timeout(700)
    if not page.evaluate('Boolean(navigator.serviceWorker.controller)'):
        page.reload(wait_until='load'); page.wait_for_timeout(400)
    assert_true(page.evaluate('Boolean(navigator.serviceWorker.controller)'), 'PWA: no hay service worker controlador')
    context.set_offline(True); page.reload(wait_until='domcontentloaded', timeout=15000)
    assert_true(page.locator('#libraryTitle').is_visible(), 'PWA: la app no carga offline')
    context.set_offline(False); context.close()

def test_sw_update(browser, app_dir, base_url):
    context=browser.new_context(**PROFILES['desktop']); page=context.new_page(); page.goto(base_url, wait_until='load')
    page.evaluate("navigator.serviceWorker.ready.then(()=>true)"); page.wait_for_timeout(600)
    if not page.evaluate('Boolean(navigator.serviceWorker.controller)'): page.reload(wait_until='load')
    sw=app_dir/'sw.js'; original=sw.read_text()
    import re
    match=re.search(r"const VERSION = '([^']+)';", original)
    assert_true(match, 'SW update: no se pudo detectar VERSION')
    current_version=match.group(1); test_version=f'{current_version}-e2e'
    sw.write_text(original.replace(f"const VERSION = '{current_version}';", f"const VERSION = '{test_version}';", 1))
    try:
        page.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())")
        page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>Boolean(r.waiting))", timeout=15000)
        page.wait_for_function("!document.querySelector('#updateBanner').hidden", timeout=5000)
        page.locator('#updateNowBtn').click()
        page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>r.active && r.active.scriptURL.endsWith('/sw.js'))", timeout=15000)
        page.wait_for_timeout(600)
        keys=page.evaluate('caches.keys()')
        assert_true(any(f'v{test_version}' in k for k in keys), f'SW update: caché nueva no activa: {keys}')
        assert_true(not any(k.endswith(f'v{current_version}') for k in keys), f'SW update: caché antigua no eliminada: {keys}')
    finally:
        sw.write_text(original); context.close()

def main():
    try:
        with staged_server() as (app,url):
            fixture=make_cbz(app/'qa-fixture.cbz')
            with sync_playwright() as p:
                chromium=launch(p,'chromium')
                try:
                    run_profile(chromium,url,fixture,'desktop')
                    run_profile(chromium,url,fixture,'android')
                    test_offline(chromium,url); test_sw_update(chromium,app,url)
                finally:
                    chromium.close()
                webkit=launch(p,'webkit')
                try:
                    run_profile(webkit,url,fixture,'iphone')
                    run_profile(webkit,url,fixture,'ipad')
                finally:
                    webkit.close()
        print('e2e.py: PASS · botones Importar nativos + Chromium desktop/Android + WebKit iPhone/iPad + PWA offline + SW update')
        return 0
    except PlaywrightError as exc:
        text=str(exc)
        if 'ERR_BLOCKED_BY_ADMINISTRATOR' in text:
            print('E2E BLOCKED BY ENVIRONMENT POLICY:', exc); return 3
        if 'Executable doesn\'t exist' in text or 'playwright install' in text:
            print('E2E BLOCKED: faltan navegadores Playwright. Ejecuta: python -m playwright install chromium webkit'); return 2
        raise

if __name__=='__main__': raise SystemExit(main())
