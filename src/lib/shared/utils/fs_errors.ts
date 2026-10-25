// Backend errors are Rust io::Error text, which comes from the OS: English on
// macOS and Linux, the user's language on Windows ("The system cannot find the
// file specified." on an English one). Rust appends "(os error N)" everywhere,
// so the code is the part to match:
//
//   2   ENOENT, or ERROR_FILE_NOT_FOUND on Windows
//   3   ERROR_PATH_NOT_FOUND on Windows (a missing folder in the path)
//
// Matching only "no such file" missed every Windows not-found error, so a
// note deleted outside the app broke opening it and restoring the session.
const MISSING_FILE_OS_ERRORS = ["(os error 2)", "(os error 3)"];
const MISSING_FILE_OS_PHRASES = ["no such file", "could not be found"];

// Only the OS saying a file or folder is missing.
export function is_missing_file_os_error(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    MISSING_FILE_OS_ERRORS.some((code) => normalized.includes(code)) ||
    MISSING_FILE_OS_PHRASES.some((phrase) => normalized.includes(phrase))
  );
}

// Also our own "... not found" errors, such as "note not found".
export function is_missing_file_error(message: string): boolean {
  return (
    is_missing_file_os_error(message) ||
    message.toLowerCase().includes("not found")
  );
}
