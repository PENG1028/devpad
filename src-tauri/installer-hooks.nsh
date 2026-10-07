!macro NSIS_HOOK_POSTINSTALL
  ; Fixed installation path keeps future shortcuts and taskbar targets stable.
  ; Legacy shortcut backups are kept in the existing per-user data directory.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\migrate-shortcuts.ps1" -TargetExe "$INSTDIR\devpad.exe"'
!macroend
