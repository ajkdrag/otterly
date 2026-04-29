use crate::features::notes::service::{
    folder_cache_key, get_or_scan_folder_entries, invalidate_folder_cache, rename_with_temp_path,
    safe_vault_abs, safe_vault_abs_for_write, safe_vault_rename_target_abs, scan_folder_entries,
};
use crate::shared::storage;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(unix)]
use std::os::unix::fs as unix_fs;

static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

fn mk_temp_dir() -> PathBuf {
    let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "leapgrownotes-notes-test-{}-{}",
        storage::now_ms(),
        counter
    ));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

#[test]
fn safe_vault_abs_rejects_traversal() {
    let root = mk_temp_dir();
    assert!(safe_vault_abs(&root, "../x.md").is_err());
    assert!(safe_vault_abs(&root, "a/../x.md").is_err());
    assert!(safe_vault_abs(&root, "/abs/x.md").is_err());
    assert!(safe_vault_abs(&root, "a/b.md").is_ok());
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn safe_vault_abs_for_write_rejects_symlink_escape() {
    let root = mk_temp_dir();
    let outside = mk_temp_dir();
    let link = root.join("notes");
    unix_fs::symlink(&outside, &link).expect("symlink should be created");

    let result = safe_vault_abs_for_write(&root, "notes/escape.md");
    assert!(result.is_err());

    let _ = std::fs::remove_dir_all(&outside);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_with_temp_path_renames_file() {
    let root = mk_temp_dir();
    let from = root.join("x.md");
    let to = root.join("y.md");
    std::fs::write(&from, "# test").expect("source file should be created");

    rename_with_temp_path(&from, &to).expect("rename should succeed");

    assert!(!from.exists());
    assert!(to.exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_with_temp_path_supports_case_only_rename() {
    let root = mk_temp_dir();
    std::fs::write(root.join("x.md"), "# test").expect("source file should be created");
    let from = safe_vault_abs(&root, "x.md").expect("source path should resolve");
    let to = safe_vault_rename_target_abs(&root, "X.md").expect("target path should resolve");

    rename_with_temp_path(&from, &to).expect("rename should succeed");

    assert!(to.exists());
    let names: Vec<String> = std::fs::read_dir(&root)
        .expect("root should be readable")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    assert!(names.iter().any(|name| name == "X.md"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn scan_folder_entries_filters_and_sorts() {
    let root = mk_temp_dir();
    std::fs::create_dir_all(root.join(".git")).expect("excluded dir should be created");
    std::fs::create_dir_all(root.join("zeta")).expect("dir should be created");
    std::fs::create_dir_all(root.join("alpha")).expect("dir should be created");
    std::fs::write(root.join("b.md"), "b").expect("file should be created");
    std::fs::write(root.join("a.md"), "a").expect("file should be created");
    std::fs::write(root.join("readme.txt"), "ignored").expect("file should be created");

    let entries = scan_folder_entries(&root).expect("scan should succeed");
    let names: Vec<String> = entries.iter().map(|entry| entry.name.clone()).collect();
    let dirs_first = entries
        .iter()
        .map(|entry| (entry.name.clone(), entry.is_dir))
        .collect::<Vec<(String, bool)>>();

    assert_eq!(names, vec!["alpha", "zeta", "a.md", "b.md"]);
    assert_eq!(
        dirs_first,
        vec![
            ("alpha".to_string(), true),
            ("zeta".to_string(), true),
            ("a.md".to_string(), false),
            ("b.md".to_string(), false)
        ]
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn folder_entries_cache_hit_and_invalidation() {
    let root = mk_temp_dir();
    std::fs::write(root.join("a.md"), "a").expect("seed file should be created");

    let vault_id = format!("v{}", storage::now_ms());
    let folder_path = "";
    let key = folder_cache_key(&vault_id, folder_path);
    let first = get_or_scan_folder_entries(&key, &root).expect("first scan should succeed");
    assert_eq!(first.len(), 1);

    std::fs::write(root.join("b.md"), "b").expect("second file should be created");
    let second = get_or_scan_folder_entries(&key, &root).expect("cache hit should succeed");
    assert_eq!(second.len(), 1);

    invalidate_folder_cache(&vault_id, folder_path);
    let third = get_or_scan_folder_entries(&key, &root).expect("scan after invalidate should work");
    assert_eq!(third.len(), 2);

    let _ = std::fs::remove_dir_all(&root);
}
