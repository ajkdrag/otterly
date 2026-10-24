<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { format_theme_file_error } from "$lib/features/theme";
  import type { ThemeFileState } from "$lib/shared/types/theme";

  type Props = {
    theme_file: ThemeFileState;
    // The file theme is the active one. A valid file can sit unused.
    is_applied: boolean;
    on_open: () => void;
    on_reveal: () => void;
    on_copy_path: () => void;
    on_create: () => void;
  };

  let {
    theme_file,
    is_applied,
    on_open,
    on_reveal,
    on_copy_path,
    on_create,
  }: Props = $props();

  const error_count = $derived(theme_file.errors.length);
  // The path is null when the backend could not read the file (too big, not
  // text, or both theme.yaml and theme.json exist). Open and Reveal stay on,
  // because the backend finds the file itself.
  const has_path = $derived(theme_file.path !== null);
</script>

<section
  class="mb-5 flex flex-col gap-3 rounded-md border bg-card p-3 text-card-foreground"
  aria-label="Theme file"
>
  <div class="flex items-center justify-between gap-3">
    <span class="text-sm font-medium">Theme file</span>
    {#if theme_file.status === "missing"}
      <Badge variant="secondary">Not created</Badge>
    {:else if theme_file.status === "invalid"}
      <Badge variant="destructive"
        >{error_count} {error_count === 1 ? "error" : "errors"}</Badge
      >
    {:else}
      <Badge variant={is_applied ? "default" : "outline"}
        >{is_applied ? "Applied" : "Valid"}</Badge
      >
    {/if}
  </div>

  {#if theme_file.status === "missing"}
    <p class="text-xs text-muted-foreground">
      Style Otterly from a text editor or a coding agent. Changes apply as soon
      as the file is saved.
    </p>
  {/if}

  {#if has_path}
    <code
      class="rounded-sm bg-muted px-2 py-1 font-mono text-xs break-all text-muted-foreground select-all"
      >{theme_file.path}</code
    >
  {/if}

  {#if theme_file.status === "invalid"}
    <ul
      class="flex max-h-36 flex-col gap-1 overflow-y-auto font-mono text-xs text-destructive"
      aria-label="Theme file errors"
    >
      {#each theme_file.errors as error, idx (idx)}
        <li>{format_theme_file_error(error)}</li>
      {/each}
    </ul>
    {#if theme_file.theme}
      <p class="text-xs text-muted-foreground">
        Keeping the last valid version until this is fixed.
      </p>
    {/if}
  {/if}

  <div class="flex flex-wrap gap-2">
    {#if theme_file.status === "missing"}
      <Button size="sm" onclick={on_create}>Create from current theme</Button>
    {:else}
      <Button size="sm" variant="outline" onclick={on_open}>Open</Button>
      <Button size="sm" variant="outline" onclick={on_reveal}>Reveal</Button>
    {/if}
    <Button
      size="sm"
      variant="outline"
      onclick={on_copy_path}
      disabled={!has_path}>Copy path</Button
    >
  </div>
</section>
