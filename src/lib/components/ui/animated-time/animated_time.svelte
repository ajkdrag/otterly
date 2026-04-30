<script lang="ts">
  /**
   * AnimatedTime — displays a duration with rolling digit animation.
   * Each digit scrolls vertically when it changes.
   *
   * Props:
   *   total_seconds: the number of seconds to display
   *   format: "hms" | "ms" — whether to show hours
   */
  type Props = {
    total_seconds: number;
    format?: "hms" | "ms";
    class?: string;
  };

  let { total_seconds, format = "hms", class: extra_class = "" }: Props = $props();

  interface TimeParts {
    hours: number;
    minutes: number;
    seconds: number;
  }

  const parts = $derived.by((): TimeParts => {
    const s = Math.max(0, Math.floor(total_seconds));
    return {
      hours: Math.floor(s / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60,
    };
  });

  const show_hours = $derived(format === "hms" && parts.hours > 0);

  /** Pad a number to 2 digits */
  function pad2(n: number): string {
    return n.toString().padStart(2, "0");
  }

  /** Split a display value into individual characters */
  function chars_of(n: number, pad: boolean = true): string[] {
    const s = pad ? pad2(n) : n.toString();
    return s.split("");
  }

  const hour_chars = $derived(chars_of(parts.hours, false));
  const min_chars = $derived(chars_of(parts.minutes, !show_hours ? false : true));
  const sec_chars = $derived(chars_of(parts.seconds));

  const digits = "0123456789".split("");
</script>

<span class="AnimTime {extra_class}" aria-label="{parts.hours}h {parts.minutes}m {parts.seconds}s">
  {#if show_hours}
    <span class="AnimTime__group">
      {#each hour_chars as ch, i (i)}
        <span class="AnimTime__digit-wrap">
          <span
            class="AnimTime__digit-strip"
            style="transform: translateY(-{parseInt(ch) * 100}%)"
          >
            {#each digits as d (d)}
              <span class="AnimTime__digit">{d}</span>
            {/each}
          </span>
        </span>
      {/each}
      <span class="AnimTime__unit">h</span>
    </span>
  {/if}

  <span class="AnimTime__group">
    {#each min_chars as ch, i (i)}
      <span class="AnimTime__digit-wrap">
        <span
          class="AnimTime__digit-strip"
          style="transform: translateY(-{parseInt(ch) * 100}%)"
        >
          {#each digits as d (d)}
            <span class="AnimTime__digit">{d}</span>
          {/each}
        </span>
      </span>
    {/each}
    <span class="AnimTime__unit">m</span>
  </span>

  <span class="AnimTime__group">
    {#each sec_chars as ch, i (i)}
      <span class="AnimTime__digit-wrap">
        <span
          class="AnimTime__digit-strip"
          style="transform: translateY(-{parseInt(ch) * 100}%)"
        >
          {#each digits as d (d)}
            <span class="AnimTime__digit">{d}</span>
          {/each}
        </span>
      </span>
    {/each}
    <span class="AnimTime__unit">s</span>
  </span>
</span>

<style>
  .AnimTime {
    display: inline-flex;
    align-items: baseline;
    gap: 1px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .AnimTime__group {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
  }

  .AnimTime__digit-wrap {
    display: inline-block;
    height: 1.2em;
    overflow: hidden;
    position: relative;
    width: 0.65em;
  }

  .AnimTime__digit-strip {
    display: flex;
    flex-direction: column;
    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .AnimTime__digit {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.2em;
    font-weight: 700;
    color: var(--foreground);
  }

  .AnimTime__unit {
    font-size: 0.7em;
    font-weight: 500;
    color: var(--muted-foreground);
    margin-inline-start: 1px;
    margin-inline-end: 3px;
    align-self: flex-end;
    line-height: 1.6;
  }
</style>
