# Editing existing Markdown without changing unrelated source

Investigation date: October 3, 2026. Reviewed Pi session `01a10042-b79d-76b9-b8ee-40916240311f` and the current editor implementation.

I recommend a CodeMirror 6 editor whose canonical document is Markdown source. Rich headings, lists, tables, images, and diagrams should render over that source. Keep the current editor until the replacement passes the capability gates below. None of the tested libraries or preservation prototypes is ready to ship unchanged.

The requirement is stronger than preserving YAML. A user should be able to open an existing file, change one word, and save without changing unrelated metadata, list markers, reference definitions, code fences, or line endings. Rich editing remains part of the product. Making every external file source-only would give up that experience.

## What the Pi session established

The session progressed from opening `.md` files outside a vault to the underlying source-preservation problem. Its proposed known-vault routing and external-file tabs depend on an editor that can safely save arbitrary existing Markdown. The current rich editor retains the original string until the first document change. That makes an open/save test misleading: the first real edit triggers whole-document serialization.

This investigation tested that boundary. It did not implement OS file associations, external-file tabs, or a production editor migration.

## Comparison

| Approach                             | Result                                                                                                                             | Decision                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Current Milkdown adapter             | Native one-character edit changed YAML, line endings, reference links, and table/fence formatting                                  | Unsuitable for arbitrary-file preservation                                   |
| Milkdown with protected YAML prefix  | Native metadata stayed exact; body still serialized and normalized                                                                 | Useful narrow mitigation, insufficient for the requirement                   |
| Milkdown with original source blocks | Native body edit and undo preserved untouched blocks; edited list/table/code containers canonicalize                               | More work than a small serializer fix; full fixture failed alignment         |
| Milkdown with literal text spans     | Native cell text retained table formatting; adding bold text produced an explicit serialization failure                            | Proves source spans help; rejects ordinary rich operations                   |
| Silkdown over CM6                    | Native text edit and task toggle retained metadata and CRLF; tables remain source text; no Mermaid renderer                        | Small reference implementation, too little capability coverage               |
| Latentic CM6 modules                 | Native rich table and Mermaid UI; exact source for ordinary edits/undo with the spike layer; active cell Save returned stale text  | Closest rendering/interaction reference; requires ownership and commit fixes |
| Blueberry CM6 modules                | Native rendered editable tables/code; active cell Save stale; explicit cell commit reformatted the whole table                     | Weaker preservation fit; useful code-widget reference                        |
| SilverBullet                         | Inspected source only; renderer depends on its application, space, Lua, and widget infrastructure; clicking a table reveals source | Reference behavior, not a standalone replacement                             |

The Milkdown prototypes deliberately refuse unsafe serialization. They do **not** reject the corresponding editor transaction. A user can type an unsupported edit and then be unable to save it. That behavior is unacceptable in production even though it avoids silently rewriting a file.

The full Milkdown fixture includes wiki links and an image. Block alignment failed because Otterly's wiki plugin changes plain Markdown text into view links and cursor sentinels. The native control fixture explicitly removed wiki links/images; the literal-text control also removed code blocks. Passing those controls does not establish full-document support.

## Native evidence

All mounted comparisons ran through computer use in the native Tauri app at `127.0.0.1:5173`, using disposable editor sessions. No comparison saved to a user's note. Transaction tests and jsdom mounts supplement these observations; they do not substitute for native interaction checks.

The full fixture used a BOM, 38 CRLF terminators, commented/quoted YAML, lists, tasks, aligned tables, a reference definition, a wiki link, tilde JavaScript fences, Mermaid, and an image reference.

| Native operation                                               | Observed source/behavior                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Current adapter: type one character in body                    | YAML changed; 0 CRLF, 36 bare LF; reference link became inline; tilde fence became backticks                                       |
| Protected YAML: type one character                             | YAML exact; 5 CRLF in prefix, 28 bare LF in body                                                                                   |
| Block control: body typing, then Undo                          | Neighboring list/table/reference/fence source exact; Undo returned the original string                                             |
| Block control: code typing, then one click in prose and typing | Focus moved to prose on the first click; edited tilde fence became backticks                                                       |
| Literal control: table text, then bold insertion               | Literal text retained original table spacing; bold insertion caused `UnsupportedSourcePreservation` during source publication/read |
| Silkdown: task checkbox                                        | Only the demonstrated task marker changed; YAML exact; 38 CRLF, no bare LF                                                         |
| Latentic: ordinary typing, then Undo                           | Edited source retained YAML and 38 CRLF; Undo returned the exact original string                                                   |
| Latentic: cell shows `alphaZ`, press Save before leaving cell  | Source still contained `alpha`; after leaving cell, the change was published                                                       |
| Blueberry: cell shows `alphaZ`, press Save before commit       | Source still contained `alpha`                                                                                                     |
| Blueberry: press Enter to commit cell                          | Source contained `alphaZ`, but all table spacing and delimiter widths changed                                                      |

Save in this harness reads the same source getter a save operation would use. It does not test writing the file to disk. Pending cell state is a source-publication bug even when disk writing itself works correctly.

AX text selection was unreliable on decorated content: requested offsets sometimes inserted into a different visible text run. Mouse/cell checks and actual output were used to interpret those cases. This deserves an accessibility check; it does not establish a mouse-caret defect by itself.

The candidate themes were minimally mounted, not polished for Otterly. Silkdown's separate typography was initially omitted and then supplied in scope. Latentic's default colors had poor contrast with Otterly's theme. Blueberry needed a local type-import-only patch to mount raw upstream TypeScript under Vite. These setup differences are recorded, not presented as final product design.

Saved native observations are in the local [evidence directory](../.codex/editor_spikes/native/evidence). In particular, `latentic_active_save.txt` and `blueberry_active_save.txt` show visible edited cells beside unchanged source. `blueberry_table_commit.txt` shows the later whole-table rewrite. `literal_format_failure.txt` records the refused save.

## A second preservation failure

CM6 normalizes line endings in its document. The spike kept a raw string beside that document, mapped change positions, and used original-source snapshots for undo. Ordinary edits, grouped history, undo, and redo passed the tested preservation fixtures.

The simplifier review found a counterexample:

1. Make a user edit.
2. Append text in a transaction marked `addToHistory: false`.
3. Undo the user edit.

CM6 correctly retains the later addition. The raw field restores an older snapshot and drops that addition. Saving it would lose text. The independent [reproduction and exact result](../.codex/editor_spikes/live_preview/known_failures.json) record `invariant_pass: false`. This raw-source layer must not be used for production saving.

Both preservation families also do full-document scans/parses or hold full-string history snapshots. Large-note latency and memory were not measured. Passing small source fixtures is not a performance claim.

## The proposed editor boundary

Follow `docs/architecture.md`. Implement a second `EditorPort` adapter behind the existing contract. Keep actions in `ActionRegistry`, asynchronous work in services, and file/image IO behind ports. The UI should not acquire a separate save path.

```text
App actions and services
          |
       EditorPort
          |
   Canonical Markdown changes + history
          |
   CM6 view and rendered widgets
```

Every accepted edit must update canonical source synchronously. A table cell should patch its source span while typing, or expose a synchronous flush that every save, autosave, tab switch, and close path invokes. Avoid two independently mutable documents and a whole-source snapshot undo scheme.

Preserve file encoding metadata, BOM, untouched line endings, and untouched syntax. CM6's newline normalization needs a mapped, history-aware representation of terminators, or an explicit file policy that meets the requirement. A parser may supply spans and presentation; regenerating unrelated Markdown must not be the save path.

Render frontmatter as metadata or as an editable source block using exact source ranges. Unknown syntax should remain editable and byte-preserved. Do not silently drop it or fall back to whole-document serialization.

Use Latentic's modules as reference for tables, Mermaid, syntax reveal, and paste. Use Silkdown's reference-link resolver as reference. Import only modules whose contracts we have tested and whose dependencies fit. This investigation does not justify a full wrapper or application adoption.

## Gates before changing the default

The candidate must match the current editor's actual capability inventory, including:

- Heading/list/task editing, formatting, mark-boundary escape, leading-block escape, and task Enter behavior.
- Editable tables, cell navigation, structure operations, Save while editing, and undo across the cell boundary.
- Code copy, language selection, resizing, persisted view state, and first-click transitions between code and prose.
- Mermaid rendering/source interaction, diagram controls, image insertion/paste/storage, and Tauri asset resolution.
- Link editing/tooltips/navigation, reference links, wiki resolution/suggestions, and slash commands.
- Find highlights, cursor callbacks, dirty baseline/mark-clean, cached buffers, per-buffer history, file switching, and external file changes.

The acceptance set must cover exact source changes across BOM, CRLF/LF/mixed terminators, frontmatter comments/quotes, references, escapes/entities, nested lists, tables, fences, unknown syntax, and duplicate blocks. Include structural edits, paste, move, undo/redo, and non-history transactions. Open/edit/save/reopen must be checked against actual files.

Native acceptance must include clicking through syntax reveal, code/prose transitions, selection, keyboard formatting, table focus, IME input, paste, undo, Save, switching tabs, and close. Add measured large-note latency and memory before adoption. Each gate needs a demonstrable result; feature names in an upstream README do not count.

## Local artifacts and reproduction

The isolated research package, source pins, prototypes, native harness, and output records are under `.codex/editor_spikes`. This directory is ignored by Git. Main dependencies and production editor files were restored after the comparison.

- [Milkdown report](../.codex/editor_spikes/milkdown/report.md) and [11 exact source/output pairs](../.codex/editor_spikes/milkdown/evidence.json).
- [CM6 findings, capability matrix, upstream pins, and references](../.codex/editor_spikes/live_preview/findings.md).
- [CM6 mount/table results](../.codex/editor_spikes/live_preview/mount_results.json), [preservation fixtures](../.codex/editor_spikes/live_preview/preservation_results.json), and the explicitly failed history invariant above.
- [Native harness](../.codex/editor_spikes/native/harness.ts), original route/Vite backups, and saved native observations.

Run the isolated CM6 checks from `.codex/editor_spikes/live_preview` with `node run_checks.mjs`. They preserve the known failure in a separate JSON record. For Milkdown, run `node .codex/editor_spikes/milkdown/run_checks.mjs` from the repository root. It temporarily places the 28-case test in the normal test directory and removes it afterward.

These are experimental single-session factories. They do not implement the production buffer lifecycle or asset/navigation integrations. The native harness is no longer injected into the app. Re-enabling it requires the same temporary route import and Vite filesystem access used during the comparison.

## Repository validation

The focused Milkdown suite passed 28 tests. The CM6 transaction, mount, and table contract checks passed their expected cases; the non-history undo counterexample remains a recorded failure.

After removing the temporary harness, `pnpm check` passed with no errors or warnings, `pnpm lint` passed, `pnpm test` passed 111 files and 1,132 tests, and `cargo check` passed from `src-tauri`. `pnpm format` completed; its unrelated formatting change to `tauri.conf.json` was restored. Logs are in `.codex/editor_spikes/validation`.

The native app was restored to `tr` in `test-vault`, with no comparison launcher and no edits to that note. The only Git-visible change from this investigation is this report.
