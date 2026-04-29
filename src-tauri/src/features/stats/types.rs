use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub session_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub folders_count: i64,
    pub files_count: i64,
    pub files_opened: i64,
    pub files_read_complete: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultOverview {
    pub total_sessions: i64,
    pub total_files_opened: i64,
    pub total_files_read: i64,
    pub total_folders: i64,
    pub total_files: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsHistory {
    pub sessions: Vec<SessionStats>,
    pub overview: VaultOverview,
}
