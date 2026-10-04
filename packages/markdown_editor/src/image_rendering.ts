import { syntaxTree } from "@codemirror/language";
import { StateEffect, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  runScopeHandlers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { get_frontmatter_end } from "./frontmatter_range.js";
import { link_from_node, type ImageResizeRange } from "./link_rendering.js";
import { get_find_query, selected_find_intersects } from "./find_highlights.js";

export type ImageRenderingOptions = {
  resolve_image: (
    source: string,
    signal: AbortSignal,
  ) => string | Promise<string>;
};

export function render_markdown_image(
  source: string,
  label: string,
  view: EditorView,
  resolve_image: ImageRenderingOptions["resolve_image"],
  resize?: ImageResizeContext,
): HTMLElement {
  const host = document.createElement("span");
  host.className = "md-image";
  const placeholder = document.createElement("span");
  placeholder.textContent = label ? `Loading image: ${label}` : "Loading image";
  placeholder.setAttribute("role", "status");
  host.append(placeholder);
  const abort = new AbortController();
  image_loads.set(host, abort);
  const pending_focus = image_resize_focus.get(view);
  const restore_focus =
    resize &&
    pending_focus?.from === resize.from &&
    pending_focus.source === source
      ? pending_focus
      : undefined;
  const clear_focus = () => {
    if (restore_focus && image_resize_focus.get(view) === restore_focus)
      image_resize_focus.delete(view);
  };
  abort.signal.addEventListener("abort", clear_focus, { once: true });
  void Promise.resolve()
    .then(() =>
      abort.signal.aborted ? null : resolve_image(source, abort.signal),
    )
    .then((url) => {
      if (abort.signal.aborted) return;
      if (!url) {
        show_error();
        return;
      }
      const image = document.createElement("img");
      image.alt = label;
      image.loading = "lazy";
      image.decoding = "async";
      const update_height = (ratio: number) => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        const max_width =
          host.parentElement?.clientWidth || view.contentDOM.clientWidth;
        const scaled_height =
          max_width > 0 && image.naturalWidth > max_width
            ? max_width * (image.naturalHeight / image.naturalWidth)
            : image.naturalHeight;
        const base_height = Math.max(1, Math.min(4096, scaled_height));
        image.dataset.baseHeight = String(base_height);
        const rendered_height = Math.max(
          1,
          Math.min(4096, base_height * ratio),
        );
        image.style.height = `${String(rendered_height)}px`;
        const handle = host.querySelector<HTMLElement>(".md-image-resize");
        if (handle)
          handle.setAttribute(
            "aria-valuenow",
            String(Math.round(rendered_height)),
          );
      };
      image.style.maxWidth = "100%";
      image.style.objectFit = "contain";
      image.onload = () => {
        if (abort.signal.aborted) return;
        update_height(resize?.ratio ?? 1);
        view.requestMeasure();
      };
      image.onerror = () => {
        if (!abort.signal.aborted) show_error();
      };
      image.src = url;
      if (resize) {
        // The source patch replaces the widget. Retain its measured base while
        // the same image reloads so another key press can resize immediately.
        if (restore_focus) {
          image.dataset.baseHeight = String(restore_focus.base_height);
          image.style.height = `${String(Math.max(1, Math.min(4096, restore_focus.base_height * resize.ratio)))}px`;
        }
        const handle = create_image_resize_handle(
          label,
          image,
          resize.ratio,
          (ratio) => {
            remember_resize_focus();
            resize.on_resize(ratio);
          },
          () => !view.state.readOnly,
        );
        const remember_resize_focus = () => {
          if (document.activeElement === handle) {
            image_resize_focus.set(view, {
              from: resize.from,
              source,
              base_height: Number(image.dataset.baseHeight),
            });
          }
        };
        handle.addEventListener("keydown", (event) => {
          if (
            !(event.metaKey || event.ctrlKey) ||
            event.altKey ||
            !["z", "y"].includes(event.key.toLowerCase())
          )
            return;
          // Widget events bypass the content keymap. Use the host's registered
          // history bindings so the focused slider shares the source undo stack.
          remember_resize_focus();
          if (runScopeHandlers(view, event, "editor")) {
            event.preventDefault();
            event.stopPropagation();
          }
          if (host.isConnected) image_resize_focus.delete(view);
        });
        host.replaceChildren(image, handle);
        if (restore_focus && image_resize_focus.get(view) === restore_focus) {
          // Do not steal focus if the user moved elsewhere during resolution.
          if (
            host.isConnected &&
            (document.activeElement === document.body ||
              document.activeElement === document.documentElement)
          )
            handle.focus({ preventScroll: true });
          clear_focus();
        }
      } else {
        host.replaceChildren(image);
      }
      if (image.complete && image.naturalWidth > 0)
        update_height(resize?.ratio ?? 1);
      view.requestMeasure();
    })
    .catch(() => {
      if (!abort.signal.aborted) show_error();
    });
  function show_error() {
    clear_focus();
    placeholder.textContent = label
      ? `Image unavailable: ${label}`
      : "Image unavailable";
    host.replaceChildren(placeholder);
    view.requestMeasure();
  }
  return host;
}

export function destroy_markdown_image(host: HTMLElement) {
  image_loads.get(host)?.abort();
  for (const handle of host.querySelectorAll<HTMLElement>(".md-image-resize"))
    image_cleanups.get(handle)?.();
}

type ImageResizeContext = ImageResizeRange & {
  on_resize: (ratio: number) => void;
};

function create_image_resize_handle(
  label: string,
  image: HTMLImageElement,
  initial_ratio: number,
  on_resize: (ratio: number) => void,
  can_resize: () => boolean,
): HTMLElement {
  const handle = document.createElement("div");
  handle.className = "md-image-resize";
  handle.setAttribute("role", "slider");
  handle.setAttribute("tabindex", "0");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", `Resize image ${label || "image"}`);
  handle.setAttribute("aria-valuemin", "1");
  handle.setAttribute("aria-valuemax", "4096");
  handle.setAttribute("aria-disabled", String(!can_resize()));
  handle.tabIndex = can_resize() ? 0 : -1;
  const initial_height =
    Number(image.dataset.baseHeight) * initial_ratio || 100;
  handle.setAttribute("aria-valuenow", String(Math.round(initial_height)));
  handle.addEventListener("click", stop_image_pointer_event);
  const update_ratio = (height: number, commit: boolean) => {
    const base_height = Number(image.dataset.baseHeight);
    if (!base_height || !Number.isFinite(base_height)) return;
    const next_height = Math.max(1, Math.min(4096, height));
    image.style.height = `${String(next_height)}px`;
    handle.setAttribute("aria-valuenow", String(Math.round(next_height)));
    if (commit && can_resize())
      on_resize(Number((next_height / base_height).toFixed(2)));
  };
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  handle.addEventListener("pointerdown", (event) => {
    stop(event);
    if (event.button !== 0 || !can_resize()) return;
    handle.focus();
    const start_y = event.clientY;
    const start_height = image.getBoundingClientRect().height;
    let did_move = false;
    const move = (move_event: PointerEvent) => {
      move_event.preventDefault();
      const delta = move_event.clientY - start_y;
      did_move ||= delta !== 0;
      update_ratio(start_height + delta, false);
    };
    const finish = (up_event: PointerEvent) => {
      up_event.preventDefault();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      image_cleanups.delete(handle);
      const delta = up_event.clientY - start_y;
      if (did_move || delta !== 0) update_ratio(start_height + delta, true);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      image_cleanups.delete(handle);
      update_ratio(start_height, false);
    };
    image_cleanups.set(handle, cancel);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  });
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    stop(event);
    if (!can_resize()) return;
    const height = image.getBoundingClientRect().height;
    update_ratio(height + (event.key === "ArrowUp" ? 16 : -16), true);
  });
  return handle;
}

function stop_image_pointer_event(event: Event) {
  event.stopPropagation();
}

const refresh_images = StateEffect.define();
const image_loads = new WeakMap<HTMLElement, AbortController>();
const image_resize_focus = new WeakMap<
  EditorView,
  {
    from: number;
    source: string;
    base_height: number;
  }
>();
const image_cleanups = new WeakMap<HTMLElement, () => void>();

export function image_rendering(options: ImageRenderingOptions) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = render_images(view, options);
      }
      update(update: ViewUpdate) {
        if (update.view.composing) {
          this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.startState.readOnly !== update.state.readOnly ||
          get_find_query(update.startState) !== get_find_query(update.state) ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refresh_images)),
          )
        ) {
          this.decorations = render_images(update.view, options);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (extension) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(extension)?.decorations ?? Decoration.none,
        ),
    },
  );
  return [
    EditorView.theme({
      ".md-image": {
        display: "inline-block",
        position: "relative",
        verticalAlign: "middle",
        lineHeight: "0",
      },
      ".md-image img": {
        display: "block",
        maxWidth: "100%",
        height: "auto",
      },
      ".md-image-resize": {
        position: "absolute",
        bottom: "-0.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        width: "10rem",
        height: "0.75rem",
        borderRadius: "999px",
        background: "var(--border, #888)",
        opacity: "0",
        cursor: "ns-resize",
        touchAction: "none",
        userSelect: "none",
      },
      ".md-image:hover .md-image-resize, .md-image-resize:focus-visible": {
        opacity: "1",
      },
      ".md-image-resize:focus-visible": {
        outline: "2px solid var(--ring, #777)",
      },
    }),
    plugin,
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        requestAnimationFrame(() => {
          if (view.plugin(plugin))
            view.dispatch({ effects: refresh_images.of(null) });
        });
      },
    }),
  ];
}

function render_images(view: EditorView, options: ImageRenderingOptions) {
  const { state } = view;
  const frontmatter_end = get_frontmatter_end(state);
  const decorations: Range<Decoration>[] = [];
  const visited = new Set<number>();
  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(reference) {
        if (reference.from < frontmatter_end)
          return reference.to <= frontmatter_end ? false : undefined;
        if (["FencedCode", "CodeBlock", "InlineCode"].includes(reference.name))
          return false;
        if (reference.name !== "Image") return undefined;
        if (has_ancestor_named(reference.node, "Link")) return false;
        if (visited.has(reference.from)) return false;
        visited.add(reference.from);
        const first = state.doc.lineAt(reference.from);
        const last = state.doc.lineAt(reference.to);
        if (
          first.number !== last.number ||
          selected_find_intersects(state, reference.from, reference.to) ||
          state.selection.ranges.some((range) =>
            selection_touches_image(range, reference.from, reference.to),
          )
        )
          return false;
        const image = link_from_node(state, reference.node);
        if (!image) return false;
        const resize = image.image_resize;
        if (!resize) return false;
        decorations.push(
          Decoration.replace({
            widget: new MarkdownImage(
              image.target,
              image.label,
              options.resolve_image,
              resize,
              state.readOnly,
            ),
          }).range(image.from, image.to),
        );
        return false;
      },
    });
  }
  return Decoration.set(decorations, true);
}

class MarkdownImage extends WidgetType {
  constructor(
    readonly source: string,
    readonly label: string,
    readonly resolve_image: ImageRenderingOptions["resolve_image"],
    readonly resize: ImageResizeRange,
    readonly read_only: boolean,
  ) {
    super();
  }
  eq(other: MarkdownImage) {
    return (
      this.source === other.source &&
      this.label === other.label &&
      this.resize.from === other.resize.from &&
      this.resize.to === other.resize.to &&
      this.resize.ratio === other.resize.ratio &&
      this.resize.alt_from === other.resize.alt_from &&
      this.resize.alt_to === other.resize.alt_to &&
      this.read_only === other.read_only &&
      this.resolve_image === other.resolve_image
    );
  }

  toDOM(view: EditorView) {
    return render_markdown_image(
      this.source,
      this.label,
      view,
      this.resolve_image,
      {
        ...this.resize,
        on_resize: (ratio) => {
          if (view.state.readOnly) return;
          view.dispatch({
            changes: {
              from: this.resize.alt_from,
              to: this.resize.alt_to,
              insert: ratio.toFixed(2),
            },
            userEvent: "input.image.resize",
          });
        },
      },
    );
  }

  destroy(dom: HTMLElement) {
    destroy_markdown_image(dom);
  }
}

function selection_touches_image(
  range: EditorView["state"]["selection"]["main"],
  from: number,
  to: number,
): boolean {
  return range.empty
    ? range.head > from && range.head < to
    : range.from < to && range.to > from;
}

function has_ancestor_named(
  node: ReturnType<typeof syntaxTree>["topNode"],
  name: string,
): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.name === name) return true;
    parent = parent.parent;
  }
  return false;
}
