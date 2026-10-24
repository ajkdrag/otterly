// Editor setup and saved source.
export {
  create_markdown_state,
  create_markdown_editor,
  create_text_state,
  markdown_extensions,
  type MarkdownEditorConfig,
} from "./core/editor.js";
export {
  get_editor_mode,
  set_editor_mode,
  type EditorMode,
} from "./core/editor_mode.js";
export {
  get_markdown_source,
  get_markdown_source_document,
  insert_markdown_source,
  source_undo,
  source_redo,
} from "./core/source_state.js";

// Writing plugins.
export {
  PluginBuildError,
  get_registry,
  type MarkdownPlugin,
  type Construct,
  type InlineConstruct,
  type LineConstruct,
  type BlockConstruct,
  type ContainerSpec,
  type ContainerMatch,
  type ConstructKeys,
  type ConstructKeyName,
  type InsertItem,
  type StaticContext,
  type ThemeSpec,
} from "./core/plugin.js";
export {
  line_container,
  continuation_prefix,
  sibling_prefix,
  continues_paragraph,
  insert_lines,
  markdown_context,
  is_literal,
  is_literal_block,
  type Layer,
  type LineContainer,
  type ContextEntry,
} from "./core/context.js";
export { refresh_rendering, type Render } from "./core/inline_rendering.js";
export { line_selector } from "./core/editor_theme.js";
export { touches, caret_in, reveal_ranges } from "./core/reveal.js";
export {
  BlockWidget,
  block_at,
  block_for_dom,
  get_blocks,
  wrap_in_layers,
  edit_block_source,
  finish_block_construction,
  refresh_blocks,
  patch_block_view_state,
  replace_block_view_states,
  read_block_view_states,
  type Block,
  type BlockController,
} from "./core/block_field.js";
export {
  NestedEditor,
  focus_selection,
  leave_block,
  caret_x,
  vertical_cursor,
  surface_highlights,
  type SourceWindow,
  type SurfaceHighlight,
} from "./core/surface.js";
export { render_static } from "./core/static_render.js";
export type { KeyContext } from "./core/keys.js";

// Plugins.
export {
  commonmark,
  toggle_bold,
  toggle_italic,
  toggle_inline_code,
  toggle_strikethrough,
  set_block_style,
  change_list_indent,
  delimited_mark,
} from "./plugins/commonmark/index.js";
export { gfm } from "./plugins/gfm/index.js";
export {
  code_blocks,
  read_code_block_view_states,
  set_code_block_view_states,
  refresh_code_diagrams,
  type CodeBlockOptions,
  type CodeBlockViewState,
} from "./plugins/code_blocks/index.js";
export { frontmatter } from "./plugins/frontmatter/index.js";
export { links, type LinkOptions } from "./plugins/links/index.js";
export {
  images,
  image_renderer,
  type ImageRenderingOptions,
} from "./plugins/images/index.js";
export {
  wiki_links,
  type WikiLinkOptions,
  type WikiSuggestion,
} from "./plugins/wiki_links/index.js";
export { slash_menu } from "./plugins/menus/slash_menu.js";
export {
  find,
  set_find_query,
  update_find_query,
  get_find_matches,
  get_find_query,
  literal_find_spec,
  find_regexp,
  find_matches_in_line,
  replace_find_match,
  replace_all_find_matches,
  expand_replacement,
  type FindSpec,
} from "./plugins/find.js";
export {
  clipboard,
  type MarkdownClipboardOptions,
} from "./plugins/clipboard.js";
export { callouts } from "./plugins/callouts/index.js";
