# Archivos modificados en v3.1.0 frente a v3.0.0

## Producto/runtime

- `index.html` — versión visible/cache-busting y nombre Ultimate coherente.
- `css/app.css` — pan táctil con zoom y `prefers-reduced-motion`.
- `js/app.bundle.js` — `data-book-id` estable en tarjetas y versión del runtime.
- `js/app.js` — paridad de fuente modular con `data-book-id` y versión.
- `js/importers.js` — actualización coherente de cache-busting interno.
- `js/v3-enhancements.js` — normalización de datos Ultimate, asociación por ID, miniaturas acotadas, ARIA y versión 3.1.
- `sw.js` — caché/runtime v3.1.0.
- `package.json` — versión 3.1.0 y descripción Ultimate.

## QA

- `tests/e2e.py` — actualización de SW independiente de versiones hardcodeadas.
- `tests/runtime-smoke.py` — validación de runtime Ultimate 3.1.
- `tests/ultimate-smoke.py` — prueba de normalización de persistencia Ultimate además del flujo tablet/layout/status.
- `tests/static-check.py` — sincronización de versión package/SW/assets y detección de E2E 2.x hardcodeado.

## Documentación/evidencias

- `README.md` — versión, límites y comportamiento de miniaturas actualizados.
- `CHANGELOG.md` — nueva entrada 3.1.0 y corrección histórica de 2.4.0.
- `AUDIT_REPORT.md` — auditoría final completa en 14 apartados.
- `QA_STATUS.md` — separación explícita entre PASS y pruebas bloqueadas/no ejecutadas.
- `RELEASE_EVIDENCE.txt` — evidencia resumida de release.
- `MODIFIED_FILES.md` — este listado.
