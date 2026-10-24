// Profiles can star notes in the same vault. To save our change without
// undoing theirs, start from the list on disk, drop what we unstarred since
// `before`, and append what we starred.
export function apply_starred_paths_change(
  on_disk: string[],
  before: string[],
  after: string[],
): string[] {
  const unstarred = before.filter((path) => !after.includes(path));
  const starred = after.filter((path) => !before.includes(path));
  const kept = on_disk.filter((path) => !unstarred.includes(path));
  return [...kept, ...starred.filter((path) => !kept.includes(path))];
}
