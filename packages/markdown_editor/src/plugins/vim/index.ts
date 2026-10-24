import { closeCompletion } from "@codemirror/autocomplete";
import { Prec, type Extension, type StateCommand } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { CodeMirror, getCM, vim } from "@replit/codemirror-vim";
import { reveal_surfaces_at_caret } from "../../core/block_field.js";
import { source_redo, source_undo } from "../../core/source_state.js";

// Vim keybindings on @replit/codemirror-vim. Hosts add the extension to a
// Markdown or text state, usually through a compartment so it can be toggled:
//
//   vim_mode({ on_mode_change: (mode) => show_mode(mode) })
//
// The engine keeps registers, maps and options global to the page, so a yank
// in one editor pastes in another. Mode is per view, and starts as "normal"
// whenever the extension is built. apply_vimrc (vimrc.ts) configures it.

export type VimMode =
  | "normal"
  | "insert"
  | "visual"
  | "visual_line"
  | "visual_block"
  | "replace";

export type VimModeOptions = {
  on_mode_change?: (mode: VimMode) => void;
};

export function vim_mode(options: VimModeOptions = {}): Extension {
  return [
    escape_closes_menu_first,
    // Vim keys must beat context_keymap (Prec.high), or Enter in normal mode
    // continues a list item instead of moving down.
    Prec.highest(vim()),
    // One Vim instance edits the whole document. Code blocks and tables show
    // their source under the caret instead of handing keys to a nested view.
    reveal_surfaces_at_caret.of(true),
    // After vim(), so getCM(view) exists when this plugin is built.
    options.on_mode_change ? mode_listener(options.on_mode_change) : [],
    vim_theme,
    EditorView.editorAttributes.of({ class: "md-vim" }),
  ];
}

// Vim's u and <C-r> run CodeMirror's undo and redo on the display state,
// which has no history. Ours lives on the raw source (source_state.ts), so
// route both there. We patch the engine's command table once, instead of
// mapping u and <C-r>, because Vim.mapclear() on a vimrc reload would drop
// those maps.
// @Incomplete: u undoes one CodeMirror history group (edits less than 500 ms
// apart), not one insert session like real Vim.
CodeMirror.commands.undo = (cm) => {
  run_source_history(cm, source_undo);
};
CodeMirror.commands.redo = (cm) => {
  run_source_history(cm, source_redo);
};

// Same caret handling as the package's own history command: Vim expects the
// caret at the start of the undone change. The engine records that start
// while our dispatch goes through its view plugin.
function run_source_history(cm: CodeMirror, command: StateCommand) {
  if (cm.curOp) delete cm.curOp.$changeStart;
  command(cm.cm6);
  const change_start = cm.curOp?.$changeStart;
  if (change_start !== undefined)
    cm.cm6.dispatch({ selection: { anchor: change_start } });
}

// Every keymap, the menus' Prec.highest one included, runs from a single
// Prec.default DOM handler, so Vim's handler above sees keys first. Without
// this, Esc in an open slash or wiki menu would leave insert mode and keep
// the menu open. Other menu keys (Enter, arrows) are not Vim keys in insert
// mode, so they already reach the menu.
const escape_closes_menu_first = Prec.highest(
  EditorView.domEventHandlers({
    keydown: (event, view) => event.key === "Escape" && closeCompletion(view),
  }),
);

type VimModeChange = { mode: string; subMode?: string };

function mode_listener(on_mode_change: (mode: VimMode) => void) {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    const listener = (change: VimModeChange) => {
      on_mode_change(to_vim_mode(change));
    };
    cm?.on("vim-mode-change", listener);
    on_mode_change("normal");
    return {
      destroy() {
        cm?.off("vim-mode-change", listener);
      },
    };
  });
}

function to_vim_mode(change: VimModeChange): VimMode {
  if (change.mode === "visual") {
    if (change.subMode === "linewise") return "visual_line";
    if (change.subMode === "blockwise") return "visual_block";
    return "visual";
  }
  if (change.mode === "insert" || change.mode === "replace") return change.mode;
  return "normal";
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
