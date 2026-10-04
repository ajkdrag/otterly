/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import {
  make_svg_zoomable,
  render_mermaid_element,
} from "$lib/features/editor/adapters/mermaid_preview";

// jsdom can't lay out SVG, so we mock mermaid and test our wiring around it.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(() => Promise.resolve({ svg: "<svg>diagram</svg>" })),
  },
}));

const live = () => new AbortController().signal;

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-color-scheme");
});

describe("render_mermaid_element", () => {
  it("skips empty blocks without loading mermaid", async () => {
    expect(await render_mermaid_element("  \n", live())).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("returns the sanitized diagram", async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      svg: '<svg><g onclick="alert(1)">drawn</g><script>alert(1)</script></svg>',
    } as never);
    const element = await render_mermaid_element("graph TD; A-->B", live());
    expect(element?.textContent).toBe("drawn");
    expect(element?.innerHTML).not.toContain("onclick");
    expect(element?.innerHTML).not.toContain("script");
  });

  it("uses strict security and a flat dark theme in dark mode", async () => {
    document.documentElement.setAttribute("data-color-scheme", "dark");
    await render_mermaid_element("graph TD; A-->B", live());
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
    const element = await render_mermaid_element("graph TD; A-->", live());
    expect(element?.className).toBe("mermaid-error");
    expect(element?.textContent).toBe("<b>Parse error</b>");
    expect(element?.children).toHaveLength(0);
  });

  it("drops a result that arrives after the request was aborted", async () => {
    const request = new AbortController();
    const pending = render_mermaid_element("graph TD; A-->B", request.signal);
    request.abort();
    expect(await pending).toBeNull();
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
