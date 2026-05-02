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
    word_count: number;
    sentence_count: number;
    paragraph_count: number;
    line_count: number;
    reading_time_minutes: number;
    avg_sentence_length: number;
    vocabulary_richness: number;
    top_keywords: KeywordEntry[];
    headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number; total: number };
  }

  interface PySentiment {
    label: string;
    score: number;
  }

  interface PyClassifyResult {
    label: string;
    label_code: string;
    score: number;
    method: string;
    is_confident: boolean;
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

  const { stores } = use_app_context();

  let user_triggered = $state(false);
  let loading = $state(false);
  let error_msg = $state<string | null>(null);
  let last_analyzed_path = $state<string | null>(null);

  // NLU 结果
  let analysis = $state<NlpAnalysis | null>(null);
  let sentiment = $state<PySentiment | null>(null);
  let classify = $state<PyClassifyResult | null>(null);
  let py_keywords = $state<KeywordEntry[] | null>(null);
  let summary_text = $state<string | null>(null);
  let structure_outline = $state<string[] | null>(null);

  // 当文件切换时：尝试从缓存加载，无缓存则显示按钮
  $effect(() => {
    const _tab = stores.tab.active_tab;
    const _vault = stores.vault.vault;
    const _rail_open = stores.ui.context_rail_open;
    const _rail_tab = stores.ui.context_rail_tab;
    if (_tab && _vault && _rail_open && _rail_tab === "nlu") {
      const note_path = _tab.note_path;
      if (note_path !== last_analyzed_path) {
        untrack(() => {
          user_triggered = false;
          analysis = null;
          sentiment = null;
          classify = null;
          py_keywords = null;
          summary_text = null;
          structure_outline = null;
          error_msg = null;
          try_load_cached(note_path, _vault.id);
        });
      }
    }
  });

  async function try_load_cached(note_path: string, vault_id: string) {
    try {
      const result = await tracked_invoke<NlpAnalysis>("nlp_analyze_note", {
        args: { vault_id, note_path },
      });
      // 命中缓存 → 直接显示结果
      analysis = result;
      last_analyzed_path = note_path;
      user_triggered = true;
      // 提取大纲和摘要
      const open_note = stores.editor.open_note;
      const md = (open_note?.markdown as string) ?? "";
      if (md.trim().length > 0) {
        extract_outline_and_summary(md);
        run_py_parts(md);
      }
    } catch {
      analysis = null;
      user_triggered = false;
    }
  }

  function extract_outline_and_summary(md: string) {
    const headings_list: string[] = [];
    for (const line of md.split("\n")) {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m && m[1] && m[2]) {
        const indent = "  ".repeat(m[1].length - 1);
        headings_list.push(`${indent}${m[2].trim()}`);
      }
    }
    structure_outline = headings_list.length > 0 ? headings_list : null;

    const paragraphs = md.split(/\n\s*\n/).filter((p) => p.trim().length > 0 && !p.trim().startsWith("#") && !p.trim().startsWith("```"));
    const first_paragraphs = paragraphs.slice(0, 3).map((p) => p.trim().replace(/\n/g, " "));
    if (first_paragraphs.length > 0) {
      const raw_summary = first_paragraphs.join(" ");
      summary_text = raw_summary.length > 300 ? raw_summary.slice(0, 300) + "..." : raw_summary;
    }
  }

  async function run_py_parts(md: string) {
    const promises: Promise<void>[] = [];
    promises.push(
      tracked_invoke<PySentiment>("nlp_py_sentiment", { args: { text: md } })
        .then((r) => { sentiment = r; }).catch(() => {}),
    );
    promises.push(
      tracked_invoke<KeywordEntry[]>("nlp_py_keywords", { args: { text: md, top_n: 10 } })
        .then((r) => { py_keywords = r; }).catch(() => {}),
    );
    let caps: PyCapabilities | null = null;
    try { caps = await tracked_invoke<PyCapabilities>("nlp_py_capabilities"); } catch {}
    if (caps?.classifier) {
      promises.push(
        tracked_invoke<PyClassifyResult>("nlp_py_classify", { args: { text: md } })
          .then((r) => { classify = r; }).catch(() => {}),
      );
    }
    await Promise.all(promises);
  }

  function handle_trigger() {
    user_triggered = true;
    run_nlu_analysis();
  }

  async function run_nlu_analysis() {
    const vault = stores.vault.vault;
    const tab = stores.tab.active_tab;
    if (!vault || !tab) return;

    const note_path = tab.note_path;
    loading = true;
    error_msg = null;

    try {
      // 1. 基础分析
      const result = await tracked_invoke<NlpAnalysis>("nlp_analyze_note", {
        args: { vault_id: vault.id, note_path },
      });
      analysis = result;
      last_analyzed_path = note_path;

      // 生成结构大纲（从标题提取）
      const open_note = stores.editor.open_note;
      const md = (open_note?.markdown as string) ?? "";
      if (md.trim().length > 0) {
        // 提取标题作为大纲
        const headings_list: string[] = [];
        for (const line of md.split("\n")) {
          const m = line.match(/^(#{1,6})\s+(.+)/);
          if (m && m[1] && m[2]) {
            const indent = "  ".repeat(m[1].length - 1);
            headings_list.push(`${indent}${m[2].trim()}`);
          }
        }
        structure_outline = headings_list.length > 0 ? headings_list : null;

        // 生成摘要（基于前几段文字）
        const paragraphs = md.split(/\n\s*\n/).filter((p) => p.trim().length > 0 && !p.trim().startsWith("#") && !p.trim().startsWith("```"));
        const first_paragraphs = paragraphs.slice(0, 3).map((p) => p.trim().replace(/\n/g, " "));
        if (first_paragraphs.length > 0) {
          const raw_summary = first_paragraphs.join(" ");
          summary_text = raw_summary.length > 300 ? raw_summary.slice(0, 300) + "..." : raw_summary;
        }

        // 2. Python NLU 分析（情感 + 分类 + 关键词）
        const promises: Promise<void>[] = [];

        promises.push(
          tracked_invoke<PySentiment>("nlp_py_sentiment", { args: { text: md } })
            .then((r) => { sentiment = r; })
            .catch(() => {}),
        );

        promises.push(
          tracked_invoke<KeywordEntry[]>("nlp_py_keywords", { args: { text: md, top_n: 10 } })
            .then((r) => { py_keywords = r; })
            .catch(() => {}),
        );

        let caps: PyCapabilities | null = null;
        try {
          caps = await tracked_invoke<PyCapabilities>("nlp_py_capabilities");
        } catch {}

        if (caps?.classifier) {
          promises.push(
            tracked_invoke<PyClassifyResult>("nlp_py_classify", { args: { text: md } })
              .then((r) => { classify = r; })
              .catch(() => {}),
          );
        }

        await Promise.all(promises);
      }
    } catch (e) {
      error_msg = String(e);
    } finally {
      loading = false;
    }
  }

  function sentiment_emoji(label: string): string {
    if (label === "positive") return "😊";
    if (label === "negative") return "😟";
    return "😐";
  }

  function sentiment_color(label: string): string {
    if (label === "positive") return "#22c55e";
    if (label === "negative") return "#ef4444";
    return "var(--muted-foreground)";
  }
</script>

<div class="NluPanel">
  {#if !stores.tab.active_tab}
    <div class="NluPanel__status">打开一个文件来使用 NLU 内容理解</div>
  {:else if !user_triggered}
    <div class="NluPanel__trigger">
      <div class="NluPanel__trigger-icon">📝</div>
      <div class="NluPanel__trigger-text">点击按钮对当前文件进行内容分析与摘要</div>
      <button
        type="button"
        class="NluPanel__trigger-btn"
        onclick={handle_trigger}
      >
        📋 开始内容分析
      </button>
    </div>
  {:else if loading}
    <div class="NluPanel__status">
      <div class="NluPanel__loading">
        <span class="NluPanel__loading-spinner">⏳</span>
        <span>正在分析内容...</span>
      </div>
    </div>
  {:else if error_msg}
    <div class="NluPanel__status NluPanel__status--error">{error_msg}</div>
  {:else}
    <div class="NluPanel__content">
      <!-- 内容摘要 -->
      {#if summary_text}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">📝 内容摘要</h3>
          <div class="NluPanel__summary-card">
            <p class="NluPanel__summary-text">{summary_text}</p>
          </div>
        </section>
      {/if}

      <!-- 文档概况 -->
      {#if analysis}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">📊 文档概况</h3>
          <div class="NluPanel__overview-grid">
            <div class="NluPanel__overview-item">
              <span class="NluPanel__overview-value">{analysis.word_count.toLocaleString()}</span>
              <span class="NluPanel__overview-label">字数</span>
            </div>
            <div class="NluPanel__overview-item">
              <span class="NluPanel__overview-value">{analysis.paragraph_count}</span>
              <span class="NluPanel__overview-label">段落</span>
            </div>
            <div class="NluPanel__overview-item">
              <span class="NluPanel__overview-value">{analysis.sentence_count}</span>
              <span class="NluPanel__overview-label">句子</span>
            </div>
            <div class="NluPanel__overview-item">
              <span class="NluPanel__overview-value">
                {analysis.reading_time_minutes < 1 ? "< 1" : Math.round(analysis.reading_time_minutes)} 分钟
              </span>
              <span class="NluPanel__overview-label">阅读时长</span>
            </div>
          </div>
        </section>
      {/if}

      <!-- 文档结构大纲 -->
      {#if structure_outline && structure_outline.length > 0}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">🗂️ 文档结构</h3>
          <div class="NluPanel__outline">
            {#each structure_outline as heading}
              <div class="NluPanel__outline-item">{heading}</div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 情感分析 -->
      {#if sentiment}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">🎭 情感倾向</h3>
          <div class="NluPanel__sentiment-card">
            <span class="NluPanel__sentiment-emoji">{sentiment_emoji(sentiment.label)}</span>
            <span class="NluPanel__sentiment-label" style="color: {sentiment_color(sentiment.label)}">
              {sentiment.label === "positive" ? "积极" : sentiment.label === "negative" ? "消极" : "中性"}
            </span>
            <span class="NluPanel__sentiment-score">({sentiment.score.toFixed(2)})</span>
          </div>
        </section>
      {/if}

      <!-- 内容理解 -->
      {#if analysis && summary_text}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">💡 内容理解</h3>
          <div class="NluPanel__understanding-card">
            {#if analysis.headings.total > 0}
              <div class="NluPanel__understanding-row">
                <span class="NluPanel__understanding-label">文档类型</span>
                <span class="NluPanel__understanding-value">
                  {analysis.headings.total > 5 ? "长文/教程" : analysis.headings.total > 2 ? "结构化文档" : "短文/笔记"}
                </span>
              </div>
            {/if}
            <div class="NluPanel__understanding-row">
              <span class="NluPanel__understanding-label">内容复杂度</span>
              <span class="NluPanel__understanding-value">
                {analysis.vocabulary_richness > 0.7 ? "高（词汇丰富）" : analysis.vocabulary_richness > 0.4 ? "中等" : "低（重复性高）"}
              </span>
            </div>
            <div class="NluPanel__understanding-row">
              <span class="NluPanel__understanding-label">篇幅评估</span>
              <span class="NluPanel__understanding-value">
                {analysis.word_count > 3000 ? "长篇" : analysis.word_count > 1000 ? "中篇" : analysis.word_count > 300 ? "短篇" : "片段"}
                （约 {analysis.reading_time_minutes < 1 ? "不到1" : Math.round(analysis.reading_time_minutes)} 分钟阅读）
              </span>
            </div>
            <div class="NluPanel__understanding-row">
              <span class="NluPanel__understanding-label">写作风格</span>
              <span class="NluPanel__understanding-value">
                {analysis.avg_sentence_length > 20 ? "学术/正式" : analysis.avg_sentence_length > 12 ? "叙述性" : "简洁/对话式"}
              </span>
            </div>
          </div>
        </section>
      {/if}

      <!-- 关键词 -->
      {#if py_keywords && py_keywords.length > 0}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">🔑 核心关键词</h3>
          <div class="NluPanel__keywords">
            {#each py_keywords as kw}
              <span class="NluPanel__keyword-tag">{kw.word}</span>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 可读性指标 -->
      {#if analysis}
        <section class="NluPanel__section">
          <h3 class="NluPanel__section-title">📈 可读性</h3>
          <div class="NluPanel__readability">
            <div class="NluPanel__readability-row">
              <span>词汇丰富度</span>
              <span class="NluPanel__readability-value">{(analysis.vocabulary_richness * 100).toFixed(1)}%</span>
            </div>
            <div class="NluPanel__readability-bar">
              <div class="NluPanel__readability-fill" style="width: {analysis.vocabulary_richness * 100}%"></div>
            </div>
            <div class="NluPanel__readability-row">
              <span>平均句子长度</span>
              <span class="NluPanel__readability-value">{analysis.avg_sentence_length.toFixed(1)} 词</span>
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .NluPanel {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--foreground);
  }

  .NluPanel__status {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .NluPanel__status--error {
    color: var(--destructive);
  }

  .NluPanel__trigger {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4, 16px);
    height: 100%;
    padding: var(--space-6, 24px);
    text-align: center;
  }

  .NluPanel__trigger-icon {
    font-size: 48px;
    line-height: 1;
    opacity: 0.6;
  }

  .NluPanel__trigger-text {
    font-size: var(--text-sm, 14px);
    color: var(--muted-foreground, #888);
    max-width: 200px;
  }

  .NluPanel__trigger-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    background: #10b981;
    color: white;
    border: none;
    border-radius: var(--radius-md, 8px);
    font-size: var(--text-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background 100ms, transform 100ms;
  }

  .NluPanel__trigger-btn:hover {
    background: #059669;
    transform: translateY(-1px);
  }

  .NluPanel__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .NluPanel__loading-spinner {
    font-size: 32px;
    animation: nlu-spin 1.5s ease-in-out infinite;
  }

  @keyframes nlu-spin {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(180deg); }
  }

  .NluPanel__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .NluPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .NluPanel__section-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin: 0;
  }

  .NluPanel__summary-card {
    padding: var(--space-3);
    background: var(--muted);
    border-radius: var(--radius-sm);
    border-left: 3px solid #10b981;
  }

  .NluPanel__summary-text {
    font-size: var(--text-xs);
    line-height: 1.6;
    color: var(--foreground);
    margin: 0;
  }

  .NluPanel__overview-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  .NluPanel__overview-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NluPanel__overview-value {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--foreground);
  }

  .NluPanel__overview-label {
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .NluPanel__outline {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 11px;
  }

  .NluPanel__outline-item {
    white-space: pre;
    color: var(--foreground);
    line-height: 1.5;
  }

  .NluPanel__sentiment-card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .NluPanel__sentiment-emoji {
    font-size: 20px;
  }

  .NluPanel__sentiment-label {
    font-weight: 700;
    font-size: var(--text-sm);
  }

  .NluPanel__sentiment-score {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .NluPanel__understanding-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--muted);
    border-radius: var(--radius-sm);
    border-left: 3px solid #8b5cf6;
  }

  .NluPanel__understanding-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-xs);
  }

  .NluPanel__understanding-label {
    color: var(--muted-foreground);
    font-weight: 500;
  }

  .NluPanel__understanding-value {
    font-weight: 600;
    color: #8b5cf6;
    text-align: right;
  }

  .NluPanel__keywords {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .NluPanel__keyword-tag {
    font-size: 11px;
    padding: 2px 10px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    color: #10b981;
    font-weight: 500;
  }

  .NluPanel__readability {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .NluPanel__readability-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs);
  }

  .NluPanel__readability-value {
    font-weight: 600;
    color: #10b981;
  }

  .NluPanel__readability-bar {
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    overflow: hidden;
  }

  .NluPanel__readability-fill {
    height: 100%;
    background: #10b981;
    border-radius: 2px;
    transition: width 0.3s ease;
  }
</style>
