import { $ctx, $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Fragment, type Node } from "@milkdown/kit/prose/model";

export type DirtyStateChangeCallback = (is_dirty: boolean) => void;

export const dirty_state_plugin_key = new PluginKey("MILKDOWN_DIRTY_STATE");

export type DirtyStatePluginConfig = {
  on_dirty_state_change: DirtyStateChangeCallback;
};

export const dirty_state_plugin_config_key = $ctx<
  DirtyStatePluginConfig,
  "dirty_state_plugin_config"
>(
  {
    on_dirty_state_change: () => {},
  } as DirtyStatePluginConfig,
  "dirty_state_plugin_config",
);

type PluginState = {
  saved_doc: Node;
  is_dirty: boolean;
};

type DirtyStateMeta = { action: "mark_clean"; saved_doc?: Node };

function is_mark_clean_action(value: unknown): value is DirtyStateMeta {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.action === "mark_clean";
}

function normalize_dirty_document(
  node: Node,
  cache: WeakMap<Node, Node | null>,
): Node | null {
  if (cache.has(node)) return cache.get(node) ?? null;
  let normalized: Node | null;
  if (node.isText) {
    const text = (node.text ?? "").replace(/\u200B/g, "");
    if (text === node.text) normalized = node;
    else if (text) normalized = node.type.schema.text(text, node.marks);
    else normalized = null;
  } else {
    const children: Node[] = [];
    let changed = node.type.name === "heading" && node.attrs.id !== "";
    node.forEach((child) => {
      const normalized_child = normalize_dirty_document(child, cache);
      if (normalized_child !== child) changed = true;
      if (normalized_child) children.push(normalized_child);
    });
    const attrs =
      node.type.name === "heading" ? { ...node.attrs, id: "" } : node.attrs;
    normalized = changed
      ? node.type.create(attrs, Fragment.from(children), node.marks)
      : node;
  }
  cache.set(node, normalized);
  return normalized;
}

export const dirty_state_plugin = $prose((ctx) => {
  const config = ctx.get(dirty_state_plugin_config_key.key);
  // Heading IDs and the wiki-link cursor sentinel are not stored in Markdown.
  // ProseMirror shares unchanged nodes, so subsequent edits normalize only changed branches.
  const normalized_documents = new WeakMap<Node, Node | null>();

  return new Plugin<PluginState>({
    key: dirty_state_plugin_key,
    state: {
      init(_config, state) {
        return {
          saved_doc: state.doc,
          is_dirty: false,
        };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        const meta: unknown = tr.getMeta(dirty_state_plugin_key);
        if (!tr.docChanged && !is_mark_clean_action(meta)) return plugin_state;

        const saved_doc = is_mark_clean_action(meta)
          ? (meta.saved_doc ?? new_state.doc)
          : plugin_state.saved_doc;
        let is_dirty = !new_state.doc.eq(saved_doc);
        if (is_dirty) {
          const current = normalize_dirty_document(
            new_state.doc,
            normalized_documents,
          );
          const saved = normalize_dirty_document(
            saved_doc,
            normalized_documents,
          );
          is_dirty = current && saved ? !current.eq(saved) : current !== saved;
        }
        if (is_dirty !== plugin_state.is_dirty) {
          config.on_dirty_state_change(is_dirty);
        }
        return { saved_doc, is_dirty };
      },
    },
  });
});
