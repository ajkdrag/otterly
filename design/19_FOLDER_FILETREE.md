# LeapGrowNotes 文件树模块设计文档

> 文件夹管理、文件树渲染与目录导航
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 文件树构建 | ✅ 已实现 | 目录递归扫描 → 树形结构 |
| 虚拟化渲染 | ✅ 已实现 | 扁平化 + 虚拟滚动（大量文件性能优化） |
| 文件夹 CRUD | ✅ 已实现 | 创建/删除/重命名文件夹 |
| 拖拽移动 | ✅ 已实现 | 文件/文件夹拖拽排序与移动 |
| 展开/折叠 | ✅ 已实现 | 文件夹展开状态管理 |
| 分页加载 | ✅ 已实现 | 大文件夹分批加载（load more） |
| 范围过滤 | ✅ 已实现 | scope 到指定子目录 |
| 收藏（星标） | ✅ 已实现 | 笔记星标快速访问 |
| 文件树 UI | ✅ 已实现 | 行组件 + 右键菜单 + 图标 |

---

## 1. 设计理念

文件树模块负责将文件系统目录结构可视化为可交互的树形控件。采用**扁平化 + 虚拟化渲染**策略，即使目录包含数千文件也能保持流畅。文件树与笔记 CRUD 模块协作，提供完整的文件管理能力。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/folder/
├── index.ts                              # 公共导出入口
├── application/
│   ├── filetree_action_helpers.ts        # 文件树 UI 状态辅助
│   ├── folder_action_helpers.ts          # 文件夹操作对话框辅助
│   ├── folder_actions.ts                 # Action 注册（813 行，功能丰富）
│   └── folder_service.ts                 # 文件夹服务（538 行，核心编排）
├── domain/
│   ├── filetree.ts                       # FileTreeNode 构建/排序/验证
│   ├── flatten_filetree.ts              # 树 → 扁平列表转换
│   └── scope_flat_tree.ts              # 范围过滤（scope 子目录）
├── types/
│   └── folder_service_result.ts          # 服务结果类型
└── ui/
    ├── create_folder_dialog.svelte       # 创建文件夹对话框
    ├── delete_folder_dialog.svelte       # 删除文件夹对话框
    ├── file_tree_row.svelte              # 文件树行组件
    ├── filetree_move_conflict_dialog.svelte # 移动冲突对话框
    ├── rename_folder_dialog.svelte       # 重命名对话框
    └── virtual_file_tree.svelte          # 虚拟化文件树容器
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **application** | `FolderService` CRUD 编排 + Action 注册（创建/删除/重命名/移动/导航/收藏/scope） | `application/` |
| **domain** | 纯函数：树构建、排序、扁平化、拖拽验证、scope 过滤 | `domain/` |
| **ui** | 虚拟化文件树 + 行组件 + 操作对话框 | `ui/` |

---

## 3. 核心领域逻辑

### 3.1 FileTreeNode

```typescript
interface FileTreeNode {
  name: string;
  path: string;
  is_folder: boolean;
  children?: FileTreeNode[];
}
```

### 3.2 关键函数

| 函数 | 说明 |
| ---- | ---- |
| `build_filetree(entries)` | 从扁平文件列表构建层级树 |
| `sort_tree(node)` | 排序：文件夹优先 → 字母排序 |
| `flatten_filetree(root, expanded)` | 根据展开状态将树扁平化为渲染列表 |
| `scope_flat_tree(flat, scope_path)` | 过滤出指定子目录范围 |

### 3.3 FlatTreeNode

```typescript
interface FlatTreeNode {
  type: "file" | "folder" | "load_more";
  path: string;
  name: string;
  depth: number;
  is_expanded?: boolean;
}
```

---

## 4. FolderService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `load_folder(path?)` | 加载文件夹内容（支持分页） |
| `create_folder(name, parent)` | 创建文件夹 |
| `delete_folder(path)` | 删除文件夹（递归） |
| `rename_folder(path, new_name)` | 重命名文件夹 → 修复内部链接 |
| `move_item(source, target)` | 移动文件/文件夹 → 冲突检测 → 链接修复 |
| `refresh_tree()` | 刷新文件树 |

---

## 5. Action 注册

`folder_actions.ts` 注册了丰富的 Action（约 30 个）：

| 类别 | Action 示例 |
| ---- | ---------- |
| 创建 | `folder_create`, `note_create_in_folder` |
| 删除 | `folder_delete`, `note_delete` |
| 重命名 | `folder_rename`, `note_rename` |
| 移动 | `folder_move`, `note_move` |
| 导航 | `folder_select`, `folder_expand`, `folder_collapse`, `folder_collapse_all` |
| 收藏 | `note_star`, `note_unstar` |
| Scope | `folder_scope`, `folder_unscope` |
| 加载 | `folder_load_more` |

---

## 6. 虚拟化渲染

- 使用 `virtual_file_tree.svelte` 实现虚拟滚动
- 只渲染可视区域内的行（通常 30-50 行）
- 大文件夹分页加载：`load_more` 节点触发增量加载
- 展开/折叠操作仅更新扁平列表，不重建整棵树

---

## 7. 依赖关系

```
folder
├── 依赖 → note (笔记 CRUD 操作)
├── 依赖 → links (移动/重命名后修复链接)
├── 依赖 → search (操作后更新索引)
├── 依赖 → vault (当前 vault 路径)
├── 依赖 → tab (文件导航打开标签)
└── 被依赖 ← watcher (文件变更后刷新树)
```

---

## 8. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `user_folder_persist.reactor` | 持久化用户文件夹展开状态 |
| `starred_persist.reactor` | 持久化收藏列表 |
| `watcher.reactor` | 文件变更时刷新文件树 |
