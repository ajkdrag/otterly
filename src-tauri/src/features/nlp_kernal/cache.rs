use std::path::Path;

use rusqlite::Connection;

use super::types::NlpAnalysis;
use crate::shared::constants::APP_DIR;

pub fn open_nlp_db(vault_root: &Path) -> Result<Connection, String> {
    let db_dir = vault_root.join(APP_DIR);
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = db_dir.join("nlp_db.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let _: String = conn
        .pragma_update_and_check(None, "journal_mode", &"WAL", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", &"NORMAL")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS nlp_analysis (
            path TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL,
            analysis_json TEXT NOT NULL,
            analyzed_at INTEGER NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    migrate_from_legacy(&conn);
    Ok(conn)
}

fn migrate_from_legacy(conn: &Connection) {
    let has_legacy: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nlp_cache'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if has_legacy {
        let _ = conn.execute_batch(
            "INSERT OR IGNORE INTO nlp_analysis (path, content_hash, analysis_json, analyzed_at)
             SELECT path, content_hash, analysis_json, analyzed_at FROM nlp_cache;
             DROP TABLE nlp_cache;",
        );
    }
}

pub fn get_cached(conn: &Connection, path: &str, content_hash: &str) -> Option<NlpAnalysis> {
    let mut stmt = conn
        .prepare("SELECT analysis_json FROM nlp_analysis WHERE path = ?1 AND content_hash = ?2")
        .ok()?;
    let json: String = stmt.query_row([path, content_hash], |row| row.get(0)).ok()?;
    serde_json::from_str(&json).ok()
}

pub fn store_cached(
    conn: &Connection,
    path: &str,
    content_hash: &str,
    analysis: &NlpAnalysis,
) -> Result<(), String> {
    let json = serde_json::to_string(analysis).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "INSERT OR REPLACE INTO nlp_analysis (path, content_hash, analysis_json, analyzed_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![path, content_hash, json, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
