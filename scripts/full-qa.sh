#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
./scripts/release-check.sh
if [ ! -d node_modules/axe-core ] || [ ! -x node_modules/.bin/lighthouse ]; then
  printf '%s\n' 'FULL QA BLOCKED: faltan dependencias de QA. Ejecuta: npm install --no-package-lock --no-audit --no-fund' >&2
  exit 2
fi
python3 tests/e2e.py
python3 tests/axe_audit.py
node tests/lighthouse.mjs
printf '%s\n' 'FULL QA: PASS'
