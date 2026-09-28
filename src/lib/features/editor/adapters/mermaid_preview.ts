import type { Mermaid } from "mermaid";

// Milkdown's code block calls render_mermaid_preview on every edit and shows
// the result under the source. It passes the result through its SVG-aware
// DOMPurify sanitizer before inserting it.

let mermaid_promise: Promise<Mermaid> | null = null;
let render_count = 0;

export function render_mermaid_preview(
  language: string,
  content: string,
  apply_preview: (value: null | string | HTMLElement) => void,
): null | undefined {
  if (language.toLowerCase() !== "mermaid" || !content.trim()) return null;

  // mermaid.render queues calls internally, so the latest edit applies last.
  void load_mermaid()
    .then(async (mermaid) => {
      mermaid.initialize({
        startOnLoad: false,
        // Notes can come from anywhere. Strict drops click handlers and scripts.
        securityLevel: "strict",
        theme: is_dark_color_scheme() ? "dark" : "default",
        suppressErrorRendering: true,
      });
      render_count += 1;
      const { svg } = await mermaid.render(
        `otterly-mermaid-${String(render_count)}`,
        content,
      );
      apply_preview(svg);
    })
    .catch((error: unknown) => {
      apply_preview(create_mermaid_error(error));
    });

  // undefined tells Milkdown the preview arrives later via apply_preview.
  return undefined;
}

// Mermaid is several MB. Load it on the first mermaid block, not at startup.
function load_mermaid(): Promise<Mermaid> {
  mermaid_promise ??= import("mermaid").then((module) => module.default);
  return mermaid_promise;
}

// @Incomplete: Diagrams keep their theme until edited or the note reopens.
// Milkdown has no hook to re-run previews when the color scheme changes.
function is_dark_color_scheme(): boolean {
  return document.documentElement.getAttribute("data-color-scheme") === "dark";
}

function create_mermaid_error(error: unknown): HTMLElement {
  const element = document.createElement("div");
  element.className = "mermaid-error";
  element.textContent = error instanceof Error ? error.message : String(error);
  return element;
}
