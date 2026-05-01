<script lang="ts">
  import { untrack } from "svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { tracked_invoke } from "../nlp_invocation_tracker.svelte";

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
    headings: {
      h1: number;
      h2: number;
      h3: number;
      h4: number;
      h5: number;
      h6: number;
      total: number;
    };
    links: { internal_links: number; external_links: number; total: number };
    code_blocks: {
      block_count: number;
      total_lines: number;
      languages: string[];
    };
    top_keywords: KeywordEntry[];
    file_size_bytes: number;
    content_hash: string;
  }

  interface PySentiment {
    label: string;
    score: number;
  }

  interface PyEntity {
    entity_type: string;
    value: string;
    start: number;
    end: number;
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

  interface PyClassifyResult {
    label: string;
    label_code: string;
    score: number;
    method: string;
    is_confident: boolean;
  }

  interface BpeMergeInfo {
    pair: string;
    merged: string;
    frequency: number;
    rank: number;
  }

  interface BpeTokenFreq {
    token: string;
    count: number;
  }

  interface BpeAnalysis {
    token_count: number;
    vocab_size: number;
    num_merges: number;
    compression_ratio: number;
    avg_token_length: number;
    top_merges: BpeMergeInfo[];
    top_tokens: BpeTokenFreq[];
    sample_tokens: string[];
    original_byte_length: number;
    original_char_length: number;
  }

  const { stores } = use_app_context();

  let analysis = $state<NlpAnalysis | null>(null);
  let loading = $state(false);
  let error_msg = $state<string | null>(null);
  let last_analyzed_path = $state<string | null>(null);
  let user_triggered = $state(false);

  let py_sentiment = $state<PySentiment | null>(null);
  let py_keywords = $state<KeywordEntry[] | null>(null);
  let py_tokens = $state<string[] | null>(null);
  let py_entities = $state<PyEntity[] | null>(null);
  let py_entities_ml = $state<PyEntity[] | null>(null);
  let py_classify = $state<PyClassifyResult | null>(null);
  let py_capabilities = $state<PyCapabilities | null>(null);
  let py_loading = $state(false);
  let py_error = $state<string | null>(null);

  let bpe_analysis = $state<BpeAnalysis | null>(null);
  let bpe_loading = $state(false);
  let bpe_error = $state<string | null>(null);

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
    py_sentiment = null;
    py_keywords = null;
    py_tokens = null;
    py_entities = null;
    py_entities_ml = null;
    py_classify = null;
    py_error = null;
    bpe_analysis = null;
    bpe_error = null;

    try {
      const result: NlpAnalysis = await tracked_invoke("nlp_analyze_note", {
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

    run_python_analysis();
    run_bpe_analysis();
  }

  async function run_bpe_analysis() {
    const open_note = stores.editor.open_note;
    if (!open_note?.markdown) return;

    const text = open_note.markdown as string;
    if (text.trim().length === 0) return;

    bpe_loading = true;
    bpe_error = null;

    try {
      bpe_analysis = await tracked_invoke<BpeAnalysis>("nlp_bpe_analyze", {
        args: { text, max_merges: 100 },
      });
    } catch (e) {
      bpe_error = String(e);
      bpe_analysis = null;
    } finally {
      bpe_loading = false;
    }
  }

  async function run_python_analysis() {
    const open_note = stores.editor.open_note;
    if (!open_note?.markdown) return;

    const text = open_note.markdown as string;
    if (text.trim().length === 0) return;

    py_loading = true;
    py_error = null;

    try {
      if (!py_capabilities) {
        py_capabilities = await tracked_invoke<PyCapabilities>(
          "nlp_py_capabilities",
        );
      }

      const promises: Promise<void>[] = [];

      promises.push(
        tracked_invoke<PySentiment>("nlp_py_sentiment", { args: { text } })
          .then((r) => {
            py_sentiment = r;
          })
          .catch(() => {}),
      );

      promises.push(
        tracked_invoke<KeywordEntry[]>("nlp_py_keywords", {
          args: { text, top_n: 15 },
        })
          .then((r) => {
            py_keywords = r;
          })
          .catch(() => {}),
      );

      if (py_capabilities?.tokenize) {
        const token_text = text.length > 3000 ? text.slice(0, 3000) : text;
        promises.push(
          tracked_invoke<string[]>("nlp_py_tokenize", {
            args: { text: token_text },
          })
            .then((r) => {
              py_tokens = r;
            })
            .catch(() => {}),
        );
      }

      promises.push(
        tracked_invoke<PyEntity[]>("nlp_py_entities", { args: { text } })
          .then((r) => {
            py_entities = r;
          })
          .catch(() => {}),
      );

      if (py_capabilities?.ner_ml) {
        const ml_text = text.length > 2000 ? text.slice(0, 2000) : text;
        promises.push(
          tracked_invoke<PyEntity[]>("nlp_py_entities_ml", {
            args: { text: ml_text },
          })
            .then((r) => {
              py_entities_ml = r;
            })
            .catch(() => {}),
        );
      }

      if (py_capabilities?.classifier) {
        promises.push(
          tracked_invoke<PyClassifyResult>("nlp_py_classify", {
            args: { text },
          })
            .then((r) => {
              py_classify = r;
            })
            .catch(() => {}),
        );
      }

      await Promise.all(promises);
    } catch (e) {
      py_error = String(e);
    } finally {
      py_loading = false;
    }
  }

  // 当文件切换时：检查是否有缓存，有则直接加载，无则显示按钮
  $effect(() => {
    const _tab = stores.tab.active_tab;
    const _vault = stores.vault.vault;
    const _rail_open = stores.ui.context_rail_open;
    const _rail_tab = stores.ui.context_rail_tab;
    if (_tab && _vault && _rail_open && _rail_tab === "nlp") {
      const note_path = _tab.note_path;
      if (note_path !== last_analyzed_path) {
        untrack(() => {
          user_triggered = false;
          analysis = null;
          // 尝试从缓存加载（nlp_analyze_note 内部有缓存机制）
          try_load_cached(note_path, _vault.id);
        });
      }
    }
  });

  async function try_load_cached(note_path: string, vault_id: string) {
    try {
      const result: NlpAnalysis = await tracked_invoke("nlp_analyze_note", {
        args: { vault_id, note_path },
      });
      // 如果成功返回（命中缓存），直接显示结果
      analysis = result;
      last_analyzed_path = note_path;
      user_triggered = true;
      // 也加载 Python 分析
      run_python_analysis();
      run_bpe_analysis();
    } catch {
      // 无缓存或失败，保持按钮状态
      analysis = null;
      user_triggered = false;
    }
  }

  function handle_trigger_analysis() {
    user_triggered = true;
    run_analysis();
  }

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

  function sentiment_color(label: string): string {
    if (label === "positive") return "#22c55e";
    if (label === "negative") return "#ef4444";
    return "var(--muted-foreground)";
  }

  function sentiment_emoji(label: string): string {
    if (label === "positive") return "😊";
    if (label === "negative") return "😟";
    return "😐";
  }

  function entity_icon(entity_type: string): string {
    if (entity_type === "EMAIL") return "📧";
    if (entity_type === "URL") return "🔗";
    if (entity_type === "DATE") return "📅";
    return "🏷️";
  }
</script>

<div class="NlpPanel">
  {#if !stores.tab.active_tab}
    <div class="NlpPanel__status">打开一个文件来使用 NLP 分析</div>
  {:else if !user_triggered}
    <div class="NlpPanel__trigger">
      <div class="NlpPanel__trigger-icon">🧠</div>
      <div class="NlpPanel__trigger-text">点击按钮对当前文件进行 NLP 分析</div>
      <button
        type="button"
        class="NlpPanel__trigger-btn"
        onclick={handle_trigger_analysis}
      >
        🔬 开始 NLP 分析
      </button>
    </div>
  {:else if loading}
    <div class="NlpPanel__status">
      <div class="NlpPanel__loading">
        <span class="NlpPanel__loading-spinner">⏳</span>
        <span>正在分析中...</span>
      </div>
    </div>
  {:else if error_msg}
    <div class="NlpPanel__status NlpPanel__status--error">{error_msg}</div>
  {:else if !analysis}
    <div class="NlpPanel__status">打开一个文件来使用 NLP 分析</div>
  {:else}
    <div class="NlpPanel__content">
      <section class="NlpPanel__section">
        <h3 class="NlpPanel__section-title">📊 Basic Stats</h3>
        <div class="NlpPanel__grid">
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value"
              >{analysis.word_count.toLocaleString()}</span
            >
            <span class="NlpPanel__stat-label">Words</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value"
              >{analysis.char_count.toLocaleString()}</span
            >
            <span class="NlpPanel__stat-label">Characters</span>
          </div>
          <div class="NlpPanel__stat">
            <span class="NlpPanel__stat-value"
              >{analysis.line_count.toLocaleString()}</span
            >
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
            <span class="NlpPanel__stat-value"
              >{format_time(analysis.reading_time_minutes)}</span
            >
            <span class="NlpPanel__stat-label">Read Time</span>
          </div>
        </div>
      </section>

      <section class="NlpPanel__section">
        <h3 class="NlpPanel__section-title">📈 Metrics</h3>
        <div class="NlpPanel__metrics">
          <div class="NlpPanel__metric-row">
            <span>Vocabulary Richness</span>
            <span class="NlpPanel__metric-value"
              >{format_percent(analysis.vocabulary_richness)}</span
            >
          </div>
          <div class="NlpPanel__metric-bar">
            <div
              class="NlpPanel__metric-fill"
              style="width: {analysis.vocabulary_richness * 100}%"
            ></div>
          </div>
          <div class="NlpPanel__metric-row">
            <span>Avg Sentence Length</span>
            <span class="NlpPanel__metric-value"
              >{analysis.avg_sentence_length.toFixed(1)} words</span
            >
          </div>
          <div class="NlpPanel__metric-row">
            <span>Unique Words</span>
            <span class="NlpPanel__metric-value"
              >{analysis.unique_word_count.toLocaleString()}</span
            >
          </div>
          <div class="NlpPanel__metric-row">
            <span>File Size</span>
            <span class="NlpPanel__metric-value"
              >{format_bytes(analysis.file_size_bytes)}</span
            >
          </div>
        </div>
      </section>

      {#if py_sentiment}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🎭 Sentiment Analysis</h3>
          <div class="NlpPanel__sentiment">
            <div class="NlpPanel__sentiment-header">
              <span class="NlpPanel__sentiment-emoji"
                >{sentiment_emoji(py_sentiment.label)}</span
              >
              <span
                class="NlpPanel__sentiment-label"
                style="color: {sentiment_color(py_sentiment.label)}"
              >
                {py_sentiment.label.charAt(0).toUpperCase() +
                  py_sentiment.label.slice(1)}
              </span>
            </div>
            <div class="NlpPanel__sentiment-bar-wrap">
              <span class="NlpPanel__sentiment-end">Negative</span>
              <div class="NlpPanel__sentiment-bar">
                <div
                  class="NlpPanel__sentiment-indicator"
                  style="left: {((py_sentiment.score + 1) / 2) * 100}%"
                ></div>
              </div>
              <span class="NlpPanel__sentiment-end">Positive</span>
            </div>
            <div class="NlpPanel__metric-row">
              <span>Score</span>
              <span class="NlpPanel__metric-value"
                >{py_sentiment.score.toFixed(2)}</span
              >
            </div>
          </div>
        </section>
      {/if}

      {#if analysis.headings.total > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            📑 Headings ({analysis.headings.total})
          </h3>
          <div class="NlpPanel__heading-bars">
            {#each [{ level: "H1", count: analysis.headings.h1 }, { level: "H2", count: analysis.headings.h2 }, { level: "H3", count: analysis.headings.h3 }, { level: "H4", count: analysis.headings.h4 }, { level: "H5", count: analysis.headings.h5 }, { level: "H6", count: analysis.headings.h6 }].filter((h) => h.count > 0) as h}
              <div class="NlpPanel__heading-row">
                <span class="NlpPanel__heading-label">{h.level}</span>
                <div class="NlpPanel__heading-bar">
                  <div
                    class="NlpPanel__heading-fill"
                    style="width: {(h.count / analysis.headings.total) * 100}%"
                  ></div>
                </div>
                <span class="NlpPanel__heading-count">{h.count}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if analysis.links.total > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            🔗 Links ({analysis.links.total})
          </h3>
          <div class="NlpPanel__metrics">
            <div class="NlpPanel__metric-row">
              <span>Internal (wiki-links)</span>
              <span class="NlpPanel__metric-value"
                >{analysis.links.internal_links}</span
              >
            </div>
            <div class="NlpPanel__metric-row">
              <span>External (URLs)</span>
              <span class="NlpPanel__metric-value"
                >{analysis.links.external_links}</span
              >
            </div>
          </div>
        </section>
      {/if}

      {#if analysis.code_blocks.block_count > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            💻 Code Blocks ({analysis.code_blocks.block_count})
          </h3>
          <div class="NlpPanel__metrics">
            <div class="NlpPanel__metric-row">
              <span>Total Code Lines</span>
              <span class="NlpPanel__metric-value"
                >{analysis.code_blocks.total_lines}</span
              >
            </div>
            {#if analysis.code_blocks.languages.length > 0}
              <div class="NlpPanel__metric-row">
                <span>Languages</span>
                <span class="NlpPanel__metric-value"
                  >{analysis.code_blocks.languages.join(", ")}</span
                >
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if analysis.top_keywords.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🏷️ Keywords (Rust)</h3>
          <div class="NlpPanel__keywords">
            {#each analysis.top_keywords as kw}
              <div class="NlpPanel__keyword-row">
                <span class="NlpPanel__keyword-word">{kw.word}</span>
                <div class="NlpPanel__keyword-bar">
                  <div
                    class="NlpPanel__keyword-fill"
                    style="width: {(kw.count /
                      max_keyword_count(analysis.top_keywords)) *
                      100}%"
                  ></div>
                </div>
                <span class="NlpPanel__keyword-count">{kw.count}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if py_keywords && py_keywords.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🔑 Keywords (Python/jieba)</h3>
          <div class="NlpPanel__keywords">
            {#each py_keywords as kw}
              <div class="NlpPanel__keyword-row">
                <span class="NlpPanel__keyword-word">{kw.word}</span>
                <div class="NlpPanel__keyword-bar">
                  <div
                    class="NlpPanel__keyword-fill NlpPanel__keyword-fill--py"
                    style="width: {(kw.count / max_keyword_count(py_keywords)) *
                      100}%"
                  ></div>
                </div>
                <span class="NlpPanel__keyword-count">{kw.count}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if py_entities && py_entities.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            🏢 Entities ({py_entities.length})
          </h3>
          <div class="NlpPanel__entities">
            {#each py_entities as entity}
              <div class="NlpPanel__entity-row">
                <span class="NlpPanel__entity-icon"
                  >{entity_icon(entity.entity_type)}</span
                >
                <span class="NlpPanel__entity-type">{entity.entity_type}</span>
                <span class="NlpPanel__entity-value" title={entity.value}
                  >{entity.value}</span
                >
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if py_classify}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">🏷️ Text Classification</h3>
          <div class="NlpPanel__classify">
            <div class="NlpPanel__classify-header">
              <span
                class="NlpPanel__classify-label"
                class:NlpPanel__classify-label--confident={py_classify.is_confident}
                >{py_classify.label}</span
              >
              {#if py_classify.label_code}
                <span class="NlpPanel__classify-code"
                  >{py_classify.label_code}</span
                >
              {/if}
            </div>
            <div class="NlpPanel__metrics">
              <div class="NlpPanel__metric-row">
                <span>Confidence</span>
                <span class="NlpPanel__metric-value"
                  >{(py_classify.score * 100).toFixed(0)}%</span
                >
              </div>
              <div class="NlpPanel__metric-bar">
                <div
                  class="NlpPanel__metric-fill"
                  style="width: {py_classify.score * 100}%"
                ></div>
              </div>
              <div class="NlpPanel__metric-row">
                <span>Method</span>
                <span class="NlpPanel__metric-value">{py_classify.method}</span>
              </div>
            </div>
          </div>
        </section>
      {/if}

      {#if py_entities_ml && py_entities_ml.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            🤖 NER ML ({py_entities_ml.length})
          </h3>
          <div class="NlpPanel__entities">
            {#each py_entities_ml as entity}
              <div class="NlpPanel__entity-row NlpPanel__entity-row--ml">
                <span class="NlpPanel__entity-icon"
                  >{entity_icon(entity.entity_type)}</span
                >
                <span class="NlpPanel__entity-type">{entity.entity_type}</span>
                <span class="NlpPanel__entity-value" title={entity.value}
                  >{entity.value}</span
                >
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if py_tokens && py_tokens.length > 0}
        <section class="NlpPanel__section">
          <h3 class="NlpPanel__section-title">
            🔤 Tokens ({py_tokens.length})
          </h3>
          <div class="NlpPanel__tokens">
            {#each py_tokens.slice(0, 100) as token}
              {#if token.trim()}
                <span class="NlpPanel__token">{token}</span>
              {/if}
            {/each}
            {#if py_tokens.length > 100}
              <span class="NlpPanel__token NlpPanel__token--more"
                >+{py_tokens.length - 100} more</span
              >
            {/if}
          </div>
        </section>
      {/if}

      <!-- BPE Token Analysis Section -->
      {#if bpe_loading}
        <div class="NlpPanel__py-status">Loading BPE Analysis...</div>
      {:else if bpe_error}
        <div class="NlpPanel__py-status NlpPanel__py-status--error">{bpe_error}</div>
      {:else if bpe_analysis}
        <section class="NlpPanel__section NlpPanel__bpe-section">
          <h3 class="NlpPanel__section-title">🧩 BPE Token 分析 (Byte Pair Encoding)</h3>

          <div class="NlpPanel__bpe-overview">
            <div class="NlpPanel__grid">
              <div class="NlpPanel__stat">
                <span class="NlpPanel__stat-value">{bpe_analysis.token_count.toLocaleString()}</span>
                <span class="NlpPanel__stat-label">BPE Tokens</span>
              </div>
              <div class="NlpPanel__stat">
                <span class="NlpPanel__stat-value">{bpe_analysis.vocab_size.toLocaleString()}</span>
                <span class="NlpPanel__stat-label">词表大小</span>
              </div>
              <div class="NlpPanel__stat">
                <span class="NlpPanel__stat-value">{bpe_analysis.num_merges}</span>
                <span class="NlpPanel__stat-label">合并次数</span>
              </div>
            </div>
          </div>

          <div class="NlpPanel__bpe-details">
            <h4 class="NlpPanel__bpe-subtitle">📐 算法指标</h4>
            <div class="NlpPanel__metrics">
              <div class="NlpPanel__metric-row">
                <span>压缩比 (chars/tokens)</span>
                <span class="NlpPanel__metric-value">{bpe_analysis.compression_ratio.toFixed(2)}x</span>
              </div>
              <div class="NlpPanel__metric-row">
                <span>平均 Token 长度</span>
                <span class="NlpPanel__metric-value">{bpe_analysis.avg_token_length.toFixed(2)} chars</span>
              </div>
              <div class="NlpPanel__metric-row">
                <span>原始字符数</span>
                <span class="NlpPanel__metric-value">{bpe_analysis.original_char_length.toLocaleString()}</span>
              </div>
              <div class="NlpPanel__metric-row">
                <span>原始字节数</span>
                <span class="NlpPanel__metric-value">{format_bytes(bpe_analysis.original_byte_length)}</span>
              </div>
            </div>
          </div>

          {#if bpe_analysis.top_merges.length > 0}
            <div class="NlpPanel__bpe-details">
              <h4 class="NlpPanel__bpe-subtitle">🔀 Top 合并规则 ({bpe_analysis.top_merges.length})</h4>
              <div class="NlpPanel__bpe-merges">
                {#each bpe_analysis.top_merges as merge}
                  <div class="NlpPanel__bpe-merge-row">
                    <span class="NlpPanel__bpe-merge-rank">#{merge.rank}</span>
                    <span class="NlpPanel__bpe-merge-pair">{merge.pair}</span>
                    <span class="NlpPanel__bpe-merge-arrow">→</span>
                    <span class="NlpPanel__bpe-merge-result">{merge.merged}</span>
                    <span class="NlpPanel__bpe-merge-freq">×{merge.frequency}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if bpe_analysis.top_tokens.length > 0}
            <div class="NlpPanel__bpe-details">
              <h4 class="NlpPanel__bpe-subtitle">📊 高频 Token (Top {bpe_analysis.top_tokens.length})</h4>
              <div class="NlpPanel__keywords">
                {#each bpe_analysis.top_tokens as tok}
                  <div class="NlpPanel__keyword-row">
                    <span class="NlpPanel__keyword-word">{tok.token}</span>
                    <div class="NlpPanel__keyword-bar">
                      <div
                        class="NlpPanel__keyword-fill NlpPanel__keyword-fill--bpe"
                        style="width: {(tok.count / (bpe_analysis.top_tokens[0]?.count ?? 1)) * 100}%"
                      ></div>
                    </div>
                    <span class="NlpPanel__keyword-count">{tok.count}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if bpe_analysis.sample_tokens.length > 0}
            <div class="NlpPanel__bpe-details">
              <h4 class="NlpPanel__bpe-subtitle">🔤 BPE Token 序列 (前 {Math.min(bpe_analysis.sample_tokens.length, 200)} 个)</h4>
              <div class="NlpPanel__tokens">
                {#each bpe_analysis.sample_tokens as token}
                  {#if token.trim()}
                    <span class="NlpPanel__token NlpPanel__token--bpe">{token}</span>
                  {/if}
                {/each}
                {#if bpe_analysis.token_count > 200}
                  <span class="NlpPanel__token NlpPanel__token--more"
                    >+{bpe_analysis.token_count - 200} more</span
                  >
                {/if}
              </div>
            </div>
          {/if}

          <div class="NlpPanel__bpe-info">
            <h4 class="NlpPanel__bpe-subtitle">ℹ️ 关于 BPE 算法</h4>
            <div class="NlpPanel__bpe-info-text">
              <p><strong>Byte Pair Encoding (BPE)</strong> 是现代大语言模型（如 GPT、LLaMA）使用的核心分词算法。</p>
              <p>🔹 <strong>原理</strong>：从字符级开始，迭代合并出现频率最高的相邻字符对，逐步构建子词词表。</p>
              <p>🔹 <strong>优势</strong>：有效处理未登录词(OOV)，在词汇覆盖率和词表大小间取得平衡。</p>
              <p>🔹 <strong>压缩比</strong>：值越大表示每个 token 平均覆盖越多字符，编码越高效。</p>
              <p>🔹 <strong>合并规则</strong>：展示了 BPE 学习到的最重要的子词模式，反映文本的结构特征。</p>
            </div>
          </div>
        </section>
      {/if}

      {#if py_loading}
        <div class="NlpPanel__py-status">Loading Python NLP...</div>
      {/if}
      {#if py_error}
        <div class="NlpPanel__py-status NlpPanel__py-status--error">
          {py_error}
        </div>
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

  .NlpPanel__keyword-fill--py {
    background: #8b5cf6;
    opacity: 0.7;
  }

  .NlpPanel__keyword-count {
    font-size: 10px;
    font-weight: 600;
    width: 24px;
    text-align: right;
    color: var(--muted-foreground);
  }

  .NlpPanel__sentiment {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NlpPanel__sentiment-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .NlpPanel__sentiment-emoji {
    font-size: 20px;
    line-height: 1;
  }

  .NlpPanel__sentiment-label {
    font-weight: 700;
    font-size: var(--text-sm);
  }

  .NlpPanel__sentiment-bar-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .NlpPanel__sentiment-end {
    font-size: 9px;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .NlpPanel__sentiment-bar {
    flex: 1;
    height: 6px;
    background: linear-gradient(90deg, #ef4444, #eab308, #22c55e);
    border-radius: 3px;
    position: relative;
  }

  .NlpPanel__sentiment-indicator {
    position: absolute;
    top: -3px;
    width: 12px;
    height: 12px;
    background: var(--foreground);
    border-radius: 50%;
    border: 2px solid var(--background);
    transform: translateX(-50%);
  }

  .NlpPanel__entities {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .NlpPanel__entity-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    padding: 2px var(--space-1);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NlpPanel__entity-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .NlpPanel__entity-type {
    font-weight: 600;
    font-size: 10px;
    color: var(--muted-foreground);
    width: 40px;
    flex-shrink: 0;
  }

  .NlpPanel__entity-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--interactive);
    flex: 1;
    min-width: 0;
  }

  .NlpPanel__tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .NlpPanel__token {
    font-size: 10px;
    padding: 1px 6px;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--foreground);
    white-space: nowrap;
  }

  .NlpPanel__token--more {
    color: var(--muted-foreground);
    font-style: italic;
    border-style: dashed;
  }

  .NlpPanel__classify {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NlpPanel__classify-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .NlpPanel__classify-label {
    font-weight: 700;
    font-size: var(--text-sm);
    color: var(--foreground);
  }

  .NlpPanel__classify-label--confident {
    color: #22c55e;
  }

  .NlpPanel__classify-code {
    font-size: 10px;
    padding: 1px 6px;
    background: var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
    font-family: monospace;
  }

  .NlpPanel__entity-row--ml {
    border-left: 2px solid #8b5cf6;
  }

  .NlpPanel__py-status {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: center;
    padding: var(--space-1);
  }

  .NlpPanel__py-status--error {
    color: var(--destructive);
  }

  /* ── Trigger Button ──────────────────────────── */

  .NlpPanel__trigger {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4, 16px);
    height: 100%;
    padding: var(--space-6, 24px);
    text-align: center;
  }

  .NlpPanel__trigger-icon {
    font-size: 48px;
    line-height: 1;
    opacity: 0.6;
  }

  .NlpPanel__trigger-text {
    font-size: var(--text-sm, 14px);
    color: var(--muted-foreground, #888);
    max-width: 200px;
  }

  .NlpPanel__trigger-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    background: var(--interactive, #6366f1);
    color: white;
    border: none;
    border-radius: var(--radius-md, 8px);
    font-size: var(--text-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast, 100ms), transform var(--duration-fast, 100ms);
  }

  .NlpPanel__trigger-btn:hover {
    background: var(--interactive-hover, #4f46e5);
    transform: translateY(-1px);
  }

  .NlpPanel__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .NlpPanel__loading-spinner {
    font-size: 32px;
    animation: nlp-spin 1.5s ease-in-out infinite;
  }

  @keyframes nlp-spin {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(180deg); }
  }

  /* BPE Section Styles */
  .NlpPanel__bpe-section {
    border-top: 2px solid #f59e0b;
    padding-top: var(--space-3);
    margin-top: var(--space-2);
  }

  .NlpPanel__bpe-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .NlpPanel__bpe-subtitle {
    font-size: 11px;
    font-weight: 600;
    color: var(--foreground);
    margin: var(--space-1) 0 0 0;
  }

  .NlpPanel__bpe-merges {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .NlpPanel__bpe-merge-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    padding: 2px var(--space-1);
    background: var(--muted);
    border-radius: var(--radius-sm);
    border-left: 2px solid #f59e0b;
  }

  .NlpPanel__bpe-merge-rank {
    font-weight: 700;
    color: #f59e0b;
    width: 24px;
    flex-shrink: 0;
  }

  .NlpPanel__bpe-merge-pair {
    color: var(--muted-foreground);
    font-family: monospace;
    font-size: 10px;
  }

  .NlpPanel__bpe-merge-arrow {
    color: #f59e0b;
    font-weight: 700;
    flex-shrink: 0;
  }

  .NlpPanel__bpe-merge-result {
    font-weight: 600;
    color: var(--foreground);
    font-family: monospace;
    font-size: 10px;
  }

  .NlpPanel__bpe-merge-freq {
    margin-left: auto;
    color: var(--muted-foreground);
    font-size: 9px;
    flex-shrink: 0;
  }

  .NlpPanel__keyword-fill--bpe {
    background: #f59e0b;
    opacity: 0.7;
  }

  .NlpPanel__token--bpe {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  .NlpPanel__bpe-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .NlpPanel__bpe-info-text {
    font-size: 10px;
    color: var(--muted-foreground);
    line-height: 1.6;
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
    border-left: 3px solid #f59e0b;
  }

  .NlpPanel__bpe-info-text p {
    margin: 0 0 4px 0;
  }

  .NlpPanel__bpe-info-text p:last-child {
    margin-bottom: 0;
  }

  .NlpPanel__bpe-info-text strong {
    color: var(--foreground);
  }
</style>
