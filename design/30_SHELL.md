# LeapGrowNotes Shell 命令模块设计文档

> 系统 Shell 命令执行与外部程序调用
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| Shell 命令执行 | ✅ 已实现 | 执行系统命令 |
| 路径在文件管理器中打开 | ✅ 已实现 | 在系统文件管理器中打开目录 |
| URL 在浏览器中打开 | ✅ 已实现 | 在默认浏览器中打开链接 |
| Tauri 适配器 | ✅ 已实现 | 通过 Tauri Shell 插件实现 |

---

## 1. 设计理念

Shell 模块提供与操作系统交互的能力，包括执行命令、打开文件管理器、打开浏览器链接等。通过端口抽象隔离平台差异，确保核心业务逻辑不直接依赖操作系统 API。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/shell/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
└── adapters/
    └── shell_tauri_adapter.ts        # Shell Tauri 适配器
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `ShellPort` 接口 | `ports.ts` |
| **adapters** | Tauri Shell 插件适配器 | `adapters/` |

---

## 3. 核心接口

### 3.1 ShellPort

```typescript
interface ShellPort {
  open_url(url: string): Promise<void>;
  open_path(path: string): Promise<void>;
  execute(command: string, args?: string[]): Promise<ShellResult>;
}

interface ShellResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}
```

---

## 4. 使用场景

| 场景 | 调用方法 | 说明 |
| ---- | -------- | ---- |
| 打开外部链接 | `open_url(url)` | 编辑器中点击外部 URL |
| 在文件管理器中显示 | `open_path(path)` | 右键菜单 "在 Finder/Explorer 中显示" |
| 打开终端 | `execute(...)` | 在 vault 目录打开终端 |

---

## 5. 依赖关系

```
shell
├── 依赖 → @tauri-apps/plugin-shell (Tauri Shell 插件)
├── 被依赖 ← editor (外部链接点击)
├── 被依赖 ← folder (在文件管理器中显示)
└── 被依赖 ← hooks/use_external_links (全局外部链接处理)
```

---

## 6. 设计说明

此模块与 clipboard 模块类似，是**轻量级基础设施模块**：
- 无独立的 `application/` 层
- 无独立的 `state/` 层
- 纯适配器模式：封装 Tauri Shell 插件，提供跨平台统一接口
- 安全考量：Shell 命令执行受 Tauri 权限系统约束
