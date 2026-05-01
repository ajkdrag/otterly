# UI 设计系统

本文档定义了 LeapGrowNotes 用户界面的设计系统、约定和标准。添加或更新 UI 组件时请遵循这些准则。

---

## 设计哲学

- **中性 & 极简**：整洁、不杂乱的界面，有目的地使用留白
- **青色强调**：使用独特的青色/蓝绿色作为交互和选中状态的强调色
- **一致性**：所有组件使用相同的模式、间距和令牌（Token）
- **无障碍**：正确的焦点状态、对比度、键盘导航

---

## 文件结构

```
src/
├── app.css                    # shadcn-svelte 令牌（请勿修改）
├── styles/
│   ├── design_tokens.css      # 扩展设计系统令牌（强调色、间距、排版）
│   ├── component_overrides.css # BEM 模式、toast 覆盖、DialogSection
│   └── editor.css             # Milkdown/ProseMirror 编辑器样式
├── lib/types/
│   └── theme.ts               # 主题类型、内置主题、默认值
├── lib/utils/
│   ├── apply_theme.ts         # 将主题 CSS 变量应用到 :root
│   └── theme_helpers.ts       # HSL 解析、字体栈、颜色/字体预设
├── lib/services/
│   └── theme_service.ts       # 主题增删改查，通过 SettingsPort 加载/保存
├── lib/reactors/
│   └── theme.reactor.svelte.ts # 监听活跃主题，调用 apply_theme()
└── lib/components/
    ├── ui/                    # shadcn-svelte 基础组件
    ├── theme_settings.svelte  # 设置对话框中的主题面板
    └── *.svelte               # 应用组件
```

**重要**：不要直接修改 `app.css` — 它由 shadcn-svelte CLI 管理。在 `design_tokens.css` 中扩展令牌。

主题设置（强调色、字体、编辑器排版、元素样式）在运行时由 `src/lib/reactors/theme.reactor.svelte.ts` 应用，它调用 `src/lib/utils/apply_theme.ts`。主题是全局的（跨 vault），通过 `SettingsPort` 存储。

**设计令牌使用原则**：默认使用 shadcn 语义工具类（`bg-card`、`text-foreground`、`border-border` 等）。仅当 shadcn 缺少特定令牌时才使用 `design_tokens.css` 中的自定义令牌（如 `--interactive-bg`、`--focus-ring`、`--size-tree-row`）。

---

## 颜色系统

### 语义颜色（来自 shadcn）

用于通用 UI：

| 令牌                 | 用途                     |
| -------------------- | ------------------------ |
| `--background`       | 页面/应用背景            |
| `--foreground`       | 主要文本                 |
| `--card`             | 卡片/面板背景            |
| `--muted`            | 柔和背景、禁用状态       |
| `--muted-foreground` | 次要/三级文本            |
| `--border`           | 默认边框                 |
| `--destructive`      | 错误状态、删除操作       |

### 交互颜色（来自 design_tokens.css）

用于选中、焦点和活跃状态：

| 令牌                     | 用途                     |
| ------------------------ | ------------------------ |
| `--interactive`          | 活跃/选中文本、图标      |
| `--interactive-hover`    | 交互元素的悬停状态       |
| `--interactive-bg`       | 选中项的背景             |
| `--interactive-bg-hover` | 选中项的悬停背景         |
| `--focus-ring`           | 焦点轮廓颜色             |
| `--selection-bg`         | 文本选择背景             |

### 颜色使用规则

```css
/* 正确：选中/活跃状态使用青色 */
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

/* 正确：非选中项悬停使用柔和色 */
.item:hover {
  background-color: var(--muted);
}

/* 错误：不要使用原始颜色值 */
.item--selected {
  background-color: #0d9488; /* 不行！使用令牌 */
}

/* 错误：不要使用透明度技巧来实现选中效果 */
.item--selected {
  background-color: var(--accent) / 20; /* 不行！使用 --interactive-bg */
}
```

---

## 间距系统

基本单位：**4px**（`0.25rem`）

| 令牌          | 值    | 用途                 |
| ------------- | ----- | -------------------- |
| `--space-0`   | 0     | 重置                 |
| `--space-0-5` | 2px   | 微间距               |
| `--space-1`   | 4px   | 图标间距、紧凑内边距 |
| `--space-1-5` | 6px   | 小内边距             |
| `--space-2`   | 8px   | 元素间标准间距       |
| `--space-2-5` | 10px  | 中等间距             |
| `--space-3`   | 12px  | 区块内边距           |
| `--space-4`   | 16px  | 卡片内边距、较大间距 |
| `--space-5`   | 20px  | 大内边距             |
| `--space-6`   | 24px  | 区块外边距           |
| `--space-8`   | 32px  | 大型区块间距         |
| `--space-10`  | 40px  | 超大间距             |
| `--space-12`  | 48px  | 最大间距             |

### 使用规则

```css
/* 正确：使用间距令牌 */
.component {
  padding: var(--space-3);
  gap: var(--space-2);
}

/* 错误：任意值 */
.component {
  padding: 13px; /* 不行！使用最近的令牌 */
  gap: 7px; /* 不行！使用 --space-1-5 或 --space-2 */
}
```

---

## 组件尺寸

### 触摸目标

| 令牌              | 值    | 用途                       |
| ----------------- | ----- | -------------------------- |
| `--size-touch-xs` | 24px  | 最小触摸区域（状态栏按钮） |
| `--size-touch-sm` | 28px  | 小按钮（主题切换）         |
| `--size-touch`    | 32px  | 默认交互元素               |
| `--size-touch-md` | 36px  | 中等按钮                   |
| `--size-touch-lg` | 40px  | 大按钮                     |

### 图标

| 令牌             | 值    | 用途                       |
| ---------------- | ----- | -------------------------- |
| `--size-icon-xs` | 12px  | 状态栏、徽章               |
| `--size-icon-sm` | 14px  | 树形箭头、小型指示器       |
| `--size-icon`    | 16px  | 默认图标尺寸               |
| `--size-icon-md` | 20px  | 活动栏、突出图标           |
| `--size-icon-lg` | 24px  | 大型图标（很少使用）       |

### 特定组件

| 令牌                   | 值    | 组件               |
| ---------------------- | ----- | ------------------ |
| `--size-activity-bar`  | 44px  | 活动栏宽度和按钮尺寸 |
| `--size-activity-icon` | 20px  | 活动栏图标尺寸       |
| `--size-status-bar`    | 22px  | 状态栏高度           |
| `--size-tree-row`      | 30px  | 文件树行高           |
| `--size-tree-indent`   | 16px  | 树形文件夹缩进       |
| `--size-dialog-sm`     | 24rem | 小对话框宽度         |
| `--size-dialog-md`     | 28rem | 中对话框宽度         |
| `--size-dialog-lg`     | 32rem | 大对话框宽度         |

---

## 排版

### 字体大小令牌

| 令牌          | 值               | 用途                         |
| ------------- | ---------------- | ---------------------------- |
| `--text-xs`   | 0.6875rem (11px) | 状态栏、徽章、区块标题       |
| `--text-sm`   | 0.8125rem (13px) | 次要文本、描述               |
| `--text-base` | 0.875rem (14px)  | 正文、列表项                 |
| `--text-md`   | 0.9375rem (15px) | 强调正文                     |
| `--text-lg`   | 1rem (16px)      | 主要内容                     |

### 使用规则

```css
/* 正确：使用排版令牌 */
.item-title {
  font-size: var(--text-base);
}

/* 错误：硬编码值 */
.item-title {
  font-size: 0.875rem; /* 不行！使用 --text-base */
}
```

### 区块标题

```css
.SectionHeader {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}
```

---

## 命名约定：BEM

使用 BEM（Block\_\_Element--Modifier）为组件样式设定作用域。

### 模式

```
.Block              /* 组件根元素 */
.Block__element     /* 子元素 */
.Block--modifier    /* 变体/状态 */
.Block__element--modifier
```

### 示例

```svelte
<div class="TreeRow" class:TreeRow--selected={is_selected}>
  <button class="TreeRow__toggle">
    <ChevronRight class="TreeRow__icon" />
  </button>
  <span class="TreeRow__label">{name}</span>
</div>

<style>
  .TreeRow {
    /* 基础样式 */
  }
  .TreeRow--selected {
    /* 选中状态 */
  }
  .TreeRow__toggle {
    /* 切换按钮 */
  }
  .TreeRow__icon {
    /* 切换按钮内的图标 */
  }
  .TreeRow__label {
    /* 文本标签 */
  }
</style>
```

### 规则

1. **每个组件文件一个 Block**
2. **使用 `class:` 指令**实现条件修饰符
3. **谨慎使用 `:global()`** — 仅用于为插槽图标设置样式
4. **PascalCase** 命名 Block（与组件命名一致）

---

## 交互状态

### 悬停

```css
/* 侧边栏项：使用 shadcn sidebar accent */
.item:hover {
  background-color: var(--sidebar-accent);
}

/* 通用项：使用 muted */
.item:hover {
  background-color: var(--muted);
}
```

### 焦点

```css
.item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px; /* 或 -2px 用于内嵌效果 */
}
```

### 选中/活跃

```css
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

.item--selected:hover {
  background-color: var(--interactive-bg-hover);
}
```

### 禁用

```css
.item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### 活跃指示器（活动栏模式）

```css
.item--active::before {
  content: "";
  position: absolute;
  inset-block: var(--space-2);
  inset-inline-start: 0;
  width: 2px;
  background-color: var(--interactive);
  border-radius: 1px;
}
```

---

## 过渡动画

| 令牌                | 时长   | 用途                   |
| ------------------- | ------ | ---------------------- |
| `--duration-fast`   | 100ms  | 悬停状态、小元素       |
| `--duration-normal` | 150ms  | 大多数交互             |
| `--duration-slow`   | 200ms  | 较大元素、面板         |
| `--duration-slower` | 300ms  | 页面过渡、模态框       |

缓动函数：`--ease-default`、`--ease-in`、`--ease-out`、`--ease-in-out`

```css
.item {
  transition:
    background-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
```

---

## 阴影

谨慎使用。优先用边框实现分隔效果。

| 令牌          | 用途                     |
| ------------- | ------------------------ |
| `--shadow-xs` | 轻微浮起（活跃切换）     |
| `--shadow-sm` | 卡片、下拉菜单           |
| `--shadow-md` | 弹出框、浮动面板         |
| `--shadow-lg` | 模态框、对话框           |

---

## 图标使用

### 导入模式

```typescript
import { Files, Settings, ChevronRight } from "@lucide/svelte";
```

### 使用 :global() 设置尺寸

```svelte
<ChevronRight class="TreeRow__icon" />

<style>
  :global(.TreeRow__icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }
</style>
```

### 图标按钮模式

```svelte
<button class="IconButton" aria-label="设置">
  <Settings />
</button>

<style>
  .IconButton {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch);
    height: var(--size-touch);
    border-radius: var(--radius-md);
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .IconButton:hover {
    color: var(--foreground);
  }

  :global(.IconButton svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }
</style>
```

---

## shadcn-svelte 组件

### 何时使用

- **Dialog、Sheet、Popover**：模态框/覆盖层模式
- **Button**：主要操作（谨慎使用，UI 工具栏中优先使用 ghost 按钮）
- **Input、Select、Slider**：表单控件
- **Card**：内容容器
- **ContextMenu**：右键菜单
- **Tooltip**：悬停提示

### 何时不使用

- **工具栏中的简单按钮**：编写自定义 BEM 样式按钮
- **列表项**：使用自定义树形/列表行组件
- **状态栏、活动栏**：使用设计令牌编写自定义组件

### 自定义 shadcn 组件

传递 class，不修改源码：

```svelte
<!-- 正确 -->
<Dialog.Content class="CommandPalette">

<!-- 错误：不要编辑 ui/dialog/dialog-content.svelte -->
```

---

## 主题系统

主题替代了传统的明/暗切换。每个主题是一个完整的视觉标识，包含参数化令牌（强调色、字体、尺寸）和 `color_scheme` 元数据字段（`"dark"` 或 `"light"`），用于 shadcn `dark:` 工具类兼容。

- 主题通过 `<html>` 上的 `[data-color-scheme="dark"]` 属性应用，而非 `.dark` 类
- CSS 文件使用 `[data-color-scheme="dark"] { }` 选择器覆盖暗色模式令牌
- Tailwind 的 `@custom-variant dark` 目标为 `[data-color-scheme="dark"]`
- 内置主题（"Nordic Light"、"Nordic Dark"）是代码常量；用户主题通过 `SettingsPort` 持久化

### 测试

始终在不同主题变体间验证：

1. 浅色背景应有足够的对比度
2. 交互强调色在明暗主题中都应清晰可见
3. 暗色主题中阴影应更柔和

---

## 组件创建清单

创建新组件时：

- [ ] 使用设计令牌（非原始值）
- [ ] 使用 BEM 命名作用域样式
- [ ] 正确的 focus-visible 状态
- [ ] 悬停过渡动画
- [ ] 选中状态使用 `--interactive-*` 令牌
- [ ] 图标使用令牌设置尺寸
- [ ] 触摸目标 ≥ 24px
- [ ] 在明暗模式下都能正常工作
- [ ] 键盘可访问

---

## 反模式

### 不要这样做

```css
/* 原始颜色值 */
color: #0d9488;
background: rgba(0, 0, 0, 0.1);

/* 任意间距值 */
padding: 13px;
margin-top: 7px;

/* 在作用域样式中使用 Tailwind */
@apply flex items-center; /* 仅在全局样式中使用 */

/* 使用透明度实现选中效果 */
background-color: var(--accent) / 20;

/* 硬编码尺寸 */
width: 44px;
height: 22px;
```

### 应该这样做

```css
/* 设计令牌 */
color: var(--interactive);
background: var(--interactive-bg);

/* 间距令牌 */
padding: var(--space-3);
margin-top: var(--space-2);

/* 在作用域样式中使用 CSS 属性 */
display: flex;
align-items: center;

/* 语义令牌 */
background-color: var(--interactive-bg);

/* 尺寸令牌 */
width: var(--size-activity-bar);
height: var(--size-status-bar);
```

---

## 快速参考

### 常用模式

```css
/* 选中项（也可使用 component_overrides.css 中的 .selection-item--selected） */
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

/* 区块标题（也可使用 component_overrides.css 中的 .DialogSection__header） */
.header {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

/* 焦点轮廓 */
.item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* 过渡动画 */
.item {
  transition: background-color var(--duration-fast) var(--ease-default);
}
```

### 工具类（design_tokens.css）

- `.is-active` / `.is-active-subtle` — 选中/活跃背景状态
- `.has-indicator` — 活动栏风格的左侧指示线
- `.bg-interactive` / `.bg-interactive-hover` — 交互背景
