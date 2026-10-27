import {
  Compartment,
  EditorSelection,
  Transaction,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import {
  LanguageDescription,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  BlockWidget,
  block_for_dom,
  patch_block_view_state,
  wrap_in_layers,
  type Block,
  type BlockController,
} from "../../core/block_field.js";
import {
  NestedEditor,
  caret_x,
  focus_selection,
  leave_block,
  vertical_cursor,
} from "../../core/surface.js";
import {
  change_code_language,
  change_code_to_paragraph,
  code_window,
  read_code_block,
  remove_code_block,
  type CodeBlockSource,
} from "./fence_source.js";
import {
  create_code_language_picker,
  find_code_language,
} from "./language_picker.js";

export type CodeBlockViewState = {
  source_height: number | null;
  diagram_height: number | null;
  source_hidden: boolean;
  diagram_zoom: number;
};

export type CodeBlockOptions = {
  languages?: readonly LanguageDescription[];
  // Extensions for every code editor, such as a highlight style.
  code_extensions?: Extension;
  copy_code?: (text: string) => void | Promise<void>;
  diagram_languages?: readonly string[];
  // Return a sanitized element. The host owns the diagram engine and its IO.
  render_diagram?: (request: {
    language: string;
    content: string;
    signal: AbortSignal;
  }) => Promise<HTMLElement | SVGElement | null>;
  on_view_states_change?: (states: readonly CodeBlockViewState[]) => void;
};

const default_view_state: CodeBlockViewState = {
  source_height: null,
  diagram_height: null,
  source_hidden: false,
  diagram_zoom: 1,
};
const zoom_levels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 10];
const min_height = 48;
const max_height = 4096;

export function normalize_view_state(value: unknown): CodeBlockViewState {
  const state = (value ?? {}) as Partial<CodeBlockViewState>;
  const height = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.min(max_height, Math.max(min_height, Math.round(input)))
      : null;
  return {
    source_height: height(state.source_height),
    diagram_height: height(state.diagram_height),
    source_hidden: state.source_hidden === true,
    diagram_zoom:
      typeof state.diagram_zoom === "number" &&
      Number.isFinite(state.diagram_zoom)
        ? Math.round(Math.min(10, Math.max(0.25, state.diagram_zoom)) * 100) /
          100
        : 1,
  };
}

export class CodeBlockWidget extends BlockWidget {
  constructor(
    block: Block,
    read_only: boolean,
    readonly options: CodeBlockOptions,
    // Bumped by refresh_code_diagrams so diagrams render again.
    readonly diagram_revision: number,
  ) {
    super(block, read_only);
  }

  protected override same_options(other: BlockWidget): boolean {
    return (
      other instanceof CodeBlockWidget &&
      other.options === this.options &&
      other.diagram_revision === this.diagram_revision
    );
  }

  get ui(): CodeBlockViewState {
    return normalize_view_state(this.block.view_state ?? default_view_state);
  }

  // Mirrors apply_view_state at a 16px root: a 40px toolbar, a 14px resize
  // handle, and about 32px of spacing. CodeMirror measures the real box once
  // the widget mounts.
  protected estimate_height(): number {
    const ui = this.ui;
    const lines = this.block.source.split("\n").length - 1;
    const source_height = ui.source_height ?? default_source_height(lines);
    const diagram = is_diagram(this.options, language_of(this.block.source));
    let height = 40 + 32;
    if (!diagram || !ui.source_hidden) height += source_height + 14;
    if (diagram) height += 40 + (ui.diagram_height ?? 72) + 14;
    return height;
  }

  protected create_controller(view: EditorView): BlockController {
    return new CodeBlockController(view, this);
  }
}

function language_of(source: string): string {
  return (
    /^[ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+)?[ \t]*(?:`{3,}|~{3,})\s*(\S*)/.exec(
      source,
    )?.[1] ?? ""
  );
}

function is_diagram(options: CodeBlockOptions, language: string): boolean {
  return (
    !!options.render_diagram &&
    (options.diagram_languages ?? ["mermaid"]).includes(language.toLowerCase())
  );
}

type CurrentCodeBlock = { block: Block; source: CodeBlockSource };

class CodeBlockController implements BlockController {
  readonly root = document.createElement("section");
  private readonly source_host = document.createElement("div");
  private readonly preview = document.createElement("div");
  private readonly diagram_content = document.createElement("div");
  private readonly status = document.createElement("span");
  private readonly remove_button: HTMLButtonElement;
  private readonly source_toggle = document.createElement("button");
  private readonly diagram_controls = document.createElement("div");
  private readonly language_picker: ReturnType<
    typeof create_code_language_picker
  >;
  private readonly zoom_out: HTMLButtonElement;
  private readonly zoom_reset: HTMLButtonElement;
  private readonly zoom_in: HTMLButtonElement;
  private readonly source_resize: HTMLElement;
  private readonly diagram_resize: HTMLElement;
  private readonly language_slot = new Compartment();
  private readonly editor: NestedEditor;
  private widget: CodeBlockWidget;
  private source: CodeBlockSource;
  private destroyed = false;
  private language_request = 0;
  private preview_request: AbortController | null = null;
  private cleanup_resize: (() => void) | null = null;

  constructor(
    readonly view: EditorView,
    widget: CodeBlockWidget,
  ) {
    this.widget = widget;
    this.source = read_source(view.state, widget.block);
    this.language_picker = create_code_language_picker(
      view.dom,
      widget.options.languages ?? [],
      (language) => {
        this.change_language(language);
      },
    );
    this.remove_button = create_button("Remove code block", () => {
      this.remove_block();
    });
    this.zoom_out = create_button("Zoom diagram out", () => {
      this.change_zoom(-1);
    });
    this.zoom_reset = create_button("Reset diagram zoom", () => {
      this.patch_view_state({ diagram_zoom: 1 });
    });
    this.zoom_in = create_button("Zoom diagram in", () => {
      this.change_zoom(1);
    });
    this.source_resize = this.create_resize_handle(
      "source_height",
      "Resize code block",
    );
    this.diagram_resize = this.create_resize_handle(
      "diagram_height",
      "Resize diagram",
    );
    this.root.className = "md-code-block";
    this.root.setAttribute("aria-label", "Code block");
    this.root.append(wrap_in_layers(widget.block, this.build_panel()));
    this.editor = this.create_source_editor();
    this.apply_widget(widget, null);
    this.editor.refresh_highlights(code_window(this.source));
  }

  update(widget: BlockWidget): boolean {
    if (!(widget instanceof CodeBlockWidget)) return false;
    const previous = this.widget;
    this.widget = widget;
    this.source = read_source(this.view.state, widget.block);
    this.editor.refresh(code_window(this.source));
    this.apply_widget(widget, previous);
    this.editor.refresh_highlights(code_window(this.source));
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.language_request++;
    this.preview_request?.abort();
    this.cleanup_resize?.();
    this.language_picker.destroy();
    this.editor.destroy();
  }

  owns(position: number): boolean {
    const current = this.current();
    return (
      !!current &&
      position >= current.source.content_from &&
      position <= current.source.content_to
    );
  }

  focus(position: number | null): boolean {
    if (this.source_host.hidden)
      this.patch_view_state({ source_hidden: false });
    this.editor.focus(position);
    return true;
  }

  sync_selection(): void {
    this.editor.sync_selection_from_outer();
  }

  // A selected find match inside hidden diagram source shows the source.
  // This runs inside an outer update, so the view-state change waits.
  refresh_highlights(): void {
    const drawn = this.editor.refresh_highlights();
    if (
      !this.source_host.hidden ||
      !drawn.some((highlight) => highlight.selected)
    )
      return;
    queueMicrotask(() => {
      if (!this.destroyed && this.source_host.hidden)
        this.patch_view_state({ source_hidden: false });
    });
  }

  enter(side: -1 | 1, goal_x: number | null): boolean {
    if (this.source_host.hidden) return false;
    const { inner } = this.editor;
    const position = side > 0 ? 0 : inner.state.doc.length;
    this.editor.place_caret(
      goal_x === null
        ? EditorSelection.create([EditorSelection.cursor(position)])
        : vertical_cursor(inner, position, goal_x),
    );
    return true;
  }

  // The block this widget shows right now. During a document change the DOM
  // can briefly map to another block, so a missing fence means "not mine".
  private current(): CurrentCodeBlock | null {
    const block = block_for_dom(this.view, this.root);
    const source =
      block && read_code_block(this.view.state, block.from, block.to);
    return block && source ? { block, source } : null;
  }

  // Layout: toolbar, code body, resize handle, then the diagram controls,
  // preview, and its resize handle. The diagram parts hide for plain code.
  private build_panel(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "md-code-toolbar";
    this.status.setAttribute("role", "status");
    toolbar.append(this.language_picker.button, this.status);
    if (this.widget.options.copy_code) {
      const copy = create_button("Copy code", () => {
        void this.copy_source();
      });
      copy.className = "md-code-copy";
      copy.replaceChildren(lucide_icon(clipboard_paths));
      toolbar.append(copy);
    }
    this.remove_button.className = "md-code-remove";
    this.remove_button.replaceChildren(lucide_icon(x_paths));
    toolbar.append(this.remove_button);

    this.source_host.className = "md-code-source";
    this.preview.className = "md-code-diagram";
    this.diagram_content.className = "md-code-diagram-content";
    this.preview.append(this.diagram_content);

    this.source_toggle.type = "button";
    this.source_toggle.addEventListener("click", () => {
      this.patch_view_state({ source_hidden: !this.widget.ui.source_hidden });
    });
    this.zoom_out.textContent = "−";
    this.zoom_reset.className = "md-code-zoom-reset";
    this.zoom_in.textContent = "+";
    this.diagram_controls.className =
      "md-code-toolbar md-code-diagram-controls";
    this.diagram_controls.append(
      this.source_toggle,
      this.zoom_out,
      this.zoom_reset,
      this.zoom_in,
    );

    const panel = document.createElement("div");
    panel.className = "md-code-panel";
    panel.append(
      toolbar,
      this.source_host,
      this.source_resize,
      this.diagram_controls,
      this.preview,
      this.diagram_resize,
    );
    return panel;
  }

  private create_source_editor(): NestedEditor {
    return new NestedEditor({
      outer: this.view,
      parent: this.source_host,
      initial_window: code_window(this.source),
      read_window: () => {
        const current = this.current();
        return current ? code_window(current.source) : null;
      },
      read_only: this.widget.read_only,
      extensions: [
        this.language_slot.of([]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        this.widget.options.code_extensions ?? [],
        code_editor_theme,
      ],
      keys: [
        { key: "Mod-Enter", run: () => this.insert_paragraph_after() },
        {
          key: "Backspace",
          run: () => this.convert_single_line_to_paragraph(),
        },
        indentWithTab,
      ],
      on_edge: (direction, vertical) => {
        const current = this.current();
        if (!current) return false;
        return leave_block(
          this.view,
          current.block,
          direction,
          vertical ? caret_x(this.editor.inner) : null,
        );
      },
    });
  }

  private change_language(language: string) {
    const current = this.current();
    if (this.widget.read_only || !current) return;
    this.view.dispatch({
      changes: change_code_language(this.view.state, current.source, language),
      userEvent: "input.code.language",
    });
  }

  private apply_widget(
    widget: CodeBlockWidget,
    previous: CodeBlockWidget | null,
  ) {
    const language = this.source.language;
    const previous_language = previous
      ? language_of(previous.block.source)
      : null;
    if (!previous || previous.read_only !== widget.read_only) {
      this.editor.set_read_only(widget.read_only);
      this.remove_button.hidden = widget.read_only;
    }
    if (previous_language !== language) void this.load_language(language);
    if (
      previous_language !== language ||
      previous?.read_only !== widget.read_only
    )
      this.language_picker.update_language(language, widget.read_only);
    this.apply_view_state();
    if (
      !previous ||
      previous_language !== language ||
      previous.block.source !== widget.block.source ||
      previous.diagram_revision !== widget.diagram_revision
    )
      void this.render_preview();
  }

  private async load_language(name: string): Promise<void> {
    const request = ++this.language_request;
    this.status.textContent = "";
    this.editor.inner.dispatch({ effects: this.language_slot.reconfigure([]) });
    const language = find_code_language(
      this.widget.options.languages ?? [],
      name,
    );
    if (!language) return;
    try {
      const support = await language.load();
      if (!this.destroyed && request === this.language_request)
        this.editor.inner.dispatch({
          effects: this.language_slot.reconfigure(support),
        });
    } catch (error) {
      if (this.destroyed || request !== this.language_request) return;
      console.error(
        `markdown editor: could not load the ${language.name} grammar`,
        error,
      );
      this.status.textContent = "Language highlighting unavailable";
    }
  }

  private async copy_source(): Promise<void> {
    try {
      await this.widget.options.copy_code?.(
        this.editor.inner.state.doc.toString(),
      );
      if (!this.destroyed) this.status.textContent = "Copied";
    } catch {
      if (!this.destroyed) this.status.textContent = "Could not copy code";
    }
  }

  private async render_preview(): Promise<void> {
    this.preview_request?.abort();
    const language = this.source.language;
    const content = this.source.content.toString();
    if (!is_diagram(this.widget.options, language) || !content.trim()) {
      this.diagram_content.replaceChildren();
      return;
    }
    const request = new AbortController();
    this.preview_request = request;
    try {
      const element = await this.widget.options.render_diagram?.({
        language,
        content,
        signal: request.signal,
      });
      if (this.destroyed || request.signal.aborted) return;
      this.diagram_content.replaceChildren(...(element ? [element] : []));
      this.diagram_content.dataset.intrinsicSvg = String(
        fit_svg_to_view_box(element ?? null),
      );
      this.apply_diagram_zoom();
    } catch (error) {
      if (this.destroyed || request.signal.aborted) return;
      const message = document.createElement("div");
      message.className = "md-code-error";
      message.textContent =
        error instanceof Error ? error.message : "Could not render diagram";
      this.diagram_content.replaceChildren(message);
    }
  }

  private apply_view_state(): void {
    const ui = this.widget.ui;
    const diagram = is_diagram(this.widget.options, this.source.language);
    const hidden = diagram && ui.source_hidden;
    this.source_host.hidden = hidden;
    this.source_resize.hidden = hidden;
    const lines = this.source.content.lines;
    this.source_host.style.height = `${String(ui.source_height ?? default_source_height(lines))}px`;
    this.preview.style.height =
      ui.diagram_height === null ? "" : `${String(ui.diagram_height)}px`;
    this.apply_diagram_zoom();
    this.preview.hidden = !diagram;
    this.diagram_controls.hidden = !diagram;
    this.diagram_resize.hidden = !diagram;
    this.zoom_out.disabled = ui.diagram_zoom <= 0.25;
    this.zoom_in.disabled = ui.diagram_zoom >= 10;
    this.zoom_reset.textContent = `${String(Math.round(ui.diagram_zoom * 100))}%`;
    this.source_toggle.textContent = hidden ? "Show source" : "Hide source";
    this.source_toggle.setAttribute(
      "aria-label",
      this.source_toggle.textContent,
    );
    this.source_toggle.setAttribute("aria-pressed", String(hidden));
    this.source_resize.setAttribute(
      "aria-valuenow",
      String(Number.parseFloat(this.source_host.style.height)),
    );
    this.diagram_resize.setAttribute(
      "aria-valuenow",
      String(
        ui.diagram_height ??
          Math.max(min_height, this.preview.getBoundingClientRect().height),
      ),
    );
    this.editor.inner.requestMeasure();
  }

  private apply_diagram_zoom(): void {
    const zoom = String(this.widget.ui.diagram_zoom);
    this.diagram_content.style.setProperty("--md-code-diagram-zoom", zoom);
    this.diagram_content.style.zoom =
      this.diagram_content.dataset.intrinsicSvg === "true" ? "" : zoom;
  }

  private patch_view_state(patch: Partial<CodeBlockViewState>): void {
    const current = this.current();
    if (!current) return;
    this.view.dispatch({
      effects: patch_block_view_state.of({
        from: current.block.from,
        value: normalize_view_state({ ...this.widget.ui, ...patch }),
      }),
      annotations: Transaction.addToHistory.of(false),
    });
  }

  private change_zoom(direction: number): void {
    const current = this.widget.ui.diagram_zoom;
    const next =
      direction > 0
        ? zoom_levels.find((level) => level > current)
        : [...zoom_levels].reverse().find((level) => level < current);
    this.patch_view_state({ diagram_zoom: next ?? current });
  }

  // Keyboard: Up/Down change the height by 16px. Pointer: drag, then commit
  // one view-state change on release. Cancel restores the previous size.
  private create_resize_handle(
    target: "source_height" | "diagram_height",
    label: string,
  ): HTMLElement {
    const handle = document.createElement("div");
    handle.className = "md-code-resize";
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", label);
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-valuemin", String(min_height));
    handle.setAttribute("aria-valuemax", String(max_height));
    const element = () =>
      target === "source_height" ? this.source_host : this.preview;
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      event.stopPropagation();
      const base =
        this.widget.ui[target] ?? element().getBoundingClientRect().height;
      this.patch_view_state({
        [target]: clamp_height(base + (event.key === "ArrowUp" ? -16 : 16)),
      });
    });
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      this.cleanup_resize?.();
      const resized = element();
      const start = resized.getBoundingClientRect().height;
      const y = event.clientY;
      let height = start;
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        height = clamp_height(start + next.clientY - y);
        resized.style.height = `${String(height)}px`;
        this.editor.inner.requestMeasure();
      };
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        this.cleanup_resize?.();
        this.patch_view_state({ [target]: height });
      };
      const cancel = () => {
        this.cleanup_resize?.();
        this.apply_view_state();
      };
      this.cleanup_resize = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", cancel);
        this.cleanup_resize = null;
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", cancel);
    });
    return handle;
  }

  // Mod-Enter: close an unfinished fence if needed, then start a paragraph
  // after the block with the block's container prefix.
  private insert_paragraph_after(): boolean {
    const current = this.current();
    if (this.widget.read_only || !current) return false;
    const { source } = current;
    const prefix = source.continuation_prefix;
    let insert = "";
    if (source.closing_from === null) {
      if (this.view.state.sliceDoc(source.to - 1, source.to) !== "\n")
        insert += "\n";
      insert += prefix + source.fence;
    }
    insert += "\n" + prefix + "\n" + prefix;
    this.view.dispatch({
      changes: { from: source.to, insert },
      selection: { anchor: source.to + insert.length },
      userEvent: "input.code.boundary",
    });
    this.view.focus();
    return true;
  }

  private remove_block(): void {
    const current = this.current();
    if (this.widget.read_only || !current) return;
    const removed = remove_code_block(this.view.state, current.source);
    this.view.dispatch({
      changes: removed.changes,
      selection: { anchor: removed.cursor },
      userEvent: "input.code.remove",
    });
    if (!focus_selection(this.view)) this.view.focus();
  }

  // Backspace at the start of a one-line body turns it into a paragraph.
  // Multi-line bodies and selections keep their code block.
  private convert_single_line_to_paragraph(): boolean {
    const { state } = this.editor.inner;
    const current = this.current();
    if (
      this.widget.read_only ||
      !current ||
      state.doc.lines !== 1 ||
      state.selection.ranges.length !== 1 ||
      !state.selection.main.empty ||
      state.selection.main.head !== 0
    )
      return false;
    const converted = change_code_to_paragraph(this.view.state, current.source);
    this.view.dispatch({
      changes: converted.changes,
      selection: { anchor: converted.cursor },
      userEvent: "input.code.convert",
    });
    this.view.focus();
    return true;
  }
}

function read_source(state: EditorState, block: Block): CodeBlockSource {
  const source = read_code_block(state, block.from, block.to);
  if (!source) throw new RangeError("Fenced code block lost its fence");
  return source;
}

// Mermaid emits width=100%. Start at the viewBox width, capped by the
// viewport, and scale only when the user zooms the diagram. Returns false
// when there is no SVG with a usable viewBox width.
function fit_svg_to_view_box(
  element: HTMLElement | SVGElement | null,
): boolean {
  const svg =
    element?.tagName.toLowerCase() === "svg"
      ? element
      : element?.querySelector("svg");
  const width = Number(svg?.getAttribute("viewBox")?.trim().split(/[ ,]+/)[2]);
  if (!svg || !Number.isFinite(width) || width <= 0) return false;
  svg.style.width = `calc(min(100%, ${String(width)}px) * var(--md-code-diagram-zoom, 1))`;
  svg.style.maxWidth = "none";
  svg.style.height = "auto";
  svg.style.display = "block";
  svg.style.marginInline = "auto";
  return true;
}

function create_button(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

const clipboard_paths = [
  "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
];
const x_paths = ["M18 6 6 18", "m6 6 12 12"];

// Lucide icons. The button keeps its aria-label, so the icon is decorative.
function lucide_icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const path_data of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", path_data);
    svg.append(path);
  }
  return svg;
}

// About 22px per line plus padding, between 64px and 320px.
function default_source_height(lines: number): number {
  return Math.min(320, Math.max(64, lines * 22 + 16));
}

function clamp_height(height: number): number {
  return Math.min(
    max_height,
    Math.max(min_height, Number.isFinite(height) ? height : min_height),
  );
}

const code_editor_theme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono, monospace)",
  },
  ".cm-content": {
    padding: "0.5rem 0",
    maxWidth: "none",
    margin: "0",
    fontSize: "inherit",
  },
  ".cm-line": { padding: "0 0.5rem" },
});
