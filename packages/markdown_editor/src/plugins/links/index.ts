import { WidgetType, type EditorView } from "@codemirror/view";
import type { MarkdownPlugin } from "../../core/plugin.js";
import { image_renderer, type ImageRenderer } from "../images/index.js";
import { link_from_node, type RenderedLink } from "./link_source.js";
import { link_tooltip } from "./tooltip.js";
import { links_theme } from "./theme.js";

export type LinkOptions = {
  // Called for a plain click or Enter on a rendered link. Relative note paths
  // arrive as written; the host resolves them.
  open_link: (target: string) => void;
  copy_link?: (target: string) => void | Promise<void>;
  // Key that opens the link editor. Defaults to Mod-k.
  edit_key?: string;
};

// Inline links, reference links, autolinks, bare URLs, and wiki links render
// as clickable labels. The source shows while a caret touches the link.
export function links(options: LinkOptions): MarkdownPlugin {
  return {
    name: "links",
    constructs: [
      {
        kind: "inline",
        name: "link",
        nodes: ["Link", "Autolink", "URL", "WikiLink"],
        decorate(node, render) {
          const link = link_from_node(render.state, node.node);
          if (!link) return;
          const { doc } = render.state;
          if (doc.lineAt(link.from).number !== doc.lineAt(link.to).number)
            return;
          const images = render.state.facet(image_renderer);
          if (link.image && images) {
            // A linked image keeps its image visible, like a plain image.
            if (!render.reveal) render.hide(link.from, link.to);
            render.widget(
              link.to,
              new LinkWidget(link, options.open_link, images),
            );
            return;
          }
          if (render.reveal) return;
          render.replace(
            link.from,
            link.to,
            new LinkWidget(link, options.open_link, null),
          );
        },
        render_static(node, context) {
          const link = link_from_node(context.state, node.node);
          if (!link) return null;
          return link_element(link, options.open_link);
        },
      },
    ],
    extensions: link_tooltip({
      open_link: options.open_link,
      ...(options.copy_link ? { copy_link: options.copy_link } : {}),
      ...(options.edit_key ? { edit_key: options.edit_key } : {}),
    }),
    theme: links_theme,
  };
}

function link_element(
  link: RenderedLink,
  open_link: (target: string) => void,
): HTMLElement {
  const element = document.createElement("a");
  element.className = "md-link-rendered";
  element.dataset.mdLinkTarget = link.target;
  element.textContent = link.label;
  element.setAttribute("role", "link");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", `Open ${link.label}`);
  element.addEventListener("click", (event) => {
    if (event.button !== 0 || is_modified(event)) return;
    event.preventDefault();
    event.stopPropagation();
    open_link(link.target);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || is_modified(event)) return;
    event.preventDefault();
    open_link(link.target);
  });
  return element;
}

function is_modified(event: MouseEvent | KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

class LinkWidget extends WidgetType {
  constructor(
    readonly link: RenderedLink,
    readonly open_link: (target: string) => void,
    readonly images: ImageRenderer | null,
  ) {
    super();
  }

  eq(other: LinkWidget) {
    const image = this.link.image;
    const other_image = other.link.image;
    return (
      this.link.target === other.link.target &&
      this.link.label === other.link.label &&
      image?.source === other_image?.source &&
      image?.label === other_image?.label &&
      image?.resize.ratio === other_image?.resize.ratio &&
      image?.resize.from === other_image?.resize.from &&
      this.open_link === other.open_link &&
      this.images === other.images
    );
  }

  toDOM(view: EditorView) {
    const element = link_element(this.link, this.open_link);
    const image = this.link.image;
    if (image && this.images) {
      element.replaceChildren(
        this.images.render(view, image.source, image.label, image.resize),
      );
    }
    return element;
  }

  destroy(dom: HTMLElement) {
    for (const image of dom.querySelectorAll<HTMLElement>(".md-image"))
      this.images?.destroy(image);
  }
}
