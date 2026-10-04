import type { SyntaxNode } from "@lezer/common";
import {
  Prec,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import {
  line_container,
  markdown_context,
  type LineContainer,
} from "./context.js";
import { is_rich } from "./editor_mode.js";
import { guard } from "./inline_rendering.js";
import type { Construct, ConstructKeyName } from "./plugin.js";
import { enter_adjacent_block } from "./surface.js";

export type KeyContext = {
  readonly view: EditorView;
  readonly state: EditorState;
  // The node of the construct whose handler is running.
  readonly node: SyntaxNode;
  readonly construct: Construct;
  // The main selection head.
  readonly position: number;
  // Containers of the caret's line. Computed on first use.
  line(): LineContainer;
  dispatch(spec: TransactionSpec): void;
};

const construct_keys: readonly ConstructKeyName[] = [
  "Enter",
  "Shift-Enter",
  "Mod-Enter",
  "Backspace",
  "Tab",
  "Shift-Tab",
];

// Keys dispatch through context instead of a global priority list. For a
// key, the core walks the constructs around the caret from innermost to
// outermost and runs each one's handler. The first handler that returns true
// wins. An open completion menu and a focused surface see keys first.
export function context_keymap(): Extension {
  return Prec.high(
    keymap.of([
      ...construct_keys.map((key) => ({
        key,
        run: (view: EditorView) => run_construct_key(view, key),
      })),
      { key: "ArrowDown", run: (view) => enter_block(view, 1, true) },
      { key: "ArrowUp", run: (view) => enter_block(view, -1, true) },
      { key: "ArrowRight", run: (view) => enter_block(view, 1, false) },
      { key: "ArrowLeft", run: (view) => enter_block(view, -1, false) },
    ]),
  );
}

function enter_block(view: EditorView, direction: 1 | -1, vertical: boolean) {
  return is_rich(view.state) && enter_adjacent_block(view, direction, vertical);
}

// Construct keys assume the rendered view, like Backspace removing a hidden
// heading mark. Source mode edits the text as plain characters instead.
function run_construct_key(view: EditorView, key: ConstructKeyName): boolean {
  const { state } = view;
  if (state.readOnly || !is_rich(state)) return false;
  const position = state.selection.main.head;
  let line: LineContainer | null = null;
  for (const { node, construct } of markdown_context(state, position)) {
    const handler = construct.keys?.[key];
    if (!handler) continue;
    const handled = guard(construct, () =>
      handler({
        view,
        state,
        node,
        construct,
        position,
        line: () =>
          (line ??= line_container(state, state.doc.lineAt(position))),
        dispatch: (spec) => {
          view.dispatch(spec);
        },
      }),
    );
    if (handled) return true;
  }
  return false;
}
