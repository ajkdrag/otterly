use crate::shared::portable::{has_portable_marker, portable_data_dir_for, prepare_portable_copy};

fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "otterly-portable-test-{}-{}",
        name,
        crate::shared::storage::now_ms()
    ));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

#[test]
fn marker_next_to_the_exe_means_portable() {
    let dir = temp_dir("marker");
    std::fs::write(dir.join("portable.txt"), "").unwrap();

    assert!(has_portable_marker(&dir.join("otterly.exe")));
}

#[test]
fn exe_without_marker_is_an_installed_copy() {
    let dir = temp_dir("no-marker");

    assert!(!has_portable_marker(&dir.join("otterly.exe")));
}

#[test]
fn portable_copy_keeps_data_next_to_the_exe() {
    let dir = temp_dir("data-dir");
    std::fs::write(dir.join("portable.txt"), "").unwrap();

    assert_eq!(
        portable_data_dir_for(&dir.join("otterly.exe")),
        Some(dir.join("data"))
    );
}

#[test]
fn installed_copy_has_no_portable_data_dir() {
    let dir = temp_dir("no-data-dir");

    assert_eq!(portable_data_dir_for(&dir.join("otterly.exe")), None);
}

#[test]
fn each_portable_folder_runs_under_its_own_identifier() {
    let first = temp_dir("first-copy").join("data");
    let second = temp_dir("second-copy").join("data");

    let first_id = prepare_portable_copy(&first, "com.otterly.app", None).unwrap();
    let second_id = prepare_portable_copy(&second, "com.otterly.app", None).unwrap();

    assert!(first_id.starts_with("com.otterly.app.portable-"));
    assert_ne!(first_id, "com.otterly.app");
    assert_ne!(first_id, second_id);
    // Same folder, same lock, so a second launch still finds the first.
    assert_eq!(
        prepare_portable_copy(&first, "com.otterly.app", None).unwrap(),
        first_id
    );
    assert!(first.join("config").join("otterly").is_dir());
}

#[test]
fn first_run_copies_the_shared_config_once() {
    let shared = temp_dir("shared-config");
    std::fs::write(shared.join("vaults.json"), "old vault list").unwrap();
    std::fs::write(shared.join("search.db"), "not config").unwrap();
    let data_dir = temp_dir("first-run").join("data");
    let config_dir = data_dir.join("config").join("otterly");

    prepare_portable_copy(&data_dir, "com.otterly.app", Some(&shared)).unwrap();
    assert_eq!(
        std::fs::read_to_string(config_dir.join("vaults.json")).unwrap(),
        "old vault list"
    );
    assert!(!config_dir.join("search.db").exists());

    // Later starts keep the portable copy's own files.
    std::fs::write(config_dir.join("vaults.json"), "portable vault list").unwrap();
    prepare_portable_copy(&data_dir, "com.otterly.app", Some(&shared)).unwrap();
    assert_eq!(
        std::fs::read_to_string(config_dir.join("vaults.json")).unwrap(),
        "portable vault list"
    );
}

#[test]
fn marker_in_another_folder_does_not_count() {
    let dir = temp_dir("elsewhere");
    std::fs::create_dir_all(dir.join("bin")).unwrap();
    std::fs::write(dir.join("portable.txt"), "").unwrap();

    assert!(!has_portable_marker(&dir.join("bin").join("otterly.exe")));
}
