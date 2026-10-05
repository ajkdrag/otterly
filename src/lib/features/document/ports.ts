import type { DocumentFile } from "$lib/features/document/types/document";

// Both calls act on the file of the calling window. The backend knows which
// file that is, so there is no path argument.
export interface DocumentPort {
  read_document: () => Promise<DocumentFile>;
  // Pass expected_mtime_ms to refuse the write when the file changed on disk.
  write_document: (
    text: string,
    expected_mtime_ms: number | null,
  ) => Promise<number>;
}
