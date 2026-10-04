# Markdown editor migration

Status: the reported repair cases were revalidated in the native macOS app on October 4, 2026. The first acceptance pass missed unfinished list markers, empty nested quoted items, restored fence headers, existing-note HTML breaks, and spacing regressions. The repair evidence and remaining performance and platform limits are recorded below.

Otterly now uses the framework-independent `packages/markdown_editor` package through `EditorPort`. The package uses CodeMirror 6 for text editing and adds rich Markdown rendering. It has no Svelte, Tauri, filesystem, or application-store dependency. It is MIT licensed and remains private in this workspace; publishing is a separate step.

The original Markdown owns document history and saving. The browser sees an LF-normalized projection. Edits map back to the original source, including untouched BOM, whitespace, and mixed line endings. Saving does not serialize a syntax tree. Table cells publish changes while typing, so Save and tab switches see the current text.

The earlier [preservation investigation](editor_preservation_spike.md) records why the serializer-based prototypes were rejected. Its failures and validation counts belong to those prototypes, not this implementation.

## Implementation

- Rich headings, emphasis, inline code, strike, quotes, lists, tasks, links, images, tables, code blocks, and Mermaid render over Markdown source. Inline formatting exposes syntax only when the caret is inside that element. Lists and quotes retain rendered markers while editing body text; moving into their prefix exposes the original syntax.
- The host supplies navigation, wiki lookup, clipboard access, asset resolution, image storage, syntax languages, and sanitized diagrams. Existing app actions and services still own IO.
- Formatting, list continuation, indentation, hard breaks, slash commands, wiki suggestions, code controls, link editing, and find use source transactions. Undo history and selection stay with each cached note.
- Large tables mount a window of rows, with the active cell and selected search result retained. Smaller tables keep their ordinary layout.
- The adapter reuses the app's theme tokens, code highlighting, image flow, and Mermaid renderer. A switchable production adapter defaults to the source editor and lazily loads Milkdown for comparison through the command palette.

## Native acceptance

Computer-use checks ran in the macOS Tauri app against disposable files in `/tmp/otterly-cm6-acceptance-vault`. File reads after Save verified the resulting Markdown. These checks used the production adapter, not a browser mock.

| Operation                                        | Observed result                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Open and save preservation fixture               | Original 571 bytes retained, including BOM and mixed terminators.                                                       |
| Type in a table cell and immediately Save        | Only the intended cell bytes changed; padding and unrelated source stayed exact.                                        |
| Edit a 5,000-row table, Save, Undo, Save         | All typed characters retained focus; undo restored the exact prior file bytes.                                          |
| Find the last large-table row                    | The result mounted, scrolled into view, and highlighted.                                                                |
| Edit a 1.432 MB prose note                       | End navigation, typing, immediate undo, and save followed by undo worked.                                               |
| Switch notes after typing, then Undo             | The original note retained its caret and history; the edit was removed.                                                 |
| Type an opening code fence and language          | Opening syntax stayed editable; Enter entered the code editor.                                                          |
| Indent code and create a following paragraph     | Code indentation and Cmd-Enter produced the expected fenced Markdown.                                                   |
| Move above a leading code block and back into it | Typing landed in the intended paragraph/code line; undo restored the code.                                              |
| Change code language and copy code               | The fence language changed without changing its body; pasted clipboard text retained indentation.                       |
| Mermaid source and find                          | Hidden source reopened for a matching result; find kept input focus.                                                    |
| Mermaid zoom and note switching                  | Zoom changed and survived a tab round trip.                                                                             |
| Code and diagram resize handles                  | Clicking focused the handle; Down increased height by 16 pixels without moving the document caret or changing Markdown. |
| Wiki completion and slash table                  | Enter accepted the note suggestion; table insertion focused the first cell and Tab moved to the next.                   |
| Link edit, cancel, and undo                      | Escaped labels and parenthesized destinations saved correctly; cancel and undo preserved prior source.                  |
| Nested task toggle                               | Only the checkbox marker changed; undo restored it.                                                                     |
| Heading shortcut, list Tab, Shift-Enter          | Heading source, nested indentation, and a Markdown hard break with continuation indentation matched expectations.       |
| HTML clipboard                                   | Bold and emphasis converted to Markdown.                                                                                |
| Light and dark appearance                        | Tasks, strike, quotes, links, inline code, and linked SVG images remained readable; original theme restored afterward.  |
| Find after changing notes                        | Results refreshed instead of retaining the prior note's count.                                                          |

Native testing found and fixed stale active-cell saves, virtual-table focus loss, typed-fence focus loss, code boundary navigation errors, stale find counts, and resize-handle focus. Automated tests retain these regressions. A final independent review also fixed malformed percent escapes in local image targets.

The repair pass used a separate disposable vault at `/tmp/otterly-editor-repair-review` and copies of the reported notes:

- An unfinished `- ` no longer turns the preceding paragraph into a heading. A bare Setext underline remains a heading; the editable `- ` case is deliberately treated as an unfinished bullet without rewriting source.
- Enter lifts an empty nested list item out through the surrounding quote. Repeated Enter and Undo restored the exact original draft bytes.
- A restored fence header without a newline stays editable Markdown. Enter opens the code editor, whose caret remains visible while typing.
- Existing notes render legacy HTML line breaks and completed tasks. Opening and saving the `second-note` copy preserved all 16,129 bytes.
- The list, quote, heading, and code-block layout was compared with the former editor using the same fixture in the native window. List nesting, checkbox strike, code toolbar placement, and paragraph spacing were corrected.
- A 310 KB physical-line paragraph wrapped correctly. Typing, Undo, and Save preserved the original file. A cold-open 1.432 MB note accepted typing at its end; Save persisted the text and Undo removed it.
- Body text stays in the same column while editing plain, nested, ordered, task, and quoted lists. Two-digit ordered markers retain a visible text gap. Wrapped bullets keep the same text column on subsequent visual lines. Raw block prefixes appear only when editing the prefix, including an unfinished marker.
- Starting or deleting an outside bullet after a quoted list no longer changes the quote's bottom padding. Compact blank separators apply only within the same list. Native typing inside the reported nested quote, Enter to continue it, Undo, and Save restored the review file exactly. Unindented lazy continuation lines no longer receive a hanging indent without a prefix.
- Opening a new note no longer borrows the previous tab's cursor. Existing target tabs restore their own cursor and scroll position even when note loading completes before tab activation.

## Follow-up interaction and spacing repair

The next native review found failures that the earlier acceptance missed. Passing source and command tests did not establish correct browser caret geometry or style precedence.

Code widgets had 48px of vertical margins outside the box CodeMirror measured. This shifted the editor's line map relative to the visible text below a code block. Up could stall on an empty line or skip the paragraph and code entirely. The widget now includes that space as padding around an inner card. Table spacing uses the same measured-box rule. A mixed browser fixture with two code blocks, a table, and wrapped prose has zero discrepancy between visible paragraph positions and CodeMirror's line map.

Code exits also discarded the side of a wrapped-line boundary. Preserving the coordinate API's position and side prevents the next Up from skipping a displayed row. Native Up from the first code line into a five-row paragraph visited source columns 394, 296, 198, 100, and 2 in order. Native word movement then followed the expected word boundaries. In the separate blank-line fixture, Up visited trailing lines 47, 46, paragraph 45, and code body line 42. Navigation did not alter source.

Empty source lines remain editable caret stops. They now have at least 1.25em of height, including blank separators within nested lists. Previously an 8px blank row could contain a 20px caret, overlapping adjacent inline code. The nested blank line now keeps the list's body indentation, and its 20px line box contains the full caret. Heading scales, line heights, and paragraph spacing use the original editor tokens. Small visual gaps around headings may be larger than the old serialized view when an actual blank source line needs to fit a caret; additional source blank lines remain visible and navigable.

Link editing closes the hover toolbar before opening the edit form. The default white tooltip arrows were removed. Native hover, Edit, Cancel, Save, and Undo confirmed a single panel and exact source restoration. The test edit changed only the intended link label.

The slash menu was compared against the actual original plugin with identical fonts, theme tokens, and browser reset. CodeMirror's stronger default selectors were overriding the font and row padding. Corrected selectors restore the original icon, label, description, and spacing. Both comparison menus measure 242.875 by 320px, with 44.781px rows and 6px by 8px row padding. The menu keeps CodeMirror's collision-aware placement instead of adding the original plugin's 6px offset outside its layout calculations.

The language-loading warning during this review came from an isolated comparison server replacing the development app's optimized dependency cache. The app now has its own cache directory, and comparison servers use separate directories. After rebuilding the cache, native JavaScript, Python, Rust, JSON, and shell blocks loaded their grammars. Changing language also clears any warning from an earlier failed grammar request.

## Performance measurements

The October 4 repair pass treats opening and scrolling into an unseen section as separate checks. A fast first viewport did not establish fast rendering elsewhere in the note. In the native large-note check, the viewport reached the end of a 1.432 MB file while the installed syntax tree still covered only 3,057 characters. This explains the raw Markdown appearing before rich formatting.

For medium notes, the adapter now installs the full parse already needed for exact word counting. The 19,417-character PGS review note has 22 fences and four tables. Its full tree and code-block models are ready before the next paint. Large-note word counting runs in cancellable background steps and publishes its completed tree immediately. Scrolling prioritizes parsing the visible section, with one 100 ms advisory attempt followed by 8 ms frame-separated retries. Lezer can exceed those budgets while parsing a single large block.

Temporary native probes measured 57 ms from buffer opening to the second animation frame for PGS and 57 ms for the 1.432 MB note at the first viewport. These are individual development-build samples, exclude file IO, and do not establish a latency bound. With the final parsing path, restoring the large note near its end reached a complete installed tree by the second frame, 185 ms after pointer down. The earlier deferred path still had a 3,057-character tree at that point. A fast 12-page scroll then had full visible syntax coverage at the first measured frame, with all 72 Markdown marker characters hidden and a 7 ms interval to the second frame. PGS fast-scroll samples had full coverage in both newly visible sections, with 22 ms and 10 ms intervals to the second frame. These samples include no note text.

The 8 ms, 50 ms, and 100 ms first-attempt approaches were compared on the same 1.432 MB fixture. In jsdom, 8 ms and 50 ms attempts stayed incomplete; the 100 ms attempt completed in 65–67 ms. The longer initial attempt avoids waiting for the default idle parser on ordinary large-note jumps. It does not guarantee that an arbitrary-size jump or giant Markdown block finishes within one frame. Code and table widgets also estimate their offscreen height from their content and saved dimensions instead of using the default single-line estimate.

These are median JavaScript timings from a real EditorView mounted in jsdom on Darwin arm64, Node 23.11.1. They compare code paths; they are not native frame-time measurements.

| Fixture                                                       | Edit dispatch | Setup and parse |
| ------------------------------------------------------------- | ------------: | --------------: |
| 1.432 MB prose, 32,003 lines with normal paragraph boundaries |       6.48 ms |       149.11 ms |
| 500 tables and 500 code blocks, 368 KB                        |       8.99 ms |       185.57 ms |
| 5,000-row table before row windowing                          |     230.98 ms |       854.01 ms |
| Same table after row windowing                                |      20.88 ms |        61.81 ms |

A synthetic 1.4 MB single paragraph takes about 118 ms per edit, including with the Markdown parser alone. Normal paragraph boundaries avoid that pathological reparse. This remains a known performance limit. There is no matched Milkdown timing or native memory benchmark.

Local harnesses and logs live under the ignored `.codex/editor_spikes` directory. The repository regression suites under `tests/unit/adapters/cm6_*.test.ts` cover source mapping/history, structural edits, table navigation, code boundaries, formatting, links, images, completions, clipboard, and find. Adapter and reactor tests cover application lifecycle integration.

Native validation was on macOS. Windows/Linux, real IME composition, screen-reader use, and OS clipboard image capture have not received equivalent computer-use coverage. Composition and image-paste contracts have automated coverage. These limits should stay visible when deciding release coverage.

## Repository validation

The earlier implementation validation on October 4, 2026 passed `pnpm check`, `pnpm lint`, all 127 test files and 1,432 tests, `cargo check` from `src-tauri`, the standalone package build, and the production app build. `pnpm format` completed; its unrelated formatting change to `tauri.conf.json` was restored. The temporary test-vault startup override and HMR freeze were removed.

The repair validation passed `pnpm check`, `pnpm lint`, 129 test files and 1,477 tests, `cargo check`, the standalone package build, and the production app build. The final behavior-preserving simplification also passed the 24-test rich-rendering suite and type/lint checks. Formatting completed with the unrelated `tauri.conf.json` rewrite restored. Native timing probes and temporary comparison UI were removed.

## Native typing walkthrough, October 4

The follow-up review creates a new disposable note and types Markdown through the native keyboard. Prefixes and delimiters are checked character by character. Rapid sequences run without a screenshot pause between keys. Temporary local diagnostics capture the source selection, DOM selection, caret coordinates, line boxes, and scroll position at input events and the next frame. Screenshots verify the visible result. Diagnostics record only the synthetic review notes and are removed before release.

This found failures that completed-document fixtures had missed:

- Enter, Tab, then immediate typing on an empty list prefix could insert text before the marker in WebKit. Keeping the active empty prefix editable fixes the native sequence `- ab`, Enter, Tab, `c`. Its source is `- ab\n  - c`.
- Empty prefixes used a different line height. Their caret moved down four CSS pixels on the first character. The prefix now uses the same baseline and gutter as the body.
- Leaving a quoted list produced the right source but temporarily kept list indentation on the empty quote paragraph. Quote-only lines after the last item now retain quote styling alone. Native coordinates before and after typing the first `Q` have the same baseline and text origin.
- An incomplete task marker `- [ ]` hid the bullet before the parser recognized a checkbox. Rendering now waits for the parsed task marker. Native typing keeps each delimiter and caret in order.
- Code navigation skipped blank source rows in both directions. Arrow navigation now visits adjacent blank rows and never inserts source. Explicit Cmd-Enter remains the way to create prose outside a code block.
- Typing a table delimiter could replace the source before it was finished and redirect the next hyphens above the table. Native retesting keeps every delimiter character in place. Enter creates and focuses a blank row, and immediate `alpha`, Tab, `beta gamma` fills the intended cells.

Native quote-list exits, quoted prose, outside prose, task continuation, bold delimiters, wiki-link boundaries, opening code fences, and immediate code typing have been exercised. Source and caret checks are separate: correct saved Markdown alone does not establish correct typing behavior.

The native follow-up also verified mouse-drag selection within a cell, replacement, Undo restoring the selection, and cell-scoped Cmd-A after Undo. In a 300-row table, scrolling to rows 64 and 65 and clicking between their cells retained the same outer scroll position (1004 CSS pixels) and rendered row window. Image resize Undo/Redo restored 60px and 44px sizes while retaining handle focus. Plain code navigation visited both blank rows in each direction before re-entering code. Quoted-list Tab, Shift-Tab, body-start Backspace, and Shift-Enter retained their expected source prefixes.

The quoted-fence construction path also needed an explicit Enter handler. The generic Markdown binding dropped its container prefix. Native typing now saves exactly `> ```\n> nested first`, and quoted-list typing saves `> - ```\n>   nested list code\n>   next`. Left and Up at the first code character leave source unchanged. These checks run in the normal app after removing diagnostics and restoring live reload.

Reopening a note exposed a separate focus problem: the stored code or table cursor was restored, but keyboard focus remained on the outer editor. Cursor restoration now transfers existing editor focus into the selected widget and preserves focus in external controls. Native reopening of both review notes accepted the first `x` in the intended code line or table cell without a click. Undo retained widget focus and restored the saved source. Automated cases also cover legacy cursor coordinates and fresh or cached buffer switches. The final independent simplification review found no further changes worth making.
The latest typing-repair checkpoint passed all 129 test files and 1,604 tests with four test workers, `pnpm check` (zero errors or warnings), `pnpm lint`, and `cargo check`. The formatter completed and its unrelated `tauri.conf.json` formatting change was restored. The standalone package build and production app build also pass.

A repeat of the same 1,432,044-byte, 32,003-line prose benchmark after the typing repairs measured 149.60 ms median setup plus complete parsing and 7.07 ms median edit dispatch (7.46 ms p90) for the full editor. This is the same jsdom JavaScript benchmark described above, not a native frame-time measurement. It remains close to the earlier 149.11 ms setup and 6.48 ms edit sample. The single-paragraph limitation remains unchanged.

## Stress-test branch and behavior contract

The migration and repairs are kept on `feat/source-preserving-editor`. This branch is for continued stress testing before a release. The [behavior spec](markdown_editor_behavior_spec.md) records 199 scenarios with consistent setup/action, expectation, and edge-case points. It includes the reports from this session, rapid typing, source preservation, spacing, navigation, list and quote exits, tables, code, images, links, completions, cleanup, engine switching, and diagnostics. Expectations and measured evidence remain separate.

The latest spacing investigation used the composed app adapter in real Chromium. It compared 47 opening fixtures and 26 real Enter/Backspace sequences across prose, code, tables, headings, lists, quotes, and nested containers. Heading/list padding had been transferred to an actual blank separator, absorbing its visual height. Padding now stays with the block. Source blank rows add their own height. An existing first fence shifted by an inserted leading newline was also misidentified as newly typed construction; its position now maps with the same association as the block model. Quote-only and hidden standalone HTML-break rows reserve a consistent content height when syntax is exposed.

Native macOS checks in the disposable review vault verified bare `-`, Space, rapid body typing, Enter/Tab indentation, repeated Enter list exits, and quoted-list Cmd-Enter followed immediately by `O`. The saved source puts `O` outside the quote. Up from below a table visited the adjacent blank row, last body row, preceding body row, header, and preceding blank row in order. The numeric Count column remained readable beside long inline code. Long code wrapped within the wider column instead of crushing Count into individual characters.

The native blank-line check placed the caret after prose immediately above a code block. Enter inserted a visible caret row and moved the code down by 20 CSS pixels at the current theme settings. The outer document height changed from 927 to 947 CSS pixels. Backspace restored 927, the original caret, and source length. Browser variants cover additional blank rows, headings, lists, tables, and quoted blank rows. Standalone `<br>` reveal keeps its 24-pixel row in the comparison theme, and empty quote rows retain their container padding. Theme-dependent dimensions are observations, not fixed product constants.

The command palette now offers **Clean up legacy Markdown**. Preview shows counts, excerpts, and full before/after source. The optional simple-list cleanup preserves complex lists and continuations. Inline breaks, literal HTML, frontmatter, and code are protected. Dirty notes are skipped; a durable vault-local backup is written before any change. Disk content and modification time are checked again immediately before each write. Recovery refuses to overwrite later or unsaved edits. Applying the native preview changed five disposable notes, and Restore recovered them. Hashes of all 20 review notes then matched their original bytes. Real `notes` and `pkm` vaults were inspected read-only to guide the cleanup rules.

Automated cleanup tests also inject a change during a multi-note batch. The operation aborts without overwriting either external edit and retains the backup when rollback would overwrite a newer version. Service tests cover clean open-buffer refresh, cursor mapping, dirty buffers, and vault/note changes during awaited refreshes.

**Use source-preserving editor**, **Use Milkdown editor**, and **Toggle editor diagnostics** are command-palette options. Engine choice belongs to the running window. Each engine retains its own cached history, selection, and scroll for unchanged source. The latest draft and saved baseline cross engines; incompatible structural offsets do not. Returning to an engine whose source is stale creates a fresh target state. There is no cross-engine history merge. Mere switching preserves raw source; an intentional Milkdown edit still uses its original serializer and can canonicalize unrelated Markdown.

Diagnostics are opt-in in a resizable sidebar. They show source, source/structural selection coordinates, DOM focus and selection, caret geometry when available, installed parse coverage, viewport, visible block geometry, scroll state, and up to 100 input events with positions. Copy is explicit and includes note contents. Refresh samples current state, Clear resets the event ring, and Close removes collection listeners and pending frames. Diagnostics do not force parsing or modify source. Lifecycle tests verify that disabled diagnostics perform no collection work.

The final native engine walkthrough saved the unchanged Milkdown view and returned to Source with exact file bytes and the source caret restored. Typing `X` in Source, switching to Milkdown, returning, Undo, and Save restored the baseline bytes. Cold lazy loading exposed a development-server dependency optimization reload; Milkdown's entry is now scanned during server startup while its browser code remains lazy.

The final repository checkpoint passed `pnpm check` with zero errors or warnings, `pnpm lint`, all 134 test files and 1,665 tests, `cargo check`, four focused Rust cleanup tests, the standalone editor build, and the production app build. `pnpm format` completed; unrelated Rust and Tauri configuration formatting was restored. Independent review covered source preservation, cursor-coordinate boundaries, cached history, find replay, cleanup races, spacing, and disabled diagnostics. Known single-paragraph performance and platform/input-method limits above still apply.

The final native sidebar checks inspected both coordinate systems, copied a report explicitly, cleared the trace to zero events, and closed collection. A blank source row reports `caret: null` when the DOM range has no measurable box, while the visible editor caret remains intact. Typing after closing the panel and Undo/Save preserved the original file. Wrapped table Up/Down stayed within a cell before crossing to an adjacent row: source columns 211 → 111 within the last row, then the preceding row, and 12 → 112 on the return. Undo of the cell replacement restored the original selected text and exact saved bytes. A separate native Milkdown edit transferred `MNative draft` into Source and Save retained it; the serializer-added trailing newline is part of the documented legacy editing behavior. Find retained its query and one result across both switches.

An isolated empty development cache verified all 18 Milkdown entries before first browser use. The initial lazy import and real editor creation completed with an unchanged page-load count and optimizer hash. The subsequent native first switch after server restart completed without returning to the vault selector. Comparison browsers and servers used separate caches throughout.
