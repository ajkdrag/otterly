# LeapGrowNotes 用户系统模块设计文档

> 多用户登录/注册/游客模式
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 用户注册 | ✅ 已实现 | 用户名 + 密码创建账户 |
| 用户登录 | ✅ 已实现 | 密码验证 + 会话管理 |
| 游客模式 | ✅ 已实现 | 无需注册即可使用 |
| 多用户切换 | ✅ 已实现 | 切换不同用户账户 |
| 用户信息管理 | ✅ 已实现 | 查询/更新用户信息 |
| 用户 UI | ✅ 已实现 | 登录/注册/用户菜单 |
| Tauri 适配器 | ✅ 已实现 | 4 个后端命令 |

---

## 1. 设计理念

用户系统支持多用户在同一设备上使用 LeapGrowNotes，每个用户独立拥有积分、等级和统计数据。支持游客模式降低使用门槛。用户数据存储在本地 SQLite 中，不依赖网络服务。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/user/
├── index.ts                          # 公共导出入口
├── ports.ts                          # 端口接口定义
├── adapters/
│   └── user_tauri_adapter.ts         # 用户 Tauri IPC 适配器
├── application/
│   ├── user_actions.ts               # Action 注册
│   └── user_service.ts               # 用户服务（业务编排）
├── state/
│   └── user_store.svelte.ts          # 用户响应式状态
├── types/
│   └── user.ts                       # 用户类型定义
├── utils/
│   └── user_utils.ts                 # 用户工具函数
└── ui/
    ├── login_dialog.svelte           # 登录对话框
    ├── register_dialog.svelte        # 注册对话框
    └── user_menu.svelte              # 用户菜单组件
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **ports** | 定义 `UserPort` 接口 | `ports.ts` |
| **adapters** | Tauri IPC 适配器 | `adapters/` |
| **application** | `UserService` 编排登录/注册/切换 + Action 注册 | `application/` |
| **state** | `UserStore` 管理当前登录用户 | `state/` |
| **utils** | 用户相关工具函数 | `utils/` |
| **ui** | 登录/注册对话框 + 用户菜单 | `ui/` |

---

## 3. 核心接口

### 3.1 UserPort

```typescript
interface UserPort {
  create_user(username: string, password: string): Promise<User>;
  get_user(user_id: string): Promise<User>;
  update_user(user_id: string, updates: UserUpdate): Promise<void>;
  verify_password(username: string, password: string): Promise<User>;
}
```

### 3.2 User 类型

```typescript
interface User {
  id: string;
  username: string;
  display_name: string;
  is_guest: boolean;
  created_at: string;
}
```

### 3.3 UserService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `register(username, password)` | 注册新用户 |
| `login(username, password)` | 用户登录 |
| `login_as_guest()` | 游客模式登录 |
| `switch_user(user_id)` | 切换用户 |
| `get_current_user()` | 获取当前登录用户 |
| `logout()` | 登出 |

---

## 4. 用户与积分关联

每个用户拥有独立的积分、等级和统计数据：

```
User
├── points_account (积分账户)
│   ├── total_points
│   ├── level
│   └── streak_days
├── points_transactions (积分流水)
└── stats_history (统计历史)
```

---

## 5. 后端命令（Tauri）

| 命令 | 说明 |
| ---- | ---- |
| `user_create` | 创建用户 |
| `user_get` | 查询用户信息 |
| `user_update` | 更新用户信息 |
| `user_verify_password` | 密码验证 |

---

## 6. 依赖关系

```
user
├── 依赖 → shared/adapters (Tauri IPC)
├── 被依赖 ← stats (统计数据关联用户)
├── 被依赖 ← points (积分关联用户)
└── 被依赖 ← pets (宠物关联用户)
```
