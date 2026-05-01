<script lang="ts">
  /**
   * FloatingPoints — shows a "+N" text that floats up and fades out
   * from the bottom-right corner of the app whenever points are earned.
   *
   * Usage: bind `trigger(points)` and call it to show the animation.
   */

  interface FloatItem {
    id: number;
    points: number;
    x_offset: number;
  }

  let items = $state<FloatItem[]>([]);
  let next_id = 0;

  export function trigger(points: number): void {
    if (points <= 0) return;
    const id = next_id++;
    // slight random horizontal jitter so multiple items don't stack exactly
    const x_offset = Math.round((Math.random() - 0.5) * 40);
    items = [...items, { id, points, x_offset }];
    // auto-remove after animation completes
    setTimeout(() => {
      items = items.filter((it) => it.id !== id);
    }, 1800);
  }
</script>

<div class="FloatingPoints" aria-hidden="true">
  {#each items as item (item.id)}
    <span
      class="FloatingPoints__item"
      style="--x-offset: {item.x_offset}px"
    >
      +{item.points} ✨
    </span>
  {/each}
</div>

<style>
  .FloatingPoints {
    position: fixed;
    bottom: 60px;
    right: 32px;
    z-index: 9999;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .FloatingPoints__item {
    position: absolute;
    bottom: 0;
    right: 0;
    font-size: 20px;
    font-weight: 800;
    color: #22c55e;
    text-shadow:
      0 0 8px rgba(34, 197, 94, 0.5),
      0 1px 2px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
    animation: float-up 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    transform: translateX(var(--x-offset, 0));
  }

  @keyframes float-up {
    0% {
      opacity: 1;
      transform: translateY(0) translateX(var(--x-offset, 0)) scale(0.8);
    }
    20% {
      opacity: 1;
      transform: translateY(-20px) translateX(var(--x-offset, 0)) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translateY(-120px) translateX(var(--x-offset, 0)) scale(0.9);
    }
  }
</style>
