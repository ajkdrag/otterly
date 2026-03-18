import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type {
  EditorView,
  NodeView,
  ViewMutationRecord,
} from "@milkdown/kit/prose/view";
import { Check, Copy } from "lucide-static";

const CODE_BLOCK_MIN_HEIGHT = 48;
const CODE_BLOCK_MAX_VIEWPORT_RATIO = 0.8;

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const COPY_SVG = resize_icon(Copy, 14);
const CHECK_SVG = resize_icon(Check, 14);

const code_block_ui_key = new PluginKey("code-block-ui");
const USER_SELECT_STYLE = "none";

function get_code_block_attr(
  node: ProseNode,
  key: "language" | "visual_height",
): unknown {
  return node.attrs[key];
}

function read_code_block_height(node: ProseNode): number | null {
  const value = get_code_block_attr(node, "visual_height");
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

export function clamp_code_block_height(
  height: number,
  viewport_height: number,
): number {
  const max_height = Math.max(
    CODE_BLOCK_MIN_HEIGHT,
    Math.floor(viewport_height * CODE_BLOCK_MAX_VIEWPORT_RATIO),
  );
  return Math.min(
    Math.max(Math.round(height), CODE_BLOCK_MIN_HEIGHT),
    max_height,
  );
}

function apply_code_block_height(
  wrapper: HTMLElement,
  pre: HTMLElement,
  height: number | null,
): void {
  if (height === null) {
    wrapper.removeAttribute("data-visual-height");
    pre.style.removeProperty("height");
    return;
  }

  wrapper.dataset["visualHeight"] = String(height);
  pre.style.height = `${String(height)}px`;
}

function create_copy_button(code_el: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "code-block-copy";
  button.contentEditable = "false";
  button.type = "button";
  button.setAttribute("aria-label", "Copy code");
  button.innerHTML = COPY_SVG;

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const text = code_el.textContent ?? "";

    void navigator.clipboard.writeText(text).then(() => {
      button.innerHTML = CHECK_SVG;
      button.classList.add("code-block-copy--copied");
      setTimeout(() => {
        button.innerHTML = COPY_SVG;
        button.classList.remove("code-block-copy--copied");
      }, 1500);
    });
  });

  return button;
}

function set_code_language_class(code: HTMLElement, node: ProseNode): void {
  const language = get_code_block_attr(node, "language");
  code.className =
    typeof language === "string" && language.length > 0
      ? `language-${language}`
      : "";
}

function get_viewport_height(): number {
  return window.innerHeight || 900;
}

function get_code_block_position(
  get_pos: boolean | (() => number | undefined),
): number | null {
  if (typeof get_pos !== "function") return null;

  const position = get_pos();
  return typeof position === "number" ? position : null;
}

function commit_code_block_height(
  view: EditorView,
  get_pos: boolean | (() => number | undefined),
  height: number,
): void {
  const position = get_code_block_position(get_pos);
  if (position === null) return;

  view.dispatch(
    view.state.tr.setNodeAttribute(position, "visual_height", height),
  );
}

export function create_code_block_ui_node_view(
  node: ProseNode,
  view: EditorView,
  get_pos: boolean | (() => number | undefined),
): NodeView {
  let current_node = node;
  let active_pointer_id: number | null = null;
  let drag_start_y = 0;
  let drag_start_height = 0;
  let pending_height: number | null = null;
  let previous_document_user_select = "";

  const wrapper = document.createElement("div");
  wrapper.className = "code-block-wrapper";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  const copy_button = create_copy_button(code);
  const resize_handle = document.createElement("button");

  resize_handle.className = "code-block-resize-handle";
  resize_handle.type = "button";
  resize_handle.contentEditable = "false";
  resize_handle.setAttribute("aria-label", "Resize code block");

  pre.appendChild(code);
  wrapper.appendChild(pre);
  wrapper.appendChild(copy_button);
  wrapper.appendChild(resize_handle);

  function sync_view_from_node(): void {
    set_code_language_class(code, current_node);
    apply_code_block_height(wrapper, pre, read_code_block_height(current_node));
  }

  function start_resize_ui_state(): void {
    previous_document_user_select = document.body.style.userSelect;
    document.body.style.userSelect = USER_SELECT_STYLE;
    wrapper.dataset["resizing"] = "true";
  }

  function stop_resize_ui_state(): void {
    document.body.style.userSelect = previous_document_user_select;
    delete wrapper.dataset["resizing"];
  }

  function finish_resize(pointer_id: number | null): void {
    if (
      pointer_id !== null &&
      active_pointer_id !== null &&
      pointer_id !== active_pointer_id
    ) {
      return;
    }

    const height_to_commit = pending_height;
    pending_height = null;
    active_pointer_id = null;
    stop_resize_ui_state();

    document.removeEventListener("pointermove", handle_pointer_move);
    document.removeEventListener("pointerup", handle_pointer_up);
    document.removeEventListener("pointercancel", handle_pointer_cancel);

    if (height_to_commit === null) return;

    const current_height = read_code_block_height(current_node);
    if (current_height === height_to_commit) {
      apply_code_block_height(wrapper, pre, current_height);
      return;
    }

    commit_code_block_height(view, get_pos, height_to_commit);
  }

  function handle_pointer_move(event: PointerEvent): void {
    if (active_pointer_id !== event.pointerId) return;
    event.preventDefault();

    const next_height = clamp_code_block_height(
      drag_start_height + event.clientY - drag_start_y,
      get_viewport_height(),
    );
    pending_height = next_height;
    apply_code_block_height(wrapper, pre, next_height);
  }

  function handle_pointer_up(event: PointerEvent): void {
    finish_resize(event.pointerId);
  }

  function handle_pointer_cancel(event: PointerEvent): void {
    finish_resize(event.pointerId);
  }

  resize_handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    active_pointer_id = event.pointerId;
    drag_start_y = event.clientY;
    drag_start_height = pre.getBoundingClientRect().height;
    pending_height = read_code_block_height(current_node);
    start_resize_ui_state();

    if (typeof resize_handle.setPointerCapture === "function") {
      resize_handle.setPointerCapture(event.pointerId);
    }

    document.addEventListener("pointermove", handle_pointer_move);
    document.addEventListener("pointerup", handle_pointer_up);
    document.addEventListener("pointercancel", handle_pointer_cancel);
  });

  sync_view_from_node();

  return {
    dom: wrapper,
    contentDOM: code,
    update: (updated) => {
      if (updated.type.name !== "code_block") return false;
      current_node = updated;
      sync_view_from_node();
      return true;
    },
    destroy: () => {
      finish_resize(null);
    },
    ignoreMutation: (mutation: ViewMutationRecord) => {
      if (mutation.type === "selection") return false;
      return !code.contains(mutation.target);
    },
    stopEvent: (event) =>
      event.target instanceof Element &&
      event.target.closest(".code-block-copy, .code-block-resize-handle") !==
        null,
  };
}

export const code_block_ui_plugin = $prose(
  () =>
    new Plugin({
      key: code_block_ui_key,
      props: {
        nodeViews: {
          code_block: (node, view, get_pos) =>
            create_code_block_ui_node_view(node, view, get_pos),
        },
      },
    }),
);
