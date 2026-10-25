; Otterly's NSIS hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; Tauri's file association code (FileAssociation.nsh) points .md at our ProgID
; and keeps the old default in "<ProgID>_backup". Uninstall writes that backup
; back. Three things go wrong with it as is:
;
;   - A reinstall or update backs up our own ProgID, so the user's original
;     .md handler is lost and uninstall points .md at a deleted ProgID.
;   - If the user moved .md to another app later, uninstall overwrites that.
;   - Uninstall leaves the backup value and an empty default behind.
;
; Up to 0.6.0 the ProgID was the generic "Markdown", which another editor can
; own too, and uninstall deletes the ProgID key outright. It is now
; "Otterly.Markdown" (fileAssociations name in tauri.windows.conf.json). The
; old one is removed only when its open command runs an otterly.exe.
;
; Install: PREINSTALL only reads and remembers the user's real handler, so an
; aborted install changes nothing. POSTINSTALL runs after APP_ASSOCIATE and
; writes that handler into the backup. Uninstall: PREUNINSTALL keeps a handler
; the user picked later, POSTUNINSTALL tidies up once .md no longer points at
; us.
;
; SHCTX is HKCU for our per-user install. The hooks save and restore the $R
; registers they use. Keep OTTERLY_FOR_EACH_EXTENSION in step with
; fileAssociations.ext.

!define OTTERLY_PROGID "Otterly.Markdown"
!define OTTERLY_OLD_PROGID "Markdown"

; The user's handler for each extension, found in PREINSTALL, written in
; POSTINSTALL. Empty means none.
Var OtterlyOriginal_md
Var OtterlyOriginal_markdown
; 1 when the old "Markdown" ProgID is ours to remove.
Var OtterlyOwnsOldProgId

!macro OTTERLY_FOR_EACH_EXTENSION MACRO
  !insertmacro ${MACRO} "md"
  !insertmacro ${MACRO} "markdown"
!macroend

!macro OTTERLY_SAVE_REGISTERS
  Push $R0
  Push $R1
  Push $R2
  Push $R3
!macroend

!macro OTTERLY_RESTORE_REGISTERS
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; Sets OtterlyOwnsOldProgId. The old ProgID is ours when its open command
; ends in \otterly.exe" "%1", wherever that install lived.
!macro OTTERLY_CHECK_OLD_PROGID
  StrCpy $OtterlyOwnsOldProgId 0
  ReadRegStr $R0 SHCTX "Software\Classes\${OTTERLY_OLD_PROGID}\shell\open\command" ""
  StrCpy $R1 '\${MAINBINARYNAME}.exe" "%1"'
  StrLen $R2 $R1
  IntOp $R2 0 - $R2
  StrCpy $R3 $R0 "" $R2
  ${If} $R0 != ""
  ${AndIf} $R3 == $R1
    StrCpy $OtterlyOwnsOldProgId 1
  ${EndIf}
!macroend

; The handler .ext had before any Otterly install: the current default, or
; the backup when the default is one of ours.
!macro OTTERLY_FIND_ORIGINAL EXT
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 == "${OTTERLY_PROGID}"
    ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "${OTTERLY_PROGID}_backup"
  ${ElseIf} $R0 == "${OTTERLY_OLD_PROGID}"
  ${AndIf} $OtterlyOwnsOldProgId == 1
    ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "${OTTERLY_OLD_PROGID}_backup"
  ${EndIf}
  ; A backup can point at ourselves after a reinstall. That is no handler.
  ${If} $R0 == "${OTTERLY_PROGID}"
    StrCpy $R0 ""
  ${ElseIf} $R0 == "${OTTERLY_OLD_PROGID}"
  ${AndIf} $OtterlyOwnsOldProgId == 1
    StrCpy $R0 ""
  ${EndIf}
  StrCpy $OtterlyOriginal_${EXT} $R0
!macroend

!macro OTTERLY_WRITE_ORIGINAL EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "${OTTERLY_PROGID}_backup" "$OtterlyOriginal_${EXT}"
  ${If} $OtterlyOwnsOldProgId == 1
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${OTTERLY_OLD_PROGID}_backup"
  ${EndIf}
!macroend

; Before APP_UNASSOCIATE: if .ext no longer points at us, the user chose
; another app. Make the restore write that choice back instead of ours.
!macro OTTERLY_KEEP_USER_CHOICE EXT
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 != "${OTTERLY_PROGID}"
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "${OTTERLY_PROGID}_backup" "$R0"
  ${EndIf}
!macroend

; After APP_UNASSOCIATE. When .ext still points at us the association was not
; removed, so the backup has to stay. Belt and braces with the $UpdateMode
; check below.
!macro OTTERLY_CLEAN_EXTENSION EXT
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 != "${OTTERLY_PROGID}"
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${OTTERLY_PROGID}_backup"
    ; An empty default is not "no handler" to every program.
    ${If} $R0 == ""
      DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
    ${EndIf}
    DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro OTTERLY_SAVE_REGISTERS
  !insertmacro OTTERLY_CHECK_OLD_PROGID
  !insertmacro OTTERLY_FOR_EACH_EXTENSION OTTERLY_FIND_ORIGINAL
  !insertmacro OTTERLY_RESTORE_REGISTERS
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro OTTERLY_FOR_EACH_EXTENSION OTTERLY_WRITE_ORIGINAL
  ${If} $OtterlyOwnsOldProgId == 1
    DeleteRegKey SHCTX "Software\Classes\${OTTERLY_OLD_PROGID}"
  ${EndIf}
!macroend

; An uninstall run by an update (/UPDATE, $UpdateMode = 1 in the template)
; keeps the association and the install, so the uninstall hooks only act on a
; real uninstall.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro OTTERLY_SAVE_REGISTERS
    !insertmacro OTTERLY_FOR_EACH_EXTENSION OTTERLY_KEEP_USER_CHOICE
    !insertmacro OTTERLY_RESTORE_REGISTERS
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro OTTERLY_SAVE_REGISTERS
    !insertmacro OTTERLY_FOR_EACH_EXTENSION OTTERLY_CLEAN_EXTENSION
    !insertmacro OTTERLY_RESTORE_REGISTERS
    ; The template removes the install folder key only with "delete the
    ; application data" ticked. Left behind, the MSI reads it and offers to
    ; install for all users into this user's AppData\Local\otterly.
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "Software\${MANUFACTURER}"
  ${EndIf}
!macroend
