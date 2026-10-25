import { is_draft_note_path } from "$lib/shared/utils/draft_note_path";

export function parent_folder_path(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

export function note_name_from_path(path: string): string {
  const last_slash = path.lastIndexOf("/");
  const filename = last_slash >= 0 ? path.slice(last_slash + 1) : path;
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

export function paths_equal_ignore_case(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// The order of vault find results: ignoring case, then exact, so two paths
// that differ only in case still have a fixed order.
export function compare_paths(left: string, right: string): number {
  const left_lower = left.toLowerCase();
  const right_lower = right.toLowerCase();
  if (left_lower !== right_lower) return left_lower < right_lower ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

// Markdown files open in the rich editor. Every other file opens as text.
// A draft has no file name yet ("draft:<ms>:<title>"), but is always a note.
export function is_markdown_path(path: string): boolean {
  return is_draft_note_path(path) || /\.(md|markdown)$/i.test(path);
}
