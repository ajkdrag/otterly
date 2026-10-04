import { syntaxTree } from "@codemirror/language";
import { get_frontmatter_end } from "./frontmatter_range.js";
import { get_find_query, selected_find_intersects } from "./find_highlights.js";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, type Range } from "@codemirror/state";

type RenderedImage = {
  source: string;
  label: string;
  resize: ImageResizeRange;
};
export type ImageResizeRange = {
  from: number;
  to: number;
  alt_from: number;
  alt_to: number;
  ratio: number;
};
type RenderedLink = {
  from: number;
  to: number;
  target: string;
  label: string;
  image?: RenderedImage;
  image_resize?: ImageResizeRange;
};
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
type RenderImage = (
  source: string,
  label: string,
  view: EditorView,
  resize: ImageResizeRange,
) => HTMLElement;
type DestroyImage = (host: HTMLElement) => void;
type LinkRenderingOptions = {
  open_link: (target: string) => void;
  render_image?: RenderImage;
  destroy_image?: DestroyImage;
};
const refresh_links = StateEffect.define();
const reference_cache = new WeakMap<
  ReturnType<typeof syntaxTree>,
  Map<string, string>
>();

export function link_rendering(input: LinkRenderingOptions) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build_link_decorations(view, input);
      }

      update(update: ViewUpdate) {
        if (update.view.composing) {
          this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          get_find_query(update.startState) !== get_find_query(update.state) ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refresh_links)),
          )
        ) {
          this.decorations = build_link_decorations(update.view, input);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (extension) =>
        EditorView.atomicRanges.of(
          (view) =>
            view.plugin(extension)?.decorations.update({
              // Text links reveal their source when an arrow enters them.
              // Linked images remain single selectable widgets.
              filter: (_from, _to, decoration) => {
                const spec: unknown = decoration.spec;
                return (
                  typeof spec === "object" &&
                  spec !== null &&
                  "widget" in spec &&
                  spec.widget instanceof LinkWidget &&
                  !!spec.widget.link.image
                );
              },
            }) ?? Decoration.none,
        ),
    },
  );

  return [
    plugin,
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        requestAnimationFrame(() => {
          if (view.plugin(plugin))
            view.dispatch({ effects: refresh_links.of(null) });
        });
      },
    }),
  ];
}

function build_link_decorations(
  view: EditorView,
  input: LinkRenderingOptions,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  const frontmatter_end = get_frontmatter_end(state);
  const reference_targets = find_reference_targets(state);
  const links: RenderedLink[] = [];
  const visited = new Set<string>();

  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(reference) {
        const node = reference.node;
        if (node.from < frontmatter_end)
          return node.to <= frontmatter_end ? false : undefined;
        if (
          node.name === "FencedCode" ||
          node.name === "CodeBlock" ||
          node.name === "InlineCode" ||
          node.name === "Image" ||
          node.name === "LinkReference"
        )
          return false;

        const key = `${node.name}:${String(node.from)}:${String(node.to)}`;
        if (visited.has(key)) return undefined;
        visited.add(key);

        const link = link_from_node(state, node, reference_targets);
        if (link && (!link.image || input.render_image)) {
          links.push(link);
          return false;
        }
        return undefined;
      },
    });
  }

  for (const link of links) {
    const first_line = state.doc.lineAt(link.from);
    const last_line = state.doc.lineAt(link.to);
    const active = state.selection.ranges.some(
      (range) => range.empty && range.head > link.from && range.head < link.to,
    );
    const image_range = link.image?.resize;
    const active_range = image_range
      ? state.selection.ranges.some((range) =>
          selection_touches_range(range, image_range.from, image_range.to),
        )
      : active;
    if (
      active_range ||
      first_line.number !== last_line.number ||
      selected_find_intersects(state, link.from, link.to)
    )
      continue;
    ranges.push(
      Decoration.replace({
        widget: new LinkWidget(link, input),
      }).range(link.from, link.to),
    );
  }
  return Decoration.set(ranges, true);
}

export function link_from_node(
  state: EditorView["state"],
  node: SyntaxNode,
  reference_targets: Map<string, string> = find_reference_targets(state),
): RenderedLink | null {
  const source = state.sliceDoc(node.from, node.to);
  if (node.name === "WikiLink") {
    const match = /^\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]$/.exec(source);
    if (!match?.[1]) return null;
    const raw_target = match[1].trim();
    const target = wiki_target(raw_target);
    const label = match[2]?.trim() || raw_target.split("#", 1)[0] || raw_target;
    return { from: node.from, to: node.to, target, label };
  }
  if (node.name === "Autolink") {
    const url = first_child_text(state, node, "URL");
    if (url) return { from: node.from, to: node.to, target: url, label: url };
    return null;
  }
  if (node.name === "URL") {
    if (
      has_ancestor_named(node, "Link") ||
      has_ancestor_named(node, "Autolink")
    )
      return null;
    const target = source.replace(/^<|>$/g, "");
    return { from: node.from, to: node.to, target, label: target };
  }
  if (node.name !== "Link" && node.name !== "Image") return null;

  const markers = direct_child_ranges(node, "LinkMark");
  const opening = markers[0];
  const closing = markers.find(
    (marker) => state.sliceDoc(marker.from, marker.to) === "]",
  );
  if (!opening || !closing) return null;
  const label = plain_link_label(state, node, opening.to, closing.from);
  const target_node = direct_child_range(node, "URL");
  let target = target_node
    ? clean_url(state.sliceDoc(target_node.from, target_node.to))
    : "";

  if (!target) {
    const reference_label = direct_child_range(node, "LinkLabel");
    const raw_label = reference_label
      ? state.sliceDoc(reference_label.from, reference_label.to).slice(1, -1) ||
        state.sliceDoc(opening.to, closing.from)
      : state.sliceDoc(opening.to, closing.from);
    target = reference_targets.get(normalize_reference(raw_label)) ?? "";
  }
  if (!target) return null;
  const nested_image = first_descendant(node, "Image");
  const image = nested_image
    ? link_from_node(state, nested_image, reference_targets)
    : null;
  const image_resize =
    node.name === "Image"
      ? image_resize_range(state, node, opening.to, closing.from)
      : undefined;
  return {
    from: node.from,
    to: node.to,
    target,
    label: node.name === "Image" ? label : image?.label || label || target,
    ...(image_resize ? { image_resize } : {}),
    ...(node.name === "Link" && image?.image_resize
      ? {
          image: {
            source: image.target,
            label: image.label,
            resize: image.image_resize,
          },
        }
      : {}),
  };
}

function selection_touches_range(
  range: EditorView["state"]["selection"]["main"],
  from: number,
  to: number,
): boolean {
  return range.empty
    ? range.head > from && range.head < to
    : range.from < to && range.to > from;
}

function image_resize_range(
  state: EditorView["state"],
  node: SyntaxNode,
  alt_from: number,
  alt_to: number,
): ImageResizeRange {
  const alt = state.sliceDoc(alt_from, alt_to).trim();
  const ratio = Number(alt);
  return {
    from: node.from,
    to: node.to,
    alt_from,
    alt_to,
    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
  };
}

function find_reference_targets(
  state: EditorView["state"],
): Map<string, string> {
  const tree = syntaxTree(state);
  const cached = reference_cache.get(tree);
  if (cached) return cached;
  const targets = new Map<string, string>();
  const frontmatter_end = get_frontmatter_end(state);
  tree.iterate({
    enter(reference) {
      if (reference.from < frontmatter_end)
        return reference.to <= frontmatter_end ? false : undefined;
      if (reference.name !== "LinkReference") return undefined;
      const node = reference.node;
      const label = first_child_text(state, node, "LinkLabel").slice(1, -1);
      const target = first_child_text(state, node, "URL");
      const key = normalize_reference(label);
      if (label && target && !targets.has(key))
        targets.set(key, clean_url(target));
      return false;
    },
  });
  reference_cache.set(tree, targets);
  return targets;
}

function child_ranges(
  node: SyntaxNode,
  name: string,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  const visit = (child: SyntaxNode) => {
    if (child.name === name) ranges.push({ from: child.from, to: child.to });
    for (let nested = child.firstChild; nested; nested = nested.nextSibling)
      visit(nested);
  };
  for (let child = node.firstChild; child; child = child.nextSibling)
    visit(child);
  return ranges;
}

function child_range(
  node: SyntaxNode,
  name: string,
): { from: number; to: number } | null {
  return child_ranges(node, name)[0] ?? null;
}

function direct_child_ranges(
  node: SyntaxNode,
  name: string,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.name === name) ranges.push({ from: child.from, to: child.to });
  return ranges;
}

function direct_child_range(
  node: SyntaxNode,
  name: string,
): { from: number; to: number } | null {
  return direct_child_ranges(node, name)[0] ?? null;
}

function first_descendant(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const nested = first_descendant(child, name);
    if (nested) return nested;
  }
  return null;
}

function first_child_text(
  state: EditorView["state"],
  node: SyntaxNode,
  name: string,
): string {
  const range = child_range(node, name);
  return range ? state.sliceDoc(range.from, range.to) : "";
}

function has_ancestor_named(node: SyntaxNode, name: string): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.name === name) return true;
    parent = parent.parent;
  }
  return false;
}

function clean_url(value: string): string {
  return decode_markdown_text(
    value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value,
  );
}

function wiki_target(value: string): string {
  const hash = value.indexOf("#");
  const path = hash < 0 ? value : value.slice(0, hash);
  const fragment = hash < 0 ? "" : value.slice(hash);
  return path && !path.toLowerCase().endsWith(".md")
    ? `${path}.md${fragment}`
    : value;
}

function normalize_reference(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function plain_link_label(
  state: EditorView["state"],
  node: SyntaxNode,
  from: number,
  to: number,
): string {
  const markers = ["EmphasisMark", "StrikethroughMark", "CodeMark"]
    .flatMap((name) => child_ranges(node, name))
    .filter((range) => range.from >= from && range.to <= to)
    .sort((left, right) => left.from - right.from);
  let cursor = from;
  let text = "";
  for (const marker of markers) {
    text += state.sliceDoc(cursor, marker.from);
    cursor = marker.to;
  }
  return decode_markdown_text(text + state.sliceDoc(cursor, to));
}

function decode_markdown_text(value: string): string {
  return value
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1")
    .replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, (entity) => {
      const decoder = document.createElement("textarea");
      decoder.innerHTML = entity;
      return decoder.value;
    });
}

function is_plain_click(event: MouseEvent): boolean {
  return event.button === 0 && is_unmodified(event);
}

function is_unmodified(event: MouseEvent | KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

class LinkWidget extends WidgetType {
  constructor(
    readonly link: RenderedLink,
    readonly input: LinkRenderingOptions,
  ) {
    super();
  }

  eq(other: LinkWidget) {
    return (
      this.link.target === other.link.target &&
      this.link.label === other.link.label &&
      this.link.image?.source === other.link.image?.source &&
      this.link.image?.label === other.link.image?.label &&
      this.link.image?.resize.from === other.link.image?.resize.from &&
      this.link.image?.resize.to === other.link.image?.resize.to &&
      this.link.image?.resize.ratio === other.link.image?.resize.ratio &&
      this.input.open_link === other.input.open_link &&
      this.input.render_image === other.input.render_image
    );
  }

  toDOM(view: EditorView) {
    const link = document.createElement("a");
    link.className = "md-link-rendered";
    link.dataset.mdLinkTarget = this.link.target;
    if (this.link.image && this.input.render_image) {
      link.append(
        this.input.render_image(
          this.link.image.source,
          this.link.image.label,
          view,
          this.link.image.resize,
        ),
      );
    } else {
      link.textContent = this.link.label;
    }
    link.setAttribute("role", "link");
    link.setAttribute("tabindex", "0");
    link.setAttribute("aria-label", `Open ${this.link.label}`);
    link.style.color = "var(--primary, #2563eb)";
    link.style.textDecoration = "underline";
    link.style.cursor = "pointer";
    link.addEventListener("click", (event) => {
      if (!is_plain_click(event)) return;
      event.preventDefault();
      this.input.open_link(this.link.target);
    });
    link.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !is_unmodified(event)) return;
      event.preventDefault();
      this.input.open_link(this.link.target);
    });
    return link;
  }

  destroy(dom: HTMLElement) {
    for (const image of dom.querySelectorAll<HTMLElement>(".md-image"))
      this.input.destroy_image?.(image);
  }
}
