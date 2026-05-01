# LeapGrowNotes — Gap 分析 & 开发计划

> Otterly 基座 vs BLUEPRINT 目标的差距分析与分阶段开发计划
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-01  
> **实现状态更新**: 2026-05-01

---

## 1. Otterly 基座现有能力 + LeapGrowNotes 扩展能力清单

### 1.1 后端（Rust / Tauri 2）— 76 个 Tauri 命令

| 模块            | 能力            | 详情                                                                      | 来源     |
| --------------- | --------------- | ------------------------------------------------------------------------- | -------- |
| vault           | 多 vault 管理   | 打开/列出/移除 vault，vault ID（blake3 hash），JSON 持久化                | Otterly  |
| notes           | 笔记 CRUD       | 创建/读取/保存/重命名/删除笔记和文件夹，拖拽移动，图片资产管理            | Otterly  |
| search          | 全文搜索        | SQLite FTS5 索引，link 解析，搜索建议，文件名+内容搜索（17个命令）        | Otterly  |
| git             | Git 集成        | git init/status/commit/history/checkpoint/restore/diff（git2 crate）      | Otterly  |
| watcher         | 文件监视        | notify crate 实现实时文件变更检测                                         | Otterly  |
| settings        | 设置系统        | 全局设置 + 每 vault 设置（key-value 存储）                                | Otterly  |
| vault_session   | 会话持久化      | 记住上次打开的 vault 和文件                                               | Otterly  |
| 资产服务        | 自定义协议      | `otterly-asset://` URI scheme 服务 vault 内图片                           | Otterly  |
| **points**      | **积分系统**    | 积分奖励/查询/交易流水/成就检测（4个命令）                                | **新增** |
| **stats**       | **统计系统**    | 会话跟踪/文件打开/阅读完成/历史查询/vault扫描（5个命令）                  | **新增** |
| **nlp_kernal**  | **NLP 分析**    | 纯 Rust NLP + Python 桥接 + BPE Token 分析 + 聚合统计（9个命令）          | **新增** |
| **user**        | **用户管理**    | 用户创建/查询/更新/密码验证（4个命令）                                    | **新增** |
| **update**      | **自动更新**    | 版本检查 + 更新提示（2个命令）                                            | **新增** |

### 1.2 前端（SvelteKit + TypeScript + Svelte 5）

| 功能                 | 详情                                                        | 来源     |
| -------------------- | ----------------------------------------------------------- | -------- |
| 编辑器               | Milkdown（ProseMirror）+ CodeMirror 代码块 + Prism 语法高亮 | Otterly  |
| Wiki-links           | `[[wiki-links]]` 支持，自动补全建议                         | Otterly  |
| Backlinks/Outlinks   | 当前笔记的反向链接和外向链接面板                            | Otterly  |
| 文件树               | 目录导航，文件夹折叠/展开，拖拽移动，作用域模式             | Otterly  |
| Omnibar              | 统一搜索（文件/内容/命令/设置）                             | Otterly  |
| Tab 系统             | 多标签页编辑 + 拖拽排序 + 固定标签                          | Otterly  |
| 收藏                 | 星标笔记快速访问                                            | Otterly  |
| Git UI               | 变更状态显示，提交历史，检查点/恢复                         | Otterly  |
| 主题                 | 明/暗主题 + 自定义主题支持                                  | Otterly  |
| 快捷键               | 可重绑定的热键系统                                          | Otterly  |
| 面板布局             | Paneforge 可调整面板（文件树/编辑器/侧边栏）                | Otterly  |
| 状态栏               | 行/列/字数统计                                              | Otterly  |
| **用户系统**         | 登录/注册/游客/多用户切换/密码管理                          | **新增** |
| **积分 UI**          | 状态栏等级badge + 飘动积分动画(+2) + confetti升级烟花       | **新增** |
| **成长等级**         | 30级体系（知识新生儿→院士），前端等级定义+进度计算           | **新增** |
| **统计仪表盘**       | 会话统计 + SVG 折线图/柱状图/饼图 + AnimatedTime 计时器     | **新增** |
| **NLP 分析面板**     | 词频分析/关键词提取/词汇丰富度/聚合统计                     | **新增** |
| **BPE Token 分析**   | Token 可视化 + 统计面板                                     | **新增** |
| **自动更新 UI**      | 检查新版本 + 更新提示对话框                                 | **新增** |
| **Git Autocommit**   | Reactor 模式监听文件变更自动提交                            | **新增** |

---

## 2. Gap 对比矩阵（更新版）

### 图例

- ✅ 已实现
- 🔶 部分实现
- ❌ 未实现

| #                | BLUEPRINT 需求                      | 当前状态                                            | Gap 状态 | 差距说明                                                |
| ---------------- | ----------------------------------- | --------------------------------------------------- | -------- | ------------------------------------------------------- |
| **文件格式支持** |
| 1                | Markdown (.md)                      | Milkdown 编辑器，WYSIWYG                            | ✅       | 完全支持                                                |
| 2                | 代码文件 (.py/.js/.ts/.go 等)       | 代码块内有 Prism 高亮                                | 🔶       | 代码块内高亮可用，独立代码文件编辑模式待增强            |
| 3                | 纯文本 (.txt)                       | 可在 vault 中管理                                    | 🔶       | 基本可用，专用编辑模式待增强                            |
| **索引与检索**   |
| 4                | SQLite FTS5 全文搜索                | 已实现，17个搜索命令                                 | ✅       | 完全可用                                                |
| 5                | 中文分词                            | 无                                                   | ❌       | FTS5 默认 tokenizer 不支持中文，需集成 jieba 或 n-gram  |
| 6                | 标签系统 (frontmatter tags)         | 无 frontmatter 解析                                  | ❌       | 需解析 YAML frontmatter 提取 tags，建立标签索引         |
| 7                | 链接图谱                            | 有 wikilink 解析 + backlinks/outlinks                | 🔶       | 已有链接数据，需添加图谱可视化                          |
| 8                | 代码结构索引 (函数/类名)            | 无                                                   | ❌       | 需 tree-sitter 或正则提取代码符号                       |
| **LLM 集成**     |
| 9                | LLM 适配器 (OpenAI/Claude/DeepSeek) | 无                                                   | ❌       | 需新建 Rust 模块：HTTP client + 多后端适配器            |
| 10               | Ollama 本地模型支持                 | 无                                                   | ❌       | 需适配 Ollama API (localhost:11434)                     |
| 11               | 上下文组装引擎 (非 RAG)             | 无                                                   | ❌       | 核心新功能：关键词匹配 + 路径关联 + token 预算管理      |
| 12               | LLM 对话面板 UI                     | 无                                                   | ❌       | 需新建 Svelte 组件：对话界面 + 流式输出                 |
| 13               | 引用当前文件/选中文本               | 无                                                   | ❌       | 需编辑器集成：选中文本 → 发送到 LLM                     |
| 14               | 流式输出 (SSE/streaming)            | 无                                                   | ❌       | 需 Tauri 事件系统实现流式响应                           |
| **多设备同步**   |
| 15               | Git auto commit                     | ✅ 已实现 (reactor 模式)                              | ✅       | 通过 git_autocommit reactor 监听文件变更触发            |
| 16               | Git auto push/pull                  | 无                                                   | ❌       | 需添加 remote 管理 + 自动 push/pull                     |
| 17               | 冲突检测与解决 UI                   | 有 diff 查看                                         | 🔶       | 需增强：合并冲突解决界面                                |
| 18               | 同步状态指示器                      | 有 git status 显示                                   | 🔶       | 需扩展：sync 状态图标（已同步/同步中/冲突）             |
| **UI/UX**        |
| 19               | Markdown 编辑器                     | Milkdown WYSIWYG                                     | ✅       | 完全可用                                                |
| 20               | 文件树侧栏                         | 完整的文件树 + 文件夹导航                            | ✅       | 完全可用                                                |
| 21               | 搜索面板                            | Omnibar 全文搜索                                     | ✅       | 完全可用                                                |
| 22               | 标签过滤                            | 无                                                   | ❌       | 需在搜索中添加标签过滤功能                              |
| 23               | 文件类型过滤                        | 无                                                   | ❌       | 需在搜索中添加文件类型过滤                              |
| **激励系统**     |
| 24               | 积分系统                            | ✅ 完整实现（后端引擎 + 前端 UI）                     | ✅       | 积分奖励/查询/交易/等级/连续天数                        |
| 25               | 成长等级                            | ✅ 30级体系已实现                                     | ✅       | 知识新生儿→院士，前端展示+confetti升级                  |
| 26               | 飘动积分动画                        | ✅ FloatingPoints 组件                                | ✅       | 文件打开时右下角飘动 "+2 ✨"                             |
| 27               | 统计仪表盘                          | ✅ 完整实现                                           | ✅       | 会话跟踪/SVG图表/NLP数据/连续天数计时                   |
| 28               | NLP 分析                            | ✅ 纯 Rust + Python 桥接                              | ✅       | 词频/关键词/词汇丰富度/BPE Token                        |
| **基础设施**     |
| 29               | Tauri 2 跨平台打包                  | macOS/Windows/Linux 发布                             | ✅       | 完全可用                                                |
| 30               | 主题系统                            | 明/暗 + 自定义主题                                   | ✅       | 完全可用                                                |
| 31               | 快捷键系统                          | 可重绑定热键                                         | ✅       | 完全可用                                                |
| 32               | 设置页面                            | 全局 + 每 vault 设置                                 | ✅       | 需扩展：LLM 配置项（待 LLM 集成时添加）                |
| 33               | 用户系统                            | ✅ 多用户登录/注册/游客                               | ✅       | 登录/注册/游客/密码管理/多用户切换                      |
| 34               | 自动更新                            | ✅ 检查新版本 + 更新提示                              | ✅       | 完全可用                                                |
| **宠物系统**     |
| 35               | 电子宠物系统                        | 无                                                   | ❌       | 完整宠物系统待开发（详见 PET_SYSTEM_DESIGN.md）         |

---

## 3. Gap 统计（更新版）

| 状态              | 数量 | 占比 |
| ----------------- | ---- | ---- |
| ✅ 已实现         | 21   | 60%  |
| 🔶 部分实现       | 5    | 14%  |
| ❌ 未实现         | 9    | 26%  |

**对比初始状态**：从 37% 已实现提升至 **60% 已实现**

**核心缺失领域**：LLM 集成（6项）、高级索引（3项）、宠物系统（1项）

---

## 4. 剩余开发计划

### Sprint A：LLM 集成（2.5 周）— 最高优先级

#### A.1 LLM 适配器后端（1.5 周）

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

- [ ] `types.rs`：通用接口（ChatMessage, Role, LlmProvider, LlmConfig）
- [ ] `openai.rs`：OpenAI 兼容 API 适配（reqwest + SSE 流式解析）
- [ ] `anthropic.rs`：Claude Messages API 适配
- [ ] `ollama.rs`：Ollama REST API 适配
- [ ] `commands.rs`：llm_chat / llm_chat_stream / llm_list_models / llm_test_connection
- [ ] 设置项：llm_provider / llm_api_key / llm_model_name 等

#### A.2 上下文组装引擎（1 周）

- [ ] 关键词提取（从用户提问中）
- [ ] 多维度检索（FTS5 + 路径相关性 + Wikilink 关联 + 时间衰减）
- [ ] Token 预算管理（tiktoken-rs）
- [ ] Prompt 组装（System Prompt + 知识上下文 + 用户提问）

#### A.3 对话面板 UI（1 周）

- [ ] ChatPanel.svelte 侧边栏对话面板
- [ ] 流式输出显示（Tauri events 逐 token 渲染）
- [ ] 上下文预览（显示注入的文件列表）
- [ ] LLM 设置 UI

### Sprint B：同步增强（1 周）

- [ ] Git auto push/pull（remote 管理）
- [ ] 同步状态指示器（状态栏图标）
- [ ] 冲突检测 UI

### Sprint C：高级索引（1 周）

- [ ] 中文分词（jieba-rs 集成到 FTS5）
- [ ] Frontmatter 标签解析 + 标签过滤
- [ ] 代码结构索引（正则提取函数/类名）
- [ ] 文件类型过滤

### Sprint D：宠物系统（2 周）

- [ ] 宠物数据模型 + SQLite 存储（Rust 后端）
- [ ] 宠物选蛋/孵化/进化流程
- [ ] 宠物悬浮组件 + 动画
- [ ] 与积分系统联动

---

## 5. 时间线总览（更新版）

```
已完成  ┃ Sprint 0: 项目初始化 ✅
已完成  ┃ Sprint 1: 基础功能 (文件管理/编辑器/搜索) ✅
已完成  ┃ Sprint 1.5: 用户系统 + 积分 + 统计 + NLP ✅
已完成  ┃ Sprint 1.6: 自动更新 + Git Autocommit ✅
待开发  ┃ Sprint A: LLM 集成 (适配器+上下文+UI) — 2.5周
待开发  ┃ Sprint B: 同步增强 (auto push/pull) — 1周
待开发  ┃ Sprint C: 高级索引 (中文分词/标签/代码) — 1周
待开发  ┃ Sprint D: 宠物系统 — 2周
```

**剩余预估：6.5 周**

---

## 6. 技术风险 & 缓解

| 风险                       | 影响         | 缓解                                              | 状态 |
| -------------------------- | ------------ | ------------------------------------------------- | ---- |
| Milkdown 不支持非 .md 文件 | 代码文件编辑 | CodeMirror 6 作为独立编辑模式                      | 🔶 部分处理 |
| FTS5 中文分词性能          | 搜索延迟     | jieba-rs 预分词 + 缓存；降级为 n-gram             | ❌ 待实现 |
| LLM 流式输出稳定性         | UI 卡顿      | Tauri events 异步推送 + 前端虚拟滚动              | ❌ 待实现 |
| Git 自动同步冲突           | 数据丢失     | 冲突时暂停自动同步 + 本地备份 + 用户介入          | 🔶 autocommit 已有 |
| Token 计数准确性           | 上下文溢出   | tiktoken-rs 精确计数 + 预留 10% buffer            | ❌ 待实现 |
| 大 vault 性能              | 启动慢       | 增量索引 + 后台线程 + 分页加载                    | ✅ 已优化 |
