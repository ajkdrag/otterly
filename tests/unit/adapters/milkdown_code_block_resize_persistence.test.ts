/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import { as_vault_id } from "$lib/shared/types/ids";

async function flush_editor_actions(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function dispatch_pointer(
  target: EventTarget,
  type: string,
  pointer_id: number,
  client_y: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientY: client_y,
  });
  Object.defineProperty(event, "pointerId", { value: pointer_id });
  target.dispatchEvent(event);
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("milkdown code block resize persistence", () => {
  it("restores code block heights from the editor buffer cache without changing markdown", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const port = create_milkdown_editor_port();
    const session = await port.start_session({
      root,
      initial_markdown: `## Note A

\`\`\`
dadad
\`\`\`

\`\`\`
dadad


adada

dada
\`\`\``,
      note_path: "docs/a.md",
      vault_id: null,
      events: {
        on_markdown_change() {},
        on_dirty_state_change() {},
      },
    });

    session.set_code_block_heights([245, 381]);
    await flush_editor_actions();

    let code_blocks = root.querySelectorAll<HTMLElement>(
      ".milkdown-code-block",
    );

    expect(session.get_markdown()).not.toContain("otterly:code-block");
    expect(code_blocks[0]?.style.height).toBe("245px");
    expect(code_blocks[1]?.style.height).toBe("381px");

    const first_block = code_blocks[0];
    const handle = first_block?.querySelector(".code-block-resize-handle");
    if (!first_block || !handle)
      throw new Error("Expected first code block resize handle");
    vi.spyOn(first_block, "getBoundingClientRect").mockReturnValue({
      height: 245,
    } as DOMRect);
    dispatch_pointer(handle, "pointerdown", 7, 100);
    dispatch_pointer(document, "pointermove", 7, 155);
    dispatch_pointer(document, "pointerup", 7, 155);
    expect(session.get_code_block_heights()).toEqual([300, 381]);

    session.open_buffer({
      note_path: "docs/b.md",
      vault_id: null,
      initial_markdown: "## Note B",
      restore_policy: "reuse_cache",
    });
    await flush_editor_actions();

    session.open_buffer({
      note_path: "docs/a.md",
      vault_id: null,
      initial_markdown: `## Note A

\`\`\`
dadad
\`\`\`

\`\`\`
dadad


adada

dada
\`\`\``,
      restore_policy: "reuse_cache",
    });
    await flush_editor_actions();

    code_blocks = root.querySelectorAll<HTMLElement>(".milkdown-code-block");

    expect(session.get_code_block_heights()).toEqual([300, 381]);
    expect(code_blocks[0]?.style.height).toBe("300px");
    expect(code_blocks[1]?.style.height).toBe("381px");

    session.destroy();
    root.remove();
  });

  it("keeps same-path buffer state separate across vaults", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const port = create_milkdown_editor_port();
    const vault_a = as_vault_id("vault-a");
    const vault_b = as_vault_id("vault-b");
    const session = await port.start_session({
      root,
      initial_markdown: "```\\nalpha\\n```",
      note_path: "docs/shared.md",
      vault_id: vault_a,
      events: {
        on_markdown_change() {},
        on_dirty_state_change() {},
      },
    });

    session.set_code_block_heights([245]);
    await flush_editor_actions();

    session.open_buffer({
      note_path: "docs/shared.md",
      vault_id: vault_b,
      initial_markdown: "```\\nbeta\\n```",
      restore_policy: "reuse_cache",
    });
    await flush_editor_actions();
    session.set_code_block_heights([381]);
    await flush_editor_actions();

    session.open_buffer({
      note_path: "docs/shared.md",
      vault_id: vault_a,
      initial_markdown: "```\\nalpha\\n```",
      restore_policy: "reuse_cache",
    });
    await flush_editor_actions();

    expect(session.get_code_block_heights()).toEqual([245]);

    session.open_buffer({
      note_path: "docs/shared.md",
      vault_id: vault_b,
      initial_markdown: "```\\nbeta\\n```",
      restore_policy: "reuse_cache",
    });
    await flush_editor_actions();

    expect(session.get_code_block_heights()).toEqual([381]);

    session.destroy();
    root.remove();
  });

  it("applies restored view state during buffer open", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const port = create_milkdown_editor_port();
    const session = await port.start_session({
      root,
      initial_markdown: "## Note A",
      note_path: "docs/a.md",
      vault_id: null,
      events: {
        on_markdown_change() {},
        on_dirty_state_change() {},
      },
    });

    session.open_buffer({
      note_path: "docs/b.md",
      vault_id: null,
      initial_markdown: "```\\nalpha\\n```",
      restore_policy: "reuse_cache",
      view_state: {
        cursor: {
          line: 1,
          column: 1,
          total_lines: 1,
          total_words: 1,
          anchor: 3,
          head: 3,
        },
        code_block_heights: [245],
      },
    });
    await flush_editor_actions();
    await flush_editor_actions();

    expect(session.get_code_block_heights()).toEqual([245]);

    session.destroy();
    root.remove();
  });
});
