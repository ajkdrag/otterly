import type { MarkdownNode } from "@milkdown/kit/transformer";

const CODE_BLOCK_HEIGHT_MIN = 48;
const CODE_BLOCK_HEIGHT_MAX = 4096;
const CODE_BLOCK_VISUAL_METADATA_PREFIX = "otterly:code-block";
const CODE_BLOCK_VISUAL_HEIGHT_KEY = "otterlyCodeBlockHeight";

type CodeBlockVisualMetadata = {
  height: number;
};

type NodeWithChildren = {
  children?: unknown;
};

function as_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalize_persisted_code_block_height(
  value: unknown,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const rounded = Math.round(value);
  if (rounded < CODE_BLOCK_HEIGHT_MIN) return CODE_BLOCK_HEIGHT_MIN;
  if (rounded > CODE_BLOCK_HEIGHT_MAX) return CODE_BLOCK_HEIGHT_MAX;
  return rounded;
}

export function parse_code_block_visual_comment(
  value: string,
): CodeBlockVisualMetadata | null {
  const match = value.match(
    /^<!--\s*otterly:code-block\s+(\{[\s\S]*\})\s*-->$/,
  );
  if (!match) return null;

  const payload = match[1];
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as unknown;
    const record = as_record(parsed);
    if (!record) return null;

    const height = normalize_persisted_code_block_height(record["height"]);
    if (height === null) return null;

    return { height };
  } catch {
    return null;
  }
}

export function serialize_code_block_visual_comment(height: number): string {
  return `<!-- ${CODE_BLOCK_VISUAL_METADATA_PREFIX} ${JSON.stringify({ height })} -->`;
}

function set_code_block_visual_height(
  node: MarkdownNode,
  height: number,
): MarkdownNode {
  const data = as_record(node.data) ?? {};

  return {
    ...node,
    data: {
      ...data,
      [CODE_BLOCK_VISUAL_HEIGHT_KEY]: height,
    },
  };
}

function fold_code_block_visual_metadata(
  children: MarkdownNode[],
): MarkdownNode[] {
  const next_children: MarkdownNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) continue;
    let metadata: CodeBlockVisualMetadata | null = null;
    let metadata_end_index = index - 1;

    for (let cursor = index; cursor < children.length; cursor += 1) {
      const current = children[cursor];
      if (!current) break;
      if (current.type !== "html" || typeof current.value !== "string") break;

      const parsed = parse_code_block_visual_comment(current.value);
      if (!parsed) break;

      metadata = parsed;
      metadata_end_index = cursor;
    }

    if (metadata && metadata_end_index >= index) {
      const next_child = children[metadata_end_index + 1];

      if (next_child?.type === "code") {
        next_children.push(
          set_code_block_visual_height(
            attach_code_block_visual_metadata(next_child),
            metadata.height,
          ),
        );
        index = metadata_end_index + 1;
        continue;
      }

      index = metadata_end_index;
      continue;
    }

    next_children.push(attach_code_block_visual_metadata(child));
  }

  return next_children;
}

export function attach_code_block_visual_metadata(
  node: MarkdownNode,
): MarkdownNode;
export function attach_code_block_visual_metadata<T extends NodeWithChildren>(
  node: T,
): T;
export function attach_code_block_visual_metadata<T extends NodeWithChildren>(
  node: T,
): T {
  if (!Array.isArray(node.children)) return node;

  return {
    ...node,
    children: fold_code_block_visual_metadata(node.children as MarkdownNode[]),
  } as T;
}

export function read_code_block_visual_height(
  node: MarkdownNode,
): number | null {
  const data = as_record(node.data);
  if (!data) return null;
  return normalize_persisted_code_block_height(
    data[CODE_BLOCK_VISUAL_HEIGHT_KEY],
  );
}
