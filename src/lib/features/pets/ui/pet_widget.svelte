<script lang="ts">
  import type { PetStore } from "$lib/features/pets/state/pet_store.svelte";
  import type { PetService } from "$lib/features/pets/services/pet_service";
  import { INTERACTIONS } from "$lib/features/pets/types/pet_types";

  type Props = {
    pet_store: PetStore;
    pet_service: PetService;
  };

  let { pet_store, pet_service }: Props = $props();

  let is_bouncing = $state(false);
  let show_bubble = $state(false);
  let bubble_text = $state("");
  let show_actions = $state(false);

  const has_pet = $derived(pet_store.has_pet);
  const show_widget = $derived(pet_store.show_widget);
  const position = $derived(pet_store.widget_position);
  const opacity = $derived(pet_store.widget_opacity);
  const species_emoji = $derived(pet_store.species_emoji);
  const mood_emoji = $derived(pet_store.mood_emoji);
  const pet_name = $derived(pet_store.pet_name);
  const level = $derived(pet_store.level);
  const last_message = $derived(pet_store.last_message);

  // 当有新消息时显示气泡
  $effect(() => {
    if (last_message) {
      show_message_bubble(last_message);
      // 3秒后清除
      const timer = setTimeout(() => {
        pet_store.clear_message();
        show_bubble = false;
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  function show_message_bubble(text: string) {
    bubble_text = text;
    show_bubble = true;
    trigger_bounce();
  }

  function trigger_bounce() {
    is_bouncing = true;
    setTimeout(() => (is_bouncing = false), 600);
  }

  function handle_click() {
    if (!has_pet) {
      pet_store.open_selection();
      return;
    }
    pet_store.toggle_detail();
    trigger_bounce();
  }

  function handle_double_click() {
    if (!has_pet) return;
    void pet_service.interact("play");
  }

  function toggle_actions() {
    show_actions = !show_actions;
  }

  async function handle_interact(type: string) {
    show_actions = false;
    await pet_service.interact(type);
  }
</script>

{#if show_widget}
  <div
    class="PetWidget"
    class:PetWidget--left={position === "bottom-left"}
    class:PetWidget--right={position === "bottom-right"}
    style="opacity: {opacity}"
  >
    <!-- 消息气泡 -->
    {#if show_bubble}
      <div class="PetWidget__bubble" class:PetWidget__bubble--visible={show_bubble}>
        <span class="PetWidget__bubble-text">{bubble_text}</span>
      </div>
    {/if}

    <!-- 互动菜单 -->
    {#if show_actions && has_pet}
      <div class="PetWidget__actions">
        {#each INTERACTIONS as action}
          <button
            type="button"
            class="PetWidget__action-btn"
            title={action.name}
            onclick={() => handle_interact(action.type)}
          >
            <span>{action.emoji}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- 宠物主体 -->
    <button
      type="button"
      class="PetWidget__pet"
      class:PetWidget__pet--bouncing={is_bouncing}
      onclick={handle_click}
      ondblclick={handle_double_click}
      oncontextmenu={(e) => { e.preventDefault(); toggle_actions(); }}
      title={has_pet ? `${pet_name} Lv.${level} ${mood_emoji}` : "选择你的学习伙伴"}
    >
      <span class="PetWidget__emoji">{species_emoji}</span>
      {#if has_pet}
        <span class="PetWidget__mood">{mood_emoji}</span>
        <span class="PetWidget__level">Lv.{level}</span>
      {/if}
    </button>
  </div>
{/if}

<style>
  .PetWidget {
    position: fixed;
    bottom: calc(var(--size-touch-lg, 40px) + var(--space-3, 12px));
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1, 4px);
    pointer-events: auto;
    transition: opacity var(--duration-normal, 200ms) var(--ease-default, ease);
  }

  .PetWidget--left {
    left: var(--space-4, 16px);
  }

  .PetWidget--right {
    right: var(--space-4, 16px);
  }

  /* ── 消息气泡 ───────────────────────────────────── */

  .PetWidget__bubble {
    position: absolute;
    bottom: 100%;
    margin-bottom: var(--space-2, 8px);
    background: var(--popover, #1a1a2e);
    color: var(--popover-foreground, #e0e0e0);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    font-size: var(--text-xs, 12px);
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity var(--duration-normal, 200ms) var(--ease-default, ease),
      transform var(--duration-normal, 200ms) var(--ease-default, ease);
    pointer-events: none;
  }

  .PetWidget__bubble--visible {
    opacity: 1;
    transform: translateY(0);
  }

  .PetWidget__bubble::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--border, #333);
  }

  /* ── 互动菜单 ───────────────────────────────────── */

  .PetWidget__actions {
    display: flex;
    gap: var(--space-1, 4px);
    margin-bottom: var(--space-1, 4px);
    animation: pet-fade-in 200ms ease forwards;
  }

  .PetWidget__action-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full, 50%);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition:
      background var(--duration-fast, 100ms) var(--ease-default, ease),
      transform var(--duration-fast, 100ms) var(--ease-default, ease);
  }

  .PetWidget__action-btn:hover {
    background: var(--accent, #3a3a5e);
    transform: scale(1.1);
  }

  /* ── 宠物主体 ───────────────────────────────────── */

  .PetWidget__pet {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: var(--radius-full, 50%);
    background: var(--muted, #2a2a3e);
    border: 2px solid var(--border, #333);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      transform var(--duration-fast, 100ms) var(--ease-default, ease),
      box-shadow var(--duration-fast, 100ms) var(--ease-default, ease);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    animation: pet-idle 3s ease-in-out infinite;
  }

  .PetWidget__pet:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .PetWidget__pet--bouncing {
    animation: pet-bounce 600ms ease;
  }

  .PetWidget__emoji {
    font-size: 32px;
    line-height: 1;
  }

  .PetWidget__mood {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 14px;
    line-height: 1;
  }

  .PetWidget__level {
    position: absolute;
    bottom: -2px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    font-weight: 700;
    color: var(--muted-foreground, #888);
    background: var(--background, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-sm, 4px);
    padding: 0 3px;
    line-height: 1.4;
  }

  /* ── 动画 ───────────────────────────────────────── */

  @keyframes pet-idle {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }

  @keyframes pet-bounce {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.2) translateY(-8px);
    }
    50% {
      transform: scale(0.95) translateY(0);
    }
    70% {
      transform: scale(1.05) translateY(-3px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes pet-fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
