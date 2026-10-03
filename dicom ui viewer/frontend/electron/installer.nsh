!macro customInstall
  SetShellVarContext all
  DetailPrint "Creating persistent clinical data directories in ProgramData for MerilView..."
  CreateDirectory "$APPDATA\MerilView"
  CreateDirectory "$APPDATA\MerilView\config"
  CreateDirectory "$APPDATA\MerilView\database"
  CreateDirectory "$APPDATA\MerilView\dicom"
  CreateDirectory "$APPDATA\MerilView\studies"
  CreateDirectory "$APPDATA\MerilView\exports"
  CreateDirectory "$APPDATA\MerilView\cache"
  CreateDirectory "$APPDATA\MerilView\logs"
  SetShellVarContext current
!macroend

!macro customUnInstall
  ; Preserve persistent clinical data, DICOM files, and database during uninstallation/update
  DetailPrint "Preserving MerilView patient studies and persistent databases in ProgramData."
!macroend
