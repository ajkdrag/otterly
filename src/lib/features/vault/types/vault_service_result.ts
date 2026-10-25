import type { VaultPath } from "$lib/shared/types/ids";
import type { EditorSettings } from "$lib/shared/types/editor_settings";

export type VaultInitializeResult =
  | {
      status: "ready";
      has_vault: boolean;
      editor_settings: EditorSettings | null;
    }
  | {
      status: "error";
      error: string;
    };

export type VaultChoosePathResult =
  | {
      status: "selected";
      path: VaultPath;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "failed";
      error: string;
    };

export type VaultOpenResult =
  | {
      status: "opened";
      editor_settings: EditorSettings;
      opened_from_vault_switch: boolean;
    }
  | {
      status: "stale";
    }
  | {
      // Another window has the vault and is in front now.
      status: "in_other_window";
    }
  | {
      status: "failed";
      error: string;
    };
