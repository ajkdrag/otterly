import { EditorView, runScopeHandlers } from "@codemirror/view";
import type { ImageResizeRange } from "../links/link_source.js";

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

export type ImageResizeContext = ImageResizeRange & {
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
