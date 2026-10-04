import {
  autocompletion,
  completionKeymap,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
  type Completion,
} from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { menu_theme } from "./theme.js";

// Completion items that draw an icon tile, like slash commands.
export type IconCompletion = Completion & { icon: string };

function is_icon_completion(
  completion: Completion,
): completion is IconCompletion {
  return "icon" in completion;
}

// One completion setup shared by every menu plugin. Each plugin adds its own
// source as Markdown language data, and this single autocompletion instance
// reads them all. CodeMirror deduplicates this exact extension value, so
// installing two menu plugins does not install two menus.
export const menu_support = [
  autocompletion({
    activateOnTypingDelay: 0,
    interactionDelay: 0,
    defaultKeymap: false,
    icons: false,
    tooltipClass: (state) =>
      currentCompletions(state).some(is_icon_completion)
        ? "md-slash-menu"
        : "md-wiki-menu",
    optionClass: (completion) =>
      is_icon_completion(completion)
        ? "md-slash-option"
        : `md-wiki-option${completion.type === "wiki-planned" ? " md-wiki-planned" : ""}`,
    addToOptions: [
      {
        position: 20,
        render(completion) {
          if (!is_icon_completion(completion)) return null;
          const icon = document.createElement("span");
          icon.className = "md-slash-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = completion.icon;
          return icon;
        },
      },
    ],
  }),
  // Up and Down stop at the ends of the menu instead of wrapping around.
  Prec.highest(
    keymap.of(
      completionKeymap.map((binding) => {
        if (binding.key === "ArrowDown")
          return { ...binding, run: move_selection(1) };
        if (binding.key === "ArrowUp")
          return { ...binding, run: move_selection(-1) };
        return binding;
      }),
    ),
  ),
  // A full theme, so it overrides CodeMirror's own autocomplete styles.
  EditorView.theme(menu_theme),
];

function move_selection(direction: -1 | 1) {
  return (view: EditorView) => {
    const completions = currentCompletions(view.state);
    const selected = selectedCompletionIndex(view.state);
    if (!completions.length || selected === null) return false;
    const next = Math.max(
      0,
      Math.min(completions.length - 1, selected + direction),
    );
    view.dispatch({ effects: setSelectedCompletion(next) });
    return true;
  };
}
