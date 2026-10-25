import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { current_tree } from "../../core/context.js";
import type { MarkdownPlugin } from "../../core/plugin.js";
import { tag_completion } from "./tag_completion.js";
import { hashtag_style, inside_link, tag_syntax } from "./tag_syntax.js";
import { tags_theme } from "./theme.js";

export type TagSuggestion = { tag: string; count: number };

export type TagOptions = {
  // A plain click on a chip. Without it chips are not clickable.
  open_tag?: (tag: string) => void;
  // Ranked suggestions for the text after "#". The signal aborts when the
  // text changes. Without it there is no completion.
  query_tags?: (
    partial: string,
    signal: AbortSignal,
  ) => Promise<readonly TagSuggestion[]>;
};

// #tags render as chips. A chip is a mark, not a widget, so the tag stays
// real text: arrows step through it one char at a time, IME edits it, and
// selection, copy, undo and redo see plain source. The chip looks the same
// with the caret inside, so nothing shifts while you arrow through a
// paragraph. Only a tag being born or dying moves text, by the chip padding.
//
// Class names are public: md-tag, md-tag-hash, md-tag-clickable,
// md-tag-source and md-tag-option.
//
// @Incomplete: Frontmatter is literal, so its `tags:` get no chips and no
// completion.
export function tags(options: TagOptions = {}): MarkdownPlugin {
  const { open_tag, query_tags } = options;
  return {
    name: "tags",
    syntax: tag_syntax,
    constructs: [
      {
        kind: "inline",
        name: "tag",
        nodes: ["Hashtag"],
        decorate(node, render) {
          if (inside_link(node.node)) return;
          // Clicking into a tag you are typing places the caret instead of
          // opening it. render.reveal means a caret touches the tag, and the
          // core freezes it while the mouse is down, so the class holds for
          // the whole click.
          const clickable = open_tag !== undefined && !render.reveal;
          render.outer_mark(
            node.from,
            node.to,
            clickable ? "md-tag md-tag-clickable" : "md-tag",
          );
          render.mark(node.from, node.from + 1, "md-tag-hash");
        },
        render_static(node, context) {
          if (inside_link(node.node)) return null;
          const tag = context.state.sliceDoc(node.from + 1, node.to);
          return static_tag_element(tag, open_tag);
        },
      },
    ],
    extensions: [
      source_highlighting,
      open_tag ? chip_clicks(open_tag) : [],
      query_tags ? tag_completion(query_tags) : [],
    ],
    theme: tags_theme,
  };
}

// The tag at `pos`, without its `#`, or null. The caret right after `#idea`
// counts.
export function tag_at(state: EditorState, pos: number): string | null {
  const tree = current_tree(state, pos);
  for (const side of [1, -1] as const) {
    const node = tree.resolveInner(pos, side);
    if (node.name === "Hashtag" && !inside_link(node))
      return state.sliceDoc(node.from + 1, node.to);
  }
  return null;
}

// Source mode shows tags as colored text and nothing else, so monospace
// columns stay aligned. The class is there in rich mode too, unstyled.
const source_highlighting = syntaxHighlighting(
  HighlightStyle.define([{ tag: hashtag_style, class: "md-tag-source" }]),
);

type ChipPress = {
  x: number;
  y: number;
  pos: number;
  // Where the caret was before the press moved it into the tag.
  selection: EditorSelection;
};
const chip_presses = new WeakMap<EditorView, ChipPress>();

// A plain left click on a chip opens it. The press lets CodeMirror place the
// caret as usual, so a drag from a chip still selects. Modified clicks keep
// their editor meaning, like links (LINK-003). A double click opens on the
// first click, because the tag search takes focus.
//
// CodeMirror puts the caret inside the tag on the press. We put it back before
// opening, otherwise the chip stops being clickable (the caret touches it) and
// the next click on it only moves the caret.
function chip_clicks(open_tag: (tag: string) => void) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      chip_presses.delete(view);
      if (event.button !== 0 || is_modified(event)) return false;
      const target = event.target instanceof Element ? event.target : null;
      const chip = target?.closest(".md-tag-clickable");
      if (!chip || !view.contentDOM.contains(chip)) return false;
      chip_presses.set(view, {
        x: event.clientX,
        y: event.clientY,
        pos: view.posAtDOM(chip),
        selection: view.state.selection,
      });
      return false;
    },
    click(event, view) {
      const press = chip_presses.get(view);
      chip_presses.delete(view);
      if (!press || event.button !== 0 || is_modified(event)) return false;
      const moved = Math.hypot(
        event.clientX - press.x,
        event.clientY - press.y,
      );
      if (moved >= 4) return false;
      const tag = tag_at(view.state, press.pos);
      if (tag === null) return false;
      view.dispatch({ selection: press.selection });
      open_tag(tag);
      return true;
    },
  });
}

// For inactive table cells, which have no live editor.
function static_tag_element(
  tag: string,
  open_tag: ((tag: string) => void) | undefined,
): HTMLElement {
  const element = document.createElement("span");
  element.className = open_tag ? "md-tag md-tag-clickable" : "md-tag";
  const hash = document.createElement("span");
  hash.className = "md-tag-hash";
  hash.textContent = "#";
  element.append(hash, tag);
  if (!open_tag) return element;
  // The table activates a cell on mousedown. Stop that here, the way it
  // skips links, so the click below opens the tag instead.
  element.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || is_modified(event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("click", (event) => {
    if (event.button !== 0 || is_modified(event)) return;
    event.preventDefault();
    event.stopPropagation();
    open_tag(tag);
  });
  return element;
}

function is_modified(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
