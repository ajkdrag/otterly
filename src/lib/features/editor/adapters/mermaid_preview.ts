import DOMPurify from "dompurify";
import type { Mermaid } from "mermaid";

// Milkdown's code block calls render_mermaid_preview on every edit and shows
// the result under the source. It passes the result through its SVG-aware
// DOMPurify sanitizer before inserting it.

let mermaid_promise: Promise<Mermaid> | null = null;
let render_count = 0;

export function is_diagram_language(language: string): boolean {
  return language.toLowerCase() === "mermaid";
}

export function render_mermaid_preview(
  language: string,
  content: string,
  apply_preview: (value: null | string | HTMLElement) => void,
): null | undefined {
  if (!is_diagram_language(language) || !content.trim()) return null;

  // mermaid.render queues calls internally, so the latest edit applies last.
  void render_mermaid_svg(content)
    .then(apply_preview)
    .catch((error: unknown) => {
      apply_preview(create_mermaid_error(error));
    });

  // undefined tells Milkdown the preview arrives later via apply_preview.
  return undefined;
}

// Milkdown only re-runs previews when a block's text or language changes, so
// the code block plugin calls this when the color scheme changes. Milkdown's
// preview panel keeps what we write here until the next edit, which renders
// with the new scheme anyway. A block that fails to render keeps its error.
export function rerender_mermaid_preview(
  content: string,
  preview: HTMLElement,
): void {
  void render_mermaid_svg(content)
    .then((svg) => {
      preview.innerHTML = sanitize_svg(svg);
    })
    .catch(() => {});
}

// Mermaid is several MB. Load it on the first mermaid block, not at startup.
function load_mermaid(): Promise<Mermaid> {
  mermaid_promise ??= import("mermaid").then((module) => module.default);
  return mermaid_promise;
}

async function render_mermaid_svg(content: string): Promise<string> {
  const mermaid = await load_mermaid();
  mermaid.initialize({
    startOnLoad: false,
    // Notes can come from anywhere. Strict drops click handlers and scripts.
    securityLevel: "strict",
    theme: is_dark_color_scheme() ? "dark" : "default",
    // Mermaid 12's dark theme adds gradient borders and drop shadows.
    themeVariables: { useGradient: false, dropShadow: "none" },
    suppressErrorRendering: true,
  });
  render_count += 1;
  const { svg } = await mermaid.render(
    `otterly-mermaid-${String(render_count)}`,
    content,
  );
  return make_svg_zoomable(svg);
}

// Same rules as Milkdown's preview sanitizer (createSvgAwareSanitizer in
// @milkdown/components), so both paths let the same markup through. Mermaid
// puts HTML labels in foreignObject, which is only safe inside the svg.
let svg_sanitizer: ReturnType<typeof DOMPurify> | null = null;

function sanitize_svg(svg: string): string {
  if (!svg_sanitizer) {
    svg_sanitizer = DOMPurify();
    svg_sanitizer.addHook("uponSanitizeElement", (node, data) => {
      if (data.tagName !== "foreignobject") return;
      if (node.parentElement?.namespaceURI !== "http://www.w3.org/2000/svg") {
        node.parentNode?.removeChild(node);
      }
    });
  }
  return svg_sanitizer.sanitize(svg, {
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["xmlns"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}

function is_dark_color_scheme(): boolean {
  return document.documentElement.getAttribute("data-color-scheme") === "dark";
}

// Mermaid caps the svg with an inline max-width, which would also cap zoom.
// We swap it for the natural width as --diagram-width, and editor.css sizes
// the svg from that and the block's --diagram-zoom.
export function make_svg_zoomable(svg: string): string {
  return svg.replace(/^<svg\b[^>]*>/, (tag) => {
    const width = /viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)/.exec(tag)?.[1];
    if (!width) return tag;
    const declaration = `--diagram-width: ${width}px;`;
    const without_max_width = tag.replace(/max-width:\s*[\d.]+px;?\s*/, "");
    return without_max_width.includes(' style="')
      ? without_max_width.replace(' style="', ` style="${declaration} `)
      : without_max_width.replace(/^<svg\b/, `<svg style="${declaration}"`);
  });
}

function create_mermaid_error(error: unknown): HTMLElement {
  const element = document.createElement("div");
  element.className = "mermaid-error";
  element.textContent = error instanceof Error ? error.message : String(error);
  return element;
}
