/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";

describe("milkdown code block resize persistence", () => {
  it("hydrates persisted code block heights from markdown comments", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const port = create_milkdown_editor_port();
    const session = await port.start_session({
      root,
      initial_markdown: `## This is yet another note

<!-- otterly:code-block {"height":245} -->

\`\`\`
dadad
\`\`\`

<!-- otterly:code-block {"height":381} -->

\`\`\`
dadad


adada

dada
\`\`\``,
      note_path: "docs/test.md",
      vault_id: null,
      events: {
        on_markdown_change() {},
        on_dirty_state_change() {},
      },
    });

    const code_blocks = root.querySelectorAll(".code-block-wrapper");
    const first_pre = code_blocks[0]?.querySelector("pre");
    const second_pre = code_blocks[1]?.querySelector("pre");

    expect(code_blocks).toHaveLength(2);
    expect(first_pre).not.toBeNull();
    expect(second_pre).not.toBeNull();
    expect(root.textContent).not.toContain("otterly:code-block");
    expect((first_pre as HTMLElement).style.height).toBe("245px");
    expect((second_pre as HTMLElement).style.height).toBe("381px");

    session.destroy();
    root.remove();
  });
});
