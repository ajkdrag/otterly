# Phase 6: Terminal Panel

## Plan

### Goal

Embed a PTY terminal panel below the editor area, toggled with `Cmd+Shift+``.

### Approach

- Use `tauri-plugin-pty` (v0.2.1) for the Rust PTY backend — no custom Rust commands needed
- Use `@xterm/xterm` (v6) + `@xterm/addon-fit` for the terminal emulator frontend
- Follow the same feature module pattern as split_view (store + actions + UI)
- Wire into workspace_layout.svelte as a vertical Resizable.Pane below the editor

### Key Decisions

- **`tauri-plugin-pty` over manual `portable-pty`**: Plugin handles spawn, data transport, resize, kill via Tauri IPC. One-liner registration on Rust side.
- **Hotkey `Cmd+Shift+``**: `Cmd+`` was already bound to "Switch to Last Used Tab". Used `Cmd+Shift+`` to avoid disruption. Can be revisited.
- **Shell hardcoded to `/bin/zsh`**: Sufficient for macOS. Cross-platform shell detection deferred.
- **xterm theme**: Resolves CSS custom properties (--sidebar, --foreground, etc.) to actual color values at init, since xterm.js doesn't support CSS variables natively.
- **CSP updated**: Added `blob:` to `script-src` and `worker-src` for xterm.js canvas/worker support.

## Implementation

### Files Added

- `src/lib/features/terminal/state/terminal_store.svelte.ts` — Svelte 5 rune-based store (panel_open toggle)
- `src/lib/features/terminal/application/terminal_actions.ts` — Action registrations (toggle, close)
- `src/lib/features/terminal/ui/terminal_panel.svelte` — xterm.js + tauri-pty component
- `src/lib/features/terminal/index.ts` — Barrel exports
- `tests/unit/stores/terminal_store.test.ts` — 6 tests

### Files Modified

- `src-tauri/Cargo.toml` — Added `tauri-plugin-pty` dependency
- `src-tauri/src/app/mod.rs` — Registered `.plugin(tauri_plugin_pty::init())`
- `src-tauri/capabilities/default.json` — Added `"pty:default"` permission
- `src-tauri/tauri.conf.json` — Updated CSP for blob: workers
- `src/lib/app/action_registry/action_ids.ts` — Added `terminal_toggle`, `terminal_close`
- `src/lib/app/bootstrap/create_app_stores.ts` — Added `TerminalStore`
- `src/lib/app/di/create_app_context.ts` — Registered terminal actions
- `src/lib/features/hotkey/domain/default_hotkeys.ts` — Added `Cmd+Shift+`` binding
- `src/lib/app/bootstrap/ui/workspace_layout.svelte` — Added terminal pane below editor
- `package.json` — Added `tauri-pty`, `@xterm/xterm`, `@xterm/addon-fit`

### Architecture

```
workspace_layout.svelte
  └─ Resizable.PaneGroup (horizontal)
       ├─ Sidebar pane
       ├─ Editor pane
       │    └─ Resizable.PaneGroup (vertical)  ← NEW
       │         ├─ Editor content (TabBar + NoteEditor)
       │         └─ TerminalPanel (conditional, 30% default)
       └─ Context rail pane
```

## Status

- [x] Rust plugin registration + capability
- [x] Frontend dependencies installed
- [x] Terminal store (toggle/open/close/reset)
- [x] Action IDs + hotkey binding
- [x] Terminal panel component (xterm.js + tauri-pty)
- [x] Workspace layout integration (resizable bottom panel)
- [x] Theme integration (resolves CSS vars to actual colors)
- [x] CSP update for xterm.js
- [x] Unit tests (6 tests for store)

## Future Improvements

- [ ] Cross-platform shell detection (respect $SHELL, fallback to bash)
- [ ] Multiple terminal tabs
- [ ] Respawn PTY on vault change (currently keeps old cwd)
- [ ] Persist terminal panel height preference per vault
- [ ] Theme update on theme switch (currently resolved once at init)
