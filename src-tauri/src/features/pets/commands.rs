use tauri::AppHandle;
use super::{db, engine, types::*};
use crate::shared::storage::vault_path;

// ── pet_create ────────────────────────────────────────────
#[tauri::command]
pub fn pet_create(app: AppHandle, args: CreatePetArgs) -> Result<PetState, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::create_pet(&conn, &args.owner_id, &args.species, &args.name)
}

// ── pet_get_state ─────────────────────────────────────────
#[tauri::command]
pub fn pet_get_state(app: AppHandle, args: PetIdArgs) -> Result<Option<PetState>, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::get_state(&conn, &args.pet_id)
}

// ── pet_get_state_by_owner ────────────────────────────────
#[tauri::command]
pub fn pet_get_state_by_owner(app: AppHandle, args: OwnerArgs) -> Result<Option<PetState>, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::get_state_by_owner(&conn, &args.owner_id)
}

// ── pet_feed ──────────────────────────────────────────────
#[tauri::command]
pub fn pet_feed(app: AppHandle, args: FeedPetArgs) -> Result<PetActionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::feed_pet(&conn, &args.pet_id, &args.food_type)
}

// ── pet_interact ──────────────────────────────────────────
#[tauri::command]
pub fn pet_interact(app: AppHandle, args: InteractPetArgs) -> Result<PetActionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::interact_pet(&conn, &args.pet_id, &args.interaction)
}

// ── pet_award_exp (积分联动) ──────────────────────────────
#[tauri::command]
pub fn pet_award_exp(app: AppHandle, args: PetExpArgs) -> Result<PetActionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::award_exp(&conn, &args.pet_id, &args.action, args.points_earned)
}

// ── pet_check_evolution ───────────────────────────────────
#[tauri::command]
pub fn pet_check_evolution(app: AppHandle, args: PetIdArgs) -> Result<EvolutionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::check_evolution(&conn, &args.pet_id)
}

// ── pet_evolve ────────────────────────────────────────────
#[tauri::command]
pub fn pet_evolve(app: AppHandle, args: PetIdArgs) -> Result<EvolutionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::evolve_pet(&conn, &args.pet_id)
}

// ── pet_update_mood ───────────────────────────────────────
#[tauri::command]
pub fn pet_update_mood(app: AppHandle, args: PetIdArgs) -> Result<PetActionResult, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    engine::update_pet_mood(&conn, &args.pet_id)
}

// ── pet_get_inventory ─────────────────────────────────────
#[tauri::command]
pub fn pet_get_inventory(app: AppHandle, args: OwnerArgs) -> Result<Vec<InventoryItem>, String> {
    let vault_root = vault_path(&app, &args.vault_id)?;
    let conn = db::open_pets_db(&vault_root)?;
    Ok(db::get_inventory(&conn, &args.owner_id))
}
