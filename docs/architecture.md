# Architecture

## What is LeapGrowNotes?

LeapGrowNotes is a desktop note-taking app built with **Tauri** (Rust backend) and **SvelteKit** (TypeScript frontend, Svelte 5). Notes are stored as local Markdown files organized into vaults. The app provides rich editing (ProseMirror), full-text search (SQLite FTS), wiki-style linking, tabs, git versioning, and theming. All state management lives on the frontend; the Rust backend is a thin IPC layer exposing native capabilities.

## How is it built?

### The mental model

The frontend is structured around four layers and a single dispatch surface:

1. **Ports + Adapters** — interfaces for every IO boundary (filesystem, IPC, clipboard, search index). Adapters implement those interfaces for Tauri; services never import adapters directly.
2. **Stores** — reactive `$state` classes holding app state. Synchronous, deterministic, side-effect free.
3. **Services** — async use-case orchestration. One public method = one user intention. Services read/write stores and call ports for IO.
4. **Reactors** — persistent `$effect.root()` observers that watch store changes and trigger service calls. The only place where store observation drives side effects.

The **Action Registry** is the single dispatch surface. UI, keyboard shortcuts, command palette, and Tauri menus all trigger behavior through `action_registry.execute(ACTION_ID, ...args)`.

```
┌──────────────────────────────────────────────────┐
│  UI  (Svelte 5 + shadcn-svelte)                  │
│  Reads stores via $derived.                      │
│  Triggers actions via action_registry.execute()  │
└────────────────────┬─────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Action Registry   │  Typed map of triggerable actions.
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │      Services       │  Async orchestration.
          │  Reads/writes stores│  Calls ports for IO.
          └───────┬─────┬───────┘
                  │     │
       ┌──────────▼┐   ┌▼──────────┐
       │   Stores   │   │   Ports   │  Interfaces for IO.
       │  ($state)  │   │ (interf.) │  Adapters implement.
       └──────┬─────┘   └───────────┘
              │
  ┌───────────┴───────────┐
  │                       │
┌─▼────────┐       ┌─────▼──────────┐
│ UI reads │       │    Reactors    │  $effect.root() observers.
│ $derived │       │ (side effects) │  Trigger services on
└──────────┘       └────────────────┘  store changes.
```

### Runtime loop

When a user clicks a button, presses a shortcut, or picks a command:

1. UI calls `action_registry.execute(ACTION_ID, ...args)`.
2. The action handler calls a service method (or mutates UIStore directly for pure UI concerns).
3. The service performs IO through ports, then updates domain/op stores.
4. The action applies any UI-side mutations from the service result (selected folder, dialog state).
5. Components rerender from store state via `$derived`.
6. Reactors that observe relevant store changes fire and trigger follow-up service calls (autosave, tab persistence, git autocommit, etc.).

## Project map

### Feature modules

Each feature is a vertical slice owning its own stores, services, actions, ports, adapters, domain logic, and UI:

| Feature     | Owns                                                          |
| ----------- | ------------------------------------------------------------- |
| `vault`     | Vault registry, open/close lifecycle, settings, watcher setup |
| `note`      | Note CRUD, save/rename/delete, image assets                   |
| `folder`    | Folder CRUD, file tree rendering, drag-and-drop moves         |
| `editor`    | ProseMirror session, buffer management, markdown sync         |
| `search`    | Full-text search, omnibar, find-in-file, wiki suggestions     |
| `tab`       | Tab bar, tab lifecycle, tab caching and persistence           |
| `git`       | Git init, status, commit, history, checkpoint, restore        |
| `settings`  | App and vault settings read/write                             |
| `hotkey`    | Custom hotkey editing and persistence                         |
| `theme`     | Theme CRUD, switching, custom theme editing                   |
| `links`     | Backlinks, local links, link repair on rename                 |
| `clipboard` | Copy markdown to clipboard                                    |
| `shell`     | Open external URLs                                            |
| `watcher`   | Filesystem watcher start/stop                                 |

### Folder structure (first 2 levels)

```
src/
├── lib/
│   ├── app/              # Bootstrap, action registry, DI, orchestration (UIStore, OpStore)
│   ├── features/         # Feature-first vertical slices
│   ├── shared/           # Cross-feature: types, utils, adapters, constants, db
│   ├── reactors/         # Persistent store observers
│   ├── components/       # Shared UI primitives (shadcn-svelte)
│   └── hooks/            # Shared hooks (keyboard shortcuts, external links)
├── routes/               # SvelteKit entrypoint (+page.svelte)

src-tauri/src/
├── app/                  # Tauri builder, plugin/state/command registration
├── features/             # Rust feature modules (vault, notes, search, git, etc.)
├── shared/               # Vault registry persistence, constants, asset handler
└── tests/                # Integration test entry points

tests/
└── unit/                 # Frontend unit tests (stores, services, reactors, adapters, etc.)
```

### Cross-runtime split

Features exist in both runtimes but stay physically separate: TypeScript in `src/lib/features/<name>/`, Rust in `src-tauri/src/features/<name>/`. Feature names match across runtimes when they represent the same capability. TS calls Rust exclusively through feature adapters (`*_tauri_adapter.ts`) that invoke `@tauri-apps/api` IPC. Rust exposes only `#[tauri::command]` functions — no direct frontend coupling.

## Feature anatomy

Using `note` as the example:

```
src/lib/features/note/
├── index.ts              # Public entrypoint: re-exports everything other features may import
├── ports.ts              # IO contracts (NotesPort, AssetsPort interfaces)
├── state/
│   └── note_store.svelte.ts   # $state class: notes list, recent notes, starred, folders
├── application/
│   ├── note_service.ts        # Async use-cases: open, save, rename, delete
│   ├── note_actions.ts        # Action registrations (calls service + mutates UIStore)
│   └── note_action_helpers.ts # Shared helpers for actions
├── domain/
│   ├── ensure_open_note.ts    # Pure business rules (no IO, no framework)
│   ├── sanitize_note_name.ts
│   └── ...
├── adapters/
│   ├── notes_tauri_adapter.ts # Tauri IPC adapter implementing NotesPort
│   └── assets_tauri_adapter.ts
├── types/
│   └── note_service_result.ts # Result types for service methods
└── ui/
    ├── note_editor.svelte     # Feature-scoped UI components
    ├── rename_note_dialog.svelte
    └── ...
```

Every feature follows this pattern. Cross-feature imports go through `index.ts` entrypoints, never deep file paths.

## State ownership

### Domain stores (`src/lib/features/*/state/*_store.svelte.ts`)

Each feature owns its domain state: `VaultStore`, `NotesStore`, `EditorStore`, `SearchStore`, `TabStore`, `GitStore`, `LinksStore`. These are `$state` classes instantiated once in `create_app_stores()`.

- **Who writes**: Services (after IO completes) and actions (for immediate mutations).
- **Who reads**: Components via `$derived`, reactors via `$effect`, services (to check current state before IO).
- **Rules**: Sync only. No async/await. No imports from services, adapters, reactors, or UI.

### UIStore (`src/lib/app/orchestration/ui_store.svelte.ts`)

Ephemeral cross-screen UI state: dialog open/close, sidebar view, omnibar state, editor settings, hotkey recorder, selected folder path. Components and actions mutate it directly.

- **Who writes**: Actions and components.
- **Who reads**: Components and reactors.
- **Rules**: Services must not import UIStore. UI orchestration belongs in actions.

### OpStore (`src/lib/app/orchestration/op_store.svelte.ts`)

Tracks async operation status by key (`idle` | `pending` | `success` | `error`) with error messages. Backed by `SvelteMap`.

- **Who writes**: Services call `start()`, `succeed()`, `fail()`.
- **Who reads**: Components check `is_pending()` and `get()` for loading/error UI.

### Component-local state

Purely visual concerns (focus, scroll position, animation) stay inside components as local `$state`, `$derived`, or `$effect`.

## Decision tree: where does new code go?

```
START
  │
  ├─ Is it IO? (file, IPC, native API)
  │    └─ Port interface + Adapter
  │
  ├─ Persistent domain data?
  │    └─ Domain Store mutation
  │
  ├─ Ephemeral UI layout? (sidebar, modal, panel)
  │    └─ UIStore — component mutates directly, no service
  │
  ├─ Loading / error for an async op?
  │    └─ OpStore — service writes, component reads
  │
  ├─ User-triggerable action? (click, shortcut, menu)
  │    └─ ActionRegistry entry → calls service method
  │
  ├─ Async workflow with IO + store updates?
  │    └─ Service method
  │
  ├─ Store change must auto-trigger a side effect?
  │    └─ Reactor
  │
  ├─ Computed from existing state?
  │    └─ $derived in store or component
  │
  └─ Visual-only? (focus, scroll, animation)
       └─ Component-local $effect / $state
```

## Key rules

1. **All IO goes through ports/adapters.** No `invoke()` calls outside adapter files. (Keeps IO testable and swappable.)
2. **Stores are sync and side-effect free.** No async/await, no imports from services/ports/domain. (Prevents hidden coupling and race conditions.)
3. **Services never subscribe to store changes.** They read stores but must not use `$effect`. Store observation belongs in reactors. (Clear separation of "do work" vs "react to changes".)
4. **Reactors are the only persistent store observers that trigger side effects.** They call services or pure runtime utilities; they never write to stores directly. (Single mechanism for reactive side effects.)
5. **User-triggerable behavior uses the action registry.** Components call `action_registry.execute()`, never services directly for side effects. (One dispatch surface for shortcuts, menus, command palette, and UI.)
6. **Components do not import services.** (Enforces the action registry as the only interaction path.)
7. **Services never import UIStore.** UI orchestration belongs in actions. (Keeps services testable without UI coupling.)
8. **No global singletons.** Use Svelte context + composition root. (Testable, predictable lifecycle.)
9. **One truth per concern.** ProseMirror owns live doc content. Domain stores own persisted state. OpStore owns operation status. UIStore owns layout/dialog state. (No competing sources of truth.)
10. **Cross-feature imports go through entrypoints.** Import `$lib/features/<name>`, never deep paths like `$lib/features/<name>/state/...`. (Stable public surfaces, refactor-safe internals.)

### Layering lint

`pnpm lint:layering` (via `scripts/lint_layering_rules.mjs`) statically enforces these rules:

- `stores` cannot import ports, adapters, services, reactors, actions, components, or domain; cannot use `async`/`await`
- `services` cannot import adapters, components, or reactors; cannot use `$effect`; cannot import `ui_store.svelte`
- `reactors` cannot import adapters or components; should not use inline `await`
- `actions` cannot import ports, adapters, or components
- `components` cannot import ports, adapters, services, or reactors
- `routes` cannot import ports, services, stores, reactors, or actions; should use context helpers
- Cross-feature deep imports are disallowed; import through feature entrypoints
- App code cannot import from `tests/`

## Conventions

### Naming

- **Files**: snake_case (`note_service.ts`, `note_store.svelte.ts`, `notes_tauri_adapter.ts`)
- **Feature entrypoints**: `src/lib/features/<name>/index.ts`
- **Stores**: `*_store.svelte.ts`
- **Services**: `*_service.ts`
- **Actions**: `*_actions.ts`
- **Adapters**: `*_tauri_adapter.ts`
- **Reactors**: `*.reactor.svelte.ts`

### Testing

- Tests live in `tests/unit/` at the top level, grouped semantically: `stores/`, `services/`, `reactors/`, `adapters/`, `utils/`, `actions/`, `domain/`, `hooks/`, `db/`
- Shared fixtures and mock ports live in `tests/unit/helpers/`
- Tests must be deterministic, readable, and fail loudly on assertion errors
- No comments/docstrings in tests unless the logic is non-obvious

### Dependency injection

Services receive ports and stores via constructor injection. The composition root (`create_app_context` in `src/lib/app/di/create_app_context.ts`) wires everything:

1. `create_app_stores()` instantiates all stores
2. Each service is constructed with its required ports + stores
3. `register_actions()` registers all actions with services and stores
4. `mount_reactors()` starts all persistent observers
5. The result is provided to the component tree via `provide_app_context()`

### What NOT to do

- Do not call `invoke()` anywhere except inside adapter files
- Do not import a feature's internals from outside that feature (use `index.ts`)
- Do not put async logic in stores
- Do not use `$effect` in services
- Do not call services directly from components for side effects — use the action registry
- Do not import UIStore from services
- Do not create global singleton instances — use the context system
- Do not put domain logic in stores (stores can import `utils` but not `domain`)

## Accepted deviations

- **EditorService statefulness**: Holds persistent session state (`session`, `host_root`, `active_note`, `session_generation`) because it manages a live DOM editor session. The `session_generation` counter guards against race conditions.
- **VaultService lifecycle state**: Stores `active_open_revision` and `index_progress_unsubscribe` for "latest vault-open intent wins" cancellation.
- **SearchService request revisions**: Stores per-use-case revision counters to ignore stale async responses. Cancellation bookkeeping only.
- **Keyboard shortcuts**: Action definitions include `shortcut` metadata for display. Actual binding is imperative in `src/lib/hooks/use_keyboard_shortcuts.svelte.ts` for fine-grained event control.
- **op_toast reactor**: Calls `svelte-sonner` toast functions directly. Toast notifications are fire-and-forget UI feedback with no store side effects.

## Worked example: rename note

Here is the full path for renaming a note, showing every layer in action.

**1. Port** — `NotesPort` defines `rename_note(vault_id, from, to)` in `src/lib/features/note/ports.ts`. The Tauri adapter in `src/lib/features/note/adapters/notes_tauri_adapter.ts` implements it via IPC.

**2. Domain** — `note_path_exists()` from `src/lib/features/note/domain/note_path_exists.ts` checks whether the target path conflicts with an existing note. Pure function, no IO.

**3. Store mutation** — `NotesStore.rename_note(old_path, new_path)` in `src/lib/features/note/state/note_store.svelte.ts` updates the notes array, re-sorts, and fixes starred paths. Synchronous.

**4. Service method** — `NoteService.rename_note(note, new_path, overwrite)` in `src/lib/features/note/application/note_service.ts`:

- Checks conflict via `note_path_exists()`
- Starts OpStore tracking (`op_store.start("note.rename")`)
- Calls `notes_port.rename_note()` (IO through port)
- Updates the search index via `index_port.rename_note_path()`
- Triggers link repair via `link_repair.repair_links()`
- Mutates `notes_store.rename_note()` and `editor_store.update_open_note_path()`
- Resolves OpStore (`op_store.succeed()` or `op_store.fail()`)
- Returns a typed result: `{ status: "renamed" }`, `{ status: "conflict" }`, or `{ status: "failed" }`

**5. Action** — `register_note_actions()` in `src/lib/features/note/application/note_actions.ts` registers:

- `note.request_rename` — opens the rename dialog via UIStore, resets OpStore
- `note.confirm_rename` — calls `note_service.rename_note()`, handles conflict/success, updates tabs, clears filetree cache, closes dialog
- `note.cancel_rename` — closes dialog, resets OpStore

**6. Component** — `rename_note_dialog.svelte` reads UIStore for dialog state and OpStore for loading/error. User input triggers `action_registry.execute('note.update_rename_name', ...)` and `action_registry.execute('note.confirm_rename')`.

**7. Reactor** — No dedicated reactor needed. Tab persistence and other cross-cutting concerns fire automatically from their own store observations if the rename affects active state.

Pattern: **Port -> Domain -> Store -> Service -> Action -> Component**. Add a reactor only when a store change must auto-trigger a side effect.

## Backend architecture (Rust / Tauri)

The backend is a Tauri native process. Its sole job is exposing native capabilities via IPC commands. There is no service layer, event bus, or domain state management on the backend — those all live on the frontend.

| Module      | Responsibility                                                               |
| ----------- | ---------------------------------------------------------------------------- |
| `app/`      | Composition root: registers plugins, managed state, and all command handlers |
| `features/` | One sub-module per capability. Each owns command handlers and managed state  |
| `shared/`   | Vault registry persistence, constants, asset request handler                 |

Stateful services (watcher, search index) use Tauri's `.manage()` system. State structs live in each feature's `service.rs` and are registered in `app/mod.rs`. Commands receive state via Tauri DI: `fn watch_vault(state: tauri::State<'_, WatcherState>, ...)`.

Backend invariants:

1. All native capabilities are exposed exclusively through `#[tauri::command]` functions
2. Managed state structs live in the feature's `service.rs` — no global statics
3. Cross-feature shared code goes in `shared/`, not inside a feature module
4. `app/mod.rs` is the only place that registers plugins, state, and command handlers
5. Backend holds no domain state between calls (exceptions: `WatcherState` and `SearchDbState` which are explicit lifecycle-managed state)

## Validation checklist

Run before submitting any code:

```bash
pnpm check              # Svelte/TypeScript type checking
pnpm lint               # oxlint + layering rules (includes pnpm lint:layering)
pnpm test               # Vitest unit/integration tests
cd src-tauri && cargo check   # Rust type checking
pnpm format             # Prettier formatting (writes changes)
```
