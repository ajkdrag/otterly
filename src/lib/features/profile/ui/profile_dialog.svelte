<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { normalize_profile_name } from "$lib/features/profile/domain/profile_name";

  type Props = {
    open: boolean;
    profile_ids: string[];
    current_profile_id: string | null;
    new_name: string;
    is_opening: boolean;
    error: string | null;
    on_update_new_name: (name: string) => void;
    on_open_profile: (profile_id: string) => void;
    on_close: () => void;
  };

  let {
    open,
    profile_ids,
    current_profile_id,
    new_name,
    is_opening,
    error,
    on_update_new_name,
    on_open_profile,
    on_close,
  }: Props = $props();

  const parsed_name = $derived(normalize_profile_name(new_name));
  const typed_id = $derived("id" in parsed_name ? parsed_name.id : null);
  const can_open = $derived(
    typed_id !== null && typed_id !== current_profile_id && !is_opening,
  );

  const name_hint = $derived.by(() => {
    if (new_name.trim() === "") {
      return { text: "Letters, digits and dashes, up to 32.", is_error: false };
    }
    if ("error" in parsed_name) {
      return { text: parsed_name.error, is_error: true };
    }
    if (parsed_name.id === current_profile_id) {
      return { text: `"${parsed_name.id}" is this window.`, is_error: false };
    }
    if (profile_ids.includes(parsed_name.id)) {
      return {
        text: `Opens the existing profile "${parsed_name.id}".`,
        is_error: false,
      };
    }
    return { text: `Will be saved as "${parsed_name.id}".`, is_error: false };
  });

  function open_typed_profile() {
    if (typed_id !== null && can_open) on_open_profile(typed_id);
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) on_close();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Profiles</Dialog.Title>
      <Dialog.Description>
        Each profile has its own settings, vault list and window.
      </Dialog.Description>
    </Dialog.Header>

    <ul
      class="max-h-60 divide-y divide-border overflow-y-auto border border-border"
    >
      {#each profile_ids as profile_id (profile_id)}
        {@const is_current = profile_id === current_profile_id}
        <li>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-60"
            disabled={is_current || is_opening}
            onclick={() => on_open_profile(profile_id)}
          >
            <span class="truncate">{profile_id}</span>
            {#if is_current}
              <span class="shrink-0 text-xs text-muted-foreground"
                >this window</span
              >
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    <form
      class="space-y-2"
      onsubmit={(event: SubmitEvent) => {
        event.preventDefault();
        open_typed_profile();
      }}
    >
      <label for="new-profile-name" class="text-sm font-medium"
        >New profile</label
      >
      <div class="flex gap-2">
        <Input
          id="new-profile-name"
          type="text"
          value={new_name}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
            on_update_new_name(e.currentTarget.value)}
          placeholder="work"
          disabled={is_opening}
        />
        <Button type="submit" disabled={!can_open}>Open</Button>
      </div>
      <p
        class="text-sm {name_hint.is_error
          ? 'text-destructive'
          : 'text-muted-foreground'}"
      >
        {name_hint.text}
      </p>
      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}
    </form>
  </Dialog.Content>
</Dialog.Root>
