<script lang="ts">
  import { onMount } from "svelte";
  import { create_milkdown_editor_port } from "$lib/features/editor";
  import type { EditorSession } from "$lib/features/editor/ports";
  import type { CursorInfo } from "$lib/shared/types/editor";

  type DomSummary = {
    inside_code: boolean;
    selection_text: string;
    prose_text: string;
    prose_html: string;
  };
  type RuntimeSummary = {
    user_agent: string;
    has_caret_range_from_point: boolean;
    has_caret_position_from_point: boolean;
  };

  let host: HTMLDivElement | null = null;
  let session: EditorSession | null = null;
  let current_markdown = $state("`dad`\n\ndada `dad` dada");
  let cursor = $state<CursorInfo | null>(null);
  let dom_summary = $state<DomSummary>({
    inside_code: false,
    selection_text: "",
    prose_text: "",
    prose_html: "",
  });
  let runtime_summary = $state<RuntimeSummary>({
    user_agent: "",
    has_caret_range_from_point: false,
    has_caret_position_from_point: false,
  });
  let live_summary = $state("");

  function read_dom_summary(): DomSummary {
    const selection = document.getSelection();
    const focus_element =
      selection?.focusNode instanceof Element
        ? selection.focusNode
        : (selection?.focusNode?.parentElement ?? null);
    const inside_code = focus_element?.closest("code") instanceof HTMLElement;

    const prose_root = host?.querySelector(".ProseMirror");
    const prose_text = prose_root?.textContent ?? "";
    const prose_html = prose_root?.innerHTML ?? "";

    return {
      inside_code,
      selection_text: selection?.toString() ?? "",
      prose_text,
      prose_html,
    };
  }

  function refresh_live_summary(): void {
    dom_summary = read_dom_summary();
    const point_api = document as unknown as Record<string, unknown>;
    runtime_summary = {
      user_agent: navigator.userAgent,
      has_caret_range_from_point:
        typeof point_api["caretRangeFromPoint"] === "function",
      has_caret_position_from_point:
        typeof point_api["caretPositionFromPoint"] === "function",
    };
    live_summary = JSON.stringify(
      {
        markdown: current_markdown,
        cursor,
        dom_summary,
        runtime_summary,
      },
      null,
      2,
    );
  }

  onMount(() => {
    if (!host) return;

    const host_element = host;
    let destroyed = false;
    let cleanup = () => {};

    const start = async () => {
      const port = create_milkdown_editor_port();
      const started_session = await port.start_session({
        root: host_element,
        initial_markdown: current_markdown,
        note_path: "debug/mark_escape.md",
        vault_id: null,
        events: {
          on_markdown_change: (markdown) => {
            current_markdown = markdown;
            refresh_live_summary();
          },
          on_dirty_state_change: () => {},
          on_cursor_change: (info) => {
            cursor = info;
            refresh_live_summary();
          },
        },
      });

      if (destroyed) {
        started_session.destroy();
        return;
      }

      session = started_session;
      session.focus();
      refresh_live_summary();

      const refresh = () => {
        refresh_live_summary();
      };
      document.addEventListener("selectionchange", refresh);
      host_element.addEventListener("keyup", refresh);
      host_element.addEventListener("mouseup", refresh);
      host_element.addEventListener("input", refresh);

      cleanup = () => {
        document.removeEventListener("selectionchange", refresh);
        host_element.removeEventListener("keyup", refresh);
        host_element.removeEventListener("mouseup", refresh);
        host_element.removeEventListener("input", refresh);
      };
    };

    void start();

    return () => {
      destroyed = true;
      cleanup();
      session?.destroy();
      session = null;
    };
  });
</script>

<main class="page">
  <h1>Inline Code Boundary Debug (Milkdown)</h1>
  <p>
    Real editor stack. Use mouse and keyboard only to validate inline code
    boundary behavior.
  </p>
  <div bind:this={host} class="editor-shell"></div>
  <pre class="summary">{live_summary}</pre>
</main>

<style>
  .page {
    min-height: 100vh;
    padding: 2rem;
    background: #111111;
    color: #f4f4f5;
    font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    font-weight: 600;
  }

  p {
    margin: 0 0 1rem;
    color: #a1a1aa;
    font-size: 0.875rem;
  }

  .editor-shell {
    max-width: 720px;
    min-height: 120px;
    padding: 1rem;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    background: #18181b;
  }

  .summary {
    margin-top: 1rem;
    max-width: 720px;
    max-height: 440px;
    padding: 0.75rem;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    background: #0f0f10;
    color: #d4d4d8;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow: auto;
  }
</style>
