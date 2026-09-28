<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import VaultSelectionPanel from "$lib/features/vault/ui/vault_selection_panel.svelte";
  import type { Vault } from "$lib/shared/types/vault";
  import type { VaultId } from "$lib/shared/types/ids";

  interface Props {
    open: boolean;
    on_open_change: (open: boolean) => void;
    recent_vaults: Vault[];
    pinned_vault_ids: VaultId[];
    current_vault_id: VaultId | null;
    is_loading?: boolean;
    error?: string | null;
    on_choose_vault_dir: () => void;
    on_select_vault: (vault_id: VaultId) => void;
    on_toggle_pin_vault: (vault_id: VaultId) => void;
    on_remove_vault: (vault_id: VaultId) => void;
    hide_choose_vault_button?: boolean;
  }

  let {
    open,
    on_open_change,
    recent_vaults,
    pinned_vault_ids,
    current_vault_id,
    is_loading = false,
    error = null,
    on_choose_vault_dir,
    on_select_vault,
    on_toggle_pin_vault,
    on_remove_vault,
    hide_choose_vault_button = false,
  }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="VaultDialog font-sans" showCloseButton={false}>
    <VaultSelectionPanel
      is_dialog={true}
      {recent_vaults}
      {pinned_vault_ids}
      {current_vault_id}
      {is_loading}
      {error}
      {on_choose_vault_dir}
      {on_select_vault}
      {on_toggle_pin_vault}
      {on_remove_vault}
      on_close={() => {
        on_open_change(false);
      }}
      {hide_choose_vault_button}
    />
  </Dialog.Content>
</Dialog.Root>

<style>
  :global([data-slot="dialog-content"].VaultDialog) {
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
  }
</style>
