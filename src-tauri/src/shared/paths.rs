use std::path::Path;

// canonicalize gives Windows verbatim paths (\\?\C:\...). Show the usual form.
pub fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}
