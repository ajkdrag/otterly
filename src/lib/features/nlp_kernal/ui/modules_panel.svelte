<script lang="ts">
  import { onMount } from "svelte";
  import {
    nlp_tracker,
    tracked_invoke,
  } from "../nlp_invocation_tracker.svelte";

  interface RustModule {
    name: string;
    status: "active" | "inactive";
    description: string;
  }

  interface PyCapabilities {
    tokenize: boolean;
    extract_keywords: boolean;
    jieba: boolean;
    sentiment: boolean;
    ner_rule: boolean;
    ner_ml: boolean;
    classifier: boolean;
  }

  let rust_modules = $state<RustModule[]>([
    {
      name: "nlp_kernal",
      status: "active",
      description: "NLP analysis engine (Rust)",
    },
    {
      name: "search",
      status: "active",
      description: "Full-text search (SQLite FTS)",
    },
    {
      name: "notes",
      status: "active",
      description: "Note CRUD & file management",
    },
    { name: "git", status: "active", description: "Git versioning & history" },
    { name: "watcher", status: "active", description: "Filesystem watcher" },
    {
      name: "vault",
      status: "active",
      description: "Vault registry & lifecycle",
    },
    { name: "settings", status: "active", description: "App & vault settings" },
    {
      name: "stats",
      status: "active",
      description: "Usage statistics & sessions",
    },
    {
      name: "points",
      status: "active",
      description: "Gamification points engine",
    },
  ]);

  let py_capabilities = $state<PyCapabilities | null>(null);
  let py_error = $state<string | null>(null);
  let py_loading = $state(false);

  async function load_py_capabilities() {
    py_loading = true;
    py_error = null;
    try {
      py_capabilities = await tracked_invoke<PyCapabilities>(
        "nlp_py_capabilities",
      );
    } catch (e) {
      py_error = String(e);
      py_capabilities = null;
    } finally {
      py_loading = false;
    }
  }

  onMount(() => {
    load_py_capabilities();
  });

  function capability_count(caps: PyCapabilities): {
    available: number;
    total: number;
  } {
    const entries = Object.values(caps);
    return {
      available: entries.filter(Boolean).length,
      total: entries.length,
    };
  }
</script>

<div class="ModulesPanel">
  <section class="ModulesPanel__section">
    <h3 class="ModulesPanel__section-title">🦀 Rust System Modules</h3>
    <div class="ModulesPanel__list">
      {#each rust_modules as mod (mod.name)}
        <div class="ModulesPanel__item">
          <div class="ModulesPanel__item-header">
            <span
              class="ModulesPanel__status-dot"
              class:ModulesPanel__status-dot--active={mod.status === "active"}
            ></span>
            <span class="ModulesPanel__item-name">{mod.name}</span>
          </div>
          <span class="ModulesPanel__item-desc">{mod.description}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="ModulesPanel__section">
    <h3 class="ModulesPanel__section-title">🐍 Python NLP Modules</h3>
    {#if py_loading}
      <div class="ModulesPanel__status-msg">Loading...</div>
    {:else if py_error}
      <div class="ModulesPanel__status-msg ModulesPanel__status-msg--error">
        {py_error}
      </div>
      <button
        type="button"
        class="ModulesPanel__retry"
        onclick={load_py_capabilities}
      >
        Retry
      </button>
    {:else if py_capabilities}
      {@const counts = capability_count(py_capabilities)}
      <div class="ModulesPanel__summary">
        <span class="ModulesPanel__summary-value"
          >{counts.available}/{counts.total}</span
        >
        <span class="ModulesPanel__summary-label">capabilities available</span>
      </div>
      <div class="ModulesPanel__list">
        {#each Object.entries(py_capabilities) as [name, available]}
          <div class="ModulesPanel__item">
            <div class="ModulesPanel__item-header">
              <span
                class="ModulesPanel__status-dot"
                class:ModulesPanel__status-dot--active={available}
                class:ModulesPanel__status-dot--missing={!available}
              ></span>
              <span class="ModulesPanel__item-name">{name}</span>
            </div>
            <span class="ModulesPanel__item-status">
              {available ? "✅ Available" : "⬚ Not installed"}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="ModulesPanel__status-msg">No data</div>
    {/if}
  </section>

  <section class="ModulesPanel__section">
    <h3 class="ModulesPanel__section-title">📡 NLP Invocations (Session)</h3>
    <div class="ModulesPanel__summary">
      <span class="ModulesPanel__summary-value"
        >{nlp_tracker.invoked_count}/{nlp_tracker.total_count}</span
      >
      <span class="ModulesPanel__summary-label"
        >commands called this session</span
      >
    </div>
    <div class="ModulesPanel__list">
      {#each nlp_tracker.entries as entry (entry.id)}
        <div class="ModulesPanel__item">
          <div class="ModulesPanel__item-header">
            <span
              class="ModulesPanel__status-dot"
              class:ModulesPanel__status-dot--active={entry.invoked}
              class:ModulesPanel__status-dot--missing={!entry.invoked}
            ></span>
            <span class="ModulesPanel__item-name">{entry.id}</span>
          </div>
          <div class="ModulesPanel__item-detail">
            <span class="ModulesPanel__item-desc">{entry.label}</span>
            {#if entry.invoked}
              <span class="ModulesPanel__item-badge">×{entry.count}</span>
            {:else}
              <span class="ModulesPanel__item-status">— not called</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="ModulesPanel__section">
    <h3 class="ModulesPanel__section-title">ℹ️ Runtime</h3>
    <div class="ModulesPanel__list">
      <div class="ModulesPanel__item">
        <span class="ModulesPanel__item-name">Backend</span>
        <span class="ModulesPanel__item-status">Tauri + Rust</span>
      </div>
      <div class="ModulesPanel__item">
        <span class="ModulesPanel__item-name">Python Bridge</span>
        <span class="ModulesPanel__item-status">PyO3 0.23</span>
      </div>
      <div class="ModulesPanel__item">
        <span class="ModulesPanel__item-name">NLP DB</span>
        <span class="ModulesPanel__item-status">nlp_db.db (SQLite WAL)</span>
      </div>
    </div>
  </section>
</div>

<style>
  .ModulesPanel {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-3);
    font-size: var(--text-sm);
    color: var(--foreground);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ModulesPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ModulesPanel__section-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin: 0;
  }

  .ModulesPanel__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ModulesPanel__item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--muted);
  }

  .ModulesPanel__item-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .ModulesPanel__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted-foreground);
    flex-shrink: 0;
  }

  .ModulesPanel__status-dot--active {
    background: #22c55e;
  }

  .ModulesPanel__status-dot--missing {
    background: var(--muted-foreground);
    opacity: 0.4;
  }

  .ModulesPanel__item-name {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-mono);
  }

  .ModulesPanel__item-desc {
    font-size: 10px;
    color: var(--muted-foreground);
    padding-inline-start: 16px;
  }

  .ModulesPanel__item-status {
    font-size: 10px;
    color: var(--muted-foreground);
    padding-inline-start: 16px;
  }

  .ModulesPanel__item-detail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline-start: 16px;
  }

  .ModulesPanel__item-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--interactive);
    background: color-mix(in srgb, var(--interactive) 15%, transparent);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .ModulesPanel__summary {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }

  .ModulesPanel__summary-value {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--interactive);
  }

  .ModulesPanel__summary-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .ModulesPanel__status-msg {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-2);
  }

  .ModulesPanel__status-msg--error {
    color: var(--destructive);
  }

  .ModulesPanel__retry {
    font-size: var(--text-xs);
    color: var(--interactive);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: none;
  }

  .ModulesPanel__retry:hover {
    background: var(--muted);
  }
</style>
