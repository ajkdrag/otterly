<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  interface SessionStats {
    session_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    folders_count: number;
    files_count: number;
    files_opened: number;
    files_read_complete: number;
  }

  interface VaultOverview {
    total_sessions: number;
    total_files_opened: number;
    total_files_read: number;
    total_folders: number;
    total_files: number;
  }

  interface StatsHistory {
    sessions: SessionStats[];
    overview: VaultOverview;
  }

  const { stores } = use_app_context();

  let stats = $state<StatsHistory | null>(null);
  let loading = $state(false);
  let error_msg = $state<string | null>(null);

  async function load_stats() {
    const vault = stores.vault.vault;
    if (!vault) return;
    loading = true;
    error_msg = null;
    try {
      stats = await invoke("stats_get_history", {
        args: { vault_id: vault.id, limit: 30 },
      });
    } catch (e) {
      error_msg = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (stores.vault.vault) {
      load_stats();
    }
  });

  function format_date(iso: string): string {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return iso.slice(5, 10);
    }
  }

  function format_duration(seconds: number | null): string {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  const CHART_W = 320;
  const CHART_H = 140;
  const PAD = { top: 10, right: 10, bottom: 25, left: 35 };

  function make_line_path(
    data: number[],
    w: number,
    h: number,
  ): string {
    if (data.length === 0) return "";
    const max_val = Math.max(...data, 1);
    const iw = w - PAD.left - PAD.right;
    const ih = h - PAD.top - PAD.bottom;
    const step = data.length > 1 ? iw / (data.length - 1) : 0;
    return data
      .map((v, i) => {
        const x = PAD.left + i * step;
        const y = PAD.top + ih - (v / max_val) * ih;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function make_bar_rects(
    data: number[],
    w: number,
    h: number,
  ): { x: number; y: number; width: number; height: number; value: number }[] {
    if (data.length === 0) return [];
    const max_val = Math.max(...data, 1);
    const iw = w - PAD.left - PAD.right;
    const ih = h - PAD.top - PAD.bottom;
    const bar_w = Math.max(4, iw / data.length - 2);
    const gap = (iw - bar_w * data.length) / (data.length + 1);
    return data.map((v, i) => {
      const bh = (v / max_val) * ih;
      return {
        x: PAD.left + gap + i * (bar_w + gap),
        y: PAD.top + ih - bh,
        width: bar_w,
        height: bh,
        value: v,
      };
    });
  }

  function y_axis_ticks(data: number[], h: number): { y: number; label: string }[] {
    const max_val = Math.max(...data, 1);
    const ih = h - PAD.top - PAD.bottom;
    const ticks = [0, Math.round(max_val / 2), max_val];
    return ticks.map((v) => ({
      y: PAD.top + ih - (v / max_val) * ih,
      label: String(v),
    }));
  }
</script>

<div class="StatsDash">
  {#if loading}
    <div class="StatsDash__status">Loading statistics...</div>
  {:else if error_msg}
    <div class="StatsDash__status StatsDash__status--error">{error_msg}</div>
  {:else if !stats}
    <div class="StatsDash__status">Open a vault to see statistics</div>
  {:else}
    <div class="StatsDash__content">
      <h2 class="StatsDash__title">📊 Usage Statistics</h2>

      <section class="StatsDash__section">
        <h3 class="StatsDash__section-title">Overview</h3>
        <div class="StatsDash__overview-grid">
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_sessions}</span>
            <span class="StatsDash__card-label">Sessions</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_files_opened}</span>
            <span class="StatsDash__card-label">Files Opened</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_files_read}</span>
            <span class="StatsDash__card-label">Files Read</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_folders}</span>
            <span class="StatsDash__card-label">Folders</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_files}</span>
            <span class="StatsDash__card-label">Total Files</span>
          </div>
        </div>
      </section>

      {#if stats.sessions.length > 1}
        {@const reversed = [...stats.sessions].reverse()}
        {@const opened_data = reversed.map((s) => s.files_opened)}
        {@const read_data = reversed.map((s) => s.files_read_complete)}
        {@const labels = reversed.map((s) => format_date(s.started_at))}

        <section class="StatsDash__section">
          <h3 class="StatsDash__section-title">📈 Files Opened (Line Chart)</h3>
          <svg viewBox="0 0 {CHART_W} {CHART_H}" class="StatsDash__chart">
            {#each y_axis_ticks(opened_data, CHART_H) as tick}
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={CHART_W - PAD.right}
                y2={tick.y}
                class="StatsDash__grid-line"
              />
              <text x={PAD.left - 4} y={tick.y + 3} class="StatsDash__axis-label" text-anchor="end">
                {tick.label}
              </text>
            {/each}
            <path d={make_line_path(opened_data, CHART_W, CHART_H)} class="StatsDash__line StatsDash__line--primary" />
            <path d={make_line_path(read_data, CHART_W, CHART_H)} class="StatsDash__line StatsDash__line--secondary" />
            {#each labels as label, i}
              {#if i % Math.max(1, Math.floor(labels.length / 6)) === 0}
                {@const x = PAD.left + (i / Math.max(1, labels.length - 1)) * (CHART_W - PAD.left - PAD.right)}
                <text x={x} y={CHART_H - 4} class="StatsDash__axis-label" text-anchor="middle">{label}</text>
              {/if}
            {/each}
            <text x={CHART_W - 8} y={16} class="StatsDash__legend" text-anchor="end">
              <tspan fill="var(--interactive)">● Opened</tspan>
              <tspan dx="8" fill="var(--accent-foreground)">● Read</tspan>
            </text>
          </svg>
        </section>

        <section class="StatsDash__section">
          <h3 class="StatsDash__section-title">📊 Files Opened per Session (Bar Chart)</h3>
          <svg viewBox="0 0 {CHART_W} {CHART_H}" class="StatsDash__chart">
            {#each y_axis_ticks(opened_data, CHART_H) as tick}
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={CHART_W - PAD.right}
                y2={tick.y}
                class="StatsDash__grid-line"
              />
              <text x={PAD.left - 4} y={tick.y + 3} class="StatsDash__axis-label" text-anchor="end">
                {tick.label}
              </text>
            {/each}
            {#each make_bar_rects(opened_data, CHART_W, CHART_H) as bar, i}
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                class="StatsDash__bar"
                rx="2"
              />
            {/each}
            {#each labels as label, i}
              {#if i % Math.max(1, Math.floor(labels.length / 6)) === 0}
                {@const x = PAD.left + (i / Math.max(1, labels.length - 1)) * (CHART_W - PAD.left - PAD.right)}
                <text x={x} y={CHART_H - 4} class="StatsDash__axis-label" text-anchor="middle">{label}</text>
              {/if}
            {/each}
          </svg>
        </section>
      {/if}

      {#if stats.sessions.length > 0}
        <section class="StatsDash__section">
          <h3 class="StatsDash__section-title">📋 Recent Sessions</h3>
          <div class="StatsDash__table-wrap">
            <table class="StatsDash__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Opened</th>
                  <th>Read</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {#each stats.sessions.slice(0, 10) as session}
                  <tr>
                    <td>{format_date(session.started_at)}</td>
                    <td>{format_duration(session.duration_seconds)}</td>
                    <td>{session.files_opened}</td>
                    <td>{session.files_read_complete}</td>
                    <td>{session.files_count}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .StatsDash {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4) var(--space-6);
    color: var(--foreground);
    max-width: 640px;
    margin: 0 auto;
  }

  .StatsDash__status {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--muted-foreground);
  }

  .StatsDash__status--error {
    color: var(--destructive);
  }

  .StatsDash__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .StatsDash__title {
    font-size: var(--text-xl);
    font-weight: 700;
    margin: 0;
  }

  .StatsDash__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .StatsDash__section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--muted-foreground);
    margin: 0;
  }

  .StatsDash__overview-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-2);
  }

  .StatsDash__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-3);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .StatsDash__card-value {
    font-size: var(--text-lg);
    font-weight: 700;
  }

  .StatsDash__card-label {
    font-size: 10px;
    color: var(--muted-foreground);
    text-transform: uppercase;
  }

  .StatsDash__chart {
    width: 100%;
    height: auto;
    background: var(--muted);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }

  .StatsDash__grid-line {
    stroke: var(--border);
    stroke-width: 0.5;
    stroke-dasharray: 2 2;
  }

  .StatsDash__axis-label {
    font-size: 8px;
    fill: var(--muted-foreground);
  }

  .StatsDash__legend {
    font-size: 8px;
  }

  .StatsDash__line {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .StatsDash__line--primary {
    stroke: var(--interactive);
  }

  .StatsDash__line--secondary {
    stroke: var(--accent-foreground);
    stroke-dasharray: 4 2;
    opacity: 0.7;
  }

  .StatsDash__bar {
    fill: var(--interactive);
    opacity: 0.8;
  }

  .StatsDash__table-wrap {
    overflow-x: auto;
  }

  .StatsDash__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .StatsDash__table th {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    color: var(--muted-foreground);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
  }

  .StatsDash__table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
  }

  .StatsDash__table tr:hover td {
    background: var(--muted);
  }
</style>
