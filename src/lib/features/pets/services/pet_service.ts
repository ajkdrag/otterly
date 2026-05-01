import { invoke } from "@tauri-apps/api/core";
import type {
  PetState,
  PetActionResult,
  EvolutionResult,
  InventoryItem,
  PetSpecies,
} from "$lib/features/pets/types/pet_types";
import type { PetStore } from "$lib/features/pets/state/pet_store.svelte";

export class PetService {
  private pet_store: PetStore;
  private vault_id: () => string | null;
  private owner_id: () => string | null;

  constructor(
    pet_store: PetStore,
    vault_id: () => string | null,
    owner_id: () => string | null,
  ) {
    this.pet_store = pet_store;
    this.vault_id = vault_id;
    this.owner_id = owner_id;
  }

  // ── 宠物创建 ─────────────────────────────────────────

  async create_pet(species: PetSpecies, name: string): Promise<void> {
    const vid = this.vault_id();
    const oid = this.owner_id();
    if (!vid || !oid) return;

    this.pet_store.is_loading = true;
    try {
      const state = await invoke<PetState>("pet_create", {
        args: { vault_id: vid, owner_id: oid, species, name },
      });
      this.pet_store.set_pet(state);
      this.pet_store.close_selection();
      this.pet_store.last_message = `🎉 ${state.species_name_cn}「${state.name}」诞生了!`;
    } catch (e) {
      console.error("pet_create failed:", e);
      this.pet_store.last_message = `创建失败: ${e}`;
    } finally {
      this.pet_store.is_loading = false;
    }
  }

  // ── 加载宠物 ─────────────────────────────────────────

  async load_pet(): Promise<void> {
    const vid = this.vault_id();
    const oid = this.owner_id();
    if (!vid || !oid) return;

    this.pet_store.is_loading = true;
    try {
      const state = await invoke<PetState | null>("pet_get_state_by_owner", {
        args: { vault_id: vid, owner_id: oid },
      });
      this.pet_store.set_pet(state);

      if (!state) {
        this.pet_store.open_selection();
      }
    } catch (e) {
      console.error("pet_get_state_by_owner failed:", e);
    } finally {
      this.pet_store.is_loading = false;
    }
  }

  // ── 刷新状态 ─────────────────────────────────────────

  async refresh_state(): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const state = await invoke<PetState | null>("pet_get_state", {
        args: { vault_id: vid, pet_id },
      });
      if (state) {
        this.pet_store.set_pet(state);
      }
    } catch (e) {
      console.error("pet_get_state failed:", e);
    }
  }

  // ── 喂食 ─────────────────────────────────────────────

  async feed(food_type: string): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const result = await invoke<PetActionResult>("pet_feed", {
        args: { vault_id: vid, pet_id, food_type },
      });
      this.pet_store.apply_action_result(result);
      // 刷新库存
      await this.load_inventory();
    } catch (e) {
      console.error("pet_feed failed:", e);
    }
  }

  // ── 互动 ─────────────────────────────────────────────

  async interact(interaction: string): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const result = await invoke<PetActionResult>("pet_interact", {
        args: { vault_id: vid, pet_id, interaction },
      });
      this.pet_store.apply_action_result(result);
    } catch (e) {
      console.error("pet_interact failed:", e);
    }
  }

  // ── 积分联动：给宠物加经验 ───────────────────────────

  async award_exp(action: string, points_earned: number): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const result = await invoke<PetActionResult>("pet_award_exp", {
        args: { vault_id: vid, pet_id, action, points_earned },
      });
      this.pet_store.apply_action_result(result);

      // 自动检查进化
      await this.check_evolution();
    } catch (e) {
      console.error("pet_award_exp failed:", e);
    }
  }

  // ── 进化检查与执行 ──────────────────────────────────

  async check_evolution(): Promise<EvolutionResult | null> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return null;

    try {
      const result = await invoke<EvolutionResult>("pet_check_evolution", {
        args: { vault_id: vid, pet_id },
      });
      return result;
    } catch (e) {
      console.error("pet_check_evolution failed:", e);
      return null;
    }
  }

  async evolve(): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const result = await invoke<EvolutionResult>("pet_evolve", {
        args: { vault_id: vid, pet_id },
      });
      this.pet_store.apply_evolution_result(result);
    } catch (e) {
      console.error("pet_evolve failed:", e);
    }
  }

  // ── 更新心情 ─────────────────────────────────────────

  async update_mood(): Promise<void> {
    const vid = this.vault_id();
    const pet_id = this.pet_store.pet_id;
    if (!vid || !pet_id) return;

    try {
      const result = await invoke<PetActionResult>("pet_update_mood", {
        args: { vault_id: vid, pet_id },
      });
      this.pet_store.apply_action_result(result);
    } catch (e) {
      console.error("pet_update_mood failed:", e);
    }
  }

  // ── 库存 ─────────────────────────────────────────────

  async load_inventory(): Promise<void> {
    const vid = this.vault_id();
    const oid = this.owner_id();
    if (!vid || !oid) return;

    try {
      const items = await invoke<InventoryItem[]>("pet_get_inventory", {
        args: { vault_id: vid, owner_id: oid },
      });
      this.pet_store.set_inventory(items);
    } catch (e) {
      console.error("pet_get_inventory failed:", e);
    }
  }
}
