use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

// The Windows portable zip ships a portable.txt next to otterly.exe. The
// installers do not. Sadly nothing else tells the two apart: it is the same
// binary.
const PORTABLE_MARKER_FILE_NAME: &str = "portable.txt";

// A portable copy keeps all its state in data\ next to otterly.exe, so
// deleting the folder removes everything and two copies never share a vault
// list:
//
//   data\config\otterly\           settings.json, vaults.json, theme file, vimrc
//   data\config\.window-state.json
//   data\logs\otterly.log
//   data\EBWebView\                WebView2 profile
//
// data\config has the same layout as %APPDATA%\com.otterly.app, so you can
// copy an installed setup in by hand.
//
// @Robustness: a portable folder somewhere read-only (Program Files) fails to
// save settings. We do not fall back to %APPDATA%, since that is the mixing
// this avoids.
pub fn portable_data_dir() -> Option<&'static Path> {
    // Checked once, so every path we hand out agrees even if someone adds or
    // deletes portable.txt while we run.
    static DATA_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DATA_DIR
        .get_or_init(|| {
            if !cfg!(windows) {
                return None;
            }
            portable_data_dir_for(&std::env::current_exe().ok()?)
        })
        .as_deref()
}

pub fn portable_data_dir_for(exe_path: &Path) -> Option<PathBuf> {
    if !has_portable_marker(exe_path) {
        return None;
    }
    Some(exe_path.parent()?.join("data"))
}

pub fn has_portable_marker(exe_path: &Path) -> bool {
    exe_path
        .parent()
        .is_some_and(|exe_dir| exe_dir.join(PORTABLE_MARKER_FILE_NAME).is_file())
}

// WebView2 wants one data folder for every webview in the process, so every
// window builder must set this.
pub fn portable_webview_dir() -> Option<PathBuf> {
    portable_data_dir().map(|data_dir| data_dir.join("EBWebView"))
}

// Called once before Tauri starts, while we can still change the identifier.
// Returns the identifier this copy runs under, or a message for the user.
//
// The single-instance plugin names its lock after the identifier. With the
// installed app's identifier, starting a portable copy while the installed
// app runs just opened a window in the installed app, on its data. One
// identifier per folder keeps two portable copies apart as well.
//
// shared_config_dir is where 0.6.0 and older kept the config
// (%APPDATA%\com.otterly.app\otterly). The first run copies it over.
pub fn prepare_portable_copy(
    data_dir: &Path,
    installed_identifier: &str,
    shared_config_dir: Option<&Path>,
) -> Result<String, String> {
    let config_dir = data_dir.join("config").join("otterly");
    let is_first_run = !config_dir.exists();
    std::fs::create_dir_all(&config_dir)
        .and_then(|_| check_writable(&config_dir))
        .map_err(|error| {
            format!(
                "Otterly can't write to its data folder:\n{}\n\n{}\n\nMove the Otterly folder somewhere you can write, such as Documents, and start it again.",
                data_dir.display(),
                error
            )
        })?;
    if is_first_run {
        if let Some(shared_config_dir) = shared_config_dir {
            copy_shared_config(shared_config_dir, &config_dir);
        }
    }
    Ok(format!(
        "{installed_identifier}.portable-{}",
        folder_hash(data_dir)
    ))
}

// The same folder can arrive under several spellings: a junction, a subst
// drive, an 8.3 name, other letter case. Each would get its own lock and two
// processes would share one data folder, so hash the canonical path.
fn folder_hash(data_dir: &Path) -> String {
    let folder = std::fs::canonicalize(data_dir).unwrap_or_else(|_| data_dir.to_path_buf());
    let key = crate::shared::paths::display_path(&folder).to_lowercase();
    blake3::hash(key.as_bytes()).to_hex()[..12].to_string()
}

// create_dir_all succeeds on a folder that already exists, even read-only, so
// only an actual write tells. The name has the process id because a file
// double click and a plain launch can both get here at once.
fn check_writable(dir: &Path) -> std::io::Result<()> {
    let probe = dir.join(format!(".write-check-{}", std::process::id()));
    std::fs::write(&probe, b"")?;
    std::fs::remove_file(&probe)
}

// Up to 0.6.0 portable copies kept their config in %APPDATA% like the
// installed app. Copy it on the first run so upgrading a portable copy keeps
// its vault list, settings, theme and vimrc. Copy, not move: an installed
// app may still use those files. Best effort, a missing file is fine.
const SHARED_CONFIG_FILES: &[&str] = &[
    "settings.json",
    "vaults.json",
    "theme.yaml",
    "theme.yml",
    "theme.json",
    "vimrc",
];

fn copy_shared_config(shared_dir: &Path, config_dir: &Path) {
    for name in SHARED_CONFIG_FILES {
        let from = shared_dir.join(name);
        if from.is_file() {
            let _ = std::fs::copy(&from, config_dir.join(name));
        }
    }
}

// There is no window yet when this runs, so a plain message box.
#[cfg(windows)]
pub fn show_startup_error(message: &str) {
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    // SAFETY: both strings outlive the call.
    unsafe {
        MessageBoxW(None, &HSTRING::from(message), w!("Otterly"), MB_OK | MB_ICONERROR);
    }
}

// Use this instead of app.path().app_config_dir().
pub fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match portable_data_dir() {
        Some(data_dir) => Ok(data_dir.join("config")),
        None => app.path().app_config_dir().map_err(|e| e.to_string()),
    }
}
