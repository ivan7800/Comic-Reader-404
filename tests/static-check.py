#!/usr/bin/env python3
from __future__ import annotations
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
warnings: list[str] = []

class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]; self.assets=[]; self.images=[]; self.labels_for=[]; self.controls=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        if tag in {'script','img'} and a.get('src'): self.assets.append(a['src'])
        if tag=='link' and a.get('href'): self.assets.append(a['href'])
        if tag=='img': self.images.append(a)
        if tag=='label' and a.get('for'): self.labels_for.append(a['for'])
        if tag in {'input','select','textarea'}: self.controls.append((tag,a))

html=(ROOT/'index.html').read_text(encoding='utf-8')
p=Parser(); p.feed(html)
for value,count in Counter(p.ids).items():
    if count>1: errors.append(f'ID duplicado: {value} ({count})')

for asset in p.assets:
    if asset.startswith(('http://','https://','data:','blob:','#')): continue
    path=(ROOT/asset.split('?',1)[0].split('#',1)[0]).resolve()
    if ROOT.resolve() not in path.parents and path!=ROOT.resolve():
        errors.append(f'Ruta escapa del proyecto: {asset}')
    elif not path.exists(): errors.append(f'Recurso HTML inexistente: {asset}')
    if asset.startswith('/'): errors.append(f'Ruta absoluta incompatible con subruta Pages: {asset}')

for img in p.images:
    if 'alt' not in img: errors.append(f'Imagen sin alt: {img.get("id") or img.get("src") or "dinámica"}')

idset=set(p.ids)

controls_by_id={a.get('id'): a for _,a in p.controls if a.get('id')}
for ident in ('fileInput','folderInput','backupInput'):
    control=controls_by_id.get(ident)
    if not control:
        errors.append(f'Falta selector nativo #{ident}')
        continue
    if 'hidden' in control:
        errors.append(f'#{ident} no debe usar hidden/display:none: reduce compatibilidad con Safari/iOS/PWA')
    classes=set((control.get('class') or '').split())
    if 'native-file-input' not in classes:
        errors.append(f'#{ident} debe usar native-file-input para ocultación compatible')

app_js=(ROOT/'js/app.js').read_text(encoding='utf-8')
if "typeof input.showPicker === 'function'" not in app_js or 'input.click()' not in app_js:
    errors.append('Flujo Importar no contiene showPicker + fallback click')
for js in (ROOT/'js').glob('*.js'):
    text=js.read_text(encoding='utf-8')
    for ident in re.findall(r"\$\(\s*['\"]#([A-Za-z][\w:-]*)['\"]\s*\)", text):
        if ident not in idset: errors.append(f'{js.name}: referencia a ID inexistente #{ident}')
    if re.search(r'\b(?:eval|document\.write|new\s+Function)\s*\(', text):
        errors.append(f'{js.name}: API dinámica peligrosa detectada')

manifest=json.loads((ROOT/'manifest.webmanifest').read_text(encoding='utf-8'))
for key in ('id','start_url','scope'):
    if str(manifest.get(key,'')).startswith('/'): errors.append(f'manifest {key} usa ruta absoluta')
for icon in manifest.get('icons',[]):
    if not (ROOT/icon['src']).exists(): errors.append(f'Icono manifest inexistente: {icon["src"]}')

css=(ROOT/'css/app.css').read_text(encoding='utf-8')
declared=set(re.findall(r'--([A-Za-z0-9_-]+)\s*:', css))
used=set(re.findall(r'var\(--([A-Za-z0-9_-]+)', css))
for name in sorted(used-declared):
    errors.append(f'CSS usa variable no declarada: --{name}')

sw=(ROOT/'sw.js').read_text(encoding='utf-8')
for asset in re.findall(r"'((?:\./)[^']+)'", sw):
    if asset == './': continue
    clean_asset=asset[2:].split('?',1)[0].split('#',1)[0]
    if not (ROOT/clean_asset).exists(): errors.append(f'Service worker referencia recurso inexistente: {asset}')
if "key.startsWith(CACHE_PREFIX)" not in sw:
    errors.append('Service worker no limita la limpieza de cachés a su propio prefijo')

if not (ROOT/'.nojekyll').exists(): errors.append('Falta .nojekyll')
if not (ROOT/'.gitignore').exists(): errors.append('Falta .gitignore')
if not (ROOT/'vendor/unrarit.module.js').exists():
    errors.append('CBR/RAR: falta vendor/unrarit.module.js; el paquete publicado debe ser autocontenido.')

print(f'static-check: {len(p.ids)} IDs únicos; {len(p.assets)} recursos HTML revisados')
for w in warnings: print('WARN:',w)
for e in errors: print('ERROR:',e)
if errors: sys.exit(1)
print('static-check: PASS')
