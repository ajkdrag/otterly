import { defaultKeymap } from "@codemirror/commands";
import type { LanguageDescription } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
} from "@codemirror/view";
import { markdown_language } from "./markdown_language.js";
import { markdown_editor_theme } from "./editor_theme.js";
import { rich_markdown_rendering } from "./rich_rendering.js";
import { markdown_block_keymap } from "./block_commands.js";
import { markdown_format_keymap } from "./format_commands.js";
import { markdown_find_highlights } from "./find_highlights.js";
import {
  markdown_completions,
  type MarkdownCompletionOptions,
} from "./markdown_completions.js";
import {
  markdown_clipboard_input,
  type MarkdownClipboardOptions,
} from "./clipboard_input.js";
import { link_tooltip } from "./link_tooltip.js";
import { link_rendering } from "./link_rendering.js";
import {
  destroy_markdown_image,
  image_rendering,
  render_markdown_image,
  type ImageRenderingOptions,
} from "./image_rendering.js";
import { source_redo, source_undo } from "./source_state.js";
import { table_rendering } from "./table_rendering.js";
import {
  code_block_rendering,
  type CodeBlockOptions,
} from "./code_block_rendering.js";
import { markdown_editing_keymap } from "./editing_commands.js";

export type MarkdownEditorOptions = MarkdownCompletionOptions &
  MarkdownClipboardOptions & {
    code_languages?: readonly LanguageDescription[];
    open_link?: (target: string) => void;
    copy_link?: (target: string) => void | Promise<void>;
    link_edit_key?: string;
    resolve_image?: ImageRenderingOptions["resolve_image"];
    code_blocks?: Omit<CodeBlockOptions, "languages" | "undo" | "redo">;
  };

// Use with create_markdown_state so every edit and undo uses canonical source.
// Applications can also compose the individual extensions exported by this package.
export function markdown_editor_extensions(
  options: MarkdownEditorOptions = {},
): Extension {
  return [
    markdown_language(options.code_languages),
    markdown_editor_theme,
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    rich_markdown_rendering(),
    table_rendering({
      undo_command: source_undo,
      redo_command: source_redo,
      ...(options.open_link ? { open_link: options.open_link } : {}),
    }),
    code_block_rendering({
      ...options.code_blocks,
      ...(options.code_languages ? { languages: options.code_languages } : {}),
      undo: source_undo,
      redo: source_redo,
    }),
    markdown_format_keymap,
    markdown_block_keymap,
    markdown_editing_keymap,
    markdown_find_highlights(),
    markdown_completions(options),
    markdown_clipboard_input(options),
    options.open_link
      ? link_rendering({
          open_link: options.open_link,
          render_image: (source, label, view, resize) =>
            render_markdown_image(
              source,
              label,
              view,
              options.resolve_image ?? ((image) => image),
              {
                ...resize,
                on_resize: (ratio) => {
                  if (view.state.readOnly) return;
                  view.dispatch({
                    changes: {
                      from: resize.alt_from,
                      to: resize.alt_to,
                      insert: ratio.toFixed(2),
                    },
                    userEvent: "input.image.resize",
                  });
                },
              },
            ),
          destroy_image: destroy_markdown_image,
        })
      : [],
    options.open_link
      ? link_tooltip({
          open_link: options.open_link,
          ...(options.copy_link ? { copy_link: options.copy_link } : {}),
          ...(options.link_edit_key ? { edit_key: options.link_edit_key } : {}),
        })
      : [],
    image_rendering({
      resolve_image: options.resolve_image ?? ((source) => source),
    }),
    keymap.of([
      { key: "Mod-z", run: source_undo, preventDefault: true },
      { key: "Mod-Shift-z", run: source_redo, preventDefault: true },
      {
        key: "Mod-y",
        mac: "Mod-Shift-z",
        run: source_redo,
        preventDefault: true,
      },
      ...defaultKeymap,
    ]),
  ];
}
