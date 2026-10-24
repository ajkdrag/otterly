// The same rule as is_valid_profile_id in src-tauri/src/features/profile.
// Rust has the final say. This only lets the dialog explain a bad name early.
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export type ProfileNameResult = { id: string } | { error: string };

// The id is also the name people see, so we turn what they type into an id
// instead of rejecting it: "Work Stuff" becomes "work-stuff".
export function normalize_profile_name(input: string): ProfileNameResult {
  const id = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (id === "") {
    return { error: "Enter a name for the profile" };
  }
  if (id.length > 32) {
    return { error: "Use at most 32 characters" };
  }
  if (!PROFILE_ID_PATTERN.test(id)) {
    return {
      error: "Use letters, digits and dashes, starting with a letter or digit",
    };
  }
  return { id };
}
