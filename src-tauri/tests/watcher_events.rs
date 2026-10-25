use crate::features::watcher::service::{classify_event, VaultFsEvent};
use notify::event::{CreateKind, DataChange, ModifyKind, RenameMode};
use notify::EventKind;

fn added(path: &str) -> Option<VaultFsEvent> {
    Some(VaultFsEvent::NoteAdded {
        vault_id: "v".to_string(),
        note_path: path.to_string(),
    })
}

fn removed(path: &str) -> Option<VaultFsEvent> {
    Some(VaultFsEvent::NoteRemoved {
        vault_id: "v".to_string(),
        note_path: path.to_string(),
    })
}

fn rename(mode: RenameMode) -> EventKind {
    EventKind::Modify(ModifyKind::Name(mode))
}

#[test]
fn windows_rename_is_remove_then_add() {
    let from = classify_event(&rename(RenameMode::From), "v", "old.md".into(), 0, false);
    let to = classify_event(&rename(RenameMode::To), "v", "new.md".into(), 0, true);
    assert_eq!(from, removed("old.md"));
    assert_eq!(to, added("new.md"));
}

#[test]
fn rename_both_uses_path_order() {
    let kind = rename(RenameMode::Both);
    assert_eq!(classify_event(&kind, "v", "old.md".into(), 0, false), removed("old.md"));
    assert_eq!(classify_event(&kind, "v", "new.md".into(), 1, true), added("new.md"));
}

#[test]
fn rename_any_asks_the_disk() {
    let kind = rename(RenameMode::Any);
    assert_eq!(classify_event(&kind, "v", "gone.md".into(), 0, false), removed("gone.md"));
    assert_eq!(classify_event(&kind, "v", "here.md".into(), 0, true), added("here.md"));
}

#[test]
fn content_change_and_create_keep_their_meaning() {
    let change = EventKind::Modify(ModifyKind::Data(DataChange::Content));
    assert_eq!(
        classify_event(&change, "v", "a.md".into(), 0, true),
        Some(VaultFsEvent::NoteChangedExternally {
            vault_id: "v".to_string(),
            note_path: "a.md".to_string(),
        })
    );
    let create = EventKind::Create(CreateKind::File);
    assert_eq!(classify_event(&create, "v", "a.md".into(), 0, true), added("a.md"));
}
