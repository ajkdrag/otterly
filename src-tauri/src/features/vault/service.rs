use crate::shared::portable::portable_webview_dir;
use crate::shared::storage;
use crate::shared::storage::{Vault, VaultEntry, VaultStore};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

// Every vault window shows the vault picker or one vault, and a vault is open
// in at most one window. Opening it anywhere else focuses the window that has
// it, so two windows never run two watchers or two autosaves on one folder.
//
//   main      the window the app opens itself (tauri.conf.json, create: false)
//   vault-2   New Window, vault-3, ...
//
// Picker windows are not in the map. Document windows never are.
pub struct VaultWindowState {
    // Window label to vault id.
    vault_by_window: Mutex<HashMap<String, String>>,
    // A counter and not the smallest free number, so two windows opening at
    // once never get the same label. Starts at 2 because main is the first.
    next_window_number: AtomicUsize,
}

impl Default for VaultWindowState {
    fn default() -> Self {
        Self {
            vault_by_window: Mutex::default(),
            next_window_number: AtomicUsize::new(2),
        }
    }
}

const MAIN_WINDOW_LABEL: &str = "main";
const VAULT_WINDOW_PREFIX: &str = "vault-";
const VAULT_OPEN_IN_OTHER_WINDOW: &str = "vault_open_in_other_window";

// A new vault window that starts on the picker, or on vault_id. When another
// window has vault_id, that window comes to the front instead.
pub fn open_vault_window(app: &AppHandle, vault_id: Option<&str>) -> Result<(), String> {
    let number = app
        .state::<VaultWindowState>()
        .next_window_number
        .fetch_add(1, Ordering::Relaxed);
    let label = format!("{VAULT_WINDOW_PREFIX}{number}");
    if let Some(vault_id) = vault_id {
        // Claim before building, so the page's first get_window_vault_id
        // finds its vault. A refused claim skips a number, which is harmless.
        let claimed = claim_vault(&mut lock_vault_by_window(app), &label, vault_id);
        if let Err(owner) = claimed {
            focus_window(app, &owner);
            return Ok(());
        }
    }
    if let Err(error) = build_vault_window(app, &label) {
        forget_vault_window(app, &label);
        return Err(error);
    }
    log::info!("Opened vault window {}", label);
    Ok(())
}

// Brings a vault window to the front, and creates main when there is none.
// For a launch with no file, and for the Dock icon with every window closed.
pub fn show_vault_window(app: &AppHandle) {
    let vault_window = app
        .webview_windows()
        .into_values()
        .find(|window| is_vault_window_label(window.label()));
    if let Some(window) = vault_window {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    if let Err(error) = build_vault_window(app, MAIN_WINDOW_LABEL) {
        log::error!("Could not create the main window: {}", error);
    }
}

// Returns the vault the window had, which no window has now, since a vault is
// open in at most one window.
pub fn forget_vault_window(app: &AppHandle, label: &str) -> Option<String> {
    lock_vault_by_window(app).remove(label)
}

fn is_vault_window_label(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL || label.starts_with(VAULT_WINDOW_PREFIX)
}

// Every vault window is the main window from tauri.conf.json under another
// label. window-state keeps the size and position per label.
fn build_vault_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or("tauri.conf.json has no main window")?;
    config.label = label.to_string();
    let mut builder = WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?;
    if let Some(webview_dir) = portable_webview_dir() {
        builder = builder.data_directory(webview_dir);
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

// Claims the vault for the calling window. When another window has it, that
// window comes to the front and the open fails with VAULT_OPEN_IN_OTHER_WINDOW.
fn claim_vault_for_window(app: &AppHandle, label: &str, vault_id: &str) -> Result<(), String> {
    let claimed = claim_vault(&mut lock_vault_by_window(app), label, vault_id);
    if let Err(owner) = claimed {
        log::info!("Vault {} is open in window {}", vault_id, owner);
        focus_window(app, &owner);
        return Err(VAULT_OPEN_IN_OTHER_WINDOW.to_string());
    }
    Ok(())
}

// Frees vault_id only when this window has it. A window that was opened for a
// vault, which then failed to open, goes back to the picker. A window that
// fails to switch keeps the vault it shows.
fn release_vault_if_claimed(app: &AppHandle, label: &str, vault_id: &str) {
    let mut vault_by_window = lock_vault_by_window(app);
    if vault_by_window.get(label).map(String::as_str) == Some(vault_id) {
        vault_by_window.remove(label);
    }
}

// The window shows vault_id from now on, and the vault it had before is free.
// Err carries the label of the window that already has vault_id.
fn claim_vault(
    vault_by_window: &mut HashMap<String, String>,
    label: &str,
    vault_id: &str,
) -> Result<(), String> {
    if let Some(owner) = window_with_vault(vault_by_window, vault_id) {
        if owner != label {
            return Err(owner);
        }
    }
    vault_by_window.insert(label.to_string(), vault_id.to_string());
    Ok(())
}

fn window_with_vault(vault_by_window: &HashMap<String, String>, vault_id: &str) -> Option<String> {
    vault_by_window
        .iter()
        .find(|(_, id)| *id == vault_id)
        .map(|(label, _)| label.clone())
}

fn focus_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn lock_vault_by_window(app: &AppHandle) -> MutexGuard<'_, HashMap<String, String>> {
    // A poisoned lock only means another thread panicked mid-insert. The map
    // is still usable.
    app.state::<VaultWindowState>()
        .inner()
        .vault_by_window
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn canonicalize_path(path: &str) -> Result<String, String> {
    let p = PathBuf::from(path);
    let p = p.canonicalize().map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

fn vault_name(path: &str) -> String {
    PathBuf::from(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn is_vault_path_available(path: &str) -> bool {
    std::fs::metadata(path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
}

fn refresh_vault_availability(vault: &mut Vault) {
    vault.is_available = is_vault_path_available(&vault.path);
}

fn mark_vault_opened(vault: &mut Vault, opened_at: i64) {
    vault.last_opened_at = Some(opened_at);
}

fn load_note_count(app: &AppHandle, vault_id: &str) -> Option<u64> {
    match crate::features::notes::service::list_notes(app.clone(), vault_id.to_string()) {
        Ok(notes) => Some(notes.len() as u64),
        Err(error) => {
            log::warn!(
                "Failed to load note count for vault {}: {}",
                vault_id,
                error
            );
            None
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct OpenVaultArgs {
    pub vault_path: String,
}

fn upsert_vault(store: &mut VaultStore, mut vault: Vault) {
    let now = storage::now_ms();
    store.last_vault_id = Some(vault.id.clone());
    vault.last_opened_at = Some(now);

    if let Some(existing) = store.vaults.iter_mut().find(|v| v.vault.id == vault.id) {
        if vault.note_count.is_none() {
            vault.note_count = existing.vault.note_count;
        }
        existing.vault = vault;
        existing.last_opened_at = now;
        return;
    }

    store.vaults.push(VaultEntry {
        vault,
        last_opened_at: now,
    });
}

#[tauri::command]
pub fn open_vault(
    app: AppHandle,
    window: WebviewWindow,
    args: OpenVaultArgs,
) -> Result<Vault, String> {
    log::info!("Opening vault path={}", args.vault_path);
    let vault_path = canonicalize_path(&args.vault_path).map_err(|e| {
        log::error!(
            "Failed to canonicalize vault path {}: {}",
            args.vault_path,
            e
        );
        e
    })?;
    let meta = std::fs::metadata(&vault_path).map_err(|e| {
        log::error!("Failed to read metadata for vault {}: {}", vault_path, e);
        e.to_string()
    })?;
    if !meta.is_dir() {
        return Err("vault path is not a directory".to_string());
    }

    let mut store = storage::load_store(&app)?;
    let id = storage::vault_id_for_path(&vault_path);
    claim_vault_for_window(&app, window.label(), &id)?;
    let existing = store.vaults.iter().find(|v| v.vault.id == id);
    let created_at = existing
        .map(|v| v.vault.created_at)
        .unwrap_or_else(storage::now_ms);
    let existing_note_count = existing.and_then(|v| v.vault.note_count);

    let mut vault = Vault {
        id: id.clone(),
        path: vault_path,
        name: vault_name(&args.vault_path),
        created_at,
        last_opened_at: Some(storage::now_ms()),
        note_count: existing_note_count,
        is_available: true,
    };

    upsert_vault(&mut store, vault.clone());
    storage::save_store(&app, &store)?;

    // list_notes finds the vault through vaults.json, so count only after the
    // save above. Counting first failed every first open with "vault not
    // found", and the picker showed "-- notes" forever.
    let new_count = load_note_count(&app, &id).filter(|count| Some(*count) != vault.note_count);
    if let Some(note_count) = new_count {
        vault.note_count = Some(note_count);
        upsert_vault(&mut store, vault.clone());
        storage::save_store(&app, &store)?;
    }
    Ok(vault)
}

#[tauri::command]
pub fn open_vault_by_id(
    app: AppHandle,
    window: WebviewWindow,
    vault_id: String,
) -> Result<Vault, String> {
    log::info!("Opening vault by id vault_id={}", vault_id);
    let mut store = storage::load_store(&app)?;
    let now = storage::now_ms();

    let Some(entry) = store.vaults.iter_mut().find(|v| v.vault.id == vault_id) else {
        log::error!("Vault not found: {}", vault_id);
        release_vault_if_claimed(&app, window.label(), &vault_id);
        return Err("vault not found".to_string());
    };

    refresh_vault_availability(&mut entry.vault);
    if !entry.vault.is_available {
        let message = format!("vault unavailable at path: {}", entry.vault.path);
        log::warn!("Open vault by id skipped: {}", message);
        release_vault_if_claimed(&app, window.label(), &vault_id);
        storage::save_store(&app, &store)?;
        return Err(message);
    }

    claim_vault_for_window(&app, window.label(), &vault_id)?;

    let note_count = load_note_count(&app, &vault_id);
    entry.last_opened_at = now;
    mark_vault_opened(&mut entry.vault, now);
    if note_count.is_some() {
        entry.vault.note_count = note_count;
    }
    let vault = entry.vault.clone();
    storage::save_store(&app, &store)?;
    Ok(vault)
}

#[tauri::command]
pub fn list_vaults(app: AppHandle) -> Result<Vec<Vault>, String> {
    log::info!("Listing vaults");
    let mut store = storage::load_store(&app)?;
    store
        .vaults
        .sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    let vaults = store
        .vaults
        .iter_mut()
        .map(|entry| {
            refresh_vault_availability(&mut entry.vault);
            let mut vault = entry.vault.clone();
            if vault.last_opened_at.is_none() {
                vault.last_opened_at = Some(entry.last_opened_at);
            }
            vault
        })
        .collect();
    Ok(vaults)
}

#[derive(Debug, Deserialize)]
pub struct RememberLastArgs {
    pub vault_id: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveVaultArgs {
    pub vault_id: String,
}

#[tauri::command]
pub fn remember_last_vault(app: AppHandle, args: RememberLastArgs) -> Result<(), String> {
    log::info!("Remembering last vault vault_id={}", args.vault_id);
    let mut store = storage::load_store(&app)?;
    store.last_vault_id = Some(args.vault_id);
    storage::save_store(&app, &store)?;
    Ok(())
}

#[tauri::command]
pub fn remove_vault_from_registry(app: AppHandle, args: RemoveVaultArgs) -> Result<(), String> {
    log::info!("Removing vault from registry vault_id={}", args.vault_id);
    if window_with_vault(&lock_vault_by_window(&app), &args.vault_id).is_some() {
        return Err("This vault is open in a window.".to_string());
    }
    let mut store = storage::load_store(&app)?;
    store.vaults.retain(|entry| entry.vault.id != args.vault_id);
    if store.last_vault_id.as_deref() == Some(args.vault_id.as_str()) {
        store.last_vault_id = None;
    }
    storage::save_store(&app, &store)?;
    Ok(())
}

// The vault this window shows, or the one New Window opened it for. None for
// a window on the picker.
#[tauri::command]
pub fn get_window_vault_id(app: AppHandle, window: WebviewWindow) -> Option<String> {
    lock_vault_by_window(&app).get(window.label()).cloned()
}

// True when another window has the vault. That window comes to the front, so
// the caller does not switch (and does not ask about unsaved changes).
#[tauri::command]
pub fn focus_window_with_vault(app: AppHandle, window: WebviewWindow, vault_id: String) -> bool {
    let owner = window_with_vault(&lock_vault_by_window(&app), &vault_id);
    match owner {
        Some(owner) if owner != window.label() => {
            focus_window(&app, &owner);
            true
        }
        _ => false,
    }
}

// Async because building a window from a sync command deadlocks on Windows.
#[tauri::command]
pub async fn open_new_vault_window(app: AppHandle, vault_id: Option<String>) -> Result<(), String> {
    open_vault_window(&app, vault_id.as_deref())
}

#[cfg(test)]
mod tests {
    use super::claim_vault;
    use std::collections::HashMap;

    fn windows(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(label, vault_id)| (label.to_string(), vault_id.to_string()))
            .collect()
    }

    #[test]
    fn claims_a_vault_no_window_has() {
        let mut vault_by_window = windows(&[("main", "a")]);
        assert_eq!(claim_vault(&mut vault_by_window, "vault-2", "b"), Ok(()));
        assert_eq!(vault_by_window, windows(&[("main", "a"), ("vault-2", "b")]));
    }

    #[test]
    fn claims_a_vault_the_window_already_has() {
        let mut vault_by_window = windows(&[("main", "a")]);
        assert_eq!(claim_vault(&mut vault_by_window, "main", "a"), Ok(()));
        assert_eq!(vault_by_window, windows(&[("main", "a")]));
    }

    #[test]
    fn refuses_a_vault_another_window_has() {
        let mut vault_by_window = windows(&[("main", "a"), ("vault-2", "b")]);
        assert_eq!(
            claim_vault(&mut vault_by_window, "vault-2", "a"),
            Err("main".to_string())
        );
        assert_eq!(vault_by_window, windows(&[("main", "a"), ("vault-2", "b")]));
    }

    #[test]
    fn switching_frees_the_old_vault() {
        let mut vault_by_window = windows(&[("main", "a")]);
        assert_eq!(claim_vault(&mut vault_by_window, "main", "b"), Ok(()));
        assert_eq!(claim_vault(&mut vault_by_window, "vault-2", "a"), Ok(()));
        assert_eq!(vault_by_window, windows(&[("main", "b"), ("vault-2", "a")]));
    }
}
