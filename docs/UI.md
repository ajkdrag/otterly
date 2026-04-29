# UI Design System

This document defines the design system, conventions, and standards for LeapGrowNotes's user interface. Follow these guidelines when adding or updating UI components.

---

## Design Philosophy

- **Neutral & Minimal**: Clean, uncluttered interface with purposeful whitespace
- **Teal Accent**: Distinctive teal/cyan accent for interactive and selected states
- **Consistent**: Same patterns, spacing, and tokens across all components
- **Accessible**: Proper focus states, contrast ratios, and keyboard navigation

---

## File Structure

```
src/
├── app.css                    # shadcn-svelte tokens (DO NOT MODIFY)
├── styles/
│   ├── design_tokens.css      # Extended design system tokens (accent, spacing, typography)
│   ├── component_overrides.css # BEM patterns, toast overrides, DialogSection
│   └── editor.css             # Milkdown/ProseMirror editor styles
├── lib/types/
│   └── theme.ts               # Theme type, built-in themes, defaults
├── lib/utils/
│   ├── apply_theme.ts         # Applies theme CSS variables to :root
│   └── theme_helpers.ts       # HSL parsing, font stacks, color/font presets
├── lib/services/
│   └── theme_service.ts       # Theme CRUD, load/save via SettingsPort
├── lib/reactors/
│   └── theme.reactor.svelte.ts # Watches active theme, calls apply_theme()
└── lib/components/
    ├── ui/                    # shadcn-svelte primitives
    ├── theme_settings.svelte  # Theme panel in settings dialog
    └── *.svelte               # Application components
```

**Important**: Never modify `app.css` directly — it's managed by shadcn-svelte CLI. Extend tokens in `design_tokens.css`.

Theme settings (accent color, fonts, editor typography, element styles) are applied at runtime by `src/lib/reactors/theme.reactor.svelte.ts`, which calls `src/lib/utils/apply_theme.ts`. Themes are global (cross-vault), stored via `SettingsPort`.

**Design token usage**: Default to shadcn semantic utilities (`bg-card`, `text-foreground`, `border-border`, etc.). Use custom tokens from `design_tokens.css` only when shadcn lacks the specific token (e.g. `--interactive-bg`, `--focus-ring`, `--size-tree-row`).

---

## Color System

### Semantic Colors (from shadcn)

Use these for general UI:

| Token                | Usage                               |
| -------------------- | ----------------------------------- |
| `--background`       | Page/app background                 |
| `--foreground`       | Primary text                        |
| `--card`             | Card/panel backgrounds              |
| `--muted`            | Subtle backgrounds, disabled states |
| `--muted-foreground` | Secondary/tertiary text             |
| `--border`           | Default borders                     |
| `--destructive`      | Error states, delete actions        |

### Interactive Colors (from design_tokens.css)

Use these for selection, focus, and active states:

| Token                    | Usage                                |
| ------------------------ | ------------------------------------ |
| `--interactive`          | Active/selected text, icons          |
| `--interactive-hover`    | Hover state for interactive elements |
| `--interactive-bg`       | Background for selected items        |
| `--interactive-bg-hover` | Hover on selected items              |
| `--focus-ring`           | Focus outline color                  |
| `--selection-bg`         | Text selection background            |

### Color Usage Rules

```css
/* GOOD: Selected/active states use teal */
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

/* GOOD: Hover on non-selected uses muted */
.item:hover {
  background-color: var(--muted);
}

/* BAD: Don't use raw colors */
.item--selected {
  background-color: #0d9488; /* NO! Use tokens */
}

/* BAD: Don't use opacity hacks for selection */
.item--selected {
  background-color: var(--accent) / 20; /* NO! Use --interactive-bg */
}
```

---

## Spacing System

Base unit: **4px** (`0.25rem`)

| Token         | Value | Usage                         |
| ------------- | ----- | ----------------------------- |
| `--space-0`   | 0     | Reset                         |
| `--space-0-5` | 2px   | Micro gaps                    |
| `--space-1`   | 4px   | Icon gaps, tight padding      |
| `--space-1-5` | 6px   | Small padding                 |
| `--space-2`   | 8px   | Standard gap between elements |
| `--space-2-5` | 10px  | Medium gaps                   |
| `--space-3`   | 12px  | Section padding               |
| `--space-4`   | 16px  | Card padding, larger gaps     |
| `--space-5`   | 20px  | Large padding                 |
| `--space-6`   | 24px  | Section margins               |
| `--space-8`   | 32px  | Large section spacing         |
| `--space-10`  | 40px  | Extra large spacing           |
| `--space-12`  | 48px  | Maximum spacing               |

### Usage Rules

```css
/* GOOD: Use spacing tokens */
.component {
  padding: var(--space-3);
  gap: var(--space-2);
}

/* BAD: Arbitrary values */
.component {
  padding: 13px; /* NO! Use nearest token */
  gap: 7px; /* NO! Use --space-1-5 or --space-2 */
}
```

---

## Component Dimensions

### Touch Targets

| Token             | Value | Usage                              |
| ----------------- | ----- | ---------------------------------- |
| `--size-touch-xs` | 24px  | Minimum touch (status bar buttons) |
| `--size-touch-sm` | 28px  | Small buttons (theme toggle)       |
| `--size-touch`    | 32px  | Default interactive elements       |
| `--size-touch-md` | 36px  | Medium buttons                     |
| `--size-touch-lg` | 40px  | Large buttons                      |

### Icons

| Token            | Value | Usage                           |
| ---------------- | ----- | ------------------------------- |
| `--size-icon-xs` | 12px  | Status bar, badges              |
| `--size-icon-sm` | 14px  | Tree chevrons, small indicators |
| `--size-icon`    | 16px  | Default icon size               |
| `--size-icon-md` | 20px  | Activity bar, prominent icons   |
| `--size-icon-lg` | 24px  | Hero icons (rarely used)        |

### Specific Components

| Token                  | Value | Component                          |
| ---------------------- | ----- | ---------------------------------- |
| `--size-activity-bar`  | 44px  | Activity bar width and button size |
| `--size-activity-icon` | 20px  | Activity bar icon size             |
| `--size-status-bar`    | 22px  | Status bar height                  |
| `--size-tree-row`      | 30px  | File tree row height               |
| `--size-tree-indent`   | 16px  | Tree folder indent                 |
| `--size-dialog-sm`     | 24rem | Small dialog width                 |
| `--size-dialog-md`     | 28rem | Medium dialog width                |
| `--size-dialog-lg`     | 32rem | Large dialog width                 |

---

## Typography

### Font Size Tokens

| Token         | Value            | Usage                               |
| ------------- | ---------------- | ----------------------------------- |
| `--text-xs`   | 0.6875rem (11px) | Status bar, badges, section headers |
| `--text-sm`   | 0.8125rem (13px) | Secondary text, descriptions        |
| `--text-base` | 0.875rem (14px)  | Body text, list items               |
| `--text-md`   | 0.9375rem (15px) | Emphasized body                     |
| `--text-lg`   | 1rem (16px)      | Primary content                     |

### Usage Rules

```css
/* GOOD: Use typography tokens */
.item-title {
  font-size: var(--text-base);
}

/* BAD: Hardcoded values */
.item-title {
  font-size: 0.875rem; /* NO! Use --text-base */
}
```

### Section Headers

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

## Naming Convention: BEM

Use BEM (Block\_\_Element--Modifier) for scoped component styles.

### Pattern

```
.Block              /* Component root */
.Block__element     /* Child element */
.Block--modifier    /* Variant/state */
.Block__element--modifier
```

### Example

```svelte
<div class="TreeRow" class:TreeRow--selected={is_selected}>
  <button class="TreeRow__toggle">
    <ChevronRight class="TreeRow__icon" />
  </button>
  <span class="TreeRow__label">{name}</span>
</div>

<style>
  .TreeRow {
    /* base styles */
  }
  .TreeRow--selected {
    /* selected state */
  }
  .TreeRow__toggle {
    /* toggle button */
  }
  .TreeRow__icon {
    /* icon inside toggle */
  }
  .TreeRow__label {
    /* text label */
  }
</style>
```

### Rules

1. **One block per component file**
2. **Use `class:` directive** for conditional modifiers
3. **Use `:global()` sparingly** — only for styling slotted icons
4. **PascalCase** for block names (matches component naming)

---

## Interaction States

### Hover

```css
/* Sidebar items: use shadcn sidebar accent */
.item:hover {
  background-color: var(--sidebar-accent);
}

/* Generic items: use muted */
.item:hover {
  background-color: var(--muted);
}
```

### Focus

```css
.item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px; /* or -2px for inset */
}
```

### Selected/Active

```css
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

.item--selected:hover {
  background-color: var(--interactive-bg-hover);
}
```

### Disabled

```css
.item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### Active Indicator (Activity Bar pattern)

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

## Transitions

| Token               | Duration | Usage                        |
| ------------------- | -------- | ---------------------------- |
| `--duration-fast`   | 100ms    | Hover states, small elements |
| `--duration-normal` | 150ms    | Most interactions            |
| `--duration-slow`   | 200ms    | Larger elements, panels      |
| `--duration-slower` | 300ms    | Page transitions, modals     |

Easing: `--ease-default`, `--ease-in`, `--ease-out`, `--ease-in-out`

```css
.item {
  transition:
    background-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
```

---

## Shadows

Use sparingly. Prefer borders for separation.

| Token         | Usage                       |
| ------------- | --------------------------- |
| `--shadow-xs` | Subtle lift (active toggle) |
| `--shadow-sm` | Cards, dropdowns            |
| `--shadow-md` | Popovers, floating panels   |
| `--shadow-lg` | Modals, dialogs             |

---

## Icon Usage

### Import Pattern

```typescript
import { Files, Settings, ChevronRight } from "@lucide/svelte";
```

### Sizing with :global()

```svelte
<ChevronRight class="TreeRow__icon" />

<style>
  :global(.TreeRow__icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }
</style>
```

### Icon Button Pattern

```svelte
<button class="IconButton" aria-label="Settings">
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

## shadcn-svelte Components

### When to Use

- **Dialog, Sheet, Popover**: Modal/overlay patterns
- **Button**: Primary actions (use sparingly, prefer ghost buttons in UI chrome)
- **Input, Select, Slider**: Form controls
- **Card**: Content containers
- **ContextMenu**: Right-click menus
- **Tooltip**: Hover hints

### When NOT to Use

- **Simple buttons in chrome**: Write custom BEM-styled buttons
- **List items**: Use custom tree/list row components
- **Status bars, activity bars**: Custom components with design tokens

### Customizing shadcn Components

Pass classes, don't modify the source:

```svelte
<!-- GOOD -->
<Dialog.Content class="CommandPalette">

<!-- BAD: Don't edit ui/dialog/dialog-content.svelte -->
```

---

## Theming

Themes replace the traditional light/dark toggle. Each theme is a complete visual identity with parametric tokens (accent color, fonts, sizes) and a `color_scheme` metadata field (`"dark"` or `"light"`) for shadcn `dark:` utility compatibility.

- Themes are applied via `[data-color-scheme="dark"]` attribute on `<html>`, not a `.dark` class
- CSS files use `[data-color-scheme="dark"] { }` selectors for dark-mode token overrides
- Tailwind's `@custom-variant dark` targets `[data-color-scheme="dark"]`
- Built-in themes ("Nordic Light", "Nordic Dark") are code constants; user themes persist via `SettingsPort`

### Testing

Always verify across theme variants:

1. Light backgrounds should have sufficient contrast
2. Interactive accent should be visible in both light and dark themes
3. Shadows are more subtle in dark themes

---

## Component Checklist

When creating a new component:

- [ ] Uses design tokens (not raw values)
- [ ] BEM naming for scoped styles
- [ ] Proper focus-visible states
- [ ] Hover transitions
- [ ] Selected state uses `--interactive-*` tokens
- [ ] Icons sized with tokens
- [ ] Touch targets ≥ 24px
- [ ] Works in both light and dark mode
- [ ] Keyboard accessible

---

## Anti-Patterns

### Don't

```css
/* Raw colors */
color: #0d9488;
background: rgba(0, 0, 0, 0.1);

/* Arbitrary spacing */
padding: 13px;
margin-top: 7px;

/* Tailwind in scoped styles */
@apply flex items-center; /* Use in global only */

/* Opacity for selection */
background-color: var(--accent) / 20;

/* Hard-coded sizes */
width: 44px;
height: 22px;
```

### Do

```css
/* Design tokens */
color: var(--interactive);
background: var(--interactive-bg);

/* Spacing tokens */
padding: var(--space-3);
margin-top: var(--space-2);

/* CSS properties in scoped styles */
display: flex;
align-items: center;

/* Semantic tokens */
background-color: var(--interactive-bg);

/* Size tokens */
width: var(--size-activity-bar);
height: var(--size-status-bar);
```

---

## Quick Reference

### Common Patterns

```css
/* Selected item (also use .selection-item--selected from component_overrides.css) */
.item--selected {
  background-color: var(--interactive-bg);
  color: var(--interactive);
}

/* Section header (also use .DialogSection__header from component_overrides.css) */
.header {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

/* Focus ring */
.item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* Transition */
.item {
  transition: background-color var(--duration-fast) var(--ease-default);
}
```

### Utility Classes (design_tokens.css)

- `.is-active` / `.is-active-subtle` — selected/active background states
- `.has-indicator` — activity bar–style left indicator line
- `.bg-interactive` / `.bg-interactive-hover` — interactive backgrounds
