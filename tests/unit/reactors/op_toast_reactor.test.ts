import { describe, expect, it } from "vitest";
import { resolve_op_toast_commands } from "$lib/reactors/op_toast.reactor.svelte";

describe("op_toast.reactor", () => {
  it("returns clipboard success toast when operation transitions to success", () => {
    const commands = resolve_op_toast_commands({
      key: "clipboard.write",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: null,
    });

    expect(commands).toEqual([
      { kind: "success", message: "Copied to clipboard" },
    ]);
  });

  it("returns link repair success toast with operation message", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: "Link repair complete: 3/5 notes updated",
    });

    expect(commands).toEqual([
      {
        kind: "success",
        message: "Link repair complete: 3/5 notes updated",
      },
    ]);
  });

  it("returns link repair error toast when operation transitions to error", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "error",
      error: "Link repair failed for 2 notes",
      message: null,
    });

    expect(commands).toEqual([
      {
        kind: "error",
        message: "Some links could not be repaired",
        log_label: "Link repair failed",
        error: "Link repair failed for 2 notes",
      },
    ]);
  });

  it("returns one fixed-id error toast when the theme file has errors", () => {
    const commands = resolve_op_toast_commands({
      key: "theme.file_load",
      previous_status: "pending",
      current_status: "error",
      error: "line 3: font_size must be a number (+1 more)",
      message: null,
    });

    expect(commands).toEqual([
      {
        kind: "error",
        message: "Theme file: line 3: font_size must be a number (+1 more)",
        error: "line 3: font_size must be a number (+1 more)",
        toast_id: "theme.file_load",
      },
    ]);
  });

  it("returns no toast when the theme file loads fine", () => {
    const commands = resolve_op_toast_commands({
      key: "theme.file_load",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: null,
    });

    expect(commands).toEqual([]);
  });

  it("returns no commands when status is unchanged", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "pending",
      error: null,
      message: null,
    });

    expect(commands).toEqual([]);
  });
});
