use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, get_backlinks, get_manifest, get_orphan_outlinks, get_outlinks,
    gfm_link_targets, in_write_transaction, internal_link_targets, list_note_paths_by_prefix,
    open_search_db, rebuild_index, remove_notes_by_prefix, rename_folder_paths, rename_note_path,
    search, set_outlinks, suggest_files, suggest_planned, sync_index, upsert_note,
    wiki_link_targets, IndexResult,
};
use crate::features::search::model::{IndexNoteMeta, SearchScope};
use rusqlite::Connection;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tempfile::TempDir;

type IndexFn = fn(
    &Connection,
    &Path,
    &AtomicBool,
    &dyn Fn(usize, usize),
    &mut dyn FnMut(),
) -> Result<IndexResult, String>;

fn write_md(dir: &Path, rel: &str, content: &str) -> PathBuf {
    let p = dir.join(rel);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).expect("parent dir should be created");
    }
    fs::write(&p, content).expect("file should be written");
    p
}

fn set_mtime(path: &Path, secs_offset: i64) {
    let t = filetime::FileTime::from_unix_time(1_700_000_000 + secs_offset, 0);
    filetime::set_file_mtime(path, t).expect("mtime should be set");
}

#[test]
fn empty_manifest_all_added() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let a = write_md(root, "a.md", "hello");
    let b = write_md(root, "b.md", "world");

    let manifest = BTreeMap::new();
    let disk = vec![a, b];
    let plan = compute_sync_plan(root, &manifest, &disk);

    assert_eq!(plan.added.len(), 2);
    assert!(plan.modified.is_empty());
    assert!(plan.removed.is_empty());
    assert_eq!(plan.unchanged, 0);
}

#[test]
fn unchanged_files_detected() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let p = write_md(root, "note.md", "content");
    set_mtime(&p, 0);

    let (mtime, size) = notes_service::file_meta(&p).expect("file metadata should be loaded");
    let mut manifest = BTreeMap::new();
    manifest.insert("note.md".to_string(), (mtime, size));

    let plan = compute_sync_plan(root, &manifest, &[p]);

    assert!(plan.added.is_empty());
    assert!(plan.modified.is_empty());
    assert!(plan.removed.is_empty());
    assert_eq!(plan.unchanged, 1);
}

#[test]
fn remove_notes_by_prefix_deletes_matching_and_keeps_others() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    let notes = vec![
        ("docs/a.md", "A", "a", "body a"),
        ("docs/sub/b.md", "B", "b", "body b"),
        ("misc/c.md", "C", "c", "body c"),
    ];
    for (path, title, name, body) in &notes {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: name.to_string(),
            mtime_ms: 100,
            size_bytes: 10,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    }

    set_outlinks(&conn, "docs/a.md", &["misc/c.md".to_string()])
        .expect("set outlinks should succeed");
    set_outlinks(&conn, "docs/sub/b.md", &["docs/a.md".to_string()])
        .expect("set outlinks should succeed");

    remove_notes_by_prefix(&conn, "docs/").expect("prefix delete should succeed");

    let manifest = get_manifest(&conn).expect("manifest should load");
    assert_eq!(manifest.len(), 1);
    assert!(manifest.contains_key("misc/c.md"));

    let results = search(&conn, "body", SearchScope::All, 10).expect("search should succeed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].note.path, "misc/c.md");
}

#[test]
fn rename_note_path_moves_note_and_outgoing_source_links() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    let a = IndexNoteMeta {
        id: "docs/old.md".to_string(),
        path: "docs/old.md".to_string(),
        title: "Old".to_string(),
        name: "old".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    let b = IndexNoteMeta {
        id: "docs/source.md".to_string(),
        path: "docs/source.md".to_string(),
        title: "Source".to_string(),
        name: "source".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    upsert_note(&conn, &a, "body a").expect("upsert should succeed");
    upsert_note(&conn, &b, "body b").expect("upsert should succeed");
    set_outlinks(&conn, "docs/source.md", &["docs/old.md".to_string()])
        .expect("set outlinks should succeed");
    set_outlinks(&conn, "docs/old.md", &["docs/source.md".to_string()])
        .expect("set outlinks should succeed");

    rename_note_path(&conn, "docs/old.md", "docs/new.md").expect("rename should succeed");

    let backlinks = get_backlinks(&conn, "docs/new.md").expect("backlinks should load");
    assert!(backlinks.is_empty());

    let outlinks = get_outlinks(&conn, "docs/new.md").expect("outlinks should load");
    assert_eq!(outlinks.len(), 1);
    assert_eq!(outlinks[0].path, "docs/source.md");

    let orphans = get_orphan_outlinks(&conn, "docs/source.md").expect("orphans should load");
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].target_path, "docs/old.md");
    assert_eq!(orphans[0].ref_count, 1);
}

#[test]
fn suggest_planned_returns_missing_targets_ranked_by_ref_count() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    let source_a = IndexNoteMeta {
        id: "docs/source-a.md".to_string(),
        path: "docs/source-a.md".to_string(),
        title: "Source A".to_string(),
        name: "source-a".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    let source_b = IndexNoteMeta {
        id: "docs/source-b.md".to_string(),
        path: "docs/source-b.md".to_string(),
        title: "Source B".to_string(),
        name: "source-b".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    let existing = IndexNoteMeta {
        id: "docs/existing.md".to_string(),
        path: "docs/existing.md".to_string(),
        title: "Existing".to_string(),
        name: "existing".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };

    upsert_note(&conn, &source_a, "body").expect("upsert should succeed");
    upsert_note(&conn, &source_b, "body").expect("upsert should succeed");
    upsert_note(&conn, &existing, "body").expect("upsert should succeed");

    set_outlinks(
        &conn,
        "docs/source-a.md",
        &[
            "docs/planned/high.md".to_string(),
            "docs/planned/low.md".to_string(),
            "docs/existing.md".to_string(),
        ],
    )
    .expect("set outlinks should succeed");
    set_outlinks(
        &conn,
        "docs/source-b.md",
        &["docs/planned/high.md".to_string()],
    )
    .expect("set outlinks should succeed");

    let suggestions = suggest_planned(&conn, "planned", 10).expect("suggest planned should work");
    assert_eq!(suggestions.len(), 2);
    assert_eq!(suggestions[0].target_path, "docs/planned/high.md");
    assert_eq!(suggestions[0].ref_count, 2);
    assert_eq!(suggestions[1].target_path, "docs/planned/low.md");
    assert_eq!(suggestions[1].ref_count, 1);
}

#[test]
fn suggest_files_matches_filename_path_and_fuzzy_input() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    for (path, title, name) in [
        ("notes/meeting-notes.md", "Meeting Notes", "meeting-notes"),
        ("projects/roadmap-2026.md", "Roadmap 2026", "roadmap-2026"),
        ("archive/retrospective.md", "Retrospective", "retrospective"),
    ] {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: name.to_string(),
            mtime_ms: 100,
            size_bytes: 10,
        };
        upsert_note(&conn, &meta, "body").expect("upsert should succeed");
    }

    let substring_hits = suggest_files(&conn, "road", 10).expect("file suggest should work");
    assert_eq!(substring_hits[0].note.path, "projects/roadmap-2026.md");

    let fuzzy_hits = suggest_files(&conn, "mtn", 10).expect("fuzzy suggest should work");
    assert_eq!(fuzzy_hits[0].note.path, "notes/meeting-notes.md");

    let path_hits = suggest_files(&conn, "archive/retro", 10).expect("path suggest should work");
    assert_eq!(path_hits[0].note.path, "archive/retrospective.md");
}

#[test]
fn sync_progress_advances_when_some_files_are_unreadable() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db(root).expect("db should open");

    write_md(root, "ok.md", "# ok");
    fs::write(root.join("bad.md"), [0xff, 0xfe, 0xfd]).expect("bad file should be written");

    let cancel = AtomicBool::new(false);
    let progress_points: RefCell<Vec<(usize, usize)>> = RefCell::new(Vec::new());
    let result = sync_index(
        &conn,
        root,
        &cancel,
        &|indexed, total| progress_points.borrow_mut().push((indexed, total)),
        &mut || {},
    )
    .expect("sync should succeed");

    assert!(progress_points
        .borrow()
        .iter()
        .any(|(indexed, _)| *indexed > 0));
    assert_eq!(result.indexed, 2);
    assert_eq!(result.total, 2);
    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("ok.md"));
}

#[test]
fn rebuild_resolves_batch_outlinks_before_yield() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db(root).expect("db should open");

    write_md(root, "notes/000-target.md", "# target");
    write_md(root, "notes/001-source.md", "[target](./000-target.md)");
    for i in 0..100 {
        write_md(root, &format!("notes/{:03}-filler.md", i + 2), "# filler");
    }

    let cancel = AtomicBool::new(false);
    let mut first_yield_checked = false;
    rebuild_index(&conn, root, &cancel, &|_, _| {}, &mut || {
        if first_yield_checked {
            return;
        }
        let outlinks = get_outlinks(&conn, "notes/001-source.md").expect("outlinks should load");
        assert_eq!(outlinks.len(), 1);
        assert_eq!(outlinks[0].path, "notes/000-target.md");
        first_yield_checked = true;
    })
    .expect("rebuild should succeed");

    assert!(first_yield_checked);
}

#[test]
fn link_target_parsers_cover_spaces_aliases_and_wikilinks() {
    let gfm = gfm_link_targets("[Doc](<Folder Name/child note.md>)", "root.md");
    assert_eq!(gfm, vec!["Folder Name/child note.md".to_string()]);

    let wiki = wiki_link_targets("[[Folder Name/child note#Heading|Alias Label]]", "root.md");
    assert_eq!(wiki, vec!["Folder Name/child note.md".to_string()]);

    let combined = internal_link_targets(
        "[A](./gfm%20target.md) [[wiki target]] ![[embedded]]",
        "docs/source.md",
    );
    assert_eq!(
        combined,
        vec![
            "docs/gfm target.md".to_string(),
            "wiki target.md".to_string()
        ]
    );
}

#[test]
fn rename_folder_paths_escapes_like_wildcards() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    let a = IndexNoteMeta {
        id: "old_50%/a.md".to_string(),
        path: "old_50%/a.md".to_string(),
        title: "A".to_string(),
        name: "a".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    let b = IndexNoteMeta {
        id: "old_500/b.md".to_string(),
        path: "old_500/b.md".to_string(),
        title: "B".to_string(),
        name: "b".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    };
    upsert_note(&conn, &a, "body a").expect("upsert should succeed");
    upsert_note(&conn, &b, "body b").expect("upsert should succeed");

    let renamed = rename_folder_paths(&conn, "old_50%/", "new/").expect("rename should succeed");
    assert_eq!(renamed, 1);

    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("new/a.md"));
    assert!(manifest.contains_key("old_500/b.md"));
    assert!(!manifest.contains_key("old_50%/a.md"));
}

#[test]
fn list_note_paths_by_prefix_respects_folder_boundary() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    let notes = vec![
        ("docs/a.md", "A", "a", "body a"),
        ("docs/sub/b.md", "B", "b", "body b"),
        ("docs2/c.md", "C", "c", "body c"),
    ];
    for (path, title, name, body) in &notes {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: name.to_string(),
            mtime_ms: 100,
            size_bytes: 10,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    }

    let paths =
        list_note_paths_by_prefix(&conn, "docs/").expect("list by prefix should succeed");
    assert_eq!(
        paths,
        vec!["docs/a.md".to_string(), "docs/sub/b.md".to_string()]
    );
}

// Two profiles on one vault are two connections on one search.db. The other
// one keeps rewriting the outlinks of the same notes the index run is writing.
fn index_while_another_connection_writes_the_same_outlinks(index: IndexFn) {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let source_paths: Vec<String> = (0..100).map(|i| format!("n{i:03}.md")).collect();
    for source in &source_paths {
        write_md(root, source, "[a](./target-a.md) [b](./target-b.md)");
    }
    let index_conn = open_search_db(root).expect("db should open");
    let other_conn = open_search_db(root).expect("second connection should open");
    // Fail at once while the index run holds the lock, so this connection
    // takes the lock the moment it is free.
    other_conn
        .busy_timeout(Duration::ZERO)
        .expect("busy timeout should be set");

    let stop = Arc::new(AtomicBool::new(false));
    let other_stop = Arc::clone(&stop);
    let other_sources = source_paths.clone();
    let other_writer = thread::spawn(move || {
        let targets = vec!["target-a.md".to_string(), "target-b.md".to_string()];
        while !other_stop.load(Ordering::Relaxed) {
            let written = in_write_transaction(&other_conn, || {
                for source in &other_sources {
                    set_outlinks(&other_conn, source, &targets)?;
                }
                Ok(())
            });
            if written.is_ok() {
                // Leave gaps in the lock, or the index run's busy handler,
                // which only polls now and then, could starve.
                thread::sleep(Duration::from_millis(2));
            }
        }
    });

    let cancel = AtomicBool::new(false);
    let result = index(&index_conn, root, &cancel, &|_, _| {}, &mut || {});
    stop.store(true, Ordering::Relaxed);
    other_writer
        .join()
        .expect("other connection thread should not panic");

    result.expect("index run should succeed");
    for source in &source_paths {
        let orphans = get_orphan_outlinks(&index_conn, source).expect("outlinks should load");
        let targets: Vec<&str> = orphans.iter().map(|o| o.target_path.as_str()).collect();
        assert_eq!(targets, ["target-a.md", "target-b.md"], "{source}");
    }
}

#[test]
fn sync_succeeds_while_another_connection_writes_the_same_outlinks() {
    index_while_another_connection_writes_the_same_outlinks(sync_index);
}

#[test]
fn rebuild_succeeds_while_another_connection_writes_the_same_outlinks() {
    index_while_another_connection_writes_the_same_outlinks(rebuild_index);
}

#[test]
fn failed_index_batch_is_rolled_back_and_frees_the_write_lock() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    write_md(root, "ok.md", "# ok");
    write_md(root, "z-bad.md", "# bad");
    let conn = open_search_db(root).expect("db should open");
    conn.execute_batch(
        "CREATE TRIGGER reject_bad_note BEFORE INSERT ON notes
         WHEN NEW.path = 'z-bad.md'
         BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
    )
    .expect("trigger should be created");

    let cancel = AtomicBool::new(false);
    let result = sync_index(&conn, root, &cancel, &|_, _| {}, &mut || {});

    assert!(result.is_err());
    // ok.md was written before z-bad.md failed, and the rollback takes it back.
    assert!(get_manifest(&conn)
        .expect("manifest should load")
        .is_empty());
    let other_conn = open_search_db(root).expect("second connection should open");
    other_conn
        .busy_timeout(Duration::ZERO)
        .expect("busy timeout should be set");
    in_write_transaction(&other_conn, || Ok(()))
        .expect("the failed batch should not keep the write lock");
}
