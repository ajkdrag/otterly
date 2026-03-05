import type { NoteMeta } from "$lib/shared/types/note";

export type SearchCommandDefinition = {
  id:
    | "create_new_note"
    | "change_vault"
    | "open_settings"
    | "open_hotkeys"
    | "sync_index"
    | "reindex_vault"
    | "show_vault_dashboard"
    | "git_version_history"
    | "git_create_checkpoint"
    | "git_init_repo"
    | "toggle_links_panel"
    | "toggle_outline_panel"
    | "check_for_updates";
  label: string;
  description: string;
  keywords: string[];
  icon:
    | "file-plus"
    | "folder-open"
    | "settings"
    | "keyboard"
    | "git-branch"
    | "history"
    | "bookmark"
    | "link"
    | "list-tree"
    | "refresh-cw";
};

export type SearchSettingDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
  keywords: string[];
};

export type SearchScope = "all" | "path" | "title" | "content";
export type SearchDomain = "notes" | "commands" | "planned";
export type OmnibarScope = "current_vault" | "all_vaults";

export type SearchQuery = {
  raw: string;
  text: string;
  scope: SearchScope;
  domain: SearchDomain;
};

export type NoteSearchHit = {
  note: NoteMeta;
  score: number;
  snippet?: string | undefined;
};

export type PlannedLinkSuggestion = {
  target_path: string;
  ref_count: number;
};

export type OrphanLink = PlannedLinkSuggestion;

export type ExistingWikiSuggestion = {
  kind: "existing";
  note: NoteMeta;
  score: number;
};

export type PlannedWikiSuggestion = {
  kind: "planned";
  target_path: string;
  ref_count: number;
  score: number;
};

export type WikiSuggestion = ExistingWikiSuggestion | PlannedWikiSuggestion;

export type InFileMatch = {
  line: number;
  column: number;
  length: number;
  context: string;
};

type IndexProgressMeta = {
  mode?: "smart" | "dumb";
  run_id?: number;
  queued_work_items?: number;
};

export type IndexProgressEvent =
  | ({ status: "started"; vault_id: string; total: number } & IndexProgressMeta)
  | ({
      status: "progress";
      vault_id: string;
      indexed: number;
      total: number;
    } & IndexProgressMeta)
  | ({
      status: "completed";
      vault_id: string;
      indexed: number;
      elapsed_ms: number;
    } & IndexProgressMeta)
  | ({ status: "failed"; vault_id: string; error: string } & IndexProgressMeta);

export type OmnibarItem =
  | {
      kind: "note";
      note: NoteMeta;
      score: number;
      snippet?: string | undefined;
    }
  | {
      kind: "cross_vault_note";
      note: NoteMeta;
      vault_id: string;
      vault_name: string;
      vault_note_count?: number | null;
      vault_last_opened_at?: number | null;
      vault_is_available?: boolean;
      score: number;
      snippet?: string | undefined;
    }
  | {
      kind: "planned_note";
      target_path: string;
      ref_count: number;
      score: number;
    }
  | { kind: "command"; command: SearchCommandDefinition; score: number }
  | { kind: "setting"; setting: SearchSettingDefinition; score: number }
  | { kind: "recent_note"; note: NoteMeta };
