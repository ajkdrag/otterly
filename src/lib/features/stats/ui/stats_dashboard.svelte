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

  interface KeywordEntry {
    word: string;
    count: number;
  }

  interface NlpAggregateStats {
    total_files_analyzed: number;
    total_word_count: number;
    total_char_count: number;
    total_unique_keywords: number;
    avg_vocabulary_richness: number;
    top_global_keywords: KeywordEntry[];
  }

  interface VaultScanResult {
    folder_count: number;
    file_count: number;
    total_size_bytes: number;
    md_count: number;
    code_count: number;
    txt_count: number;
    other_count: number;
  }

  const { stores } = use_app_context();

  let stats = $state<StatsHistory | null>(null);
  let nlp_stats = $state<NlpAggregateStats | null>(null);
  let vault_scan = $state<VaultScanResult | null>(null);
  let loading = $state(false);
  let error_msg = $state<string | null>(null);
  let last_updated = $state<string | null>(null);

  const session_id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session_start_time = Date.now();
  let session_started = false;
  let current_files_opened = $state(0);
  let current_files_set = new Set<string>();

  async function start_session_if_needed(vault_id: string, scan: VaultScanResult) {
    if (session_started) return;
    session_started = true;
    try {
      await invoke("stats_start_session", {
        args: {
          vault_id,
          session_id,
          folders_count: scan.folder_count,
          files_count: scan.file_count,
        },
      });
    } catch {
      // session tracking is best-effort
    }
  }

  async function load_stats() {
    const vault = stores.vault.vault;
    if (!vault) return;
    loading = true;
    error_msg = null;
    try {
      const scan_result = await invoke<VaultScanResult>("stats_scan_vault", {
        args: { vault_id: vault.id },
      });
      vault_scan = scan_result;

      await start_session_if_needed(vault.id, scan_result);

      const [stats_result, nlp_result] = await Promise.all([
        invoke<StatsHistory>("stats_get_history", {
          args: { vault_id: vault.id, limit: 30 },
        }),
        invoke<NlpAggregateStats>("nlp_get_aggregate_stats", {
          args: { vault_id: vault.id },
        }),
      ]);
      stats = stats_result;
      nlp_stats = nlp_result;
      last_updated = new Date().toLocaleString();
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

  $effect(() => {
    const tab = stores.tab.active_tab;
    const vault = stores.vault.vault;
    if (tab && vault && session_started) {
      const path = tab.note_path;
      if (!current_files_set.has(path)) {
        current_files_set.add(path);
        current_files_opened = current_files_set.size;
      }
      invoke("stats_file_opened", {
        args: { vault_id: vault.id, session_id, file_path: path },
      }).catch(() => {});
    }
  });

  function current_session_duration(): string {
    const secs = Math.floor((Date.now() - session_start_time) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m`;
  }

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

  function format_size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  const pie_data = $derived.by(() => {
    if (!vault_scan) return [];
    return [
      { label: "Markdown", count: vault_scan.md_count, color: "var(--interactive)" },
      { label: "Code", count: vault_scan.code_count, color: "#22c55e" },
      { label: "Text", count: vault_scan.txt_count, color: "#f59e0b" },
      { label: "Other", count: vault_scan.other_count, color: "var(--muted-foreground)" },
    ].filter(d => d.count > 0);
  });
  const pie_total = $derived(pie_data.reduce((s, d) => s + d.count, 0));

  function pie_slice_path(i: number, cx: number, cy: number, r: number): string {
    const start_angle = pie_data.slice(0, i).reduce((s, d) => s + (d.count / pie_total) * 360, 0);
    const sweep = (pie_data[i]!.count / pie_total) * 360;
    if (sweep >= 359.9) return "";
    const start_rad = ((start_angle - 90) * Math.PI) / 180;
    const end_rad = ((start_angle + sweep - 90) * Math.PI) / 180;
    const large = sweep > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(start_rad);
    const y1 = cy + r * Math.sin(start_rad);
    const x2 = cx + r * Math.cos(end_rad);
    const y2 = cy + r * Math.sin(end_rad);
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
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
      <div class="StatsDash__header">
        <h2 class="StatsDash__title">📊 Usage Statistics</h2>
        <div class="StatsDash__header-actions">
          <button class="StatsDash__refresh-btn" onclick={load_stats} disabled={loading}>
            {loading ? "⏳" : "🔄"} Refresh
          </button>
          {#if last_updated}
            <span class="StatsDash__updated-at">Last updated: {last_updated}</span>
          {/if}
        </div>
      </div>

      {#if vault_scan}
        <section class="StatsDash__section">
          <h3 class="StatsDash__section-title">📁 Vault Contents</h3>
          <div class="StatsDash__overview-grid">
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{vault_scan.folder_count}</span>
              <span class="StatsDash__card-label">Folders</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{vault_scan.file_count}</span>
              <span class="StatsDash__card-label">Files</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{format_size(vault_scan.total_size_bytes)}</span>
              <span class="StatsDash__card-label">Total Size</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{vault_scan.md_count}</span>
              <span class="StatsDash__card-label">Markdown</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{vault_scan.code_count}</span>
              <span class="StatsDash__card-label">Code</span>
            </div>
          </div>
          {#if pie_data.length > 0}
            <div class="StatsDash__pie-section">
              <svg viewBox="0 0 100 100" class="StatsDash__pie">
                {#each pie_data as slice, i}
                  {#if (slice.count / pie_total) * 360 >= 359.9}
                    <circle cx={50} cy={50} r={40} fill={slice.color} />
                  {:else}
                    <path d={pie_slice_path(i, 50, 50, 40)} fill={slice.color} />
                  {/if}
                {/each}
              </svg>
              <div class="StatsDash__pie-legend">
                {#each pie_data as slice}
                  <div class="StatsDash__pie-legend-item">
                    <span class="StatsDash__pie-dot" style="background:{slice.color}"></span>
                    <span>{slice.label}</span>
                    <span class="StatsDash__metric-value">{slice.count}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <section class="StatsDash__section">
        <h3 class="StatsDash__section-title">⚡ Current Session</h3>
        <div class="StatsDash__overview-grid">
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{current_session_duration()}</span>
            <span class="StatsDash__card-label">Duration</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{current_files_opened}</span>
            <span class="StatsDash__card-label">Files Opened</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{vault_scan?.folder_count ?? 0}</span>
            <span class="StatsDash__card-label">Folders</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{vault_scan?.file_count ?? 0}</span>
            <span class="StatsDash__card-label">Files</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{vault_scan ? format_size(vault_scan.total_size_bytes) : "-"}</span>
            <span class="StatsDash__card-label">Vault Size</span>
          </div>
        </div>
      </section>

      <section class="StatsDash__section">
        <h3 class="StatsDash__section-title">📊 All Sessions (Cumulative)</h3>
        <div class="StatsDash__overview-grid">
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_sessions}</span>
            <span class="StatsDash__card-label">Total Sessions</span>
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
            <span class="StatsDash__card-label">Max Folders</span>
          </div>
          <div class="StatsDash__card">
            <span class="StatsDash__card-value">{stats.overview.total_files}</span>
            <span class="StatsDash__card-label">Max Files</span>
          </div>
        </div>
      </section>

      {#if nlp_stats && nlp_stats.total_files_analyzed > 0}
        <section class="StatsDash__section">
          <h3 class="StatsDash__section-title">🧠 NLP Knowledge Base</h3>
          <div class="StatsDash__overview-grid">
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{nlp_stats.total_files_analyzed}</span>
              <span class="StatsDash__card-label">Analyzed</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{nlp_stats.total_word_count.toLocaleString()}</span>
              <span class="StatsDash__card-label">Total Words</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{nlp_stats.total_char_count.toLocaleString()}</span>
              <span class="StatsDash__card-label">Total Chars</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{nlp_stats.total_unique_keywords}</span>
              <span class="StatsDash__card-label">Keywords</span>
            </div>
            <div class="StatsDash__card">
              <span class="StatsDash__card-value">{(nlp_stats.avg_vocabulary_richness * 100).toFixed(1)}%</span>
              <span class="StatsDash__card-label">Avg Richness</span>
            </div>
          </div>
          {#if nlp_stats.top_global_keywords.length > 0}
            <div class="StatsDash__keywords">
              <span class="StatsDash__keywords-label">Top Keywords:</span>
              {#each nlp_stats.top_global_keywords.slice(0, 10) as kw}
                <span class="StatsDash__keyword-tag">{kw.word} ({kw.count})</span>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

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

  .StatsDash__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .StatsDash__title {
    font-size: var(--text-xl);
    font-weight: 700;
    margin: 0;
  }

  .StatsDash__header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .StatsDash__refresh-btn {
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    padding: 2px 10px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .StatsDash__refresh-btn:hover {
    background: var(--accent);
  }

  .StatsDash__refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .StatsDash__updated-at {
    font-size: 10px;
    color: var(--muted-foreground);
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

  .StatsDash__keywords {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .StatsDash__keywords-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-weight: 600;
  }

  .StatsDash__pie-section {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .StatsDash__pie {
    width: 90px;
    height: 90px;
    flex-shrink: 0;
  }

  .StatsDash__pie-legend {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .StatsDash__pie-legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
  }

  .StatsDash__pie-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .StatsDash__keyword-tag {
    font-size: 11px;
    padding: 1px 8px;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--foreground);
  }
</style>
