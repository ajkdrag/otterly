# LeapGrowNotes — 本地知识库 Blueprint

> 本地优先、非 RAG、支持 LLM、多设备同步的个人知识库系统

---

## 1. 项目愿景

构建一个 **本地优先（local-first）** 的个人知识库，原生支持 Markdown、代码文件和纯文本。通过 **非 RAG** 的方式（全量上下文注入 / 结构化摘要 / 滑动窗口）将知识提供给大语言模型，同时支持多设备间的数据同步。

---

## 2. 核心需求

| 需求         | 说明                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| 文件格式支持 | `.md`、各类代码文件（`.py`, `.js`, `.ts`, `.go` 等）、`.txt`           |
| 非 RAG 检索  | 不使用向量数据库 + embedding 检索，而是采用全文搜索 + 结构化上下文注入 |
| LLM 集成     | 支持调用云端 API（OpenAI / Claude / DeepSeek）和本地模型（Ollama）     |
| 多设备同步   | 笔记数据在多台设备间实时或近实时同步                                   |
| 本地优先     | 所有数据存储在本地，离线可用                                           |

---

## 3. 系统架构总览

```
┌─────────────────────────────────────────────────┐
│                   客户端 (Desktop / Web)         │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  编辑器    │  │  搜索 UI  │  │  LLM 对话   │  │
│  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  │
│        │              │               │          │
│  ┌─────▼──────────────▼───────────────▼──────┐   │
│  │              应用核心层                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │   │
│  │  │ 文件管理  │ │ 全文索引  │ │ LLM 适配器 │ │   │
│  │  └────┬─────┘ └────┬─────┘ └─────┬──────┘ │   │
│  └───────┼────────────┼─────────────┼────────┘   │
│          │            │             │            │
│  ┌───────▼────────────▼─────────────▼────────┐   │
│  │              数据层                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │   │
│  │  │ 文件系统  │ │ SQLite   │ │ 同步引擎   │ │   │
│  │  └──────────┘ └──────────┘ └────────────┘ │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 4. 模块设计

### 4.1 存储层

**方案：文件系统 + SQLite 元数据库**

- **文件系统**：知识内容以原始文件形式存储在本地目录（`~/LeapGrowNotes/vault/`）
  - 保持文件原始格式，便于用其他编辑器直接访问
  - 目录结构即分类结构
- **SQLite**：存储元数据与全文索引
  - 文件路径、标题、标签、创建/修改时间
  - FTS5 全文搜索索引
  - 文件内容的结构化摘要缓存

```
vault/
├── projects/
│   ├── web-app/
│   │   ├── README.md
│   │   └── api-design.md
│   └── ml-pipeline/
│       ├── train.py
│       └── notes.txt
├── learning/
│   ├── rust-notes.md
│   └── algorithms.md
└── journal/
    └── 2026-04-30.md
```

### 4.2 索引与检索（非 RAG）

**核心理念：不使用向量嵌入，而是基于结构化索引 + 智能上下文组装**

#### 4.2.1 全文搜索

- 使用 SQLite FTS5 实现全文检索
- 支持中文分词（jieba / 简单字符 n-gram）
- 支持模糊匹配、前缀匹配、布尔查询

#### 4.2.2 结构化索引

- **标签系统**：文件头 frontmatter 中的 `tags` 字段
- **文件树索引**：基于目录路径的层级分类
- **链接图谱**：解析 `[[wikilink]]` 和 Markdown 链接，构建笔记间的关系图
- **代码索引**：提取函数名、类名、导出符号等结构信息

#### 4.2.3 智能上下文组装（替代 RAG 的核心）

当用户向 LLM 提问时，系统通过以下策略组装上下文：

1. **关键词匹配**：FTS5 搜索相关文档片段
2. **路径相关性**：同目录/同项目的文件优先
3. **链接关联**：通过 wikilink 图谱找到关联笔记
4. **时间衰减**：最近编辑的文件权重更高
5. **Token 预算管理**：根据模型上下文窗口大小，智能裁剪和排列上下文

```
用户提问 → 关键词提取 → 多维度检索 → 评分排序 → Token 预算裁剪 → 组装 Prompt → 发送 LLM
```

### 4.3 LLM 集成

**多后端适配器模式：**

| 后端          | 说明                      |
| ------------- | ------------------------- |
| OpenAI API    | GPT-4o / GPT-4.1 等       |
| Anthropic API | Claude 4 / Sonnet         |
| DeepSeek API  | DeepSeek-V3 / R1          |
| Ollama (本地) | Qwen / Llama / Mistral 等 |

#### 上下文注入策略（非 RAG）

```
┌─────────────────────────────────────────┐
│              System Prompt              │
│  "你是一个知识库助手，以下是相关的笔记   │
│   内容，请基于这些内容回答问题。"        │
├─────────────────────────────────────────┤
│           注入的知识上下文               │
│  [文件1: path/to/note.md]              │
│  内容...                                │
│  [文件2: path/to/code.py]              │
│  内容...                                │
├─────────────────────────────────────────┤
│            用户提问                      │
└─────────────────────────────────────────┘
```

**三种上下文模式：**

1. **全量注入**：小型知识库（< 50K tokens），直接全部注入
2. **滑动窗口**：中型知识库，按相关性评分选取 top-N 文档，填满 token 预算
3. **摘要 + 详情**：大型知识库，先注入所有文件的摘要，再注入最相关文件的全文

### 4.4 多设备同步

**推荐方案：Git-based 同步 + 可选云同步**

#### 方案 A：Git 同步（推荐）

- vault 目录本身就是一个 Git 仓库
- 自动 commit + push/pull（定时或文件变更触发）
- 使用 GitHub / GitLab / Gitea 作为远端
- 优点：版本历史、冲突处理成熟、免费
- 冲突解决：文本文件天然适合 Git 三路合并

#### 方案 B：文件同步服务

- Syncthing（开源、P2P、无需服务器）
- iCloud Drive / Dropbox / OneDrive
- 适合不熟悉 Git 的用户

#### 方案 C：自建同步（进阶）

- 使用 CRDTs（如 Automerge / Yjs）实现无冲突合并
- 需要自建中继服务器或使用 WebRTC P2P
- 复杂度高，但体验最好

**推荐默认方案：方案 A（Git）+ 方案 B（Syncthing）作为可选后备。**

### 4.5 前端 / 用户界面

**技术栈：Tauri 2 (Rust + Web)**

- **桌面端**：Tauri 2 打包，支持 macOS / Windows / Linux
- **Web 端**：可选的浏览器访问模式（本地起 HTTP 服务）
- **编辑器**：基于 CodeMirror 6 或 Milkdown
  - Markdown 实时预览
  - 代码文件语法高亮
  - 文件树侧栏
- **搜索面板**：全文搜索 + 标签过滤 + 文件类型过滤
- **LLM 对话面板**：侧边栏对话，支持引用当前文件 / 选中文本

---

## 5. 技术栈总结

| 层级     | 技术选型                                |
| -------- | --------------------------------------- |
| 前端框架 | React / Solid.js + TypeScript           |
| 桌面打包 | Tauri 2                                 |
| 后端核心 | Rust（文件操作、索引、同步） 或 Node.js |
| 数据库   | SQLite（better-sqlite3 / rusqlite）     |
| 全文搜索 | SQLite FTS5                             |
| 编辑器   | CodeMirror 6 / Milkdown                 |
| LLM 通信 | REST API（OpenAI 兼容格式）             |
| 本地模型 | Ollama                                  |
| 同步     | Git (isomorphic-git) / Syncthing        |
| 中文分词 | jieba-rs / 字符 n-gram                  |

---

## 6. 项目目录结构

```
LeapGrowNotes/
├── src-tauri/           # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── indexer.rs   # 文件索引与 FTS
│   │   ├── llm.rs       # LLM 适配器
│   │   ├── sync.rs      # 同步引擎
│   │   └── vault.rs     # 文件管理
│   └── Cargo.toml
├── src/                 # Web 前端
│   ├── components/
│   │   ├── Editor.tsx
│   │   ├── FileTree.tsx
│   │   ├── SearchPanel.tsx
│   │   └── ChatPanel.tsx
│   ├── lib/
│   │   ├── indexer.ts
│   │   ├── llm-client.ts
│   │   └── sync.ts
│   ├── App.tsx
│   └── main.tsx
├── vault/               # 用户知识库（默认位置）
├── BLUEPRINT.md         # 本文件
├── package.json
└── README.md
```

---

## 7. 开发阶段规划

### Phase 1：MVP（4 周）

- [ ] 项目脚手架搭建（Tauri 2 + React + TypeScript）
- [ ] 文件系统读写与目录树展示
- [ ] Markdown 编辑器（CodeMirror 6）
- [ ] SQLite 元数据库 + FTS5 全文搜索
- [ ] 基础搜索 UI

### Phase 2：LLM 集成（2 周）

- [ ] LLM 适配器（OpenAI / Anthropic / Ollama）
- [ ] 上下文组装引擎（关键词匹配 + 路径关联 + token 预算）
- [ ] 对话面板 UI
- [ ] 流式输出支持

### Phase 3：同步与多设备（2 周）

- [ ] Git-based 自动同步
- [ ] 冲突检测与解决 UI
- [ ] 同步状态指示器
- [ ] 可选 Syncthing 集成指南

### Phase 4：增强功能（持续）

- [ ] Wikilink 支持与笔记图谱可视化
- [ ] 代码文件结构化索引（函数、类提取）
- [ ] 标签管理系统
- [ ] 多语言分词优化
- [ ] 插件系统（可选）
- [ ] 移动端适配（Tauri 2 移动端支持）

---

## 8. 关键设计决策记录

### 为什么选择非 RAG？

| RAG 方案                   | 本项目方案（非 RAG）         |
| -------------------------- | ---------------------------- |
| 需要向量数据库             | 仅需 SQLite                  |
| Embedding 计算开销大       | 轻量级全文索引               |
| 语义搜索可能召回不相关内容 | 精确关键词 + 结构化关联      |
| 黑盒召回过程               | 透明的上下文组装逻辑         |
| 适合海量文档               | 适合个人级知识库（数千文件） |

**核心观点**：个人知识库通常在数百到数千文件的量级，完全在现代 LLM 的上下文窗口（128K-1M tokens）承受范围内。通过智能的上下文裁剪和组装，可以在不引入向量数据库复杂性的情况下，获得同样甚至更好的效果。

### 为什么选择 Tauri 而非 Electron？

- 打包体积小（~10MB vs ~150MB）
- 内存占用低
- Rust 后端性能优异，适合文件索引和搜索
- Tauri 2 支持移动端

---

## 9. 非功能性需求

- **启动时间** < 2 秒
- **搜索响应** < 200ms（万级文件）
- **离线完全可用**（LLM 需要 Ollama 或缓存）
- **数据隐私**：所有数据本地存储，LLM API 调用可配置为仅本地
- **跨平台**：macOS、Windows、Linux（桌面）；iOS、Android（未来）

---

## 10. 二次开发基座项目分析

### 候选项目对比

| 项目                                                     | Stars | 技术栈                  | 优势                                                           | 不足                                          |
| -------------------------------------------------------- | ----- | ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| **[otterly](https://github.com/ajkdrag/otterly)** ⭐推荐 | 133   | Tauri 2 + Svelte + Rust | 本地优先、全文搜索、Wiki-links、Git 感知、MIT 许可、跨平台发布 | 无 LLM 集成、仅支持 Markdown                  |
| [rhyolite](https://github.com/lockedmutex/rhyolite)      | 183   | 纯 Rust (Freya GUI)     | 纯 Rust 实现                                                   | 正在从 Tauri 迁移到 Freya，处于过渡期，不稳定 |
| [llm-wiki](https://github.com/foryoung365/llm-wiki)      | 0     | Rust                    | Markdown + YAML frontmatter + SQLite + LLM                     | 纯引擎无 UI，项目很新，无社区                 |
| [meld](https://github.com/kizz-tech/meld)                | 5     | Rust                    | AI agent + Obsidian 兼容                                       | 社区小                                        |
| [MarkFlowy](https://github.com/drl990114/MarkFlowy)      | 2304  | Tauri + TypeScript      | AI Markdown 编辑器、高 star                                    | Rust 部分较少，主要是 TypeScript              |

### ✅ 推荐基座：[Otterly](https://github.com/ajkdrag/otterly)

**选择理由：**

1. **架构完美匹配**：Tauri 2 + Svelte + Rust，与 BLUEPRINT 设计一致
2. **功能基础扎实**：全文搜索、Wiki-links、Backlinks、文件树、Omnibar、Git 感知
3. **MIT 许可证**：允许自由二次开发和商业使用
4. **活跃维护**：2026 年 4 月仍在更新，有跨平台发布版本
5. **社区认可**：133 stars, 8 forks，有一定用户基础

**Otterly 已有的功能（可直接复用）：**

- ✅ 本地优先 Markdown vault
- ✅ 全文搜索（Omnibar）
- ✅ `[[wiki-links]]` + Backlinks + Outlinks
- ✅ 文件树导航
- ✅ Git 感知状态
- ✅ Tauri 2 跨平台打包
- ✅ 主题系统（明/暗）
- ✅ 快捷键可自定义

**需要我们在二次开发中添加的功能：**

- 🔧 LLM 集成（对话面板 + 上下文组装引擎）
- 🔧 代码文件支持（.py, .js, .ts 等语法高亮与索引）
- 🔧 .txt 纯文本支持
- 🔧 Git 自动同步（auto commit + push/pull）
- 🔧 非 RAG 智能上下文注入
- 🔧 多 LLM 后端适配（OpenAI / Claude / DeepSeek / Ollama）
- 🔧 代码结构化索引（函数名、类名提取）

---

## 11. Fork 与二次开发步骤

### Step 1：Fork 并克隆

```bash
# 登录 GitHub CLI
gh auth login

# Fork otterly 到你的账号
gh repo fork ajkdrag/otterly --clone=false

# 克隆你的 fork 到本地
git clone https://github.com/<YOUR_USERNAME>/otterly.git /Users/mac/code/LeapGrowNotes
cd /Users/mac/code/LeapGrowNotes

# 添加上游远端
git remote add upstream https://github.com/ajkdrag/otterly.git
```

### Step 2：创建开发分支

```bash
git checkout -b feat/leapgrownotes-v1
```

### Step 3：二次开发优先级

| 优先级 | 功能                          | 预估工时 |
| ------ | ----------------------------- | -------- |
| P0     | 代码文件 + 纯文本支持         | 1 周     |
| P0     | LLM 适配器（OpenAI / Ollama） | 1 周     |
| P0     | 上下文组装引擎（非 RAG）      | 1.5 周   |
| P1     | LLM 对话面板 UI               | 1 周     |
| P1     | Git 自动同步                  | 1 周     |
| P2     | 多 LLM 后端切换 UI            | 0.5 周   |
| P2     | 代码结构化索引                | 1 周     |
| P3     | 笔记图谱可视化                | 1.5 周   |
