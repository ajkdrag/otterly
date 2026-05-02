<script lang="ts">
  import { onMount } from "svelte";
  import AnimatedTime from "$lib/components/ui/animated-time/animated_time.svelte";

  type Props = {
    streak_days: number;
    size?: "sm" | "md" | "lg";
    show_time?: boolean;
  };

  let { streak_days, size = "md", show_time = false }: Props = $props();

  let frame = $state(0);
  let elapsed_seconds = $state(0);
  let interval_id: ReturnType<typeof setInterval> | null = null;
  let timer_id: ReturnType<typeof setInterval> | null = null;

  // Flame emoji frames for animation
  const flame_frames = ["🔥", "🔥", "🔥", "🔥"];
  const flame_colors = [
    "brightness(1)",
    "brightness(1.15)",
    "brightness(1.3)",
    "brightness(1.15)",
  ];

  const size_classes: Record<string, string> = {
    sm: "StreakFlame--sm",
    md: "StreakFlame--md",
    lg: "StreakFlame--lg",
  };

  onMount(() => {
    // Animate flame at ~4fps
    interval_id = setInterval(() => {
      frame = (frame + 1) % flame_frames.length;
    }, 250);

    // Count elapsed time
    if (show_time) {
      timer_id = setInterval(() => {
        elapsed_seconds += 1;
      }, 1000);
    }

    return () => {
      if (interval_id) clearInterval(interval_id);
      if (timer_id) clearInterval(timer_id);
    };
  });

  function format_elapsed(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }
</script>

<span class="StreakFlame {size_classes[size]}">
  <span
    class="StreakFlame__icon"
    style="filter: {flame_colors[frame]}; transform: scale({1 + frame * 0.03})"
  >
    {flame_frames[frame]}
  </span>
  <span class="StreakFlame__text">
    <span class="StreakFlame__days">{streak_days}</span>
    <span class="StreakFlame__label">天</span>
    {#if show_time && elapsed_seconds > 0}
      <span class="StreakFlame__time">
        <AnimatedTime total_seconds={elapsed_seconds} format="ms" />
      </span>
    {/if}
  </span>
</span>

<style>
  .StreakFlame {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .StreakFlame__icon {
    display: inline-block;
    transition: transform 0.2s ease, filter 0.2s ease;
    animation: flame-dance 1s ease-in-out infinite;
  }

  @keyframes flame-dance {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    25% {
      transform: translateY(-1px) scale(1.05) rotate(-3deg);
    }
    50% {
      transform: translateY(-2px) scale(1.1);
    }
    75% {
      transform: translateY(-1px) scale(1.05) rotate(3deg);
    }
  }

  .StreakFlame__text {
    display: inline-flex;
    align-items: baseline;
    gap: 1px;
  }

  .StreakFlame__days {
    font-weight: 700;
    color: var(--foreground);
  }

  .StreakFlame__label {
    color: var(--muted-foreground);
  }

  .StreakFlame__time {
    color: var(--interactive);
    font-variant-numeric: tabular-nums;
    margin-inline-start: 4px;
  }

  /* Size variants */
  .StreakFlame--sm .StreakFlame__icon {
    font-size: 0.875rem;
  }

  .StreakFlame--sm .StreakFlame__days {
    font-size: var(--text-xs);
  }

  .StreakFlame--sm .StreakFlame__label {
    font-size: var(--text-xs);
  }

  .StreakFlame--sm .StreakFlame__time {
    font-size: 0.625rem;
  }

  .StreakFlame--md .StreakFlame__icon {
    font-size: 1.25rem;
  }

  .StreakFlame--md .StreakFlame__days {
    font-size: var(--text-sm);
  }

  .StreakFlame--md .StreakFlame__label {
    font-size: var(--text-sm);
  }

  .StreakFlame--md .StreakFlame__time {
    font-size: var(--text-xs);
  }

  .StreakFlame--lg .StreakFlame__icon {
    font-size: 1.75rem;
  }

  .StreakFlame--lg .StreakFlame__days {
    font-size: var(--text-lg);
  }

  .StreakFlame--lg .StreakFlame__label {
    font-size: var(--text-sm);
  }

  .StreakFlame--lg .StreakFlame__time {
    font-size: var(--text-sm);
  }
</style>
