import type { ClipboardPort } from "$lib/features/clipboard/ports";
import type { OpStore } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("clipboard_service");

export class ClipboardService {
  constructor(
    private readonly clipboard_port: ClipboardPort,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  private start_write_operation(): void {
    this.op_store.start("clipboard.write", this.now_ms());
  }

  private succeed_write_operation(): void {
    this.op_store.succeed("clipboard.write");
  }

  private fail_write_operation(error: unknown): void {
    const message = error_message(error);
    log.error("Copy markdown failed", { error: message });
    this.op_store.fail("clipboard.write", message);
  }

  async copy_text(text: string): Promise<void> {
    try {
      await this.clipboard_port.write_text(text);
    } catch (error) {
      const message = error_message(error);
      log.error("Copy text failed", { error: message });
      throw error;
    }
  }

  async copy_markdown(markdown: string): Promise<void> {
    this.start_write_operation();

    try {
      await this.clipboard_port.write_text(markdown);
      this.succeed_write_operation();
    } catch (error) {
      this.fail_write_operation(error);
    }
  }
}
