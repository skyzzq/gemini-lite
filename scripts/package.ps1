# Windows 下等效的打包脚本：powershell -ExecutionPolicy Bypass -File scripts/package.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$manifest = Get-Content manifest.json -Raw | ConvertFrom-Json
$version  = $manifest.version
$out      = "dist/gemini-lite-$version.zip"

if (Test-Path dist) { Remove-Item dist -Recurse -Force }
New-Item -ItemType Directory dist | Out-Null

$files = @(
  'manifest.json', 'lite.js', 'export.js', 'bridge.js', 'popup.html', 'popup.js',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path (Get-Location) $out), 'Create')
try {
  foreach ($f in $files) {
    $entry = $f -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, (Join-Path (Get-Location) $f), $entry) | Out-Null
  }
} finally { $zip.Dispose() }

Write-Host "built $out"
Get-ChildItem dist
