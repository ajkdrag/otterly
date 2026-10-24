import { toast } from "svelte-sonner";
import type { OpStore } from "$lib/app";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("op_toast_reactor");

type ToastCommand =
  | { kind: "success"; message: string }
  | { kind: "dismiss"; toast_id: string }
  | {
      kind: "error";
      message: string;
      error: string;
      // Left out when the service already logged the failure.
      log_label?: string;
      // A toast with the same id replaces the old one instead of stacking.
      toast_id?: string;
    };

const TOASTED_OP_KEYS = ["clipboard.write", "links.repair", "theme.file_load"];

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
    const reason = error ?? "unknown error";
    return [
      {
        kind: "error",
        message: `Theme file: ${reason}`,
        error: reason,
        toast_id: key,
      },
    ];
  }

  // A fixed file clears its error toast, so it does not read as "still
  // broken". Every load goes through "pending" first, so the previous status
  // is never "error" here. Dismissing a toast that is not up does nothing.
  if (key === "theme.file_load" && current_status === "success") {
    return [{ kind: "dismiss", toast_id: key }];
  }

  return [];
}

export function create_op_toast_reactor(op_store: OpStore): () => void {
  const last_status = new Map(
    TOASTED_OP_KEYS.map((key) => [key, op_store.get(key).status]),
  );

  const apply_commands = (commands: ToastCommand[]) => {
    for (const command of commands) {
      if (command.kind === "success") {
        toast.success(command.message);
        continue;
      }
      if (command.kind === "dismiss") {
        toast.dismiss(command.toast_id);
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
      for (const key of TOASTED_OP_KEYS) {
        const op = op_store.get(key);
        const commands = resolve_op_toast_commands({
          key,
          previous_status: last_status.get(key) ?? "idle",
          current_status: op.status,
          error: op.error,
          message: op.message,
        });
        last_status.set(key, op.status);
        apply_commands(commands);
      }
    });
  });
}
