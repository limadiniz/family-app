[CmdletBinding()]
param(
  [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$previousDatabaseUrl = $env:DATABASE_URL
$previousTestDatabaseUrl = $env:TEST_DATABASE_URL

try {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $env:TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$Port/zelii_test"
  Push-Location $projectRoot
  try {
    & npx --yes pnpm@10.28.0 --filter '@family-app/database' test
    if ($LASTEXITCODE -ne 0) { throw 'Os testes do banco local falharam.' }
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $previousDatabaseUrl }
  if ($null -eq $previousTestDatabaseUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:TEST_DATABASE_URL = $previousTestDatabaseUrl }
}
