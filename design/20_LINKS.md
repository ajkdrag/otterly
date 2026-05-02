# LeapGrowNotes 链接系统模块设计文档

> Backlinks / Outlinks / Wiki-link 解析与链接修复
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| Backlinks 面板 | ✅ 已实现 | 显示引用当前笔记的所有笔记 |
| Outlinks 面板 | ✅ 已实现 | 显示当前笔记引用的所有笔记 |
| 链接修复服务 | ✅ 已实现 | 笔记重命名/移动后自动更新相关链接 |
| 链接存储 | ✅ 已实现 | Svelte 5 响应式 store |
| Context Rail UI | ✅ 已实现 | 右侧边栏链接面板 |
| 图谱可视化 | ❌ 未实现 | 知识图谱视图 |

---

## 1. 设计理念

链接系统是知识关联的核心，通过解析笔记中的 `[[wikilink]]` 和 Markdown 链接，维护笔记间的双向引用关系。当笔记被重命名或移动时，链接修复服务自动更新所有受影响的引用，确保链接不会断裂。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/links/
├── index.ts                          # 公共导出入口
├── application/
│   ├── links_service.ts              # 链接服务（查询 backlinks/outlinks）
│   ├── link_repair_service.ts        # 链接修复服务
│   └── link_repair_operation.ts      # 链接修复操作实现
├── state/
│   └── links_store.svelte.ts         # 链接响应式状态
├── types/
│   └── link.ts                       # 链接类型定义
└── ui/
    ├── context_rail.svelte           # 右侧上下文边栏
    ├── links_panel.svelte            # 链接面板容器
    ├── link_section.svelte           # 链接分组组件
    └── link_item.svelte              # 单个链接项组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **application** | `LinksService` 查询链接 + `LinkRepairService` 修复链接 | `application/` |
| **state** | `LinksStore` 管理当前笔记的 backlinks/outlinks | `state/` |
| **types** | 链接条目类型定义 | `types/` |
| **ui** | Context Rail + 链接面板 UI | `ui/` |

---

## 3. 核心接口

### 3.1 链接类型

```typescript
interface LinkEntry {
  source_path: string;      // 来源笔记路径
  target_path: string;      // 目标笔记路径
  link_text: string;        // 链接显示文本
  link_type: "wiki" | "markdown";  // 链接类型
  context?: string;         // 链接周围的上下文文本
}
```

### 3.2 LinksService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `get_backlinks(path)` | 获取引用当前笔记的所有链接 |
| `get_outlinks(path)` | 获取当前笔记引用的所有链接 |
| `sync_links(path)` | 同步当前笔记的链接数据到 store |

### 3.3 LinkRepairService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `repair_on_rename(old_path, new_path)` | 笔记重命名后修复所有指向它的链接 |
| `repair_on_move(old_path, new_path)` | 笔记移动后修复所有相关链接 |
| `repair_folder_rename(old_folder, new_folder)` | 文件夹重命名后批量修复 |

---

## 4. 链接修复机制

### 4.1 修复流程

```
笔记重命名/移动
  ├── 获取指向旧路径的所有 backlinks
  ├── 遍历每个引用笔记
  │   ├── 读取笔记内容
  │   ├── 替换 [[旧链接]] → [[新链接]]
  │   ├── 替换 [text](旧路径) → [text](新路径)
  │   └── 写回笔记
  └── 更新搜索索引
```

### 4.2 支持的链接格式

| 格式 | 示例 | 修复方式 |
| ---- | ---- | -------- |
| Wiki-link | `[[Note Name]]` | 替换目标名称 |
| Wiki-link (别名) | `[[Note Name|显示文本]]` | 只替换路径部分 |
| Markdown 链接 | `[text](path/to/note.md)` | 替换路径部分 |
| 相对路径链接 | `[text](../folder/note.md)` | 重新计算相对路径 |

---

## 5. 依赖关系

```
links
├── 依赖 → search (查询 backlinks/outlinks 数据)
├── 依赖 → note (读写笔记内容进行链接修复)
├── 依赖 → vault (当前 vault 路径)
├── 被依赖 ← note (重命名/移动触发链接修复)
├── 被依赖 ← folder (文件夹重命名触发链接修复)
└── 被依赖 ← editor (Wiki-link 插件导航)
```

---

## 6. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `backlinks_sync.reactor` | 切换笔记时自动同步 backlinks |
| `local_links_sync.reactor` | 本地链接数据同步 |

---

## 7. 未来规划

| 功能 | 优先级 | 说明 |
| ---- | ------ | ---- |
| 知识图谱可视化 | 中 | 节点-边可视化笔记关系 |
| 孤立笔记检测 | 低 | 发现没有链接的孤立笔记 |
| 断链检测 | 中 | 发现指向不存在笔记的链接 |
