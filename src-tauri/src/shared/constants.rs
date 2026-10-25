pub const APP_DIR: &str = ".otterly";
pub const GIT_DIR: &str = ".git";

pub const EXCLUDED_FOLDERS: &[&str] = &[APP_DIR, GIT_DIR];

pub fn is_excluded_folder(name: &str) -> bool {
    EXCLUDED_FOLDERS.contains(&name)
}

// Files the tree and the watcher skip: folder metadata from Finder and
// Explorer, and the temp file each atomic save writes before renaming it over
// the target ("<ms>.<n>.tmp", see shared::fs::write_atomically).
const FOLDER_METADATA_FILES: &[&str] = &[".DS_Store", "desktop.ini", "Thumbs.db"];

pub fn is_ignored_file(name: &str) -> bool {
    if FOLDER_METADATA_FILES.iter().any(|metadata| metadata.eq_ignore_ascii_case(name)) {
        return true;
    }
    let Some(stem) = name.strip_suffix(".tmp") else {
        return false;
    };
    let mut parts = stem.split('.');
    let is_number = |part: Option<&str>| {
        part.is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
    };
    is_number(parts.next()) && is_number(parts.next()) && parts.next().is_none()
}

#[cfg(test)]
mod tests {
    use super::is_ignored_file;

    #[test]
    fn ignores_finder_metadata_and_atomic_save_temp_files() {
        assert!(is_ignored_file(".DS_Store"));
        assert!(is_ignored_file("desktop.ini"));
        assert!(is_ignored_file("Desktop.ini"));
        assert!(is_ignored_file("Thumbs.db"));
        assert!(is_ignored_file("1791147521383.0.tmp"));
        assert!(!is_ignored_file("notes.tmp"));
        assert!(!is_ignored_file("config.yaml"));
        assert!(!is_ignored_file("1.2.3.tmp"));
    }
}
