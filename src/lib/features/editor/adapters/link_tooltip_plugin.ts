import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type {
  Mark,
  MarkType,
  Node as ProseNode,
} from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import { posToDOMRect } from "@milkdown/kit/prose";
import { Check, Link, Pencil, Trash2 } from "lucide-static";
import { build_link_edit_transaction } from "./link_edit_transaction";

export const link_tooltip_plugin_key = new PluginKey("custom-link-tooltip");

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const ICONS = {
  link: resize_icon(Link, 16),
  edit: resize_icon(Pencil, 14),
  trash: resize_icon(Trash2, 14),
  check: resize_icon(Check, 14),
} as const;

interface LinkInfo {
  mark: Mark;
  from: number;
  to: number;
  display_text: string;
}

function find_link_at_event(
  view: EditorView,
  event: MouseEvent,
  link_type: MarkType,
): LinkInfo | null {
  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  if (!coords) return null;

  const { pos } = coords;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return null;

  const mark = node.marks.find((m) => m.type === link_type);
  if (!mark) return null;

  const resolved = view.state.doc.resolve(pos);
  const parent = resolved.parent;
  const parent_offset = resolved.before();

  let start = -1;
  let end = -1;
  let display_text = "";

  parent.descendants((child: ProseNode, child_pos: number) => {
    if (start > -1) return false;
    if (child.isText && mark.isInSet(child.marks)) {
      start = parent_offset + 1 + child_pos;
      end = start + child.nodeSize;
      display_text = child.text ?? "";
    }
    return undefined;
  });

  if (start === -1) return null;

  return { mark, from: start, to: end, display_text };
}

function create_icon_button(
  icon_html: string,
  css_class: string,
  on_click: (e: Event) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `button ${css_class}`;
  btn.innerHTML = icon_html;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    on_click(e);
  });
  return btn;
}

function build_preview_dom(callbacks: {
  on_edit: () => void;
  on_remove: () => void;
}): {
  root: HTMLDivElement;
  display_text_el: HTMLSpanElement;
  link_url_el: HTMLSpanElement;
} {
  const root = document.createElement("div");
  root.className = "link-preview";

  const icon_col = document.createElement("span");
  icon_col.className = "link-icon";
  icon_col.innerHTML = ICONS.link;
  root.appendChild(icon_col);

  const text_stack = document.createElement("div");
  text_stack.className = "link-text-stack";

  const display_text_el = document.createElement("span");
  display_text_el.className = "link-display-text";

  const link_url_el = document.createElement("span");
  link_url_el.className = "link-url";

  text_stack.appendChild(display_text_el);
  text_stack.appendChild(link_url_el);
  root.appendChild(text_stack);

  const actions = document.createElement("div");
  actions.className = "link-actions";
  actions.appendChild(
    create_icon_button(ICONS.edit, "link-edit-button", callbacks.on_edit),
  );
  actions.appendChild(
    create_icon_button(ICONS.trash, "link-remove-button", callbacks.on_remove),
  );
  root.appendChild(actions);

  return { root, display_text_el, link_url_el };
}

function build_edit_dom(callbacks: {
  on_confirm: () => void;
  on_cancel: () => void;
}): {
  root: HTMLDivElement;
  text_input: HTMLInputElement;
  link_input: HTMLInputElement;
} {
  const root = document.createElement("div");
  root.className = "link-edit";

  const text_row = document.createElement("div");
  text_row.className = "link-edit-field-row";
  const text_label = document.createElement("span");
  text_label.className = "link-edit-field-label";
  text_label.textContent = "Text";
  const text_input = document.createElement("input");
  text_input.className = "input-area";
  text_input.placeholder = "Display text...";
  text_row.appendChild(text_label);
  text_row.appendChild(text_input);
  root.appendChild(text_row);

  const separator = document.createElement("div");
  separator.className = "link-edit-separator";
  root.appendChild(separator);

  const link_row = document.createElement("div");
  link_row.className = "link-edit-field-row";
  const link_label = document.createElement("span");
  link_label.className = "link-edit-field-label";
  link_label.textContent = "Link";
  const link_input = document.createElement("input");
  link_input.className = "input-area";
  link_input.placeholder = "URL or path...";
  link_row.appendChild(link_label);
  link_row.appendChild(link_input);

  const confirm_btn = create_icon_button(
    ICONS.check,
    "confirm",
    callbacks.on_confirm,
  );
  link_row.appendChild(confirm_btn);
  root.appendChild(link_row);

  const on_keydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      callbacks.on_confirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      callbacks.on_cancel();
    }
  };
  text_input.addEventListener("keydown", on_keydown);
  link_input.addEventListener("keydown", on_keydown);

  return { root, text_input, link_input };
}

export function create_link_tooltip_plugin() {
  return $prose((ctx) => {
    const link_type = linkSchema.type(ctx);
    return new Plugin({
      key: link_tooltip_plugin_key,
      view(editor_view) {
        let mode: "idle" | "preview" | "edit" = "idle";
        let current_link: LinkInfo | null = null;
        let hovering_tooltip = false;

        const preview_container = document.createElement("div");
        preview_container.className = "milkdown-link-preview";

        const edit_container = document.createElement("div");
        edit_container.className = "milkdown-link-edit";

        const enter_edit_mode = () => {
          if (!current_link) return;
          mode = "edit";

          edit_dom.text_input.value = current_link.display_text;
          edit_dom.link_input.value = String(
            current_link.mark.attrs.href ?? "",
          );

          const edit_from = current_link.from;
          const edit_to = current_link.to;

          preview_provider.hide();
          edit_provider.show(
            {
              getBoundingClientRect: () =>
                posToDOMRect(editor_view, edit_from, edit_to),
            },
            editor_view,
          );

          requestAnimationFrame(() => {
            edit_dom.text_input.focus();
            edit_dom.text_input.select();
          });
        };

        const confirm_edit = () => {
          if (!current_link) {
            reset();
            return;
          }

          const new_href = edit_dom.link_input.value.trim();
          const raw_text = edit_dom.text_input.value.trim();

          if (!raw_text && !new_href) {
            reset();
            return;
          }

          const new_text = raw_text || new_href;
          const { from, to, mark } = current_link;
          const old_href = (mark.attrs.href as string) ?? "";

          const { state } = editor_view;

          const tr = build_link_edit_transaction(state, link_type, {
            from,
            to,
            old_display_text: current_link.display_text,
            old_href,
            new_display_text: new_text,
            new_href,
          });

          if (tr) editor_view.dispatch(tr);
          reset();
        };

        const remove_link = () => {
          if (!current_link) return;
          const { from, to } = current_link;
          const { state } = editor_view;
          const tr = state.tr;
          tr.removeMark(from, to, link_type);
          editor_view.dispatch(tr);
          reset();
        };

        const reset = () => {
          mode = "idle";
          current_link = null;
          hovering_tooltip = false;
          preview_provider.hide();
          edit_provider.hide();
        };

        const preview_dom = build_preview_dom({
          on_edit: enter_edit_mode,
          on_remove: remove_link,
        });
        preview_container.appendChild(preview_dom.root);

        const edit_dom = build_edit_dom({
          on_confirm: confirm_edit,
          on_cancel: reset,
        });
        edit_container.appendChild(edit_dom.root);

        const preview_provider = new TooltipProvider({
          content: preview_container,
          debounce: 0,
          shouldShow: () => false,
        });
        preview_provider.update(editor_view);

        const edit_provider = new TooltipProvider({
          content: edit_container,
          debounce: 0,
          shouldShow: () => false,
        });
        edit_provider.onHide = () => {
          requestAnimationFrame(() => {
            editor_view.dom.focus({ preventScroll: true });
          });
        };
        edit_provider.update(editor_view);

        preview_container.addEventListener("mouseenter", () => {
          hovering_tooltip = true;
        });
        preview_container.addEventListener("mouseleave", () => {
          hovering_tooltip = false;
        });

        const HOVER_DELAY = 50;
        let hover_timer: ReturnType<typeof setTimeout> | null = null;

        function schedule_hover(fn: () => void) {
          if (hover_timer !== null) clearTimeout(hover_timer);
          hover_timer = setTimeout(() => {
            hover_timer = null;
            fn();
          }, HOVER_DELAY);
        }

        const on_mousemove = (event: MouseEvent) => {
          if (mode === "edit") return;
          if (!editor_view.hasFocus()) return;

          schedule_hover(() => {
            const info = find_link_at_event(editor_view, event, link_type);
            if (info) {
              current_link = info;
              mode = "preview";
              preview_dom.display_text_el.textContent = info.display_text;
              preview_dom.link_url_el.textContent = String(
                info.mark.attrs.href ?? "",
              );
              preview_provider.show(
                {
                  getBoundingClientRect: () =>
                    posToDOMRect(editor_view, info.from, info.to),
                },
                editor_view,
              );
            } else if (!hovering_tooltip && mode === "preview") {
              reset();
            }
          });
        };

        const on_mouseleave = () => {
          if (mode === "edit") return;
          schedule_hover(() => {
            if (!hovering_tooltip && mode === "preview") reset();
          });
        };

        editor_view.dom.addEventListener("mousemove", on_mousemove);
        editor_view.dom.addEventListener("mouseleave", on_mouseleave);

        return {
          update(view: EditorView) {
            if (mode !== "edit") return;
            if (!current_link) return;

            const { state } = view;
            const { selection } = state;
            if (!(selection instanceof TextSelection)) return;
            const { from, to } = selection;
            if (from === current_link.from && to === current_link.to) return;

            reset();
          },
          destroy() {
            if (hover_timer !== null) {
              clearTimeout(hover_timer);
              hover_timer = null;
            }
            editor_view.dom.removeEventListener("mousemove", on_mousemove);
            editor_view.dom.removeEventListener("mouseleave", on_mouseleave);
            preview_provider.destroy();
            edit_provider.destroy();
            preview_container.remove();
            edit_container.remove();
          },
        };
      },
    });
  });
}
