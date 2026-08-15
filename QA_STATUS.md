# Comic Reader 404 Ultimate — QA Status v3.1.0

## Release local

**RELEASE CHECK: PASS**

### PASS ejecutado

- Sintaxis JS/service worker/tests JS.
- Unit tests.
- CBZ smoke real.
- CBR/RAR4 smoke real.
- Static/rutas/versiones/CSS variables.
- Contraste WCAG principal.
- Runtime smoke móvil: Importar, lector, fit, zoom, miniaturas y Ajustes.
- Ultimate smoke: persistencia inválida normalizada, AUTO tablet, spread físico, layouts, estado/filtro y responsive.
- Integridad del motor CBR.
- CSS: 0 errores de parseo.
- Manifest JSON válido.
- Workflow YAML válido.
- Shell syntax PASS.
- Recursos críticos HTTP 200 en subruta.

### Bloqueado/no ejecutado aquí

- E2E HTTP completo: `ERR_BLOCKED_BY_ADMINISTRATOR` sobre localhost en este sandbox.
- axe y Lighthouse: instalación npm no completada dentro del límite temporal del entorno.
- Hardware físico iPhone/iPad/Android.

La Action `.github/workflows/quality.yml` mantiene las pruebas E2E Chromium/WebKit, PWA offline, actualización SW, axe y Lighthouse para ejecutarlas en GitHub.
