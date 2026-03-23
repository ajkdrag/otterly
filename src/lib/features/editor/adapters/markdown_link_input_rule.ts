import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import type {
  MarkType,
  Node as ProseNode,
  Mark,
} from "@milkdown/kit/prose/model";

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)\n]+?\.md|[^)\s]+)\)/i;
const ZERO_WIDTH_SPACE = "\u200B";

type Segment = {
  text: string;
  start_index: number;
  start_pos: number;
  has_link_mark: boolean;
};

function build_segments(input: {
  text_block: ProseNode;
  block_start: number;
  link_type: MarkType;
}): { segments: Segment[]; combined: string; has_non_text_inline: boolean } {
  const segments: Segment[] = [];
  let combined = "";
  let current_index = 0;
  let has_non_text_inline = false;

  input.text_block.descendants((node: ProseNode, pos: number) => {
    if (node.isText && node.text) {
      segments.push({
        text: node.text,
        start_index: current_index,
        start_pos: input.block_start + pos,
        has_link_mark: node.marks.some((m: Mark) => m.type === input.link_type),
      });
      combined += node.text;
      current_index += node.text.length;
      return true;
    }

    if (node.isInline) {
      has_non_text_inline = true;
      return false;
    }

    return true;
  });

  return { segments, combined, has_non_text_inline };
}

function pos_from_index(segments: Segment[], index: number): number | null {
  for (const seg of segments) {
    const end = seg.start_index + seg.text.length;
    if (index >= seg.start_index && index < end) {
      return seg.start_pos + (index - seg.start_index);
    }
  }
  return null;
}

function contains_link_mark(
  segments: Segment[],
  match_start_index: number,
  match_end_index: number,
): boolean {
  return segments.some((seg) => {
    if (!seg.has_link_mark) return false;
    const seg_end = seg.start_index + seg.text.length;
    return seg.start_index < match_end_index && seg_end > match_start_index;
  });
}

export function create_markdown_link_input_rule_prose_plugin(input: {
  link_type: MarkType;
}) {
  return new Plugin({
    key: new PluginKey("markdown-link-converter"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const from = newState.selection.$from;
      const text_block = from.parent;
      if (!text_block.isTextblock) return null;
      if (text_block.type.name === "code_block") return null;

      const { segments, combined, has_non_text_inline } = build_segments({
        text_block,
        block_start: from.start(),
        link_type: input.link_type,
      });
      if (has_non_text_inline) return null;
      if (combined === "") return null;

      const window_before = 256;
      const window_after = 64;
      const anchor = from.parentOffset;
      const window_start = Math.max(0, anchor - window_before);
      const window_end = Math.min(combined.length, anchor + window_after);
      const window_text = combined.slice(window_start, window_end);

      const match = MARKDOWN_LINK_REGEX.exec(window_text);
      if (!match) return null;

      const [full_match, link_text, href] = match;
      if (!link_text || !href) return null;
      const normalized_href = href.trim();
      if (normalized_href === "") return null;

      const match_start_index = window_start + match.index;
      if (match_start_index > 0 && combined[match_start_index - 1] === "!")
        return null;

      const match_end_index = match_start_index + full_match.length;
      if (contains_link_mark(segments, match_start_index, match_end_index))
        return null;

      const start = pos_from_index(segments, match_start_index);
      if (start === null) return null;

      const tr = newState.tr;
      tr.replaceWith(start, start + full_match.length, [
        newState.schema.text(link_text, [
          input.link_type.create({ href: normalized_href }),
        ]),
        newState.schema.text(ZERO_WIDTH_SPACE),
      ]);
      tr.setSelection(
        TextSelection.create(tr.doc, start + link_text.length + 1),
      );
      tr.setStoredMarks([]);

      return tr;
    },
  });
}

export const markdown_link_input_rule_plugin = $prose((ctx) => {
  const link_type = linkSchema.type(ctx);
  return create_markdown_link_input_rule_prose_plugin({ link_type });
});
