# Comic Reader 404 — QA Status v2.5.0

## Estado

- `RELEASE_CHECK`: PASS
- Runtime clásico (`app.bundle.js`): PASS de sintaxis
- Motor CBR clásico vendorizado: PASS de sintaxis
- CBR vendor original: hash Git verificado `980c8c61186c66ceb29e82046c596d211762e8dd`
- CBZ smoke: PASS
- CBR smoke: PASS
- Runtime smoke en Chromium: PASS
  - arranque `data-runtime=ready`
  - botón Importar abre FileChooser
  - CBZ real se importa
  - lector abre
  - vuelta a biblioteca
  - Ajustes abre
  - sin errores de consola
  - sin overflow horizontal a 390×844

## Causa raíz corregida

La v2.3 cargaba la lógica principal con `type="module"` y imports ES. En ejecución `file://` esos imports pueden bloquearse por las políticas de origen del navegador, dejando el HTML visible pero sin registrar eventos: todos los botones parecen muertos. La v2.4 usa runtime clásico empaquetado para evitar esta dependencia.

## Recuperación PWA

`reset.html` permite eliminar exclusivamente service workers y cachés `comic-reader-404-*` sin borrar `localStorage`.

## Limitación de prueba

El entorno de QA bloquea navegación directa a `file://` y localhost con `ERR_BLOCKED_BY_ADMINISTRATOR`, por lo que el flujo del runtime se ejecutó en Chromium mediante `set_content` con los mismos HTML/CSS/JS y un shim de Storage para el origen opaco. La compatibilidad estructural `file://` se basa además en no usar ya módulos ES ni `import()` para el runtime principal/CBR.

## v2.5.0 — Reader Fit Fix
- PASS: modo pantalla escala la página para ocupar >=95% del área del lector en smoke móvil.
- PASS: cambio Pantalla ↔ Ancho.
- PASS: barra móvil en dos filas; 1P/2P/Webtoon/RTL/Ajuste visibles.
- PASS: RELEASE CHECK completo.
