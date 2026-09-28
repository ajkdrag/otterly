import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apply_editor_zoom } from "$lib/shared/utils/apply_editor_zoom";

const original_document = globalThis.document;

describe("apply_editor_zoom", () => {
  let properties: Map<string, string>;

  beforeEach(() => {
    properties = new Map<string, string>();
    globalThis.document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => {
            properties.set(name, value);
          },
        },
      },
    } as Document;
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("sets the editor zoom factor", () => {
    apply_editor_zoom(1.2);

    expect(properties.get("--editor-zoom")).toBe("1.2");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;

    expect(() => {
      apply_editor_zoom(1.2);
    }).not.toThrow();
  });
});
