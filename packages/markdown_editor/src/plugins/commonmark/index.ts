import type { MarkdownPlugin } from "../../core/plugin.js";
import { block_style_keys } from "./block_commands.js";
import { format_keys, typing_format_extension } from "./format_commands.js";
import { list_item } from "./lists.js";
import { emphasis, inline_code } from "./marks.js";
import {
  escape,
  heading,
  horizontal_rule,
  html_block,
  html_break,
  indented_code,
  list_spacing,
  paragraph,
} from "./prose.js";
import { blockquote, indent_text } from "./quotes.js";
import { commonmark_theme } from "./theme.js";

// Paragraphs, headings, emphasis, inline code, lists, quotes, rules, escapes,
// and literal HTML. Links, images, and fenced code have their own plugins
// because they need host callbacks.
export function commonmark(): MarkdownPlugin {
  return {
    name: "commonmark",
    constructs: [
      paragraph,
      heading,
      horizontal_rule,
      emphasis,
      inline_code,
      escape,
      html_break,
      indented_code,
      html_block,
      list_item,
      list_spacing,
      blockquote,
    ],
    keys: [
      ...format_keys,
      ...block_style_keys,
      // Outside lists, Tab indents the text after any quote marker. Lists
      // handle Tab first.
      { key: "Tab", run: indent_text(true), shift: indent_text(false) },
    ],
    theme: commonmark_theme,
    extensions: typing_format_extension,
  };
}

export { change_list_indent, next_marker } from "./lists.js";
export {
  toggle_bold,
  toggle_italic,
  toggle_inline_code,
  toggle_strikethrough,
} from "./format_commands.js";
export { set_block_style } from "./block_commands.js";
export { delimited_mark } from "./marks.js";
export { TextSymbol } from "./prose.js";
