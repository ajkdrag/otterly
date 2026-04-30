<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import type {
    UserProfile,
    UserPreferences,
    Badge,
  } from "$lib/features/user/types/user_profile";

  type Props = {
    profile: UserProfile | null;
    all_profiles: UserProfile[];
    on_update_display_name: (name: string) => void;
    on_update_avatar: (emoji: string) => void;
    on_update_preferences: (prefs: Partial<UserPreferences>) => void;
    on_switch_user: (user_id: string) => void;
    on_create_user: (name: string, emoji: string) => void;
  };

  let {
    profile,
    all_profiles,
    on_update_display_name,
    on_update_avatar,
    on_update_preferences,
    on_switch_user,
    on_create_user,
  }: Props = $props();

  let editing_name = $state(false);
  let draft_name = $state("");
  let show_create_form = $state(false);
  let new_user_name = $state("");
  let new_user_emoji = $state("👤");

  const avatar_options = [
    "👤",
    "👨",
    "👩",
    "🧑",
    "👦",
    "👧",
    "🧒",
    "👨‍💻",
    "👩‍💻",
    "🧑‍💻",
    "👨‍🎓",
    "👩‍🎓",
    "🧑‍🎓",
    "👨‍🏫",
    "👩‍🏫",
    "🦊",
    "🐱",
    "🐶",
    "🐼",
    "🦉",
    "🌟",
    "🌈",
    "🎯",
    "🚀",
  ];

  const sidebar_view_options = [
    { value: "explorer", label: "文件浏览器" },
    { value: "dashboard", label: "仪表盘" },
    { value: "starred", label: "收藏" },
    { value: "stats", label: "统计" },
    { value: "modules", label: "模块" },
  ];

  const startup_options = [
    { value: "last_vault", label: "打开上次的仓库" },
    { value: "vault_picker", label: "选择仓库" },
    { value: "empty", label: "空白页面" },
  ];

  function start_editing_name(): void {
    if (!profile) return;
    draft_name = profile.display_name;
    editing_name = true;
  }

  function save_name(): void {
    if (draft_name.trim()) {
      on_update_display_name(draft_name.trim());
    }
    editing_name = false;
  }

  function cancel_edit_name(): void {
    editing_name = false;
  }

  function handle_create_user(): void {
    if (new_user_name.trim()) {
      on_create_user(new_user_name.trim(), new_user_emoji);
      new_user_name = "";
      new_user_emoji = "👤";
      show_create_form = false;
    }
  }

  function format_date(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }
</script>

{#if profile}
  <div class="UserProfile">
    <!-- User Avatar & Name -->
    <div class="UserProfile__header">
      <div class="UserProfile__avatar-section">
        <div class="UserProfile__avatar">
          <span class="UserProfile__avatar-emoji">{profile.avatar_emoji}</span>
        </div>
        <div class="UserProfile__avatar-picker">
          {#each avatar_options as emoji (emoji)}
            <button
              type="button"
              class="UserProfile__avatar-option"
              class:UserProfile__avatar-option--active={profile.avatar_emoji ===
                emoji}
              onclick={() => on_update_avatar(emoji)}
            >
              {emoji}
            </button>
          {/each}
        </div>
      </div>

      <div class="UserProfile__name-section">
        {#if editing_name}
          <div class="UserProfile__name-edit">
            <Input
              type="text"
              value={draft_name}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                draft_name = e.currentTarget.value;
              }}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") save_name();
                if (e.key === "Escape") cancel_edit_name();
              }}
              class="w-40"
              placeholder="用户名"
            />
            <Button variant="outline" size="sm" onclick={save_name}>保存</Button
            >
            <Button variant="ghost" size="sm" onclick={cancel_edit_name}
              >取消</Button
            >
          </div>
        {:else}
          <button
            type="button"
            class="UserProfile__name"
            onclick={start_editing_name}
            title="点击编辑用户名"
          >
            {profile.display_name}
          </button>
        {/if}
        <span class="UserProfile__join-date"
          >加入于 {format_date(profile.created_at)}</span
        >
      </div>
    </div>

    <!-- Level & Points -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">等级信息</h3>
      <div class="UserProfile__level-card">
        <div class="UserProfile__level-header">
          <span class="UserProfile__level-icon">{profile.level_icon}</span>
          <div class="UserProfile__level-info">
            <span class="UserProfile__level-label"
              >Lv.{profile.level} {profile.level_title}</span
            >
            <span class="UserProfile__level-points"
              >{profile.total_points.toLocaleString()} 积分</span
            >
          </div>
        </div>
        <div class="UserProfile__streak">
          <span class="UserProfile__streak-icon">🔥</span>
          <span class="UserProfile__streak-text"
            >连续 {profile.streak_days} 天</span
          >
        </div>
      </div>
    </div>

    <!-- Badges -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">
        成就徽章 ({profile.badges.length})
      </h3>
      {#if profile.badges.length > 0}
        <div class="UserProfile__badges">
          {#each profile.badges as badge (badge.id)}
            <div class="UserProfile__badge" title={badge.description}>
              <span class="UserProfile__badge-icon">{badge.icon}</span>
              <span class="UserProfile__badge-name">{badge.name}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="UserProfile__empty-text">还没有获得徽章，继续努力！</p>
      {/if}
    </div>

    <!-- Recent Folders -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">最近打开的文件夹</h3>
      {#if profile.recent_folders.length > 0}
        <div class="UserProfile__recent-folders">
          {#each profile.recent_folders as folder (folder)}
            <div class="UserProfile__folder-item" title={folder}>
              <span class="UserProfile__folder-icon">📁</span>
              <span class="UserProfile__folder-path"
                >{folder.split("/").at(-1) ?? folder}</span
              >
            </div>
          {/each}
        </div>
      {:else}
        <p class="UserProfile__empty-text">还没有打开过文件夹</p>
      {/if}
    </div>

    <!-- Preferences -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">个性化设置</h3>

      <div class="UserProfile__pref-rows">
        <div class="UserProfile__pref-row">
          <div class="UserProfile__pref-label-group">
            <span class="UserProfile__pref-label">默认侧边栏视图</span>
            <span class="UserProfile__pref-desc">启动时显示的侧边栏面板</span>
          </div>
          <Select.Root
            type="single"
            value={profile.preferences.default_sidebar_view}
            onValueChange={(v: string | undefined) => {
              if (v)
                on_update_preferences({
                  default_sidebar_view:
                    v as UserPreferences["default_sidebar_view"],
                });
            }}
          >
            <Select.Trigger class="w-32">
              <span data-slot="select-value"
                >{sidebar_view_options.find(
                  (o) => o.value === profile.preferences.default_sidebar_view,
                )?.label ?? profile.preferences.default_sidebar_view}</span
              >
            </Select.Trigger>
            <Select.Content>
              {#each sidebar_view_options as opt (opt.value)}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="UserProfile__pref-row">
          <div class="UserProfile__pref-label-group">
            <span class="UserProfile__pref-label">启动行为</span>
            <span class="UserProfile__pref-desc">应用启动时的默认行为</span>
          </div>
          <Select.Root
            type="single"
            value={profile.preferences.startup_action}
            onValueChange={(v: string | undefined) => {
              if (v)
                on_update_preferences({
                  startup_action: v as UserPreferences["startup_action"],
                });
            }}
          >
            <Select.Trigger class="w-36">
              <span data-slot="select-value"
                >{startup_options.find(
                  (o) => o.value === profile.preferences.startup_action,
                )?.label ?? profile.preferences.startup_action}</span
              >
            </Select.Trigger>
            <Select.Content>
              {#each startup_options as opt (opt.value)}
                <Select.Item value={opt.value}>{opt.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="UserProfile__pref-row">
          <div class="UserProfile__pref-label-group">
            <span class="UserProfile__pref-label">通知提醒</span>
            <span class="UserProfile__pref-desc">获得积分和成就时显示通知</span>
          </div>
          <Switch.Root
            checked={profile.preferences.notifications_enabled}
            onCheckedChange={(v: boolean) => {
              on_update_preferences({ notifications_enabled: v });
            }}
          />
        </div>
      </div>
    </div>

    <!-- Multi-user Management -->
    {#if all_profiles.length > 1}
      <div class="UserProfile__section">
        <h3 class="UserProfile__section-title">切换用户</h3>
        <div class="UserProfile__user-list">
          {#each all_profiles as user (user.id)}
            <button
              type="button"
              class="UserProfile__user-item"
              class:UserProfile__user-item--active={user.id === profile.id}
              onclick={() => {
                if (user.id !== profile.id) on_switch_user(user.id);
              }}
              disabled={user.id === profile.id}
            >
              <span class="UserProfile__user-avatar">{user.avatar_emoji}</span>
              <span class="UserProfile__user-name">{user.display_name}</span>
              <span class="UserProfile__user-level"
                >{user.level_icon} Lv.{user.level}</span
              >
              {#if user.id === profile.id}
                <span class="UserProfile__user-current">当前</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Create New User -->
    <div class="UserProfile__section">
      {#if show_create_form}
        <div class="UserProfile__create-form">
          <h3 class="UserProfile__section-title">创建新用户</h3>
          <div class="UserProfile__create-fields">
            <Input
              type="text"
              value={new_user_name}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                new_user_name = e.currentTarget.value;
              }}
              placeholder="输入用户名"
              class="w-full"
            />
            <div class="UserProfile__create-emoji-picker">
              {#each avatar_options.slice(0, 12) as emoji (emoji)}
                <button
                  type="button"
                  class="UserProfile__avatar-option"
                  class:UserProfile__avatar-option--active={new_user_emoji ===
                    emoji}
                  onclick={() => (new_user_emoji = emoji)}
                >
                  {emoji}
                </button>
              {/each}
            </div>
            <div class="UserProfile__create-actions">
              <Button
                variant="outline"
                size="sm"
                onclick={() => (show_create_form = false)}>取消</Button
              >
              <Button
                size="sm"
                onclick={handle_create_user}
                disabled={!new_user_name.trim()}>创建</Button
              >
            </div>
          </div>
        </div>
      {:else}
        <Button
          variant="outline"
          class="w-full"
          onclick={() => (show_create_form = true)}
        >
          ＋ 添加新用户
        </Button>
      {/if}
    </div>
  </div>
{:else}
  <div class="UserProfile__loading">
    <p>正在加载用户信息...</p>
  </div>
{/if}

<style>
  .UserProfile {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .UserProfile__header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .UserProfile__avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .UserProfile__avatar {
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background-color: var(--muted);
    border: 2px solid var(--border);
  }

  .UserProfile__avatar-emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .UserProfile__avatar-picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    max-width: 12rem;
  }

  .UserProfile__avatar-option {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all var(--duration-fast) var(--ease-default);
  }

  .UserProfile__avatar-option:hover {
    background-color: var(--muted);
    border-color: var(--border);
  }

  .UserProfile__avatar-option--active {
    background-color: var(--interactive-bg);
    border-color: var(--interactive);
  }

  .UserProfile__name-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UserProfile__name {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .UserProfile__name:hover {
    color: var(--interactive);
  }

  .UserProfile__name-edit {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .UserProfile__join-date {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .UserProfile__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .UserProfile__section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
  }

  .UserProfile__level-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  .UserProfile__level-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .UserProfile__level-icon {
    font-size: 1.75rem;
    line-height: 1;
  }

  .UserProfile__level-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .UserProfile__level-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
  }

  .UserProfile__level-points {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .UserProfile__streak {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .UserProfile__streak-icon {
    font-size: 1.25rem;
  }

  .UserProfile__streak-text {
    font-size: var(--text-sm);
    color: var(--foreground);
    font-weight: 500;
  }

  .UserProfile__badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .UserProfile__badge {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    border: 1px solid var(--border);
    cursor: default;
  }

  .UserProfile__badge-icon {
    font-size: 1rem;
  }

  .UserProfile__badge-name {
    font-size: var(--text-xs);
    color: var(--foreground);
    font-weight: 500;
  }

  .UserProfile__empty-text {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-style: italic;
  }

  .UserProfile__recent-folders {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UserProfile__folder-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--foreground);
  }

  .UserProfile__folder-item:hover {
    background-color: var(--muted);
  }

  .UserProfile__folder-icon {
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .UserProfile__folder-path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .UserProfile__pref-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .UserProfile__pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .UserProfile__pref-label-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .UserProfile__pref-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .UserProfile__pref-desc {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .UserProfile__user-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UserProfile__user-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .UserProfile__user-item:hover:not(:disabled) {
    background-color: var(--muted);
  }

  .UserProfile__user-item--active {
    background-color: var(--interactive-bg);
    border-color: var(--interactive);
    cursor: default;
  }

  .UserProfile__user-item:disabled {
    cursor: default;
  }

  .UserProfile__user-avatar {
    font-size: 1.25rem;
  }

  .UserProfile__user-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    flex: 1;
  }

  .UserProfile__user-level {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .UserProfile__user-current {
    font-size: var(--text-xs);
    color: var(--interactive);
    font-weight: 600;
  }

  .UserProfile__create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .UserProfile__create-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .UserProfile__create-emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .UserProfile__create-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .UserProfile__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
