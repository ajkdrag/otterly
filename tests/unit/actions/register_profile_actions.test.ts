import { describe, expect, it } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import {
  ProfileService,
  ProfileStore,
  register_profile_actions,
} from "$lib/features/profile";
import { create_mock_profile_port } from "../helpers/mock_ports";

function create_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    profile: new ProfileStore(),
  };
  const port = create_mock_profile_port();
  port._profile_ids = ["default", "work"];
  const profile_service = new ProfileService(
    port,
    stores.profile,
    stores.op,
    () => 0,
  );

  register_profile_actions({
    registry,
    stores,
    services: { profile: profile_service } as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, port };
}

describe("register_profile_actions", () => {
  it("lists the profiles when the dialog opens", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.profile_open_dialog);

    expect(stores.ui.profile_dialog.open).toBe(true);
    expect(stores.profile.profile_ids).toEqual(["default", "work"]);
  });

  it("opens the chosen profile and closes the dialog", async () => {
    const { registry, stores, port } = create_harness();
    await registry.execute(ACTION_IDS.profile_open_dialog);
    await registry.execute(ACTION_IDS.profile_update_new_name, "work");

    await registry.execute(ACTION_IDS.profile_open, "work");

    expect(port._calls.open_profile).toEqual(["work"]);
    expect(stores.ui.profile_dialog).toEqual({ open: false, new_name: "" });
  });

  it("keeps the dialog open and shows the error when opening fails", async () => {
    const { registry, stores, port } = create_harness();
    port.open_profile = () => Promise.reject(new Error("spawn failed"));
    await registry.execute(ACTION_IDS.profile_open_dialog);

    await registry.execute(ACTION_IDS.profile_open, "work");

    expect(stores.ui.profile_dialog.open).toBe(true);
    expect(stores.op.get("profile.open").status).toBe("error");
    expect(stores.op.get("profile.open").error).toContain("spawn failed");
  });

  it("forgets an earlier open error when the dialog opens again", async () => {
    const { registry, stores, port } = create_harness();
    port.open_profile = () => Promise.reject(new Error("spawn failed"));
    await registry.execute(ACTION_IDS.profile_open, "work");

    await registry.execute(ACTION_IDS.profile_open_dialog);

    expect(stores.op.get("profile.open").status).toBe("idle");
  });

  it("opens the dialog once for a Dock request, however often it checks", async () => {
    const { registry, stores, port } = create_harness();
    port._request_dialog();

    await registry.execute(ACTION_IDS.profile_check_dialog_request);
    await registry.execute(ACTION_IDS.profile_close_dialog);
    await registry.execute(ACTION_IDS.profile_check_dialog_request);

    expect(stores.ui.profile_dialog.open).toBe(false);
  });

  it("does nothing when the Dock has not asked", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.profile_check_dialog_request);

    expect(stores.ui.profile_dialog.open).toBe(false);
  });
});
