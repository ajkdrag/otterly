/** Filesystem event emitted by the Rust watcher backend via Tauri event subscription. */
export type VaultFsEvent =
  | {
      type: "note_changed_externally";
      vault_id: string;
      note_path: string;
    }
  | {
      type: "note_added";
      vault_id: string;
      note_path: string;
    }
  | {
      type: "note_removed";
      vault_id: string;
      note_path: string;
    }
  | {
      type: "asset_changed";
      vault_id: string;
      asset_path: string;
    };
