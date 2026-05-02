# LeapGrowNotes 设置系统模块设计文档

> 全局设置与 Vault 设置管理
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 全局设置 | ✅ 已实现 | 跨 vault 的全局配置 |
| Vault 设置 | ✅ 已实现 | 每个 vault 独立设置 |
| 设置 UI | ✅ 已实现 | 设置对话框 + 分类面板 |
| 设置注册表 | ✅ 已实现 | 声明式设置定义（`SETTINGS_REGISTRY`） |
| 实时预览 | ✅ 已实现 | 修改设置立即预览效果 |
| 设置回退 | ✅ 已实现 | 取消时恢复到保存状态 |
| 设置搜索 | ✅ 已实现 | Omnibar 中搜索设置项 |

---

## 1. 设计理念

设置系统采用**两级设置模型**：全局设置（跨 vault）和 vault 设置（per-vault）。通过声明式 `SETTINGS_REGISTRY` 定义所有设置项，支持实时预览和取消回退。设置通过端口接口抽象存储层，与 Tauri 后端解耦。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/settings/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   └── settings_tauri_adapter.ts     # 设置 Tauri IPC 适配器
├── application/
│   ├── settings_actions.ts           # Action 注册（打开/关闭/更新/保存）
│   └── settings_service.ts           # 设置服务（业务编排）
├── domain/
│   └── settings_registry.ts          # 声明式设置注册表
├── types/
│   ├── settings.ts                   # 设置类型定义
│   └── editor_settings.ts            # 编辑器设置类型
└── ui/
    └── settings_dialog.svelte        # 设置对话框组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `SettingsPort` 接口（get/set） | `ports.ts` |
| **adapters** | Tauri IPC 适配器 | `adapters/` |
| **application** | `SettingsService` 加载/保存/预览 + Action 注册 | `application/` |
| **domain** | `SETTINGS_REGISTRY` 声明式设置定义 | `domain/` |
| **ui** | 设置对话框 Svelte 组件 | `ui/` |

---

## 3. 核心接口

### 3.1 SettingsPort

```typescript
interface SettingsPort {
  get_setting<T>(key: string): Promise<T>;
  set_setting(key: string, value: unknown): Promise<void>;
}
```

### 3.2 SettingDefinition

```typescript
interface SettingDefinition {
  key: string;                    // 设置键名
  label: string;                  // 显示标签
  description: string;            // 描述说明
  category: string;               // 分类
  type: "text" | "number" | "boolean" | "select";  // 输入类型
  default_value: unknown;         // 默认值
  options?: { label: string; value: unknown }[];  // select 选项
  scope: "vault" | "global";      // 作用域
}
```

### 3.3 SettingsService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `load_settings()` | 加载 vault 设置 + 全局设置，合并为当前配置 |
| `save_settings(changes)` | 保存设置：vault 范围 → vault 存储，global 范围 → 全局存储 |
| `preview_settings(changes)` | 实时预览设置变更（不持久化） |
| `revert_settings()` | 恢复到上次保存的状态 |

---

## 4. 两级设置模型

```
全局设置 (global)        Vault 设置 (vault)
┌──────────────┐        ┌──────────────┐
│ theme        │        │ font_size    │
│ language     │        │ line_height  │
│ auto_update  │        │ editor_width │
│ ...          │        │ autosave     │
└──────────────┘        │ git_autocommit│
                        │ hotkey_overrides│
                        │ ...          │
                        └──────────────┘
```

- **全局设置**：主题、语言、自动更新等，跨所有 vault 共享
- **Vault 设置**：编辑器配置、Git 自动提交、快捷键覆盖等，per-vault 独立

---

## 5. 设置对话框流程

```
打开设置
  ├── 加载 vault + global 设置
  ├── 渲染设置面板（按分类）
  │
修改设置
  ├── 实时预览（编辑器宽度、字体等立即生效）
  ├── 暂存修改（不持久化）
  │
保存设置
  ├── vault 范围设置 → vault_settings_adapter
  ├── global 范围设置 → settings_adapter
  ├── 快捷键覆盖 → 保存到 vault
  └── 主题 → 保存到 global
  │
取消设置
  └── 恢复到打开时的状态
```

---

## 6. 后端命令（Tauri）

| 命令 | 说明 |
| ---- | ---- |
| `get_setting` | 读取全局设置项 |
| `set_setting` | 写入全局设置项 |
| `get_vault_setting` | 读取 vault 设置项 |
| `set_vault_setting` | 写入 vault 设置项 |

---

## 7. 依赖关系

```
settings
├── 依赖 → vault (vault 设置存储)
├── 依赖 → hotkey (快捷键覆盖管理)
├── 依赖 → theme (主题保存)
├── 依赖 → shared/adapters (Tauri IPC)
├── 被依赖 ← editor (编辑器设置)
├── 被依赖 ← git (自动提交设置)
└── 被依赖 ← search (Omnibar 设置搜索)
```
