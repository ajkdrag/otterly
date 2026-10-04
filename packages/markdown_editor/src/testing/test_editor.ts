import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { create_markdown_state } from "../core/editor.js";
import type { MarkdownPlugin } from "../core/plugin.js";
import { get_markdown_source } from "../core/source_state.js";

// Test helper for plugin authors. Builds a real editor in a DOM (jsdom works)
// and drives it with real key events, so keymaps compose the same way they do
// in an app.
//
// The source uses "‸" for the caret and "‹" for a selection anchor:
//
//   const editor = test_editor("> text‸", [commonmark()]);
//   editor.press("Enter", "Enter").type("out");
//   expect(editor.source()).toBe("> text\n\nout‸");
export const caret_marker = "‸";
export const anchor_marker = "‹";

export type TestEditor = {
  readonly view: EditorView;
  // Key names use CodeMirror's notation: "Enter", "Shift-Tab", "Mod-Enter".
  press(...keys: string[]): TestEditor;
  // Types text one character at a time into the focused editor.
  type(text: string): TestEditor;
  // The current display document with the main selection marked.
  source(): string;
  // The saved source, with original line endings and no markers.
  saved(): string;
  destroy(): void;
};

const open_editors = new Set<TestEditor>();

export function test_editor(
  marked_source: string,
  plugins: readonly MarkdownPlugin[],
): TestEditor {
  const { text, anchor, head } = parse_markers(marked_source);
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: create_markdown_state(text, { plugins }),
  });
  view.dispatch({
    selection: EditorSelection.single(
      to_display_offset(text, anchor),
      to_display_offset(text, head),
    ),
  });
  view.focus();
  const editor: TestEditor = {
    view,
    press(...keys) {
      for (const key of keys) press_key(view, key);
      return editor;
    },
    type(value) {
      for (const character of value) type_character(view, character);
      return editor;
    },
    source() {
      const { state } = view;
      const { anchor: from, head: to } = state.selection.main;
      const document_text = state.doc.toString();
      if (from === to)
        return (
          document_text.slice(0, to) + caret_marker + document_text.slice(to)
        );
      const marks = [
        { at: from, mark: anchor_marker },
        { at: to, mark: caret_marker },
      ].sort((left, right) => right.at - left.at);
      let result = document_text;
      for (const { at, mark } of marks)
        result = result.slice(0, at) + mark + result.slice(at);
      return result;
    },
    saved() {
      return get_markdown_source(view.state);
    },
    destroy() {
      view.destroy();
      parent.remove();
      open_editors.delete(editor);
    },
  };
  open_editors.add(editor);
  return editor;
}

// Call from afterEach to clean up editors a test did not destroy.
export function destroy_test_editors() {
  for (const editor of [...open_editors]) editor.destroy();
}

function parse_markers(marked: string) {
  const head_index = marked.indexOf(caret_marker);
  const anchor_index = marked.indexOf(anchor_marker);
  const text = marked.replace(caret_marker, "").replace(anchor_marker, "");
  let head = head_index < 0 ? text.length : head_index;
  let anchor = head;
  if (anchor_index >= 0) {
    // Removing one marker shifts the position of the one after it.
    anchor = anchor_index < head ? anchor_index : anchor_index - 1;
    if (head_index > anchor_index) head--;
  }
  return { text, anchor, head };
}

// Display positions count a CRLF as one character.
function to_display_offset(text: string, offset: number) {
  return text.slice(0, offset).replace(/\r\n/g, "\n").length;
}

function focused_view(view: EditorView): EditorView {
  const active = view.dom.ownerDocument.activeElement;
  if (active instanceof HTMLElement && view.dom.contains(active)) {
    // findFromDOM searches downward for ".cm-content", which would find a
    // nested editor first. Start from the focused element's own editor root.
    const root = active.closest<HTMLElement>(".cm-editor");
    const focused = root ? EditorView.findFromDOM(root) : null;
    if (focused) return focused;
  }
  return view;
}

const is_mac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function press_key(view: EditorView, name: string) {
  const parts = name.split("-");
  const key = parts.pop() ?? name;
  const modifiers = new Set(parts);
  const target = focused_view(view);
  target.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: modifiers.has("Shift"),
      altKey: modifiers.has("Alt"),
      ctrlKey: modifiers.has("Ctrl") || (modifiers.has("Mod") && !is_mac),
      metaKey: modifiers.has("Meta") || (modifiers.has("Mod") && is_mac),
    }),
  );
}

// Typing goes through the input handlers the way CodeMirror's own input
// does, so completions and other input handlers see each character.
function type_character(view: EditorView, character: string) {
  const target = focused_view(view);
  const { state } = target;
  const range = state.selection.main;
  const handled = state.facet(EditorView.inputHandler).some((handler) =>
    handler(target, range.from, range.to, character, () =>
      state.update(state.replaceSelection(character), {
        userEvent: "input.type",
        scrollIntoView: true,
      }),
    ),
  );
  if (!handled)
    target.dispatch(
      state.update(state.replaceSelection(character), {
        userEvent: "input.type",
        scrollIntoView: true,
      }),
    );
}
