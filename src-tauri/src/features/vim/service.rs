use crate::features::document::service::open_document_window;
use crate::shared::paths::display_path;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

// The vimrc has one fixed path, next to settings.json. Neither command takes
// a path from the webview.

const STARTER_VIMRC: &str = r#"" Otterly vimrc. Lines starting with a double quote are comments.
" Save with :w, then come back to the main window. It reloads on focus.
"
" Supported, one per line:
"   map nmap vmap xmap imap omap, their noremap and unmap forms (nn, xn, ino...)
"   set option, set option=value, set nooption
"   let mapleader = " "    then use <leader> in maps
" A map line takes the rest of the line as the mapping, so it cannot end in
" a comment.
" Vimscript (if, function, autocmd) and terminal settings (syntax, number)
" are skipped. Settings, under Vim, lists every line that does not apply.
"
" Examples (remove the leading quote to turn one on):
" imap jk <Esc>
" nnoremap j gj
" nnoremap k gk
" set clipboard=unnamed
" let mapleader = " "
" nnoremap <leader>w :w<CR>
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
    let dir = crate::shared::portable::app_config_dir(app)?;
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

// macOS opens the accent menu when you hold a letter that has accents (l, e,
// u, n...), so holding l in Vim's normal mode never moves the cursor.
// enabled = false turns that off for Otterly alone, in its own defaults
// domain, like VS Code users do with `defaults write`. true removes our value
// again, so the system default applies. The value persists, so the next
// launch has it before any JavaScript runs. Other platforms repeat held keys
// anyway.
// @Robustness: I have not verified whether AppKit picks the change up in a
// running app. Settings says to restart Otterly if held keys still open the
// menu.
#[tauri::command]
pub fn set_press_and_hold(enabled: bool) {
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::{NSString, NSUserDefaults};
        let defaults = NSUserDefaults::standardUserDefaults();
        let key = NSString::from_str("ApplePressAndHoldEnabled");
        if enabled {
            defaults.removeObjectForKey(&key);
        } else {
            defaults.setBool_forKey(false, &key);
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = enabled;
}
