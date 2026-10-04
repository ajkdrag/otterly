import {
  Compartment,
  Prec,
  Facet,
  StateEffect,
  StateField,
  Transaction,
  EditorState,
  EditorSelection,
  countColumn,
  findColumn,
  Annotation,
  type Extension,
  type StateCommand,
  type SelectionRange,
} from "@codemirror/state";
import { defaultKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import {
  LanguageDescription,
  defaultHighlightStyle,
  syntaxHighlighting,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import {
  Decoration,
  EditorView,
  drawSelection,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import { create_code_language_picker } from "./code_block_language_picker.js";
import { focus_table_selection } from "./table_rendering.js";
import { get_frontmatter_end } from "./frontmatter_range.js";
import {
  get_find_matches,
  get_find_query,
  markdown_find_highlights,
  update_find_query,
} from "./find_highlights.js";
import {
  change_code_content,
  code_position_to_source,
  code_container_prefix_length,
  source_position_to_code,
  change_code_language,
  change_code_to_paragraph,
  read_code_block,
  type CodeBlockSource,
} from "./code_block_source.js";

export type CodeBlockViewState = {
  source_height: number | null;
  diagram_height: number | null;
  source_hidden: boolean;
  diagram_zoom: number;
};
export type CodeBlockOptions = {
  languages?: readonly LanguageDescription[];
  code_extensions?: Extension;
  copy_code?: (text: string) => void | Promise<void>;
  diagram_languages?: readonly string[];
  // Return a sanitized element. The host owns the diagram engine and its IO.
  render_diagram?: (request: {
    language: string;
    content: string;
    signal: AbortSignal;
  }) => Promise<HTMLElement | SVGElement | null>;
  undo?: StateCommand;
  redo?: StateCommand;
  initial_view_states?: readonly (CodeBlockViewState | null)[];
  on_view_states_change?: (states: readonly CodeBlockViewState[]) => void;
};

export function code_block_rendering(
  options: CodeBlockOptions = {},
): Extension {
  return [
    code_options.of(options),
    code_blocks,
    refresh_code_syntax,
    code_block_theme,
    Prec.highest(keymap.of([{ key: "Enter", run: start_code_body }])),
    keymap.of([
      { key: "ArrowDown", run: (view) => enter_code_block(view, 1) },
      { key: "ArrowUp", run: (view) => enter_code_block(view, -1) },
      { key: "ArrowRight", run: (view) => enter_code_block(view, 1, true) },
      { key: "ArrowLeft", run: (view) => enter_code_block(view, -1, true) },
    ]),
    EditorView.updateListener.of((update) => {
      if (
        update.viewportChanged ||
        get_find_query(update.startState) !== get_find_query(update.state)
      ) {
        for (const root of update.view.dom.querySelectorAll<HTMLElement>(
          ".md-code-block",
        ))
          controllers.get(root)?.synchronize_find();
      }
      if (
        (update.selectionSet || update.viewportChanged || update.docChanged) &&
        !update.transactions.some(
          (transaction) =>
            transaction.isUserEvent("select.code") ||
            transaction.annotation(code_input),
        )
      )
        synchronize_code_selection(
          update.view,
          update.view.hasFocus &&
            (update.startState.field(code_blocks).editing_fence_from !== null ||
              (update.docChanged &&
                update.startState
                  .field(code_blocks)
                  .blocks.some((block) => block.needs_opening_newline)) ||
              update.transactions.some(
                (transaction) =>
                  transaction.isUserEvent("undo") ||
                  transaction.isUserEvent("redo") ||
                  transaction.isUserEvent("history"),
              )),
        );
      const before = update.startState.field(code_blocks);
      const after = update.state.field(code_blocks);
      if (
        before.blocks.length !== after.blocks.length ||
        after.blocks.some(
          (block, index) => block.ui !== before.blocks[index]?.ui,
        )
      )
        options.on_view_states_change?.(
          after.blocks.map((block) => ({ ...block.ui })),
        );
    }),
  ];
}

export function read_code_block_view_states(
  state: EditorState,
): readonly CodeBlockViewState[] {
  return (
    state.field(code_blocks, false)?.blocks.map((block) => ({ ...block.ui })) ??
    []
  );
}

export function focus_code_selection(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const block = view.state
    .field(code_blocks, false)
    ?.blocks.find(
      (candidate) =>
        selection.from >= candidate.content_from &&
        selection.to <= candidate.content_to,
    );
  if (!block) return false;
  if (block.ui.source_hidden)
    view.dispatch({
      effects: patch_code_view.of({
        from: block.from,
        patch: { source_hidden: false },
      }),
    });
  view.dispatch({ effects: EditorView.scrollIntoView(selection.head) });
  const root = view.dom.querySelector<HTMLElement>(
    `.md-code-block[data-code-from="${String(block.from)}"]`,
  );
  const controller = root ? controllers.get(root) : undefined;
  if (!controller) return false;
  controller.synchronize_selection();
  controller.inner.focus();
  return true;
}

export const replace_code_block_view_states =
  StateEffect.define<readonly (CodeBlockViewState | null)[]>();
export const refresh_code_diagrams = StateEffect.define();

const code_options = Facet.define<CodeBlockOptions, CodeBlockOptions>({
  combine: (values) => values[0] ?? {},
});
const refresh_code_blocks = StateEffect.define();
const code_input = Annotation.define<boolean>();
const patch_code_view = StateEffect.define<{
  from: number;
  patch: Partial<CodeBlockViewState>;
}>();
const default_view_state: CodeBlockViewState = {
  source_height: null,
  diagram_height: null,
  source_hidden: false,
  diagram_zoom: 1,
};
const zoom_levels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 10];
type CodeBlock = CodeBlockSource & { ui: CodeBlockViewState };
type CodeBlockState = {
  blocks: readonly CodeBlock[];
  decorations: DecorationSet;
  diagram_revision: number;
  editing_fence_from: number | null;
};

const code_blocks = StateField.define<CodeBlockState>({
  create(state) {
    const blocks = parse_code_blocks(state, []);
    const initial = state.facet(code_options).initial_view_states;
    const restored = blocks.map((block, index) => ({
      ...block,
      ui: normalize_view_state(initial?.[index] ?? default_view_state),
    }));
    return build_code_decorations(state, restored, 0);
  },
  update(value, transaction) {
    let blocks = value.blocks;
    let revision = value.diagram_revision;
    let editing_fence_from = value.editing_fence_from;
    let changed =
      transaction.startState.readOnly !== transaction.state.readOnly ||
      transaction.startState.facet(EditorView.editable) !==
        transaction.state.facet(EditorView.editable);
    if (transaction.docChanged) {
      const mapped = blocks.flatMap((block) => {
        const from = transaction.changes.mapPos(block.from, 1);
        const to = transaction.changes.mapPos(
          block.to,
          transaction.annotation(code_input) ? 1 : -1,
        );
        const source = read_code_block(transaction.state, from, to);
        return source ? [{ ...source, ui: block.ui }] : [];
      });
      // Edits from the embedded editor preserve both fence boundaries. Mapping
      // those spans keeps a large block mounted while Lezer reparses it.
      blocks = transaction.annotation(code_input)
        ? mapped
        : parse_code_blocks(transaction.state, mapped);
      changed = true;
    }
    for (const effect of transaction.effects) {
      if (effect.is(refresh_code_blocks)) {
        blocks = parse_code_blocks(transaction.state, blocks);
        changed = true;
      }
      if (effect.is(refresh_code_diagrams)) {
        revision++;
        changed = true;
      }
      if (effect.is(replace_code_block_view_states)) {
        blocks = blocks.map((block, index) => ({
          ...block,
          ui: normalize_view_state(effect.value[index] ?? default_view_state),
        }));
        changed = true;
      }
      if (effect.is(patch_code_view)) {
        blocks = blocks.map((block) =>
          block.from === effect.value.from
            ? {
                ...block,
                ui: normalize_view_state({
                  ...block.ui,
                  ...effect.value.patch,
                }),
              }
            : block,
        );
        changed = true;
      }
    }
    // Keep a fence being typed in the outer editor until its info line ends.
    // Replacing it at the third backtick makes native typing target hidden DOM.
    if (editing_fence_from !== null) {
      editing_fence_from = transaction.changes.mapPos(editing_fence_from, -1);
      const opening = transaction.state.doc.lineAt(editing_fence_from);
      const selection = transaction.state.selection.main;
      if (
        selection.from < opening.from ||
        selection.to > opening.to ||
        !blocks.some((block) => block.from === editing_fence_from)
      )
        editing_fence_from = null;
    }
    if (
      editing_fence_from === null &&
      transaction.docChanged &&
      transaction.isUserEvent("input") &&
      !transaction.annotation(code_input)
    ) {
      const selection = transaction.state.selection.main;
      const created = blocks.find(
        (block) =>
          !value.blocks.some(
            (previous) =>
              transaction.changes.mapPos(previous.from, 1) === block.from,
          ) &&
          selection.from >= block.from &&
          selection.to <= transaction.state.doc.lineAt(block.from).to,
      );
      if (created) editing_fence_from = created.from;
    }
    changed ||= editing_fence_from !== value.editing_fence_from;
    return changed
      ? build_code_decorations(
          transaction.state,
          blocks,
          revision,
          editing_fence_from,
        )
      : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
  ],
});

function parse_code_blocks(
  state: EditorState,
  previous: readonly CodeBlock[],
): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const metadata_end = get_frontmatter_end(state);
  const previous_states = new Map(
    previous.map((block) => [block.from, block.ui]),
  );
  const tree = syntaxTree(state);
  const incomplete_boundary =
    tree.length < state.doc.length &&
    !syntaxTreeAvailable(state, state.doc.length);
  tree.iterate({
    enter(node) {
      if (node.to <= metadata_end) return false;
      if (node.name !== "FencedCode")
        return [
          "Document",
          "Blockquote",
          "BulletList",
          "OrderedList",
          "ListItem",
        ].includes(node.name);
      if (incomplete_boundary && node.to >= tree.length) return false;
      const source = read_code_block(state, node.from, node.to);
      if (source)
        blocks.push({
          ...source,
          ui: previous_states.get(source.from) ?? default_view_state,
        });
      return false;
    },
  });
  return blocks;
}

function build_code_decorations(
  state: EditorState,
  blocks: readonly CodeBlock[],
  diagram_revision: number,
  editing_fence_from: number | null = null,
): CodeBlockState {
  const options = state.facet(code_options);
  const read_only = state.readOnly || !state.facet(EditorView.editable);
  const decorations = Decoration.set(
    blocks
      .filter(
        (block) =>
          block.from !== editing_fence_from && !block.needs_opening_newline,
      )
      .map((block) =>
        Decoration.replace({
          block: true,
          widget: new CodeBlockWidget(
            block,
            options,
            read_only,
            diagram_revision,
          ),
        }).range(block.from, block.to),
      ),
    true,
  );
  return { blocks, decorations, diagram_revision, editing_fence_from };
}

const refresh_code_syntax = ViewPlugin.fromClass(
  class {
    queued = false;
    update(update: import("@codemirror/view").ViewUpdate) {
      if (
        syntaxTree(update.startState) === syntaxTree(update.state) ||
        this.queued
      )
        return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (update.view.plugin(refresh_code_syntax))
          update.view.dispatch({ effects: refresh_code_blocks.of(null) });
      });
    }
  },
);

const controllers = new WeakMap<HTMLElement, CodeBlockController>();
class CodeBlockWidget extends WidgetType {
  constructor(
    readonly block: CodeBlock,
    readonly options: CodeBlockOptions,
    readonly read_only: boolean,
    readonly revision: number,
  ) {
    super();
  }
  get estimatedHeight(): number {
    const { block, options } = this;
    const is_diagram =
      !!options.render_diagram &&
      (options.diagram_languages ?? ["mermaid"]).includes(
        block.language.toLowerCase(),
      );
    const source_height =
      block.ui.source_height ??
      Math.min(320, Math.max(64, block.content.lines * 22 + 16));
    // The source estimate mirrors apply_view_state. At a 16px root, the
    // toolbar is about 40px, the .875rem resize handle is about 14px, and the
    // diagram's minimum plus padding is about 72px. Include the two rem of
    // surrounding spacing too. CM measures the actual themed box after mount.
    const toolbar_height = 40;
    const resize_height = 14;
    let height = toolbar_height + 32;
    if (!is_diagram || !block.ui.source_hidden)
      height += source_height + resize_height;
    if (is_diagram)
      height +=
        toolbar_height + (block.ui.diagram_height ?? 72) + resize_height;
    return height;
  }
  eq(other: CodeBlockWidget): boolean {
    return (
      this.block === other.block &&
      this.options === other.options &&
      this.read_only === other.read_only &&
      this.revision === other.revision
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const controller = new CodeBlockController(view, this);
    controllers.set(controller.root, controller);
    return controller.root;
  }
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const controller = controllers.get(dom);
    if (!controller || controller.outer !== view) return false;
    controller.update_widget(this);
    return true;
  }
  destroy(dom: HTMLElement): void {
    controllers.get(dom)?.destroy_controller();
    controllers.delete(dom);
  }
}

class CodeBlockController {
  readonly root = document.createElement("section");
  readonly source_host = document.createElement("div");
  readonly preview = document.createElement("div");
  readonly diagram_content = document.createElement("div");
  readonly status = document.createElement("span");
  readonly language_picker: ReturnType<typeof create_code_language_picker>;
  readonly source_toggle = document.createElement("button");
  readonly diagram_controls = document.createElement("div");
  readonly zoom_out: HTMLButtonElement;
  readonly zoom_reset: HTMLButtonElement;
  readonly zoom_in: HTMLButtonElement;
  readonly source_resize: HTMLElement;
  readonly diagram_resize: HTMLElement;
  readonly inner: EditorView;
  readonly language_slot = new Compartment();
  readonly editable_slot = new Compartment();
  widget: CodeBlockWidget;
  syncing_inner = false;
  destroyed = false;
  language_request = 0;
  preview_request: AbortController | null = null;
  cleanup_resize: (() => void) | null = null;

  constructor(
    readonly outer: EditorView,
    widget: CodeBlockWidget,
  ) {
    this.widget = widget;
    this.root.className = "md-code-block";
    this.root.setAttribute("aria-label", "Code block");
    this.source_host.className = "md-code-source";
    this.preview.className = "md-code-diagram";
    this.diagram_content.className = "md-code-diagram-content";
    this.preview.append(this.diagram_content);
    const toolbar = document.createElement("div");
    toolbar.className = "md-code-toolbar";
    this.language_picker = create_code_language_picker(
      outer.dom,
      widget.options.languages ?? [],
      (language) => {
        if (this.widget.read_only) return;
        this.outer.dispatch({
          changes: change_code_language(
            this.outer.state,
            this.widget.block,
            language,
          ),
          userEvent: "input.code.language",
        });
      },
    );
    toolbar.append(this.language_picker.button);
    this.status.setAttribute("role", "status");
    toolbar.append(this.status);
    if (widget.options.copy_code) {
      const copy = create_button("Copy code", () => {
        void this.copy_source();
      });
      copy.className = "md-code-copy";
      toolbar.append(copy);
    }
    this.source_toggle.type = "button";
    this.source_toggle.addEventListener("click", () => {
      this.patch_view_state({
        source_hidden: !this.widget.block.ui.source_hidden,
      });
    });
    this.diagram_controls.className = "md-code-toolbar";
    this.diagram_controls.classList.add("md-code-diagram-controls");
    this.zoom_out = create_button("Zoom diagram out", () => {
      this.change_zoom(-1);
    });
    this.zoom_out.textContent = "−";
    this.zoom_reset = create_button("Reset diagram zoom", () => {
      this.patch_view_state({ diagram_zoom: 1 });
    });
    this.zoom_reset.className = "md-code-zoom-reset";
    this.zoom_in = create_button("Zoom diagram in", () => {
      this.change_zoom(1);
    });
    this.zoom_in.textContent = "+";
    this.diagram_controls.append(
      this.source_toggle,
      this.zoom_out,
      this.zoom_reset,
      this.zoom_in,
    );
    this.source_resize = this.create_resize_handle(
      "source_height",
      "Resize code block",
    );
    this.diagram_resize = this.create_resize_handle(
      "diagram_height",
      "Resize diagram",
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
    this.root.append(panel);
    this.inner = new EditorView({
      parent: this.source_host,
      doc: widget.block.content,
      extensions: [
        // The outer drawSelection theme hides native carets, including nested
        // contenteditable nodes. This editor needs its own cursor layer.
        drawSelection(),
        markdown_find_highlights(),
        this.language_slot.of([]),
        this.editable_slot.of(this.editable_extension()),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        widget.options.code_extensions ?? [],
        keymap.of([
          {
            key: "Mod-z",
            run: () => (this.widget.options.undo ?? undo)(this.outer),
          },
          {
            key: "Mod-Shift-z",
            run: () => (this.widget.options.redo ?? redo)(this.outer),
          },
          {
            key: "Mod-y",
            run: () => (this.widget.options.redo ?? redo)(this.outer),
          },
          { key: "ArrowUp", run: () => this.exit_source(-1, true) },
          { key: "ArrowLeft", run: () => this.exit_source(-1, false) },
          { key: "ArrowDown", run: () => this.exit_source(1, true) },
          { key: "ArrowRight", run: () => this.exit_source(1, false) },
          { key: "Mod-Enter", run: () => this.insert_paragraph_after() },
          {
            key: "Backspace",
            run: () => this.convert_single_line_to_paragraph(),
          },
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.theme({
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
        }),
      ],
      dispatchTransactions: (transactions) => {
        this.dispatch_inner(transactions);
      },
    });
    this.update_widget(widget, true);
    this.synchronize_selection();
    this.synchronize_find();
  }

  update_widget(widget: CodeBlockWidget, initial = false): void {
    const previous = this.widget;
    this.widget = widget;
    this.root.dataset.codeFrom = String(widget.block.from);
    this.root.style.marginLeft = `${String(widget.block.continuation_prefix.length * 0.5)}em`;
    if (
      !initial &&
      !this.syncing_inner &&
      !this.inner.state.doc.eq(widget.block.content)
    ) {
      const head = Math.min(
        this.inner.state.selection.main.head,
        widget.block.content.length,
      );
      this.syncing_inner = true;
      try {
        this.inner.dispatch({
          changes: {
            from: 0,
            to: this.inner.state.doc.length,
            insert: widget.block.content,
          },
          selection: { anchor: head },
          annotations: Transaction.addToHistory.of(false),
        });
      } finally {
        this.syncing_inner = false;
      }
    }
    if (initial || previous.read_only !== widget.read_only)
      this.inner.dispatch({
        effects: this.editable_slot.reconfigure(this.editable_extension()),
      });
    if (initial || previous.block.language !== widget.block.language) {
      void this.load_language();
    }
    if (
      initial ||
      previous.block.language !== widget.block.language ||
      previous.read_only !== widget.read_only
    )
      this.language_picker.update_language(
        widget.block.language,
        widget.read_only,
      );
    this.apply_view_state();
    if (
      initial ||
      previous.revision !== widget.revision ||
      previous.block.language !== widget.block.language ||
      !previous.block.content.eq(widget.block.content)
    )
      void this.render_preview();
  }

  dispatch_inner(transactions: readonly Transaction[]): void {
    if (this.syncing_inner) {
      this.inner.update(transactions);
      return;
    }
    if (
      this.widget.read_only &&
      transactions.some((transaction) => transaction.docChanged)
    )
      return;
    this.inner.update(transactions);
    for (const transaction of transactions) {
      if (!transaction.docChanged) {
        if (transaction.selection) {
          const block = this.widget.block;
          const selection = map_code_selection(
            transaction.newSelection.main,
            (position) => code_position_to_source(block, position),
          );
          if (
            !this.outer.state.selection.eq(selection, true) ||
            this.outer.state.selection.main.bidiLevel !==
              selection.main.bidiLevel
          )
            this.outer.dispatch({
              selection,
              userEvent: "select.code",
            });
        }
        continue;
      }
      if (this.widget.read_only) continue;
      const block = this.widget.block;
      const changes = change_code_content(
        this.outer.state,
        block,
        transaction.changes,
      );
      const updated_block = read_code_block(
        { doc: changes.apply(this.outer.state.doc) },
        changes.mapPos(block.from, 1),
        changes.mapPos(block.to, 1),
      );
      if (!updated_block)
        throw new RangeError("Code edit changed its fence structure");
      this.syncing_inner = true;
      try {
        this.outer.dispatch({
          changes,
          selection: map_code_selection(
            transaction.newSelection.main,
            (position) => code_position_to_source(updated_block, position),
          ),
          // Keep typing/deletion/paste semantics so outer history groups a
          // typing burst exactly as it does in the prose editor.
          userEvent:
            transaction.annotation(Transaction.userEvent) ?? "input.code",
          annotations: code_input.of(true),
        });
      } finally {
        this.syncing_inner = false;
      }
    }
  }

  synchronize_selection(): void {
    const selection = this.outer.state.selection.main;
    const block = this.widget.block;
    if (selection.from < block.content_from || selection.to > block.content_to)
      return;
    const projected = map_code_selection(selection, (position) =>
      source_position_to_code(block, position),
    );
    if (
      this.inner.state.selection.eq(projected, true) &&
      this.inner.state.selection.main.bidiLevel === projected.main.bidiLevel
    )
      return;
    this.syncing_inner = true;
    try {
      this.inner.dispatch({
        selection: projected,
        scrollIntoView: true,
      });
    } finally {
      this.syncing_inner = false;
    }
  }

  synchronize_find(): void {
    const { query, selected_index } = get_find_query(this.outer.state);
    const selected = get_find_matches(this.outer.state)[selected_index];
    const block = this.widget.block;
    // The selected index belongs to the whole note. Other blocks still show
    // every match, but only the block containing that source range selects one.
    const local_from =
      selected &&
      selected.from >= block.content_from &&
      selected.to <= block.content_to
        ? source_position_to_code(block, selected.from)
        : -1;
    if (get_find_query(this.inner.state).query !== query)
      update_find_query(this.inner, query, -1);
    const local_index = get_find_matches(this.inner.state).findIndex(
      (match) => match.from === local_from,
    );
    if (get_find_query(this.inner.state).selected_index !== local_index)
      update_find_query(this.inner, query, local_index);
    if (local_index >= 0 && block.ui.source_hidden) {
      // Find updates run inside an outer view update. Reveal after it finishes,
      // and recheck in case the query moved to another block in the meantime.
      queueMicrotask(() => {
        if (
          !this.destroyed &&
          this.widget.block.ui.source_hidden &&
          get_find_query(this.inner.state).selected_index >= 0
        )
          this.patch_view_state({ source_hidden: false });
      });
    }
  }

  editable_extension(): Extension {
    return [
      EditorView.editable.of(!this.widget.read_only),
      EditorState.readOnly.of(this.widget.read_only),
    ];
  }

  async load_language(): Promise<void> {
    const request = ++this.language_request;
    this.status.textContent = "";
    this.inner.dispatch({ effects: this.language_slot.reconfigure([]) });
    const language = LanguageDescription.matchLanguageName(
      this.widget.options.languages ?? [],
      this.widget.block.language,
      true,
    );
    if (!language) return;
    try {
      const support = await language.load();
      if (!this.destroyed && request === this.language_request)
        this.inner.dispatch({
          effects: this.language_slot.reconfigure(support),
        });
    } catch {
      if (!this.destroyed && request === this.language_request)
        this.status.textContent = "Language highlighting unavailable";
    }
  }

  async copy_source(): Promise<void> {
    try {
      await this.widget.options.copy_code?.(this.inner.state.doc.toString());
      if (!this.destroyed) this.status.textContent = "Copied";
    } catch {
      if (!this.destroyed) this.status.textContent = "Could not copy code";
    }
  }

  is_diagram(): boolean {
    return (
      !!this.widget.options.render_diagram &&
      (this.widget.options.diagram_languages ?? ["mermaid"]).includes(
        this.widget.block.language.toLowerCase(),
      )
    );
  }

  async render_preview(): Promise<void> {
    this.preview_request?.abort();
    if (!this.is_diagram() || !this.inner.state.doc.toString().trim()) {
      this.diagram_content.replaceChildren();
      return;
    }
    const request = new AbortController();
    this.preview_request = request;
    try {
      const element = await this.widget.options.render_diagram?.({
        language: this.widget.block.language,
        content: this.inner.state.doc.toString(),
        signal: request.signal,
      });
      if (this.destroyed || request.signal.aborted) return;
      this.diagram_content.replaceChildren(...(element ? [element] : []));
      const svg =
        element?.tagName.toLowerCase() === "svg"
          ? element
          : element?.querySelector("svg");
      const width = Number(
        svg?.getAttribute("viewBox")?.trim().split(/[ ,]+/)[2],
      );
      const has_intrinsic_width = !!svg && Number.isFinite(width) && width > 0;
      this.diagram_content.dataset.intrinsicSvg = String(has_intrinsic_width);
      if (svg && has_intrinsic_width) {
        // Mermaid emits width=100%. Start at its viewBox width, capped by the
        // viewport, and scale only when the user explicitly zooms the diagram.
        svg.style.width = `calc(min(100%, ${String(width)}px) * var(--md-code-diagram-zoom, 1))`;
        svg.style.maxWidth = "none";
        svg.style.height = "auto";
        svg.style.display = "block";
        svg.style.marginInline = "auto";
      }
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

  apply_view_state(): void {
    const { ui, content } = this.widget.block;
    const diagram = this.is_diagram();
    const hidden = diagram && ui.source_hidden;
    this.source_host.hidden = hidden;
    this.source_resize.hidden = hidden;
    this.source_host.style.height = `${String(ui.source_height ?? Math.min(320, Math.max(64, content.lines * 22 + 16)))}px`;
    this.preview.style.height =
      ui.diagram_height === null ? "" : `${String(ui.diagram_height)}px`;
    this.apply_diagram_zoom();
    this.preview.hidden = !diagram;
    this.diagram_controls.hidden = !diagram;
    this.zoom_out.disabled = ui.diagram_zoom <= 0.25;
    this.zoom_in.disabled = ui.diagram_zoom >= 10;
    this.zoom_reset.textContent = `${String(Math.round(ui.diagram_zoom * 100))}%`;
    this.diagram_resize.hidden = !diagram;
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
          Math.max(48, this.preview.getBoundingClientRect().height),
      ),
    );
    this.inner.requestMeasure();
  }

  apply_diagram_zoom(): void {
    const zoom = String(this.widget.block.ui.diagram_zoom);
    this.diagram_content.style.setProperty("--md-code-diagram-zoom", zoom);
    this.diagram_content.style.zoom =
      this.diagram_content.dataset.intrinsicSvg === "true" ? "" : zoom;
  }

  patch_view_state(patch: Partial<CodeBlockViewState>): void {
    this.outer.dispatch({
      effects: patch_code_view.of({ from: this.widget.block.from, patch }),
      annotations: Transaction.addToHistory.of(false),
    });
  }
  change_zoom(direction: number): void {
    const current = this.widget.block.ui.diagram_zoom;
    const next =
      direction > 0
        ? zoom_levels.find((level) => level > current)
        : [...zoom_levels].reverse().find((level) => level < current);
    this.patch_view_state({ diagram_zoom: next ?? current });
  }

  create_resize_handle(
    target: "source_height" | "diagram_height",
    label: string,
  ): HTMLElement {
    const handle = document.createElement("div");
    handle.className = "md-code-resize";
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", label);
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-valuemin", "48");
    handle.setAttribute("aria-valuemax", "4096");
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      event.stopPropagation();
      const element =
        target === "source_height" ? this.source_host : this.preview;
      this.patch_view_state({
        [target]: clamp_height(
          (this.widget.block.ui[target] ??
            element.getBoundingClientRect().height) +
            (event.key === "ArrowUp" ? -16 : 16),
        ),
      });
    });
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      this.cleanup_resize?.();
      const element =
        target === "source_height" ? this.source_host : this.preview;
      const start = element.getBoundingClientRect().height;
      const y = event.clientY;
      let height = start;
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        height = clamp_height(start + next.clientY - y);
        element.style.height = `${String(height)}px`;
        this.inner.requestMeasure();
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

  exit_source(direction: number, vertical: boolean): boolean {
    const selection = this.inner.state.selection.main;
    if (!selection.empty || this.inner.state.selection.ranges.length !== 1)
      return false;
    const line = this.inner.state.doc.lineAt(selection.head);
    const boundary =
      direction < 0
        ? vertical
          ? line.number === 1
          : selection.head === 0
        : vertical
          ? line.number === this.inner.state.doc.lines
          : selection.head === this.inner.state.doc.length;
    if (
      !boundary ||
      (vertical && moves_within_wrapped_line(this.inner, direction))
    )
      return false;
    const block = this.widget.block;
    // Arrows only move through existing content. Mod-Enter creates prose.
    if (
      (direction < 0 && block.from === 0) ||
      (direction > 0 && block.to === this.outer.state.doc.length)
    )
      return true;
    const position = adjacent_prose_position(
      this.outer.state,
      block,
      direction,
    );
    const next_code = this.outer.state
      .field(code_blocks)
      .blocks.find(
        (candidate) =>
          candidate.from !== block.from &&
          candidate.from <= position &&
          candidate.to >= position,
      );
    if (next_code) {
      this.outer.dispatch({
        selection: {
          anchor: direction > 0 ? next_code.content_from : next_code.content_to,
        },
      });
      focus_code_selection(this.outer);
      if (vertical) {
        const root = this.outer.dom.querySelector<HTMLElement>(
          `.md-code-block[data-code-from="${String(next_code.from)}"]`,
        );
        const next = root ? controllers.get(root)?.inner : undefined;
        if (next)
          next.dispatch({
            selection: vertical_cursor(
              this.inner,
              next,
              direction > 0 ? 0 : next.state.doc.length,
            ),
            scrollIntoView: true,
          });
      }
      return true;
    }
    let adjacent_node = syntaxTree(this.outer.state).resolveInner(
      position,
      direction > 0 ? 1 : -1,
    );
    while (adjacent_node.parent && adjacent_node.name !== "Table")
      adjacent_node = adjacent_node.parent;
    if (adjacent_node.name === "Table") {
      const row =
        direction > 0
          ? adjacent_node.getChild("TableHeader")
          : (adjacent_node.getChildren("TableRow").at(-1) ??
            adjacent_node.getChild("TableHeader"));
      const cells = row?.getChildren("TableCell") ?? [];
      const cell = direction > 0 ? cells[0] : cells.at(-1);
      if (cell) {
        this.outer.dispatch({
          selection: { anchor: direction > 0 ? cell.from : cell.to },
          scrollIntoView: true,
        });
        if (!focus_table_selection(this.outer)) this.outer.focus();
        return true;
      }
    }
    const target_line = this.outer.state.doc.lineAt(position);
    const content_start =
      target_line.from +
      code_container_prefix_length(target_line.text, block.continuation_prefix);
    this.outer.dispatch({
      selection: vertical
        ? vertical_cursor(this.inner, this.outer, position, content_start)
        : { anchor: position },
      scrollIntoView: true,
    });
    this.outer.focus();
    return true;
  }

  insert_paragraph_after(): boolean {
    if (this.widget.read_only) return false;
    const block = this.widget.block;
    const prefix = block.continuation_prefix;
    let insert = "";
    if (block.closing_from === null) {
      if (this.outer.state.sliceDoc(block.to - 1, block.to) !== "\n")
        insert += "\n";
      insert += prefix + block.fence;
    }
    insert += "\n" + prefix + "\n" + prefix;
    this.outer.dispatch({
      changes: { from: block.to, insert },
      selection: { anchor: block.to + insert.length },
      userEvent: "input.code.boundary",
      scrollIntoView: true,
    });
    this.outer.focus();
    return true;
  }

  convert_single_line_to_paragraph(): boolean {
    const state = this.inner.state;
    if (
      this.widget.read_only ||
      state.doc.lines !== 1 ||
      state.selection.ranges.length !== 1 ||
      !state.selection.main.empty ||
      state.selection.main.head !== 0
    )
      return false;
    const converted = change_code_to_paragraph(
      this.outer.state,
      this.widget.block,
    );
    this.outer.dispatch({
      changes: converted.changes,
      selection: { anchor: converted.cursor },
      userEvent: "input.code.convert",
      scrollIntoView: true,
    });
    this.outer.focus();
    return true;
  }

  destroy_controller(): void {
    this.destroyed = true;
    this.language_request++;
    this.preview_request?.abort();
    this.cleanup_resize?.();
    this.language_picker.destroy();
    this.inner.destroy();
  }
}

function adjacent_prose_position(
  state: EditorState,
  block: CodeBlock,
  direction: number,
): number {
  const boundary =
    direction < 0
      ? Math.max(0, block.from - 1)
      : Math.min(state.doc.length, block.to + 1);
  const line = state.doc.lineAt(boundary);
  return direction < 0
    ? line.to
    : line.from +
        code_container_prefix_length(line.text, block.continuation_prefix);
}

function map_code_selection(
  range: SelectionRange,
  map_position: (position: number) => number,
): EditorSelection {
  return EditorSelection.create([
    EditorSelection.range(
      map_position(range.anchor),
      map_position(range.head),
      range.goalColumn,
      range.bidiLevel ?? undefined,
      range.assoc,
    ),
  ]);
}

function synchronize_code_selection(view: EditorView, focus = false): void {
  const selection = view.state.selection.main;
  const block = view.state
    .field(code_blocks)
    .blocks.find(
      (candidate) =>
        selection.from >= candidate.content_from &&
        selection.to <= candidate.content_to,
    );
  if (!block) return;
  const root = view.dom.querySelector<HTMLElement>(
    `.md-code-block[data-code-from="${String(block.from)}"]`,
  );
  const controller = root ? controllers.get(root) : undefined;
  controller?.synchronize_selection();
  if (focus && controller && !controller.source_host.hidden)
    controller.inner.focus();
}

function start_code_body(view: EditorView): boolean {
  const { state } = view;
  const selection = state.selection.main;
  if (state.readOnly || !selection.empty || state.selection.ranges.length !== 1)
    return false;
  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to) return false;
  const code = state.field(code_blocks);
  const block = code.blocks.find(
    (candidate) =>
      candidate.from === line.from &&
      (candidate.needs_opening_newline ||
        code.editing_fence_from === candidate.from),
  );
  if (!block) return false;
  // Markdown's generic Enter command does not continue containers inside a
  // fence. Establish the prefixed body before the widget takes keyboard focus.
  const insert = "\n" + block.continuation_prefix;
  view.dispatch({
    changes: { from: selection.head, insert },
    selection: { anchor: selection.head + insert.length },
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

function enter_code_block(
  view: EditorView,
  direction: number,
  horizontal = false,
): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty || view.state.selection.ranges.length !== 1)
    return false;
  const line = view.state.doc.lineAt(selection.head);
  const blocks = view.state.field(code_blocks).blocks;
  const block =
    direction > 0
      ? blocks.find((candidate) => candidate.from > selection.head)
      : [...blocks]
          .reverse()
          .find((candidate) => candidate.to < selection.head);
  if (!block) return false;
  const edge = view.state.doc.lineAt(direction > 0 ? block.from : block.to);
  // Blank source rows are real caret stops. Only cross the widget boundary
  // when the current row is directly beside its opening or closing fence.
  if (Math.abs(edge.number - line.number) !== 1) return false;
  const content_start =
    line.from +
    code_container_prefix_length(line.text, block.continuation_prefix);
  if (
    horizontal &&
    selection.head !== (direction > 0 ? line.to : content_start)
  )
    return false;
  if (!horizontal && moves_within_wrapped_line(view, direction)) return false;
  const root = view.dom.querySelector<HTMLElement>(
    `.md-code-block[data-code-from="${String(block.from)}"]`,
  );
  const controller = root ? controllers.get(root) : undefined;
  if (!controller || controller.source_host.hidden) return false;
  const position = direction > 0 ? 0 : controller.inner.state.doc.length;
  controller.inner.dispatch({
    selection: horizontal
      ? { anchor: position }
      : vertical_cursor(view, controller.inner, position),
    scrollIntoView: true,
  });
  controller.inner.focus();
  return true;
}

function moves_within_wrapped_line(
  view: EditorView,
  direction: number,
): boolean {
  if (!view.lineWrapping) return false;
  const selection = view.state.selection.main;
  const next = view.moveVertically(selection, direction > 0);
  return (
    next.head !== selection.head &&
    view.state.doc.lineAt(next.head).number ===
      view.state.doc.lineAt(selection.head).number
  );
}

function vertical_cursor(
  source: EditorView,
  target: EditorView,
  target_position: number,
  content_start = target.state.doc.lineAt(target_position).from,
) {
  const selection = source.state.selection.main;
  const source_line = source.state.doc.lineAt(selection.head);
  const target_line = target.state.doc.lineAt(target_position);
  const source_rect = source.coordsAtPos(selection.head);
  const target_rect = target.coordsAtPos(target_position);
  const x =
    selection.goalColumn !== undefined
      ? source.contentDOM.getBoundingClientRect().left + selection.goalColumn
      : source_rect && source_rect.bottom > source_rect.top
        ? source_rect.left
        : undefined;
  const goal =
    x === undefined
      ? undefined
      : x - target.contentDOM.getBoundingClientRect().left;
  if (x !== undefined && target_rect && target_rect.bottom > target_rect.top) {
    const position = target.posAndSideAtCoords({
      x,
      y: (target_rect.top + target_rect.bottom) / 2,
    });
    if (position !== null)
      return EditorSelection.create([
        EditorSelection.cursor(
          Math.max(content_start, Math.min(target_line.to, position.pos)),
          // A wrap boundary has two visual positions at the same offset.
          // Keep the hit-tested side for the next vertical arrow movement.
          position.assoc,
          undefined,
          goal,
        ),
      ]);
  }
  // An offscreen code line may not have DOM geometry yet. Use its text column
  // for this move, retaining the visual goal for subsequent vertical movement.
  const column = countColumn(
    source.state.sliceDoc(source_line.from, selection.head),
    source.state.tabSize,
  );
  const text = target.state.sliceDoc(content_start, target_line.to);
  return EditorSelection.create([
    EditorSelection.cursor(
      content_start + findColumn(text, column, target.state.tabSize),
      0,
      undefined,
      goal,
    ),
  ]);
}

function create_button(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}
function clamp_height(height: number): number {
  return Math.min(4096, Math.max(48, Number.isFinite(height) ? height : 48));
}
function normalize_view_state(
  state: Partial<CodeBlockViewState> | null | undefined,
): CodeBlockViewState {
  const height = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(4096, Math.max(48, Math.round(value)))
      : null;
  return {
    source_height: height(state?.source_height),
    diagram_height: height(state?.diagram_height),
    source_hidden: state?.source_hidden === true,
    diagram_zoom:
      typeof state?.diagram_zoom === "number" &&
      Number.isFinite(state.diagram_zoom)
        ? Math.round(Math.min(10, Math.max(0.25, state.diagram_zoom)) * 100) /
          100
        : 1,
  };
}

const code_block_theme = EditorView.baseTheme({
  ".md-code-language-button": {
    maxWidth: "16rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-code-language-popup": {
    position: "fixed",
    zIndex: "100",
    display: "flex",
    flexDirection: "column",
    padding: "0.25rem",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius, 0.5rem)",
    background: "var(--popover, white)",
    color: "var(--popover-foreground, #222)",
    boxShadow: "0 4px 16px rgb(0 0 0 / 15%)",
    fontFamily: "var(--font-sans, sans-serif)",
    fontSize: "0.8125rem",
    lineHeight: "1.5",
  },
  ".md-code-language-popup input": {
    width: "100%",
    boxSizing: "border-box",
    flexShrink: "0",
    padding: "0.5rem",
    border: "0",
    borderBottom: "1px solid var(--border, #ddd)",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    outline: "none",
  },
  ".md-code-language-list": {
    minHeight: "0",
    overflowY: "auto",
    padding: "0.25rem 0",
  },
  ".md-code-language-option": {
    display: "flex",
    flexDirection: "column",
    padding: "0.35rem 0.5rem",
    borderRadius: "0.25rem",
    cursor: "pointer",
  },
  ".md-code-language-option span": {
    color: "var(--muted-foreground, #666)",
    fontSize: "0.6875rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-code-language-option[data-active=true], .md-code-language-option:hover":
    {
      background: "var(--accent, #eee)",
      color: "var(--accent-foreground, #222)",
    },
  ".md-code-language-option[aria-selected=true]": { fontWeight: "600" },
  ".md-code-language-empty": {
    padding: "0.75rem",
    color: "var(--muted-foreground, #666)",
  },
  ".md-code-block": {
    // CodeMirror measures the widget's border box, excluding margins. Keep
    // vertical spacing inside that box so cursor movement uses the DOM height.
    padding:
      "calc(var(--editor-spacing, 1rem) * 0.75) 0 calc(var(--editor-spacing, 1rem) * 1.25)",
  },
  ".md-code-panel": {
    border: "1px solid var(--editor-code-border, var(--border, #ddd))",
    borderRadius: "var(--editor-code-radius, 0.5rem)",
    background: "var(--editor-code-bg, var(--muted, #f4f4f4))",
    color: "var(--editor-code-block-text, var(--foreground, #222))",
    overflow: "hidden",
  },
  ".md-code-toolbar": {
    display: "flex",
    userSelect: "none",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.35rem 0.5rem",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    borderBottom: "1px solid var(--editor-code-border, var(--border, #ddd))",
    color: "var(--muted-foreground, #666)",
  },
  ".md-code-toolbar[hidden], .md-code-resize[hidden]": { display: "none" },
  ".md-code-toolbar button": {
    font: "inherit",
    height: "1.75rem",
    background: "transparent",
    color: "inherit",
    border: "1px solid transparent",
    borderRadius: "0.25rem",
    padding: "0.125rem 0.375rem",
    cursor: "pointer",
  },
  ".md-code-toolbar button:hover:enabled": {
    background: "var(--accent, #e8e8e8)",
    color: "var(--accent-foreground, #222)",
  },
  ".md-code-toolbar button:focus-visible": {
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "1px",
  },
  ".md-code-toolbar button:disabled": {
    opacity: "0.5",
    cursor: "default",
  },
  ".md-code-toolbar [role=status]": {
    marginLeft: "auto",
    fontSize: "0.6875rem",
  },
  ".md-code-copy": { marginLeft: "auto" },
  ".md-code-toolbar [role=status]:empty": { display: "none" },
  ".md-code-toolbar [role=status]:not(:empty) + .md-code-copy": {
    marginLeft: "0",
  },
  ".md-code-diagram-controls": {
    justifyContent: "flex-end",
    borderTop: "1px solid var(--editor-code-border, var(--border, #ddd))",
    borderBottom: "0",
  },
  ".md-code-zoom-reset": {
    minWidth: "3.5rem",
    fontVariantNumeric: "tabular-nums",
  },
  ".md-code-source": {
    minHeight: "48px",
    maxHeight: "4096px",
    overflow: "hidden",
  },
  ".md-code-diagram": {
    overflow: "auto",
    minHeight: "48px",
    maxHeight: "4096px",
    padding: "0.75rem",
  },
  ".md-code-diagram-content": {
    width: "100%",
    transformOrigin: "top left",
  },
  ".md-code-resize": {
    display: "flex",
    userSelect: "none",
    alignItems: "center",
    justifyContent: "center",
    height: "0.875rem",
    cursor: "ns-resize",
    touchAction: "none",
  },
  ".md-code-resize::before": {
    content: "''",
    width: "3rem",
    height: "0.1875rem",
    borderRadius: "999px",
    background: "var(--border, #ddd)",
  },
  ".md-code-resize:hover::before, .md-code-resize:focus-visible::before": {
    background: "var(--muted-foreground, #666)",
  },
  ".md-code-resize:focus-visible": { outline: "2px solid var(--ring, #777)" },
  ".md-code-error": {
    color: "var(--destructive, #b91c1c)",
    padding: "0.75rem",
  },
});
