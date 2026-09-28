use crate::features::notes::service::safe_vault_abs;
use crate::shared::storage;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

// We resolve vault paths here instead of calling the opener plugin from JS.
// The plugin's open_path needs a filesystem scope, and vaults can live
// anywhere. safe_vault_abs keeps both commands inside the vault.

#[tauri::command]
pub fn reveal_in_file_manager(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs(&root, &path)?;
    app.opener()
        .reveal_item_in_dir(abs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_default_app(app: AppHandle, vault_id: String, path: String) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs(&root, &path)?;
    app.opener()
        .open_path(abs.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
