# LeapGrowNotes 快捷键模块设计文档

> 可重绑定的快捷键系统
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 默认快捷键 | ✅ 已实现 | 21 个内置默认快捷键 |
| 快捷键重绑定 | ✅ 已实现 | 用户可自定义快捷键 |
| 冲突检测 | ✅ 已实现 | 绑定时自动检测快捷键冲突 |
| 保留键过滤 | ✅ 已实现 | 系统保留键不可绑定 |
| 录制器 UI | ✅ 已实现 | 快捷键录制对话框 |
| 快捷键面板 | ✅ 已实现 | 设置中的快捷键管理面板 |
| 快捷键显示 | ✅ 已实现 | 格式化快捷键显示（⌘/⌥/⇧ 等） |

---

## 1. 设计理念

快捷键模块提供完全可定制的键盘快捷键系统。用户可以查看、搜索和重绑定任何已注册的快捷键。系统自动检测冲突，防止同一快捷键绑定到多个操作。快捷键与 Action Registry 集成，每个快捷键对应一个注册的 action_id。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/hotkey/
├── index.ts                          # 公共导出入口
├── application/
│   ├── hotkey_actions.ts             # Action 注册
│   └── hotkey_service.ts             # 快捷键服务（业务编排）
├── domain/
│   ├── default_hotkeys.ts            # 21 个默认快捷键定义
│   └── hotkey_validation.ts          # 快捷键验证逻辑
├── types/
│   └── hotkey_config.ts              # 快捷键类型定义
└── ui/
    ├── hotkey_key.svelte             # 快捷键显示组件
    ├── hotkey_recorder_dialog.svelte # 快捷键录制对话框
    └── hotkeys_panel.svelte          # 快捷键管理面板
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **application** | `HotkeyService` 编排绑定/重绑定/冲突检测 | `application/` |
| **domain** | 默认快捷键表 + 验证逻辑（保留键、格式化、冲突检测） | `domain/` |
| **types** | 快捷键类型定义 | `types/` |
| **ui** | 快捷键面板 + 录制器 Svelte 组件 | `ui/` |

---

## 3. 核心类型

### 3.1 HotkeyBinding

```typescript
interface HotkeyBinding {
  action_id: string;          // 关联的 action ID
  key: HotkeyKey;             // 快捷键组合（如 "mod+k"）
  phase: HotkeyPhase;        // "capture" | "bubble"
  label: string;              // 显示标签
  description: string;        // 描述说明
  category: HotkeyCategory;  // 分类
  when?: string;              // 条件表达式
}

type HotkeyCategory = "general" | "editor" | "navigation" | "file" | "view";
```

---

## 4. 默认快捷键

共 21 个默认快捷键，分 5 个类别：

| 类别 | 快捷键示例 | 操作 |
| ---- | ---------- | ---- |
| General | `Mod+K` | 打开命令面板 |
| General | `Mod+P` | 打开 Omnibar |
| Editor | `Mod+S` | 保存当前笔记 |
| Editor | `Mod+F` | 文件内查找 |
| Navigation | `Mod+1~9` | 切换到第 N 个标签 |
| File | `Mod+N` | 创建新笔记 |
| View | `Mod+B` | 切换侧边栏 |
| View | `Mod+\\` | 切换链接面板 |

---

## 5. 验证逻辑

### 5.1 保留键

系统保留以下按键不可被绑定：

- 单独的修饰键（Ctrl、Alt、Shift、Meta）
- Tab、Escape（部分场景保留）
- 浏览器默认快捷键（如 Ctrl+W 关闭标签页）

### 5.2 冲突检测

```
用户录制快捷键
  ├── 检查是否为保留键 → 是 → 报错
  ├── 检查是否与现有绑定冲突
  │   ├── 冲突 → 显示冲突信息 + 确认覆盖
  │   └── 无冲突 → 直接绑定
  └── 保存到 vault 设置
```

### 5.3 格式化显示

| 平台 | `mod` 显示为 | 示例 |
| ---- | ----------- | ---- |
| macOS | `⌘` | `⌘K` |
| Windows/Linux | `Ctrl` | `Ctrl+K` |

---

## 6. 依赖关系

```
hotkey
├── 依赖 → app/action_registry (快捷键触发 action)
├── 依赖 → vault (快捷键覆盖保存在 vault 设置中)
├── 依赖 → settings (快捷键面板嵌入设置对话框)
└── 被依赖 ← hooks/use_keyboard_shortcuts (全局快捷键监听)
```
