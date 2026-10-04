use crate::shared::constants;
use crate::shared::storage;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState {
    inner: Arc<Mutex<Option<WatcherRuntime>>>,
}

struct WatcherRuntime {
    stop_tx: mpsc::Sender<()>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum VaultFsEvent {
    NoteChangedExternally {
        vault_id: String,
        note_path: String,
    },
    NoteAdded {
        vault_id: String,
        note_path: String,
    },
    NoteRemoved {
        vault_id: String,
        note_path: String,
    },
}

fn rel_path(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    let rel = storage::normalize_relative_path(rel);

    for excluded in constants::EXCLUDED_FOLDERS {
        if rel == *excluded || rel.starts_with(&format!("{}/", excluded)) {
            return None;
        }
    }

    Some(rel)
}

fn emit(app: &AppHandle, event: VaultFsEvent) {
    let _ = app.emit("vault_fs_event", event);
}

fn with_runtime_lock<T>(
    state: &State<'_, WatcherState>,
    update: impl FnOnce(&mut Option<WatcherRuntime>) -> T,
) -> Result<T, String> {
    let mut guard = state.inner.lock().map_err(|_| "watcher lock poisoned")?;
    Ok(update(&mut guard))
}

fn stop_runtime(runtime: WatcherRuntime) {
    let _ = runtime.stop_tx.send(());
}

fn stop_active_runtime(state: &State<'_, WatcherState>) -> Result<(), String> {
    let runtime = with_runtime_lock(state, |slot| slot.take())?;
    if let Some(runtime) = runtime {
        stop_runtime(runtime);
    }
    Ok(())
}

fn set_active_runtime(
    state: &State<'_, WatcherState>,
    runtime: WatcherRuntime,
) -> Result<(), String> {
    with_runtime_lock(state, |slot| {
        *slot = Some(runtime);
    })
}

// Every file is a note to the frontend now, since the tree shows all of them
// and the editor opens any text file.
fn classify_event(kind: &EventKind, vault_id: &str, rel_path: String) -> Option<VaultFsEvent> {
    match kind {
        EventKind::Create(_) => Some(VaultFsEvent::NoteAdded {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
        }),
        EventKind::Remove(_) => Some(VaultFsEvent::NoteRemoved {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
        }),
        EventKind::Modify(_) => Some(VaultFsEvent::NoteChangedExternally {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
        }),
        _ => None,
    }
}

#[tauri::command]
pub fn watch_vault(
    app: AppHandle,
    state: State<WatcherState>,
    vault_id: String,
) -> Result<(), String> {
    log::info!("Watching vault vault_id={}", vault_id);
    stop_active_runtime(&state)?;

    let root = storage::vault_path(&app, &vault_id)?;
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let app_handle = app.clone();
    let vault_id_clone = vault_id.clone();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Result<notify::Event, notify::Error>>();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                log::error!("Failed to create file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&root_canon, RecursiveMode::Recursive) {
            log::error!("Failed to start watching {}: {}", root_canon.display(), e);
            return;
        }

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let res = match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(r) => r,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            };

            let event = match res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let kind = &event.kind;
            for p in event.paths.iter() {
                let abs = match p.canonicalize() {
                    Ok(p) => p,
                    Err(_) => p.to_path_buf(),
                };

                if !abs.starts_with(&root_canon) {
                    continue;
                }

                let Some(rel) = rel_path(&root_canon, &abs) else {
                    continue;
                };

                let name = abs.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                if constants::is_ignored_file(name) {
                    continue;
                }

                if let Some(vault_event) = classify_event(kind, &vault_id_clone, rel) {
                    emit(&app_handle, vault_event);
                }
            }
        }
    });

    set_active_runtime(&state, WatcherRuntime { stop_tx })?;
    Ok(())
}

#[tauri::command]
pub fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    log::info!("Unwatching vault");
    stop_active_runtime(&state)
}
