use crate::features::theme::service::pick_theme_file;
use tempfile::TempDir;

#[test]
fn empty_folder_has_no_theme_file() {
    let dir = TempDir::new().unwrap();

    assert_eq!(pick_theme_file(dir.path()), Ok(None));
}

#[test]
fn picks_theme_yaml() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "font_size: 1.1").unwrap();

    assert_eq!(
        pick_theme_file(dir.path()),
        Ok(Some(dir.path().join("theme.yaml")))
    );
}

#[test]
fn picks_theme_json() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.json"), "{}").unwrap();

    assert_eq!(
        pick_theme_file(dir.path()),
        Ok(Some(dir.path().join("theme.json")))
    );
}

#[test]
fn both_names_at_once_is_an_error() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "").unwrap();
    std::fs::write(dir.path().join("theme.json"), "{}").unwrap();

    assert!(pick_theme_file(dir.path()).is_err());
}
