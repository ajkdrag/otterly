import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeService } from "$lib/features/theme/application/theme_service";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { create_test_theme_file_adapter } from "../../adapters/test_theme_file_adapter";
import { FILE_THEME_ID } from "$lib/shared/types/theme";

function create_harness() {
  const settings = {
    get_setting: vi.fn().mockResolvedValue(null),
    set_setting: vi.fn().mockResolvedValue(undefined),
  };
  const port = create_test_theme_file_adapter();
  const op_store = new OpStore();
  const service = new ThemeService(settings, port, op_store, () => 0);
  return { port, op_store, service };
}

describe("ThemeService theme file", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { supports: () => true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a missing file without an error", async () => {
    const { service, op_store } = create_harness();

    const state = await service.load_theme_file();

    expect(state).toEqual({
      path: "/config/otterly/theme.yaml",
      status: "missing",
      theme: null,
      errors: [],
    });
    expect(op_store.get("theme.file_load").status).toBe("success");
  });

  it("builds the file theme from a valid file", async () => {
    const { service, port } = create_harness();
    port._snapshot.text = "name: Desk lamp\nfont_size: 1.1\n";

    const state = await service.load_theme_file();

    expect(state.status).toBe("valid");
    expect(state.theme).toMatchObject({
      id: FILE_THEME_ID,
      name: "Desk lamp",
      font_size: 1.1,
    });
  });

  it("fails the op with the first error and the count of the rest", async () => {
    const { service, port, op_store } = create_harness();
    port._snapshot.text = "font_size: 9\nline_height: 9\nfont_sise: 1\n";

    const state = await service.load_theme_file();

    expect(state.status).toBe("invalid");
    expect(state.theme).toBeNull();
    expect(state.errors).toHaveLength(3);
    expect(op_store.get("theme.file_load")).toMatchObject({
      status: "error",
      error:
        "line 1: font_size must be a number from 0.875 to 1.25 (got 9) (+2 more)",
    });
  });

  it("says the rest is a floor when the error list hit its cap", async () => {
    const { service, port, op_store } = create_harness();
    port._snapshot.text = Array.from(
      { length: 50 },
      (_, idx) => `key_${String(idx)}: 1`,
    ).join("\n");

    const state = await service.load_theme_file();

    expect(state.errors).toHaveLength(20);
    expect(op_store.get("theme.file_load").error).toBe(
      'line 1: unknown key "key_0" (+19 or more)',
    );
  });

  it("logs each error as its own line, so commas in a message stay whole", async () => {
    const { service, port } = create_harness();
    port._snapshot.text = "extends: nope\nfont_sise: 1\n";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await service.load_theme_file();

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledTimes(2);
    });
    expect(warn.mock.calls[0]?.[0]).toContain(
      'Theme file has errors: line 1: extends must be one of mocha, nordic-light, nordic-dark (got "nope")',
    );
    expect(warn.mock.calls[1]?.[0]).toContain(
      'Theme file has errors: line 2: unknown key "font_sise"',
    );
  });

  it("leaves the log to the first window that asks", async () => {
    const { service, port } = create_harness();
    port._snapshot.text = "font_sise: 1\n";
    port.claim_theme_file_log = () => Promise.resolve(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const state = await service.load_theme_file();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.status).toBe("invalid");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs anyway when asking for the log claim fails", async () => {
    const { service, port } = create_harness();
    port._snapshot.text = "font_sise: 1\n";
    port.claim_theme_file_log = () => Promise.reject(new Error("no ipc"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await service.load_theme_file();

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the path when the backend says the file can't be read", async () => {
    const { service, port, op_store } = create_harness();
    port._snapshot.error =
      "Found more than one theme file (theme.yaml, theme.json). Delete all but one.";

    const state = await service.load_theme_file();

    expect(state).toEqual({
      path: "/config/otterly/theme.yaml",
      status: "invalid",
      theme: null,
      errors: [
        {
          line: null,
          key: null,
          message:
            "Found more than one theme file (theme.yaml, theme.json). Delete all but one.",
        },
      ],
    });
    expect(op_store.get("theme.file_load").error).toBe(
      "Found more than one theme file (theme.yaml, theme.json). Delete all but one.",
    );
  });

  it("turns a rejected read into an invalid state without a path", async () => {
    const { service, port } = create_harness();
    port.read_theme_file = () =>
      Promise.reject(new Error("Could not create the config folder"));

    const state = await service.load_theme_file();

    expect(state).toEqual({
      path: null,
      status: "invalid",
      theme: null,
      errors: [
        {
          line: null,
          key: null,
          message: "Could not create the config folder",
        },
      ],
    });
  });

  it("still loads themes when writing the schema fails", async () => {
    const { service, port } = create_harness();
    port.write_theme_schema = () => Promise.reject(new Error("read-only"));

    const result = await service.load_themes();

    expect(result.theme_file.status).toBe("missing");
  });

  it("subscribes before it starts the watcher so no change slips through", () => {
    const { service, port } = create_harness();
    const calls: string[] = [];
    port.subscribe_theme_file_changes = () => {
      calls.push("subscribe");
      return () => {};
    };
    port.watch_theme_file = () => {
      calls.push("watch");
      return Promise.resolve();
    };

    service.watch_theme_file(() => {});

    expect(calls).toEqual(["subscribe", "watch"]);
  });
});
