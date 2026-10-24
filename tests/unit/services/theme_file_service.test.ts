import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeService } from "$lib/features/theme/application/theme_service";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { create_mock_theme_file_port } from "../helpers/mock_ports";
import { FILE_THEME_ID } from "$lib/shared/types/theme";

function create_harness() {
  const settings = {
    get_setting: vi.fn().mockResolvedValue(null),
    set_setting: vi.fn().mockResolvedValue(undefined),
  };
  const port = create_mock_theme_file_port();
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

  it("turns a failed read into an invalid state instead of throwing", async () => {
    const { service, port, op_store } = create_harness();
    port.read_theme_file = () =>
      Promise.reject(new Error("Found both theme.yaml and theme.json."));

    const state = await service.load_theme_file();

    expect(state).toEqual({
      path: null,
      status: "invalid",
      theme: null,
      errors: [
        {
          line: null,
          key: null,
          message: "Found both theme.yaml and theme.json.",
        },
      ],
    });
    expect(op_store.get("theme.file_load").error).toBe(
      "Found both theme.yaml and theme.json.",
    );
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
