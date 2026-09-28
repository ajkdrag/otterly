import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  rootCtx,
  serializerCtx,
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
  CodeBlockViewStates,
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
import {
  codeBlockComponent,
  codeBlockConfig,
} from "@milkdown/kit/component/code-block";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import {
  HighlightStyle,
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorView as CodeMirrorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import {
  cursor as cursor_plugin,
  dropCursorConfig,
} from "@milkdown/plugin-cursor";
import { indent } from "@milkdown/plugin-indent";
import {
  ChevronDown,
  Copy,
  ImageOff,
  LoaderCircle,
  Search,
  X,
} from "lucide-static";
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
  read_code_block_view_states,
  replace_code_block_view_states,
} from "./code_block_ui_plugin";
import { leading_block_escape_plugin } from "./leading_block_escape_plugin";
import { slash_command_plugin } from "./slash_command_plugin";
import { error_message } from "$lib/shared/utils/error_message";
import { count_words } from "$lib/shared/utils/count_words";
import { create_logger } from "$lib/shared/utils/logger";
import { mark_boundary_escape_plugin } from "./mark_boundary_escape_plugin";
import { create_markdown_sync_plugin } from "./markdown_sync_plugin";
import { task_list_enter_plugin } from "./task_list_enter_plugin";
import { render_mermaid_preview } from "./mermaid_preview";

const log = create_logger("milkdown_adapter");
const plain_text_support = new LanguageSupport(
  StreamLanguage.define({
    token(stream) {
      stream.skipToEnd();
      return null;
    },
  }),
);
const plain_language = LanguageDescription.of({
  name: "",
  alias: ["plain", "text"],
  support: plain_text_support,
});
// language-data has no mermaid grammar, so it highlights as plain text. The
// picker writes the name into the fence, and renderers expect lowercase.
const mermaid_language = LanguageDescription.of({
  name: "mermaid",
  support: plain_text_support,
});
const code_languages = [plain_language, mermaid_language, ...languages];

function render_code_language(language: string): string {
  if (!language) return "Plain";
  const match = LanguageDescription.matchLanguageName(
    code_languages,
    language,
    false,
  );
  if (match === mermaid_language) return "Mermaid";
  return match ? match.name || "Plain" : language;
}

const code_block_theme = CodeMirrorView.theme({
  "&": {
    backgroundColor: "var(--editor-code-bg)",
    color: "var(--editor-code-block-text)",
    fontFamily: "var(--font-mono)",
    fontSize: "calc(0.8125rem * var(--editor-zoom))",
  },
  ".cm-content": {
    padding: "0.75rem 0",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg)",
  },
});

const code_block_highlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.punctuation, color: "var(--syntax-punctuation)" },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syntax-property)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--syntax-string)",
  },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.variableName, color: "var(--syntax-variable)" },
  { tag: tags.className, color: "var(--syntax-class)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.bool, color: "var(--syntax-boolean)" },
  { tag: tags.tagName, color: "var(--syntax-tag)" },
  { tag: tags.regexp, color: "var(--syntax-regex)" },
]);

const is_editor_performance_enabled =
  import.meta.env.DEV && import.meta.env.MODE !== "test";

type EditorPerformanceCase = "empty" | "initial" | "restore";

function report_editor_operation(input: {
  operation: "start_session" | "open_buffer";
  started_at: number | null;
  char_count: number;
  cache_reuse: boolean;
  content_case: EditorPerformanceCase;
  phase_ms?: Record<string, number>;
}) {
  const started_at = input.started_at;
  if (!is_editor_performance_enabled || started_at === null) return;

  const work_ms = performance.now() - started_at;
  const metadata = {
    operation: input.operation,
    char_count: input.char_count,
    cache_reuse: input.cache_reuse,
    content_case: input.content_case,
    work_ms,
    ...input.phase_ms,
  };

  requestAnimationFrame((frame_time) => {
    log.debug("Editor operation timing", {
      ...metadata,
      frame_ms: frame_time - started_at,
    });
  });
}

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
): CodeBlockViewStates {
  const code_block_view_states = view_state?.code_block_view_states ?? [];
  replace_code_block_view_states(view as EditorView, code_block_view_states);
  apply_editor_selection(view, view_state?.cursor ?? null);
  return [...code_block_view_states];
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
      const started_at = is_editor_performance_enabled
        ? performance.now()
        : null;
      const {
        on_markdown_change,
        on_dirty_state_change,
        on_cursor_change,
        on_code_block_view_states_change,
        on_internal_link_click,
        on_external_link_click,
        on_image_paste_requested,
        on_wiki_suggest_query,
      } = events;

      let current_markdown = initial_markdown;
      let current_is_dirty = false;
      let is_initializing = true;
      let editor: Editor | null = null;
      let is_large_note = is_large_markdown(initial_markdown);
      let current_note_path = note_path;
      let current_vault_id = vault_id;
      let current_code_block_view_states: CodeBlockViewStates = [];
      let serialized_doc: ProseNode | null = null;
      let rendered_note_path = note_path;
      let rendered_vault_id = vault_id;
      const resolved_url_cache = new Map<string, string>();
      const pending_resolutions = new Set<string>();

      type BufferEntry = {
        state: EditorState;
        note_path: string;
        markdown: string;
        is_dirty: boolean;
        pending_saved_doc?: ProseNode;
        code_block_view_states: CodeBlockViewStates;
      };

      const buffer_map = new Map<string, BufferEntry>();
      const buffer_view_state_map = new Map<string, CodeBlockViewStates>();

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
          ctx.update(codeBlockConfig.key, (config) => ({
            ...config,
            languages: code_languages,
            extensions: [
              keymap.of([...defaultKeymap, indentWithTab]),
              code_block_theme,
              syntaxHighlighting(code_block_highlight),
            ],
            renderLanguage: render_code_language,
            copyText: "Copy",
            copyIcon: Copy,
            expandIcon: ChevronDown,
            searchIcon: Search,
            clearSearchIcon: X,
            renderPreview: render_mermaid_preview,
            // code_block_ui_plugin owns hiding the source, and persists it.
            // Milkdown's own preview-only mode resets when a block remounts.
            previewOnlyByDefault: false,
            previewLoading: LoaderCircle,
          }));
        })
        .use(task_list_enter_plugin)
        .use(gfm)
        .use(leading_block_escape_plugin)
        .use(cursor_plugins)
        .use(codeBlockComponent)
        .use(
          create_code_block_ui_plugin({
            get_initial_view_states: () => current_code_block_view_states,
            on_view_states_change: (view_states) => {
              current_code_block_view_states = view_states;
              if (rendered_note_path) {
                buffer_view_state_map.set(
                  buffer_key(rendered_vault_id, rendered_note_path),
                  [...view_states],
                );
              }
              on_code_block_view_states_change?.(view_states);
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
        .use(
          create_markdown_sync_plugin(() => {
            if (editor) on_markdown_change(get_current_markdown());
          }),
        )
        .use(history)
        .use(dirty_state_plugin_config_key)
        .use(dirty_state_plugin)
        .config((ctx) => {
          ctx.set(dirty_state_plugin_config_key.key, {
            on_dirty_state_change: (is_dirty) => {
              current_is_dirty = is_dirty;
              if (!is_initializing) on_dirty_state_change(is_dirty);
            },
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
      serialized_doc = editor.ctx.get(editorViewCtx).state.doc;

      function get_current_markdown(): string {
        if (!editor) return current_markdown;
        const doc = editor.ctx.get(editorViewCtx).state.doc;
        if (doc !== serialized_doc) {
          current_markdown = normalize_markdown(
            editor.ctx.get(serializerCtx)(doc),
          );
          serialized_doc = doc;
        }
        return current_markdown;
      }

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
          code_block_view_states: CodeBlockViewStates;
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
          code_block_view_states: [...current_buffer.code_block_view_states],
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
          markdown: get_current_markdown(),
          code_block_view_states: [...current_code_block_view_states],
        };
        buffer_view_state_map.set(current_buffer_key, [
          ...current_code_block_view_states,
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

      function dispatch_mark_clean(
        view: {
          state: EditorState;
          dispatch: (tr: EditorState["tr"]) => void;
        },
        saved_doc?: ProseNode,
      ) {
        const clean_tr = view.state.tr.setMeta(dirty_state_plugin_key, {
          action: "mark_clean",
          saved_doc,
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

      // Milkdown assigns heading IDs during view setup, after plugin state initialization.
      dispatch_mark_clean(editor.ctx.get(editorViewCtx));
      serialized_doc = editor.ctx.get(editorViewCtx).state.doc;
      is_initializing = false;
      save_current_buffer();
      report_editor_operation({
        operation: "start_session",
        started_at,
        char_count: initial_markdown.length,
        cache_reuse: false,
        content_case: initial_markdown.length === 0 ? "empty" : "initial",
      });

      function mark_clean(
        note_path = current_note_path,
        saved_markdown?: string,
      ) {
        if (!editor) return;
        const parser = editor.ctx.get(parserCtx);
        if (note_path !== current_note_path) {
          const entry = buffer_map.get(buffer_key(current_vault_id, note_path));
          if (!entry || saved_markdown === undefined) return;
          const saved_doc =
            entry.markdown === saved_markdown
              ? entry.state.doc
              : parser(saved_markdown);
          // Applying an inactive state would send its dirty callback to the active note.
          entry.pending_saved_doc = saved_doc;
          entry.is_dirty = !entry.state.doc.eq(saved_doc);
          return;
        }
        const view = editor.ctx.get(editorViewCtx);
        const saved_doc =
          saved_markdown === undefined ||
          get_current_markdown() === saved_markdown
            ? view.state.doc
            : parser(saved_markdown);
        dispatch_mark_clean(view, saved_doc);
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
          serialized_doc = editor.ctx.get(editorViewCtx).state.doc;
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
        get_markdown: get_current_markdown,
        set_code_block_view_states(view_states: CodeBlockViewStates) {
          if (!editor) return;
          current_code_block_view_states = view_states;
          if (current_note_path) {
            buffer_view_state_map.set(
              buffer_key(current_vault_id, current_note_path),
              [...view_states],
            );
          }
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            replace_code_block_view_states(view, view_states);
          });
        },
        get_code_block_view_states() {
          return [...current_code_block_view_states];
        },
        restore_view_state(view_state: EditorBufferViewState | null) {
          if (!editor) return;
          current_code_block_view_states = view_state?.code_block_view_states
            ? [...view_state.code_block_view_states]
            : [];
          if (current_note_path) {
            buffer_view_state_map.set(
              buffer_key(current_vault_id, current_note_path),
              [...current_code_block_view_states],
            );
          }
          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            current_code_block_view_states = apply_editor_view_state(
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
          const started_at = is_editor_performance_enabled
            ? performance.now()
            : null;
          const phase_ms: Record<string, number> = {};
          const time_phase = <T>(name: string, run: () => T): T => {
            if (started_at === null) return run();
            const phase_started_at = performance.now();
            try {
              return run();
            } finally {
              phase_ms[name] = performance.now() - phase_started_at;
            }
          };

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
            time_phase("save_ms", save_current_buffer);
            resolved_url_cache.clear();
            pending_resolutions.clear();
          }

          let cache_reuse = false;
          current_vault_id = next_config.vault_id;
          current_note_path = next_config.note_path;

          run_editor_action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const next_buffer_key = buffer_key(
              next_config.vault_id,
              next_config.note_path,
            );
            const cached_view_states =
              buffer_view_state_map.get(next_buffer_key) ?? [];

            rendered_vault_id = next_config.vault_id;
            rendered_note_path = next_config.note_path;
            if (wiki_suggest_config) {
              wiki_suggest_config.base_note_path = next_config.note_path;
            }

            const saved_entry = should_reuse_cache
              ? buffer_map.get(next_buffer_key)
              : null;
            cache_reuse = Boolean(saved_entry);
            const restored_view_state = next_config.view_state;
            if (saved_entry) {
              time_phase("view_ms", () => {
                view.updateState(saved_entry.state);
              });
              current_markdown = saved_entry.markdown;
              is_large_note = is_large_markdown(current_markdown);
              current_code_block_view_states = time_phase("apply_view_ms", () =>
                apply_editor_view_state(view, {
                  cursor: restored_view_state?.cursor ?? null,
                  code_block_view_states:
                    restored_view_state?.code_block_view_states ??
                    (cached_view_states.length > 0
                      ? [...cached_view_states]
                      : [...saved_entry.code_block_view_states]),
                }),
              );
            } else {
              let parsed_doc: ProseNode;
              try {
                parsed_doc = time_phase("parse_ms", () =>
                  parser(next_config.initial_markdown),
                );
              } catch {
                parsed_doc =
                  view.state.schema.topNodeType.createAndFill() ??
                  view.state.doc;
              }

              const new_state = time_phase("state_ms", () =>
                EditorState.create({
                  schema: view.state.schema,
                  doc: parsed_doc,
                  plugins: view.state.plugins,
                }),
              );

              time_phase("view_ms", () => {
                view.updateState(new_state);
              });
              current_markdown = normalize_markdown(
                next_config.initial_markdown,
              );
              is_large_note = is_large_markdown(current_markdown);
              current_code_block_view_states = time_phase("apply_view_ms", () =>
                apply_editor_view_state(view, {
                  cursor: restored_view_state?.cursor ?? null,
                  code_block_view_states:
                    restored_view_state?.code_block_view_states ??
                    (cached_view_states.length === 0
                      ? read_code_block_view_states(new_state)
                      : [...cached_view_states]),
                }),
              );
            }

            time_phase("dispatch_ms", () => {
              dispatch_editor_context_update(view);

              if (restore_policy === "fresh" || !saved_entry) {
                if (!is_large_note) dispatch_full_scan(view);
                dispatch_mark_clean(view);
              }

              // Restore an inactive save's baseline only after this buffer owns callbacks.
              if (saved_entry?.pending_saved_doc) {
                dispatch_mark_clean(view, saved_entry.pending_saved_doc);
              }
            });
            serialized_doc = view.state.doc;
            sync_runtime_dirty_from_state(view.state);

            buffer_map.set(
              next_buffer_key,
              get_buffer_entry_from_view_state(view.state, {
                note_path: current_note_path,
                markdown: current_markdown,
                code_block_view_states: current_code_block_view_states,
              }),
            );
          });

          time_phase("callbacks_ms", () => {
            on_markdown_change(current_markdown);
            on_dirty_state_change(current_is_dirty);
          });
          const char_count = current_markdown.length;
          let content_case: EditorPerformanceCase = "initial";
          if (cache_reuse) content_case = "restore";
          if (char_count === 0) content_case = "empty";
          report_editor_operation({
            operation: "open_buffer",
            started_at,
            char_count,
            cache_reuse,
            content_case,
            phase_ms,
          });
        },
        rename_buffer(old_note_path: string, new_note_path: string) {
          if (old_note_path === new_note_path) return;

          const old_buffer_key = buffer_key(current_vault_id, old_note_path);
          const new_buffer_key = buffer_key(current_vault_id, new_note_path);
          const entry = buffer_map.get(old_buffer_key);
          const view_states = buffer_view_state_map.get(old_buffer_key);
          buffer_map.delete(old_buffer_key);
          buffer_view_state_map.delete(old_buffer_key);
          if (entry) {
            buffer_map.set(new_buffer_key, {
              ...entry,
              note_path: new_note_path,
            });
          }
          if (view_states) {
            buffer_view_state_map.set(new_buffer_key, view_states);
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
                code_block_view_states: current_code_block_view_states,
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
          buffer_view_state_map.delete(target_buffer_key);
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
