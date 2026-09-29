import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Code, EyeOff, ZoomIn, ZoomOut } from "lucide-static";
import {
  are_code_block_view_states_equal,
  is_same_code_block_view_state,
  type CodeBlockViewState,
  type CodeBlockViewStates,
} from "$lib/shared/types/editor";
import {
  is_diagram_language,
  rerender_mermaid_preview,
} from "./mermaid_preview";

// Owns the UI we add to Milkdown's code blocks: resize handles for the source
// and the diagram, and for diagram blocks a bar with zoom and a source toggle.
// Milkdown tears a block's own UI down when it scrolls away, so the state
// lives here, keyed by block order, and the adapter persists it with the tab.

const CODE_BLOCK_MIN_HEIGHT = 48;
const CODE_BLOCK_MAX_HEIGHT = 4096;
const CODE_BLOCK_MAX_VIEWPORT_RATIO = 0.8;
// Zoom in and out walk these levels, like browser zoom. 1 fits the width.
const DIAGRAM_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 10];
const DIAGRAM_ZOOM_MIN = 0.25;
const DIAGRAM_ZOOM_MAX = 10;
const DIAGRAM_ZOOM_PROPERTY = "--diagram-zoom";

const DEFAULT_VIEW_STATE: CodeBlockViewState = {
  source_height: null,
  diagram_height: null,
  source_hidden: false,
  diagram_zoom: 1,
};

// The two parts a handle can resize. Each handle writes a CSS variable on the
// block, and editor.css applies it to that part only.
type ResizeTarget = {
  state_key: "source_height" | "diagram_height";
  property: string;
  part_selector: string;
  handle_class: string;
  label: string;
};

const SOURCE_RESIZE: ResizeTarget = {
  state_key: "source_height",
  property: "--code-block-source-height",
  // CodeMirror's host once mounted, or Milkdown's placeholder before that.
  part_selector:
    ":scope > .codemirror-host, :scope > .milkdown-code-block-placeholder",
  handle_class: "code-block-resize-handle code-block-source-resize-handle",
  label: "Resize code block",
};

const DIAGRAM_RESIZE: ResizeTarget = {
  state_key: "diagram_height",
  property: "--diagram-height",
  part_selector: ":scope > .preview-panel",
  handle_class: "code-block-resize-handle code-block-diagram-resize-handle",
  label: "Resize diagram",
};

type CodeBlockUiState = {
  positions: number[];
  view_states: CodeBlockViewStates;
};

type CodeBlockUiMeta =
  | {
      kind: "patch_view_state";
      ordinal: number;
      patch: Partial<CodeBlockViewState>;
    }
  | { kind: "set_view_states"; view_states: CodeBlockViewStates };

type TrackedBlock = {
  position: number;
  applied_view_state: CodeBlockViewState | null | undefined;
  diagram_bar: DiagramBar;
  cleanup: () => void;
};

type DiagramBar = {
  element: HTMLDivElement;
  source_button: HTMLButtonElement;
  zoom_out_button: HTMLButtonElement;
  zoom_reset_button: HTMLButtonElement;
  zoom_in_button: HTMLButtonElement;
};

type ActiveResize = {
  block: HTMLElement;
  target: ResizeTarget;
  pointer_id: number;
  start_y: number;
  start_height: number;
  original_height: string;
  previous_user_select: string;
  pending_height: number | null;
};

export const code_block_ui_key = new PluginKey<CodeBlockUiState>(
  "code-block-ui",
);

export function read_code_block_view_states(
  state: EditorState,
): CodeBlockViewStates {
  return [...get_code_block_ui_state(state).view_states];
}

export function replace_code_block_view_states(
  view: EditorView,
  view_states: CodeBlockViewStates,
): void {
  view.dispatch(
    view.state.tr.setMeta(code_block_ui_key, {
      kind: "set_view_states",
      view_states,
    } satisfies CodeBlockUiMeta),
  );
}

type CodeBlockUiPluginArgs = {
  get_initial_view_states: () => CodeBlockViewStates;
  on_view_states_change?: (view_states: CodeBlockViewStates) => void;
};

export function create_code_block_ui_plugin(args: CodeBlockUiPluginArgs) {
  return $prose(() => create_code_block_ui_prosemirror_plugin(args));
}

export function create_code_block_ui_prosemirror_plugin(
  args: CodeBlockUiPluginArgs,
) {
  return new Plugin<CodeBlockUiState>({
    key: code_block_ui_key,
    state: {
      init: (_, state) =>
        create_code_block_ui_state(state.doc, args.get_initial_view_states()),
      apply: (tr, value, _, new_state) => {
        const meta = tr.getMeta(code_block_ui_key) as
          | CodeBlockUiMeta
          | undefined;
        let next = tr.docChanged
          ? remap_code_block_ui_state(value, tr, new_state.doc)
          : value;

        if (meta?.kind === "set_view_states") {
          next = create_code_block_ui_state(new_state.doc, meta.view_states);
        } else if (meta?.kind === "patch_view_state") {
          if (meta.ordinal >= 0 && meta.ordinal < next.view_states.length) {
            const view_states = [...next.view_states];
            view_states[meta.ordinal] = normalize_view_state({
              ...(view_states[meta.ordinal] ?? DEFAULT_VIEW_STATE),
              ...meta.patch,
            });
            next = { ...next, view_states };
          }
        }

        if (
          next.positions === value.positions &&
          are_code_block_view_states_equal(next.view_states, value.view_states)
        ) {
          return value;
        }
        return next;
      },
    },
    view: (view) => {
      const tracked_blocks = new Map<HTMLElement, TrackedBlock>();
      let active_resize: ActiveResize | null = null;
      let previous_view_states = read_code_block_view_states(view.state);

      function current_view_state(dom: HTMLElement): {
        ordinal: number;
        view_state: CodeBlockViewState;
      } | null {
        const tracked = tracked_blocks.get(dom);
        if (!tracked) return null;
        const plugin_state = get_code_block_ui_state(view.state);
        const ordinal = plugin_state.positions.indexOf(tracked.position);
        if (ordinal < 0) return null;
        return {
          ordinal,
          view_state: plugin_state.view_states[ordinal] ?? DEFAULT_VIEW_STATE,
        };
      }

      function patch_view_state(
        dom: HTMLElement,
        patch: (view_state: CodeBlockViewState) => Partial<CodeBlockViewState>,
      ): void {
        const current = current_view_state(dom);
        if (!current) return;
        view.dispatch(
          view.state.tr.setMeta(code_block_ui_key, {
            kind: "patch_view_state",
            ordinal: current.ordinal,
            patch: patch(current.view_state),
          } satisfies CodeBlockUiMeta),
        );
      }

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

        if (commit && active.pending_height !== null) {
          const height = active.pending_height;
          patch_view_state(active.block, () => ({
            [active.target.state_key]: height,
          }));
          return;
        }
        set_height_style(
          active.block,
          active.target.property,
          active.original_height,
        );
      }

      function handle_pointer_move(event: PointerEvent): void {
        const active = active_resize;
        if (!active || active.pointer_id !== event.pointerId) return;
        event.preventDefault();

        const height = clamp_code_block_height(
          active.start_height + event.clientY - active.start_y,
        );
        active.pending_height = height;
        set_height_style(
          active.block,
          active.target.property,
          `${String(height)}px`,
        );
      }

      function handle_pointer_up(event: PointerEvent): void {
        finish_resize(event.pointerId, true);
      }

      function handle_pointer_cancel(event: PointerEvent): void {
        finish_resize(event.pointerId, false);
      }

      function create_resize_handle(
        dom: HTMLElement,
        target: ResizeTarget,
      ): HTMLButtonElement {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = target.handle_class;
        handle.contentEditable = "false";
        handle.setAttribute(
          "aria-label",
          `${target.label}. Use the up and down arrow keys when focused.`,
        );
        handle.title = `Drag to ${target.label.toLowerCase()}`;
        consume_mouse_events(handle);

        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          finish_resize(null, false);

          active_resize = {
            block: dom,
            target,
            pointer_id: event.pointerId,
            start_y: event.clientY,
            start_height: measure_part_height(dom, target),
            original_height: dom.style.getPropertyValue(target.property),
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

          const step = event.shiftKey ? 64 : 16;
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const height = clamp_code_block_height(
            measure_part_height(dom, target) + direction * step,
          );
          patch_view_state(dom, () => ({ [target.state_key]: height }));
        });
        return handle;
      }

      function create_diagram_bar(dom: HTMLElement): DiagramBar {
        const element = document.createElement("div");
        element.className = "code-block-diagram-bar";
        element.contentEditable = "false";

        const zoom_out_button = create_bar_button("Zoom out", () => {
          patch_view_state(dom, (view_state) => ({
            diagram_zoom: step_diagram_zoom(view_state.diagram_zoom, -1),
          }));
        });
        zoom_out_button.innerHTML = ZoomOut;

        const zoom_reset_button = create_bar_button("Fit to width", () => {
          patch_view_state(dom, () => ({ diagram_zoom: 1 }));
        });
        zoom_reset_button.classList.add("code-block-diagram-zoom-reset");

        const zoom_in_button = create_bar_button("Zoom in", () => {
          patch_view_state(dom, (view_state) => ({
            diagram_zoom: step_diagram_zoom(view_state.diagram_zoom, 1),
          }));
        });
        zoom_in_button.innerHTML = ZoomIn;

        // Its label flips with the state, so apply_view_state sets it.
        const source_button = create_bar_button("", () => {
          patch_view_state(dom, (view_state) => ({
            source_hidden: !view_state.source_hidden,
          }));
        });

        element.append(
          zoom_out_button,
          zoom_reset_button,
          zoom_in_button,
          source_button,
        );
        return {
          element,
          source_button,
          zoom_out_button,
          zoom_reset_button,
          zoom_in_button,
        };
      }

      function track_code_block(
        dom: HTMLElement,
        position: number,
      ): TrackedBlock {
        const source_handle = create_resize_handle(dom, SOURCE_RESIZE);
        const diagram_handle = create_resize_handle(dom, DIAGRAM_RESIZE);
        const diagram_bar = create_diagram_bar(dom);
        const owned_elements = [
          source_handle,
          diagram_bar.element,
          diagram_handle,
        ];

        // Milkdown's Vue component replaces its children when CodeMirror mounts
        // and unmounts. Keep our elements attached without owning the rest.
        // Their order comes from CSS, not DOM position.
        const mutation_observer = new MutationObserver(() => {
          for (const element of owned_elements) {
            if (element.parentElement !== dom) dom.appendChild(element);
          }
        });
        mutation_observer.observe(dom, { childList: true });
        dom.append(...owned_elements);

        return {
          position,
          applied_view_state: undefined,
          diagram_bar,
          cleanup: () => {
            if (active_resize?.block === dom) finish_resize(null, false);
            mutation_observer.disconnect();
            for (const element of owned_elements) element.remove();
            dom.style.removeProperty(SOURCE_RESIZE.property);
            dom.style.removeProperty(DIAGRAM_RESIZE.property);
            dom.style.removeProperty(DIAGRAM_ZOOM_PROPERTY);
            delete dom.dataset.diagram;
            delete dom.dataset.sourceHidden;
          },
        };
      }

      function sync_rendered_blocks(): void {
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
          }
          tracked.position = position;

          const language: unknown =
            view.state.doc.nodeAt(position)?.attrs.language;
          const is_diagram =
            typeof language === "string" && is_diagram_language(language);
          if (is_diagram) dom.dataset.diagram = "true";
          else delete dom.dataset.diagram;

          const view_state = plugin_state.view_states[index] ?? null;
          if (
            tracked.applied_view_state !== undefined &&
            is_same_code_block_view_state(
              tracked.applied_view_state,
              view_state,
            )
          ) {
            return;
          }
          tracked.applied_view_state = view_state;
          apply_view_state(dom, tracked.diagram_bar, view_state);
        });

        for (const dom of tracked_blocks.keys()) {
          if (rendered.has(dom)) continue;
          tracked_blocks.get(dom)?.cleanup();
          tracked_blocks.delete(dom);
        }
      }

      // Diagrams bake the light or dark theme into their svg, so redraw the
      // mounted ones when the scheme flips. Blocks mounted later render fresh.
      function rerender_diagrams(): void {
        const plugin_state = get_code_block_ui_state(view.state);
        for (const [dom, tracked] of tracked_blocks) {
          if (!dom.dataset.diagram) continue;
          if (!plugin_state.positions.includes(tracked.position)) continue;
          const preview = dom.querySelector<HTMLElement>(
            ":scope > .preview-panel > .preview",
          );
          const content = view.state.doc.nodeAt(tracked.position)?.textContent;
          if (preview && content?.trim()) {
            rerender_mermaid_preview(content, preview);
          }
        }
      }

      const color_scheme_observer = new MutationObserver((records) => {
        const scheme = document.documentElement.dataset.colorScheme ?? null;
        if (records.some((record) => record.oldValue !== scheme)) {
          rerender_diagrams();
        }
      });
      color_scheme_observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-scheme"],
        attributeOldValue: true,
      });

      sync_rendered_blocks();
      return {
        update(updated_view) {
          const view_states = read_code_block_view_states(updated_view.state);
          sync_rendered_blocks();
          if (
            !are_code_block_view_states_equal(previous_view_states, view_states)
          ) {
            previous_view_states = view_states;
            args.on_view_states_change?.(view_states);
          }
        },
        destroy() {
          color_scheme_observer.disconnect();
          for (const tracked of tracked_blocks.values()) tracked.cleanup();
          tracked_blocks.clear();
        },
      };
    },
  });
}

function apply_view_state(
  dom: HTMLElement,
  diagram_bar: DiagramBar,
  view_state: CodeBlockViewState | null,
): void {
  const { source_height, diagram_height, source_hidden, diagram_zoom } =
    view_state ?? DEFAULT_VIEW_STATE;

  set_height_style(dom, SOURCE_RESIZE.property, height_style(source_height));
  set_height_style(dom, DIAGRAM_RESIZE.property, height_style(diagram_height));
  if (source_hidden) dom.dataset.sourceHidden = "true";
  else delete dom.dataset.sourceHidden;
  dom.style.setProperty(DIAGRAM_ZOOM_PROPERTY, String(diagram_zoom));

  const source_label = source_hidden ? "Show source" : "Hide source";
  diagram_bar.source_button.innerHTML = source_hidden ? Code : EyeOff;
  diagram_bar.source_button.title = source_label;
  diagram_bar.source_button.setAttribute("aria-label", source_label);
  diagram_bar.zoom_reset_button.textContent = `${String(Math.round(diagram_zoom * 100))}%`;
  diagram_bar.zoom_out_button.disabled = diagram_zoom <= DIAGRAM_ZOOM_MIN;
  diagram_bar.zoom_in_button.disabled = diagram_zoom >= DIAGRAM_ZOOM_MAX;
}

function height_style(height: number | null): string {
  return height === null ? "" : `${String(clamp_code_block_height(height))}px`;
}

function set_height_style(
  dom: HTMLElement,
  property: string,
  value: string,
): void {
  if (value) dom.style.setProperty(property, value);
  else dom.style.removeProperty(property);
}

function measure_part_height(dom: HTMLElement, target: ResizeTarget): number {
  const part = dom.querySelector<HTMLElement>(target.part_selector);
  return (
    part?.getBoundingClientRect().height ||
    Number.parseFloat(dom.style.getPropertyValue(target.property)) ||
    CODE_BLOCK_MIN_HEIGHT
  );
}

// Moves to the next level in the given direction. A zoom between levels, say
// from an older session, snaps to the nearest level that way.
function step_diagram_zoom(zoom: number, direction: 1 | -1): number {
  const next =
    direction === 1
      ? DIAGRAM_ZOOM_LEVELS.find((level) => level > zoom)
      : DIAGRAM_ZOOM_LEVELS.findLast((level) => level < zoom);
  return next ?? zoom;
}

function create_bar_button(
  label: string,
  on_click: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-block-diagram-button";
  if (label) {
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  consume_mouse_events(button);
  // Buttons turn Enter and Space into clicks, so this covers the keyboard too.
  button.addEventListener("click", on_click);
  return button;
}

// Keep ProseMirror from moving the selection when our controls are clicked.
function consume_mouse_events(element: HTMLElement): void {
  const consume = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  element.addEventListener("mousedown", consume);
  element.addEventListener("click", consume);
}

function get_code_block_ui_state(state: EditorState): CodeBlockUiState {
  return (
    code_block_ui_key.getState(state) ?? { positions: [], view_states: [] }
  );
}

function create_code_block_ui_state(
  doc: ProseNode,
  view_states: CodeBlockViewStates,
): CodeBlockUiState {
  const positions = collect_code_block_positions(doc);
  return {
    positions,
    view_states: positions.map((_, index) =>
      normalize_view_state(view_states[index] ?? null),
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
  const view_states = positions.map(() => null) as CodeBlockViewStates;

  current.positions.forEach((position, index) => {
    const view_state = current.view_states[index] ?? null;
    const next_index = next_index_by_position.get(tr.mapping.map(position, 1));
    if (view_state !== null && next_index !== undefined) {
      view_states[next_index] = view_state;
    }
  });

  return { positions, view_states };
}

function collect_code_block_positions(doc: ProseNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "code_block") positions.push(pos);
  });
  return positions;
}

// Validates restored session data too, so it takes unknown input. Returns null
// for the defaults, which keeps untouched blocks as null in the saved state.
function normalize_view_state(value: unknown): CodeBlockViewState | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Partial<Record<keyof CodeBlockViewState, unknown>>;
  const view_state: CodeBlockViewState = {
    source_height: normalize_code_block_height(input.source_height),
    diagram_height: normalize_code_block_height(input.diagram_height),
    source_hidden: input.source_hidden === true,
    diagram_zoom: normalize_diagram_zoom(input.diagram_zoom),
  };
  return is_same_code_block_view_state(view_state, DEFAULT_VIEW_STATE)
    ? null
    : view_state;
}

function normalize_code_block_height(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(
    Math.max(Math.round(value), CODE_BLOCK_MIN_HEIGHT),
    CODE_BLOCK_MAX_HEIGHT,
  );
}

function normalize_diagram_zoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const zoom = Math.min(Math.max(value, DIAGRAM_ZOOM_MIN), DIAGRAM_ZOOM_MAX);
  return Math.round(zoom * 100) / 100;
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
