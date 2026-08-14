#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DEST="$ROOT/vendor/unrarit.module.js"
TMP="$DEST.tmp"
EXPECTED='980c8c61186c66ceb29e82046c596d211762e8dd'
PINNED='https://raw.githubusercontent.com/greggman/unrarit/59ceb8d7d37b9b6e50bf05d9d2c42cd3bf98da5a/dist/unrarit.module.min.js'
FALLBACK='https://unpkg.com/unrarit@0.0.6/dist/unrarit.module.min.js'

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT INT TERM

blob_sha() {
  size=$(wc -c < "$1" | tr -d ' ')
  if command -v sha1sum >/dev/null 2>&1; then
    { printf 'blob %s\000' "$size"; cat "$1"; } | sha1sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    { printf 'blob %s\000' "$size"; cat "$1"; } | shasum -a 1 | awk '{print $1}'
  else
    printf '%s\n' 'ERROR: se necesita sha1sum o shasum para verificar el motor CBR.' >&2
    return 2
  fi
}

fetch_and_verify() {
  url=$1
  printf 'Descargando %s\n' "$url"
  curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error "$url" -o "$TMP"
  actual=$(blob_sha "$TMP")
  if [ "$actual" != "$EXPECTED" ]; then
    printf 'Integridad incorrecta: esperado %s, recibido %s\n' "$EXPECTED" "$actual" >&2
    rm -f "$TMP"
    return 1
  fi
}

printf '%s\n' 'Preparando motor CBR local unrarit 0.0.6...'
if ! fetch_and_verify "$PINNED"; then
  printf '%s\n' 'La fuente fijada falló; probando el paquete versionado de respaldo.' >&2
  fetch_and_verify "$FALLBACK"
fi
mv "$TMP" "$DEST"
trap - EXIT INT TERM
printf 'OK: %s\nGit blob SHA-1 verificado: %s\n' "$DEST" "$EXPECTED"
