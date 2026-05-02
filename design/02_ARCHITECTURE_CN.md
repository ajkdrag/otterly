# 系统架构

## LeapGrowNotes 是什么？

LeapGrowNotes 是一个桌面笔记应用，使用 **Tauri**（Rust 后端）和 **SvelteKit**（TypeScript 前端，Svelte 5）构建。笔记以本地 Markdown 文件的形式存储，按 vault（知识库）组织。应用提供富文本编辑（ProseMirror）、全文搜索（SQLite FTS）、wiki 风格链接、多标签页、Git 版本管理和主题切换。所有状态管理位于前端；Rust 后端是一个精简的 IPC 层，对外暴露原生能力。

## 如何构建的？

### 核心模型

前端围绕四个层和一个统一调度面构建：

1. **Ports + Adapters（端口 + 适配器）** — 为每个 IO 边界（文件系统、IPC、剪贴板、搜索索引）定义接口。适配器为 Tauri 实现这些接口；服务（Service）从不直接导入适配器。
2. **Stores（状态存储）** — 持有应用状态的响应式 `$state` 类。同步、确定性、无副作用。
3. **Services（服务）** — 异步用例编排。一个公开方法 = 一个用户意图。服务读写 Store，并通过 Port 调用 IO。
4. **Reactors（反应器）** — 持久的 `$effect.root()` 观察者，监听 Store 变化并触发 Service 调用。唯一允许 Store 观察驱动副作用的地方。

**Action Registry（动作注册表）** 是统一调度面。UI、键盘快捷键、命令面板和 Tauri 菜单都通过 `action_registry.execute(ACTION_ID, ...args)` 触发行为。

```
┌──────────────────────────────────────────────────┐
│  UI  (Svelte 5 + shadcn-svelte)                  │
│  通过 $derived 读取 Store。                       │
│  通过 action_registry.execute() 触发动作。        │
└────────────────────┬─────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Action Registry   │  可触发动作的类型映射表。
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │      Services       │  异步编排。
          │  读写 Stores        │  通过 Ports 调用 IO。
          └───────┬─────┬───────┘
                  │     │
       ┌──────────▼┐   ┌▼──────────┐
       │   Stores   │   │   Ports   │  IO 接口定义。
       │  ($state)  │   │ (接口)    │  由 Adapters 实现。
       └──────┬─────┘   └───────────┘
              │
  ┌───────────┴───────────┐
  │                       │
┌─▼────────┐       ┌─────▼──────────┐
│ UI 读取   │       │    Reactors    │  $effect.root() 观察者。
│ $derived  │       │ (副作用)       │  在 Store 变化时触发 Service。
└──────────┘       └────────────────┘
```

### 运行时循环

当用户点击按钮、按下快捷键或选择命令时：

1. UI 调用 `action_registry.execute(ACTION_ID, ...args)`。
2. 动作处理器调用 Service 方法（或直接修改 UIStore 处理纯 UI 逻辑）。
3. Service 通过 Port 执行 IO，然后更新领域 Store / OpStore。
4. 动作将 Service 返回结果中的 UI 侧变更应用到状态（选中文件夹、对话框状态）。
5. 组件通过 `$derived` 从 Store 状态重新渲染。
6. 观察到相关 Store 变化的 Reactor 触发后续 Service 调用（自动保存、标签页持久化、Git 自动提交等）。

## 项目结构

### 功能模块

每个功能是一个垂直切片，拥有自己的 Store、Service、Action、Port、Adapter、领域逻辑和 UI：

| 功能模块    | 职责                                                    |
| ----------- | ------------------------------------------------------- |
| `vault`     | Vault 注册、打开/关闭生命周期、设置、文件监视初始化     |
| `note`      | 笔记增删改查、保存/重命名/删除、图片资产                |
| `folder`    | 文件夹增删改查、文件树渲染、拖拽移动                    |
| `editor`    | ProseMirror 会话、缓冲区管理、Markdown 同步             |
| `search`    | 全文搜索、Omnibar、文件内搜索、Wiki 链接建议            |
| `tab`       | 标签栏、标签生命周期、标签缓存与持久化                  |
| `git`       | Git 初始化、状态、提交、历史、检查点、恢复              |
| `settings`  | 应用设置和 Vault 设置的读写                             |
| `hotkey`    | 自定义快捷键编辑与持久化                                |
| `theme`     | 主题增删改查、切换、自定义主题编辑                      |
| `links`     | 反向链接、本地链接、重命名时链接修复                    |
| `clipboard` | 复制 Markdown 到剪贴板                                  |
| `shell`     | 打开外部 URL                                            |
| `watcher`   | 文件系统监视器启停                                      |

### 目录结构（前两层）

```
src/
├── lib/
│   ├── app/              # 启动引导、Action Registry、依赖注入、编排（UIStore、OpStore）
│   ├── features/         # 功能优先的垂直切片
│   ├── shared/           # 跨功能共享：类型、工具、适配器、常量、数据库
│   ├── reactors/         # 持久化 Store 观察者
│   ├── components/       # 共享 UI 基础组件（shadcn-svelte）
│   └── hooks/            # 共享钩子（键盘快捷键、外部链接）
├── routes/               # SvelteKit 入口点（+page.svelte）

src-tauri/src/
├── app/                  # Tauri 构建器、插件/状态/命令注册
├── features/             # Rust 功能模块（vault、notes、search、git 等）
├── shared/               # Vault 注册持久化、常量、资源请求处理
└── tests/                # 集成测试入口

tests/
└── unit/                 # 前端单元测试（stores、services、reactors、adapters 等）
```

### 跨运行时分离

功能存在于两个运行时中，但物理上保持分离：TypeScript 在 `src/lib/features/<name>/`，Rust 在 `src-tauri/src/features/<name>/`。当表示相同能力时，功能名称在两个运行时中保持一致。TS 通过功能适配器（`*_tauri_adapter.ts`）专门调用 Rust，这些适配器调用 `@tauri-apps/api` IPC。Rust 仅暴露 `#[tauri::command]` 函数 — 无直接前端耦合。

## 功能模块解剖

以 `note` 为例：

```
src/lib/features/note/
├── index.ts              # 公共入口：重新导出其他功能模块可能需要导入的内容
├── ports.ts              # IO 契约（NotesPort、AssetsPort 接口）
├── state/
│   └── note_store.svelte.ts   # $state 类：笔记列表、最近笔记、收藏、文件夹
├── application/
│   ├── note_service.ts        # 异步用例：打开、保存、重命名、删除
│   ├── note_actions.ts        # Action 注册（调用 Service + 修改 UIStore）
│   └── note_action_helpers.ts # Action 共享辅助函数
├── domain/
│   ├── ensure_open_note.ts    # 纯业务规则（无 IO、无框架）
│   ├── sanitize_note_name.ts
│   └── ...
├── adapters/
│   ├── notes_tauri_adapter.ts # 实现 NotesPort 的 Tauri IPC 适配器
│   └── assets_tauri_adapter.ts
├── types/
│   └── note_service_result.ts # Service 方法的返回类型
└── ui/
    ├── note_editor.svelte     # 功能模块内的 UI 组件
    ├── rename_note_dialog.svelte
    └── ...
```

每个功能模块都遵循此模式。跨功能导入通过 `index.ts` 入口点进行，从不使用深层文件路径。

## 状态所有权

### 领域 Store（`src/lib/features/*/state/*_store.svelte.ts`）

每个功能拥有自己的领域状态：`VaultStore`、`NotesStore`、`EditorStore`、`SearchStore`、`TabStore`、`GitStore`、`LinksStore`。这些是 `$state` 类，在 `create_app_stores()` 中实例化一次。

- **谁写入**：Service（IO 完成后）和 Action（立即修改时）。
- **谁读取**：组件通过 `$derived`、Reactor 通过 `$effect`、Service（在 IO 前检查当前状态）。
- **规则**：仅同步。不允许 async/await。不允许从 Service、Adapter、Reactor 或 UI 导入。

### UIStore（`src/lib/app/orchestration/ui_store.svelte.ts`）

临时的跨界面 UI 状态：对话框开关、侧边栏视图、Omnibar 状态、编辑器设置、快捷键录制器、选中文件夹路径。组件和 Action 直接修改它。

- **谁写入**：Action 和组件。
- **谁读取**：组件和 Reactor。
- **规则**：Service 不得导入 UIStore。UI 编排属于 Action 职责。

### OpStore（`src/lib/app/orchestration/op_store.svelte.ts`）

按键追踪异步操作状态（`idle` | `pending` | `success` | `error`）及错误消息。底层使用 `SvelteMap`。

- **谁写入**：Service 调用 `start()`、`succeed()`、`fail()`。
- **谁读取**：组件通过 `is_pending()` 和 `get()` 显示加载/错误 UI。

### 组件局部状态

纯视觉关注点（焦点、滚动位置、动画）作为局部 `$state`、`$derived` 或 `$effect` 保留在组件内部。

## 决策树：新代码放在哪里？

```
开始
  │
  ├─ 是 IO 操作吗？（文件、IPC、原生 API）
  │    └─ Port 接口 + Adapter
  │
  ├─ 持久化领域数据？
  │    └─ 领域 Store 修改
  │
  ├─ 临时 UI 布局？（侧边栏、弹窗、面板）
  │    └─ UIStore — 组件直接修改，无需 Service
  │
  ├─ 异步操作的加载/错误状态？
  │    └─ OpStore — Service 写入，组件读取
  │
  ├─ 用户可触发的动作？（点击、快捷键、菜单）
  │    └─ ActionRegistry 条目 → 调用 Service 方法
  │
  ├─ 包含 IO + Store 更新的异步工作流？
  │    └─ Service 方法
  │
  ├─ Store 变化必须自动触发副作用？
  │    └─ Reactor
  │
  ├─ 从现有状态计算得出？
  │    └─ Store 或组件中的 $derived
  │
  └─ 仅视觉效果？（焦点、滚动、动画）
       └─ 组件局部的 $effect / $state
```

## 核心规则

1. **所有 IO 通过 Port/Adapter 进行。** 不在 Adapter 文件之外调用 `invoke()`。（保持 IO 可测试和可替换。）
2. **Store 是同步且无副作用的。** 不允许 async/await，不允许从 Service/Port/Domain 导入。（防止隐式耦合和竞态条件。）
3. **Service 从不订阅 Store 变化。** 它们读取 Store 但不得使用 `$effect`。Store 观察属于 Reactor 职责。（明确分离"执行工作"与"响应变化"。）
4. **Reactor 是唯一触发副作用的持久 Store 观察者。** 它们调用 Service 或纯运行时工具；从不直接写入 Store。（统一的响应式副作用机制。）
5. **用户可触发行为使用 Action Registry。** 组件调用 `action_registry.execute()`，从不直接调用 Service 来产生副作用。（快捷键、菜单、命令面板和 UI 共用一个调度面。）
6. **组件不导入 Service。**（强制 Action Registry 作为唯一交互路径。）
7. **Service 从不导入 UIStore。** UI 编排属于 Action 职责。（保持 Service 可测试，无 UI 耦合。）
8. **不使用全局单例。** 使用 Svelte context + 组合根。（可测试、可预测的生命周期。）
9. **每个关注点一个真实来源。** ProseMirror 拥有实时文档内容。领域 Store 拥有持久化状态。OpStore 拥有操作状态。UIStore 拥有布局/对话框状态。（不存在竞争的真实来源。）
10. **跨功能导入通过入口点进行。** 导入 `$lib/features/<name>`，从不使用深层路径如 `$lib/features/<name>/state/...`。（稳定的公共接口，重构安全的内部实现。）

### 分层检查

`pnpm lint:layering`（通过 `scripts/lint_layering_rules.mjs`）静态强制执行这些规则：

- `stores` 不能导入 ports、adapters、services、reactors、actions、components 或 domain；不能使用 `async`/`await`
- `services` 不能导入 adapters、components 或 reactors；不能使用 `$effect`；不能导入 `ui_store.svelte`
- `reactors` 不能导入 adapters 或 components；不应使用内联 `await`
- `actions` 不能导入 ports、adapters 或 components
- `components` 不能导入 ports、adapters、services 或 reactors
- `routes` 不能导入 ports、services、stores、reactors 或 actions；应使用 context 辅助函数
- 禁止跨功能深层导入；通过功能入口点导入
- 应用代码不能从 `tests/` 导入

## 约定

### 命名

- **文件**：snake_case（`note_service.ts`、`note_store.svelte.ts`、`notes_tauri_adapter.ts`）
- **功能入口点**：`src/lib/features/<name>/index.ts`
- **Stores**：`*_store.svelte.ts`
- **Services**：`*_service.ts`
- **Actions**：`*_actions.ts`
- **Adapters**：`*_tauri_adapter.ts`
- **Reactors**：`*.reactor.svelte.ts`

### 测试

- 测试位于顶层 `tests/unit/`，按语义分组：`stores/`、`services/`、`reactors/`、`adapters/`、`utils/`、`actions/`、`domain/`、`hooks/`、`db/`
- 共享 fixtures 和 mock ports 位于 `tests/unit/helpers/`
- 测试必须确定性、可读性强，并在断言错误时清晰报错
- 除非逻辑不明显，否则测试中不写注释/文档字符串

### 依赖注入

Service 通过构造函数注入接收 Port 和 Store。组合根（`src/lib/app/di/create_app_context.ts` 中的 `create_app_context`）负责组装一切：

1. `create_app_stores()` 实例化所有 Store
2. 每个 Service 使用所需的 Port + Store 构造
3. `register_actions()` 将所有 Action 注册到 Service 和 Store
4. `mount_reactors()` 启动所有持久化观察者
5. 结果通过 `provide_app_context()` 提供给组件树

### 禁止事项

- 不要在 Adapter 文件之外调用 `invoke()`
- 不要从功能模块外部导入该功能的内部实现（使用 `index.ts`）
- 不要在 Store 中放置异步逻辑
- 不要在 Service 中使用 `$effect`
- 不要从组件中直接调用 Service 来产生副作用 — 使用 Action Registry
- 不要在 Service 中导入 UIStore
- 不要创建全局单例实例 — 使用 context 系统
- 不要在 Store 中放置领域逻辑（Store 可以导入 `utils` 但不能导入 `domain`）

## 已接受的偏差

- **EditorService 有状态性**：持有持久会话状态（`session`、`host_root`、`active_note`、`session_generation`），因为它管理实时 DOM 编辑器会话。`session_generation` 计数器防止竞态条件。
- **VaultService 生命周期状态**：存储 `active_open_revision` 和 `index_progress_unsubscribe`，用于"最新 vault 打开意图获胜"的取消机制。
- **SearchService 请求版本号**：存储每个用例的版本计数器以忽略过期的异步响应。仅用于取消记账。
- **键盘快捷键**：Action 定义包含 `shortcut` 元数据用于显示。实际绑定在 `src/lib/hooks/use_keyboard_shortcuts.svelte.ts` 中以命令式方式进行，以实现细粒度事件控制。
- **op_toast Reactor**：直接调用 `svelte-sonner` toast 函数。Toast 通知是即发即忘的 UI 反馈，无 Store 副作用。

## 完整示例：重命名笔记

以下是重命名笔记的完整路径，展示了每一层的运作方式。

**1. Port** — `NotesPort` 在 `src/lib/features/note/ports.ts` 中定义了 `rename_note(vault_id, from, to)`。Tauri 适配器在 `src/lib/features/note/adapters/notes_tauri_adapter.ts` 中通过 IPC 实现它。

**2. Domain** — `src/lib/features/note/domain/note_path_exists.ts` 中的 `note_path_exists()` 检查目标路径是否与已有笔记冲突。纯函数，无 IO。

**3. Store 修改** — `src/lib/features/note/state/note_store.svelte.ts` 中的 `NotesStore.rename_note(old_path, new_path)` 更新笔记数组、重新排序并修复收藏路径。同步操作。

**4. Service 方法** — `src/lib/features/note/application/note_service.ts` 中的 `NoteService.rename_note(note, new_path, overwrite)`：

- 通过 `note_path_exists()` 检查冲突
- 开始 OpStore 追踪（`op_store.start("note.rename")`）
- 通过 Port 调用 `notes_port.rename_note()`（IO）
- 通过 `index_port.rename_note_path()` 更新搜索索引
- 通过 `link_repair.repair_links()` 触发链接修复
- 修改 `notes_store.rename_note()` 和 `editor_store.update_open_note_path()`
- 解析 OpStore（`op_store.succeed()` 或 `op_store.fail()`）
- 返回类型化结果：`{ status: "renamed" }`、`{ status: "conflict" }` 或 `{ status: "failed" }`

**5. Action** — `src/lib/features/note/application/note_actions.ts` 中的 `register_note_actions()` 注册：

- `note.request_rename` — 通过 UIStore 打开重命名对话框，重置 OpStore
- `note.confirm_rename` — 调用 `note_service.rename_note()`，处理冲突/成功，更新标签页，清除文件树缓存，关闭对话框
- `note.cancel_rename` — 关闭对话框，重置 OpStore

**6. Component** — `rename_note_dialog.svelte` 读取 UIStore 获取对话框状态，读取 OpStore 获取加载/错误状态。用户输入触发 `action_registry.execute('note.update_rename_name', ...)` 和 `action_registry.execute('note.confirm_rename')`。

**7. Reactor** — 无需专用 Reactor。如果重命名影响了活跃状态，标签页持久化和其他横切关注点会从各自的 Store 观察中自动触发。

模式：**Port → Domain → Store → Service → Action → Component**。仅在 Store 变化必须自动触发副作用时才添加 Reactor。

## 后端架构（Rust / Tauri）

后端是一个 Tauri 原生进程。它唯一的职责是通过 IPC 命令暴露原生能力。后端没有服务层、事件总线或领域状态管理 — 这些都在前端。

| 模块        | 职责                                                         |
| ----------- | ------------------------------------------------------------ |
| `app/`      | 组合根：注册插件、托管状态和所有命令处理器                   |
| `features/` | 每个能力一个子模块。各自拥有命令处理器和托管状态             |
| `shared/`   | Vault 注册持久化、常量、资源请求处理器                       |

有状态服务（watcher、搜索索引）使用 Tauri 的 `.manage()` 系统。状态结构体位于各功能的 `service.rs` 中，在 `app/mod.rs` 中注册。命令通过 Tauri 依赖注入接收状态：`fn watch_vault(state: tauri::State<'_, WatcherState>, ...)`。

后端不变量：

1. 所有原生能力专门通过 `#[tauri::command]` 函数暴露
2. 托管状态结构体位于功能模块的 `service.rs` 中 — 无全局静态变量
3. 跨功能共享代码放在 `shared/` 中，不在功能模块内部
4. `app/mod.rs` 是唯一注册插件、状态和命令处理器的地方
5. 后端在调用间不持有领域状态（例外：`WatcherState` 和 `SearchDbState` 是显式生命周期管理的状态）

## 验证清单

提交任何代码前运行：

```bash
pnpm check              # Svelte/TypeScript 类型检查
pnpm lint               # oxlint + 分层规则（包含 pnpm lint:layering）
pnpm test               # Vitest 单元/集成测试
cd src-tauri && cargo check   # Rust 类型检查
pnpm format             # Prettier 格式化（写入变更）
```
