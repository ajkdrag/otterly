import { describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_ui_actions } from "$lib/app/orchestration/ui_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

function register_with_shell(shell: object) {
  const registry = new ActionRegistry();
  register_ui_actions({
    registry,
    stores: { ui: new UIStore() },
    services: { shell },
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  } as never);
  return registry;
}

describe("shell.open_linked_file", () => {
  it("opens documents in the default app", async () => {
    const open_in_default_app = vi.fn().mockResolvedValue(true);
    const registry = register_with_shell({ open_in_default_app });

    await registry.execute(
      ACTION_IDS.shell_open_linked_file,
      "files/budget.xlsx",
    );

    expect(open_in_default_app).toHaveBeenCalledWith("files/budget.xlsx");
  });

  it("refuses programs and says why", async () => {
    const open_in_default_app = vi.fn().mockResolvedValue(true);
    const registry = register_with_shell({ open_in_default_app });

    await registry.execute(ACTION_IDS.shell_open_linked_file, "setup.exe");

    expect(open_in_default_app).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("register_ui_actions", () => {
  it("opens and closes vault dashboard", async () => {
    const registry = new ActionRegistry();
    let refresh_called = 0;
    const refresh_dashboard_stats = async () => {
      refresh_called += 1;
      return await Promise.resolve({ status: "skipped" as const });
    };
    const stores = {
      ui: new UIStore(),
      vault: new VaultStore(),
      notes: new NotesStore(),
      editor: new EditorStore(),
      op: new OpStore(),
      search: new SearchStore(),
      tab: new TabStore(),
      git: new GitStore(),
    };

    register_ui_actions({
      registry,
      stores,
      services: {
        vault: { refresh_dashboard_stats },
        shell: { open_url: async () => {} },
      } as never,
      default_mount_config: {
        reset_app_state: true,
        bootstrap_default_vault_path: null,
      },
    });

    expect(stores.ui.vault_dashboard.open).toBe(false);

    await registry.execute(ACTION_IDS.ui_open_vault_dashboard);
    expect(stores.ui.vault_dashboard.open).toBe(true);
    expect(refresh_called).toBe(1);

    await registry.execute(ACTION_IDS.ui_close_vault_dashboard);
    expect(stores.ui.vault_dashboard.open).toBe(false);
  });

  it("accepts dashboard sidebar view", async () => {
    const registry = new ActionRegistry();
    let refresh_called = 0;
    const stores = {
      ui: new UIStore(),
      vault: new VaultStore(),
      notes: new NotesStore(),
      editor: new EditorStore(),
      op: new OpStore(),
      search: new SearchStore(),
      tab: new TabStore(),
      git: new GitStore(),
    };

    register_ui_actions({
      registry,
      stores,
      services: {
        vault: {
          refresh_dashboard_stats: async () => {
            refresh_called += 1;
            return await Promise.resolve({ status: "skipped" as const });
          },
        },
        shell: { open_url: async () => {} },
      } as never,
      default_mount_config: {
        reset_app_state: true,
        bootstrap_default_vault_path: null,
      },
    });

    expect(stores.ui.sidebar_view).toBe("explorer");
    await registry.execute(ACTION_IDS.ui_set_sidebar_view, "dashboard");
    expect(stores.ui.sidebar_view).toBe("dashboard");
    expect(refresh_called).toBe(1);
  });
});
