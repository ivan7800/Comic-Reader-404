#!/usr/bin/env python3
from pathlib import Path
import re, sys

CSS=(Path(__file__).resolve().parents[1]/'css/app.css').read_text(encoding='utf-8')

def luminance(hex_value):
    value=hex_value.lstrip('#')
    if len(value)==3: value=''.join(c*2 for c in value)
    rgb=[int(value[i:i+2],16)/255 for i in (0,2,4)]
    def channel(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    r,g,b=map(channel,rgb)
    return .2126*r+.7152*g+.0722*b

def ratio(a,b):
    la,lb=luminance(a),luminance(b)
    return (max(la,lb)+.05)/(min(la,lb)+.05)

def vars_for(selector):
    if selector==':root': pat=r':root\{([^}]*)\}'
    else: pat=rf'\[data-theme="{re.escape(selector)}"\]\{{([^}}]*)\}}'
    m=re.search(pat,CSS)
    if not m: raise SystemExit(f'No se encontró tema {selector}')
    return dict(re.findall(r'--([\w-]+):(#[0-9a-fA-F]{3,8})',m.group(1)))

fail=[]
base=vars_for(':root')
for theme in [':root','oled','paper','retro','universe']:
    values={**base, **({} if theme==':root' else vars_for(theme))}
    name='noir' if theme==':root' else theme
    checks=[
      ('texto/fondo',values['text'],values['bg'],4.5),
      ('muted/surface',values['muted'],values['surface'],4.5),
      ('texto botón/acento',values['accent-ink'],values['accent'],4.5),
    ]
    for label,fg,bg,minimum in checks:
        r=ratio(fg,bg)
        print(f'{name:8} {label:20} {r:.2f}:1')
        if r < minimum: fail.append(f'{name} {label}: {r:.2f}')
if 'min-height:44px' not in CSS or 'width:44px' not in CSS:
    fail.append('No se encontró objetivo táctil principal de 44 px')
if fail:
    print('FAIL:', '; '.join(fail)); sys.exit(1)
print('contrast-check: PASS (pares principales >= 4.5:1)')
