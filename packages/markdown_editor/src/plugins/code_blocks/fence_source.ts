import {
  ChangeSet,
  Text,
  type ChangeSpec,
  type EditorState,
} from "@codemirror/state";
import type { SourceWindow } from "../../core/surface.js";

export type CodeBlockSource = {
  from: number;
  to: number;
  opening_from: number;
  opening_to: number;
  closing_from: number | null;
  closing_to: number | null;
  content_from: number;
  content_to: number;
  content: Text;
  content_lines: readonly number[];
  continuation_prefix: string;
  language: string;
  language_from: number;
  language_to: number;
  fence: string;
  needs_opening_newline: boolean;
  needs_closing_newline: boolean;
};

export function read_code_block(
  state: { doc: Text },
  from: number,
  to: number,
): CodeBlockSource | null {
  const opening = state.doc.lineAt(from);
  if (to < opening.to) return null;
  const match =
    /^([ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+)?[ \t]*)(`{3,}|~{3,})([^\n]*)$/.exec(
      opening.text,
    );
  if (!match?.[2]) return null;
  const prefix = match[1] ?? "";
  const continuation_prefix = prefix.replace(
    /(?:[-+*]|\d+[.)])[ \t]+/,
    (marker) => " ".repeat(marker.length),
  );
  const fence = match[2];
  const opening_from = opening.from + prefix.length;
  const opening_to = opening_from + fence.length;
  const info = match[3] ?? "";
  const language = /^\s*(\S*)/.exec(info);
  const language_from = opening_to + info.length - info.trimStart().length;
  const language_text = language?.[1] ?? "";
  const last = state.doc.lineAt(to);
  const closing_prefix = code_container_prefix_length(
    last.text,
    continuation_prefix,
  );
  const closing_match =
    last.number > opening.number
      ? /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*$/.exec(
          last.text.slice(closing_prefix),
        )
      : null;
  const closing_fence = closing_match?.[2];
  const has_closing =
    !!closing_fence &&
    closing_fence[0] === fence[0] &&
    closing_fence.length >= fence.length;
  const closing_from = has_closing
    ? last.from + closing_prefix + (closing_match?.[1]?.length ?? 0)
    : null;
  const content_lines: number[] = [];
  const content_text: string[] = [];
  const last_content_line = has_closing ? last.number - 1 : last.number;
  for (
    let number = opening.number + 1;
    continuation_prefix && number <= last_content_line;
    number++
  ) {
    const line = state.doc.line(number);
    const stripped = code_container_prefix_length(
      line.text,
      continuation_prefix,
    );
    content_lines.push(line.from + stripped);
    content_text.push(line.text.slice(stripped));
  }
  const empty_position = continuation_prefix
    ? has_closing
      ? last.from
      : opening.to
    : Math.min(opening.to + 1, state.doc.length);
  if (!content_lines.length) {
    content_lines.push(empty_position);
    content_text.push("");
  }
  const content = continuation_prefix
    ? Text.of(content_text)
    : state.doc.slice(
        content_lines[0] ?? empty_position,
        has_closing
          ? Math.max(content_lines[0] ?? empty_position, last.from - 1)
          : to,
      );
  return {
    from: opening.from,
    to,
    opening_from,
    opening_to,
    closing_from,
    closing_to:
      closing_from === null
        ? null
        : closing_from + (closing_fence?.length ?? 0),
    content_from: content_lines[0] ?? empty_position,
    content_to: has_closing
      ? Math.max(content_lines[0] ?? empty_position, last.from - 1)
      : to,
    content,
    content_lines,
    continuation_prefix,
    language: language_text,
    language_from,
    language_to: language_from + language_text.length,
    fence,
    needs_opening_newline: opening.to === state.doc.length,
    needs_closing_newline: has_closing && last.number === opening.number + 1,
  };
}

function code_position_to_source(
  block: CodeBlockSource,
  position: number,
): number {
  if (!block.continuation_prefix) return block.content_from + position;
  const line = block.content.lineAt(position);
  return (
    (block.content_lines[line.number - 1] ?? block.content_from) +
    position -
    line.from
  );
}

function source_position_to_code(
  block: CodeBlockSource,
  position: number,
): number {
  if (!block.continuation_prefix)
    return Math.max(
      0,
      Math.min(block.content.length, position - block.content_from),
    );
  let low = 0;
  let high = block.content_lines.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if ((block.content_lines[middle] ?? block.content_to) <= position)
      low = middle;
    else high = middle;
  }
  const line = block.content.line(low + 1);
  return Math.max(
    line.from,
    Math.min(
      line.to,
      line.from + position - (block.content_lines[low] ?? block.content_from),
    ),
  );
}

function change_code_content(
  state: EditorState,
  block: CodeBlockSource,
  content_changes: ChangeSet,
): ChangeSet {
  const changes: ChangeSpec[] = [];
  const next_content = content_changes.apply(block.content);
  content_changes.iterChanges((from, to, _from_new, _to_new, inserted) => {
    changes.push({
      from: code_position_to_source(block, from),
      to: code_position_to_source(block, to),
      insert: block.continuation_prefix
        ? inserted.toString().replace(/\n/g, "\n" + block.continuation_prefix)
        : inserted,
    });
  });
  if (
    next_content.length &&
    (block.needs_opening_newline || block.needs_closing_newline)
  ) {
    changes.unshift({
      from: block.content_from,
      insert:
        (block.needs_opening_newline ? "\n" : "") + block.continuation_prefix,
    });
  }
  if (block.needs_closing_newline && next_content.length)
    changes.push({ from: block.content_to, insert: "\n" });
  let fence_length = block.fence.length;
  content_changes.iterChangedRanges((_from, _to, from, to) => {
    const last_line = next_content.lineAt(to).number;
    for (
      let number = next_content.lineAt(from).number;
      number <= last_line;
      number++
    ) {
      const candidate = /^ {0,3}(`+|~+)[ \t]*$/.exec(
        next_content.line(number).text,
      )?.[1];
      if (candidate && candidate[0] === block.fence[0])
        fence_length = Math.max(fence_length, candidate.length + 1);
    }
  });
  if (fence_length > block.fence.length) {
    const fence = (block.fence[0] ?? "`").repeat(fence_length);
    changes.push({
      from: block.opening_from,
      to: block.opening_to,
      insert: fence,
    });
    if (
      block.closing_from !== null &&
      block.closing_to !== null &&
      block.closing_to - block.closing_from < fence_length
    )
      changes.push({
        from: block.closing_from,
        to: block.closing_to,
        insert: fence,
      });
  }
  return state.changes(changes);
}

export function change_code_language(
  state: EditorState,
  block: CodeBlockSource,
  language: string,
): ChangeSet {
  if (/\s|`/.test(language))
    throw new RangeError("Code language must be one info-string token");
  return state.changes({
    from: block.language_from,
    to: block.language_to,
    insert: language,
  });
}

export function change_code_to_paragraph(
  state: EditorState,
  block: CodeBlockSource,
): { changes: ChangeSet; cursor: number } {
  const content = block.content.toString();
  // A paragraph must display the old code literally. Escaping punctuation also
  // prevents headings, links, entities and autolinks from changing its meaning.
  const escaped = content
    .replace(/[!-/:-@[-`{-~]/g, "\\$&")
    .replace(/^[ \t]+|[ \t]+$/g, (whitespace) =>
      whitespace.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"),
    );
  const opening_prefix = state.sliceDoc(block.from, block.opening_from);
  const prefix = block.continuation_prefix;
  const previous_line =
    block.from > 0 ? state.doc.lineAt(block.from - 1).text : "";
  const next_line =
    block.to < state.doc.length ? state.doc.lineAt(block.to + 1).text : "";
  const previous_has_text =
    previous_line
      .slice(code_container_prefix_length(previous_line, prefix))
      .trim().length > 0;
  const next_has_text =
    next_line.slice(code_container_prefix_length(next_line, prefix)).trim()
      .length > 0;
  const before = previous_has_text ? prefix + "\n" : "";
  const after = next_has_text ? "\n" + prefix : "";
  return {
    changes: state.changes({
      from: block.from,
      to: block.to,
      insert: before + opening_prefix + escaped + after,
    }),
    cursor: block.from + before.length + opening_prefix.length,
  };
}

// The remove button: delete the whole block and leave exactly one separator
// between its neighbours. A list marker on the opening line stays as an empty item.
export function remove_code_block(
  state: EditorState,
  block: CodeBlockSource,
): { changes: ChangeSet; cursor: number } {
  const { doc } = state;
  const prefix = block.continuation_prefix;
  const opening_prefix = state.sliceDoc(block.from, block.opening_from);
  const first = doc.lineAt(block.from);
  const last = doc.lineAt(block.to);
  const line_text = (number: number): string => {
    const text = doc.line(number).text;
    return text.slice(code_container_prefix_length(text, prefix));
  };
  const blank = (number: number): boolean => line_text(number).trim() === "";
  const has_prev = first.number > 1;
  // A final "\n" leaves an empty last line that is not a real neighbour.
  const has_next =
    last.number < doc.lines &&
    !(last.number + 1 === doc.lines && doc.line(doc.lines).length === 0);
  const prev_blank = has_prev && blank(first.number - 1);
  const next_blank = has_next && blank(last.number + 1);

  if (opening_prefix !== prefix) {
    let to = block.to;
    if (next_blank && last.number + 2 <= doc.lines) {
      const after = doc.line(last.number + 2);
      if (after.text.startsWith(prefix) && line_text(after.number).trim())
        to = doc.line(last.number + 1).to;
    }
    return {
      changes: state.changes({
        from: block.from,
        to,
        insert: opening_prefix,
      }),
      cursor: block.from + opening_prefix.length,
    };
  }
  if (!has_prev && !has_next)
    return {
      changes: state.changes({ from: block.from, to: block.to }),
      cursor: block.from,
    };
  if (!has_next) {
    const previous = doc.line(first.number - 1);
    const from = !prev_blank
      ? previous.to
      : previous.number > 1
        ? doc.line(previous.number - 1).to
        : previous.from;
    return {
      changes: state.changes({ from, to: block.to }),
      cursor: from,
    };
  }
  if (has_prev && !prev_blank && !next_blank) {
    const separator = prefix.trimEnd();
    return {
      changes: state.changes({
        from: block.from,
        to: block.to,
        insert: separator,
      }),
      cursor: block.from + separator.length,
    };
  }
  const through =
    next_blank && (!has_prev || prev_blank) ? last.number + 1 : last.number;
  const to = Math.min(doc.line(through).to + 1, doc.length);
  const changes = state.changes({ from: block.from, to });
  const landing = changes.apply(doc).lineAt(block.from).text;
  return {
    changes,
    cursor: block.from + code_container_prefix_length(landing, prefix),
  };
}

function code_container_prefix_length(text: string, prefix: string): number {
  let position = 0;
  for (const expected of prefix) {
    if (text[position] === expected) position++;
    else if (expected !== " " && expected !== "\t") break;
  }
  return position;
}

// The code body as a source window. Inner newlines get the container prefix
// back, and a body line that looks like a closing fence grows the fence.
export function code_window(block: CodeBlockSource): SourceWindow {
  return {
    text: block.content,
    to_outer: (position) => code_position_to_source(block, position),
    to_inner: (position) => source_position_to_code(block, position),
    outer_changes: (state, changes) =>
      change_code_content(state, block, changes),
    contains: (position) =>
      position >= block.content_from && position <= block.content_to,
  };
}
