use std::path::Path;

use serde::{Deserialize, Serialize};

use super::cache;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlpAggregateStats {
    pub total_files_analyzed: i64,
    pub total_word_count: i64,
    pub total_char_count: i64,
    pub total_unique_keywords: i64,
    pub avg_vocabulary_richness: f64,
    pub top_global_keywords: Vec<super::types::KeywordEntry>,
}

pub fn get_nlp_aggregate(vault_root: &Path) -> Result<NlpAggregateStats, String> {
    let conn = cache::open_nlp_db(vault_root)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM nlp_cache", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if count == 0 {
        return Ok(NlpAggregateStats {
            total_files_analyzed: 0,
            total_word_count: 0,
            total_char_count: 0,
            total_unique_keywords: 0,
            avg_vocabulary_richness: 0.0,
            top_global_keywords: vec![],
        });
    }

    let mut stmt = conn
        .prepare("SELECT analysis_json FROM nlp_cache")
        .map_err(|e| e.to_string())?;
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut total_words: i64 = 0;
    let mut total_chars: i64 = 0;
    let mut richness_sum: f64 = 0.0;
    let mut keyword_freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for json in &rows {
        if let Ok(analysis) = serde_json::from_str::<super::types::NlpAnalysis>(json) {
            total_words += analysis.word_count as i64;
            total_chars += analysis.char_count as i64;
            richness_sum += analysis.vocabulary_richness;
            for kw in &analysis.top_keywords {
                *keyword_freq.entry(kw.word.clone()).or_insert(0) += kw.count;
            }
        }
    }

    let mut sorted_kw: Vec<_> = keyword_freq.into_iter().collect();
    sorted_kw.sort_by(|a, b| b.1.cmp(&a.1));
    sorted_kw.truncate(20);

    let unique_kw_count = sorted_kw.len() as i64;

    Ok(NlpAggregateStats {
        total_files_analyzed: count,
        total_word_count: total_words,
        total_char_count: total_chars,
        total_unique_keywords: unique_kw_count,
        avg_vocabulary_richness: if count > 0 {
            richness_sum / count as f64
        } else {
            0.0
        },
        top_global_keywords: sorted_kw
            .into_iter()
            .map(|(word, count)| super::types::KeywordEntry { word, count })
            .collect(),
    })
}
