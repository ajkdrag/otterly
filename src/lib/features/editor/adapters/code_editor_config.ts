import { languages } from "@codemirror/language-data";
import {
  HighlightStyle,
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const plain_text_support = new LanguageSupport(
  StreamLanguage.define({
    token(stream) {
      stream.skipToEnd();
      return null;
    },
  }),
);
const plain_language = LanguageDescription.of({
  name: "",
  alias: ["plain", "text"],
  support: plain_text_support,
});
// language-data has no mermaid grammar, so it highlights as plain text. The
// picker writes the name into the fence, and renderers expect lowercase.
const mermaid_language = LanguageDescription.of({
  name: "mermaid",
  support: plain_text_support,
});
export const code_languages = [plain_language, mermaid_language, ...languages];

export function render_code_language(language: string): string {
  if (!language) return "Plain";
  const match = LanguageDescription.matchLanguageName(
    code_languages,
    language,
    false,
  );
  if (match === mermaid_language) return "Mermaid";
  return match ? match.name || "Plain" : language;
}

export const code_block_theme = CodeMirrorView.theme({
  "&": {
    backgroundColor: "var(--editor-code-bg)",
    color: "var(--editor-code-block-text)",
    fontFamily: "var(--font-mono)",
    fontSize: "calc(0.8125rem * var(--editor-zoom))",
  },
  ".cm-content": {
    padding: "0.75rem 0",
    caretColor: "var(--caret-color, var(--foreground))",
  },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5" },
  ".cm-cursor": { borderLeftColor: "var(--caret-color, var(--foreground))" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg)",
  },
});

export const code_block_highlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.punctuation, color: "var(--syntax-punctuation)" },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syntax-property)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--syntax-string)",
  },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.variableName, color: "var(--syntax-variable)" },
  { tag: tags.className, color: "var(--syntax-class)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.bool, color: "var(--syntax-boolean)" },
  { tag: tags.tagName, color: "var(--syntax-tag)" },
  { tag: tags.regexp, color: "var(--syntax-regex)" },
]);
