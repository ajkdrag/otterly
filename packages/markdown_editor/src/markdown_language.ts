import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { LanguageDescription } from "@codemirror/language";
import type { MarkdownConfig } from "@lezer/markdown";
import { markdown_container_keymap } from "./editing_commands.js";
import { frontmatter_range } from "./frontmatter_range.js";
import { viewport_parsing } from "./viewport_parsing.js";

const markdown_syntax: MarkdownConfig = {
  defineNodes: ["WikiLink"],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(context, next, position) {
        if (next !== 91 || context.char(position + 1) !== 91) return -1;
        for (let cursor = position + 2; cursor < context.end; cursor++) {
          const char = context.char(cursor);
          if (char === 91 || char === 10 || char === 13) return -1;
          if (char === 93 && context.char(cursor + 1) === 93) {
            if (cursor === position + 2) return -1;
            return context.addElement(
              context.elt("WikiLink", position, cursor + 2),
            );
          }
        }
        return -1;
      },
    },
  ],
};
export function markdown_language(
  code_languages: readonly LanguageDescription[] = [],
) {
  return [
    frontmatter_range,
    markdown_container_keymap,
    viewport_parsing,
    markdown({
      base: markdownLanguage,
      addKeymap: false,
      codeLanguages: code_languages,
      extensions: markdown_syntax,
      completeHTMLTags: false,
      pasteURLAsLink: false,
    }),
  ];
}
