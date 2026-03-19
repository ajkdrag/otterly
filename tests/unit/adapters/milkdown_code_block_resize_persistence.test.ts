/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import { as_vault_id } from "$lib/shared/types/ids";

async function flush_editor_actions(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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

    let code_blocks = root.querySelectorAll(".code-block-wrapper");
    let first_pre = code_blocks[0]?.querySelector("pre");
    let second_pre = code_blocks[1]?.querySelector("pre");

    expect(session.get_markdown()).not.toContain("otterly:code-block");
    expect((first_pre as HTMLElement).style.height).toBe("245px");
    expect((second_pre as HTMLElement).style.height).toBe("381px");

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

    code_blocks = root.querySelectorAll(".code-block-wrapper");
    first_pre = code_blocks[0]?.querySelector("pre");
    second_pre = code_blocks[1]?.querySelector("pre");

    expect(session.get_code_block_heights()).toEqual([245, 381]);
    expect((first_pre as HTMLElement).style.height).toBe("245px");
    expect((second_pre as HTMLElement).style.height).toBe("381px");

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
