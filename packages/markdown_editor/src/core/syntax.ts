import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  ensureSyntaxTree,
  forceParsing,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import type { Tree } from "@lezer/common";
import type { MarkdownConfig } from "@lezer/markdown";
import {
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { MarkdownPlugin } from "./plugin.js";

// Measured with @lezer/markdown 1.7 (GFM): a 1.4 MB note of normal paragraphs
// parses in about 90 ms, and a one-character edit reparses in about 1 ms. One
// giant paragraph is superlinear (1.4 MB takes 1.5 s) and Lezer cannot stop
// inside a block, so the time budget does not help there. These limits keep
// the synchronous path well under a frame budget on open.
const full_parse_max_length = 1_000_000;
const full_parse_max_block_length = 200_000;
const full_parse_budget_ms = 150;
// Rescanning block lengths costs a pass over the document. Only a large paste
// can create a giant block in one step, so smaller edits keep the old answer.
const policy_rescan_insert_length = 50_000;

export function markdown_syntax(plugins: readonly MarkdownPlugin[]): Extension {
  const extensions: MarkdownConfig[] = [];
  for (const plugin of plugins) {
    if (!plugin.syntax) continue;
    if (Array.isArray(plugin.syntax))
      extensions.push(...(plugin.syntax as readonly MarkdownConfig[]));
    else extensions.push(plugin.syntax as MarkdownConfig);
  }
  return [
    markdown({
      base: markdownLanguage,
      addKeymap: false,
      extensions,
      completeHTMLTags: false,
      pasteURLAsLink: false,
    }),
    full_parse_policy,
    viewport_parsing,
  ];
}

// Block widgets must not depend on parse progress, so the block field asks for
// the complete tree. Returns null when the document is too large to parse
// synchronously. Callers then use the partial tree and wait for it to grow.
export function complete_tree(state: EditorState): Tree | null {
  const tree = syntaxTree(state);
  if (syntaxTreeAvailable(state, state.doc.length)) return tree;
  if (!state.field(full_parse_policy, false)) return null;
  return ensureSyntaxTree(state, state.doc.length, full_parse_budget_ms);
}

const full_parse_policy = StateField.define<boolean>({
  create: (state) => can_parse_synchronously(state.doc),
  update(allowed, transaction) {
    if (!transaction.docChanged) return allowed;
    if (transaction.newDoc.length > full_parse_max_length) return false;
    let large_insert = false;
    transaction.changes.iterChanges((_from, _to, _from_b, _to_b, inserted) => {
      if (inserted.length > policy_rescan_insert_length) large_insert = true;
    });
    if (
      large_insert ||
      (!allowed && transaction.startState.doc.length > full_parse_max_length)
    )
      return can_parse_synchronously(transaction.newDoc);
    return allowed;
  },
});

function can_parse_synchronously(document: Text): boolean {
  if (document.length > full_parse_max_length) return false;
  // A blank line ends a paragraph. Scan for the longest run without one.
  let block_start = 0;
  let position = 0;
  for (const line of document.iterLines()) {
    if (line.trim() === "") block_start = position + line.length + 1;
    else if (position + line.length - block_start > full_parse_max_block_length)
      return false;
    position += line.length + 1;
  }
  return true;
}

const first_viewport_parse_budget_ms = 100;
const later_viewport_parse_budget_ms = 8;

// CodeMirror's parse worker waits for idle time. Publish the visible syntax
// before the next paint when possible, then keep yielding between frames for
// a deep jump into an unparsed region.
const viewport_parsing = ViewPlugin.fromClass(
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
        if (!this.destroyed)
          this.parse_viewport(first_viewport_parse_budget_ms);
      });
    }

    parse_viewport(budget: number) {
      const { state, viewport } = this.view;
      if (syntaxTreeAvailable(state, viewport.to)) return;
      if (!forceParsing(this.view, viewport.to, budget) && !this.destroyed) {
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          if (!this.destroyed)
            this.parse_viewport(later_viewport_parse_budget_ms);
        });
      }
    }
  },
);
