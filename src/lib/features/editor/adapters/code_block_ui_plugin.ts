import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
  EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type {
  EditorView,
  NodeView,
  ViewMutationRecord,
} from "@milkdown/kit/prose/view";
import type { CodeBlockHeights } from "$lib/shared/types/editor";
import { Check, Copy } from "lucide-static";
import { refractor } from "refractor";

const CODE_BLOCK_MIN_HEIGHT = 48;
const CODE_BLOCK_MAX_HEIGHT = 4096;
const CODE_BLOCK_MAX_VIEWPORT_RATIO = 0.8;
const USER_SELECT_STYLE = "none";

function build_language_list(): string[] {
  const grammars = refractor.languages;
  const seen_grammars = new Set<object>();
  const result: string[] = [];

  for (const id of Object.keys(grammars)) {
    const grammar = grammars[id];
    if (typeof grammar !== "object" || grammar === null) continue;
    if (seen_grammars.has(grammar)) continue;
    seen_grammars.add(grammar);
    result.push(id);
  }

  result.sort((a, b) => a.localeCompare(b));
  return result;
}

const LANGUAGES = build_language_list();

type CodeBlockUiState = {
  positions: number[];
  heights: CodeBlockHeights;
};

type CodeBlockUiMeta =
  | {
      kind: "set_height";
      ordinal: number;
      height: number | null;
    }
  | {
      kind: "set_heights";
      heights: CodeBlockHeights;
    };

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const COPY_SVG = resize_icon(Copy, 14);
const CHECK_SVG = resize_icon(Check, 14);

export const code_block_ui_key = new PluginKey<CodeBlockUiState>(
  "code-block-ui",
);

function normalize_code_block_height(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < CODE_BLOCK_MIN_HEIGHT) {
    return CODE_BLOCK_MIN_HEIGHT;
  }
  if (rounded > CODE_BLOCK_MAX_HEIGHT) {
    return CODE_BLOCK_MAX_HEIGHT;
  }
  return rounded;
}

function collect_code_block_positions(doc: ProseNode): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "code_block") {
      positions.push(pos);
    }
  });

  return positions;
}

function normalize_code_block_heights(
  positions: number[],
  heights: CodeBlockHeights,
): CodeBlockHeights {
  return positions.map((_, index) =>
    normalize_code_block_height(heights[index] ?? null),
  );
}

function create_code_block_ui_state(
  doc: ProseNode,
  heights: CodeBlockHeights,
): CodeBlockUiState {
  const positions = collect_code_block_positions(doc);

  return {
    positions,
    heights: normalize_code_block_heights(positions, heights),
  };
}

function remap_code_block_ui_state(
  current: CodeBlockUiState,
  tr: Transaction,
  next_doc: ProseNode,
): CodeBlockUiState {
  const positions = collect_code_block_positions(next_doc);
  const remapped_heights = positions.map(() => null) as CodeBlockHeights;
  const next_index_by_position = new Map<number, number>();

  positions.forEach((pos, index) => {
    next_index_by_position.set(pos, index);
  });

  current.positions.forEach((pos, index) => {
    const height = normalize_code_block_height(current.heights[index] ?? null);
    if (height === null) {
      return;
    }

    const mapped_pos = tr.mapping.map(pos, 1);
    const next_index = next_index_by_position.get(mapped_pos);
    if (next_index === undefined) {
      return;
    }

    remapped_heights[next_index] = height;
  });

  return {
    positions,
    heights: remapped_heights,
  };
}

function are_code_block_heights_equal(
  left: CodeBlockHeights,
  right: CodeBlockHeights,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if ((left[index] ?? null) !== (right[index] ?? null)) {
      return false;
    }
  }

  return true;
}

function get_code_block_ui_state(state: EditorState): CodeBlockUiState {
  return (
    code_block_ui_key.getState(state) ?? {
      positions: [],
      heights: [],
    }
  );
}

function get_code_block_language(node: ProseNode): string {
  return typeof node.attrs["language"] === "string"
    ? node.attrs["language"]
    : "";
}

function get_code_block_ordinal(
  state: EditorState,
  position: number,
): number | null {
  const plugin_state = get_code_block_ui_state(state);
  const ordinal = plugin_state.positions.indexOf(position);
  return ordinal >= 0 ? ordinal : null;
}

function read_code_block_height(
  state: EditorState,
  position: number,
): number | null {
  const ordinal = get_code_block_ordinal(state, position);
  if (ordinal === null) {
    return null;
  }

  return normalize_code_block_height(
    get_code_block_ui_state(state).heights[ordinal] ?? null,
  );
}

export function read_code_block_heights(state: EditorState): CodeBlockHeights {
  return [...get_code_block_ui_state(state).heights];
}

function update_code_block_height(
  view: EditorView,
  ordinal: number,
  height: number | null,
): void {
  view.dispatch(
    view.state.tr.setMeta(code_block_ui_key, {
      kind: "set_height",
      ordinal,
      height,
    } satisfies CodeBlockUiMeta),
  );
}

export function replace_code_block_heights(
  view: EditorView,
  heights: CodeBlockHeights,
): void {
  view.dispatch(
    view.state.tr.setMeta(code_block_ui_key, {
      kind: "set_heights",
      heights,
    } satisfies CodeBlockUiMeta),
  );
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

  const next_height = clamp_code_block_height(height, get_viewport_height());
  wrapper.dataset["visualHeight"] = String(next_height);
  pre.style.height = `${String(next_height)}px`;
}

function sync_rendered_code_block_heights(view: EditorView): void {
  const plugin_state = get_code_block_ui_state(view.state);

  plugin_state.positions.forEach((position, index) => {
    const dom = view.nodeDOM(position);
    if (!(dom instanceof HTMLElement)) {
      return;
    }

    const pre = dom.querySelector("pre");
    if (!(pre instanceof HTMLElement)) {
      return;
    }

    apply_code_block_height(
      dom,
      pre,
      normalize_code_block_height(plugin_state.heights[index] ?? null),
    );
  });
}

function get_language_label(id: string): string {
  return id.length > 0 ? id : "plain";
}

function create_language_picker(
  initial_language: string,
  on_change: (language: string) => void,
): { el: HTMLElement; sync: (language: string) => void } {
  const wrapper = document.createElement("div");
  wrapper.className = "code-block-lang-picker";
  wrapper.contentEditable = "false";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-block-lang-picker__trigger";
  button.textContent = get_language_label(initial_language);

  const dropdown = document.createElement("div");
  dropdown.className = "code-block-lang-picker__dropdown";
  dropdown.setAttribute("role", "listbox");

  let is_open = false;
  let selected = initial_language;

  function consume_mouse_event(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function clear_selected_class(): void {
    dropdown
      .querySelectorAll(".code-block-lang-picker__item--selected")
      .forEach((el) => {
        el.classList.remove("code-block-lang-picker__item--selected");
      });
  }

  function sync_selected_language(language: string): void {
    selected = language;
    button.textContent = get_language_label(language);

    clear_selected_class();
    const match = dropdown.querySelector(`[data-lang="${language}"]`);
    if (match instanceof HTMLElement) {
      match.classList.add("code-block-lang-picker__item--selected");
    }
  }

  function handle_outside_click(event: MouseEvent): void {
    if (!wrapper.contains(event.target as Node)) {
      set_dropdown_open(false);
    }
  }

  function set_dropdown_open(next_is_open: boolean): void {
    if (is_open === next_is_open) {
      return;
    }

    is_open = next_is_open;
    dropdown.classList.toggle(
      "code-block-lang-picker__dropdown--open",
      is_open,
    );

    if (is_open) {
      document.addEventListener("mousedown", handle_outside_click, true);
      const selected_item = dropdown.querySelector(`[data-lang="${selected}"]`);
      if (selected_item instanceof HTMLElement) {
        selected_item.scrollIntoView({ block: "nearest" });
      }
      return;
    }

    document.removeEventListener("mousedown", handle_outside_click, true);
  }

  function select_language(language: string): void {
    sync_selected_language(language);
    set_dropdown_open(false);
    on_change(language);
  }

  button.addEventListener("mousedown", consume_mouse_event);

  button.addEventListener("click", (event) => {
    consume_mouse_event(event);
    set_dropdown_open(!is_open);
  });

  const plain_item = document.createElement("button");
  plain_item.type = "button";
  plain_item.className = "code-block-lang-picker__item";
  plain_item.setAttribute("role", "option");
  plain_item.setAttribute("data-lang", "");
  plain_item.textContent = "plain";
  if (selected === "") {
    plain_item.classList.add("code-block-lang-picker__item--selected");
  }
  plain_item.addEventListener("mousedown", consume_mouse_event);
  plain_item.addEventListener("click", (event) => {
    consume_mouse_event(event);
    select_language("");
  });
  dropdown.appendChild(plain_item);

  for (const lang of LANGUAGES) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "code-block-lang-picker__item";
    item.setAttribute("role", "option");
    item.setAttribute("data-lang", lang);
    item.textContent = lang;

    if (lang === selected) {
      item.classList.add("code-block-lang-picker__item--selected");
    }

    item.addEventListener("mousedown", consume_mouse_event);

    item.addEventListener("click", (event) => {
      consume_mouse_event(event);
      select_language(lang);
    });

    dropdown.appendChild(item);
  }

  wrapper.appendChild(button);
  wrapper.appendChild(dropdown);

  function sync(language: string): void {
    if (selected === language) return;
    sync_selected_language(language);
  }

  return { el: wrapper, sync };
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
  const language = get_code_block_language(node);
  code.className = language.length > 0 ? `language-${language}` : "";
}

function get_viewport_height(): number {
  return window.innerHeight || 900;
}

function get_code_block_position(
  get_pos: boolean | (() => number | undefined),
): number | null {
  if (typeof get_pos !== "function") {
    return null;
  }

  const position = get_pos();
  return typeof position === "number" ? position : null;
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

  const header = document.createElement("div");
  header.className = "code-block-header";
  header.contentEditable = "false";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  const copy_button = create_copy_button(code);
  const resize_handle = document.createElement("button");

  resize_handle.className = "code-block-resize-handle";
  resize_handle.type = "button";
  resize_handle.contentEditable = "false";
  resize_handle.setAttribute("aria-label", "Resize code block");

  const lang_picker = create_language_picker(
    get_code_block_language(node),
    (language) => {
      const position = get_code_block_position(get_pos);
      if (position === null) return;
      view.dispatch(
        view.state.tr.setNodeAttribute(position, "language", language),
      );
    },
  );

  header.appendChild(lang_picker.el);
  header.appendChild(copy_button);

  const body = document.createElement("div");
  body.className = "code-block-body";

  pre.appendChild(code);
  body.appendChild(header);
  body.appendChild(pre);
  wrapper.appendChild(body);
  wrapper.appendChild(resize_handle);

  function sync_view_from_node(): void {
    set_code_language_class(code, current_node);
    lang_picker.sync(get_code_block_language(current_node));

    const position = get_code_block_position(get_pos);
    const height =
      position === null ? null : read_code_block_height(view.state, position);
    apply_code_block_height(wrapper, pre, height);
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

    if (height_to_commit === null) {
      return;
    }

    const position = get_code_block_position(get_pos);
    if (position === null) {
      return;
    }

    const ordinal = get_code_block_ordinal(view.state, position);
    if (ordinal === null) {
      return;
    }

    const current_height = read_code_block_height(view.state, position);
    if (current_height === height_to_commit) {
      apply_code_block_height(wrapper, pre, current_height);
      return;
    }

    update_code_block_height(view, ordinal, height_to_commit);
  }

  function handle_pointer_move(event: PointerEvent): void {
    if (active_pointer_id !== event.pointerId) {
      return;
    }

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
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    active_pointer_id = event.pointerId;
    drag_start_y = event.clientY;
    drag_start_height = pre.getBoundingClientRect().height;

    const position = get_code_block_position(get_pos);
    pending_height =
      position === null ? null : read_code_block_height(view.state, position);
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
      if (updated.type.name !== "code_block") {
        return false;
      }

      current_node = updated;
      sync_view_from_node();
      return true;
    },
    destroy: () => {
      finish_resize(null);
    },
    ignoreMutation: (mutation: ViewMutationRecord) => {
      if (mutation.type === "selection") {
        return false;
      }

      const target = mutation.target;
      if (code.contains(target)) return false;
      if (target === pre || target === body) return false;

      return true;
    },
    stopEvent: (event) =>
      event.target instanceof Element &&
      event.target.closest(".code-block-header, .code-block-resize-handle") !==
        null,
  };
}

type CodeBlockUiPluginArgs = {
  get_initial_heights: () => CodeBlockHeights;
  on_heights_change?: (heights: CodeBlockHeights) => void;
};

export function create_code_block_ui_prosemirror_plugin(
  args: CodeBlockUiPluginArgs,
) {
  return new Plugin<CodeBlockUiState>({
    key: code_block_ui_key,
    state: {
      init: (_, state) =>
        create_code_block_ui_state(state.doc, args.get_initial_heights()),
      apply: (tr, value, _, new_state) => {
        const meta = tr.getMeta(code_block_ui_key) as
          | CodeBlockUiMeta
          | undefined;

        let next_value = value;

        if (tr.docChanged) {
          next_value = remap_code_block_ui_state(value, tr, new_state.doc);
        }

        if (meta?.kind === "set_heights") {
          next_value = create_code_block_ui_state(new_state.doc, meta.heights);
        }

        if (meta?.kind === "set_height") {
          const heights = [...next_value.heights];
          if (meta.ordinal >= 0 && meta.ordinal < heights.length) {
            heights[meta.ordinal] = normalize_code_block_height(meta.height);
            next_value = {
              ...next_value,
              heights,
            };
          }
        }

        if (
          next_value.positions === value.positions &&
          are_code_block_heights_equal(next_value.heights, value.heights)
        ) {
          return value;
        }

        return next_value;
      },
    },
    view: (view) => {
      let previous_heights = read_code_block_heights(view.state);
      let previous_positions = [
        ...get_code_block_ui_state(view.state).positions,
      ];
      sync_rendered_code_block_heights(view);

      return {
        update: (updated_view) => {
          const next_positions = get_code_block_ui_state(
            updated_view.state,
          ).positions;
          const next_heights = read_code_block_heights(updated_view.state);
          const positions_changed =
            previous_positions.length !== next_positions.length ||
            previous_positions.some(
              (position, index) => position !== next_positions[index],
            );

          if (
            !positions_changed &&
            are_code_block_heights_equal(previous_heights, next_heights)
          ) {
            return;
          }

          previous_positions = [...next_positions];
          previous_heights = next_heights;
          sync_rendered_code_block_heights(updated_view);
          args.on_heights_change?.(next_heights);
        },
      };
    },
    props: {
      nodeViews: {
        code_block: (node, view, get_pos) =>
          create_code_block_ui_node_view(node, view, get_pos),
      },
    },
  });
}

export function create_code_block_ui_plugin(args: CodeBlockUiPluginArgs) {
  return $prose(() => create_code_block_ui_prosemirror_plugin(args));
}
