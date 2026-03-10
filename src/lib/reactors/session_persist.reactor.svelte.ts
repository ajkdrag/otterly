import type { EditorStore } from "$lib/features/editor";
import type { SessionService } from "$lib/features/session";
import type { TabStore } from "$lib/features/tab";
import type { VaultId } from "$lib/shared/types/ids";
import type { VaultStore } from "$lib/features/vault";

const SESSION_PERSIST_DELAY_MS = 1000;

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
      void session_service.save_latest_session().then(() => {
        last_saved_serialized = serialized;
      });
    }, SESSION_PERSIST_DELAY_MS);
  }

  function flush_pending(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (!active_vault_id) {
      return;
    }

    void session_service.save_latest_session().then(() => {
      last_saved_serialized = null;
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const _open_note = editor_store.open_note;
      const _cursor = editor_store.cursor;
      const _tabs = tab_store.tabs;
      const _active = tab_store.active_tab_id;

      if (vault_id !== active_vault_id) {
        flush_pending();
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
