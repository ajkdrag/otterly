# Multi-Window Support & Non-Markdown Document Viewer

> Research, design, and implementation plan for two Carbide features:
>
> 1. Viewing PDFs and non-markdown files in-app
> 2. Opening more than one window (standalone list, browse mode, side-by-side reference)

---

## Part 1: Current State Assessment

### File Opening Flow (Today)

```
file_tree_row.svelte → activate_row()
  → only fires if node.note != null (i.e., .md file)
  → on_select_note(note_path)
    → action_registry.execute(ACTION_IDS.note_open, note_path)
      → note_service.open_note(note_path)
        → tab_store.open_tab(...)
        → editor_service.load(note_doc)
```

**Non-markdown files are invisible.** Three hard filters prevent them from appearing:

| Layer           | Location                  | Filter                                    |
| --------------- | ------------------------- | ----------------------------------------- |
| Backend listing | `notes/service.rs:254`    | `if extension != "md" { continue; }`      |
| Backend folder  | `notes/service.rs:640`    | `if !name.ends_with(".md") { continue; }` |
| Frontend tree   | `file_tree_row.svelte:99` | `if (node.note)` — null for non-.md       |

### Tab System

`TabStore` is **NotePath-centric**:

```typescript
type Tab = {
  id: TabId; // = note_path
  note_path: NotePath;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean;
};
```

All tab operations assume the content is markdown rendered by Milkdown.

### Window Management (Today)

- **Single window.** `tauri.conf.json` declares one window (`"title": "otterly"`).
- **Permissions exist** for multi-window: `core:window:allow-create`, `core:webview:allow-create-webview-window` in `capabilities/default.json`.
- **Window state plugin** (`tauri-plugin-window-state`) persists size/position — currently only for the main window.
- **No multi-window coordination** in Rust or frontend.

### Asset Protocol

Already have `otterly-asset://vault/{vault_id}/{path}` for serving files from vault:

- Registered in `storage.rs` via `register_uri_scheme_protocol`
- MIME detection via `mime_guess` crate
- CSP allows: `img-src 'self' data: blob: otterly-asset:`
- **Can serve PDFs and other file types** — the handler is already generic, not image-specific.

### Existing Dependencies (Relevant)

| Package                              | Purpose                     | Usable for                                          |
| ------------------------------------ | --------------------------- | --------------------------------------------------- |
| `prismjs` + `@milkdown/plugin-prism` | Code highlighting in editor | Code file viewer                                    |
| `codemirror` (v6)                    | Advanced code editing       | Code file viewer (better than Prism for standalone) |
| `mermaid`                            | Diagram rendering           | Already lazy-loaded                                 |
| `@floating-ui/dom`                   | Positioning                 | Toolbar UIs                                         |

**Not installed yet**: `pdfjs-dist`, `papaparse`, `shiki`

---

## Part 2: Non-Markdown Document Viewer

### Design: Discriminated Tab Union

Extend `Tab` to support multiple content types without breaking existing markdown flow:

```typescript
type TabKind = "note" | "document";

type Tab = {
  id: TabId;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean; // always false for documents
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: VaultPath; file_type: DocumentFileType }
);

type DocumentFileType = "pdf" | "image" | "csv" | "code" | "text";
```

**Why discriminated union, not separate store**: Tabs should be interleaved (PDF tab next to note tab), share MRU ordering, and support drag-reorder. A single `Tab[]` array with a `kind` discriminant is the minimal change.

### Design: DocumentViewer Component

```
note_editor.svelte (existing)
  → if tab.kind === "note" → Milkdown editor (unchanged)
  → if tab.kind === "document" → DocumentViewer dispatch

DocumentViewer.svelte
  → switch (file_type):
      "pdf"   → PdfViewer.svelte
      "image" → ImageViewer.svelte
      "csv"   → CsvViewer.svelte
      "code"  → CodeViewer.svelte
      "text"  → TextViewer.svelte (plain pre)
```

### File Type Detection

```typescript
const DOCUMENT_TYPE_MAP: Record<string, DocumentFileType> = {
  // PDF
  ".pdf": "pdf",
  // Images
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  // Data
  ".csv": "csv",
  ".tsv": "csv",
  // Code (subset — extend as needed)
  ".py": "code",
  ".r": "code",
  ".rs": "code",
  ".ts": "code",
  ".js": "code",
  ".json": "code",
  ".yaml": "code",
  ".yml": "code",
  ".toml": "code",
  ".sh": "code",
  ".bash": "code",
  // Fallback text
  ".txt": "text",
  ".log": "text",
  ".ini": "text",
};
```

### Backend Changes

**Rust: Show non-markdown files in tree** — `notes/service.rs`

The `.md`-only filter must become configurable. Two approaches:

| Approach                     | Pros                     | Cons                                     |
| ---------------------------- | ------------------------ | ---------------------------------------- |
| A. Remove filter entirely    | Simple, shows everything | `.git/`, `.DS_Store`, node_modules noise |
| B. Configurable include list | Clean tree               | More code                                |

**Recommendation: Approach B** with a default allowlist. The backend already has a `list_folder_contents` function; extend it to accept an `include_extensions` parameter with a sensible default:

```rust
const DEFAULT_VIEWABLE_EXTENSIONS: &[&str] = &[
    "md", "pdf", "png", "jpg", "jpeg", "gif", "svg", "webp",
    "csv", "tsv", "py", "r", "rs", "ts", "js", "json",
    "yaml", "yml", "toml", "sh", "txt", "log",
];
```

Hidden files (`.git`, `.DS_Store`, `.otterly`) remain filtered.

**Rust: Read file content for code/text/csv viewers**

New Tauri command:

```rust
#[tauri::command]
fn read_vault_file(vault_path: &str, relative_path: &str) -> Result<String, String>
```

For binary files (PDF, images), the `otterly-asset://` protocol already handles serving. Frontend viewers load via URL, not by reading content into memory.

### Frontend Changes

| File                             | Change                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `shared/types/note.ts`           | Add `DocumentFileType`, extend or add `DocumentTab` type      |
| `tab/state/tab_store.svelte.ts`  | Support `kind: "document"` tabs, adjust `note_path` accesses  |
| `tab/ui/tab_bar.svelte`          | Render document tabs with file-type icon, no dirty indicator  |
| `folder/ui/file_tree_row.svelte` | Handle click on non-note files → `ACTION_IDS.document_open`   |
| `note/ui/note_editor.svelte`     | Conditional: Milkdown for notes, DocumentViewer for documents |
| **New** `document/` feature      | New feature module with viewers                               |

### New Feature Module: `src/lib/features/document/`

```
document/
  domain/
    document_types.ts       — DocumentFileType, type detection
  state/
    document_store.svelte.ts — per-tab viewer state (PDF page, zoom, scroll)
  ui/
    document_viewer.svelte  — dispatch component
    pdf_viewer.svelte       — pdfjs-dist canvas rendering
    image_viewer.svelte     — zoom/pan, fit-to-width
    csv_viewer.svelte       — papaparse + table
    code_viewer.svelte      — CodeMirror read-only (reuse existing dep)
  ports.ts                  — DocumentPort (read_file, resolve_asset_url)
  adapters/
    document_tauri_adapter.ts
  index.ts
```

### Viewer Details

**PDF Viewer** (highest priority):

- Dep: `pdfjs-dist` (~2.5MB, lazy-loaded)
- Load via `otterly-asset://` URL (binary, no need to read into JS string)
- Canvas-based page rendering with virtual scrolling
- Controls: page input, prev/next, zoom slider, fit-width/fit-page
- Text layer for selection + search (`Cmd+F` within PDF)
- "Open to Side" context menu → PDF in split pane, notes in other

**Image Viewer**:

- Load via `otterly-asset://` URL (already works for editor images)
- CSS `object-fit: contain` default, toggle to actual size
- Zoom: scroll wheel or pinch, pan via drag
- Checkerboard background for transparency
- Minimal — no new dependencies

**CSV Viewer**:

- Dep: `papaparse` (~15KB)
- Read file content via `read_vault_file` command
- Virtual scrolling table for large files (reuse virtualization pattern from file tree)
- Column sort, column resize, row count
- "Copy cell" on click

**Code Viewer**:

- Reuse existing `codemirror` dependency (already installed)
- `EditorView` with `EditorState.readOnly.of(true)` + language extension
- Line numbers, fold markers, syntax highlighting
- "Copy all" button
- No new dependencies

### Implementation Order (Document Viewer)

| Step      | What                                                            | Est.         |
| --------- | --------------------------------------------------------------- | ------------ |
| 1         | Backend: extend `list_folder_contents` to include non-.md files | 0.5 day      |
| 2         | Tab system: discriminated union, document tabs                  | 1 day        |
| 3         | File tree: click non-.md file → open document tab               | 0.5 day      |
| 4         | DocumentViewer dispatch + ImageViewer (no new deps)             | 1 day        |
| 5         | CodeViewer (reuse CodeMirror)                                   | 0.5 day      |
| 6         | PdfViewer (add pdfjs-dist)                                      | 2-3 days     |
| 7         | CsvViewer (add papaparse)                                       | 1 day        |
| **Total** |                                                                 | **6-7 days** |

---

## Part 3: Multi-Window Support

### Use Cases

1. **Standalone file list** — browse a folder's contents in a separate window while editing in the main window
2. **Browse mode in new window** — open any folder as a lightweight browser without disrupting current vault
3. **Reference window** — PDF or note open in a second window for side-by-side with main editor
4. **Detached split** — like split view but in a separate window (useful with multiple monitors)

### Tauri v2 Multi-Window Architecture

Tauri v2 supports runtime window creation via `WebviewWindow::builder()` (Rust) or `new WebviewWindow()` (JS). Each window loads the same SvelteKit frontend but can receive different initialization parameters.

**Key constraint**: Each Tauri webview window is a full browser context. The SvelteKit app bootstraps independently in each window. Stores, services, and action registries are **not shared** — each window has its own instance.

### Design: Window Types

```typescript
type WindowKind = "main" | "browse" | "viewer";

// Passed as URL query params or Tauri window data
type WindowInit =
  | { kind: "main" } // default
  | { kind: "browse"; folder_path: string } // standalone file browser
  | { kind: "viewer"; vault_id: string; file_path: string }; // document viewer
```

### How It Works

**Opening a new window** (from main window):

```typescript
// Frontend: src/lib/features/window/adapters/window_tauri_adapter.ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

async function open_window(init: WindowInit): Promise<void> {
  const label = `${init.kind}-${Date.now()}`;
  const url_params = new URLSearchParams({ init: JSON.stringify(init) });

  new WebviewWindow(label, {
    url: `/?${url_params.toString()}`,
    title: compute_title(init),
    width: init.kind === "viewer" ? 900 : 1000,
    height: 700,
    decorations: true,
  });
}
```

**Bootstrap dispatch** (in app initialization):

```typescript
// In create_app_context.ts or a new window_bootstrap.ts
const params = new URLSearchParams(window.location.search);
const init_raw = params.get("init");
const window_init: WindowInit = init_raw
  ? JSON.parse(init_raw)
  : { kind: "main" };

switch (window_init.kind) {
  case "main":
    // Full app bootstrap (existing flow)
    break;
  case "browse":
    // Minimal bootstrap: folder store + file tree + document viewer
    // No vault registry, no git, no search index
    break;
  case "viewer":
    // Minimal bootstrap: single document viewer, no sidebar
    break;
}
```

### Architecture Decisions

| Decision                                | Rationale                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Each window = independent app instance  | Simplest. No shared-memory store sync needed. Matches Tauri's webview isolation model |
| URL query params for init data          | Works with Tauri's `url` parameter. No custom IPC channel needed for bootstrap        |
| Browse window uses existing browse mode | Browse mode already skips persistence, git, search. Perfect lightweight subset        |
| Viewer window is minimal                | Just the document viewer component, no sidebar/tabs. Smallest bootstrap surface       |
| No cross-window store sync (v1)         | Complexity not justified yet. User opens a folder or file; it's independent           |
| Main window owns vault lifecycle        | Only main window can switch vaults, manage settings, run git ops                      |

### Cross-Window Communication (Future)

If needed later (e.g., "open this note in main window from browse window"):

```typescript
// Tauri events are cross-window
import { emit, listen } from "@tauri-apps/api/event";

// From browse window:
await emit("open-in-main", { vault_id, note_path });

// In main window (listener registered at bootstrap):
await listen("open-in-main", (event) => {
  action_registry.execute(ACTION_IDS.note_open, event.payload.note_path);
});
```

### New Feature Module: `src/lib/features/window/`

```
window/
  domain/
    window_types.ts         — WindowKind, WindowInit
  application/
    window_actions.ts       — register open_browse_window, open_viewer_window actions
  adapters/
    window_tauri_adapter.ts — WebviewWindow creation
  ports.ts                  — WindowPort interface
  index.ts
```

### UI Integration Points

| Trigger                                       | Action               | Window Type |
| --------------------------------------------- | -------------------- | ----------- |
| File tree context menu → "Open in New Window" | `window.open_browse` | browse      |
| Tab context menu → "Detach to Window"         | `window.open_viewer` | viewer      |
| Document viewer → "Open in New Window"        | `window.open_viewer` | viewer      |
| Command palette → "New Browse Window"         | `window.open_browse` | browse      |
| Activity bar → "New Window" button (optional) | `window.open_browse` | browse      |

### Conditional Bootstrap

The main `+layout.svelte` or `create_app_context.ts` needs to branch based on window kind:

**Main window** (existing, unchanged):

- Full store/service/reactor/action bootstrap
- Sidebar + tabs + editor + context rail + status bar

**Browse window** (lightweight):

- FolderStore, TabStore, DocumentStore (if viewing files)
- NoteService (read-only), FolderService
- No VaultRegistry, no GitStore, no SearchStore, no OutlineStore
- Layout: sidebar (file tree only) + viewer pane. No context rail, no status bar git widget
- Title bar shows folder name

**Viewer window** (minimal):

- DocumentStore only
- Layout: single DocumentViewer filling the window. No sidebar, no tabs
- Title bar shows file name
- Keyboard: `Cmd+W` closes window, `Cmd+Plus/Minus` zooms

### Implementation Order (Multi-Window)

| Step      | What                                                   | Est.         |
| --------- | ------------------------------------------------------ | ------------ |
| 1         | Window types + port + adapter (WebviewWindow creation) | 0.5 day      |
| 2         | Window init parsing in bootstrap                       | 1 day        |
| 3         | Browse window layout variant                           | 1-2 days     |
| 4         | Viewer window layout variant                           | 0.5 day      |
| 5         | Context menu triggers ("Open in New Window", "Detach") | 0.5 day      |
| 6         | Cross-window events (open-in-main)                     | 0.5 day      |
| **Total** |                                                        | **4-5 days** |

---

## Part 4: Combined Implementation Plan

These features are complementary: the document viewer gives content to show in new windows, and multi-window gives a place to show documents without disrupting the editor.

### Dependency Graph

```
Step 1: Backend — show non-.md files in tree
  │
  ├─> Step 2: Tab discriminated union (note | document)
  │     │
  │     ├─> Step 3: File tree click → open document tab
  │     │     │
  │     │     ├─> Step 4: ImageViewer (no deps)
  │     │     ├─> Step 5: CodeViewer (reuse CodeMirror)
  │     │     ├─> Step 6: PdfViewer (add pdfjs-dist)
  │     │     └─> Step 7: CsvViewer (add papaparse)
  │     │
  │     └─> Step 8: Window types + adapter
  │           │
  │           ├─> Step 9: Browse window bootstrap + layout
  │           └─> Step 10: Viewer window bootstrap + layout
  │                 │
  │                 └─> Step 11: Context menu triggers + cross-window events
```

Steps 4-7 are parallelizable. Steps 8-11 can start after Step 2.

### Total Estimate

| Phase                        | Days           |
| ---------------------------- | -------------- |
| Document viewer (Steps 1-7)  | 6-7            |
| Multi-window (Steps 8-11)    | 4-5            |
| Integration testing + polish | 2              |
| **Total**                    | **12-14 days** |

### New Dependencies

| Package      | Size   | Purpose       | Load            |
| ------------ | ------ | ------------- | --------------- |
| `pdfjs-dist` | ~2.5MB | PDF rendering | Lazy `import()` |
| `papaparse`  | ~15KB  | CSV parsing   | Lazy `import()` |

No new deps for image, code, or text viewers (reuse `otterly-asset://` + existing CodeMirror).

---

## Part 5: Design Decisions (Resolved)

1. **File tree: show all files with toggle.** Default to showing all files, with a toggle to hide non-markdown. Additionally, support a `.vaultignore` file (glob patterns) to exclude specific file types/folders from vault indexing and viewing.

2. **Document tabs: read-only.** No editing of non-markdown files. Avoids save/dirty-state complexity.

3. **PDF/document: "Open to Side" by default, with "Open in New Window" option.** Split pane is the primary action; new window available via context menu or command palette for multi-monitor workflows.

4. **Browse window can open vaults.** If a browse window is opened on a vault folder, offer to "Open as Vault" in the main window via banner or context menu (cross-window event).

5. **No hard window limit.** Each window is lightweight (~10MB). Tauri manages lifecycle.

### .vaultignore Design

Stored at `<vault_root>/.vaultignore` (gitignore-compatible glob syntax):

```
# Example .vaultignore
*.exe
*.o
node_modules/
.git/
__pycache__/
*.tmp
```

- Parsed by Rust backend using `ignore` crate (same globset as `.gitignore`)
- Applied during `list_folder_contents` and `list_notes` (before sending to frontend)
- Default built-in ignores: `.git/`, `.DS_Store`, `.otterly/`, `node_modules/`
- UI: settings panel for editing ignore patterns (or direct file edit)

---

## Status

- [x] Research: current file opening flow
- [x] Research: Tauri multi-window capabilities
- [x] Research: tab system extensibility
- [x] Research: asset protocol reusability
- [x] Research: existing dependency inventory
- [x] Design: discriminated tab union
- [x] Design: DocumentViewer component hierarchy
- [x] Design: window types and bootstrap dispatch
- [x] Design: implementation ordering and estimates
- [ ] Implementation: backend non-.md file listing
- [ ] Implementation: tab system extension
- [ ] Implementation: document viewers
- [ ] Implementation: multi-window support
