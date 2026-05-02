pub const APP_DIR: &str = ".leapgrownotes";
pub const GIT_DIR: &str = ".git";

pub const EXCLUDED_FOLDERS: &[&str] = &[APP_DIR, GIT_DIR];

pub fn is_excluded_folder(name: &str) -> bool {
    EXCLUDED_FOLDERS.contains(&name)
}
