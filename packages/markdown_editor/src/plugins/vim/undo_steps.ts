import {
  EditorState,
  StateField,
  Transaction,
  type EditorSelection,
  type Extension,
  type Text,
} from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import {
  source_history_group,
  source_history_selection,
} from "../../core/source_state.js";

// Vim's undo steps. Vim closes a step whenever it waits for a typed key,
// except in insert mode, where the step runs until you leave insert mode or
// move the cursor. So u after "i foo, a pause, bar, Esc" removes both words,
// two fast x undo one at a time, and a macro, a map or . undo as a whole.
// CodeMirror groups by time instead (500 ms), so every change gets a
// source_history_group annotation here.
//
// A key that makes several changes (a macro, a map, .) joins them, because
// they all happen while that key is being handled. A paste from the context
// menu is no typed key, so it starts a step.
//
// A step also remembers the cursor from before its key, which u restores.
// o moves the cursor to the line end before it changes anything, and Vim
// still puts it back where it was.
//
// @Incomplete: After <C-o> in insert mode, the first typed character joins
// the step of the <C-o> command. Vim splits there.

export function undo_steps(): Extension {
  return [undo_session, group_changes, session_tracker];
}

// Keys typed into any Vim editor on the page. Keys arrive one at a time, so
// one counter is enough.
let typed_key_serial = 0;

// True while the engine handles a typed key. It runs everything for that key,
// macros and maps included, before the microtask that clears this. We cannot
// tell such a change by its userEvent: o on a list item changes the note
// through the Enter construct key, which has another one.
let key_in_progress = false;

type UndoSession = {
  // Insert or replace mode, as the engine last reported it.
  open: boolean;
  // The serial of the key that opened insert mode.
  opened_at: number;
  changed_in_session: boolean;
  // The serial of the key that made the last change.
  last_change_serial: number;
  moved_since_change: boolean;
  // The document and selection right before the last typed key.
  key_start: { doc: Text; selection: EditorSelection } | null;
};

// One record per buffer, mutated in place by session_tracker. Mode changes
// can arrive in the middle of a CodeMirror update (a mouse selection enters
// visual mode), where dispatching an effect would throw. A record that the
// transaction extender reads avoids that, and a cached buffer keeps its own.
const undo_session = StateField.define<UndoSession>({
  create: () => ({
    open: false,
    opened_at: -1,
    changed_in_session: false,
    last_change_serial: -1,
    moved_since_change: false,
    key_start: null,
  }),
  update: (session) => session,
});

const group_changes = EditorState.transactionExtender.of((transaction) => {
  if (!transaction.docChanged) return null;
  if (
    transaction.isUserEvent("history") ||
    transaction.annotation(Transaction.addToHistory) === false
  )
    return null;
  const session = transaction.startState.field(undo_session, false);
  if (!session) return null;
  const group = history_group(session);
  const { key_start } = session;
  // Only while the selection still fits this document.
  if (group === "start" && key_start?.doc === transaction.startState.doc)
    return {
      annotations: [
        source_history_group.of(group),
        source_history_selection.of(key_start.selection),
      ],
    };
  return { annotations: source_history_group.of(group) };
});

function history_group(session: UndoSession): "start" | "join" {
  if (session.open) {
    if (session.moved_since_change) return "start";
    // The key that opened insert mode changed the note itself (cw, o, s),
    // so the first typed text joins that change.
    if (!session.changed_in_session)
      return session.last_change_serial === session.opened_at
        ? "join"
        : "start";
    return "join";
  }
  return key_in_progress && session.last_change_serial === typed_key_serial
    ? "join"
    : "start";
}

type VimModeChange = { mode: string };

const session_tracker = ViewPlugin.define((view) => {
  const session = view.state.field(undo_session);
  // A buffer that was left in insert mode comes back in normal mode.
  session.open = false;
  const cm = getCM(view);
  const on_input = (event: { type?: string }) => {
    if (event.type !== "handleKey") return;
    typed_key_serial++;
    key_in_progress = true;
    queueMicrotask(() => {
      key_in_progress = false;
    });
    session.key_start = {
      doc: view.state.doc,
      selection: view.state.selection,
    };
  };
  const on_mode_change = ({ mode }: VimModeChange) => {
    const open = mode === "insert" || mode === "replace";
    if (open && !session.open) {
      session.opened_at = typed_key_serial;
      session.changed_in_session = false;
      session.moved_since_change = false;
    }
    session.open = open;
  };
  cm?.on("inputEvent", on_input);
  cm?.on("vim-mode-change", on_mode_change);
  return {
    update(update) {
      for (const transaction of update.transactions) {
        if (transaction.docChanged) {
          session.last_change_serial = typed_key_serial;
          session.moved_since_change = false;
          session.changed_in_session = session.open;
        } else if (session.open && transaction.isUserEvent("select")) {
          session.moved_since_change = true;
        }
      }
    },
    destroy() {
      cm?.off("inputEvent", on_input);
      cm?.off("vim-mode-change", on_mode_change);
    },
  };
});
