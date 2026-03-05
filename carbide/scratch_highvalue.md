# Scratch High-Value Cherry-Picks

> Features adapted from [scratch](~/src/scratch/) into Otterly/Carbide.
> Status: `[ ]` pending | `[~]` in progress | `[x]` done | `[-]` dropped

---

## Existing State Assessment

Before planning, here's what Otterly already has in each area:

| Area                  | Otterly Status                                                                                                                                                                        | Scratch Offers                                                                                                       | Verdict                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Search**            | SQLite FTS5 with BM25 ranking, scoped search (title/path/content/all), snippet extraction, incremental indexing                                                                       | Tantivy with prefix fallback, scored results                                                                         | **SKIP** — Otterly's FTS5 is already comparable. Tantivy would be a lateral move, not an upgrade                      |
| **Git remote**        | git2: status, commit, log, diff, restore, tag, init. **No push/pull/fetch/remote**                                                                                                    | CLI-based push/pull/fetch with SSH timeouts, error parsing, remote add                                               | **ADOPT** — fills the biggest git gap                                                                                 |
| **Command palette**   | Sophisticated omnibar with 12 commands, note search, cross-vault, scopes                                                                                                              | Combined commands + Tantivy search, contextual commands (git-only, note-only)                                        | **ENHANCE** — add contextual command registration pattern                                                             |
| **AI CLI**            | Does not exist                                                                                                                                                                        | Claude/Codex/Ollama CLI execution, provider detection, 5min timeout, ANSI stripping                                  | **ADOPT** — new capability                                                                                            |
| **Focus/zen mode**    | Does not exist                                                                                                                                                                        | Boolean toggle, sidebar slide-out animation, Escape to exit                                                          | **ADOPT** — trivial to implement                                                                                      |
| **Editor typography** | font_family_sans/mono, font_size, line_height, heading_font_weight. **No editor_width**                                                                                               | font family map, editor width presets (narrow/normal/wide/full), bold weight, line height                            | **ENHANCE** — add editor width presets                                                                                |
| **Wikilinks**         | Full implementation: `wiki_link_plugin.ts` (converter + click handler), `wiki_suggest_plugin.ts` (autocomplete), `open_wiki_link` action, search suggestions via `suggest_wiki_links` | TipTap Node extension with `[[]]` tokenizer, suggestion list                                                         | **SKIP** — Otterly's Milkdown-based implementation is already more mature                                             |
| **Math/LaTeX**        | Does not exist                                                                                                                                                                        | TipTap `@tiptap/extension-mathematics` with KaTeX, block math `$$...$$` input rule, keyboard-accessible editor popup | **ADOPT** — new capability. Use `@milkdown/plugin-math` (native Milkdown support) instead of porting TipTap extension |

---

## Feature 1: Git Remote Operations (Push/Pull/Fetch)

**Source:** scratch.md #4 (Git Remote Operations)
**Maps to:** Phase 5 in carbide-project-guide.md
**Effort:** Medium (1 week)

### What to build

Otterly uses `git2` crate (libgit2 bindings). Scratch uses CLI `git` commands. We'll implement with git2 for consistency with existing Otterly git code, but borrow Scratch's error categorization and timeout patterns.

### Rust Backend (`src-tauri/src/features/git/service.rs`)

- [ ] `git_get_remotes(vault_path)` — list configured remotes
- [ ] `git_get_remote_url(vault_path, remote_name)` — get URL for a remote
- [ ] `git_add_remote(vault_path, name, url)` — add remote with URL validation
- [ ] `git_push(vault_path, remote?)` — push to remote with auth
- [ ] `git_pull(vault_path, remote?)` — fetch + merge from remote
- [ ] `git_fetch(vault_path, remote?)` — fetch without merge
- [ ] `git_ahead_behind(vault_path)` — count ahead/behind vs upstream
- [ ] SSH auth: detect `~/.ssh` keys, support ssh-agent via git2's SSH transport
- [ ] HTTPS: credential helper callback
- [ ] Human-readable error categorization (auth failure, network, conflicts, diverged)

### Frontend

- [ ] Add Push/Pull buttons to `git_status_widget.svelte`
- [ ] Show ahead/behind counts in git status bar
- [ ] Sync progress indicator during push/pull
- [ ] Error toasts with actionable messages
- [ ] "Add Remote" dialog when no remote configured
- [ ] Add remote management to settings or git panel

### Commands

- [ ] Add to `COMMANDS_REGISTRY`: "Git Push", "Git Pull", "Git Fetch", "Add Remote"

### Testing

- [ ] Unit tests for error categorization
- [ ] Unit tests for URL validation
- [ ] Integration test for ahead/behind counting

---

## Feature 2: AI CLI Integration

**Source:** scratch.md #3 (AI CLI Integration) + #13 (AI Edit Modal)
**Effort:** Medium (1 week) — most Rust code ports directly from Scratch
**Architecture:** Built-in feature with clean port boundary (extractable to plugin when Phase 8 lands)

### What to build

Execute AI CLI tools (Claude Code, Codex, Ollama) from within the app. Built as a
self-contained feature module, designed so extraction to a plugin is mechanical later.

> **Why built-in, not plugin:** The plugin system (Phase 8) doesn't exist yet, and AI
> needs privileged OS access (process spawning, SIGKILL, PATH expansion) that would
> require building the hardest parts of the plugin infra first. Instead, we build it
> as a clean feature module with an `AiPort` interface that maps directly to future
> plugin API contracts.

### Porting from Scratch — what transfers directly

Scratch source: `~/src/scratch/src-tauri/src/lib.rs` (lines 2070-2540), `~/src/scratch/src/services/ai.ts`

| Scratch Code               | Lines                | Reuse                          | Notes                                                                                                                                                                                              |
| -------------------------- | -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_expanded_path()`      | 2071-2113            | **Copy verbatim**              | PATH discovery for nvm/volta/fnm/mise/homebrew. Framework-agnostic                                                                                                                                 |
| `no_window_cmd()`          | 2116-2129            | **Copy verbatim**              | Windows CREATE_NO_WINDOW. Cross-platform helper                                                                                                                                                    |
| `check_cli_exists()`       | 2131-2145            | **Copy verbatim**              | `which`/`where` check with expanded PATH                                                                                                                                                           |
| `execute_ai_cli()`         | 2169-2366            | **Copy verbatim**              | The core ~200-line shared runner: process spawn, stdin pipe, stdout/stderr concurrent read, 5min timeout + SIGKILL + 5s grace, ANSI strip. This is the hardest code and it's already battle-tested |
| `ai_execute_claude()`      | 2369-2405            | **Adapt slightly**             | Change `AppState.notes_folder` → vault_path param. Keep file validation, path canonicalization, `--dangerously-skip-permissions --print` args                                                      |
| `ai_execute_codex()`       | 2408-2430            | **Adapt slightly**             | Same pattern. Keep prompt template for file-scoped editing                                                                                                                                         |
| `ai_execute_ollama()`      | 2443-2540            | **Adapt slightly**             | Same. Keep model availability check (`ollama show`), prompt template, error message improvement                                                                                                    |
| `ai_check_*_cli()`         | 2148-2165, 2433-2440 | **Generalize**                 | Merge 3 functions into one `ai_check_cli(provider)`                                                                                                                                                |
| `AiExecutionResult` struct | (in lib.rs)          | **Copy verbatim**              | `{ success, output, error }`                                                                                                                                                                       |
| `ai.ts` service            | 43 lines             | **Port to adapter**            | Thin invoke wrappers → becomes `ai_tauri_adapter.ts`                                                                                                                                               |
| `AiEditModal.tsx`          | 273 lines            | **Rewrite to Svelte**          | Logic ports 1:1. States: checking CLI → not installed (show hint) → ready (prompt input) → executing (spinner) → done                                                                              |
| `AiResponseToast.tsx`      | 232 lines            | **Extract parser, rewrite UI** | `parseMarkdown()` / `parseInlineMarkdown()` are framework-agnostic — extract as utility. Toast UI rewritten in Svelte                                                                              |

**~350 lines of Rust port verbatim. ~43 lines TS port directly. ~500 lines React → Svelte rewrite (simpler in Svelte).**

### Rust Backend (new feature: `src-tauri/src/features/ai/`)

- [ ] Create `src-tauri/src/features/ai/mod.rs` + `service.rs`
- [ ] Port `get_expanded_path()`, `no_window_cmd()`, `check_cli_exists()` from Scratch verbatim
- [ ] Port `execute_ai_cli()` from Scratch verbatim (~200 lines, the core runner)
- [ ] Port `AiExecutionResult` struct with Serialize/Deserialize
- [ ] Adapt `ai_execute_claude()` — use `vault_path: &str` param instead of `AppState`
- [ ] Adapt `ai_execute_codex()` — same adaptation
- [ ] Adapt `ai_execute_ollama()` — same, keep model check + prompt template
- [ ] Generalize `ai_check_cli(provider: &str)` — single function, not 3
- [ ] Register Tauri commands: `ai_check_cli`, `ai_execute_claude`, `ai_execute_codex`, `ai_execute_ollama`

### Frontend (new feature: `src/lib/features/ai/`)

- [ ] `domain/ai_types.ts` — `AiProvider`, `AiExecutionResult`, provider display configs (name, icon, CLI name, install URL — from Scratch's `AiEditModal` lines 30-53)
- [ ] `ports.ts` — `AiPort` interface (check_cli, execute — maps to future plugin API)
- [ ] `adapters/ai_tauri_adapter.ts` — port Scratch's `ai.ts` invoke wrappers
- [ ] `application/ai_service.ts` — thin orchestrator over port
- [ ] `state/ai_store.svelte.ts` — provider, is_executing, result, cli_available
- [ ] `domain/ai_markdown_parser.ts` — extract Scratch's `parseMarkdown()` + `parseInlineMarkdown()` as framework-agnostic utility (handles code blocks, lists, headers, bold, italic, inline code)
- [ ] `ui/ai_edit_dialog.svelte` — Svelte rewrite of `AiEditModal.tsx`:
  - Same state machine: checking → not_installed → ready → executing → done
  - Provider icon + name from config
  - Ollama model input (persisted to settings)
  - Enter to submit, Escape to go back
  - CLI install hint with link when not found
- [ ] `ui/ai_response_toast.svelte` — Svelte rewrite of `AiResponseToast.tsx`:
  - Uses extracted `ai_markdown_parser.ts`
  - Shows "Use Cmd+Z to undo changes" hint
- [ ] `application/ai_actions.ts` — register actions, wire to omnibar commands

### Commands

- [ ] Add to `COMMANDS_REGISTRY`: "AI Edit (Claude)", "AI Edit (Codex)", "AI Edit (Ollama)"
- [ ] Contextual: only show when note is open (uses Feature 3's `when` predicate)

### Testing

- [ ] Unit tests for ANSI stripping (Rust)
- [ ] Unit tests for `ai_markdown_parser.ts` (code blocks, lists, inline formatting)
- [ ] Unit tests for AI store state transitions
- [ ] Unit tests for provider config resolution

---

## Feature 3: Enhanced Command Palette (Contextual Commands)

**Source:** scratch.md #12 (Command Palette with Tantivy-Backed Search)
**Effort:** Low-Medium (3-5 days)

### What to build

Otterly's omnibar already combines commands + search. What Scratch adds: **contextual command visibility** — commands that only appear when relevant (e.g., git commands only when repo exists, note-specific commands only when a note is open).

### Design

Currently `COMMANDS_REGISTRY` is a static array. Add an optional `when` predicate to `CommandDefinition`:

```typescript
interface CommandDefinition {
  id: string;
  label: string;
  // ... existing fields
  when?: (ctx: CommandContext) => boolean; // NEW: contextual visibility
}

interface CommandContext {
  has_open_note: boolean;
  has_git_repo: boolean;
  has_git_remote: boolean;
  has_ai_cli: Record<AiProvider, boolean>;
  is_split_view: boolean;
}
```

### Implementation

- [ ] Add `when` field to `CommandDefinition` type
- [ ] Add `CommandContext` type
- [ ] Build context from stores in omnibar action (lazy, on open)
- [ ] Filter `COMMANDS_REGISTRY` by `when` predicate in `search_omnibar`
- [ ] Add contextual commands:
  - Note-only: "Delete Note", "Duplicate Note", "Copy as Markdown", "Copy as Plain Text"
  - Git-only: "Git Push", "Git Pull", "Version History", "Create Checkpoint"
  - Git+remote: "Git Fetch"
  - AI: "AI Edit (Claude)" etc. (only when CLI detected)
  - Split-view: "Close Split", "Focus Left Pane", "Focus Right Pane"
- [ ] Add recent commands section (Otterly's omnibar already tracks `recent_commands` in UIStore)

### Testing

- [ ] Unit tests for `when` predicate evaluation
- [ ] Unit tests for context building from store state
- [ ] Test that commands appear/disappear based on context

---

## Feature 4: Focus/Zen Mode

**Source:** scratch.md #14 (Focus/Zen Mode)
**Effort:** Low (1-2 days)

### What to build

Distraction-free writing mode that hides the sidebar and right panel. Pure CSS + boolean state.

### Implementation

- [ ] Add `focus_mode` boolean to `UIStore`
- [ ] Add `focus_mode_toggle` action in `ui_actions.ts`
- [ ] Hotkey: `Cmd+Shift+Enter` to toggle
- [ ] In `workspace_layout.svelte`:
  - When focus mode active: hide file tree pane and right panel
  - Animate with Tailwind transitions (opacity + translate, 300-500ms ease-out)
  - `pointer-events-none` on hidden elements
- [ ] Escape key exits focus mode (only when focus is outside editor)
- [ ] Exit focus mode on vault switch
- [ ] Add to `COMMANDS_REGISTRY`: "Toggle Focus Mode"

### Testing

- [ ] Unit test for UIStore focus_mode toggle
- [ ] Unit test for focus_mode reset on vault switch

---

## Feature 5: Editor Typography Settings (Width Presets)

**Source:** scratch.md #16 (Editor Typography Settings)
**Effort:** Low (1-2 days)

### What to build

Otterly already has `font_family_sans`, `font_family_mono`, `font_size`, `line_height`, `heading_font_weight` in its theme system. What's missing: **editor width presets** and **bold weight**.

### Design

Add to `Theme` type in `src/lib/shared/types/theme.ts`:

```typescript
// New fields
editor_width: "narrow" | "normal" | "wide" | "full";  // preset
editor_width_custom?: number;  // px, used when editor_width === "custom" (stretch)
```

Width map (from Scratch):

- `narrow`: 36rem (576px)
- `normal`: 48rem (768px)
- `wide`: 64rem (1024px)
- `full`: 100%

### Implementation

- [ ] Add `editor_width` to `Theme` type with default `"normal"`
- [ ] Add `SHARED_DEFAULTS.editor_width` = `"normal"`
- [ ] Add CSS variable `--editor-max-width` in `apply_theme.ts`
- [ ] Apply `max-width` to editor content container
- [ ] Add editor width selector to settings UI (radio group or dropdown)
- [ ] Persist in theme settings (per-vault via existing theme persistence)

### Testing

- [ ] Unit test for theme defaults include editor_width
- [ ] Unit test for apply_theme generates correct CSS variable

---

## Feature 6: Math/LaTeX Support

**Source:** scratch.md #7 (Math/LaTeX Support)
**Effort:** Low-Medium (2-3 days)

### What to build

Inline (`$expr$`) and block (`$$expr$$`) math rendering with KaTeX. Otterly uses Milkdown (ProseMirror-based), not TipTap, so we use `@milkdown/plugin-math` instead of porting Scratch's TipTap extension. The Milkdown plugin provides native `$$` input rules, ProseMirror node definitions, and KaTeX rendering out of the box.

### What transfers from Scratch

| Scratch Code                           | Reuse              | Notes                                                                                    |
| -------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `MathExtensions.ts` input rule pattern | **Reference only** | Milkdown plugin handles `$$...$$` parsing natively                                       |
| `BlockMathEditor.tsx` UX patterns      | **Adopt UX**       | Enter/Space to edit, Cmd+Enter to apply, Escape to cancel — implement in Svelte NodeView |
| Node selection clears DOM selection    | **Adopt pattern**  | Prevents highlight bleed on math blocks                                                  |

### Implementation

- [ ] Add `@milkdown/plugin-math` and `katex` dependencies
- [ ] Register math plugin in `milkdown_adapter.ts` (`.use(math)`)
- [ ] Add KaTeX CSS import (either global or scoped to editor)
- [ ] Create `math_block_editor.svelte` — keyboard-accessible editor for block math:
  - Click or Enter/Space on rendered math opens textarea
  - Cmd+Enter to apply, Escape to cancel
  - Preview renders live as user types (debounced)
- [ ] Style math blocks to match editor theme (use CSS variables)
- [ ] Ensure math nodes excluded from wiki-link and slash-command processing (add `math_block`/`math_inline` checks alongside existing `code_block` guards)
- [ ] Add `/math` slash command to insert a block math node
- [ ] Add to help data (`help_data.ts`): `{ label: "Inline Math", syntax: "$expr$" }`, `{ label: "Block Math", syntax: "$$expr$$" }`

### Testing

- [ ] Unit test for math node roundtrip (markdown → editor → markdown)
- [ ] Unit test for slash command insertion
- [ ] Verify math blocks excluded from wikilink/suggest processing

---

## Implementation Order

| #   | Feature              | Deps                         | Est.      |
| --- | -------------------- | ---------------------------- | --------- |
| 1   | Focus/Zen Mode       | None                         | 1-2 days  |
| 2   | Editor Width Presets | None                         | 1-2 days  |
| 3   | Math/LaTeX Support   | None                         | 2-3 days  |
| 4   | Contextual Commands  | None                         | 3-5 days  |
| 5   | Git Remote Ops       | None                         | 1 week    |
| 6   | AI CLI Integration   | Git remote (shared patterns) | 1-2 weeks |

Rationale: Start with the trivial UI features (Focus Mode, Editor Width), then Math/LaTeX (mostly plugin wiring + styling), then enhance the command palette (which benefits from later features adding more commands), then the heavier backend work. Wikilinks are already fully implemented — no work needed.

---

## Development Log

_(Updates added here as features are implemented)_
