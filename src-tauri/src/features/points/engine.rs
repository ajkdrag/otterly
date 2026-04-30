use rusqlite::Connection;
use super::{db, types::*};

pub fn award_points(conn: &Connection, action: &str, file_path: &str) -> Result<AwardResult, String> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    db::update_streak(conn, &today);

    let (points, desc, daily_limit) = match action {
        "app_open" => (5, "打开应用", 1),
        "file_open" => (2, "打开文件", 1),
        "file_read_complete" => (10, "阅读完成", 1),
        "note_create" => (8, "创建笔记", 100),
        "note_save" => (3, "保存笔记", 1),
        "search_query" => (1, "搜索知识", 5),
        "nlp_analyze" => (3, "NLP分析", 1),
        "wiki_link_add" => (5, "添加知识关联", 100),
        _ => (1, "其他行为", 10),
    };

    if !db::check_daily_limit(conn, &today, action, file_path, daily_limit) {
        return Ok(AwardResult {
            points_earned: 0,
            new_total: db::get_total_points(conn),
            level_up: false,
            new_level: level_for_points(db::get_total_points(conn)).level,
            new_title: String::new(),
            description: "今日已达上限".to_string(),
        });
    }

    let old_total = db::get_total_points(conn);
    let old_level = level_for_points(old_total).level;

    let new_total = db::add_points(conn, points, action, desc, file_path)?;
    db::increment_daily(conn, &today, action, file_path);

    let new_level_def = level_for_points(new_total);
    let leveled_up = new_level_def.level > old_level;

    Ok(AwardResult {
        points_earned: points,
        new_total,
        level_up: leveled_up,
        new_level: new_level_def.level,
        new_title: if leveled_up {
            format!("{} {}", new_level_def.icon, new_level_def.title)
        } else {
            String::new()
        },
        description: format!("+{} {}", points, desc),
    })
}

pub fn get_account(conn: &Connection) -> PointsAccount {
    let total = db::get_total_points(conn);
    let (streak, last_date) = db::get_streak(conn);
    let level_def = level_for_points(total);
    let next = next_level_for(level_def.level);

    let (next_pts, progress) = match next {
        Some(n) => {
            let range = n.min_points - level_def.min_points;
            let done = total - level_def.min_points;
            (n.min_points, if range > 0 { (done as f64 / range as f64) * 100.0 } else { 100.0 })
        }
        None => (level_def.min_points, 100.0),
    };

    PointsAccount {
        total_points: total,
        level: level_def.level,
        level_title: level_def.title.to_string(),
        level_icon: level_def.icon.to_string(),
        streak_days: streak,
        last_active_date: last_date,
        next_level_points: next_pts,
        progress_percent: progress.min(100.0),
    }
}
