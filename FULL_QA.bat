@echo off
setlocal
cd /d "%~dp0"
call RELEASE_CHECK.bat
if errorlevel 1 exit /b 1
if not exist "node_modules\axe-core\axe.min.js" (
  echo FULL QA BLOCKED: faltan dependencias. Ejecuta npm install --no-package-lock --no-audit --no-fund
  exit /b 2
)
if not exist "node_modules\.bin\lighthouse.cmd" (
  echo FULL QA BLOCKED: falta Lighthouse. Ejecuta npm install --no-package-lock --no-audit --no-fund
  exit /b 2
)
py -3 tests\e2e.py
if errorlevel 1 exit /b 1
py -3 tests\axe_audit.py
if errorlevel 1 exit /b 1
node tests\lighthouse.mjs
if errorlevel 1 exit /b 1
echo FULL QA: PASS
endlocal
