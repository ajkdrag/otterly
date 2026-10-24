use crate::features::notes::service::atomic_write;
use notify::event::{AccessKind, AccessMode, ModifyKind};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::ffi::OsStr;
use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

// The theme file is theme.yaml or theme.json next to settings.json. The
// frontend parses and validates it. This side reads, creates, watches and
// opens it. No command takes a path: they all act on that one folder.

const YAML_FILE_NAME: &str = "theme.yaml";
const JSON_FILE_NAME: &str = "theme.json";
const SCHEMA_FILE_NAME: &str = "theme.schema.json";
const MAX_THEME_FILE_BYTES: u64 = 256 * 1024;
const THEME_FILE_CHANGED_EVENT: &str = "theme_file_changed";
const CHANGE_DEBOUNCE: Duration = Duration::from_millis(150);

#[derive(Default)]
pub struct ThemeFileWatcherState {
    // Lives for the whole app. Dropping it would stop the watch and end the
    // debounce thread.
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Debug, Serialize)]
pub struct ThemeFileSnapshot {
    // The existing file, or where theme.yaml goes when there is none. Always
    // set, so the person can find the folder even when the file is unusable.
    pub path: String,
    // None when there is no theme file or it can't be read.
    pub text: Option<String>,
    // Why the file can't be read: both names exist, it is over the size limit
    // or it is not UTF-8.
    pub error: Option<String>,
}

// Err is only for a config folder we can't reach. Problems with the file come
// back in the snapshot.
#[tauri::command]
pub fn read_theme_file(app: AppHandle) -> Result<ThemeFileSnapshot, String> {
    Ok(read_theme_file_snapshot(&theme_file_dir(&app)?))
}

pub fn read_theme_file_snapshot(dir: &Path) -> ThemeFileSnapshot {
    let picked = pick_theme_file(dir);
    // With both names, theme.yaml is one of the two files that exist.
    let path = match &picked {
        Ok(Some(file)) => file.clone(),
        _ => dir.join(YAML_FILE_NAME),
    };
    // An editor that deletes and rewrites the file can land between the pick
    // and the read, which comes back as no text and no error. The next change
    // event reads it again.
    let read = picked.and_then(|file| match file {
        Some(file) => read_capped_text(&file),
        None => Ok(None),
    });
    let (text, error) = match read {
        Ok(text) => (text, None),
        Err(error) => (None, Some(error)),
    };
    ThemeFileSnapshot {
        path: display_path(&path),
        text,
        error,
    }
}

#[tauri::command]
pub fn create_theme_file(app: AppHandle, text: String) -> Result<String, String> {
    let dir = theme_file_dir(&app)?;
    if pick_theme_file(&dir)?.is_some() {
        return Err("A theme file already exists".to_string());
    }
    let path = dir.join(YAML_FILE_NAME);
    // create_new, so a file that appeared after the check is never replaced.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(display_path(&path))
}

// Every window calls this on startup. Skipping identical bytes keeps the
// mtime, so editors that watch the schema do not reload it for nothing.
#[tauri::command]
pub fn write_theme_schema(app: AppHandle, text: String) -> Result<(), String> {
    let path = theme_file_dir(&app)?.join(SCHEMA_FILE_NAME);
    if std::fs::read(&path).is_ok_and(|bytes| bytes == text.as_bytes()) {
        return Ok(());
    }
    atomic_write(&path, &text)
}

#[tauri::command]
pub fn open_theme_file(app: AppHandle) -> Result<(), String> {
    let path = existing_theme_file(&app)?;
    app.opener()
        .open_path(display_path(&path), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_theme_file(app: AppHandle) -> Result<(), String> {
    let dir = theme_file_dir(&app)?;
    // With both names or none there is no one file to select. Show the folder
    // instead, which is where the person fixes that.
    match pick_theme_file(&dir) {
        Ok(Some(path)) => app
            .opener()
            .reveal_item_in_dir(path)
            .map_err(|e| e.to_string()),
        _ => app
            .opener()
            .open_path(display_path(&dir), None::<&str>)
            .map_err(|e| e.to_string()),
    }
}

// Every window calls this. The first call starts the one watcher, later calls
// do nothing, and the event goes to all windows.
#[tauri::command]
pub fn watch_theme_file(app: AppHandle, state: State<ThemeFileWatcherState>) -> Result<(), String> {
    let mut slot = state
        .watcher
        .lock()
        .map_err(|_| "theme file watcher lock poisoned")?;
    if slot.is_some() {
        return Ok(());
    }

    let dir = theme_file_dir(&app)?;
    let watcher = start_theme_file_watcher(&dir, CHANGE_DEBOUNCE, move || {
        let _ = app.emit(THEME_FILE_CHANGED_EVENT, ());
    })?;
    *slot = Some(watcher);
    log::info!("Watching theme file folder {}", dir.display());
    Ok(())
}

// Calls on_settled once after each burst of saves of the theme file. We watch
// the folder, not the file: editors and agents often save by writing a temp
// file and renaming it over the old one, and a watch on the old file would
// miss that. The caller keeps the returned watcher alive.
//
// @Incomplete: A theme.yaml that is a symlink loads, but writes to the file it
// points at do not reach this folder, so they do not reload.
pub fn start_theme_file_watcher(
    dir: &Path,
    quiet_period: Duration,
    on_settled: impl Fn() + Send + 'static,
) -> Result<RecommendedWatcher, String> {
    let (changed_tx, changed_rx) = mpsc::channel::<()>();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| {
            if result.is_ok_and(|event| is_theme_file_change(&event)) {
                let _ = changed_tx.send(());
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;
    watcher
        .watch(dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    debounce_changes(changed_rx, quiet_period, on_settled);
    Ok(watcher)
}

// Both names at once is an error instead of a precedence rule. Someone (or an
// agent) editing the losing file would otherwise see nothing happen.
pub fn pick_theme_file(dir: &Path) -> Result<Option<PathBuf>, String> {
    let yaml = dir.join(YAML_FILE_NAME);
    let json = dir.join(JSON_FILE_NAME);
    match (yaml.is_file(), json.is_file()) {
        (true, true) => Err("Found both theme.yaml and theme.json. Delete one.".to_string()),
        (true, false) => Ok(Some(yaml)),
        (false, true) => Ok(Some(json)),
        (false, false) => Ok(None),
    }
}

fn existing_theme_file(app: &AppHandle) -> Result<PathBuf, String> {
    pick_theme_file(&theme_file_dir(app)?)?.ok_or_else(|| "There is no theme file yet".to_string())
}

// The folder of settings.json. Copied from settings::service::settings_path
// instead of shared, to keep the settings feature untouched.
fn theme_file_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let dir = dir.join("otterly");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// None when the file is gone.
fn read_capped_text(path: &Path) -> Result<Option<String>, String> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    // The error names the file because the toast shows it without the path.
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("The theme file");
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    if size > MAX_THEME_FILE_BYTES {
        return Err(format!(
            "{name} is {} KB. The limit is 256 KB.",
            size / 1024
        ));
    }
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|_| format!("{name} is not UTF-8 text"))?;
    Ok(Some(text))
}

// Atomic saves (a temp file renamed over theme.yaml, or vim moving the old
// file to theme.yaml~) name theme.yaml in some event, and the temp, swap and
// backup files never match. So matching on the file name is enough.
pub fn is_theme_file_change(event: &notify::Event) -> bool {
    // Linux reports opens and reads, including our own read after each
    // change, which would loop. A finished write still counts.
    let is_read = matches!(
        event.kind,
        EventKind::Access(kind) if kind != AccessKind::Close(AccessMode::Write)
    );
    // chmod, touch and xattr changes leave the text alone. macOS sets a
    // last-used xattr when it opens a file, which would otherwise reload a
    // theme file nobody edited and switch the app to it. Edits still arrive
    // as Modify(Data), Create or Rename. Windows reports all of these as
    // Modify(Any), so there they still reload.
    let is_metadata_only = matches!(event.kind, EventKind::Modify(ModifyKind::Metadata(_)));
    !is_read && !is_metadata_only && event.paths.iter().any(|path| is_theme_file(path))
}

fn is_theme_file(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(OsStr::to_str),
        Some(YAML_FILE_NAME | JSON_FILE_NAME)
    )
}

// Saving often takes several events (truncate, write, rename), and an agent
// may save many times in a row. Wait until they stop for quiet_period, then
// call on_settled once.
pub fn debounce_changes(
    changed_rx: mpsc::Receiver<()>,
    quiet_period: Duration,
    on_settled: impl Fn() + Send + 'static,
) {
    std::thread::spawn(move || {
        // recv fails once the watcher, which owns the sender, is dropped.
        while changed_rx.recv().is_ok() {
            while changed_rx.recv_timeout(quiet_period).is_ok() {}
            on_settled();
        }
    });
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
