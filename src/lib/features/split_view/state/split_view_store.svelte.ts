import type { OpenNoteState } from "$lib/shared/types/editor";

export type ActivePane = "primary" | "secondary";

export class SplitViewStore {
  active = $state(false);
  secondary_note = $state<OpenNoteState | null>(null);
  active_pane = $state<ActivePane>("primary");

  open_secondary(note: OpenNoteState) {
    this.active = true;
    this.secondary_note = note;
    this.active_pane = "secondary";
  }

  close() {
    this.active = false;
    this.secondary_note = null;
    this.active_pane = "primary";
  }

  toggle() {
    if (this.active) {
      this.close();
    }
  }

  set_active_pane(pane: ActivePane) {
    this.active_pane = pane;
  }

  set_secondary_note(note: OpenNoteState) {
    this.secondary_note = note;
  }

  clear_secondary_note() {
    this.secondary_note = null;
  }

  reset() {
    this.active = false;
    this.secondary_note = null;
    this.active_pane = "primary";
  }
}
