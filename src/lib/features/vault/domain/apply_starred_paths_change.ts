// Profiles can star notes in the same vault. To save our change without
// undoing theirs, start from the list on disk, drop what we unstarred since
// `before`, and append what we starred.
//
// NotesStore trims stars and compares them ignoring case, so the list on disk
// is matched the same way. `before` and `after` come from that store, so they
// are compared as they are. That keeps a rename that only changes case an
// unstar plus a star, and the star takes the new spelling.
export function apply_starred_paths_change(
  on_disk: string[],
  before: string[],
  after: string[],
): string[] {
  const unstarred_keys = new Set(
    before.filter((path) => !after.includes(path)).map(star_key),
  );
  const starred = after.filter((path) => !before.includes(path));
  const kept = on_disk.filter((path) => !unstarred_keys.has(star_key(path)));

  const merged: string[] = [];
  const seen_keys = new Set<string>();
  for (const path of [...kept, ...starred]) {
    const key = star_key(path);
    if (!key || seen_keys.has(key)) continue;
    seen_keys.add(key);
    merged.push(path.trim());
  }
  return merged;
}

function star_key(path: string): string {
  return path.trim().toLowerCase();
}
