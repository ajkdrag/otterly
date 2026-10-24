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
  // A vimrc that stays unreadable would repeat its error on every window
  // focus, so only a new error toasts. A manual reload always does.
  let last_read_error: string | null = null;

  registry.register({
    id: ACTION_IDS.vim_load_vimrc,
    label: "Reload vimrc",
    // A run with no argument (the Reload button) is a manual reload, so it
    // forces. The window focus reactor passes { force: false }.
    execute: async (arg: unknown) => {
      const force = (arg as { force?: boolean } | null)?.force !== false;
      const result = await services.vim.load_vimrc({ force });
      if (result.status === "stale") return;

      if (result.status === "failed") {
        if (force || result.error !== last_read_error) {
          toast.error("Could not read the vimrc", {
            description: result.error,
          });
        }
        last_read_error = result.error;
        return;
      }
      last_read_error = null;

      const [first_problem] = result.problems;
      if (first_problem && result.problems_changed) {
        const count = result.problems.length;
        toast.warning(
          `vimrc: ${String(count)} ${count === 1 ? "line" : "lines"} not applied`,
          {
            description: `Line ${String(first_problem.line)}: ${first_problem.message}`,
            ...(has_settings_dialog && {
              action: {
                label: "Show",
                onClick: () =>
                  void registry.execute(ACTION_IDS.settings_open, "vim"),
              },
            }),
          },
        );
        return;
      }
      if (force && result.status === "applied" && !first_problem) {
        toast.success("vimrc applied");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.vim_open_vimrc,
    label: "Open vimrc",
    execute: async () => {
      if (!(await services.vim.open_vimrc())) {
        toast.error("Could not open the vimrc");
      }
    },
  });
}
