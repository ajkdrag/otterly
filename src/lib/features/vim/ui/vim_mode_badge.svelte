<script lang="ts">
  import type { VimMode } from "$lib/shared/types/editor";

  type Props = { mode: VimMode };

  let { mode }: Props = $props();

  const labels: Record<VimMode, string> = {
    normal: "NORMAL",
    insert: "INSERT",
    visual: "VISUAL",
    visual_line: "V-LINE",
    visual_block: "V-BLOCK",
    replace: "REPLACE",
  };

  // The theme has no destructive-foreground token. primary-foreground is the
  // light-on-dark text in both color schemes, which reads on destructive too.
  const colors: Record<VimMode, string> = {
    normal: "bg-muted text-muted-foreground",
    insert: "bg-primary text-primary-foreground",
    visual: "bg-accent text-accent-foreground",
    visual_line: "bg-accent text-accent-foreground",
    visual_block: "bg-accent text-accent-foreground",
    replace: "bg-destructive text-primary-foreground",
  };
</script>

<!-- A fixed width the size of the longest label keeps the bar from jumping. -->
<span
  role="status"
  aria-label="Vim mode"
  class="inline-block w-[8ch] rounded-sm text-center font-mono leading-[1.4] font-medium {colors[
    mode
  ]}">{labels[mode]}</span
>
