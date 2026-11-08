import { LanguageDescription } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import {
  code_languages,
  render_code_language,
} from "$lib/features/editor/adapters/code_editor_config";

describe("code language list", () => {
  it("offers math and mermaid, which language-data has no grammar for", () => {
    const names = code_languages.map((language) => language.name);
    expect(names).toContain("math");
    expect(names).toContain("mermaid");
  });

  it("resolves a math fence to math, not to Mathematica", () => {
    const match = LanguageDescription.matchLanguageName(
      code_languages,
      "math",
      true,
    );
    expect(match?.name).toBe("math");
    expect(render_code_language("math")).toBe("Math");
  });

  it("still resolves mathematica to Mathematica", () => {
    expect(render_code_language("mathematica")).toBe("Mathematica");
  });
});
