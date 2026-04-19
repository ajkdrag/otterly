import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  rootCtx,
} from "@milkdown/kit/core";
import {
  EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from "@milkdown/kit/prose/state";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import type {
  CodeBlockHeights,
  CursorInfo,
  EditorBufferViewState,
} from "$lib/shared/types/editor";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { create_link_tooltip_plugin } from "./link_tooltip_plugin";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listItemBlockComponent } from "@milkdown/kit/component/list-item-block";
import {
  imageBlockComponent,
  imageBlockConfig,
} from "@milkdown/kit/component/image-block";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import {
  cursor as cursor_plugin,
  dropCursorConfig,
} from "@milkdown/plugin-cursor";
import { prism } from "@milkdown/plugin-prism";
import { indent } from "@milkdown/plugin-indent";
import { ImageOff, LoaderCircle } from "lucide-static";
import type { BufferConfig, EditorPort } from "$lib/features/editor/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { as_asset_path } from "$lib/shared/types/ids";
import { resolve_relative_asset_path } from "$lib/features/note";
import {
  dirty_state_plugin,
  dirty_state_plugin_config_key,
  dirty_state_plugin_key,
} from "./dirty_state_plugin";
import { markdown_link_input_rule_plugin } from "./markdown_link_input_rule";
import { image_input_rule_plugin } from "./image_input_rule_plugin";
import { markdown_paste_plugin } from "./markdown_paste_plugin";
import { create_image_paste_plugin } from "./image_paste_plugin";
import {
  create_wiki_link_click_plugin,
  create_wiki_link_converter_plugin,
  wiki_link_plugin_key,
} from "./wiki_link_plugin";
import {
  set_wiki_suggestions,
  wiki_suggest_plugin,
  wiki_suggest_plugin_config_key,
  type WikiSuggestPluginConfig,
} from "./wiki_suggest_plugin";
import {
  create_editor_context_plugin,
  editor_context_plugin_key,
} from "./editor_context_plugin";
import {
  find_highlight_plugin,
  find_highlight_plugin_key,
} from "./find_highlight_plugin";
import {
  create_code_block_ui_plugin,
  read_code_block_heights,
  replace_code_block_heights,
} from "./code_block_ui_plugin";
import { leading_block_escape_plugin } from "./leading_block_escape_plugin";
import { slash_command_plugin } from "./slash_command_plugin";
import { error_message } from "$lib/shared/utils/error_message";
import { count_words } from "$lib/shared/utils/count_words";
import { create_logger } from "$lib/shared/utils/logger";
import { mark_boundary_escape_plugin } from "./mark_boundary_escape_plugin";

const log = create_logger("milkdown_adapter");

const cursor_plugins = cursor_plugin as unknown as Parameters<Editor["use"]>[0];
const drop_cursor_config = dropCursorConfig as unknown as {
  key: Parameters<Parameters<Editor["config"]>[0]>[0]["update"] extends (
    slice: infer T,
    updater: infer _U,
  ) => unknown
    ? T
    : never;
};

function create_svg_data_uri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PLACEHOLDER_IMAGE_WIDTH = 1200;
const PLACEHOLDER_IMAGE_HEIGHT = 675;

function create_icon_placeholder_data_uri(
  icon_svg: string,
  color: string,
): string {
  const svg = icon_svg
    .replace(/width="24"/, `width="${String(PLACEHOLDER_IMAGE_WIDTH)}"`)
    .replace(/height="24"/, `height="${String(PLACEHOLDER_IMAGE_HEIGHT)}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`);
  return create_svg_data_uri(svg);
}

const IMAGE_LOADING_PLACEHOLDER = create_icon_placeholder_data_uri(
  LoaderCircle,
  "#71717a",
);
const IMAGE_LOAD_ERROR_PLACEHOLDER = create_icon_placeholder_data_uri(
  ImageOff,
  "#b91c1c",
);

const LARGE_DOC_LINE_THRESHOLD = 8000;
const LARGE_DOC_CHAR_THRESHOLD = 400_000;

function count_lines(text: string): number {
  if (text === "") return 1;

  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

function is_large_markdown(text: string): boolean {
  if (text.length >= LARGE_DOC_CHAR_THRESHOLD) return true;
  return count_lines(text) >= LARGE_DOC_LINE_THRESHOLD;
}

function count_newlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

function doc_text(doc: ProseNode): string {
  return doc.textBetween(0, doc.content.size, "\n");
}

function count_doc_words(doc: ProseNode): number {
  return count_words(doc_text(doc).replaceAll("\n", " "));
}

function count_doc_lines(doc: ProseNode): number {
  return count_newlines(doc_text(doc)) + 1;
}

function line_from_pos(doc: ProseNode, pos: number): number {
  return count_newlines(doc.textBetween(0, pos, "\n")) + 1;
}

function calculate_cursor_info(view: EditorView): CursorInfo {
  const { doc, selection } = view.state;
  const $from = selection?.$from;
  const line = $from ? line_from_pos(doc, $from.pos) : 1;
  const column = $from ? $from.parentOffset + 1 : 1;
  const total_lines = count_doc_lines(doc);
  const total_words = count_doc_words(doc);
  return {
    line,
    column,
    total_lines,
    total_words,
    anchor: selection.anchor,
    head: selection.head,
  };
}

const cursor_plugin_key = new PluginKey("cursor-tracker");

function create_cursor_plugin(on_cursor_change: (info: CursorInfo) => void) {
  return $prose(
    () =>
      new Plugin({
        key: cursor_plugin_key,
        view: () => {
          let cached: CursorInfo = {
            line: 1,
            column: 1,
            total_lines: 1,
            total_words: 0,
          };
          let prev_doc: ProseNode | null = null;

          return {
            update: (view) => {
              const doc_changed = view.state.doc !== prev_doc;
              prev_doc = view.state.doc;

              if (doc_changed) {
                cached = calculate_cursor_info(view);
              } else {
                const { doc } = view.state;
                const $from = view.state.selection?.$from;
                cached = {
                  ...cached,
                  line: $from ? line_from_pos(doc, $from.pos) : 1,
                  column: $from ? $from.parentOffset + 1 : 1,
                  anchor: view.state.selection.anchor,
                  head: view.state.selection.head,
                };
              }

              on_cursor_change(cached);
            },
          };
        },
      }),
  );
}

type ResolveAssetUrlForVault = (
  vault_id: VaultId,
  asset_path: AssetPath,
) => string | Promise<string>;

function buffer_key(vault_id: VaultId | null, note_path: string): string {
  return `${vault_id ?? "__no_vault__"}::${note_path}`;
}

function same_buffer_identity(
  left: { vault_id: VaultId | null; note_path: string },
  right: { vault_id: VaultId | null; note_path: string },
): boolean {
  return left.vault_id === right.vault_id && left.note_path === right.note_path;
}

function apply_editor_selection(
  view: {
    state: EditorState;
    dispatch: (tr: EditorState["tr"]) => void;
  },
  cursor: CursorInfo | null,
): void {
  if (!cursor || cursor.anchor === undefined) {
    return;
  }

  const head = cursor.head ?? cursor.anchor;
  const max_position = view.state.doc.content.size;
  const safe_anchor = Math.min(Math.max(cursor.anchor, 0), max_position);
  const safe_head = Math.min(Math.max(head, 0), max_position);

  let selection;
  try {
    selection = TextSelection.create(view.state.doc, safe_anchor, safe_head);
  } catch {
    selection = Selection.near(view.state.doc.resolve(safe_head));
  }

  view.dispatch(view.state.tr.setSelection(selection));
}

function apply_editor_view_state(
  view: {
    state: EditorState;
    dispatch: (tr: EditorState["tr"]) => void;
  },
  view_state: EditorBufferViewState | null,
): CodeBlockHeights {
  const code_block_heights = view_state?.code_block_heights ?? [];
  replace_code_block_heights(view as EditorView, code_block_heights);
  apply_editor_selection(view, view_state?.cursor ?? null);
  return [...code_block_heights];
}

export function create_milkdown_editor_port(args?: {
  resolve_asset_url_for_vault?: ResolveAssetUrlForVault;
}): EditorPort {
  const resolve_asset_url_for_vault = args?.resolve_asset_url_for_vault ?? null;
  const is_missing_editor_view = (error: unknown): boolean =>
    error_message(error).includes('Context "editorView" not found');

  return {
    start_session: async (config) => {
      const { root, initial_markdown, note_path, vault_id, events } = config;
      const {
        on_markdown_change,
        on_dirty_state_change,
        on_cursor_change,
        on_code_block_heights_change,
        on_internal_link_click,
        on_external_link_click,
        on_image_paste_requested,
        on_wiki_suggest_query,
      } = events;

      let current_markdown = initial_markdown;
      let current_is_dirty = false;
      let editor: Editor | null = null;
      let is_large_note = is_large_markdown(initial_markdown);
      let current_note_path = note_path;
      let current_vault_id = vault_id;
      let current_code_block_heights: CodeBlockHeights = [];
      let rendered_note_path = note_path;
      let rendered_vault_id = vault_id;
      const resolved_url_cache = new Map<string, string>();
      const pending_resolutions = new Set<string>();

      type BufferEntry = {
        state: EditorState;
        note_path: string;
        markdown: string;
        is_dirty: boolean;
        code_block_heights: CodeBlockHeights;
      };

      const buffer_map = new Map<string, BufferEntry>();
      const buffer_height_map = new Map<string, CodeBlockHeights>();

      let wiki_suggest_config: WikiSuggestPluginConfig | null = null;

      function normalize_markdown(raw: string): string {
        return raw.includes("\u200B") ? raw.replaceAll("\u200B", "") : raw;
      }

      let builder = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initial_markdown);
          ctx.set(editorViewOptionsCtx, { editable: () => true });
        })

        .use(commonmark)
        .use(imageBlockComponent)
        .config((ctx) => {
          if (resolve_asset_url_for_vault) {
            const resolve = resolve_asset_url_for_vault;
            const update_image_height = (
              img: HTMLImageElement,
              ratio: number,
            ) => {
              const host = img.closest(".milkdown-image-block");
              if (!(host instanceof HTMLElement)) return;

              const max_width = host.getBoundingClientRect().width;
              if (!max_width) return;

              const natural_width = img.naturalWidth;
              const natural_height = img.naturalHeight;
              if (!natural_width || !natural_height) return;

              const transformed_height =
                natural_width < max_width
                  ? natural_height
                  : max_width * (natural_height / natural_width);
              const base_height = transformed_height.toFixed(2);
              const rendered_height = (transformed_height * ratio).toFixed(2);
              img.dataset.origin = base_height;
              img.dataset.height = rendered_height;
              img.style.height = `${rendered_height}px`;
            };
            const apply_resolved_url_to_rendered_nodes = (
              src: string,
              resolved_url: string,
            ) => {
              try {
                const view = ctx.get(editorViewCtx);
                view.state.doc.descendants((node, pos) => {
                  if (
                    node.type.name === "image-block" &&
                    node.attrs.src === src
                  ) {
                    const node_dom = view.nodeDOM(pos);
                    if (!(node_dom instanceof HTMLElement)) return;
                    const img = node_dom.querySelector("img");
                    if (!(img instanceof HTMLImageElement)) return;
                    const ratio =
                      typeof node.attrs.ratio === "number"
                        ? node.attrs.ratio
                        : 1;
                    const finalize_size = () => {
                      update_image_height(img, ratio);
                    };
                    if (img.src === resolved_url) {
                      if (img.complete && img.naturalWidth > 0) finalize_size();
                      return;
                    }
                    img.style.removeProperty("height");
                    delete img.dataset.origin;
                    delete img.dataset.height;
                    img.addEventListener("load", finalize_size, { once: true });
                    img.src = resolved_url;
                  }
                });
              } catch {
                return;
              }
            };
            const finalize_resolution = (src: string, resolved_url: string) => {
              resolved_url_cache.set(src, resolved_url);
              pending_resolutions.delete(src);
              apply_resolved_url_to_rendered_nodes(src, resolved_url);
            };

            ctx.update(imageBlockConfig.key, (default_config) => ({
              ...default_config,
              proxyDomURL: (url: string) => {
                if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;

                const cached = resolved_url_cache.get(url);
                if (cached) return cached;

                if (!current_vault_id) return url;

                const vault_relative = resolve_relative_asset_path(
                  current_note_path,
                  decodeURIComponent(url),
                );
                const result = resolve(
                  current_vault_id,
                  as_asset_path(vault_relative),
                );
                if (typeof result === "string") {
                  resolved_url_cache.set(url, result);
                  return result;
                }

                if (!pending_resolutions.has(url)) {
                  pending_resolutions.add(url);
                  void result
                    .then((resolved_url) => {
                      finalize_resolution(url, resolved_url);
                    })
                    .catch((error: unknown) => {
                      log.error("Failed to resolve asset URL for image block", {
                        error,
                      });
                      finalize_resolution(url, IMAGE_LOAD_ERROR_PLACEHOLDER);
                    });
                }

                return IMAGE_LOADING_PLACEHOLDER;
              },
            }));
          }
        })
        .config((ctx) => {
          ctx.update(drop_cursor_config.key, () => ({
            class: "crepe-drop-cursor",
            width: 4,
            color: false,
          }));
        })
        .use(gfm)
        .use(leading_block_escape_plugin)
        .use(cursor_plugins)
        .use(prism)
        .use(
          create_code_block_ui_plugin({
            get_initial_heights: () => current_code_block_heights,
            on_heights_change: (heights) => {
              current_code_block_heights = heights;
              if (rendered_note_path) {
                buffer_height_map.set(
                  buffer_key(rendered_vault_id, rendered_note_path),
                  [...heights],
                );
              }
              on_code_block_heights_change?.(heights);
            },
          }),
        )
        .use(indent)
        .use(create_link_tooltip_plugin())
        .use(listItemBlockComponent)
        .use(markdown_link_input_rule_plugin)
        .use(image_input_rule_plugin)
        .use(
          create_editor_context_plugin({
            note_path: current_note_path,
          }),
        )
        .use(create_wiki_link_converter_plugin())
        .use(slash_command_plugin)
        .use(mark_boundary_escape_plugin)
        .use(find_highlight_plugin)
        .use(listener)
        .use(history)
        .use(dirty_state_plugin_config_key)
        .use(dirty_state_plugin)
        .config((ctx) => {
          ctx.set(dirty_state_plugin_config_key.key, {
            on_dirty_state_change: (is_dirty) => {
              current_is_dirty = is_dirty;
              on_dirty_state_change(is_dirty);
            },
          });

          const listener_instance = ctx.get(listenerCtx);
          listener_instance.markdownUpdated((_ctx, markdown, prev_markdown) => {
            if (markdown === prev_markdown) return;

            const normalized = normalize_markdown(markdown);
            if (normalized === current_markdown) return;

            current_markdown = normalized;
            on_markdown_change(normalized);
          });
        });

      builder = builder.use(markdown_paste_plugin).use(clipboard);

      if (on_internal_link_click) {
        builder = builder.use(
          create_wiki_link_click_plugin({
            on_internal_link_click,
            on_external_link_click: on_external_link_click ?? (() => {}),
          }),
        );
      }

      if (on_cursor_change) {
        builder = builder.use(create_cursor_plugin(on_cursor_change));
      }

      if (on_image_paste_requested) {
        builder = builder.use(
          create_image_paste_plugin(on_image_paste_requested),
        );
      }

      if (on_wiki_suggest_query) {
        wiki_suggest_config = {
          on_query: on_wiki_suggest_query,
          on_dismiss: () => {},
          base_note_path: current_note_path,
        };
        builder = builder
          .use(wiki_suggest_plugin_config_key)
          .use(wiki_suggest_plugin)
          .config((ctx) => {
            if (!wiki_suggest_config) return;
            ctx.set(wiki_suggest_plugin_config_key.key, wiki_suggest_config);
          });
      }

      editor = await builder.create();

      const run_editor_action = (
        action: Parameters<NonNullable<typeof editor>["action"]>[0],
      ) => {
        if (!editor) return;
        const outcome = editor.action(action);
        void Promise.resolve(outcome).catch((error: unknown) => {
          if (is_missing_editor_view(error)) return;
          log.error("Editor action failed", { error });
        });
      };

      function get_buffer_entry_from_view_state(
        state: EditorState,
        current_buffer: {
          note_path: string;
          markdown: string;
          code_block_heights: CodeBlockHeights;
        },
      ): BufferEntry {
        const dirty_state = dirty_state_plugin_key.getState(state) as
          | { is_dirty?: boolean }
          | undefined;

        return {
          state,
          note_path: current_buffer.note_path,
          markdown: current_buffer.markdown,
          is_dirty: Boolean(dirty_state?.is_dirty ?? current_is_dirty),
          code_block_heights: [...current_buffer.code_block_heights],
        };
      }

      function sync_runtime_dirty_from_state(state: EditorState) {
        const dirty_state = dirty_state_plugin_key.getState(state) as
          | { is_dirty?: boolean }
          | undefined;
        current_is_dirty = Boolean(dirty_state?.is_dirty ?? false);
      }

      function save_current_buffer() {
        if (!rendered_note_path) return;
        const current_buffer_key = buffer_key(
          rendered_vault_id,
          rendered_note_path,
        );
        const current_buffer = {
          note_path: rendered_note_path,
          markdown: current_markdown,
          code_block_heights: [...current_code_block_heights],
        };
        buffer_height_map.set(current_buffer_key, [
          ...current_code_block_heights,
        ]);
        run_editor_action((ctx) => {
          const view = ctx.get(editorViewCtx);
          buffer_map.set(
            current_buffer_key,
            get_buffer_entry_from_view_state(view.state, current_buffer),
          );
        });
      }

      function dispatch_editor_context_update(view: {
        state: EditorState;
        dispatch: (tr: EditorState["tr"]) => void;
      }) {
        const context_tr = view.state.tr.setMeta(editor_context_plugin_key, {
          action: "update",
          note_path: current_note_path,
        });
        view.dispatch(context_tr);
      }

      function dispatch_full_scan(view: {
        state: EditorState;
        dispatch: (tr: EditorState["tr"]) => void;
      }) {
        const full_scan_tr = view.state.tr.setMeta(wiki_link_plugin_key, {
          action: "full_scan",
        });
        view.dispatch(full_scan_tr);
      }

      function dispatch_mark_clean(view: {
        state: EditorState;
        dispatch: (tr: EditorState["tr"]) => void;
      }) {
        const clean_tr = view.state.tr.setMeta(dirty_state_plugin_key, {
          action: "mark_clean",
        });
        view.dispatch(clean_tr);
      }

      if (!is_large_note) {
        run_editor_action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const tr = view.state.tr.setMeta(wiki_link_plugin_key, {
            action: "full_scan",
          });
          view.dispatch(tr);
        });
      }

      save_current_buffer();

      function mark_clean() {
        if (!editor) return;
        run_editor_action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const tr = view.state.tr;
          tr.setMeta(dirty_state_plugin_key, { action: "mark_clean" });
          view.dispatch(tr);
        });
      }

      return {
        destroy() {
          if (!editor) return;
          buffer_map.clear();
          void editor.destroy();
          editor = null;
        },
        set_markdown(markdown: string) {
          if (!editor) return;
          is_large_note = is_large_markdown(markdown);
          current_markdown = markdown;
          run_editor_action(replaceAll(markdown));
          if (!is_large_note) {
            run_editor_action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const tr = view.state.tr.setMeta(wiki_link_plugin_key, {
                action: "full_scan",
              });
              view.dispatch(tr);
            });
          }
          save_current_buffer();
        },
        get_markdown() {
          return current_markdown;
        },
        set_code_block_heights(heights: CodeBlockHeights) {
          if (!editor) return;
          current_code_block_heights = heights;
          if (current_note_path) {
            buffer_height_map.set(
              buffer_key(current_vault_id, current_note_path),
              [...heights],
            );
          }
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            replace_code_block_heights(view, heights);
          });
        },
        get_code_block_heights() {
          return [...current_code_block_heights];
        },
        restore_view_state(view_state: EditorBufferViewState | null) {
          if (!editor) return;
          current_code_block_heights = view_state?.code_block_heights
            ? [...view_state.code_block_heights]
            : [];
          if (current_note_path) {
            buffer_height_map.set(
              buffer_key(current_vault_id, current_note_path),
              [...current_code_block_heights],
            );
          }
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            current_code_block_heights = apply_editor_view_state(
              view,
              view_state,
            );
          });
        },
        insert_text_at_cursor(text: string) {
          if (!editor) return;
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            try {
              const parser = ctx.get(parserCtx);
              const doc = parser(text);
              const tr = state.tr.replaceSelection(
                new Slice(doc.content, 0, 0),
              );
              view.dispatch(tr);
              view.focus();
            } catch (error) {
              log.error("Failed to insert markdown at cursor", { error });
              const tr = state.tr.insertText(
                text,
                state.selection.from,
                state.selection.to,
              );
              view.dispatch(tr.scrollIntoView());
              view.focus();
            }
          });
        },
        set_selection(anchor: number, head: number) {
          if (!editor) return;
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            apply_editor_selection(view, {
              line: 1,
              column: 1,
              total_lines: 1,
              total_words: 0,
              anchor,
              head,
            });
            view.focus();
          });
        },
        mark_clean,
        is_dirty() {
          return current_is_dirty;
        },
        open_buffer(next_config: BufferConfig) {
          if (!editor) return;

          const restore_policy = next_config.restore_policy;
          const should_reuse_cache = restore_policy === "reuse_cache";
          const is_same_buffer = same_buffer_identity(
            {
              vault_id: current_vault_id,
              note_path: current_note_path,
            },
            {
              vault_id: next_config.vault_id,
              note_path: next_config.note_path,
            },
          );
          if (!is_same_buffer) {
            save_current_buffer();
            resolved_url_cache.clear();
            pending_resolutions.clear();
          }

          current_vault_id = next_config.vault_id;
          current_note_path = next_config.note_path;

          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const next_buffer_key = buffer_key(
              next_config.vault_id,
              next_config.note_path,
            );
            const cached_heights = buffer_height_map.get(next_buffer_key) ?? [];

            rendered_vault_id = next_config.vault_id;
            rendered_note_path = next_config.note_path;
            if (wiki_suggest_config) {
              wiki_suggest_config.base_note_path = next_config.note_path;
            }

            const saved_entry = should_reuse_cache
              ? buffer_map.get(next_buffer_key)
              : null;
            const restored_view_state = next_config.view_state;
            if (saved_entry) {
              view.updateState(saved_entry.state);
              current_markdown = saved_entry.markdown;
              is_large_note = is_large_markdown(current_markdown);
              current_code_block_heights = apply_editor_view_state(view, {
                cursor: restored_view_state?.cursor ?? null,
                code_block_heights:
                  restored_view_state?.code_block_heights ??
                  (cached_heights.length > 0
                    ? [...cached_heights]
                    : [...saved_entry.code_block_heights]),
              });
            } else {
              let parsed_doc: ProseNode;
              try {
                parsed_doc = parser(next_config.initial_markdown);
              } catch {
                parsed_doc =
                  view.state.schema.topNodeType.createAndFill() ??
                  view.state.doc;
              }

              const new_state = EditorState.create({
                schema: view.state.schema,
                doc: parsed_doc,
                plugins: view.state.plugins,
              });

              view.updateState(new_state);
              current_markdown = normalize_markdown(
                next_config.initial_markdown,
              );
              is_large_note = is_large_markdown(current_markdown);
              current_code_block_heights = apply_editor_view_state(view, {
                cursor: restored_view_state?.cursor ?? null,
                code_block_heights:
                  restored_view_state?.code_block_heights ??
                  (cached_heights.length === 0
                    ? read_code_block_heights(new_state)
                    : [...cached_heights]),
              });
            }

            dispatch_editor_context_update(view);

            if (
              (restore_policy === "fresh" || !saved_entry) &&
              !is_large_note
            ) {
              dispatch_full_scan(view);
              dispatch_mark_clean(view);
            }

            sync_runtime_dirty_from_state(view.state);

            buffer_map.set(
              next_buffer_key,
              get_buffer_entry_from_view_state(view.state, {
                note_path: current_note_path,
                markdown: current_markdown,
                code_block_heights: current_code_block_heights,
              }),
            );
          });

          on_markdown_change(current_markdown);
          on_dirty_state_change(current_is_dirty);
        },
        rename_buffer(old_note_path: string, new_note_path: string) {
          if (old_note_path === new_note_path) return;

          const old_buffer_key = buffer_key(current_vault_id, old_note_path);
          const new_buffer_key = buffer_key(current_vault_id, new_note_path);
          const entry = buffer_map.get(old_buffer_key);
          const heights = buffer_height_map.get(old_buffer_key);
          buffer_map.delete(old_buffer_key);
          buffer_height_map.delete(old_buffer_key);
          if (entry) {
            buffer_map.set(new_buffer_key, {
              ...entry,
              note_path: new_note_path,
            });
          }
          if (heights) {
            buffer_height_map.set(new_buffer_key, heights);
          }

          if (current_note_path !== old_note_path) return;
          current_note_path = new_note_path;
          rendered_note_path = new_note_path;
          if (wiki_suggest_config) {
            wiki_suggest_config.base_note_path = current_note_path;
          }

          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            dispatch_editor_context_update(view);
            buffer_map.set(
              buffer_key(current_vault_id, current_note_path),
              get_buffer_entry_from_view_state(view.state, {
                note_path: current_note_path,
                markdown: current_markdown,
                code_block_heights: current_code_block_heights,
              }),
            );
          });
        },
        close_buffer(note_path_to_close: string) {
          const target_buffer_key = buffer_key(
            current_vault_id,
            note_path_to_close,
          );
          buffer_map.delete(target_buffer_key);
          buffer_height_map.delete(target_buffer_key);
          if (current_note_path === note_path_to_close) {
            current_note_path = "";
          }
          if (rendered_note_path === note_path_to_close) {
            rendered_note_path = "";
          }
        },
        focus() {
          if (!editor) return;
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            view.focus();
          });
        },
        set_wiki_suggestions(
          items: Array<{
            title: string;
            path: string;
            kind: "existing" | "planned";
            ref_count?: number | undefined;
          }>,
        ) {
          if (!editor) return;
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            set_wiki_suggestions(view, items);
          });
        },
        update_find_state(query: string, selected_index: number) {
          if (!editor) return;
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const tr = view.state.tr.setMeta(find_highlight_plugin_key, {
              query,
              selected_index,
            });
            view.dispatch(tr);

            if (query) {
              const plugin_state = find_highlight_plugin_key.getState(
                view.state,
              );
              const positions = plugin_state?.match_positions;
              const match = positions?.[selected_index];
              if (match) {
                const dom = view.domAtPos(match.from);
                const node =
                  dom.node instanceof HTMLElement
                    ? dom.node
                    : dom.node.parentElement;
                node?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          });
        },
      };
    },
  };
}
