use crate::features::notes::service as notes_service;
use crate::features::search::db as search_db;
use crate::features::search::link_parser;
use crate::features::search::model::{IndexNoteMeta, SearchHit, SearchScope};
use crate::features::search::tag_parser;
use crate::shared::storage;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize)]
pub struct NoteLinksSnapshot {
    pub backlinks: Vec<IndexNoteMeta>,
    pub outlinks: Vec<IndexNoteMeta>,
    pub orphan_links: Vec<search_db::OrphanLink>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQueryInput {
    #[allow(dead_code)]
    pub raw: String,
    pub text: String,
    pub scope: SearchScope,
}

#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IndexProgressEvent {
    Started {
        vault_id: String,
        total: usize,
    },
    Progress {
        vault_id: String,
        indexed: usize,
        total: usize,
    },
    Completed {
        vault_id: String,
        indexed: usize,
        elapsed_ms: u64,
    },
    Failed {
        vault_id: String,
        error: String,
    },
}

#[allow(dead_code)]
enum DbCommand {
    UpsertNote {
        vault_root: PathBuf,
        note_id: String,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNote {
        note_id: String,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNotes {
        note_ids: Vec<String>,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNotesByPrefix {
        prefix: String,
        reply: SyncSender<Result<(), String>>,
    },
    Rebuild {
        vault_root: PathBuf,
        cancel: Arc<AtomicBool>,
        app_handle: AppHandle,
        vault_id: String,
    },
    Sync {
        vault_root: PathBuf,
        cancel: Arc<AtomicBool>,
        app_handle: AppHandle,
        vault_id: String,
    },
    RenamePaths {
        old_prefix: String,
        new_prefix: String,
        reply: SyncSender<Result<usize, String>>,
    },
    RenamePath {
        old_path: String,
        new_path: String,
        reply: SyncSender<Result<(), String>>,
    },
    Shutdown,
}

struct VaultWorker {
    write_tx: mpsc::Sender<DbCommand>,
    read_conn: Mutex<Connection>,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SearchDbState {
    workers: Mutex<HashMap<String, VaultWorker>>,
}

fn ensure_worker(app: &AppHandle, vault_id: &str) -> Result<(), String> {
    let vault_root = storage::vault_path(app, vault_id)?;
    let state = app.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    if map.contains_key(vault_id) {
        return Ok(());
    }

    let read_conn = search_db::open_search_db(&vault_root)?;
    let write_root = vault_root.clone();
    let (tx, rx) = mpsc::channel::<DbCommand>();

    std::thread::spawn(move || {
        writer_thread_loop(rx, &write_root);
    });

    let worker = VaultWorker {
        write_tx: tx,
        read_conn: Mutex::new(read_conn),
        cancel: Arc::new(AtomicBool::new(false)),
    };
    map.insert(vault_id.to_string(), worker);
    Ok(())
}

fn writer_thread_loop(rx: Receiver<DbCommand>, vault_root: &Path) {
    let conn = match search_db::open_search_db(vault_root) {
        Ok(c) => c,
        Err(e) => {
            log::error!("writer thread: open db failed: {e}");
            return;
        }
    };

    let mut notes_cache: BTreeMap<String, IndexNoteMeta> =
        match search_db::get_all_notes_from_db(&conn) {
            Ok(map) => map,
            Err(e) => {
                log::warn!("writer thread: failed to load notes cache: {e}");
                BTreeMap::new()
            }
        };

    for cmd in &rx {
        match dispatch_command(&conn, cmd, &mut notes_cache, &rx) {
            LoopAction::Continue => {}
            LoopAction::Break => break,
        }
    }
}

enum LoopAction {
    Continue,
    Break,
}

fn dispatch_command(
    conn: &Connection,
    cmd: DbCommand,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
    rx: &Receiver<DbCommand>,
) -> LoopAction {
    match cmd {
        DbCommand::UpsertNote {
            vault_root,
            note_id,
            reply,
        } => {
            let result = handle_upsert(conn, &vault_root, &note_id, notes_cache);
            if let Err(ref e) = result {
                log::warn!("writer: upsert failed for {note_id}: {e}");
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNote { note_id, reply } => {
            let result = search_db::remove_note(conn, &note_id);
            if let Err(ref e) = result {
                log::warn!("writer: remove failed for {note_id}: {e}");
            } else {
                notes_cache.remove(&note_id);
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNotes { note_ids, reply } => {
            let result = search_db::remove_notes(conn, &note_ids);
            if let Err(ref e) = result {
                log::warn!("writer: batch remove failed: {e}");
            } else {
                for id in &note_ids {
                    notes_cache.remove(id);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNotesByPrefix { prefix, reply } => {
            let result = search_db::remove_notes_by_prefix(conn, &prefix);
            if let Err(ref e) = result {
                log::warn!("writer: prefix remove failed for {prefix}: {e}");
            } else {
                let matching_keys: Vec<String> = notes_cache
                    .keys()
                    .filter(|k| k.starts_with(&prefix))
                    .cloned()
                    .collect();
                for key in matching_keys {
                    notes_cache.remove(&key);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::RenamePaths {
            old_prefix,
            new_prefix,
            reply,
        } => {
            let result = search_db::rename_folder_paths(conn, &old_prefix, &new_prefix);
            if let Ok(count) = &result {
                if *count > 0 {
                    let old_keys: Vec<String> = notes_cache
                        .keys()
                        .filter(|k| k.starts_with(&old_prefix))
                        .cloned()
                        .collect();
                    for old_key in old_keys {
                        if let Some(mut meta) = notes_cache.remove(&old_key) {
                            let new_path =
                                format!("{}{}", new_prefix, &old_key[old_prefix.len()..]);
                            meta.id = new_path.clone();
                            meta.path = new_path;
                            notes_cache.insert(meta.id.clone(), meta);
                        }
                    }
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::RenamePath {
            old_path,
            new_path,
            reply,
        } => {
            let result = search_db::rename_note_path(conn, &old_path, &new_path);
            if let Ok(()) = &result {
                if let Some(mut meta) = notes_cache.remove(&old_path) {
                    meta.id = new_path.clone();
                    meta.path = new_path.clone();
                    notes_cache.insert(new_path, meta);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::Rebuild {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        } => {
            handle_rebuild(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                rx,
                notes_cache,
            );
        }
        DbCommand::Sync {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        } => {
            handle_sync(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                rx,
                notes_cache,
            );
        }
        DbCommand::Shutdown => {
            return LoopAction::Break;
        }
    }
    LoopAction::Continue
}

fn handle_upsert(
    conn: &Connection,
    vault_root: &Path,
    note_id: &str,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) -> Result<(), String> {
    let abs = notes_service::safe_vault_abs(vault_root, note_id)?;
    // The index only holds notes. Saving or reloading another text file, like
    // a YAML config, comes through here too.
    if !notes_service::is_markdown_file(&abs) {
        return Ok(());
    }
    let markdown = match std::fs::read_to_string(&abs) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let _ = search_db::remove_note(conn, note_id);
            notes_cache.remove(note_id);
            return Ok(());
        }
        Err(e) => return Err(e.to_string()),
    };
    let meta = search_db::extract_meta(&abs, vault_root)?;

    search_db::upsert_note(conn, &meta, &markdown)?;
    search_db::set_note_tags(conn, &meta.path, &tag_parser::extract_note_tags(&markdown))?;
    notes_cache.insert(meta.path.clone(), meta.clone());

    let targets = search_db::internal_link_targets(&markdown, &meta.path);
    let mut resolved: BTreeSet<String> = BTreeSet::new();
    for target in targets {
        if target != meta.path {
            resolved.insert(target);
        }
    }
    search_db::set_outlinks(conn, &meta.path, &resolved.into_iter().collect::<Vec<_>>())
}

type IndexFn = fn(
    &Connection,
    &Path,
    &AtomicBool,
    &dyn Fn(usize, usize),
    &mut dyn FnMut(),
) -> Result<search_db::IndexResult, String>;

fn run_index_op(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
    label: &str,
    index_fn: IndexFn,
) {
    let start = Instant::now();
    let vid = vault_id.to_string();
    let app = app_handle.clone();
    let deferred: RefCell<Vec<DbCommand>> = RefCell::new(Vec::new());
    let started_emitted: RefCell<bool> = RefCell::new(false);
    let mut queued_sync_from_mutation = false;

    let result = {
        let mut drain_pending = || {
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    DbCommand::Rebuild { .. } | DbCommand::Sync { .. } => {
                        deferred.borrow_mut().push(cmd);
                    }
                    DbCommand::Shutdown => {
                        log::warn!("writer: deferring shutdown during {label}");
                        deferred.borrow_mut().push(cmd);
                    }
                    DbCommand::UpsertNote { .. }
                    | DbCommand::RemoveNote { .. }
                    | DbCommand::RemoveNotes { .. }
                    | DbCommand::RemoveNotesByPrefix { .. }
                    | DbCommand::RenamePaths { .. }
                    | DbCommand::RenamePath { .. } => {
                        cancel.store(true, Ordering::Relaxed);
                        dispatch_command(conn, cmd, notes_cache, rx);

                        if queued_sync_from_mutation {
                            continue;
                        }

                        match create_next_sync_cancel_token(app_handle, vault_id) {
                            Ok(next_cancel) => {
                                deferred.borrow_mut().push(DbCommand::Sync {
                                    vault_root: vault_root.to_path_buf(),
                                    cancel: next_cancel,
                                    app_handle: app_handle.clone(),
                                    vault_id: vault_id.to_string(),
                                });
                                queued_sync_from_mutation = true;
                            }
                            Err(error) => {
                                log::warn!(
                                    "writer: failed to queue deferred sync after mutation: {error}"
                                );
                            }
                        }
                    }
                }
            }
        };

        index_fn(
            conn,
            vault_root,
            cancel,
            &|indexed, total| {
                if !*started_emitted.borrow() {
                    *started_emitted.borrow_mut() = true;
                    let _ = app.emit(
                        "index_progress",
                        IndexProgressEvent::Started {
                            vault_id: vid.clone(),
                            total,
                        },
                    );
                } else {
                    let _ = app.emit(
                        "index_progress",
                        IndexProgressEvent::Progress {
                            vault_id: vid.clone(),
                            indexed,
                            total,
                        },
                    );
                }
            },
            &mut drain_pending,
        )
    };

    match result {
        Ok(res) => {
            let elapsed_ms = start.elapsed().as_millis() as u64;
            let _ = app_handle.emit(
                "index_progress",
                IndexProgressEvent::Completed {
                    vault_id: vid.clone(),
                    indexed: res.indexed,
                    elapsed_ms,
                },
            );
        }
        Err(e) => {
            log::error!("{label} failed: {e}");
            let _ = app_handle.emit(
                "index_progress",
                IndexProgressEvent::Failed {
                    vault_id: vid.clone(),
                    error: e,
                },
            );
        }
    }

    match search_db::get_all_notes_from_db(conn) {
        Ok(map) => *notes_cache = map,
        Err(e) => log::warn!("writer: failed to reload notes cache after {label}: {e}"),
    }

    for cmd in deferred.into_inner() {
        if matches!(
            dispatch_command(conn, cmd, notes_cache, rx),
            LoopAction::Break
        ) {
            break;
        }
    }
}

fn create_next_sync_cancel_token(
    app_handle: &AppHandle,
    vault_id: &str,
) -> Result<Arc<AtomicBool>, String> {
    let next_cancel = Arc::new(AtomicBool::new(false));
    let state = app_handle.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    let Some(worker) = map.get_mut(vault_id) else {
        return Err(format!("vault worker not found: {vault_id}"));
    };
    worker.cancel = Arc::clone(&next_cancel);
    Ok(next_cancel)
}

fn handle_rebuild(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) {
    run_index_op(
        conn,
        vault_root,
        cancel,
        app_handle,
        vault_id,
        rx,
        notes_cache,
        "rebuild",
        search_db::rebuild_index,
    );
}

fn handle_sync(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) {
    run_index_op(
        conn,
        vault_root,
        cancel,
        app_handle,
        vault_id,
        rx,
        notes_cache,
        "sync",
        search_db::sync_index,
    );
}

fn with_read_conn<F, T>(app: &AppHandle, vault_id: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    with_worker(app, vault_id, |worker| {
        let conn = worker.read_conn.lock().map_err(|e| e.to_string())?;
        f(&conn)
    })
}

fn send_write(app: &AppHandle, vault_id: &str, cmd: DbCommand) -> Result<(), String> {
    with_worker(app, vault_id, |worker| {
        worker.write_tx.send(cmd).map_err(|e| e.to_string())
    })
}

fn with_worker<F, T>(app: &AppHandle, vault_id: &str, operation: F) -> Result<T, String>
where
    F: FnOnce(&VaultWorker) -> Result<T, String>,
{
    ensure_worker(app, vault_id)?;
    let state = app.state::<SearchDbState>();
    let map = state.workers.lock().map_err(|e| e.to_string())?;
    let worker = map.get(vault_id).ok_or("vault worker not found")?;
    operation(worker)
}

fn with_worker_mut<F, T>(app: &AppHandle, vault_id: &str, operation: F) -> Result<T, String>
where
    F: FnOnce(&mut VaultWorker) -> Result<T, String>,
{
    ensure_worker(app, vault_id)?;
    let state = app.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    let worker = map.get_mut(vault_id).ok_or("vault worker not found")?;
    operation(worker)
}

fn send_write_reply<T>(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(SyncSender<Result<T, String>>) -> DbCommand,
) -> Result<T, String> {
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    let cmd = make_cmd(reply_tx);
    send_write(app, vault_id, cmd)?;
    reply_rx.recv().map_err(|e| e.to_string())?
}

fn send_write_blocking(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(SyncSender<Result<(), String>>) -> DbCommand,
) -> Result<(), String> {
    send_write_reply(app, vault_id, make_cmd)
}

fn replace_worker_cancel_token(app: &AppHandle, vault_id: &str) -> Result<Arc<AtomicBool>, String> {
    let next_cancel = Arc::new(AtomicBool::new(false));
    with_worker_mut(app, vault_id, |worker| {
        worker.cancel.store(true, Ordering::Relaxed);
        worker.cancel = Arc::clone(&next_cancel);
        Ok(())
    })?;
    Ok(next_cancel)
}

fn enqueue_index_command(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(PathBuf, Arc<AtomicBool>, AppHandle, String) -> DbCommand,
) -> Result<(), String> {
    let vault_root = storage::vault_path(app, vault_id)?;
    let cancel = replace_worker_cancel_token(app, vault_id)?;
    let cmd = make_cmd(vault_root, cancel, app.clone(), vault_id.to_string());
    send_write(app, vault_id, cmd)
}

#[tauri::command]
pub fn index_build(app: AppHandle, vault_id: String) -> Result<(), String> {
    log::info!("Building index vault_id={}", vault_id);
    enqueue_index_command(&app, &vault_id, |vault_root, cancel, app_handle, vault_id| {
        DbCommand::Sync {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        }
    })
}

#[tauri::command]
pub fn index_cancel(app: AppHandle, vault_id: String) -> Result<(), String> {
    with_worker(&app, &vault_id, |worker| {
        worker.cancel.store(true, Ordering::Relaxed);
        Ok(())
    })
}

#[tauri::command]
pub fn index_rebuild(app: AppHandle, vault_id: String) -> Result<(), String> {
    log::info!("Rebuilding index vault_id={}", vault_id);
    enqueue_index_command(&app, &vault_id, |vault_root, cancel, app_handle, vault_id| {
        DbCommand::Rebuild {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        }
    })
}

#[tauri::command]
pub fn index_search(
    app: AppHandle,
    vault_id: String,
    query: SearchQueryInput,
) -> Result<Vec<SearchHit>, String> {
    log::debug!("Searching index vault_id={} query={}", vault_id, query.text);
    with_read_conn(&app, &vault_id, |conn| {
        search_db::search(conn, &query.text, query.scope, 50)
    })
}

#[tauri::command]
pub fn index_suggest(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<search_db::SuggestionHit>, String> {
    log::debug!(
        "Suggesting from index vault_id={} query={}",
        vault_id,
        query
    );
    with_read_conn(&app, &vault_id, |conn| {
        search_db::suggest(conn, &query, limit.unwrap_or(15))
    })
}

#[tauri::command]
pub fn index_suggest_files(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<search_db::SuggestionHit>, String> {
    log::debug!(
        "Suggesting files from index vault_id={} query={}",
        vault_id,
        query
    );
    with_read_conn(&app, &vault_id, |conn| {
        search_db::suggest_files(conn, &query, limit.unwrap_or(15))
    })
}

#[tauri::command]
pub fn index_suggest_planned(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<search_db::PlannedSuggestionHit>, String> {
    log::debug!(
        "Suggesting planned links from index vault_id={} query={}",
        vault_id,
        query
    );
    with_read_conn(&app, &vault_id, |conn| {
        search_db::suggest_planned(conn, &query, limit.unwrap_or(15))
    })
}

#[tauri::command]
pub fn index_list_note_paths_by_prefix(
    app: AppHandle,
    vault_id: String,
    prefix: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::list_note_paths_by_prefix(conn, &prefix)
    })
}

#[tauri::command]
pub fn index_upsert_note(app: AppHandle, vault_id: String, note_id: String) -> Result<(), String> {
    let vault_root = storage::vault_path(&app, &vault_id)?;
    send_write_blocking(&app, &vault_id, |reply| DbCommand::UpsertNote {
        vault_root,
        note_id,
        reply,
    })
}

#[tauri::command]
pub fn index_remove_note(app: AppHandle, vault_id: String, note_id: String) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNote {
        note_id,
        reply,
    })
}

#[tauri::command]
pub fn index_remove_notes(
    app: AppHandle,
    vault_id: String,
    note_ids: Vec<String>,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNotes {
        note_ids,
        reply,
    })
}

#[tauri::command]
pub fn index_remove_notes_by_prefix(
    app: AppHandle,
    vault_id: String,
    prefix: String,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNotesByPrefix {
        prefix,
        reply,
    })
}

#[tauri::command]
pub fn index_rename_folder(
    app: AppHandle,
    vault_id: String,
    old_prefix: String,
    new_prefix: String,
) -> Result<usize, String> {
    send_write_reply(&app, &vault_id, |reply| DbCommand::RenamePaths {
        old_prefix,
        new_prefix,
        reply,
    })
}

#[tauri::command]
pub fn index_rename_note(
    app: AppHandle,
    vault_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RenamePath {
        old_path,
        new_path,
        reply,
    })
}

#[tauri::command]
pub fn index_note_links_snapshot(
    app: AppHandle,
    vault_id: String,
    note_id: String,
) -> Result<NoteLinksSnapshot, String> {
    with_read_conn(&app, &vault_id, |conn| {
        Ok(NoteLinksSnapshot {
            backlinks: search_db::get_backlinks(conn, &note_id)?,
            outlinks: search_db::get_outlinks(conn, &note_id)?,
            orphan_links: search_db::get_orphan_outlinks(conn, &note_id)?,
        })
    })
}

// Async (thread pool): the tag pane reloads this on every note switch.
#[tauri::command(async)]
pub fn index_list_tags(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<search_db::TagCount>, String> {
    with_read_conn(&app, &vault_id, search_db::list_tags)
}

// Async (thread pool): the omnibar runs this on every keystroke in tag mode.
#[tauri::command(async)]
pub fn index_search_tagged_notes(
    app: AppHandle,
    vault_id: String,
    query: search_db::TagNoteQuery,
) -> Result<search_db::TagNotePage, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::search_tagged_notes(conn, &query)
    })
}

// Async (thread pool): the omnibar and the editor's completion ask on every keystroke.
#[tauri::command(async)]
pub fn index_suggest_tags(
    app: AppHandle,
    vault_id: String,
    partial: String,
    exclude: Vec<String>,
    limit: usize,
) -> Result<Vec<search_db::TagCount>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::suggest_tags(conn, &partial, &exclude, limit)
    })
}

// Pure, like rewrite_note_links: the right rail asks about unsaved editor
// text, so there is no vault or index involved. It sends tag names only,
// the rail does not show excerpts.
//
// `async` makes Tauri run this plain fn on its thread pool. A sync command
// runs on the main thread, and this parses the whole note on every typing
// pause while the rail is open.
//
// @Speed: The rail also calls index_extract_local_note_links, which parses the
// same text again, and the note crosses IPC twice. One command returning links
// and tags would halve both.
#[tauri::command(async)]
pub fn extract_note_tags(markdown: String) -> Vec<String> {
    tag_parser::extract_note_tags(&markdown)
        .into_iter()
        .map(|note_tag| note_tag.tag)
        .collect()
}

#[tauri::command]
pub fn index_extract_local_note_links(
    app: AppHandle,
    vault_id: String,
    note_id: String,
    markdown: String,
) -> Result<search_db::LocalLinksSnapshot, String> {
    with_read_conn(&app, &vault_id, |_conn| {
        Ok(search_db::extract_local_links_snapshot(&markdown, &note_id))
    })
}

#[tauri::command]
pub fn rewrite_note_links(
    markdown: String,
    old_source_path: String,
    new_source_path: String,
    target_map: HashMap<String, String>,
) -> link_parser::RewriteResult {
    link_parser::rewrite_links(&markdown, &old_source_path, &new_source_path, &target_map)
}

#[tauri::command]
pub fn resolve_note_link(source_path: String, raw_target: String) -> Option<String> {
    link_parser::resolve_wiki_target(&source_path, &raw_target)
}
