use crate::shared::fs::atomic_write;
use crate::shared::constants;
use crate::shared::storage::{load_store, vault_path_by_id};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};

const SETTINGS_FILE: &str = "settings.json";

// set_vault_setting is an async command, so Tauri can run two calls at once
// (a recent notes save and a starred notes save, say). Each one reads the
// file, changes its key and writes it all back, and the later write would drop
// the other's key. This lock makes the read-modify-write one step.
#[derive(Default)]
pub struct VaultSettingsLock(Mutex<()>);

fn vault_settings_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let store = load_store(app)?;
    let vault_path = vault_path_by_id(&store, vault_id).ok_or("Vault not found")?;
    let settings_dir = PathBuf::from(&vault_path).join(constants::APP_DIR);
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    Ok(settings_dir.join(SETTINGS_FILE))
}

fn load_vault_settings(app: &AppHandle, vault_id: &str) -> Result<HashMap<String, Value>, String> {
    let path = vault_settings_path(app, vault_id)?;
    let Some(bytes) = read_vault_settings_file(&path)? else {
        return Ok(HashMap::new());
    };
    parse_vault_settings(&bytes)
}

pub(crate) fn parse_vault_settings(bytes: &[u8]) -> Result<HashMap<String, Value>, String> {
    let mut stream = serde_json::Deserializer::from_slice(bytes).into_iter::<Value>();
    let first = stream
        .next()
        .ok_or_else(|| "EOF while parsing a value".to_string())
        .and_then(|result| result.map_err(|e| e.to_string()))?;

    if stream.next().is_some() {
        log::warn!("Vault settings contained trailing content; ignoring trailing bytes");
    }

    let settings = first
        .as_object()
        .ok_or_else(|| "Vault settings root must be a JSON object".to_string())?
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<HashMap<String, Value>>();

    Ok(settings)
}

fn read_vault_settings_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

// Saves go through atomic_write. Its temp name has a counter, so parallel
// saves never share a temp file.
fn save_vault_settings(
    app: &AppHandle,
    vault_id: &str,
    settings: &HashMap<String, Value>,
) -> Result<(), String> {
    let path = vault_settings_path(app, vault_id)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

#[tauri::command]
pub async fn get_vault_setting(
    vault_id: String,
    key: String,
    app: AppHandle,
) -> Result<Option<Value>, String> {
    log::debug!("Getting vault setting vault_id={} key={}", vault_id, key);
    let settings = load_vault_settings(&app, &vault_id)?;
    Ok(settings.get(&key).cloned())
}

#[tauri::command]
pub async fn set_vault_setting(
    vault_id: String,
    key: String,
    value: Value,
    app: AppHandle,
    lock: State<'_, VaultSettingsLock>,
) -> Result<(), String> {
    log::debug!("Setting vault setting vault_id={} key={}", vault_id, key);
    // The mutex holds no data, so a panic in an earlier save leaves nothing
    // broken. A poisoned lock is safe to take.
    let _guard = lock
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut settings = load_vault_settings(&app, &vault_id)?;
    settings.insert(key, value);
    save_vault_settings(&app, &vault_id, &settings)?;
    Ok(())
}
