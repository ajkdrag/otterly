import type {
  EditorDiagnosticRect,
  EditorDiagnosticSnapshot,
  EditorEngine,
  EditorEngineDiagnostics,
} from "../types/editor_diagnostics";

export function create_editor_diagnostics(input: {
  root: HTMLElement;
  read_engine: () => EditorEngine;
  read_note_path: () => string;
  read_source: () => string;
  read_details: () => EditorEngineDiagnostics | null;
  on_change: (snapshot: EditorDiagnosticSnapshot | null) => void;
}) {
  let enabled = false;
  let frame: number | null = null;
  const trace: EditorDiagnosticSnapshot["trace"] = [];
  const events = [
    "keydown",
    "beforeinput",
    "input",
    "pointerup",
    "focusin",
    "compositionstart",
    "compositionend",
    "scroll",
  ];
  const document = input.root.ownerDocument;

  function refresh() {
    if (!enabled) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    const root = input.root;
    const selection = document.getSelection();
    const owns_selection =
      selection?.anchorNode && root.contains(selection.anchorNode);
    const range =
      owns_selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const viewport = root.getBoundingClientRect();
    input.on_change({
      engine: input.read_engine(),
      note_path: input.read_note_path(),
      captured_at: new Date().toISOString(),
      source: input.read_source(),
      details: input.read_details(),
      focus: describe_node(document.activeElement),
      dom_selection: owns_selection
        ? {
            anchor: describe_node(selection.anchorNode),
            anchor_offset: selection.anchorOffset,
            focus: describe_node(selection.focusNode),
            focus_offset: selection.focusOffset,
            collapsed: selection.isCollapsed,
            caret: caret_rectangle(range),
          }
        : null,
      scroll: [
        ...root.querySelectorAll<HTMLElement>(
          ".cm-scroller, .milkdown, .ProseMirror, .md-table-widget",
        ),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          element: describe_node(element),
          top: element.scrollTop,
          left: element.scrollLeft,
          height: element.scrollHeight,
        })),
      blocks: [
        ...root.querySelectorAll<HTMLElement>(
          ".md-code-block, .md-table-widget, .md-image, .cm-line, .ProseMirror > *",
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            element.getClientRects().length > 0 &&
            rect.bottom > viewport.top &&
            rect.top < viewport.bottom &&
            rect.right > viewport.left &&
            rect.left < viewport.right
          );
        })
        .slice(0, 120)
        .map((element) => ({
          element: describe_node(element),
          from: element.dataset.codeFrom ?? element.dataset.tableFrom ?? null,
          rect: rectangle(element.getBoundingClientRect()),
        })),
      trace: [...trace],
    });
  }

  function schedule_refresh() {
    if (!enabled || frame !== null) return;
    frame = requestAnimationFrame(refresh);
  }

  function record_event(event: Event) {
    if (!enabled) return;
    if (
      event.type === "selectionchange" &&
      !input.root.contains(document.activeElement) &&
      !input.root.contains(document.getSelection()?.anchorNode ?? null)
    )
      return;
    let detail = "";
    if (event instanceof KeyboardEvent) {
      detail = [
        event.metaKey ? "Meta" : "",
        event.ctrlKey ? "Ctrl" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
        event.key,
      ]
        .filter(Boolean)
        .join("+");
    } else if (event instanceof InputEvent) {
      detail = `${event.inputType} ${event.data ?? ""}`.slice(0, 100);
    }
    const selection = document.getSelection();
    const range =
      selection?.anchorNode &&
      input.root.contains(selection.anchorNode) &&
      selection.rangeCount
        ? selection.getRangeAt(0)
        : null;
    trace.push({
      time: Math.round(performance.now()),
      event: event.type,
      detail,
      target: describe_node(event.target instanceof Node ? event.target : null),
      selection: input.read_details()?.selection ?? null,
      caret: caret_rectangle(range),
      scroll: [
        ...input.root.querySelectorAll<HTMLElement>(
          ".cm-scroller, .milkdown, .ProseMirror",
        ),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          element: describe_node(element),
          top: element.scrollTop,
          left: element.scrollLeft,
        })),
    });
    if (trace.length > 100) trace.shift();
    schedule_refresh();
  }

  function set_enabled(next: boolean) {
    if (enabled === next) return;
    enabled = next;
    for (const name of events) {
      if (next) input.root.addEventListener(name, record_event, true);
      else input.root.removeEventListener(name, record_event, true);
    }
    if (next) {
      document.addEventListener("selectionchange", record_event);
      refresh();
    } else {
      document.removeEventListener("selectionchange", record_event);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      trace.length = 0;
      input.on_change(null);
    }
  }

  return {
    set_enabled,
    refresh,
    schedule_refresh,
    clear() {
      trace.length = 0;
      refresh();
    },
    destroy() {
      set_enabled(false);
    },
  };
}

function rectangle(rect: DOMRect): EditorDiagnosticRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function describe_node(node: Node | null): string {
  if (!node) return "none";
  if (node.nodeType === Node.TEXT_NODE)
    return `${describe_node(node.parentNode)} text`;
  if (!(node instanceof Element)) return node.nodeName;
  const classes = [...node.classList].slice(0, 4).join(".");
  return (
    node.tagName.toLowerCase() +
    (node.id ? `#${node.id}` : "") +
    (classes ? `.${classes}` : "")
  );
}

function caret_rectangle(range: Range | null): EditorDiagnosticRect | null {
  if (!range) return null;
  const rect = range.getBoundingClientRect();
  // Empty rows can have a visible editor caret without a measurable DOM range.
  if (rect.width === 0 && rect.height === 0) return null;
  return rectangle(rect);
}
