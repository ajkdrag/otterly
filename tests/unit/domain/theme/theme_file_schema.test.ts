import { describe, expect, it } from "vitest";
import { build_theme_file_schema } from "$lib/features/theme/domain/theme_file_schema";
import { THEME_FILE_KEYS } from "$lib/features/theme/domain/parse_theme_file";
import { STYLE_DESCRIPTORS } from "$lib/features/theme/domain/theme_style_descriptors";

type PropertySchema = {
  minimum?: number;
  maximum?: number;
  enum?: string[];
};

describe("build_theme_file_schema", () => {
  const schema = build_theme_file_schema();
  const properties = schema.properties as Record<string, PropertySchema>;

  it("allows exactly the keys the parser accepts", () => {
    expect(Object.keys(properties).sort()).toEqual([...THEME_FILE_KEYS].sort());
    expect(schema.additionalProperties).toBe(false);
  });

  it("uses the descriptor ranges and options", () => {
    for (const desc of STYLE_DESCRIPTORS) {
      const property = properties[desc.theme_key];
      if (desc.control === "slider") {
        expect(property).toMatchObject({
          minimum: desc.min,
          maximum: desc.max,
        });
      }
      if (desc.control === "select") {
        expect(property?.enum).toEqual(desc.options?.map((o) => o.value));
      }
    }
  });
});
