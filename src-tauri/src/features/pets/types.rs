use serde::{Deserialize, Serialize};

// ── 宠物种类 ──────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PetSpecies {
    #[serde(rename = "ink_sprite")]
    InkSprite,
    #[serde(rename = "scroll_pup")]
    ScrollPup,
    #[serde(rename = "code_kit")]
    CodeKit,
    #[serde(rename = "think_cloud")]
    ThinkCloud,
    #[serde(rename = "sprout_bud")]
    SproutBud,
}

impl PetSpecies {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InkSprite => "ink_sprite",
            Self::ScrollPup => "scroll_pup",
            Self::CodeKit => "code_kit",
            Self::ThinkCloud => "think_cloud",
            Self::SproutBud => "sprout_bud",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "ink_sprite" => Ok(Self::InkSprite),
            "scroll_pup" => Ok(Self::ScrollPup),
            "code_kit" => Ok(Self::CodeKit),
            "think_cloud" => Ok(Self::ThinkCloud),
            "sprout_bud" => Ok(Self::SproutBud),
            _ => Err(format!("unknown pet species: {}", s)),
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            Self::InkSprite => "🐱",
            Self::ScrollPup => "🐶",
            Self::CodeKit => "🐹",
            Self::ThinkCloud => "🦉",
            Self::SproutBud => "🐸",
        }
    }

    pub fn name_cn(&self) -> &'static str {
        match self {
            Self::InkSprite => "墨灵",
            Self::ScrollPup => "卷卷",
            Self::CodeKit => "码仔",
            Self::ThinkCloud => "思思",
            Self::SproutBud => "芽芽",
        }
    }

    pub fn trait_emoji(&self) -> &'static str {
        match self {
            Self::InkSprite => "✒️",
            Self::ScrollPup => "📖",
            Self::CodeKit => "💻",
            Self::ThinkCloud => "💭",
            Self::SproutBud => "🌱",
        }
    }
}

// ── 进化阶段 ──────────────────────────────────────────────
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum EvolutionStage {
    Baby = 1,
    Teen = 2,
    Adult = 3,
    Legendary = 4,
}

impl EvolutionStage {
    pub fn from_i32(v: i32) -> Self {
        match v {
            1 => Self::Baby,
            2 => Self::Teen,
            3 => Self::Adult,
            4 => Self::Legendary,
            _ => Self::Baby,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Baby => "幼崽期",
            Self::Teen => "成长期",
            Self::Adult => "成熟期",
            Self::Legendary => "传说期",
        }
    }
}

// ── 心情 ──────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Mood {
    #[serde(rename = "happy")]
    Happy,
    #[serde(rename = "content")]
    Content,
    #[serde(rename = "calm")]
    Calm,
    #[serde(rename = "bored")]
    Bored,
    #[serde(rename = "sad")]
    Sad,
    #[serde(rename = "sleeping")]
    Sleeping,
    #[serde(rename = "excited")]
    Excited,
    #[serde(rename = "celebrating")]
    Celebrating,
}

impl Mood {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Happy => "happy",
            Self::Content => "content",
            Self::Calm => "calm",
            Self::Bored => "bored",
            Self::Sad => "sad",
            Self::Sleeping => "sleeping",
            Self::Excited => "excited",
            Self::Celebrating => "celebrating",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "happy" => Self::Happy,
            "content" => Self::Content,
            "calm" => Self::Calm,
            "bored" => Self::Bored,
            "sad" => Self::Sad,
            "sleeping" => Self::Sleeping,
            "excited" => Self::Excited,
            "celebrating" => Self::Celebrating,
            _ => Self::Calm,
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            Self::Happy => "😄",
            Self::Content => "😊",
            Self::Calm => "😐",
            Self::Bored => "😟",
            Self::Sad => "😢",
            Self::Sleeping => "😴",
            Self::Excited => "🤩",
            Self::Celebrating => "🎉",
        }
    }
}

// ── 性格特征 ──────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Personality {
    #[serde(rename = "diligent")]
    Diligent,
    #[serde(rename = "lazy")]
    Lazy,
    #[serde(rename = "curious")]
    Curious,
    #[serde(rename = "lively")]
    Lively,
    #[serde(rename = "scholarly")]
    Scholarly,
    #[serde(rename = "resilient")]
    Resilient,
}

impl Personality {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Diligent => "diligent",
            Self::Lazy => "lazy",
            Self::Curious => "curious",
            Self::Lively => "lively",
            Self::Scholarly => "scholarly",
            Self::Resilient => "resilient",
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            Self::Diligent => "🌟",
            Self::Lazy => "😴",
            Self::Curious => "🤓",
            Self::Lively => "🎭",
            Self::Scholarly => "📚",
            Self::Resilient => "💪",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Diligent => "勤勉",
            Self::Lazy => "慵懒",
            Self::Curious => "好奇",
            Self::Lively => "活泼",
            Self::Scholarly => "博学",
            Self::Resilient => "坚韧",
        }
    }

    /// 经验值加成倍率 (基于特定行为)
    pub fn exp_multiplier(&self, action: &str) -> f64 {
        match (self, action) {
            (Self::Diligent, "note_create" | "note_save") => 1.1,
            (Self::Curious, "nlp_analyze") => 1.15,
            (Self::Scholarly, "file_read_complete") => 1.1,
            _ => 1.0,
        }
    }
}

// ── 宠物主结构 ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pet {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub species: String,
    pub stage: i32,
    pub variant: String,
    pub happiness: i32,
    pub energy: i32,
    pub hunger: i32,
    pub bond_level: i32,
    pub exp: i64,
    pub level: i32,
    pub personality: String,    // JSON array
    pub mood: String,
    pub skills: String,         // JSON array
    pub accessories: String,    // JSON array
    pub skin_variant: String,
    pub gender: String,
    pub born_at: i64,
    pub last_fed_at: Option<i64>,
    pub last_interaction_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── 宠物状态 (前端友好) ────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetState {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub species: String,
    pub species_emoji: String,
    pub species_name_cn: String,
    pub trait_emoji: String,
    pub stage: i32,
    pub stage_label: String,
    pub variant: String,
    pub happiness: i32,
    pub energy: i32,
    pub hunger: i32,
    pub bond_level: i32,
    pub exp: i64,
    pub level: i32,
    pub exp_to_next_level: i64,
    pub level_progress: f64,
    pub personality: Vec<String>,
    pub mood: String,
    pub mood_emoji: String,
    pub skills: Vec<String>,
    pub accessories: Vec<String>,
    pub skin_variant: String,
    pub gender: String,
    pub gender_emoji: String,
    pub gender_label: String,
    pub born_at: i64,
    pub bazi: Option<super::bazi::BaziInfo>,
    pub last_fed_at: Option<i64>,
    pub last_interaction_at: Option<i64>,
}

// ── 命令参数/返回类型 ─────────────────────────────────────
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePetArgs {
    pub vault_id: String,
    pub owner_id: String,
    pub species: String,
    pub name: String,
    pub gender: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PetIdArgs {
    pub vault_id: String,
    pub pet_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedPetArgs {
    pub vault_id: String,
    pub pet_id: String,
    pub food_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InteractPetArgs {
    pub vault_id: String,
    pub pet_id: String,
    pub interaction: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PetExpArgs {
    pub vault_id: String,
    pub pet_id: String,
    pub action: String,
    pub points_earned: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OwnerArgs {
    pub vault_id: String,
    pub owner_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetActionResult {
    pub success: bool,
    pub message: String,
    pub pet_state: Option<PetState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionResult {
    pub can_evolve: bool,
    pub new_stage: Option<i32>,
    pub new_stage_label: Option<String>,
    pub message: String,
    pub pet_state: Option<PetState>,
}

// ── 物品库存 ──────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub item_type: String,
    pub quantity: i32,
    pub item_emoji: String,
    pub item_name: String,
}

// ── 宠物事件 ──────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetEvent {
    pub id: i64,
    pub pet_id: String,
    pub event_type: String,
    pub event_data: Option<String>,
    pub created_at: i64,
}

// ── 宠物等级定义 ──────────────────────────────────────────
pub struct PetLevelDef {
    pub level: i32,
    pub min_exp: i64,
}

pub const PET_LEVELS: &[PetLevelDef] = &[
    PetLevelDef { level: 1, min_exp: 0 },
    PetLevelDef { level: 2, min_exp: 30 },
    PetLevelDef { level: 3, min_exp: 80 },
    PetLevelDef { level: 4, min_exp: 150 },
    PetLevelDef { level: 5, min_exp: 250 },
    PetLevelDef { level: 6, min_exp: 400 },
    PetLevelDef { level: 7, min_exp: 600 },
    PetLevelDef { level: 8, min_exp: 850 },
    PetLevelDef { level: 9, min_exp: 1150 },
    PetLevelDef { level: 10, min_exp: 1500 },
    PetLevelDef { level: 11, min_exp: 2000 },
    PetLevelDef { level: 12, min_exp: 2600 },
    PetLevelDef { level: 13, min_exp: 3300 },
    PetLevelDef { level: 14, min_exp: 4200 },
    PetLevelDef { level: 15, min_exp: 5300 },
    PetLevelDef { level: 16, min_exp: 6600 },
    PetLevelDef { level: 17, min_exp: 8200 },
    PetLevelDef { level: 18, min_exp: 10000 },
    PetLevelDef { level: 19, min_exp: 12500 },
    PetLevelDef { level: 20, min_exp: 15500 },
    PetLevelDef { level: 21, min_exp: 19000 },
    PetLevelDef { level: 22, min_exp: 23500 },
    PetLevelDef { level: 23, min_exp: 29000 },
    PetLevelDef { level: 24, min_exp: 35500 },
    PetLevelDef { level: 25, min_exp: 43000 },
    PetLevelDef { level: 26, min_exp: 52000 },
    PetLevelDef { level: 27, min_exp: 63000 },
    PetLevelDef { level: 28, min_exp: 76000 },
    PetLevelDef { level: 29, min_exp: 91000 },
    PetLevelDef { level: 30, min_exp: 110000 },
    PetLevelDef { level: 31, min_exp: 130000 },
    PetLevelDef { level: 32, min_exp: 155000 },
    PetLevelDef { level: 33, min_exp: 185000 },
    PetLevelDef { level: 34, min_exp: 220000 },
    PetLevelDef { level: 35, min_exp: 260000 },
    PetLevelDef { level: 36, min_exp: 310000 },
    PetLevelDef { level: 37, min_exp: 370000 },
    PetLevelDef { level: 38, min_exp: 440000 },
    PetLevelDef { level: 39, min_exp: 520000 },
    PetLevelDef { level: 40, min_exp: 620000 },
    PetLevelDef { level: 41, min_exp: 740000 },
    PetLevelDef { level: 42, min_exp: 880000 },
    PetLevelDef { level: 43, min_exp: 1050000 },
    PetLevelDef { level: 44, min_exp: 1250000 },
    PetLevelDef { level: 45, min_exp: 1500000 },
    PetLevelDef { level: 46, min_exp: 1800000 },
    PetLevelDef { level: 47, min_exp: 2200000 },
    PetLevelDef { level: 48, min_exp: 2700000 },
    PetLevelDef { level: 49, min_exp: 3300000 },
    PetLevelDef { level: 50, min_exp: 4000000 },
];

pub fn pet_level_for_exp(exp: i64) -> &'static PetLevelDef {
    PET_LEVELS.iter().rev().find(|l| exp >= l.min_exp).unwrap_or(&PET_LEVELS[0])
}

pub fn pet_next_level(level: i32) -> Option<&'static PetLevelDef> {
    PET_LEVELS.iter().find(|l| l.level == level + 1)
}

/// 根据宠物等级判断进化阶段
pub fn stage_for_level(level: i32) -> EvolutionStage {
    match level {
        1..=5 => EvolutionStage::Baby,
        6..=12 => EvolutionStage::Teen,
        13..=20 => EvolutionStage::Adult,
        _ => EvolutionStage::Legendary,
    }
}

// ── 食物定义 ──────────────────────────────────────────────
pub struct FoodDef {
    pub item_type: &'static str,
    pub name: &'static str,
    pub emoji: &'static str,
    pub hunger_restore: i32,
    pub happiness_bonus: i32,
    pub exp_bonus: i64,
    pub bond_bonus: i32,
}

pub const FOODS: &[FoodDef] = &[
    FoodDef { item_type: "ink_candy", name: "墨水糖", emoji: "📝", hunger_restore: 20, happiness_bonus: 5, exp_bonus: 0, bond_bonus: 0 },
    FoodDef { item_type: "scroll_cake", name: "书页饼", emoji: "📖", hunger_restore: 15, happiness_bonus: 0, exp_bonus: 3, bond_bonus: 0 },
    FoodDef { item_type: "idea_fruit", name: "灵感果", emoji: "💡", hunger_restore: 25, happiness_bonus: 0, exp_bonus: 0, bond_bonus: 10 },
    FoodDef { item_type: "analysis_tea", name: "分析茶", emoji: "🔬", hunger_restore: 10, happiness_bonus: 0, exp_bonus: 5, bond_bonus: 0 },
    FoodDef { item_type: "star_dew", name: "星辰露", emoji: "⭐", hunger_restore: 50, happiness_bonus: 10, exp_bonus: 10, bond_bonus: 10 },
];

pub fn find_food(item_type: &str) -> Option<&'static FoodDef> {
    FOODS.iter().find(|f| f.item_type == item_type)
}

// ── 互动定义 ──────────────────────────────────────────────
pub struct InteractionDef {
    pub interaction_type: &'static str,
    pub name: &'static str,
    pub happiness_bonus: i32,
    pub energy_cost: i32,
    pub bond_bonus: i32,
    pub cooldown_secs: i64,
}

pub const INTERACTIONS: &[InteractionDef] = &[
    InteractionDef { interaction_type: "pat", name: "摸头", happiness_bonus: 5, energy_cost: 0, bond_bonus: 2, cooldown_secs: 600 },
    InteractionDef { interaction_type: "play", name: "玩耍", happiness_bonus: 10, energy_cost: 5, bond_bonus: 3, cooldown_secs: 1800 },
    InteractionDef { interaction_type: "talk", name: "对话", happiness_bonus: 3, energy_cost: 0, bond_bonus: 1, cooldown_secs: 300 },
];

pub fn find_interaction(interaction_type: &str) -> Option<&'static InteractionDef> {
    INTERACTIONS.iter().find(|i| i.interaction_type == interaction_type)
}
