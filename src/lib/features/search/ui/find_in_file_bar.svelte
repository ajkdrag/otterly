<script lang="ts">
  import { find_regexp } from "@otterly/markdown-editor";
  import type { InFileMatch } from "$lib/shared/types/search";
  import {
    find_option_for_shortcut,
    type FindOption,
  } from "$lib/features/search/domain/find_option_shortcut";
  import CaseSensitiveIcon from "@lucide/svelte/icons/case-sensitive";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import RegexIcon from "@lucide/svelte/icons/regex";
  import ReplaceIcon from "@lucide/svelte/icons/replace";
  import ReplaceAllIcon from "@lucide/svelte/icons/replace-all";
  import WholeWordIcon from "@lucide/svelte/icons/whole-word";
  import XIcon from "@lucide/svelte/icons/x";

  type Props = {
    open: boolean;
    query: string;
    replacement: string;
    replace_open: boolean;
    regex: boolean;
    case_sensitive: boolean;
    whole_word: boolean;
    matches: InFileMatch[];
    selected_match_index: number;
    on_query_change: (query: string) => void;
    on_replacement_change: (replacement: string) => void;
    on_options_change: (options: Partial<Record<FindOption, boolean>>) => void;
    on_toggle_replace: () => void;
    on_replace: () => void;
    on_replace_all: () => void;
    on_next: () => void;
    on_prev: () => void;
    on_close: () => void;
  };

  let {
    open,
    query,
    replacement,
    replace_open,
    regex,
    case_sensitive,
    whole_word,
    matches,
    selected_match_index,
    on_query_change,
    on_replacement_change,
    on_options_change,
    on_toggle_replace,
    on_replace,
    on_replace_all,
    on_next,
    on_prev,
    on_close,
  }: Props = $props();
  let input_ref: HTMLInputElement | null = $state(null);

  const options = $derived({ case_sensitive, whole_word, regex });
  // The editor shows no error for a bad pattern, it just finds nothing. The
  // bar is where you learn why.
  const is_invalid_regex = $derived(
    regex &&
      query !== "" &&
      find_regexp({ text: query, regex, case_sensitive, whole_word }) === null,
  );

  const count_display = $derived(
    is_invalid_regex
      ? "Invalid regex"
      : matches.length > 0
        ? `${String(selected_match_index + 1)} of ${String(matches.length)}`
        : query.trim()
          ? "No results"
          : "",
  );

  $effect(() => {
    if (!open) return;
    const ref = input_ref;
    if (!ref) return;
    setTimeout(() => {
      ref.focus();
    }, 0);
  });

  // Opening the replace row moves you into it. When the bar opens with the row
  // already there, the find input's delayed focus above still wins.
  function focus_replace_input(node: HTMLInputElement) {
    node.focus();
    return {
      destroy() {
        // Hiding the row from the keyboard must not drop focus on the page.
        if (document.activeElement === node) input_ref?.focus();
      },
    };
  }

  // Alt+C/W/R work in both inputs. True when the key was an option toggle.
  function handle_option_keys(event: KeyboardEvent): boolean {
    const option = find_option_for_shortcut(event);
    if (!option) return false;
    event.preventDefault();
    on_options_change({ [option]: !options[option] });
    return true;
  }

  function handle_find_keydown(event: KeyboardEvent) {
    if (handle_option_keys(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      on_close();
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (event.shiftKey) on_prev();
      else on_next();
    }
  }

  function handle_replace_keydown(event: KeyboardEvent) {
    if (handle_option_keys(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      on_close();
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) on_replace_all();
      else on_replace();
    }
  }
</script>

{#snippet option_toggle(
  option: FindOption,
  label: string,
  Icon: typeof RegexIcon,
)}
  <button
    type="button"
    class="text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-foreground aria-pressed:ring-ring flex size-5 items-center justify-center rounded-sm aria-pressed:ring-1"
    aria-pressed={options[option]}
    aria-label={label}
    title={label}
    onclick={() => {
      on_options_change({ [option]: !options[option] });
    }}
  >
    <Icon class="size-3.5" />
  </button>
{/snippet}

{#if open}
  <div class="FindInFileBar">
    <button
      type="button"
      class="FindInFileBar__nav"
      aria-label={replace_open ? "Hide replace" : "Show replace"}
      aria-expanded={replace_open}
      title="Toggle replace (Cmd/Ctrl+Alt+F)"
      onclick={on_toggle_replace}
    >
      {#if replace_open}
        <ChevronDownIcon />
      {:else}
        <ChevronRightIcon />
      {/if}
    </button>
    <div class="FindInFileBar__field">
      <input
        bind:this={input_ref}
        class="FindInFileBar__input FindInFileBar__input--with-options"
        type="text"
        placeholder="Find in note..."
        aria-label="Find in note"
        aria-invalid={is_invalid_regex}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        value={query}
        oninput={(e) => {
          on_query_change(e.currentTarget.value);
        }}
        onkeydown={handle_find_keydown}
      />
      <div
        class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5"
      >
        {@render option_toggle(
          "case_sensitive",
          "Match case (Alt+C)",
          CaseSensitiveIcon,
        )}
        {@render option_toggle(
          "whole_word",
          "Match whole word (Alt+W)",
          WholeWordIcon,
        )}
        {@render option_toggle(
          "regex",
          "Use regular expression (Alt+R)",
          RegexIcon,
        )}
      </div>
    </div>
    <div class="FindInFileBar__actions">
      {#if count_display}
        <span
          class="FindInFileBar__count"
          class:FindInFileBar__count--error={is_invalid_regex}
          role="status">{count_display}</span
        >
      {/if}
      <button
        type="button"
        class="FindInFileBar__nav"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        onclick={on_prev}
        disabled={matches.length === 0}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        class="FindInFileBar__nav"
        aria-label="Next match"
        title="Next match (Enter)"
        onclick={on_next}
        disabled={matches.length === 0}
      >
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        class="FindInFileBar__close"
        aria-label="Close find"
        title="Close find (Esc)"
        onclick={on_close}
      >
        <XIcon />
      </button>
    </div>

    {#if replace_open}
      <span aria-hidden="true"></span>
      <div class="FindInFileBar__field">
        <input
          use:focus_replace_input
          class="FindInFileBar__input"
          type="text"
          placeholder="Replace with..."
          aria-label="Replace with"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          value={replacement}
          oninput={(e) => {
            on_replacement_change(e.currentTarget.value);
          }}
          onkeydown={handle_replace_keydown}
        />
      </div>
      <div class="FindInFileBar__actions">
        <button
          type="button"
          class="FindInFileBar__nav"
          aria-label="Replace"
          title="Replace (Enter)"
          onclick={on_replace}
          disabled={matches.length === 0}
        >
          <ReplaceIcon />
        </button>
        <button
          type="button"
          class="FindInFileBar__nav"
          aria-label="Replace all"
          title="Replace all (Cmd/Ctrl+Enter)"
          onclick={on_replace_all}
          disabled={matches.length === 0}
        >
          <ReplaceAllIcon />
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Two rows share three columns, so the find and replace inputs line up. */
  .FindInFileBar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1-5) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--background);
  }

  .FindInFileBar__field {
    position: relative;
    min-width: 0;
  }

  .FindInFileBar__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .FindInFileBar__input {
    width: 100%;
    height: var(--size-touch);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--foreground);
  }

  /* Room for the three option toggles. */
  .FindInFileBar__input--with-options {
    padding-inline-end: 4.75rem;
  }

  .FindInFileBar__input:focus {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
    border-color: var(--ring);
  }

  .FindInFileBar__input[aria-invalid="true"],
  .FindInFileBar__input[aria-invalid="true"]:focus {
    outline-color: var(--destructive);
    border-color: var(--destructive);
  }

  .FindInFileBar__count {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .FindInFileBar__count--error {
    color: var(--destructive);
  }

  .FindInFileBar__nav,
  .FindInFileBar__close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--size-touch);
    height: var(--size-touch);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .FindInFileBar__nav:hover:not(:disabled),
  .FindInFileBar__close:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .FindInFileBar__nav:focus-visible,
  .FindInFileBar__close:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .FindInFileBar__nav:disabled {
    opacity: 0.3;
    cursor: default;
  }

  :global(.FindInFileBar__nav svg),
  :global(.FindInFileBar__close svg) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }
</style>
