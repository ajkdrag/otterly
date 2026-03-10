<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { format_bytes } from "$lib/shared/utils/format_bytes";
  import { tick } from "svelte";

  interface Props {
    open: boolean;
    filename: string;
    estimated_size_bytes: number;
    target_folder: string;
    image_bytes: Uint8Array | null;
    image_mime_type: string | null;
    is_saving: boolean;
    error: string | null;
    on_update_filename: (filename: string) => void;
    on_confirm: () => void;
    on_cancel: () => void;
    on_retry: () => void;
  }

  let {
    open,
    filename,
    estimated_size_bytes,
    target_folder,
    image_bytes,
    image_mime_type,
    is_saving,
    error,
    on_update_filename,
    on_confirm,
    on_cancel,
    on_retry,
  }: Props = $props();

  let input_el = $state<HTMLInputElement | null>(null);

  const formatted_size = $derived(format_bytes(estimated_size_bytes));

  let preview_url = $state<string | null>(null);

  $effect(() => {
    if (!image_bytes || !image_mime_type) {
      preview_url = null;
      return;
    }
    const blob = new Blob([new Uint8Array(image_bytes)], {
      type: image_mime_type,
    });
    const url = URL.createObjectURL(blob);
    preview_url = url;
    return () => URL.revokeObjectURL(url);
  });

  $effect(() => {
    if (open && !error && input_el) {
      const el = input_el;
      void tick().then(() => {
        el.focus();
        el.select();
      });
    }
  });

  function is_valid(): boolean {
    return filename.trim().length > 0;
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_saving) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>{error ? "Save Failed" : "Save Image"}</Dialog.Title>
      <Dialog.Description>
        {error
          ? `Failed to save image: ${error}`
          : "Enter a filename for the image."}
      </Dialog.Description>
    </Dialog.Header>

    {#if !error}
      <div class="space-y-4">
        {#if preview_url}
          <div
            class="flex justify-center rounded-md border border-border bg-muted/50 p-2"
          >
            <img
              src={preview_url}
              alt="Pasted content preview"
              class="max-h-48 max-w-full rounded object-contain"
            />
          </div>
        {/if}
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Size:</span>
          <span class="font-mono">{formatted_size}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Location:</span>
          <span class="font-mono text-muted-foreground">{target_folder}/</span>
        </div>
        <Input
          bind:ref={input_el}
          type="text"
          value={filename}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
            on_update_filename(e.currentTarget.value);
          }}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            on_update_filename(e.currentTarget.value);
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && is_valid() && !is_saving) {
              e.preventDefault();
              on_confirm();
            }
          }}
          placeholder="e.g., image-1234567890.png"
          disabled={is_saving}
        />
      </div>
    {/if}

    <Dialog.Footer>
      {#if error}
        <Button variant="outline" onclick={on_cancel} disabled={is_saving}>
          Cancel
        </Button>
        <Button variant="default" onclick={on_retry} disabled={is_saving}>
          Retry
        </Button>
      {:else}
        <Button variant="outline" onclick={on_cancel} disabled={is_saving}>
          Cancel
        </Button>
        <Button
          variant="default"
          onclick={on_confirm}
          disabled={!is_valid() || is_saving}
        >
          {#if is_saving}
            Saving...
          {:else}
            Save
          {/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
