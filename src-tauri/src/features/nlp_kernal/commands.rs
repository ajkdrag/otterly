use tauri::AppHandle;

use super::{analysis, cache, python_bridge, stats, types::NlpAnalysis};
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

#[derive(serde::Deserialize)]
pub struct NlpStatsArgs {
    pub vault_id: String,
}

#[tauri::command]
pub fn nlp_get_aggregate_stats(
    app: AppHandle,
    args: NlpStatsArgs,
) -> Result<stats::NlpAggregateStats, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    stats::get_nlp_aggregate(&vault_root)
}

#[derive(serde::Deserialize)]
pub struct PyNlpTextArgs {
    pub text: String,
}

#[derive(serde::Deserialize)]
pub struct PyNlpKeywordsArgs {
    pub text: String,
    pub top_n: Option<usize>,
}

#[tauri::command]
pub fn nlp_py_capabilities() -> Result<python_bridge::PyNlpCapabilities, String> {
    python_bridge::get_capabilities()
}

#[tauri::command]
pub fn nlp_py_tokenize(args: PyNlpTextArgs) -> Result<Vec<String>, String> {
    python_bridge::py_tokenize(&args.text)
}

#[tauri::command]
pub fn nlp_py_keywords(args: PyNlpKeywordsArgs) -> Result<Vec<python_bridge::PyKeyword>, String> {
    python_bridge::py_extract_keywords(&args.text, args.top_n.unwrap_or(15))
}

#[tauri::command]
pub fn nlp_py_sentiment(args: PyNlpTextArgs) -> Result<python_bridge::PySentiment, String> {
    python_bridge::py_analyze_sentiment(&args.text)
}

#[tauri::command]
pub fn nlp_py_entities(args: PyNlpTextArgs) -> Result<Vec<python_bridge::PyEntity>, String> {
    python_bridge::py_extract_entities(&args.text)
}

#[tauri::command]
pub fn nlp_py_entities_ml(args: PyNlpTextArgs) -> Result<Vec<python_bridge::PyEntity>, String> {
    python_bridge::py_extract_entities_ml(&args.text)
}

#[tauri::command]
pub fn nlp_py_classify(args: PyNlpTextArgs) -> Result<python_bridge::PyClassifyResult, String> {
    python_bridge::py_classify_text(&args.text)
}
