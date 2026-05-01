import type {
  PetState,
  PetActionResult,
  EvolutionResult,
  InventoryItem,
} from "$lib/features/pets/types/pet_types";

export class PetStore {
  pet = $state<PetState | null>(null);
  inventory = $state<InventoryItem[]>([]);
  has_pet = $state(false);
  is_loading = $state(false);
  show_selection = $state(false);
  show_detail = $state(false);
  last_message = $state<string | null>(null);
  show_widget = $state(true);
  widget_position = $state<"bottom-left" | "bottom-right">("bottom-right");
  widget_opacity = $state(1.0);

  // ── 派生属性 ─────────────────────────────────────────

  get pet_id(): string | null {
    return this.pet?.id ?? null;
  }

  get pet_name(): string {
    return this.pet?.name ?? "";
  }

  get species_emoji(): string {
    return this.pet?.species_emoji ?? "🥚";
  }

  get trait_emoji(): string {
    return this.pet?.trait_emoji ?? "";
  }

  get mood_emoji(): string {
    return this.pet?.mood_emoji ?? "😐";
  }

  get level(): number {
    return this.pet?.level ?? 0;
  }

  get stage_label(): string {
    return this.pet?.stage_label ?? "";
  }

  get happiness(): number {
    return this.pet?.happiness ?? 0;
  }

  get energy(): number {
    return this.pet?.energy ?? 0;
  }

  get hunger(): number {
    return this.pet?.hunger ?? 0;
  }

  get bond_level(): number {
    return this.pet?.bond_level ?? 0;
  }

  get exp(): number {
    return this.pet?.exp ?? 0;
  }

  get level_progress(): number {
    return this.pet?.level_progress ?? 0;
  }

  get display_emoji(): string {
    if (!this.pet) return "🥚";
    return this.pet.species_emoji;
  }

  // ── 状态更新方法 ─────────────────────────────────────

  set_pet(state: PetState | null) {
    this.pet = state;
    this.has_pet = state !== null;
  }

  set_inventory(items: InventoryItem[]) {
    this.inventory = items;
  }

  apply_action_result(result: PetActionResult) {
    if (result.pet_state) {
      this.set_pet(result.pet_state);
    }
    this.last_message = result.message;
  }

  apply_evolution_result(result: EvolutionResult) {
    if (result.pet_state) {
      this.set_pet(result.pet_state);
    }
    this.last_message = result.message;
  }

  toggle_detail() {
    this.show_detail = !this.show_detail;
  }

  toggle_widget() {
    this.show_widget = !this.show_widget;
  }

  set_widget_opacity(opacity: number) {
    this.widget_opacity = Math.max(0.2, Math.min(1.0, opacity));
  }

  open_selection() {
    this.show_selection = true;
  }

  close_selection() {
    this.show_selection = false;
  }

  clear_message() {
    this.last_message = null;
  }
}
