# LeapGrowNotes 标签页模块设计文档

> 多标签页管理：打开、关闭、切换、拖拽排序、固定
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 标签页打开/关闭 | ✅ 已实现 | 打开笔记创建标签 + 关闭标签 |
| 标签页切换 | ✅ 已实现 | 点击切换 + 快捷键切换 |
| 拖拽排序 | ✅ 已实现 | 标签页拖拽重新排序 |
| 固定标签 | ✅ 已实现 | Pin 标签防止关闭 |
| 脏状态指示 | ✅ 已实现 | 未保存修改标记 |
| 标签栏 UI | ✅ 已实现 | 标签栏 + 右键菜单 |
| 会话恢复 | ✅ 已实现 | 重启后恢复上次打开的标签 |

---

## 1. 设计理念

标签页模块管理编辑器中同时打开的多个笔记，类似 VS Code 的标签页体验。支持拖拽排序、固定标签、脏状态指示，并通过 session 持久化在应用重启后恢复上次的工作状态。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/tab/
├── index.ts                          # 公共导出入口
├── application/
│   ├── tab_actions.ts                # Action 注册
│   └── tab_service.ts                # 标签页服务（业务编排）
├── state/
│   └── tab_store.svelte.ts           # 标签页响应式状态
├── types/
│   └── tab.ts                        # 标签页类型定义
└── ui/
    ├── tab_bar.svelte                # 标签栏容器
    └── tab_item.svelte               # 单个标签项组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **application** | `TabService` 编排标签打开/关闭/切换 + Action 注册 | `application/` |
| **state** | `TabStore` 管理标签列表、活动标签、脏状态 | `state/` |
| **types** | `Tab` 类型定义 | `types/` |
| **ui** | 标签栏 + 标签项 Svelte 组件 | `ui/` |

---

## 3. 核心接口

### 3.1 Tab 类型

```typescript
interface Tab {
  id: string;           // 唯一标识（通常为文件路径）
  path: string;         // 笔记文件路径
  title: string;        // 显示标题
  is_pinned: boolean;   // 是否固定
  is_dirty: boolean;    // 是否有未保存修改
}
```

### 3.2 TabStore 状态

| 状态字段 | 类型 | 说明 |
| -------- | ---- | ---- |
| `tabs` | `Tab[]` | 当前打开的所有标签 |
| `active_tab_id` | `string \| null` | 当前活动标签 ID |
| `tab_order` | `string[]` | 标签排序顺序 |

### 3.3 TabService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `open_tab(path)` | 打开标签：已存在则切换，不存在则创建 |
| `close_tab(id)` | 关闭标签：检查脏状态 → 确认 → 关闭 → 切换到相邻标签 |
| `close_other_tabs(id)` | 关闭除指定外的所有标签 |
| `close_all_tabs()` | 关闭所有标签 |
| `switch_tab(id)` | 切换到指定标签 |
| `pin_tab(id)` | 固定/取消固定标签 |
| `reorder_tabs(from, to)` | 拖拽重排标签顺序 |
| `mark_dirty(id)` | 标记标签为脏状态 |
| `mark_clean(id)` | 标记标签为干净状态 |

---

## 4. 标签页行为

### 4.1 打开策略

- 点击文件树中的笔记 → 打开标签
- 如果标签已存在 → 切换到该标签（不创建重复）
- 新标签插入到活动标签右侧

### 4.2 关闭策略

- 关闭标签时检查脏状态
- 有未保存修改 → 弹出保存确认对话框
- 关闭后自动切换到相邻标签（优先右侧，其次左侧）
- 固定标签不响应 "关闭其他" 操作

### 4.3 脏状态同步

通过 `tab_dirty_sync.reactor` 实现：
- 监听编辑器内容变更 → 标记标签为 dirty
- 保存成功后 → 标记标签为 clean

---

## 5. 依赖关系

```
tab
├── 依赖 → editor (标签切换触发编辑器会话切换)
├── 依赖 → note (获取笔记标题)
├── 被依赖 ← editor (脏状态同步)
├── 被依赖 ← note (删除笔记关闭标签)
├── 被依赖 ← folder (文件导航打开标签)
└── 被依赖 ← session (会话恢复重建标签)
```

---

## 6. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `tab_dirty_sync.reactor` | 同步编辑器脏状态到标签 |
| `editor_sync.reactor` | 标签切换触发编辑器会话切换 |
| `session_persist.reactor` | 持久化标签列表用于会话恢复 |
