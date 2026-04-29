<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  interface KeywordEntry {
    word: string;
    count: number;
  }

  interface NlpAnalysis {
    char_count: number;
    char_count_no_spaces: number;
    word_count: number;
    unique_word_count: number;
    sentence_count: number;
    paragraph_count: number;
    line_count: number;
    reading_time_minutes: number;
    avg_sentence_length: number;
    vocabulary_richness: number;
    headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number; total: number };
    links: { internal_links: number; external_links: number; total: number };
    code_blocks: { block_count: number; total_lines: number; languages: string[] };
    top_keywords: KeywordEntry[];
    file_size_bytes: number;
    content_hash: string;
  }

  const { stores } = use_app_context();

  let analysis = $state<NlpAnalysis | null>(null);
  let loading = $state(false);
  let error_msg = $state<string | null>(null);
  let last_analyzed_path = $state<string | null>(null);

  async function run_analysis() {
    const vault = stores.vault.vault;
    const tab = stores.tab.active_tab;
    if (!vault || !tab) {
      analysis = null;
      return;
    }

    const note_path = tab.note_path;
    if (note_path === last_analyzed_path && analysis) return;

    loading = true;
    error_msg = null;
    try {
      const result: NlpAnalysis = await invoke("nlp_analyze_note", {
        args: { vault_id: vault.id, note_path },
      });
      analysis = result;
      last_analyzed_path = note_path;
    } catch (e) {
      error_msg = String(e);
      analysis = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const _tab = stores.tab.active_tab;
    const _vault = stores.vault.vault;
    const _rail_open = stores.ui.context_rail_open;
    const _rail_tab = stores.ui.context_rail_tab;
    if (_rail_open && _rail_tab === "nlp" && _vault && _tab) {
      run_analysis();
    }
  });

  function format_time(minutes: number): string {
    if (minutes < 1) return "< 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  }

  function format_bytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function format_percent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  function max_keyword_count(keywords: KeywordEntry[]): number {
    return keywords.length > 0 ? (keywords[0]?.count ?? 1) : 1;
  }
</script>

<div class="NlpPanel">
  {#if loading}
    <div class="NlpPanel__status">Analyzing...</div>
  {:else if error_msg}
    <div class="NlpPanel__status NlpPanel__status--error">{error_msg}</div>
  {:else if !analysis}
    <div class="NlpPanel__status">Open a file to see NLP analysis</div>
  {:else}
    <div class="NlpPanel__content">
      <section class="NlpPanel__section">
        <h3 class="NlpPanel__section-title">📊 Basic Stats</h3>
        <div class="NlpPanel__grid">
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{analysis.word_count.toLocaleString()}</span>
            <span class="NlpPanel__stat-label">Words</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{analysis.char_count.toLocaleString()}</span>
            <span class="NlpPanel__stat-label">Characters</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{analysis.line_count.toLocaleString()}</span>
            <span class="NlpPanel__stat-label">Lines</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{analysis.sentence_count}</span>
            <span class="NlpPanel__stat-label">Sentences</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{analysis.paragraph_count}</span>
            <span class="NlpPanel__stat-label">Paragraphs</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value">{format_time(analysis.reading_time_minutes)}</span>
            <span class="NlpPanel__stat-label">Read Time</span>
          </div>
        </div>
      </section>

      <section class="NlpPanel__section">
        <h3 class="NlpPanel__section-title">📈 Metrics</h3>
        <div class="NlpPanel__metrics">
          <div class="NlpPanel__metric-row">
            <span>Vocabulary Richness</span>
            <span class="NlpPanel__metric-value">{format_percent(analysis.vocabulary_richness)}</span>
          </div>
          <div class="NlpPanel__metric-bar">
            <div class="NlpPanel__metric-fill" style="width: {analysis.vocabulary_richness * 100}%"></div>
          </div>
          <div class="NlpPanel__metric-row">
            <span>Avg Sentence Length</span>
            <span class="NlpPanel__metric-value">{analysis.avg_sentence_length.toFixed(1)} words</span>
          </div>
          <div class="NlpPanel__metric-row">
            <span>Unique Words</span>
            <span class="NlpPanel__metric-value">{analysis.unique_word_count.toLocaleString()}</span>
          </div>
          <div class="NlpPanel__metric-row">
            <span>File Size</span>
            <span class="NlpPanel__metric-value">{format_bytes(analysis.file_size_bytes)}</span>
          </div>
        </div>
      </section>

      {#if analysis.headings.total > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">📑 Headings ({analysis.headings.total})</h3>
          <div class="NlpPanel__heading-bars">
            {#each [
              { level: "H1", count: analysis.headings.h1 },
              { level: "H2", count: analysis.headings.h2 },
              { level: "H3", count: analysis.headings.h3 },
              { level: "H4", count: analysis.headings.h4 },
              { level: "H5", count: analysis.headings.h5 },
              { level: "H6", count: analysis.headings.h6 },
            ].filter(h => h.count > 0) as h}
              <div class="NlpPanel__heading-row">
                <span class="NlpPanel__heading-label">{h.level}</span>
                <div class="NlpPanel__heading-bar">
                  <div class="NlpPanel__heading-fill" style="width: {(h.count / analysis.headings.total) * 100}%"></div>
                </div>
                <span class="NlpPanel__heading-count">{h.count}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if analysis.links.total > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🔗 Links ({analysis.links.total})</h3>
          <div class="NlpPanel__metrics">
            <div class="NlpPanel__metric-row">
              <span>Internal (wiki-links)</span>
              <span class="NlpPanel__metric-value">{analysis.links.internal_links}</span>
            </div>
            <div class="NlpPanel__metric-row">
              <span>External (URLs)</span>
              <span class="NlpPanel__metric-value">{analysis.links.external_links}</span>
            </div>
          </div>
        </section>
      {/if}

      {#if analysis.code_blocks.block_count > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">💻 Code Blocks ({analysis.code_blocks.block_count})</h3>
          <div class="NlpPanel__metrics">
            <div class="NlpPanel__metric-row">
              <span>Total Code Lines</span>
              <span class="NlpPanel__metric-value">{analysis.code_blocks.total_lines}</span>
            </div>
            {#if analysis.code_blocks.languages.length > 0}
              <div class="NlpPanel__metric-row">
                <span>Languages</span>
                <span class="NlpPanel__metric-value">{analysis.code_blocks.languages.join(", ")}</span>
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if analysis.top_keywords.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🏷️ Keywords</h3>
          <div class="NlpPanel__keywords">
            {#each analysis.top_keywords as kw}
              <div class="NlpPanel__keyword-row">
                <span class="NlpPanel__keyword-word">{kw.word}</span>
                <div class="NlpPanel__keyword-bar">
                  <div
                    class="NlpPanel__keyword-fill"
                    style="width: {(kw.count / max_keyword_count(analysis.top_keywords)) * 100}%"
                  ></div>
                </div>
                <span class="NlpPanel__keyword-count">{kw.count}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .NlpPanel {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--foreground);
  }

  .NlpPanel__status {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .NlpPanel__status--error {
    color: var(--destructive);
  }

  .NlpPanel__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .NlpPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .NlpPanel__section-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin: 0;
  }

  .NlpPanel__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .NlpPanel__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NlpPanel__stat-value {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--foreground);
  }

  .NlpPanel__stat-label {
    font-size: 10px;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .NlpPanel__metrics {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .NlpPanel__metric-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-xs);
  }

  .NlpPanel__metric-value {
    font-weight: 600;
    color: var(--interactive);
  }

  .NlpPanel__metric-bar {
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    overflow: hidden;
    margin-block: 2px;
  }

  .NlpPanel__metric-fill {
    height: 100%;
    background: var(--interactive);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .NlpPanel__heading-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .NlpPanel__heading-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .NlpPanel__heading-label {
    font-size: 10px;
    font-weight: 600;
    width: 24px;
    color: var(--muted-foreground);
  }

  .NlpPanel__heading-bar {
    flex: 1;
    height: 6px;
    background: var(--muted);
    border-radius: 3px;
    overflow: hidden;
  }

  .NlpPanel__heading-fill {
    height: 100%;
    background: var(--interactive);
    border-radius: 3px;
  }

  .NlpPanel__heading-count {
    font-size: 10px;
    font-weight: 600;
    width: 20px;
    text-align: right;
  }

  .NlpPanel__keywords {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .NlpPanel__keyword-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .NlpPanel__keyword-word {
    font-size: 11px;
    width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .NlpPanel__keyword-bar {
    flex: 1;
    height: 6px;
    background: var(--muted);
    border-radius: 3px;
    overflow: hidden;
  }

  .NlpPanel__keyword-fill {
    height: 100%;
    background: var(--accent-foreground);
    border-radius: 3px;
    opacity: 0.6;
  }

  .NlpPanel__keyword-count {
    font-size: 10px;
    font-weight: 600;
    width: 24px;
    text-align: right;
    color: var(--muted-foreground);
  }
</style>
