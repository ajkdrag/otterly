import type { NoteMeta } from "$lib/shared/types/note";
import type { NotePath } from "$lib/shared/types/ids";
import { as_note_path } from "$lib/shared/types/ids";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";

export function note_path_exists(
  notes: NoteMeta[],
  note_path: NotePath,
  exclude_path?: NotePath,
): boolean {
  // A bare name is a note. A name with an extension is that exact file.
  const leaf = note_path.split("/").at(-1) ?? note_path;
  const normalized = leaf.includes(".")
    ? note_path
    : as_note_path(`${note_path}.md`);
  return notes.some(
    (note) =>
      paths_equal_ignore_case(note.path, normalized) &&
      (!exclude_path || !paths_equal_ignore_case(note.path, exclude_path)),
  );
}
