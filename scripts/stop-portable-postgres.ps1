[CmdletBinding()]
param(
  [string]$LocalDbRoot = 'C:\Users\Daniel\Desktop\ZELII\.local-db'
)

$ErrorActionPreference = 'Stop'
$pgCtl = Join-Path $LocalDbRoot 'postgres-env\Library\bin\pg_ctl.exe'
$dataDir = Join-Path $LocalDbRoot 'data'

if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw 'PostgreSQL portátil não encontrado.'
}

& $pgCtl -D $dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'PostgreSQL local já está parado.' -ForegroundColor Yellow
  exit 0
}

& $pgCtl -D $dataDir -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível parar o PostgreSQL local.' }
Write-Host 'PostgreSQL local parado.' -ForegroundColor Green
