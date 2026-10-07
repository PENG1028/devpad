$ErrorActionPreference='Stop'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('devpad-shortcut-test-'+[Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
 $target=Join-Path $testRoot 'devpad.exe';Set-Content -LiteralPath $target -Value 'fixture'
 $links=Join-Path $testRoot 'links';New-Item -ItemType Directory -Path $links | Out-Null
 $shell=New-Object -ComObject WScript.Shell
 $legacy=$shell.CreateShortcut((Join-Path $links 'DevPad.lnk'));$legacy.TargetPath=Join-Path $testRoot 'DevPad-0.6.5.exe';$legacy.Arguments='--autostart';$legacy.Save()
 $other=$shell.CreateShortcut((Join-Path $links 'Other.lnk'));$other.TargetPath=Join-Path $testRoot 'Other-0.6.5.exe';$other.Save()
 $backup=Join-Path $testRoot 'backups'
 & "$PSScriptRoot/../scripts/migrate-shortcuts.ps1" -TargetExe $target -SearchRoots @($links) -BackupRoot $backup
 & "$PSScriptRoot/../scripts/migrate-shortcuts.ps1" -TargetExe $target -SearchRoots @($links) -BackupRoot $backup
 $actual=$shell.CreateShortcut((Join-Path $links 'DevPad.lnk'))
 if ($actual.TargetPath -ne $target -or $actual.Arguments -ne '--autostart') { throw 'Legacy shortcut or arguments were not preserved' }
 if ($shell.CreateShortcut((Join-Path $links 'Other.lnk')).TargetPath -notlike '*Other-0.6.5.exe') { throw 'Unrelated shortcut changed' }
 if (@(Get-ChildItem -LiteralPath $backup -File).Count -ne 1) { throw 'Migration is not idempotent' }
 Write-Output 'PASS isolated shortcut migration: target, arguments, unrelated links, backups, repeat update'
}finally {
 $resolved=(Resolve-Path -LiteralPath $testRoot).Path
 $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if (!$resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'devpad-shortcut-test-*') { throw 'Unsafe test cleanup path' }
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
