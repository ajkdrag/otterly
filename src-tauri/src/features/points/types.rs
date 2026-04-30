use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointsAccount {
    pub total_points: i64,
    pub level: i32,
    pub level_title: String,
    pub level_icon: String,
    pub streak_days: i32,
    pub last_active_date: Option<String>,
    pub next_level_points: i64,
    pub progress_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwardResult {
    pub points_earned: i64,
    pub new_total: i64,
    pub level_up: bool,
    pub new_level: i32,
    pub new_title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointsTransaction {
    pub action_type: String,
    pub points: i64,
    pub description: String,
    pub created_at: String,
}

pub struct LevelDef {
    pub level: i32,
    pub title: &'static str,
    pub icon: &'static str,
    pub min_points: i64,
}

pub const LEVELS: &[LevelDef] = &[
    LevelDef { level: 0, title: "知识新生儿", icon: "👶", min_points: 0 },
    LevelDef { level: 1, title: "好奇宝宝", icon: "🍼", min_points: 20 },
    LevelDef { level: 2, title: "涂鸦小画家", icon: "🎨", min_points: 50 },
    LevelDef { level: 3, title: "拼图小能手", icon: "🧩", min_points: 100 },
    LevelDef { level: 4, title: "彩虹小学者", icon: "🌈", min_points: 200 },
    LevelDef { level: 5, title: "识字小读者", icon: "📖", min_points: 350 },
    LevelDef { level: 6, title: "写话小作家", icon: "✏️", min_points: 500 },
    LevelDef { level: 7, title: "课外阅读者", icon: "📚", min_points: 700 },
    LevelDef { level: 8, title: "小小探索家", icon: "🔍", min_points: 1000 },
    LevelDef { level: 9, title: "日记小达人", icon: "📝", min_points: 1300 },
    LevelDef { level: 10, title: "小学毕业生", icon: "🎓", min_points: 1700 },
    LevelDef { level: 11, title: "初中新生", icon: "🏫", min_points: 2200 },
    LevelDef { level: 12, title: "科学探究者", icon: "🔬", min_points: 2800 },
    LevelDef { level: 13, title: "中考冲刺者", icon: "📋", min_points: 3500 },
    LevelDef { level: 14, title: "高中新星", icon: "🌟", min_points: 4500 },
    LevelDef { level: 15, title: "学科专研者", icon: "🧪", min_points: 5800 },
    LevelDef { level: 16, title: "高考冲刺者", icon: "🎯", min_points: 7500 },
    LevelDef { level: 17, title: "大一新生", icon: "🎒", min_points: 10000 },
    LevelDef { level: 18, title: "专业学习者", icon: "📖", min_points: 13000 },
    LevelDef { level: 19, title: "学士", icon: "🎓", min_points: 17000 },
    LevelDef { level: 20, title: "硕士研究员", icon: "📐", min_points: 22000 },
    LevelDef { level: 21, title: "硕士", icon: "🎓", min_points: 28000 },
    LevelDef { level: 22, title: "博士研究者", icon: "🔭", min_points: 36000 },
    LevelDef { level: 23, title: "博士", icon: "🎓", min_points: 45000 },
    LevelDef { level: 24, title: "博士后研究员", icon: "🧬", min_points: 60000 },
    LevelDef { level: 25, title: "副教授", icon: "🏛️", min_points: 80000 },
    LevelDef { level: 26, title: "教授", icon: "👨‍🏫", min_points: 120000 },
    LevelDef { level: 27, title: "博导", icon: "🌳", min_points: 180000 },
    LevelDef { level: 28, title: "杰出教授", icon: "💫", min_points: 250000 },
    LevelDef { level: 29, title: "院士", icon: "👑", min_points: 500000 },
];

pub fn level_for_points(points: i64) -> &'static LevelDef {
    LEVELS.iter().rev().find(|l| points >= l.min_points).unwrap_or(&LEVELS[0])
}

pub fn next_level_for(level: i32) -> Option<&'static LevelDef> {
    LEVELS.iter().find(|l| l.level == level + 1)
}
