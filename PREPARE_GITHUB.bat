@echo off
setlocal
cd /d "%~dp0"
echo Comic Reader 404 - Verificar/restaurar motor CBR local
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\vendorize-unrar.ps1"
if errorlevel 1 (
  echo ERROR: no se pudo restaurar una copia verificada del motor CBR.
  exit /b 1
)
echo.
echo Motor CBR restaurado y verificado. No es un paso obligatorio si RELEASE_CHECK ya pasa.
endlocal
