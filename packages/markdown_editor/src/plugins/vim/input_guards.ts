import { closeCompletion, completionStatus } from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { CodeMirror, getCM } from "@replit/codemirror-vim";

// Keys and text that reach the editor around Vim. vim_keybindings puts
// close_menu_before_leaving_insert before Prec.highest(vim()) and
// normal_mode_guards right after it, so the guards only see what Vim did not
// take, and they see it before any Markdown keymap or input handler.

// Esc, Ctrl-[ and Ctrl-c close an open slash or wiki menu before they leave
// insert mode. Every keymap, the menus' own included, runs from one
// Prec.default DOM handler, so without this Vim would see the key first.
//
// Only a menu you can see eats the key. completionStatus is "pending" for
// about 100 ms after every keystroke (activateOnTypingDelay) and while a
// wiki query runs. closeCompletion reports true then too, so Esc right after
// typing used to close nothing visible and stay in insert mode. A pending
// menu is closed and the key still goes to Vim, or the menu would open a
// moment later in normal mode.
export const close_menu_before_leaving_insert: Extension = [
  Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (!is_escape_key(event)) return false;
        if (!getCM(view)?.state.vim?.insertMode) return false;
        const status = completionStatus(view.state);
        if (status) closeCompletion(view);
        return status === "active";
      },
    }),
  ),
  // jk or <C-o> leave insert mode without Esc. Close the menu then too. The
  // mode change can arrive inside a CodeMirror update, so dispatch later.
  ViewPlugin.define((view) => {
    const cm = getCM(view);
    let destroyed = false;
    const on_mode_change = ({ mode }: { mode: string }) => {
      if (mode === "insert" || mode === "replace") return;
      queueMicrotask(() => {
        if (!destroyed && completionStatus(view.state)) closeCompletion(view);
      });
    };
    cm?.on("vim-mode-change", on_mode_change);
    return {
      destroy() {
        destroyed = true;
        cm?.off("vim-mode-change", on_mode_change);
      },
    };
  }),
];

function is_escape_key(event: KeyboardEvent): boolean {
  if (event.key === "Escape") return true;
  if (!event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === "[" || event.key === "c";
}

// Normal, visual and operator-pending mode never edit the note through a key
// or text Vim did not take.
//
// Keys: CodeMirror's defaultKeymap still sits below Vim. On macOS Ctrl-k
// deletes to the line end, Ctrl-h deletes a character and Ctrl-t transposes
// (its emacs keys, reached because Ctrl goes to Vim there). Everywhere,
// Shift-Tab outdents a list item and Alt or Cmd with Backspace, Delete or
// Enter deletes or splits lines. So Tab, Enter, Backspace and Delete with any
// modifier stop here, and on macOS so does every Ctrl combo without Cmd. Cmd
// combos (copy, paste, app hotkeys), Esc, arrows and F-keys go on. On Windows
// and Linux Ctrl belongs to the app, so Ctrl+Z still undoes.
//
// Text: the macOS accent menu, the emoji picker, dictation and IME commits
// arrive as text input, not keys. Vim takes one character after f, t and r
// (expectLiteralNext), where it handles dead keys itself, so that stays.
export const normal_mode_guards: Extension = Prec.highest([
  EditorView.domEventHandlers({
    keydown(event, view) {
      const vim = getCM(view)?.state.vim;
      if (!vim || vim.insertMode) return false;
      if (["Tab", "Enter", "Backspace", "Delete"].includes(event.key))
        return true;
      return CodeMirror.isMac && event.ctrlKey && !event.metaKey;
    },
  }),
  EditorView.inputHandler.of((view) => {
    const vim = getCM(view)?.state.vim;
    return !!vim && !vim.insertMode && !vim.expectLiteralNext;
  }),
]);
