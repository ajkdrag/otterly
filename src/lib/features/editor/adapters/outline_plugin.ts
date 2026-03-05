import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { OutlineHeading } from "$lib/features/outline";

type OutlinePluginState = {
  headings: OutlineHeading[];
};

export const outline_plugin_key = new PluginKey<OutlinePluginState>("outline");

export function extract_headings(doc: ProseNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.level) {
      headings.push({
        id: `h-${String(pos)}`,
        level: node.attrs.level as number,
        text: node.textContent,
        pos,
      });
    }
  });

  return headings;
}

function headings_equal(
  a: OutlineHeading[],
  b: OutlineHeading[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ah = a[i];
    const bh = b[i];
    if (!ah || !bh) return false;
    if (ah.level !== bh.level || ah.text !== bh.text || ah.pos !== bh.pos) {
      return false;
    }
  }
  return true;
}

function create_outline_prose_plugin(): Plugin<OutlinePluginState> {
  return new Plugin<OutlinePluginState>({
    key: outline_plugin_key,
    state: {
      init(_config, state) {
        return { headings: extract_headings(state.doc) };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        if (!tr.docChanged) return plugin_state;

        const headings = extract_headings(new_state.doc);
        if (headings_equal(headings, plugin_state.headings)) {
          return plugin_state;
        }
        return { headings };
      },
    },
  });
}

export const outline_plugin = $prose(() => create_outline_prose_plugin());
