use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

// Writes a temp file next to path and renames it over path, so a crash or a
// full disk never leaves a half-written file. Every save goes through here:
// notes, settings, the vault list, sessions and pasted images.
//
// The temp name is "<ms>.<n>.tmp", unique per call, which the tree, the
// watcher and find skip (constants::is_ignored_file). A failed rename removes
// the temp file again.
pub fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
    let dir = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no folder"))?;
    let temp_name = format!(
        "{}.{}.tmp",
        crate::shared::storage::now_ms(),
        NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
    );
    let temp_path = dir.join(temp_name);
    std::fs::write(&temp_path, bytes)?;
    // The rename replaces the file, so carry its permissions over. Otherwise
    // saving a script opened from outside a vault drops its executable bit.
    if let Ok(metadata) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&temp_path, metadata.permissions());
    }
    if let Err(error) = rename_replacing(&temp_path, path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok(())
}

// write_atomically for text, creating the folder first. What every feature
// uses to save a note, a document, the theme file or vault settings.
pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("invalid path")?;
    std::fs::create_dir_all(dir).map_err(|e| {
        log::error!("Failed to create directory {}: {}", dir.display(), e);
        e.to_string()
    })?;
    write_atomically(path, content.as_bytes()).map_err(|e| {
        log::error!("Failed to save {}: {}", path.display(), e);
        e.to_string()
    })
}

// Windows refuses to replace a file that another process has open without
// delete sharing. Defender scans every file right after it is written, and
// OneDrive (which holds Documents on a default Windows 11 install) syncs it,
// each for a few milliseconds. Those come back as PermissionDenied (os error
// 5) or a sharing violation (os error 32), so we retry a few times. About 300
// ms in total, then the real error goes back to the caller.
const RENAME_RETRY_DELAYS_MS: [u64; 5] = [10, 20, 40, 80, 160];
const ERROR_SHARING_VIOLATION: i32 = 32;

pub fn rename_replacing(from: &Path, to: &Path) -> std::io::Result<()> {
    for delay_ms in RENAME_RETRY_DELAYS_MS {
        match std::fs::rename(from, to) {
            Err(error) if is_transient_lock(&error) => {
                std::thread::sleep(Duration::from_millis(delay_ms));
            }
            result => return result,
        }
    }
    std::fs::rename(from, to)
}

fn is_transient_lock(error: &std::io::Error) -> bool {
    cfg!(windows)
        && (error.kind() == std::io::ErrorKind::PermissionDenied
            || error.raw_os_error() == Some(ERROR_SHARING_VIOLATION))
}
