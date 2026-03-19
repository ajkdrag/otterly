import type { EditorStore } from "$lib/features/editor";
import type { SessionService } from "$lib/features/session";
import type { TabStore } from "$lib/features/tab";
import type { VaultId } from "$lib/shared/types/ids";
import type { VaultStore } from "$lib/features/vault";

const SESSION_PERSIST_DELAY_MS = 1000;

export function resolve_saved_session_signature(input: {
  active_vault_id: VaultId | null;
  saving_vault_id: VaultId | null;
  build_session_signature: () => string;
}): string | null {
  if (!input.saving_vault_id) {
    return null;
  }
  if (input.active_vault_id !== input.saving_vault_id) {
    return null;
  }
  return input.build_session_signature();
}

export function create_session_persist_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  vault_store: VaultStore,
  session_service: SessionService,
): () => void {
  let active_vault_id: VaultId | null = null;
  let last_saved_serialized: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function build_session_signature(): string {
    return JSON.stringify({
      tabs: tab_store.tabs.map((tab) => ({
        path: tab.note_path,
        title: tab.title,
        pinned: tab.is_pinned,
        dirty: tab.is_dirty,
        snapshot: tab_store.get_snapshot(tab.id),
        cached_note: tab_store.get_cached_note(tab.id),
      })),
      active: tab_store.active_tab_id,
      open_note: editor_store.open_note,
      cursor: editor_store.cursor,
    });
  }

  function schedule_persist(): void {
    const serialized = build_session_signature();
    if (serialized === last_saved_serialized) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      const saving_vault_id = active_vault_id;
      if (!saving_vault_id) {
        return;
      }

      void session_service.save_latest_session().then(() => {
        last_saved_serialized = resolve_saved_session_signature({
          active_vault_id,
          saving_vault_id,
          build_session_signature,
        });
      });
    }, SESSION_PERSIST_DELAY_MS);
  }

  function clear_pending_timer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function flush_pending(): void {
    clear_pending_timer();

    const saving_vault_id = active_vault_id;
    if (!saving_vault_id) {
      return;
    }

    void session_service.save_latest_session().then(() => {
      last_saved_serialized = resolve_saved_session_signature({
        active_vault_id,
        saving_vault_id,
        build_session_signature,
      });
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      void editor_store.open_note;
      void editor_store.cursor;
      void tab_store.tabs;
      void tab_store.active_tab_id;
      void tab_store.session_metadata_revision;

      if (vault_id !== active_vault_id) {
        clear_pending_timer();
        active_vault_id = vault_id;
        last_saved_serialized = null;
      }

      if (!vault_id) {
        return;
      }

      schedule_persist();
    });

    return () => {
      flush_pending();
    };
  });
}
