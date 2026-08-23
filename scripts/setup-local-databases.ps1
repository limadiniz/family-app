[CmdletBinding()]
param(
  [string]$PostgresUser = 'postgres',
  [int[]]$CandidatePorts = @(5432, 5433),
  [switch]$SkipSeed,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$createdb = 'C:\Program Files\PostgreSQL\17\bin\createdb.exe'

if (-not (Test-Path -LiteralPath $psql) -or -not (Test-Path -LiteralPath $createdb)) {
  throw 'PostgreSQL 17 não foi encontrado em C:\Program Files\PostgreSQL\17.'
}

$securePassword = Read-Host 'Senha local do usuário postgres (não será salva)' -AsSecureString
$credential = [PSCredential]::new($PostgresUser, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password
$originalPgPassword = $env:PGPASSWORD
$originalDatabaseUrl = $env:DATABASE_URL
$originalTestDatabaseUrl = $env:TEST_DATABASE_URL
$originalAppEnv = $env:APP_ENV

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  Write-Host "`n==> $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com código $LASTEXITCODE."
  }
}

try {
  $env:PGPASSWORD = $plainPassword
  $postgresPort = $null
  foreach ($candidatePort in $CandidatePorts) {
    $serverVersion = & $psql -w -h localhost -p $candidatePort -U $PostgresUser -d postgres -tAc "select current_setting('server_version')" 2>$null
    if ($LASTEXITCODE -eq 0 -and "$serverVersion".Trim().StartsWith('17.')) {
      $postgresPort = $candidatePort
      break
    }
  }
  if (-not $postgresPort) {
    throw "Não foi possível autenticar no PostgreSQL 17 nas portas $($CandidatePorts -join ', '). Confira a senha e a porta."
  }
  Write-Host "PostgreSQL 17 detectado na porta $postgresPort." -ForegroundColor Green

  foreach ($databaseName in @('zelii_dev', 'zelii_test')) {
    $exists = & $psql -w -h localhost -p $postgresPort -U $PostgresUser -d postgres -tAc "select 1 from pg_database where datname = '$databaseName'"
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível consultar o banco $databaseName." }
    if ("$exists".Trim() -ne '1') {
      Invoke-Checked "Criando $databaseName" {
        & $createdb -w -h localhost -p $postgresPort -U $PostgresUser --encoding=UTF8 --template=template0 $databaseName
      }
    } else {
      Write-Host "$databaseName já existe; mantendo os dados atuais." -ForegroundColor Yellow
    }
  }

  $escapedPassword = [Uri]::EscapeDataString($plainPassword)
  $devUrl = "postgresql://${PostgresUser}:$escapedPassword@localhost:$postgresPort/zelii_dev"
  $testUrl = "postgresql://${PostgresUser}:$escapedPassword@localhost:$postgresPort/zelii_test"
  $env:APP_ENV = 'development'

  Push-Location $projectRoot
  try {
    $env:DATABASE_URL = $devUrl
    Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
    Invoke-Checked 'Aplicando migrations em zelii_dev' {
      & npx --yes pnpm@10.28.0 --filter '@family-app/database' migrate
    }
    if (-not $SkipSeed) {
      Invoke-Checked 'Carregando a Família Silva em zelii_dev' {
        & npx --yes pnpm@10.28.0 --filter '@family-app/database' seed
      }
    }

    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    $env:TEST_DATABASE_URL = $testUrl
    Invoke-Checked 'Aplicando migrations em zelii_test' {
      & npx --yes pnpm@10.28.0 --filter '@family-app/database' migrate
    }
    if (-not $SkipTests) {
      Invoke-Checked 'Executando testes RLS no PostgreSQL real' {
        & npx --yes pnpm@10.28.0 --filter '@family-app/database' test
      }
    }
  } finally {
    Pop-Location
  }

  Write-Host "`nAmbientes locais prontos:" -ForegroundColor Green
  Write-Host "- zelii_dev  (porta $postgresPort, migrations + seed)"
  Write-Host "- zelii_test (porta $postgresPort, migrations + testes RLS)"
  Write-Host 'A senha existiu apenas na memória deste processo.'
} finally {
  $plainPassword = $null
  $credential = $null
  $securePassword = $null
  if ($null -eq $originalPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $originalPgPassword }
  if ($null -eq $originalDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $originalDatabaseUrl }
  if ($null -eq $originalTestDatabaseUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:TEST_DATABASE_URL = $originalTestDatabaseUrl }
  if ($null -eq $originalAppEnv) { Remove-Item Env:APP_ENV -ErrorAction SilentlyContinue } else { $env:APP_ENV = $originalAppEnv }
}
