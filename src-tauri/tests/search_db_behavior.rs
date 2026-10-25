use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, get_backlinks, get_manifest, get_orphan_outlinks, get_outlinks,
    gfm_link_targets, in_write_transaction, internal_link_targets, list_note_paths_by_prefix,
    list_tagged_paths, list_tags, open_search_db, rebuild_index, remove_note,
    remove_notes_by_prefix, rename_folder_paths, rename_note_path, search, search_tagged_notes,
    set_note_tags, set_outlinks, suggest_files, suggest_planned, suggest_tags, sync_index,
    upsert_note, wiki_link_targets, IndexResult, TagMatch, TagNotePage, TagNoteQuery,
};
use crate::features::search::model::{IndexNoteMeta, SearchScope};
use crate::features::search::tag_parser::{NoteTag, TAG_PARSER_VERSION};
use crate::shared::constants;
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

    let paths = list_note_paths_by_prefix(&conn, "docs/").expect("list by prefix should succeed");
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

fn tagged_page(conn: &Connection, tags: &[&str], r#match: TagMatch, text: &str) -> TagNotePage {
    let query = TagNoteQuery {
        tags: tags.iter().map(|tag| tag.to_string()).collect(),
        r#match,
        text: text.to_string(),
        limit: 50,
    };
    search_tagged_notes(conn, &query).expect("tagged notes should load")
}

fn page_paths(page: &TagNotePage) -> Vec<&str> {
    page.notes
        .iter()
        .map(|hit| hit.note.path.as_str())
        .collect()
}

fn paths_with_tag(conn: &Connection, tag: &str) -> Vec<String> {
    tagged_page(conn, &[tag], TagMatch::All, "")
        .notes
        .into_iter()
        .map(|hit| hit.note.path)
        .collect()
}

// Each note gets its own mtime, later notes are newer.
fn add_tagged_notes(conn: &Connection, notes: &[(&str, &str, &[&str])]) {
    for (idx, (path, body, tags)) in notes.iter().enumerate() {
        let meta = IndexNoteMeta {
            mtime_ms: 100 + idx as i64,
            ..note_meta(path)
        };
        upsert_note(conn, &meta, body).expect("upsert should succeed");
        let note_tags: Vec<NoteTag> = tags.iter().map(|tag| note_tag(tag)).collect();
        set_note_tags(conn, path, &note_tags).expect("tags should be set");
    }
}

fn suggested(conn: &Connection, partial: &str, exclude: &[&str]) -> Vec<String> {
    let exclude: Vec<String> = exclude.iter().map(|tag| tag.to_string()).collect();
    suggest_tags(conn, partial, &exclude, 10)
        .expect("suggestions should load")
        .into_iter()
        .map(|entry| entry.tag)
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
    let tagged = tagged_page(&conn, &["WORK"], TagMatch::All, "");
    assert_eq!(page_paths(&tagged), vec!["newer.md", "older.md"]);
    assert_eq!(
        tagged.notes[1].snippet.as_deref(),
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
fn tag_counts_skip_rows_whose_note_is_gone() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");

    upsert_note(&conn, &note_meta("a.md"), "body").expect("upsert should succeed");
    set_note_tags(&conn, "a.md", &[note_tag("t")]).expect("tags should be set");
    // An older build deletes notes without touching note_tags.
    set_note_tags(&conn, "ghost.md", &[note_tag("t")]).expect("tags should be set");

    assert_eq!(tag_counts(&conn), vec![("t".to_string(), 1)]);
    let page = tagged_page(&conn, &["t"], TagMatch::All, "");
    assert_eq!(page_paths(&page), vec!["a.md"]);
    assert_eq!(page.total, 1);
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

fn stored_tag_rows(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM note_tags", [], |row| row.get(0))
        .expect("tag rows should be counted")
}

#[test]
fn index_from_older_tag_parser_rules_is_rebuilt_on_open() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    write_md(root, "note.md", "Ship it #release");
    let conn = open_search_db(root).expect("db should open");
    run_sync(&conn, root);
    assert_eq!(tag_counts(&conn), vec![("release".to_string(), 1)]);

    // Same parser version: a reopen leaves the manifest and the tags alone.
    set_note_tags(&conn, "note.md", &[note_tag("kept")]).expect("tags should be set");
    drop(conn);
    let conn = open_search_db(root).expect("db should reopen");
    assert!(get_manifest(&conn)
        .expect("manifest should load")
        .contains_key("note.md"));
    assert_eq!(tag_counts(&conn), vec![("kept".to_string(), 1)]);

    // Older parser version: the manifest and the tags go, and sync parses again.
    conn.pragma_update(None, "user_version", TAG_PARSER_VERSION - 1)
        .expect("version should be set");
    drop(conn);
    let conn = open_search_db(root).expect("db should reopen");
    assert!(get_manifest(&conn)
        .expect("manifest should load")
        .is_empty());
    assert_eq!(stored_tag_rows(&conn), 0);

    run_sync(&conn, root);
    assert_eq!(tag_counts(&conn), vec![("release".to_string(), 1)]);
}

#[test]
fn tagged_search_all_needs_every_tag_and_any_needs_one() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(
        &conn,
        &[
            ("both.md", "", &["x", "y"]),
            ("only_x.md", "", &["x"]),
            ("only_y.md", "", &["y"]),
            ("neither.md", "", &["z"]),
        ],
    );

    let all = tagged_page(&conn, &["x", "y"], TagMatch::All, "");
    assert_eq!(page_paths(&all), vec!["both.md"]);
    assert_eq!(all.total, 1);

    let any = tagged_page(&conn, &["x", "y"], TagMatch::Any, "");
    assert_eq!(page_paths(&any), vec!["only_y.md", "only_x.md", "both.md"]);
    assert_eq!(any.total, 3);
    assert!(any.notes.iter().all(|hit| hit.match_detail.is_none()));
}

#[test]
fn tagged_paths_for_vault_find_follow_all_any_and_tag_keys() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(
        &conn,
        &[
            ("both.md", "", &["x", "Caf\u{e9}"]),
            ("only_x.md", "", &["x"]),
            ("only_cafe.md", "", &["cafe\u{301}"]),
            ("neither.md", "", &["z"]),
        ],
    );
    let tagged_paths = |tags: &[&str], tag_match: TagMatch| {
        let tags: Vec<String> = tags.iter().map(|tag| tag.to_string()).collect();
        let mut paths = list_tagged_paths(&conn, &tags, tag_match).expect("paths should load");
        paths.sort();
        paths
    };

    assert_eq!(
        tagged_paths(&["X", "CAF\u{c9}"], TagMatch::All),
        ["both.md"]
    );
    assert_eq!(
        tagged_paths(&["x", "caf\u{e9}"], TagMatch::Any),
        ["both.md", "only_cafe.md", "only_x.md"]
    );
    assert_eq!(
        tagged_paths(&["x", "X"], TagMatch::All),
        ["both.md", "only_x.md"]
    );
    assert!(tagged_paths(&[], TagMatch::Any).is_empty());
}

#[test]
fn tagged_search_with_text_lists_file_hits_before_content_hits() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(
        &conn,
        &[
            ("roadmap.md", "the kickoff is in May", &["p"]),
            ("kickoff.md", "first notes", &["p"]),
            ("untagged_kickoff.md", "kickoff kickoff", &[]),
            ("other.md", "nothing here", &["p"]),
        ],
    );
    // A title hit whose body also matches is listed once, as a title hit.
    let meeting = IndexNoteMeta {
        title: "Kickoff".to_string(),
        name: "2024-05-01".to_string(),
        mtime_ms: 50,
        ..note_meta("meetings/2024-05-01.md")
    };
    upsert_note(&conn, &meeting, "kickoff agenda").expect("upsert should succeed");
    set_note_tags(&conn, &meeting.path, &[note_tag("p")]).expect("tags should be set");

    let page = tagged_page(&conn, &["p"], TagMatch::All, "Kickoff");
    let found: Vec<(&str, Option<&str>)> = page
        .notes
        .iter()
        .map(|hit| (hit.note.path.as_str(), hit.match_detail))
        .collect();
    assert_eq!(
        found,
        vec![
            ("kickoff.md", Some("filename")),
            ("meetings/2024-05-01.md", Some("title")),
            ("roadmap.md", Some("content")),
        ]
    );
    let content_snippet = page.notes[2]
        .snippet
        .as_deref()
        .expect("content hits have a snippet");
    assert!(content_snippet.contains("kickoff"));
    assert!(!content_snippet.contains('<'));
    assert_eq!(page.total, 3);
    assert!(!page.truncated);
}

// FTS5 applies a `body :` filter to the phrase right after it only, so a
// second word that sits in the title must not make a content hit.
#[test]
fn tagged_search_content_hits_need_every_word_in_the_body() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    let titled = IndexNoteMeta {
        title: "Notes".to_string(),
        ..note_meta("c.md")
    };
    upsert_note(&conn, &titled, "start here").expect("upsert should succeed");
    set_note_tags(&conn, "c.md", &[note_tag("p")]).expect("tags should be set");

    let page = tagged_page(&conn, &["p"], TagMatch::All, "start notes");
    assert!(page.notes.is_empty());

    let in_body = tagged_page(&conn, &["p"], TagMatch::All, "start here");
    assert_eq!(page_paths(&in_body), vec!["c.md"]);
}

#[test]
fn scoped_search_needs_every_word_in_the_scoped_column() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    let titled = IndexNoteMeta {
        title: "Notes".to_string(),
        ..note_meta("c.md")
    };
    upsert_note(&conn, &titled, "start here").expect("upsert should succeed");
    let other = IndexNoteMeta {
        title: "Start".to_string(),
        ..note_meta("d.md")
    };
    upsert_note(&conn, &other, "notes here").expect("upsert should succeed");

    // Each note has one word in its title and the other in its body.
    let hits = search(&conn, "start notes", SearchScope::Title, 10).expect("search should succeed");
    assert!(hits.is_empty());
}

#[test]
fn tagged_search_reports_total_and_truncation() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(
        &conn,
        &[
            ("a.md", "", &["t"]),
            ("b.md", "", &["t"]),
            ("c.md", "", &["t"]),
        ],
    );

    let query = |limit: usize| TagNoteQuery {
        tags: vec!["t".to_string()],
        r#match: TagMatch::All,
        text: String::new(),
        limit,
    };
    let capped = search_tagged_notes(&conn, &query(2)).expect("tagged notes should load");
    assert_eq!(page_paths(&capped), vec!["c.md", "b.md"]);
    assert_eq!(capped.total, 3);
    assert!(capped.truncated);

    let full = search_tagged_notes(&conn, &query(3)).expect("tagged notes should load");
    assert_eq!(full.notes.len(), 3);
    assert!(!full.truncated);
}

#[test]
fn tagged_search_excerpt_comes_from_the_first_tag() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    upsert_note(&conn, &note_meta("a.md"), "body").expect("upsert should succeed");
    upsert_note(&conn, &note_meta("b.md"), "body").expect("upsert should succeed");
    let excerpt_tag = |tag: &str, excerpt: &str| NoteTag {
        tag: tag.to_string(),
        excerpt: Some(excerpt.to_string()),
    };
    set_note_tags(
        &conn,
        "a.md",
        &[excerpt_tag("x", "about x"), excerpt_tag("y", "about y")],
    )
    .expect("tags should be set");
    set_note_tags(&conn, "b.md", &[excerpt_tag("x", "b about x")]).expect("tags should be set");

    let all = tagged_page(&conn, &["y", "x"], TagMatch::All, "");
    assert_eq!(all.notes[0].snippet.as_deref(), Some("about y"));

    // b.md lacks the first tag, so it shows the excerpt of the one it has.
    let any = tagged_page(&conn, &["y", "x"], TagMatch::Any, "");
    let snippets: Vec<Option<&str>> = any.notes.iter().map(|hit| hit.snippet.as_deref()).collect();
    assert_eq!(snippets, vec![Some("about y"), Some("b about x")]);
}

#[test]
fn tagged_search_folds_case_and_unicode_forms() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(&conn, &[("a.md", "", &["Caf\u{e9}"])]);

    assert_eq!(
        paths_with_tag(&conn, "CAFE\u{301}"),
        vec!["a.md".to_string()]
    );
    let duplicated = tagged_page(&conn, &["caf\u{e9}", "CAF\u{c9}"], TagMatch::All, "");
    assert_eq!(page_paths(&duplicated), vec!["a.md"]);
}

#[test]
fn suggest_tags_ranks_by_match_kind_then_count() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db(tmp.path()).expect("db should open");
    add_tagged_notes(
        &conn,
        &[
            ("1.md", "", &["improve", "project", "photo-room"]),
            ("2.md", "", &["improve", "project", "work/projects"]),
            ("3.md", "", &["improve", "project", "work/projects", "pro"]),
            ("4.md", "", &["improve", "project/otterly", "zzz"]),
        ],
    );

    assert_eq!(
        suggested(&conn, "Pro", &[]),
        vec![
            "pro",
            "project",
            "project/otterly",
            "work/projects",
            "improve",
            "photo-room"
        ]
    );
    assert_eq!(
        suggested(&conn, "pro", &["PROJECT", "pro"]),
        vec!["project/otterly", "work/projects", "improve", "photo-room"]
    );
    assert_eq!(
        suggested(&conn, "", &[]),
        vec![
            "improve",
            "project",
            "work/projects",
            "photo-room",
            "pro",
            "project/otterly",
            "zzz"
        ]
    );
    let exclude = Vec::new();
    let top_two = suggest_tags(&conn, "", &exclude, 2).expect("suggestions should load");
    assert_eq!(top_two.len(), 2);
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
