import type { ShellPort } from "$lib/features/shell/ports";
import type { VaultStore } from "$lib/features/vault";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("shell_service");

export class ShellService {
  constructor(
    private readonly shell_port: ShellPort,
    private readonly vault_store: VaultStore,
  ) {}

  async open_url(url: string): Promise<void> {
    try {
      await this.shell_port.open_url(url);
    } catch (error) {
      log.error("Open URL failed", { error: error_message(error), url });
    }
  }

  // Returns false on failure so the action can tell the user.
  async reveal_in_file_manager(path: string): Promise<boolean> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return false;
    try {
      await this.shell_port.reveal_in_file_manager(vault_id, path);
      return true;
    } catch (error) {
      log.error("Reveal in file manager failed", {
        error: error_message(error),
        path,
      });
      return false;
    }
  }

  async open_in_default_app(path: string): Promise<boolean> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return false;
    try {
      await this.shell_port.open_in_default_app(vault_id, path);
      return true;
    } catch (error) {
      log.error("Open in default app failed", {
        error: error_message(error),
        path,
      });
      return false;
    }
  }
}
