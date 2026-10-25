use crate::shared::constants::is_ignored_file;
use crate::shared::fs::write_atomically;
use tempfile::TempDir;

fn file_names(dir: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    names
}

#[test]
fn write_atomically_replaces_the_file_and_leaves_no_temp_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("note.md");
    std::fs::write(&path, "old").unwrap();

    write_atomically(&path, b"new").unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
    assert_eq!(file_names(dir.path()), vec!["note.md"]);
}

#[test]
fn write_atomically_creates_a_missing_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("settings.json");

    write_atomically(&path, b"{}").unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
}

#[test]
fn failed_write_cleans_up_its_temp_file() {
    let dir = TempDir::new().unwrap();
    // A folder in the way makes the final rename fail on every OS.
    let path = dir.path().join("blocked.md");
    std::fs::create_dir(&path).unwrap();
    std::fs::write(path.join("child"), "x").unwrap();

    assert!(write_atomically(&path, b"text").is_err());
    assert_eq!(file_names(dir.path()), vec!["blocked.md"]);
}

#[test]
fn temp_names_are_hidden_from_the_tree() {
    // write_atomically names its temp file like this. If that format changes,
    // is_ignored_file has to change with it.
    let temp_name = format!("{}.{}.tmp", crate::shared::storage::now_ms(), 7);
    assert!(is_ignored_file(&temp_name));
}
