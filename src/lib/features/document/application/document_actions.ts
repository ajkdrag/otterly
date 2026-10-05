import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry, UIStore } from "$lib/app";
import type { DocumentService } from "$lib/features/document/application/document_service";
import type { DocumentSaveResult } from "$lib/features/document/types/document";
import type { ShellService } from "$lib/features/shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "svelte-sonner";

export type DocumentActionInput = {
  registry: ActionRegistry;
  stores: { ui: UIStore };
  services: { document: DocumentService; shell: ShellService };
};

// A document window registers the vault app's action ids where the meaning
// is the same (save, source mode, close), so your hotkeys work in both.
export function register_document_actions(input: DocumentActionInput) {
  const { registry, stores, services } = input;

  registry.register({
    id: ACTION_IDS.document_editor_mount,
    label: "Editor Mount",
    execute: async (root: unknown) => {
      await services.document.mount_editor(root as HTMLElement);
    },
  });

  registry.register({
    id: ACTION_IDS.document_editor_unmount,
    label: "Editor Unmount",
    execute: () => {
      services.document.unmount_editor();
    },
  });

  registry.register({
    id: ACTION_IDS.note_request_save,
    label: "Save",
    execute: async () => {
      report_save(await services.document.save());
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_source_mode,
    label: "Toggle Source Mode",
    execute: () => {
      services.document.toggle_source_mode();
    },
  });

  registry.register({
    id: ACTION_IDS.shell_open_url,
    label: "Open URL",
    execute: async (url: unknown) => {
      await services.shell.open_url(String(url));
    },
  });

  registry.register({
    id: ACTION_IDS.document_reload,
    label: "Reload From Disk",
    execute: async () => {
      await services.document.reload_from_disk();
    },
  });

  registry.register({
    id: ACTION_IDS.document_overwrite,
    label: "Keep My Version",
    execute: async () => {
      report_save(await services.document.save(true));
    },
  });

  // Cmd+W closes the window, through the same unsaved-edits check as the
  // window's close button.
  registry.register({
    id: ACTION_IDS.tab_close,
    label: "Close Window",
    execute: async () => {
      await getCurrentWindow().close();
    },
  });

  registry.register({
    id: ACTION_IDS.document_request_close,
    label: "Close Window",
    execute: () => {
      stores.ui.document_close_confirm = { open: true, is_closing: false };
    },
  });

  registry.register({
    id: ACTION_IDS.document_confirm_close,
    label: "Close Window",
    execute: async (save: unknown) => {
      if (save === true) {
        const result = await services.document.save();
        if (result.status !== "saved") {
          report_save(result);
          return;
        }
      }
      stores.ui.document_close_confirm = { open: false, is_closing: true };
      await getCurrentWindow().destroy();
    },
  });

  registry.register({
    id: ACTION_IDS.document_cancel_close,
    label: "Cancel",
    execute: () => {
      stores.ui.document_close_confirm = { open: false, is_closing: false };
    },
  });
}

function report_save(result: DocumentSaveResult) {
  if (result.status === "failed")
    toast.error("Could not save the file", { description: result.error });
  // A conflict shows as a banner with its own choices.
}
