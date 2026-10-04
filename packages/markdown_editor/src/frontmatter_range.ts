import { StateField, type EditorState, type Text } from "@codemirror/state";

export const frontmatter_range = StateField.define<number>({
  create: (state) => find_frontmatter_end(state.doc),
  update(end, transaction) {
    if (!transaction.docChanged) return end;
    let touches_metadata = false;
    transaction.changes.iterChangedRanges((from, _to, from_new, to_new) => {
      if (from <= end || from <= transaction.startState.doc.line(1).to) {
        touches_metadata = true;
      } else if (end === 0 && has_frontmatter_opening(transaction.newDoc)) {
        for (const line of transaction.newDoc.iterLines(
          transaction.newDoc.lineAt(from_new).number,
          transaction.newDoc.lineAt(to_new).number + 1,
        )) {
          if (is_frontmatter_closing(line)) touches_metadata = true;
        }
      }
    });
    return touches_metadata ? find_frontmatter_end(transaction.newDoc) : end;
  },
});

export function get_frontmatter_end(state: EditorState): number {
  return state.field(frontmatter_range, false) ?? 0;
}

function find_frontmatter_end(document: Text): number {
  if (!has_frontmatter_opening(document)) return 0;
  let line_number = 2;
  for (const line of document.iterLines(2)) {
    if (is_frontmatter_closing(line)) return document.line(line_number).to;
    line_number++;
  }
  return 0;
}

function has_frontmatter_opening(document: Text): boolean {
  return /^\uFEFF?---[ \t]*$/.test(document.line(1).text);
}

function is_frontmatter_closing(line: string): boolean {
  return /^(?:---|\.\.\.)[ \t]*$/.test(line);
}
