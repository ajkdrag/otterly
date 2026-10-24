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

  // The default theme gives --muted and --accent the same fill, so the visual
  // modes get an inset ring to look different from normal. The ring is a
  // shadow, so the badge keeps its size. The theme has no destructive-foreground
  // token, so replace uses the classes of the button's destructive variant.
  const visual_style =
    "bg-accent text-accent-foreground ring-1 ring-primary ring-inset";
  const colors: Record<VimMode, string> = {
    normal: "bg-muted text-muted-foreground",
    insert: "bg-primary text-primary-foreground",
    visual: visual_style,
    visual_line: visual_style,
    visual_block: visual_style,
    replace: "bg-destructive text-white",
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
