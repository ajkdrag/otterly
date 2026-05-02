<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { get_level_progress } from "$lib/features/user/types/growth_levels";
  import StreakFlame from "$lib/features/user/ui/streak_flame.svelte";
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
    on_create_user: (name: string, emoji: string, password?: string) => void;
    on_delete_user?: (user_id: string) => void;
    on_change_password?: (current_password: string, new_password: string) => Promise<{ success: boolean; error?: string }>;
    on_verify_password?: (user_id: string, password: string) => Promise<boolean>;
    on_open_note?: (note_path: string) => void;
  };

  let {
    profile,
    all_profiles,
    on_update_display_name,
    on_update_avatar,
    on_update_preferences,
    on_switch_user,
    on_create_user,
    on_delete_user = () => {},
    on_change_password = async () => ({ success: false, error: "不可用" }),
    on_verify_password = async () => true,
    on_open_note = () => {},
  }: Props = $props();

  const BADGES_NOTE_PATH = "docs/badges.md";

  function open_badges_doc(): void {
    on_open_note(BADGES_NOTE_PATH);
  }

  let editing_name = $state(false);
  let draft_name = $state("");
  let show_create_form = $state(false);
  let new_user_name = $state("");
  let new_user_emoji = $state("👤");
  let new_user_password = $state("");
  let confirm_delete_id = $state<string | null>(null);

  // All possible badges (design spec)
  const ALL_BADGES: Array<{ id: string; name: string; icon: string; description: string }> = [
    { id: "early_bird", name: "早起鸟", icon: "🌅", description: "连续5天在早上8点前打开App" },
    { id: "night_owl", name: "夜猫子", icon: "🦉", description: "连续5天在晚上10点后使用App" },
    { id: "reading_marathon", name: "阅读马拉松", icon: "📖", description: "一天内完成阅读20个文件" },
    { id: "creative_maniac", name: "创作狂人", icon: "✍️", description: "一天内创建10篇笔记" },
    { id: "knowledge_networker", name: "知识网络师", icon: "🔗", description: "创建50个Wiki-links" },
    { id: "streak_30", name: "连续30天", icon: "🔥", description: "连续30天打开App" },
    { id: "data_lover", name: "数据爱好者", icon: "📊", description: "查看NLP分析100次" },
    { id: "org_master", name: "整理大师", icon: "🗂️", description: "知识库超过1000个文件" },
    { id: "author_100k", name: "十万字作者", icon: "📝", description: "总字数超过100,000" },
    { id: "multilingual", name: "多语言学者", icon: "🌍", description: "知识库包含3种以上语言" },
  ];

  // Password change state
  let show_password_form = $state(false);
  let current_password = $state("");
  let new_password = $state("");
  let confirm_password = $state("");
  let password_error = $state<string | null>(null);
  let password_success = $state(false);
  let is_changing_password = $state(false);

  // Switch user password state
  let switch_target_id = $state<string | null>(null);
  let switch_password = $state("");
  let switch_error = $state<string | null>(null);
  let is_verifying = $state(false);

  const avatar_options = [
    "👤", "👨", "👩", "🧑", "👦", "👧", "🧒",
    "👨‍💻", "👩‍💻", "🧑‍💻", "👨‍🎓", "👩‍🎓", "🧑‍🎓",
    "👨‍🏫", "👩‍🏫", "🦊", "🐱", "🐶", "🐼", "🦉",
    "🌟", "🌈", "🎯", "🚀",
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

  const level_progress = $derived.by(() => {
    if (!profile) return null;
    return get_level_progress(profile.level, profile.total_points);
  });

  const has_password = $derived(!!profile?.password_hash);

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
      on_create_user(new_user_name.trim(), new_user_emoji, new_user_password || undefined);
      new_user_name = "";
      new_user_emoji = "👤";
      new_user_password = "";
      show_create_form = false;
    }
  }

  function handle_delete_user(user_id: string): void {
    on_delete_user(user_id);
    confirm_delete_id = null;
  }

  async function handle_change_password(): Promise<void> {
    password_error = null;
    password_success = false;

    if (new_password !== confirm_password) {
      password_error = "两次输入的新密码不一致";
      return;
    }

    if (new_password && new_password.length < 4) {
      password_error = "密码长度至少4位";
      return;
    }

    is_changing_password = true;
    try {
      const result = await on_change_password(current_password, new_password);
      if (result.success) {
        password_success = true;
        current_password = "";
        new_password = "";
        confirm_password = "";
        setTimeout(() => {
          show_password_form = false;
          password_success = false;
        }, 1500);
      } else {
        password_error = result.error ?? "修改密码失败";
      }
    } finally {
      is_changing_password = false;
    }
  }

  function cancel_password_change(): void {
    show_password_form = false;
    current_password = "";
    new_password = "";
    confirm_password = "";
    password_error = null;
    password_success = false;
  }

  async function handle_switch_with_password(user_id: string): Promise<void> {
    // Find the target user to check if they have a password
    const target = all_profiles.find((u) => u.id === user_id);
    if (!target) return;

    if (!target.password_hash) {
      // No password set, switch directly
      on_switch_user(user_id);
      return;
    }

    // Show password prompt
    switch_target_id = user_id;
    switch_password = "";
    switch_error = null;
  }

  async function confirm_switch_with_password(): Promise<void> {
    if (!switch_target_id) return;
    is_verifying = true;
    switch_error = null;

    try {
      const valid = await on_verify_password(switch_target_id, switch_password);
      if (valid) {
        on_switch_user(switch_target_id);
        switch_target_id = null;
        switch_password = "";
      } else {
        switch_error = "密码不正确";
      }
    } finally {
      is_verifying = false;
    }
  }

  function cancel_switch(): void {
    switch_target_id = null;
    switch_password = "";
    switch_error = null;
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
              class:UserProfile__avatar-option--active={profile.avatar_emoji === emoji}
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
            <Button variant="outline" size="sm" onclick={save_name}>保存</Button>
            <Button variant="ghost" size="sm" onclick={cancel_edit_name}>取消</Button>
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
        <span class="UserProfile__join-date">加入于 {format_date(profile.created_at)}</span>
        <span class="UserProfile__password-status">
          {has_password ? "🔒 已设置密码" : "🔓 未设置密码"}
        </span>
      </div>
    </div>

    <!-- Password Management -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">密码管理</h3>
      {#if show_password_form}
        <div class="UserProfile__password-form">
          {#if has_password}
            <div class="UserProfile__field">
              <label class="UserProfile__field-label">当前密码</label>
              <Input
                type="password"
                value={current_password}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  current_password = e.currentTarget.value;
                }}
                placeholder="输入当前密码"
                class="w-full"
              />
            </div>
          {/if}
          <div class="UserProfile__field">
            <label class="UserProfile__field-label">
              {has_password ? "新密码" : "设置密码"}
            </label>
            <Input
              type="password"
              value={new_password}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                new_password = e.currentTarget.value;
              }}
              placeholder={has_password ? "输入新密码" : "设置密码（留空则不设密码）"}
              class="w-full"
            />
          </div>
          <div class="UserProfile__field">
            <label class="UserProfile__field-label">确认密码</label>
            <Input
              type="password"
              value={confirm_password}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                confirm_password = e.currentTarget.value;
              }}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") void handle_change_password();
              }}
              placeholder="再次输入密码"
              class="w-full"
            />
          </div>
          {#if password_error}
            <p class="UserProfile__error-text">{password_error}</p>
          {/if}
          {#if password_success}
            <p class="UserProfile__success-text">✅ 密码修改成功！</p>
          {/if}
          <div class="UserProfile__password-actions">
            <Button variant="outline" size="sm" onclick={cancel_password_change}>取消</Button>
            <Button
              size="sm"
              onclick={() => void handle_change_password()}
              disabled={is_changing_password || (!new_password && !has_password)}
            >
              {is_changing_password ? "保存中..." : has_password ? "修改密码" : "设置密码"}
            </Button>
          </div>
        </div>
      {:else}
        <Button
          variant="outline"
          class="w-full"
          onclick={() => (show_password_form = true)}
        >
          {has_password ? "🔑 修改密码" : "🔐 设置密码"}
        </Button>
      {/if}
    </div>

    <!-- Level & Points with Progress -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">等级信息</h3>
      <div class="UserProfile__level-card">
        <div class="UserProfile__level-header">
          <span class="UserProfile__level-icon">{profile.level_icon}</span>
          <div class="UserProfile__level-info">
            <span class="UserProfile__level-label">Lv.{profile.level} {profile.level_title}</span>
            <span class="UserProfile__level-points">{profile.total_points.toLocaleString()} 积分</span>
          </div>
        </div>
        <div class="UserProfile__streak">
          <StreakFlame streak_days={profile.streak_days} size="md" show_time={true} />
        </div>
      </div>

      {#if level_progress}
        <div class="UserProfile__progress-section">
          <div class="UserProfile__progress-header">
            {#if level_progress.next_level}
              <span class="UserProfile__progress-label">
                下一等级：{level_progress.next_level.icon} Lv.{level_progress.next_level.level} {level_progress.next_level.title}
              </span>
              <span class="UserProfile__progress-value">
                {profile.total_points.toLocaleString()} / {level_progress.next_level_points.toLocaleString()}
              </span>
            {:else}
              <span class="UserProfile__progress-label">已达到最高等级 👑</span>
              <span class="UserProfile__progress-value">MAX</span>
            {/if}
          </div>
          <div class="UserProfile__progress-bar">
            <div
              class="UserProfile__progress-fill"
              style="width: {level_progress.progress_percent}%"
            ></div>
          </div>
          <span class="UserProfile__progress-percent">{level_progress.progress_percent}%</span>
        </div>
      {/if}
    </div>

    <!-- Badges -->
    <div class="UserProfile__section">
      <h3 class="UserProfile__section-title">成就徽章 ({profile.badges.length}/{ALL_BADGES.length})</h3>
      <div class="UserProfile__badges-row">
        <!-- Unlocked badges -->
        {#each profile.badges as badge (badge.id)}
          <button type="button" class="UserProfile__badge UserProfile__badge--unlocked" title="{badge.name}: {badge.description} (获得于 {format_date(badge.unlocked_at)})" onclick={open_badges_doc}>
            <span class="UserProfile__badge-icon">{badge.icon}</span>
            <span class="UserProfile__badge-name">{badge.name}</span>
          </button>
        {/each}
        <!-- Next 3 locked badges -->
        {#each ALL_BADGES.filter((b) => !profile.badges.some((ub) => ub.id === b.id)).slice(0, 3) as locked (locked.id)}
          <button type="button" class="UserProfile__badge UserProfile__badge--locked" title="{locked.name}: {locked.description}" onclick={open_badges_doc}>
            <span class="UserProfile__badge-icon UserProfile__badge-icon--locked">{locked.icon}</span>
            <span class="UserProfile__badge-name UserProfile__badge-name--locked">{locked.name}</span>
          </button>
        {/each}
      </div>
      {#if profile.badges.length === 0}
        <p class="UserProfile__empty-text">还没有获得徽章，继续努力解锁右边的目标！🌟</p>
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
              <span class="UserProfile__folder-path">{folder.split("/").at(-1) ?? folder}</span>
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
                  default_sidebar_view: v as UserPreferences["default_sidebar_view"],
                });
            }}
          >
            <Select.Trigger class="w-32">
              <span data-slot="select-value">{sidebar_view_options.find((o) => o.value === profile.preferences.default_sidebar_view)?.label ?? profile.preferences.default_sidebar_view}</span>
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
              <span data-slot="select-value">{startup_options.find((o) => o.value === profile.preferences.startup_action)?.label ?? profile.preferences.startup_action}</span>
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
            <div
              class="UserProfile__user-item"
              class:UserProfile__user-item--active={user.id === profile.id}
            >
              <button
                type="button"
                class="UserProfile__user-item-main"
                onclick={() => {
                  if (user.id !== profile.id) handle_switch_with_password(user.id);
                }}
                disabled={user.id === profile.id}
              >
                <span class="UserProfile__user-avatar">{user.avatar_emoji}</span>
                <span class="UserProfile__user-name">{user.display_name}</span>
                <span class="UserProfile__user-level">{user.level_icon} Lv.{user.level}</span>
                {#if user.password_hash}
                  <span class="UserProfile__user-lock">🔒</span>
                {/if}
                {#if user.id === profile.id}
                  <span class="UserProfile__user-current">当前</span>
                {/if}
              </button>
              {#if user.id !== profile.id}
                {#if confirm_delete_id === user.id}
                  <div class="UserProfile__user-delete-confirm">
                    <span class="UserProfile__user-delete-text">确定删除？</span>
                    <Button variant="destructive" size="sm" onclick={() => handle_delete_user(user.id)}>确定</Button>
                    <Button variant="ghost" size="sm" onclick={() => (confirm_delete_id = null)}>取消</Button>
                  </div>
                {:else}
                  <button
                    type="button"
                    class="UserProfile__user-delete-btn"
                    onclick={() => (confirm_delete_id = user.id)}
                    title="删除此用户"
                  >
                    ✕
                  </button>
                {/if}
              {/if}
            </div>

            <!-- Password prompt for switching -->
            {#if switch_target_id === user.id}
              <div class="UserProfile__switch-password">
                <span class="UserProfile__switch-label">请输入 {user.display_name} 的密码：</span>
                <div class="UserProfile__switch-input-row">
                  <Input
                    type="password"
                    value={switch_password}
                    oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                      switch_password = e.currentTarget.value;
                    }}
                    onkeydown={(e: KeyboardEvent) => {
                      if (e.key === "Enter") void confirm_switch_with_password();
                      if (e.key === "Escape") cancel_switch();
                    }}
                    placeholder="输入密码"
                    class="w-full"
                  />
                  <Button size="sm" onclick={() => void confirm_switch_with_password()} disabled={is_verifying || !switch_password}>
                    {is_verifying ? "验证中..." : "确认"}
                  </Button>
                  <Button variant="ghost" size="sm" onclick={cancel_switch}>取消</Button>
                </div>
                {#if switch_error}
                  <p class="UserProfile__error-text">{switch_error}</p>
                {/if}
              </div>
            {/if}
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
            <Input
              type="password"
              value={new_user_password}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                new_user_password = e.currentTarget.value;
              }}
              placeholder="设置密码（可选）"
              class="w-full"
            />
            <div class="UserProfile__create-emoji-picker">
              {#each avatar_options.slice(0, 12) as emoji (emoji)}
                <button
                  type="button"
                  class="UserProfile__avatar-option"
                  class:UserProfile__avatar-option--active={new_user_emoji === emoji}
                  onclick={() => (new_user_emoji = emoji)}
                >
                  {emoji}
                </button>
              {/each}
            </div>
            <div class="UserProfile__create-actions">
              <Button variant="outline" size="sm" onclick={() => (show_create_form = false)}>取消</Button>
              <Button size="sm" onclick={handle_create_user} disabled={!new_user_name.trim()}>创建</Button>
            </div>
          </div>
        </div>
      {:else}
        <Button variant="outline" class="w-full" onclick={() => (show_create_form = true)}>
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

  .UserProfile__password-status {
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

  /* Password form */
  .UserProfile__password-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  .UserProfile__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UserProfile__field-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--foreground);
  }

  .UserProfile__password-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .UserProfile__error-text {
    font-size: var(--text-xs);
    color: var(--destructive);
    font-weight: 500;
  }

  .UserProfile__success-text {
    font-size: var(--text-xs);
    color: var(--interactive);
    font-weight: 500;
  }

  /* Switch password */
  .UserProfile__switch-password {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin-top: var(--space-1);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  .UserProfile__switch-label {
    font-size: var(--text-xs);
    color: var(--foreground);
    font-weight: 500;
  }

  .UserProfile__switch-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  .UserProfile__progress-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .UserProfile__progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .UserProfile__progress-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-weight: 500;
  }

  .UserProfile__progress-value {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  .UserProfile__progress-bar {
    height: 6px;
    border-radius: 3px;
    background-color: var(--muted);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .UserProfile__progress-fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--interactive) 0%, var(--interactive-hover) 100%);
    transition: width var(--duration-normal) var(--ease-default);
    min-width: 2px;
  }

  .UserProfile__progress-percent {
    font-size: var(--text-xs);
    color: var(--interactive);
    font-weight: 600;
    text-align: right;
  }

  .UserProfile__badges-row {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }

  .UserProfile__badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    min-width: 4.5rem;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-default);
    flex-shrink: 0;
    background: none;
  }

  .UserProfile__badge--unlocked {
    background-color: var(--muted);
    border: 2px solid var(--interactive);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
  }

  .UserProfile__badge--locked {
    background-color: transparent;
    border: 2px dashed var(--border);
    opacity: 0.5;
  }

  .UserProfile__badge--locked:hover {
    opacity: 0.75;
    border-color: var(--muted-foreground);
  }

  .UserProfile__badge-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .UserProfile__badge-icon--locked {
    filter: grayscale(1);
    opacity: 0.4;
  }

  .UserProfile__badge-name {
    font-size: 0.625rem;
    color: var(--foreground);
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
  }

  .UserProfile__badge-name--locked {
    color: var(--muted-foreground);
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
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--border);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .UserProfile__user-item:hover {
    background-color: var(--muted);
  }

  .UserProfile__user-item--active {
    background-color: var(--interactive-bg);
    border-color: var(--interactive);
  }

  .UserProfile__user-item-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    cursor: pointer;
    padding: var(--space-1) 0;
  }

  .UserProfile__user-item-main:disabled {
    cursor: default;
  }

  .UserProfile__user-avatar {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .UserProfile__user-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .UserProfile__user-level {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .UserProfile__user-lock {
    font-size: var(--text-xs);
    flex-shrink: 0;
  }

  .UserProfile__user-current {
    font-size: var(--text-xs);
    color: var(--interactive);
    font-weight: 600;
    flex-shrink: 0;
  }

  .UserProfile__user-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .UserProfile__user-item:hover .UserProfile__user-delete-btn {
    opacity: 1;
  }

  .UserProfile__user-delete-btn:hover {
    color: var(--destructive);
    background-color: var(--destructive-foreground);
  }

  .UserProfile__user-delete-confirm {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .UserProfile__user-delete-text {
    font-size: var(--text-xs);
    color: var(--destructive);
    font-weight: 500;
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
