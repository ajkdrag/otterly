import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { has_ancestor } from "../../core/context.js";
import { decode_entity } from "../commonmark/prose.js";

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
export type RenderedLink = {
  from: number;
  to: number;
  target: string;
  label: string;
  image?: RenderedImage;
  image_resize?: ImageResizeRange;
};
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
const reference_cache = new WeakMap<
  ReturnType<typeof syntaxTree>,
  Map<string, string>
>();

export function link_from_node(
  state: EditorState,
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
    // A URL inside a link, autolink, image, or reference definition belongs
    // to that construct. Only a bare URL is its own link.
    if (has_ancestor(node, ["Link", "Autolink", "Image", "LinkReference"]))
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

function image_resize_range(
  state: EditorState,
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

function find_reference_targets(state: EditorState): Map<string, string> {
  const tree = syntaxTree(state);
  const cached = reference_cache.get(tree);
  if (cached) return cached;
  const targets = new Map<string, string>();
  tree.iterate({
    enter(reference) {
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
  state: EditorState,
  node: SyntaxNode,
  name: string,
): string {
  const range = child_range(node, name);
  return range ? state.sliceDoc(range.from, range.to) : "";
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
  state: EditorState,
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
    .replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, decode_entity);
}
