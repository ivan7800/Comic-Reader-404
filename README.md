# Comic Reader 404 Ultimate · v3.1.0

PWA estática, privada y local-first para leer y organizar cómics propios en **CBZ/ZIP, CBR/RAR, PDF e imágenes**. Preparada para GitHub Pages y también funcional al abrir `index.html` directamente para las funciones que no requieren service worker.

## Novedades Ultimate 3.1

### Lector
- Zoom 75–400 % con botones `− / 100% / +`.
- Pinch-to-zoom táctil, doble toque/doble clic para 200 % ↔ 100 % y Ctrl+rueda en escritorio.
- Navegador visual de páginas con miniaturas lazy.
- 1P, 2P, Webtoon y manga RTL.
- **Modo AUTO tablet**: vertical → 1P; horizontal → 2P.
- Emparejado físico en doble página: la portada queda sola y después se muestran pares 2–3, 4–5…; RTL invierte el orden visual.
- Ajuste a pantalla o al ancho.
- Brillo del lector 70–130 % y fondo negro/gris/blanco.
- Precarga configurable de 1, 2 o 3 páginas.
- Preferencia de modo/zoom recordada por cómic.
- Marcadores, favoritos, fullscreen y progreso.

### Biblioteca
- Vistas **Cuadrícula / Lista / Estantería**.
- Series, estanterías, historial, favoritos y en lectura.
- Series colapsadas inicialmente para bibliotecas grandes; se pueden expandir por números.
- Estados de lectura: Sin empezar, Leyendo, Terminado y Abandonado.
- Filtro por estado.
- Búsqueda por título, serie, autor, editorial, género, tags, estantería y año.
- Estadísticas locales básicas en Ajustes.

### Importación y metadatos
- CBZ/ZIP mediante JSZip local.
- CBR/RAR mediante `unrarit` local vendorizado; sin CDN en producción.
- PDF mediante visor nativo del navegador.
- JPG/JPEG/PNG/WebP/AVIF/GIF.
- Importación múltiple, carpeta y drag & drop.
- `ComicInfo.xml`: título, serie, número, volumen, resumen, autores, editorial, género, año, idioma, tags, portada y RTL.
- Editor manual de metadatos.
- **Carpeta vinculada** opcional con File System Access API en Chrome/Edge de escritorio; la referencia se guarda en IndexedDB. En otros navegadores permanece disponible el selector normal de carpeta.

### Privacidad y PWA
- Sin cuentas, backend, anuncios ni telemetría.
- Los cómics se procesan localmente.
- PWA offline para el shell de la aplicación.
- Service worker limitado al prefijo `comic-reader-404-`, sin borrar cachés de otras apps del mismo dominio.
- `reset.html` permite desregistrar únicamente el SW y las cachés de Comic Reader 404 si una actualización antigua queda atascada.
- Backup JSON incluye biblioteca, progreso, marcadores, ajustes base y preferencias Ultimate 3.1. Los archivos de cómic no se incluyen.

## Estado de release

- `RELEASE_CHECK: PASS`.
- Smoke CBZ real: PASS.
- Smoke CBR/RAR4 real: PASS.
- Runtime móvil Chromium: PASS.
- Ultimate tablet: PASS.
- Integridad del motor CBR: Git blob SHA-1 `980c8c61186c66ceb29e82046c596d211762e8dd`.
- Contraste principal WCAG AA: PASS.
- Rutas relativas y subruta GitHub Pages: verificadas.

La matriz completa mantenida en `.github/workflows/quality.yml` incluye E2E, axe y Lighthouse. Las pruebas automatizadas de navegador no sustituyen una última comprobación en iPhone/iPad/Android físicos.

## Ejecutar localmente

### Opción recomendada

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080/`.

### Doble clic

Puedes abrir `index.html` directamente. El runtime clásico evita el problema de ES Modules bajo `file://`. Service worker, instalación PWA y File System Access pueden requerir HTTP/HTTPS según el navegador.

## Gate de release

Windows:

```bat
RELEASE_CHECK.bat
```

macOS/Linux:

```bash
./scripts/release-check.sh
```

Debe terminar en:

```text
RELEASE CHECK: PASS
```

Cuando Chromium + Playwright están disponibles, el gate ejecuta además `runtime-smoke.py` y `ultimate-smoke.py`.

## QA completa

Dependencias solo de desarrollo:

```bash
npm install --no-package-lock --no-audit --no-fund
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium webkit
```

Después:

```bash
./scripts/full-qa.sh
```

Windows:

```bat
FULL_QA.bat
```

La suite mantenida incluye perfiles Chromium desktop/Android y WebKit iPhone/iPad, axe y Lighthouse.

## GitHub Pages

1. Ejecuta `RELEASE_CHECK`.
2. Sube todo el contenido de esta carpeta a la raíz del repositorio.
3. GitHub → **Settings → Pages**.
4. **Deploy from a branch** → `main` → `/(root)`.
5. Comprueba que la Action **Quality Gate** termina verde.
6. Si vienes de una PWA antigua y notas assets obsoletos, abre `reset.html`, pulsa **Restablecer PWA** y vuelve a cargar.

Todas las rutas de runtime son relativas, por lo que funciona en una URL de proyecto como `https://usuario.github.io/Comic-Reader-404/`.

## Estructura principal

```text
index.html
reset.html
css/app.css
js/
  app.bundle.js        # runtime base clásico
  v3-enhancements.js   # funciones Ultimate 3.1
  app.js               # fuente modular mantenible
  importers.js
  metadata.js
  storage.js
  utils.js
vendor/
  jszip.min.js
  unrarit.classic.js
  unrarit.module.js
assets/icons/
manifest.webmanifest
sw.js
tests/
scripts/
.github/workflows/quality.yml
```

## Límites conocidos

- RAR cifrado y multivolumen: no compatibles.
- RAR sólido enorme: bloqueado preventivamente según tamaño y memoria estimada.
- PDF: se delega al visor nativo; el progreso interno por página no se integra en la biblioteca.
- File System Access: principalmente Chrome/Edge escritorio; existe fallback de importación normal.
- Miniaturas: el navegador visual mantiene una ventana de hasta 600 miniaturas alrededor de la página actual en cómics extremos.
- Webtoon de más de 1.500 páginas degrada de forma segura a 1P para proteger memoria.
- Ninguna emulación sustituye una última prueba manual en hardware físico.

## Licencias

Consulta `LICENSE` y `vendor/licenses/`. JSZip y `unrarit` conservan sus avisos de licencia.
