$ErrorActionPreference = 'Stop'
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location (Split-Path $PSScriptRoot -Parent)
npm.cmd run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run tauri -- build --no-bundle
exit $LASTEXITCODE
