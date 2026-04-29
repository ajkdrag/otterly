use std::path::Path;

use rusqlite::Connection;

use super::types::{SessionStats, StatsHistory, VaultOverview};
use crate::shared::constants::APP_DIR;

pub fn open_stats_db(vault_root: &Path) -> Result<Connection, String> {
    let db_dir = vault_root.join(APP_DIR);
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = db_dir.join("stats.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds INTEGER,
            folders_count INTEGER NOT NULL DEFAULT 0,
            files_count INTEGER NOT NULL DEFAULT 0,
            files_opened INTEGER NOT NULL DEFAULT 0,
            files_read_complete INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS file_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            event_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );
        CREATE INDEX IF NOT EXISTS idx_file_events_session ON file_events(session_id);",
    )
    .map_err(|e| e.to_string())
}

pub fn create_session(
    conn: &Connection,
    session_id: &str,
    started_at: &str,
    folders_count: i64,
    files_count: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO sessions (session_id, started_at, folders_count, files_count) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![session_id, started_at, folders_count, files_count],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn end_session(conn: &Connection, session_id: &str, ended_at: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sessions SET ended_at = ?2, duration_seconds = (strftime('%s', ?2) - strftime('%s', started_at)) WHERE session_id = ?1",
        rusqlite::params![session_id, ended_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_file_opened(
    conn: &Connection,
    session_id: &str,
    file_path: &str,
    created_at: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO file_events (session_id, file_path, event_type, created_at) VALUES (?1, ?2, 'opened', ?3)",
        rusqlite::params![session_id, file_path, created_at],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET files_opened = (SELECT COUNT(DISTINCT file_path) FROM file_events WHERE session_id = ?1 AND event_type = 'opened') WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_file_read_complete(
    conn: &Connection,
    session_id: &str,
    file_path: &str,
    created_at: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO file_events (session_id, file_path, event_type, created_at) VALUES (?1, ?2, 'read_complete', ?3)",
        rusqlite::params![session_id, file_path, created_at],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET files_read_complete = (SELECT COUNT(DISTINCT file_path) FROM file_events WHERE session_id = ?1 AND event_type = 'read_complete') WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_stats_history(conn: &Connection, limit: i64) -> Result<StatsHistory, String> {
    let mut stmt = conn
        .prepare(
            "SELECT session_id, started_at, ended_at, duration_seconds, folders_count, files_count, files_opened, files_read_complete
             FROM sessions ORDER BY started_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let sessions: Vec<SessionStats> = stmt
        .query_map([limit], |row| {
            Ok(SessionStats {
                session_id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                duration_seconds: row.get(3)?,
                folders_count: row.get(4)?,
                files_count: row.get(5)?,
                files_opened: row.get(6)?,
                files_read_complete: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let overview = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(files_opened),0), COALESCE(SUM(files_read_complete),0), COALESCE(MAX(folders_count),0), COALESCE(MAX(files_count),0) FROM sessions",
            [],
            |row| {
                Ok(VaultOverview {
                    total_sessions: row.get(0)?,
                    total_files_opened: row.get(1)?,
                    total_files_read: row.get(2)?,
                    total_folders: row.get(3)?,
                    total_files: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(StatsHistory { sessions, overview })
}
