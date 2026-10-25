import { describe, it, expect } from "vitest";
import {
  STYLE_DESCRIPTORS,
  STYLE_CATEGORY_ORDER,
  STYLE_CATEGORY_LABELS,
  get_descriptors_by_category,
  type ThemeStyleCategory,
} from "$lib/features/theme/domain/theme_style_descriptors";

describe("theme_style_descriptors", () => {
  it("contains descriptors for all expected categories", () => {
    const categories = new Set(STYLE_DESCRIPTORS.map((d) => d.category));
    for (const cat of STYLE_CATEGORY_ORDER) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it("every descriptor has a unique id", () => {
    const ids = STYLE_DESCRIPTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every descriptor has non-empty label, description, and tags", () => {
    for (const desc of STYLE_DESCRIPTORS) {
      expect(desc.label.length).toBeGreaterThan(0);
      expect(desc.description.length).toBeGreaterThan(0);
      expect(desc.tags.length).toBeGreaterThan(0);
    }
  });

  it("slider descriptors have min, max, and step", () => {
    const sliders = STYLE_DESCRIPTORS.filter((d) => d.control === "slider");
    for (const desc of sliders) {
      expect(desc.min).toBeDefined();
      expect(desc.max).toBeDefined();
      expect(desc.step).toBeDefined();
      expect(desc.max ?? 0).toBeGreaterThan(desc.min ?? 0);
    }
  });

  it("select descriptors have options", () => {
    const selects = STYLE_DESCRIPTORS.filter((d) => d.control === "select");
    for (const desc of selects) {
      expect(desc.options).toBeDefined();
      expect(desc.options?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("all category labels are defined", () => {
    for (const cat of STYLE_CATEGORY_ORDER) {
      expect(STYLE_CATEGORY_LABELS[cat]).toBeDefined();
      expect(STYLE_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });

  it("get_descriptors_by_category groups correctly", () => {
    const grouped = get_descriptors_by_category();
    let total = 0;
    for (const [cat, descs] of grouped) {
      for (const desc of descs) {
        expect(desc.category).toBe(cat);
      }
      total += descs.length;
    }
    expect(total).toBe(STYLE_DESCRIPTORS.length);
  });

  it("descriptor theme_keys are valid Theme properties", () => {
    const known_keys = new Set([
      "color_scheme",
      "font_family_sans",
      "font_family_mono",
      "accent_hue",
      "accent_chroma",
      "font_size",
      "line_height",
      "paragraph_spacing",
      "heading_spacing_after",
      "list_item_spacing",
      "spacing",
      "editor_text_color",
      "link_color",
      "editor_padding_x",
      "editor_padding_y",
      "editor_max_width_ch",
      "ui_radius",
      "file_tree_density",
      "heading_color",
      "heading_font_weight",
      "heading_1_size",
      "heading_2_size",
      "heading_3_size",
      "heading_4_size",
      "heading_5_size",
      "heading_6_size",
      "bold_style",
      "bold_color",
      "italic_color",
      "blockquote_style",
      "blockquote_border_color",
      "blockquote_bg_color",
      "blockquote_text_color",
      "inline_code_bg",
      "inline_code_text_color",
      "code_block_style",
      "code_block_bg",
      "code_block_text_color",
      "code_block_radius",
      "highlight_bg",
      "highlight_text_color",
      "selection_bg",
      "caret_color",
      "table_border_color",
      "table_header_bg",
      "table_cell_padding",
    ]);

    for (const desc of STYLE_DESCRIPTORS) {
      expect(known_keys.has(desc.theme_key)).toBe(true);
    }
  });

  it("category order includes all categories used by descriptors", () => {
    const used: Set<ThemeStyleCategory> = new Set(
      STYLE_DESCRIPTORS.map((d) => d.category),
    );
    for (const cat of used) {
      expect(STYLE_CATEGORY_ORDER).toContain(cat);
    }
  });
});
