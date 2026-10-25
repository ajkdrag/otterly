import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app";
import type { VimService } from "$lib/features/vim/application/vim_service";
import { toast } from "svelte-sonner";

// Both windows register this. The document window has no Settings dialog.
export type VimActionInput = {
  registry: ActionRegistry;
  services: { vim: VimService };
  has_settings_dialog: boolean;
};

export function register_vim_actions(input: VimActionInput) {
  const { registry, services, has_settings_dialog } = input;

  registry.register({
    id: ACTION_IDS.vim_load_vimrc,
    label: "Reload vimrc",
    // A run with no argument (the Reload button) is a manual reload, so it
    // forces. The window focus reactor passes { force: false }.
    execute: async (arg: unknown) => {
      const force = !(
        typeof arg === "object" &&
        arg !== null &&
        "force" in arg &&
        arg.force === false
      );
      const result = await services.vim.load_vimrc({ force });
      if (result.status === "stale") return;

      // A manual reload always answers. A focus reload only speaks up about
      // something new, or it would repeat itself every time you come back.
      // result.forced also covers a manual reload that a focus load took over.
      if (result.status === "failed") {
        if (result.forced || result.error_changed) {
          toast.error("Could not read the vimrc", {
            description: result.error,
          });
        }
        return;
      }

      // Skipped lines (Vimscript, terminal-only settings) never toast.
      const errors = result.problems.filter(
        (problem) => problem.severity === "error",
      );
      const [first_error] = errors;
      if (first_error) {
        if (result.forced || result.errors_changed) {
          const count = errors.length;
          toast.warning(
            `vimrc: ${String(count)} ${count === 1 ? "line" : "lines"} not applied`,
            {
              description: `Line ${String(first_error.line)}: ${first_error.message}`,
              ...(has_settings_dialog && {
                action: {
                  label: "Show",
                  onClick: () =>
                    void registry.execute(ACTION_IDS.settings_open, "vim"),
                },
              }),
            },
          );
        }
        return;
      }
      // A missing file applies as empty, but there is nothing to call applied.
      if (result.forced && result.status === "applied") {
        const skipped = result.problems.length;
        toast.success(
          "vimrc applied",
          skipped > 0
            ? {
                description: `${String(skipped)} ${skipped === 1 ? "line" : "lines"} skipped`,
              }
            : undefined,
        );
      }
    },
  });

  registry.register({
    id: ACTION_IDS.vim_open_vimrc,
    label: "Open vimrc",
    execute: async () => {
      const result = await services.vim.open_vimrc();
      if (result.status === "failed") {
        toast.error("Could not open the vimrc", { description: result.error });
      }
    },
  });
}
