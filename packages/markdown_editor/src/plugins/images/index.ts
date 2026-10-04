import { Facet } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { MarkdownPlugin } from "../../core/plugin.js";
import { link_from_node, type ImageResizeRange } from "../links/link_source.js";
import {
  destroy_markdown_image,
  render_markdown_image,
  type ImageRenderingOptions,
} from "./image_widget.js";

export type { ImageRenderingOptions };

export type ImageRenderer = {
  render(
    view: EditorView,
    source: string,
    label: string,
    resize: ImageResizeRange | null,
  ): HTMLElement;
  destroy(host: HTMLElement): void;
};

// The images plugin provides this so other plugins can draw an image, such
// as the links plugin for a linked image.
export const image_renderer = Facet.define<ImageRenderer, ImageRenderer | null>(
  {
    combine: (values) => values[0] ?? null,
  },
);

// Images resolve through the host and draw after their source. The source
// hides unless a caret touches it; the image stays visible either way, so
// moving the caret in does not make the layout jump.
export function images(options: ImageRenderingOptions): MarkdownPlugin {
  const renderer: ImageRenderer = {
    render(view, source, label, resize) {
      return render_markdown_image(
        source,
        label,
        view,
        options.resolve_image,
        resize
          ? {
              ...resize,
              on_resize(ratio) {
                if (view.state.readOnly) return;
                view.dispatch({
                  changes: {
                    from: resize.alt_from,
                    to: resize.alt_to,
                    insert: ratio.toFixed(2),
                  },
                  userEvent: "input.image.resize",
                });
              },
            }
          : undefined,
      );
    },
    destroy: destroy_markdown_image,
  };
  return {
    name: "images",
    constructs: [
      {
        kind: "inline",
        name: "image",
        nodes: ["Image"],
        decorate(node, render) {
          // A linked image belongs to its link.
          if (node.node.parent?.name === "Link") return;
          const image = link_from_node(render.state, node.node);
          if (!image?.image_resize) return;
          if (
            render.state.doc.lineAt(node.from).number !==
            render.state.doc.lineAt(node.to).number
          )
            return;
          if (!render.reveal) render.hide(node.from, node.to);
          render.widget(
            node.to,
            new ImageWidget(
              renderer,
              image.target,
              image.label,
              image.image_resize,
              render.state.readOnly,
            ),
          );
        },
      },
    ],
    extensions: image_renderer.of(renderer),
    theme: {
      ".md-image": {
        display: "inline-block",
        position: "relative",
        maxWidth: "100%",
        verticalAlign: "middle",
        lineHeight: "0",
        color: "var(--muted-foreground, #737373)",
      },
      ".md-image img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "32rem",
        height: "auto",
        objectFit: "contain",
        borderRadius: "0.375rem",
      },
      ".md-image-resize": {
        position: "absolute",
        bottom: "-0.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        width: "10rem",
        height: "0.75rem",
        borderRadius: "999px",
        background: "var(--border, #888)",
        opacity: "0",
        cursor: "ns-resize",
        touchAction: "none",
        userSelect: "none",
      },
      ".md-image:hover .md-image-resize, .md-image-resize:focus-visible": {
        opacity: "1",
      },
      ".md-image-resize:focus-visible": {
        outline: "2px solid var(--ring, #777)",
      },
    },
  };
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly renderer: ImageRenderer,
    readonly source: string,
    readonly label: string,
    readonly resize: ImageResizeRange,
    readonly read_only: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      this.renderer === other.renderer &&
      this.source === other.source &&
      this.label === other.label &&
      this.resize.from === other.resize.from &&
      this.resize.to === other.resize.to &&
      this.resize.alt_from === other.resize.alt_from &&
      this.resize.alt_to === other.resize.alt_to &&
      this.resize.ratio === other.resize.ratio &&
      this.read_only === other.read_only
    );
  }

  toDOM(view: EditorView) {
    return this.renderer.render(view, this.source, this.label, this.resize);
  }

  destroy(dom: HTMLElement) {
    this.renderer.destroy(dom);
  }
}
