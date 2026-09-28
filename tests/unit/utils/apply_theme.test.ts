import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { apply_theme } from "$lib/shared/utils/apply_theme";
import {
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_DARK,
  BUILTIN_NORDIC_LIGHT,
} from "$lib/shared/types/theme";

describe("apply_theme", () => {
  const original_document = globalThis.document;
  let store: Map<string, string>;
  let attributes: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    attributes = new Map<string, string>();
    const root = {
      style: {
        setProperty: (name: string, value: string) => {
          store.set(name, value);
        },
        removeProperty: (name: string) => {
          store.delete(name);
        },
      },
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    };

    const document_stub = { documentElement: root };
    globalThis.document = document_stub as Document;

    const localStorage_stub = {
      getItem: () => null,
      setItem: () => {},
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorage_stub,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("sets data-color-scheme attribute for dark theme", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(attributes.get("data-color-scheme")).toBe("dark");
  });

  it("sets data-color-scheme attribute for light theme", () => {
    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(attributes.get("data-color-scheme")).toBe("light");
  });

  it("sets color-scheme CSS property", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("color-scheme")).toBe("dark");
  });

  it("sets accent parametric tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--accent-hue")).toBe("155");
    expect(store.get("--accent-chroma")).toBe("0.11");
  });

  it("sets font family tokens", () => {
    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(store.get("--font-family-sans")).toContain("IBM Plex Sans");
    expect(store.get("--font-family-mono")).toContain("IBM Plex Mono");
  });

  it("sets editor typography tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--editor-font-size")).toBe("1rem");
    expect(store.get("--editor-line-height")).toBe("1.7");
    expect(store.get("--editor-spacing")).toBe("1.5rem");
    expect(store.get("--editor-heading-color")).toBe("var(--foreground)");
    expect(store.get("--editor-heading-font")).toBe("var(--font-heading)");
  });

  it("cleans up previous theme properties on switch", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      editor_text_color: "oklch(0.5 0.1 200)",
    };
    apply_theme(custom);
    expect(store.has("--editor-text")).toBe(true);

    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(store.has("--editor-text")).toBe(false);
  });

  it("removes Mocha surfaces while keeping the shared heading font", () => {
    apply_theme(BUILTIN_MOCHA);
    expect(store.get("--background")).toBe("light-dark(#eff1f5, #1e1e2e)");
    expect(store.get("--editor-heading-font")).toBe("var(--font-heading)");

    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(store.has("--background")).toBe(false);
    expect(store.get("--editor-heading-font")).toBe("var(--font-heading)");
    expect(store.get("--font-family-sans")).toContain("IBM Plex Sans");
  });

  it("applies token_overrides", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      is_builtin: false,
      id: "custom",
      token_overrides: { "--custom-var": "test-value" },
    };
    apply_theme(custom);
    expect(store.get("--custom-var")).toBe("test-value");
  });

  it("sets heading weight and bold weight tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--editor-heading-weight")).toBe("500");
    expect(store.get("--editor-bold-weight")).toBe("600");
  });

  it("applies bold accent color style", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      is_builtin: false,
      id: "custom-bold",
      bold_style: "color-accent" as const,
    };
    apply_theme(custom);
    expect(store.get("--editor-bold-color")).toBe("var(--primary)");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;
    expect(() => {
      apply_theme(BUILTIN_NORDIC_DARK);
    }).not.toThrow();
    globalThis.document = original_document;
  });
});
