import { describe, expect, it } from "vitest";
import { build_theme_file_schema } from "$lib/features/theme/domain/theme_file_schema";
import { parse_theme_file } from "$lib/features/theme/domain/parse_theme_file";
import { STYLE_DESCRIPTORS } from "$lib/features/theme/domain/theme_style_descriptors";

type PropertySchema = {
  minimum?: number;
  maximum?: number;
  enum?: string[];
  pattern?: string;
};

// A valid value for each key the schema lists. Add one here when the schema
// gets a key that is not a style descriptor.
function sample_value(key: string): unknown {
  switch (key) {
    case "$schema":
      return "./theme.schema.json";
    case "name":
      return "Sample";
    case "extends":
      return "nordic-light";
    case "tokens":
      return { "--sidebar": "red" };
  }
  const desc = STYLE_DESCRIPTORS.find((d) => d.theme_key === key);
  if (!desc) throw new Error(`no sample value for schema key ${key}`);
  switch (desc.control) {
    case "slider":
      return desc.min;
    case "select":
      return desc.options?.[0]?.value;
    case "font_select":
      return "Inter";
    case "color":
      return "red";
  }
}

describe("build_theme_file_schema", () => {
  const schema = build_theme_file_schema();
  const properties = schema.properties as Record<string, PropertySchema>;

  it("only allows keys the parser accepts", () => {
    const file = Object.fromEntries(
      Object.keys(properties).map((key) => [key, sample_value(key)]),
    );

    const result = parse_theme_file(JSON.stringify(file), () => true);

    expect(result).toMatchObject({ status: "valid" });
    expect(schema.additionalProperties).toBe(false);
  });

  it("agrees with the parser on which names are blank", () => {
    const name_pattern = new RegExp(properties.name?.pattern ?? "$^");

    for (const name of ["   ", "\t", "Desk lamp", " a "]) {
      const parsed = parse_theme_file(JSON.stringify({ name }), () => true);

      expect(name_pattern.test(name)).toBe(parsed.status === "valid");
    }
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
