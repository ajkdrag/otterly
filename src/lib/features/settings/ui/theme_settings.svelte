<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Slider from "$lib/components/ui/slider/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Copy from "@lucide/svelte/icons/copy";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import SearchIcon from "@lucide/svelte/icons/search";
  import type { Theme } from "$lib/shared/types/theme";
  import { get_all_themes, BUILTIN_NORDIC_DARK } from "$lib/shared/types/theme";
  import {
    parse_hsl,
    format_hsl,
    SANS_FONT_OPTIONS,
    MONO_FONT_OPTIONS,
    COLOR_PRESETS,
  } from "$lib/shared/utils/theme_helpers";
  import {
    STYLE_DESCRIPTORS,
    STYLE_CATEGORY_LABELS,
    filter_descriptors,
    group_filtered,
    ordered_categories,
    type ThemeStyleDescriptor,
    type ThemeStyleCategory,
  } from "$lib/features/theme";

  type Props = {
    user_themes: Theme[];
    active_theme: Theme;
    on_switch: (theme_id: string) => void;
    on_create: (name: string, base: Theme) => void;
    on_duplicate: (theme_id: string) => void;
    on_rename: (id: string, name: string) => void;
    on_delete: (theme_id: string) => void;
    on_update: (theme: Theme) => void;
  };

  let {
    user_themes,
    active_theme,
    on_switch,
    on_create,
    on_duplicate,
    on_rename,
    on_delete,
    on_update,
  }: Props = $props();

  const all_themes = $derived(get_all_themes(user_themes));
  const locked = $derived(active_theme.is_builtin);
  const defaults = BUILTIN_NORDIC_DARK;

  let search_query = $state("");

  const filtered = $derived(
    filter_descriptors(STYLE_DESCRIPTORS, search_query),
  );
  const grouped = $derived(group_filtered(filtered));
  const visible_categories = $derived(ordered_categories(grouped));

  function update<K extends keyof Theme>(key: K, value: Theme[K]) {
    if (locked) return;
    on_update({ ...active_theme, [key]: value });
  }

  function update_select<K extends keyof Theme>(
    key: K,
    value: string | undefined,
  ) {
    if (value && !locked) {
      on_update({ ...active_theme, [key]: value });
    }
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.round(v)));
  }

  function reset_to_default<K extends keyof Theme>(key: K) {
    if (locked) return;
    on_update({ ...active_theme, [key]: defaults[key] });
  }

  function is_modified<K extends keyof Theme>(key: K): boolean {
    return active_theme[key] !== defaults[key];
  }

  let new_theme_name = $state("");
  let show_create = $state(false);

  function handle_create() {
    const name = new_theme_name.trim();
    if (!name) return;
    on_create(name, active_theme);
    new_theme_name = "";
    show_create = false;
  }

  function format_display_value(desc: ThemeStyleDescriptor): string {
    const val = active_theme[desc.theme_key];
    if (desc.format_value && typeof val === "number") {
      return desc.format_value(val);
    }
    if (typeof val === "number") {
      const formatted = Number.isInteger(val)
        ? String(val)
        : val.toFixed(desc.step && desc.step < 0.1 ? 2 : 2);
      return desc.unit ? `${formatted}${desc.unit}` : formatted;
    }
    if (desc.options) {
      const match = desc.options.find((o) => o.value === val);
      return match?.label ?? String(val ?? "");
    }
    return String(val ?? "");
  }
</script>

{#snippet color_field(desc: ThemeStyleDescriptor)}
  {@const current_value = active_theme[desc.theme_key] as string | null}
  {@const parsed = parse_hsl(current_value, active_theme.color_scheme)}
  <div class="ColorField">
    <div class="ColorField__header">
      <div class="ColorField__header-left">
        <span class="ColorField__label">{desc.label}</span>
        {#if current_value}
          <button
            type="button"
            class="ColorField__reset"
            aria-label={`Reset ${desc.label} to default`}
            onclick={() => update(desc.theme_key, null as never)}
            disabled={locked}
            title="Reset to default"
          >
            <RotateCcw />
          </button>
        {/if}
      </div>
      <div class="ColorField__header-right">
        <span class="ColorField__channel-label ColorField__channel-label--pad"
        ></span>
        <span class="ColorField__channel-label">H</span>
        <span class="ColorField__channel-label">S</span>
        <span class="ColorField__channel-label">L</span>
      </div>
    </div>
    <div class="ColorField__body">
      <div class="ColorField__swatches">
        {#each COLOR_PRESETS as preset (preset.value)}
          <button
            type="button"
            class="ColorField__swatch"
            class:ColorField__swatch--active={current_value === preset.value}
            style="background: {preset.value}"
            aria-label={`${desc.label}: ${preset.label}`}
            aria-pressed={current_value === preset.value}
            title={preset.label}
            onclick={() => update(desc.theme_key, preset.value as never)}
            disabled={locked}
          ></button>
        {/each}
      </div>
      <div class="ColorField__hsl">
        <span
          class="ColorField__preview"
          style="background: {current_value ?? 'var(--muted)'}"
        ></span>
        <Input
          type="number"
          aria-label={`${desc.label} hue`}
          value={parsed ? String(parsed.h) : ""}
          placeholder="—"
          min={0}
          max={360}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
            const h = clamp(Number(e.currentTarget.value) || 0, 0, 360);
            const base = parsed ?? { h: 0, s: 0, l: 50 };
            update(desc.theme_key, format_hsl({ ...base, h }) as never);
          }}
          class="ColorField__channel-input"
          disabled={locked}
        />
        <Input
          type="number"
          aria-label={`${desc.label} saturation`}
          value={parsed ? String(parsed.s) : ""}
          placeholder="—"
          min={0}
          max={100}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
            const s = clamp(Number(e.currentTarget.value) || 0, 0, 100);
            const base = parsed ?? { h: 0, s: 0, l: 50 };
            update(desc.theme_key, format_hsl({ ...base, s }) as never);
          }}
          class="ColorField__channel-input"
          disabled={locked}
        />
        <Input
          type="number"
          aria-label={`${desc.label} lightness`}
          value={parsed ? String(parsed.l) : ""}
          placeholder="—"
          min={0}
          max={100}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
            const l = clamp(Number(e.currentTarget.value) || 0, 0, 100);
            const base = parsed ?? { h: 0, s: 0, l: 50 };
            update(desc.theme_key, format_hsl({ ...base, l }) as never);
          }}
          class="ColorField__channel-input"
          disabled={locked}
        />
      </div>
    </div>
  </div>
{/snippet}

{#snippet slider_field(desc: ThemeStyleDescriptor)}
  {@const val = active_theme[desc.theme_key] as number}
  {@const modified = is_modified(desc.theme_key)}
  <div class="ThemeSettings__row--stacked">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="ThemeSettings__label">{desc.label}</span>
        {#if modified}
          <button
            type="button"
            class="ThemeSettings__inline-reset"
            aria-label={`Reset ${desc.label} to default`}
            onclick={() => reset_to_default(desc.theme_key)}
            disabled={locked}
            title="Reset to default"
          >
            <RotateCcw />
          </button>
        {/if}
      </div>
      <span class="ThemeSettings__badge">{format_display_value(desc)}</span>
    </div>
    <Slider.Root
      type="single"
      aria-label={desc.label}
      value={val}
      onValueChange={(v: number) => {
        const step = desc.step ?? 1;
        const rounded = Math.round(v / step) * step;
        update(desc.theme_key, rounded as never);
      }}
      min={desc.min ?? 0}
      max={desc.max ?? 100}
      step={desc.step ?? 1}
      class="w-full"
      disabled={locked}
    />
  </div>
{/snippet}

{#snippet select_field(desc: ThemeStyleDescriptor)}
  {@const val = active_theme[desc.theme_key] as string}
  {@const modified = is_modified(desc.theme_key)}
  <div class="ThemeSettings__row">
    <div class="flex items-center gap-2">
      <span class="ThemeSettings__label">{desc.label}</span>
      {#if modified}
        <button
          type="button"
          class="ThemeSettings__inline-reset"
          aria-label={`Reset ${desc.label} to default`}
          onclick={() => reset_to_default(desc.theme_key)}
          disabled={locked}
          title="Reset to default"
        >
          <RotateCcw />
        </button>
      {/if}
    </div>
    <Select.Root
      type="single"
      value={val}
      onValueChange={(v: string | undefined) =>
        update_select(desc.theme_key, v)}
      disabled={locked}
    >
      <Select.Trigger class="w-40" aria-label={desc.label}>
        <span data-slot="select-value">
          {desc.options?.find((o) => o.value === val)?.label ?? val}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each desc.options ?? [] as option (option.value)}
          <Select.Item value={option.value}>{option.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
{/snippet}

{#snippet font_select_field(desc: ThemeStyleDescriptor)}
  {@const val = active_theme[desc.theme_key] as string}
  {@const is_mono = desc.id === "font_family_mono"}
  {@const options = is_mono ? MONO_FONT_OPTIONS : SANS_FONT_OPTIONS}
  <div class="ThemeSettings__row">
    <span class="ThemeSettings__label">{desc.label}</span>
    <Select.Root
      type="single"
      value={val}
      onValueChange={(v: string | undefined) =>
        update_select(desc.theme_key, v)}
      disabled={locked}
    >
      <Select.Trigger class="w-44" aria-label={desc.label}>
        <span data-slot="select-value">{val}</span>
      </Select.Trigger>
      <Select.Content>
        {#each options as opt (opt.value)}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
{/snippet}

{#snippet render_descriptor(desc: ThemeStyleDescriptor)}
  {#if desc.control === "color"}
    {@render color_field(desc)}
  {:else if desc.control === "slider"}
    {#if desc.id === "accent_hue"}
      {@const accent_preview_style = `background: oklch(0.55 ${active_theme.accent_chroma} ${active_theme.accent_hue})`}
      <div class="ThemeSettings__row--stacked">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="ThemeSettings__label">{desc.label}</span>
            <span class="ThemeSettings__color-dot" style={accent_preview_style}
            ></span>
          </div>
          <span class="ThemeSettings__badge"
            >{active_theme.accent_hue}{desc.unit}</span
          >
        </div>
        <Slider.Root
          type="single"
          aria-label={desc.label}
          value={active_theme.accent_hue}
          onValueChange={(v: number) => update("accent_hue", Math.round(v))}
          min={0}
          max={360}
          step={1}
          class="w-full"
          disabled={locked}
        />
      </div>
    {:else}
      {@render slider_field(desc)}
    {/if}
  {:else if desc.control === "select"}
    {@render select_field(desc)}
  {:else if desc.control === "font_select"}
    {@render font_select_field(desc)}
  {/if}
{/snippet}

<div class="ThemeSettings">
  <!-- ─── Profile Bar ─── -->
  <div class="ThemeSettings__profile-bar">
    <Select.Root
      type="single"
      value={active_theme.id}
      onValueChange={(v: string | undefined) => {
        if (v) on_switch(v);
      }}
    >
      <Select.Trigger
        class="ThemeSettings__theme-select"
        aria-label="Active theme"
      >
        <span data-slot="select-value">{active_theme.name}</span>
      </Select.Trigger>
      <Select.Content>
        {#each all_themes as theme (theme.id)}
          <Select.Item value={theme.id}>{theme.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <div class="ThemeSettings__profile-actions">
      <Button
        variant="ghost"
        size="icon"
        onclick={() => on_duplicate(active_theme.id)}
        aria-label="Duplicate theme"
      >
        <Copy />
      </Button>
      {#if !locked}
        <Button
          variant="ghost"
          size="icon"
          onclick={() => on_delete(active_theme.id)}
          aria-label="Delete theme"
        >
          <Trash2 />
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        onclick={() => {
          show_create = !show_create;
        }}
        aria-label="New theme"
      >
        <Plus />
      </Button>
    </div>
  </div>

  {#if show_create}
    <div class="ThemeSettings__create-row">
      <Input
        type="text"
        bind:value={new_theme_name}
        aria-label="New theme name"
        placeholder="Theme name..."
        class="flex-1"
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") handle_create();
        }}
      />
      <Button
        size="sm"
        onclick={handle_create}
        disabled={!new_theme_name.trim()}
      >
        Create
      </Button>
    </div>
  {/if}

  {#if !locked}
    <div class="ThemeSettings__row" style="margin-bottom: var(--space-2)">
      <span class="ThemeSettings__label">Name</span>
      <Input
        type="text"
        value={active_theme.name}
        aria-label="Theme name"
        onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
          on_rename(active_theme.id, e.currentTarget.value);
        }}
        class="w-48"
      />
    </div>
  {/if}

  {#if locked}
    <p class="ThemeSettings__hint">Duplicate this theme to customize it.</p>
  {/if}

  <!-- ─── Search ─── -->
  <div class="ThemeSettings__search-wrapper">
    <SearchIcon class="ThemeSettings__search-icon" />
    <Input
      type="text"
      aria-label="Filter theme settings"
      placeholder="Filter style settings..."
      value={search_query}
      oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
        search_query = e.currentTarget.value;
      }}
      class="ThemeSettings__search"
    />
  </div>

  <!-- ─── Descriptor-driven sections ─── -->
  {#each visible_categories as cat (cat)}
    <div class="ThemeSettings__section-header">
      {STYLE_CATEGORY_LABELS[cat]}
    </div>
    <div class="ThemeSettings__section-content">
      {#each grouped.get(cat) ?? [] as desc (desc.id)}
        {@render render_descriptor(desc)}
      {/each}
    </div>
  {/each}

  {#if filtered.length === 0}
    <div class="ThemeSettings__empty">
      No style settings matching "{search_query}"
    </div>
  {/if}
</div>

<style>
  .ThemeSettings {
    display: flex;
    flex-direction: column;
  }

  .ThemeSettings__profile-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  :global(.ThemeSettings__theme-select) {
    min-width: 0;
    flex: 1;
  }

  .ThemeSettings__profile-actions {
    display: flex;
    gap: var(--space-1);
  }

  .ThemeSettings__create-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }

  .ThemeSettings__search-wrapper {
    position: relative;
    margin-bottom: var(--space-4);
    margin-top: var(--space-2);
  }

  :global(.ThemeSettings__search-icon) {
    position: absolute;
    left: var(--space-2-5);
    top: 50%;
    transform: translateY(-50%);
    width: var(--size-icon-sm) !important;
    height: var(--size-icon-sm) !important;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  :global(.ThemeSettings__search) {
    width: 100%;
    padding-left: var(--space-8) !important;
  }

  .ThemeSettings__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
    margin-top: var(--space-6);
    margin-bottom: var(--space-4);
  }

  .ThemeSettings__section-header:first-of-type {
    margin-top: var(--space-4);
  }

  .ThemeSettings__section-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .ThemeSettings__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .ThemeSettings__row--stacked {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ThemeSettings__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    line-height: 1.4;
  }

  .ThemeSettings__badge {
    font-size: var(--text-xs);
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--muted-foreground);
    background-color: var(--muted);
    padding: var(--space-0-5) var(--space-2);
    border-radius: var(--radius-sm);
  }

  .ThemeSettings__color-dot {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ThemeSettings__hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-2) var(--space-3);
    background: var(--muted);
    border-inline-start: 2px solid var(--primary);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
  }

  .ThemeSettings__inline-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    opacity: 0.5;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default),
      opacity var(--duration-fast) var(--ease-default);
  }

  .ThemeSettings__inline-reset:hover:not(:disabled) {
    opacity: 1;
    color: var(--interactive);
  }

  :global(.ThemeSettings__inline-reset svg) {
    width: 11px;
    height: 11px;
  }

  .ThemeSettings__empty {
    text-align: center;
    padding: var(--space-8) var(--space-4);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  /* ─── Color Field ─── */

  .ColorField {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .ColorField__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .ColorField__header-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .ColorField__header-right {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    flex-shrink: 0;
  }

  .ColorField__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .ColorField__reset {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    opacity: 0.5;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default),
      opacity var(--duration-fast) var(--ease-default);
  }

  .ColorField__reset:hover:not(:disabled) {
    opacity: 1;
    color: var(--interactive);
  }

  :global(.ColorField__reset svg) {
    width: 11px;
    height: 11px;
  }

  .ColorField__body {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .ColorField__swatches {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
    align-content: flex-start;
  }

  .ColorField__swatch {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default),
      opacity var(--duration-fast) var(--ease-default);
    flex-shrink: 0;
  }

  .ColorField__swatch:hover:not(:disabled) {
    border-color: var(--muted-foreground);
  }

  .ColorField__swatch--active {
    border-color: var(--interactive);
    box-shadow: 0 0 0 1px var(--interactive);
  }

  .ColorField__swatch:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .ColorField__hsl {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    flex-shrink: 0;
  }

  .ColorField__preview {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    border: 2px solid var(--border);
    flex-shrink: 0;
  }

  .ColorField__channel-label {
    font-size: 9px;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    line-height: 1;
    width: 2.75rem;
    text-align: center;
  }

  .ColorField__channel-label--pad {
    width: 20px;
  }

  :global(.ColorField__channel-input) {
    width: 2.75rem !important;
    height: 28px !important;
    font-size: var(--text-xs) !important;
    font-family: var(--font-mono, ui-monospace, monospace) !important;
    text-align: center !important;
    padding: 0 var(--space-1) !important;
  }

  :global(.ColorField__channel-input::-webkit-inner-spin-button),
  :global(.ColorField__channel-input::-webkit-outer-spin-button) {
    -webkit-appearance: none;
    margin: 0;
  }
  .ThemeSettings__inline-reset:focus-visible,
  .ColorField__reset:focus-visible,
  .ColorField__swatch:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .ThemeSettings__row,
    .ColorField__body {
      flex-wrap: wrap;
    }
  }
</style>
