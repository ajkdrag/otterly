/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type { EditorService } from "$lib/features/editor";
import { create_editor_sync_reactor } from "$lib/reactors/editor_sync.reactor.svelte";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
it("does not restore the old tab cursor when note IO finishes before the new tab is created", async () => {
  const editor = new EditorStore();
  const tabs = new TabStore();
  const vault = new VaultStore();
  const old = create_open_note_state(
    create_test_note("old", "Old"),
    "old\ntext",
  );
  const next = create_open_note_state(
    create_test_note("next", "Next"),
    "new\nnote",
  );
  tabs.open_tab(old.meta.path, "Old");
  tabs.set_snapshot(old.meta.path, {
    scroll_top: 220,
    cursor: {
      line: 2,
      column: 3,
      total_lines: 2,
      total_words: 2,
      anchor: 6,
      head: 6,
      offset_kind: "markdown",
    },
    code_block_view_states: [],
  });
  editor.set_open_note(old);
  const open_buffer = vi.fn();
  const set_scroll_top = vi.fn();
  cleanups.push(
    create_editor_sync_reactor(editor, tabs, vault, {
      is_mounted: () => true,
      open_buffer,
      set_scroll_top,
    } as unknown as EditorService),
  );
  await tick();
  open_buffer.mockClear();
  set_scroll_top.mockClear();
  // NoteService publishes this before note_open's awaited continuation adds the tab.
  editor.set_open_note(next);
  await tick();
  tabs.open_tab(next.meta.path, "Next");
  await tick();
  expect(open_buffer).toHaveBeenCalledTimes(1);
  expect(open_buffer.mock.calls[0]?.[2]).toEqual({
    cursor: null,
    code_block_view_states: [],
  });
  expect(set_scroll_top).toHaveBeenLastCalledWith(0);
  expect(open_buffer.mock.invocationCallOrder[0]).toBeLessThan(
    set_scroll_top.mock.invocationCallOrder[0] ?? 0,
  );

  tabs.activate_tab(old.meta.path);
  editor.set_open_note(old);
  await tick();
  expect(open_buffer.mock.calls.at(-1)?.[2]).toEqual({
    cursor: {
      line: 2,
      column: 3,
      total_lines: 2,
      total_words: 2,
      anchor: 6,
      head: 6,
      offset_kind: "markdown",
    },
    code_block_view_states: [],
  });
  expect(set_scroll_top).toHaveBeenLastCalledWith(220);
});

it("restores an existing wiki target before its tab becomes active", async () => {
  const editor = new EditorStore();
  const tabs = new TabStore();
  const vault = new VaultStore();
  const target = create_open_note_state(create_test_note("target", "Target"));
  const previous = create_open_note_state(
    create_test_note("previous", "Previous"),
  );
  tabs.open_tab(target.meta.path, "Target");
  const cursor = {
    line: 1,
    column: 4,
    total_lines: 1,
    total_words: 1,
    anchor: 3,
    head: 3,
    offset_kind: "markdown" as const,
  };
  tabs.set_snapshot(target.meta.path, {
    scroll_top: 160,
    cursor,
    code_block_view_states: [],
  });
  tabs.open_tab(previous.meta.path, "Previous");
  editor.set_open_note(previous);
  const open_buffer = vi.fn();
  const set_scroll_top = vi.fn();
  cleanups.push(
    create_editor_sync_reactor(editor, tabs, vault, {
      is_mounted: () => true,
      open_buffer,
      set_scroll_top,
    } as unknown as EditorService),
  );
  await tick();
  open_buffer.mockClear();
  set_scroll_top.mockClear();

  // The wiki-link action awaits note IO before try_open_tab activates its target.
  editor.set_open_note(target);
  await tick();
  expect(open_buffer.mock.calls[0]?.[2]).toEqual({
    cursor,
    code_block_view_states: [],
  });
  expect(set_scroll_top).toHaveBeenLastCalledWith(160);
  tabs.activate_tab(target.meta.path);
  await tick();
  expect(open_buffer).toHaveBeenCalledTimes(1);
  expect(set_scroll_top).toHaveBeenCalledTimes(1);
});
