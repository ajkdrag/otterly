use std::path::Path;
use rusqlite::Connection;
use crate::shared::constants::APP_DIR;

pub fn open_points_db(vault_root: &Path) -> Result<Connection, String> {
    let db_dir = vault_root.join(APP_DIR);
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(db_dir.join("points.db")).map_err(|e| e.to_string())?;
    let _: String = conn
        .pragma_update_and_check(None, "journal_mode", &"WAL", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", &"NORMAL")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS points_account (
            id INTEGER PRIMARY KEY DEFAULT 1,
            total_points INTEGER NOT NULL DEFAULT 0,
            streak_days INTEGER NOT NULL DEFAULT 0,
            last_active_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS points_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            points INTEGER NOT NULL,
            description TEXT,
            file_path TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS daily_actions (
            date TEXT NOT NULL,
            action_type TEXT NOT NULL,
            file_path TEXT DEFAULT '',
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date, action_type, file_path)
        );
        INSERT OR IGNORE INTO points_account (id, total_points, streak_days, created_at)
        VALUES (1, 0, 0, datetime('now'));",
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn get_total_points(conn: &Connection) -> i64 {
    conn.query_row("SELECT total_points FROM points_account WHERE id=1", [], |r| r.get(0))
        .unwrap_or(0)
}

pub fn get_streak(conn: &Connection) -> (i32, Option<String>) {
    conn.query_row(
        "SELECT streak_days, last_active_date FROM points_account WHERE id=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, None))
}

pub fn add_points(conn: &Connection, points: i64, action_type: &str, desc: &str, file_path: &str) -> Result<i64, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE points_account SET total_points = total_points + ?1 WHERE id=1",
        [points],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO points_transactions (action_type, points, description, file_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![action_type, points, desc, file_path, now],
    ).map_err(|e| e.to_string())?;
    Ok(get_total_points(conn))
}

pub fn check_daily_limit(conn: &Connection, date: &str, action: &str, file_path: &str, max: i32) -> bool {
    let count: i32 = conn.query_row(
        "SELECT count FROM daily_actions WHERE date=?1 AND action_type=?2 AND file_path=?3",
        [date, action, file_path],
        |r| r.get(0),
    ).unwrap_or(0);
    count < max
}

pub fn increment_daily(conn: &Connection, date: &str, action: &str, file_path: &str) {
    let _ = conn.execute(
        "INSERT INTO daily_actions (date, action_type, file_path, count) VALUES (?1, ?2, ?3, 1)
         ON CONFLICT(date, action_type, file_path) DO UPDATE SET count = count + 1",
        [date, action, file_path],
    );
}

pub fn update_streak(conn: &Connection, today: &str) {
    let (streak, last_date) = get_streak(conn);
    let new_streak = match last_date {
        Some(ref d) if d == today => streak,
        Some(ref d) => {
            if let (Ok(last), Ok(now)) = (
                chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d"),
                chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d"),
            ) {
                if (now - last).num_days() == 1 { streak + 1 } else { 1 }
            } else { 1 }
        }
        None => 1,
    };
    let _ = conn.execute(
        "UPDATE points_account SET streak_days=?1, last_active_date=?2 WHERE id=1",
        rusqlite::params![new_streak, today],
    );
}

pub fn get_recent_transactions(conn: &Connection, limit: i64) -> Vec<super::types::PointsTransaction> {
    let mut stmt = conn.prepare(
        "SELECT action_type, points, description, created_at FROM points_transactions ORDER BY id DESC LIMIT ?1"
    ).unwrap();
    stmt.query_map([limit], |r| {
        Ok(super::types::PointsTransaction {
            action_type: r.get(0)?,
            points: r.get(1)?,
            description: r.get(2).unwrap_or_default(),
            created_at: r.get(3)?,
        })
    }).unwrap().filter_map(|r| r.ok()).collect()
}
