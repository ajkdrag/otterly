use tauri::AppHandle;
use super::{db, engine, types::*};
use crate::shared::storage::vault_path;

#[derive(serde::Deserialize)]
pub struct AwardArgs {
    pub vault_id: String,
    pub action: String,
    pub file_path: Option<String>,
}

#[tauri::command]
pub fn points_award(app: AppHandle, args: AwardArgs) -> Result<AwardResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_points_db(&vault_root)?;
    let fp = args.file_path.as_deref().unwrap_or("");
    engine::award_points(&conn, &args.action, fp)
}

#[derive(serde::Deserialize)]
pub struct AccountArgs {
    pub vault_id: String,
}

#[tauri::command]
pub fn points_get_account(app: AppHandle, args: AccountArgs) -> Result<PointsAccount, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_points_db(&vault_root)?;
    Ok(engine::get_account(&conn))
}

#[derive(serde::Deserialize)]
pub struct TransactionsArgs {
    pub vault_id: String,
    pub limit: Option<i64>,
}

#[tauri::command]
pub fn points_get_transactions(app: AppHandle, args: TransactionsArgs) -> Result<Vec<PointsTransaction>, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_points_db(&vault_root)?;
    Ok(db::get_recent_transactions(&conn, args.limit.unwrap_or(20)))
}
