export type { DocumentFileType } from "$lib/features/document/types/document";

import type { DocumentFileType } from "$lib/features/document/types/document";

const DOCUMENT_TYPE_MAP: Record<string, DocumentFileType> = {
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".csv": "csv",
  ".tsv": "csv",
  ".py": "code",
  ".r": "code",
  ".rs": "code",
  ".ts": "code",
  ".js": "code",
  ".json": "code",
  ".yaml": "code",
  ".yml": "code",
  ".toml": "code",
  ".sh": "code",
  ".bash": "code",
  ".txt": "text",
  ".log": "text",
  ".ini": "text",
};

export function detect_file_type(filename: string): DocumentFileType | null {
  const dot_index = filename.lastIndexOf(".");
  if (dot_index === -1) return null;
  const ext = filename.slice(dot_index).toLowerCase();
  return DOCUMENT_TYPE_MAP[ext] ?? null;
}
