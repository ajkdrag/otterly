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

#[derive(serde::Deserialize)]
pub struct VaultScanArgs {
    pub vault_id: String,
}

#[tauri::command]
pub fn stats_scan_vault(
    app: AppHandle,
    args: VaultScanArgs,
) -> Result<super::types::VaultScanResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let mut folder_count: i64 = 0;
    let mut file_count: i64 = 0;
    let mut total_size: u64 = 0;
    let mut md_count: i64 = 0;
    let mut code_count: i64 = 0;
    let mut txt_count: i64 = 0;
    let mut other_count: i64 = 0;

    let code_exts = [
        "py", "js", "ts", "jsx", "tsx", "rs", "go", "java", "c", "cpp", "h", "hpp",
        "cs", "rb", "php", "swift", "kt", "scala", "sh", "bash", "zsh", "json",
        "yaml", "yml", "toml", "xml", "html", "css", "scss", "sql", "r", "m",
    ];

    for entry in walkdir::WalkDir::new(&vault_root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            folder_count += 1;
        } else if entry.file_type().is_file() {
            file_count += 1;
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
            }
            let ext = entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext == "md" || ext == "markdown" {
                md_count += 1;
            } else if ext == "txt" {
                txt_count += 1;
            } else if code_exts.contains(&ext.as_str()) {
                code_count += 1;
            } else {
                other_count += 1;
            }
        }
    }

    Ok(super::types::VaultScanResult {
        folder_count,
        file_count,
        total_size_bytes: total_size,
        md_count,
        code_count,
        txt_count,
        other_count,
    })
}
