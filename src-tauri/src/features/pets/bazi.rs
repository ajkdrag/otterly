/// 中国天干地支、五行八卦分析模块
/// 基于出生时间戳计算宠物的生辰八字、五行属性、八卦卦象
///
/// 算法参考：传统农历干支纪年法简化版
/// - 天干(10)：甲乙丙丁戊己庚辛壬癸
/// - 地支(12)：子丑寅卯辰巳午未申酉戌亥
/// - 五行(5)：金木水火土
/// - 八卦(8)：乾兑离震巽坎艮坤

use serde::{Deserialize, Serialize};

// ── 常量定义 ──────────────────────────────────────────────

const TIAN_GAN: &[&str] = &["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const DI_ZHI: &[&str] = &["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const WU_XING: &[&str] = &["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
const WU_XING_EMOJI: &[&str] = &["🌳", "🌳", "🔥", "🔥", "⛰️", "⛰️", "🪙", "🪙", "💧", "💧"];
const SHENG_XIAO: &[&str] = &["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
const SHENG_XIAO_EMOJI: &[&str] = &["🐭", "🐮", "🐯", "🐰", "🐲", "🐍", "🐴", "🐏", "🐵", "🐔", "🐶", "🐷"];

const BA_GUA: &[&str] = &["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
const BA_GUA_SYMBOL: &[&str] = &["☰", "☱", "☲", "☳", "☴", "☵", "☶", "☷"];
const BA_GUA_NATURE: &[&str] = &["天", "泽", "火", "雷", "风", "水", "山", "地"];
const BA_GUA_TRAIT: &[&str] = &["刚健", "悦泽", "光明", "震动", "温和", "智慧", "沉稳", "包容"];

const SHI_CHEN: &[&str] = &["子时", "丑时", "寅时", "卯时", "辰时", "巳时", "午时", "未时", "申时", "酉时", "戌时", "亥时"];

// ── 生辰八字结果 ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaziInfo {
    /// 年柱（天干+地支），如"甲子"
    pub year_pillar: String,
    /// 月柱
    pub month_pillar: String,
    /// 日柱
    pub day_pillar: String,
    /// 时柱
    pub hour_pillar: String,
    /// 完整八字
    pub bazi_full: String,
    /// 五行属性（基于日干）
    pub wu_xing: String,
    /// 五行 emoji
    pub wu_xing_emoji: String,
    /// 生肖
    pub sheng_xiao: String,
    /// 生肖 emoji
    pub sheng_xiao_emoji: String,
    /// 八卦卦象
    pub ba_gua: String,
    /// 八卦符号
    pub ba_gua_symbol: String,
    /// 八卦自然象
    pub ba_gua_nature: String,
    /// 八卦性格特质
    pub ba_gua_trait: String,
    /// 时辰
    pub shi_chen: String,
    /// 命理简评
    pub fortune_summary: String,
}

// ── 核心计算 ──────────────────────────────────────────────

/// 从毫秒时间戳计算生辰八字
pub fn calculate_bazi(timestamp_ms: i64) -> BaziInfo {
    // 转换为秒级时间戳并解析为日期时间（UTC+8 北京时间）
    let ts_secs = timestamp_ms / 1000;
    let (year, month, day, hour) = timestamp_to_datetime(ts_secs);

    // 年柱：以农历年计算（简化：公历年近似）
    let year_gan_idx = ((year - 4) % 10) as usize;
    let year_zhi_idx = ((year - 4) % 12) as usize;
    let year_pillar = format!("{}{}", TIAN_GAN[year_gan_idx], DI_ZHI[year_zhi_idx]);

    // 月柱：以月份推算天干地支
    // 月地支固定：正月寅、二月卯...
    let month_zhi_idx = ((month + 1) % 12) as usize;
    // 月天干：年干×2 + 月数 (简化公式)
    let month_gan_idx = ((year_gan_idx * 2 + month as usize) % 10) as usize;
    let month_pillar = format!("{}{}", TIAN_GAN[month_gan_idx], DI_ZHI[month_zhi_idx]);

    // 日柱：使用简化的日干支算法
    // 基准：2000年1月1日为甲子日（近似）
    let base_jdn = gregorian_to_jdn(2000, 1, 1);
    let current_jdn = gregorian_to_jdn(year, month, day);
    let day_offset = (current_jdn - base_jdn) as usize;
    let day_gan_idx = (day_offset % 10) as usize;
    let day_zhi_idx = (day_offset % 12) as usize;
    let day_pillar = format!("{}{}", TIAN_GAN[day_gan_idx], DI_ZHI[day_zhi_idx]);

    // 时柱：时辰 = hour / 2（子时23-1, 丑时1-3...）
    let shi_chen_idx = ((hour + 1) / 2 % 12) as usize;
    // 时天干：日干×2 + 时辰
    let hour_gan_idx = ((day_gan_idx * 2 + shi_chen_idx) % 10) as usize;
    let hour_pillar = format!("{}{}", TIAN_GAN[hour_gan_idx], DI_ZHI[shi_chen_idx]);

    let bazi_full = format!("{} {} {} {}", year_pillar, month_pillar, day_pillar, hour_pillar);

    // 五行：基于日干
    let wu_xing = WU_XING[day_gan_idx].to_string();
    let wu_xing_emoji = WU_XING_EMOJI[day_gan_idx].to_string();

    // 生肖
    let sheng_xiao = SHENG_XIAO[year_zhi_idx].to_string();
    let sheng_xiao_emoji = SHENG_XIAO_EMOJI[year_zhi_idx].to_string();

    // 八卦：基于八字综合数值
    let gua_idx = (year_gan_idx + month_zhi_idx + day_gan_idx + shi_chen_idx) % 8;
    let ba_gua = BA_GUA[gua_idx].to_string();
    let ba_gua_symbol = BA_GUA_SYMBOL[gua_idx].to_string();
    let ba_gua_nature = BA_GUA_NATURE[gua_idx].to_string();
    let ba_gua_trait = BA_GUA_TRAIT[gua_idx].to_string();

    // 时辰
    let shi_chen = SHI_CHEN[shi_chen_idx].to_string();

    // 命理简评
    let fortune_summary = generate_fortune(&wu_xing, &ba_gua, &sheng_xiao);

    BaziInfo {
        year_pillar,
        month_pillar,
        day_pillar,
        hour_pillar,
        bazi_full,
        wu_xing,
        wu_xing_emoji,
        sheng_xiao,
        sheng_xiao_emoji,
        ba_gua,
        ba_gua_symbol,
        ba_gua_nature,
        ba_gua_trait,
        shi_chen,
        fortune_summary,
    }
}

// ── 辅助函数 ──────────────────────────────────────────────

/// 时间戳(秒) → (year, month, day, hour)，UTC+8
fn timestamp_to_datetime(ts: i64) -> (i32, i32, i32, i32) {
    let ts = ts + 8 * 3600; // UTC+8
    let days = (ts / 86400) as i32;
    let secs_in_day = (ts % 86400) as i32;
    let hour = secs_in_day / 3600;

    // 从 Unix epoch (1970-01-01) 计算日期
    let mut y = 1970;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }

    let months_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut m = 1;
    for &md in &months_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        m += 1;
    }

    let d = remaining + 1;
    (y, m, d, hour)
}

/// 判断闰年
fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// 公历日期 → 儒略日数（简化版）
fn gregorian_to_jdn(year: i32, month: i32, day: i32) -> i64 {
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    (day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045) as i64
}

/// 生成命理简评
fn generate_fortune(wu_xing: &str, ba_gua: &str, sheng_xiao: &str) -> String {
    let wx_desc = match wu_xing {
        "金" => "性刚坚毅，理性果决",
        "木" => "仁慈温雅，生机蓬勃",
        "水" => "聪慧灵动，适应力强",
        "火" => "热情明朗，积极进取",
        "土" => "稳重厚道，包容守信",
        _ => "气质独特",
    };

    let gua_desc = match ba_gua {
        "乾" => "学习力强，志向远大",
        "兑" => "善于交流，悟性极高",
        "离" => "洞察敏锐，创意丰富",
        "震" => "行动迅速，勇于开拓",
        "巽" => "谦逊好学，循序渐进",
        "坎" => "深思熟虑，智慧过人",
        "艮" => "脚踏实地，持之以恒",
        "坤" => "宽厚待物，积累深厚",
        _ => "前途无量",
    };

    format!(
        "此宠生肖属{}，五行属{}，{}。卦象为{}，{}。天资聪颖，乃学习之良伴也。",
        sheng_xiao, wu_xing, wx_desc, ba_gua, gua_desc
    )
}

/// 根据时间戳随机确定性别
pub fn determine_gender(timestamp_ms: i64) -> &'static str {
    // 基于时间戳的简单确定性哈希
    let hash = (timestamp_ms as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    if hash % 2 == 0 { "male" } else { "female" }
}

/// 性别 emoji
pub fn gender_emoji(gender: &str) -> &'static str {
    match gender {
        "male" => "♂",
        "female" => "♀",
        _ => "⚪",
    }
}

/// 性别中文
pub fn gender_label(gender: &str) -> &'static str {
    match gender {
        "male" => "公",
        "female" => "母",
        _ => "未知",
    }
}
