import { LanguageDescription } from "@codemirror/language";

type LanguageChoice = {
  value: string;
  label: string;
  aliases: readonly string[];
};
let next_picker_id = 0;

// The controller owns this popup and its document listeners. It never stores
// DOM in EditorState, so cached buffers can mount independent pickers.
export function create_code_language_picker(
  host: HTMLElement,
  languages: readonly LanguageDescription[],
  on_change: (language: string) => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-code-language-button";
  button.setAttribute("aria-label", "Code language");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const popup = document.createElement("div");
  popup.className = "md-code-language-popup";
  const input = document.createElement("input");
  input.type = "search";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.placeholder = "Search languages…";
  input.setAttribute("aria-label", "Search code languages");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  const list = document.createElement("div");
  list.id = `md-code-languages-${String(++next_picker_id)}`;
  list.className = "md-code-language-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Code languages");
  input.setAttribute("aria-controls", list.id);
  button.setAttribute("aria-controls", list.id);
  popup.append(input, list);
  let current = "";
  let choices: LanguageChoice[] = [];
  let filtered: LanguageChoice[] = [];
  let active_index = 0;

  button.addEventListener("click", () => {
    if (popup.isConnected) close_popup(true);
    else open_popup();
  });
  input.addEventListener("input", () => {
    active_index = 0;
    render_choices();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close_popup(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = filtered[active_index];
      if (choice) choose_language(choice);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active_index = Math.max(
        0,
        Math.min(
          filtered.length - 1,
          active_index + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      render_choices();
      list.children[active_index]?.scrollIntoView?.({ block: "nearest" });
    } else if (event.key === "Tab") close_popup(true);
  });

  function update_language(value: string, read_only: boolean) {
    current = value;
    button.disabled = read_only;
    if (read_only) close_popup(false);
    const available = new Map<string, LanguageChoice>([
      [
        "text",
        { value: "text", label: "Plain text", aliases: ["", "plain", "txt"] },
      ],
    ]);
    for (const language of languages)
      if (language.name)
        available.set(language.name, {
          value: language.name,
          label: language.name,
          // Fence tokens are often file extensions ("py", "rs"), which
          // language-data lists as extensions, not aliases.
          aliases: [...language.alias, ...language.extensions],
        });
    choices = [...available.values()];
    const match = choices.find((choice) => matches_current(choice));
    if (!match && current)
      choices.push({ value: current, label: current, aliases: [] });
    button.textContent = (match?.label ?? current) + " ▾";
    if (popup.isConnected) render_choices();
  }

  function matches_current(choice: LanguageChoice): boolean {
    const name = current.toLowerCase();
    return (
      choice.value.toLowerCase() === name ||
      choice.aliases.some((alias) => alias.toLowerCase() === name)
    );
  }

  function render_choices() {
    const query = input.value.trim().toLowerCase();
    filtered = choices.filter((choice) =>
      [choice.label, ...choice.aliases].some((name) =>
        name.toLowerCase().includes(query),
      ),
    );
    active_index = Math.max(0, Math.min(active_index, filtered.length - 1));
    list.replaceChildren(
      ...filtered.map((choice, index) => {
        const option = document.createElement("div");
        option.id = `${list.id}-${String(index)}`;
        option.className = "md-code-language-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(matches_current(choice)));
        option.dataset.active = String(index === active_index);
        option.textContent = choice.label;
        const visible_aliases = choice.aliases.filter(Boolean);
        if (visible_aliases.length) {
          const aliases = document.createElement("span");
          aliases.textContent = visible_aliases.join(", ");
          option.append(aliases);
        }
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
        });
        option.addEventListener("click", () => {
          choose_language(choice);
        });
        return option;
      }),
    );
    const active = list.children[active_index];
    if (active) input.setAttribute("aria-activedescendant", active.id);
    else {
      input.removeAttribute("aria-activedescendant");
      const empty = document.createElement("div");
      empty.className = "md-code-language-empty";
      empty.textContent = "No languages found";
      list.append(empty);
    }
  }

  function choose_language(choice: LanguageChoice) {
    if (button.disabled) return;
    // Selecting the already-active language must preserve its original alias.
    if (!matches_current(choice)) on_change(choice.value);
    close_popup(true);
  }

  function open_popup() {
    if (button.disabled) return;
    input.value = "";
    active_index = Math.max(
      0,
      choices.findIndex((choice) => matches_current(choice)),
    );
    render_choices();
    const bounds = button.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    popup.style.width = `${String(width)}px`;
    popup.style.left = `${String(Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)))}px`;
    const below = window.innerHeight - bounds.bottom - 8;
    const above = bounds.top - 8;
    const place_above = below < 180 && above > below;
    popup.style.top = place_above ? "auto" : `${String(bounds.bottom + 4)}px`;
    popup.style.bottom = place_above
      ? `${String(window.innerHeight - bounds.top + 4)}px`
      : "auto";
    popup.style.maxHeight = `${String(Math.max(80, Math.min(320, place_above ? above : below)))}px`;
    host.append(popup);
    button.setAttribute("aria-expanded", "true");
    list.children[active_index]?.scrollIntoView?.({ block: "nearest" });
    document.addEventListener("pointerdown", close_outside);
    document.addEventListener("scroll", close_on_scroll, true);
    window.addEventListener("resize", close_on_resize);
    input.focus();
  }

  function close_outside(event: PointerEvent) {
    if (
      event.target instanceof Node &&
      !popup.contains(event.target) &&
      !button.contains(event.target)
    )
      close_popup(false);
  }
  function close_on_scroll(event: Event) {
    if (event.target instanceof Node && !popup.contains(event.target))
      close_popup(false);
  }
  function close_on_resize() {
    close_popup(false);
  }
  function close_popup(restore_focus: boolean) {
    popup.remove();
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", close_outside);
    document.removeEventListener("scroll", close_on_scroll, true);
    window.removeEventListener("resize", close_on_resize);
    if (restore_focus && !button.disabled) button.focus();
  }

  return {
    button,
    update_language,
    destroy: () => {
      close_popup(false);
    },
  };
}

// Resolve a fence token to a language: by name or alias first, then by file
// extension, so "```py" finds Python.
export function find_code_language(
  languages: readonly LanguageDescription[],
  token: string,
): LanguageDescription | null {
  const name = token.toLowerCase();
  if (!name) return null;
  return (
    LanguageDescription.matchLanguageName(languages, name, true) ??
    languages.find((language) => language.extensions.includes(name)) ??
    null
  );
}
