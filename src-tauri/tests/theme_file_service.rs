use crate::features::theme::service::{
    debounce_changes, is_theme_file_change, pick_theme_file, read_theme_file_snapshot,
    start_theme_file_watcher, ThemeFileWatcherState,
};
use notify::event::{
    AccessKind, AccessMode, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind,
    RenameMode,
};
use notify::EventKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;
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
fn picks_theme_yml() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yml"), "font_size: 1.1").unwrap();

    assert_eq!(
        pick_theme_file(dir.path()),
        Ok(Some(dir.path().join("theme.yml")))
    );
}

#[test]
fn yaml_and_yml_at_once_is_an_error() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "").unwrap();
    std::fs::write(dir.path().join("theme.yml"), "").unwrap();

    assert!(pick_theme_file(dir.path()).is_err());
}

#[test]
fn both_names_at_once_is_an_error() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "").unwrap();
    std::fs::write(dir.path().join("theme.json"), "{}").unwrap();

    assert!(pick_theme_file(dir.path()).is_err());
}

#[test]
fn snapshot_of_an_empty_folder_points_at_theme_yaml() {
    let dir = TempDir::new().unwrap();

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(
        snapshot.path,
        dir.path().join("theme.yaml").to_string_lossy()
    );
    assert!(snapshot.text.is_none());
    assert!(snapshot.error.is_none());
}

#[test]
fn snapshot_reads_the_text_of_theme_json() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.json"), "{}").unwrap();

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(
        snapshot.path,
        dir.path().join("theme.json").to_string_lossy()
    );
    assert_eq!(snapshot.text.as_deref(), Some("{}"));
    assert!(snapshot.error.is_none());
}

#[test]
fn snapshot_keeps_the_path_when_both_names_exist() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "").unwrap();
    std::fs::write(dir.path().join("theme.json"), "{}").unwrap();

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(
        snapshot.path,
        dir.path().join("theme.yaml").to_string_lossy()
    );
    assert!(snapshot.text.is_none());
    assert!(snapshot.error.is_some());
}

#[test]
fn snapshot_keeps_the_path_of_a_file_that_is_too_big() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.json"), vec![b' '; 300 * 1024]).unwrap();

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(
        snapshot.path,
        dir.path().join("theme.json").to_string_lossy()
    );
    assert!(snapshot.text.is_none());
    assert!(snapshot.error.is_some());
}

#[test]
fn snapshot_keeps_the_path_of_a_file_that_is_not_utf8() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), [0xff, 0xfe, 0x00]).unwrap();

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(
        snapshot.path,
        dir.path().join("theme.yaml").to_string_lossy()
    );
    assert!(snapshot.text.is_none());
    assert!(snapshot.error.is_some());
}

#[cfg(unix)]
#[test]
fn snapshot_names_the_file_it_can_not_read() {
    use std::os::unix::fs::PermissionsExt;
    let dir = TempDir::new().unwrap();
    let theme = dir.path().join("theme.yaml");
    std::fs::write(&theme, "name: x").unwrap();
    std::fs::set_permissions(&theme, std::fs::Permissions::from_mode(0o000)).unwrap();
    // Root reads it anyway, and then there is no error to check.
    if std::fs::File::open(&theme).is_ok() {
        return;
    }

    let snapshot = read_theme_file_snapshot(dir.path());

    assert_eq!(snapshot.path, theme.to_string_lossy());
    assert!(snapshot.text.is_none());
    assert!(snapshot
        .error
        .unwrap()
        .starts_with("theme.yaml can't be read"));
}

#[test]
fn only_the_first_window_after_a_change_claims_the_log() {
    let state = ThemeFileWatcherState::default();

    assert!(state.claim_log());
    assert!(!state.claim_log());

    state.reset_log_claim();

    assert!(state.claim_log());
    assert!(!state.claim_log());
}

fn event(kind: EventKind, names: &[&str]) -> notify::Event {
    let mut event = notify::Event::new(kind);
    for name in names {
        event = event.add_path(PathBuf::from("/config/otterly").join(name));
    }
    event
}

#[test]
fn rename_over_theme_yaml_is_a_change() {
    // An agent writes theme.yaml.tmp and renames it over theme.yaml.
    let rename = event(
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &["theme.yaml.tmp", "theme.yaml"],
    );

    assert!(is_theme_file_change(&rename));
}

#[test]
fn theme_yml_and_a_differently_cased_name_are_changes() {
    // macOS and Windows ignore case, so Theme.yaml loads as theme.yaml and
    // its events carry the name as it was typed.
    let yml = event(EventKind::Create(CreateKind::File), &["theme.yml"]);
    let capitalized = event(EventKind::Create(CreateKind::File), &["Theme.yaml"]);

    assert!(is_theme_file_change(&yml));
    assert!(is_theme_file_change(&capitalized));
}

#[test]
fn vim_backup_and_swap_files_are_not_changes() {
    let swap = event(EventKind::Create(CreateKind::File), &[".theme.yaml.swp"]);
    let backup = event(EventKind::Create(CreateKind::File), &["theme.yaml~"]);
    let probe = event(EventKind::Create(CreateKind::File), &["4913"]);

    assert!(!is_theme_file_change(&swap));
    assert!(!is_theme_file_change(&backup));
    assert!(!is_theme_file_change(&probe));
}

#[test]
fn other_files_in_the_folder_are_not_changes() {
    let settings = event(EventKind::Modify(ModifyKind::Any), &["settings.json"]);
    let schema = event(EventKind::Modify(ModifyKind::Any), &["theme.schema.json"]);

    assert!(!is_theme_file_change(&settings));
    assert!(!is_theme_file_change(&schema));
}

#[test]
fn deleting_the_theme_file_is_a_change() {
    let removed = event(EventKind::Remove(RemoveKind::File), &["theme.json"]);

    assert!(is_theme_file_change(&removed));
}

#[test]
fn reading_the_theme_file_is_not_a_change() {
    // inotify reports our own read after each change. Reacting would loop.
    let opened = event(
        EventKind::Access(AccessKind::Open(AccessMode::Read)),
        &["theme.yaml"],
    );
    let closed_after_write = event(
        EventKind::Access(AccessKind::Close(AccessMode::Write)),
        &["theme.yaml"],
    );

    assert!(!is_theme_file_change(&opened));
    assert!(is_theme_file_change(&closed_after_write));
}

#[test]
fn changing_only_the_metadata_is_not_a_change() {
    // macOS sets a last-used xattr when it opens a file. Nothing was edited.
    let xattr = event(
        EventKind::Modify(ModifyKind::Metadata(MetadataKind::Extended)),
        &["theme.yaml"],
    );
    let chmod = event(
        EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
        &["theme.yaml"],
    );
    let write = event(
        EventKind::Modify(ModifyKind::Data(DataChange::Content)),
        &["theme.yaml"],
    );

    assert!(!is_theme_file_change(&xattr));
    assert!(!is_theme_file_change(&chmod));
    assert!(is_theme_file_change(&write));
}

#[test]
fn a_burst_of_changes_settles_once() {
    let (changed_tx, changed_rx) = mpsc::channel::<()>();
    let settled_count = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&settled_count);
    debounce_changes(changed_rx, Duration::from_millis(100), move || {
        counter.fetch_add(1, Ordering::SeqCst);
    });

    for _ in 0..10 {
        changed_tx.send(()).unwrap();
    }
    std::thread::sleep(Duration::from_millis(600));

    assert_eq!(settled_count.load(Ordering::SeqCst), 1);

    changed_tx.send(()).unwrap();
    std::thread::sleep(Duration::from_millis(600));

    assert_eq!(settled_count.load(Ordering::SeqCst), 2);
}

// Runs a real watcher over a folder and returns how many times it settled
// while edit ran. The sleeps are long on purpose: on a loaded machine events
// arrive late, and a late event would split one save into two.
fn count_settled_changes(dir: &Path, edit: impl FnOnce()) -> usize {
    let settled_count = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&settled_count);
    let _watcher = start_theme_file_watcher(dir, Duration::from_millis(400), move || {
        counter.fetch_add(1, Ordering::SeqCst);
    })
    .unwrap();

    // Some systems replay events from just before the watch started.
    std::thread::sleep(Duration::from_millis(1000));
    let before = settled_count.load(Ordering::SeqCst);
    edit();
    std::thread::sleep(Duration::from_millis(2000));
    settled_count.load(Ordering::SeqCst) - before
}

#[test]
fn saving_through_a_temp_file_and_rename_reloads_once() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "font_size: 1").unwrap();

    let settled = count_settled_changes(dir.path(), || {
        let temp = dir.path().join("theme.yaml.tmp");
        std::fs::write(&temp, "font_size: 1.1").unwrap();
        std::fs::rename(&temp, dir.path().join("theme.yaml")).unwrap();
    });

    assert_eq!(settled, 1);
}

#[test]
fn a_vim_style_save_reloads_once() {
    let dir = TempDir::new().unwrap();
    let theme = dir.path().join("theme.yaml");
    std::fs::write(&theme, "font_size: 1").unwrap();

    let settled = count_settled_changes(dir.path(), || {
        // Probe file, swap file, backup by rename, new file, backup removed.
        std::fs::write(dir.path().join("4913"), "").unwrap();
        std::fs::remove_file(dir.path().join("4913")).unwrap();
        std::fs::write(dir.path().join(".theme.yaml.swp"), "swap").unwrap();
        std::fs::rename(&theme, dir.path().join("theme.yaml~")).unwrap();
        std::fs::write(&theme, "font_size: 1.1").unwrap();
        std::fs::remove_file(dir.path().join("theme.yaml~")).unwrap();
        std::fs::remove_file(dir.path().join(".theme.yaml.swp")).unwrap();
    });

    assert_eq!(settled, 1);
}

#[test]
fn ten_quick_saves_reload_once() {
    let dir = TempDir::new().unwrap();
    let theme = dir.path().join("theme.yaml");
    std::fs::write(&theme, "font_size: 1").unwrap();

    let settled = count_settled_changes(dir.path(), || {
        for step in 0..10 {
            std::fs::write(&theme, format!("accent_hue: {}", 100 + step)).unwrap();
            std::thread::sleep(Duration::from_millis(80));
        }
    });

    assert_eq!(settled, 1);
}

#[test]
fn writing_settings_and_the_schema_does_not_reload() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("theme.yaml"), "font_size: 1").unwrap();

    let settled = count_settled_changes(dir.path(), || {
        let temp = dir.path().join("settings.json.tmp");
        std::fs::write(&temp, "{}").unwrap();
        std::fs::rename(&temp, dir.path().join("settings.json")).unwrap();
        std::fs::write(dir.path().join("theme.schema.json"), "{}").unwrap();
    });

    assert_eq!(settled, 0);
}
