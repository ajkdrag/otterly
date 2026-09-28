<script lang="ts">
  import {
    Files,
    LayoutDashboard,
    Settings,
    Star,
    CircleHelp,
    Search,
  } from "@lucide/svelte";

  type SidebarView = "explorer" | "dashboard" | "starred";

  type Props = {
    sidebar_open: boolean;
    active_view: SidebarView;
    on_open_explorer: () => void;
    on_open_dashboard: () => void;
    on_open_starred: () => void;
    on_open_commands: () => void;
    on_open_help: () => void;
    on_open_settings: () => void;
  };

  let {
    sidebar_open,
    active_view,
    on_open_explorer,
    on_open_dashboard,
    on_open_starred,
    on_open_commands,
    on_open_help,
    on_open_settings,
  }: Props = $props();
</script>

<nav class="ActivityBar" aria-label="Workspace views">
  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_commands}
      aria-label="Commands"
      title="Search notes and commands"
    >
      <Search class="ActivityBar__icon" />
    </button>
    <span class="ActivityBar__divider" aria-hidden="true"></span>
    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === "explorer"}
      onclick={on_open_explorer}
      aria-pressed={sidebar_open && active_view === "explorer"}
      aria-label="Explorer"
      title="Explorer"
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
      title="Dashboard"
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
      title="Starred"
    >
      <Star class="ActivityBar__icon" />
    </button>
  </div>

  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_help}
      aria-label="Help"
      title="Help"
    >
      <CircleHelp class="ActivityBar__icon" />
    </button>
    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_settings}
      aria-label="Settings"
      title="Settings"
    >
      <Settings class="ActivityBar__icon" />
    </button>
  </div>
</nav>

<style>
  .ActivityBar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    width: var(--size-activity-bar);
    height: 100%;
    padding-block: var(--space-2);
    background-color: var(--sidebar);
    border-inline-end: 1px solid var(--sidebar-border);
  }

  .ActivityBar__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .ActivityBar__divider {
    width: var(--space-6);
    height: 1px;
    margin: var(--space-1) auto;
    background-color: var(--sidebar-border);
  }

  .ActivityBar__button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-activity-bar) - var(--space-1));
    height: var(--size-activity-bar);
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .ActivityBar__button:hover {
    color: var(--sidebar-foreground);
    background-color: var(--sidebar-accent);
  }

  .ActivityBar__button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .ActivityBar__button--active {
    color: var(--interactive);
    background-color: var(--interactive-bg);
  }

  .ActivityBar__button--active::before {
    content: "";
    position: absolute;
    inset-block: var(--space-1);
    inset-inline-start: 0;
    width: 3px;
    background-color: var(--interactive);
  }

  :global(.ActivityBar__icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    stroke-width: 1.8;
  }
</style>
