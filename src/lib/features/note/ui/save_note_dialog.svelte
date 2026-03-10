<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import type { NotePath } from "$lib/shared/types/ids";
  import { sanitize_note_name } from "$lib/features/note/domain/sanitize_note_name";
  import { tick } from "svelte";

  interface Props {
    open: boolean;
    new_path: NotePath | null;
    folder_path: string;
    is_saving: boolean;
    is_checking: boolean;
    show_overwrite_confirm: boolean;
    error: string | null;
    on_update_path: (path: NotePath) => void;
    on_confirm: () => void;
    on_confirm_overwrite: () => void;
    on_retry: () => void;
    on_cancel: () => void;
  }

  let {
    open,
    new_path,
    folder_path,
    is_saving,
    is_checking,
    show_overwrite_confirm,
    error,
    on_update_path,
    on_confirm,
    on_confirm_overwrite,
    on_retry,
    on_cancel,
  }: Props = $props();

  let input_el = $state<HTMLInputElement | null>(null);

  const display_filename = $derived.by(() => {
    if (!new_path) return "";
    const path = String(new_path);
    const last_slash = path.lastIndexOf("/");
    let filename = last_slash >= 0 ? path.slice(last_slash + 1) : path;
    // Strip .md extension for display (user only types basename)
    if (filename.endsWith(".md")) {
      filename = filename.slice(0, -3);
    }
    return filename;
  });

  $effect(() => {
    if (open && !show_overwrite_confirm && !error && input_el) {
      const el = input_el;
      void tick().then(() => {
        el.focus();
      });
    }
  });

  function update_filename(value: string) {
    // Sanitize the filename (ensures .md extension, handles special chars)
    const sanitized = sanitize_note_name(value);
    const full_path = folder_path ? `${folder_path}/${sanitized}` : sanitized;
    on_update_path(full_path as NotePath);
  }

  function get_title() {
    if (error) return "Save Failed";
    if (show_overwrite_confirm) return "File Already Exists";
    return "Save Note";
  }

  function get_description() {
    if (error) return `Failed to save note: ${error}`;
    if (show_overwrite_confirm)
      return `A note already exists at "${new_path ?? ""}". Do you want to overwrite it?`;
    return "Enter a filename for your note.";
  }

  function is_valid(): boolean {
    return display_filename.trim().length > 0;
  }

  const is_busy = $derived(is_saving || is_checking);
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_busy) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>{get_title()}</Dialog.Title>
      <Dialog.Description>
        {get_description()}
      </Dialog.Description>
    </Dialog.Header>

    {#if !error && !show_overwrite_confirm}
      <div class="space-y-4">
        {#if folder_path}
          <p class="text-sm text-muted-foreground">Location: {folder_path}/</p>
        {/if}
        <div class="flex items-center">
          <Input
            bind:ref={input_el}
            type="text"
            value={display_filename}
            onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
              update_filename(e.currentTarget.value);
            }}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
              update_filename(e.currentTarget.value);
            }}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter" && is_valid() && !is_busy) {
                e.preventDefault();
                on_confirm();
              }
            }}
            placeholder="e.g., my-note"
            disabled={is_busy}
            class="rounded-r-none"
          />
          <span
            class="px-3 py-2 bg-muted text-muted-foreground border border-l-0 rounded-r-md text-sm"
          >
            .md
          </span>
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      {#if show_overwrite_confirm}
        <Button variant="outline" onclick={on_cancel} disabled={is_saving}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onclick={on_confirm_overwrite}
          disabled={is_saving}
        >
          {#if is_saving}
            Saving...
          {:else}
            Overwrite
          {/if}
        </Button>
      {:else if error}
        <Button variant="outline" onclick={on_cancel} disabled={is_saving}>
          Cancel
        </Button>
        <Button variant="default" onclick={on_retry} disabled={is_saving}>
          Retry
        </Button>
      {:else}
        <Button variant="outline" onclick={on_cancel} disabled={is_busy}>
          Cancel
        </Button>
        <Button
          variant="default"
          onclick={on_confirm}
          disabled={!is_valid() || is_busy}
        >
          {#if is_checking}
            Checking...
          {:else if is_saving}
            Saving...
          {:else}
            Save
          {/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
