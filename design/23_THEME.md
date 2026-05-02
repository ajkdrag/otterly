# LeapGrowNotes 主题系统模块设计文档

> 明/暗主题切换与自定义主题支持
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-02  
> **实现状态**: ✅ 核心已实现

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| 明/暗主题 | ✅ 已实现 | Light / Dark 双主题 |
| 系统跟随 | ✅ 已实现 | 跟随系统外观偏好 |
| 主题持久化 | ✅ 已实现 | 主题选择保存到设置 |
| CSS 变量系统 | ✅ 已实现 | Design tokens 作为 CSS 自定义属性 |

---

## 1. 设计理念

主题模块管理应用的视觉外观，通过 CSS 自定义属性（design tokens）实现主题切换。支持明亮/暗黑两种主题及系统跟随模式，主题偏好持久化到全局设置。

---

## 2. 架构设计

### 2.1 目录结构

```
src/lib/features/theme/
├── index.ts                          # 公共导出入口
├── application/
│   └── theme_service.ts              # 主题服务（业务编排）
└── domain/
    └── theme.ts                      # 主题领域逻辑

src/styles/
├── design_tokens.css                 # 设计令牌（CSS 变量定义）
├── component_overrides.css           # 组件样式覆盖
└── editor.css                        # 编辑器样式
```

### 2.2 分层职责

| 层级 | 职责 | 关键文件 |
| ---- | ---- | -------- |
| **application** | `ThemeService` 编排主题切换、加载、保存 | `application/` |
| **domain** | 主题枚举、系统主题检测、CSS 类名映射 | `domain/` |

---

## 3. 核心接口

### 3.1 主题类型

```typescript
type Theme = "light" | "dark" | "system";

interface ThemeConfig {
  theme: Theme;
  resolved_theme: "light" | "dark";  // system 解析后的实际值
}
```

### 3.2 ThemeService 关键方法

| 方法 | 说明 |
| ---- | ---- |
| `set_theme(theme)` | 设置主题并应用到 DOM |
| `load_theme()` | 从设置加载主题偏好 |
| `get_resolved_theme()` | 获取解析后的实际主题值 |

---

## 4. CSS 设计令牌

通过 `design_tokens.css` 定义 CSS 自定义属性：

```css
:root[data-theme="light"] {
  --color-bg-primary: #ffffff;
  --color-text-primary: #1a1a1a;
  --color-accent: #3b82f6;
  /* ... */
}

:root[data-theme="dark"] {
  --color-bg-primary: #1a1a2e;
  --color-text-primary: #e2e8f0;
  --color-accent: #60a5fa;
  /* ... */
}
```

所有组件使用 `var(--color-xxx)` 引用颜色，实现主题无关的样式编写。

---

## 5. 主题切换流程

```
用户选择主题
  ├── "light" / "dark" → 直接应用
  ├── "system" → 检测系统偏好
  │   ├── prefers-color-scheme: dark → 应用 dark
  │   └── prefers-color-scheme: light → 应用 light
  ├── 设置 document.documentElement dataset
  └── 持久化到全局设置
```

---

## 6. 依赖关系

```
theme
├── 依赖 → settings (主题偏好持久化)
├── 依赖 → vault (全局设置读写)
└── reactor: theme.reactor (监听设置变更应用主题)
```

---

## 7. Reactor 关联

| Reactor | 说明 |
| ------- | ---- |
| `theme.reactor` | 监听设置中的主题变更，自动应用到 DOM |
