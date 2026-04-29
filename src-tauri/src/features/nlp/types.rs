use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlpAnalysis {
    pub char_count: usize,
    pub char_count_no_spaces: usize,
    pub word_count: usize,
    pub unique_word_count: usize,
    pub sentence_count: usize,
    pub paragraph_count: usize,
    pub line_count: usize,
    pub reading_time_minutes: f64,
    pub avg_sentence_length: f64,
    pub vocabulary_richness: f64,
    pub headings: HeadingStats,
    pub links: LinkStats,
    pub code_blocks: CodeBlockStats,
    pub top_keywords: Vec<KeywordEntry>,
    pub file_size_bytes: u64,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingStats {
    pub h1: usize,
    pub h2: usize,
    pub h3: usize,
    pub h4: usize,
    pub h5: usize,
    pub h6: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkStats {
    pub internal_links: usize,
    pub external_links: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeBlockStats {
    pub block_count: usize,
    pub total_lines: usize,
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeywordEntry {
    pub word: String,
    pub count: usize,
}
