# LeapGrowNotes Git 版本控制模块设计文档

> Git 集成：初始化、提交、历史、检查点、Diff、自动提交
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现（7 个 Tauri 命令）

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| Git 初始化 | ✅ 已实现 | vault 目录下 `git init` |
| Git 状态查询 | ✅ 已实现 | 工作区变更文件列表 |
| Git 提交 | ✅ 已实现 | 手动提交 + 自定义消息 |
| 提交历史 | ✅ 已实现 | 历史记录列表 + 分页 |
| 检查点 | ✅ 已实现 | 一键创建快照 |
| 检查点恢复 | ✅ 已实现 | 恢复到指定检查点 |
| Diff 查看 | ✅ 已实现 | 文件变更对比视图 |
| 自动提交 | ✅ 已实现 | 文件变更触发自动 commit（可配置） |
| Git UI 组件 | ✅ 已实现 | 状态挂件 + 提交对话框 + 历史对话框 + Diff 视图 |
| Auto push/pull | ❌ 未实现 | 远端管理尚未开发 |
| 冲突解决 UI | ❌ 未实现 | 冲突检测与合并界面 |

---

## 1. 设计理念

Git 模块为 LeapGrowNotes 提供本地版本控制能力，基于 Rust `git2` crate 实现。用户可以手动创建检查点、查看历史、恢复版本。结合自动提交 reactor，实现文件变更的自动快照。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/git/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   └── git_tauri_adapter.ts          # Git Tauri IPC 适配器
├── application/
│   ├── git_actions.ts                # Action 注册
│   └── git_service.ts                # Git 服务（业务编排）
├── state/
│   └── git_store.svelte.ts           # Git 响应式状态
├── types/
│   └── git.ts                        # Git 类型定义
└── ui/
    ├── checkpoint_dialog.svelte      # 检查点创建对话框
    ├── git_diff_view.svelte          # Diff 对比视图
    ├── git_status_widget.svelte      # Git 状态挂件（侧边栏）
    └── version_history_dialog.svelte # 版本历史对话框
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `GitPort` 接口：init/status/commit/history/checkpoint/restore/diff | `ports.ts` |
| **adapters** | 通过 Tauri IPC 调用后端 git2 命令 | `adapters/` |
| **application** | `GitService` 编排 + Action 注册 | `application/` |
| **state** | `GitStore` 管理变更状态、历史、Diff 数据 | `state/` |
| **ui** | 状态挂件 + 提交/历史/Diff 对话框 | `ui/` |

---

## 3. 核心接口

### 3.1 GitPort

```typescript
interface GitPort {
  init(): Promise<void>;
  status(): Promise<GitStatus>;
  commit(message: string): Promise<void>;
  history(page?: number, limit?: number): Promise<GitCommit[]>;
  checkpoint(message?: string): Promise<void>;
  restore(commit_hash: string): Promise<void>;
  diff(commit_hash?: string): Promise<GitDiff[]>;
}
```

### 3.2 GitService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `refresh_status()` | 刷新工作区变更状态 |
| `create_checkpoint(message?)` | 创建检查点：stage all → commit |
| `restore_checkpoint(hash)` | 恢复到检查点：reset → 刷新状态 |
| `load_history(page?)` | 加载提交历史（分页） |
| `load_diff(hash?)` | 加载文件 Diff |

---

## 4. 自动提交机制

通过 `git_autocommit.reactor` 实现：

1. 监听 `watcher` 模块的文件变更事件
2. 检查设置中 `git_autocommit` 是否启用
3. 触发防抖延迟后自动 `checkpoint`
4. 提交消息格式：`auto: <timestamp>`

---

## 5. 后端实现（Rust）

基于 `git2` crate（libgit2 绑定）：

| 命令 | 说明 |
| ---- | ---- |
| `git_init` | 初始化 Git 仓库 |
| `git_status` | 获取工作区状态 |
| `git_commit` | 提交变更 |
| `git_history` | 获取提交历史 |
| `git_checkpoint` | 创建快速检查点 |
| `git_restore` | 恢复到指定提交 |
| `git_diff` | 获取文件 Diff |

---

## 6. 依赖关系

```
git
├── 依赖 → vault (当前 vault 路径)
├── 依赖 → watcher (文件变更事件，用于自动提交)
├── 依赖 → shared/adapters (Tauri IPC)
└── reactor: git_autocommit (监听变更触发自动提交)
```

---

## 7. 未来规划

| 功能 | 优先级 | 说明 |
| ---- | ------ | ---- |
| Auto push/pull | 高 | 远端仓库管理 + 自动同步 |
| 冲突检测 | 高 | 合并冲突检测与提示 |
| 冲突解决 UI | 中 | 可视化合并编辑器 |
| 分支管理 | 低 | 多分支支持 |
| 同步状态指示器 | 中 | 实时显示同步状态 |
