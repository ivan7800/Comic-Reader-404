# Comic Reader 404 Ultimate — QA Status v3.0.0

## Estado

**RELEASE CHECK: PASS** en el entorno de construcción.

### Pruebas ejecutadas y superadas

- `node --check` sobre JS, service worker y tests JS.
- `tests/unit.test.mjs`.
- `tests/cbz-smoke.mjs`.
- `tests/cbr-smoke.mjs` con RAR4 real construido para QA.
- `tests/static-check.py`.
- `tests/contrast-check.py`.
- `tests/runtime-smoke.py`: Importar real, CBZ, lector, ajuste, zoom, miniaturas, Ajustes y viewport móvil.
- `tests/ultimate-smoke.py`: AUTO tablet, portada sola en 2P, pares físicos, cambio por orientación, layouts, estado manual, filtro y ausencia de overflow.
- Integridad exacta del vendor CBR.

### Funciones v3 cubiertas directamente

- Runtime Ultimate cargado.
- Botón Importar abre selector.
- CBZ abre en lector.
- Zoom 100 → 125 → 100.
- Diálogo de miniaturas.
- Controles móviles dentro del viewport.
- AUTO tablet 1024×768 → 2P.
- Portada sola; siguiente spread = páginas internas emparejadas.
- 768×1024 → 1P.
- Grid/List/Shelf.
- Estado Abandonado + filtro correspondiente.

### Mantenidas pero no ejecutadas completamente en este entorno

- axe-core completo.
- Lighthouse completo.
- WebKit iPhone/iPad del workflow.
- Prueba manual en iPhone/iPad/Android físicos.
- Instalación PWA física desde Safari/Chrome móvil.
- File System Access con una carpeta real del usuario.

Estas comprobaciones permanecen en la batería mantenida/CI cuando el entorno dispone de las herramientas necesarias.
