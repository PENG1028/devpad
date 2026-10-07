$ErrorActionPreference = 'Stop'
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location (Split-Path $PSScriptRoot -Parent)
npm.cmd run tauri -- dev
