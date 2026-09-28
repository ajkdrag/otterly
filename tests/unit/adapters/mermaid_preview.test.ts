/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import { render_mermaid_preview } from "$lib/features/editor/adapters/mermaid_preview";

// jsdom can't lay out SVG, so we mock mermaid and test our wiring around it.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(() => Promise.resolve({ svg: "<svg>diagram</svg>" })),
  },
}));

function render_preview(language: string, content: string) {
  const apply_preview = vi.fn();
  const result = render_mermaid_preview(language, content, apply_preview);
  return { result, apply_preview };
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-color-scheme");
});

describe("render_mermaid_preview", () => {
  it("skips other languages and empty mermaid blocks", () => {
    expect(render_preview("js", "graph TD; A-->B").result).toBeNull();
    expect(render_preview("mermaid", "  \n").result).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("renders a mermaid block asynchronously", async () => {
    const { result, apply_preview } = render_preview(
      "Mermaid",
      "graph TD; A-->B",
    );

    expect(result).toBeUndefined();
    await vi.waitFor(() => {
      expect(apply_preview).toHaveBeenCalledWith("<svg>diagram</svg>");
    });
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.any(String),
      "graph TD; A-->B",
    );
  });

  it("uses strict security and follows the dark color scheme", async () => {
    document.documentElement.setAttribute("data-color-scheme", "dark");
    const { apply_preview } = render_preview("mermaid", "graph TD; A-->B");

    await vi.waitFor(() => {
      expect(apply_preview).toHaveBeenCalled();
    });
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", theme: "dark" }),
    );
  });

  it("shows the syntax error as text", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(
      new Error("<b>Parse error</b>"),
    );
    const { apply_preview } = render_preview("mermaid", "graph TD; A-->");

    await vi.waitFor(() => {
      expect(apply_preview).toHaveBeenCalled();
    });
    const element = apply_preview.mock.calls[0]?.[0] as HTMLElement;
    expect(element.className).toBe("mermaid-error");
    expect(element.textContent).toBe("<b>Parse error</b>");
    expect(element.children).toHaveLength(0);
  });
});
