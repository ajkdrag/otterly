use crate::features::updater::service::has_portable_marker;

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
fn marker_in_another_folder_does_not_count() {
    let dir = temp_dir("elsewhere");
    std::fs::create_dir_all(dir.join("bin")).unwrap();
    std::fs::write(dir.join("portable.txt"), "").unwrap();

    assert!(!has_portable_marker(&dir.join("bin").join("otterly.exe")));
}
