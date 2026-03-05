import { SvelteSet } from "svelte/reactivity";
import type { OutlineHeading } from "../types/outline";

export class OutlineStore {
  headings = $state<OutlineHeading[]>([]);
  active_heading_id = $state<string | null>(null);
  collapsed_ids = $state(new SvelteSet<string>());

  set_headings(headings: OutlineHeading[]) {
    this.headings = headings;

    const valid_ids = new Set(headings.map((h) => h.id));
    for (const id of this.collapsed_ids) {
      if (!valid_ids.has(id)) {
        this.collapsed_ids.delete(id);
      }
    }
  }

  set_active_heading(id: string | null) {
    this.active_heading_id = id;
  }

  toggle_collapsed(id: string) {
    if (this.collapsed_ids.has(id)) {
      this.collapsed_ids.delete(id);
    } else {
      this.collapsed_ids.add(id);
    }
  }

  clear() {
    this.headings = [];
    this.active_heading_id = null;
    this.collapsed_ids = new SvelteSet<string>();
  }
}
