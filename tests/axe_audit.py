#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, Error as PlaywrightError
from browser_harness import staged_server, make_cbz, chromium_path, PROFILES

ROOT=Path(__file__).resolve().parents[1]
AXE=ROOT/'node_modules/axe-core/axe.min.js'

def run_axe(page,label):
    page.add_script_tag(path=str(AXE))
    result=page.evaluate("""async () => axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})""")
    if result['violations']:
        (ROOT/'.qa').mkdir(exist_ok=True); (ROOT/'.qa'/f'axe-{label}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        details='; '.join(f"{v['id']} ({v.get('impact')}): {v['help']}" for v in result['violations'])
        raise AssertionError(f'axe {label}: {details}')

def launch(p, engine):
    if engine=='chromium':
        kwargs={'headless':True,'args':['--no-sandbox']}; exe=chromium_path()
        if exe: kwargs['executable_path']=exe
        return p.chromium.launch(**kwargs)
    return p.webkit.launch(headless=True)

def main():
    if not AXE.exists():
        print('axe BLOCKED: ejecuta npm install --no-package-lock para disponer de axe-core.'); return 2
    try:
        with staged_server() as (app,url):
            fixture=make_cbz(app/'qa-fixture.cbz')
            with sync_playwright() as p:
                chromium=launch(p,'chromium'); webkit=launch(p,'webkit')
                try:
                    for label,browser in [('desktop',chromium),('android',chromium),('iphone',webkit),('ipad',webkit)]:
                        context=browser.new_context(**PROFILES[label]); page=context.new_page(); page.goto(url,wait_until='load')
                        run_axe(page,f'{label}-library')
                        page.locator('#fileInput').set_input_files(str(fixture)); page.wait_for_function("!document.querySelector('#readerView').hidden")
                        run_axe(page,f'{label}-reader'); context.close()
                finally:
                    webkit.close(); chromium.close()
        print('axe_audit.py: PASS · WCAG 2.2 AA · library + reader · Chromium/WebKit matrix'); return 0
    except PlaywrightError as exc:
        text=str(exc)
        if 'ERR_BLOCKED_BY_ADMINISTRATOR' in text:
            print('axe BLOCKED BY ENVIRONMENT POLICY:',exc); return 3
        if 'Executable doesn\'t exist' in text or 'playwright install' in text:
            print('axe BLOCKED: faltan navegadores Playwright.'); return 2
        raise

if __name__=='__main__': raise SystemExit(main())
