$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "vendor\unrarit.module.js"
$tmp = "$dest.tmp"
$expected = "980c8c61186c66ceb29e82046c596d211762e8dd"
$urls = @(
  "https://raw.githubusercontent.com/greggman/unrarit/59ceb8d7d37b9b6e50bf05d9d2c42cd3bf98da5a/dist/unrarit.module.min.js",
  "https://unpkg.com/unrarit@0.0.6/dist/unrarit.module.min.js"
)

function Get-GitBlobSha1([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $header = [System.Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)`0")
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  try {
    $buffer = New-Object byte[] ($header.Length + $bytes.Length)
    [Array]::Copy($header, 0, $buffer, 0, $header.Length)
    [Array]::Copy($bytes, 0, $buffer, $header.Length, $bytes.Length)
    return ([BitConverter]::ToString($sha1.ComputeHash($buffer))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha1.Dispose()
  }
}

Write-Host "Preparando motor CBR local unrarit 0.0.6..."
$verified = $false
try {
  foreach ($url in $urls) {
    try {
      Write-Host "Descargando $url"
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
      $actual = Get-GitBlobSha1 $tmp
      if ($actual -ne $expected) {
        Remove-Item -Force -ErrorAction SilentlyContinue $tmp
        throw "Integridad incorrecta: esperado $expected, recibido $actual"
      }
      $verified = $true
      break
    } catch {
      Write-Warning $_.Exception.Message
    }
  }
  if (-not $verified) { throw "No se pudo obtener una copia verificada de unrarit 0.0.6." }
  Move-Item -Force $tmp $dest
  Write-Host "OK: $dest"
  Write-Host "Git blob SHA-1 verificado: $expected"
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $tmp
}
