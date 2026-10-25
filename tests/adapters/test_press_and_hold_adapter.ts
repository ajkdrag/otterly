import type { PressAndHoldPort } from "$lib/features/vim";

export function create_test_press_and_hold_adapter(): PressAndHoldPort {
  return {
    set_press_and_hold() {
      return Promise.resolve();
    },
  };
}
