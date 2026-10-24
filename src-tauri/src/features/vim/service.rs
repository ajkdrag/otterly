use crate::features::document::service::open_document_window;
use crate::shared::paths::display_path;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// The vimrc has one fixed path, next to settings.json. Neither command takes
// a path from the webview.

const STARTER_VIMRC: &str = r#"" Otterly vimrc. Lines starting with a double quote are comments.
" Save this file with Cmd+S (Ctrl+S on Windows and Linux), because :w does not
" save. Then come back to the main window. It reloads on focus.
"
" Supported commands, one per line:
"   map nmap vmap imap omap and their noremap forms
"   unmap nunmap vunmap iunmap ounmap
"   set option, set option=value, set nooption
" A map line takes the rest of the line as the mapping, so it cannot end in
" a comment. <leader> is not supported, and a map of two or more keys never
" fires when its first key already does something (<Space>, <BS>, j, s, a
" comma and so on). Lines that do not apply are listed in Settings, under Vim.
"
" Examples (remove the leading quote to turn one on):
" imap jk <Esc>
" nmap j gj
" nmap k gk
"#;

#[derive(Debug, Serialize)]
pub struct VimrcFile {
    pub path: String,
    // None when the file does not exist yet.
    pub text: Option<String>,
}

#[tauri::command]
pub async fn read_vimrc(app: AppHandle) -> Result<VimrcFile, String> {
    let path = vimrc_path(&app)?;
    let shown_path = display_path(&path);
    // The path goes in the error so the user knows which file to fix.
    let text = read_vimrc_text(&path).map_err(|e| format!("{shown_path}: {e}"))?;
    Ok(VimrcFile {
        path: shown_path,
        text,
    })
}

// Async because creating a window from a sync command deadlocks on Windows.
#[tauri::command]
pub async fn open_vimrc(app: AppHandle) -> Result<(), String> {
    let path = vimrc_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    create_starter_vimrc(&path)?;
    open_document_window(&app, &path)
}

// Creates nothing. read_vimrc runs on every window focus, so only open_vimrc
// makes the directory.
fn vimrc_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("otterly").join("vimrc"))
}

// A missing file is normal (Vim still runs with its defaults). Bytes that are
// not UTF-8 are an error, so the engine keeps the previous vimrc.
pub(crate) fn read_vimrc_text(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read(path) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| "the vimrc is not valid UTF-8".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

// create_new keeps a file that already exists, even when it appears between
// our check and the write.
pub(crate) fn create_starter_vimrc(path: &Path) -> Result<(), String> {
    let created = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path);
    match created {
        Ok(mut file) => file
            .write_all(STARTER_VIMRC.as_bytes())
            .map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
