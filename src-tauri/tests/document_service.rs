use crate::features::document::service::{files_from_args, window_label};
use std::path::PathBuf;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "otterly-documents-test-{}-{}",
        name,
        crate::shared::storage::now_ms()
    ));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

#[test]
fn files_from_args_keeps_existing_files_and_skips_flags() {
    let dir = temp_dir("args");
    let note = dir.join("note.md");
    std::fs::write(&note, "# hi").unwrap();
    std::fs::create_dir_all(dir.join("folder")).unwrap();

    let args = vec![
        "otterly".to_string(),
        "--flag".to_string(),
        "note.md".to_string(),
        "folder".to_string(),
        "missing.md".to_string(),
        tauri::Url::from_file_path(&note).unwrap().to_string(),
    ];
    let files = files_from_args(&args, &dir);
    assert_eq!(files, vec![dir.join("note.md"), note.clone()]);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn window_label_is_stable_per_path() {
    let a = window_label(&PathBuf::from("/notes/a.md"));
    assert_eq!(a, window_label(&PathBuf::from("/notes/a.md")));
    assert_ne!(a, window_label(&PathBuf::from("/notes/b.md")));
    assert!(a.starts_with("document-"));
}
