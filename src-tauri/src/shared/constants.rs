pub const APP_DIR: &str = ".otterly";
pub const GIT_DIR: &str = ".git";

pub const EXCLUDED_FOLDERS: &[&str] = &[APP_DIR, GIT_DIR];

pub fn is_excluded_folder(name: &str) -> bool {
    EXCLUDED_FOLDERS.contains(&name)
}

// Files the tree and the watcher skip: Finder's folder metadata, and the temp
// file each atomic save writes before renaming it over the note
// ("<pid>.<ms>.<n>.tmp", see notes::service::atomic_write). Older versions
// left out the pid, so "<ms>.<n>.tmp" still counts.
pub fn is_ignored_file(name: &str) -> bool {
    if name == ".DS_Store" {
        return true;
    }
    let Some(stem) = name.strip_suffix(".tmp") else {
        return false;
    };
    let parts: Vec<&str> = stem.split('.').collect();
    let is_number = |part: &&str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    (2..=3).contains(&parts.len()) && parts.iter().all(is_number)
}

#[cfg(test)]
mod tests {
    use super::is_ignored_file;

    #[test]
    fn ignores_finder_metadata_and_atomic_save_temp_files() {
        assert!(is_ignored_file(".DS_Store"));
        assert!(is_ignored_file("4242.1791147521383.0.tmp"));
        assert!(is_ignored_file("1791147521383.0.tmp"));
        assert!(!is_ignored_file("notes.tmp"));
        assert!(!is_ignored_file("config.yaml"));
        assert!(!is_ignored_file("1.2.3.4.tmp"));
    }
}
