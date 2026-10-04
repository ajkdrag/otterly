import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { EditorEngine } from "../types/editor_diagnostics";
import { error_message } from "$lib/shared/utils/error_message";
import { toast } from "svelte-sonner";

export function register_editor_actions({
  registry,
  stores,
  services,
}: ActionRegistrationInput) {
  async function switch_engine(engine: EditorEngine) {
    try {
      await services.editor.switch_engine(engine);
    } catch (error) {
      toast.error(`Could not switch editor: ${error_message(error)}`);
    }
  }
  registry.register({
    id: ACTION_IDS.editor_use_source,
    label: "Use source-preserving editor",
    when: () => !!stores.editor.open_note && !stores.editor.engine_switching,
    execute: () => switch_engine("source"),
  });
  registry.register({
    id: ACTION_IDS.editor_use_milkdown,
    label: "Use Milkdown editor",
    when: () => !!stores.editor.open_note && !stores.editor.engine_switching,
    execute: () => switch_engine("milkdown"),
  });
  registry.register({
    id: ACTION_IDS.editor_toggle_diagnostics,
    label: "Toggle editor diagnostics",
    execute: () => {
      services.editor.set_diagnostics_open(!stores.editor.diagnostics_open);
    },
  });
  registry.register({
    id: ACTION_IDS.editor_refresh_diagnostics,
    label: "Refresh editor diagnostics",
    execute: () => {
      services.editor.refresh_diagnostics();
    },
  });
  registry.register({
    id: ACTION_IDS.editor_clear_diagnostics,
    label: "Clear editor input trace",
    execute: () => {
      services.editor.clear_diagnostics();
    },
  });
  registry.register({
    id: ACTION_IDS.editor_copy_diagnostics,
    label: "Copy editor diagnostics",
    execute: async () => {
      services.editor.refresh_diagnostics();
      if (!stores.editor.diagnostics) return;
      try {
        await services.clipboard.copy_text(
          JSON.stringify(stores.editor.diagnostics, null, 2),
        );
        toast.success("Editor diagnostics copied");
      } catch (error) {
        toast.error(`Could not copy diagnostics: ${error_message(error)}`);
      }
    },
  });
}
