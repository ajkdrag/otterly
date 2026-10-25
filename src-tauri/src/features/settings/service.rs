use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use crate::shared::portable::app_config_dir;
use tauri::{AppHandle, State};

// set_setting is an async command, so Tauri can run two calls at once, and
// every window writes the same settings.json. Each call reads the file,
// changes its key and writes it all back, so the later write would drop the
// other's key. This lock makes that one step.
#[derive(Default)]
pub struct SettingsLock(Mutex<()>);

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsStore {
    pub settings: HashMap<String, Value>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_config_dir(app)?.join("otterly");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_settings_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_settings_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    crate::shared::fs::write_atomically(path, bytes).map_err(|e| e.to_string())
}

pub fn load_settings(app: &AppHandle) -> Result<SettingsStore, String> {
    let path = settings_path(app)?;
    let Some(bytes) = read_settings_file(&path)? else {
        return Ok(SettingsStore::default());
    };

    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save_settings(app: &AppHandle, store: &SettingsStore) -> Result<(), String> {
    let path = settings_path(app)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    write_settings_file(&path, &bytes)
}

#[tauri::command]
pub async fn get_setting(key: String, app: AppHandle) -> Result<Option<Value>, String> {
    log::debug!("Getting setting key={}", key);
    let store = load_settings(&app)?;
    Ok(store.settings.get(&key).cloned())
}

#[tauri::command]
pub async fn set_setting(
    key: String,
    value: Value,
    app: AppHandle,
    lock: State<'_, SettingsLock>,
) -> Result<(), String> {
    log::debug!("Setting key={}", key);
    // The mutex holds no data, so a panic in an earlier save leaves nothing
    // broken. A poisoned lock is safe to take.
    let _guard = lock
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut store = load_settings(&app)?;
    store.settings.insert(key, value);
    save_settings(&app, &store)?;
    Ok(())
}
