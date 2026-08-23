[CmdletBinding()]
param(
  [string]$LocalDbRoot = 'C:\Users\Daniel\Desktop\ZELII\.local-db',
  [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'
$envRoot = Join-Path $LocalDbRoot 'postgres-env'
$dataDir = Join-Path $LocalDbRoot 'data'
$binDir = Join-Path $envRoot 'Library\bin'
$pgCtl = Join-Path $binDir 'pg_ctl.exe'
$pgIsReady = Join-Path $binDir 'pg_isready.exe'
$logFile = Join-Path $LocalDbRoot 'postgres.log'

if (-not (Test-Path -LiteralPath $pgCtl) -or -not (Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION'))) {
  throw 'PostgreSQL portátil não encontrado. Execute primeiro a instalação local documentada em packages/database/local-dev/README.md.'
}

& $pgIsReady -h 127.0.0.1 -p $Port *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL local já está ativo em 127.0.0.1:$Port." -ForegroundColor Green
  exit 0
}

& $pgCtl -D $dataDir -l $logFile -o "-h 127.0.0.1 -p $Port" -w start
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o PostgreSQL local.' }
Write-Host "PostgreSQL local iniciado em 127.0.0.1:$Port." -ForegroundColor Green
