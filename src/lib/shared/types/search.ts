import type { NoteMeta } from "$lib/shared/types/note";
import type { EditorSettings } from "$lib/shared/types/editor_settings";

export type SearchCommandDefinition = {
  id:
    | "create_new_note"
    | "save_note"
    | "change_vault"
    | "open_settings"
    | "open_theme_settings"
    | "open_hotkeys"
    | "toggle_sidebar"
    | "find_in_note"
    | "open_help"
    | "next_tab"
    | "previous_tab"
    | "last_used_tab"
    | "reopen_closed_tab"
    | "sync_index"
    | "reindex_vault"
    | "show_vault_dashboard"
    | "git_version_history"
    | "git_create_checkpoint"
    | "git_init_repo"
    | "toggle_links_panel"
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
    | "refresh-cw";
};

export type SearchSettingDefinition = {
  key: keyof EditorSettings;
  label: string;
  description: string;
  category: string;
  keywords: string[];
};

export type SearchScope = "all" | "path" | "title" | "content";
export type SearchDomain = "notes" | "commands" | "planned";
export type OmnibarScope = "current_vault" | "all_vaults";
export type OmnibarQueryTarget = "all" | "files" | "path" | "title" | "content";
export type NoteMatchKind = "file" | "content";
export type NoteMatchDetail = "filename" | "title" | "path" | "content";

export type SearchQuery = {
  raw: string;
  text: string;
  scope: SearchScope;
  domain: SearchDomain;
  target: OmnibarQueryTarget;
};

export type NoteSearchHit = {
  note: NoteMeta;
  score: number;
  snippet?: string | undefined;
  match_kind?: NoteMatchKind | undefined;
  match_detail?: NoteMatchDetail | undefined;
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
      match_kind?: NoteMatchKind | undefined;
      match_detail?: NoteMatchDetail | undefined;
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
      match_kind?: NoteMatchKind | undefined;
      match_detail?: NoteMatchDetail | undefined;
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
