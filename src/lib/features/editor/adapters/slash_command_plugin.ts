import { $prose } from "@milkdown/kit/utils";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@milkdown/kit/prose/state";
import { SlashProvider } from "@milkdown/kit/plugin/slash";
import type { EditorView } from "@milkdown/kit/prose/view";

export const slash_plugin_key = new PluginKey("slash-command");

type SlashState = {
  active: boolean;
  query: string;
  from: number;
  selected_index: number;
  filtered: SlashCommand[];
};

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  insert: (view: EditorView, slash_from: number) => void;
};

const EMPTY_STATE: SlashState = {
  active: false,
  query: "",
  from: 0,
  selected_index: 0,
  filtered: [],
};

export function extract_slash_query_from_state(
  state: EditorState,
): { query: string; from: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === "code_block") return null;

  const text = $from.parent.textBetween(0, $from.parentOffset);
  if (!text.startsWith("/")) return null;

  return { query: text.slice(1), from: $from.start() };
}

function extract_slash_query(
  view: EditorView,
): { query: string; from: number } | null {
  return extract_slash_query_from_state(view.state);
}

export function filter_commands(
  all: SlashCommand[],
  query: string,
): SlashCommand[] {
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(
    (cmd) =>
      cmd.id.startsWith(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q)),
  );
}

function make_heading_insert(level: number) {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const heading_type = state.schema.nodes["heading"];
    if (!heading_type) return;
    const cursor = state.selection.from;
    const tr = state.tr
      .delete(from, cursor)
      .setBlockType(from, from, heading_type, { level });
    view.dispatch(tr.scrollIntoView());
  };
}

function make_code_block_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const code_type = state.schema.nodes["code_block"];
    if (!code_type) return;
    const cursor = state.selection.from;
    const tr = state.tr
      .delete(from, cursor)
      .setBlockType(from, from, code_type, { language: "" });
    view.dispatch(tr.scrollIntoView());
  };
}

function make_blockquote_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const bq = state.schema.nodes["blockquote"];
    const para = state.schema.nodes["paragraph"];
    if (!bq || !para) return;

    const $pos = state.doc.resolve(from);
    const tr = state.tr.replaceWith(
      $pos.before(),
      $pos.after(),
      bq.create(null, para.create()),
    );
    const sel = TextSelection.findFrom(tr.doc.resolve($pos.before() + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_list_insert(list_type_name: string) {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const list = state.schema.nodes[list_type_name];
    const item = state.schema.nodes["list_item"];
    const para = state.schema.nodes["paragraph"];
    if (!list || !item || !para) return;

    const $pos = state.doc.resolve(from);
    const tr = state.tr.replaceWith(
      $pos.before(),
      $pos.after(),
      list.create(null, item.create(null, para.create())),
    );
    const sel = TextSelection.findFrom(tr.doc.resolve($pos.before() + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_table_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const { nodes: n } = state.schema;
    const table = n["table"];
    const row = n["table_row"];
    const header = n["table_header"];
    const cell = n["table_cell"];
    const para = n["paragraph"];
    if (!table || !row || !header || !cell || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const header_row = row.create(null, [
      header.create(null, para.create(null, state.schema.text("Col 1"))),
      header.create(null, para.create(null, state.schema.text("Col 2"))),
    ]);
    const body_row = row.create(null, [
      cell.create(null, para.create()),
      cell.create(null, para.create()),
    ]);

    const tr = state.tr.replaceWith(start, $pos.after(), [
      table.create(null, [header_row, body_row]),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_divider_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const hr = state.schema.nodes["hr"];
    const para = state.schema.nodes["paragraph"];
    if (!hr || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const tr = state.tr.replaceWith(start, $pos.after(), [
      hr.create(),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

export function create_commands(): SlashCommand[] {
  return [
    {
      id: "h1",
      label: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      keywords: ["heading", "h1", "title", "large"],
      insert: make_heading_insert(1),
    },
    {
      id: "h2",
      label: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      keywords: ["heading", "h2", "subtitle", "medium"],
      insert: make_heading_insert(2),
    },
    {
      id: "h3",
      label: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      keywords: ["heading", "h3", "small"],
      insert: make_heading_insert(3),
    },
    {
      id: "h4",
      label: "Heading 4",
      description: "Sub-section heading",
      icon: "H4",
      keywords: ["heading", "h4"],
      insert: make_heading_insert(4),
    },
    {
      id: "h5",
      label: "Heading 5",
      description: "Minor heading",
      icon: "H5",
      keywords: ["heading", "h5"],
      insert: make_heading_insert(5),
    },
    {
      id: "h6",
      label: "Heading 6",
      description: "Minor heading",
      icon: "H6",
      keywords: ["heading", "h6"],
      insert: make_heading_insert(6),
    },
    {
      id: "code",
      label: "Code Block",
      description: "Code with syntax highlighting",
      icon: "</>",
      keywords: ["code", "block", "pre", "fence", "snippet", "syntax"],
      insert: make_code_block_insert(),
    },
    {
      id: "table",
      label: "Table",
      description: "Grid with rows and columns",
      icon: "⊞",
      keywords: ["table", "grid", "spreadsheet", "data"],
      insert: make_table_insert(),
    },
    {
      id: "bullet",
      label: "Bullet List",
      description: "Unordered list of items",
      icon: "•",
      keywords: ["bullet", "list", "unordered", "ul", "items"],
      insert: make_list_insert("bullet_list"),
    },
    {
      id: "ordered",
      label: "Ordered List",
      description: "Numbered list of items",
      icon: "#",
      keywords: ["ordered", "list", "numbered", "ol", "number"],
      insert: make_list_insert("ordered_list"),
    },
    {
      id: "blockquote",
      label: "Blockquote",
      description: "Indented quote or callout",
      icon: "❝",
      keywords: ["quote", "blockquote", "callout", "cite"],
      insert: make_blockquote_insert(),
    },
    {
      id: "divider",
      label: "Divider",
      description: "Horizontal rule to separate sections",
      icon: "—",
      keywords: ["divider", "hr", "horizontal", "rule", "separator", "line"],
      insert: make_divider_insert(),
    },
  ];
}

function create_menu_el(): HTMLElement {
  const el = document.createElement("div");
  el.className = "SlashMenu";
  el.dataset.show = "false";
  return el;
}

function render_items(
  menu: HTMLElement,
  state: SlashState,
  on_click: (cmd: SlashCommand) => void,
): void {
  menu.innerHTML = "";

  if (state.filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "SlashMenu__empty";
    empty.textContent = "No matching commands";
    menu.appendChild(empty);
    return;
  }

  for (let i = 0; i < state.filtered.length; i++) {
    const cmd = state.filtered[i];
    if (!cmd) continue;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "SlashMenu__item";
    if (i === state.selected_index)
      row.classList.add("SlashMenu__item--selected");

    const icon_el = document.createElement("span");
    icon_el.className = "SlashMenu__icon";
    icon_el.textContent = cmd.icon;
    row.appendChild(icon_el);

    const text_el = document.createElement("span");
    text_el.className = "SlashMenu__text";

    const label_el = document.createElement("span");
    label_el.className = "SlashMenu__label";
    label_el.textContent = cmd.label;
    text_el.appendChild(label_el);

    const desc_el = document.createElement("span");
    desc_el.className = "SlashMenu__desc";
    desc_el.textContent = cmd.description;
    text_el.appendChild(desc_el);

    row.appendChild(text_el);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_click(cmd);
    });

    menu.appendChild(row);
  }
}

function scroll_selected_into_view(
  menu: HTMLElement,
  selected_index: number,
): void {
  const row = menu.children.item(selected_index);
  if (!(row instanceof HTMLElement)) return;

  const row_top = row.offsetTop;
  const row_bottom = row_top + row.offsetHeight;
  const view_top = menu.scrollTop;
  const view_bottom = view_top + menu.clientHeight;

  if (row_top < view_top) {
    menu.scrollTop = row_top;
    return;
  }
  if (row_bottom > view_bottom) {
    menu.scrollTop = row_bottom - menu.clientHeight;
  }
}

export const slash_command_plugin = $prose(() => {
  const all_commands = create_commands();

  let slash_state: SlashState = EMPTY_STATE;
  let menu: HTMLElement | null = null;
  let provider: SlashProvider | null = null;
  let accept_fn: ((cmd: SlashCommand) => void) | null = null;
  let detach_outside_click: (() => void) | null = null;
  let detach_focus_listener: (() => void) | null = null;

  return new Plugin({
    key: slash_plugin_key,

    view(editor_view) {
      menu = create_menu_el();

      provider = new SlashProvider({
        content: menu,
        debounce: 0,
        offset: { mainAxis: 6 },
        root: document.body,
        floatingUIOptions: { placement: "bottom-start" },
        shouldShow: () => {
          if (!slash_state.active) return false;
          if (slash_state.filtered.length === 0) return false;
          if (!editor_view.editable) return false;
          if (menu?.contains(document.activeElement)) return true;
          return editor_view.hasFocus();
        },
      });

      accept_fn = (cmd) => {
        const from = slash_state.from;
        slash_state = EMPTY_STATE;
        provider?.hide();
        cmd.insert(editor_view, from);
        editor_view.focus();
      };

      const on_document_mousedown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (menu?.contains(target)) return;
        if (editor_view.dom.contains(target)) return;
        slash_state = EMPTY_STATE;
        provider?.hide();
      };

      const on_document_focusin = (event: FocusEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (menu?.contains(target)) return;
        if (editor_view.dom.contains(target)) return;
        slash_state = EMPTY_STATE;
        provider?.hide();
      };

      document.addEventListener("mousedown", on_document_mousedown, true);
      document.addEventListener("focusin", on_document_focusin, true);

      detach_outside_click = () => {
        document.removeEventListener("mousedown", on_document_mousedown, true);
      };
      detach_focus_listener = () => {
        document.removeEventListener("focusin", on_document_focusin, true);
      };

      return {
        update(view) {
          const result = extract_slash_query(view);

          if (!result) {
            if (slash_state.active) {
              slash_state = EMPTY_STATE;
              provider?.hide();
            }
            return;
          }

          const filtered = filter_commands(all_commands, result.query);
          const prev_index = slash_state.selected_index;
          const prev_query = slash_state.query;

          slash_state = {
            active: true,
            query: result.query,
            from: result.from,
            selected_index:
              result.query !== prev_query
                ? 0
                : Math.min(prev_index, Math.max(0, filtered.length - 1)),
            filtered,
          };

          if (menu) render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));
          provider?.update(view, undefined);
        },

        destroy() {
          menu?.remove();
          menu = null;
          provider?.destroy();
          provider = null;
          accept_fn = null;
          detach_outside_click?.();
          detach_outside_click = null;
          detach_focus_listener?.();
          detach_focus_listener = null;
        },
      };
    },

    props: {
      handleKeyDown(_view, event) {
        if (!slash_state.active || slash_state.filtered.length === 0 || !menu) {
          return false;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          slash_state = {
            ...slash_state,
            selected_index: Math.min(
              slash_state.selected_index + 1,
              slash_state.filtered.length - 1,
            ),
          };
          render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));
          scroll_selected_into_view(menu, slash_state.selected_index);
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          slash_state = {
            ...slash_state,
            selected_index: Math.max(slash_state.selected_index - 1, 0),
          };
          render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));
          scroll_selected_into_view(menu, slash_state.selected_index);
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const cmd = slash_state.filtered[slash_state.selected_index];
          if (cmd) accept_fn?.(cmd);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          slash_state = EMPTY_STATE;
          provider?.hide();
          return true;
        }

        return false;
      },
    },
  });
});
