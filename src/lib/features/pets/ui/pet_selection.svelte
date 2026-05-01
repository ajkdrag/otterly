<script lang="ts">
  import type { PetStore } from "$lib/features/pets/state/pet_store.svelte";
  import type { PetService } from "$lib/features/pets/services/pet_service";
  import { PET_SPECIES_LIST } from "$lib/features/pets/types/pet_types";
  import type { PetSpecies } from "$lib/features/pets/types/pet_types";

  type Props = {
    pet_store: PetStore;
    pet_service: PetService;
  };

  let { pet_store, pet_service }: Props = $props();

  const open = $derived(pet_store.show_selection);
  const is_loading = $derived(pet_store.is_loading);

  let selected_species = $state<PetSpecies | null>(null);
  let pet_name = $state("");
  let selected_gender = $state<"male" | "female" | "random">("random");
  let step = $state<"choose" | "name">("choose");

  function close() {
    pet_store.close_selection();
    reset();
  }

  function reset() {
    selected_species = null;
    pet_name = "";
    selected_gender = "random";
    step = "choose";
  }

  function select_egg(species: PetSpecies) {
    selected_species = species;
    step = "name";
  }

  function go_back() {
    step = "choose";
    pet_name = "";
  }

  async function confirm_create() {
    if (!selected_species || !pet_name.trim()) return;
    await pet_service.create_pet(selected_species, pet_name.trim(), selected_gender);
    reset();
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && step === "name" && pet_name.trim()) {
      void confirm_create();
    }
  }

  function handle_backdrop(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("PetSelect__backdrop")) {
      close();
    }
  }

  function get_egg_emoji(species: PetSpecies): string {
    const map: Record<PetSpecies, string> = {
      ink_sprite: "🥚",
      scroll_pup: "🥚",
      code_kit: "🥚",
      think_cloud: "🥚",
      sprout_bud: "🥚",
    };
    return map[species];
  }
</script>

<svelte:window onkeydown={handle_keydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="PetSelect__backdrop" onclick={handle_backdrop}>
    <div class="PetSelect__dialog">
      {#if step === "choose"}
        <!-- 选蛋阶段 -->
        <div class="PetSelect__header">
          <span class="PetSelect__title">🐾 选择你的学习伙伴</span>
          <span class="PetSelect__subtitle">
            选择一枚宠物蛋，开始你们的知识旅程
          </span>
        </div>

        <div class="PetSelect__eggs">
          {#each PET_SPECIES_LIST as item}
            <button
              type="button"
              class="PetSelect__egg"
              class:PetSelect__egg--selected={selected_species === item.species}
              onclick={() => select_egg(item.species)}
            >
              <div class="PetSelect__egg-visual">
                <span class="PetSelect__egg-emoji">{get_egg_emoji(item.species)}</span>
                <span class="PetSelect__egg-pet">{item.emoji}</span>
              </div>
              <span class="PetSelect__egg-name">{item.nameCn}</span>
              <span class="PetSelect__egg-trait">{item.traitEmoji} {item.description}</span>
            </button>
          {/each}
        </div>
      {:else}
        <!-- 取名阶段 -->
        {@const info = PET_SPECIES_LIST.find((s) => s.species === selected_species)}
        <div class="PetSelect__header">
          <span class="PetSelect__title">
            {info?.emoji ?? "🥚"} 给{info?.nameCn ?? "宠物"}取个名字
          </span>
          <span class="PetSelect__subtitle">
            这将是陪伴你学习旅程的小伙伴
          </span>
        </div>

        <div class="PetSelect__name-form">
          <div class="PetSelect__preview">
            <span class="PetSelect__preview-emoji">{info?.emoji ?? "🥚"}</span>
            <span class="PetSelect__preview-trait">{info?.traitEmoji ?? ""}</span>
          </div>

          <input
            type="text"
            class="PetSelect__name-input"
            placeholder="输入宠物名字..."
            maxlength="20"
            bind:value={pet_name}
            autofocus
          />

          <!-- 性别选择 -->
          <div class="PetSelect__gender-row">
            <span class="PetSelect__gender-label">性别</span>
            <div class="PetSelect__gender-options">
              <button
                type="button"
                class="PetSelect__gender-btn"
                class:PetSelect__gender-btn--active={selected_gender === "random"}
                onclick={() => selected_gender = "random"}
              >🎲 随机</button>
              <button
                type="button"
                class="PetSelect__gender-btn"
                class:PetSelect__gender-btn--active={selected_gender === "male"}
                onclick={() => selected_gender = "male"}
              >♂ 公</button>
              <button
                type="button"
                class="PetSelect__gender-btn"
                class:PetSelect__gender-btn--active={selected_gender === "female"}
                onclick={() => selected_gender = "female"}
              >♀ 母</button>
            </div>
          </div>

          <div class="PetSelect__name-actions">
            <button
              type="button"
              class="PetSelect__btn PetSelect__btn--secondary"
              onclick={go_back}
            >
              ← 重新选择
            </button>
            <button
              type="button"
              class="PetSelect__btn PetSelect__btn--primary"
              disabled={!pet_name.trim() || is_loading}
              onclick={confirm_create}
            >
              {#if is_loading}
                孵化中...
              {:else}
                🐣 开始孵化!
              {/if}
            </button>
          </div>
        </div>
      {/if}

      <button type="button" class="PetSelect__close" onclick={close}>✕</button>
    </div>
  </div>
{/if}

<style>
  .PetSelect__backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: petsel-fade-in 200ms ease;
  }

  .PetSelect__dialog {
    position: relative;
    background: var(--card, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-lg, 12px);
    width: min(90vw, 480px);
    max-height: min(85vh, 600px);
    overflow-y: auto;
    padding: var(--space-6, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-5, 20px);
    animation: petsel-slide-up 300ms ease;
  }

  .PetSelect__close {
    position: absolute;
    top: var(--space-3, 12px);
    right: var(--space-3, 12px);
    background: none;
    border: none;
    color: var(--muted-foreground, #888);
    font-size: 18px;
    cursor: pointer;
    padding: var(--space-1, 4px);
    transition: color var(--duration-fast, 100ms);
  }

  .PetSelect__close:hover {
    color: var(--foreground, #fff);
  }

  /* ── 头部 ────────────────────────────────────── */

  .PetSelect__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1, 4px);
    text-align: center;
  }

  .PetSelect__title {
    font-size: var(--text-lg, 18px);
    font-weight: 700;
    color: var(--foreground, #fff);
  }

  .PetSelect__subtitle {
    font-size: var(--text-sm, 14px);
    color: var(--muted-foreground, #888);
  }

  /* ── 蛋选择 ──────────────────────────────────── */

  .PetSelect__eggs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-3, 12px);
  }

  .PetSelect__egg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-3, 12px);
    background: var(--muted, #2a2a3e);
    border: 2px solid var(--border, #333);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 100ms),
      transform var(--duration-fast, 100ms),
      box-shadow var(--duration-fast, 100ms);
  }

  .PetSelect__egg:hover {
    border-color: var(--interactive, #6366f1);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  }

  .PetSelect__egg--selected {
    border-color: var(--interactive, #6366f1);
    background: rgba(99, 102, 241, 0.1);
  }

  .PetSelect__egg-visual {
    position: relative;
    font-size: 40px;
    line-height: 1;
  }

  .PetSelect__egg-emoji {
    display: block;
  }

  .PetSelect__egg-pet {
    position: absolute;
    bottom: -4px;
    right: -8px;
    font-size: 20px;
  }

  .PetSelect__egg-name {
    font-size: var(--text-sm, 14px);
    font-weight: 600;
    color: var(--foreground, #fff);
  }

  .PetSelect__egg-trait {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
    text-align: center;
    line-height: 1.3;
  }

  /* ── 取名 ────────────────────────────────────── */

  .PetSelect__name-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4, 16px);
  }

  .PetSelect__preview {
    font-size: 64px;
    line-height: 1;
    position: relative;
    animation: petsel-hatch 600ms ease;
  }

  .PetSelect__preview-emoji {
    display: block;
  }

  .PetSelect__preview-trait {
    position: absolute;
    bottom: -4px;
    right: -12px;
    font-size: 24px;
  }

  .PetSelect__name-input {
    width: 100%;
    max-width: 280px;
    padding: var(--space-3, 12px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-md, 8px);
    color: var(--foreground, #fff);
    font-size: var(--text-base, 16px);
    text-align: center;
    outline: none;
    transition: border-color var(--duration-fast, 100ms);
  }

  .PetSelect__name-input:focus {
    border-color: var(--interactive, #6366f1);
  }

  .PetSelect__name-input::placeholder {
    color: var(--muted-foreground, #888);
  }

  .PetSelect__name-actions {
    display: flex;
    gap: var(--space-3, 12px);
    width: 100%;
    max-width: 280px;
  }

  .PetSelect__btn {
    flex: 1;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border-radius: var(--radius-md, 8px);
    font-size: var(--text-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border, #333);
    transition:
      background var(--duration-fast, 100ms),
      transform var(--duration-fast, 100ms);
  }

  .PetSelect__btn--secondary {
    background: var(--muted, #2a2a3e);
    color: var(--foreground, #fff);
  }

  .PetSelect__btn--secondary:hover {
    background: var(--accent, #3a3a5e);
  }

  .PetSelect__btn--primary {
    background: var(--interactive, #6366f1);
    color: white;
    border-color: var(--interactive, #6366f1);
  }

  .PetSelect__btn--primary:hover:not(:disabled) {
    background: var(--interactive-hover, #4f46e5);
    transform: translateY(-1px);
  }

  .PetSelect__btn--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── 性别选择 ─────────────────────────────────── */

  .PetSelect__gender-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    width: 100%;
    max-width: 280px;
  }

  .PetSelect__gender-label {
    font-size: var(--text-sm, 14px);
    color: var(--muted-foreground, #888);
    flex-shrink: 0;
  }

  .PetSelect__gender-options {
    display: flex;
    gap: var(--space-2, 8px);
    flex: 1;
  }

  .PetSelect__gender-btn {
    flex: 1;
    padding: var(--space-1, 4px) var(--space-2, 8px);
    border-radius: var(--radius-sm, 4px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    color: var(--foreground, #fff);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    transition:
      background var(--duration-fast, 100ms),
      border-color var(--duration-fast, 100ms);
  }

  .PetSelect__gender-btn:hover {
    border-color: var(--interactive, #6366f1);
  }

  .PetSelect__gender-btn--active {
    background: rgba(99, 102, 241, 0.15);
    border-color: var(--interactive, #6366f1);
    color: var(--interactive, #6366f1);
    font-weight: 600;
  }

  /* ── 动画 ────────────────────────────────────── */

  @keyframes petsel-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes petsel-slide-up {
    from {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes petsel-hatch {
    0% {
      transform: scale(0.5) rotate(-10deg);
      opacity: 0;
    }
    50% {
      transform: scale(1.2) rotate(5deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
  }
</style>
