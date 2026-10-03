// Ctrl/Cmd+J moves a picker selection down and Ctrl/Cmd+K moves it up, like
// ArrowDown/ArrowUp. Alt and Shift combos are not picker navigation.
export function picker_shortcut_step(event: KeyboardEvent): 1 | -1 | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.altKey || event.shiftKey) return null;

  const key = event.key.toLowerCase();
  if (key === "j") return 1;
  if (key === "k") return -1;
  return null;
}
