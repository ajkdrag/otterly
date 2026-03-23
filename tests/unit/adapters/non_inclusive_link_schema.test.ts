import { describe, expect, it } from "vitest";
import { override_link_schema_to_be_non_inclusive } from "$lib/features/editor/adapters/non_inclusive_link_schema";

describe("override_link_schema_to_be_non_inclusive", () => {
  it("preserves the existing spec and forces inclusive to false", () => {
    const previous = () => ({
      attrs: { href: { validate: "string" } },
      inclusive: true,
      parseDOM: [],
      parseMarkdown: {
        match: () => true,
        runner: () => {},
      },
      toMarkdown: {
        match: () => true,
        runner: () => {},
      },
    });

    const next = override_link_schema_to_be_non_inclusive(previous);
    const spec = next({} as never);

    expect(spec).toMatchObject({
      attrs: { href: { validate: "string" } },
      inclusive: false,
      parseDOM: [],
    });
  });
});
