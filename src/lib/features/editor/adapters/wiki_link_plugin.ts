import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type {
  MarkType,
  Node as ProseNode,
  Mark,
} from "@milkdown/kit/prose/model";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { format_wiki_display } from "$lib/features/editor/domain/wiki_link";
import { dirty_state_plugin_key } from "./dirty_state_plugin";
import { editor_context_plugin_key } from "./editor_context_plugin";

const ZERO_WIDTH_SPACE = "\u200B";
const WIKI_LINK_REGEX = /\[\[([^\]\n]+?)(?:\|([^\]\n]+?))?\]\]/;

type WikiLinkMeta = { action: "full_scan" };

function is_full_scan_action(value: unknown): value is WikiLinkMeta {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.action === "full_scan";
}

export const wiki_link_plugin_key = new PluginKey("wiki-link-plugin");

type Segment = {
  text: string;
  start_index: number;
  start_pos: number;
  has_link_mark: boolean;
  has_code_mark: boolean;
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
        has_code_mark: node.marks.some(
          (m: Mark) => m.type.name === "code_inline" || m.type.name === "code",
        ),
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

function contains_protected_mark(
  segments: Segment[],
  match_start_index: number,
  match_end_index: number,
): boolean {
  return segments.some((seg) => {
    if (!seg.has_link_mark && !seg.has_code_mark) return false;
    const seg_end = seg.start_index + seg.text.length;
    return seg.start_index < match_end_index && seg_end > match_start_index;
  });
}

function ensure_md_extension(value: string): string {
  return value.endsWith(".md") ? value : `${value}.md`;
}

function build_replacement(input: {
  raw_target: string;
  raw_label: string | null;
}): { display: string; href: string } | null {
  const raw = input.raw_target.trim();
  if (raw === "") return null;

  const href = ensure_md_extension(raw);
  const label = (input.raw_label ?? "").trim();
  const display = label || format_wiki_display(raw);

  return { display, href };
}

export function create_wiki_link_converter_prose_plugin(input: {
  link_type: MarkType;
}) {
  return new Plugin({
    key: wiki_link_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      const force_full_scan = transactions.some((tr) =>
        is_full_scan_action(tr.getMeta(wiki_link_plugin_key)),
      );
      const should_scan =
        force_full_scan || transactions.some((tr) => tr.docChanged);
      if (!should_scan) return null;

      const tr = new_state.tr;

      const scan_textblock = (
        text_block: ProseNode,
        block_start: number,
        selection_anchor: number | null,
      ) => {
        if (!text_block.isTextblock) return;
        if (text_block.type.name === "code_block") return;

        const { segments, combined, has_non_text_inline } = build_segments({
          text_block,
          block_start,
          link_type: input.link_type,
        });
        if (has_non_text_inline) return;
        if (combined === "") return;

        if (selection_anchor === null) {
          const matches: Array<{
            full_match: string;
            raw_target: string;
            raw_label: string | null;
            start: number;
            end: number;
          }> = [];
          const regex = new RegExp(WIKI_LINK_REGEX.source, "g");
          let match: RegExpExecArray | null = null;

          while ((match = regex.exec(combined)) !== null) {
            const [full_match, raw_target, raw_label] = match;
            if (!raw_target) continue;

            const start = match.index;
            const end = start + full_match.length;
            if (contains_protected_mark(segments, start, end)) continue;
            matches.push({
              full_match,
              raw_target,
              raw_label: raw_label ?? null,
              start,
              end,
            });
          }

          for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            if (!m) continue;
            const start_pos = pos_from_index(segments, m.start);
            if (start_pos === null) continue;
            const replacement = build_replacement({
              raw_target: m.raw_target,
              raw_label: m.raw_label,
            });
            if (!replacement) continue;

            tr.replaceWith(start_pos, start_pos + m.full_match.length, [
              new_state.schema.text(replacement.display, [
                input.link_type.create({ href: replacement.href }),
              ]),
              new_state.schema.text(ZERO_WIDTH_SPACE),
            ]);
          }

          return;
        }

        const window_before = 1024;
        const window_after = 256;
        const anchor = selection_anchor;
        const window_start = Math.max(0, anchor - window_before);
        const window_end = Math.min(combined.length, anchor + window_after);
        const window_text = combined.slice(window_start, window_end);

        const match = WIKI_LINK_REGEX.exec(window_text);
        if (!match) return;

        const [full_match, raw_target, raw_label] = match;
        if (!raw_target) return;

        const match_start_index = window_start + match.index;
        const match_end_index = match_start_index + full_match.length;
        if (
          contains_protected_mark(segments, match_start_index, match_end_index)
        )
          return;

        const start = pos_from_index(segments, match_start_index);
        if (start === null) return;

        const replacement = build_replacement({
          raw_target,
          raw_label: raw_label ?? null,
        });
        if (!replacement) return;

        tr.replaceWith(start, start + full_match.length, [
          new_state.schema.text(replacement.display, [
            input.link_type.create({ href: replacement.href }),
          ]),
          new_state.schema.text(ZERO_WIDTH_SPACE),
        ]);

        tr.setSelection(
          TextSelection.create(tr.doc, start + replacement.display.length + 1),
        );
        tr.setStoredMarks([]);
      };

      if (force_full_scan) {
        const blocks: Array<{ node: ProseNode; pos: number }> = [];
        new_state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          blocks.push({ node, pos: pos + 1 });
          return false;
        });
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          if (block) scan_textblock(block.node, block.pos, null);
        }
        if (!tr.docChanged) return null;
        tr.setMeta(dirty_state_plugin_key, { action: "mark_clean" });
        tr.setMeta("addToHistory", false);
        return tr;
      }

      const from = new_state.selection.$from;
      const text_block = from.parent;
      if (!text_block.isTextblock) return null;
      if (from.parent.type.name === "code_block") return null;

      scan_textblock(text_block, from.start(), from.parentOffset);
      return tr.docChanged ? tr : null;
    },
  });
}

function is_external_url(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parse_internal_href(href: string): string | null {
  if (href.trim() === "" || is_external_url(href)) return null;

  let path = href;
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  const query = path.indexOf("?");
  if (query >= 0) path = path.slice(0, query);

  try {
    path = decodeURIComponent(path.trim());
  } catch {
    path = path.trim();
  }
  if (path === "") return null;

  const slash = path.lastIndexOf("/");
  const leaf = slash >= 0 ? path.slice(slash + 1) : path;
  if (leaf === "") return null;

  const has_dot = leaf.includes(".");
  if (has_dot && !leaf.toLowerCase().endsWith(".md")) return null;

  return path;
}

export function create_wiki_link_click_prose_plugin(input: {
  on_internal_link_click: (raw_path: string, base_note_path: string) => void;
  on_external_link_click: (url: string) => void;
  base_note_path?: string;
}) {
  function anchor_href_from_event(event: MouseEvent): string | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return null;
    return anchor.getAttribute("href");
  }

  return new Plugin({
    key: new PluginKey("wiki-link-click"),
    props: {
      handleDOMEvents: {
        click: (view, event) => {
          if (event.button !== 0) return false;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return false;

          const href = anchor_href_from_event(event);
          if (typeof href !== "string") return false;

          event.preventDefault();

          if (is_external_url(href)) {
            input.on_external_link_click(href);
            return true;
          }

          const raw_path = parse_internal_href(href);
          if (!raw_path) return true;

          const editor_state = view?.state;
          const ctx_state = editor_state
            ? editor_context_plugin_key.getState(editor_state)
            : null;
          const base = ctx_state?.note_path ?? input.base_note_path ?? "";
          input.on_internal_link_click(raw_path, base);

          return true;
        },
      },
    },
  });
}

export const create_wiki_link_converter_plugin = () =>
  $prose((ctx) => {
    const link_type = linkSchema.type(ctx);
    return create_wiki_link_converter_prose_plugin({
      link_type,
    });
  });

export const create_wiki_link_click_plugin = (input: {
  on_internal_link_click: (raw_path: string, base_note_path: string) => void;
  on_external_link_click: (url: string) => void;
}) => $prose(() => create_wiki_link_click_prose_plugin(input));
