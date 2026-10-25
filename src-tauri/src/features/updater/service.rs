use crate::shared::portable::portable_data_dir;

// The updater plugin downloads an installer and runs it. For a portable copy
// that would install Otterly and leave the portable folder behind, so the
// frontend skips updating when this is true.
#[tauri::command]
pub fn is_portable_install() -> bool {
    portable_data_dir().is_some()
}
