import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkType } from "@milkdown/kit/prose/model";

export interface LinkEditParams {
  from: number;
  to: number;
  old_display_text: string;
  old_href: string;
  new_display_text: string;
  new_href: string;
}

export function build_link_edit_transaction(
  state: EditorState,
  link_type: MarkType,
  params: LinkEditParams,
) {
  const { from, to, old_display_text, old_href, new_display_text, new_href } =
    params;

  const text_changed = new_display_text !== old_display_text;
  const href_changed = new_href !== old_href;

  if (!new_display_text) return null;
  if (!text_changed && !href_changed) return null;

  const tr = state.tr;

  if (text_changed) {
    tr.insertText(new_display_text, from, to);
    const new_to = from + new_display_text.length;
    tr.removeMark(from, new_to, link_type);
    tr.addMark(
      from,
      new_to,
      link_type.create({ href: href_changed ? new_href : old_href }),
    );
  } else {
    tr.removeMark(from, to, link_type);
    tr.addMark(from, to, link_type.create({ href: new_href }));
  }

  return tr;
}
