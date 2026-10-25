import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultId } from "$lib/shared/types/ids";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Each vault window has its own watcher, and Rust sends its events to that
// window only. The global listen() from @tauri-apps/api/event would get every
// window's events, so we listen on this window.
function subscribe_vault_fs_events(
  callback: (event: VaultFsEvent) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void getCurrentWebviewWindow()
    .listen<VaultFsEvent>("vault_fs_event", (event) => {
      if (is_disposed) {
        return;
      }
      callback(event.payload);
    })
    .then((fn_ref) => {
      if (is_disposed) {
        fn_ref();
        return;
      }
      unlisten_fn = fn_ref;
    });

  return () => {
    is_disposed = true;
    unlisten_fn?.();
    unlisten_fn = null;
  };
}

export function create_watcher_tauri_adapter(): WatcherPort {
  return {
    async watch_vault(vault_id: VaultId): Promise<void> {
      await tauri_invoke<undefined>("watch_vault", {
        vaultId: vault_id,
      });
    },
    async unwatch_vault(): Promise<void> {
      await tauri_invoke<undefined>("unwatch_vault");
    },
    subscribe_fs_events(callback: (event: VaultFsEvent) => void): () => void {
      return subscribe_vault_fs_events(callback);
    },
  };
}
