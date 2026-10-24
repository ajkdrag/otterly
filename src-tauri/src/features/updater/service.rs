use std::path::Path;

// The Windows portable zip ships a portable.txt next to otterly.exe. The
// installers do not. Sadly nothing else tells the two apart: it is the same
// binary.
const PORTABLE_MARKER_FILE_NAME: &str = "portable.txt";

// The updater plugin downloads the NSIS setup and runs it. For a portable copy
// that would install Otterly and leave the portable folder behind, so the
// frontend skips updating when this is true.
#[tauri::command]
pub fn is_portable_install() -> bool {
    cfg!(windows)
        && std::env::current_exe()
            .ok()
            .is_some_and(|exe_path| has_portable_marker(&exe_path))
}

pub fn has_portable_marker(exe_path: &Path) -> bool {
    exe_path
        .parent()
        .is_some_and(|exe_dir| exe_dir.join(PORTABLE_MARKER_FILE_NAME).is_file())
}
