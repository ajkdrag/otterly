# Markdown editor behavior spec

This is Otterly's acceptance contract for Markdown editing. Use it when changing the editor, replacing its libraries, or repairing a reported interaction. A replacement may use a different design, but it must preserve these user-visible behaviors and the saved source.

The scenarios record requirements from the editor investigation, native typing reviews, current tests, and the original app experience. An expected result is a contract, not a claim that every combination has passed. Current evidence belongs in [the validation report](markdown_editor_validation.md). Prototype comparisons belong in [the preservation investigation](editor_preservation_spike.md).

The source-preservation scenarios apply to the source editor and to any future editor chosen to replace it. Otterly no longer ships the Milkdown editor or runtime engine switching, so sections 21 and 22 are retired. Their IDs stay reserved.

## How to use this document

Each scenario has a stable category and number. Keep an ID when its wording improves. Add a new ID for a new behavior; do not renumber later scenarios.

Every scenario uses the same points:

- **Setup/action:** The fixture and operation to exercise.
- **Expected:** Source, visible result, selection, focus, and history behavior that matter.
- **Edge cases/notes:** Variants and limits to include in acceptance.

Cmd means Command on macOS. The corresponding app shortcut uses Ctrl on Windows/Linux unless its existing platform binding says otherwise. A physical source line and a wrapped visual row are different. Moving through a visual row must not insert a newline.

For each editing scenario, check the screen and the saved Markdown separately. Check immediately after the action, after the next rendered frame, after Save, and after Undo/Redo. Run rapid key sequences without pausing for a screenshot between each character. Test the composed production editor, since isolated extensions can hide binding conflicts.

Use disposable notes and vaults. For preservation cases, retain an exact original file and compare saved bytes. Use LF, CRLF, mixed endings, BOM, non-ASCII text, and no final newline where relevant. For visual cases, record viewport size, zoom, theme, scroll position, caret position, and keyboard focus.

## Source and application ownership

The file's original Markdown owns saving and history. Rich controls edit that source. The browser may use a normalized display projection, but that projection must not become a serializer for the whole file.

The editor package owns editing and rendering. The app owns note identity, saving, assets, navigation, search, clipboard access, and vault operations through its existing ports, services, and actions. A library migration must preserve those boundaries. See [the architecture](architecture.md) and [the package contract](../packages/markdown_editor/README.md).

The source flow is:

- A keyboard action or rich control changes the intended source span.
- The editor updates canonical source and its history synchronously.
- Rendering follows that source and retains the intended selection.
- Save and note switching read current source, even before a debounced notification.
- Async work publishes only into the note, view, and request that still own it.

## Core model

The editor package is a plugin framework. [Its design](../packages/markdown_editor/DESIGN.md) explains the model these scenarios rely on:

- Constructs come in three kinds. Inline and line constructs render from one view plugin over the visible tree. Block constructs render from one state field, always over whole lines, and never depend on parse progress.
- One function per kind decides when source shows. An empty caret touching an inline node reveals it. An empty caret inside a line's container prefix reveals the prefix. Non-empty selections never reveal.
- A line's quote and list prefix is parsed in one place (`line_container`). Every editing command and the renderer use it.
- Construct keys dispatch through context, innermost construct first.
- Code bodies and active table cells are surfaces: nested editors over a window of the source. The core owns their focus and scrolling.
- A construct that throws renders its node as source. It never disables the rest of the rendering.

## Coverage and open checks

The package suites under `packages/markdown_editor/tests` cover source/history, formatting, block commands, lists/quotes, code, tables, frontmatter, links, images, completions, clipboard, find, and the plugin contract. App suites cover the adapter, lifecycle, and reactor restoration. These tests run in jsdom and do not establish geometry, focus, or IME behavior in a real WebView.

| Area                        | Existing evidence                                                                | Remaining acceptance obligation                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Exact source and history    | Source-state, adapter, clipboard, code, and table tests; native file comparisons | Retain exact-byte checks through future changes.                                                                |
| Native typing and focus     | macOS Tauri repair walkthroughs, including code/table reopening                  | Repeat after changes to rendering, selection, geometry, or key ordering.                                        |
| Wrapped navigation          | Focused command tests and real-browser/native walkthroughs                       | Check the target WebView and both movement directions.                                                          |
| Blank lines and spacing     | Layout tests, browser sweeps, and native Enter/Backspace above code              | Repeat visual gap and caret checks after geometry changes, including nested containers and multiple blank rows. |
| Large documents             | Medium/large fixtures, table windowing, and documented timing samples            | Separate first open, unseen scrolling, restoration, and edit latency. There is no universal timing guarantee.   |
| Cleanup                     | Domain/service tests, backend conflict tests, native preview/apply/restore       | Retain backup and conflict checks independently of editor Undo; repeat active-buffer and external-edit races.   |
| Platforms and input methods | Strongest computer-use evidence is macOS                                         | Windows/Linux, real IME, assistive technology, and OS image clipboard need their own checks.                    |

A synthetic giant single paragraph remains a known reparse cost. Parser time budgets are cooperative, so one block can exceed them. A failed or unmeasured case remains visible; do not weaken its expected behavior to make a migration checklist green.

## 1. Exact source, saving, and history

### SRC-001. Open and Save without an edit

- **Setup/action:** Open a note containing unusual whitespace, reference links, fences, HTML breaks, and mixed line endings. Save without typing.
- **Expected:** The file remains byte-for-byte identical. Opening, parsing, rendering, counting, or focusing does not mark it dirty.
- **Edge cases/notes:** Include BOM, trailing spaces, a final newline, no final newline, and empty files.

### SRC-002. Edit only the intended span

- **Setup/action:** Change one word in a large note with several unrelated Markdown constructs.
- **Expected:** Only the intended text changes. Marker spelling, reference definitions, delimiters, indentation, blank lines, and unrelated source remain exact.
- **Edge cases/notes:** Repeat through a rich control, table cell, code editor, and ordinary paragraph.

### SRC-003. Preserve original line endings

- **Setup/action:** Edit beside LF, CRLF, and lone-CR boundaries in one file.
- **Expected:** Untouched terminators retain their original kind. Display normalization does not normalize the saved file.
- **Edge cases/notes:** Delete and join a boundary, insert a newline, then Undo and Redo. Check exact original endings after Undo.

### SRC-004. Preserve explicitly pasted terminators

- **Setup/action:** Paste text containing mixed line endings into a note, including at multiple selections.
- **Expected:** The pasted source retains its explicit terminators, while surrounding source stays exact.
- **Edge cases/notes:** Include paste beside rendered blocks and into an empty file. Undo removes the entire pasted fragment without rewriting neighboring endings.

### SRC-005. Save before a notification timer

- **Setup/action:** Type in prose, code, or a table cell and immediately invoke Save.
- **Expected:** Save sees every completed input character. Application notification debounce never delays the source used for persistence.
- **Edge cases/notes:** Repeat immediate tab switching and flushing. Native typing must not require blur to publish a cell edit.

### SRC-006. Undo and Redo restore exact source

- **Setup/action:** Perform text edits, formatting, container edits, widget edits, and a mixed-ending newline deletion.
- **Expected:** Undo restores original source and intended selection; Redo restores the edit. History does not regenerate Markdown through serialization.
- **Edge cases/notes:** Repeat full history cycles and backwards selections. Widget focus and visual caret affinity belong to the history checks.

### SRC-007. Group typing without merging separate actions

- **Setup/action:** Type a rapid word, paste another fragment, and apply a rich command.
- **Expected:** Consecutive typing groups naturally; paste and explicit commands remain meaningful separate history actions.
- **Edge cases/notes:** Code and table typing share the note's source history. Deleting the final formatted character must not leave generated empty delimiters.

### SRC-008. Preserve non-history edits through history

- **Setup/action:** Add an external or non-history insertion at a boundary previously edited by the user, then Undo/Redo the user edit.
- **Expected:** The non-history insertion survives both directions. Source/display mapping remains correct.
- **Edge cases/notes:** Include a deleted CRLF boundary, disjoint edits, and equal-length replacements. This was a failed invariant in an earlier prototype.

### SRC-009. Keep source offsets unambiguous

- **Setup/action:** Select text beside emoji, non-ASCII characters, and mixed line endings through app editing APIs.
- **Expected:** Current editor offsets identify UTF-16 positions in the LF display projection. They are never treated as saved-file byte offsets.
- **Edge cases/notes:** Legacy structural offsets restore through line/column instead. Clamp stale positions to the current document.

### SRC-010. Keep each saved baseline independent

- **Setup/action:** Edit two notes, Save one, Undo the other, rename a cached note, and revisit both.
- **Expected:** Each note's source, history, and clean baseline stay independent. Saving one cannot clear another note's dirty state.
- **Edge cases/notes:** A fresh disk restoration deliberately replaces a cached state; ordinary cache reuse retains its history.

### SRC-011. Frontmatter stays literal and distinguishable from a divider

- **Setup/action:** Open valid YAML frontmatter, a leading horizontal rule, and an unfinished metadata draft; insert a closing metadata fence.
- **Expected:** Recognized metadata stays literal and keeps source exact. Rendering and parsing update at its actual closing boundary; a real body divider keeps divider behavior.
- **Edge cases/notes:** Do not activate links, tasks, tables, or prose commands inside recognized metadata. Cleanup conservatively protects unfinished metadata even when the editor presents it as editable prose.

### SRC-012. Unknown syntax remains editable and preserved

- **Setup/action:** Open Markdown extensions or literal HTML that the rich renderer does not understand, then edit neighboring prose and Save.
- **Expected:** Unsupported content remains reachable source and stays unchanged unless directly edited. A migration cannot silently drop it to satisfy a simpler document model.
- **Edge cases/notes:** Preserve safe reference definitions, attributes, escaped text, and malformed drafts. Rich rendering must not execute arbitrary note HTML.

### SRC-013. Display escapes without canonicalizing them

- **Setup/action:** Open escaped punctuation and character entities, move the caret into/out of them, and Save.
- **Expected:** Supported escapes/entities display as their intended text while retaining the exact source spelling. Active source remains editable.
- **Edge cases/notes:** Code and metadata keep literal content. Equivalent entity spellings are not interchangeable for exact-source acceptance.

## 2. Opening, parsing, scrolling, and performance

### PERF-001. First viewport is immediately useful

- **Setup/action:** Cold-open an ordinary note with headings, lists, links, tables, and fences.
- **Expected:** Visible content renders coherently and accepts typing. Rich widgets do not briefly steal or redirect the first input.
- **Edge cases/notes:** Check file loading separately from editor setup. A fast empty viewport is not proof of a useful first render.

### PERF-002. Medium-note parsing is published

- **Setup/action:** Open a medium note with many tables/fences, including the roughly 19 KB review fixture.
- **Expected:** The full parse required for the initial word count also becomes available to rendering. Counting must not discard an independently built tree.
- **Edge cases/notes:** The current synchronous path is bounded at 50,000 display characters. This is an implementation choice, not a permanent package requirement.

### PERF-003. Unseen sections render after a jump

- **Setup/action:** Jump several screens down or to the end of a large note before its background parse finishes.
- **Expected:** The visible section gains rich rendering promptly. The editor prioritizes that viewport instead of waiting indefinitely for idle parsing.
- **Edge cases/notes:** Test first open and an unseen jump separately. Retain source and caret while tables/code replace their raw display.

### PERF-004. Large-note counting yields and cancels

- **Setup/action:** Open a large note, then edit or switch notes while word counting is pending.
- **Expected:** The UI remains usable; obsolete work cannot publish stale counts, cursor details, or syntax into the new note.
- **Edge cases/notes:** A pending indication is preferable to a false final count. Destroying a view cancels queued retries and callbacks.

### PERF-005. Large tables keep editing bounded

- **Setup/action:** Open a 5,000-row table, scroll to a distant row, edit, Save, and Undo.
- **Expected:** Only a bounded row window needs DOM. The active cell and selected find result mount and retain source/history correctness.
- **Edge cases/notes:** Compare setup and edit costs before/after changes using the same frozen fixture. Do not equate DOM count with native frame time.

### PERF-006. Large prose and giant paragraphs are separate cases

- **Setup/action:** Edit a roughly 1.4 MB note with normal paragraph boundaries, then a similarly sized single physical paragraph.
- **Expected:** Both remain source-correct and recoverable. Report the giant-paragraph slowdown separately rather than hiding it in averages.
- **Edge cases/notes:** Current giant-paragraph performance is a known limit. No documented development-build sample establishes a universal latency bound.

### PERF-007. Async grammars do not stall document rendering

- **Setup/action:** Open a code-heavy note while one syntax language is still loading.
- **Expected:** Markdown structure, word counting, visible code text, and editing proceed. Pending grammars do not trigger endless viewport retries.
- **Edge cases/notes:** Use isolated comparison caches so test servers do not replace the running app's dependency cache.

## 3. Caret, selection, and navigation

### NAV-001. The caret corresponds to the visible text

- **Setup/action:** Click prose before/after code and tables, then type and move vertically.
- **Expected:** The caret lands in the visible line under the pointer. The editor's measured line geometry matches the screen.
- **Edge cases/notes:** Widget margins/padding must be included in measured layout. Correct source offsets alone do not prove correct geometry.

### NAV-002. The caret stays visible in empty rows

- **Setup/action:** Place the caret in an empty paragraph or a blank separator within a nested list.
- **Expected:** The line box contains the whole caret. It does not overlap a neighboring row or inline code.
- **Edge cases/notes:** Include small spacing settings, zoom, and both themes. Empty rows remain real caret stops.

### NAV-003. Every blank row is a stop

- **Setup/action:** Repeatedly press arrows across one and two blank rows before and after a code block or table.
- **Expected:** Movement visits each adjacent source row before crossing a widget boundary. It does not skip blanks or stall on them.
- **Edge cases/notes:** Check vertical and horizontal code movement, table vertical movement, and quote/list-prefixed blank rows.

### NAV-004. Wrapped prose moves by visual row

- **Setup/action:** Press Up/Down through a paragraph wrapped into several screen rows beside a widget.
- **Expected:** Each key visits the next visual row. Entry into code/table happens only after reaching the actual adjacent source row.
- **Edge cases/notes:** A physical line is not one arrow step. Repeated movement must retain the intended horizontal goal.

### NAV-005. Wrapped-boundary affinity survives transitions

- **Setup/action:** Exit code into a wrapped paragraph at an offset shared by two visual rows, then press another vertical arrow.
- **Expected:** The caret retains the correct visual side of that boundary. The next arrow visits the neighboring visual row instead of skipping it.
- **Edge cases/notes:** Check reversed direction, offscreen destinations, and history restoration. Text offsets alone cannot represent this distinction.

### NAV-006. Word movement follows visible words

- **Setup/action:** Use the platform word-left/word-right keys in wrapped prose and code.
- **Expected:** Movement follows ordinary platform word boundaries and leaves source unchanged.
- **Edge cases/notes:** Include punctuation, Unicode, empty lines, and transitions near rendered Markdown. Plain arrows and modified arrows have distinct contracts.

### NAV-007. Navigation never inserts source

- **Setup/action:** Press arrows at the first/last code character and at document edges.
- **Expected:** Arrows move through existing content or remain at the boundary. They never manufacture paragraphs, prefixes, or another code block.
- **Edge cases/notes:** Explicit Enter/Cmd-Enter can edit source. Test unfinished and quoted fences as well as closed plain fences.

### NAV-008. Selection direction remains intact

- **Setup/action:** Make backwards and cross-paragraph selections, then format, indent, Undo, or Redo.
- **Expected:** The same intended text stays selected with its direction preserved. A command does not silently collapse a valid range.
- **Edge cases/notes:** Multiple selections touching one subtree must not apply the same indentation twice.

### NAV-009. Mouse selection and keyboard selection coexist

- **Setup/action:** Drag-select text, then use arrows with Shift and platform modifiers.
- **Expected:** Native selection extends/collapses according to the active editing surface. Rich navigation handlers do not consume ordinary selection gestures.
- **Edge cases/notes:** Include table cells and nested code. A single range and multiple ranges may use different paint paths, but both stay legible. A range covering a whole code or table widget paints the widget as one selected block, not per cell text.

### NAV-010. Reopening accepts the first character

- **Setup/action:** Save a cursor inside quoted code or a table cell, close/reopen the vault or switch back to the note, then type without clicking.
- **Expected:** Keyboard focus belongs to the restored editing surface. The first character lands at the restored caret and Undo removes it.
- **Edge cases/notes:** Restore both current and legacy cursor formats. Cursor restoration must not steal focus from an external input already in use.

## 4. Paragraphs, headings, and visible spacing

### SPACE-001. Insert and delete a blank row above code

- **Setup/action:** Put the caret on the blank row directly above a code block. Press Enter, then Backspace to remove the inserted row.
- **Expected:** Enter visibly increases the gap by one editable row. Backspace visibly restores the prior gap. The code card and following prose move consistently with source.
- **Edge cases/notes:** This reported case needs explicit visual acceptance. Repeat plain, quoted, and listed code with one and two existing blank rows.

### SPACE-002. Additional source blank rows remain visible

- **Setup/action:** Add several blank rows between paragraphs, headings, lists, and widgets.
- **Expected:** Each additional row contributes visible space and a reachable caret position. Layout never collapses deliberate source rows into a fixed decorative gap.
- **Edge cases/notes:** Ordinary block margins may exist, but they must not conceal insertion/deletion of real blank source rows.

### SPACE-003. Heading spacing is applied once

- **Setup/action:** Place headings beside paragraphs with and without a separating blank row.
- **Expected:** Heading scale, line height, and margins follow the app theme without double-counting a shared boundary.
- **Edge cases/notes:** Real blank rows still fit a caret. Do not obtain visual parity by deleting or hiding user source.

### SPACE-004. Nested headings remain in their container

- **Setup/action:** Render and edit headings inside lists and nested quotes.
- **Expected:** Heading typography stays within the list text column or quote boundary. Changing heading level preserves surrounding container prefixes.
- **Edge cases/notes:** Include ATX opening/closing markers and Setext underlines. Save retains marker spelling unless the user changes style.

### SPACE-005. Paragraph spacing remains configurable

- **Setup/action:** Change the app's paragraph spacing and inspect prose around code, tables, quotes, and lists.
- **Expected:** Prose follows the setting; code body lines and cell text keep their own appropriate line layout.
- **Edge cases/notes:** Blank-line height and caret containment still apply at small settings.

### SPACE-006. List body columns do not jump while typing

- **Setup/action:** Type the first character after an empty bullet, ordered, task, or quoted-list prefix, then continue a wrapped line.
- **Expected:** Text origin and caret baseline remain stable. Wrapped rows align with the body column, not the marker.
- **Edge cases/notes:** Include two-digit ordered markers, deeper nesting, and incomplete task markers. Compare before/after the first character.

### SPACE-007. Ending a quote does not inherit list geometry

- **Setup/action:** Leave the final item of a quoted list, type quoted prose, then type an outside bullet.
- **Expected:** The empty quote paragraph uses quote geometry alone. Outside content does not change quote padding or acquire code/list styling.
- **Edge cases/notes:** Retain the reported preceding quoted code fixture. Delete/recreate the outside bullet and compare caret and background.

### SPACE-008. Legacy breaks render without source cleanup

- **Setup/action:** Open an existing note containing inline and standalone HTML line breaks.
- **Expected:** Recognized breaks produce line breaks in prose while literal contexts stay literal. Open/Save preserves original source.
- **Edge cases/notes:** Editing an active break reveals its source predictably. Dangerous or unknown HTML is not executed as a consequence of rich rendering.

### SPACE-009. The view settles and clicks land where they point

- **Setup/action:** Open a long note scrolled far down, with short paragraphs right after tables and quotes, lazy quote and list lines, whitespace-only lines, and a setext heading. Restore the caret inside a table, then hover and click a paragraph right away.
- **Expected:** The view stops moving after the first layout. A click puts the caret under the pointer without scrolling or selecting a range, and nothing throws.
- **Edge cases/notes:** CodeMirror estimates undrawn lines from a short plain-text line, so such a line must keep the default box: vertical space lives on block wrappers, and styled lines never show plain text alone (see "Line boxes" in the package DESIGN.md).

## 5. Character-by-character Markdown construction

### TYPE-001. Bare list markers stay editable

- **Setup/action:** Type a bare bullet marker or ordered marker one character at a time.
- **Expected:** Before required whitespace, the marker remains ordinary editable source. Rendering cannot hide its native caret or redirect the next character.
- **Edge cases/notes:** Include quote prefixes and nested list indentation. Once valid marker whitespace appears, transition without moving the caret.

### TYPE-002. A valid empty prefix remains a typing target

- **Setup/action:** Type a bullet and space, then immediately type body text.
- **Expected:** The bullet appears as soon as the space is typed, with the caret after it. The first body character follows the marker. It does not appear before it, disappear, move the marker, or shift the baseline.
- **Edge cases/notes:** Run Enter, Tab, and immediate typing as one rapid sequence. The source example "- ab" followed by that sequence becomes "- ab" plus a nested "- c". An empty ATX heading ("#" or "# ") keeps its marks visible until it has text.

### TYPE-003. Distinguish an unfinished bullet from a Setext heading

- **Setup/action:** Type a single hyphen below a paragraph, then type a space; also reopen a completed Setext heading.
- **Expected:** The space-terminated draft is an unfinished bullet without rewriting source. A completed bare underline retains its valid heading meaning.
- **Edge cases/notes:** Bare-hyphen transient styling is an explicit UX decision to verify. Do not silently erase Setext support to repair draft typing.

### TYPE-004. Incomplete tasks keep a usable gutter

- **Setup/action:** Type the bullet, opening bracket, space or x, closing bracket, space, and task body separately.
- **Expected:** Every character stays in order. While the caret touches the brackets, the bullet stays drawn and the brackets show as text in the body column. Once the caret moves past them, the checkbox replaces the bullet. The body stays in its text column throughout.
- **Edge cases/notes:** Compare "- [ ]" with "- [ ] " and checked variants. Undo each construction stage.

### TYPE-005. Incomplete formatting stays literal and editable

- **Setup/action:** Type bold, italic, strike, and inline-code delimiters progressively.
- **Expected:** Incomplete syntax remains editable. Completion renders only the intended element and preserves the next input location.
- **Edge cases/notes:** Type rapidly, include neighboring marks, delete a delimiter, and Undo. A partial marker must not expose unrelated elements.

### TYPE-006. Opening fences remain source until Enter

- **Setup/action:** Type three backticks, a language token, and Enter; repeat after pasting/reopening an unfinished fence header.
- **Expected:** The header remains editable while being constructed. Enter establishes the code body and moves focus to it before the next character.
- **Edge cases/notes:** Include empty language, quoted/listed fences, and rapid body typing. No key may land above a newly mounted widget. When the opening fence is unclosed and text follows it, Enter also adds a closing fence, so the rest of the note does not become code.

### TYPE-007. Table delimiters remain source until Enter

- **Setup/action:** Type the header, then the full delimiter one character at a time, especially its first hyphen.
- **Expected:** Source stays under the caret through the complete delimiter. Enter creates or selects an editable body row; immediate typing lands there.
- **Edge cases/notes:** Test a second table after editing another active table. A stale active-cell state must not bypass source construction guards.

## 6. Lists and indentation

### LIST-001. Continue a nonempty item

- **Setup/action:** Press Enter at the end of bullet, ordered, nested, and quoted-list items.
- **Expected:** The new row continues the correct list level and container prefix, with the caret after its marker.
- **Edge cases/notes:** Ordered continuation follows the active marker. Immediate text must remain inside the new item.

### LIST-002. Lift an empty item one level

- **Setup/action:** Press Enter on an empty nested list marker.
- **Expected:** Exactly one list level is removed. Repeated Enter progresses through enclosing contexts instead of becoming stuck.
- **Edge cases/notes:** Include mixed ordered/bullet nesting, tasks, quotes, unusual marker spacing, and mixed endings.

### LIST-003. Exit the last list level

- **Setup/action:** Press Enter on the final empty top-level item, then type prose.
- **Expected:** The new prose is outside the list. A necessary blank boundary prevents it from becoming the preceding item's lazy continuation.
- **Edge cases/notes:** In a quote, retain the quote while leaving the list. Undo restores the original marker and terminators.

### LIST-004. Tab nests under a previous sibling

- **Setup/action:** Press Tab with the caret in a nonfirst list item.
- **Expected:** Move the complete item subtree under the preceding sibling. Descendants and continuation rows move together.
- **Edge cases/notes:** Insert indentation after any quote prefix. Use the actual previous marker's content width, including tab-expanded whitespace.

### LIST-005. Tab does not invent a parent

- **Setup/action:** Press Tab on the first item of a list without a preceding sibling.
- **Expected:** The command consumes the list action without changing source into a misleading sibling or code block.
- **Edge cases/notes:** Repeat within nested and quoted lists. Literal-code indentation uses its own behavior.

### LIST-006. Shift-Tab lifts the complete subtree

- **Setup/action:** Shift-Tab a nested item containing children and continuation paragraphs.
- **Expected:** Lift one level while retaining its subtree. At the top level, remove the list marker and keep valid prose separation.
- **Edge cases/notes:** Tab followed by Shift-Tab round-trips unusual marker spacing and tabs without changing unrelated lines.

### LIST-007. Backspace at body start removes one context

- **Setup/action:** Press Backspace at the first text character of a list item.
- **Expected:** Lift one list level or remove the top marker. It does not delete an unrelated preceding character or leave prose in a lazy list continuation.
- **Edge cases/notes:** Include task prefixes, ordered markers, quotes, and nested items. Elsewhere, Backspace performs ordinary text deletion.

### LIST-008. Multi-item selections shift together

- **Setup/action:** Select several sibling items backwards, then Tab or Shift-Tab.
- **Expected:** All selected item subtrees shift once and preserve selection direction. Overlapping selections do not double-indent a child.
- **Edge cases/notes:** Include two-digit ordered siblings and mixed line endings. Undo restores all original bytes.

### LIST-009. Shift-Enter stays in the item

- **Setup/action:** Press Shift-Enter in an item, then type a continuation.
- **Expected:** Insert a Markdown hard break and the item's continuation indentation, without creating a new marker.
- **Edge cases/notes:** Count actual indentation columns, including tabs and deeply nested quoted lists. Do not duplicate an existing backslash hard break.

### LIST-010. Preserve tight and loose list semantics

- **Setup/action:** Open compact items, blank-separated simple siblings, multi-paragraph items, and unindented lazy continuations.
- **Expected:** Rendering respects container structure and body columns. Unindented lazy prose does not acquire an impossible hanging indent.
- **Edge cases/notes:** Automatic editing does not remove intentional blank separators. Optional legacy cleanup is a separate operation.

## 7. Quotes and leaving contexts

### QUOTE-001. Continue quoted prose

- **Setup/action:** Press Enter at the end of a nonempty quote.
- **Expected:** The next line has the current quote prefix, with a usable caret after it.
- **Edge cases/notes:** Include nested quotes and quote/list combinations. Prefix spelling elsewhere stays exact.

### QUOTE-002. Exit an empty quote one level at a time

- **Setup/action:** Press Enter on an empty quote line.
- **Expected:** Remove exactly one quote level. Typed prose belongs to the remaining context or outside the quote at depth zero.
- **Edge cases/notes:** Insert the blank boundary needed to avoid lazy continuation. Preserve a surrounding parent list when appropriate.

### QUOTE-003. Two Enter presses leave nonempty quoted prose

- **Setup/action:** At the end of quoted prose, press Enter twice, then type an outside paragraph.
- **Expected:** First Enter creates an empty quote line; second Enter leaves that level. The new paragraph is not still quoted.
- **Edge cases/notes:** A nested quote needs corresponding additional exits. Undo the sequence to exact source.

### QUOTE-004. Walk from quoted list to quote to plain prose

- **Setup/action:** After the second item in "> - first" and "> - second", press Enter twice, type "Quoted paragraph", then Enter twice and type "Outside paragraph".
- **Expected:** The first text stays quoted but outside the list. The second text is outside the quote, separated by a real blank boundary.
- **Edge cases/notes:** Preserve a preexisting final newline. This exact composed sequence is a regression fixture.

### QUOTE-005. Backspace at quote text start lifts one level

- **Setup/action:** Backspace at the first text of a quote continuation row.
- **Expected:** Remove one quote prefix and establish a boundary if otherwise the line would remain a lazy continuation.
- **Edge cases/notes:** Nested source "> > previous" and "> > child" becomes an outer quote with a separating outer blank row before child.

### QUOTE-006. Cmd-Enter creates prose after the complete quote

- **Setup/action:** Cmd-Enter inside quoted prose, a quoted list, or inline formatting inside a quote.
- **Expected:** Insert a separate paragraph after the outermost containing quote and focus it. Do not leave typed text in a lazy continuation.
- **Edge cases/notes:** Keep frontmatter, code, and literal HTML exclusions. Preserve unrelated following text and exact history.

### QUOTE-007. Quote exits do not alter preceding code

- **Setup/action:** Leave quoted/listed code into quoted prose and then outside text.
- **Expected:** Code fences, body prefixes, and existing lines stay exact. New prose is styled only by its actual context.
- **Edge cases/notes:** Include a new bullet just outside the quote. Gray code backgrounds or inherited list gutters are failures even when source is correct.

### QUOTE-008. Quote styling follows source depth

- **Setup/action:** Edit nested quotes and their blank boundaries.
- **Expected:** Borders, padding, and text columns track the remaining quote levels: one bar per level, the same on lines and around code or table widgets. Creating/deleting an outside block does not reshape the previous quote unexpectedly.
- **Edge cases/notes:** Quote-only rows after the final list item must not inherit that item's indentation.

## 8. Tasks

### TASK-001. Toggle only the checkbox marker

- **Setup/action:** Click or keyboard-activate a task checkbox.
- **Expected:** Only the marker's checked character changes; publication is synchronous and Undo restores it.
- **Edge cases/notes:** Include nested tasks with links and images. Do not rewrite marker spacing or surrounding Markdown.

### TASK-002. Completed styling belongs to task body text

- **Setup/action:** Toggle a task with nested lists, links, or multiple paragraphs.
- **Expected:** Completed-body styling applies to the intended task body, not unrelated following blocks or literal code.
- **Edge cases/notes:** Link and checkbox controls remain legible in both themes.

### TASK-003. Continue a task without carrying completion

- **Setup/action:** Press Enter to create another item from a checked task or lift an empty nested item under it.
- **Expected:** A newly created task is unchecked; the previous task's state remains unchanged.
- **Edge cases/notes:** Preserve surrounding quote depth and ordered/bullet parent conventions.

### TASK-004. Empty tasks remain usable

- **Setup/action:** Open or construct an empty valid task, then type its first body character.
- **Expected:** The checkbox remains rendered and the caret sits in a stable body column.
- **Edge cases/notes:** This is distinct from an incomplete bracket sequence that has not yet parsed as a task.

### TASK-005. Task boundaries and read-only state are respected

- **Setup/action:** Arrow across a checkbox boundary; switch read-only mode and attempt a toggle.
- **Expected:** The marker acts as a predictable atomic control. Read-only state prevents source mutation and disables editing behavior.
- **Edge cases/notes:** Task-like text inside code/frontmatter stays literal.

## 9. Inline and block formatting

### FMT-001. Reveal only the active inline element

- **Setup/action:** Put the caret inside one of several bold, italic, strike, or inline-code elements.
- **Expected:** Only that element's syntax becomes visible. Neighboring formatting stays rendered.
- **Edge cases/notes:** Enter nested marks and reveal only the caret's ancestor chain. Leaving the element restores rendering.

### FMT-002. Format a selected range precisely

- **Setup/action:** Select a word forwards/backwards and apply bold, italic, or strike.
- **Expected:** Format only the selected content, retaining direction and surrounding whitespace.
- **Edge cases/notes:** Preserve outer formatting when adding an inner mark. A mixed selection toggles existing formatting consistently.

### FMT-003. Remove only the selected portion of a mark

- **Setup/action:** Toggle formatting off for text in the middle of a larger formatted span.
- **Expected:** The selected content becomes plain while formatting outside it remains valid.
- **Edge cases/notes:** Include nested and cross-paragraph selections. No serializer may normalize unrelated marks.

### FMT-004. Toggle future typing without inserting empty syntax

- **Setup/action:** Toggle bold/italic/strike at an empty caret, then type.
- **Expected:** Source remains unchanged until meaningful text arrives. Consecutive typed characters acquire the pending format.
- **Edge cases/notes:** Toggling off before typing or moving the selection clears the pending state without generating empty markers.

### FMT-005. Generated formatting stays valid through deletion

- **Setup/action:** Type formatted words and spaces, then delete their final characters.
- **Expected:** Formatting remains valid; deleting the final content removes generated empty syntax. Undo/Redo restores text and delimiters together.
- **Edge cases/notes:** Include multiple pending styles, composition replacement text, whitespace-only input, and paragraph breaks.

### FMT-006. Inline code uses a valid delimiter

- **Setup/action:** Format selected text containing backticks as inline code.
- **Expected:** Choose a delimiter that cannot close inside the selected text; retain its displayed content and surrounding selection.
- **Edge cases/notes:** Empty-selection inline-code commands leave source unchanged. Literal code editing does not gain prose formatting behavior.

### FMT-007. Block shortcuts preserve the selected block's context

- **Setup/action:** Use existing heading, bullet, ordered-list, and code-conversion shortcuts.
- **Expected:** Transform the intended blocks only, preserve surrounding quote prefixes, and retain selection direction.
- **Edge cases/notes:** Documented shortcuts include Cmd-Alt-1/2/3, Cmd-Alt-7/8, and Cmd-Alt-C. Shortcuts skip the first paragraph of a list item. That is a carried-over product choice, not a syntax rule. A caret inside inline code still converts its paragraph.

### FMT-008. Convert visible prose to code without losing text

- **Setup/action:** Convert a paragraph containing inline code, links, escaped punctuation, or multiple soft lines into a code block.
- **Expected:** Code contains the intended displayed text and a safe fence. Outside source stays exact and the code editor receives focus.
- **Edge cases/notes:** Backticks may require a longer fence. Multi-selection conversion affects only selected eligible blocks.

## 10. Links and wiki links

### LINK-001. Render supported link forms without rewriting them

- **Setup/action:** Open inline, reference, collapsed, shortcut, autolink, bare URL, and wiki-alias links.
- **Expected:** Labels and destinations resolve correctly while original source remains exact.
- **Edge cases/notes:** Duplicate reference definitions follow the existing first-definition rule. Literal code/frontmatter do not become clickable links.

### LINK-002. Source reveal is element-local

- **Setup/action:** Put the caret inside one link among neighboring links and then leave it.
- **Expected:** Only the active link reveals source and then renders again. Merely editing the same paragraph does not expose every link.
- **Edge cases/notes:** Escaped punctuation and entities display correctly without being rewritten on Save.

### LINK-003. Activate links through normal app navigation

- **Setup/action:** Plain-click or press Enter on a rendered internal/external link.
- **Expected:** Delegate to the correct app navigation boundary, resolving relative note paths from the owning note.
- **Edge cases/notes:** Modified clicks keep their existing behavior. Read-only mode still permits safe navigation.

### LINK-004. Hover presents one usable action panel

- **Setup/action:** Hover a rendered link, then move into its actions.
- **Expected:** A readable panel offers supported Open/Copy/Edit/Remove actions and stays reachable. It does not overlap with a duplicate edit panel.
- **Edge cases/notes:** Placement follows viewport collision rules. Theme changes must not leave inappropriate tooltip arrows or unreadable controls.

### LINK-005. Editing replaces hover and restores focus

- **Setup/action:** Open editing through its action or configured keyboard shortcut, then Cancel/Escape or click outside.
- **Expected:** Hover closes while editing. Cancel leaves source exact and returns focus predictably; outside dismissal does not apply partial values.
- **Edge cases/notes:** The app's configured key may differ from the package default. Test the production binding and focus return.

### LINK-006. Edit labels and destinations safely

- **Setup/action:** Change a label containing brackets or a destination containing parentheses/spaces.
- **Expected:** Escape only the changed values as needed. Preserve angle/title syntax and unrelated text where the chosen form allows it.
- **Edge cases/notes:** A no-op Save leaves exact bytes unchanged. Undo restores the original link, not a canonicalized equivalent.

### LINK-007. Edit references without changing other occurrences

- **Setup/action:** Edit one occurrence of a shared reference link.
- **Expected:** Change only that occurrence, using an inline form if needed. Other occurrences and the shared definition stay exact.
- **Edge cases/notes:** A disabled label field must not disable a valid destination field.

### LINK-008. Wiki targets remain wiki syntax

- **Setup/action:** Edit a wiki target containing a path, spaces, anchor, or alias.
- **Expected:** Retain the wiki-link form and intended alias/target. Navigation uses the target, rendering uses the appropriate display label.
- **Edge cases/notes:** Do not convert spaces into an unrelated Markdown URL convention.

### LINK-009. Linked images keep separate outer and inner targets

- **Setup/action:** Edit a link wrapping an image or resize that image.
- **Expected:** Outer link edits preserve the image source. Image edits preserve the outer navigation target.
- **Edge cases/notes:** Shared reference forms and async image resolution must preserve the same separation.

### LINK-010. Copy/remove failures remain contained

- **Setup/action:** Copy a link with a rejecting clipboard callback or remove a supported link.
- **Expected:** Copy failure is reported without an unhandled rejection. Remove touches only the chosen link's syntax/content according to the action.
- **Edge cases/notes:** Omit Copy when the host has no clipboard support. Read-only mode omits source-editing actions.

## 11. Slash commands and wiki completion

### MENU-001. Preserve the command inventory

- **Setup/action:** Type slash at the start of a line's text, including inside a quote or list item, and filter by labels, IDs, or aliases.
- **Expected:** Offer heading levels 1-6, code, table, bullet, ordered, task, quote, and divider commands with their existing labels, icons, and descriptions, in that order. Commands from other plugins, such as callouts, follow.
- **Edge cases/notes:** Restrict triggering in literal contexts (code, inline code, frontmatter) and read-only notes. A block inserted inside a quote or list gets the container prefix on every line.

### MENU-002. Completion consumes acceptance keys

- **Setup/action:** Open a completion and immediately press Enter or click an option.
- **Expected:** Accept the option once. Enter must not additionally insert a newline through a lower-priority binding.
- **Edge cases/notes:** Up/Down clamp at menu ends; Escape is source-neutral. Test real rapid typing with the full extension composition.

### MENU-003. Insert into the intended editing surface

- **Setup/action:** Accept a code or table command while text follows the slash query.
- **Expected:** Preserve intended following text, replace only the query, and focus the new code body or first table cell.
- **Edge cases/notes:** Undo restores the original query/source. No first character may be swallowed during widget mounting.

### MENU-004. Menu appearance and placement remain coherent

- **Setup/action:** Compare slash and wiki menus in both themes near viewport edges.
- **Expected:** Fonts, spacing, icon/label/description hierarchy, selection color, and scroll height match the app experience.
- **Edge cases/notes:** Correct selector precedence matters. Menu placement must remain within the available viewport.

### MENU-005. Wiki completion closes brackets exactly once

- **Setup/action:** Type an incomplete wiki target, including one with existing closing brackets, and accept a suggestion.
- **Expected:** Insert one complete target with one closing bracket pair. Preserve surrounding task/prose text.
- **Edge cases/notes:** Show existing-note paths and planned-note reference counts distinctly. Do not query inside code or after an alias separator.

### MENU-006. Obsolete async suggestions cannot apply

- **Setup/action:** Start a wiki query, then change text, switch notes, dismiss, or destroy the view before it resolves.
- **Expected:** Cancel or ignore obsolete results. They cannot reopen a menu or replace text in another note.
- **Edge cases/notes:** The app owns lookup; the editor retains source/focus ownership while waiting.

## 12. Fenced code

### CODE-001. Open code with independent caret and live source

- **Setup/action:** Open a valid fence and type in its embedded editor.
- **Expected:** The code caret is visible, code text is immediately editable, and every completed edit reaches the note source synchronously.
- **Edge cases/notes:** The inner editor is an editing surface, not an independent document/history owner.

### CODE-002. Construct plain and container fences

- **Setup/action:** Type or reopen a plain, quoted, nested-quote, bullet-list, ordered-list, or quoted-list opening fence, then Enter and type rapidly.
- **Expected:** Enter inserts the correct body continuation prefix before focus transfer. First input stays in code.
- **Edge cases/notes:** Bare quoted headers and language tokens both work. Existing container spelling elsewhere stays exact.

### CODE-003. Code body Enter preserves prefixes

- **Setup/action:** Enter at the beginning, middle, or end of a quoted/listed code body row.
- **Expected:** Create the new code row with the correct container prefix. Native editing does not drop quote/list context.
- **Edge cases/notes:** Check empty bodies, compact quote-only lines, indentation, and mixed endings. Generic prose continuation must not run first.

### CODE-004. Backspace joins body rows correctly

- **Setup/action:** Backspace at the first code character of a later body row.
- **Expected:** Join content rows and remove that row's container prefix once, preserving the surviving row's content.
- **Edge cases/notes:** Backspace inside a row deletes ordinary code text. Multi-line blocks and selected fragments must not be unwrapped accidentally.

### CODE-005. Arrows at the body boundary do not edit

- **Setup/action:** At the first character of quoted code, press Left/Up; at the last character, press Right/Down.
- **Expected:** Move to an existing adjacent caret stop or stay at the document edge. No apparent extra block or hidden prefix insertion occurs.
- **Edge cases/notes:** Retain the reported Python quoted-fence fixture with multiple body rows and a closing fence.

### CODE-006. Enter code only from an adjacent source row

- **Setup/action:** Approach code from prose with arrows.
- **Expected:** Horizontal entry occurs at the appropriate line edge. Vertical entry waits until wrapped prose and intervening blank rows have been traversed.
- **Edge cases/notes:** Preserve visual x/goal and wrapped-boundary side. Do not replace a nonempty selection.

### CODE-007. Move directly between adjacent code blocks

- **Setup/action:** Arrow from one code body into an immediately adjacent fence.
- **Expected:** Focus the neighboring code editor at the appropriate edge without stopping on hidden fence syntax.
- **Edge cases/notes:** If actual blank source rows intervene, visit them first. Source stays unchanged.

### CODE-008. Cmd-Enter creates a paragraph deliberately

- **Setup/action:** Cmd-Enter from a code block, including an unfinished one.
- **Expected:** Establish any required closing fence and insert a usable following paragraph with appropriate container prefix.
- **Edge cases/notes:** This command may edit source; arrows may not. Undo restores the prior unfinished or closed source.

### CODE-009. Single-line conversion is narrowly bounded

- **Setup/action:** Backspace at the beginning of a one-line code body; compare multi-line bodies and selected fragments.
- **Expected:** Eligible one-line code can convert to prose. Multi-line code and ordinary selection deletion retain their code block.
- **Edge cases/notes:** Preserve quote/list context, restore focus, and Undo back into the code editor.

### CODE-010. Language edits preserve the body and fence form

- **Setup/action:** Choose a language through the picker.
- **Expected:** Change the language token only, retaining extra info, fence character/length where valid, body text, and unrelated source.
- **Edge cases/notes:** Search aliases, select by keyboard, Escape, and dismiss outside. Existing alias choices such as ts remain supported.

### CODE-011. Protect body text that resembles closing fences

- **Setup/action:** Type a delimiter run into code that would prematurely close its fence.
- **Expected:** Expand fence length only as necessary. A closing fence already long enough need not change.
- **Edge cases/notes:** Backtick/tilde spelling and extra info remain appropriate. Undo restores both content and adjusted fences.

### CODE-012. Syntax highlighting failures do not block editing

- **Setup/action:** Choose supported, unsupported, failing, and then working languages.
- **Expected:** Code text remains editable throughout. Stale language results cannot replace the latest grammar; a working choice clears an obsolete warning.
- **Edge cases/notes:** Native JavaScript, Python, Rust, JSON, and shell grammar loading require actual app validation, not only catalog lookup.

### CODE-013. Code copying and indentation use live text

- **Setup/action:** Tab/Shift-Tab code, edit, then Copy.
- **Expected:** Code indentation behaves normally and the host receives current body text without container prefixes or fences.
- **Edge cases/notes:** A clipboard failure remains contained. Copy must not use a stale serialized model.

### CODE-014. UI settings stay separate from Markdown

- **Setup/action:** Resize source/diagram panels, hide source, zoom, then switch notes and restore.
- **Expected:** View settings persist for the owning block/note without source edits, dirty state, or content-history entries.
- **Edge cases/notes:** Map settings when text moves before a block; delete one block without losing surviving settings. Cached states cannot share DOM controllers.

### CODE-015. Pointer and keyboard resizing are predictable

- **Setup/action:** Focus a code resize handle; use arrows or drag/release/cancel it.
- **Expected:** Up/Down changes height by 16 pixels per key; pointer resizing commits once on release. The document caret does not move.
- **Edge cases/notes:** Cancel restores the prior size; teardown removes document listeners. Height remains bounded and measured widget geometry follows the new size.

## 13. Mermaid and diagrams

### DIAG-001. Render a sanitized diagram through the host

- **Setup/action:** Open a supported diagram fence and let its preview resolve.
- **Expected:** Render the host-provided sanitized element while retaining code source and its history.
- **Edge cases/notes:** The editor package does not independently load an engine or execute arbitrary note HTML.

### DIAG-002. Ignore obsolete diagram requests

- **Setup/action:** Edit the diagram repeatedly, change language, switch notes, or destroy the view while rendering is pending.
- **Expected:** Only the current request may publish a preview. Obsolete requests abort or are ignored.
- **Edge cases/notes:** A late failure cannot overwrite a newer successful preview.

### DIAG-003. Show render errors as text

- **Setup/action:** Render invalid Mermaid or receive a failed host callback.
- **Expected:** Show a readable error and retain editable source. Error text is not interpreted as executable markup.
- **Edge cases/notes:** Recover by editing the source. Undo remains source-based.

### DIAG-004. Hidden source remains reachable

- **Setup/action:** Hide source, then select a code-source offset or find a match inside it.
- **Expected:** Reveal source when needed and show the intended selection/highlight.
- **Edge cases/notes:** Find may reveal content without moving keyboard focus out of the find input.

### DIAG-005. Zoom changes only view state

- **Setup/action:** Zoom out/in/reset, then revisit the note.
- **Expected:** The diagram scales coherently and retains its view setting without changing Markdown.
- **Edge cases/notes:** SVG intrinsic width and ordinary element zoom may need different rendering paths; both remain centered/readable.

### DIAG-006. Theme changes refresh diagram appearance

- **Setup/action:** Toggle light/dark appearance with visible and cached diagrams.
- **Expected:** Diagram colors update for the new theme. Cached previews refresh appropriately when mounted.
- **Edge cases/notes:** Theme observers disconnect on teardown. Refresh cannot create document history.

## 14. Tables

### TABLE-001. Construct a table without losing delimiter characters

- **Setup/action:** Type a header, newline, and delimiter, pausing at the first dash and then completing the rest rapidly.
- **Expected:** The delimiter stays raw under the native caret until Enter or leaving source editing. No dash appears before the table.
- **Edge cases/notes:** Use multiple columns, optional closing pipes, and a second new table while another table previously had focus.

### TABLE-002. Enter from a delimiter provides a usable body

- **Setup/action:** Enter at the end of a valid delimiter.
- **Expected:** If no body exists, create and focus a blank first row. Otherwise focus the first existing body cell without adding source.
- **Edge cases/notes:** Immediate body text, Tab, and more text retain every character. Existing rich-cell edits remain rich.

### TABLE-003. Source editing can leave and return

- **Setup/action:** Choose "Edit Markdown" in an active table's toolbar, edit the delimiter or header, then move out of the table.
- **Expected:** The table shows its source while the caret stays inside it and renders again on leaving. Selection and focus stay at the intended location.
- **Edge cases/notes:** A rendered table never reveals source because the caret lands on a hidden row. Source mode belongs to that table only.

### TABLE-004. Cell edits publish synchronously

- **Setup/action:** Type, delete words, replace selection, and immediately Save or switch notes.
- **Expected:** Current cell text and selection are already in canonical source. No blur or debounce is required.
- **Edge cases/notes:** Test rapid long text and native word deletion. Do not serialize layout whitespace as content.

### TABLE-005. Preserve padding and escaped pipes

- **Setup/action:** Edit cells with leading/trailing source padding, explicit typed trailing spaces, empty content, or escaped pipes.
- **Expected:** Preserve original layout padding separately from typed content. Escape intended pipes without altering delimiter rows.
- **Edge cases/notes:** A short row's virtual trailing cell can receive text. Undo restores original short-row source.

### TABLE-006. Inactive cells render; active cells expose editable content

- **Setup/action:** Open formatting, code, and links in cells, then activate one cell.
- **Expected:** Inactive cells render their supported Markdown. The active cell provides a predictable text-editing surface without resetting its caret.
- **Edge cases/notes:** Refresh inactive cells after same-shape external source edits. Composition must keep the active DOM node/focus.

### TABLE-007. Default and explicit alignment are distinct

- **Setup/action:** Open unspecified, left, center, and right delimiter alignments, then edit another cell.
- **Expected:** Unspecified columns display left-aligned. Explicit alignment survives rendering and DOM updates.
- **Edge cases/notes:** Header and body agree; header typography must not override an explicit source alignment.

### TABLE-008. Cells wrap words predictably

- **Setup/action:** Use columns containing short labels, long prose, inline code, and long unbroken tokens.
- **Expected:** Normal words are not crushed into one-character columns by prose-editor wrapping. Long content remains readable through wrapping or horizontal scrolling.
- **Edge cases/notes:** Table font, line height, cell vertical alignment, and code appearance remain coherent in both themes.

### TABLE-009. Virtual column sizes remain stable

- **Setup/action:** Open a large table with a long value near its end, scroll, and edit mounted rows.
- **Expected:** Column allocation accounts for the whole table when mounted and stays stable as row windows change. Minimum widths prevent unusably narrow cells.
- **Edge cases/notes:** Active typing must not reallocate every column. Horizontal overflow stays scrollable; ordinary small tables retain their layout.

### TABLE-010. Drag selection and Cmd-A remain cell-scoped

- **Setup/action:** Mouse-drag a range in a cell, replace it, Undo, then Cmd-A and replace again.
- **Expected:** Selection belongs to that cell. Cmd-A selects its content, not the whole note or adjacent cells; replacement publishes once.
- **Edge cases/notes:** Undo must restore usable cell focus before the next key. Native selection must not be replaced before browser movement.

### TABLE-011. Table history is note history

- **Setup/action:** Type a rapid cell edit, Undo/Redo from the cell, and revisit its cached note.
- **Expected:** History restores exact cell source and appropriate focus/selection. It does not maintain an independent DOM-only undo stack.
- **Edge cases/notes:** Include structural row/column actions and app formatting shortcuts.

### TABLE-012. Tab traverses cells and appends deliberately

- **Setup/action:** Tab through a row, Shift-Tab backwards, and Tab at the final cell.
- **Expected:** Traverse the intended cells; append a new row at the forward end and focus its first cell.
- **Edge cases/notes:** Shift-Tab at the beginning leaves the table according to the existing app behavior. Read-only mode cannot append.

### TABLE-013. Enter traverses rows in the same column

- **Setup/action:** Enter/Shift-Enter in existing body rows, then Enter at the final row.
- **Expected:** Move down/up in the same column; forward Enter at the end adds a row and keeps the chosen column.
- **Edge cases/notes:** Short/virtual cells and header boundaries retain a usable target. Modifiers must not accidentally invoke ordinary row insertion.

### TABLE-014. Up/Down traverse wrapped cell rows first

- **Setup/action:** Press repeated Up/Down inside a cell wrapped into many visual rows.
- **Expected:** Traverse those visual rows before moving to a neighboring table row. Caret movement stays inside the active cell until a real boundary.
- **Edge cases/notes:** Native line movement crossing outside the cell must be rejected before explicit navigation. Shift, platform modifiers, nonempty selection, and IME retain their normal paths.

### TABLE-015. Enter and leave only at adjacent source rows

- **Setup/action:** Arrow from wrapped prose or a blank row into a table and out again.
- **Expected:** Traverse prose visual rows and every blank source row in order. Header/body transitions synchronize the source selection before subsequent keys.
- **Edge cases/notes:** At document edges, arrows remain source-neutral. Adjacent code can receive focus; hidden delimiter syntax is not an intermediate editing target.

### TABLE-016. Focusing visible cells does not jump the page

- **Setup/action:** Scroll a large table into view, click neighboring visible cells, and navigate between them.
- **Expected:** The outer document and table viewport retain their scroll position unless the target actually needs revealing.
- **Edge cases/notes:** A requested offscreen row mounts and scrolls appropriately. Do not scroll an already visible row on every activation.

### TABLE-017. Structural actions affect only their table

- **Setup/action:** Add/delete body rows and add/delete columns through controls.
- **Expected:** Preserve unrelated table cells/source, maintain valid delimiters, and focus a surviving or newly created cell.
- **Edge cases/notes:** Header deletion and deleting the last column are disabled as appropriate. Toolbar visibility does not move following prose.

### TABLE-018. Large-table find and focus retain the row window

- **Setup/action:** Find a distant row, focus an offscreen source selection, then edit while changing the viewport.
- **Expected:** Mount the target, highlight it, and retain the active cell even when it falls outside the normal window.
- **Edge cases/notes:** Do not remount the focused node during composition or repeated input. Row counts and accessibility metadata remain accurate.

### TABLE-019. Table-like literal text stays literal

- **Setup/action:** Put pipes/delimiters inside frontmatter, fenced code, and other literal contexts; open the note read-only.
- **Expected:** Literal contexts never become editable table widgets. A read-only real table remains a static accessible grid.
- **Edge cases/notes:** Links may still navigate safely; structural controls and source mutation remain disabled.

## 15. Images

### IMAGE-001. Resolve images without rewriting source

- **Setup/action:** Open inline/reference images with local, relative, remote, SVG, and data-URL sources.
- **Expected:** Display the image through the correct host resolution path while saving the original source unchanged.
- **Edge cases/notes:** Base64 data URLs bypass local-asset resolution. Malformed percent escapes cannot crash note rendering.

### IMAGE-002. Expose only the selected image's source

- **Setup/action:** Move the caret into an image's syntax, then leave.
- **Expected:** The source shows while an empty caret touches it. The image stays visible after its source the whole time, so the layout does not jump. Leaving hides the source again.
- **Edge cases/notes:** Task images and linked images remain in the correct parent layout. Literal frontmatter/code stays literal.

### IMAGE-003. Loading and failure are stable

- **Setup/action:** Delay or fail image resolution.
- **Expected:** Show a useful loading/error state without changing Markdown. A late result cannot update a destroyed or revealed widget.
- **Edge cases/notes:** Abort obsolete work on reveal, replacement, switching, and teardown.

### IMAGE-004. Resize stores only the intended ratio

- **Setup/action:** Drag or keyboard-resize an image.
- **Expected:** Change only the supported legacy ratio field in its alt source. Image destination and surrounding text stay exact.
- **Edge cases/notes:** Linked images preserve their outer link. Repeated rendering must not substitute an unrelated alt label.

### IMAGE-005. Preserve small-image size and measured base

- **Setup/action:** Open an image below 100 pixels and click its handle without moving; then use consecutive resize arrows.
- **Expected:** No click-only resize or forced minimum enlargement occurs. Each arrow uses a stable measured base so changes remain predictable.
- **Edge cases/notes:** Natural image dimensions and viewport constraints determine the base; delayed loading must not lose a rapid second arrow.

### IMAGE-006. Resize history keeps handle focus

- **Setup/action:** Resize, Undo, Redo, then resize again without clicking.
- **Expected:** Source and displayed size restore together. Focus remains on the owning handle so the next key does not edit prose.
- **Edge cases/notes:** If the user moves to another control while resolution is pending, completion must not steal focus back.

### IMAGE-007. Pointer resize commits once and cancels cleanly

- **Setup/action:** Drag/release, cancel, or destroy the view during a drag.
- **Expected:** Commit one source action on release; cancel restores the original visual size. Remove pointer listeners on teardown.
- **Edge cases/notes:** Unrelated pointers cannot finish the drag. Read-only state blocks a pending source mutation.

### IMAGE-008. Pasted files use the app's asset flow

- **Setup/action:** Paste an image file, wait for storage, then Save.
- **Expected:** Delegate storage to the host and insert its resulting Markdown in the owning note. The editor does not invent a storage backend.
- **Edge cases/notes:** Switching notes while file reading/storage is pending cannot insert the image into the new note. OS clipboard acceptance still needs native coverage.

## 16. Clipboard

### CLIP-001. Prefer explicit Markdown source

- **Setup/action:** Paste a clipboard offering Markdown plus HTML/plain representations.
- **Expected:** Use explicit Markdown instead of converting its rendered HTML.
- **Edge cases/notes:** Source copied from a Markdown editor may carry HTML too; do not double-convert existing syntax.

### CLIP-002. Convert only the pasted HTML fragment

- **Setup/action:** Paste formatted HTML into a note with existing references, line endings, and rich blocks.
- **Expected:** Convert only that fragment and leave the existing note exact. Preserve supported bold/emphasis/table content and remove executable markup.
- **Edge cases/notes:** Conversion failure falls back to available plain text rather than discarding the paste or rewriting the document.

### CLIP-003. Literal contexts receive literal text

- **Setup/action:** Paste HTML/plain clipboard data in inline code, fenced code, or YAML frontmatter.
- **Expected:** Paste appropriate literal text without prose conversion, completion, or image-side effects.
- **Edge cases/notes:** Keep surrounding container/source boundaries valid. Read-only paste is source-neutral.

### CLIP-004. Copy and paste keep current content

- **Setup/action:** Copy selected prose/cell text or use code Copy after editing, then paste into a plain target.
- **Expected:** Clipboard content represents the intended current text, not stale pre-edit state.
- **Edge cases/notes:** Code Copy preserves indentation and excludes fences/container markers. Native OS clipboard and browser-only mocks are distinct evidence.

### CLIP-005. Paste and Undo remain exact

- **Setup/action:** Paste a multiline fragment beside rendered widgets, then Undo/Redo.
- **Expected:** Restore exact surrounding source, selection, and fragment terminators.
- **Edge cases/notes:** Paste is a meaningful separate history action rather than joining an earlier typing burst.

### CLIP-006. Clipboard permissions do not corrupt editing

- **Setup/action:** Reject an asynchronous copy or image read and then continue typing.
- **Expected:** Report/contain failure and retain source/focus. No unhandled rejection or partial unexpected insertion occurs.
- **Edge cases/notes:** Hosts without image/HTML/copy support may omit those controls while preserving plain text behavior.

## 17. Find

### FIND-001. Find literal text without changing source

- **Setup/action:** Search punctuation, mixed-case text, and Unicode.
- **Expected:** Match the app's literal, case-insensitive search semantics and correct display offsets. Highlighting is source-neutral.
- **Edge cases/notes:** Include emoji and case-expanding letters. A result is not a regular expression unless explicitly offered as such.

### FIND-002. Update results after editing

- **Setup/action:** Edit text while a query is active, including deleting the selected match.
- **Expected:** Refresh positions/counts and clamp the selected result. Next/Previous navigation does not needlessly rescan unchanged content.
- **Edge cases/notes:** Dismiss clears highlights; reopening a retained query recomputes valid results.

### FIND-003. Refresh an unchanged query on note switching

- **Setup/action:** Keep a query open while switching between notes.
- **Expected:** Counts and highlights belong to the new note even when the query string did not change.
- **Edge cases/notes:** Cached per-note queries/history stay independent. Do not retain the previous note's count.

### FIND-004. Project results into rich editing surfaces

- **Setup/action:** Search text in inactive/active cells, code bodies, and hidden Mermaid source.
- **Expected:** Highlight the corresponding visible content and mount/reveal the target as needed.
- **Edge cases/notes:** A raw/source offset is not sufficient if its rich widget is absent from the row window.

### FIND-005. Find retains its own input focus

- **Setup/action:** Navigate matches inside code or a distant table row from the find input.
- **Expected:** Reveal/scroll the match without sending keyboard focus into its editor. Further query typing stays in find.
- **Edge cases/notes:** Explicit user selection or editor focus actions may transfer focus afterward.

### FIND-006. Word count excludes Markdown syntax

- **Setup/action:** Count a note containing headings, links/wiki aliases, code bodies, images, tables, and frontmatter.
- **Expected:** Count meaningful text under the app's current rule, excluding formatting/destinations/metadata; code body text remains counted.
- **Edge cases/notes:** Do not count table delimiters or image source. Mark incomplete large-note counts as pending and publish the final count for the correct note.

## 18. Note, vault, and session lifecycle

### LIFE-001. Cached notes retain selection and history

- **Setup/action:** Edit a note, switch away, then return and Undo.
- **Expected:** The note restores its own selection, source history, dirty baseline, and widget state.
- **Edge cases/notes:** The restored caret must accept immediate input. Closing the buffer removes its retained state.

### LIFE-002. Fresh restoration replaces cache deliberately

- **Setup/action:** Reload a note from disk using the fresh restore policy after a cached edit.
- **Expected:** Use the supplied disk source and baseline instead of silently reusing the old cached draft.
- **Edge cases/notes:** Distinguish this operation from ordinary tab switching. The app owns conflicts and deliberate draft replacement.

### LIFE-003. New notes do not borrow another tab's cursor

- **Setup/action:** Open a new note while note IO finishes before its tab is created or activated.
- **Expected:** Restore only the target note's snapshot, or its appropriate new-note position. Never apply the previous active tab's cursor.
- **Edge cases/notes:** Existing wiki targets can restore before their tab becomes active; lookup by note identity still chooses the right snapshot.

### LIFE-004. Scroll restoration belongs to the target note

- **Setup/action:** Switch between notes with different saved scroll positions.
- **Expected:** Restore the owning note's scroll without a later callback applying another note's position.
- **Edge cases/notes:** Guard deferred restoration by session and note identity. A stale animation-frame callback must not move a newly opened note.

### LIFE-005. Rename retains state; close releases it

- **Setup/action:** Rename a cached edited note, reopen it, then close its buffer.
- **Expected:** Rename maps the retained state/baseline to the new identity; closing releases it.
- **Edge cases/notes:** Relative assets and navigation resolve from the current path after rename.

### LIFE-006. Session teardown cancels owned work

- **Setup/action:** Destroy the editor during pending notifications, parsing, wiki queries, grammar loads, images, diagrams, and resize operations.
- **Expected:** No late callback publishes source, counts, focus, or UI into the removed session.
- **Edge cases/notes:** Restore temporary host styles and disconnect observers/listeners. Cleanup is safe when called more than once.

### LIFE-007. Saving and theme actions preserve app boundaries

- **Setup/action:** Invoke app Save, navigation, find, and theme shortcuts while prose/code/cell controls have focus.
- **Expected:** The app action reaches the correct service/port and current source. Nested widgets must not trap unrelated app shortcuts.
- **Edge cases/notes:** Editing-specific shortcuts still belong to the focused surface. Do not introduce direct filesystem or app-store calls into the standalone package.

### LIFE-008. The package works independently of the app runtime

- **Setup/action:** Mount the editor package with host callbacks in a standalone test, then use it through Otterly's production adapter.
- **Expected:** Core editing behavior is consistent; app IO remains supplied by the host. The package has no implicit Tauri/Svelte dependency.
- **Edge cases/notes:** A browser page without native adapters is not proof that the Tauri app works. Package publication/license status is a separate delivery concern.

## 19. Read-only behavior, accessibility, and themes

### ACCESS-001. Read-only state blocks all source edits

- **Setup/action:** Attempt typing, paste, formatting, task toggles, list keys, table actions, image resizing, language changes, and Undo/Redo.
- **Expected:** No source mutation or host clipboard-image insertion occurs.
- **Edge cases/notes:** Changing read-only state while a widget is mounted updates its controls and embedded editor. Navigation/copy may remain available.

### ACCESS-002. Keyboard controls are reachable

- **Setup/action:** Navigate links, task checkboxes, language pickers, resize handles, link panels, and table controls by keyboard.
- **Expected:** Controls have useful labels, visible focus, and working activation/dismissal paths.
- **Edge cases/notes:** A focus ring must not move the document caret or mutate source. An omitted host capability must not leave a dead control.

### ACCESS-003. Selection remains legible

- **Setup/action:** Select single/multiple ranges in prose and nested code, then switch theme.
- **Expected:** Selection paint is visible without duplicate/conflicting overlays. The nested editor's selection is not hidden by an outer-editor rule.
- **Edge cases/notes:** Test caret and native selection independently. Real screen-reader use requires separate acceptance.

### ACCESS-004. Controls expose their current state

- **Setup/action:** Inspect tasks, source visibility, zoom, image/code resize handles, table grid, and planned-note suggestions.
- **Expected:** Accessible labels/states identify the action, current value, row/column, and disabled status.
- **Edge cases/notes:** Virtual rows report the full grid's row count, not just mounted DOM. Updates keep metadata current.

### ACCESS-005. Themes preserve readability and geometry

- **Setup/action:** Inspect headings, quotes, tasks, strike, links, inline code, tables, images, code, and menus in light/dark themes.
- **Expected:** Use the app's semantic colors and editor tokens with readable controls, borders, highlights, and caret.
- **Edge cases/notes:** Theme selectors must not bleed prose wrapping/font rules into code or crush table columns.

### ACCESS-006. Zoom and narrow windows remain usable

- **Setup/action:** Adjust editor zoom/width and narrow the window around wrapped text, tables, tooltips, and menus.
- **Expected:** Text remains editable; controls stay reachable; overflow scrolls predictably; caret geometry follows the visual layout.
- **Edge cases/notes:** Repeat vertical navigation after reflow. Do not claim fixed pixel geometry across arbitrary fonts/zoom.

### ACCESS-007. Composition is not treated as ordinary key navigation

- **Setup/action:** Compose text in prose, a table cell, or code while rich rendering updates.
- **Expected:** Preserve the composing surface and completed text. Arrow/Enter shortcuts do not consume IME events as ordinary commands.
- **Edge cases/notes:** Automated composition contracts exist; actual platform IME and assistive-technology coverage remain independent obligations.

## 20. Explicit legacy Markdown cleanup and recovery

Cleanup changes file source deliberately. It is separate from rendering, opening, saving, and editor Undo. Its preview must make scope and consequences reviewable before applying.

### CLEAN-001. Cleanup is explicit and discoverable

- **Setup/action:** Invoke "Clean up legacy Markdown…" from the command palette.
- **Expected:** Open a reviewable preview for the current scope. No automatic cleanup runs merely because a note/vault opens.
- **Edge cases/notes:** Do not bury a source-changing migration inside a renderer. The current backup location is the vault's .otterly/markdown_cleanup directory.

### CLEAN-002. Preview reports scope and actual changes

- **Setup/action:** Preview a vault containing changed, unchanged, and open/dirty notes.
- **Expected:** Report scanned, changed, and skipped counts and affected note names accurately. Expand each changed note to inspect its full before/after source.
- **Edge cases/notes:** Include clean open notes and skip dirty open notes visibly. A live draft must not be replaced or later overwrite a cleaned file silently.

### CLEAN-003. Cancel has no file effects

- **Setup/action:** Cancel/dismiss a cleanup preview, or change options and preview again.
- **Expected:** Cancel writes nothing. A new preview replaces the previous proposed changes and statistics.
- **Edge cases/notes:** An expired or canceled preview cannot later be applied by an old callback.

### CLEAN-004. Collapse only eligible excess blank rows

- **Setup/action:** Preview repeated blank rows between ordinary blocks.
- **Expected:** Keep one intended block separator while removing eligible excess rows. Preserve leading/trailing runs according to the cleanup policy.
- **Edge cases/notes:** A user's ordinary editor Enter still creates visible rows; cleanup must remain an explicit source-changing choice.

### CLEAN-005. Compact simple lists only when chosen

- **Setup/action:** Preview simple blank-separated sibling items with list compaction enabled, then disabled.
- **Expected:** Enabled compaction removes only eligible simple sibling separators. Disabled compaction retains them.
- **Edge cases/notes:** The current option defaults on. Multi-line/nested items, separate list kinds, and intentional multi-paragraph structure remain protected.

### CLEAN-006. Remove only eligible standalone HTML breaks

- **Setup/action:** Preview standalone br lines alongside inline, quoted, listed, and literal occurrences.
- **Expected:** Remove only eligible standalone breaks. Inline breaks and container/literal occurrences remain unchanged.
- **Edge cases/notes:** Do not globally replace every br tag. Keep counts distinct from blank-line counts.

### CLEAN-007. Protect literal and metadata content

- **Setup/action:** Preview frontmatter, fenced/indented code, comments, scripts, preformatted text, and multi-line HTML.
- **Expected:** Protected content remains byte-for-byte intact, including its blank rows and apparent breaks.
- **Edge cases/notes:** Include unclosed frontmatter/fences and mixed line endings. Conservative skipping is preferable to altering literal content.

### CLEAN-008. Preserve retained terminators and positions

- **Setup/action:** Clean mixed-ending source and restore any supported view positions.
- **Expected:** Retained lines keep their original terminators/BOM. Any mapped cursor/scroll position refers to the intended surviving text.
- **Edge cases/notes:** A removed line needs a defined nearest surviving location. Do not reuse unadjusted offsets into a shorter cleaned note.

### CLEAN-009. Verify the preview still matches disk

- **Setup/action:** Preview, then externally edit or replace an affected file before Apply.
- **Expected:** Detect the conflict against the preview's original content and metadata; do not overwrite the newer file.
- **Edge cases/notes:** Recheck live dirty state at Apply. A newly dirty included note, changed vault, or stale preview requires another preview; merely opening a clean note need not invalidate safe cleanup.

### CLEAN-010. Save recovery data before writing changes

- **Setup/action:** Apply a valid nonempty preview.
- **Expected:** Persist a recoverable backup containing original and cleaned content before changing note files.
- **Edge cases/notes:** Backup identity must not collide between runs. Invalid/duplicate paths and application-internal files are rejected.

### CLEAN-011. Apply the reviewed changes consistently

- **Setup/action:** Apply after reviewing the preview.
- **Expected:** Write the proposed changed notes, refresh clean open buffers/cached source and app metadata/search, and report the actual result.
- **Edge cases/notes:** The app must not later auto-save stale open buffers over cleaned files. No-change previews should not masquerade as a completed rewrite.

### CLEAN-012. Recover from a failed batch

- **Setup/action:** Simulate a write failure partway through cleanup.
- **Expected:** Attempt to restore already written originals. If recovery is incomplete, retain the backup and identify the recoverable failure.
- **Edge cases/notes:** Cover a later file disappearing, metadata/read failure, conflict, and write failure after an earlier file was changed. File backup recovery is separate from the editor's local history.

### CLEAN-013. Restore without overwriting newer edits

- **Setup/action:** Restore the latest cleanup after changing one of its cleaned files.
- **Expected:** Restore unchanged cleaned files to exact originals; skip/report dirty open buffers and files whose disk content no longer matches the cleaned snapshot.
- **Edge cases/notes:** Include mixed-case note paths in dirty-buffer skipping. Missing files and already-original content have explicit outcomes. Preserve the backup for unresolved conflicts and permit safe retry.

### CLEAN-014. Explain unavailable and completed recovery

- **Setup/action:** Request restore with no backup, after a fully completed restore, or after a partial restore.
- **Expected:** Report the actual state without pretending another restoration occurred. A partial recovery keeps its unresolved notes visible.
- **Edge cases/notes:** Search-index refresh failure must not undo safe file recovery; report/retry indexing separately from file integrity.

### CLEAN-015. Preserve a draft created while refresh is pending

- **Setup/action:** Apply/restore cleanup to a clean open note, then type while the subsequent note read or cache refresh is pending.
- **Expected:** The live draft is not replaced by the cleaned/restored disk version. Recheck current dirty state before changing the cache or reloading the active editor.
- **Edge cases/notes:** A captured tab object may be stale. Validate the current tab and active editor, not only dirty state sampled before backend IO.

### CLEAN-016. Refresh only the still-owning vault and note

- **Setup/action:** Switch notes or vaults while cleanup readback/index refresh is pending.
- **Expected:** Old results cannot update another vault's stores or reopen a note the user has left. Completed disk work remains recoverable in its original vault.
- **Edge cases/notes:** Check identity after async reads and immediately before cache mutation, buffer closure, and active-note reload.

## 21. Runtime editor switching (retired)

Otterly ships one editor. ENGINE-001 through ENGINE-008 are retired and their IDs stay reserved.

## 22. Opt-in editor diagnostics (retired)

The diagnostics sidebar was built for comparing engines and was removed with them. DEBUG-001 through DEBUG-008 are retired and their IDs stay reserved.

## 23. Plugin contract

These scenarios apply to the editor package as a framework.

### PLUGIN-001. Build errors name the problem

- **Setup/action:** Build an editor with a plugin whose `requires` names a missing plugin, and another with two constructs of the same name.
- **Expected:** Creating the state throws `PluginBuildError` with the missing or duplicate name. No partially built editor appears.
- **Edge cases/notes:** `replaces` pointing at a construct that is not installed is also an error.

### PLUGIN-002. Replacing a construct swaps it completely

- **Setup/action:** Install a construct with `replaces: "heading"` and open a note with headings.
- **Expected:** Only the replacement renders headings. The built-in heading styling is gone.
- **Edge cases/notes:** Keys and insert items follow the replacement too.

### PLUGIN-003. A new construct needs no core changes

- **Setup/action:** Add a plugin with a Lezer extension and an inline or line construct, such as callouts or a highlight mark.
- **Expected:** It renders, follows the shared reveal rule, takes part in key dispatch by context, and its insert items appear in the slash menu.
- **Edge cases/notes:** Callouts reuse quote keys: Enter, Backspace, and lifting behave like a plain quote.

### PLUGIN-004. A broken construct stays contained

- **Setup/action:** Install a construct whose `decorate` throws.
- **Expected:** That construct's nodes show as source and the error is logged once. Every other construct keeps rendering.
- **Edge cases/notes:** The same holds for block widgets, static rendering, and key handlers.

## 24. Source mode and other text files

### MODE-001. Source mode shows the raw Markdown

- **Setup/action:** Open a note with headings, emphasis, a table, and a code block. Press Cmd+/ or click "Rich" in the status bar.
- **Expected:** Every character shows as text in a monospace font with Markdown highlighting. No widgets, hidden marks, or quote wrappers. Toggling again renders the note as before.
- **Edge cases/notes:** Works for drafts too. Each open note remembers its own view while you switch tabs.

### MODE-002. Switching views keeps the document state

- **Setup/action:** Type in rich mode, switch to source, press Cmd+Z.
- **Expected:** Undo removes the typing. The selection, dirty state, and code block view states survive the switch.

### MODE-003. Source mode edits plain characters

- **Setup/action:** In source mode, press Enter at the end of a list item, or Backspace right after `# `.
- **Expected:** Enter inserts a plain newline and Backspace deletes one character. Construct keys only run in rich mode.

### MODE-004. Other text files open as text

- **Setup/action:** Click a non-Markdown file in the vault tree, such as `config.yaml`.
- **Expected:** It opens in a tab as text with syntax highlighting from its file name. Saving keeps its line endings. There is no rich view to toggle.
- **Edge cases/notes:** Renaming keeps the exact file name, with no `.md` added. These files stay out of search and wiki links.

### MODE-005. Binary files go to the default app

- **Setup/action:** Click an image, PDF, or any file over 20 MB or not valid UTF-8 in the tree.
- **Expected:** It opens in the system's default app. No tab opens, and no error shows.

## Acceptance record for future changes

For each run, record scenario IDs, platform/WebView, app build, fixture identity, and the result. Separate automated state checks, real-browser interaction, and native Tauri computer use. Record failed scenarios and unmeasured combinations alongside passes.

A source check should name the expected and actual edit span or exact original bytes. A visual check should name the caret/focus, line or cell visited, gap change, and scroll result. A performance check should name first open versus unseen jump, fixture size/structure, and what the measurement includes.

Existing tests are starting points, not a substitute for this contract:

- Package suites in packages/markdown_editor/tests: source_history, lists_and_quotes, formatting, inline_rendering, code_blocks, tables, frontmatter, link_editing, menus, find, clipboard, plugin_api.
- App suites in tests/unit: codemirror_adapter, editor_service, html_clipboard, mermaid_preview, find_in_file_reactor, legacy_markdown_cleanup, plus app/Rust backup and conflict checks.

Add regression coverage where a failure can be expressed meaningfully, and retain native acceptance for browser geometry, keyboard focus, and rapid input. Do not mark the entire spec verified because the repository suite passes.
