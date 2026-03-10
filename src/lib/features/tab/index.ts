export { register_tab_actions } from "$lib/features/tab/application/tab_actions";
export { TabService } from "$lib/features/tab/application/tab_service";
export {
  capture_active_tab_snapshot,
  ensure_tab_capacity,
  open_active_tab_note,
  try_open_tab,
} from "$lib/features/tab/application/tab_action_helpers";
export { TabStore } from "$lib/features/tab/state/tab_store.svelte";
export { default as TabBar } from "$lib/features/tab/ui/tab_bar.svelte";
export { default as TabCloseConfirmDialog } from "$lib/features/tab/ui/tab_close_confirm_dialog.svelte";
export type { Tab } from "$lib/features/tab/types/tab";
