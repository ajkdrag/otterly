import { markdownLanguage } from "@codemirror/lang-markdown";
type SyntaxNode = ReturnType<typeof markdownLanguage.parser.parse>["topNode"];

export type LegacyMarkdownCleanupOptions = {
  compact_simple_lists: boolean;
};

export type LegacyMarkdownCleanupCounts = {
  blank_lines_removed: number;
  list_separators_removed: number;
  standalone_breaks_removed: number;
};

export type LegacyMarkdownCleanupResult = {
  markdown: string;
  counts: LegacyMarkdownCleanupCounts;
  line_map: number[];
};

type SourceLine = {
  text: string;
  ending: string;
  from: number;
  source_index: number;
};

type SimpleListItem = {
  from_line: number;
  to_line: number;
  depth: number;
  marker_prefix: string;
};

const DEFAULT_OPTIONS: LegacyMarkdownCleanupOptions = {
  compact_simple_lists: true,
};

export function clean_legacy_markdown(
  source: string,
  options: LegacyMarkdownCleanupOptions = DEFAULT_OPTIONS,
): LegacyMarkdownCleanupResult {
  if (!source)
    return { markdown: source, counts: zero_counts(), line_map: [0] };

  const lines = split_source_lines(source);
  const tree = markdownLanguage.parser.parse(source);
  const protected_lines = find_protected_lines(tree, lines);
  const compactable_separators = options.compact_simple_lists
    ? find_simple_list_separators(tree, lines, protected_lines)
    : new Set<number>();
  let standalone_breaks_removed = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line &&
      !protected_lines.has(index) &&
      /^\s*<br\s*\/?>\s*$/i.test(line.text)
    ) {
      line.text = "";
      standalone_breaks_removed += 1;
    }
  }

  const compacted: SourceLine[] = [];
  let blank_lines_removed = 0;
  let list_separators_removed = 0;
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (!line || !is_blank_line(line) || protected_lines.has(index)) {
      if (line) compacted.push(line);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < lines.length &&
      is_blank_line(lines[end]) &&
      !protected_lines.has(end)
    ) {
      end += 1;
    }
    const has_content_before = index > 0 && !is_blank_line(lines[index - 1]);
    const has_content_after = end < lines.length && !is_blank_line(lines[end]);
    const run = lines.slice(index, end);
    const can_remove_list_separator =
      options.compact_simple_lists &&
      has_content_before &&
      has_content_after &&
      run.every((_, offset) => compactable_separators.has(index + offset));

    if (can_remove_list_separator) {
      list_separators_removed += run.length;
      blank_lines_removed += run.length;
    } else if (has_content_before && has_content_after && run.length > 1) {
      const first_blank_line = run[0];
      if (first_blank_line) compacted.push(first_blank_line);
      blank_lines_removed += run.length - 1;
    } else {
      compacted.push(...run);
    }
    index = end;
  }

  const line_map = build_line_map(lines.length, compacted);
  return {
    markdown: compacted.map((line) => line.text + line.ending).join(""),
    line_map,
    counts: {
      blank_lines_removed,
      list_separators_removed,
      standalone_breaks_removed,
    },
  };
}

export function map_legacy_cleanup_position(
  source: string,
  cleaned_source: string,
  line_map: number[],
  position: number,
) {
  const source_lines = normalize_line_endings(source).split("\n");
  const cleaned_lines = normalize_line_endings(cleaned_source).split("\n");
  const source_starts = line_starts(source_lines);
  const cleaned_starts = line_starts(cleaned_lines);
  const bounded_position = Math.max(
    0,
    Math.min(normalize_line_endings(source).length, position),
  );
  const source_line = line_index_at_starts(source_starts, bounded_position);
  const column = bounded_position - (source_starts[source_line] ?? 0);
  const cleaned_line = Math.min(
    cleaned_lines.length - 1,
    line_map[source_line] ?? source_line,
  );
  const cleaned_line_text = cleaned_lines[cleaned_line] ?? "";
  return (
    (cleaned_starts[cleaned_line] ?? 0) +
    Math.min(column, cleaned_line_text.length)
  );
}

function zero_counts(): LegacyMarkdownCleanupCounts {
  return {
    blank_lines_removed: 0,
    list_separators_removed: 0,
    standalone_breaks_removed: 0,
  };
}

function normalize_line_endings(source: string) {
  return source.replace(/\r\n|\r/g, "\n");
}

function line_starts(lines: string[]) {
  const starts: number[] = [];
  let position = 0;
  for (const line of lines) {
    starts.push(position);
    position += line.length + 1;
  }
  return starts;
}

function line_index_at_starts(starts: number[], position: number) {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((starts[middle] ?? Number.POSITIVE_INFINITY) <= position)
      low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function split_source_lines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n" && source[index] !== "\r") continue;
    const is_crlf = source[index] === "\r" && source[index + 1] === "\n";
    const ending = is_crlf ? "\r\n" : (source[index] as string);
    lines.push({
      text: source.slice(from, index),
      ending,
      from,
      source_index: lines.length,
    });
    if (is_crlf) index += 1;
    from = index + 1;
  }
  lines.push({
    text: source.slice(from),
    ending: "",
    from,
    source_index: lines.length,
  });
  return lines;
}

function build_line_map(source_line_count: number, output: SourceLine[]) {
  const source_to_output = new Map<number, number>();
  output.forEach((line, output_index) => {
    source_to_output.set(line.source_index, output_index);
  });
  const line_map: number[] = [];
  let previous_output = 0;
  for (
    let source_index = 0;
    source_index < source_line_count;
    source_index += 1
  ) {
    const exact = source_to_output.get(source_index);
    if (exact !== undefined) previous_output = exact;
    line_map.push(previous_output);
  }
  return line_map;
}

function find_protected_lines(
  tree: ReturnType<typeof markdownLanguage.parser.parse>,
  lines: SourceLine[],
) {
  const protected_lines = new Set<number>();
  const first_line = lines[0]?.text.replace(/^\uFEFF/, "").trim();
  if (first_line === "---") {
    let closing_line = -1;
    for (let index = 1; index < lines.length; index += 1) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[index]?.text ?? "")) {
        closing_line = index;
        break;
      }
    }
    const last_frontmatter_line =
      closing_line < 0 ? lines.length - 1 : closing_line;
    for (let index = 0; index <= last_frontmatter_line; index += 1)
      protected_lines.add(index);
  }
  protect_literal_html_lines(lines, protected_lines);

  tree.iterate({
    enter(node) {
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        protect_node_lines(protected_lines, lines, node.from, node.to);
        return;
      }
      if (node.name !== "HTMLBlock") return;
      const first = line_index_at(lines, node.from);
      const last = line_index_at(lines, Math.max(node.from, node.to - 1));
      const block_text = lines
        .slice(first, last + 1)
        .map((line) => line.text)
        .join("\n");
      const multiline_literal =
        first !== last || /<!--|<(?:pre|script|style)\b/i.test(block_text);
      if (multiline_literal) {
        for (let index = first; index <= last; index += 1)
          protected_lines.add(index);
      }
    },
  });
  tree.iterate({
    enter(node) {
      if (node.name !== "Blockquote" && node.name !== "ListItem") return;
      const first = line_index_at(lines, node.from);
      const last = line_index_at(lines, Math.max(node.from, node.to - 1));
      for (let index = first; index <= last; index += 1) {
        if (/^\s*<br\s*\/?>\s*$/i.test(lines[index]?.text ?? ""))
          protected_lines.add(index);
      }
    },
  });
  return protected_lines;
}

function protect_literal_html_lines(
  lines: SourceLine[],
  protected_lines: Set<number>,
) {
  let in_comment = false;
  let open_literal_tag: "pre" | "script" | "style" | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]?.text ?? "";
    const was_in_literal = in_comment || open_literal_tag !== null;
    if (was_in_literal) protected_lines.add(index);
    if (in_comment) {
      if (text.includes("-->")) in_comment = false;
      continue;
    }
    if (open_literal_tag) {
      if (new RegExp(`</${open_literal_tag}\\s*>`, "i").test(text))
        open_literal_tag = null;
      continue;
    }
    const comment_start = text.indexOf("<!--");
    if (comment_start >= 0 && !text.slice(comment_start).includes("-->")) {
      in_comment = true;
      protected_lines.add(index);
    }
    const literal_tag = /<(pre|script|style)\b[^>]*>/i.exec(text)?.[1];
    if (literal_tag && !new RegExp(`</${literal_tag}\\s*>`, "i").test(text)) {
      open_literal_tag = literal_tag.toLowerCase() as
        | "pre"
        | "script"
        | "style";
      protected_lines.add(index);
    }
  }
}

function protect_node_lines(
  protected_lines: Set<number>,
  lines: SourceLine[],
  from: number,
  to: number,
) {
  const first = line_index_at(lines, from);
  const last = line_index_at(lines, Math.max(from, to - 1));
  for (let index = first; index <= last; index += 1) protected_lines.add(index);
}

function find_simple_list_separators(
  tree: ReturnType<typeof markdownLanguage.parser.parse>,
  lines: SourceLine[],
  protected_lines: Set<number>,
) {
  const separators = new Set<number>();
  tree.iterate({
    enter(list) {
      if (list.name !== "BulletList" && list.name !== "OrderedList") return;
      const items: SimpleListItem[] = [];
      for (let child = list.node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "ListItem") continue;
        const from_line = line_index_at(lines, child.from);
        const to_line = line_index_at(
          lines,
          Math.max(child.from, child.to - 1),
        );
        const line = lines[from_line];
        const marker_prefix = line ? list_marker_prefix(line.text) : "";
        if (
          from_line !== to_line ||
          !marker_prefix ||
          has_nested_block(child)
        ) {
          items.push({ from_line, to_line, depth: -1, marker_prefix: "" });
          continue;
        }
        items.push({
          from_line,
          to_line,
          depth: count_list_item_ancestors(child),
          marker_prefix,
        });
      }

      for (let index = 0; index + 1 < items.length; index += 1) {
        const before = items[index];
        const after = items[index + 1];
        if (
          !before ||
          !after ||
          before.depth < 0 ||
          after.depth < 0 ||
          before.depth !== after.depth ||
          before.marker_prefix !== after.marker_prefix
        ) {
          continue;
        }
        let is_separator = true;
        for (
          let line_index = before.to_line + 1;
          line_index < after.from_line;
          line_index += 1
        ) {
          if (
            protected_lines.has(line_index) ||
            !is_blank_container_line(lines[line_index]?.text ?? "")
          ) {
            is_separator = false;
            break;
          }
          separators.add(line_index);
        }
        if (!is_separator) {
          for (
            let line_index = before.to_line + 1;
            line_index < after.from_line;
            line_index += 1
          ) {
            separators.delete(line_index);
          }
        }
      }
    },
  });
  return separators;
}

function list_marker_prefix(text: string) {
  const quote_prefix = /^(?:[ \t]*>[ \t]*)*/.exec(text)?.[0] ?? "";
  const rest = text.slice(quote_prefix.length);
  const match = /^([ \t]*)([-+*]|\d+[.)])(?:[ \t]+|$)/.exec(rest);
  if (!match) return "";
  const marker = match[2] ?? "";
  const marker_style = /^\d/.test(marker)
    ? `number${marker.slice(-1)}`
    : marker;
  return `${quote_prefix}|${match[1] ?? ""}|${marker_style}`;
}

function is_blank_container_line(text: string) {
  const quote_prefix = /^(?:[ \t]*>[ \t]*)*/.exec(text)?.[0] ?? "";
  return text.slice(quote_prefix.length).trim() === "";
}

function has_nested_block(item: SyntaxNode): boolean {
  for (let child = item.firstChild; child; child = child.nextSibling) {
    if (
      child.name === "Blockquote" ||
      child.name === "BulletList" ||
      child.name === "OrderedList" ||
      child.name === "CodeBlock" ||
      child.name === "FencedCode" ||
      child.name === "HTMLBlock"
    ) {
      return true;
    }
    if (has_nested_block(child)) return true;
  }
  return false;
}

function count_list_item_ancestors(node: SyntaxNode) {
  let depth = 1;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === "ListItem") depth += 1;
  }
  return depth;
}

function line_index_at(lines: SourceLine[], position: number) {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((lines[middle]?.from ?? Number.POSITIVE_INFINITY) <= position)
      low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function is_blank_line(line: SourceLine | undefined) {
  return line?.text.trim() === "";
}
