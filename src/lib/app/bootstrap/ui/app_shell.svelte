<script lang="ts">
  import { onMount } from "svelte";
  import AppShellDialogs from "$lib/app/bootstrap/ui/app_shell_dialogs.svelte";
  import WorkspaceLayout from "$lib/app/bootstrap/ui/workspace_layout.svelte";
  import { VaultSelectionPanel } from "$lib/features/vault";
  import { use_keyboard_shortcuts } from "$lib/hooks/use_keyboard_shortcuts.svelte";
  import { use_external_links } from "$lib/hooks/use_external_links.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { VaultId } from "$lib/shared/types/ids";
  import LoginScreen from "$lib/features/user/ui/login_screen.svelte";
  import BindAccountDialog from "$lib/features/user/ui/bind_account_dialog.svelte";

  type Props = {
    hide_choose_vault_button?: boolean;
  };

  let { hide_choose_vault_button = false }: Props = $props();

  const { stores, action_registry } = use_app_context();

  const external_links = use_external_links({
    open_url: (url) => action_registry.execute(ACTION_IDS.shell_open_url, url),
  });

  const is_authenticated = $derived(stores.user.is_authenticated);
  const is_guest = $derived(stores.user.is_guest);
  const has_vault = $derived(stores.vault.vault !== null);
  const omnibar_open = $derived(stores.ui.omnibar.open);

  let show_bind_dialog = $state(false);

  const any_blocking_dialog_open = $derived(
    stores.ui.system_dialog_open ||
      stores.ui.change_vault.open ||
      stores.ui.change_vault.confirm_discard_open ||
      stores.ui.delete_note_dialog.open ||
      stores.ui.rename_note_dialog.open ||
      stores.ui.save_note_dialog.open ||
      stores.ui.settings_dialog.open ||
      stores.ui.create_folder_dialog.open ||
      stores.ui.delete_folder_dialog.open ||
      stores.ui.rename_folder_dialog.open ||
      stores.ui.image_paste_dialog.open ||
      stores.ui.tab_close_confirm.open ||
      stores.ui.quit_confirm.open ||
      stores.ui.help_dialog.open,
  );

  const vault_selection_loading = $derived(
    stores.ui.startup.status === "loading" || stores.ui.change_vault.is_loading,
  );

  const keyboard = use_keyboard_shortcuts({
    hotkeys_config: () => stores.ui.hotkeys_config,
    is_enabled: () => has_vault && is_authenticated,
    is_blocked: () => any_blocking_dialog_open || omnibar_open,
    is_omnibar_open: () => omnibar_open,
    is_vault_switcher_open: () => stores.ui.change_vault.open,
    has_tabs: () => stores.tab.has_tabs,
    action_registry,
    on_close_vault_switcher: () => {
      void action_registry.execute(ACTION_IDS.vault_close_change);
    },
    on_select_pinned_vault: (slot) => {
      void action_registry.execute(ACTION_IDS.vault_select_pinned_slot, slot);
    },
    on_switch_to_tab: (index) => {
      void action_registry.execute(ACTION_IDS.tab_activate_by_index, index);
    },
  });

  function handle_choose_vault_dir() {
    void action_registry.execute(ACTION_IDS.vault_choose);
  }

  function handle_select_vault(vault_id: VaultId) {
    void action_registry.execute(ACTION_IDS.vault_select, vault_id);
  }

  function handle_login_guest() {
    void action_registry.execute(ACTION_IDS.auth_login_guest);
  }

  async function handle_login_credentials(
    username: string,
    password: string,
  ): Promise<{ status: string; error?: string }> {
    return new Promise((resolve) => {
      void action_registry.execute(ACTION_IDS.auth_login_credentials, {
        username,
        password,
        resolve,
      });
    });
  }

  async function handle_register(
    username: string,
    password: string,
  ): Promise<{ status: string; error?: string }> {
    return new Promise((resolve) => {
      void action_registry.execute(ACTION_IDS.auth_register, {
        username,
        password,
        resolve,
      });
    });
  }

  async function handle_bind_account(
    username: string,
    password: string,
  ): Promise<{ status: string; error?: string }> {
    return new Promise((resolve) => {
      void action_registry.execute(ACTION_IDS.auth_bind_account, {
        username,
        password,
        resolve,
      });
    });
  }

  onMount(() => {
    void action_registry.execute(ACTION_IDS.app_mounted);
  });
</script>

{#if !is_authenticated}
  <LoginScreen
    on_login_guest={handle_login_guest}
    on_login_credentials={handle_login_credentials}
    on_register={handle_register}
  />
{:else if !has_vault}
  <div class="mx-auto max-w-[65ch] p-8">
    {#if is_guest}
      <div class="AppShell__guest-banner">
        <span class="AppShell__guest-banner-text">
          👤 当前为游客身份
        </span>
        <button
          type="button"
          class="AppShell__guest-banner-link"
          onclick={() => (show_bind_dialog = true)}
        >
          绑定账号
        </button>
        <button
          type="button"
          class="AppShell__guest-banner-logout"
          onclick={() => void action_registry.execute(ACTION_IDS.auth_logout)}
        >
          退出
        </button>
      </div>
    {:else}
      <div class="AppShell__guest-banner">
        <span class="AppShell__guest-banner-text">
          🔒 {stores.user.display_name}
        </span>
        <button
          type="button"
          class="AppShell__guest-banner-logout"
          onclick={() => void action_registry.execute(ACTION_IDS.auth_logout)}
        >
          退出登录
        </button>
      </div>
    {/if}
    <VaultSelectionPanel
      recent_vaults={stores.vault.recent_vaults}
      pinned_vault_ids={stores.vault.pinned_vault_ids}
      current_vault_id={null}
      is_loading={vault_selection_loading}
      error={stores.ui.startup.error ?? stores.ui.change_vault.error}
      on_choose_vault_dir={handle_choose_vault_dir}
      on_select_vault={handle_select_vault}
      on_toggle_pin_vault={(vault_id) => {
        void action_registry.execute(ACTION_IDS.vault_toggle_pin, vault_id);
      }}
      on_remove_vault={(vault_id) => {
        void action_registry.execute(
          ACTION_IDS.vault_remove_from_registry,
          vault_id,
        );
      }}
      {hide_choose_vault_button}
    />
  </div>
{:else}
  <main>
    <WorkspaceLayout />
  </main>
{/if}

<AppShellDialogs {hide_choose_vault_button} />

{#if is_authenticated && is_guest}
  <BindAccountDialog
    open={show_bind_dialog}
    on_bind={handle_bind_account}
    on_close={() => (show_bind_dialog = false)}
  />
{/if}

<svelte:window
  onclick={external_links.handle_click}
  onkeydowncapture={keyboard.handle_keydown_capture}
  onkeydown={keyboard.handle_keydown}
/>

<style>
  .AppShell__guest-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    border: 1px solid var(--border);
    font-size: var(--text-sm);
  }

  .AppShell__guest-banner-text {
    color: var(--muted-foreground);
    flex: 1;
  }

  .AppShell__guest-banner-link {
    color: var(--interactive);
    font-weight: 500;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-sm);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .AppShell__guest-banner-link:hover {
    color: var(--interactive-hover);
    text-decoration: underline;
  }

  .AppShell__guest-banner-logout {
    color: var(--muted-foreground);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-sm);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .AppShell__guest-banner-logout:hover {
    color: var(--foreground);
  }
</style>
