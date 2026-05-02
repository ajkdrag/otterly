# LeapGrowNotes 全文搜索模块设计文档

> SQLite FTS5 全文搜索 + Omnibar 统一检索
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现（17 个 Tauri 命令）

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| FTS5 全文搜索 | ✅ 已实现 | SQLite FTS5 + trigram 分词（支持中日韩） |
| Omnibar UI | ✅ 已实现 | 统一搜索入口（文件/内容/命令/设置） |
| 搜索建议 | ✅ 已实现 | 实时输入建议 + 模糊匹配 |
| Wiki-link 建议 | ✅ 已实现 | 编辑器中 `[[` 触发的笔记补全 |
| 跨 Vault 搜索 | ✅ 已实现 | 跨多个 vault 的全文搜索 |
| 文件内查找 | ✅ 已实现 | 当前文件内的文本查找 |
| 工作区索引 | ✅ 已实现 | 后台索引构建 + 进度事件 + 中断支持 |
| 代码符号索引 | ✅ 已实现 | 正则提取函数/类名（py/js/ts/rs/go/java/c/cpp） |
| 链接解析 | ✅ 已实现 | Backlinks/Outlinks 解析与索引 |
| 标签索引 | ✅ 已实现 | YAML frontmatter tags 解析 |
| 命令搜索 | ✅ 已实现 | 命令面板搜索（带评分排序） |
| 设置搜索 | ✅ 已实现 | 设置项搜索 |

---

## 1. 设计理念

搜索模块是 LeapGrowNotes 的**非 RAG 检索核心**，不使用向量嵌入，而是基于 SQLite FTS5 全文索引 + 结构化索引实现高性能检索。通过 Omnibar 提供统一搜索入口，支持文件名搜索、内容搜索、命令搜索、设置搜索等多种模式。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/search/
├── index.ts                              # 公共导出入口
├── ports.ts                              # 端口接口定义
├── adapters/
│   ├── search_tauri_adapter.ts           # 搜索 Tauri IPC 适配器
│   ├── workspace_index_tauri_adapter.ts  # 工作区索引适配器
│   └── index_run_abort.ts               # 索引中断/取消工具
├── application/
│   ├── search_service.ts                 # 搜索服务（业务编排）
│   ├── omnibar_actions.ts                # Omnibar Action 注册
│   └── find_in_file_actions.ts           # 文件内查找 Action 注册
├── db/
│   └── search_db.ts                      # 搜索数据库抽象
├── domain/
│   ├── score_command.ts                  # 命令搜索评分算法
│   └── score_setting.ts                 # 设置搜索评分算法
├── state/
│   ├── search_store.svelte.ts            # 搜索状态
│   └── omnibar_store.svelte.ts           # Omnibar 状态
├── types/
│   ├── search_result.ts                  # 搜索结果类型
│   ├── omnibar.ts                        # Omnibar 类型
│   └── index_progress.ts                # 索引进度类型
└── ui/
    ├── omnibar.svelte                    # Omnibar 搜索栏组件
    ├── omnibar_results.svelte            # 搜索结果列表
    ├── find_in_file_bar.svelte           # 文件内查找栏
    └── search_highlight.svelte           # 搜索高亮组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `SearchPort`（全文搜索）和 `WorkspaceIndexPort`（索引管理）接口 | `ports.ts` |
| **adapters** | Tauri IPC 实现 + 索引进度事件监听 + 中断控制 | `adapters/` |
| **application** | `SearchService` 编排多模式搜索 + Action 注册 | `application/` |
| **db** | 搜索数据库抽象层 | `db/` |
| **domain** | 命令/设置搜索评分纯函数 | `domain/` |
| **state** | `SearchStore` + `OmnibarStore` 响应式状态 | `state/` |
| **ui** | Omnibar + 查找栏 Svelte 组件 | `ui/` |

---

## 3. 核心接口

### 3.1 SearchPort

```typescript
interface SearchPort {
  search_files(query: string): Promise<FileSearchResult[]>;
  search_content(query: string): Promise<ContentSearchResult[]>;
  search_suggestions(query: string): Promise<string[]>;
  get_backlinks(path: string): Promise<LinkEntry[]>;
  get_outlinks(path: string): Promise<LinkEntry[]>;
  get_tags(path: string): Promise<string[]>;
  get_code_symbols(path: string): Promise<CodeSymbol[]>;
}
```

### 3.2 WorkspaceIndexPort

```typescript
interface WorkspaceIndexPort {
  build_index(options?: IndexOptions): Promise<void>;
  on_progress(callback: (progress: IndexProgress) => void): UnsubscribeFn;
  abort(): void;
}
```

---

## 4. Omnibar 搜索模式

Omnibar 是统一搜索入口，支持多种搜索范围：

| 模式 | 触发方式 | 说明 |
| ---- | -------- | ---- |
| 文件搜索 | 默认 | 按文件名模糊匹配 |
| 内容搜索 | `>` 前缀或切换 | FTS5 全文内容搜索 |
| 命令搜索 | `:` 前缀或切换 | 搜索命令面板中的 Action |
| 设置搜索 | `@` 前缀或切换 | 搜索设置项 |
| 跨 Vault 搜索 | 切换按钮 | 跨多个 vault 搜索 |

### 评分算法

- **命令搜索** (`score_command`)：基于字符匹配位置、连续匹配长度、最近使用频率加权
- **设置搜索** (`score_setting`)：基于关键词匹配度 + 分类权重

---

## 5. 后端命令（Tauri）

共 17 个搜索相关命令：

| 命令 | 说明 |
| ---- | ---- |
| `search_files` | 文件名搜索 |
| `search_content` | 全文内容搜索 |
| `search_suggestions` | 搜索建议 |
| `build_workspace_index` | 构建/重建工作区索引 |
| `get_index_status` | 获取索引状态 |
| `get_backlinks` | 获取反向链接 |
| `get_outlinks` | 获取外向链接 |
| `get_all_links` | 获取所有链接 |
| `get_tags` | 获取标签 |
| `get_code_symbols` | 获取代码符号 |
| `search_wiki_suggestions` | Wiki-link 自动补全建议 |
| ... | 其他索引管理命令 |

---

## 6. 索引策略

### 6.1 FTS5 全文索引

- 使用 SQLite FTS5 扩展
- **trigram 分词器**：支持中日韩字符子串匹配
- 索引字段：文件名 + 全文内容
- 支持增量更新（文件变更时局部重建）

### 6.2 结构化索引

| 索引类型 | 说明 |
| -------- | ---- |
| 链接图谱 | `[[wikilink]]` 解析，维护 Backlinks/Outlinks 关系 |
| 标签索引 | YAML frontmatter `tags` 字段解析 |
| 代码符号索引 | 正则提取函数名/类名/导出符号 |
| 文件树索引 | 基于目录路径的层级分类 |

---

## 7. 依赖关系

```
search
├── 依赖 → vault (当前 vault 路径和配置)
├── 依赖 → shared/adapters (Tauri IPC)
├── 被依赖 ← editor (Wiki-link 建议)
├── 被依赖 ← note (CRUD 后更新索引)
├── 被依赖 ← folder (文件夹操作后更新索引)
└── 被依赖 ← links (链接数据查询)
```

---

## 8. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `backlinks_sync.reactor` | 笔记切换时同步 Backlinks 数据 |
| `local_links_sync.reactor` | 本地链接同步 |
