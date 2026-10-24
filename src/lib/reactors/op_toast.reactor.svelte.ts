import { toast } from "svelte-sonner";
import type { OpStore } from "$lib/app";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("op_toast_reactor");

type ToastCommand =
  | { kind: "success"; message: string }
  | {
      kind: "error";
      message: string;
      error: string;
      // Left out when the service already logged the failure.
      log_label?: string;
      // A toast with the same id replaces the old one instead of stacking.
      toast_id?: string;
    };

const THEME_FILE_TOAST_ID = "theme.file_load";

export function resolve_op_toast_commands(input: {
  key: string;
  previous_status: string;
  current_status: string;
  error: string | null;
  message: string | null;
}): ToastCommand[] {
  const { key, previous_status, current_status, error, message } = input;
  if (current_status === previous_status) {
    return [];
  }

  if (key === "clipboard.write") {
    if (current_status === "success") {
      return [{ kind: "success", message: "Copied to clipboard" }];
    }
    if (current_status === "error") {
      return [
        {
          kind: "error",
          message: "Failed to copy to clipboard",
          log_label: "Clipboard write failed",
          error: error ?? "unknown error",
        },
      ];
    }
  }

  if (key === "links.repair") {
    if (current_status === "success") {
      return [
        {
          kind: "success",
          message: message ?? "Link repair complete",
        },
      ];
    }
    if (current_status === "error") {
      return [
        {
          kind: "error",
          message: "Some links could not be repaired",
          log_label: "Link repair failed",
          error: error ?? "unknown error",
        },
      ];
    }
  }

  // No success toast: every save of the theme file would show one. The error
  // is already "<first error> (+N more)".
  if (key === "theme.file_load" && current_status === "error") {
    return [
      {
        kind: "error",
        message: `Theme file: ${error ?? "unknown error"}`,
        error: error ?? "unknown error",
        toast_id: THEME_FILE_TOAST_ID,
      },
    ];
  }

  return [];
}

export function create_op_toast_reactor(op_store: OpStore): () => void {
  let last_clipboard_status = op_store.get("clipboard.write").status;
  let last_link_repair_status = op_store.get("links.repair").status;
  let last_theme_file_status = op_store.get("theme.file_load").status;

  const apply_commands = (commands: ToastCommand[]) => {
    for (const command of commands) {
      if (command.kind === "success") {
        toast.success(command.message);
        continue;
      }

      if (command.log_label) {
        log.error(command.log_label, { error: command.error });
      }
      toast.error(
        command.message,
        command.toast_id === undefined ? {} : { id: command.toast_id },
      );
    }
  };

  return $effect.root(() => {
    $effect(() => {
      const clipboard = op_store.get("clipboard.write");
      const clipboard_commands = resolve_op_toast_commands({
        key: "clipboard.write",
        previous_status: last_clipboard_status,
        current_status: clipboard.status,
        error: clipboard.error,
        message: clipboard.message,
      });
      last_clipboard_status = clipboard.status;
      apply_commands(clipboard_commands);

      const link_repair = op_store.get("links.repair");
      const link_repair_commands = resolve_op_toast_commands({
        key: "links.repair",
        previous_status: last_link_repair_status,
        current_status: link_repair.status,
        error: link_repair.error,
        message: link_repair.message,
      });
      last_link_repair_status = link_repair.status;
      apply_commands(link_repair_commands);

      const theme_file = op_store.get("theme.file_load");
      const theme_file_commands = resolve_op_toast_commands({
        key: "theme.file_load",
        previous_status: last_theme_file_status,
        current_status: theme_file.status,
        error: theme_file.error,
        message: theme_file.message,
      });
      last_theme_file_status = theme_file.status;
      apply_commands(theme_file_commands);
    });
  });
}
