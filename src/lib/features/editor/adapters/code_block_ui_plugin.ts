import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { CodeBlockHeights } from "$lib/shared/types/editor";

const CODE_BLOCK_MIN_HEIGHT = 48;
const CODE_BLOCK_MAX_HEIGHT = 4096;
const CODE_BLOCK_MAX_VIEWPORT_RATIO = 0.8;

type CodeBlockUiState = {
  positions: number[];
  heights: CodeBlockHeights;
};

type CodeBlockUiMeta =
  | { kind: "set_height"; ordinal: number; height: number }
  | { kind: "set_heights"; heights: CodeBlockHeights };

type TrackedBlock = {
  position: number;
  persisted_height: number | null | undefined;
  applied_style_height: string;
  handle: HTMLButtonElement;
  cleanup: () => void;
};

type ActiveResize = {
  block: HTMLElement;
  pointer_id: number;
  start_y: number;
  start_height: number;
  original_style_height: string;
  previous_user_select: string;
  pending_height: number | null;
};

export const code_block_ui_key = new PluginKey<CodeBlockUiState>(
  "code-block-ui",
);

function normalize_code_block_height(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(
    Math.max(Math.round(value), CODE_BLOCK_MIN_HEIGHT),
    CODE_BLOCK_MAX_HEIGHT,
  );
}

function collect_code_block_positions(doc: ProseNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "code_block") positions.push(pos);
  });
  return positions;
}

function create_code_block_ui_state(
  doc: ProseNode,
  heights: CodeBlockHeights,
): CodeBlockUiState {
  const positions = collect_code_block_positions(doc);
  return {
    positions,
    heights: positions.map((_, index) =>
      normalize_code_block_height(heights[index] ?? null),
    ),
  };
}

function remap_code_block_ui_state(
  current: CodeBlockUiState,
  tr: Transaction,
  next_doc: ProseNode,
): CodeBlockUiState {
  const positions = collect_code_block_positions(next_doc);
  const next_index_by_position = new Map(
    positions.map((position, index) => [position, index]),
  );
  const heights = positions.map(() => null) as CodeBlockHeights;

  current.positions.forEach((position, index) => {
    const height = current.heights[index] ?? null;
    const next_index = next_index_by_position.get(tr.mapping.map(position, 1));
    if (height !== null && next_index !== undefined) {
      heights[next_index] = height;
    }
  });

  return { positions, heights };
}

function are_code_block_heights_equal(
  left: CodeBlockHeights,
  right: CodeBlockHeights,
): boolean {
  return (
    left.length === right.length &&
    left.every((height, index) => height === right[index])
  );
}

function get_code_block_ui_state(state: EditorState): CodeBlockUiState {
  return code_block_ui_key.getState(state) ?? { positions: [], heights: [] };
}

export function read_code_block_heights(state: EditorState): CodeBlockHeights {
  return [...get_code_block_ui_state(state).heights];
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

function clamp_code_block_height(height: number): number {
  const viewport_height = window.innerHeight || 900;
  const max_height = Math.max(
    CODE_BLOCK_MIN_HEIGHT,
    Math.min(
      CODE_BLOCK_MAX_HEIGHT,
      Math.floor(viewport_height * CODE_BLOCK_MAX_VIEWPORT_RATIO),
    ),
  );
  return Math.min(
    Math.max(Math.round(height), CODE_BLOCK_MIN_HEIGHT),
    max_height,
  );
}

function set_code_block_height(
  view: EditorView,
  ordinal: number,
  height: number,
): void {
  view.dispatch(
    view.state.tr.setMeta(code_block_ui_key, {
      kind: "set_height",
      ordinal,
      height,
    } satisfies CodeBlockUiMeta),
  );
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
        let next = tr.docChanged
          ? remap_code_block_ui_state(value, tr, new_state.doc)
          : value;

        if (meta?.kind === "set_heights") {
          next = create_code_block_ui_state(new_state.doc, meta.heights);
        } else if (meta?.kind === "set_height") {
          if (meta.ordinal >= 0 && meta.ordinal < next.heights.length) {
            const heights = [...next.heights];
            heights[meta.ordinal] = normalize_code_block_height(meta.height);
            next = { ...next, heights };
          }
        }

        if (
          next.positions === value.positions &&
          are_code_block_heights_equal(next.heights, value.heights)
        ) {
          return value;
        }
        return next;
      },
    },
    view: (view) => {
      const tracked_blocks = new Map<HTMLElement, TrackedBlock>();
      let active_resize: ActiveResize | null = null;
      let previous_heights = read_code_block_heights(view.state);
      const resize_observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver((entries) => {
              for (const entry of entries) {
                const dom = entry.target;
                if (!(dom instanceof HTMLElement)) continue;
                const tracked = tracked_blocks.get(dom);
                if (!tracked) continue;

                // A restored or actively dragged height is already tracked. Only
                // an external inline-height change needs a transaction.
                const inline_height = dom.style.height;
                if (
                  !inline_height ||
                  inline_height === tracked.applied_style_height
                ) {
                  continue;
                }
                tracked.applied_style_height = inline_height;

                const plugin_state = get_code_block_ui_state(view.state);
                const ordinal = plugin_state.positions.indexOf(
                  tracked.position,
                );
                if (ordinal < 0) continue;
                const height = clamp_code_block_height(
                  entry.contentRect.height,
                );
                if (plugin_state.heights[ordinal] !== height) {
                  set_code_block_height(view, ordinal, height);
                }
              }
            });

      function finish_resize(pointer_id: number | null, commit: boolean): void {
        const active = active_resize;
        if (
          !active ||
          (pointer_id !== null && active.pointer_id !== pointer_id)
        )
          return;

        active_resize = null;
        document.body.style.userSelect = active.previous_user_select;
        delete active.block.dataset.resizing;
        document.removeEventListener("pointermove", handle_pointer_move);
        document.removeEventListener("pointerup", handle_pointer_up);
        document.removeEventListener("pointercancel", handle_pointer_cancel);

        const tracked = tracked_blocks.get(active.block);
        const ordinal = tracked
          ? get_code_block_ui_state(view.state).positions.indexOf(
              tracked.position,
            )
          : -1;
        if (commit && active.pending_height !== null && ordinal >= 0) {
          set_code_block_height(view, ordinal, active.pending_height);
          return;
        }

        active.block.style.height = active.original_style_height;
        if (tracked)
          tracked.applied_style_height = active.original_style_height;
      }

      function handle_pointer_move(event: PointerEvent): void {
        const active = active_resize;
        if (!active || active.pointer_id !== event.pointerId) return;
        event.preventDefault();

        const height = clamp_code_block_height(
          active.start_height + event.clientY - active.start_y,
        );
        active.pending_height = height;
        const style_height = `${String(height)}px`;
        active.block.style.height = style_height;
        const tracked = tracked_blocks.get(active.block);
        if (tracked) tracked.applied_style_height = style_height;
      }

      function handle_pointer_up(event: PointerEvent): void {
        finish_resize(event.pointerId, true);
      }

      function handle_pointer_cancel(event: PointerEvent): void {
        finish_resize(event.pointerId, false);
      }

      function track_code_block(
        dom: HTMLElement,
        position: number,
      ): TrackedBlock {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "code-block-resize-handle";
        handle.contentEditable = "false";
        handle.setAttribute(
          "aria-label",
          "Resize code block. Use the up and down arrow keys when focused.",
        );
        handle.title = "Drag to resize code block";

        // Milkdown's Vue component replaces its children when CodeMirror mounts.
        // Keep this one handle attached without owning the rest of its DOM.
        const mutation_observer = new MutationObserver(() => {
          if (handle.parentElement !== dom) dom.appendChild(handle);
        });
        mutation_observer.observe(dom, { childList: true });
        dom.appendChild(handle);

        const consume_mouse_event = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
        };
        handle.addEventListener("mousedown", consume_mouse_event);
        handle.addEventListener("click", consume_mouse_event);
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          finish_resize(null, false);

          const measured_height = dom.getBoundingClientRect().height;
          const start_height =
            measured_height ||
            Number.parseFloat(dom.style.height) ||
            CODE_BLOCK_MIN_HEIGHT;
          active_resize = {
            block: dom,
            pointer_id: event.pointerId,
            start_y: event.clientY,
            start_height,
            original_style_height: dom.style.height,
            previous_user_select: document.body.style.userSelect,
            pending_height: null,
          };
          document.body.style.userSelect = "none";
          dom.dataset.resizing = "true";
          document.addEventListener("pointermove", handle_pointer_move);
          document.addEventListener("pointerup", handle_pointer_up);
          document.addEventListener("pointercancel", handle_pointer_cancel);
        });
        handle.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();

          const tracked = tracked_blocks.get(dom);
          if (!tracked) return;
          const ordinal = get_code_block_ui_state(view.state).positions.indexOf(
            tracked.position,
          );
          if (ordinal < 0) return;
          const current_height =
            dom.getBoundingClientRect().height ||
            Number.parseFloat(dom.style.height) ||
            CODE_BLOCK_MIN_HEIGHT;
          const step = event.shiftKey ? 64 : 16;
          const direction = event.key === "ArrowDown" ? 1 : -1;
          set_code_block_height(
            view,
            ordinal,
            clamp_code_block_height(current_height + direction * step),
          );
        });

        return {
          position,
          persisted_height: undefined,
          applied_style_height: "",
          handle,
          cleanup: () => {
            if (active_resize?.block === dom) finish_resize(null, false);
            mutation_observer.disconnect();
            handle.remove();
          },
        };
      }

      function sync_rendered_heights(): void {
        const plugin_state = get_code_block_ui_state(view.state);
        const rendered = new Set<HTMLElement>();

        plugin_state.positions.forEach((position, index) => {
          const dom = view.nodeDOM(position);
          if (
            !(dom instanceof HTMLElement) ||
            !dom.classList.contains("milkdown-code-block")
          ) {
            return;
          }

          rendered.add(dom);
          let tracked = tracked_blocks.get(dom);
          if (!tracked) {
            tracked = track_code_block(dom, position);
            tracked_blocks.set(dom, tracked);
            resize_observer?.observe(dom);
          }
          tracked.position = position;
          if (tracked.handle.parentElement !== dom)
            dom.appendChild(tracked.handle);

          const height = plugin_state.heights[index] ?? null;
          if (tracked.persisted_height !== height) {
            const style_height =
              height === null
                ? ""
                : `${String(clamp_code_block_height(height))}px`;
            if (dom.style.height !== style_height)
              dom.style.height = style_height;
            tracked.persisted_height = height;
            tracked.applied_style_height = style_height;
          }
        });

        for (const dom of tracked_blocks.keys()) {
          if (rendered.has(dom)) continue;
          resize_observer?.unobserve(dom);
          tracked_blocks.get(dom)?.cleanup();
          tracked_blocks.delete(dom);
        }
      }

      sync_rendered_heights();
      return {
        update(updated_view) {
          const heights = read_code_block_heights(updated_view.state);
          sync_rendered_heights();
          if (!are_code_block_heights_equal(previous_heights, heights)) {
            previous_heights = heights;
            args.on_heights_change?.(heights);
          }
        },
        destroy() {
          resize_observer?.disconnect();
          for (const tracked of tracked_blocks.values()) tracked.cleanup();
          tracked_blocks.clear();
        },
      };
    },
  });
}

export function create_code_block_ui_plugin(args: CodeBlockUiPluginArgs) {
  return $prose(() => create_code_block_ui_prosemirror_plugin(args));
}
