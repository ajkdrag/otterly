import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  register_vim_actions,
  type VimrcLoadResult,
  type VimrcOpenResult,
  type VimService,
} from "$lib/features/vim";

vi.mock("svelte-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const one_problem = [
  { line: 3, text: "let x = 1", message: 'Unsupported command "let"' },
];

const on_focus = { force: false };

function create_harness(
  results: VimrcLoadResult[],
  has_settings_dialog = true,
  open_result: VimrcOpenResult = { status: "opened" },
) {
  const registry = new ActionRegistry();
  const load_vimrc = vi.fn(() => {
    const result = results.shift();
    if (!result) throw new Error("no load result left");
    return Promise.resolve(result);
  });
  const open_vimrc = vi.fn(() => Promise.resolve(open_result));
  register_vim_actions({
    registry,
    services: { vim: { load_vimrc, open_vimrc } as unknown as VimService },
    has_settings_dialog,
  });
  return { registry, load_vimrc };
}

const problems_found: VimrcLoadResult = {
  status: "applied",
  problems: one_problem,
  problems_changed: true,
};

describe("vim.load_vimrc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns once about new problems and links to the Vim settings", async () => {
    const { registry } = create_harness([
      problems_found,
      { ...problems_found, status: "unchanged", problems_changed: false },
    ]);
    const open_settings = vi.fn();
    registry.register({
      id: ACTION_IDS.settings_open,
      label: "Open Settings",
      execute: open_settings,
    });

    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);
    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);

    expect(toast.warning).toHaveBeenCalledOnce();
    const [message, options] = vi.mocked(toast.warning).mock.calls[0] ?? [];
    expect(message).toBe("vimrc: 1 line not applied");
    expect(options?.description).toBe('Line 3: Unsupported command "let"');
    const show = options?.action as { label: string; onClick: () => void };
    expect(show.label).toBe("Show");
    show.onClick();
    expect(open_settings).toHaveBeenCalledWith("vim");
  });

  it("has no Show button where there is no Settings dialog", async () => {
    const { registry } = create_harness([problems_found], false);

    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);

    expect(vi.mocked(toast.warning).mock.calls[0]?.[1]).not.toHaveProperty(
      "action",
    );
  });

  it("reloads by force when run with no argument, like the Reload button does", async () => {
    const clean = { problems: [], problems_changed: false };
    const { registry, load_vimrc } = create_harness([
      { status: "applied", ...clean },
      { status: "applied", ...clean },
    ]);

    await registry.execute(ACTION_IDS.vim_load_vimrc);
    expect(load_vimrc).toHaveBeenLastCalledWith({ force: true });
    expect(toast.success).toHaveBeenCalledOnce();

    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);
    expect(load_vimrc).toHaveBeenLastCalledWith({ force: false });
  });

  it("says applied only for a forced reload of an existing, clean vimrc", async () => {
    const clean = { problems: [], problems_changed: false };
    const { registry } = create_harness([
      { status: "applied", ...clean },
      { status: "applied", ...clean },
      { status: "missing", ...clean },
    ]);

    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);
    expect(toast.success).not.toHaveBeenCalled();

    await registry.execute(ACTION_IDS.vim_load_vimrc);
    expect(toast.success).toHaveBeenCalledOnce();

    await registry.execute(ACTION_IDS.vim_load_vimrc);
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it("repeats a read error only when it is new or the reload was manual", async () => {
    const new_error = {
      status: "failed",
      error: "not valid UTF-8",
      error_changed: true,
    } as const;
    const same_error = { ...new_error, error_changed: false };
    const { registry } = create_harness([new_error, same_error, same_error]);

    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);
    await registry.execute(ACTION_IDS.vim_load_vimrc, on_focus);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(vi.mocked(toast.error).mock.calls[0]?.[1]).toMatchObject({
      description: "not valid UTF-8",
    });

    await registry.execute(ACTION_IDS.vim_load_vimrc);
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("warns on every manual reload, even when the problems did not change", async () => {
    const { registry } = create_harness([
      problems_found,
      { ...problems_found, problems_changed: false },
    ]);

    await registry.execute(ACTION_IDS.vim_load_vimrc);
    await registry.execute(ACTION_IDS.vim_load_vimrc);

    expect(toast.warning).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("stays quiet when a newer load took over", async () => {
    const { registry } = create_harness([{ status: "stale" }]);

    await registry.execute(ACTION_IDS.vim_load_vimrc);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("vim.open_vimrc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says why the vimrc could not be opened", async () => {
    const { registry } = create_harness([], true, {
      status: "failed",
      error: "no window available",
    });

    await registry.execute(ACTION_IDS.vim_open_vimrc);

    expect(toast.error).toHaveBeenCalledWith("Could not open the vimrc", {
      description: "no window available",
    });
  });
});
