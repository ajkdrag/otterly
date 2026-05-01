# 📚 LLM Wiki — 基于 LLM 的持久化知识 Wiki 引擎

> **版本**: v1.0 Draft  
> **日期**: 2026-05-02  
> **灵感来源**: [Andrej Karpathy — LLM Wiki Pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)  
> **定位**: LeapGrowNotes 的核心知识编译层 —— 让 LLM 从原始笔记中增量构建、维护一个持久化的结构化 Wiki  
> **模块路径**: `src/lib/features/wiki/` (前端) · `src-tauri/src/features/wiki/` (后端)

---

## 一、核心理念

### 1.1 问题：传统 RAG 的局限

当前主流的 LLM + 文档方案（RAG）工作流程是：**上传文档 → 切片 → Embedding → 向量检索 → 生成回答**。每次提问都从零开始检索和拼凑，知识不会积累：

| 问题 | 说明 |
|------|------|
| **无积累** | 每次查询都重新发现知识，没有编译过程 |
| **无交叉引用** | 跨文档的关联需要每次重新推理 |
| **无矛盾检测** | 新旧信息冲突不会被标记 |
| **无综合** | 问一个需要综合 5 篇笔记的问题，LLM 每次都要重新拼凑 |

### 1.2 解决方案：LLM Wiki 模式

LLM Wiki 的核心差异：**LLM 不只是检索，而是增量构建并维护一个持久化 Wiki**。

```
传统 RAG:    用户 ──→ [检索] ──→ [生成] ──→ 答案（一次性）
LLM Wiki:    用户 ──→ [Wiki] ──→ 答案（Wiki 是持久的、不断增长的）
                        ↑
                   LLM 增量维护
```

Wiki 是一个 **持久的、复利增长的知识制品**：
- 交叉引用已预先建立
- 矛盾已被标记
- 综合反映了所有已处理的源材料
- 每添加一个新源、每问一个新问题，Wiki 都会变得更丰富

### 1.3 与 LeapGrowNotes 的天然契合

LeapGrowNotes 已经是一个本地优先的 Markdown 知识库，具备：

| 已有能力 | LLM Wiki 需要 | 契合度 |
|----------|---------------|--------|
| ✅ Markdown 文件系统存储 | Markdown Wiki 页面 | ⭐⭐⭐⭐⭐ |
| ✅ `[[wikilink]]` + Backlinks | 交叉引用系统 | ⭐⭐⭐⭐⭐ |
| ✅ FTS5 全文搜索 | Wiki 页面检索 | ⭐⭐⭐⭐⭐ |
| ✅ Git 版本控制 | Wiki 变更历史 | ⭐⭐⭐⭐⭐ |
| ✅ YAML frontmatter | Wiki 页面元数据 | ⭐⭐⭐⭐⭐ |
| ✅ NLP 分析模块 | 文本分析基础 | ⭐⭐⭐⭐ |
| 🔶 本地 LLM (11_LOCAL_LLM_NLU 规划中) | LLM 推理引擎 | ⭐⭐⭐⭐ |

**LeapGrowNotes 不需要从零构建 —— 它已经是一个 Wiki 基座，只需要加上 LLM 驱动的 Wiki 维护层。**

---

## 二、系统架构

### 2.1 三层架构

```
┌────────────────────────────────────────────────────────┐
│                    LeapGrowNotes                        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Layer 1: Raw Sources（原始源材料）               │  │
│  │  ── vault 中用户的原始笔记、文章、剪藏            │  │
│  │  ── 不可变，LLM 只读不写                          │  │
│  │  ── 路径: {vault}/notes/                           │  │
│  └────────────────────┬─────────────────────────────┘  │
│                       │ LLM 读取                       │
│  ┌────────────────────▼─────────────────────────────┐  │
│  │  Layer 2: Wiki（LLM 生成的知识 Wiki）             │  │
│  │  ── LLM 完全拥有，自动创建/更新/维护              │  │
│  │  ── 结构化 Markdown: 实体页、概念页、摘要页       │  │
│  │  ── 交叉引用、矛盾标记、综合分析                  │  │
│  │  ── 路径: {vault}/.wiki/                           │  │
│  └────────────────────┬─────────────────────────────┘  │
│                       │ 遵循                           │
│  ┌────────────────────▼─────────────────────────────┐  │
│  │  Layer 3: Schema（Wiki 结构与规则定义）            │  │
│  │  ── 定义 Wiki 页面类型、命名规范、工作流           │  │
│  │  ── 用户与 LLM 共同演进                           │  │
│  │  ── 路径: {vault}/.wiki/_schema.md                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 2.2 Wiki 目录结构

```
{vault}/
├── notes/                        # Layer 1: 用户原始笔记（已有）
│   ├── 2026-05-01-meeting.md
│   ├── rust-async-notes.md
│   └── ...
│
└── .wiki/                        # Layer 2: LLM 生成的 Wiki
    ├── _schema.md                # Layer 3: Wiki 结构定义
    ├── _index.md                 # 全局索引（按分类）
    ├── _log.md                   # 操作日志（时间线）
    │
    ├── entities/                 # 实体页面
    │   ├── rust.md               # 编程语言: Rust
    │   ├── tokio.md              # 框架: Tokio
    │   └── ...
    │
    ├── concepts/                 # 概念页面
    │   ├── async-programming.md  # 概念: 异步编程
    │   ├── ownership.md          # 概念: 所有权模型
    │   └── ...
    │
    ├── sources/                  # 源摘要页面
    │   ├── s-2026-05-01-meeting.md
    │   ├── s-rust-async-notes.md
    │   └── ...
    │
    ├── analyses/                 # 分析/综合页面
    │   ├── comparison-rust-vs-go.md
    │   ├── synthesis-async-patterns.md
    │   └── ...
    │
    └── assets/                   # Wiki 引用的图片等资源
        └── ...
```

### 2.3 与现有架构的集成

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (Svelte 5)                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ Wiki 浏览 │  │ Ingest UI│  │  Wiki 查询/对话面板    │ │
│  │  面板     │  │  引导    │  │  (Query + Lint)        │ │
│  └─────┬────┘  └─────┬────┘  └──────────┬─────────────┘ │
│        │             │                   │               │
│  ┌─────▼─────────────▼───────────────────▼─────────────┐ │
│  │              wiki.service.ts                         │ │
│  │  ingest() · query() · lint() · getIndex()           │ │
│  └───────────────────┬─────────────────────────────────┘ │
│                      │ Tauri IPC                         │
│  ┌───────────────────▼─────────────────────────────────┐ │
│  │              wiki/commands.rs (Tauri 命令)           │ │
│  │  wiki_ingest · wiki_query · wiki_lint               │ │
│  │  wiki_get_index · wiki_get_page · wiki_get_log      │ │
│  │  wiki_search · wiki_init · wiki_get_stats           │ │
│  └───────────────────┬─────────────────────────────────┘ │
│                      │                                   │
│  ┌───────────────────▼─────────────────────────────────┐ │
│  │              wiki/engine.rs (Wiki 核心引擎)          │ │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Ingestor   │  │ Querier    │  │ Linter       │  │ │
│  │  │ (源→Wiki)  │  │ (查询回答) │  │ (健康检查)   │  │ │
│  │  └──────┬─────┘  └──────┬─────┘  └──────┬───────┘  │ │
│  │         │               │               │          │ │
│  │  ┌──────▼───────────────▼───────────────▼───────┐  │ │
│  │  │          LLM Engine (llama-cpp-rs)            │  │ │
│  │  │          ← 复用 11_LOCAL_LLM_NLU 模块 →      │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 三、核心操作

### 3.1 Ingest（摄入）

用户添加新笔记或选择现有笔记进行摄入时，LLM 执行以下流程：

```
用户添加/选择源笔记
    │
    ▼
[1] LLM 读取源笔记全文
    │
    ▼
[2] LLM 与用户讨论要点（可选，可静默）
    │
    ▼
[3] 生成/更新 Wiki 页面：
    ├─ 创建源摘要页 → sources/s-{note_name}.md
    ├─ 更新/创建实体页 → entities/{entity}.md
    ├─ 更新/创建概念页 → concepts/{concept}.md
    ├─ 标记矛盾（新信息 vs 旧信息）
    └─ 建立 [[wikilink]] 交叉引用
    │
    ▼
[4] 更新 _index.md（追加新页面条目）
    │
    ▼
[5] 追加 _log.md 日志条目
    │
    ▼
[6] 触发 Git 自动提交（复用现有 git_autocommit reactor）
```

**一次 Ingest 可能触达 10–15 个 Wiki 页面。**

#### Ingest 模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **交互式摄入** | LLM 读取后先展示要点，用户确认/引导后再写入 Wiki | 重要文档，需要人工把关 |
| **静默摄入** | LLM 自动完成全部流程，用户事后审阅 | 批量导入、日常笔记 |
| **批量摄入** | 一次选择多篇笔记，顺序处理 | 初始化 Wiki、大量剪藏 |

### 3.2 Query（查询）

用户对 Wiki 提问，LLM 基于已编译的 Wiki 回答：

```
用户提出问题
    │
    ▼
[1] LLM 读取 _index.md，定位相关 Wiki 页面
    │
    ▼
[2] LLM 读取相关页面内容
    │
    ▼
[3] LLM 综合回答（带 [[wikilink]] 引用）
    │
    ▼
[4] 用户决定是否将回答归档为新 Wiki 页面
    ├─ 是 → 存入 analyses/ 目录，更新 _index.md
    └─ 否 → 仅保留在对话历史
```

**关键洞察：好的回答可以被归档回 Wiki，成为新的知识页面。**

#### 查询输出格式

| 格式 | 说明 | 用途 |
|------|------|------|
| Markdown 页面 | 标准 Wiki 页面 | 分析、综合、比较 |
| 表格/对比 | Markdown 表格 | 概念对比、选型分析 |
| 列表/大纲 | 层级列表 | 知识梳理、学习路径 |
| Mermaid 图表 | 流程图/关系图 | 架构理解、流程梳理 |

### 3.3 Lint（健康检查）

定期让 LLM 对 Wiki 进行质量审计：

| 检查项 | 说明 |
|--------|------|
| **矛盾检测** | 不同页面之间的信息冲突 |
| **过时检测** | 被更新源材料取代的旧断言 |
| **孤儿页面** | 没有入站链接的页面 |
| **缺失页面** | 被提及但未创建的概念/实体 |
| **缺失交叉引用** | 应该互相链接但没有链接的页面 |
| **数据缺口** | 可以通过搜索填补的知识空白 |
| **建议新问题** | LLM 建议值得探索的新方向 |

Lint 结果以报告形式展示，用户可选择让 LLM 自动修复或手动处理。

---

## 四、特殊文件

### 4.1 _index.md — 内容索引

`_index.md` 是 Wiki 的目录，按分类组织所有页面：

```markdown
# Wiki Index

## Entities
- [[rust]] — Rust 编程语言 (sources: 12, updated: 2026-05-01)
- [[tokio]] — Rust 异步运行时 (sources: 5, updated: 2026-04-28)

## Concepts  
- [[async-programming]] — 异步编程模式 (sources: 8, updated: 2026-05-01)
- [[ownership]] — Rust 所有权与借用 (sources: 6, updated: 2026-04-30)

## Sources
- [[s-2026-05-01-meeting]] — 团队会议纪要 (ingested: 2026-05-01)
- [[s-rust-async-notes]] — Rust 异步编程学习笔记 (ingested: 2026-04-28)

## Analyses
- [[comparison-rust-vs-go]] — Rust vs Go 对比分析 (created: 2026-04-29)
```

**用途**：LLM 回答问题时，先读取 `_index.md` 定位相关页面，再深入阅读。在中等规模（~100 源，~数百页面）下，这种方式已经足够，无需 Embedding 检索。

### 4.2 _log.md — 操作日志

`_log.md` 是时间线记录，记录所有操作：

```markdown
# Wiki Log

## [2026-05-01T14:30] ingest | 团队会议纪要
- Source: notes/2026-05-01-meeting.md
- Created: sources/s-2026-05-01-meeting.md
- Updated: entities/rust.md, concepts/async-programming.md
- New pages: entities/tokio.md

## [2026-05-01T10:15] query | Rust 和 Go 的异步模型有什么区别？
- Referenced: entities/rust.md, concepts/async-programming.md
- Filed as: analyses/comparison-rust-vs-go.md

## [2026-04-30T20:00] lint | 周期性健康检查
- Orphan pages found: 2
- Missing cross-refs fixed: 5
- Contradictions flagged: 1
```

**设计技巧**：每条日志以 `## [ISO-8601] action | title` 格式开头，可用 `grep` 等工具快速过滤：

```bash
grep "^## \[" .wiki/_log.md | tail -5    # 最近 5 条操作
grep "ingest" .wiki/_log.md              # 所有摄入记录
```

### 4.3 _schema.md — Wiki 结构定义

`_schema.md` 定义 Wiki 的约定和规则，是 LLM 的"操作手册"：

```markdown
# Wiki Schema

## 页面类型
- **Entity**: 具体事物（人、工具、框架、语言）
- **Concept**: 抽象概念（设计模式、编程范式、理论）
- **Source**: 对一篇源笔记的摘要和要点提取
- **Analysis**: 对比、综合、深度分析

## Frontmatter 规范
每个 Wiki 页面必须包含：
- type: entity | concept | source | analysis
- sources: 引用的源笔记列表
- related: 相关 Wiki 页面列表
- created: 创建日期
- updated: 最后更新日期
- tags: 标签列表

## 命名规范
- 文件名使用 kebab-case
- Entity/Concept 使用名词: rust.md, async-programming.md
- Source 使用 s- 前缀: s-meeting-notes.md
- Analysis 使用描述性前缀: comparison-X-vs-Y.md, synthesis-X.md

## 交叉引用规范
- 使用 [[wikilink]] 链接相关页面
- 每个页面底部包含 "See Also" 部分
- 新信息与旧信息矛盾时，使用 > ⚠️ CONTRADICTION 标记

## Ingest 工作流
1. 读取源笔记
2. 创建 Source 摘要页
3. 提取实体和概念，更新/创建对应页面
4. 建立交叉引用
5. 更新 _index.md
6. 追加 _log.md
```

**Schema 是活文档**：用户和 LLM 在使用中共同演进它，根据领域和偏好调整规则。

---

## 五、Wiki 页面模板

### 5.1 Entity 页面

```markdown
---
type: entity
sources: ["rust-async-notes.md", "2026-05-01-meeting.md"]
related: ["async-programming", "tokio", "ownership"]
created: 2026-04-25
updated: 2026-05-01
tags: [programming-language, systems, rust]
---

# Rust

Rust 是一门系统编程语言，强调内存安全、并发安全和零成本抽象。

## 核心特性
- **所有权系统**: 编译期内存管理，无 GC → [[ownership]]
- **类型系统**: 代数数据类型 + trait 系统
- **异步**: async/await + [[tokio]] 运行时 → [[async-programming]]

## 在笔记中的出现
- [[s-rust-async-notes]]: 深入讨论了 async/await 语法和 Pin/Unpin
- [[s-2026-05-01-meeting]]: 团队决定将核心服务迁移到 Rust

## See Also
- [[async-programming]] | [[tokio]] | [[ownership]]
```

### 5.2 Source 摘要页面

```markdown
---
type: source
original: "notes/rust-async-notes.md"
ingested: 2026-04-28
tags: [rust, async, learning-notes]
---

# Source: Rust 异步编程学习笔记

## 原始笔记
→ [[rust-async-notes]] (notes/rust-async-notes.md)

## 要点摘要
1. Rust 的 async/await 是零成本抽象，编译为状态机
2. Future trait 是惰性的，必须被 poll 才会执行
3. Pin 用于确保自引用结构不被移动
4. Tokio 是最成熟的异步运行时

## 关键信息
- Rust async 不需要垃圾回收器
- 与 Go goroutine 的区别：Rust 是 M:N 线程模型

## 触达的 Wiki 页面
- Updated: [[rust]], [[async-programming]]
- Created: [[tokio]]
```

---

## 六、后端模块设计

### 6.1 目录结构

```
src-tauri/src/features/wiki/
├── mod.rs                    # 模块注册
├── commands.rs               # Tauri 命令（9 个）
│   ├── wiki_init             # 初始化 Wiki 目录结构
│   ├── wiki_ingest           # 摄入源笔记
│   ├── wiki_query            # 查询 Wiki
│   ├── wiki_lint             # 健康检查
│   ├── wiki_get_index        # 获取索引内容
│   ├── wiki_get_page         # 获取指定页面
│   ├── wiki_get_log          # 获取操作日志
│   ├── wiki_search           # 搜索 Wiki 页面
│   └── wiki_get_stats        # Wiki 统计信息
├── engine.rs                 # Wiki 核心引擎
│   ├── WikiEngine            # 主引擎结构体
│   ├── ingest()              # 摄入流程编排
│   ├── query()               # 查询流程编排
│   └── lint()                # 健康检查编排
├── ingestor.rs               # 摄入逻辑
│   ├── read_source()         # 读取源笔记
│   ├── extract_entities()    # 提取实体
│   ├── extract_concepts()    # 提取概念
│   ├── generate_summary()    # 生成摘要页
│   ├── update_entity_page()  # 更新实体页
│   ├── update_concept_page() # 更新概念页
│   └── update_cross_refs()   # 更新交叉引用
├── querier.rs                # 查询逻辑
│   ├── find_relevant_pages() # 从 index 定位相关页面
│   ├── synthesize_answer()   # 综合回答
│   └── file_answer()         # 将回答归档为页面
├── linter.rs                 # 健康检查逻辑
│   ├── find_contradictions() # 矛盾检测
│   ├── find_orphans()        # 孤儿页面
│   ├── find_stale()          # 过时信息
│   └── suggest_improvements()# 改进建议
├── index.rs                  # 索引管理
│   ├── read_index()          # 读取索引
│   ├── update_index()        # 更新索引条目
│   └── rebuild_index()       # 重建全量索引
├── schema.rs                 # Schema 管理
│   ├── read_schema()         # 读取 schema
│   ├── get_default_schema()  # 默认 schema 模板
│   └── validate_page()       # 验证页面是否符合 schema
├── prompts.rs                # LLM Prompt 模板
│   ├── INGEST_PROMPT         # 摄入分析 prompt
│   ├── ENTITY_PROMPT         # 实体页生成 prompt
│   ├── CONCEPT_PROMPT        # 概念页生成 prompt
│   ├── QUERY_PROMPT          # 查询回答 prompt
│   ├── LINT_PROMPT           # 健康检查 prompt
│   └── SUMMARY_PROMPT        # 源摘要生成 prompt
└── types.rs                  # 类型定义
    ├── WikiPage               # Wiki 页面数据
    ├── IngestResult           # 摄入结果
    ├── QueryResult            # 查询结果
    ├── LintReport             # 健康检查报告
    ├── WikiStats              # 统计数据
    └── PageType               # 页面类型枚举
```

### 6.2 数据库扩展

在现有 SQLite 数据库中新增 Wiki 相关表：

```sql
-- Wiki 页面元数据（加速索引和搜索）
CREATE TABLE IF NOT EXISTS wiki_pages (
    path TEXT PRIMARY KEY,           -- .wiki/ 内的相对路径
    page_type TEXT NOT NULL,          -- entity | concept | source | analysis
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,       -- 用于变更检测
    source_count INTEGER DEFAULT 0,   -- 引用源数量
    inlink_count INTEGER DEFAULT 0,   -- 入站链接数
    outlink_count INTEGER DEFAULT 0,  -- 出站链接数
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Wiki 操作日志（结构化存储，_log.md 的补充）
CREATE TABLE IF NOT EXISTS wiki_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,             -- ingest | query | lint | update
    title TEXT NOT NULL,
    details TEXT,                      -- JSON: 受影响页面列表等
    created_at INTEGER NOT NULL
);

-- Wiki 页面关系（用于图谱可视化）
CREATE TABLE IF NOT EXISTS wiki_links (
    from_page TEXT NOT NULL,
    to_page TEXT NOT NULL,
    link_type TEXT DEFAULT 'reference', -- reference | contradiction | supports
    PRIMARY KEY (from_page, to_page)
);

-- Wiki 页面 FTS 索引（复用 FTS5 基础设施）
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
    path,
    title,
    content,
    tokenize='trigram'
);
```

---

## 七、前端模块设计

### 7.1 前端目录结构

```
src/lib/features/wiki/
├── ports/
│   └── wiki.port.ts           # Wiki IO 接口
├── adapters/
│   └── wiki.adapter.ts        # Tauri IPC 适配
├── stores/
│   └── wiki.store.svelte.ts   # Wiki 状态管理
├── services/
│   └── wiki.service.ts        # Wiki 业务逻辑
├── types/
│   └── wiki.types.ts          # 类型定义
└── components/
    ├── WikiPanel.svelte        # Wiki 主面板（侧边栏）
    ├── WikiBrowser.svelte      # Wiki 页面浏览器
    ├── WikiIngest.svelte       # 摄入引导 UI
    ├── WikiQuery.svelte        # 查询对话面板
    ├── WikiLintReport.svelte   # 健康检查报告
    ├── WikiIndex.svelte        # 索引/目录视图
    ├── WikiGraph.svelte        # Wiki 关系图谱（力导向图）
    └── WikiStats.svelte        # Wiki 统计仪表盘
```

### 7.2 Store 设计

```typescript
// wiki.store.svelte.ts
class WikiStore {
    // 状态
    initialized = $state(false);        // Wiki 是否已初始化
    currentPage = $state<WikiPage | null>(null);  // 当前查看的页面
    index = $state<IndexEntry[]>([]);    // 索引条目
    stats = $state<WikiStats | null>(null);
    
    // 摄入状态
    ingestingNote = $state<string | null>(null);   // 正在摄入的笔记路径
    ingestProgress = $state(0);                     // 摄入进度
    
    // 查询状态
    queryHistory = $state<QueryEntry[]>([]);        // 查询历史
    currentAnswer = $state<string | null>(null);    // 当前回答
    isQuerying = $state(false);
    
    // Lint 状态
    lastLintReport = $state<LintReport | null>(null);
}
```

### 7.3 UI 交互流程

#### 摄入流程

```
┌─────────────────────────────────────────┐
│  📄 当前笔记: rust-async-notes.md        │
│                                         │
│  [📥 Ingest to Wiki]   ← 笔记操作按钮   │
│                                         │
│  ─── 点击后 ──────────────────────────   │
│                                         │
│  📋 摄入预览:                            │
│  ├── 将创建: entities/rust.md            │
│  ├── 将创建: entities/tokio.md           │
│  ├── 将更新: concepts/async-programming  │
│  └── 将创建: sources/s-rust-async-notes  │
│                                         │
│  [✅ 确认摄入]  [⚙️ 调整]  [❌ 取消]     │
│                                         │
│  ─── 摄入中 ──────────────────────────   │
│                                         │
│  ⏳ 处理中... (3/5 页面已更新)           │
│  ████████████░░░░  60%                  │
│                                         │
│  ─── 完成 ────────────────────────────   │
│                                         │
│  ✅ 摄入完成！                           │
│  • 创建了 3 个新页面                     │
│  • 更新了 2 个现有页面                   │
│  • 添加了 7 个交叉引用                   │
│  [查看 Wiki] [查看日志]                  │
└─────────────────────────────────────────┘
```

#### Wiki 浏览器

```
┌─────────────────────────────────────────┐
│  📚 Wiki Browser                        │
│                                         │
│  🔍 搜索 Wiki...                        │
│                                         │
│  📂 Entities (24)                       │
│    📄 rust          12 sources  ★       │
│    📄 tokio          5 sources          │
│    📄 svelte         8 sources          │
│                                         │
│  📂 Concepts (18)                       │
│    📄 async-programming  8 sources      │
│    📄 ownership          6 sources      │
│                                         │
│  📂 Sources (45)                        │
│    📄 s-2026-05-01-meeting  May 1       │
│    📄 s-rust-async-notes   Apr 28       │
│                                         │
│  📂 Analyses (8)                        │
│    📄 comparison-rust-vs-go  Apr 29     │
│                                         │
│  ──────────────────────────────         │
│  📊 Stats: 95 pages · 342 links         │
│  🕐 Last ingest: 2h ago                │
│  🔍 Last lint: 3d ago                  │
│  [🔄 Run Lint]                          │
└─────────────────────────────────────────┘
```

---

## 八、与现有系统联动

### 8.1 与积分系统联动

| 行为 | 积分 | 宠物经验 | 说明 |
|------|------|---------|------|
| 摄入一篇笔记到 Wiki | +5 pts | +5 exp | 鼓励知识积累 |
| 对 Wiki 提问 | +2 pts | +2 exp | 鼓励探索 |
| 将查询回答归档为页面 | +3 pts | +3 exp | 知识复利 |
| 运行 Lint 检查 | +2 pts | +2 exp | 维护知识健康 |
| Wiki 页面达到 50 页 | 🏆 成就徽章 | +20 exp | 里程碑 |
| Wiki 页面达到 100 页 | 🏆 成就徽章 | +50 exp | 里程碑 |

### 8.2 与搜索系统联动

- Omnibar 新增 Wiki 搜索模式（`#wiki` 前缀触发）
- Wiki 页面纳入 FTS5 索引，与笔记搜索并行
- 搜索结果中 Wiki 页面有特殊标记 `📚`

### 8.3 与 Git 联动

- Wiki 变更自动触发 Git 提交（复用 `git_autocommit` reactor）
- 提交信息格式：`[wiki] ingest: {source_name}` / `[wiki] query: {question}`
- Wiki 有完整的 Git 版本历史，可回溯任意状态

### 8.4 与 Wikilink 系统联动

- Wiki 页面的 `[[wikilink]]` 与笔记的 wikilink 使用同一解析器
- Wiki 页面可以链接到原始笔记，原始笔记也可以链接到 Wiki 页面
- Backlinks 面板显示来自 Wiki 的引用

### 8.5 与 NLP 模块联动

- 摄入时复用现有 NLP 模块进行初步分析（关键词、NER、情感）
- NLP 提取的实体/关键词作为 LLM 摄入的辅助输入
- Wiki 页面自动获得 NLP 分析数据（词频、复杂度等）

---

## 九、LLM 依赖与 Prompt 策略

### 9.1 LLM 引擎复用

Wiki 模块 **完全复用** `11_LOCAL_LLM_NLU` 设计的 LLM 引擎：

| 组件 | 复用方式 |
|------|---------|
| `llama-cpp-rs` 推理引擎 | 共享同一实例 |
| `ModelManager` | 共享模型管理 |
| Qwen2.5-1.5B 模型 | 同一模型文件 |
| Metal GPU 加速 | 同一加速路径 |
| 缓存策略 | 共享缓存表 |

### 9.2 Prompt 策略

Wiki 操作使用更复杂的多步 Prompt，核心原则：

| 原则 | 说明 |
|------|------|
| **结构化输出** | 要求 LLM 以 JSON 输出页面更新计划，再逐步执行 |
| **上下文注入** | 每次操作注入 schema + index，让 LLM 了解现有 Wiki 结构 |
| **增量更新** | 提供现有页面内容，要求 LLM 输出 diff 而非全文重写 |
| **交叉引用意识** | Prompt 中强调建立 `[[wikilink]]` 连接 |
| **矛盾标记** | 明确要求 LLM 检测并标记与现有信息的冲突 |

### 9.3 Ingest Prompt 示例

```
<|im_start|>system
你是一个知识 Wiki 维护者。你的任务是将一篇源笔记整合进现有的知识 Wiki。

当前 Wiki 结构定义：
{schema_content}

当前 Wiki 索引：
{index_content}

工作流程：
1. 分析源笔记，提取关键实体、概念和信息
2. 确定需要创建或更新的 Wiki 页面
3. 输出 JSON 格式的更新计划

输出格式：
{
  "summary": "源笔记的核心摘要（2-3句）",
  "entities": [{"name": "xxx", "action": "create|update", "key_info": "..."}],
  "concepts": [{"name": "xxx", "action": "create|update", "key_info": "..."}],
  "contradictions": [{"page": "xxx", "old_claim": "...", "new_claim": "..."}],
  "cross_references": [{"from": "xxx", "to": "yyy", "relation": "..."}]
}
<|im_end|>
<|im_start|>user
请分析以下笔记并生成 Wiki 更新计划：

{note_content}
<|im_end|>
<|im_start|>assistant
```

---

## 十、性能与规模考量

### 10.1 规模预估

| 规模 | 源笔记数 | Wiki 页面数 | 索引策略 | 预计可行性 |
|------|---------|-----------|---------|-----------|
| 小型 | < 50 | ~100 | `_index.md` 足够 | ✅ 完全可行 |
| 中型 | 50–200 | 100–500 | `_index.md` + FTS5 | ✅ 可行 |
| 大型 | 200–500 | 500–1500 | FTS5 + 语义搜索 | 🔶 需要 Embedding |
| 超大型 | 500+ | 1500+ | 专用搜索引擎 | ⚠️ 需要 qmd 等工具 |

### 10.2 性能预算

| 操作 | 目标延迟 | 说明 |
|------|---------|------|
| 单篇 Ingest | < 30s | 含 LLM 推理 + 文件写入 |
| Wiki Query | < 10s | 含索引检索 + LLM 回答生成 |
| Lint 检查 | < 60s | 全量扫描 + LLM 分析 |
| 索引检索 | < 100ms | FTS5 查询 |
| Wiki 页面读取 | < 50ms | 文件系统读取 |

### 10.3 内存策略

| 组件 | 内存占用 | 说明 |
|------|---------|------|
| LLM 模型（共享） | ~1.0GB | Qwen2.5-1.5B Q4_K_M |
| Wiki 索引（内存） | < 10MB | _index.md 解析缓存 |
| FTS5 索引 | < 50MB | SQLite 管理 |
| 总增量 | ~0MB | LLM 已在 11_LOCAL_LLM_NLU 中计入 |

---

## 十一、开发计划

### Phase 0：Wiki 基础设施（2 天）

> **前置条件**：`11_LOCAL_LLM_NLU` Phase 1 完成（LLM 推理引擎可用）

- [ ] Wiki 目录结构定义与初始化逻辑 (`wiki_init`)
- [ ] Schema 默认模板与读取 (`schema.rs`)
- [ ] Index 读取与更新逻辑 (`index.rs`)
- [ ] Log 追加逻辑
- [ ] Wiki 页面 CRUD（读/写/删除 Markdown 文件）
- [ ] SQLite 表创建与基本 CRUD (`wiki_pages`, `wiki_log`, `wiki_links`)
- [ ] 类型定义 (`types.rs`)

### Phase 1：Ingest 核心流程（3 天）

- [ ] Ingest Prompt 模板设计与调优
- [ ] 源笔记分析 → 实体/概念提取（LLM 调用）
- [ ] Source 摘要页自动生成
- [ ] Entity/Concept 页面自动创建
- [ ] Entity/Concept 页面增量更新（已有页面合并新信息）
- [ ] 交叉引用自动建立 (`[[wikilink]]`)
- [ ] Index/Log 自动更新
- [ ] `wiki_ingest` Tauri 命令注册
- [ ] Ingest 单元测试

### Phase 2：Query 与前端基础（3 天）

- [ ] Query Prompt 模板设计
- [ ] 基于 _index.md 的页面定位逻辑
- [ ] 多页面内容综合回答生成
- [ ] 回答归档为 Wiki 页面
- [ ] `wiki_query` Tauri 命令
- [ ] 前端 WikiPanel + WikiBrowser 组件
- [ ] 前端 WikiIngest 引导 UI
- [ ] 前端 WikiQuery 对话面板
- [ ] wiki.port / wiki.adapter / wiki.store / wiki.service 搭建

### Phase 3：Lint 与搜索集成（2 天）

- [ ] Lint Prompt 模板设计
- [ ] 矛盾检测 + 孤儿页面 + 过时信息检查
- [ ] LintReport UI 展示
- [ ] Wiki FTS5 索引集成
- [ ] Omnibar Wiki 搜索模式 (`#wiki`)
- [ ] `wiki_lint` / `wiki_search` Tauri 命令

### Phase 4：系统联动与打磨（2 天）

- [ ] 积分系统联动（摄入/查询/归档/Lint 积分奖励）
- [ ] 宠物系统联动（经验值映射）
- [ ] Git 自动提交联动（`[wiki]` 前缀）
- [ ] Backlinks 系统联动（Wiki 页面 ↔ 笔记）
- [ ] Wiki 关系图谱组件 (`WikiGraph.svelte`)
- [ ] Wiki 统计仪表盘 (`WikiStats.svelte`)
- [ ] 批量摄入支持

### Phase 5：高级功能（可选，2 天）

- [ ] Mermaid 图表输出支持
- [ ] Dataview 风格的动态查询（基于 frontmatter）
- [ ] Wiki 导出（静态站点 / PDF）
- [ ] Schema 编辑 UI
- [ ] 多 Wiki 支持（一个 vault 可以有多个主题 Wiki）
- [ ] 语义搜索集成（复用 Embedding 模块）

**总计：~12 天**（Phase 0–4），Phase 5 为可选增强。

---

## 十二、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| LLM 推理引擎未就绪 | Wiki 模块无法工作 | 中 | Phase 0 依赖 11_LOCAL_LLM_NLU Phase 1；可先用 Mock LLM 开发 |
| 小模型(1.5B)摄入质量不足 | 实体/概念提取不准确 | 中 | 多步 Prompt 分解任务；交互式摄入让用户校正；支持 3B 模型 |
| Wiki 页面冲突/损坏 | 数据丢失 | 低 | Git 版本控制；每次操作前自动备份；Schema 验证 |
| 大量摄入导致 Wiki 膨胀 | 性能下降 | 低 | 分级索引策略；定期 Lint 清理；FTS5 索引 |
| 用户不理解 Wiki 概念 | 功能闲置 | 中 | 简化 UI；提供引导教程；默认静默模式降低门槛 |
| Prompt 注入/幻觉 | Wiki 内容不可靠 | 中 | 源笔记引用必须真实存在；Lint 检查交叉验证 |

---

## 十三、与 Karpathy LLM Wiki 原始设计的差异

| 方面 | Karpathy 原始设计 | LeapGrowNotes 实现 |
|------|-------------------|-------------------|
| LLM 交互方式 | 外部 CLI Agent (Claude Code / Codex) | 内嵌本地 LLM (llama-cpp-rs) |
| Wiki 浏览 | Obsidian（外部应用） | 内置 Wiki 浏览器组件 |
| 搜索 | qmd 或手动索引 | 复用 FTS5 + 可选 Embedding |
| 版本控制 | 手动 Git | 自动 Git 提交 (reactor) |
| 用户交互 | 纯命令行对话 | GUI：面板 + 按钮 + 图谱 |
| 积分激励 | 无 | 与积分/宠物系统联动 |
| 源格式 | 任意文件 | Markdown 笔记（vault 内） |
| 部署 | 需要 API Key 或外部 LLM | 完全本地，无需网络 |

---

> 📌 **下一步行动**：  
> 1. 完成 `11_LOCAL_LLM_NLU` Phase 1（LLM 推理引擎集成）  
> 2. 从 Phase 0 开始搭建 Wiki 基础设施  
> 3. 实现 Ingest 核心流程，用真实笔记验证 Wiki 生成质量
