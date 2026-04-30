<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import LayoutIcon from "@lucide/svelte/icons/layout-template";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import SlidersIcon from "@lucide/svelte/icons/sliders-horizontal";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import UserIcon from "@lucide/svelte/icons/user";
  import { HotkeysPanel } from "$lib/features/hotkey";
  import ThemeSettings from "$lib/features/settings/ui/theme_settings.svelte";
  import { UserProfilePanel } from "$lib/features/user";
  import type { UserProfile, UserPreferences } from "$lib/features/user";
  import type {
    EditorSettings,
    SettingsCategory,
  } from "$lib/shared/types/editor_settings";
  import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
  import type { Theme } from "$lib/shared/types/theme";
  import type { HotkeyConfig, HotkeyBinding } from "$lib/features/hotkey";
  import { draggable } from "$lib/shared/utils/draggable";

  type Props = {
    open: boolean;
    editor_settings: EditorSettings;
    active_category: SettingsCategory;
    is_saving: boolean;
    has_unsaved_changes: boolean;
    error: string | null;
    hotkeys_config: HotkeyConfig;
    user_themes: Theme[];
    active_theme: Theme;
    on_update_settings: (settings: EditorSettings) => void;
    on_category_change: (category: SettingsCategory) => void;
    on_save: () => void;
    on_close: () => void;
    on_hotkey_edit: (binding: HotkeyBinding) => void;
    on_hotkey_clear: (action_id: string) => void;
    on_hotkey_reset_single: (action_id: string) => void;
    on_hotkey_reset_all: () => void;
    on_theme_switch: (theme_id: string) => void;
    on_theme_create: (name: string, base: Theme) => void;
    on_theme_duplicate: (theme_id: string) => void;
    on_theme_rename: (id: string, name: string) => void;
    on_theme_delete: (theme_id: string) => void;
    on_theme_update: (theme: Theme) => void;
  };

  let {
    open,
    editor_settings,
    active_category,
    is_saving,
    has_unsaved_changes,
    error,
    hotkeys_config,
    user_themes,
    active_theme,
    on_update_settings,
    on_category_change,
    on_save,
    on_close,
    on_hotkey_edit,
    on_hotkey_clear,
    on_hotkey_reset_single,
    on_hotkey_reset_all,
    on_theme_switch,
    on_theme_create,
    on_theme_duplicate,
    on_theme_rename,
    on_theme_delete,
    on_theme_update,
    user_profile = null,
    user_all_profiles = [],
    on_user_update_name = () => {},
    on_user_update_avatar = () => {},
    on_user_update_preferences = () => {},
    on_user_switch = () => {},
    on_user_create = () => {},
    on_user_delete = () => {},
    on_user_change_password = async () => ({ success: false, error: "不可用" }),
    on_user_verify_password = async () => true,
  }: Props & {
    user_profile?: UserProfile | null;
    user_all_profiles?: UserProfile[];
    on_user_update_name?: (name: string) => void;
    on_user_update_avatar?: (emoji: string) => void;
    on_user_update_preferences?: (prefs: Partial<UserPreferences>) => void;
    on_user_switch?: (user_id: string) => void;
    on_user_create?: (name: string, emoji: string, password?: string) => void;
    on_user_delete?: (user_id: string) => void;
    on_user_change_password?: (current_password: string, new_password: string) => Promise<{ success: boolean; error?: string }>;
    on_user_verify_password?: (user_id: string, password: string) => Promise<boolean>;
  } = $props();

  const tab_count_options = Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));

  function update<K extends keyof EditorSettings>(
    key: K,
    value: EditorSettings[K],
  ): void {
    on_update_settings({ ...editor_settings, [key]: value });
  }

  function get_save_button_label(): string {
    if (is_saving) return "Saving...";
    if (has_unsaved_changes) return "Save Changes";
    return "Saved";
  }

  const categories: {
    id: SettingsCategory;
    label: string;
    icon: typeof PaletteIcon;
  }[] = [
    { id: "theme", label: "Theme", icon: PaletteIcon },
    { id: "layout", label: "Layout", icon: LayoutIcon },
    { id: "files", label: "Files", icon: FolderIcon },
    { id: "git", label: "Git", icon: GitBranchIcon },
    { id: "misc", label: "Misc", icon: SlidersIcon },
    { id: "hotkeys", label: "Hotkeys", icon: KeyboardIcon },
    { id: "profile", label: "Profile", icon: UserIcon },
  ];

  let dialog_element = $state<HTMLElement | null>(null);

  function reset_drag_styles(): void {
    if (!dialog_element) return;
    dialog_element.style.left = "";
    dialog_element.style.top = "";
    dialog_element.style.transform = "";
    dialog_element.style.translate = "";
    dialog_element.style.transition = "";
    dialog_element.style.cursor = "";
  }

  function request_close(): void {
    if (is_saving) return;
    reset_drag_styles();
    on_close();
  }

  $effect(() => {
    if (!dialog_element) return;

    const element = dialog_element;
    const action = draggable(element, {});

    return () => {
      action.destroy();
    };
  });

  $effect(() => {
    if (!open) {
      reset_drag_styles();
    }
  });
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) {
      request_close();
    }
  }}
>
  <Dialog.Content bind:ref={dialog_element} class="SettingsDialog">
    <Dialog.Header class="sr-only">
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>Customize your editor experience</Dialog.Description>
    </Dialog.Header>

    <div class="SettingsDialog__panels">
      <nav class="SettingsDialog__nav">
        <div class="SettingsDialog__nav-header">Settings</div>
        {#each categories as cat (cat.id)}
          <button
            class="SettingsDialog__nav-item"
            class:SettingsDialog__nav-item--selected={active_category ===
              cat.id}
            onclick={() => {
              on_category_change(cat.id);
            }}
          >
            <cat.icon />
            <span>{cat.label}</span>
          </button>
        {/each}
      </nav>

      <div class="SettingsDialog__content">
        {#if active_category === "theme"}
          <h2 class="SettingsDialog__content-header">Theme</h2>

          <ThemeSettings
            {user_themes}
            {active_theme}
            on_switch={on_theme_switch}
            on_create={on_theme_create}
            on_duplicate={on_theme_duplicate}
            on_rename={on_theme_rename}
            on_delete={on_theme_delete}
            on_update={on_theme_update}
          />
        {:else if active_category === "layout"}
          <h2 class="SettingsDialog__content-header">Layout</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Editor Max Width</span>
                <span class="SettingsDialog__description"
                  >Maximum line width for the editor content (in characters)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.editor_max_width_ch}
                  onValueChange={(value: number | undefined) => {
                    if (value !== undefined) {
                      update("editor_max_width_ch", value);
                    }
                  }}
                  min={60}
                  max={140}
                  step={5}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.editor_max_width_ch}ch</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "editor_max_width_ch",
                      DEFAULT_EDITOR_SETTINGS.editor_max_width_ch,
                    )}
                  disabled={editor_settings.editor_max_width_ch ===
                    DEFAULT_EDITOR_SETTINGS.editor_max_width_ch}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.editor_max_width_ch)}ch)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Max Open Tabs</span>
                <span class="SettingsDialog__description"
                  >Limit the number of tabs for better performance</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.max_open_tabs)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("max_open_tabs", Number(v));
                  }}
                >
                  <Select.Trigger class="w-20">
                    <span data-slot="select-value"
                      >{editor_settings.max_open_tabs}</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    {#each tab_count_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "max_open_tabs",
                      DEFAULT_EDITOR_SETTINGS.max_open_tabs,
                    )}
                  disabled={editor_settings.max_open_tabs ===
                    DEFAULT_EDITOR_SETTINGS.max_open_tabs}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.max_open_tabs)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "files"}
          <h2 class="SettingsDialog__content-header">Files</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label"
                  >Store New Attachments Next to Note</span
                >
                <span class="SettingsDialog__description"
                  >Save new pasted and dropped attachments in the same folder as
                  the note</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.store_attachments_with_note}
                onCheckedChange={(v: boolean) => {
                  update("store_attachments_with_note", v);
                }}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Attachment Folder</span>
                <span class="SettingsDialog__description"
                  >Used only when storing attachments next to the note is off</span
                >
              </div>
              <Input
                type="text"
                value={editor_settings.attachment_folder}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("attachment_folder", e.currentTarget.value);
                }}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("attachment_folder", e.currentTarget.value);
                }}
                class="w-48"
                placeholder=".assets"
                disabled={editor_settings.store_attachments_with_note}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Show Hidden Files</span>
                <span class="SettingsDialog__description"
                  >Show dot-prefixed files and folders in the file tree</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.show_hidden_files}
                onCheckedChange={(v: boolean) => {
                  update("show_hidden_files", v);
                }}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Autosave</span>
                <span class="SettingsDialog__description"
                  >Automatically save Markdown notes after edits</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.autosave_enabled}
                onCheckedChange={(v: boolean) => {
                  update("autosave_enabled", v);
                }}
              />
            </div>
            {#if editor_settings.autosave_enabled}
              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Autosave Delay (ms)</span>
                  <span class="SettingsDialog__description"
                    >Delay before automatically saving after edits</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Slider
                    type="single"
                    value={editor_settings.autosave_delay_ms}
                    onValueChange={(v: number | undefined) => {
                      if (v !== undefined) {
                        update("autosave_delay_ms", v);
                      }
                    }}
                    min={500}
                    max={10000}
                    step={100}
                    class="w-32"
                  />
                  <span class="text-sm tabular-nums w-14"
                    >{editor_settings.autosave_delay_ms}ms</span
                  >
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "autosave_delay_ms",
                        DEFAULT_EDITOR_SETTINGS.autosave_delay_ms,
                      )}
                    disabled={editor_settings.autosave_delay_ms ===
                      DEFAULT_EDITOR_SETTINGS.autosave_delay_ms}
                    title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.autosave_delay_ms)}ms)`}
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {:else if active_category === "git"}
          <h2 class="SettingsDialog__content-header">Git</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Auto-commit</span>
                <span class="SettingsDialog__description"
                  >Automatically commit saved changes to Git</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.git_autocommit_enabled}
                onCheckedChange={(v: boolean) => {
                  update("git_autocommit_enabled", v);
                }}
              />
            </div>
          </div>
        {:else if active_category === "misc"}
          <h2 class="SettingsDialog__content-header">Misc</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label"
                  >Show Vault Dashboard on Open</span
                >
                <span class="SettingsDialog__description"
                  >Open the vault dashboard automatically when a vault is opened</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.show_vault_dashboard_on_open}
                onCheckedChange={(v: boolean) => {
                  update("show_vault_dashboard_on_open", v);
                }}
              />
            </div>
          </div>
        {:else if active_category === "hotkeys"}
          <h2 class="SettingsDialog__content-header">Hotkeys</h2>

          <HotkeysPanel
            config={hotkeys_config}
            on_edit={on_hotkey_edit}
            on_clear={on_hotkey_clear}
            on_reset_single={on_hotkey_reset_single}
            on_reset_all={on_hotkey_reset_all}
          />
        {:else if active_category === "profile"}
          <h2 class="SettingsDialog__content-header">User Profile</h2>

          <UserProfilePanel
            profile={user_profile}
            all_profiles={user_all_profiles}
            on_update_display_name={on_user_update_name}
            on_update_avatar={on_user_update_avatar}
            on_update_preferences={on_user_update_preferences}
            on_switch_user={on_user_switch}
            on_create_user={on_user_create}
            on_delete_user={on_user_delete}
            on_change_password={on_user_change_password}
            on_verify_password={on_user_verify_password}
          />
        {/if}
      </div>
    </div>

    <Dialog.Footer class="SettingsDialog__footer">
      {#if error}
        <span class="text-destructive text-sm mr-auto">{error}</span>
      {/if}
      <Button
        variant="outline"
        class="transition-colors"
        onclick={request_close}
        disabled={is_saving}
      >
        Cancel
      </Button>
      <Button
        class="transition-colors"
        onclick={on_save}
        disabled={!has_unsaved_changes || is_saving}
      >
        {get_save_button_label()}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.SettingsDialog) {
    max-width: 52rem;
    width: 52rem;
    height: 80vh;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    gap: 0;
    overflow: hidden;
    cursor: grab;
  }

  .SettingsDialog__panels {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .SettingsDialog__nav {
    display: flex;
    flex-direction: column;
    width: 12rem;
    min-width: 12rem;
    padding: var(--space-3);
    gap: var(--space-0-5);
    border-inline-end: 1px solid var(--border);
    overflow-y: auto;
  }

  .SettingsDialog__nav-header {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
    padding: var(--space-2) var(--space-2) var(--space-3);
    user-select: none;
  }

  .SettingsDialog__nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2-5);
    width: 100%;
    min-height: var(--size-touch);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .SettingsDialog__nav-item:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .SettingsDialog__nav-item--selected {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .SettingsDialog__nav-item--selected:hover {
    background-color: var(--interactive-bg-hover);
    color: var(--interactive);
  }

  .SettingsDialog__nav-item :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
  }

  .SettingsDialog__content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
    min-height: 0;
  }

  .SettingsDialog__content-header {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
    margin-bottom: var(--space-6);
  }

  .SettingsDialog__section-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .SettingsDialog__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .SettingsDialog__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .SettingsDialog__label-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .SettingsDialog__description {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .SettingsDialog__reset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .SettingsDialog__reset:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .SettingsDialog__reset:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .SettingsDialog__reset :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }

  :global(.SettingsDialog__footer) {
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--border);
  }
</style>
