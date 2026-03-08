export type Position = { x: number; y: number };

export type DraggableOptions = {
  handle_selector?: string | undefined;
  on_drag_start?: (() => void) | undefined;
  on_drag_end?: (() => void) | undefined;
};

const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, label, " +
  "[contenteditable], " +
  '[role="slider"], [role="switch"], [role="checkbox"], ' +
  '[role="combobox"], [role="radio"], [role="spinbutton"], [role="textbox"]';

export function draggable(
  node: HTMLElement,
  options: DraggableOptions,
): { update: (opts: DraggableOptions) => void; destroy: () => void } {
  let current_options = options;
  let is_dragging = false;
  let start_pointer: Position = { x: 0, y: 0 };
  let start_position: Position = { x: 0, y: 0 };

  function get_handle(): HTMLElement {
    if (current_options.handle_selector) {
      const handle = node.querySelector<HTMLElement>(
        current_options.handle_selector,
      );
      if (handle) return handle;
    }
    return node;
  }

  function is_interactive_target(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const match = target.closest(INTERACTIVE_SELECTOR);
    return match !== null && node.contains(match);
  }

  function clamp_to_viewport(pos: Position): Position {
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const min_visible = 100;

    return {
      x: Math.max(min_visible - rect.width, Math.min(pos.x, vw - min_visible)),
      y: Math.max(min_visible - rect.height, Math.min(pos.y, vh - min_visible)),
    };
  }

  function on_pointer_down(e: PointerEvent) {
    if (e.button !== 0) return;

    const handle = get_handle();
    if (e.target !== handle && !handle.contains(e.target as Node)) return;
    if (is_interactive_target(e.target)) return;

    is_dragging = true;
    start_pointer = { x: e.clientX, y: e.clientY };

    const rect = node.getBoundingClientRect();
    start_position = { x: rect.left, y: rect.top };

    node.style.transition = "none";
    node.style.transform = "none";
    node.style.translate = "none";
    node.style.left = `${String(rect.left)}px`;
    node.style.top = `${String(rect.top)}px`;
    node.style.cursor = "grabbing";

    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(e.pointerId);
    }
    current_options.on_drag_start?.();

    document.addEventListener("pointermove", on_pointer_move);
    document.addEventListener("pointerup", on_pointer_up);
  }

  function on_pointer_move(e: PointerEvent) {
    if (!is_dragging) return;

    const delta_x = e.clientX - start_pointer.x;
    const delta_y = e.clientY - start_pointer.y;

    const clamped = clamp_to_viewport({
      x: start_position.x + delta_x,
      y: start_position.y + delta_y,
    });

    node.style.left = `${String(clamped.x)}px`;
    node.style.top = `${String(clamped.y)}px`;
  }

  function on_pointer_up(e: PointerEvent) {
    if (!is_dragging) return;

    is_dragging = false;
    node.style.cursor = "";
    const handle = get_handle();
    if (typeof handle.releasePointerCapture === "function") {
      handle.releasePointerCapture(e.pointerId);
    }

    document.removeEventListener("pointermove", on_pointer_move);
    document.removeEventListener("pointerup", on_pointer_up);

    current_options.on_drag_end?.();
  }

  function setup() {
    const handle = get_handle();
    handle.addEventListener("pointerdown", on_pointer_down);
  }

  function cleanup() {
    const handle = get_handle();
    handle.removeEventListener("pointerdown", on_pointer_down);
    document.removeEventListener("pointermove", on_pointer_move);
    document.removeEventListener("pointerup", on_pointer_up);
  }

  setup();

  return {
    update(new_options: DraggableOptions) {
      cleanup();
      current_options = new_options;
      setup();
    },
    destroy() {
      cleanup();
    },
  };
}
