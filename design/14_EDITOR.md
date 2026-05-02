# LeapGrowNotes 编辑器模块设计文档

> Milkdown (ProseMirror) 富文本编辑器核心模块
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| Milkdown 适配器 | ✅ 已实现 | ProseMirror + Milkdown 初始化与生命周期管理 |
| 缓冲区管理 | ✅ 已实现 | 定时自动保存 + 脏状态跟踪 |
| Wiki-link 插件 | ✅ 已实现 | `[[wikilink]]` 解析 + 导航 + 输入建议 |
| 代码块插件 | ✅ 已实现 | CodeMirror 6 代码块 + Prism 语法高亮 |
| 图片粘贴 | ✅ 已实现 | 粘贴图片自动保存为资产文件 |
| Markdown 粘贴 | ✅ 已实现 | 粘贴 Markdown 自动转为富文本 |
| 链接工具提示 | ✅ 已实现 | 链接悬浮提示 + 编辑 |
| Slash 命令 | ✅ 已实现 | `/` 斜杠命令菜单 |
| 查找替换 | ✅ 已实现 | 文件内查找高亮 |
| 光标恢复 | ✅ 已实现 | 切换文件后恢复光标位置 |
| 编辑器状态栏 | ✅ 已实现 | 字数统计 + 光标位置显示 |

---

## 1. 设计理念

编辑器模块是 LeapGrowNotes 的核心交互组件，采用 **Milkdown**（基于 ProseMirror）作为 WYSIWYG Markdown 编辑器，通过插件化架构扩展功能。模块遵循 **端口-适配器（六边形）架构**，将编辑器引擎与业务逻辑解耦。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/editor/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   ├── milkdown_adapter.ts           # Milkdown 编辑器适配器（核心）
│   ├── code_block_ui_plugin.ts       # CodeMirror 6 代码块插件
│   ├── dirty_state_plugin.ts         # 脏状态追踪插件
│   ├── editor_context_plugin.ts      # 编辑器上下文注入插件
│   ├── find_highlight_plugin.ts      # 查找高亮插件
│   ├── image_input_rule_plugin.ts    # 图片输入规则插件
│   ├── image_paste_plugin.ts         # 图片粘贴插件
│   ├── leading_block_escape_plugin.ts # 首行块级元素转义
│   ├── link_edit_transaction.ts      # 链接编辑事务
│   ├── link_tooltip_plugin.ts        # 链接悬浮提示插件
│   ├── mark_boundary_escape_plugin.ts # 标记边界转义
│   ├── markdown_link_input_rule.ts   # Markdown 链接输入规则
│   ├── markdown_paste_plugin.ts      # Markdown 粘贴处理
│   ├── markdown_paste_utils.ts       # 粘贴工具函数
│   ├── slash_command_plugin.ts       # 斜杠命令插件
│   ├── wiki_link_plugin.ts           # Wiki-link 节点插件
│   └── wiki_suggest_plugin.ts        # Wiki-link 输入建议插件
├── application/
│   └── editor_service.ts             # 编辑器服务（业务编排）
├── domain/
│   └── wiki_link.ts                  # Wiki-link 纯领域逻辑
├── state/
│   └── editor_store.svelte.ts        # 编辑器响应式状态
└── ui/
    └── editor_status_bar.svelte      # 编辑器状态栏组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `EditorPort` 接口：创建/销毁编辑器、获取/设置内容、光标操作 | `ports.ts` |
| **adapters** | Milkdown/ProseMirror 具体实现 + 16 个功能插件 | `adapters/` |
| **application** | `EditorService` 编排：会话管理、缓冲区刷写、光标恢复、Wiki 建议 | `application/` |
| **domain** | Wiki-link 格式化纯函数 | `domain/` |
| **state** | `EditorStore` Svelte 5 runes 响应式状态 | `state/` |
| **ui** | 编辑器状态栏 Svelte 组件 | `ui/` |

---

## 3. 核心接口

### 3.1 EditorPort

```typescript
interface EditorPort {
  create(element: HTMLElement, config: EditorSessionConfig): Promise<EditorSession>;
  destroy(): void;
}

interface EditorSession {
  get_content(): string;
  set_content(markdown: string): void;
  get_cursor(): number;
  set_cursor(pos: number): void;
  focus(): void;
}

interface EditorSessionConfig {
  initial_content: string;
  buffer: BufferConfig;
  events: EditorEventHandlers;
}

interface BufferConfig {
  flush_interval_ms: number;
  restore_policy: BufferRestorePolicy;
}
```

### 3.2 EditorService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `open_session(note_path)` | 打开编辑会话：加载内容、创建编辑器实例、恢复光标 |
| `close_session()` | 关闭当前会话：刷写缓冲区、保存光标位置 |
| `flush_buffer()` | 将编辑器缓冲区写入文件系统 |
| `get_wiki_suggestions(query)` | 获取 Wiki-link 自动补全建议 |

---

## 4. 插件体系

编辑器通过 ProseMirror 插件机制扩展功能：

| 插件 | 功能 | 触发方式 |
| ---- | ---- | -------- |
| `wiki_link_plugin` | 渲染 `[[wikilink]]` 为可点击节点 | 编辑器初始化 |
| `wiki_suggest_plugin` | `[[` 输入时弹出补全菜单 | 用户输入 `[[` |
| `code_block_ui_plugin` | 代码块使用 CodeMirror 6 渲染 | 遇到代码块节点 |
| `image_paste_plugin` | 粘贴图片自动保存为本地文件 | Ctrl+V 粘贴图片 |
| `markdown_paste_plugin` | 粘贴 Markdown 文本转为富文本 | Ctrl+V 粘贴文本 |
| `link_tooltip_plugin` | 链接悬浮显示 URL + 编辑按钮 | 鼠标悬停链接 |
| `slash_command_plugin` | `/` 输入弹出命令菜单 | 用户输入 `/` |
| `find_highlight_plugin` | 查找匹配文本高亮 | 查找面板输入 |
| `dirty_state_plugin` | 追踪编辑器内容是否已修改 | 内容变更 |

---

## 5. 状态管理

`EditorStore` 使用 Svelte 5 runes 实现响应式状态：

| 状态字段 | 类型 | 说明 |
| -------- | ---- | ---- |
| `open_note` | `string \| null` | 当前打开的笔记路径 |
| `cursor` | `number` | 光标位置 |
| `last_saved_at` | `number` | 最后保存时间戳 |
| `session_persist_revision` | `number` | 会话持久化版本号 |

---

## 6. 依赖关系

```
editor
├── 依赖 → vault (获取当前 vault 信息)
├── 依赖 → tab (标签页脏状态同步)
├── 依赖 → search (Wiki-link 建议查询)
├── 依赖 → note (笔记读写)
└── 依赖 → shared/adapters (Tauri IPC)
```

---

## 7. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `editor_sync.reactor` | 监听标签页切换，自动打开/关闭编辑会话 |
| `editor_width.reactor` | 监听设置变更，调整编辑器宽度 |
| `autosave.reactor` | 定时触发缓冲区刷写 |
| `find_in_file.reactor` | 连接查找面板与高亮插件 |
