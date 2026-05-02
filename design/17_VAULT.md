# LeapGrowNotes Vault 管理模块设计文档

> Vault（知识库）的打开、切换、注册与设置管理
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| Vault 打开/切换 | ✅ 已实现 | 目录选择器 + vault 初始化 + 索引构建 |
| Vault 注册表 | ✅ 已实现 | 已打开 vault 列表 + 记忆上次打开 |
| Vault 设置 | ✅ 已实现 | 每个 vault 独立设置 + 全局设置覆盖 |
| 编辑器设置 | ✅ 已实现 | 字体大小/行高/宽度/自动保存等 per-vault 配置 |
| 欢迎页面 | ✅ 已实现 | 首次启动/无 vault 时显示 |
| 目录选择对话框 | ✅ 已实现 | 原生系统目录选择器 |
| Staleness 保护 | ✅ 已实现 | revision 机制防止过期操作 |

---

## 1. 设计理念

Vault 是 LeapGrowNotes 的顶层组织单元，对应一个本地文件夹。每个 vault 独立拥有笔记、索引、设置和统计数据。Vault 模块负责 vault 的完整生命周期管理，是应用启动流程的核心入口。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/vault/
├── index.ts                              # 公共导出入口
├── ports.ts                              # 端口接口定义
├── adapters/
│   ├── dialog_adapter.ts                 # 原生目录选择器适配器
│   ├── vault_tauri_adapter.ts            # Vault Tauri IPC 适配器
│   └── vault_settings_tauri_adapter.ts   # Vault 设置 Tauri IPC 适配器
├── application/
│   ├── vault_service.ts                  # Vault 服务（核心业务编排）
│   └── vault_actions.ts                  # Action 注册
├── domain/
│   ├── editor_settings.ts                # 编辑器设置领域逻辑
│   └── vault_path.ts                     # Vault 路径处理
├── state/
│   └── vault_store.svelte.ts             # Vault 响应式状态
├── types/
│   ├── vault.ts                          # Vault 类型定义
│   └── vault_settings.ts                 # Vault 设置类型
└── ui/
    ├── welcome_screen.svelte             # 欢迎页面
    └── vault_switcher.svelte             # Vault 切换器
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `VaultPort`（vault CRUD）和 `VaultSettingsPort`（设置读写）接口 | `ports.ts` |
| **adapters** | Tauri IPC + 原生目录选择器 | `adapters/` |
| **application** | `VaultService` 编排：初始化、打开、切换、设置管理 | `application/` |
| **domain** | 编辑器设置默认值/合并逻辑、vault 路径处理 | `domain/` |
| **state** | `VaultStore` 管理当前 vault、vault 列表、设置 | `state/` |
| **ui** | 欢迎页面 + vault 切换器 | `ui/` |

---

## 3. 核心接口

### 3.1 VaultPort

```typescript
interface VaultPort {
  open_vault(path: string): Promise<VaultInfo>;
  open_vault_by_id(id: string): Promise<VaultInfo>;
  list_vaults(): Promise<VaultEntry[]>;
  remove_vault_from_registry(id: string): Promise<void>;
  remember_last_vault(id: string): Promise<void>;
  get_last_vault_id(): Promise<string | null>;
}
```

### 3.2 VaultSettingsPort

```typescript
interface VaultSettingsPort {
  get_vault_setting<T>(key: string): Promise<T>;
  set_vault_setting(key: string, value: unknown): Promise<void>;
}
```

---

## 4. Vault 生命周期

### 4.1 应用启动流程

```
App 启动
  ├── 检查 last_vault_id
  │   ├── 有 → open_vault_by_id → 初始化 vault
  │   └── 无 → 显示欢迎页面
  │
初始化 vault
  ├── 加载 vault 信息 → VaultStore
  ├── 加载 vault 设置（编辑器配置等）
  ├── 构建/增量更新工作区索引
  ├── 恢复上次会话（打开的标签页、光标位置）
  └── 加载文件树
```

### 4.2 Vault 切换流程

```
切换 Vault
  ├── 刷写当前编辑器缓冲区
  ├── 保存当前会话状态
  ├── 关闭当前 vault
  ├── 打开新 vault（同启动流程）
  └── revision 自增（防止过期回调）
```

---

## 5. Staleness 保护机制

使用 `revision` 计数器防止异步操作在 vault 切换后执行过期回调：

- 每次 vault 切换/打开时 revision 自增
- 异步操作（索引构建、文件加载等）在回调前检查 revision 是否一致
- 不一致则丢弃结果，避免数据错乱

---

## 6. 后端命令（Tauri）

| 命令 | 说明 |
| ---- | ---- |
| `open_vault` | 打开指定路径的 vault |
| `open_vault_by_id` | 通过 ID 打开 vault |
| `list_vaults` | 列出所有已注册 vault |
| `remove_vault_from_registry` | 从注册表移除 vault |
| `remember_last_vault` | 记忆最后打开的 vault ID |
| `get_last_vault_id` | 获取最后打开的 vault ID |
| `get_vault_setting` | 读取 vault 设置项 |
| `set_vault_setting` | 写入 vault 设置项 |

---

## 7. 依赖关系

```
vault
├── 依赖 → shared/adapters (Tauri IPC)
├── 被依赖 ← 几乎所有模块（vault 是顶层上下文）
├── 被依赖 ← editor (vault 路径、编辑器设置)
├── 被依赖 ← note (当前 vault 下的笔记操作)
├── 被依赖 ← search (当前 vault 的索引)
├── 被依赖 ← folder (文件树加载)
├── 被依赖 ← settings (vault 设置读写)
└── 被依赖 ← session (会话恢复)
```
