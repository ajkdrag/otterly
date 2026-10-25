<script lang="ts">
  import type { VimMode, VimStatus } from "$lib/shared/types/editor";

  type Props = { status: VimStatus };

  let { status }: Props = $props();

  const labels: Record<VimMode, string> = {
    normal: "NORMAL",
    insert: "INSERT",
    insert_normal: "(INSERT)",
    visual: "VISUAL",
    visual_line: "V-LINE",
    visual_block: "V-BLOCK",
    replace: "REPLACE",
  };

  // The default theme gives --muted and --accent the same fill, so the visual
  // modes get an inset ring to look different from normal. The ring is a
  // shadow, so the badge keeps its size. The theme has no destructive-foreground
  // token, so replace uses the classes of the button's destructive variant.
  const ring = "ring-1 ring-primary ring-inset";
  const visual_style = `bg-accent text-accent-foreground ${ring}`;
  const colors: Record<VimMode, string> = {
    normal: "bg-muted text-muted-foreground",
    insert: "bg-primary text-primary-foreground",
    insert_normal: `bg-muted text-muted-foreground ${ring}`,
    visual: visual_style,
    visual_line: visual_style,
    visual_block: visual_style,
    replace: "bg-destructive text-white",
  };
</script>

<!-- The badge and the keys box have fixed widths, so Ln and Col next to them
     do not jump on every key. The recording label only shows while recording,
     like Vim's mode line. -->
<span class="inline-flex items-center gap-2">
  <span
    role="status"
    aria-label="Vim mode"
    class="inline-block w-[8ch] rounded-sm text-center font-mono leading-[1.4] font-medium {colors[
      status.mode
    ]}">{labels[status.mode]}</span
  >
  <span
    aria-hidden="true"
    class="inline-block w-[10ch] overflow-hidden font-mono whitespace-pre text-muted-foreground"
    >{status.showcmd}</span
  >
  {#if status.recording}
    <span class="font-mono text-destructive">recording @{status.recording}</span
    >
  {/if}
</span>
