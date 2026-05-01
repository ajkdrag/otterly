use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexNoteMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub name: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub symbols: Vec<String>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum SearchScope {
    All,
    Path,
    Title,
    Content,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub note: IndexNoteMeta,
    pub score: f32,
    pub snippet: Option<String>,
}
