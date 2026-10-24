use crate::features::notes::service::{atomic_write, file_meta, read_text_file, safe_vault_abs};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

// A file the OS asks us to open (double click, "Open With", a second launch
// with a path) gets its own window, outside any vault. A document window can
// only read and write its own file: commands look the file up by the calling
// window's label, so the webview never sends a path.

const DOCUMENT_WINDOW_PREFIX: &str = "document-";

#[derive(Default)]
pub struct DocumentState {
    // Window label to the canonical path of the file it shows.
    windows: Mutex<HashMap<String, PathBuf>>,
}

impl DocumentState {
    // Canonical paths of the files that document windows show right now.
    pub fn open_paths(&self) -> Vec<PathBuf> {
        lock(self).values().cloned().collect()
    }
}

#[derive(Debug, Serialize)]
pub struct DocumentFile {
    pub path: String,
    pub name: String,
    pub text: String,
    pub mtime_ms: i64,
}

#[tauri::command]
pub fn read_document(
    window: WebviewWindow,
    state: State<DocumentState>,
) -> Result<DocumentFile, String> {
    let path = document_path(&state, window.label())?;
    let text = read_text_file(&path)?;
    let (mtime_ms, _) = file_meta(&path)?;
    Ok(DocumentFile {
        path: display_path(&path),
        name: file_name(&path),
        text,
        mtime_ms,
    })
}

#[tauri::command]
pub fn write_document(
    window: WebviewWindow,
    state: State<DocumentState>,
    text: String,
    expected_mtime_ms: Option<i64>,
) -> Result<i64, String> {
    let path = document_path(&state, window.label())?;
    if let Some(expected) = expected_mtime_ms {
        match file_meta(&path) {
            Ok((disk_mtime, _)) if disk_mtime != expected => {
                return Err("conflict:mtime_mismatch".to_string());
            }
            Err(_) => return Err("conflict:file_missing".to_string()),
            _ => {}
        }
    }
    atomic_write(&path, &text)?;
    let (mtime_ms, _) = file_meta(&path)?;
    Ok(mtime_ms)
}

// Like read_document, this takes no path: the window can only reveal its own
// file. The file manager gets the display form, because it may not accept a
// Windows verbatim path.
#[tauri::command]
pub fn reveal_document(
    app: AppHandle,
    window: WebviewWindow,
    state: State<DocumentState>,
) -> Result<(), String> {
    let path = document_path(&state, window.label())?;
    app.opener()
        .reveal_item_in_dir(display_path(&path))
        .map_err(|e| e.to_string())
}

pub fn open_document_windows(app: &AppHandle, paths: Vec<PathBuf>) {
    for path in paths {
        if let Err(error) = open_document_window(app, &path) {
            log::error!("Could not open {}: {}", path.display(), error);
        }
    }
}

// One window per file. Opening the same file again focuses its window.
fn open_document_window(app: &AppHandle, path: &Path) -> Result<(), String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err("not a file".to_string());
    }
    let label = window_label(&path);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let state = app.state::<DocumentState>();
    // Register before building, so the page's first read finds its file.
    lock(&state).insert(label.clone(), path.clone());
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title(file_name(&path))
        .inner_size(960.0, 820.0)
        .disable_drag_drop_handler()
        .build();
    if let Err(error) = built {
        lock(&state).remove(&label);
        return Err(error.to_string());
    }
    log::info!("Opened document window for {}", path.display());
    Ok(())
}

pub fn forget_document_window(app: &AppHandle, label: &str) {
    lock(&app.state::<DocumentState>()).remove(label);
}

// Images in a document load from its own folder or below, the same rule as
// notes inside a vault.
pub fn document_asset_path(app: &AppHandle, label: &str, relative: &str) -> Result<PathBuf, String> {
    let path = document_path(&app.state::<DocumentState>(), label)?;
    let folder = path.parent().ok_or("document has no folder")?;
    safe_vault_abs(folder, relative)
}

// Files on the command line, which is how Windows and Linux pass the file for
// a file association. Flags are skipped, file:// URLs become paths, and a
// relative path resolves against the directory the launch came from.
pub fn files_from_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = if arg.starts_with("file://") {
                tauri::Url::parse(arg).ok()?.to_file_path().ok()?
            } else {
                PathBuf::from(arg)
            };
            let path = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            path.is_file().then_some(path)
        })
        .collect()
}

fn document_path(state: &DocumentState, label: &str) -> Result<PathBuf, String> {
    lock(state)
        .get(label)
        .cloned()
        .ok_or_else(|| "this window has no document".to_string())
}

fn lock(state: &DocumentState) -> std::sync::MutexGuard<'_, HashMap<String, PathBuf>> {
    // A poisoned lock only means another thread panicked mid-insert. The map
    // is still usable.
    state.windows.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn window_label(path: &Path) -> String {
    let hash = blake3::hash(path.to_string_lossy().as_bytes()).to_hex();
    format!("{DOCUMENT_WINDOW_PREFIX}{}", &hash[..16])
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

// canonicalize gives Windows verbatim paths (\\?\C:\...). Show the usual form.
fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}
