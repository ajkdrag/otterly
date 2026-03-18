import { describe, expect, it } from "vitest";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import {
  attach_code_block_visual_metadata,
  normalize_persisted_code_block_height,
  parse_code_block_visual_comment,
  read_code_block_visual_height,
  serialize_code_block_visual_comment,
} from "$lib/features/editor/adapters/code_block_visual_metadata";

function make_root(children: MarkdownNode[]): MarkdownNode {
  return {
    type: "root",
    children,
  };
}

describe("code_block_visual_metadata", () => {
  it("parses an otterly code block height comment", () => {
    expect(
      parse_code_block_visual_comment(
        '<!-- otterly:code-block {"height":320} -->',
      ),
    ).toEqual({ height: 320 });
  });

  it("ignores malformed comments", () => {
    expect(
      parse_code_block_visual_comment(
        '<!-- otterly:code-block {"height":"tall"} -->',
      ),
    ).toBeNull();
  });

  it("normalizes persisted heights into the supported range", () => {
    expect(normalize_persisted_code_block_height(10)).toBe(48);
    expect(normalize_persisted_code_block_height(6000)).toBe(4096);
    expect(normalize_persisted_code_block_height("320")).toBeNull();
  });

  it("attaches metadata to the immediately following code block", () => {
    const root = make_root([
      {
        type: "html",
        value: '<!-- otterly:code-block {"height":320} -->',
      },
      {
        type: "code",
        lang: "ts",
        value: "const value = 1;",
      },
    ]);

    const transformed = attach_code_block_visual_metadata(root);

    expect(transformed.children).toHaveLength(1);
    expect(transformed.children?.[0]?.type).toBe("code");
    expect(
      read_code_block_visual_height(transformed.children?.[0] as MarkdownNode),
    ).toBe(320);
  });

  it("drops otterly comments that are not attached to a code block", () => {
    const root = make_root([
      {
        type: "html",
        value: '<!-- otterly:code-block {"height":320} -->',
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "hello" }],
      },
    ]);

    const transformed = attach_code_block_visual_metadata(root);

    expect(transformed.children).toHaveLength(1);
    expect(transformed.children?.[0]?.type).toBe("paragraph");
  });

  it("attaches metadata recursively inside nested markdown nodes", () => {
    const root = make_root([
      {
        type: "blockquote",
        children: [
          {
            type: "html",
            value: '<!-- otterly:code-block {"height":420} -->',
          },
          {
            type: "code",
            value: "nested",
          },
        ],
      },
    ]);

    const transformed = attach_code_block_visual_metadata(root);
    const nested_code = transformed.children?.[0]
      ?.children?.[0] as MarkdownNode;

    expect(nested_code.type).toBe("code");
    expect(read_code_block_visual_height(nested_code)).toBe(420);
  });

  it("uses the last consecutive metadata comment before a code block", () => {
    const root = make_root([
      {
        type: "html",
        value: '<!-- otterly:code-block {"height":320} -->',
      },
      {
        type: "html",
        value: '<!-- otterly:code-block {"height":420} -->',
      },
      {
        type: "code",
        value: "nested",
      },
    ]);

    const transformed = attach_code_block_visual_metadata(root);

    expect(transformed.children).toHaveLength(1);
    expect(
      read_code_block_visual_height(transformed.children?.[0] as MarkdownNode),
    ).toBe(420);
  });

  it("serializes a persisted code block height comment", () => {
    expect(serialize_code_block_visual_comment(320)).toBe(
      '<!-- otterly:code-block {"height":320} -->',
    );
  });
});
