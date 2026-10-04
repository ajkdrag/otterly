import {
  forceParsing,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

const first_viewport_parse_budget = 100;

// The language worker waits for idle time. Publish visible syntax before the
// next paint when possible, then yield between retries for deeper jumps.
export const viewport_parsing = ViewPlugin.fromClass(
  class {
    queued = false;
    frame: number | null = null;
    destroyed = false;

    constructor(readonly view: EditorView) {
      this.schedule_parse();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.schedule_parse();
    }

    destroy() {
      this.destroyed = true;
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    }

    schedule_parse() {
      if (this.queued || this.frame !== null) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (!this.destroyed) this.parse_viewport(first_viewport_parse_budget);
      });
    }

    parse_viewport(budget: number) {
      const { state, viewport } = this.view;
      if (
        syntaxTree(state).length >= viewport.to &&
        syntaxTreeAvailable(state, viewport.to)
      )
        return;
      // Lezer checks this budget between parse steps. One very long Markdown
      // block can exceed it; this is cooperative scheduling, not a hard deadline.
      if (!forceParsing(this.view, viewport.to, budget) && !this.destroyed) {
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          if (!this.destroyed) this.parse_viewport(8);
        });
      }
    }
  },
);
