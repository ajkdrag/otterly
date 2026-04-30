# LeapGrowNotes — Gap 分析 & 开发计划

> Otterly 基座 vs BLUEPRINT 目标的差距分析与分阶段开发计划

---

## 1. Otterly 基座现有能力清单

### 1.1 后端（Rust / Tauri 2）

| 模块          | 能力          | 详情                                                                      |
| ------------- | ------------- | ------------------------------------------------------------------------- |
| vault         | 多 vault 管理 | 打开/列出/移除 vault，vault ID（blake3 hash），JSON 持久化                |
| notes         | 笔记 CRUD     | 创建/读取/保存/重命名/删除笔记和文件夹，拖拽移动，图片资产管理            |
| search        | 全文搜索      | SQLite FTS5 索引，link 解析，搜索建议，文件名+内容搜索                    |
| git           | Git 集成      | git init/status/commit/history/checkpoint/restore/diff（通过 git2 crate） |
| watcher       | 文件监视      | notify crate 实现实时文件变更检测                                         |
| settings      | 设置系统      | 全局设置 + 每 vault 设置（key-value 存储）                                |
| vault_session | 会话持久化    | 记住上次打开的 vault 和文件                                               |
| 资产服务      | 自定义协议    | `otterly-asset://` URI scheme 服务 vault 内图片                           |

**57 个 Tauri 命令已暴露**，功能成熟。

### 1.2 前端（SvelteKit + TypeScript + Svelte 5）

| 功能               | 详情                                                        |
| ------------------ | ----------------------------------------------------------- |
| 编辑器             | Milkdown（ProseMirror）+ CodeMirror 代码块 + Prism 语法高亮 |
| Wiki-links         | `[[wiki-links]]` 支持，自动补全建议                         |
| Backlinks/Outlinks | 当前笔记的反向链接和外向链接面板                            |
| 文件树             | 目录导航，文件夹折叠/展开，拖拽移动，作用域模式             |
| Omnibar            | 统一搜索（文件/内容/命令/设置）                             |
| Tab 系统           | 多标签页编辑                                                |
| 收藏               | 星标笔记快速访问                                            |
| Git UI             | 变更状态显示，提交历史，检查点/恢复                         |
| 主题               | 明/暗主题 + 自定义主题支持                                  |
| 快捷键             | 可重绑定的热键系统                                          |
| 面板布局           | Paneforge 可调整面板（文件树/编辑器/侧边栏）                |
| 状态栏             | 行/列/字数统计                                              |

### 1.3 依赖关键技术

| 层            | 技术                                      |
| ------------- | ----------------------------------------- |
| 前端框架      | SvelteKit + Svelte 5 (runes) + TypeScript |
| 编辑器        | Milkdown / ProseMirror + CodeMirror 6     |
| 桌面打包      | Tauri 2                                   |
| 数据库        | SQLite（rusqlite）+ FTS5                  |
| Git           | git2（Rust）+ isomorphic-git（JS）        |
| 文件监视      | notify                                    |
| Markdown 渲染 | comrak + syntect                          |
| 哈希          | blake3                                    |

---

## 2. Gap 对比矩阵

### 图例

- ✅ 已有，可直接复用
- 🔶 部分有，需扩展
- ❌ 完全缺失，需新建

| #                | BLUEPRINT 需求                      | Otterly 现状                                    | Gap 状态 | 差距说明                                                |
| ---------------- | ----------------------------------- | ----------------------------------------------- | -------- | ------------------------------------------------------- |
| **文件格式支持** |
| 1                | Markdown (.md)                      | Milkdown 编辑器，WYSIWYG                        | ✅       | 完全支持                                                |
| 2                | 代码文件 (.py/.js/.ts/.go 等)       | 代码块内有 Prism 高亮，但不支持直接打开代码文件 | ❌       | 需添加代码文件打开/编辑/语法高亮（CodeMirror 全屏模式） |
| 3                | 纯文本 (.txt)                       | 仅识别 .md 文件                                 | ❌       | 需扩展文件过滤器，txt 以纯文本模式打开                  |
| **索引与检索**   |
| 4                | SQLite FTS5 全文搜索                | 已实现，支持文件名+内容搜索                     | ✅       | 完全可用                                                |
| 5                | 中文分词                            | 无                                              | ❌       | FTS5 默认 tokenizer 不支持中文，需集成 jieba 或 n-gram  |
| 6                | 标签系统 (frontmatter tags)         | 无 frontmatter 解析                             | ❌       | 需解析 YAML frontmatter 提取 tags，建立标签索引         |
| 7                | 链接图谱                            | 有 wikilink 解析 + backlinks/outlinks           | 🔶       | 已有链接数据，需添加图谱可视化                          |
| 8                | 代码结构索引 (函数/类名)            | 无                                              | ❌       | 需 tree-sitter 或正则提取代码符号                       |
| **LLM 集成**     |
| 9                | LLM 适配器 (OpenAI/Claude/DeepSeek) | 无                                              | ❌       | 需新建 Rust 模块：HTTP client + 多后端适配器            |
| 10               | Ollama 本地模型支持                 | 无                                              | ❌       | 需适配 Ollama API (localhost:11434)                     |
| 11               | 上下文组装引擎 (非 RAG)             | 无                                              | ❌       | 核心新功能：关键词匹配 + 路径关联 + token 预算管理      |
| 12               | LLM 对话面板 UI                     | 无                                              | ❌       | 需新建 Svelte 组件：对话界面 + 流式输出                 |
| 13               | 引用当前文件/选中文本               | 无                                              | ❌       | 需编辑器集成：选中文本 → 发送到 LLM                     |
| 14               | 流式输出 (SSE/streaming)            | 无                                              | ❌       | 需 Tauri 事件系统实现流式响应                           |
| **多设备同步**   |
| 15               | Git auto commit                     | 有手动 commit/checkpoint                        | 🔶       | 需添加自动 commit（文件变更触发/定时）                  |
| 16               | Git auto push/pull                  | 无                                              | ❌       | 需添加 remote 管理 + 自动 push/pull                     |
| 17               | 冲突检测与解决 UI                   | 有 diff 查看                                    | 🔶       | 需增强：合并冲突解决界面                                |
| 18               | 同步状态指示器                      | 有 git status 显示                              | 🔶       | 需扩展：sync 状态图标（已同步/同步中/冲突）             |
| **UI/UX**        |
| 19               | Markdown 编辑器                     | Milkdown WYSIWYG                                | ✅       | 完全可用                                                |
| 20               | 文件树侧栏                          | 完整的文件树 + 文件夹导航                       | ✅       | 完全可用                                                |
| 21               | 搜索面板                            | Omnibar 全文搜索                                | ✅       | 完全可用                                                |
| 22               | 标签过滤                            | 无                                              | ❌       | 需在搜索中添加标签过滤功能                              |
| 23               | 文件类型过滤                        | 无                                              | ❌       | 需在搜索中添加文件类型过滤                              |
| **基础设施**     |
| 24               | Tauri 2 跨平台打包                  | macOS/Windows/Linux 发布                        | ✅       | 完全可用                                                |
| 25               | 主题系统                            | 明/暗 + 自定义主题                              | ✅       | 完全可用                                                |
| 26               | 快捷键系统                          | 可重绑定热键                                    | ✅       | 完全可用                                                |
| 27               | 设置页面                            | 全局 + 每 vault 设置                            | ✅       | 需扩展：LLM 配置项                                      |

---

## 3. Gap 统计

| 状态              | 数量 | 占比 |
| ----------------- | ---- | ---- |
| ✅ 已有可复用     | 10   | 37%  |
| 🔶 部分有需扩展   | 4    | 15%  |
| ❌ 完全缺失需新建 | 13   | 48%  |

**核心缺失领域**：LLM 集成（6项）、多文件格式支持（2项）、高级索引（3项）、同步增强（2项）

---

## 4. 分阶段开发计划

### Sprint 0：项目初始化（2 天）

- [ ] 重命名项目（otterly → LeapGrowNotes）：package.json, Cargo.toml, tauri.conf.json, 窗口标题
- [ ] 更新 README.md 说明二次开发来源
- [ ] 建立开发分支 `feat/leapgrownotes-v1`
- [ ] 确认开发环境：pnpm dev + cargo check 通过

### Sprint 1：多文件格式支持（1 周）

**目标**：让知识库不仅仅是 Markdown vault，还能管理代码和文本文件。

#### 1.1 后端扩展

- [ ] 修改 `notes/service.rs`：扩展文件过滤器，支持 `.txt`, `.py`, `.js`, `.ts`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.json`, `.yaml`, `.toml` 等
- [ ] 修改 `search/db.rs`：索引时包含代码和文本文件
- [ ] 新增文件类型检测工具函数（通过扩展名判断：markdown / code / plaintext）

#### 1.2 前端扩展

- [ ] 编辑器路由：根据文件类型切换编辑模式
  - `.md` → Milkdown WYSIWYG（现有）
  - 代码文件 → CodeMirror 6 全屏编辑模式（新增）
  - `.txt` → 纯文本编辑（CodeMirror 无语法高亮）
- [ ] 文件树图标：根据文件类型显示不同图标
- [ ] 搜索结果：显示文件类型标签

#### 1.3 测试

- [ ] 打开/编辑/保存 .py 文件
- [ ] 打开/编辑/保存 .txt 文件
- [ ] 全文搜索能检索代码和文本内容

---

### Sprint 2：LLM 适配器后端（1.5 周）

**目标**：在 Rust 后端实现多 LLM 后端调用能力。

#### 2.1 新建 `features/llm/` 模块

```
src-tauri/src/features/llm/
├── mod.rs
├── service.rs        # LLM 服务层
├── adapters/
│   ├── mod.rs
│   ├── openai.rs     # OpenAI / DeepSeek（兼容接口）
│   ├── anthropic.rs  # Claude API
│   └── ollama.rs     # 本地 Ollama
├── types.rs          # ChatMessage, LlmConfig, LlmResponse
└── commands.rs       # Tauri commands
```

#### 2.2 核心实现

- [ ] `types.rs`：定义通用接口（ChatMessage, Role, LlmProvider, LlmConfig）
- [ ] `openai.rs`：OpenAI 兼容 API 适配（reqwest HTTP client，SSE 流式解析）
- [ ] `anthropic.rs`：Claude Messages API 适配
- [ ] `ollama.rs`：Ollama REST API 适配（localhost:11434）
- [ ] `service.rs`：统一调用入口，provider 路由
- [ ] `commands.rs`：暴露 Tauri 命令
  - `llm_chat` — 发送消息，返回完整响应
  - `llm_chat_stream` — 流式发送，通过 Tauri events 推送 tokens
  - `llm_list_models` — 列出可用模型（Ollama）
  - `llm_test_connection` — 测试 API 连通性

#### 2.3 配置

- [ ] 在 settings 中新增 LLM 配置项：
  - `llm_provider`（openai / anthropic / deepseek / ollama）
  - `llm_api_key`（加密存储）
  - `llm_model_name`
  - `llm_api_base_url`
  - `llm_max_tokens`
  - `llm_temperature`

#### 2.4 依赖

- [ ] Cargo.toml 添加：`reqwest`（已有）, `tokio`（已有）, `serde_json`（已有）
- [ ] 流式输出：利用 Tauri 的 `app.emit()` 事件系统

---

### Sprint 3：上下文组装引擎（1.5 周）

**目标**：实现非 RAG 的智能上下文注入——这是项目核心差异点。

#### 3.1 新建 `features/context/` 模块

```
src-tauri/src/features/context/
├── mod.rs
├── service.rs        # 上下文组装服务
├── assembler.rs      # 上下文组装器
├── scorer.rs         # 文档评分器
├── tokenizer.rs      # Token 计数（tiktoken-rs）
└── commands.rs       # Tauri commands
```

#### 3.2 核心实现

- [ ] **关键词提取**：从用户提问中提取关键词（jieba 分词 + 停用词过滤）
- [ ] **多维度检索**：
  - FTS5 关键词匹配（复用现有 search 模块）
  - 路径相关性评分（同目录文件加权）
  - Wikilink 关联（复用现有 link 解析）
  - 时间衰减（最近修改的文件加权）
- [ ] **评分排序**：综合多维度生成文档相关性分数
- [ ] **Token 预算管理**：
  - 集成 `tiktoken-rs` 进行 token 计数
  - 根据模型上下文窗口（4K/8K/32K/128K/1M）智能裁剪
  - 优先保留高分文档全文，低分文档仅保留摘要
- [ ] **上下文模式**：
  - 全量注入（vault < 50K tokens）
  - 滑动窗口（top-N 文档填满预算）
  - 摘要+详情（先摘要后全文）
- [ ] **Prompt 组装**：System Prompt + 知识上下文 + 用户提问

#### 3.3 Tauri 命令

- [ ] `context_assemble` — 给定提问，返回组装好的上下文
- [ ] `context_preview` — 预览哪些文件会被注入（调试用）

#### 3.4 依赖

- [ ] Cargo.toml 添加：`tiktoken-rs`, `jieba-rs`

---

### Sprint 4：LLM 对话面板 UI（1 周）

**目标**：在应用中添加 LLM 对话侧边栏。

#### 4.1 新建前端 feature

```
src/lib/features/chat/
├── application/
│   └── chat_service.ts    # 调用后端 LLM + context 命令
├── domain/
│   └── chat.ts            # ChatSession, ChatMessage 类型
├── state/
│   └── chat_store.ts      # Svelte store: 会话历史
├── ui/
│   ├── ChatPanel.svelte        # 主面板
│   ├── ChatMessage.svelte      # 单条消息（支持 Markdown 渲染）
│   ├── ChatInput.svelte        # 输入框 + 发送按钮
│   ├── ContextPreview.svelte   # 注入的文件预览
│   └── LlmSettingsDialog.svelte # LLM 配置弹窗
├── ports.ts
└── types.ts
```

#### 4.2 核心实现

- [ ] `ChatPanel.svelte`：侧边栏对话面板（可折叠，类似现有 links 面板位置）
- [ ] 流式输出显示：监听 Tauri events，逐 token 渲染
- [ ] 消息渲染：支持 Markdown 格式化（代码块高亮）
- [ ] 上下文预览：显示哪些文件被注入了上下文
- [ ] 快捷操作：
  - "引用当前文件" — 将当前编辑文件内容作为上下文
  - "引用选中文本" — 将编辑器选中内容发送
  - "基于整个 vault 提问" — 全 vault 上下文组装
- [ ] 会话管理：新建/清空对话
- [ ] 集成到 AppShell：在面板布局中添加 Chat 面板

#### 4.3 LLM 设置 UI

- [ ] 在设置页面添加 LLM 配置区域：
  - Provider 选择（下拉）
  - API Key 输入（密码模式）
  - Model 选择
  - 高级参数（temperature, max_tokens）
  - "测试连接" 按钮

---

### Sprint 5：Git 自动同步（1 周）

**目标**：将现有 Git 功能升级为自动同步。

#### 5.1 后端扩展

- [ ] 在 `features/git/` 中新增：
  - `auto_sync.rs`：自动同步逻辑
  - `remote.rs`：远端管理（add/remove/list remotes）
- [ ] 自动 commit：文件保存后延迟 N 秒自动 commit（防抖）
- [ ] 自动 push：commit 后自动 push 到 remote
- [ ] 自动 pull：启动时 + 定时 pull（检测远端变更）
- [ ] 冲突检测：pull 后检测合并冲突，通知前端

#### 5.2 前端扩展

- [ ] 同步状态指示器：状态栏显示同步图标
  - 🟢 已同步
  - 🔄 同步中
  - 🟡 有未推送的更改
  - 🔴 冲突/错误
- [ ] Remote 配置 UI：在设置中添加 Git remote URL 配置
- [ ] 冲突解决 UI：显示冲突文件列表，提供选择（接受本地/接受远端/手动合并）

#### 5.3 设置项

- [ ] `git_auto_sync_enabled`（默认 false）
- [ ] `git_auto_sync_interval_seconds`（默认 300）
- [ ] `git_remote_url`
- [ ] `git_sync_on_save`（默认 true）

---

### Sprint 6：高级索引 & 搜索增强（1 周）

**目标**：增强搜索能力，支持中文和代码索引。

#### 6.1 中文分词

- [ ] 集成 `jieba-rs` 作为 FTS5 自定义 tokenizer
- [ ] 或使用字符 n-gram（2-gram/3-gram）作为备选方案
- [ ] 搜索查询也经过分词处理

#### 6.2 Frontmatter 标签

- [ ] 解析 Markdown 文件的 YAML frontmatter
- [ ] 提取 `tags` 字段，存入 SQLite 标签表
- [ ] 搜索支持标签过滤（`tag:rust`）
- [ ] 文件树中显示标签徽章

#### 6.3 代码结构索引

- [ ] 正则提取代码文件中的符号：
  - Python：`def xxx`, `class xxx`
  - JavaScript/TypeScript：`function xxx`, `class xxx`, `export`
  - Rust：`fn xxx`, `struct xxx`, `impl xxx`
- [ ] 符号存入 SQLite，支持符号搜索
- [ ] Omnibar 中添加 "符号" 搜索类别

#### 6.4 搜索增强

- [ ] 文件类型过滤（仅搜索 .md / .py / .txt 等）
- [ ] 搜索结果分组（按文件类型/按目录）

---

### Sprint 7：打磨与发布（1 周）

- [ ] 重新品牌化：图标、启动画面、About 页面
- [ ] 更新 tauri.conf.json：应用名称、bundle ID、版本号
- [ ] CI/CD：GitHub Actions 自动构建跨平台包
- [ ] 用户文档：使用指南、LLM 配置指南
- [ ] 性能测试：搜索响应 < 200ms，启动 < 2s
- [ ] 安全审计：API Key 加密存储，不在日志中泄露

---

## 5. 时间线总览

```
Week 0    ┃ Sprint 0: 项目初始化
Week 1    ┃ Sprint 1: 多文件格式支持 (.py, .txt, .js 等)
Week 2-3  ┃ Sprint 2: LLM 适配器后端 (OpenAI/Claude/Ollama)
Week 3-4  ┃ Sprint 3: 上下文组装引擎 (非 RAG 核心)
Week 5    ┃ Sprint 4: LLM 对话面板 UI
Week 6    ┃ Sprint 5: Git 自动同步
Week 7    ┃ Sprint 6: 高级索引 & 搜索增强
Week 8    ┃ Sprint 7: 打磨与发布
```

**总预估：8 周（2 个月）**

---

## 6. 技术风险 & 缓解

| 风险                       | 影响         | 缓解                                              |
| -------------------------- | ------------ | ------------------------------------------------- |
| Milkdown 不支持非 .md 文件 | 代码文件编辑 | CodeMirror 6 作为独立编辑模式（已在代码块中使用） |
| FTS5 中文分词性能          | 搜索延迟     | jieba-rs 预分词 + 缓存；降级为 n-gram             |
| LLM 流式输出稳定性         | UI 卡顿      | Tauri events 异步推送 + 前端虚拟滚动              |
| Git 自动同步冲突           | 数据丢失     | 冲突时暂停自动同步 + 本地备份 + 用户介入          |
| Token 计数准确性           | 上下文溢出   | tiktoken-rs 精确计数 + 预留 10% buffer            |
| 大 vault 性能              | 启动慢       | 增量索引 + 后台线程 + 分页加载                    |

---

## 7. 依赖变更清单

### Cargo.toml 新增

```toml
tiktoken-rs = "0.6"      # Token 计数
jieba-rs = "0.7"          # 中文分词
```

### package.json 新增

```json
"marked": "^14.0.0"       # Chat 消息 Markdown 渲染（或复用 Milkdown）
```

### 现有可复用依赖

- `reqwest` — HTTP client（LLM API 调用）
- `tokio` — 异步运行时（流式处理）
- `serde_json` — JSON 序列化
- `rusqlite` — SQLite（索引扩展）
- `git2` — Git 操作（同步增强）
- `comrak` — Markdown 解析（frontmatter 提取）
- `syntect` — 语法高亮（代码文件预览）
