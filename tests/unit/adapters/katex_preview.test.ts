/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render_math_element } from "$lib/features/editor/adapters/katex_preview";

const live = () => new AbortController().signal;

describe("render_math_element", () => {
  it("returns null for empty TeX without loading KaTeX", async () => {
    expect(await render_math_element("  \n", false, live())).toBeNull();
  });

  it("draws inline math in a span", async () => {
    const element = await render_math_element("x^2", false, live());
    expect(element?.tagName).toBe("SPAN");
    expect(element?.querySelector(".katex")).not.toBeNull();
    expect(element?.querySelector(".katex-display")).toBeNull();
  });

  it("draws display math in a div", async () => {
    const element = await render_math_element("\\frac{a}{b}", true, live());
    expect(element?.tagName).toBe("DIV");
    expect(element?.querySelector(".katex-display")).not.toBeNull();
  });

  it("rejects with KaTeX's message when the TeX does not parse", async () => {
    await expect(render_math_element("\\frac{", false, live())).rejects.toThrow(
      /KaTeX parse error/,
    );
  });

  it("writes no link for \\href because trust is off", async () => {
    const element = await render_math_element(
      "\\href{https://example.com}{x}",
      false,
      live(),
    );
    expect(element?.querySelector("a")).toBeNull();
  });

  it("returns null when the render was cancelled", async () => {
    const abort = new AbortController();
    abort.abort();
    expect(await render_math_element("x", false, abort.signal)).toBeNull();
  });

  it("returns null when it is cancelled while KaTeX loads", async () => {
    const abort = new AbortController();
    const pending = render_math_element("y", false, abort.signal);
    abort.abort();
    expect(await pending).toBeNull();
  });
});
