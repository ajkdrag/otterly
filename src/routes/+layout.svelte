<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import "../styles/fonts.css";
  import "../styles/design_tokens.css";
  import "../styles/component_overrides.css";
  import "../styles/editor.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "svelte-sonner";
  import { create_logger } from "$lib/shared/utils/logger";
  import { error_message } from "$lib/shared/utils/error_message";
  import { onMount } from "svelte";

  const log = create_logger("app");

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    const on_error = (event: ErrorEvent) => {
      event.preventDefault();
      if (!event.error) return;
      log.error("Unhandled error", { error: error_message(event.error) });
      toast.error("Something went wrong");
    };

    const on_rejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      if (!event.reason) return;
      log.error("Unhandled rejection", { error: error_message(event.reason) });
      toast.error("Something went wrong");
    };

    window.addEventListener("error", on_error);
    window.addEventListener("unhandledrejection", on_rejection);

    return () => {
      window.removeEventListener("error", on_error);
      window.removeEventListener("unhandledrejection", on_rejection);
    };
  });
</script>

<main class="h-full">
  <Toaster
    position="bottom-right"
    offset={36}
    style="
      --normal-bg: var(--color-popover);
      --normal-text: var(--color-popover-foreground);
      --normal-border: var(--color-border);
      --success-bg: var(--interactive-bg);
      --success-text: var(--interactive-text-on-bg);
      --success-border: var(--interactive-border-subtle);
      --error-bg: var(--color-popover);
      --error-text: var(--color-popover-foreground);
      --error-border: var(--color-destructive);
      --warning-bg: var(--warning-bg);
      --warning-text: var(--warning-text-on-bg);
      --warning-border: var(--warning-border);
    "
  />
  {@render children()}
</main>
