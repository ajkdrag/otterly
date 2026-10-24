export {
  register_theme_actions,
  type ThemeActionInput,
} from "$lib/features/theme/application/theme_actions";
export {
  ThemeService,
  type ThemeLoadResult,
  type ThemeFileCreateResult,
} from "$lib/features/theme/application/theme_service";
export type {
  ThemeFilePort,
  ThemeFileSnapshot,
} from "$lib/features/theme/ports";
export { create_theme_file_tauri_adapter } from "$lib/features/theme/adapters/theme_file_tauri_adapter";
export { format_theme_file_error } from "$lib/features/theme/domain/parse_theme_file";
export type { Theme } from "$lib/shared/types/theme";
export {
  STYLE_DESCRIPTORS,
  STYLE_CATEGORY_ORDER,
  STYLE_CATEGORY_LABELS,
} from "$lib/features/theme/domain/theme_style_descriptors";
export type {
  ThemeStyleDescriptor,
  ThemeStyleCategory,
  ThemeStyleControl,
} from "$lib/features/theme/domain/theme_style_descriptors";
export {
  filter_descriptors,
  group_filtered,
  ordered_categories,
} from "$lib/features/theme/domain/theme_style_filter";
