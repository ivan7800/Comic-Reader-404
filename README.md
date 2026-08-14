# Comic Reader 404 Deluxe · v2.5.0

PWA estática, privada y local-first para leer y organizar cómics propios en **CBZ/ZIP, CBR/RAR, PDF e imágenes**. Está diseñada para GitHub Pages y no necesita backend, cuenta ni compilación.

## Estado de release

- **CBR vendorizado:** incluido en `vendor/unrarit.module.js`; no depende de CDN en producción.
- **Integridad CBR:** Git blob SHA-1 esperado `980c8c61186c66ceb29e82046c596d211762e8dd`.
- **Gate offline reproducible:** `RELEASE_CHECK.bat` / `./scripts/release-check.sh`.
- **QA completa mantenida:** Chromium desktop/Android + WebKit iPhone/iPad, PWA offline, actualización SW, axe WCAG 2.2 AA y Lighthouse.
- **GitHub Actions:** `.github/workflows/quality.yml` ejecuta la batería completa en cada push a `main` y pull request.

> La aplicación no sube el contenido del cómic. Los archivos se procesan en el navegador. La biblioteca persistente guarda metadatos, progreso, marcadores, preferencias y miniaturas reducidas; el archivo fuente debe volver a seleccionarse cuando el navegador no puede conservar una referencia al original.

## Funciones principales

- Biblioteca, series, estanterías, favoritos, historial y búsqueda.
- `ComicInfo.xml`: título, serie, número, volumen, autor, editorial, género, año, resumen y manga RTL.
- Página única, doble página, manga RTL y Webtoon.
- Marcadores por página, progreso, editor de metadatos y backup/restauración JSON.
- Importación múltiple y carpetas de imágenes. Selector nativo reforzado para Safari/iOS/PWA y arrastrar/soltar en escritorio.
- PWA instalable y shell offline.
- Cinco temas visuales.
- Límites defensivos frente a archivos desmesurados.
- RAR sólido con preflight y límite adaptado a memoria estimada.
- Webtoon con cache window y expulsión de Blob URLs; >1500 páginas degrada de forma segura a 1P.

## Ejecutar localmente

No hay instalación de runtime. Sirve la carpeta por HTTP:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080/`.

No uses `file://` para validar PWA/service worker.

## Gate de release

Windows:

```bat
RELEASE_CHECK.bat
```

macOS/Linux:

```bash
./scripts/release-check.sh
```

Debe terminar exactamente con:

```text
RELEASE CHECK: PASS
```

El gate comprueba sintaxis JS, suite unitaria, smoke CBZ, smoke CBR/RAR4 real, DOM/rutas/manifest/SW, selectores nativos de importación, variables CSS, contraste y el hash exacto del motor CBR.

`PREPARE_GITHUB.bat` y `scripts/vendorize-unrar.*` ya no son requisitos de publicación: sirven para **restaurar/refrescar** el vendor fijado si se pierde o se corrompe.

## QA completa

Herramientas de QA; no son dependencias de producción.

Requisitos:

- Node.js >= 22.19
- Python 3.13

Instalación:

```bash
npm install --no-package-lock --no-audit --no-fund
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium webkit
```

Ejecutar todo:

```bash
./scripts/full-qa.sh
```

En Windows:

```bat
FULL_QA.bat
```

Pruebas individuales:

```bash
npm run qa:e2e
npm run qa:axe
npm run qa:lighthouse
```

La matriz E2E usa Chromium para escritorio/Android y WebKit para los perfiles iPhone/iPad. Esto valida motores y viewports representativos, pero no sustituye una última prueba manual en hardware iOS/Android físico.

### Umbrales Lighthouse

- Performance >= 90
- Accessibility >= 95
- Best Practices >= 95
- SEO >= 90

### axe

Se ejecuta sobre biblioteca y lector, en los cuatro perfiles, con reglas WCAG 2.0 A/AA, 2.1 AA y 2.2 AA.

## GitHub Pages

1. Ejecuta `RELEASE_CHECK`.
2. Sube el contenido de esta carpeta a la raíz del repositorio.
3. GitHub → **Settings → Pages**.
4. **Deploy from a branch** → `main` → `/(root)`.
5. Guarda y espera el despliegue.
6. Comprueba la pestaña **Actions**: `Quality Gate` debe quedar verde.

Todas las rutas de runtime son relativas y el service worker trabaja dentro de su propio scope, por lo que la aplicación es compatible con URLs tipo `https://usuario.github.io/Comic-Reader-404/`.

## Estructura

```text
index.html
css/app.css
js/
  app.js
  importers.js
  metadata.js
  storage.js
  utils.js
vendor/
  jszip.min.js
  unrarit.module.js
assets/icons/
manifest.webmanifest
sw.js
tests/
scripts/
.github/workflows/quality.yml
```

## Seguridad y privacidad

- Sin backend ni cuentas.
- Sin secretos o tokens.
- CSP restrictiva.
- Sin `eval`, `document.write` ni `new Function` en la app.
- Metadatos insertados mediante APIs DOM seguras.
- Límites de tamaño/páginas/backup/metadatos.
- El SW solo elimina cachés con prefijo `comic-reader-404-` y usa cache-busting de assets de código para evitar servir JavaScript antiguo tras una actualización.
- El motor RAR está fijado y su contenido se verifica antes de release.

## Limitaciones conocidas

- RAR cifrado y multivolumen no compatible.
- RAR sólido enorme puede seguir siendo costoso; se bloquea preventivamente según tamaño/memoria estimada.
- PDF se delega al visor nativo del navegador, por lo que no se conoce el progreso interno por página.
- La automatización WebKit/Chromium no equivale a probar un iPhone/iPad/Android físico.

## Licencias

Consulta `LICENSE` y `vendor/licenses/`. JSZip y el wrapper `unrarit` conservan sus avisos correspondientes.


## Apertura local y GitHub Pages

- **GitHub Pages / HTTP(S):** PWA completa, service worker y offline.
- **Doble clic en `index.html` (`file://`):** biblioteca y lector funcionales sin servidor; el service worker no se registra porque los navegadores no permiten PWA sobre `file://`.

La v2.3 usaba ES Modules como runtime. En `file://`, esos imports pueden quedar bloqueados y la interfaz aparece sin eventos. v2.4 usa un runtime clásico empaquetado para eliminar esa causa.


### Si una versión antigua queda bloqueada

Abre `reset.html`, pulsa **Restablecer PWA** y vuelve a la aplicación. Esta operación elimina solo el service worker y las cachés `comic-reader-404-*`; no borra la biblioteca almacenada en `localStorage`.

### Ajuste de página
- **Pantalla** (predeterminado): amplía o reduce la página para ocupar al máximo el área útil, manteniendo la proporción.
- **Ancho**: usa todo el ancho disponible y permite desplazamiento vertical.
- En móvil, todos los controles de lectura se muestran en dos filas para evitar botones fuera de pantalla.
