# LeapGrowNotes 笔记 CRUD 模块设计文档

> 笔记的创建、读取、更新、删除与资产管理
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 笔记 CRUD | ✅ 已实现 | 创建/读取/写入/删除/重命名/移动 |
| 资产管理 | ✅ 已实现 | 图片资产 URL 解析 + 写入 |
| Tauri 适配器 | ✅ 已实现 | 14 个后端命令对接 |
| 笔记状态管理 | ✅ 已实现 | Svelte 5 响应式 store |
| 领域逻辑 | ✅ 已实现 | 标题提取、路径校验、名称清理、笔记查找 |
| UI 对话框 | ✅ 已实现 | 删除/重命名/保存/图片粘贴/笔记详情 |

---

## 1. 设计理念

笔记模块是 LeapGrowNotes 最核心的数据操作层，负责所有笔记文件的生命周期管理。采用**端口-适配器架构**，通过 `NotesPort` 和 `AssetsPort` 两个端口抽象文件系统操作，确保业务逻辑与底层存储解耦。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/note/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   ├── notes_tauri_adapter.ts        # 笔记 Tauri IPC 适配器
│   └── assets_tauri_adapter.ts       # 资产 Tauri IPC 适配器
├── application/
│   ├── note_actions.ts               # Action 注册（命令面板集成）
│   ├── note_action_helpers.ts        # Action 辅助函数
│   └── note_service.ts               # 笔记服务（业务编排）
├── domain/
│   ├── asset_markdown_path.ts        # 资产 Markdown 路径生成
│   ├── asset_url.ts                  # 资产 URL 解析
│   ├── ensure_open_note.ts           # 确保有打开的笔记
│   ├── extract_note_title.ts         # 从内容提取标题
│   ├── note_lookup.ts               # 笔记路径查找
│   ├── note_path_exists.ts          # 路径存在性检查
│   └── sanitize_note_name.ts        # 笔记名称清理
├── state/
│   └── note_store.svelte.ts          # 笔记响应式状态
├── types/
│   └── note_service_result.ts        # 服务结果类型
└── ui/
    ├── delete_note_dialog.svelte     # 删除确认对话框
    ├── image_paste_dialog.svelte     # 图片粘贴命名对话框
    ├── note_details_dialog.svelte    # 笔记详情对话框
    ├── note_editor.svelte            # 笔记编辑器容器
    ├── rename_note_dialog.svelte     # 重命名对话框
    └── save_note_dialog.svelte       # 保存对话框
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `NotesPort`（13 个方法）和 `AssetsPort`（2 个方法）接口 | `ports.ts` |
| **adapters** | 通过 Tauri IPC 调用后端 Rust 命令 | `adapters/` |
| **application** | `NoteService` 编排 CRUD + 链接修复 + 索引更新 | `application/` |
| **domain** | 纯函数：标题提取、路径清理、资产 URL 处理 | `domain/` |
| **state** | `NoteStore` 管理笔记列表、文件夹列表、选中状态 | `state/` |
| **ui** | 操作确认对话框组件 | `ui/` |

---

## 3. 核心接口

### 3.1 NotesPort

```typescript
interface NotesPort {
  list_notes(folder?: string): Promise<NoteEntry[]>;
  list_folders(): Promise<string[]>;
  read_note(path: string): Promise<string>;
  read_note_meta(path: string): Promise<NoteMeta>;
  write_note(path: string, content: string): Promise<void>;
  create_note(path: string, content?: string): Promise<void>;
  delete_note(path: string): Promise<void>;
  rename_note(old_path: string, new_path: string): Promise<void>;
  move_note(old_path: string, new_folder: string): Promise<void>;
  create_folder(path: string): Promise<void>;
  delete_folder(path: string): Promise<void>;
  rename_folder(old_path: string, new_name: string): Promise<void>;
  move_folder(old_path: string, new_parent: string): Promise<void>;
}
```

### 3.2 AssetsPort

```typescript
interface AssetsPort {
  resolve_asset_url(asset_path: string): Promise<string>;
  write_image_asset(name: string, data: Uint8Array): Promise<string>;
}
```

### 3.3 NoteService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `create_note(name, folder?)` | 创建笔记：名称清理 → 路径校验 → 创建文件 → 更新索引 |
| `delete_note(path)` | 删除笔记：确认 → 关闭标签 → 删除文件 → 更新索引 |
| `rename_note(path, new_name)` | 重命名：名称清理 → 路径校验 → 重命名 → 修复链接 → 更新索引 |
| `move_note(path, new_folder)` | 移动笔记：移动文件 → 修复链接 → 更新索引 |
| `save_note(path, content)` | 保存笔记内容到文件系统 |

---

## 4. 领域逻辑

| 函数 | 说明 |
| ---- | ---- |
| `extract_note_title(content)` | 从 Markdown 内容提取第一个 `#` 标题或首行文本 |
| `sanitize_note_name(name)` | 清理文件名：移除非法字符、确保 `.md` 后缀 |
| `note_path_exists(path, notes)` | 检查路径是否已存在于笔记列表 |
| `note_lookup(name, notes)` | 模糊查找笔记（用于 Wiki-link 解析） |
| `asset_url(path)` | 将资产相对路径转换为可渲染的 URL |
| `asset_markdown_path(name)` | 生成资产的 Markdown 引用路径 |

---

## 5. 后端命令（Tauri）

| 命令 | 说明 |
| ---- | ---- |
| `list_notes` | 列出指定文件夹下的所有笔记 |
| `list_folders` | 列出所有文件夹 |
| `read_note` | 读取笔记内容 |
| `read_note_meta` | 读取笔记元数据（大小、修改时间等） |
| `write_note` | 写入笔记内容 |
| `create_note` | 创建新笔记文件 |
| `delete_note` | 删除笔记文件 |
| `rename_note` | 重命名笔记 |
| `move_note` | 移动笔记到新文件夹 |
| `create_folder` | 创建文件夹 |
| `delete_folder` | 删除文件夹 |
| `rename_folder` | 重命名文件夹 |
| `move_folder` | 移动文件夹 |
| `resolve_asset_url` | 解析资产 URL |

---

## 6. 依赖关系

```
note
├── 依赖 → vault (当前 vault 路径)
├── 依赖 → links (重命名/移动后修复链接)
├── 依赖 → search (创建/删除后更新索引)
├── 依赖 → tab (删除笔记时关闭对应标签)
├── 依赖 → editor (保存时获取编辑器内容)
└── 依赖 → shared/adapters (Tauri IPC)
```
