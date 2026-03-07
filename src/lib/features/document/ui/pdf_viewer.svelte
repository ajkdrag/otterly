<script lang="ts">
  import { onMount } from "svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
  import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import type * as PDFJSType from "pdfjs-dist";

  interface Props {
    src: string;
  }

  let { src }: Props = $props();

  type PDFDocumentProxy = PDFJSType.PDFDocumentProxy;

  let canvas_el: HTMLCanvasElement | undefined = $state();
  let pdf_doc: PDFDocumentProxy | null = $state(null);
  let current_page = $state(1);
  let num_pages = $state(0);
  let zoom_level = $state(1.0);
  let loading = $state(true);
  let error_msg = $state<string | null>(null);
  let page_input_value = $state("1");
  let rendering = $state(false);

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4.0;
  const ZOOM_STEP = 0.25;

  async function load_pdf(url: string) {
    loading = true;
    error_msg = null;
    pdf_doc = null;
    num_pages = 0;
    current_page = 1;
    page_input_value = "1";

    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();

      const doc = await pdfjs.getDocument(url).promise;
      pdf_doc = doc;
      num_pages = doc.numPages;
      loading = false;
      await render_page(current_page);
    } catch (err) {
      loading = false;
      error_msg = err instanceof Error ? err.message : "Failed to load PDF";
    }
  }

  async function render_page(page_num: number) {
    if (!pdf_doc || !canvas_el || rendering) return;

    rendering = true;
    try {
      const page = await pdf_doc.getPage(page_num);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom_level * dpr });

      const ctx = canvas_el.getContext("2d");
      if (!ctx) return;

      canvas_el.width = viewport.width;
      canvas_el.height = viewport.height;
      canvas_el.style.width = `${viewport.width / dpr}px`;
      canvas_el.style.height = `${viewport.height / dpr}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      rendering = false;
    }
  }

  function go_to_page(page_num: number) {
    const clamped = Math.max(1, Math.min(num_pages, page_num));
    if (clamped === current_page) return;
    current_page = clamped;
    page_input_value = String(clamped);
    void render_page(clamped);
  }

  function prev_page() {
    go_to_page(current_page - 1);
  }

  function next_page() {
    go_to_page(current_page + 1);
  }

  function zoom_in() {
    zoom_level = Math.min(MAX_ZOOM, zoom_level + ZOOM_STEP);
    void render_page(current_page);
  }

  function zoom_out() {
    zoom_level = Math.max(MIN_ZOOM, zoom_level - ZOOM_STEP);
    void render_page(current_page);
  }

  async function fit_width() {
    if (!pdf_doc || !canvas_el) return;
    const container = canvas_el.parentElement;
    if (!container) return;
    const page = await pdf_doc.getPage(current_page);
    const viewport = page.getViewport({ scale: 1.0 });
    zoom_level = container.clientWidth / viewport.width;
    void render_page(current_page);
  }

  function handle_page_input_change(e: Event) {
    page_input_value = (e.target as HTMLInputElement).value;
  }

  function handle_page_input_commit() {
    const parsed = parseInt(page_input_value, 10);
    if (!isNaN(parsed)) {
      go_to_page(parsed);
    } else {
      page_input_value = String(current_page);
    }
  }

  function handle_page_input_keydown(e: KeyboardEvent) {
    if (e.key === "Enter") handle_page_input_commit();
  }

  $effect(() => {
    if (src) void load_pdf(src);
  });

  $effect(() => {
    if (!loading && pdf_doc && canvas_el) {
      void render_page(current_page);
    }
  });

  onMount(() => {
    return () => {
      pdf_doc?.destroy();
    };
  });
</script>

<div class="PdfViewer">
  <div class="PdfViewer__toolbar">
    <div class="PdfViewer__toolbar-group">
      <button
        class="PdfViewer__toolbar-btn"
        onclick={prev_page}
        disabled={current_page <= 1 || loading}
        aria-label="Previous page"
      >
        <ChevronLeftIcon size={16} />
      </button>
      <div class="PdfViewer__page-nav">
        <input
          class="PdfViewer__page-input"
          type="text"
          value={page_input_value}
          onchange={handle_page_input_change}
          onblur={handle_page_input_commit}
          onkeydown={handle_page_input_keydown}
          disabled={loading}
          aria-label="Current page"
        />
        <span class="PdfViewer__page-sep">/</span>
        <span class="PdfViewer__page-total">{num_pages}</span>
      </div>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={next_page}
        disabled={current_page >= num_pages || loading}
        aria-label="Next page"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>

    <div class="PdfViewer__toolbar-group">
      <button
        class="PdfViewer__toolbar-btn"
        onclick={zoom_out}
        disabled={zoom_level <= MIN_ZOOM || loading}
        aria-label="Zoom out"
      >
        <ZoomOutIcon size={16} />
      </button>
      <span class="PdfViewer__zoom-label">{Math.round(zoom_level * 100)}%</span>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={zoom_in}
        disabled={zoom_level >= MAX_ZOOM || loading}
        aria-label="Zoom in"
      >
        <ZoomInIcon size={16} />
      </button>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={fit_width}
        disabled={loading}
        aria-label="Fit to width"
      >
        <MaximizeIcon size={16} />
      </button>
    </div>
  </div>

  <div class="PdfViewer__canvas-container">
    {#if loading}
      <div class="PdfViewer__state">
        <span class="PdfViewer__state-text">Loading PDF…</span>
      </div>
    {:else if error_msg}
      <div class="PdfViewer__state PdfViewer__state--error">
        <span class="PdfViewer__state-text">{error_msg}</span>
      </div>
    {:else}
      <canvas bind:this={canvas_el} class="PdfViewer__canvas"></canvas>
    {/if}
  </div>
</div>

<style>
  .PdfViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
  }

  .PdfViewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--muted);
    flex-shrink: 0;
    gap: var(--space-4);
  }

  .PdfViewer__toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .PdfViewer__toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-7);
    height: var(--space-7);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .PdfViewer__toolbar-btn:hover:not(:disabled) {
    background-color: var(--accent);
  }

  .PdfViewer__toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .PdfViewer__page-nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .PdfViewer__page-input {
    width: calc(var(--space-6) * 2);
    text-align: center;
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background-color: var(--background);
    color: var(--foreground);
  }

  .PdfViewer__page-input:disabled {
    opacity: 0.5;
  }

  .PdfViewer__page-sep {
    color: var(--muted-foreground);
  }

  .PdfViewer__page-total {
    color: var(--muted-foreground);
    min-width: var(--space-5);
  }

  .PdfViewer__zoom-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    min-width: calc(var(--space-6) + var(--space-3));
    text-align: center;
  }

  .PdfViewer__canvas-container {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-4);
    background-color: var(--muted);
  }

  .PdfViewer__canvas {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
    display: block;
  }

  .PdfViewer__state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 200px;
  }

  .PdfViewer__state-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .PdfViewer__state--error .PdfViewer__state-text {
    color: var(--destructive);
  }
</style>
