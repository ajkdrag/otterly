import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const NON_TEXT_BLOCK_TYPES = new Set([
  "code_block",
  "blockquote",
  "table",
  "hr",
  "image-block",
]);
const leading_block_escape_plugin_key = new PluginKey("leading-block-escape");

function is_cursor_in_first_textblock(view: EditorView): boolean {
  const { selection, doc } = view.state;
  if (!selection.empty) return false;

  let first = doc.firstChild;
  if (!first || !NON_TEXT_BLOCK_TYPES.has(first.type.name)) return false;
  let position = 0;
  while (first && !first.isTextblock) {
    first = first.firstChild;
    position += 1;
  }
  const { $from } = selection;
  return (
    first !== null && $from.depth > 0 && $from.before($from.depth) === position
  );
}

function should_escape_leading_block(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.key !== "ArrowUp" && event.key !== "ArrowLeft") return false;
  if (
    !view.editable ||
    view.composing ||
    event.isComposing ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return false;
  if (!is_cursor_in_first_textblock(view)) return false;

  return event.key === "ArrowUp"
    ? view.endOfTextblock("up")
    : view.state.selection.$from.parentOffset === 0;
}

function insert_paragraph_before_first_block(view: EditorView): boolean {
  const { state } = view;
  const paragraph_type = state.schema.nodes["paragraph"];
  if (!paragraph_type) return false;

  const tr = state.tr.insert(0, paragraph_type.create());
  tr.setSelection(TextSelection.create(tr.doc, 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function create_leading_block_escape_prose_plugin() {
  return new Plugin({
    key: leading_block_escape_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (should_escape_leading_block(view, event)) {
          return insert_paragraph_before_first_block(view);
        }

        return false;
      },
    },
  });
}

export const leading_block_escape_plugin = $prose(() =>
  create_leading_block_escape_prose_plugin(),
);
