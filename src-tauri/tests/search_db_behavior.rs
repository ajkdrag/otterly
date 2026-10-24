use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, get_backlinks, get_manifest, get_orphan_outlinks, get_outlinks,
    gfm_link_targets, internal_link_targets, list_note_paths_by_prefix, list_notes_with_tag,
    list_tags, open_search_db, rebuild_index, remove_note, remove_notes_by_prefix,
    rename_folder_paths, rename_note_path, search, set_note_tags, set_outlinks, suggest_files,
    suggest_planned, sync_index, upsert_note, wiki_link_targets,
};
use crate::features::search::model::{IndexNoteMeta, SearchScope};
use crate::features::search::tag_parser::NoteTag;
use crate::shared::constants;
use rusqlite::Connection;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

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

fn note_meta(path: &str) -> IndexNoteMeta {
    IndexNoteMeta {
        id: path.to_string(),
        path: path.to_string(),
        title: path.to_string(),
        name: path.to_string(),
        mtime_ms: 100,
        size_bytes: 10,
    }
}

fn note_tag(tag: &str) -> NoteTag {
    NoteTag {
        tag: tag.to_string(),
        excerpt: None,
    }
}

fn tag_counts(conn: &Connection) -> Vec<(String, usize)> {
    list_tags(conn)
        .expect("tags should load")
        .into_iter()
        .map(|entry| (entry.tag, entry.count))
        .collect()
}

fn paths_with_tag(conn: &Connection, tag: &str) -> Vec<String> {
    list_notes_with_tag(conn, tag)
        .expect("tagged notes should load")
        .into_iter()
        .map(|entry| entry.note.path)
        .collect()
}

fn run_sync(conn: &Connection, root: &Path) {
    sync_index(conn, root, &AtomicBool::new(false), &|_, _| {}, &mut || {})
        .expect("sync should succeed");
}

#[test]
fn sync_indexes_tags_and_counts_them_case_insensitively() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db(root).expect("db should open");

    let older = write_md(root, "older.md", "Plan the week #Work and #home");
    let newer = write_md(root, "newer.md", "Ship it #work");
    write_md(root, "plain.md", "no tags here");
    set_mtime(&older, 0);
    set_mtime(&newer, 60);

    run_sync(&conn, root);

    assert_eq!(
        tag_counts(&conn),
        vec![("home".to_string(), 1), ("Work".to_string(), 2)]
    );
    let tagged = list_notes_with_tag(&conn, "WORK").expect("tagged notes should load");
    let tagged_paths: Vec<&str> = tagged
        .iter()
        .map(|entry| entry.note.path.as_str())
        .collect();
    assert_eq!(tagged_paths, vec!["newer.md", "older.md"]);
    assert_eq!(
        tagged[1].excerpt.as_deref(),
        Some("Plan the week #Work and #home")
    );
}

#[test]
fn resync_of_a_modified_note_replaces_its_tags() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db(root).expect("db should open");

    let note = write_md(root, "note.md", "#draft");
    set_mtime(&note, 0);
    run_sync(&conn, root);

    write_md(root, "note.md", "#final version");
    set_mtime(&note, 60);
    run_sync(&conn, root);

    assert_eq!(tag_counts(&conn), vec![("final".to_string(), 1)]);
}

#[test]
fn remove_note_and_remove_by_prefix_drop_their_tags() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    for path in ["a.md", "docs/b.md", "docs/sub/c.md", "keep/d.md"] {
        upsert_note(&conn, &note_meta(path), "body").expect("upsert should succeed");
        set_note_tags(&conn, path, &[note_tag("t")]).expect("tags should be set");
    }

    remove_note(&conn, "a.md").expect("remove should succeed");
    remove_notes_by_prefix(&conn, "docs/").expect("prefix remove should succeed");

    assert_eq!(paths_with_tag(&conn, "t"), vec!["keep/d.md".to_string()]);
    assert_eq!(tag_counts(&conn), vec![("t".to_string(), 1)]);
}

#[test]
fn rename_note_and_rename_folder_move_tags() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    for path in ["old.md", "folder/inner.md"] {
        upsert_note(&conn, &note_meta(path), "body").expect("upsert should succeed");
        set_note_tags(&conn, path, &[note_tag("t")]).expect("tags should be set");
    }

    rename_note_path(&conn, "old.md", "new.md").expect("rename should succeed");
    rename_folder_paths(&conn, "folder/", "moved/").expect("folder rename should succeed");

    let mut paths = paths_with_tag(&conn, "t");
    paths.sort();
    assert_eq!(
        paths,
        vec!["moved/inner.md".to_string(), "new.md".to_string()]
    );
}

#[test]
fn rename_folder_with_non_ascii_name_keeps_paths_intact() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    upsert_note(&conn, &note_meta("日本/a.md"), "body").expect("upsert should succeed");
    set_note_tags(&conn, "日本/a.md", &[note_tag("t")]).expect("tags should be set");

    rename_folder_paths(&conn, "日本/", "nihon/").expect("folder rename should succeed");

    assert_eq!(paths_with_tag(&conn, "t"), vec!["nihon/a.md".to_string()]);
    assert!(get_manifest(&conn)
        .expect("manifest should load")
        .contains_key("nihon/a.md"));
}

#[test]
fn db_from_before_tags_gets_its_manifest_cleared_once() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    fs::create_dir_all(root.join(constants::APP_DIR)).expect("app dir should be created");
    let old_db = Connection::open(root.join(constants::APP_DIR).join("search.db"))
        .expect("old db should open");
    old_db
        .execute_batch(
            "CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT NOT NULL,
                                 mtime_ms INTEGER NOT NULL, size_bytes INTEGER NOT NULL);
             CREATE VIRTUAL TABLE notes_fts USING fts5(title, name, path, body);
             CREATE TABLE outlinks (source_path TEXT NOT NULL, target_path TEXT NOT NULL,
                                    PRIMARY KEY (source_path, target_path));
             INSERT INTO notes VALUES ('old.md', 'Old', 1, 1);",
        )
        .expect("old schema should be created");
    drop(old_db);

    let conn = open_search_db(root).expect("db should open");
    assert!(get_manifest(&conn)
        .expect("manifest should load")
        .is_empty());
    assert!(tag_counts(&conn).is_empty());

    upsert_note(&conn, &note_meta("new.md"), "body").expect("upsert should succeed");
    drop(conn);
    let reopened = open_search_db(root).expect("db should reopen");
    assert!(get_manifest(&reopened)
        .expect("manifest should load")
        .contains_key("new.md"));
}
