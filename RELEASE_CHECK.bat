@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "EXPECTED_UNRAR=980c8c61186c66ceb29e82046c596d211762e8dd"
if not exist "vendor\unrarit.module.js" (
  echo RELEASE BLOCKED: falta vendor\unrarit.module.js.
  exit /b 2
)
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "$p='vendor\unrarit.module.js';$b=[IO.File]::ReadAllBytes($p);$h=[Text.Encoding]::ASCII.GetBytes(('blob '+$b.Length+[char]0));$all=New-Object byte[] ($h.Length+$b.Length);[Array]::Copy($h,0,$all,0,$h.Length);[Array]::Copy($b,0,$all,$h.Length,$b.Length);$s=[Security.Cryptography.SHA1]::Create();try{([BitConverter]::ToString($s.ComputeHash($all))).Replace('-','').ToLowerInvariant()}finally{$s.Dispose()}"`) do set "ACTUAL_UNRAR=%%H"
if /I not "!ACTUAL_UNRAR!"=="%EXPECTED_UNRAR%" (
  echo RELEASE BLOCKED: integridad del motor CBR incorrecta.
  exit /b 2
)
for %%F in (js\*.js sw.js vendor\unrarit.module.js tests\*.mjs) do (
  node --check "%%F" || exit /b 1
)
node tests\unit.test.mjs || exit /b 1
node tests\cbz-smoke.mjs || exit /b 1
node tests\cbr-smoke.mjs || exit /b 1
py -3 tests\static-check.py || exit /b 1
py -3 tests\contrast-check.py || exit /b 1
echo CBR vendor: PASS · !ACTUAL_UNRAR!
echo RELEASE CHECK: PASS
endlocal
