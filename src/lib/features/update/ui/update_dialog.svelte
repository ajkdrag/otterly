<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";

  type Props = {
    open: boolean;
    current_version: string;
    available_version: string | null;
    release_notes: string | null;
    release_date: string | null;
    check_status: string;
    check_error: string | null;
    download_status: string;
    download_progress: number;
    download_error: string | null;
    on_check: () => void;
    on_download: () => void;
    on_close: () => void;
  };

  let {
    open,
    current_version,
    available_version,
    release_notes,
    release_date,
    check_status,
    check_error,
    download_status,
    download_progress,
    download_error,
    on_check,
    on_download,
    on_close,
  }: Props = $props();

  function format_date(iso: string | null): string {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch { return iso; }
  }
</script>

<Dialog.Root {open} onOpenChange={(v) => { if (!v) on_close(); }}>
  <Dialog.Content class="UpdateDialog">
    <Dialog.Header>
      <Dialog.Title>🔄 检查更新</Dialog.Title>
      <Dialog.Description>检查并安装最新版本</Dialog.Description>
    </Dialog.Header>

    <div class="UpdateDialog__body">
      <div class="UpdateDialog__version-row">
        <span class="UpdateDialog__label">当前版本</span>
        <span class="UpdateDialog__value">v{current_version}</span>
      </div>

      {#if check_status === "checking"}
        <div class="UpdateDialog__status">⏳ 正在检查更新...</div>

      {:else if check_status === "available" && available_version}
        <div class="UpdateDialog__version-row UpdateDialog__version-row--new">
          <span class="UpdateDialog__label">最新版本</span>
          <span class="UpdateDialog__value UpdateDialog__value--highlight">v{available_version}</span>
        </div>

        {#if release_date}
          <div class="UpdateDialog__version-row">
            <span class="UpdateDialog__label">发布日期</span>
            <span class="UpdateDialog__value">{format_date(release_date)}</span>
          </div>
        {/if}

        {#if release_notes}
          <div class="UpdateDialog__notes">
            <h4 class="UpdateDialog__notes-title">更新内容</h4>
            <div class="UpdateDialog__notes-body">{release_notes}</div>
          </div>
        {/if}

        {#if download_status === "downloading"}
          <div class="UpdateDialog__progress">
            <div class="UpdateDialog__progress-bar">
              <div class="UpdateDialog__progress-fill" style="width: {download_progress}%"></div>
            </div>
            <span class="UpdateDialog__progress-text">正在下载... {download_progress}%</span>
          </div>
        {:else if download_status === "installing"}
          <div class="UpdateDialog__status">🚀 正在安装，即将重启...</div>
        {:else if download_status === "error"}
          <div class="UpdateDialog__error">下载失败: {download_error}</div>
        {/if}

      {:else if check_status === "up_to_date"}
        <div class="UpdateDialog__status UpdateDialog__status--success">✅ 已是最新版本！</div>

      {:else if check_status === "error"}
        <div class="UpdateDialog__error">检查失败: {check_error}</div>

      {:else}
        <div class="UpdateDialog__status">点击下方按钮检查更新</div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={on_close}>关闭</Button>
      {#if check_status === "available" && download_status !== "downloading" && download_status !== "installing"}
        <Button onclick={on_download}>立即更新</Button>
      {:else if check_status !== "checking" && download_status !== "downloading"}
        <Button onclick={on_check} disabled={check_status === "checking"}>
          {check_status === "checking" ? "检查中..." : "检查更新"}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.UpdateDialog) {
    max-width: 28rem;
  }

  .UpdateDialog__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) 0;
  }

  .UpdateDialog__version-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
  }

  .UpdateDialog__label {
    color: var(--muted-foreground);
  }

  .UpdateDialog__value {
    font-weight: 600;
    font-family: var(--font-mono, monospace);
  }

  .UpdateDialog__value--highlight {
    color: var(--interactive);
    font-size: var(--text-base);
  }

  .UpdateDialog__status {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    padding: var(--space-3);
  }

  .UpdateDialog__status--success {
    color: #22c55e;
  }

  .UpdateDialog__error {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--destructive);
    padding: var(--space-2);
  }

  .UpdateDialog__notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UpdateDialog__notes-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    margin: 0;
  }

  .UpdateDialog__notes-body {
    font-size: var(--text-sm);
    color: var(--foreground);
    white-space: pre-wrap;
    line-height: 1.6;
    max-height: 200px;
    overflow-y: auto;
    padding: var(--space-2);
    background: var(--muted);
    border-radius: var(--radius-sm);
  }

  .UpdateDialog__progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .UpdateDialog__progress-bar {
    height: 8px;
    background: var(--muted);
    border-radius: 4px;
    overflow: hidden;
  }

  .UpdateDialog__progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--interactive), #22c55e);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .UpdateDialog__progress-text {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: center;
  }
</style>
