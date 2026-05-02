# LeapGrowNotes 会话管理模块设计文档

> 会话持久化与恢复：标签页、光标、展开状态
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 会话持久化 | ✅ 已实现 | 通过 Tauri 命令保存/加载会话 |
| 标签页恢复 | ✅ 已实现 | 重启后恢复打开的标签页列表 |
| 光标位置恢复 | ✅ 已实现 | 重启后恢复每个文件的光标位置 |
| 会话适配器 | ✅ 已实现 | Tauri IPC 适配器 |

---

## 1. 设计理念

会话模块负责在应用关闭和重新打开之间保持用户的工作状态。将当前打开的标签页、活动标签、光标位置等信息持久化到后端存储，在下次打开同一 vault 时自动恢复，提供无缝的使用体验。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/session/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   └── session_tauri_adapter.ts      # 会话 Tauri IPC 适配器
├── application/
│   └── session_service.ts            # 会话服务（业务编排）
└── types/
    └── session.ts                    # 会话类型定义
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `SessionPort` 接口 | `ports.ts` |
| **adapters** | Tauri IPC 适配器 | `adapters/` |
| **application** | `SessionService` 编排会话保存与恢复 | `application/` |
| **types** | 会话数据结构定义 | `types/` |

---

## 3. 核心接口

### 3.1 SessionPort

```typescript
interface SessionPort {
  save_session(session: VaultSession): Promise<void>;
  load_session(): Promise<VaultSession | null>;
}
```

### 3.2 VaultSession 类型

```typescript
interface VaultSession {
  tabs: SessionTab[];            // 打开的标签列表
  active_tab_id: string | null;  // 活动标签 ID
  cursors: Record<string, number>; // 文件路径 → 光标位置
}

interface SessionTab {
  path: string;       // 笔记路径
  is_pinned: boolean; // 是否固定
}
```

### 3.3 SessionService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `save_session()` | 从 TabStore + EditorStore 收集状态 → 持久化 |
| `restore_session()` | 加载持久化数据 → 恢复标签页 + 切换到活动标签 |

---

## 4. 会话生命周期

### 4.1 保存时机

- **定期保存**：`session_persist.reactor` 监听 store 变更，防抖后自动保存
- **关闭保存**：`app_close_request.reactor` 在窗口关闭前保存
- **手动保存**：编辑器缓冲区刷写时触发

### 4.2 恢复流程

```
Vault 打开
  ├── 加载会话数据
  ├── 遍历 session.tabs
  │   ├── 检查文件是否仍存在
  │   ├── 存在 → 创建标签
  │   └── 不存在 → 跳过
  ├── 切换到 active_tab
  └── 恢复光标位置
```

---

## 5. 后端命令（Tauri）

| 命令 | 说明 |
| ---- | ---- |
| `save_vault_session` | 保存会话数据（JSON） |
| `load_vault_session` | 加载会话数据 |

---

## 6. 依赖关系

```
session
├── 依赖 → tab (读取当前标签状态)
├── 依赖 → editor (读取光标位置)
├── 依赖 → vault (per-vault 会话存储)
├── 依赖 → shared/adapters (Tauri IPC)
└── 被依赖 ← vault (vault 打开时恢复会话)
```

---

## 7. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `session_persist.reactor` | 监听 store 变更，防抖后自动保存会话 |
| `app_close_request.reactor` | 窗口关闭前保存会话 |
