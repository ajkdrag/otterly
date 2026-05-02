<script lang="ts">
  import {
    Files,
    LayoutDashboard,
    Settings,
    Star,
    CircleHelp,
    BarChart3,
    Blocks,
  } from "@lucide/svelte";

  type SidebarView = "explorer" | "dashboard" | "starred" | "stats" | "modules";

  type Props = {
    sidebar_open: boolean;
    active_view: SidebarView;
    user_avatar_emoji: string;
    user_level: number;
    user_level_icon: string;
    on_open_explorer: () => void;
    on_open_dashboard: () => void;
    on_open_starred: () => void;
    on_open_stats: () => void;
    on_open_modules: () => void;
    on_open_help: () => void;
    on_open_settings: () => void;
    on_open_profile: () => void;
  };

  let {
    sidebar_open,
    active_view,
    user_avatar_emoji = "👤",
    user_level = 0,
    user_level_icon = "👶",
    on_open_explorer,
    on_open_dashboard,
    on_open_starred,
    on_open_stats,
    on_open_modules,
    on_open_help,
    on_open_settings,
    on_open_profile,
  }: Props = $props();
</script>

<div class="ActivityBar">
  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "explorer"}
      onclick={on_open_explorer}
      aria-pressed={sidebar_open && active_view === "explorer"}
      aria-label="Explorer"
    >
      <Files class="ActivityBar__icon" />
    </button>

    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "dashboard"}
      onclick={on_open_dashboard}
      aria-pressed={sidebar_open && active_view === "dashboard"}
      aria-label="Dashboard"
    >
      <LayoutDashboard class="ActivityBar__icon" />
    </button>

    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "starred"}
      onclick={on_open_starred}
      aria-pressed={sidebar_open && active_view === "starred"}
      aria-label="Starred"
    >
      <Star class="ActivityBar__icon" />
    </button>

    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "stats"}
      onclick={on_open_stats}
      aria-pressed={sidebar_open && active_view === "stats"}
      aria-label="Statistics"
    >
      <BarChart3 class="ActivityBar__icon" />
    </button>

    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "modules"}
      onclick={on_open_modules}
      aria-pressed={sidebar_open && active_view === "modules"}
      aria-label="System Modules"
    >
      <Blocks class="ActivityBar__icon" />
    </button>
  </div>

  <div class="ActivityBar__section">
    <!-- User Profile Quick Access -->
    <button
      type="button"
      class="ActivityBar__user-button"
      onclick={on_open_profile}
      aria-label="User Profile"
      title="用户信息"
    >
      <span class="ActivityBar__user-avatar">{user_avatar_emoji}</span>
      <span class="ActivityBar__user-level">{user_level_icon}</span>
    </button>

    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_help}
      aria-label="Help"
    >
      <CircleHelp class="ActivityBar__icon" />
    </button>
    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_settings}
      aria-label="Settings"
    >
      <Settings class="ActivityBar__icon" />
    </button>
  </div>
</div>

<style>
  .ActivityBar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    width: var(--size-activity-bar);
    height: 100%;
    padding-block: var(--space-1);
    background-color: var(--sidebar);
    border-inline-end: 1px solid var(--sidebar-border);
  }

  .ActivityBar__section {
    display: flex;
    flex-direction: column;
  }

  .ActivityBar__button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-activity-bar);
    height: var(--size-activity-bar);
    color: var(--sidebar-foreground);
    opacity: 0.35;
    transition:
      opacity var(--duration-normal) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .ActivityBar__button:hover {
    opacity: 1;
  }

  .ActivityBar__button:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .ActivityBar__button--active {
    opacity: 0.9;
  }

  .ActivityBar__button--active::before {
    content: "";
    position: absolute;
    inset-block: var(--space-2);
    inset-inline-start: 0;
    width: 2px;
    background-color: var(--interactive);
    border-radius: 1px;
  }

  :global(.ActivityBar__icon) {
    width: var(--size-activity-icon);
    height: var(--size-activity-icon);
  }

  /* User profile button */
  .ActivityBar__user-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-activity-bar);
    height: var(--size-activity-bar);
    cursor: pointer;
    transition:
      opacity var(--duration-normal) var(--ease-default),
      transform var(--duration-fast) var(--ease-default);
  }

  .ActivityBar__user-button:hover {
    transform: scale(1.1);
  }

  .ActivityBar__user-button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .ActivityBar__user-avatar {
    font-size: 1.25rem;
    line-height: 1;
  }

  .ActivityBar__user-level {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 0.625rem;
    line-height: 1;
  }
</style>
