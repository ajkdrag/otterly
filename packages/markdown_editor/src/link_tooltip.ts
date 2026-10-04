import { syntaxTree } from "@codemirror/language";
import {
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  closeHoverTooltips,
  hoverTooltip,
  keymap,
  showTooltip,
  type Tooltip,
  ViewPlugin,
} from "@codemirror/view";
import { link_from_node } from "./link_rendering.js";
import { get_frontmatter_end } from "./frontmatter_range.js";

type LinkKind = "inline" | "reference" | "wiki" | "autolink" | "bare";
type LinkInfo = {
  from: number;
  to: number;
  target: string;
  edit_target: string;
  label: string;
  kind: LinkKind;
  label_from: number;
  label_to: number;
  target_from: number;
  target_to: number;
  raw_label: string;
  has_alias: boolean;
  title_suffix: string;
  reference_label: string;
  reference_target: string;
};
type LinkTooltipOptions = {
  open_link: (target: string) => void;
  copy_link?: (target: string) => void | Promise<void>;
  edit_key?: string;
};
type LinkTooltipAction =
  | "open"
  | "copy"
  | "edit"
  | "remove"
  | "save"
  | "cancel";
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

const action_icon_paths: Record<LinkTooltipAction, string[]> = {
  open: ["M7 17 17 7", "M7 7h10v10"],
  copy: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"],
  remove: [
    "M3 6h18",
    "M8 6V4h8v2",
    "M19 6l-1 14H6L5 6",
    "M10 11v6",
    "M14 11v6",
  ],
  save: ["m5 12 4 4L19 6"],
  cancel: ["M18 6 6 18", "m6 6 12 12"],
};

const show_link_editor = StateEffect.define<LinkInfo>();
const hide_link_editor = StateEffect.define<false>();
const show_link_preview = StateEffect.define<LinkInfo>();
const hide_link_preview = StateEffect.define<false>();

/** Add source-preserving link actions to Markdown links. */
export function link_tooltip(options: LinkTooltipOptions): Extension {
  const edit_state = StateField.define<LinkInfo | null>({
    create: () => null,
    update(value, transaction) {
      let next = transaction.docChanged ? null : value;
      for (const effect of transaction.effects) {
        if (effect.is(show_link_editor)) next = effect.value;
        if (effect.is(hide_link_editor)) next = null;
      }
      return next;
    },
    provide: (field) =>
      showTooltip.from(field, (info) =>
        info ? create_edit_tooltip(info) : null,
      ),
  });

  const focused_preview = StateField.define<LinkInfo | null>({
    create: () => null,
    update(value, transaction) {
      let next = transaction.docChanged ? null : value;
      for (const effect of transaction.effects) {
        if (effect.is(show_link_preview)) next = effect.value;
        if (effect.is(hide_link_preview)) next = null;
      }
      return next;
    },
    provide: (field) =>
      showTooltip.from(field, (info) =>
        info ? create_preview_tooltip(info, options) : null,
      ),
  });

  const hover = hoverTooltip(
    (view, position) => {
      if (view.state.field(edit_state, false)) return null;
      if (document.activeElement?.closest?.("[data-md-link-target]"))
        return null;
      const info = link_at_position(view.state, position);
      return info ? create_preview_tooltip(info, options) : null;
    },
    { hoverTime: 250, hideOnChange: true },
  );

  const focus_events = ViewPlugin.fromClass(
    class {
      pending_hide: number | undefined;

      constructor(readonly view: EditorView) {
        view.dom.addEventListener("focusin", this.on_focusin);
        view.dom.addEventListener("focusout", this.on_focusout);
      }

      destroy() {
        this.view.dom.removeEventListener("focusin", this.on_focusin);
        this.view.dom.removeEventListener("focusout", this.on_focusout);
        if (this.pending_hide !== undefined)
          cancelAnimationFrame(this.pending_hide);
      }

      on_focusin = (event: FocusEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest(".cm-link-tooltip")) return;
        if (this.pending_hide !== undefined) {
          cancelAnimationFrame(this.pending_hide);
          this.pending_hide = undefined;
        }
        const info = focused_link(this.view, target);
        if (info) this.view.dispatch({ effects: show_link_preview.of(info) });
        else this.view.dispatch({ effects: hide_link_preview.of(false) });
      };

      on_focusout = () => {
        if (this.pending_hide !== undefined)
          cancelAnimationFrame(this.pending_hide);
        this.pending_hide = requestAnimationFrame(() => {
          this.pending_hide = undefined;
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            this.view.dom.contains(active) &&
            active.closest(".cm-link-tooltip")
          )
            return;
          if (!this.view.dom.isConnected) return;
          this.view.dispatch({ effects: hide_link_preview.of(false) });
        });
      };
    },
  );

  return [
    edit_state,
    focused_preview,
    hover,
    focus_events,
    keymap.of([
      {
        key: options.edit_key ?? "Mod-k",
        run(view) {
          if (view.state.readOnly) return false;
          const info = focused_link(view) ?? link_at_selection(view.state);
          if (!info) return false;
          view.dispatch({
            effects: [
              show_link_editor.of(info),
              hide_link_preview.of(false),
              closeHoverTooltips,
              EditorView.scrollIntoView(info.from),
            ],
          });
          return true;
        },
      },
    ]),
  ];
}

function create_preview_tooltip(
  info: LinkInfo,
  options: LinkTooltipOptions,
): Tooltip {
  return {
    pos: info.from,
    end: info.to,
    above: true,
    create(view) {
      const root = document.createElement("div");
      root.className = "cm-link-tooltip cm-link-tooltip--preview";
      root.setAttribute("role", "group");
      root.setAttribute("aria-label", "Link actions");
      const preview = document.createElement("div");
      preview.className = "cm-link-tooltip__preview";
      root.append(preview);
      const status = document.createElement("span");
      status.className = "cm-link-tooltip__status";
      status.setAttribute("role", "status");
      root.append(status);
      const copy_callback = options.copy_link;
      if (copy_callback) {
        append_action(preview, "copy", "Copy", () => {
          void copy_link(copy_callback, info.target, status);
        });
      }
      const target = document.createElement("span");
      target.className = "cm-link-tooltip__target";
      target.textContent = info.target;
      preview.append(target);
      append_action(preview, "open", "Open", () => {
        options.open_link(info.target);
      });
      if (!view.state.readOnly) {
        append_action(
          preview,
          "edit",
          "Edit",
          () => {
            view.dispatch({
              effects: [
                show_link_editor.of(info),
                hide_link_preview.of(false),
                closeHoverTooltips,
              ],
            });
          },
          options.edit_key ?? "Mod-k",
        );
        if (info.kind !== "bare")
          append_action(preview, "remove", "Remove", () => {
            const change = remove_link_change(view.state, info);
            if (!change) return;
            view.dispatch({
              changes: change,
              annotations: Transaction.userEvent.of("input.link-tooltip"),
            });
            view.focus();
          });
      }
      return { dom: root };
    },
  };
}

function create_edit_tooltip(info: LinkInfo): Tooltip {
  return {
    pos: info.from,
    end: info.to,
    above: true,
    create(view) {
      const root = document.createElement("form");
      root.className = "cm-link-tooltip cm-link-tooltip--edit";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Edit link");
      const text_input = labeled_input("Text", info.label);
      const target_input = labeled_input("Link", info.edit_target);
      if (info.kind === "bare" || info.kind === "autolink")
        text_input.input.disabled = true;
      const text_row = document.createElement("div");
      text_row.className = "cm-link-tooltip__edit-row";
      text_row.append(text_input.label);
      root.append(text_row);
      const separator = document.createElement("div");
      separator.className = "cm-link-tooltip__separator";
      root.append(separator);
      const target_row = document.createElement("div");
      target_row.className = "cm-link-tooltip__edit-row";
      target_row.append(target_input.label);
      root.append(target_row);
      append_action(target_row, "save", "Save", () => {
        save_link_edit(
          view,
          info,
          text_input.input.value,
          target_input.input.value,
        );
      });
      append_action(target_row, "cancel", "Cancel", () => {
        view.dispatch({ effects: hide_link_editor.of(false) });
        view.focus();
      });
      const on_keydown = (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          view.dispatch({ effects: hide_link_editor.of(false) });
          view.focus();
        } else if (event.key === "Enter") {
          event.preventDefault();
          save_link_edit(
            view,
            info,
            text_input.input.value,
            target_input.input.value,
          );
        }
      };
      text_input.input.addEventListener("keydown", on_keydown);
      target_input.input.addEventListener("keydown", on_keydown);
      root.addEventListener("submit", (event) => {
        event.preventDefault();
        save_link_edit(
          view,
          info,
          text_input.input.value,
          target_input.input.value,
        );
      });
      requestAnimationFrame(() => {
        const input =
          info.kind === "bare" || info.kind === "autolink"
            ? target_input.input
            : text_input.input;
        input.focus();
        input.select();
      });
      const dismiss_outside = (event: PointerEvent) => {
        if (!root.contains(event.target as Node))
          view.dispatch({ effects: hide_link_editor.of(false) });
      };
      document.addEventListener("pointerdown", dismiss_outside, true);
      return {
        dom: root,
        destroy() {
          document.removeEventListener("pointerdown", dismiss_outside, true);
        },
      };
    },
  };
}

function labeled_input(name: string, value: string) {
  const label = document.createElement("label");
  label.className = "cm-link-tooltip__field";
  const field_name = document.createElement("span");
  field_name.className = "cm-link-tooltip__field-name";
  field_name.textContent = name;
  const input = document.createElement("input");
  input.value = value;
  input.setAttribute("aria-label", name);
  input.placeholder = name === "Text" ? "Display text..." : "URL or path...";
  label.append(field_name, input);
  return { label, input };
}

function append_action(
  root: HTMLElement,
  action: LinkTooltipAction,
  label: string,
  run: () => void,
  shortcut?: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cm-link-tooltip__action cm-link-tooltip__action--${action}`;
  button.setAttribute("aria-label", `${label} link`);
  button.append(action_icon(action));
  const accessible_label = document.createElement("span");
  accessible_label.className = "cm-link-tooltip__action-label";
  accessible_label.textContent = label;
  button.append(accessible_label);
  button.title = `${label} link`;
  if (shortcut) {
    button.title = `${label} link (${shortcut_label(shortcut)})`;
    button.setAttribute("aria-keyshortcuts", aria_shortcut(shortcut));
  }
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    run();
  });
  root.append(button);
  return button;
}

function action_icon(action: LinkTooltipAction) {
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
  svg.setAttribute("focusable", "false");
  for (const path_data of action_icon_paths[action]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", path_data);
    svg.append(path);
  }
  return svg;
}

function save_link_edit(
  view: EditorView,
  original: LinkInfo,
  label: string,
  target: string,
) {
  if (view.state.readOnly) return;
  const current = link_at_position(view.state, original.from);
  if (
    !current ||
    current.from !== original.from ||
    current.to !== original.to
  ) {
    view.dispatch({ effects: hide_link_editor.of(false) });
    return;
  }
  const change = edit_link_change(
    view.state,
    current,
    label.trim(),
    target.trim(),
  );
  if (change) {
    view.dispatch({
      changes: change,
      effects: hide_link_editor.of(false),
      annotations: Transaction.userEvent.of("input.link-tooltip"),
    });
    view.focus();
  } else {
    view.dispatch({ effects: hide_link_editor.of(false) });
    view.focus();
  }
}

async function copy_link(
  callback: NonNullable<LinkTooltipOptions["copy_link"]>,
  target: string,
  status: HTMLElement,
) {
  try {
    await callback(target);
    status.textContent = "Link copied.";
  } catch {
    status.textContent = "Could not copy link.";
  }
}

function edit_link_change(
  state: EditorView["state"],
  info: LinkInfo,
  label: string,
  target: string,
) {
  if (!target || (!label && info.kind !== "bare" && info.kind !== "autolink"))
    return null;
  const changes: { from: number; to: number; insert: string }[] = [];
  const label_changed = label !== info.label;
  const target_changed = target !== info.edit_target;
  if (!label_changed && !target_changed) return null;

  if (
    info.kind === "reference" &&
    (target_changed ||
      (label_changed && info.reference_label === info.raw_label))
  ) {
    const next_label = label_changed
      ? escape_markdown_label(label)
      : info.raw_label;
    return {
      from: info.from,
      to: info.to,
      insert: `[${next_label}](${format_target(
        target_changed ? target : info.reference_target,
        false,
      )}${info.title_suffix})`,
    };
  }
  if (target_changed) {
    const old_target = state.sliceDoc(info.target_from, info.target_to);
    const angle_wrapped =
      old_target.startsWith("<") && old_target.endsWith(">");
    changes.push({
      from: info.target_from,
      to: info.target_to,
      insert:
        info.kind === "wiki"
          ? format_wiki_target(target)
          : info.kind === "autolink"
            ? format_autolink_target(target)
            : format_target(target, angle_wrapped),
    });
  }
  if (label_changed) {
    if (info.kind === "wiki" && !info.has_alias) {
      changes.push({
        from: info.to - 2,
        to: info.to - 2,
        insert: `|${escape_wiki_alias(label)}`,
      });
    } else if (info.label_from >= 0) {
      changes.push({
        from: info.label_from,
        to: info.label_to,
        insert:
          info.kind === "wiki"
            ? escape_wiki_alias(label)
            : escape_markdown_label(label),
      });
    }
  }
  return changes.length ? changes : null;
}

function remove_link_change(state: EditorView["state"], info: LinkInfo) {
  if (info.kind === "bare") return null;
  if (info.kind === "wiki")
    return { from: info.from, to: info.to, insert: info.label };
  return {
    from: info.from,
    to: info.to,
    insert: state.sliceDoc(info.label_from, info.label_to),
  };
}

function format_target(target: string, angle_wrapped: boolean) {
  const needs_angles = angle_wrapped || /[\s()<>]/.test(target);
  const safe_target = target.replace(/</g, "%3C").replace(/>/g, "%3E");
  return needs_angles ? `<${safe_target}>` : safe_target;
}

function format_autolink_target(target: string) {
  return target.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s/g, "%20");
}

function format_wiki_target(target: string) {
  return target
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\]\]/g, "]\\]");
}

function escape_markdown_label(label: string) {
  return label.replace(/([\\[\]])/g, "\\$1");
}

function escape_wiki_alias(label: string) {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\]\]/g, "]\\]");
}

function link_at_selection(state: EditorView["state"]): LinkInfo | null {
  const range = state.selection.main;
  const info = link_at_position(state, range.head);
  return info && range.from >= info.from && range.to <= info.to ? info : null;
}

function link_at_position(state: EditorView["state"], position: number) {
  if (position < get_frontmatter_end(state)) return null;
  const tree = syntaxTree(state);
  for (const bias of [1, -1] as const) {
    const point = Math.max(0, Math.min(state.doc.length, position));
    let node: SyntaxNode | null = tree.resolveInner(point, bias);
    while (node) {
      const info = link_info_from_node(state, node);
      if (info && position >= info.from && position <= info.to) return info;
      node = node.parent;
    }
  }
  return null;
}

function link_info_from_node(
  state: EditorView["state"],
  node: SyntaxNode,
): LinkInfo | null {
  if (
    ["Image", "LinkReference", "InlineCode", "FencedCode", "CodeBlock"].some(
      (name) => node.name === name || has_ancestor(node, name),
    )
  )
    return null;
  const rendered = link_from_node(state, node);
  if (!rendered) return null;
  if (node.name === "WikiLink") return wiki_link_info(state, node, rendered);
  if (node.name === "Autolink") {
    const url = find_descendant(node, "URL");
    if (!url) return null;
    return {
      ...rendered,
      edit_target: rendered.target,
      kind: "autolink",
      label_from: url.from,
      label_to: url.to,
      target_from: url.from,
      target_to: url.to,
      raw_label: state.sliceDoc(url.from, url.to),
      has_alias: false,
      title_suffix: "",
      reference_label: "",
      reference_target: "",
    };
  }
  if (node.name === "URL") {
    if (has_ancestor(node, "Image") || has_ancestor(node, "LinkReference"))
      return null;
    return {
      ...rendered,
      edit_target: rendered.target,
      kind: "bare",
      label_from: -1,
      label_to: -1,
      target_from: node.from,
      target_to: node.to,
      raw_label: "",
      has_alias: false,
      title_suffix: "",
      reference_label: "",
      reference_target: "",
    };
  }
  if (node.name !== "Link") return null;
  const markers = direct_children(node, "LinkMark");
  const opening = markers.find(
    (marker) => state.sliceDoc(marker.from, marker.to) === "[",
  );
  const closing = markers.find(
    (marker) => state.sliceDoc(marker.from, marker.to) === "]",
  );
  if (!opening || !closing) return null;
  const label_from = opening.to;
  const label_to = closing.from;
  const raw_label = state.sliceDoc(label_from, label_to);
  const reference = direct_children(node, "LinkLabel")[0] ?? null;
  const target = direct_children(node, "URL")[0] ?? null;
  const raw_reference = reference
    ? state.sliceDoc(reference.from, reference.to).slice(1, -1)
    : "";
  const reference_label = raw_reference || raw_label;
  if (!target && rendered.target) {
    return {
      ...rendered,
      edit_target: rendered.target,
      kind: "reference",
      label_from,
      label_to,
      target_from: -1,
      target_to: -1,
      raw_label,
      has_alias: false,
      title_suffix: reference_title_suffix(state, reference_label),
      reference_label,
      reference_target: rendered.target,
    };
  }
  if (!target) return null;
  return {
    ...rendered,
    edit_target: rendered.target,
    kind: "inline",
    label_from,
    label_to,
    target_from: target.from,
    target_to: target.to,
    raw_label,
    has_alias: false,
    title_suffix: "",
    reference_label: "",
    reference_target: "",
  };
}

function focused_link(
  view: EditorView,
  target: HTMLElement = document.activeElement as HTMLElement,
): LinkInfo | null {
  if (!target || !view.dom.contains(target)) return null;
  const rendered = target.closest<HTMLElement>("[data-md-link-target]");
  if (!rendered) return null;
  try {
    return link_at_position(view.state, view.posAtDOM(rendered) + 1);
  } catch {
    return null;
  }
}

function aria_shortcut(shortcut: string) {
  if (shortcut.startsWith("Mod-")) {
    const key = shortcut.slice(4);
    return `Control+${key} Meta+${key}`;
  }
  return shortcut
    .replace(/Ctrl-/g, "Control+")
    .replace(/Alt-/g, "Alt+")
    .replace(/Shift-/g, "Shift+")
    .replace(/-([a-z])$/i, "+$1");
}

function shortcut_label(shortcut: string) {
  if (shortcut.startsWith("Mod-")) return `Ctrl/Command+${shortcut.slice(4)}`;
  return shortcut.replace(/-/g, "+");
}

function wiki_link_info(
  state: EditorView["state"],
  node: SyntaxNode,
  rendered: NonNullable<ReturnType<typeof link_from_node>>,
): LinkInfo | null {
  const source = state.sliceDoc(node.from, node.to);
  const body = source.slice(2, -2);
  const pipe = find_unescaped_pipe(body);
  const target_raw = pipe < 0 ? body : body.slice(0, pipe);
  const target_from = node.from + 2;
  const label_from = pipe < 0 ? -1 : node.from + 2 + pipe + 1;
  const label_to = pipe < 0 ? -1 : node.to - 2;
  return {
    ...rendered,
    edit_target: target_raw.trim(),
    kind: "wiki",
    target_from,
    target_to: target_from + target_raw.length,
    label_from,
    label_to,
    raw_label: pipe < 0 ? "" : state.sliceDoc(label_from, label_to),
    has_alias: pipe >= 0,
    title_suffix: "",
    reference_label: "",
    reference_target: "",
  };
}

function reference_title_suffix(
  state: EditorView["state"],
  reference_label: string,
) {
  const definition =
    /^\s*\[([^\]]+)\]:\s*(?:<[^>]*>|[^\s]+)([\t ]+(?:"[^"]*"|'[^']*'|\([^)]*\)))\s*$/gm;
  for (const match of state.doc.toString().matchAll(definition)) {
    if (
      normalize_reference(match[1] ?? "") ===
      normalize_reference(reference_label)
    )
      return match[2] ?? "";
  }
  return "";
}

function normalize_reference(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function has_ancestor(node: SyntaxNode, name: string) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.name === name) return true;
  return false;
}

function find_unescaped_pipe(value: string) {
  let slashes = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\\") {
      slashes++;
      continue;
    }
    if (value[index] === "|" && slashes % 2 === 0) return index;
    slashes = 0;
  }
  return -1;
}

function direct_children(node: SyntaxNode, name: string): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.name === name) found.push(child);
  return found;
}

function find_descendant(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const nested = find_descendant(child, name);
    if (nested) return nested;
  }
  return null;
}
