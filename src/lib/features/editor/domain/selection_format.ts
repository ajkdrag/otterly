export const SELECTION_FORMATS = [
  "bullet_list",
  "ordered_list",
  "task_list",
  "code_block",
] as const;

export type SelectionFormat = (typeof SELECTION_FORMATS)[number];

// Action arguments arrive as unknown, so the action narrows with this.
export function is_selection_format(value: unknown): value is SelectionFormat {
  return (
    typeof value === "string" &&
    (SELECTION_FORMATS as readonly string[]).includes(value)
  );
}
