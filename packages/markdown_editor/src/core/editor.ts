import { defaultKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import {
  block_at,
  block_extensions,
  controller_for_block,
  is_block_rendered,
  mounted_controllers,
  reveal_surfaces_at_caret,
  surface_input,
} from "./block_field.js";
import {
  editor_mode_extensions,
  source_theme,
  type EditorMode,
} from "./editor_mode.js";
import { editor_theme } from "./editor_theme.js";
import { inline_rendering } from "./inline_rendering.js";
import { context_keymap } from "./keys.js";
import {
  build_registry,
  construct_registry,
  type MarkdownPlugin,
} from "./plugin.js";
import { reveal_freeze, reveal_freeze_extension } from "./reveal.js";
import {
  create_source_state,
  source_redo,
  source_undo,
} from "./source_state.js";
import { focus_selection, surface_highlights } from "./surface.js";
import { markdown_syntax } from "./syntax.js";

export type MarkdownEditorConfig = {
  plugins: readonly MarkdownPlugin[];
  // Extra CodeMirror extensions, added after the plugins.
  extensions?: Extension;
  // Starts in "rich" when left out. See set_editor_mode.
  mode?: EditorMode;
  // Extensions that only run in source mode, such as syntax highlighting.
  source_extensions?: Extension;
};

// Create the state for one note. Hosts that keep one state per note cache the
// whole EditorState so each note retains its own selection and history.
export function create_markdown_state(
  source: string,
  config: MarkdownEditorConfig,
): EditorState {
  return create_source_state(source, [
    markdown_extensions(config.plugins),
    editor_mode_extensions(
      config.mode ?? "rich",
      config.source_extensions ?? [],
    ),
    config.extensions ?? [],
  ]);
}

// Plain text with the same line ending handling and undo as a note, for
// files that are not Markdown. `extensions` adds the language and theme.
export function create_text_state(
  source: string,
  extensions: Extension = [],
): EditorState {
  return create_source_state(source, [
    editor_theme,
    source_theme,
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    keymap.of(history_keys),
    keymap.of(defaultKeymap),
    extensions,
  ]);
}

export function create_markdown_editor(
  config: MarkdownEditorConfig & { parent: HTMLElement; source: string },
): EditorView {
  return new EditorView({
    parent: config.parent,
    state: create_markdown_state(config.source, config),
  });
}

// The compiled extension list for a set of plugins. Throws PluginBuildError
// when a required plugin is missing or two constructs share a name.
export function markdown_extensions(
  plugins: readonly MarkdownPlugin[],
): Extension {
  const registry = build_registry(plugins);
  return [
    construct_registry.of(registry),
    markdown_syntax(plugins),
    editor_theme,
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    EditorView.editorAttributes.of((view) =>
      view.state.selection.ranges.length === 1 &&
      !view.state.selection.main.empty
        ? { class: "md-native-selection" }
        : {},
    ),
    reveal_freeze_extension,
    inline_rendering(),
    block_extensions(),
    surface_selection_sync,
    pointer_focus_without_scroll,
    context_keymap(),
    plugins.map((plugin) => [
      plugin.keys ? keymap.of(plugin.keys) : [],
      // EditorView.theme, not baseTheme: plugin styles must win over
      // CodeMirror's own defaults, such as the autocomplete menu's. A host
      // theme added after the plugins still wins over both.
      plugin.theme ? EditorView.theme(plugin.theme) : [],
      plugin.extensions ?? [],
    ]),
    keymap.of([...history_keys, ...defaultKeymap]),
  ];
}

const history_keys: KeyBinding[] = [
  { key: "Mod-z", run: source_undo, preventDefault: true },
  { key: "Mod-Shift-z", run: source_redo, preventDefault: true },
  {
    key: "Mod-y",
    mac: "Mod-Shift-z",
    run: source_redo,
    preventDefault: true,
  },
];

// Compatibility fallback for WebKit. When a click focuses the editor,
// CodeMirror calls focus({ preventScroll: true }), but WebKit still scrolls
// to the old DOM selection if it sits at a block widget off screen, such as
// a caret restored inside a table. CodeMirror then reads the click against
// the moved page and selects the wrong lines. Put the DOM selection under
// the pointer first, so there is nothing off screen to reveal. CodeMirror
// sets the real selection right after.
const pointer_focus_without_scroll = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (view.hasFocus || event.button !== 0) return false;
    const doc = view.contentDOM.ownerDocument;
    const selection = doc.getSelection();
    if (
      !selection?.anchorNode ||
      !view.contentDOM.contains(selection.anchorNode)
    )
      return false;
    // @Robustness: WebKit before Safari 18.2 has no caretPositionFromPoint.
    // There we only drop the stale selection, and I have not verified that
    // this alone stops the scroll.
    const caret =
      "caretPositionFromPoint" in doc
        ? doc.caretPositionFromPoint(event.clientX, event.clientY)
        : null;
    selection.removeAllRanges();
    if (caret && view.contentDOM.contains(caret.offsetNode))
      selection.collapse(caret.offsetNode, caret.offset);
    return false;
  },
});

// Keep a surface's inner selection in step with the outer selection. After
// Undo or Redo lands inside a surface, move focus there too, so the next key
// edits where the history put the caret.
const surface_selection_sync = EditorView.updateListener.of((update) => {
  if (highlights_changed(update.startState, update.state)) {
    for (const controller of mounted_controllers(update.view))
      controller.refresh_highlights?.();
  }
  if ((update.focusChanged || update.selectionSet) && update.view.hasFocus)
    move_caret_into_surface(update.view);
  if (nested_editor_may_hold_focus(update)) take_focus_back(update.view);
  if (!update.selectionSet && !update.docChanged) return;
  if (
    update.transactions.some((transaction) =>
      transaction.annotation(surface_input),
    )
  )
    return;
  const head = update.state.selection.main.head;
  for (const controller of mounted_controllers(update.view)) {
    if (controller.owns?.(head)) controller.sync_selection?.();
  }
  const from_history = update.transactions.some(
    (transaction) =>
      transaction.isUserEvent("undo") ||
      transaction.isUserEvent("redo") ||
      transaction.isUserEvent("history"),
  );
  if (from_history && update.view.hasFocus) {
    // Focusing may scroll the outer view, which cannot happen inside this
    // update. Run it right after.
    queueMicrotask(() => {
      focus_selection(update.view);
    });
  }
});

// The focused prose caret never rests on a rendered surface block. There it
// would draw as a bar the height of the widget, and typing would edit the
// hidden source (for example a note that starts with a table). Hand the caret
// to the surface instead: at its own position if the surface owns it,
// otherwise at the nearer edge.
function move_caret_into_surface(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return;
  const block = block_at(view.state, selection.head);
  if (!block || block.construct.reveal !== "surface") return;
  if (!is_block_rendered(view.state, block)) return;
  // Focusing dispatches, which cannot happen inside this update.
  queueMicrotask(() => {
    if (!view.hasFocus || view.state.selection.main.head !== selection.head)
      return;
    const controller = controller_for_block(view, block);
    if (!controller) return;
    if (controller.owns?.(selection.head) && controller.focus?.(selection.head))
      return;
    const nearer_start =
      selection.head - block.from <= block.to - selection.head;
    controller.enter?.(nearer_start ? 1 : -1, null);
  });
}

// Under reveal_surfaces_at_caret the outer view owns every key, so focus must
// not stay in a nested editor, which has no Vim. A click inside a rendered code
// block or table still focuses the nested editor. The reveal freeze holds the
// block rendered until about 100 ms after the button comes up. Then the block
// turns into source, whether the click left a caret or a range (double click,
// drag), because a selection inside a block reveals it. The nested view is
// destroyed together with its focus. This finds the moments to check: the
// freeze just ended, or a nested editor published a selection or edit while no
// click was in progress.
function nested_editor_may_hold_focus(update: ViewUpdate): boolean {
  const { startState, state } = update;
  if (!state.facet(reveal_surfaces_at_caret)) return false;
  const frozen = state.field(reveal_freeze, false)?.frozen === true;
  const click_ended =
    startState.field(reveal_freeze, false)?.frozen === true && !frozen;
  const nested_editor_published =
    !frozen &&
    update.transactions.some((transaction) =>
      transaction.annotation(surface_input),
    );
  return click_ended || nested_editor_published;
}

// Give focus back to the outer editor, keeping its selection, so the next key
// lands where Vim sees it. Focus is on the body when the nested view went away
// and inside a nested editor when it stayed. Anywhere else it is there on
// purpose, such as the find bar or Vim's own prompt.
function take_focus_back(view: EditorView) {
  // Focusing dispatches, which cannot happen inside this update.
  queueMicrotask(() => {
    if (view.hasFocus) return;
    const doc = view.contentDOM.ownerDocument;
    const nested_editor = doc.activeElement?.closest(".cm-editor");
    const in_nested_editor =
      nested_editor &&
      nested_editor !== view.dom &&
      view.dom.contains(nested_editor);
    if (doc.activeElement === doc.body || in_nested_editor) view.focus();
  });
}

function highlights_changed(before: EditorState, after: EditorState): boolean {
  const sources = after.facet(surface_highlights);
  return sources.some((source, index) => {
    const old_source = before.facet(surface_highlights)[index];
    return old_source !== source || source(before) !== source(after);
  });
}
