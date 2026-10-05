// A file opened outside any vault, in its own window.
export type DocumentFile = {
  path: string;
  name: string;
  text: string;
  mtime_ms: number;
};

export type DocumentSaveResult =
  | { status: "saved" }
  | { status: "skipped" }
  // The file changed on disk since we read it.
  | { status: "conflict" }
  | { status: "failed"; error: string };
