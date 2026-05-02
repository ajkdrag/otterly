// ── Types ──────────────────────────────────────────────────
export type {
  PetSpecies,
  EvolutionStage,
  PetMood,
  PetPersonality,
  PetState,
  PetActionResult,
  EvolutionResult,
  InventoryItem,
  FoodDef,
  InteractionDef,
} from "$lib/features/pets/types/pet_types";

export {
  PET_SPECIES_LIST,
  STAGE_LABELS,
  MOOD_EMOJIS,
  PERSONALITY_INFO,
  FOODS,
  INTERACTIONS,
} from "$lib/features/pets/types/pet_types";

// ── State ─────────────────────────────────────────────────
export { PetStore } from "$lib/features/pets/state/pet_store.svelte";

// ── Services ──────────────────────────────────────────────
export { PetService } from "$lib/features/pets/services/pet_service";

// ── UI ────────────────────────────────────────────────────
export { default as PetWidget } from "$lib/features/pets/ui/pet_widget.svelte";
export { default as PetDetailPanel } from "$lib/features/pets/ui/pet_detail_panel.svelte";
export { default as PetSelection } from "$lib/features/pets/ui/pet_selection.svelte";
