use tauri::AppHandle;

use super::{db, types::StatsHistory};
use crate::shared::storage::vault_path;

#[derive(serde::Deserialize)]
pub struct StartSessionArgs {
    pub vault_id: String,
    pub session_id: String,
    pub folders_count: i64,
    pub files_count: i64,
}

#[tauri::command]
pub fn stats_start_session(app: AppHandle, args: StartSessionArgs) -> Result<(), String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_stats_db(&vault_root)?;
    let now = chrono::Utc::now().to_rfc3339();
    db::create_session(&conn, &args.session_id, &now, args.folders_count, args.files_count)?;
    log::info!("Stats session started: {}", args.session_id);
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct EndSessionArgs {
    pub vault_id: String,
    pub session_id: String,
}

#[tauri::command]
pub fn stats_end_session(app: AppHandle, args: EndSessionArgs) -> Result<(), String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_stats_db(&vault_root)?;
    let now = chrono::Utc::now().to_rfc3339();
    db::end_session(&conn, &args.session_id, &now)?;
    log::info!("Stats session ended: {}", args.session_id);
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct FileEventArgs {
    pub vault_id: String,
    pub session_id: String,
    pub file_path: String,
}

#[tauri::command]
pub fn stats_file_opened(app: AppHandle, args: FileEventArgs) -> Result<(), String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_stats_db(&vault_root)?;
    let now = chrono::Utc::now().to_rfc3339();
    db::record_file_opened(&conn, &args.session_id, &args.file_path, &now)?;
    log::debug!("Stats: file opened {}", args.file_path);
    Ok(())
}

#[tauri::command]
pub fn stats_file_read_complete(app: AppHandle, args: FileEventArgs) -> Result<(), String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_stats_db(&vault_root)?;
    let now = chrono::Utc::now().to_rfc3339();
    db::record_file_read_complete(&conn, &args.session_id, &args.file_path, &now)?;
    log::debug!("Stats: file read complete {}", args.file_path);
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct GetStatsArgs {
    pub vault_id: String,
    pub limit: Option<i64>,
}

#[tauri::command]
pub fn stats_get_history(app: AppHandle, args: GetStatsArgs) -> Result<StatsHistory, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_stats_db(&vault_root)?;
    db::get_stats_history(&conn, args.limit.unwrap_or(30))
}
