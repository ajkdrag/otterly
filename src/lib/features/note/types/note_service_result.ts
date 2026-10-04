import type { NotePath } from "$lib/shared/types/ids";

export type NoteOpenResult =
  | {
      status: "opened";
      selected_folder_path: string;
    }
  | {
      status: "skipped";
    }
  | {
      status: "not_found";
    }
  | {
      // A binary or huge file. The editor cannot show it.
      status: "not_text";
    }
  | {
      status: "failed";
      error: string;
    };

export type NoteDeleteResult =
  | {
      status: "deleted";
    }
  | {
      status: "skipped";
    }
  | {
      status: "failed";
      error: string;
    };

export type NoteRenameResult =
  | {
      status: "renamed";
    }
  | {
      status: "conflict";
    }
  | {
      status: "skipped";
    }
  | {
      status: "failed";
      error: string;
    };

export type NoteSaveResult =
  | {
      status: "saved";
      saved_path: NotePath;
      saved_mtime_ms: number;
    }
  | {
      status: "conflict";
    }
  | {
      status: "skipped";
    }
  | {
      status: "failed";
      error: string;
    };
