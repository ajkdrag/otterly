import { describe, it, expect, vi, beforeAll } from "vitest";
import { create_wiki_link_click_prose_plugin } from "$lib/features/editor/adapters/wiki_link_plugin";

class MockElement {
  closest(_selector: string): unknown {
    return null;
  }
}

class MockAnchorElement extends MockElement {
  private readonly _href: string;
  constructor(href: string) {
    super();
    this._href = href;
  }
  override closest(selector: string): unknown {
    if (selector === "a[href]") return this;
    return null;
  }
  getAttribute(name: string): string | null {
    return name === "href" ? this._href : null;
  }
}

beforeAll(() => {
  if (typeof globalThis.Element === "undefined") {
    (globalThis as Record<string, unknown>).Element = MockElement;
  }
  if (typeof globalThis.HTMLAnchorElement === "undefined") {
    (globalThis as Record<string, unknown>).HTMLAnchorElement =
      MockAnchorElement;
  }
});

function create_mouse_event(
  href: string | null,
  overrides?: Partial<MouseEvent>,
) {
  const prevent_default = vi.fn();
  const stop_propagation = vi.fn();
  const target = href ? new MockAnchorElement(href) : null;

  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target,
    preventDefault: prevent_default,
    stopPropagation: stop_propagation,
    ...overrides,
  } as unknown as MouseEvent;
  return { event, prevent_default, stop_propagation };
}

describe("create_wiki_link_click_prose_plugin", () => {
  function setup(base_note_path = "folder/current.md") {
    const on_internal_link_click = vi.fn();
    const on_external_link_click = vi.fn();
    const on_file_link_click = vi.fn();

    const plugin = create_wiki_link_click_prose_plugin({
      base_note_path,
      on_internal_link_click,
      on_external_link_click,
      on_file_link_click,
    });

    return {
      plugin,
      on_internal_link_click,
      on_external_link_click,
      on_file_link_click,
    };
  }

  function invoke_dom_click(
    plugin: ReturnType<typeof create_wiki_link_click_prose_plugin>,
    event: MouseEvent,
  ) {
    const handler = plugin.props.handleDOMEvents?.click;
    if (!handler) return false;
    return handler.call(plugin, null as never, event as never);
  }

  describe("internal link passthrough", () => {
    it("passes raw href and base note path for bare .md href", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event, prevent_default } = create_mouse_event("note.md");

      invoke_dom_click(plugin, event);

      expect(prevent_default).toHaveBeenCalled();
      expect(on_internal_link_click).toHaveBeenCalledWith(
        "note.md",
        "folder/current.md",
      );
    });

    it("passes vault-relative path as raw href", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("docs/sub/note.md");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "docs/sub/note.md",
        "folder/current.md",
      );
    });

    it("passes note-relative path as raw href", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("./sibling.md");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "./sibling.md",
        "folder/current.md",
      );
    });

    it("passes parent-relative path as raw href", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("../other.md");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "../other.md",
        "folder/current.md",
      );
    });

    it("passes href without extension as raw path", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("folder/note");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "folder/note",
        "folder/current.md",
      );
    });

    it("strips fragment from href before passing", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("note.md#section");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "note.md",
        "folder/current.md",
      );
    });

    it("strips query string from href before passing", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("note.md?param=1");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "note.md",
        "folder/current.md",
      );
    });

    it("decodes percent-encoded paths", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("my%20notes/todo%20list.md");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "my notes/todo list.md",
        "folder/current.md",
      );
    });

    it("uses base_note_path from constructor when no editor context", () => {
      const { plugin, on_internal_link_click } = setup("deep/nested/source.md");
      const { event } = create_mouse_event("target.md");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).toHaveBeenCalledWith(
        "target.md",
        "deep/nested/source.md",
      );
    });
  });

  describe("external links", () => {
    it("fires external callback for https links", () => {
      const { plugin, on_external_link_click, on_internal_link_click } =
        setup();
      const { event } = create_mouse_event("https://example.com");

      invoke_dom_click(plugin, event);

      expect(on_external_link_click).toHaveBeenCalledWith(
        "https://example.com",
      );
      expect(on_internal_link_click).not.toHaveBeenCalled();
    });

    it("fires external callback for http links", () => {
      const { plugin, on_external_link_click } = setup();
      const { event } = create_mouse_event("http://example.com/page");

      invoke_dom_click(plugin, event);

      expect(on_external_link_click).toHaveBeenCalledWith(
        "http://example.com/page",
      );
    });
  });

  describe("filtered clicks", () => {
    it("ignores non-left clicks", () => {
      const { plugin } = setup();
      const { event, prevent_default } = create_mouse_event("note.md", {
        button: 2,
      });

      expect(invoke_dom_click(plugin, event)).toBe(false);
      expect(prevent_default).not.toHaveBeenCalled();
    });

    it("ignores meta key", () => {
      const { plugin } = setup();
      const { event, prevent_default } = create_mouse_event("note.md", {
        metaKey: true,
      });

      expect(invoke_dom_click(plugin, event)).toBe(false);
      expect(prevent_default).not.toHaveBeenCalled();
    });

    it("ignores ctrl key", () => {
      const { plugin } = setup();
      const { event, prevent_default } = create_mouse_event("note.md", {
        ctrlKey: true,
      });

      expect(invoke_dom_click(plugin, event)).toBe(false);
      expect(prevent_default).not.toHaveBeenCalled();
    });

    it("ignores non-anchor elements", () => {
      const { plugin } = setup();
      const { event, prevent_default } = create_mouse_event(null);

      expect(invoke_dom_click(plugin, event)).toBe(false);
      expect(prevent_default).not.toHaveBeenCalled();
    });
  });

  describe("file links", () => {
    it("opens other files relative to the note", () => {
      const { plugin, on_file_link_click, on_internal_link_click } = setup();
      const { event, prevent_default } = create_mouse_event("document.pdf");

      invoke_dom_click(plugin, event);

      expect(prevent_default).toHaveBeenCalled();
      expect(on_file_link_click).toHaveBeenCalledWith("folder/document.pdf");
      expect(on_internal_link_click).not.toHaveBeenCalled();
    });

    it("resolves parent paths and drops the fragment", () => {
      const { plugin, on_file_link_click } = setup("a/b/current.md");
      const { event } = create_mouse_event("../files/My%20Budget.xlsx#Sheet1");

      invoke_dom_click(plugin, event);

      expect(on_file_link_click).toHaveBeenCalledWith("a/files/My Budget.xlsx");
    });

    it("ignores other url schemes like mailto", () => {
      const { plugin, on_file_link_click, on_internal_link_click } = setup();
      const { event } = create_mouse_event("mailto:someone@example.com");

      invoke_dom_click(plugin, event);

      expect(on_file_link_click).not.toHaveBeenCalled();
      expect(on_internal_link_click).not.toHaveBeenCalled();
    });
  });

  describe("rejected hrefs", () => {
    it("rejects empty href", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).not.toHaveBeenCalled();
    });

    it("rejects href that is only a fragment", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("#section");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).not.toHaveBeenCalled();
    });

    it("rejects directory-only path with trailing slash", () => {
      const { plugin, on_internal_link_click } = setup();
      const { event } = create_mouse_event("folder/");

      invoke_dom_click(plugin, event);

      expect(on_internal_link_click).not.toHaveBeenCalled();
    });
  });
});
