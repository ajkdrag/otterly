# LeapGrowNotes 剪贴板模块设计文档

> 系统剪贴板读写操作
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 剪贴板写入 | ✅ 已实现 | 将文本写入系统剪贴板 |
| 剪贴板读取 | ✅ 已实现 | 从系统剪贴板读取文本 |
| Tauri 适配器 | ✅ 已实现 | 通过 Tauri 剪贴板插件实现 |

---

## 1. 设计理念

剪贴板模块提供统一的系统剪贴板操作抽象。通过端口接口隔离平台差异，使用 Tauri 剪贴板插件实现跨平台剪贴板访问。其他模块（如编辑器、搜索结果等）通过此模块与系统剪贴板交互。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/clipboard/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
└── adapters/
    └── clipboard_tauri_adapter.ts    # 剪贴板 Tauri 适配器
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `ClipboardPort` 接口 | `ports.ts` |
| **adapters** | Tauri 剪贴板插件适配器 | `adapters/` |

---

## 3. 核心接口

### 3.1 ClipboardPort

```typescript
interface ClipboardPort {
  write_text(text: string): Promise<void>;
  read_text(): Promise<string>;
}
```

---

## 4. 使用场景

| 场景 | 说明 |
| ---- | ---- |
| 复制文件路径 | 右键菜单复制笔记路径到剪贴板 |
| 复制搜索结果 | Omnibar 搜索结果复制 |
| 粘贴检测 | 编辑器粘贴时判断内容类型（文本/图片/Markdown） |

---

## 5. 依赖关系

```
clipboard
├── 依赖 → @tauri-apps/plugin-clipboard (Tauri 剪贴板插件)
├── 被依赖 ← editor (粘贴操作)
├── 被依赖 ← folder (复制路径)
└── 被依赖 ← note (复制笔记路径)
```

---

## 6. 设计说明

此模块是一个**轻量级基础设施模块**：
- 无独立的 `application/` 层（无复杂业务逻辑）
- 无独立的 `state/` 层（无需状态管理）
- 纯适配器模式：仅封装平台 API，提供统一接口
