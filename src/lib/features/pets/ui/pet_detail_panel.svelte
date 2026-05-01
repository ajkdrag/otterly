<script lang="ts">
  import type { PetStore } from "$lib/features/pets/state/pet_store.svelte";
  import type { PetService } from "$lib/features/pets/services/pet_service";
  import { PERSONALITY_INFO } from "$lib/features/pets/types/pet_types";
  import type { PetPersonality } from "$lib/features/pets/types/pet_types";

  type Props = {
    pet_store: PetStore;
    pet_service: PetService;
  };

  let { pet_store, pet_service }: Props = $props();

  const open = $derived(pet_store.show_detail);
  const pet = $derived(pet_store.pet);

  function close() {
    pet_store.show_detail = false;
  }

  function handle_backdrop(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("PetDetail__backdrop")) {
      close();
    }
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function handle_feed(food_type: string) {
    await pet_service.feed(food_type);
  }

  async function handle_interact(type: string) {
    await pet_service.interact(type);
  }

  function bar_style(value: number, max: number = 100): string {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return `width: ${pct}%`;
  }

  function bar_color(value: number): string {
    if (value >= 60) return "var(--chart-2, #4ade80)";
    if (value >= 30) return "var(--chart-4, #facc15)";
    return "var(--destructive, #ef4444)";
  }
</script>

<svelte:window onkeydown={handle_keydown} />

{#if open && pet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="PetDetail__backdrop" onclick={handle_backdrop}>
    <div class="PetDetail__panel">
      <!-- 头部 -->
      <div class="PetDetail__header">
        <div class="PetDetail__title-row">
          <span class="PetDetail__species-emoji">{pet.species_emoji}</span>
          <span class="PetDetail__trait-emoji">{pet.trait_emoji}</span>
          <div class="PetDetail__title-text">
            <span class="PetDetail__name">
              {pet.species_name_cn} · 「{pet.name}」
            </span>
            <span class="PetDetail__subtitle">
              Lv.{pet.level} · {pet.stage_label} · {pet.variant === "base" ? "基础" : pet.variant}
            </span>
          </div>
        </div>
        <button type="button" class="PetDetail__close" onclick={close}>✕</button>
      </div>

      <!-- 经验条 -->
      <div class="PetDetail__exp-bar-wrap">
        <div class="PetDetail__exp-bar">
          <div
            class="PetDetail__exp-fill"
            style="width: {pet.level_progress}%"
          ></div>
        </div>
        <span class="PetDetail__exp-text">
          {pet.exp} / {pet.exp_to_next_level} ({pet.level_progress.toFixed(0)}%)
        </span>
      </div>

      <!-- 性别 + 心情 -->
      <div class="PetDetail__mood">
        <span class="PetDetail__gender-badge" title="{pet.gender_label}">
          {pet.gender_emoji}
        </span>
        <span class="PetDetail__mood-emoji">{pet.mood_emoji}</span>
        <span class="PetDetail__mood-label">
          {pet.gender_label} · {pet.mood === "happy" ? "开心" :
           pet.mood === "content" ? "满足" :
           pet.mood === "calm" ? "平静" :
           pet.mood === "bored" ? "无聊" :
           pet.mood === "sad" ? "难过" :
           pet.mood === "sleeping" ? "睡眠中" :
           pet.mood === "excited" ? "兴奋" :
           pet.mood === "celebrating" ? "庆祝中" : pet.mood}
        </span>
      </div>

      <!-- 属性条 -->
      <div class="PetDetail__stats">
        <div class="PetDetail__stat-row">
          <span class="PetDetail__stat-label">❤️ 快乐</span>
          <div class="PetDetail__stat-bar">
            <div
              class="PetDetail__stat-fill"
              style="{bar_style(pet.happiness)}; background: {bar_color(pet.happiness)}"
            ></div>
          </div>
          <span class="PetDetail__stat-value">{pet.happiness}</span>
        </div>
        <div class="PetDetail__stat-row">
          <span class="PetDetail__stat-label">⚡ 活力</span>
          <div class="PetDetail__stat-bar">
            <div
              class="PetDetail__stat-fill"
              style="{bar_style(pet.energy)}; background: {bar_color(pet.energy)}"
            ></div>
          </div>
          <span class="PetDetail__stat-value">{pet.energy}</span>
        </div>
        <div class="PetDetail__stat-row">
          <span class="PetDetail__stat-label">🍖 饱腹</span>
          <div class="PetDetail__stat-bar">
            <div
              class="PetDetail__stat-fill"
              style="{bar_style(pet.hunger)}; background: {bar_color(pet.hunger)}"
            ></div>
          </div>
          <span class="PetDetail__stat-value">{pet.hunger}</span>
        </div>
        <div class="PetDetail__stat-row">
          <span class="PetDetail__stat-label">💕 亲密</span>
          <div class="PetDetail__stat-bar">
            <div
              class="PetDetail__stat-fill"
              style="{bar_style(pet.bond_level, 1000)}; background: var(--chart-5, #a78bfa)"
            ></div>
          </div>
          <span class="PetDetail__stat-value">{pet.bond_level}</span>
        </div>
      </div>

      <!-- 性格 -->
      <div class="PetDetail__section">
        <span class="PetDetail__section-title">性格特征</span>
        <div class="PetDetail__personality-tags">
          {#each pet.personality as p}
            {@const info = PERSONALITY_INFO[p as PetPersonality]}
            {#if info}
              <span class="PetDetail__tag">
                {info.emoji} {info.label}
              </span>
            {/if}
          {/each}
        </div>
      </div>

      <!-- 互动按钮 -->
      <div class="PetDetail__section">
        <span class="PetDetail__section-title">互动</span>
        <div class="PetDetail__action-row">
          <button
            type="button"
            class="PetDetail__action-btn"
            onclick={() => handle_interact("pat")}
          >🤚 摸头</button>
          <button
            type="button"
            class="PetDetail__action-btn"
            onclick={() => handle_interact("play")}
          >🎮 玩耍</button>
          <button
            type="button"
            class="PetDetail__action-btn"
            onclick={() => handle_interact("talk")}
          >💬 对话</button>
        </div>
      </div>

      <!-- 背包/食物 -->
      {#if pet_store.inventory.length > 0}
        <div class="PetDetail__section">
          <span class="PetDetail__section-title">📦 背包</span>
          <div class="PetDetail__inventory">
            {#each pet_store.inventory as item}
              <button
                type="button"
                class="PetDetail__food-btn"
                onclick={() => handle_feed(item.item_type)}
                title="喂食 {item.item_name}"
              >
                <span>{item.item_emoji}</span>
                <span class="PetDetail__food-name">{item.item_name}</span>
                <span class="PetDetail__food-qty">×{item.quantity}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 八字命理 -->
      {#if pet.bazi}
        <div class="PetDetail__section">
          <span class="PetDetail__section-title">☯ 生辰八字 · 命理</span>
          <div class="PetDetail__bazi-card">
            <div class="PetDetail__bazi-pillars">
              <div class="PetDetail__bazi-pillar">
                <span class="PetDetail__bazi-pillar-label">年柱</span>
                <span class="PetDetail__bazi-pillar-value">{pet.bazi.year_pillar}</span>
              </div>
              <div class="PetDetail__bazi-pillar">
                <span class="PetDetail__bazi-pillar-label">月柱</span>
                <span class="PetDetail__bazi-pillar-value">{pet.bazi.month_pillar}</span>
              </div>
              <div class="PetDetail__bazi-pillar">
                <span class="PetDetail__bazi-pillar-label">日柱</span>
                <span class="PetDetail__bazi-pillar-value">{pet.bazi.day_pillar}</span>
              </div>
              <div class="PetDetail__bazi-pillar">
                <span class="PetDetail__bazi-pillar-label">时柱</span>
                <span class="PetDetail__bazi-pillar-value">{pet.bazi.hour_pillar}</span>
              </div>
            </div>
            <div class="PetDetail__bazi-info-row">
              <span class="PetDetail__tag">{pet.bazi.wu_xing_emoji} 五行·{pet.bazi.wu_xing}</span>
              <span class="PetDetail__tag">{pet.bazi.sheng_xiao_emoji} {pet.bazi.sheng_xiao}</span>
              <span class="PetDetail__tag">{pet.bazi.ba_gua_symbol} {pet.bazi.ba_gua}卦·{pet.bazi.ba_gua_nature}</span>
              <span class="PetDetail__tag">🕐 {pet.bazi.shi_chen}</span>
            </div>
            <div class="PetDetail__bazi-fortune">
              {pet.bazi.fortune_summary}
            </div>
          </div>
        </div>
      {/if}

      <!-- 信息 -->
      <div class="PetDetail__footer">
        <span class="PetDetail__footer-text">
          🎂 出生于 {new Date(pet.born_at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .PetDetail__backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pet-fade-in 200ms ease;
  }

  .PetDetail__panel {
    background: var(--card, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-lg, 12px);
    width: min(90vw, 360px);
    max-height: min(85vh, 600px);
    overflow-y: auto;
    padding: var(--space-5, 20px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
    animation: pet-slide-up 300ms ease;
  }

  /* ── 头部 ────────────────────────────────────── */

  .PetDetail__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .PetDetail__title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .PetDetail__species-emoji {
    font-size: 36px;
    line-height: 1;
  }

  .PetDetail__trait-emoji {
    font-size: 18px;
    line-height: 1;
  }

  .PetDetail__title-text {
    display: flex;
    flex-direction: column;
  }

  .PetDetail__name {
    font-size: var(--text-base, 16px);
    font-weight: 600;
    color: var(--foreground, #fff);
  }

  .PetDetail__subtitle {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
  }

  .PetDetail__close {
    background: none;
    border: none;
    color: var(--muted-foreground, #888);
    font-size: 18px;
    cursor: pointer;
    padding: var(--space-1, 4px);
    transition: color var(--duration-fast, 100ms);
  }

  .PetDetail__close:hover {
    color: var(--foreground, #fff);
  }

  /* ── 经验条 ──────────────────────────────────── */

  .PetDetail__exp-bar-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .PetDetail__exp-bar {
    height: 6px;
    background: var(--muted, #2a2a3e);
    border-radius: 3px;
    overflow: hidden;
  }

  .PetDetail__exp-fill {
    height: 100%;
    background: var(--interactive, #6366f1);
    border-radius: 3px;
    transition: width 300ms ease;
  }

  .PetDetail__exp-text {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
    text-align: right;
  }

  /* ── 心情 ────────────────────────────────────── */

  .PetDetail__mood {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .PetDetail__mood-emoji {
    font-size: 24px;
  }

  .PetDetail__mood-label {
    font-size: var(--text-sm, 14px);
    color: var(--foreground, #fff);
  }

  /* ── 属性条 ──────────────────────────────────── */

  .PetDetail__stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .PetDetail__stat-row {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .PetDetail__stat-label {
    font-size: var(--text-xs, 12px);
    width: 60px;
    flex-shrink: 0;
  }

  .PetDetail__stat-bar {
    flex: 1;
    height: 8px;
    background: var(--muted, #2a2a3e);
    border-radius: 4px;
    overflow: hidden;
  }

  .PetDetail__stat-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 300ms ease;
  }

  .PetDetail__stat-value {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
    width: 32px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── 通用 Section ────────────────────────────── */

  .PetDetail__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .PetDetail__section-title {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    color: var(--muted-foreground, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ── 性格标签 ────────────────────────────────── */

  .PetDetail__personality-tags {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
  }

  .PetDetail__tag {
    font-size: var(--text-xs, 12px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-sm, 4px);
    padding: 2px 8px;
    color: var(--foreground, #fff);
  }

  /* ── 互动按钮 ────────────────────────────────── */

  .PetDetail__action-row {
    display: flex;
    gap: var(--space-2, 8px);
  }

  .PetDetail__action-btn {
    flex: 1;
    padding: var(--space-2, 8px);
    border-radius: var(--radius-md, 8px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    color: var(--foreground, #fff);
    font-size: var(--text-sm, 14px);
    cursor: pointer;
    transition:
      background var(--duration-fast, 100ms),
      transform var(--duration-fast, 100ms);
  }

  .PetDetail__action-btn:hover {
    background: var(--accent, #3a3a5e);
    transform: translateY(-1px);
  }

  /* ── 背包 ────────────────────────────────────── */

  .PetDetail__inventory {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .PetDetail__food-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-sm, 4px);
    color: var(--foreground, #fff);
    font-size: var(--text-sm, 14px);
    cursor: pointer;
    transition: background var(--duration-fast, 100ms);
  }

  .PetDetail__food-btn:hover {
    background: var(--accent, #3a3a5e);
  }

  .PetDetail__food-name {
    flex: 1;
  }

  .PetDetail__food-qty {
    color: var(--muted-foreground, #888);
    font-size: var(--text-xs, 12px);
  }

  /* ── 性别标识 ─────────────────────────────────── */

  .PetDetail__gender-badge {
    font-size: 20px;
    line-height: 1;
  }

  /* ── 八字命理 ─────────────────────────────────── */

  .PetDetail__bazi-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    background: var(--muted, #2a2a3e);
    border: 1px solid var(--border, #333);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-3, 12px);
  }

  .PetDetail__bazi-pillars {
    display: flex;
    gap: var(--space-2, 8px);
    justify-content: center;
  }

  .PetDetail__bazi-pillar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 48px;
  }

  .PetDetail__bazi-pillar-label {
    font-size: 10px;
    color: var(--muted-foreground, #888);
  }

  .PetDetail__bazi-pillar-value {
    font-size: var(--text-base, 16px);
    font-weight: 700;
    color: var(--foreground, #fff);
    letter-spacing: 2px;
  }

  .PetDetail__bazi-info-row {
    display: flex;
    gap: var(--space-1, 4px);
    flex-wrap: wrap;
    justify-content: center;
  }

  .PetDetail__bazi-fortune {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
    line-height: 1.5;
    text-align: center;
    font-style: italic;
  }

  /* ── 页脚 ────────────────────────────────────── */

  .PetDetail__footer {
    border-top: 1px solid var(--border, #333);
    padding-top: var(--space-3, 12px);
  }

  .PetDetail__footer-text {
    font-size: var(--text-xs, 12px);
    color: var(--muted-foreground, #888);
  }

  /* ── 动画 ────────────────────────────────────── */

  @keyframes pet-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes pet-slide-up {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
