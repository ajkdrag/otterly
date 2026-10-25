use crate::shared::constants;
use crate::shared::storage;
use notify::event::{ModifyKind, RenameMode};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

// One watcher per vault window, keyed by window label. Each window shows its
// own vault, so window B opening a vault must not stop window A's watcher.
#[derive(Default)]
pub struct WatcherState {
    runtimes: Mutex<HashMap<String, WatcherRuntime>>,
}

struct WatcherRuntime {
    stop_tx: mpsc::Sender<()>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum VaultFsEvent {
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

// The watcher belongs to the window that started it, so only that window
// hears about its vault.
fn emit(app: &AppHandle, window_label: &str, event: VaultFsEvent) {
    let _ = app.emit_to(window_label, "vault_fs_event", event);
}

fn lock_runtimes(app: &AppHandle) -> MutexGuard<'_, HashMap<String, WatcherRuntime>> {
    // A poisoned lock only means another thread panicked mid-insert. The map
    // is still usable.
    app.state::<WatcherState>()
        .inner()
        .runtimes
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

// Also runs when a window is destroyed, so its watcher thread does not
// outlive it.
pub fn stop_window_watcher(app: &AppHandle, window_label: &str) {
    let runtime = lock_runtimes(app).remove(window_label);
    if let Some(runtime) = runtime {
        let _ = runtime.stop_tx.send(());
    }
}

// A rename is a remove of the old path and an add of the new one. Windows
// reports it as Name(From) then Name(To), Linux can send Name(Both) with
// [from, to], and macOS sends Name(Any) for each path, so there only the disk
// can tell which side a path is.
fn is_rename_source(mode: &RenameMode, path_index: usize, exists: bool) -> bool {
    match mode {
        RenameMode::From => true,
        RenameMode::To => false,
        RenameMode::Both => path_index == 0,
        _ => !exists,
    }
}

// Every file is a note to the frontend now, since the tree shows all of them
// and the editor opens any text file.
pub(crate) fn classify_event(
    kind: &EventKind,
    vault_id: &str,
    note_path: String,
    path_index: usize,
    exists: bool,
) -> Option<VaultFsEvent> {
    let vault_id = vault_id.to_string();
    match kind {
        EventKind::Create(_) => Some(VaultFsEvent::NoteAdded { vault_id, note_path }),
        EventKind::Remove(_) => Some(VaultFsEvent::NoteRemoved { vault_id, note_path }),
        // Treating a rename as a change left the tab of a note renamed outside
        // the app pointing at a path that no longer exists, and its edits were
        // never saved.
        EventKind::Modify(ModifyKind::Name(mode)) => {
            if is_rename_source(mode, path_index, exists) {
                Some(VaultFsEvent::NoteRemoved { vault_id, note_path })
            } else {
                Some(VaultFsEvent::NoteAdded { vault_id, note_path })
            }
        }
        EventKind::Modify(_) => Some(VaultFsEvent::NoteChangedExternally {
            vault_id,
            note_path,
        }),
        _ => None,
    }
}

#[tauri::command]
pub fn watch_vault(app: AppHandle, window: WebviewWindow, vault_id: String) -> Result<(), String> {
    let window_label = window.label().to_string();
    log::info!(
        "Watching vault vault_id={} window={}",
        vault_id,
        window_label
    );
    stop_window_watcher(&app, &window_label);

    let root = storage::vault_path(&app, &vault_id)?;
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let app_handle = app.clone();
    let vault_id_clone = vault_id.clone();
    let window_label_clone = window_label.clone();

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
            for (path_index, p) in event.paths.iter().enumerate() {
                let (abs, exists) = match p.canonicalize() {
                    Ok(p) => (p, true),
                    Err(_) => (p.to_path_buf(), false),
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

                if let Some(vault_event) =
                    classify_event(kind, &vault_id_clone, rel, path_index, exists)
                {
                    emit(&app_handle, &window_label_clone, vault_event);
                }
            }
        }
    });

    lock_runtimes(&app).insert(window_label, WatcherRuntime { stop_tx });
    Ok(())
}

#[tauri::command]
pub fn unwatch_vault(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    log::info!("Unwatching vault window={}", window.label());
    stop_window_watcher(&app, window.label());
    Ok(())
}
