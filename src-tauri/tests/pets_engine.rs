use crate::features::pets::{db, engine, types::*};
use rusqlite::Connection;

fn setup_test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pets (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            name TEXT NOT NULL,
            species TEXT NOT NULL,
            stage INTEGER NOT NULL DEFAULT 1,
            variant TEXT DEFAULT 'base',
            happiness INTEGER DEFAULT 80,
            energy INTEGER DEFAULT 100,
            hunger INTEGER DEFAULT 100,
            bond_level INTEGER DEFAULT 0,
            exp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            personality TEXT NOT NULL,
            mood TEXT DEFAULT 'calm',
            skills TEXT DEFAULT '[]',
            accessories TEXT DEFAULT '[]',
            skin_variant TEXT DEFAULT 'default',
            gender TEXT DEFAULT 'male',
            born_at INTEGER NOT NULL,
            last_fed_at INTEGER,
            last_interaction_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pet_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (pet_id) REFERENCES pets(id)
        );
        CREATE TABLE IF NOT EXISTS pet_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            updated_at INTEGER NOT NULL,
            UNIQUE(owner_id, item_type)
        );",
    ).unwrap();
    conn
}

// ═══════════════════════════════════════════════════════════
// 类型测试
// ═══════════════════════════════════════════════════════════

#[test]
fn test_pet_species_roundtrip() {
    let species = PetSpecies::InkSprite;
    assert_eq!(species.as_str(), "ink_sprite");
    assert_eq!(species.emoji(), "🐱");
    assert_eq!(species.name_cn(), "墨灵");
    assert_eq!(species.trait_emoji(), "✒️");

    let parsed = PetSpecies::from_str("ink_sprite").unwrap();
    assert_eq!(parsed, PetSpecies::InkSprite);

    assert!(PetSpecies::from_str("unknown").is_err());
}

#[test]
fn test_all_species() {
    let species_strs = ["ink_sprite", "scroll_pup", "code_kit", "think_cloud", "sprout_bud"];
    for s in &species_strs {
        let species = PetSpecies::from_str(s).unwrap();
        assert_eq!(species.as_str(), *s);
        assert!(!species.emoji().is_empty());
        assert!(!species.name_cn().is_empty());
    }
}

#[test]
fn test_evolution_stage() {
    assert_eq!(EvolutionStage::from_i32(1), EvolutionStage::Baby);
    assert_eq!(EvolutionStage::from_i32(2), EvolutionStage::Teen);
    assert_eq!(EvolutionStage::from_i32(3), EvolutionStage::Adult);
    assert_eq!(EvolutionStage::from_i32(4), EvolutionStage::Legendary);
    assert_eq!(EvolutionStage::from_i32(99), EvolutionStage::Baby); // fallback

    assert_eq!(EvolutionStage::Baby.label(), "幼崽期");
    assert_eq!(EvolutionStage::Legendary.label(), "传说期");
}

#[test]
fn test_mood_roundtrip() {
    let moods = ["happy", "content", "calm", "bored", "sad", "sleeping", "excited", "celebrating"];
    for m in &moods {
        let mood = Mood::from_str(m);
        assert_eq!(mood.as_str(), *m);
        assert!(!mood.emoji().is_empty());
    }
    // unknown fallback
    assert_eq!(Mood::from_str("xyz"), Mood::Calm);
}

#[test]
fn test_pet_level_for_exp() {
    let lv1 = pet_level_for_exp(0);
    assert_eq!(lv1.level, 1);

    let lv2 = pet_level_for_exp(30);
    assert_eq!(lv2.level, 2);

    let lv5 = pet_level_for_exp(250);
    assert_eq!(lv5.level, 5);

    let lv10 = pet_level_for_exp(1500);
    assert_eq!(lv10.level, 10);

    // 超高经验
    let max = pet_level_for_exp(99999999);
    assert_eq!(max.level, 50);
}

#[test]
fn test_pet_next_level() {
    let next = pet_next_level(1).unwrap();
    assert_eq!(next.level, 2);
    assert_eq!(next.min_exp, 30);

    let next50 = pet_next_level(50);
    assert!(next50.is_none()); // 已满级
}

#[test]
fn test_stage_for_level() {
    assert_eq!(stage_for_level(1) as i32, EvolutionStage::Baby as i32);
    assert_eq!(stage_for_level(5) as i32, EvolutionStage::Baby as i32);
    assert_eq!(stage_for_level(6) as i32, EvolutionStage::Teen as i32);
    assert_eq!(stage_for_level(12) as i32, EvolutionStage::Teen as i32);
    assert_eq!(stage_for_level(13) as i32, EvolutionStage::Adult as i32);
    assert_eq!(stage_for_level(20) as i32, EvolutionStage::Adult as i32);
    assert_eq!(stage_for_level(21) as i32, EvolutionStage::Legendary as i32);
    assert_eq!(stage_for_level(50) as i32, EvolutionStage::Legendary as i32);
}

#[test]
fn test_food_definitions() {
    assert!(find_food("ink_candy").is_some());
    assert!(find_food("scroll_cake").is_some());
    assert!(find_food("idea_fruit").is_some());
    assert!(find_food("analysis_tea").is_some());
    assert!(find_food("star_dew").is_some());
    assert!(find_food("nonexistent").is_none());

    let ink = find_food("ink_candy").unwrap();
    assert_eq!(ink.hunger_restore, 20);
    assert_eq!(ink.happiness_bonus, 5);
}

#[test]
fn test_interaction_definitions() {
    assert!(find_interaction("pat").is_some());
    assert!(find_interaction("play").is_some());
    assert!(find_interaction("talk").is_some());
    assert!(find_interaction("nonexistent").is_none());

    let pat = find_interaction("pat").unwrap();
    assert_eq!(pat.happiness_bonus, 5);
    assert_eq!(pat.bond_bonus, 2);
    assert_eq!(pat.cooldown_secs, 600);
}

#[test]
fn test_personality_exp_multiplier() {
    let diligent = Personality::Diligent;
    assert!(diligent.exp_multiplier("note_create") > 1.0);
    assert_eq!(diligent.exp_multiplier("search_query"), 1.0);

    let curious = Personality::Curious;
    assert!(curious.exp_multiplier("nlp_analyze") > 1.0);

    let scholarly = Personality::Scholarly;
    assert!(scholarly.exp_multiplier("file_read_complete") > 1.0);
}

// ═══════════════════════════════════════════════════════════
// 引擎测试
// ═══════════════════════════════════════════════════════════

#[test]
fn test_create_pet() {
    let conn = setup_test_db();
    let state = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    assert_eq!(state.name, "小墨");
    assert_eq!(state.species, "ink_sprite");
    assert_eq!(state.species_emoji, "🐱");
    assert_eq!(state.species_name_cn, "墨灵");
    assert_eq!(state.stage, 1);
    assert_eq!(state.stage_label, "幼崽期");
    assert_eq!(state.level, 1);
    assert_eq!(state.happiness, 80);
    assert_eq!(state.energy, 100);
    assert_eq!(state.hunger, 100);
    assert!(!state.personality.is_empty());
    assert!(state.id.starts_with("pet_"));
    // gender 和 bazi 字段
    assert!(state.gender == "male" || state.gender == "female");
    assert!(!state.gender_emoji.is_empty());
    assert!(!state.gender_label.is_empty());
    assert!(state.bazi.is_some());
    let bazi = state.bazi.unwrap();
    assert!(!bazi.bazi_full.is_empty());
    assert!(!bazi.wu_xing.is_empty());
    assert!(!bazi.sheng_xiao.is_empty());
    assert!(!bazi.ba_gua.is_empty());
}

#[test]
fn test_create_pet_with_gender_override() {
    let conn = setup_test_db();

    let state_male = engine::create_pet(&conn, "user_m", "ink_sprite", "小墨公", Some("male")).unwrap();
    assert_eq!(state_male.gender, "male");
    assert_eq!(state_male.gender_emoji, "♂");
    assert_eq!(state_male.gender_label, "公");

    let conn2 = setup_test_db();
    let state_female = engine::create_pet(&conn2, "user_f", "scroll_pup", "小墨母", Some("female")).unwrap();
    assert_eq!(state_female.gender, "female");
    assert_eq!(state_female.gender_emoji, "♀");
    assert_eq!(state_female.gender_label, "母");
}

#[test]
fn test_create_pet_duplicate() {
    let conn = setup_test_db();
    engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();
    let err = engine::create_pet(&conn, "user_1", "scroll_pup", "卷卷", None);
    assert!(err.is_err());
    assert!(err.unwrap_err().contains("已经有"));
}

#[test]
fn test_create_pet_invalid_species() {
    let conn = setup_test_db();
    let err = engine::create_pet(&conn, "user_1", "invalid_species", "test", None);
    assert!(err.is_err());
}

#[test]
fn test_create_all_species() {
    let species = ["ink_sprite", "scroll_pup", "code_kit", "think_cloud", "sprout_bud"];
    for (i, s) in species.iter().enumerate() {
        let conn = setup_test_db();
        let state = engine::create_pet(&conn, &format!("user_{}", i), s, &format!("pet_{}", i), None).unwrap();
        assert_eq!(state.species, *s);
    }
}

#[test]
fn test_get_state() {
    let conn = setup_test_db();
    let created = engine::create_pet(&conn, "user_1", "sprout_bud", "芽芽", None).unwrap();

    let state = engine::get_state(&conn, &created.id).unwrap();
    assert!(state.is_some());
    let state = state.unwrap();
    assert_eq!(state.id, created.id);
    assert_eq!(state.name, "芽芽");
}

#[test]
fn test_get_state_nonexistent() {
    let conn = setup_test_db();
    let state = engine::get_state(&conn, "nonexistent_id").unwrap();
    assert!(state.is_none());
}

#[test]
fn test_get_state_by_owner() {
    let conn = setup_test_db();
    engine::create_pet(&conn, "owner_abc", "code_kit", "码仔", None).unwrap();

    let state = engine::get_state_by_owner(&conn, "owner_abc").unwrap();
    assert!(state.is_some());
    assert_eq!(state.unwrap().name, "码仔");

    let none = engine::get_state_by_owner(&conn, "nonexistent_owner").unwrap();
    assert!(none.is_none());
}

#[test]
fn test_award_exp() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    let result = engine::award_exp(&conn, &pet.id, "note_create", 8).unwrap();
    assert!(result.success);
    assert!(result.pet_state.is_some());
    let state = result.pet_state.unwrap();
    assert!(state.exp > 0); // 至少 6 exp (note_create base)
}

#[test]
fn test_award_exp_level_up() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    // 重复给经验直到升级
    let mut leveled_up = false;
    for _ in 0..20 {
        let result = engine::award_exp(&conn, &pet.id, "file_read_complete", 10).unwrap();
        if result.pet_state.as_ref().map(|s| s.level).unwrap_or(1) > 1 {
            leveled_up = true;
            break;
        }
    }
    assert!(leveled_up, "宠物应该在多次获得经验后升级");
}

#[test]
fn test_award_exp_nonexistent_pet() {
    let conn = setup_test_db();
    let result = engine::award_exp(&conn, "nonexistent", "note_create", 8);
    assert!(result.is_err());
}

#[test]
fn test_interact_pet() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "scroll_pup", "卷卷", None).unwrap();

    // 创建时 last_interaction_at = now，所以需要先把它清除以避免冷却
    conn.execute(
        "UPDATE pets SET last_interaction_at = NULL WHERE id = ?1",
        [&pet.id],
    ).unwrap();

    let result = engine::interact_pet(&conn, &pet.id, "pat").unwrap();
    assert!(result.success);
    let state = result.pet_state.unwrap();
    assert!(state.happiness >= 80); // 初始80 + 5
    assert!(state.bond_level > 0);
}

#[test]
fn test_interact_pet_cooldown() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "scroll_pup", "卷卷", None).unwrap();

    // 清除初始 last_interaction_at 以允许第一次互动
    conn.execute(
        "UPDATE pets SET last_interaction_at = NULL WHERE id = ?1",
        [&pet.id],
    ).unwrap();

    // 第一次互动应该成功
    let r1 = engine::interact_pet(&conn, &pet.id, "pat").unwrap();
    assert!(r1.success);

    // 第二次互动应该因冷却而失败
    let r2 = engine::interact_pet(&conn, &pet.id, "pat").unwrap();
    assert!(!r2.success);
    assert!(r2.message.contains("冷却"));
}

#[test]
fn test_interact_invalid_type() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "scroll_pup", "卷卷", None).unwrap();

    let result = engine::interact_pet(&conn, &pet.id, "invalid_interaction");
    assert!(result.is_err());
}

#[test]
fn test_feed_pet() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "think_cloud", "思思", None).unwrap();

    // 先添加库存
    db::add_inventory_item(&conn, "user_1", "ink_candy", 3).unwrap();

    let result = engine::feed_pet(&conn, &pet.id, "ink_candy").unwrap();
    assert!(result.success);
    assert!(result.message.contains("墨水糖"));

    // 验证库存减少了
    let inv = db::get_inventory(&conn, "user_1");
    let candy = inv.iter().find(|i| i.item_type == "ink_candy").unwrap();
    assert_eq!(candy.quantity, 2);
}

#[test]
fn test_feed_pet_no_inventory() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "think_cloud", "思思", None).unwrap();

    // 没有库存，喂食应该失败
    let result = engine::feed_pet(&conn, &pet.id, "ink_candy").unwrap();
    assert!(!result.success);
    assert!(result.message.contains("没有"));
}

#[test]
fn test_feed_pet_invalid_food() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "think_cloud", "思思", None).unwrap();

    let result = engine::feed_pet(&conn, &pet.id, "invalid_food");
    assert!(result.is_err());
}

#[test]
fn test_check_evolution_not_ready() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    let result = engine::check_evolution(&conn, &pet.id).unwrap();
    assert!(!result.can_evolve);
    assert!(result.message.contains("未满足"));
}

#[test]
fn test_evolve_pet_not_ready() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    let result = engine::evolve_pet(&conn, &pet.id).unwrap();
    assert!(!result.can_evolve);
}

#[test]
fn test_evolve_pet_ready() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    // 手动设置高经验使宠物升到 Lv.6 → 可进化到 Teen
    conn.execute(
        "UPDATE pets SET exp = 500, level = 6 WHERE id = ?1",
        [&pet.id],
    ).unwrap();

    let check = engine::check_evolution(&conn, &pet.id).unwrap();
    assert!(check.can_evolve);
    assert_eq!(check.new_stage, Some(2)); // Teen

    let result = engine::evolve_pet(&conn, &pet.id).unwrap();
    assert_eq!(result.new_stage, Some(2));
    assert!(result.message.contains("进化"));

    let state = result.pet_state.unwrap();
    assert_eq!(state.stage, 2);
    assert_eq!(state.stage_label, "成长期");
}

#[test]
fn test_update_mood() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "sprout_bud", "芽芽", None).unwrap();

    let result = engine::update_pet_mood(&conn, &pet.id).unwrap();
    assert!(result.success);
    assert!(result.pet_state.is_some());
}

// ═══════════════════════════════════════════════════════════
// DB 层测试
// ═══════════════════════════════════════════════════════════

#[test]
fn test_inventory_operations() {
    let conn = setup_test_db();

    // 添加物品
    db::add_inventory_item(&conn, "owner1", "ink_candy", 5).unwrap();
    db::add_inventory_item(&conn, "owner1", "scroll_cake", 3).unwrap();

    let inv = db::get_inventory(&conn, "owner1");
    assert_eq!(inv.len(), 2);

    let candy = inv.iter().find(|i| i.item_type == "ink_candy").unwrap();
    assert_eq!(candy.quantity, 5);
    assert_eq!(candy.item_name, "墨水糖");
    assert_eq!(candy.item_emoji, "📝");

    // 叠加添加
    db::add_inventory_item(&conn, "owner1", "ink_candy", 2).unwrap();
    let inv = db::get_inventory(&conn, "owner1");
    let candy = inv.iter().find(|i| i.item_type == "ink_candy").unwrap();
    assert_eq!(candy.quantity, 7);

    // 使用物品
    assert!(db::use_inventory_item(&conn, "owner1", "ink_candy").unwrap());
    let inv = db::get_inventory(&conn, "owner1");
    let candy = inv.iter().find(|i| i.item_type == "ink_candy").unwrap();
    assert_eq!(candy.quantity, 6);

    // 使用不存在的物品
    assert!(!db::use_inventory_item(&conn, "owner1", "nonexistent").unwrap());

    // 不同 owner 隔离
    let inv2 = db::get_inventory(&conn, "owner2");
    assert!(inv2.is_empty());
}

#[test]
fn test_pet_events() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    // 创建后应该有一个 "born" 事件
    let events = db::get_recent_events(&conn, &pet.id, 10);
    assert!(!events.is_empty());
    assert_eq!(events[0].event_type, "born");
}

#[test]
fn test_exp_progress_calculation() {
    let conn = setup_test_db();
    let pet = engine::create_pet(&conn, "user_1", "ink_sprite", "小墨", None).unwrap();

    assert_eq!(pet.level, 1);
    assert!(pet.level_progress >= 0.0);
    assert!(pet.level_progress <= 100.0);
    assert!(pet.exp_to_next_level > 0);
}
