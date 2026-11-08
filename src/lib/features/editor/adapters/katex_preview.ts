import type { KatexOptions } from "katex";

// Math previews for the editor's formulas and ```math blocks. KaTeX builds
// the DOM itself and, with trust off, writes no links, scripts or handlers, so
// its output needs no sanitizer.

type Katex = typeof import("katex").default;

let katex_promise: Promise<Katex> | null = null;

// KaTeX and its fonts are a few hundred KB. Load them on the first formula,
// not at startup. A failed load is not remembered, so the next formula retries.
function load_katex(): Promise<Katex> {
  katex_promise ??= Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ]).then(
    ([module]) => module.default,
    (error: unknown) => {
      katex_promise = null;
      throw error;
    },
  );
  return katex_promise;
}

const katex_options: KatexOptions = {
  throwOnError: true,
  // Notes can come from anywhere. Without trust, \href, \url, \includegraphics
  // and \htmlClass are off.
  trust: false,
  // Quiet the console for unicode text and the like, which KaTeX draws anyway.
  strict: "ignore",
  // A note could ask for a formula the size of the screen or a macro that
  // expands without end. These cap both.
  maxSize: 50,
  maxExpand: 1000,
};

// A formula as a span, or a div for display math. A parse error rejects with
// KaTeX's message, which the editor shows beside the source.
export async function render_math_element(
  tex: string,
  display: boolean,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  if (!tex.trim() || signal.aborted) return null;
  const katex = await load_katex();
  if (signal.aborted) return null;
  const element = document.createElement(display ? "div" : "span");
  katex.render(tex, element, { ...katex_options, displayMode: display });
  return element;
}
