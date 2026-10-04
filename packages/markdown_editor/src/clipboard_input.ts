import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { insert_markdown_source } from "./source_state.js";
import { get_frontmatter_end } from "./frontmatter_range.js";

export type MarkdownClipboardOptions = {
  on_image_paste?: (file: File) => void;
  html_to_markdown?: (html: string, plain_text: string) => string;
};

export function markdown_clipboard_input(
  options: MarkdownClipboardOptions = {},
) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly || !event.clipboardData) return false;
      const data = event.clipboardData;
      const position = view.state.selection.main.from;
      let literal = position < get_frontmatter_end(view.state);
      let node = syntaxTree(view.state).resolveInner(position, -1);
      for (;;) {
        if (["CodeBlock", "FencedCode", "InlineCode"].includes(node.name))
          literal = true;
        if (!node.parent) break;
        node = node.parent;
      }
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
