/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  create_markdown_state,
  get_markdown_source,
  source_undo,
  source_redo,
} from "../../../packages/markdown_editor/src/source_state";
import { syntaxTree } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import {
  destroy_markdown_image,
  image_rendering,
  render_markdown_image,
  type ImageRenderingOptions,
} from "../../../packages/markdown_editor/src/image_rendering";
import { link_rendering } from "../../../packages/markdown_editor/src/link_rendering";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { rich_markdown_rendering } from "../../../packages/markdown_editor/src/rich_rendering";
import { link_from_node } from "../../../packages/markdown_editor/src/link_rendering";

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function open_document(
  source: string,
  resolve_image: ImageRenderingOptions["resolve_image"],
  open_link = vi.fn(),
  read_only = false,
) {
  const view = new EditorView({
    parent: document.body,
    state: create_markdown_state(source, [
      EditorState.readOnly.of(read_only),
      keymap.of([
        { key: "Mod-z", run: source_undo, preventDefault: true },
        { key: "Mod-Shift-z", run: source_redo, preventDefault: true },
      ]),
      markdown_language(),
      rich_markdown_rendering(),
      image_rendering({ resolve_image }),
      link_rendering({
        open_link,
        render_image: (image, label, view, resize) =>
          render_markdown_image(image, label, view, resolve_image, {
            ...resize,
            on_resize: (ratio) => {
              view.dispatch({
                changes: {
                  from: resize.alt_from,
                  to: resize.alt_to,
                  insert: ratio.toFixed(2),
                },
                userEvent: "input.image.resize",
              });
            },
          }),
        destroy_image: destroy_markdown_image,
      }),
    ]),
  });
  views.push(view);
  return view;
}

function mock_image_dimensions() {
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    200,
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(
    100,
  );
  vi.spyOn(
    HTMLImageElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLImageElement) {
    return new DOMRect(0, 0, 200, Number.parseFloat(this.style.height) || 100);
  });
}

describe("CM6 image rendering", () => {
  it("resolves inline and reference images without rewriting Markdown", async () => {
    const source =
      "cursor\n\n![Alt &amp; text](./image.png)\n\n![Reference][picture]\n\n[picture]: assets/photo.png\n";
    const resolve_image = vi.fn(
      (source: string) => `https://example.invalid/${source}`,
    );
    const view = open_document(source, resolve_image);
    await vi.waitFor(() => {
      expect(view.dom.querySelectorAll(".md-image img")).toHaveLength(2);
    });
    expect(
      [...view.dom.querySelectorAll<HTMLImageElement>(".md-image img")].map(
        (image) => image.alt,
      ),
    ).toEqual(["Alt & text", "Reference"]);
    expect(resolve_image.mock.calls.map((call) => call[0])).toEqual([
      "./image.png",
      "assets/photo.png",
    ]);
    expect(view.dom.querySelector(".md-link-rendered")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("renders base64 data URLs unchanged without passing them to asset resolution", async () => {
    const data_url =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=";
    const source = `![pixel](${data_url})`;
    const resolve_image = vi.fn((image: string) => image);
    const view = open_document(source, resolve_image);

    let parsed_image: ReturnType<typeof link_from_node> = null;
    syntaxTree(view.state).iterate({
      enter(reference) {
        if (reference.name === "Image")
          parsed_image = link_from_node(view.state, reference.node);
        return;
      },
    });
    expect(parsed_image).toMatchObject({ target: data_url });

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image img")).not.toBeNull();
    });

    expect(resolve_image).toHaveBeenCalledWith(
      data_url,
      expect.any(AbortSignal),
    );
    expect(
      view.dom
        .querySelector<HTMLImageElement>(".md-image img")
        ?.getAttribute("src"),
    ).toBe(data_url);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("resizes from an accessible handle and persists only the legacy ratio alt", async () => {
    const source = "\uFEFFbefore\r\n\r\n![1.25](image.png)\r\n";
    const view = open_document(source, () => "resolved:image.png");
    expect(get_markdown_source(view.state)).toBe(source);

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image img")).not.toBeNull();
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    const image = view.dom.querySelector<HTMLImageElement>(".md-image img");
    const handle = view.dom.querySelector<HTMLElement>(".md-image-resize");
    if (!image || !handle) throw new Error("Missing image resize controls");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 200 },
      naturalHeight: { configurable: true, value: 100 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({
          top: 40,
          height: Number.parseFloat(image.style.height) || 100,
        }),
      },
    });
    image.dispatchEvent(new Event("load"));
    expect(image.style.height).toBe("125px");
    handle.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(get_markdown_source(view.state)).toBe(
      "\uFEFFbefore\r\n\r\n![1.41](image.png)\r\n",
    );
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it.each([
    "before\r\n\r\n![1.25](image.png)\r\n",
    "before\n\n[![1.25](image.png)](target.md)",
  ])(
    "retains slider focus for consecutive keyboard resizes: %s",
    async (source) => {
      mock_image_dimensions();
      const view = open_document(source, () => "resolved:image.png");
      await vi.waitFor(() => {
        expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
      });
      view.dom.querySelector(".md-image img")?.dispatchEvent(new Event("load"));
      const original = view.dom.querySelector<HTMLElement>(".md-image-resize");
      original?.focus();
      for (const ratio of ["1.41", "1.57"]) {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowUp",
            bubbles: true,
            cancelable: true,
          }),
        );
        await vi.waitFor(() => {
          expect(
            document.activeElement?.classList.contains("md-image-resize"),
          ).toBe(true);
          expect(document.activeElement).not.toBe(original);
        });
        expect(get_markdown_source(view.state)).toBe(
          source.replace("1.25", ratio),
        );
      }
      for (const [shiftKey, expected] of [
        [false, "1.41"],
        [false, "1.25"],
        [true, "1.41"],
      ] as const) {
        const before = document.activeElement;
        before?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "z",
            shiftKey,
            metaKey: /Mac/.test(navigator.platform),
            ctrlKey: !/Mac/.test(navigator.platform),
            bubbles: true,
            cancelable: true,
          }),
        );
        await vi.waitFor(() => {
          expect(
            document.activeElement?.classList.contains("md-image-resize"),
          ).toBe(true);
          expect(document.activeElement).not.toBe(before);
        });
        expect(get_markdown_source(view.state)).toBe(
          source.replace("1.25", expected),
        );
      }
      expect(source_undo(view)).toBe(true);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );

  it("does not steal focus if async image resolution finishes after the user leaves the slider", async () => {
    mock_image_dimensions();
    let resolve_pending: ((url: string) => void) | undefined;
    const resolver = vi.fn(() => Promise.resolve("resolved:image.png"));
    const view = open_document("before\n\n![1.25](image.png)", resolver);
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    view.dom.querySelector(".md-image img")?.dispatchEvent(new Event("load"));
    resolver.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolve_pending = resolve;
        }),
    );
    view.dom.querySelector<HTMLElement>(".md-image-resize")?.focus();
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() => {
      expect(resolve_pending).toBeDefined();
    });
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    resolve_pending?.("resolved:image.png");
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    expect(document.activeElement).toBe(button);
    expect(get_markdown_source(view.state)).toBe(
      "before\n\n![1.41](image.png)",
    );
  });

  it("commits pointer resizing on release and restores exact source on undo", async () => {
    const source = "before\n\n![Alt](image.png)";
    const view = open_document(source, () => "resolved:image.png");
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image img")).not.toBeNull();
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    const image = view.dom.querySelector<HTMLImageElement>(".md-image img");
    const handle = view.dom.querySelector<HTMLElement>(".md-image-resize");
    if (!image || !handle) throw new Error("Missing image resize controls");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 200 },
      naturalHeight: { configurable: true, value: 100 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ top: 40, height: 100 }),
      },
    });
    image.dispatchEvent(new Event("load"));
    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientY: 140,
      }),
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: 180 }));
    expect(get_markdown_source(view.state)).toBe(source);
    window.dispatchEvent(new MouseEvent("pointerup", { clientY: 180 }));

    expect(get_markdown_source(view.state)).toBe(
      "before\n\n![1.40](image.png)",
    );
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("keeps small images below 100px and does not resize on a handle click", async () => {
    const source = "before\n\n![0.75](small.png)";
    const view = open_document(source, () => "resolved:small.png");
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    const image = view.dom.querySelector<HTMLImageElement>(".md-image img");
    const handle = view.dom.querySelector<HTMLElement>(".md-image-resize");
    if (!image || !handle) throw new Error("Missing image resize controls");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 96 },
      naturalHeight: { configurable: true, value: 48 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({
          top: 40,
          height: Number.parseFloat(image.style.height) || 100,
        }),
      },
    });
    image.dispatchEvent(new Event("load"));
    expect(image.style.height).toBe("36px");

    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientY: 100,
      }),
    );
    window.dispatchEvent(new MouseEvent("pointerup", { clientY: 100 }));

    expect(document.activeElement).toBe(handle);
    expect(get_markdown_source(view.state)).toBe(source);
    handle.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(get_markdown_source(view.state)).toBe(
      "before\n\n![1.08](small.png)",
    );
  });

  it("does not resize images in a read-only editor", async () => {
    const source = "before\n\n![1.25](image.png)";
    const view = open_document(
      source,
      () => "resolved:image.png",
      vi.fn(),
      true,
    );
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image-resize")).not.toBeNull();
    });
    const handle = view.dom.querySelector<HTMLElement>(".md-image-resize");
    if (!handle) throw new Error("Missing image resize handle");

    expect(handle.getAttribute("aria-disabled")).toBe("true");
    expect(handle.tabIndex).toBe(-1);
    handle.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientY: 140,
      }),
    );
    window.dispatchEvent(new MouseEvent("pointerup", { clientY: 180 }));

    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("cancels an old image request when its source is revealed", async () => {
    let finish: ((url: string) => void) | undefined;
    let signal: AbortSignal | undefined;
    const source = "cursor\n\n![Alt](image.png)";
    const view = open_document(source, (_source, pending) => {
      signal = pending;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await vi.waitFor(() => {
      expect(finish).toBeDefined();
    });
    view.dispatch({ selection: { anchor: source.indexOf("Alt") } });
    expect(signal?.aborted).toBe(true);
    finish?.("https://example.invalid/image.png");
    await Promise.resolve();
    expect(view.dom.querySelector("img")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("shows a stable error without changing source when resolution fails", async () => {
    const source = "cursor\n\n![Missing](missing.png)";
    const view = open_document(source, () =>
      Promise.reject(new Error("missing")),
    );
    await vi.waitFor(() => {
      expect(view.dom.textContent).toContain("Image unavailable: Missing");
    });
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps image syntax inside frontmatter and code literal", async () => {
    const resolve_image = vi.fn(() => "image.png");
    const source =
      '---\nimage: "![a](a.png)"\n---\n\n`![b](b.png)`\n\n```md\n![c](c.png)\n```';
    const view = open_document(source, resolve_image);
    await Promise.resolve();
    expect(resolve_image).not.toHaveBeenCalled();
    expect(view.dom.querySelector(".md-image")).toBeNull();
  });

  it("renders an image in a task item and reveals its source when selected", async () => {
    const source = "before\n\n- [ ] ![Alt](image.png)\n\nafter";
    const resolve_image = vi.fn(() => "https://example.invalid/image.png");
    const view = open_document(source, resolve_image);
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-image img")).not.toBeNull();
    });
    expect(view.dom.querySelector(".md-task-checkbox")).not.toBeNull();
    view.dispatch({ selection: { anchor: source.indexOf("Alt") + 1 } });
    expect(view.dom.querySelector(".md-image")).toBeNull();
    expect(view.contentDOM.textContent).toContain("![Alt](image.png)");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("renders an image nested inside its outer link target", async () => {
    const source = "cursor\n\n[![Alt](image.png)](target.md)";
    const resolve_image = vi.fn((image: string) => `resolved:${image}`);
    const open_link = vi.fn();
    const view = open_document(source, resolve_image, open_link);
    await vi.waitFor(() => {
      expect(
        view.dom
          .querySelector<HTMLImageElement>(".md-image img")
          ?.getAttribute("src"),
      ).toBe("resolved:image.png");
    });
    const link = view.dom.querySelector<HTMLElement>("[data-md-link-target]");
    expect(link?.dataset.mdLinkTarget).toBe("target.md");
    expect(link?.getAttribute("aria-label")).toBe("Open Alt");
    expect(link?.querySelector("img")?.alt).toBe("Alt");
    expect(resolve_image).toHaveBeenCalledWith(
      "image.png",
      expect.any(AbortSignal),
    );
    const handle = link?.querySelector<HTMLElement>(".md-image-resize");
    expect(handle).not.toBeNull();
    handle?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0 }),
    );
    expect(open_link).not.toHaveBeenCalled();
    link
      ?.querySelector("img")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("target.md");
    expect(view.state.doc.toString()).toBe(source);
  });
});
