$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $appDir ".runtime"
$nodeDir = Join-Path $runtimeDir "node"
$nodeExe = Join-Path $nodeDir "node.exe"

if (Test-Path $nodeExe) {
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$indexUrl = "https://nodejs.org/dist/index.json"
$versions = Invoke-RestMethod -Uri $indexUrl -UseBasicParsing
$release = $versions |
  Where-Object { $_.lts -and ($_.files -contains "win-x64-zip") } |
  Select-Object -First 1

if (-not $release) {
  throw "Could not find a Windows x64 LTS Node.js release."
}

$version = $release.version
$zipName = "node-$version-win-x64.zip"
$zipUrl = "https://nodejs.org/dist/$version/$zipName"
$zipPath = Join-Path $runtimeDir $zipName
$extractDir = Join-Path $runtimeDir "extract"

if (Test-Path $extractDir) {
  Remove-Item -Recurse -Force $extractDir
}

Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$extractedNode = Get-ChildItem -Path $extractDir -Directory -Filter "node-*-win-x64" | Select-Object -First 1
if (-not $extractedNode) {
  throw "Downloaded Node.js archive did not contain the expected folder."
}

if (Test-Path $nodeDir) {
  Remove-Item -Recurse -Force $nodeDir
}

Move-Item -Path $extractedNode.FullName -Destination $nodeDir
Remove-Item -Force $zipPath
Remove-Item -Recurse -Force $extractDir

if (-not (Test-Path $nodeExe)) {
  throw "Node.js setup failed."
}

Write-Host "Node.js is ready: $nodeExe"
