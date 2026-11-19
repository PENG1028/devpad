param([Parameter(Mandatory=$true)][string]$TargetExe,[string[]]$SearchRoots,[string]$BackupRoot)
$ErrorActionPreference='Stop'
$target=(Resolve-Path -LiteralPath $TargetExe).Path
if ([IO.Path]::GetFileName($target) -ine 'devpad.exe') { throw 'Expected installed devpad.exe' }
if (!$SearchRoots) {
 $SearchRoots=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('Startup'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned'))
}
if (!$BackupRoot) { $BackupRoot=Join-Path $env:APPDATA 'local.devpad.desktop\shortcut-backups' }
function Test-PreviousDevPad([string] $exe) {
 if (!$exe -or $exe -ieq $target) { return $false }
 $name=[IO.Path]::GetFileName($exe)
 if ($name -match '^DevPad-\d+\.\d+(?:[.\w-]+)?\.exe$') { return $true }
 return $name -ieq 'devpad.exe' -and [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($exe)) -ieq 'DevPad'
}
$shell=New-Object -ComObject WScript.Shell
foreach ($root in $SearchRoots) {
 if (!(Test-Path -LiteralPath $root)) { continue }
 foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue) {
  $link=$shell.CreateShortcut($file.FullName)
  if (!(Test-PreviousDevPad $link.TargetPath)) { continue }
  $backup=Join-Path $BackupRoot ([Guid]::NewGuid().ToString()+'-'+$file.Name)
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $backup
  $link.TargetPath=$target
  $link.WorkingDirectory=[IO.Path]::GetDirectoryName($target)
  $link.IconLocation=$target+',0'
  $link.Save()
 }
}
# Preserve an existing enabled login entry when moving away from a versioned EXE.
if (!$PSBoundParameters.ContainsKey('SearchRoots')) {
 $run='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
 $value=(Get-ItemProperty -LiteralPath $run -Name DevPad -ErrorAction SilentlyContinue).DevPad
 if ($value -match '^"([^"]+)"\s+--autostart\s*$' -and (Test-PreviousDevPad $Matches[1])) { Set-ItemProperty -LiteralPath $run -Name DevPad -Value ('"'+$target+'" --autostart') }
}
