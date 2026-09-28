import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

describe("task list styling", () => {
  test("styles only a checked item's own text and checkbox", () => {
    const css = readFileSync(
      new URL("../../../src/styles/editor.css", import.meta.url),
      "utf-8",
    );
    const normalized = css.replace(/\s+/g, " ");

    expect(normalized).toContain(
      ".milkdown-list-item-block > .list-item:has(> .label-wrapper .label.checked) > .children > .content-dom > p",
    );
    expect(normalized).not.toContain(
      ".list-item:has(> .label-wrapper .label.checked) .label.unchecked",
    );
  });
});
