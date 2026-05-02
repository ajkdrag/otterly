use std::path::Path;
use rusqlite::Connection;
use crate::shared::constants::APP_DIR;
use super::types::*;

pub fn open_pets_db(vault_root: &Path) -> Result<Connection, String> {
    let db_dir = vault_root.join(APP_DIR);
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(db_dir.join("pets.db")).map_err(|e| e.to_string())?;
    let _: String = conn
        .pragma_update_and_check(None, "journal_mode", &"WAL", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", &"NORMAL")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| e.to_string())?;
    // 迁移：为已有旧表添加 gender 列（忽略错误，列可能已存在）
    let _ = conn.execute("ALTER TABLE pets ADD COLUMN gender TEXT DEFAULT 'male'", []);

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
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

// ── 宠物 CRUD ────────────────────────────────────────────

pub fn insert_pet(conn: &Connection, pet: &Pet) -> Result<(), String> {
    conn.execute(
        "INSERT INTO pets (id, owner_id, name, species, stage, variant,
            happiness, energy, hunger, bond_level, exp, level,
            personality, mood, skills, accessories, skin_variant, gender,
            born_at, last_fed_at, last_interaction_at, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
        rusqlite::params![
            pet.id, pet.owner_id, pet.name, pet.species, pet.stage, pet.variant,
            pet.happiness, pet.energy, pet.hunger, pet.bond_level, pet.exp, pet.level,
            pet.personality, pet.mood, pet.skills, pet.accessories, pet.skin_variant, pet.gender,
            pet.born_at, pet.last_fed_at, pet.last_interaction_at, pet.created_at, pet.updated_at,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_pet(conn: &Connection, pet_id: &str) -> Result<Option<Pet>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, owner_id, name, species, stage, variant,
                happiness, energy, hunger, bond_level, exp, level,
                personality, mood, skills, accessories, skin_variant, gender,
                born_at, last_fed_at, last_interaction_at, created_at, updated_at
         FROM pets WHERE id = ?1"
    ).map_err(|e| e.to_string())?;

    let pet = stmt.query_row([pet_id], |r| {
        Ok(Pet {
            id: r.get(0)?,
            owner_id: r.get(1)?,
            name: r.get(2)?,
            species: r.get(3)?,
            stage: r.get(4)?,
            variant: r.get(5)?,
            happiness: r.get(6)?,
            energy: r.get(7)?,
            hunger: r.get(8)?,
            bond_level: r.get(9)?,
            exp: r.get(10)?,
            level: r.get(11)?,
            personality: r.get(12)?,
            mood: r.get(13)?,
            skills: r.get(14)?,
            accessories: r.get(15)?,
            skin_variant: r.get(16)?,
            gender: r.get::<_, Option<String>>(17)?.unwrap_or_else(|| "male".to_string()),
            born_at: r.get(18)?,
            last_fed_at: r.get(19)?,
            last_interaction_at: r.get(20)?,
            created_at: r.get(21)?,
            updated_at: r.get(22)?,
        })
    }).optional().map_err(|e| e.to_string())?;

    Ok(pet)
}

pub fn get_pet_by_owner(conn: &Connection, owner_id: &str) -> Result<Option<Pet>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, owner_id, name, species, stage, variant,
                happiness, energy, hunger, bond_level, exp, level,
                personality, mood, skills, accessories, skin_variant, gender,
                born_at, last_fed_at, last_interaction_at, created_at, updated_at
         FROM pets WHERE owner_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let pet = stmt.query_row([owner_id], |r| {
        Ok(Pet {
            id: r.get(0)?,
            owner_id: r.get(1)?,
            name: r.get(2)?,
            species: r.get(3)?,
            stage: r.get(4)?,
            variant: r.get(5)?,
            happiness: r.get(6)?,
            energy: r.get(7)?,
            hunger: r.get(8)?,
            bond_level: r.get(9)?,
            exp: r.get(10)?,
            level: r.get(11)?,
            personality: r.get(12)?,
            mood: r.get(13)?,
            skills: r.get(14)?,
            accessories: r.get(15)?,
            skin_variant: r.get(16)?,
            gender: r.get::<_, Option<String>>(17)?.unwrap_or_else(|| "male".to_string()),
            born_at: r.get(18)?,
            last_fed_at: r.get(19)?,
            last_interaction_at: r.get(20)?,
            created_at: r.get(21)?,
            updated_at: r.get(22)?,
        })
    }).optional().map_err(|e| e.to_string())?;

    Ok(pet)
}

pub fn update_pet(conn: &Connection, pet: &Pet) -> Result<(), String> {
    conn.execute(
        "UPDATE pets SET
            name=?2, stage=?3, variant=?4,
            happiness=?5, energy=?6, hunger=?7, bond_level=?8,
            exp=?9, level=?10, personality=?11, mood=?12,
            skills=?13, accessories=?14, skin_variant=?15, gender=?16,
            last_fed_at=?17, last_interaction_at=?18, updated_at=?19
         WHERE id=?1",
        rusqlite::params![
            pet.id, pet.name, pet.stage, pet.variant,
            pet.happiness, pet.energy, pet.hunger, pet.bond_level,
            pet.exp, pet.level, pet.personality, pet.mood,
            pet.skills, pet.accessories, pet.skin_variant, pet.gender,
            pet.last_fed_at, pet.last_interaction_at, pet.updated_at,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── 事件日志 ──────────────────────────────────────────────

pub fn insert_event(conn: &Connection, pet_id: &str, event_type: &str, event_data: Option<&str>) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO pet_events (pet_id, event_type, event_data, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![pet_id, event_type, event_data, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_recent_events(conn: &Connection, pet_id: &str, limit: i64) -> Vec<PetEvent> {
    let mut stmt = conn.prepare(
        "SELECT id, pet_id, event_type, event_data, created_at
         FROM pet_events WHERE pet_id=?1 ORDER BY id DESC LIMIT ?2"
    ).unwrap();
    stmt.query_map(rusqlite::params![pet_id, limit], |r| {
        Ok(PetEvent {
            id: r.get(0)?,
            pet_id: r.get(1)?,
            event_type: r.get(2)?,
            event_data: r.get(3)?,
            created_at: r.get(4)?,
        })
    }).unwrap().filter_map(|r| r.ok()).collect()
}

// ── 物品库存 ──────────────────────────────────────────────

pub fn add_inventory_item(conn: &Connection, owner_id: &str, item_type: &str, quantity: i32) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO pet_inventory (owner_id, item_type, quantity, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(owner_id, item_type) DO UPDATE SET quantity = quantity + ?3, updated_at = ?4",
        rusqlite::params![owner_id, item_type, quantity, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn use_inventory_item(conn: &Connection, owner_id: &str, item_type: &str) -> Result<bool, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let affected = conn.execute(
        "UPDATE pet_inventory SET quantity = quantity - 1, updated_at = ?3
         WHERE owner_id = ?1 AND item_type = ?2 AND quantity > 0",
        rusqlite::params![owner_id, item_type, now],
    ).map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

pub fn get_inventory(conn: &Connection, owner_id: &str) -> Vec<InventoryItem> {
    let mut stmt = conn.prepare(
        "SELECT item_type, quantity FROM pet_inventory WHERE owner_id=?1 AND quantity > 0"
    ).unwrap();
    stmt.query_map([owner_id], |r| {
        let item_type: String = r.get(0)?;
        let quantity: i32 = r.get(1)?;
        let (emoji, name) = match find_food(&item_type) {
            Some(f) => (f.emoji.to_string(), f.name.to_string()),
            None => ("📦".to_string(), item_type.clone()),
        };
        Ok(InventoryItem {
            item_type,
            quantity,
            item_emoji: emoji,
            item_name: name,
        })
    }).unwrap().filter_map(|r| r.ok()).collect()
}

// ── 辅助 trait ───────────────────────────────────────────

trait OptionalRow {
    type Item;
    fn optional(self) -> Result<Option<Self::Item>, rusqlite::Error>;
}

impl<T> OptionalRow for Result<T, rusqlite::Error> {
    type Item = T;
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
