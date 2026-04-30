# NLP 使用追踪 (nlptrack)

本文档记录 LeapGrowNotes 项目中 NLP 模块的实际调用情况，区分**已被前端集成**与**仅有代码、尚未被调用**两类。

最后更新：2026-04-30

---

## 调用链路图

```
Svelte UI (nlp_panel.svelte / stats_dashboard.svelte)
  → tracked_invoke() [src/lib/features/nlp_kernal/nlp_invocation_tracker.svelte.ts]
  → Tauri command [src-tauri/src/features/nlp_kernal/commands.rs]
  → Rust bridge [python_bridge.rs / analysis.rs / stats.rs / cache.rs]
  → Python module [nlp_kernal/__init__.py → 各子包]
```

---

## ✅ 已接入（在前端被实际调用）

| Command ID                | 类型                   | 后端实现                                                        | 调用位置                                   | UI Section                                                                                 |
| ------------------------- | ---------------------- | --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `nlp_analyze_note`        | Rust                   | `analysis::analyze` + SQLite 缓存                               | `nlp_panel.svelte`                         | 📊 Basic Stats / 📈 Metrics / 📑 Headings / 🔗 Links / 💻 Code Blocks / 🏷️ Keywords (Rust) |
| `nlp_get_aggregate_stats` | Rust                   | `stats::get_nlp_aggregate`                                      | `stats_dashboard.svelte`                   | 🧠 NLP Knowledge Base                                                                      |
| `nlp_py_capabilities`     | Python                 | `nlp_kernal.get_capabilities`                                   | `nlp_panel.svelte`, `modules_panel.svelte` | 🐍 Python NLP Modules                                                                      |
| `nlp_py_tokenize`         | Python (jieba)         | `nlp_kernal.tokenize`                                           | `nlp_panel.svelte`                         | 🔤 Tokens                                                                                  |
| `nlp_py_keywords`         | Python (jieba+freq)    | `nlp_kernal.extract_keywords`                                   | `nlp_panel.svelte`                         | 🔑 Keywords (Python/jieba)                                                                 |
| `nlp_py_sentiment`        | Python (词典)          | `nlp_kernal.analyze_sentiment`                                  | `nlp_panel.svelte`                         | 🎭 Sentiment Analysis                                                                      |
| `nlp_py_entities`         | Python (regex)         | `nlp_kernal.extract_entities`                                   | `nlp_panel.svelte`                         | 🏢 Entities (EMAIL/URL/DATE)                                                               |
| `nlp_py_entities_ml`      | Python (StructBERT)    | `nlp_kernal.extract_entities_ml` → `ner.extractors.MLExtractor` | `nlp_panel.svelte`                         | 🤖 NER ML（按 `capabilities.ner_ml` 条件加载）                                             |
| `nlp_py_classify`         | Python (rule strategy) | `nlp_kernal.classify_text` → `classifier.TextClassifier`        | `nlp_panel.svelte`                         | 🏷️ Text Classification（按 `capabilities.classifier` 条件加载）                            |

**追踪机制**：所有 NLP 调用经过 `nlp_tracker.record()` 记录会话内调用次数，在 `modules_panel.svelte` 的 "📡 NLP Invocations (Session)" 显示。

---

## ❌ 未被调用（已存在 Python 实现，但未通过前端触发）

`nlp_kernal/` Python 包共 12 个子模块、约 155 个文件，目前仅顶层 `__init__.py` 暴露的 7 个函数被桥接到 Rust。以下子模块/能力**完全没有被前端调用过**：

### 1. `bow/` — Bag-of-Words & TF-IDF

- `bow.builder` / `bow.text_repr` / `bow.nlp_tools`
- 提供 TF-IDF 向量化、文档相似度、SQLite 持久化
- **潜在用途**：笔记之间的语义相似度搜索、相关笔记推荐

### 2. `ner/` — 知识图谱（除 ML 实体提取外）

- `ner.graph.builder` / `ner.graph.query` / `ner.graph.store` — 知识图谱构建与查询
- `ner.linker.entity_linker` — 实体消歧/链接
- `ner.reasoning.reasoner` — 基于图谱的推理
- `ner.indexer.cooccurrence` / `inverted_index` / `entity_counter` — 共现与倒排索引
- `ner.scanner` (`scan_all`, `scan_database`) — 全库扫描
- `ner.deep.*` — 深度 NER 模型训练流水线
- `ner.extractors.relation_extractor` / `llm_extractor` — 关系抽取/LLM 抽取
- **潜在用途**：跨笔记知识图谱、概念关联、自动标签

### 3. `classifier/` — 高级分类策略

- 仅 `strategy="rule"` 在用；`textcnn` / `bert` / `hybrid` 策略**未启用**
- **潜在用途**：根据内容自动分类笔记到标签或文件夹

### 4. `sentiment/` — 高级情感分析

- 当前仅用 `__init__.py` 中基于词典的实现
- `sentiment.analyzer`（含 LLM/BERT 微调路径）**未启用**
- **潜在用途**：日记/会议笔记的情绪追踪、月度情感趋势

### 5. `augmentation/` — 数据增强

- `augmentation.augmenter` (synonym replacement, back translation, EDA)
- **未被调用** — 当前没有训练流程

### 6. `annotation/` — 标注存储

- `annotation.store`
- **未被调用** — 没有提供标注 UI

### 7. `email_parser/` — 邮件解析

- 完整的邮件线程解析、签名/转发/引用识别、多意图拆分、摘要
- 含独立 GUI (`email_parser_gui.py`)
- **未被集成到主应用** — 似乎是独立工具

### 8. `thread_builder/` — 三层级联线程重建

- 规则 → 本地 LLM → 云端 LLM 的级联策略，含熔断器、自适应阈值
- **未被调用** — 设计用于会话/邮件线程重建

### 9. `self_learning/` — 自进化引擎

- 银标挖掘、知识蒸馏、增量 LoRA、RLHF、超参优化
- **未被调用** — 完整的训练基础设施未启用

### 10. `production/` — 生产化工具链

- A/B 测试、API gateway、监控、模型热切换
- **未被调用** — 桌面应用场景下无生产服务

### 11. `vllm_manager/` — vLLM 模型服务

- 本地 LLM 推理服务管理
- **未被调用**

---

## 接入率统计

| 维度                                         | 已接入                                                                      | 总数 | 覆盖率   |
| -------------------------------------------- | --------------------------------------------------------------------------- | ---- | -------- |
| 顶层 Python 函数（`nlp_kernal/__init__.py`） | 7                                                                           | 7    | **100%** |
| Python 子包（`nlp_kernal/*/`）               | 2 部分(`ner.extractors.MLExtractor`、`classifier.TextClassifier` rule 模式) | 12   | **~17%** |
| Tauri 命令                                   | 9                                                                           | 9    | **100%** |

**结论**：前端到 Python 的桥接已完成顶层 5 个核心 NLP 函数 + 2 个增强函数（共 7 个），覆盖了 `__init__.py` 暴露的全部能力。但 `nlp_kernal/` 包内还有约 10 个完整的子系统（知识图谱、自学习、邮件解析、生产化工具链等）尚未在 UI 中暴露入口，处于"代码已就绪但未被使用"的状态。

---

## 后续接入建议（按优先级）

1. **🥇 BoW 相似笔记推荐** — 集成 `bow.text_repr` + TF-IDF，为侧边栏增加"相关笔记"。已有 SQLite 存储基础。
2. **🥈 知识图谱视图** — 暴露 `ner.scanner.scan_all` + `ner.graph` 构建全 vault 实体图谱；新增 `KnowledgeGraphPanel`。
3. **🥉 关系抽取** — 接入 `ner.extractors.relation_extractor`，丰富 NER 结果。
4. **分类器升级** — 让 `nlp_py_classify` 支持 `strategy` 参数（rule/textcnn/bert），并在 UI 提供切换。
5. **情感时间序列** — 基于 `nlp_py_sentiment` 的历史结果聚合，画情感趋势图。
6. **邮件解析独立功能** — 评估是否将 `email_parser` 集成为 vault 内邮件笔记的特殊处理器。
7. **`self_learning` / `production` / `vllm_manager`** — 桌面应用场景需求度低，建议保留代码但暂不接入 UI；或拆分到独立 CLI/服务进程。
