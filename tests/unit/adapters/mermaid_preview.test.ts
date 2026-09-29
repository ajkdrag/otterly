/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import {
  make_svg_zoomable,
  render_mermaid_preview,
  rerender_mermaid_preview,
} from "$lib/features/editor/adapters/mermaid_preview";

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

describe("rerender_mermaid_preview", () => {
  it("redraws the preview with the current scheme and sanitizes it", async () => {
    document.documentElement.setAttribute("data-color-scheme", "dark");
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      svg: '<svg><g onclick="alert(1)">redrawn</g><script>alert(1)</script></svg>',
    } as never);
    const preview = document.createElement("div");
    preview.innerHTML = "<svg>old</svg>";

    rerender_mermaid_preview("graph TD; A-->B", preview);

    await vi.waitFor(() => {
      expect(preview.textContent).toBe("redrawn");
    });
    expect(preview.innerHTML).not.toContain("onclick");
    expect(preview.innerHTML).not.toContain("script");
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );
  });

  it("keeps the current preview when the redraw fails", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("bad"));
    const preview = document.createElement("div");
    preview.innerHTML = "<svg>old</svg>";

    rerender_mermaid_preview("graph TD; A-->", preview);

    await vi.waitFor(() => {
      expect(mermaid.render).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(preview.textContent).toBe("old");
  });
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

  it("uses strict security and a flat dark theme in dark mode", async () => {
    document.documentElement.setAttribute("data-color-scheme", "dark");
    const { apply_preview } = render_preview("mermaid", "graph TD; A-->B");

    await vi.waitFor(() => {
      expect(apply_preview).toHaveBeenCalled();
    });
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        theme: "dark",
        themeVariables: { useGradient: false, dropShadow: "none" },
      }),
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

describe("make_svg_zoomable", () => {
  it("swaps mermaid's max-width for the natural width variable", () => {
    const svg =
      '<svg id="m" width="100%" style="max-width: 812.5px; background: red;" viewBox="-8 -8 812.5 240"><g></g></svg>';

    expect(make_svg_zoomable(svg)).toBe(
      '<svg id="m" width="100%" style="--diagram-width: 812.5px; background: red;" viewBox="-8 -8 812.5 240"><g></g></svg>',
    );
  });

  it("adds a style when mermaid sets none", () => {
    expect(make_svg_zoomable('<svg viewBox="0 0 100 50"></svg>')).toBe(
      '<svg style="--diagram-width: 100px;" viewBox="0 0 100 50"></svg>',
    );
  });

  it("leaves an svg without a viewBox alone", () => {
    const svg = '<svg style="max-width: 10px;"></svg>';
    expect(make_svg_zoomable(svg)).toBe(svg);
  });
});
