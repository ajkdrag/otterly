import { describe, expect, it, vi } from "vitest";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { VimService, VimStore } from "$lib/features/vim";
import type { VimrcFile, VimrcPort, VimrcProblem } from "$lib/features/vim";

const path = "/config/otterly/vimrc";
const problem: VimrcProblem = {
  line: 1,
  text: "let x = 1",
  message: 'Unsupported command "let"',
  severity: "error",
};
const skipped_line: VimrcProblem = {
  line: 2,
  text: "syntax on",
  message: "Terminal Vim only",
  severity: "skipped",
};

function setup(
  read: () => Promise<VimrcFile>,
  open: () => Promise<void> = () => Promise.resolve(),
) {
  const vimrc_port: VimrcPort = {
    read_vimrc: vi.fn(read),
    open_vimrc: vi.fn(open),
  };
  const apply_vimrc = vi.fn((text: string) =>
    text.startsWith("let") ? [problem] : [],
  );
  const sync_clipboard_from_host = vi.fn(() => Promise.resolve());
  const vim_store = new VimStore();
  const op_store = new OpStore();
  const service = new VimService(
    vimrc_port,
    { apply_vimrc, sync_clipboard_from_host },
    { set_press_and_hold: () => Promise.resolve() },
    vim_store,
    op_store,
  );
  return {
    service,
    apply_vimrc,
    sync_clipboard_from_host,
    vim_store,
    op_store,
  };
}

describe("VimService.load_vimrc", () => {
  it("applies an empty vimrc when the file does not exist", async () => {
    const { service, apply_vimrc, vim_store } = setup(() =>
      Promise.resolve({ path, text: null }),
    );

    const result = await service.load_vimrc();

    expect(result).toMatchObject({ status: "missing", problems: [] });
    expect(apply_vimrc).toHaveBeenCalledWith("");
    expect(vim_store.vimrc).toEqual({ path, exists: false, problems: [] });
  });

  it("skips text it already applied unless forced", async () => {
    const { service, apply_vimrc, vim_store } = setup(() =>
      Promise.resolve({ path, text: "let x = 1" }),
    );

    expect(await service.load_vimrc()).toMatchObject({
      status: "applied",
      problems: [problem],
      errors_changed: true,
      forced: false,
    });
    expect(await service.load_vimrc()).toMatchObject({
      status: "unchanged",
      problems: [problem],
      errors_changed: false,
    });
    expect(apply_vimrc).toHaveBeenCalledTimes(1);

    expect(await service.load_vimrc({ force: true })).toMatchObject({
      status: "applied",
      errors_changed: false,
      forced: true,
    });
    expect(apply_vimrc).toHaveBeenCalledTimes(2);
    expect(vim_store.vimrc).toEqual({
      path,
      exists: true,
      problems: [problem],
    });
  });

  it("records a read failure in the op store and keeps the last vimrc", async () => {
    let fail = false;
    const { service, vim_store, op_store } = setup(() =>
      fail
        ? Promise.reject(new Error("permission denied"))
        : Promise.resolve({ path, text: "imap jk <Esc>" }),
    );
    await service.load_vimrc();
    fail = true;

    expect(await service.load_vimrc()).toMatchObject({ status: "failed" });
    expect(op_store.get("vim.load_vimrc").status).toBe("error");
    expect(vim_store.vimrc).toEqual({ path, exists: true, problems: [] });
  });

  it("says a read error is new only when the last load did not fail the same way", async () => {
    let fail = true;
    const { service } = setup(() =>
      fail
        ? Promise.reject(new Error("permission denied"))
        : Promise.resolve({ path, text: "imap jk <Esc>" }),
    );

    expect(await service.load_vimrc()).toMatchObject({ error_changed: true });
    expect(await service.load_vimrc()).toMatchObject({ error_changed: false });

    fail = false;
    await service.load_vimrc();
    fail = true;
    expect(await service.load_vimrc()).toMatchObject({ error_changed: true });
  });

  it("lets the latest load win when an earlier read finishes last", async () => {
    let finish_first: (file: VimrcFile) => void = () => {};
    let reads = 0;
    const { service, apply_vimrc, vim_store } = setup(() => {
      reads += 1;
      if (reads === 1)
        return new Promise((resolve) => {
          finish_first = resolve;
        });
      return Promise.resolve({ path, text: "imap jk <Esc>" });
    });

    const first = service.load_vimrc();
    expect(await service.load_vimrc()).toMatchObject({ status: "applied" });
    finish_first({ path, text: "let x = 1" });

    expect(await first).toEqual({ status: "stale" });
    expect(apply_vimrc).toHaveBeenCalledTimes(1);
    expect(vim_store.vimrc?.problems).toEqual([]);
  });

  it("hands a manual reload's force to the focus load that took over", async () => {
    let finish_first: (file: VimrcFile) => void = () => {};
    let reads = 0;
    const { service, apply_vimrc } = setup(() => {
      reads += 1;
      if (reads === 2)
        return new Promise((resolve) => {
          finish_first = resolve;
        });
      return Promise.resolve({ path, text: "imap jk <Esc>" });
    });
    await service.load_vimrc();
    apply_vimrc.mockClear();

    const manual = service.load_vimrc({ force: true });
    const on_focus = await service.load_vimrc({ force: false });
    finish_first({ path, text: "imap jk <Esc>" });

    expect(await manual).toEqual({ status: "stale" });
    expect(on_focus).toMatchObject({ status: "applied", forced: true });
    expect(apply_vimrc).toHaveBeenCalledTimes(1);
    expect(await service.load_vimrc()).toMatchObject({
      status: "unchanged",
      forced: false,
    });
  });

  it("does not call a changed skipped line a new error", async () => {
    let text = "let x = 1";
    const { service, apply_vimrc } = setup(() =>
      Promise.resolve({ path, text }),
    );
    apply_vimrc.mockImplementation((applied: string) =>
      applied.includes("syntax") ? [problem, skipped_line] : [problem],
    );
    await service.load_vimrc();

    text = "let x = 1\nsyntax on";

    expect(await service.load_vimrc()).toMatchObject({
      status: "applied",
      errors_changed: false,
    });
  });
});

describe("VimService.open_vimrc", () => {
  it("returns the reason when the vimrc cannot be opened", async () => {
    const { service } = setup(
      () => Promise.resolve({ path, text: null }),
      () => Promise.reject(new Error("no window available")),
    );

    expect(await service.open_vimrc()).toEqual({
      status: "failed",
      error: "no window available",
    });
  });
});

describe("VimService.sync_clipboard", () => {
  it("asks the engine, and swallows a clipboard that cannot be read", async () => {
    const { service, sync_clipboard_from_host } = setup(() =>
      Promise.resolve({ path, text: null }),
    );

    await service.sync_clipboard();
    expect(sync_clipboard_from_host).toHaveBeenCalledTimes(1);

    sync_clipboard_from_host.mockRejectedValueOnce(new Error("no text"));
    await expect(service.sync_clipboard()).resolves.toBeUndefined();
  });
});
