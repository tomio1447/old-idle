# Sobe o Global-Idle local com MySQL (XAMPP MariaDB) na porta 8001.
# Uso:
#   powershell -ExecutionPolicy Bypass -File tibia-idle\scripts\start-local-mysql.ps1
#   powershell -ExecutionPolicy Bypass -File tibia-idle\scripts\start-local-mysql.ps1 -SkipMysqlCheck
#   powershell -ExecutionPolicy Bypass -File tibia-idle\scripts\start-local-mysql.ps1 -KillExisting

param(
  [switch]$SkipMysqlCheck,
  [switch]$KillExisting
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tibiaIdle = Resolve-Path (Join-Path $scriptDir "..")
$serverDir = Join-Path $tibiaIdle "server"
$envFile = Join-Path $serverDir ".env"
$port = 8001
$mysqlBin = "C:\xampp\mysql\bin\mysql.exe"
$mysqlStart = "C:\xampp\mysql_start.bat"

function Write-Step([string]$msg) {
  Write-Host "[local-mysql] $msg"
}

if (-not (Test-Path $serverDir)) {
  throw "Pasta server nao encontrada: $serverDir"
}

# Carrega .env se existir (nao sobrescreve variaveis ja definidas no shell)
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if ($key -match '^[A-Za-z_][A-Za-z0-9_]*$' -and -not (Test-Path "Env:$key")) {
      Set-Item -Path "Env:$key" -Value $val
    }
  }
  Write-Step "carregou $envFile"
} else {
  Write-Step "AVISO: $envFile ausente - usando defaults do script"
}

# Defaults locais (MySQL via XAMPP)
if (-not $env:PORT) { $env:PORT = "$port" } else { $port = [int]$env:PORT }
if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:TEST_SERVER) { $env:TEST_SERVER = "1" }
if (-not $env:MYSQL_HOST) { $env:MYSQL_HOST = "127.0.0.1" }
if (-not $env:MYSQL_PORT) { $env:MYSQL_PORT = "3306" }
if (-not $env:MYSQL_USER) { $env:MYSQL_USER = "root" }
if (-not $env:MYSQL_PASS) { $env:MYSQL_PASS = "admin" }
if (-not $env:MYSQL_DB) { $env:MYSQL_DB = "global_idle" }

if (-not $SkipMysqlCheck) {
  $listening = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    if (Test-Path $mysqlStart) {
      Write-Step "MySQL 3306 parado - iniciando XAMPP MariaDB..."
      Start-Process -FilePath $mysqlStart -WindowStyle Minimized
      Start-Sleep -Seconds 3
    } else {
      throw "MySQL nao esta na 3306 e $mysqlStart nao existe. Suba o MariaDB no XAMPP."
    }
  }

  if (-not (Test-Path $mysqlBin)) {
    throw "mysql.exe nao encontrado em $mysqlBin"
  }

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $mysqlBin -u $env:MYSQL_USER "-p$($env:MYSQL_PASS)" -e "SELECT 1" 2>$null | Out-Null
  $mysqlOk = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prevEap
  if (-not $mysqlOk) {
    throw "Falha ao conectar MySQL ($($env:MYSQL_USER)@$($env:MYSQL_HOST)). Confira senha no .env / XAMPP."
  }

  $createSql = "CREATE DATABASE IF NOT EXISTS $($env:MYSQL_DB) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  & $mysqlBin -u $env:MYSQL_USER "-p$($env:MYSQL_PASS)" -e $createSql 2>$null | Out-Null
  Write-Step "MySQL OK - DB $($env:MYSQL_DB)"
}

if ($KillExisting) {
  $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -and $_ -gt 0 })
  foreach ($procId in $owners) {
    Write-Step "encerrando PID $procId na porta $port"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  if ($owners.Count -gt 0) { Start-Sleep -Seconds 1 }
}

$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  throw "Porta $port ainda em uso (PID $($busy.OwningProcess)). Rode com -KillExisting ou liberte a porta."
}

Write-Step "subindo node em $serverDir (PORT=$port MYSQL_HOST=$($env:MYSQL_HOST))"
Set-Location $serverDir
node server.js
