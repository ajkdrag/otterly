# LeapGrowNotes 文件监听模块设计文档

> 文件系统变更监控与事件分发
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 文件变更监听 | ✅ 已实现 | 监控 vault 目录下的文件增删改 |
| 事件分发 | ✅ 已实现 | 通过 Tauri 事件通道分发变更事件 |
| Reactor 集成 | ✅ 已实现 | watcher.reactor 响应变更触发文件树刷新等操作 |
| Tauri 适配器 | ✅ 已实现 | 2 个后端命令（启动/停止监听） |

---

## 1. 设计理念

文件监听模块监控当前 vault 目录下的文件系统变更（创建、修改、删除、重命名），并将变更事件广播给前端。其他模块通过 reactor 订阅这些事件，实现文件树刷新、索引更新、Git 自动提交等联动行为。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/watcher/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   └── watcher_tauri_adapter.ts      # 文件监听 Tauri IPC 适配器
├── application/
│   └── watcher_service.ts            # 文件监听服务
└── types/
    └── watcher.ts                    # 变更事件类型定义
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `WatcherPort` 接口（启动/停止/事件监听） | `ports.ts` |
| **adapters** | Tauri IPC + 事件监听适配器 | `adapters/` |
| **application** | `WatcherService` 管理监听生命周期 | `application/` |
| **types** | 文件变更事件类型 | `types/` |

---

## 3. 核心接口

### 3.1 WatcherPort

```typescript
interface WatcherPort {
  start_watching(): Promise<void>;
  stop_watching(): Promise<void>;
  on_change(callback: (event: FileChangeEvent) => void): UnsubscribeFn;
}
```

### 3.2 FileChangeEvent 类型

```typescript
interface FileChangeEvent {
  type: "create" | "modify" | "delete" | "rename";
  paths: string[];       // 受影响的文件路径
  timestamp: number;
}
```

---

## 4. 事件流

```
文件系统变更
  ├── Rust 后端 (notify crate) 检测到变更
  ├── 通过 Tauri 事件通道发送到前端
  ├── WatcherPort.on_change 回调触发
  └── watcher.reactor 分发给各消费者
      ├── → folder (刷新文件树)
      ├── → search (增量更新索引)
      ├── → git (触发自动提交)
      └── → editor (冲突检测)
```

---

## 5. 后端实现（Rust）

基于 `notify` crate 实现文件系统监控：

| 命令 | 说明 |
| ---- | ---- |
| `watcher_start` | 启动文件监听（绑定到当前 vault 目录） |
| `watcher_stop` | 停止文件监听 |

### 过滤规则

- 忽略 `.git/` 目录
- 忽略临时文件（`~`、`.swp`、`.tmp`）
- 忽略 `node_modules/`
- 防抖处理：合并短时间内的连续变更

---

## 6. 依赖关系

```
watcher
├── 依赖 → vault (当前 vault 路径)
├── 依赖 → shared/adapters (Tauri IPC + 事件监听)
├── 被依赖 ← folder (文件树刷新)
├── 被依赖 ← search (索引增量更新)
├── 被依赖 ← git (自动提交触发)
└── 被依赖 ← editor (外部修改冲突检测)
```

---

## 7. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `watcher.reactor` | 监听文件变更事件，分发给文件树/索引/Git |
| `conflict_toast.reactor` | 检测外部修改冲突，弹出提示 |
