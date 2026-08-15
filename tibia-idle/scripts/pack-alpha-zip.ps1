# Gera ZIP implantavel do Global-Idle para SaveInCloud/Jelastic.
# Uso:
#   powershell -File tibia-idle\scripts\pack-alpha-zip.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tibiaIdle = Resolve-Path (Join-Path $scriptDir "..")
$distDir = Join-Path $tibiaIdle "dist"
$stageDir = Join-Path $distDir "stage"
$zipPath = Join-Path $distDir "global-idle-alpha.zip"

function Add-DirectoryToZip {
  param(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$SourceDir,
    [string]$EntryPrefix
  )
  $SourceDir = (Resolve-Path $SourceDir).Path
  Get-ChildItem -Path $SourceDir -Recurse -File -Force | ForEach-Object {
    $relative = $_.FullName.Substring($SourceDir.Length).TrimStart("\", "/")
    $entryName = if ($EntryPrefix) { "$EntryPrefix/$relative" } else { $relative }
    $entryName = $entryName -replace "\\", "/"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $Archive, $_.FullName, $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}

if (Test-Path $stageDir) {
  Remove-Item -Recurse -Force $stageDir
}
New-Item -ItemType Directory -Path $stageDir | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

Copy-Item (Join-Path $tibiaIdle "package.json") (Join-Path $stageDir "package.json")
Copy-Item (Join-Path $tibiaIdle "Procfile") (Join-Path $stageDir "Procfile")

$serverSrc = Join-Path $tibiaIdle "server"
$serverDst = Join-Path $stageDir "server"
New-Item -ItemType Directory -Path $serverDst | Out-Null

Get-ChildItem -Path $serverSrc -Force | ForEach-Object {
  $name = $_.Name
  if ($name -eq "node_modules" -or $name -eq "data" -or $name -eq ".env") {
    return
  }
  Copy-Item -Path $_.FullName -Destination (Join-Path $serverDst $name) -Recurse -Force
}

$gameSrc = Join-Path $tibiaIdle "game"
if (-not (Test-Path $gameSrc)) {
  throw "Pasta game nao encontrada: $gameSrc"
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Write-Host "Compactando (~132 MB de assets)..."
$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $archive, (Join-Path $stageDir "package.json"), "package.json",
    [System.IO.Compression.CompressionLevel]::Optimal
  ) | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $archive, (Join-Path $stageDir "Procfile"), "Procfile",
    [System.IO.Compression.CompressionLevel]::Optimal
  ) | Out-Null
  Add-DirectoryToZip -Archive $archive -SourceDir $serverDst -EntryPrefix "server"
  Add-DirectoryToZip -Archive $archive -SourceDir $gameSrc -EntryPrefix "game"
}
finally {
  $archive.Dispose()
}

Remove-Item -Recurse -Force $stageDir

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "ZIP gerado ($mb MB):"
Write-Host $zipPath
Write-Host "Raiz do ZIP = ROOT do SaveInCloud: package.json, Procfile, server/, game/"
