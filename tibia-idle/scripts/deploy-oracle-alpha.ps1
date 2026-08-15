# deploy-oracle-alpha.ps1 — notifica manutenção 30s, espera, sync tar/scp, restart PM2.
# Uso (PowerShell):
#   .\scripts\deploy-oracle-alpha.ps1
#   .\scripts\deploy-oracle-alpha.ps1 -VmHost 204.216.132.197 -SkipCountdown
# Nunca use && neste script. Nunca use $pid (reservado).

param(
  [string]$VmHost = "204.216.132.197",
  [string]$SshKey = "$env:USERPROFILE\.ssh\oracle-global-idle",
  [string]$RemoteUser = "ubuntu",
  [string]$AppDir = "/opt/global-idle",
  [string]$LocalTibia = "",
  [int]$CountdownSec = 30,
  [switch]$SkipCountdown,
  [string]$MaintenanceToken = ""
)

$ErrorActionPreference = "Stop"

if (-not $LocalTibia) {
  $LocalTibia = Join-Path $PSScriptRoot "..\"
  $LocalTibia = (Resolve-Path $LocalTibia).Path
}

$tar = Join-Path $env:USERPROFILE "Desktop\_deploy-alpha.tar.gz"
$remoteTar = "/home/ubuntu/_deploy-alpha.tar.gz"
$sshTarget = "$RemoteUser@$VmHost"
$sshArgs = @("-i", $SshKey, "-o", "StrictHostKeyChecking=accept-new")

function Invoke-Remote([string]$RemoteCmd) {
  & ssh @sshArgs $sshTarget $RemoteCmd
  if ($LASTEXITCODE -ne 0) { throw "SSH failed ($LASTEXITCODE): $RemoteCmd" }
}

Write-Host "==> Local package: $LocalTibia"
if (-not (Test-Path (Join-Path $LocalTibia "server\server.js"))) {
  throw "server/server.js not found under $LocalTibia"
}

if (-not $SkipCountdown) {
  Write-Host "==> Schedule maintenance countdown ($CountdownSec s)"
  $tokenHdr = ""
  if ($MaintenanceToken) {
    $tokenHdr = " -H `"X-Maintenance-Token: $MaintenanceToken`""
  }
  $notifyCmd = "curl -sS -X POST http://127.0.0.1:3000/api/maintenance/schedule -H `"Content-Type: application/json`"$tokenHdr -d `"{\\`\"seconds\\`\":$CountdownSec}`" || true"
  try {
    Invoke-Remote $notifyCmd
  } catch {
    Write-Host "WARN: maintenance notify failed (continuing): $_"
  }
  Write-Host "==> Waiting $CountdownSec seconds for clients..."
  Start-Sleep -Seconds $CountdownSec
} else {
  Write-Host "==> SkipCountdown set — stopping without client warn"
}

Write-Host "==> Stop PM2 app"
Invoke-Remote "pm2 stop global-idle || true"

Write-Host "==> Pack tibia-idle (exclude node_modules, .env, data, wheel src)"
if (Test-Path $tar) { Remove-Item -Force $tar }
$tarArgs = @(
  "-czf", $tar,
  "--exclude=node_modules",
  "--exclude=server/node_modules",
  "--exclude=.env",
  "--exclude=server/.env",
  "--exclude=server/data",
  "--exclude=tools/_wheel_src",
  "-C", $LocalTibia,
  "."
)
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

Write-Host "==> SCP to VM"
& scp @sshArgs $tar "${sshTarget}:${remoteTar}"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

Write-Host "==> Extract on VM (preserve .env)"
$remoteExtract = @"
set -e
cp -a $AppDir/.env `$HOME/env.bak 2>/dev/null || true
cp -a $AppDir/server/.env `$HOME/env.server.bak 2>/dev/null || true
cd $AppDir
tar -xzf $remoteTar
if test -f `$HOME/env.bak; then cp -a `$HOME/env.bak $AppDir/.env; fi
if test -f `$HOME/env.server.bak; then cp -a `$HOME/env.server.bak $AppDir/server/.env; elif test -f $AppDir/.env; then cp -a $AppDir/.env $AppDir/server/.env; fi
chmod 600 $AppDir/.env $AppDir/server/.env 2>/dev/null || true
npm install --omit=dev
if test -f ecosystem.config.js; then pm2 start ecosystem.config.js || pm2 restart global-idle; else pm2 start server/server.js --name global-idle || pm2 restart global-idle; fi
pm2 save || true
sleep 2
curl -sS http://127.0.0.1:3000/api/health || curl -sS http://127.0.0.1/api/health || true
echo
rm -f $remoteTar
"@
Invoke-Remote $remoteExtract

Write-Host "==> Public health"
try {
  $health = Invoke-RestMethod -Uri "https://global-idle.com/api/health" -Method GET -TimeoutSec 20
  Write-Host ($health | ConvertTo-Json -Compress)
} catch {
  Write-Host "WARN: https://global-idle.com/api/health failed: $_"
}

Write-Host "Deploy done."
