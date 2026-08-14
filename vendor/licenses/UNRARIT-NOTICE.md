# unrarit notice

Comic Reader 404 redistribuye **unrarit 0.0.6** para leer CBR/RAR localmente en el navegador.

- Proyecto upstream: `greggman/unrarit`.
- Archivo vendorizado: `vendor/unrarit.module.js` (copia de `dist/unrarit.module.min.js`).
- Git blob SHA-1 esperado: `980c8c61186c66ceb29e82046c596d211762e8dd`.
- Wrapper JavaScript: licencia MIT.
- El código UnRAR incorporado por upstream conserva los avisos/licencia que correspondan.

Los scripts `scripts/vendorize-unrar.*` sirven únicamente para refrescar/restaurar la copia fijada y rechazan cualquier contenido cuyo Git blob SHA-1 no coincida con el esperado. El motor ya forma parte del repositorio y no requiere CDN en producción.
