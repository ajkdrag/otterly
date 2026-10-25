import type { SearchPort } from "$lib/features/search/ports";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";
import type { SettingDefinition } from "$lib/features/settings";
import type {
  FindSpec,
  InFileMatch,
  NoteMatchDetail,
  NoteSearchHit,
  OmnibarQueryTarget,
  OmnibarItem,
  PlannedLinkSuggestion,
  SearchQuery,
  WikiSuggestion,
} from "$lib/shared/types/search";
import type {
  SearchNotesResult,
  WikiSuggestionsResult,
  OmnibarSearchResult,
  CrossVaultSearchResult,
  CrossVaultSearchGroup,
} from "$lib/features/search/types/search_service_result";
import { parse_search_query } from "$lib/features/search/domain/search_query_parser";
import { search_within_text } from "$lib/features/search/domain/search_within_text";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import { SETTINGS_REGISTRY } from "$lib/features/settings";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";
import type { Vault } from "$lib/shared/types/vault";
import type { VaultId } from "$lib/shared/types/ids";

const log = create_logger("search_service");
const WIKI_SUGGEST_LIMIT = 15;
const WIKI_SUGGEST_EXISTING_RESERVE = 10;
const WIKI_SUGGEST_PLANNED_RESERVE = 5;
const OMNIBAR_FILE_LIMIT = 8;
const OMNIBAR_CONTENT_LIMIT = 8;
type CrossVaultSettledSearch = PromiseSettledResult<NoteSearchHit[]>;

type CrossVaultAggregation = {
  groups: CrossVaultSearchGroup[];
  first_error: string | null;
};

function score_command(query: string, command: CommandDefinition): number {
  const label = command.label.toLowerCase();
  if (label.startsWith(query)) return 100;
  if (label.includes(query)) return 80;
  if (command.keywords.some((k) => k.toLowerCase().includes(query))) return 60;
  if (command.description.toLowerCase().includes(query)) return 40;
  return 0;
}

function score_setting(query: string, setting: SettingDefinition): number {
  const label = setting.label.toLowerCase();
  if (label.startsWith(query)) return 100;
  if (label.includes(query)) return 80;
  if (setting.keywords.some((k) => k.toLowerCase().includes(query))) return 60;
  if (setting.description.toLowerCase().includes(query)) return 40;
  if (setting.category.toLowerCase().includes(query)) return 20;
  return 0;
}

function normalize_match_query(value: string): string {
  return value.trim().toLowerCase();
}

function compute_text_match_score(candidate: string, query: string): number {
  const normalized_candidate = normalize_match_query(candidate);
  const normalized_query = normalize_match_query(query);

  if (!normalized_candidate || !normalized_query) return 0;
  if (normalized_candidate === normalized_query) return 100;
  if (normalized_candidate.startsWith(normalized_query)) return 90;

  const boundary_pattern = new RegExp(
    `(^|[\\s/_.-])${normalized_query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  if (boundary_pattern.test(normalized_candidate)) return 80;

  const substring_index = normalized_candidate.indexOf(normalized_query);
  if (substring_index >= 0) return Math.max(40, 70 - substring_index);

  let query_index = 0;
  let streak = 0;
  let score = 0;

  for (const candidate_char of normalized_candidate) {
    if (query_index >= normalized_query.length) break;
    if (candidate_char !== normalized_query[query_index]) {
      streak = 0;
      continue;
    }

    score += 8 + streak * 3;
    streak += 1;
    query_index += 1;
  }

  if (query_index !== normalized_query.length) return 0;
  return 30 + score;
}

function resolve_file_match_detail(
  note: NoteSearchHit["note"],
  query: string,
  target: OmnibarQueryTarget,
): NoteMatchDetail | null {
  const candidates: Array<{ detail: NoteMatchDetail; score: number }> = [
    {
      detail: "filename",
      score: compute_text_match_score(note.name, query) * 1.3,
    },
    {
      detail: "title",
      score: compute_text_match_score(note.title, query) * 1.15,
    },
    {
      detail: "path",
      score: compute_text_match_score(note.path, query),
    },
  ];

  if (target === "path") {
    return candidates.find((candidate) => candidate.detail === "path")?.score
      ? "path"
      : null;
  }

  if (target === "title") {
    if (candidates.find((candidate) => candidate.detail === "title")?.score) {
      return "title";
    }
    return candidates.find((candidate) => candidate.detail === "filename")
      ?.score
      ? "filename"
      : null;
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  return best?.score ? best.detail : null;
}

function with_note_match(
  hit: NoteSearchHit,
  match_detail: NoteMatchDetail,
): NoteSearchHit {
  return {
    ...hit,
    match_kind: match_detail === "content" ? "content" : "file",
    match_detail,
  };
}

function merge_wiki_suggestions(input: {
  existing_suggestions: WikiSuggestion[];
  planned_targets: PlannedLinkSuggestion[];
}): WikiSuggestion[] {
  const existing = input.existing_suggestions.filter(
    (item): item is Extract<WikiSuggestion, { kind: "existing" }> =>
      item.kind === "existing",
  );
  const existing_paths = new Set(
    existing.map((item) => String(item.note.path).toLowerCase()),
  );

  const planned = [...input.planned_targets]
    .sort((left, right) => {
      if (right.ref_count !== left.ref_count) {
        return right.ref_count - left.ref_count;
      }
      return left.target_path.localeCompare(right.target_path);
    })
    .filter((item) => !existing_paths.has(item.target_path.toLowerCase()))
    .map((item) => ({
      kind: "planned" as const,
      target_path: item.target_path,
      ref_count: item.ref_count,
      score: item.ref_count,
    }));

  if (existing.length === 0) {
    return planned.slice(0, WIKI_SUGGEST_LIMIT);
  }
  if (planned.length === 0) {
    return existing.slice(0, WIKI_SUGGEST_LIMIT);
  }

  const existing_reserved = Math.min(
    existing.length,
    WIKI_SUGGEST_EXISTING_RESERVE,
  );
  const planned_reserved = Math.min(
    planned.length,
    WIKI_SUGGEST_PLANNED_RESERVE,
  );

  let merged: WikiSuggestion[] = [
    ...existing.slice(0, existing_reserved),
    ...planned.slice(0, planned_reserved),
  ];
  let remaining = WIKI_SUGGEST_LIMIT - merged.length;

  if (remaining > 0) {
    const existing_extra = existing.slice(
      existing_reserved,
      existing_reserved + remaining,
    );
    merged = [...merged, ...existing_extra];
    remaining = WIKI_SUGGEST_LIMIT - merged.length;
  }

  if (remaining > 0) {
    const planned_extra = planned.slice(
      planned_reserved,
      planned_reserved + remaining,
    );
    merged = [...merged, ...planned_extra];
  }

  return merged.slice(0, WIKI_SUGGEST_LIMIT);
}

export class SearchService {
  private active_search_revision = 0;
  private active_wiki_suggest_revision = 0;
  private active_cross_vault_search_revision = 0;

  constructor(
    private readonly search_port: SearchPort,
    private readonly vault_store: VaultStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private start_operation(operation_key: string): void {
    this.op_store.start(operation_key, this.now_ms());
  }

  private succeed_operation(operation_key: string): void {
    this.op_store.succeed(operation_key);
  }

  private fail_operation(
    operation_key: string,
    log_message: string,
    error: unknown,
  ): string {
    const message = error_message(error);
    log.error(log_message, { error: message });
    this.op_store.fail(operation_key, message);
    return message;
  }

  private is_search_stale(revision: number): boolean {
    return revision !== this.active_search_revision;
  }

  private is_wiki_suggest_stale(revision: number): boolean {
    return revision !== this.active_wiki_suggest_revision;
  }

  private list_searchable_vaults(): Vault[] {
    const ordered_vaults: Vault[] = [];
    const seen_ids = new Set<string>();

    for (const vault of this.vault_store.recent_vaults) {
      if (vault.is_available === false) {
        continue;
      }
      const key = String(vault.id);
      if (seen_ids.has(key)) {
        continue;
      }
      seen_ids.add(key);
      ordered_vaults.push(vault);
    }

    const active_vault = this.vault_store.vault;
    if (active_vault && active_vault.is_available !== false) {
      const key = String(active_vault.id);
      if (!seen_ids.has(key)) {
        ordered_vaults.unshift(active_vault);
      }
    }

    return ordered_vaults;
  }

  private build_notes_query(query: string): SearchQuery {
    return {
      ...parse_search_query(query),
      domain: "notes",
    };
  }

  private async search_content_hits(
    vault_id: VaultId,
    query: SearchQuery,
    limit: number,
  ): Promise<NoteSearchHit[]> {
    const results = await this.search_port.search_notes(vault_id, query, limit);
    return results.map((hit) => with_note_match(hit, "content"));
  }

  private async search_file_hits(
    vault_id: VaultId,
    query: SearchQuery,
    limit: number,
  ): Promise<NoteSearchHit[]> {
    const results = await this.search_port.suggest_files(
      vault_id,
      query.text,
      limit,
    );

    return results.flatMap((hit) => {
      const match_detail = resolve_file_match_detail(
        hit.note,
        query.text,
        query.target,
      );
      if (!match_detail) {
        return [];
      }
      return [with_note_match(hit, match_detail)];
    });
  }

  private async search_blended_hits(
    vault_id: VaultId,
    query: SearchQuery,
  ): Promise<NoteSearchHit[]> {
    const [file_hits, content_hits] = await Promise.all([
      this.search_file_hits(
        vault_id,
        { ...query, target: "files" },
        OMNIBAR_FILE_LIMIT,
      ),
      this.search_content_hits(vault_id, query, OMNIBAR_CONTENT_LIMIT),
    ]);

    const file_hit_ids = new Set(file_hits.map((hit) => String(hit.note.id)));
    const unique_content_hits = content_hits.filter(
      (hit) => !file_hit_ids.has(String(hit.note.id)),
    );

    return [...file_hits, ...unique_content_hits];
  }

  private async search_note_hits_for_vault(
    vault_id: VaultId,
    raw_query: string,
  ): Promise<NoteSearchHit[]> {
    const query = this.build_notes_query(raw_query);

    switch (query.target) {
      case "files":
      case "path":
      case "title":
        return this.search_file_hits(vault_id, query, OMNIBAR_FILE_LIMIT);
      default:
        return this.search_blended_hits(vault_id, query);
    }
  }

  async search_notes(query: string): Promise<SearchNotesResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      this.op_store.reset("search.notes");
      return { status: "empty", results: [] };
    }

    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.op_store.reset("search.notes");
      return { status: "skipped", results: [] };
    }

    const revision = ++this.active_search_revision;
    this.start_operation("search.notes");

    try {
      const results = await this.search_content_hits(
        vault_id,
        this.build_notes_query(query),
        20,
      );
      if (this.is_search_stale(revision)) {
        return { status: "stale", results: [] };
      }

      this.succeed_operation("search.notes");
      return { status: "success", results };
    } catch (error) {
      if (this.is_search_stale(revision)) {
        return { status: "stale", results: [] };
      }

      const message = this.fail_operation(
        "search.notes",
        "Search failed",
        error,
      );
      return { status: "failed", error: message, results: [] };
    }
  }

  async suggest_wiki_links(query: string): Promise<WikiSuggestionsResult> {
    const revision = ++this.active_wiki_suggest_revision;
    const trimmed = query.trim();
    if (!trimmed) return { status: "empty", results: [] };

    const vault_id = this.get_active_vault_id();
    if (!vault_id) return { status: "skipped", results: [] };

    try {
      const [existing_suggestions, planned_targets] = await Promise.all([
        this.search_port.suggest_wiki_links(
          vault_id,
          trimmed,
          WIKI_SUGGEST_LIMIT,
        ),
        this.search_port.suggest_planned_links(
          vault_id,
          trimmed,
          WIKI_SUGGEST_LIMIT,
        ),
      ]);
      if (this.is_wiki_suggest_stale(revision)) {
        return { status: "stale", results: [] };
      }
      const results = merge_wiki_suggestions({
        existing_suggestions,
        planned_targets,
      });
      return { status: "success", results };
    } catch (error) {
      if (this.is_wiki_suggest_stale(revision)) {
        return { status: "stale", results: [] };
      }
      const message = error_message(error);
      log.error("Wiki suggest failed", { error: message });
      return { status: "failed", error: message, results: [] };
    }
  }

  private async search_planned_omnibar_items(
    query: string,
  ): Promise<OmnibarSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { domain: "planned", items: [] };
    }

    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { domain: "planned", items: [] };
    }

    try {
      const suggestions = await this.search_port.suggest_planned_links(
        vault_id,
        trimmed,
        50,
      );
      const items: OmnibarItem[] = suggestions.map((suggestion) => ({
        kind: "planned_note" as const,
        target_path: suggestion.target_path,
        ref_count: suggestion.ref_count,
        score: suggestion.ref_count,
      }));
      return { domain: "planned", items };
    } catch (error) {
      const message = error_message(error);
      log.error("Planned-note search failed", { error: message });
      return { domain: "planned", items: [], status: "failed" };
    }
  }

  async search_notes_all_vaults(
    query: string,
  ): Promise<CrossVaultSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      this.op_store.reset("search.notes.all_vaults");
      return { status: "empty", groups: [] };
    }

    const searchable_vaults = this.list_searchable_vaults();
    if (searchable_vaults.length === 0) {
      this.op_store.reset("search.notes.all_vaults");
      return { status: "skipped", groups: [] };
    }

    const revision = ++this.active_cross_vault_search_revision;
    this.start_operation("search.notes.all_vaults");

    try {
      const settled = await this.run_cross_vault_search(
        searchable_vaults,
        query,
      );
      if (this.is_cross_vault_search_stale(revision)) {
        return { status: "stale", groups: [] };
      }

      const { groups, first_error } = this.aggregate_cross_vault_search_results(
        searchable_vaults,
        settled,
      );

      if (groups.length === 0 && first_error) {
        this.op_store.fail("search.notes.all_vaults", first_error);
        return { status: "failed", error: first_error, groups: [] };
      }

      this.succeed_operation("search.notes.all_vaults");
      return { status: "success", groups };
    } catch (error) {
      if (this.is_cross_vault_search_stale(revision)) {
        return { status: "stale", groups: [] };
      }

      const message = this.fail_operation(
        "search.notes.all_vaults",
        "Cross-vault search failed",
        error,
      );
      return { status: "failed", error: message, groups: [] };
    }
  }

  private is_cross_vault_search_stale(revision: number): boolean {
    return revision !== this.active_cross_vault_search_revision;
  }

  private async run_cross_vault_search(
    searchable_vaults: Vault[],
    query: string,
  ): Promise<CrossVaultSettledSearch[]> {
    return await Promise.allSettled(
      searchable_vaults.map((vault) =>
        this.search_note_hits_for_vault(vault.id, query),
      ),
    );
  }

  private aggregate_cross_vault_search_results(
    searchable_vaults: Vault[],
    settled: CrossVaultSettledSearch[],
  ): CrossVaultAggregation {
    const groups: CrossVaultSearchGroup[] = [];
    let first_error: string | null = null;

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const vault = searchable_vaults[index];
      if (!vault || !result) {
        continue;
      }

      if (result.status === "rejected") {
        const message = error_message(result.reason);
        if (!first_error) {
          first_error = message;
        }
        log.error("Cross-vault search failed", {
          vault_name: vault.name,
          error: message,
        });
        continue;
      }

      if (result.value.length === 0) {
        continue;
      }

      groups.push({
        vault_id: vault.id,
        vault_name: vault.name,
        vault_path: vault.path,
        vault_note_count: vault.note_count ?? null,
        vault_last_opened_at: vault.last_opened_at ?? null,
        vault_is_available: vault.is_available !== false,
        results: result.value,
      });
    }

    return {
      groups,
      first_error,
    };
  }

  search_commands(query: string): OmnibarItem[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return COMMANDS_REGISTRY.map((command) => ({
        kind: "command" as const,
        command,
        score: 0,
      }));
    }

    return COMMANDS_REGISTRY.map((command) => ({
      kind: "command" as const,
      command,
      score: score_command(q, command),
    }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  search_settings(query: string): OmnibarItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return SETTINGS_REGISTRY.map((setting) => ({
      kind: "setting" as const,
      setting,
      score: score_setting(q, setting),
    }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  search_within_file(text: string, spec: FindSpec): InFileMatch[] {
    return search_within_text(text, spec);
  }

  async search_omnibar(raw_query: string): Promise<OmnibarSearchResult> {
    const parsed = parse_search_query(raw_query);

    if (parsed.domain === "commands") {
      const items = [
        ...this.search_commands(parsed.text),
        ...this.search_settings(parsed.text),
      ];
      return { domain: "commands", items };
    }

    if (parsed.domain === "planned") {
      return this.search_planned_omnibar_items(parsed.text);
    }

    const result = await this.search_omnibar_notes(raw_query);
    const items: OmnibarItem[] = result.results.map((r) => ({
      kind: "note" as const,
      note: r.note,
      score: r.score,
      snippet: r.snippet,
      match_kind: r.match_kind,
      match_detail: r.match_detail,
    }));
    return { domain: "notes", items, status: result.status };
  }

  private async search_omnibar_notes(
    query: string,
  ): Promise<SearchNotesResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      this.op_store.reset("search.notes");
      return { status: "empty", results: [] };
    }

    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.op_store.reset("search.notes");
      return { status: "skipped", results: [] };
    }

    const revision = ++this.active_search_revision;
    this.start_operation("search.notes");

    try {
      const results = await this.search_note_hits_for_vault(vault_id, query);
      if (this.is_search_stale(revision)) {
        return { status: "stale", results: [] };
      }

      this.succeed_operation("search.notes");
      return { status: "success", results };
    } catch (error) {
      if (this.is_search_stale(revision)) {
        return { status: "stale", results: [] };
      }

      const message = this.fail_operation(
        "search.notes",
        "Omnibar search failed",
        error,
      );
      return { status: "failed", error: message, results: [] };
    }
  }

  reset_search_notes_operation() {
    this.op_store.reset("search.notes");
    this.op_store.reset("search.notes.all_vaults");
  }

  async resolve_note_link(
    source_path: string,
    raw_target: string,
  ): Promise<string | null> {
    return this.search_port.resolve_note_link(source_path, raw_target);
  }
}
