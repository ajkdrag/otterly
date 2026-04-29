use tauri::AppHandle;

use super::{analysis, cache, types::NlpAnalysis};
use crate::shared::storage::vault_path;

#[derive(serde::Deserialize)]
pub struct AnalyzeNoteArgs {
    pub vault_id: String,
    pub note_path: String,
}

#[tauri::command]
pub fn nlp_analyze_note(app: AppHandle, args: AnalyzeNoteArgs) -> Result<NlpAnalysis, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let file_path = vault_root.join(&args.note_path);

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    let file_size = metadata.len();

    let content_hash = blake3::hash(content.as_bytes()).to_hex().to_string();

    let conn = cache::open_nlp_db(&vault_root)?;
    if let Some(cached) = cache::get_cached(&conn, &args.note_path, &content_hash) {
        log::debug!("NLP cache hit for {}", args.note_path);
        return Ok(cached);
    }

    log::info!("NLP analyzing {}", args.note_path);
    let result = analysis::analyze(&content, file_size, content_hash.clone());

    if let Err(e) = cache::store_cached(&conn, &args.note_path, &content_hash, &result) {
        log::warn!("Failed to cache NLP result: {}", e);
    }

    Ok(result)
}
