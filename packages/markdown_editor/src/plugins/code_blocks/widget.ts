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

  // Mirrors apply_view_state at a 16px root: the 8px block margin above and
  // below the card, and a 40px toolbar above the source. Each resize handle
  // is the 12px bottom inset of its box. CodeMirror measures the real box
  // once the widget mounts.
  protected estimate_height(): number {
    const ui = this.ui;
    // Source lines minus the two fences.
    const lines = Math.max(1, this.block.source.split("\n").length - 2);
    const source_height = ui.source_height ?? default_source_height(lines);
    const diagram = is_diagram(this.options, language_of(this.block.source));
    let height = 2 * 8 + 40;
    if (!diagram || !ui.source_hidden) height += source_height;
    if (diagram) height += 40 + (ui.diagram_height ?? 72) + 12;
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
        { key: "Mod-Enter", run: () => this.insert_paragraph_after(true) },
        {
          key: "Backspace",
          run: () => this.convert_single_line_to_paragraph(),
        },
        indentWithTab,
      ],
      on_edge: (direction, vertical) => {
        const current = this.current();
        if (!current) return false;
        // Right or Down at the end of a block that ends the note has no row
        // to move to, so it starts one (Slack does the same). Left and Up stay
        // source-neutral at the document edge, and only Mod-Enter closes an
        // unfinished fence. Blank lines after the block still count as the
        // end, since most saved notes end with a line break. The first of
        // them is then the new row.
        const rest = this.view.state.sliceDoc(current.block.to);
        if (
          direction > 0 &&
          current.source.closing_from !== null &&
          !/\S/.test(rest)
        ) {
          const { state } = this.editor.inner;
          if (state.selection.main.head === state.doc.length)
            return rest === ""
              ? this.insert_paragraph_after(false)
              : this.use_row_after(current);
          // Down earlier on the last line only moves the caret to the line
          // end, like any editor, so a new row takes a second Down. With a
          // row after the block, Down just moves there.
          if (rest === "") {
            this.editor.place_caret(EditorSelection.single(state.doc.length));
            return true;
          }
        }
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
    // Without a saved height the box fits the code, up to the theme's cap.
    const auto_height = ui.source_height === null;
    this.source_host.style.height = auto_height
      ? ""
      : `${String(ui.source_height)}px`;
    this.source_host.style.maxHeight = auto_height
      ? "var(--editor-code-block-max-height, 24rem)"
      : "";
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
    // An auto-height box gets its value from the handle's focus and gesture
    // listeners. Reading the box here would force layout during a CodeMirror
    // update, so a focused handle keeps its last measured value.
    set_value_now(this.source_resize, ui.source_height);
    set_value_now(this.diagram_resize, ui.diagram_height);
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
    // Round up like content_fit_height, so a box that fits its code exactly
    // compares equal to the fit.
    const box_height = () =>
      this.widget.ui[target] ??
      Math.ceil(element().getBoundingClientRect().height);
    // The real ceiling is the content fit, or the box when it is already
    // taller. Both need layout, so we set them on focus and gestures only.
    const set_range = (height: number, fit: number) => {
      handle.setAttribute("aria-valuenow", String(height));
      handle.setAttribute("aria-valuemax", String(Math.max(fit, height)));
    };
    handle.addEventListener("focus", () => {
      set_range(box_height(), this.content_fit_height(target));
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      event.stopPropagation();
      const base = box_height();
      const fit = this.content_fit_height(target);
      const next =
        event.key === "ArrowUp"
          ? clamp_height(base - 16, base)
          : clamp_height(Math.min(Math.max(fit, base), base + 16), base);
      set_range(next, fit);
      // At the limit nothing changes. Skipping the patch also keeps an unset
      // default height from turning into a stored one.
      if (next === base) return;
      this.patch_view_state({ [target]: next });
    });
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      this.cleanup_resize?.();
      const resized = element();
      const start = Math.ceil(resized.getBoundingClientRect().height);
      // A box already taller than its content can shrink but not grow, and
      // never jumps when grabbed.
      const ceiling = Math.max(this.content_fit_height(target), start);
      set_range(start, ceiling);
      const y = event.clientY;
      let height = start;
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        height = clamp_height(
          Math.min(ceiling, start + next.clientY - y),
          start,
        );
        resized.style.height = `${String(height)}px`;
        // An auto-height source box is capped. A drag may go past the cap.
        resized.style.maxHeight = "";
        this.editor.inner.requestMeasure();
      };
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        this.cleanup_resize?.();
        // A click that never moved the handle keeps the saved height as is.
        if (height === start) this.apply_view_state();
        else this.patch_view_state({ [target]: height });
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

  // Height at which the whole content shows without a vertical scrollbar.
  // Read it on a user gesture only, never during a CodeMirror update, because
  // it forces layout. It assumes border-box sizing (the host loads Tailwind
  // preflight) so it matches the style.height we write. We use contentHeight
  // and not scrollHeight because .cm-content has min-height:100%, so
  // scrollHeight just equals the box once the box is taller than the code.
  private content_fit_height(target: "source_height" | "diagram_height") {
    if (target === "source_height") {
      const { contentHeight, scrollDOM } = this.editor.inner;
      // The horizontal scrollbar takes room from the same box.
      const scrollbar = scrollDOM.offsetHeight - scrollDOM.clientHeight;
      return Math.ceil(contentHeight + scrollbar);
    }
    // Without an explicit height the preview sizes itself to the diagram.
    // While it has no overflow the browser clamps its scroll offset to 0, and
    // putting the height back does not undo that, so we restore it ourselves.
    const { preview } = this;
    const { scrollTop, scrollLeft } = preview;
    const saved = preview.style.height;
    preview.style.height = "";
    const fit = preview.getBoundingClientRect().height;
    preview.style.height = saved;
    preview.scrollTop = scrollTop;
    preview.scrollLeft = scrollLeft;
    return Math.ceil(fit);
  }

  // Mod-Enter: close an unfinished fence if needed, then start a paragraph
  // after the block with the block's container prefix. Mod-Enter leaves a
  // blank row first (blank_row); the arrow escape adds just the one row.
  private insert_paragraph_after(blank_row: boolean): boolean {
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
    insert += "\n" + prefix + (blank_row ? "\n" + prefix : "");
    this.view.dispatch({
      changes: { from: source.to, insert },
      selection: { anchor: source.to + insert.length },
      userEvent: "input.code.boundary",
    });
    this.view.focus();
    return true;
  }

  // The arrow escape when blank lines follow the last block: the first one
  // becomes the row, with the block's container prefix as its only text. A
  // read-only note keeps its text, and the caret moves to the row as it is.
  private use_row_after({ source }: CurrentCodeBlock): boolean {
    const { state } = this.view;
    const row_to =
      source.to + state.sliceDoc(source.to).split("\n", 2).join("\n").length;
    const row = this.widget.read_only
      ? state.sliceDoc(source.to, row_to)
      : "\n" + source.continuation_prefix;
    this.view.dispatch({
      changes:
        state.sliceDoc(source.to, row_to) === row
          ? []
          : { from: source.to, to: row_to, insert: row },
      selection: { anchor: source.to + row.length },
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

// Only for estimate_height: about 20px per line plus the 12px top inset and
// the 12px handle row, up to the 24rem cap. The real box fits the code.
function default_source_height(lines: number): number {
  return Math.min(384, lines * 20 + 24);
}

function set_value_now(handle: HTMLElement, height: number | null): void {
  if (height !== null) handle.setAttribute("aria-valuenow", String(height));
  else if (handle !== document.activeElement)
    handle.removeAttribute("aria-valuenow");
}

// A box that already fits under min_height (a one or two line block with no
// saved height) keeps its own height as the floor, so a gesture never grows it.
function clamp_height(height: number, current: number): number {
  const floor = Math.min(min_height, current);
  return Math.min(
    max_height,
    Math.max(floor, Number.isFinite(height) ? height : floor),
  );
}

const code_editor_theme = EditorView.theme({
  // An auto-height source box has no height, only a max-height. Inherit the
  // cap so the scroller shrinks to it and scrolls instead of being clipped.
  "&": { height: "100%", maxHeight: "inherit" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono, monospace)",
  },
  // No bottom inset here: the resize handle below the box is that inset.
  ".cm-content": {
    padding: "var(--editor-block-padding-y, 0.75rem) 0 0",
    maxWidth: "none",
    margin: "0",
    fontSize: "inherit",
  },
  ".cm-line": { padding: "0 0.5rem" },
});
