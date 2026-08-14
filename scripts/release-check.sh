#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
EXPECTED_UNRAR='980c8c61186c66ceb29e82046c596d211762e8dd'

if [ ! -f vendor/unrarit.module.js ]; then
  printf '%s\n' 'RELEASE BLOCKED: falta vendor/unrarit.module.js.' >&2
  exit 2
fi

blob_sha() {
  size=$(wc -c < "$1" | tr -d ' ')
  if command -v sha1sum >/dev/null 2>&1; then
    { printf 'blob %s\000' "$size"; cat "$1"; } | sha1sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    { printf 'blob %s\000' "$size"; cat "$1"; } | shasum -a 1 | awk '{print $1}'
  else
    printf '%s\n' 'RELEASE BLOCKED: se necesita sha1sum o shasum.' >&2
    exit 2
  fi
}
ACTUAL_UNRAR=$(blob_sha vendor/unrarit.module.js)
if [ "$ACTUAL_UNRAR" != "$EXPECTED_UNRAR" ]; then
  printf 'RELEASE BLOCKED: vendor CBR no coincide. Esperado %s, recibido %s\n' "$EXPECTED_UNRAR" "$ACTUAL_UNRAR" >&2
  exit 2
fi

for file in js/*.js sw.js vendor/unrarit.module.js tests/*.mjs; do
  node --check "$file"
done
node tests/unit.test.mjs
node tests/cbz-smoke.mjs
node tests/cbr-smoke.mjs
python3 tests/static-check.py
python3 tests/contrast-check.py

printf 'CBR vendor: PASS · %s\n' "$ACTUAL_UNRAR"
printf '%s\n' 'RELEASE CHECK: PASS'
