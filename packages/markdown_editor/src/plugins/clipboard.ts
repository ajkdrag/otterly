import { EditorView } from "@codemirror/view";
import { is_literal } from "../core/context.js";
import type { MarkdownPlugin } from "../core/plugin.js";
import { insert_markdown_source } from "../core/source_state.js";

export type MarkdownClipboardOptions = {
  on_image_paste?: (file: File) => void;
  html_to_markdown?: (html: string, plain_text: string) => string;
};

// Paste prefers explicit Markdown, converts HTML through the host, and hands
// image files to the host. Literal contexts (code, frontmatter) get plain
// text. Pasted text keeps its own line endings in the saved source.
export function clipboard(
  options: MarkdownClipboardOptions = {},
): MarkdownPlugin {
  return { name: "clipboard", extensions: clipboard_handlers(options) };
}

function clipboard_handlers(options: MarkdownClipboardOptions) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly || !event.clipboardData) return false;
      const data = event.clipboardData;
      const literal = is_literal(view.state, view.state.selection.main.from);
      if (!literal && options.on_image_paste) {
        for (const item of Array.from(data.items)) {
          if (
            item.kind !== "file" ||
            !item.type.toLowerCase().startsWith("image/")
          )
            continue;
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          options.on_image_paste(file);
          return true;
        }
      }
      let source = data.getData("text/markdown");
      if (literal || !source) source = data.getData("text/plain");
      if (
        !literal &&
        !data.getData("text/markdown") &&
        options.html_to_markdown
      ) {
        const html = data.getData("text/html");
        if (html) {
          // A malformed fragment must not prevent a plain-text paste.
          try {
            source = options.html_to_markdown(html, source);
          } catch {
            /* Preserve the plain-text fallback. */
          }
        }
      }
      if (!source) return false;
      event.preventDefault();
      insert_markdown_source(view, source);
      return true;
    },
  });
}
