import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";
import type { TabService } from "$lib/features/tab";
import type { NoteService } from "$lib/features/note";
import type { WatcherService } from "$lib/features/watcher";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { VaultFsEvent } from "$lib/features/watcher";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { create_logger } from "$lib/shared/utils/logger";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";
import type { NotePath } from "$lib/shared/types/ids";
import {
  active_note_conflict_callbacks,
  type ConflictToastManager,
} from "$lib/reactors/conflict_toast";

const log = create_logger("watcher_reactor");
const TREE_REFRESH_DEBOUNCE_MS = 300;

/** Dirty state of a non-active tab, or null if no background tab exists for the path. */
export type BackgroundTabInfo = { is_dirty: boolean } | null;

/**
 * Discriminated union returned by `resolve_watcher_event_decision`.
 * Each variant maps to a specific handler action in the watcher reactor.
 */
export type WatcherEventDecision =
  | { action: "reload"; note_path: NotePath }
  | { action: "conflict_toast"; note_path: NotePath }
  | { action: "invalidate_tab_cache"; note_path: NotePath }
  | { action: "background_conflict_toast"; note_path: NotePath }
  | { action: "refresh_tree" }
  | { action: "clear_and_refresh"; note_path: NotePath }
  | { action: "remove_background_tab_and_refresh"; note_path: NotePath }
  | { action: "log_only"; path: string }
  | { action: "ignore" };

/**
 * Pure decision function: maps a filesystem event + current editor/tab state
 * to an action the reactor should take.
 */
export function resolve_watcher_event_decision(
  event: VaultFsEvent,
  current_vault_id: string | null,
  open_note_path: string | null,
  is_dirty: boolean,
  find_background_tab: (path: string) => BackgroundTabInfo,
): WatcherEventDecision {
  if (event.vault_id !== current_vault_id) {
    return { action: "ignore" };
  }

  switch (event.type) {
    case "note_changed_externally": {
      const np = event.note_path as NotePath;
      if (
        open_note_path &&
        paths_equal_ignore_case(event.note_path, open_note_path)
      ) {
        return is_dirty
          ? { action: "conflict_toast", note_path: np }
          : { action: "reload", note_path: np };
      }

      const bg = find_background_tab(event.note_path);
      if (bg) {
        return bg.is_dirty
          ? { action: "background_conflict_toast", note_path: np }
          : { action: "invalidate_tab_cache", note_path: np };
      }

      return { action: "ignore" };
    }
    case "note_added":
      return { action: "refresh_tree" };
    case "note_removed": {
      const rp = event.note_path as NotePath;
      if (
        open_note_path &&
        paths_equal_ignore_case(event.note_path, open_note_path)
      ) {
        return { action: "clear_and_refresh", note_path: rp };
      }
      if (find_background_tab(event.note_path)) {
        return { action: "remove_background_tab_and_refresh", note_path: rp };
      }
      return { action: "refresh_tree" };
    }
    case "asset_changed":
      return { action: "log_only", path: event.asset_path };
  }
}

/**
 * Reactor that starts/stops the filesystem watcher when the vault changes,
 * and dispatches incoming events through `resolve_watcher_event_decision`.
 *
 * Self-writes are suppressed before reaching the decision function.
 * File tree refreshes are debounced (300ms) to batch rapid add/remove events.
 */
export function create_watcher_reactor(
  vault_store: VaultStore,
  editor_store: EditorStore,
  tab_store: TabStore,
  tab_service: TabService,
  note_service: NoteService,
  watcher_service: WatcherService,
  action_registry: ActionRegistry,
  conflict_toast_manager: ConflictToastManager,
): () => void {
  return $effect.root(() => {
    let tree_refresh_timer: ReturnType<typeof setTimeout> | null = null;

    function debounced_tree_refresh() {
      if (tree_refresh_timer !== null) {
        clearTimeout(tree_refresh_timer);
      }
      tree_refresh_timer = setTimeout(() => {
        tree_refresh_timer = null;
        void action_registry.execute(ACTION_IDS.folder_refresh_tree);
      }, TREE_REFRESH_DEBOUNCE_MS);
    }

    function find_background_tab(path: string): BackgroundTabInfo {
      const tab = tab_store.find_tab_by_path(path as NotePath);
      if (!tab || tab.id === tab_store.active_tab_id) return null;
      return { is_dirty: tab.is_dirty };
    }

    function handle_event(event: VaultFsEvent) {
      if (
        event.type === "note_changed_externally" &&
        watcher_service.consume_suppressed(event.note_path)
      ) {
        log.info("Suppressed self-triggered event", {
          path: event.note_path,
        });
        return;
      }

      const decision = resolve_watcher_event_decision(
        event,
        vault_store.vault?.id ?? null,
        editor_store.open_note?.meta.path ?? null,
        editor_store.open_note?.is_dirty ?? false,
        find_background_tab,
      );

      switch (decision.action) {
        case "reload":
          void note_service.open_note(decision.note_path, false, {
            force_reload: true,
          });
          break;
        case "conflict_toast": {
          const note_id = editor_store.open_note?.meta.id;
          if (!note_id) break;
          conflict_toast_manager.show(
            decision.note_path,
            active_note_conflict_callbacks(
              decision.note_path,
              note_id,
              note_service,
            ),
          );
          break;
        }
        case "invalidate_tab_cache":
          tab_service.invalidate_cache(decision.note_path);
          break;
        case "background_conflict_toast": {
          const bg_tab = tab_store.find_tab_by_path(decision.note_path);
          if (!bg_tab) break;
          conflict_toast_manager.show(decision.note_path, {
            on_reload: () => {
              tab_service.invalidate_cache(decision.note_path);
              tab_service.sync_dirty_state(bg_tab.id, false);
            },
            on_keep: () => {},
          });
          break;
        }
        case "refresh_tree":
          debounced_tree_refresh();
          break;
        case "clear_and_refresh":
          note_service.clear_open_note();
          tab_service.remove_tab(decision.note_path);
          debounced_tree_refresh();
          break;
        case "remove_background_tab_and_refresh":
          tab_service.remove_tab(decision.note_path);
          debounced_tree_refresh();
          break;
        case "log_only":
          log.info("Asset changed externally", { path: decision.path });
          break;
        case "ignore":
          break;
      }
    }

    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) {
        void watcher_service.stop();
        return;
      }

      void watcher_service.start(vault.id);
      watcher_service.subscribe(handle_event);

      return () => {
        if (tree_refresh_timer !== null) {
          clearTimeout(tree_refresh_timer);
          tree_refresh_timer = null;
        }
        conflict_toast_manager.dismiss_all();
      };
    });
  });
}
