import {
  Compartment,
  EditorSelection,
  Text,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LanguageDescription,
  ensureSyntaxTree,
  forceParsing,
  syntaxHighlighting,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import {
  callouts,
  clipboard,
  code_blocks,
  commonmark,
  create_markdown_state,
  create_text_state,
  find,
  focus_selection,
  frontmatter,
  get_markdown_source,
  get_editor_mode,
  get_markdown_source_document,
  gfm,
  images,
  insert_markdown_source,
  links,
  read_code_block_view_states,
  refresh_code_diagrams,
  set_editor_mode,
  set_code_block_view_states as code_block_view_states_effect,
  slash_menu,
  update_find_query,
  close_vim_prompt,
  sync_clipboard_from_host,
  vim_keybindings,
  wiki_links,
  type CodeBlockViewState,
  type MarkdownPlugin,
  type WikiSuggestion,
} from "@otterly/markdown-editor";
import type { EditorPort, EditorSession, BufferConfig } from "../ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { as_asset_path } from "$lib/shared/types/ids";
import type {
  CursorInfo,
  EditorBufferViewState,
  EditorViewMode,
  CodeBlockViewStates,
} from "$lib/shared/types/editor";
import { resolve_relative_asset_path } from "$lib/features/note";
import { count_words } from "$lib/shared/utils/count_words";
import { is_markdown_path } from "$lib/shared/utils/path";
import { create_logger } from "$lib/shared/utils/logger";
import { is_external_url, parse_internal_href } from "../domain/link_target";
import {
  code_languages,
  code_block_theme,
  code_block_highlight,
  markdown_source_highlight,
} from "./code_editor_config";
import { render_mermaid_element } from "./mermaid_preview";
import { clipboard_html_to_markdown } from "./html_clipboard";

type AdapterOptions = {
  resolve_asset_url_for_vault: (
    vault_id: VaultId,
    path: AssetPath,
  ) => string | Promise<string>;
  copy_text: (text: string) => Promise<void>;
  // Vim's "+p and set clipboard=unnamed read through this. It reads natively,
  // because the web clipboard shows a Paste button for text from other apps.
  read_clipboard_text: () => Promise<string>;
  // Outside a vault (a document window), relative images resolve here.
  resolve_document_asset_url?: (relative_path: string) => string;
};
type BufferEntry = {
  note_path: string;
  vault_id: VaultId | null;
  // Markdown notes have a rich and a source view. Other files are text.
  is_markdown: boolean;
  state: EditorState;
  baseline: Text;
  words: number;
  counted_document: Text | null;
};
const log = create_logger("codemirror_adapter");
// Holds the grammar of a text file. It loads after the buffer opens.
const text_language = new Compartment();
// CodeMirror re-reads line height and character width only when it thinks
// they could have changed, such as on a theme change. Zoom and width are CSS
// variables it cannot see, so we swap between two empty themes to say so.
// requestMeasure alone is not enough: a short note fills the window at every
// zoom, so no box changes size and the old metrics stay.
const metrics_compartment = new Compartment();
const metrics_themes = [
  EditorView.theme({ "&": { "--editor-metrics": "0" } }),
  EditorView.theme({ "&": { "--editor-metrics": "1" } }),
];
// Holds the Vim extension while Vim mode is on. A compartment, so the toggle
// keeps every cached buffer state and its undo history.
const vim_compartment = new Compartment();
const synchronous_word_count_limit = 50_000;
const default_code_view: CodeBlockViewState = {
  source_height: null,
  diagram_height: null,
  source_hidden: false,
  diagram_zoom: 1,
};

export function create_codemirror_editor_port(
  options: AdapterOptions,
): EditorPort {
  // The code block copy button and Copy link write the clipboard behind Vim's
  // back. Under set clipboard=unnamed the next p would put an older register,
  // so pull the copied text into it.
  const copy_text_and_sync_vim = async (text: string) => {
    await options.copy_text(text);
    await sync_clipboard_from_host().catch(() => {});
  };
  return {
    start_session(config) {
      const { root, events } = config;
      const buffers = new Map<string, BufferEntry>();
      let destroyed = false;
      let notify_timer: ReturnType<typeof setTimeout> | null = null;
      let word_count_timer: ReturnType<typeof setTimeout> | null = null;
      let word_count_idle_id: number | null = null;
      let word_count_generation = 0;
      let pending_wiki: ((items: readonly WikiSuggestion[]) => void) | null =
        null;
      let reported_dirty = false;
      let current: BufferEntry;
      const old_height = root.style.height;
      const old_min_height = root.style.minHeight;
      root.style.height = "100%";
      root.style.minHeight = "0";
      const open_link = (target: string) => {
        if (is_external_url(target)) {
          events.on_external_link_click?.(target);
          return;
        }
        const link = parse_internal_href(target);
        if (!link) return;
        if (link.kind === "file")
          events.on_file_link_click?.(
            resolve_relative_asset_path(current.note_path, link.path),
          );
        else events.on_internal_link_click?.(link.path, current.note_path);
      };
      const plugins: MarkdownPlugin[] = [
        commonmark(),
        gfm(),
        frontmatter(),
        callouts(),
        code_blocks({
          languages: code_languages,
          copy_code: copy_text_and_sync_vim,
          code_extensions: [
            code_block_theme,
            syntaxHighlighting(code_block_highlight),
          ],
          diagram_languages: ["mermaid"],
          render_diagram: ({ content, signal }) =>
            render_mermaid_element(content, signal),
          on_view_states_change: (states) =>
            events.on_code_block_view_states_change?.([...states]),
        }),
        links({
          open_link,
          copy_link: copy_text_and_sync_vim,
          edit_key: "Alt-Enter",
        }),
        images({
          resolve_image(source, signal) {
            if (signal.aborted) return "";
            if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return source;
            if (!current.vault_id) {
              return options.resolve_document_asset_url
                ? options.resolve_document_asset_url(decode_asset_path(source))
                : source;
            }
            const path = resolve_relative_asset_path(
              current.note_path,
              decode_asset_path(source),
            );
            return options.resolve_asset_url_for_vault(
              current.vault_id,
              as_asset_path(path),
            );
          },
        }),
        wiki_links({
          query_wiki_links(query, signal) {
            pending_wiki?.([]);
            if (!events.on_wiki_suggest_query || signal.aborted)
              return Promise.resolve([]);
            return new Promise((resolve) => {
              const finish = (items: readonly WikiSuggestion[]) => {
                signal.removeEventListener("abort", cancel);
                if (pending_wiki === finish) pending_wiki = null;
                resolve(items);
              };
              const cancel = () => {
                finish([]);
              };
              pending_wiki = finish;
              signal.addEventListener("abort", cancel, { once: true });
              events.on_wiki_suggest_query?.(query);
            });
          },
        }),
        slash_menu(),
        find(),
        clipboard({
          html_to_markdown: clipboard_html_to_markdown,
          on_image_paste(file) {
            const buffer = current;
            void file
              .arrayBuffer()
              .then((data) => {
                if (destroyed || current !== buffer) return;
                events.on_image_paste_requested?.({
                  bytes: new Uint8Array(data),
                  mime_type: file.type,
                  file_name: file.name || null,
                });
              })
              .catch((error: unknown) => {
                log.error("Could not read pasted image", { error });
              });
          },
        }),
      ];
      let metrics_theme_index = 0;
      let vim_enabled = config.vim_enabled;
      // One value per session, so sync_vim_compartment can tell whether a
      // state already holds it.
      const { on_save_request, on_close_request } = events;
      const vim_extension = vim_keybindings({
        on_status_change: (status) => events.on_vim_status_change?.(status),
        // Without these, :w and :q tell the user they do nothing here.
        ...(on_save_request && { on_write: on_save_request }),
        ...(on_close_request && { on_quit: on_close_request }),
        clipboard: {
          read_text: options.read_clipboard_text,
          write_text: options.copy_text,
        },
      });
      const extensions: Extension = [
        metrics_compartment.of(metrics_themes[0] ?? []),
        // CodeMirror catches exceptions from plugins, listeners, and widgets
        // and only prints them to the console. Send them to the app log.
        EditorView.exceptionSink.of((exception: unknown) => {
          log.error("Editor exception", {
            error: exception,
            stack: exception instanceof Error ? exception.stack : undefined,
          });
        }),
        EditorView.updateListener.of((update) => {
          current.state = update.state;
          if (update.docChanged) {
            cancel_word_count();
            publish_dirty();
            if (notify_timer) clearTimeout(notify_timer);
            const buffer = current;
            notify_timer = setTimeout(() => {
              notify_timer = null;
              if (destroyed || current !== buffer) return;
              refresh_word_count();
              events.on_markdown_change(get_markdown_source(update.view.state));
              publish_cursor();
            }, 200);
          }
          if (update.docChanged || update.selectionSet) publish_cursor();
        }),
      ];

      current = create_buffer(config);
      const view = new EditorView({ parent: root, state: current.state });
      // Mermaid embeds its colors in the SVG. Cached buffers render again when
      // mounted; the active view needs an explicit refresh when the theme flips.
      // Zoom and width are CSS variables on the root's style. See
      // metrics_compartment.
      const root_observer = new MutationObserver((records) => {
        if (destroyed) return;
        const scheme = document.documentElement.dataset.colorScheme ?? null;
        if (records.some((record) => record.attributeName === "style")) {
          metrics_theme_index = 1 - metrics_theme_index;
          view.dispatch({
            effects: metrics_compartment.reconfigure(
              metrics_themes[metrics_theme_index] ?? [],
            ),
          });
        }
        if (
          records.some(
            (record) =>
              record.attributeName === "data-color-scheme" &&
              record.oldValue !== scheme,
          )
        )
          view.dispatch({ effects: refresh_code_diagrams.of(null) });
      });
      root_observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-scheme", "style"],
        attributeOldValue: true,
      });
      refresh_word_count();
      publish_cursor();
      publish_view_mode();
      // With Vim on, its plugin already reported the status.
      if (!vim_enabled) events.on_vim_status_change?.(null);

      return Promise.resolve<EditorSession>({
        destroy() {
          if (destroyed) return;
          destroyed = true;
          root_observer.disconnect();
          cancel_pending();
          cancel_word_count();
          view.destroy();
          buffers.clear();
          root.style.height = old_height;
          root.style.minHeight = old_min_height;
        },
        get_markdown: () => get_markdown_source(view.state),
        set_markdown(markdown) {
          view.dispatch({
            selection: EditorSelection.single(0, view.state.doc.length),
          });
          insert_markdown_source(view, markdown);
        },
        insert_text_at_cursor(text) {
          insert_markdown_source(view, text);
          focus_editor();
        },
        set_selection(anchor, head) {
          set_selection(anchor, head);
          focus_editor();
        },
        restore_cursor,
        get_scroll_top: () => view.scrollDOM.scrollTop,
        set_scroll_top(value) {
          view.scrollDOM.scrollTop = value;
        },
        get_code_block_view_states: () => [
          ...read_code_block_view_states(view.state),
        ],
        set_code_block_view_states,
        restore_view_state,
        mark_clean(note_path, saved_markdown) {
          const buffer = note_path
            ? buffers.get(buffer_key(current.vault_id, note_path))
            : current;
          if (!buffer) return;
          buffer.baseline =
            saved_markdown === undefined
              ? get_markdown_source_document(buffer.state)
              : Text.of(saved_markdown.split("\n"));
          if (buffer === current) publish_dirty();
        },
        is_dirty: () =>
          !get_markdown_source_document(view.state).eq(current.baseline),
        focus: focus_editor,
        toggle_source_mode() {
          if (!current.is_markdown) return;
          set_editor_mode(
            view,
            get_editor_mode(view.state) === "rich" ? "source" : "rich",
          );
          publish_view_mode();
          focus_editor();
        },
        set_vim_enabled(enabled) {
          vim_enabled = enabled;
          sync_vim_compartment();
        },
        set_wiki_suggestions(items) {
          pending_wiki?.(items);
        },
        update_find_state(query, selected_index) {
          update_find_query(view, query, selected_index);
        },
        open_buffer(next: BufferConfig) {
          cancel_pending();
          cancel_word_count();
          // An open / or : prompt would come back as an empty strip.
          close_vim_prompt(view);
          current.state = view.state;
          const cached =
            next.restore_policy === "reuse_cache"
              ? buffers.get(buffer_key(next.vault_id, next.note_path))
              : undefined;
          current = cached ?? create_buffer(next);
          view.setState(current.state);
          if (cached) sync_vim_compartment();
          refresh_word_count();
          if (!cached && next.view_state) restore_view_state(next.view_state);
          reported_dirty = !get_markdown_source_document(view.state).eq(
            current.baseline,
          );
          events.on_markdown_change(get_markdown_source(view.state));
          events.on_dirty_state_change(reported_dirty);
          events.on_code_block_view_states_change?.([
            ...read_code_block_view_states(view.state),
          ]);
          publish_cursor();
          publish_view_mode();
        },
        rename_buffer(old_path, new_path) {
          const old_key = buffer_key(current.vault_id, old_path);
          const entry = buffers.get(old_key);
          if (!entry) return;
          buffers.delete(old_key);
          entry.note_path = new_path;
          buffers.set(buffer_key(entry.vault_id, new_path), entry);
        },
        close_buffer(note_path) {
          buffers.delete(buffer_key(current.vault_id, note_path));
        },
      });

      function create_buffer(input: {
        note_path: string;
        vault_id: VaultId | null;
        initial_markdown: string;
      }): BufferEntry {
        const is_markdown = is_markdown_path(input.note_path);
        // Built per buffer, so a new buffer starts with the current setting.
        const vim = vim_compartment.of(vim_enabled ? vim_extension : []);
        const state = is_markdown
          ? create_markdown_state(input.initial_markdown, {
              plugins,
              extensions: [extensions, vim],
              source_extensions: syntaxHighlighting(markdown_source_highlight),
            })
          : create_text_state(input.initial_markdown, [
              extensions,
              vim,
              text_language.of([]),
              syntaxHighlighting(code_block_highlight),
            ]);
        const entry: BufferEntry = {
          note_path: input.note_path,
          vault_id: input.vault_id,
          is_markdown,
          state,
          baseline: get_markdown_source_document(state),
          words: 0,
          counted_document: null,
        };
        buffers.set(buffer_key(input.vault_id, input.note_path), entry);
        if (!is_markdown) load_text_language(entry);
        return entry;
      }

      function load_text_language(buffer: BufferEntry) {
        const leaf = buffer.note_path.split("/").at(-1) ?? buffer.note_path;
        const description = LanguageDescription.matchFilename(
          code_languages,
          leaf,
        );
        if (!description) return;
        description
          .load()
          .then((support) => {
            if (destroyed) return;
            const effects = text_language.reconfigure(support);
            if (buffer === current) view.dispatch({ effects });
            else buffer.state = buffer.state.update({ effects }).state;
          })
          .catch((error: unknown) => {
            log.error("Could not load file language", { error, leaf });
          });
      }

      function publish_view_mode() {
        const mode: EditorViewMode = current.is_markdown
          ? get_editor_mode(current.state)
          : "text";
        events.on_view_mode_change?.(mode);
      }

      // Only the shown state is reconfigured. A cached buffer keeps the Vim
      // setting it had when it was last shown, until open_buffer syncs it.
      function sync_vim_compartment() {
        const has_vim = vim_compartment.get(view.state) === vim_extension;
        if (has_vim === vim_enabled) return;
        view.dispatch({
          effects: vim_compartment.reconfigure(
            vim_enabled ? vim_extension : [],
          ),
        });
        // Turning Vim on reports the status from its plugin.
        if (!vim_enabled) events.on_vim_status_change?.(null);
      }

      function publish_dirty() {
        const dirty = !get_markdown_source_document(current.state).eq(
          current.baseline,
        );
        if (dirty === reported_dirty) return;
        reported_dirty = dirty;
        events.on_dirty_state_change(dirty);
      }

      function refresh_word_count() {
        const buffer = current;
        const state = buffer.state;
        const doc = state.doc;
        if (buffer.counted_document === doc) return;

        // Word counting by syntax only makes sense for Markdown.
        if (!buffer.is_markdown) {
          buffer.words = count_words(doc.toString());
          buffer.counted_document = doc;
          return;
        }

        if (doc.length <= synchronous_word_count_limit) {
          if (
            syntaxTree(state).length < doc.length ||
            !syntaxTreeAvailable(state, doc.length)
          ) {
            // This path already commits to counting the full bounded document.
            // Finish its existing parse and publish it for rendering too, instead
            // of reparsing separately for word count and discarding that tree.
            forceParsing(view, doc.length, Number.POSITIVE_INFINITY);
          }
          const count_state = view.state;
          buffer.words = count_visible_words(
            count_state,
            syntaxTree(count_state),
          );
          buffer.counted_document = doc;
          return;
        }

        cancel_word_count();
        const generation = word_count_generation;
        const run = () => {
          word_count_idle_id = null;
          word_count_timer = null;
          if (
            destroyed ||
            generation !== word_count_generation ||
            current !== buffer ||
            buffer.state.doc !== doc
          )
            return;

          const tree = ensureSyntaxTree(buffer.state, doc.length, 20);
          if (!tree) {
            schedule_word_count_step(run);
            return;
          }

          forceParsing(view, doc.length, 0);
          const count_state = buffer.state;
          const count_tree = syntaxTree(count_state);
          if (count_tree.length < doc.length) {
            schedule_word_count_step(run);
            return;
          }

          buffer.words = count_visible_words(count_state, count_tree);
          buffer.counted_document = doc;
          publish_cursor();
        };
        schedule_word_count_step(run);
      }

      function schedule_word_count_step(run: () => void) {
        const idle_window = window as Window & {
          requestIdleCallback?: (
            callback: () => void,
            options?: { timeout: number },
          ) => number;
        };
        if (idle_window.requestIdleCallback) {
          word_count_idle_id = idle_window.requestIdleCallback(run, {
            timeout: 500,
          });
        } else {
          word_count_timer = setTimeout(run, 25);
        }
      }

      function cancel_word_count() {
        word_count_generation++;
        if (word_count_timer) clearTimeout(word_count_timer);
        word_count_timer = null;
        if (word_count_idle_id !== null) {
          const idle_window = window as Window & {
            cancelIdleCallback?: (id: number) => void;
          };
          idle_window.cancelIdleCallback?.(word_count_idle_id);
        }
        word_count_idle_id = null;
      }

      // Focus the code or table surface that owns the selection, or the
      // prose editor otherwise.
      function focus_editor() {
        if (!focus_selection(view)) view.focus();
      }

      function publish_cursor() {
        const state = current.state;
        const range = state.selection.main;
        const line = state.doc.lineAt(range.head);
        events.on_cursor_change?.({
          line: line.number,
          column: range.head - line.from + 1,
          total_lines: state.doc.lines,
          total_words: current.words,
          word_count_pending: current.counted_document !== state.doc,
          anchor: range.anchor,
          head: range.head,
          offset_kind: "markdown",
        });
      }

      function set_selection(anchor: number, head: number) {
        const clamp = (position: number) =>
          Math.max(
            0,
            Math.min(
              view.state.doc.length,
              Number.isFinite(position) ? position : 0,
            ),
          );
        view.dispatch({
          selection: EditorSelection.single(clamp(anchor), clamp(head)),
        });
      }

      function restore_cursor(cursor: CursorInfo) {
        const had_focus = view.dom.contains(document.activeElement);
        if (cursor.offset_kind === "markdown" && cursor.anchor !== undefined) {
          set_selection(cursor.anchor, cursor.head ?? cursor.anchor);
        } else {
          // A persisted ProseMirror offset has structural units. Use its text
          // line/column instead of treating it as a Markdown source offset.
          const number = Math.max(
            1,
            Math.min(view.state.doc.lines, cursor.line),
          );
          const line = view.state.doc.line(number);
          const position = Math.min(
            line.to,
            line.from + Math.max(0, cursor.column - 1),
          );
          set_selection(position, position);
        }
        // Mount restores the cursor after focusing the editor. Move that focus
        // into its code/table widget too, without stealing another control's focus.
        if (had_focus) focus_editor();
      }

      function set_code_block_view_states(states: CodeBlockViewStates) {
        view.dispatch({
          effects: code_block_view_states_effect(
            states.map((state) => state ?? default_code_view),
          ),
        });
      }

      function restore_view_state(state: EditorBufferViewState | null) {
        if (!state) return;
        set_code_block_view_states(state.code_block_view_states);
        if (state.cursor) restore_cursor(state.cursor);
      }

      function cancel_pending() {
        if (notify_timer) clearTimeout(notify_timer);
        notify_timer = null;
        pending_wiki?.([]);
      }
    },
  };
}

function buffer_key(vault_id: VaultId | null, note_path: string): string {
  return `${vault_id ?? ""}::${note_path}`;
}

function decode_asset_path(source: string): string {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function count_visible_words(
  state: EditorState,
  tree: ReturnType<typeof syntaxTree>,
): number {
  const text: string[] = [];
  let position = 0;
  const omit = (from: number, to: number, replacement = "") => {
    text.push(state.doc.sliceString(position, from), replacement);
    position = to;
    return false;
  };
  tree.iterate({
    enter(node) {
      if (node.to <= position) return false;
      if (node.from < position) return;
      // Frontmatter is metadata, not body text.
      if (node.name === "Frontmatter") return omit(node.from, node.to);
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        const content = node.node
          .getChildren("CodeText")
          .map((child) => state.doc.sliceString(child.from, child.to))
          .join("\n");
        return omit(node.from, node.to, content);
      }
      if (node.name === "WikiLink") {
        const target = state.doc.sliceString(node.from + 2, node.to - 2);
        const [path = "", alias] = target.split("|");
        return omit(
          node.from,
          node.to,
          alias?.trim() || path.split("#", 1)[0] || path,
        );
      }
      if (
        /^(Image|LinkReference|HorizontalRule|HTMLTag|LinkTitle|LinkLabel)$/.test(
          node.name,
        )
      )
        return omit(node.from, node.to);
      if (node.name === "URL" && node.node.parent?.name !== "Autolink")
        return omit(node.from, node.to);
      if (node.name === "TableDelimiter") return omit(node.from, node.to, " ");
      if (
        /^(Header|Emphasis|Strikethrough|Code|Quote|List|Link)Mark$/.test(
          node.name,
        ) ||
        node.name === "TaskMarker"
      )
        return omit(node.from, node.to);
      return;
    },
  });
  text.push(state.doc.sliceString(position));
  return count_words(text.join(""));
}
