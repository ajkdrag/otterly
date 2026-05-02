# NLP 价值导向规划

**取代**：`docs/nlp_coverage_plan.md`（旧的"100% 覆盖率"计划已废弃）。

**核心立场**：LeapGrowNotes 是个人本地 Markdown 笔记应用。`nlp_kernal/` Python 包原本是为**酒店预订客服域**设计的（见 `classifier` 的 C01–C08 标签、`email_parser` GUI、`ner` 注释 v2.1.0 hotel-booking schema、`production` 的 API gateway / A/B test）。机械追求子包 100% 覆盖率会把不相关代码强塞进笔记应用，反而污染产品语义。

**正确目标**：按用户价值精挑接入、剔除不相关、补齐真正缺失的能力。

---

## 子包价值矩阵

| 子包                                            | 原始领域                | 笔记应用价值            | 决策                               |
| ----------------------------------------------- | ----------------------- | ----------------------- | ---------------------------------- |
| `bow/` (TF-IDF)                                 | 通用                    | ⭐⭐⭐⭐⭐ 相似笔记推荐 | ✅ Phase A 接入                    |
| 顶层 `tokenize/keywords/sentiment/entities`     | 通用                    | ⭐⭐⭐ 已接入           | ✅ 保持                            |
| `ner.extractors.MLExtractor`（StructBERT 中文） | 通用                    | ⭐⭐⭐ 中文 NER         | ✅ 已接入，加缓存                  |
| `ner.extractors.llm_extractor`                  | LLM 通用                | ⭐⭐⭐⭐ 准确度高       | ✅ Phase C 接入                    |
| `ner/graph` `linker` `reasoning` `indexer`      | hotel 域（schema 写死） | ⭐⭐ 通用部分有用       | ⚠️ 改造：丢 hotel schema，复用算法 |
| `ner.extractors.relation_extractor`             | hotel 关系模板          | ⭐ 模板写死了           | ❌ `_legacy/`                      |
| `classifier/`                                   | hotel C01–C08           | ⭐ 标签固定             | ❌ `_legacy/`                      |
| `sentiment.analyzer` 高级版（LLM/BERT）         | 通用                    | ⭐ 笔记不是情绪日记     | ❌ `_legacy/`                      |
| `augmentation/` `annotation/`                   | 训练流程                | ⭐ 桌面应用不训练       | ❌ `_legacy/`                      |
| `email_parser/` `thread_builder/`               | 邮件域                  | ⭐ 笔记≠邮件            | ❌ `_legacy/`（除非检测到 `.eml`） |
| `self_learning/`                                | 训练管线                | ⭐ 不训练               | ❌ `_legacy/`                      |
| `production/`                                   | 服务化                  | ⭐ 桌面无服务           | ❌ `_legacy/`                      |
| `vllm_manager/`                                 | 本地 LLM 服务           | ⭐⭐⭐ 用于 RAG         | ⚠️ Phase C 仅在 RAG 中使用         |

---

## 笔记应用真正需要、但现有 nlp_kernal 没有的能力

| 缺失能力              | 价值       | 实现方案                                                                         |
| --------------------- | ---------- | -------------------------------------------------------------------------------- |
| 语义搜索（embedding） | ⭐⭐⭐⭐⭐ | 新增 `nlp_kernal.embedding`，用 sentence-transformers + BGE-small（中文，~90MB） |
| RAG 问答              | ⭐⭐⭐⭐⭐ | embedding 检索 + 本地 LLM 生成                                                   |
| 自动摘要              | ⭐⭐⭐⭐   | 短文本 textrank（无依赖），长文本走 LLM                                          |
| 自动标签建议          | ⭐⭐⭐⭐   | TF-IDF + 已有标签语料                                                            |
| 反链知识图谱可视化    | ⭐⭐⭐⭐   | 复用现有 `links/` 数据，新建 SVG 力导向图                                        |

---

## Phase A — 加深现有能力（P0，~1.5 天）

不引入新依赖，把已有桥接用到位。

| #   | 子包 / 能力                  | Python 函数                                                                                                   | Tauri 命令                                               | UI                                                     |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| A1  | `bow/` 相似笔记              | `bow_index_vault(root)`, `bow_similar(path, top_k)`                                                           | `nlp_bow_index`, `nlp_bow_similar`                       | NlpPanel 加 "🔗 Similar Notes"；vault 打开时后台建索引 |
| A2  | MLExtractor 缓存             | 在 `extract_entities_ml` 包装层加 `content_hash` 缓存（落 `nlp_db.db` 的 `nlp_analysis.ml_entities_json` 列） | 复用 `nlp_py_entities_ml`                                | 透明加速                                               |
| A3  | 反链图谱（不依赖 hotel ner） | 前端：用 `links` 表 + bow 相似度                                                                              | 复用现有 `index_note_links_snapshot` + `nlp_bow_similar` | 新增 NlpPanel "🕸 Note Graph" mini-section             |

**新表**：`bow_vectors(note_path PRIMARY KEY, vector BLOB, mtime INTEGER, doc_freq_revision INTEGER)`，schema 演进用现有 `migrate_from_legacy` 模式。

**长任务**：`bow_index_vault` 用 `tauri::async_runtime::spawn_blocking` + 进度事件 `bow_index_progress`。

---

## Phase B — 新增高价值能力（P0，~3 天）

引入 `sentence-transformers` + BGE-small-zh 模型（首次运行下载，~90MB）。新增 3 个 Python 模块。

| #   | 新模块                    | 暴露函数                                                                       | Tauri 命令                        | UI                                                         |
| --- | ------------------------- | ------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------- |
| B1  | `nlp_kernal/embedding/`   | `embed_text(text)`, `embed_index_vault(root)`, `semantic_search(query, top_k)` | `nlp_emb_index`, `nlp_emb_search` | 命令面板加 "Semantic Search"；现有搜索框增加"语义"模式切换 |
| B2  | `nlp_kernal/summarize/`   | `summarize_text(text, max_len, method)` method ∈ `{textrank, llm}`             | `nlp_summarize`                   | NlpPanel 加 "📝 Summary"                                   |
| B3  | `nlp_kernal/tag_suggest/` | `suggest_tags(text, vault_corpus, top_k)`                                      | `nlp_suggest_tags`                | 编辑器顶部加"建议标签"栏，点击插入到 frontmatter           |

**新表**：

- `embedding_vectors(note_path PRIMARY KEY, vector BLOB, model TEXT, mtime INTEGER)`
- 标签语料从 vault 中现有 `[[wiki-link]]` 和 frontmatter `tags:` 字段聚合，无需独立表

**模型加载**：lazy load，首次调用时下载并缓存到 `~/Library/Application Support/LeapGrowNotes/models/`；UI 显示下载进度。

---

## Phase C — LLM 高级能力（P1，可选，~2 天）

依赖本地 LLM（`vllm_manager` 或 llama.cpp）。模型大小数 GB，作为高级特性。

| #   | 能力     | 暴露函数                                                                 | Tauri 命令                             | UI                                                      |
| --- | -------- | ------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------- |
| C1  | RAG 问答 | `rag_query(question, vault_root)` 内部调用 `semantic_search` + LLM       | `nlp_rag_query` + `rag_token` 流式事件 | 新增"问我的笔记"对话框（`Cmd+K Q`）                     |
| C2  | LLM NER  | `nlp_kernal.extract_entities_llm(text)` → `ner.extractors.llm_extractor` | `nlp_py_entities_llm`                  | NlpPanel Entities section 加 "Source: rule/ml/llm" 切换 |
| C3  | LLM 摘要 | 复用 B2 的 `method="llm"`                                                | 复用 `nlp_summarize`                   | 同上                                                    |

**LLM 来源**：

- 优先用 `vllm_manager` 启动本地 vLLM 服务（如果可用）
- 否则提示用户配置 OpenAI 兼容 API endpoint（设置面板）

---

## Phase D — 隔离遗留代码（P0，~0.5 天）

**不删除**，保持代码完整性，但**移出主调用路径**。

### D1 — 创建 `nlp_kernal/_legacy/`

把以下子包移入（保留 import 路径兼容）：

```
nlp_kernal/_legacy/
├── README.md                  # 说明：原为 hotel 客服域，保留以备复用
├── classifier/                # 移自 nlp_kernal/classifier/
├── email_parser/
├── thread_builder/
├── augmentation/
├── annotation/
├── self_learning/
├── production/
└── ner_legacy/
    ├── extractors/relation_extractor.py
    └── graph/schema.py        # hotel 实体类型常量
```

### D2 — 更新 `nlp_kernal/__init__.py`

```python
def get_capabilities():
    return {
        # 主能力
        "tokenize": _check_jieba(),
        "extract_keywords": _check_jieba(),
        "sentiment": True,
        "ner_rule": True,
        "ner_ml": _check_ner_ml(),
        "embedding": _check_embedding(),       # 新增
        "summarize": True,                      # 新增
        "tag_suggest": True,                    # 新增
        "bow_similar": True,                    # 新增
        # Legacy（不在 UI 暴露）
        "_legacy_classifier": _check_legacy_classifier(),
        "_legacy_email_parser": True,
        "_legacy_thread_builder": True,
        # ...
    }
```

### D3 — UI 处理

- `modules_panel.svelte` 把 `_legacy_*` 移到折叠的 "Legacy (inactive)" 子段
- `nlp_invocation_tracker.svelte.ts` 不再列入 ALL_COMMANDS（因为不再桥接）
- 删除 Phase 之前已加的 `nlp_py_classify` Tauri 命令（hotel 标签对笔记无意义）

### D4 — 文档

新建 `nlp_kernal/_legacy/README.md`：

```markdown
# Legacy NLP Modules

These modules were inherited from a hotel-booking customer-service NLP project. They are preserved for code completeness but **NOT used by LeapGrowNotes**.

If you want to repurpose any of them for a future feature, see the original v2.1.0 docs.
```

---

## Phase E — 文档同步（P0，~0.5 天）

### E1 — 重写 `docs/nlptrack.md`

去掉"覆盖率"概念，改为"**价值矩阵 + 接入状态**"两张表：

1. 主能力：每个命令对应的笔记应用使用场景
2. 遗留：列出 `_legacy/` 子包，说明为何不接入

### E2 — 删除 `docs/nlp_coverage_plan.md`

被本文档（`nlp_value_plan.md`）取代。

### E3 — 更新 `nlp_kernal` 顶层 docstring

明确说明：本模块**已被改造为笔记应用 NLP**，hotel 域代码在 `_legacy/`。

---

## 修订后的目标对比

| 指标             | 旧"覆盖率"计划 | 新"价值"计划                                | 理由                 |
| ---------------- | -------------- | ------------------------------------------- | -------------------- |
| 子包接入数       | 12/12 (100%)   | 5 主用 + 3 新增                             | 不相关的不接入       |
| 新增 Python 模块 | 0              | 3 (`embedding`, `summarize`, `tag_suggest`) | 笔记应用真正需要     |
| 隔离遗留代码     | 否             | `_legacy/`                                  | 避免误导用户和开发者 |
| Tauri 命令数     | 30+            | ~16（精挑）                                 | 价值密度优先         |
| 新建 UI 面板     | 2              | 0（增强现有 NlpPanel + 命令面板入口）       | 不为新建而新建       |
| 新增模型/依赖    | 0              | sentence-transformers + BGE-small (~90MB)   | Phase B 必需，可关闭 |

---

## 时间线

```
Day 1     ── Phase D + E（先隔离遗留 + 重写文档，让方向干净）
Day 2-3   ── Phase A（bow 相似笔记 + 反链图谱 + ML 缓存）
Day 4-6   ── Phase B（embedding / 摘要 / 标签建议）
Day 7-8   ── Phase C 可选（RAG / LLM NER）
```

**最小可发布**：Phase D + E + A = ~3.5 天。Phase B 推荐做。Phase C 视用户对本地 LLM 接受度。

---

## 风险与决策

| 风险 / 决策点                                     | 处理                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| sentence-transformers 引入 PyTorch 依赖（~500MB） | 用 `onnxruntime` + ONNX 版 BGE 模型，仅需 ~150MB；模型 lazy 下载                      |
| 移动 `_legacy/` 改了 import 路径                  | 在 `nlp_kernal/__init__.py` 加 `sys.modules` 别名兼容旧路径，避免破坏现有未发现的引用 |
| `vllm_manager` 启动重                             | Phase C 不强制，提供 OpenAI-compatible API endpoint 作为替代                          |
| 删除 `nlp_py_classify` 命令是破坏性改动           | 项目"0 用户"，按 AGENTS.md 允许的清洁重构                                             |

---

## 验收

每个 Phase 末：

- [ ] `pnpm check && pnpm test && cd src-tauri && cargo check` 全绿
- [ ] `docs/nlptrack.md` 价值矩阵更新
- [ ] `modules_panel.svelte` 显示主能力 + 折叠的 legacy
- [ ] 新命令在 `nlp_invocation_tracker` 注册并显示
- [ ] 至少 1 个单元测试 / 命令

最终交付：

- [x] 不相关代码隔离到 `_legacy/`
- [x] 笔记应用真正需要的 3 个新能力上线（相似笔记 + 语义搜索 + 摘要/标签）
- [x] 文档反映"价值导向"而非"覆盖率"
