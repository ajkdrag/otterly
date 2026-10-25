import type { PressAndHoldPort } from "$lib/features/vim/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_press_and_hold_tauri_adapter(): PressAndHoldPort {
  return {
    set_press_and_hold: (enabled) =>
      tauri_invoke<void>("set_press_and_hold", { enabled }),
  };
}
