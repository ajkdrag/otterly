import {
  Compartment,
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// "rich" draws the plugins' rendering. "source" shows the plain Markdown text:
// no decorations, widgets, or construct keys. The mode is plain state, so a
// switch keeps the document, the selection, and the undo history.
export type EditorMode = "rich" | "source";

const mode_effect = StateEffect.define<EditorMode>();

export const editor_mode = StateField.define<EditorMode>({
  create: () => "rich",
  update(mode, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(mode_effect)) mode = effect.value;
    return mode;
  },
});

// Extensions that only run in source mode, such as syntax highlighting.
// They live in a compartment because a highlighter cannot be switched off
// any other way. The facet keeps them around so a later switch can swap them
// back in.
const source_extensions = Facet.define<Extension, Extension>({
  combine: (values) => values,
});
const source_compartment = new Compartment();

export function editor_mode_extensions(
  mode: EditorMode,
  extensions: Extension,
): Extension {
  const source_only = [source_theme, extensions];
  return [
    editor_mode.init(() => mode),
    source_extensions.of(source_only),
    source_compartment.of(mode === "source" ? source_only : []),
  ];
}

export function get_editor_mode(state: EditorState): EditorMode {
  return state.field(editor_mode, false) ?? "rich";
}

export function is_rich(state: EditorState): boolean {
  return get_editor_mode(state) === "rich";
}

export function set_editor_mode(view: EditorView, mode: EditorMode) {
  if (get_editor_mode(view.state) === mode) return;
  view.dispatch({
    effects: [
      mode_effect.of(mode),
      source_compartment.reconfigure(
        mode === "source" ? view.state.facet(source_extensions) : [],
      ),
    ],
  });
}

const source_theme = [
  EditorView.editorAttributes.of({ class: "md-source-mode" }),
  EditorView.theme({
    "&.md-source-mode > .cm-scroller": {
      fontFamily: "var(--font-mono, monospace)",
    },
    "&.md-source-mode > .cm-scroller > .cm-content": {
      fontSize:
        "calc(var(--editor-font-size, 1rem) * 0.9 * var(--editor-zoom, 1))",
    },
  }),
];
