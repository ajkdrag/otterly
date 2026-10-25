import {
  Facet,
  Prec,
  type EditorState,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  CodeMirror,
  Vim,
  getCM,
  vim,
  type ActionFn,
} from "@replit/codemirror-vim";
import {
  get_blocks,
  is_block_rendered,
  reveal_surfaces_at_caret,
} from "../../core/block_field.js";
import { line_container } from "../../core/context.js";
import { is_rich } from "../../core/editor_mode.js";
import { run_construct_key } from "../../core/keys.js";
import { source_redo, source_undo } from "../../core/source_state.js";
import {
  close_menu_before_leaving_insert,
  normal_mode_guards,
} from "./input_guards.js";
import { map_prefix_wait } from "./map_prefix_wait.js";
import { status_plugin, type VimMode, type VimStatus } from "./status.js";
import { undo_steps } from "./undo_steps.js";

// Vim keybindings on @replit/codemirror-vim. Hosts add the extension to a
// Markdown or text state, usually through a compartment so it can be toggled:
//
//   vim_keybindings({
//     on_status_change: (status) => show_status(status),
//     on_write: () => save(),
//     on_quit: () => close(),
//   })
//
// The engine keeps registers, maps and options global to the page, so a yank
// in one editor pastes in another. Mode is per view, and starts as "normal"
// whenever the extension is built. apply_vimrc (vimrc.ts) configures it.
//
// Engine bugs we fixed in the engine itself live in patches/ at the repo
// root, each hunk marked "otterly patch Vn".

export type { VimMode, VimStatus };

export type VimKeybindingsOptions = {
  on_status_change?: (status: VimStatus) => void;
  // :w, and the first half of :wq and :x.
  on_write?: () => void | Promise<void>;
  // :q and :q!, and the second half of :wq and :x.
  on_quit?: () => void;
  // "+ and set clipboard=unnamed read and write through this. The engine is
  // global, so the last editor built sets it for the page. Without it the
  // engine uses navigator.clipboard. Call sync_clipboard_from_host when the
  // window gains focus, so text copied in another app reaches p.
  clipboard?: {
    read_text: () => Promise<string>;
    write_text: (text: string) => Promise<void>;
  };
};

export function vim_keybindings(
  options: VimKeybindingsOptions = {},
): Extension {
  const { clipboard } = options;
  if (clipboard)
    Vim.clipboard = {
      readText: () => clipboard.read_text(),
      writeText: (text) => clipboard.write_text(text),
    };
  return [
    close_menu_before_leaving_insert,
    // Vim keys must beat context_keymap (Prec.high), or Enter in normal mode
    // continues a list item instead of moving down.
    Prec.highest(vim()),
    // After vim(), so they only see keys and text Vim did not take.
    normal_mode_guards,
    // One Vim instance edits the whole document. Code blocks and tables show
    // their source under the caret instead of handing keys to a nested view.
    reveal_surfaces_at_caret.of(true),
    // These plugins come after vim(), so getCM(view) exists when they are
    // built.
    undo_steps(),
    map_prefix_wait(),
    status_plugin(options.on_status_change),
    host_commands.of(options),
    // Without a host clipboard the read would be navigator.clipboard's.
    clipboard ? sync_clipboard_after_copy_or_cut : [],
    vim_theme,
    EditorView.editorAttributes.of({ class: "md-vim" }),
  ];
}

// Closes an open / or : prompt the way Esc does. Call it before the view
// shows another buffer, or the prompt comes back as an empty strip when
// you return to this one.
export function close_vim_prompt(view: EditorView) {
  const input = getCM(view)?.state.dialog?.querySelector("input");
  input?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    }),
  );
}

// For set clipboard=unnamed. A plain p puts the unnamed register right away,
// so a map like yypx never waits on the clipboard. Text that another app put
// on the clipboard reaches that register here instead, so call this when the
// window gains focus. Text we wrote ourselves is skipped, which keeps its
// type (linewise or not). Without the option this does nothing. A failed
// read rejects.
export async function sync_clipboard_from_host() {
  const option = Vim.getOption("clipboard");
  if (typeof option !== "string" || !option.includes("unnamed")) return;
  const unnamed = Vim.getRegisterController().unnamedRegister;
  const before = unnamed.toString();
  const text = (await Vim.clipboard.readText()).replace(/\r\n?/g, "\n");
  // A yank or delete that landed while we read is newer than the clipboard.
  if (text === before || unnamed.toString() !== before) return;
  unnamed.setText(text, text.endsWith("\n"));
}

// Cmd+C and Cmd+X change the clipboard without Vim, so the next p would put
// an older register. The browser writes the clipboard after these handlers
// return, hence the timeout.
const sync_clipboard_after_copy_or_cut = EditorView.domEventHandlers({
  copy: sync_clipboard_soon,
  cut: sync_clipboard_soon,
});

function sync_clipboard_soon() {
  setTimeout(() => {
    sync_clipboard_from_host().catch(() => {});
  }, 0);
  return false;
}

type HostCommands = Pick<VimKeybindingsOptions, "on_write" | "on_quit">;

const host_commands = Facet.define<HostCommands, HostCommands>({
  combine: (values) => values[0] ?? {},
});

// The engine's :w runs CodeMirror.commands.save, which is not defined here.
// Saving and closing belong to the host. :q never discards anything: the
// host's close asks about unsaved changes, so :q! does the same as :q.
Vim.defineEx("write", "w", (cm) => {
  write_note(cm);
});
Vim.defineEx("quit", "q", (cm) => {
  quit_note(cm);
});
Vim.defineEx("wq", "wq", (cm) => {
  write_then_quit(cm);
});
Vim.defineEx("xit", "x", (cm) => {
  write_then_quit(cm);
});

function write_note(cm: CodeMirror) {
  const { on_write } = cm.cm6.state.facet(host_commands);
  if (on_write) void on_write();
  else show_notification(cm, ":w does not save here");
}

function quit_note(cm: CodeMirror) {
  const { on_quit } = cm.cm6.state.facet(host_commands);
  if (on_quit) on_quit();
  else show_notification(cm, ":q does not close here");
}

function write_then_quit(cm: CodeMirror) {
  const { on_write, on_quit } = cm.cm6.state.facet(host_commands);
  if (!on_write || !on_quit) {
    show_notification(cm, ":w does not save here");
    return;
  }
  // A failed save keeps the note open. The host reports the failure.
  Promise.resolve(on_write()).then(on_quit, () => {});
}

function show_notification(cm: CodeMirror, text: string) {
  const message = document.createElement("div");
  message.textContent = text;
  cm.openNotification(message, { bottom: true, duration: 5000 });
}

// Vim's u and <C-r> run CodeMirror's undo and redo on the display state,
// which has no history. Ours lives on the raw source (source_state.ts), so
// route both there. We patch the engine's command table once, instead of
// mapping u and <C-r>, because Vim.mapclear() on a vimrc reload would drop
// those maps. undo_steps.ts decides what one step is.
CodeMirror.commands.undo = (cm) => {
  run_source_history(cm, source_undo, "undo");
};
CodeMirror.commands.redo = (cm) => {
  run_source_history(cm, source_redo, "redo");
};

// The engine copied the original undo and redo into its ex table when it
// loaded, before the patch above, so :undo and :redo would still run them on
// the display state. Point them at the patched commands.
Vim.defineEx("undo", "u", (cm) => {
  CodeMirror.commands.undo(cm);
});
Vim.defineEx("redo", "red", (cm) => {
  CodeMirror.commands.redo(cm);
});

// The engine's :unmap also removes built-in keys (:unmap l works). After
// that, mapclear() splits its keymap at the wrong index and the next vimrc
// reload breaks every key. apply_vimrc resolves unmaps itself, so :unmap is
// a vimrc-only command. The engine has no :nunmap, :vunmap and friends.
Vim.defineEx("unmap", undefined, (cm) => {
  show_notification(cm, ":unmap only works in the vimrc.");
});

// Where the cursor goes after u and <C-r>, like Vim. <C-r> goes to the start
// of the change. u goes to the first non-blank of the first line it brings
// back (dd u), else back to where the cursor was before the command (the
// history restores that, see undo_steps.ts) when that is on or right below
// the first changed line (o and O), else to that line's first non-blank.
// Outside insert mode the cursor sits on a character, never past the end of
// the line. The engine clips after u but not after <C-r>.
function run_source_history(
  cm: CodeMirror,
  command: StateCommand,
  direction: "undo" | "redo",
) {
  // The engine's view plugin records each change of the current operation:
  // the lowest start in $changeStart, and a list of the inserted texts.
  if (cm.curOp) delete cm.curOp.$changeStart;
  const previous_change: unknown = cm.curOp?.lastChange;
  const length_before = cm.cm6.state.doc.length;
  command(cm.cm6);
  const change_start = cm.curOp?.$changeStart;
  if (change_start === undefined) return;
  const { state } = cm.cm6;
  const first_change: unknown = is_engine_change(previous_change)
    ? previous_change.next
    : cm.curOp?.change;
  const inserted = is_engine_change(first_change)
    ? first_change.text.join("\n")
    : "";
  const changed_line = state.doc.lineAt(change_start);
  let cursor = change_start;
  if (direction === "undo") {
    // Only a pure insertion can bring lines back.
    const restored_lines =
      inserted.length === state.doc.length - length_before &&
      restores_lines(state, change_start, inserted);
    const restored = state.selection.main.from;
    const restored_line = state.doc.lineAt(restored).number;
    if (restored_lines) {
      const line = state.doc.lineAt(
        change_start === changed_line.to && inserted.startsWith("\n")
          ? change_start + 1
          : change_start,
      );
      cursor = line.from + line.text.search(/\S|$/);
    } else if (
      restored_line === changed_line.number ||
      restored_line === changed_line.number + 1
    ) {
      cursor = restored;
    } else {
      cursor = changed_line.from + changed_line.text.search(/\S|$/);
    }
  }
  if (!cm.state.vim?.insertMode) cursor = on_a_character(state, cursor);
  cm.cm6.dispatch({ selection: { anchor: cursor } });
}

// The engine types its change list as any. Each entry has the inserted
// lines, and the next change of the same operation.
type EngineChange = { text: string[]; next?: unknown };

function is_engine_change(value: unknown): value is EngineChange {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    Array.isArray(value.text)
  );
}

// Whether text inserted at position is whole lines: at a line start ending
// in a line break, or at a line end starting with one and running to the
// end of a line (dd on the last line takes the break before it).
function restores_lines(
  state: EditorState,
  position: number,
  inserted: string,
): boolean {
  if (!inserted.includes("\n")) return false;
  const line = state.doc.lineAt(position);
  if (position === line.from && inserted.endsWith("\n")) return true;
  const end = position + inserted.length;
  return (
    position === line.to &&
    inserted.startsWith("\n") &&
    end === state.doc.lineAt(end).to
  );
}

function on_a_character(state: EditorState, position: number): number {
  const line = state.doc.lineAt(position);
  if (position < line.to || line.from === line.to) return position;
  const last = state.sliceDoc(Math.max(line.from, line.to - 2), line.to);
  return line.to - (/^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(last) ? 2 : 1);
}

// o and O continue a list, task or quote in rich mode, like Enter in insert
// mode does. Vim on Markdown gives a bare line, but a notes app should give
// the next bullet. An empty item gets a plain line, because Enter there would
// end the list. Source mode and text files stay plain, like Vim. The engine
// prefers this command over newlineAndIndent for o, O and r<CR>. It runs
// Enter at the end of the line, so it serves o. O has its own action below.
CodeMirror.commands.newlineAndIndentContinueComment = (cm: CodeMirror) => {
  const view = cm.cm6;
  const { state } = view;
  if (is_rich(state)) {
    const line = state.doc.lineAt(state.selection.main.head);
    const container = line_container(state, line);
    if (
      container.layers.length > 0 &&
      !container.blank &&
      run_construct_key(view, "Enter")
    )
      return;
  }
  CodeMirror.commands.newlineAndIndent(cm);
};

// The engine runs O as Enter at the end of the previous line, which sees the
// wrong container: above the first item of "Shopping:\n- milk" there is no
// list to continue. So on a list, task or quote line, O inserts that line's
// own marker on a new line above instead. The engine gives us no way to
// call its action from a wrapper, so this replaces it with a copy that has
// the extra branch (engine: vim.js, newLineAndEnterInsertMode).
Vim.defineAction(
  "newLineAndEnterInsertMode",
  function (this: { enterInsertMode: ActionFn }, cm, action_args, vim) {
    if (!(cm instanceof CodeMirror)) return;
    vim.insertMode = true;
    const cursor = cm.getCursor();
    if (!action_args.after && open_marker_line_above(cm.cm6)) {
      // The new line is there, with the cursor at its end.
    } else if (!action_args.after && cursor.line === cm.firstLine()) {
      cm.replaceRange("\n", new CodeMirror.Pos(cm.firstLine(), 0));
      cm.setCursor(cm.firstLine(), 0);
    } else {
      const line = action_args.after ? cursor.line : cursor.line - 1;
      cm.setCursor(new CodeMirror.Pos(line, cm.getLine(line).length));
      CodeMirror.commands.newlineAndIndentContinueComment(cm);
    }
    this.enterInsertMode(cm, { repeat: action_args.repeat }, vim);
  },
);

// Opens a line above the cursor's line with the same list, task or quote
// marker, and puts the cursor after it. A task starts unchecked. Returns
// false, and changes nothing, for source mode, an empty item, and a line
// with only indentation in front of its text.
function open_marker_line_above(view: EditorView): boolean {
  const { state } = view;
  if (!is_rich(state)) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  const container = line_container(state, line);
  const marker = state
    .sliceDoc(line.from, container.content_from)
    .replace(/\[[xX]\]/, "[ ]");
  if (container.blank || marker.trim() === "") return false;
  view.dispatch({
    changes: { from: line.from, insert: marker + "\n" },
    selection: { anchor: line.from + marker.length },
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

// j and k ask findPosV where the screen takes the caret, and the engine
// follows an answer past the target line (that is meant for folded text).
// CodeMirror's vertical motion steps over a widget, so a rendered code block
// or table would be skipped whole and the caret could never enter it. When the
// answer jumps over a rendered block, answer with the target line instead.
// The caret then lands on the block's nearest line, which shows its source.
// The wrapper calls the original with the right this.
// eslint-disable-next-line @typescript-eslint/unbound-method
const find_pos_v = CodeMirror.prototype.findPosV;
CodeMirror.prototype.findPosV = function (start, amount, unit, goal_column) {
  const found = find_pos_v.call(this, start, amount, unit, goal_column);
  if (unit !== "line") return found;
  const start_offset = this.indexFromPos(start);
  const found_offset = this.indexFromPos(found);
  if (!jumps_over_rendered_block(this.cm6.state, start_offset, found_offset))
    return found;
  const target = new CodeMirror.Pos(start.line + Math.round(amount), start.ch);
  return this.posFromIndex(this.indexFromPos(target));
};

function jumps_over_rendered_block(
  state: EditorState,
  start_offset: number,
  found_offset: number,
): boolean {
  const start_line = state.doc.lineAt(start_offset);
  const moves_down = found_offset > start_offset;
  return get_blocks(state).some(
    (block) =>
      (moves_down
        ? block.from > start_line.to && block.from <= found_offset
        : block.to < start_line.from && block.to >= found_offset) &&
      is_block_rendered(state, block),
  );
}

// The engine already draws a block cursor in normal and visual mode, a half
// block while an operator waits for its motion, and a low bar in replace
// mode. We only swap its colors for host ones. The extra .cm-vimCursorLayer
// makes these rules beat the engine's own Prec.highest theme. The letter
// under the cursor keeps its text color, which the engine sets inline, so
// the fill stays light enough to read it.
const vim_theme = EditorView.theme({
  ".cm-vimCursorLayer .cm-fat-cursor": {
    background: "color-mix(in oklab, var(--primary, #ff9696) 40%, transparent)",
  },
  "&:not(.cm-focused) .cm-vimCursorLayer .cm-fat-cursor": {
    background: "none",
    outline: "1px solid var(--primary, #ff9696)",
  },
  // The / and : prompt.
  ".cm-vim-panel": {
    background: "var(--muted, #f5f5f5)",
    color: "var(--foreground, #242424)",
    fontFamily: "var(--font-mono, monospace)",
  },
  ".cm-vim-panel input": {
    color: "inherit",
    font: "inherit",
  },
});
