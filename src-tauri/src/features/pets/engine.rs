use rusqlite::Connection;
use super::{bazi, db, types::*};

/// 创建新宠物 (孵化)
pub fn create_pet(
    conn: &Connection,
    owner_id: &str,
    species_str: &str,
    name: &str,
    gender_override: Option<&str>,
) -> Result<PetState, String> {
    // 检查是否已有宠物
    if let Some(_) = db::get_pet_by_owner(conn, owner_id)? {
        return Err("你已经有一只宠物了".to_string());
    }

    let species = PetSpecies::from_str(species_str)?;
    let now = chrono::Utc::now().timestamp_millis();
    let id = format!("pet_{}", uuid_v4());

    // 随机分配 1~2 个性格特征
    let personalities = random_personalities();
    let personality_json = serde_json::to_string(&personalities).unwrap_or("[]".to_string());

    // 确定性别：优先使用用户指定的，否则根据出生时间随机
    let gender = match gender_override {
        Some("male") => "male".to_string(),
        Some("female") => "female".to_string(),
        _ => bazi::determine_gender(now).to_string(),
    };

    let pet = Pet {
        id: id.clone(),
        owner_id: owner_id.to_string(),
        name: name.to_string(),
        species: species.as_str().to_string(),
        stage: 1,
        variant: "base".to_string(),
        happiness: 80,
        energy: 100,
        hunger: 100,
        bond_level: 0,
        exp: 0,
        level: 1,
        personality: personality_json,
        mood: "happy".to_string(),
        skills: "[]".to_string(),
        accessories: "[]".to_string(),
        skin_variant: "default".to_string(),
        gender,
        born_at: now,
        last_fed_at: Some(now),
        last_interaction_at: Some(now),
        created_at: now,
        updated_at: now,
    };

    db::insert_pet(conn, &pet)?;
    db::insert_event(conn, &id, "born", Some(&format!("{{\"species\":\"{}\"}}", species_str)))?;

    Ok(pet_to_state(&pet))
}

/// 获取宠物状态 (自动应用时间衰减)
pub fn get_state(conn: &Connection, pet_id: &str) -> Result<Option<PetState>, String> {
    let pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Ok(None),
    };

    let pet = apply_time_decay(pet);
    db::update_pet(conn, &pet)?;

    Ok(Some(pet_to_state(&pet)))
}

/// 通过 owner_id 获取宠物状态
pub fn get_state_by_owner(conn: &Connection, owner_id: &str) -> Result<Option<PetState>, String> {
    let pet = match db::get_pet_by_owner(conn, owner_id)? {
        Some(p) => p,
        None => return Ok(None),
    };

    let pet = apply_time_decay(pet);
    db::update_pet(conn, &pet)?;

    Ok(Some(pet_to_state(&pet)))
}

/// 喂食宠物
pub fn feed_pet(conn: &Connection, pet_id: &str, food_type: &str) -> Result<PetActionResult, String> {
    let mut pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    let food = match find_food(food_type) {
        Some(f) => f,
        None => return Err(format!("未知食物类型: {}", food_type)),
    };

    // 检查库存
    if !db::use_inventory_item(conn, &pet.owner_id, food_type)? {
        return Ok(PetActionResult {
            success: false,
            message: format!("没有{}了", food.name),
            pet_state: Some(pet_to_state(&pet)),
        });
    }

    let now = chrono::Utc::now().timestamp_millis();

    pet.hunger = (pet.hunger + food.hunger_restore).min(100);
    pet.happiness = (pet.happiness + food.happiness_bonus).min(100);
    pet.exp += food.exp_bonus;
    pet.bond_level = (pet.bond_level + food.bond_bonus).min(1000);
    pet.last_fed_at = Some(now);
    pet.updated_at = now;

    // 检查升级
    check_level_up(&mut pet);
    update_mood(&mut pet);

    db::update_pet(conn, &pet)?;
    db::insert_event(conn, &pet.id, "fed", Some(&format!("{{\"food\":\"{}\"}}", food_type)))?;

    Ok(PetActionResult {
        success: true,
        message: format!("喂了{}一个{}", pet.name, food.name),
        pet_state: Some(pet_to_state(&pet)),
    })
}

/// 互动
pub fn interact_pet(conn: &Connection, pet_id: &str, interaction_type: &str) -> Result<PetActionResult, String> {
    let mut pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    let interaction = match find_interaction(interaction_type) {
        Some(i) => i,
        None => return Err(format!("未知互动类型: {}", interaction_type)),
    };

    let now = chrono::Utc::now().timestamp_millis();

    // 检查冷却
    if let Some(last) = pet.last_interaction_at {
        let elapsed_secs = (now - last) / 1000;
        if elapsed_secs < interaction.cooldown_secs {
            let remaining = interaction.cooldown_secs - elapsed_secs;
            return Ok(PetActionResult {
                success: false,
                message: format!("{}还在冷却中，还需等待{}秒", interaction.name, remaining),
                pet_state: Some(pet_to_state(&pet)),
            });
        }
    }

    // 检查活力
    if pet.energy < interaction.energy_cost {
        return Ok(PetActionResult {
            success: false,
            message: format!("{}太累了，活力不足", pet.name),
            pet_state: Some(pet_to_state(&pet)),
        });
    }

    pet.happiness = (pet.happiness + interaction.happiness_bonus).min(100);
    pet.energy = (pet.energy - interaction.energy_cost).max(0);
    pet.bond_level = (pet.bond_level + interaction.bond_bonus).min(1000);
    pet.last_interaction_at = Some(now);
    pet.updated_at = now;

    update_mood(&mut pet);
    db::update_pet(conn, &pet)?;
    db::insert_event(conn, &pet.id, "interact", Some(&format!("{{\"type\":\"{}\"}}", interaction_type)))?;

    Ok(PetActionResult {
        success: true,
        message: format!("和{}{}了!", pet.name, interaction.name),
        pet_state: Some(pet_to_state(&pet)),
    })
}

/// 基于用户行为给宠物加经验 (积分联动)
pub fn award_exp(conn: &Connection, pet_id: &str, action: &str, points_earned: i64) -> Result<PetActionResult, String> {
    let mut pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    // 根据行为类型计算宠物经验
    let base_exp = match action {
        "app_open" => 3,
        "file_open" => 2,
        "file_read_complete" => 8,
        "note_create" => 6,
        "note_save" => 2,
        "wiki_link_add" => 4,
        "nlp_analyze" => 5,
        "search_query" => 1,
        _ => 1,
    };

    // 性格加成
    let personalities: Vec<String> = serde_json::from_str(&pet.personality).unwrap_or_default();
    let mut multiplier = 1.0_f64;
    for p in &personalities {
        if let Ok(personality) = serde_json::from_str::<Personality>(&format!("\"{}\"", p)) {
            multiplier = multiplier.max(personality.exp_multiplier(action));
        }
    }

    let exp_gained = (base_exp as f64 * multiplier) as i64;

    let now = chrono::Utc::now().timestamp_millis();
    pet.exp += exp_gained;
    pet.updated_at = now;

    let leveled_up = check_level_up(&mut pet);
    update_mood(&mut pet);

    // 行为也能恢复少量快乐值
    pet.happiness = (pet.happiness + 1).min(100);

    db::update_pet(conn, &pet)?;
    db::insert_event(conn, &pet.id, "exp_gain", Some(&format!(
        "{{\"action\":\"{}\",\"exp\":{},\"points\":{}}}", action, exp_gained, points_earned
    )))?;

    let message = if leveled_up {
        format!("{}升级到Lv.{}了! +{}exp", pet.name, pet.level, exp_gained)
    } else {
        format!("+{}exp", exp_gained)
    };

    Ok(PetActionResult {
        success: true,
        message,
        pet_state: Some(pet_to_state(&pet)),
    })
}

/// 检查进化条件
pub fn check_evolution(conn: &Connection, pet_id: &str) -> Result<EvolutionResult, String> {
    let pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    let current_stage = EvolutionStage::from_i32(pet.stage);
    let expected_stage = stage_for_level(pet.level);

    if expected_stage as i32 > current_stage as i32 {
        Ok(EvolutionResult {
            can_evolve: true,
            new_stage: Some(expected_stage as i32),
            new_stage_label: Some(expected_stage.label().to_string()),
            message: format!("{}可以进化到{}了!", pet.name, expected_stage.label()),
            pet_state: Some(pet_to_state(&pet)),
        })
    } else {
        Ok(EvolutionResult {
            can_evolve: false,
            new_stage: None,
            new_stage_label: None,
            message: "还未满足进化条件".to_string(),
            pet_state: Some(pet_to_state(&pet)),
        })
    }
}

/// 执行进化
pub fn evolve_pet(conn: &Connection, pet_id: &str) -> Result<EvolutionResult, String> {
    let mut pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    let current_stage = EvolutionStage::from_i32(pet.stage);
    let expected_stage = stage_for_level(pet.level);

    if expected_stage as i32 <= current_stage as i32 {
        return Ok(EvolutionResult {
            can_evolve: false,
            new_stage: None,
            new_stage_label: None,
            message: "还未满足进化条件".to_string(),
            pet_state: Some(pet_to_state(&pet)),
        });
    }

    let now = chrono::Utc::now().timestamp_millis();
    pet.stage = expected_stage as i32;
    pet.mood = "excited".to_string();
    pet.happiness = 100;
    pet.energy = 100;
    pet.updated_at = now;

    db::update_pet(conn, &pet)?;
    db::insert_event(conn, &pet.id, "evolve", Some(&format!(
        "{{\"from\":{},\"to\":{}}}", current_stage as i32, expected_stage as i32
    )))?;

    Ok(EvolutionResult {
        can_evolve: false,
        new_stage: Some(expected_stage as i32),
        new_stage_label: Some(expected_stage.label().to_string()),
        message: format!("🎉 {}进化到了{}!", pet.name, expected_stage.label()),
        pet_state: Some(pet_to_state(&pet)),
    })
}

/// 更新心情 (基于当前属性)
pub fn update_pet_mood(conn: &Connection, pet_id: &str) -> Result<PetActionResult, String> {
    let pet = match db::get_pet(conn, pet_id)? {
        Some(p) => p,
        None => return Err("宠物不存在".to_string()),
    };

    let mut pet = apply_time_decay(pet);
    update_mood(&mut pet);
    db::update_pet(conn, &pet)?;

    Ok(PetActionResult {
        success: true,
        message: format!("{} {}", Mood::from_str(&pet.mood).emoji(), pet.mood),
        pet_state: Some(pet_to_state(&pet)),
    })
}

// ═══════════════════════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════════════════════

/// Pet → PetState 转换 (前端友好格式)
fn pet_to_state(pet: &Pet) -> PetState {
    let species = PetSpecies::from_str(&pet.species).unwrap_or(PetSpecies::SproutBud);
    let stage = EvolutionStage::from_i32(pet.stage);
    let mood = Mood::from_str(&pet.mood);
    let level_def = pet_level_for_exp(pet.exp);
    let next = pet_next_level(level_def.level);

    let (exp_to_next, progress) = match next {
        Some(n) => {
            let range = n.min_exp - level_def.min_exp;
            let done = pet.exp - level_def.min_exp;
            (n.min_exp, if range > 0 { (done as f64 / range as f64) * 100.0 } else { 100.0 })
        }
        None => (level_def.min_exp, 100.0),
    };

    let personalities: Vec<String> = serde_json::from_str(&pet.personality).unwrap_or_default();
    let skills: Vec<String> = serde_json::from_str(&pet.skills).unwrap_or_default();
    let accessories: Vec<String> = serde_json::from_str(&pet.accessories).unwrap_or_default();

    // 计算八字信息
    let bazi_info = bazi::calculate_bazi(pet.born_at);

    PetState {
        id: pet.id.clone(),
        owner_id: pet.owner_id.clone(),
        name: pet.name.clone(),
        species: pet.species.clone(),
        species_emoji: species.emoji().to_string(),
        species_name_cn: species.name_cn().to_string(),
        trait_emoji: species.trait_emoji().to_string(),
        stage: pet.stage,
        stage_label: stage.label().to_string(),
        variant: pet.variant.clone(),
        happiness: pet.happiness,
        energy: pet.energy,
        hunger: pet.hunger,
        bond_level: pet.bond_level,
        exp: pet.exp,
        level: pet.level,
        exp_to_next_level: exp_to_next,
        level_progress: progress.min(100.0),
        personality: personalities,
        mood: pet.mood.clone(),
        mood_emoji: mood.emoji().to_string(),
        skills,
        accessories,
        skin_variant: pet.skin_variant.clone(),
        gender: pet.gender.clone(),
        gender_emoji: bazi::gender_emoji(&pet.gender).to_string(),
        gender_label: bazi::gender_label(&pet.gender).to_string(),
        born_at: pet.born_at,
        bazi: Some(bazi_info),
        last_fed_at: pet.last_fed_at,
        last_interaction_at: pet.last_interaction_at,
    }
}

/// 时间衰减：饱腹度、快乐值随时间下降
fn apply_time_decay(mut pet: Pet) -> Pet {
    let now = chrono::Utc::now().timestamp_millis();
    let personality_list: Vec<String> = serde_json::from_str(&pet.personality).unwrap_or_default();
    let is_lazy = personality_list.iter().any(|p| p == "lazy");

    // 饱腹度衰减：每小时 -3
    if let Some(last_fed) = pet.last_fed_at {
        let hours_since_fed = (now - last_fed) as f64 / 3_600_000.0;
        let hunger_loss = (hours_since_fed * 3.0) as i32;
        if hunger_loss > 0 {
            pet.hunger = (pet.hunger - hunger_loss).max(0);
        }
    }

    // 快乐值衰减：每小时 -2 (慵懒性格不衰减)
    if !is_lazy {
        if let Some(last_interaction) = pet.last_interaction_at {
            let hours_since = (now - last_interaction) as f64 / 3_600_000.0;
            let happiness_loss = (hours_since * 2.0) as i32;
            if happiness_loss > 0 {
                pet.happiness = (pet.happiness - happiness_loss).max(0);
            }
        }
    }

    // 活力恢复：每小时 +5
    if let Some(last_interaction) = pet.last_interaction_at {
        let hours_since = (now - last_interaction) as f64 / 3_600_000.0;
        let energy_gain = (hours_since * 5.0) as i32;
        if energy_gain > 0 {
            pet.energy = (pet.energy + energy_gain).min(100);
        }
    }

    pet.updated_at = now;
    pet
}

/// 根据属性值更新心情
fn update_mood(pet: &mut Pet) {
    let now = chrono::Utc::now().timestamp_millis();

    // 检查是否应该睡觉 (超过30分钟未操作)
    if let Some(last) = pet.last_interaction_at {
        if (now - last) > 30 * 60 * 1000 {
            pet.mood = "sleeping".to_string();
            return;
        }
    }

    if pet.happiness >= 80 && pet.hunger >= 60 {
        pet.mood = "happy".to_string();
    } else if pet.happiness >= 50 && pet.hunger >= 40 {
        pet.mood = "content".to_string();
    } else if pet.happiness >= 30 {
        pet.mood = "calm".to_string();
    } else if pet.hunger < 20 || pet.happiness < 20 {
        pet.mood = "sad".to_string();
    } else {
        pet.mood = "bored".to_string();
    }
}

/// 检查并执行升级，返回是否升级了
fn check_level_up(pet: &mut Pet) -> bool {
    let new_level_def = pet_level_for_exp(pet.exp);
    if new_level_def.level > pet.level {
        pet.level = new_level_def.level;
        true
    } else {
        false
    }
}

/// 随机生成 1~2 个性格特征
fn random_personalities() -> Vec<String> {
    use std::collections::HashSet;
    let all = ["diligent", "lazy", "curious", "lively", "scholarly", "resilient"];
    let now = chrono::Utc::now().timestamp_millis() as usize;
    let count = if now % 3 == 0 { 2 } else { 1 };

    let mut result = HashSet::new();
    let mut seed = now;
    while result.len() < count {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let idx = seed % all.len();
        result.insert(all[idx].to_string());
    }

    result.into_iter().collect()
}

/// 简单 UUID v4 生成
fn uuid_v4() -> String {
    let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) as u64;
    let seed = now.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (seed >> 32) as u32,
        (seed >> 16) as u16 & 0xFFFF,
        seed as u16 & 0x0FFF,
        ((seed >> 48) as u16 & 0x3FFF) | 0x8000,
        seed & 0xFFFFFFFFFFFF,
    )
}
