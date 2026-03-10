use crate::shared::constants;
use crate::shared::storage::vault_path;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const SESSIONS_DIR: &str = "sessions";
const LATEST_SESSION_FILE: &str = "latest.json";

fn latest_session_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let vault_root = vault_path(app, vault_id)?;
    let sessions_dir = vault_root.join(constants::APP_DIR).join(SESSIONS_DIR);
    std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    Ok(sessions_dir.join(LATEST_SESSION_FILE))
}

fn read_session_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_session_file(path: &Path, session: &Value) -> Result<(), String> {
    let temporary_path = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(session).map_err(|e| e.to_string())?;
    std::fs::write(&temporary_path, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn parse_vault_session(bytes: &[u8]) -> Result<Value, String> {
    let value = serde_json::from_slice::<Value>(bytes).map_err(|e| e.to_string())?;
    if !value.is_object() {
        return Err("Vault session root must be a JSON object".to_string());
    }
    Ok(value)
}

#[tauri::command]
pub async fn load_latest_vault_session(
    vault_id: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    log::debug!("Loading latest vault session vault_id={}", vault_id);
    let path = latest_session_path(&app, &vault_id)?;
    let Some(bytes) = read_session_file(&path)? else {
        return Ok(None);
    };

    match parse_vault_session(&bytes) {
        Ok(session) => Ok(Some(session)),
        Err(error) => {
            log::warn!(
                "Ignoring malformed vault session at {}: {}",
                path.display(),
                error
            );
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn save_latest_vault_session(
    vault_id: String,
    session: Value,
    app: AppHandle,
) -> Result<(), String> {
    log::debug!("Saving latest vault session vault_id={}", vault_id);
    if !session.is_object() {
        return Err("Vault session root must be a JSON object".to_string());
    }

    let path = latest_session_path(&app, &vault_id)?;
    write_session_file(&path, &session)
}
