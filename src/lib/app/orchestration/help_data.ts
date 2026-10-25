export type EditorShortcut = {
  label: string;
  key: string;
};

export type MarkdownSyntaxEntry = {
  label: string;
  syntax: string;
};

export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  { label: "Bold", key: "CmdOrCtrl+B" },
  { label: "Italic", key: "CmdOrCtrl+I" },
  { label: "Inline Code (selected text)", key: "CmdOrCtrl+E" },
  { label: "Edit Link", key: "Alt+Enter" },
  { label: "Strikethrough", key: "CmdOrCtrl+Alt+X" },
  { label: "Heading 1", key: "CmdOrCtrl+Alt+1" },
  { label: "Heading 2", key: "CmdOrCtrl+Alt+2" },
  { label: "Heading 3", key: "CmdOrCtrl+Alt+3" },
  { label: "Code Block", key: "CmdOrCtrl+Alt+C" },
  { label: "Ordered List", key: "CmdOrCtrl+Alt+7" },
  { label: "Bullet List", key: "CmdOrCtrl+Alt+8" },
  { label: "Undo", key: "CmdOrCtrl+Z" },
  { label: "Redo", key: "CmdOrCtrl+Shift+Z" },
  { label: "Indent", key: "Tab" },
  { label: "Outdent", key: "Shift+Tab" },
  { label: "Line Break", key: "Shift+Enter" },
];

export const MARKDOWN_SYNTAX: MarkdownSyntaxEntry[] = [
  { label: "Heading 1", syntax: "# Heading" },
  { label: "Heading 2", syntax: "## Heading" },
  { label: "Heading 3", syntax: "### Heading" },
  { label: "Bold", syntax: "**bold**" },
  { label: "Italic", syntax: "*italic*" },
  { label: "Strikethrough", syntax: "~~text~~" },
  { label: "Bullet List", syntax: "- item" },
  { label: "Ordered List", syntax: "1. item" },
  { label: "Task List", syntax: "- [ ] task" },
  { label: "Blockquote", syntax: "> quote" },
  { label: "Inline Code", syntax: "`code`" },
  { label: "Code Block", syntax: "```lang\ncode\n```" },
  { label: "Link", syntax: "[text](url)" },
  { label: "Image", syntax: "![alt](url)" },
  { label: "Wiki Link", syntax: "[[note]]" },
  { label: "Tag", syntax: "#tag" },
  { label: "Horizontal Rule", syntax: "---" },
  { label: "Table", syntax: "| A | B |\n|---|---|\n| 1 | 2 |" },
];
