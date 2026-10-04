import type {
  BufferConfig,
  EditorEventHandlers,
  EditorPort,
  EditorSession,
} from "../ports";
import type { EditorEngine } from "../types/editor_diagnostics";
import type {
  CursorInfo,
  EditorBufferViewState,
} from "$lib/shared/types/editor";
import { create_editor_diagnostics } from "./editor_diagnostics";

type BufferRecord = {
  config: BufferConfig;
  source: string;
  baseline: string;
};
type EngineEntry = {
  engine: EditorEngine;
  host: HTMLDivElement;
  current_key: string;
  session: EditorSession | null;
  ready: Promise<EditorSession> | null;
  sources: Map<string, string>;
  cursors: Map<string, CursorInfo>;
  scroll: Map<string, number>;
};

// Each engine owns its view and history. Only raw source and saved baselines
// cross engines; ProseMirror positions must never become Markdown offsets.
export function create_switchable_editor_port(ports: {
  source: EditorPort;
  milkdown: () => Promise<EditorPort>;
}): EditorPort {
  let preferred_engine: EditorEngine = "source";
  return {
    async start_session(config) {
      const previous_height = config.root.style.height;
      const previous_min_height = config.root.style.minHeight;
      config.root.style.height = "100%";
      config.root.style.minHeight = "0";
      const buffers = new Map<string, BufferRecord>();
      const engines = new Map<EditorEngine, EngineEntry>();
      let current = create_buffer({ ...config, restore_policy: "fresh" });
      let active: EngineEntry | null = null;
      let destroyed = false;
      let restoring = false;
      let switch_generation = 0;
      let diagnostics_enabled = false;
      let wiki_request_engine: EngineEntry | null = null;
      let find_state = { query: "", index: -1 };
      const diagnostics = create_editor_diagnostics({
        root: config.root,
        read_engine: () => active?.engine ?? "source",
        read_note_path: () => current.config.note_path,
        read_source: () => {
          capture_current();
          return current.source;
        },
        read_details: () => active?.session?.read_diagnostics?.() ?? null,
        on_change: (snapshot) =>
          config.events.on_diagnostics_change?.(snapshot),
      });
      try {
        active = create_engine(preferred_engine);
        await active.ready;
        if (destroyed)
          throw new Error("Editor session was destroyed during startup");
        active.host.hidden = false;
        publish_current();
      } catch (error) {
        destroy_sessions();
        throw error;
      }

      const session: EditorSession = {
        get_engine: () => active?.engine ?? "source",
        async switch_engine(engine) {
          const generation = ++switch_generation;
          if (destroyed || active?.engine === engine) return;
          const target = engines.get(engine) ?? create_engine(engine);
          await target.ready;
          if (destroyed || generation !== switch_generation) return;
          // Loading Milkdown is asynchronous; keep edits and note switches made
          // in the active engine while its code was loading.
          capture_current();
          restore_engine_buffer(target);
          if (active) active.host.hidden = true;
          active = target;
          preferred_engine = engine;
          for (const entry of engines.values())
            entry.session?.set_diagnostics_enabled?.(
              diagnostics_enabled && entry === active,
            );
          target.host.hidden = false;
          const scroll = target.scroll.get(buffer_key(current.config)) ?? 0;
          if (target.session?.set_scroll_top)
            target.session.set_scroll_top(scroll);
          else target.host.scrollTop = scroll;
          target.session?.update_find_state?.(
            find_state.query,
            find_state.index,
          );
          wiki_request_engine = null;
          publish_current();
          target.session?.focus();
          diagnostics.schedule_refresh();
        },
        destroy: destroy_sessions,
        get_markdown() {
          capture_current();
          return current.source;
        },
        set_markdown(markdown) {
          active_session().set_markdown(markdown);
          capture_current();
        },
        insert_text_at_cursor(text) {
          active_session().insert_text_at_cursor(text);
          capture_current();
        },
        set_selection(anchor, head) {
          active_session().set_selection(anchor, head);
        },
        restore_cursor(cursor) {
          const editor = active_session();
          if (
            require_active().engine === "milkdown" &&
            cursor.offset_kind === "markdown"
          )
            return;
          if (editor.restore_cursor) editor.restore_cursor(cursor);
          else if (cursor.anchor !== undefined)
            editor.set_selection(cursor.anchor, cursor.head ?? cursor.anchor);
        },
        focus() {
          active_session().focus();
        },
        get_scroll_top: () =>
          active_session().get_scroll_top?.() ??
          require_active().host.scrollTop,
        set_scroll_top(value) {
          const editor = active_session();
          if (editor.set_scroll_top) editor.set_scroll_top(value);
          else require_active().host.scrollTop = value;
        },
        get_code_block_view_states: () =>
          active_session().get_code_block_view_states(),
        set_code_block_view_states(states) {
          active_session().set_code_block_view_states(states);
        },
        restore_view_state(state) {
          active_session().restore_view_state(
            compatible_view_state(require_active().engine, state),
          );
        },
        is_dirty() {
          capture_current();
          return current.source !== current.baseline;
        },
        mark_clean(note_path, saved_markdown) {
          capture_current();
          const key = buffer_key({
            ...current.config,
            note_path: note_path ?? current.config.note_path,
          });
          const buffer = buffers.get(key);
          if (!buffer) return;
          buffer.baseline = saved_markdown ?? buffer.source;
          active_session().mark_clean(note_path, buffer.baseline);
          if (buffer === current)
            config.events.on_dirty_state_change(
              current.source !== current.baseline,
            );
        },
        open_buffer(next) {
          capture_current();
          current =
            next.restore_policy === "reuse_cache"
              ? (buffers.get(buffer_key(next)) ?? create_buffer(next))
              : create_buffer(next);
          restore_engine_buffer(
            require_active(),
            next.view_state,
            next.restore_policy === "fresh",
          );
          publish_current();
          diagnostics.schedule_refresh();
        },
        rename_buffer(old_path, new_path) {
          capture_current();
          const old_key = buffer_key({
            ...current.config,
            note_path: old_path,
          });
          const new_key = buffer_key({
            ...current.config,
            note_path: new_path,
          });
          const buffer = buffers.get(old_key);
          if (buffer) {
            buffers.delete(old_key);
            buffer.config = { ...buffer.config, note_path: new_path };
            buffers.set(new_key, buffer);
          }
          for (const entry of engines.values()) {
            // Underlying sessions resolve paths in their currently mounted vault.
            if (same_vault(entry.current_key, current.config.vault_id))
              entry.session?.rename_buffer(old_path, new_path);
            move_map_entry(entry.sources, old_key, new_key);
            move_map_entry(entry.cursors, old_key, new_key);
            move_map_entry(entry.scroll, old_key, new_key);
            if (entry.current_key === old_key) entry.current_key = new_key;
          }
        },
        close_buffer(note_path) {
          const key = buffer_key({ ...current.config, note_path });
          buffers.delete(key);
          for (const entry of engines.values()) {
            entry.sources.delete(key);
            entry.cursors.delete(key);
            entry.scroll.delete(key);
            if (same_vault(entry.current_key, current.config.vault_id))
              entry.session?.close_buffer(note_path);
          }
        },
        update_find_state(query, index) {
          find_state = { query, index };
          active_session().update_find_state?.(query, index);
        },
        set_wiki_suggestions(items) {
          if (wiki_request_engine === active)
            active_session().set_wiki_suggestions?.(items);
        },
        set_diagnostics_enabled(enabled) {
          diagnostics_enabled = enabled;
          active_session().set_diagnostics_enabled?.(enabled);
          diagnostics.set_enabled(enabled);
        },
        refresh_diagnostics: diagnostics.refresh,
        clear_diagnostics() {
          diagnostics.clear();
        },
      };
      return session;

      function require_active(): EngineEntry {
        if (!active || destroyed)
          throw new Error("Editor session is unavailable");
        return active;
      }
      function active_session(): EditorSession {
        const editor = require_active().session;
        if (!editor) throw new Error("Editor engine is still loading");
        return editor;
      }
      function create_buffer(next: BufferConfig): BufferRecord {
        const buffer = {
          config: next,
          source: next.initial_markdown,
          baseline: next.initial_markdown,
        };
        buffers.set(buffer_key(next), buffer);
        return buffer;
      }
      function capture_current() {
        const entry = active;
        if (!entry?.session || destroyed) return;
        current.source = entry.session.get_markdown();
        entry.sources.set(entry.current_key, current.source);
        entry.scroll.set(
          entry.current_key,
          entry.session.get_scroll_top?.() ?? entry.host.scrollTop,
        );
      }
      function publish_current() {
        config.events.on_markdown_change(current.source);
        config.events.on_dirty_state_change(
          current.source !== current.baseline,
        );
        const cursor = active?.cursors.get(buffer_key(current.config));
        if (cursor) config.events.on_cursor_change?.(cursor);
        config.events.on_code_block_view_states_change?.(
          active_session().get_code_block_view_states(),
        );
      }
      function restore_engine_buffer(
        entry: EngineEntry,
        supplied_view?: EditorBufferViewState | null,
        force_fresh = false,
      ) {
        const editor = entry.session;
        if (!editor) return;
        const key = buffer_key(current.config);
        const unchanged =
          !force_fresh && entry.sources.get(key) === current.source;
        restoring = true;
        try {
          if (entry.current_key !== key || !unchanged) {
            entry.current_key = key;
            editor.open_buffer({
              note_path: current.config.note_path,
              vault_id: current.config.vault_id,
              initial_markdown: current.source,
              restore_policy: unchanged ? "reuse_cache" : "fresh",
              // Cache restoration keeps that engine's own coordinates.
              ...(unchanged
                ? {}
                : {
                    view_state: compatible_view_state(
                      entry.engine,
                      supplied_view ?? null,
                    ),
                  }),
            });
          }
          editor.mark_clean(current.config.note_path, current.baseline);
          entry.sources.set(key, current.source);
          const scroll = unchanged ? (entry.scroll.get(key) ?? 0) : 0;
          entry.scroll.set(key, scroll);
          if (editor.set_scroll_top) editor.set_scroll_top(scroll);
          else entry.host.scrollTop = scroll;
        } finally {
          restoring = false;
        }
      }
      function create_engine(engine: EditorEngine): EngineEntry {
        const host = document.createElement("div");
        host.hidden = true;
        host.style.height = "100%";
        host.style.minHeight = "0";
        host.style.overflow = engine === "milkdown" ? "auto" : "hidden";
        host.dataset.editorEngine = engine;
        config.root.append(host);
        const initial_config = current.config;
        const initial_source = current.source;
        const key = buffer_key(initial_config);
        const entry: EngineEntry = {
          engine,
          host,
          current_key: key,
          session: null,
          ready: null,
          sources: new Map(),
          cursors: new Map(),
          scroll: new Map(),
        };
        engines.set(engine, entry);
        entry.ready = (async () => {
          try {
            const port =
              engine === "source" ? ports.source : await ports.milkdown();
            const created = await port.start_session({
              root: host,
              initial_markdown: initial_source,
              note_path: initial_config.note_path,
              vault_id: initial_config.vault_id,
              events: engine_events(entry),
            });
            entry.session = created;
            entry.sources.set(key, initial_source);
            if (destroyed) {
              created.destroy();
              host.remove();
            }
            return created;
          } catch (error) {
            engines.delete(engine);
            host.remove();
            throw error;
          }
        })();
        return entry;
      }
      function engine_events(entry: EngineEntry): EditorEventHandlers {
        const owns_callbacks = () =>
          !destroyed && !restoring && entry === active;
        return {
          on_markdown_change() {
            if (!owns_callbacks() || !entry.session) return;
            capture_current();
            config.events.on_markdown_change(current.source);
            config.events.on_dirty_state_change(
              current.source !== current.baseline,
            );
            diagnostics.schedule_refresh();
          },
          on_dirty_state_change(dirty) {
            if (!owns_callbacks() || !entry.session) return;
            capture_current();
            config.events.on_dirty_state_change(
              dirty || current.source !== current.baseline,
            );
          },
          on_cursor_change(cursor) {
            entry.cursors.set(entry.current_key, cursor);
            if (owns_callbacks()) config.events.on_cursor_change?.(cursor);
            if (owns_callbacks()) diagnostics.schedule_refresh();
          },
          on_code_block_view_states_change(states) {
            if (owns_callbacks())
              config.events.on_code_block_view_states_change?.(states);
          },
          on_external_link_click(target) {
            if (owns_callbacks())
              config.events.on_external_link_click?.(target);
          },
          on_internal_link_click(target, base) {
            if (owns_callbacks())
              config.events.on_internal_link_click?.(target, base);
          },
          on_file_link_click(path) {
            if (owns_callbacks()) config.events.on_file_link_click?.(path);
          },
          on_image_paste_requested(image) {
            if (owns_callbacks())
              config.events.on_image_paste_requested?.(image);
          },
          on_wiki_suggest_query(query) {
            if (!owns_callbacks()) return;
            wiki_request_engine = entry;
            config.events.on_wiki_suggest_query?.(query);
          },
        };
      }
      function destroy_sessions() {
        if (destroyed) return;
        destroyed = true;
        switch_generation++;
        diagnostics.destroy();
        for (const entry of engines.values()) {
          entry.session?.destroy();
          entry.host.remove();
        }
        engines.clear();
        buffers.clear();
        config.root.style.height = previous_height;
        config.root.style.minHeight = previous_min_height;
      }
    },
  };
}

function buffer_key(
  config: Pick<BufferConfig, "vault_id" | "note_path">,
): string {
  return JSON.stringify([config.vault_id, config.note_path]);
}
function same_vault(key: string, vault_id: BufferConfig["vault_id"]): boolean {
  const value: unknown = JSON.parse(key);
  return Array.isArray(value) && value[0] === vault_id;
}
function move_map_entry<T>(
  map: Map<string, T>,
  old_key: string,
  new_key: string,
) {
  const value = map.get(old_key);
  if (value === undefined) return;
  map.delete(old_key);
  map.set(new_key, value);
}

function compatible_view_state(
  engine: EditorEngine,
  state: EditorBufferViewState | null,
): EditorBufferViewState | null {
  if (engine !== "milkdown" || state?.cursor?.offset_kind !== "markdown")
    return state;
  return { ...state, cursor: null };
}
