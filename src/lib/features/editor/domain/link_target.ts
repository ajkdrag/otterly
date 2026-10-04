export function is_external_url(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// A note link keeps the note rules: no extension or .md. Any other extension
// is a file in the vault, like a pdf or a spreadsheet next to the note.
type LinkTarget = { kind: "note" | "file"; path: string };

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function parse_internal_href(href: string): LinkTarget | null {
  if (href.trim() === "" || is_external_url(href)) return null;

  let path = href;
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  const query = path.indexOf("?");
  if (query >= 0) path = path.slice(0, query);

  try {
    path = decodeURIComponent(path.trim());
  } catch {
    path = path.trim();
  }
  if (path === "") return null;

  const slash = path.lastIndexOf("/");
  const leaf = slash >= 0 ? path.slice(slash + 1) : path;
  if (leaf === "") return null;

  const is_note = !leaf.includes(".") || leaf.toLowerCase().endsWith(".md");
  if (is_note) return { kind: "note", path };
  // mailto: and friends are not vault files, so the click does nothing.
  if (URL_SCHEME.test(href)) return null;
  return { kind: "file", path };
}
