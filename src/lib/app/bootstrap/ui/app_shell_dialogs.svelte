<script lang="ts">
  import {
    VaultDialog,
    VaultDashboardDialog,
    ConfirmVaultSwitchDialog,
    ConfirmCrossVaultOpenDialog,
  } from "$lib/features/vault";
  import {
    DeleteNoteDialog,
    RenameNoteDialog,
    SaveNoteDialog,
    ImagePasteDialog,
  } from "$lib/features/note";
  import {
    DeleteFolderDialog,
    RenameFolderDialog,
    CreateFolderDialog,
    FiletreeMoveConflictDialog,
  } from "$lib/features/folder";
  import { SettingsDialog } from "$lib/features/settings";
  import { Omnibar } from "$lib/features/search";
  import { TabCloseConfirmDialog } from "$lib/features/tab";
  import { VersionHistoryDialog, CheckpointDialog } from "$lib/features/git";
  import { HotkeyRecorderDialog } from "$lib/features/hotkey";
  import HelpDialog from "$lib/app/bootstrap/ui/help_dialog.svelte";
  import QuitConfirmDialog from "$lib/app/bootstrap/ui/quit_confirm_dialog.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OmnibarItem } from "$lib/shared/types/search";
  import type { OmnibarScope } from "$lib/shared/types/search";
  import type {
    EditorSettings,
    SettingsCategory,
  } from "$lib/shared/types/editor_settings";
  import type { VaultId } from "$lib/shared/types/ids";
  import type { HotkeyBinding } from "$lib/features/hotkey";
  import type { Theme } from "$lib/shared/types/theme";
  import type { UserPreferences } from "$lib/features/user";

  type Props = {
    hide_choose_vault_button?: boolean;
  };

  let { hide_choose_vault_button = false }: Props = $props();

  const { stores, action_registry } = use_app_context();

  const has_vault = $derived(stores.vault.vault !== null);

  const vault_dashboard_open = $derived(stores.ui.vault_dashboard.open);
  const vault_dashboard_recent = $derived(
    stores.notes.recent_notes.map((n) => ({
      id: n.id,
      title: n.title,
      path: n.path,
    })),
  );

  const recent_notes_for_display = $derived(stores.notes.recent_notes);

  const has_multiple_vaults = $derived(stores.vault.recent_vaults.length > 1);

  const delete_note_error = $derived(stores.op.get("note.delete").error);
  const rename_note_error = $derived(stores.op.get("note.rename").error);
  const save_note_error = $derived(stores.op.get("note.save").error);
  const create_folder_error = $derived(stores.op.get("folder.create").error);
  const delete_folder_error = $derived(
    stores.op.get("folder.delete").error ??
      stores.op.get("folder.delete_stats").error,
  );
  const rename_folder_error = $derived(stores.op.get("folder.rename").error);
  const settings_error = $derived(
    stores.op.get("settings.save").error ??
      stores.op.get("settings.load").error,
  );
  const image_paste_error = $derived(stores.op.get("asset.write").error);

  const settings_has_unsaved_changes = $derived.by(() => {
    const { current_settings, persisted_settings, hotkey_draft_overrides } =
      stores.ui.settings_dialog;
    const editor_changed =
      JSON.stringify(current_settings) !== JSON.stringify(persisted_settings);
    const hotkey_changed =
      JSON.stringify(hotkey_draft_overrides) !==
      JSON.stringify(stores.ui.hotkey_overrides);
    return editor_changed || hotkey_changed || stores.ui.theme_has_draft;
  });

  const delete_folder_status = $derived.by(() => {
    const delete_op_state = stores.op.get("folder.delete").status;
    if (delete_op_state === "pending") return "deleting";
    if (delete_op_state === "error") return "error";

    const delete_stats_state = stores.op.get("folder.delete_stats").status;
    if (delete_stats_state === "pending") return "fetching_stats";
    if (delete_stats_state === "error") return "error";

    return stores.ui.delete_folder_dialog.status;
  });

  const rename_folder_status = $derived.by(() => {
    const op_state = stores.op.get("folder.rename").status;
    if (op_state === "pending") return "renaming";
    if (op_state === "error") return "error";
    if (stores.ui.rename_folder_dialog.open) return "confirming";
    return "idle";
  });
</script>

{#if has_vault}
  <VaultDialog
    open={stores.ui.change_vault.open}
    on_open_change={(open) => {
      if (!open) {
        void action_registry.execute(ACTION_IDS.vault_close_change);
      }
    }}
    recent_vaults={stores.vault.recent_vaults}
    pinned_vault_ids={stores.vault.pinned_vault_ids}
    current_vault_id={stores.vault.vault?.id ?? null}
    is_loading={stores.ui.change_vault.is_loading}
    error={stores.ui.change_vault.error}
    on_choose_vault_dir={() =>
      void action_registry.execute(ACTION_IDS.vault_choose)}
    on_select_vault={(vault_id: VaultId) =>
      void action_registry.execute(ACTION_IDS.vault_select, vault_id)}
    on_toggle_pin_vault={(vault_id: VaultId) =>
      void action_registry.execute(ACTION_IDS.vault_toggle_pin, vault_id)}
    on_remove_vault={(vault_id: VaultId) =>
      void action_registry.execute(
        ACTION_IDS.vault_remove_from_registry,
        vault_id,
      )}
    {hide_choose_vault_button}
  />

  <VaultDashboardDialog
    open={vault_dashboard_open}
    vault_name={stores.vault.vault?.name ?? null}
    vault_path={stores.vault.vault?.path ?? null}
    stats_status={stores.notes.dashboard_stats.status}
    note_count={stores.notes.dashboard_stats.value?.note_count ?? null}
    folder_count={stores.notes.dashboard_stats.value?.folder_count ?? null}
    recent_notes={vault_dashboard_recent}
    created_at={stores.vault.vault?.created_at ?? null}
    last_opened_at={stores.vault.vault?.last_opened_at ?? null}
    is_available={stores.vault.vault?.is_available ?? null}
    on_open_change={(open) => {
      if (!open) {
        void action_registry.execute(ACTION_IDS.ui_close_vault_dashboard);
      }
    }}
    on_open_note={(note_path) =>
      void action_registry.execute(ACTION_IDS.note_open, {
        note_path,
        cleanup_if_missing: true,
      })}
    on_new_note={() => void action_registry.execute(ACTION_IDS.note_create)}
    on_search_vault={() =>
      void action_registry.execute(ACTION_IDS.omnibar_open)}
    on_open_recent={() => {
      const recent_note = stores.notes.recent_notes[0];
      if (recent_note) {
        void action_registry.execute(ACTION_IDS.note_open, recent_note.id);
        return;
      }
      void action_registry.execute(ACTION_IDS.omnibar_open);
    }}
    on_view_all_tags={() => {}}
  />
{/if}

<ConfirmVaultSwitchDialog
  open={stores.ui.change_vault.confirm_discard_open}
  is_switching={stores.ui.change_vault.is_loading}
  unsaved_note_label={stores.ui.change_vault.unsaved_note_label}
  error={stores.ui.change_vault.error}
  on_save_and_switch={() =>
    void action_registry.execute(ACTION_IDS.vault_confirm_save_change)}
  on_discard_and_switch={() =>
    void action_registry.execute(ACTION_IDS.vault_confirm_discard_change)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.vault_cancel_discard_change)}
/>

<DeleteNoteDialog
  open={stores.ui.delete_note_dialog.open}
  note={stores.ui.delete_note_dialog.note}
  is_deleting={stores.op.is_pending("note.delete")}
  error={delete_note_error}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_delete)}
  on_cancel={() => void action_registry.execute(ACTION_IDS.note_cancel_delete)}
  on_retry={() => void action_registry.execute(ACTION_IDS.note_confirm_delete)}
/>

<RenameNoteDialog
  open={stores.ui.rename_note_dialog.open}
  note={stores.ui.rename_note_dialog.note}
  new_name={stores.ui.rename_note_dialog.new_name}
  is_renaming={stores.op.is_pending("note.rename")}
  is_checking_conflict={stores.ui.rename_note_dialog.is_checking_conflict}
  error={rename_note_error}
  show_overwrite_confirm={stores.ui.rename_note_dialog.show_overwrite_confirm}
  on_update_name={(name: string) =>
    void action_registry.execute(ACTION_IDS.note_update_rename_name, name)}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_rename)}
  on_confirm_overwrite={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_rename_overwrite)}
  on_cancel={() => void action_registry.execute(ACTION_IDS.note_cancel_rename)}
  on_retry={() => void action_registry.execute(ACTION_IDS.note_retry_rename)}
/>

<DeleteFolderDialog
  open={stores.ui.delete_folder_dialog.open}
  folder_path={stores.ui.delete_folder_dialog.folder_path}
  affected_note_count={stores.ui.delete_folder_dialog.affected_note_count}
  affected_folder_count={stores.ui.delete_folder_dialog.affected_folder_count}
  status={delete_folder_status}
  error={delete_folder_error}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.folder_confirm_delete)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.folder_cancel_delete)}
  on_retry={() => void action_registry.execute(ACTION_IDS.folder_retry_delete)}
/>

<RenameFolderDialog
  open={stores.ui.rename_folder_dialog.open}
  folder_path={stores.ui.rename_folder_dialog.folder_path}
  new_name={stores.ui.rename_folder_dialog.new_name}
  status={rename_folder_status}
  error={rename_folder_error}
  on_update_name={(name: string) =>
    void action_registry.execute(ACTION_IDS.folder_update_rename_name, name)}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.folder_confirm_rename)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.folder_cancel_rename)}
  on_retry={() => void action_registry.execute(ACTION_IDS.folder_retry_rename)}
/>

<FiletreeMoveConflictDialog
  open={stores.ui.filetree_move_conflict_dialog.open}
  target_folder={stores.ui.filetree_move_conflict_dialog.target_folder}
  conflicts={stores.ui.filetree_move_conflict_dialog.conflicts}
  on_overwrite={() =>
    void action_registry.execute(ACTION_IDS.filetree_confirm_move_overwrite)}
  on_skip={() =>
    void action_registry.execute(ACTION_IDS.filetree_skip_move_conflicts)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.filetree_cancel_move_conflicts)}
/>

<SaveNoteDialog
  open={stores.ui.save_note_dialog.open}
  new_path={stores.ui.save_note_dialog.new_path}
  folder_path={stores.ui.save_note_dialog.folder_path}
  is_saving={stores.op.is_pending("note.save")}
  is_checking={stores.ui.save_note_dialog.is_checking_existence}
  show_overwrite_confirm={stores.ui.save_note_dialog.show_overwrite_confirm}
  error={save_note_error}
  on_update_path={(path: string) =>
    void action_registry.execute(ACTION_IDS.note_update_save_path, path)}
  on_confirm={() => void action_registry.execute(ACTION_IDS.note_confirm_save)}
  on_confirm_overwrite={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_save_overwrite)}
  on_retry={() => void action_registry.execute(ACTION_IDS.note_retry_save)}
  on_cancel={() => void action_registry.execute(ACTION_IDS.note_cancel_save)}
/>

<SettingsDialog
  open={stores.ui.settings_dialog.open}
  editor_settings={stores.ui.settings_dialog.current_settings}
  active_category={stores.ui.settings_dialog.active_category}
  is_saving={stores.op.is_pending("settings.save")}
  has_unsaved_changes={settings_has_unsaved_changes}
  error={settings_error}
  hotkeys_config={stores.ui.settings_dialog.hotkey_draft_config}
  user_themes={stores.ui.user_themes}
  active_theme={stores.ui.active_theme}
  on_update_settings={(settings: EditorSettings) =>
    void action_registry.execute(ACTION_IDS.settings_update, settings)}
  on_category_change={(category: SettingsCategory) => {
    stores.ui.settings_dialog.active_category = category;
  }}
  on_save={() => void action_registry.execute(ACTION_IDS.settings_save)}
  on_close={() => void action_registry.execute(ACTION_IDS.settings_close)}
  on_hotkey_edit={(binding: HotkeyBinding) =>
    void action_registry.execute(ACTION_IDS.hotkey_open_editor, {
      action_id: binding.action_id,
      current_key: binding.key,
      label: binding.label,
    })}
  on_hotkey_clear={(action_id: string) =>
    void action_registry.execute(ACTION_IDS.hotkey_clear_binding, action_id)}
  on_hotkey_reset_single={(action_id: string) =>
    void action_registry.execute(ACTION_IDS.hotkey_reset_single, action_id)}
  on_hotkey_reset_all={() =>
    void action_registry.execute(ACTION_IDS.hotkey_reset_all)}
  on_theme_switch={(id: string) =>
    void action_registry.execute(ACTION_IDS.theme_switch, id)}
  on_theme_create={(name: string, base: Theme) =>
    void action_registry.execute(ACTION_IDS.theme_create, { name, base })}
  on_theme_duplicate={(id: string) =>
    void action_registry.execute(ACTION_IDS.theme_duplicate, id)}
  on_theme_rename={(id: string, name: string) =>
    void action_registry.execute(ACTION_IDS.theme_rename, { id, name })}
  on_theme_delete={(id: string) =>
    void action_registry.execute(ACTION_IDS.theme_delete, id)}
  on_theme_update={(theme: Theme) =>
    void action_registry.execute(ACTION_IDS.theme_update, theme)}
  user_profile={stores.user.active_profile}
  user_all_profiles={stores.user.all_profiles}
  on_user_update_name={(name: string) =>
    void action_registry.execute(ACTION_IDS.user_update_name, name)}
  on_user_update_avatar={(emoji: string) =>
    void action_registry.execute(ACTION_IDS.user_update_avatar, emoji)}
  on_user_update_preferences={(prefs: Partial<UserPreferences>) =>
    void action_registry.execute(ACTION_IDS.user_update_preferences, prefs)}
  on_user_switch={(user_id: string) =>
    void action_registry.execute(ACTION_IDS.user_switch, user_id)}
  on_user_create={(name: string, emoji: string, password?: string) =>
    void action_registry.execute(ACTION_IDS.user_create, { name, emoji, password })}
  on_user_delete={(user_id: string) =>
    void action_registry.execute(ACTION_IDS.user_delete, user_id)}
  on_user_change_password={(current_password: string, new_password: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      void action_registry.execute(ACTION_IDS.user_change_password, {
        current_password,
        new_password,
        resolve,
      });
    });
  }}
  on_user_verify_password={(user_id: string, password: string) => {
    return new Promise<boolean>((resolve) => {
      void action_registry.execute(ACTION_IDS.user_verify_password, {
        user_id,
        password,
        resolve,
      });
    });
  }}
  on_user_open_note={(note_path: string) => {
    void action_registry.execute(ACTION_IDS.settings_close);
    void action_registry.execute(ACTION_IDS.note_open, { note_path });
  }}
/>

<CreateFolderDialog
  open={stores.ui.create_folder_dialog.open}
  parent_path={stores.ui.create_folder_dialog.parent_path}
  folder_name={stores.ui.create_folder_dialog.folder_name}
  is_creating={stores.op.is_pending("folder.create")}
  error={create_folder_error}
  on_folder_name_change={(name: string) =>
    void action_registry.execute(ACTION_IDS.folder_update_create_name, name)}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.folder_confirm_create)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.folder_cancel_create)}
/>

<Omnibar
  open={stores.ui.omnibar.open}
  query={stores.ui.omnibar.query}
  selected_index={stores.ui.omnibar.selected_index}
  is_searching={stores.ui.omnibar.is_searching}
  scope={stores.ui.omnibar.scope}
  items={stores.search.omnibar_items}
  recent_notes={recent_notes_for_display}
  recent_command_ids={stores.ui.recent_command_ids}
  hotkeys_config={stores.ui.hotkeys_config}
  {has_multiple_vaults}
  on_open_change={(open) => {
    if (open) {
      void action_registry.execute(ACTION_IDS.omnibar_open);
    } else {
      void action_registry.execute(ACTION_IDS.omnibar_close);
    }
  }}
  on_query_change={(query: string) =>
    void action_registry.execute(ACTION_IDS.omnibar_set_query, query)}
  on_selected_index_change={(index: number) =>
    void action_registry.execute(ACTION_IDS.omnibar_set_selected_index, index)}
  on_scope_change={(scope: OmnibarScope) =>
    void action_registry.execute(ACTION_IDS.omnibar_set_scope, scope)}
  on_confirm={(item: OmnibarItem) =>
    void action_registry.execute(ACTION_IDS.omnibar_confirm_item, item)}
/>

<ImagePasteDialog
  open={stores.ui.image_paste_dialog.open}
  filename={stores.ui.image_paste_dialog.filename}
  estimated_size_bytes={stores.ui.image_paste_dialog.estimated_size_bytes}
  target_folder={stores.ui.image_paste_dialog.target_folder}
  image_bytes={stores.ui.image_paste_dialog.image?.bytes ?? null}
  image_mime_type={stores.ui.image_paste_dialog.image?.mime_type ?? null}
  is_saving={stores.op.is_pending("asset.write")}
  error={image_paste_error}
  on_update_filename={(filename: string) =>
    void action_registry.execute(
      ACTION_IDS.note_update_image_paste_filename,
      filename,
    )}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_image_paste)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.note_cancel_image_paste)}
  on_retry={() =>
    void action_registry.execute(ACTION_IDS.note_confirm_image_paste)}
/>

<ConfirmCrossVaultOpenDialog
  open={stores.ui.cross_vault_open_confirm.open}
  is_switching={stores.ui.change_vault.is_loading}
  target_vault_name={stores.ui.cross_vault_open_confirm.target_vault_name}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.omnibar_confirm_cross_vault_open)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.omnibar_cancel_cross_vault_open)}
/>

<TabCloseConfirmDialog
  open={stores.ui.tab_close_confirm.open}
  tab_title={stores.ui.tab_close_confirm.tab_title}
  remaining_count={stores.ui.tab_close_confirm.pending_dirty_tab_ids.length}
  apply_to_all={stores.ui.tab_close_confirm.apply_to_all}
  on_save={() =>
    void action_registry.execute(ACTION_IDS.tab_confirm_close_save)}
  on_discard={() =>
    void action_registry.execute(ACTION_IDS.tab_confirm_close_discard)}
  on_cancel={() => void action_registry.execute(ACTION_IDS.tab_cancel_close)}
  on_toggle_apply_to_all={(checked) => {
    stores.ui.tab_close_confirm.apply_to_all = checked;
  }}
/>

<QuitConfirmDialog
  open={stores.ui.quit_confirm.open}
  is_quitting={stores.ui.quit_confirm.is_quitting}
  on_confirm={() => void action_registry.execute(ACTION_IDS.app_confirm_quit)}
  on_cancel={() => void action_registry.execute(ACTION_IDS.app_cancel_quit)}
/>

<VersionHistoryDialog
  open={stores.ui.version_history_dialog.open}
  note_path={stores.ui.version_history_dialog.note_path}
  commits={stores.git.history}
  is_loading={stores.git.is_loading_history}
  is_restoring={stores.op.is_pending("git.restore")}
  selected_commit={stores.git.selected_commit}
  diff={stores.git.selected_diff}
  file_content={stores.git.selected_file_content}
  on_close={() => void action_registry.execute(ACTION_IDS.git_close_history)}
  on_select_commit={(commit) =>
    void action_registry.execute(ACTION_IDS.git_select_commit, commit)}
  on_restore={(commit) =>
    void action_registry.execute(ACTION_IDS.git_restore_version, commit)}
/>

<CheckpointDialog
  open={stores.ui.checkpoint_dialog.open}
  description={stores.ui.checkpoint_dialog.description}
  is_loading={stores.git.sync_status === "committing"}
  on_update_description={(value) =>
    void action_registry.execute(
      ACTION_IDS.git_update_checkpoint_description,
      value,
    )}
  on_confirm={() =>
    void action_registry.execute(ACTION_IDS.git_confirm_checkpoint)}
  on_cancel={() =>
    void action_registry.execute(ACTION_IDS.git_cancel_checkpoint)}
/>

<HelpDialog
  open={stores.ui.help_dialog.open}
  hotkeys_config={stores.ui.hotkeys_config}
  on_close={() => void action_registry.execute(ACTION_IDS.help_close)}
/>

<HotkeyRecorderDialog
  open={stores.ui.hotkey_recorder.open}
  action_id={stores.ui.hotkey_recorder.action_id}
  current_key={stores.ui.hotkey_recorder.current_key}
  pending_key={stores.ui.hotkey_recorder.pending_key}
  conflict={stores.ui.hotkey_recorder.conflict}
  error={stores.ui.hotkey_recorder.error}
  on_record={(key: string) => {
    const recorder = stores.ui.hotkey_recorder;
    if (recorder.action_id) {
      const binding =
        stores.ui.settings_dialog.hotkey_draft_config.bindings.find(
          (b) => b.action_id === recorder.action_id,
        );
      void action_registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: recorder.action_id,
        key,
        phase: binding?.phase ?? "capture",
      });
    }
  }}
  on_save={() => {
    const recorder = stores.ui.hotkey_recorder;
    if (recorder.action_id && recorder.pending_key) {
      const binding =
        stores.ui.settings_dialog.hotkey_draft_config.bindings.find(
          (b) => b.action_id === recorder.action_id,
        );
      void action_registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: recorder.action_id,
        key: recorder.pending_key,
        phase: binding?.phase ?? "capture",
        force: true,
      });
    }
  }}
  on_cancel={() => void action_registry.execute(ACTION_IDS.hotkey_close_editor)}
/>
