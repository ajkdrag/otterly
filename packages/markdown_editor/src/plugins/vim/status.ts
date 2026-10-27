import { EditorSelection } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { Vim, getCM, type CodeMirror } from "@replit/codemirror-vim";

export type VimMode =
  | "normal"
  | "insert"
  // One normal mode command after <C-o> in insert mode.
  | "insert_normal"
  | "visual"
  | "visual_line"
  | "visual_block"
  | "replace";

export type VimStatus = {
  mode: VimMode;
  // Vim's showcmd: keys of a command still being typed, or in visual mode
  // the size of the selection ("3", "2", "2x3").
  showcmd: string;
  // Register of the macro being recorded, or null.
  recording: string | null;
};

// Reports the status to the host whenever any part of it changes. The
// engine has no single "status changed" event, so this reads its state after
// every mode change, finished command, handled key and editor update, and
// only calls the host when the answer differs.
export function status_plugin(
  on_status_change: ((status: VimStatus) => void) | undefined,
) {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    let reported: VimStatus | null = null;
    let destroyed = false;
    const publish = () => {
      if (!cm?.state.vim) return;
      const status = read_status(cm);
      if (reported && same_status(reported, status)) return;
      reported = status;
      view.dom.dataset.vimMode = status.mode;
      on_status_change?.(status);
    };
    cm?.on("vim-mode-change", publish);
    cm?.on("vim-command-done", publish);
    cm?.on("vim-keypress", publish);
    publish();
    collapse_left_selection(view, () => destroyed);
    return {
      update: publish,
      destroy() {
        destroyed = true;
        cm?.off("vim-mode-change", publish);
        cm?.off("vim-command-done", publish);
        cm?.off("vim-keypress", publish);
      },
    };
  });
}

// A buffer that was left in visual mode comes back with its range selection,
// but Vim starts in normal mode, where d and y would act from the old
// anchor. Collapse it to the head. The plugin is built inside a CodeMirror
// update, so the dispatch waits, and only runs when nothing moved since.
function collapse_left_selection(view: EditorView, destroyed: () => boolean) {
  const selection = view.state.selection;
  if (selection.main.empty) return;
  queueMicrotask(() => {
    if (destroyed() || view.state.selection !== selection) return;
    view.dispatch({ selection: EditorSelection.cursor(selection.main.head) });
  });
}

function read_status(cm: CodeMirror): VimStatus {
  // The engine calls this a testing hook. It is the only way to see whether
  // a macro is being recorded.
  const macro = Vim.getVimGlobalState_().macroModeState;
  return {
    mode: read_mode(cm),
    showcmd: read_showcmd(cm),
    recording: macro.isRecording ? (macro.latestRegister ?? null) : null,
  };
}

function read_mode(cm: CodeMirror): VimMode {
  const vim = cm.state.vim;
  if (!vim) return "normal";
  if (vim.insertMode) return cm.state.overwrite ? "replace" : "insert";
  if (vim.visualMode) {
    if (vim.visualBlock) return "visual_block";
    return vim.visualLine ? "visual_line" : "visual";
  }
  return vim.insertModeReturn ? "insert_normal" : "normal";
}

function read_showcmd(cm: CodeMirror): string {
  const vim = cm.state.vim;
  if (!vim) return "";
  // The / and : prompt shows the keys itself. Notifications and the
  // "recording" message are dialogs too, but have no input.
  if (cm.state.dialog?.querySelector("input")) return "";
  // The engine appends each key to vim.status before it handles it, and
  // clears it when a command is done.
  if (vim.status) return display_keys(vim.status);
  if (!vim.visualMode) return "";
  const { anchor, head } = vim.sel;
  const lines = Math.abs(head.line - anchor.line) + 1;
  if (vim.visualBlock)
    return `${String(lines)}x${String(Math.abs(head.ch - anchor.ch) + 1)}`;
  if (vim.visualLine || lines > 1) return String(lines);
  const [from, to] = anchor.ch <= head.ch ? [anchor, head] : [head, anchor];
  // Characters, not UTF-16 units, so an emoji counts once.
  return String(
    Array.from(cm.getLine(from.line).slice(from.ch, to.ch + 1)).length,
  );
}

// <Space> shows as ␣ and <C-x> as ^X, like Vim's showcmd. Only the last 10
// characters fit.
function display_keys(keys: string): string {
  const shown = keys
    .replace(/<Space>/g, "␣")
    .replace(/<C-(.)>/g, (_key, letter: string) => `^${letter.toUpperCase()}`);
  return Array.from(shown).slice(-10).join("");
}

function same_status(left: VimStatus, right: VimStatus): boolean {
  return (
    left.mode === right.mode &&
    left.showcmd === right.showcmd &&
    left.recording === right.recording
  );
}
