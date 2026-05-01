<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";

  type Props = {
    open: boolean;
    on_bind: (
      username: string,
      password: string,
    ) => Promise<{ status: string; error?: string }>;
    on_close: () => void;
  };

  let { open, on_bind, on_close }: Props = $props();

  let username = $state("");
  let password = $state("");
  let confirm_password = $state("");
  let error = $state<string | null>(null);
  let success = $state(false);
  let is_loading = $state(false);

  async function handle_bind(): Promise<void> {
    if (!username.trim()) {
      error = "请输入用户名";
      return;
    }
    if (!password) {
      error = "请输入密码";
      return;
    }
    if (password.length < 4) {
      error = "密码长度至少4位";
      return;
    }
    if (password !== confirm_password) {
      error = "两次输入的密码不一致";
      return;
    }

    error = null;
    is_loading = true;
    try {
      const result = await on_bind(username.trim(), password);
      if (result.status === "success") {
        success = true;
        setTimeout(() => {
          on_close();
          reset_form();
        }, 1500);
      } else {
        error = result.error ?? "绑定失败";
      }
    } finally {
      is_loading = false;
    }
  }

  function reset_form(): void {
    username = "";
    password = "";
    confirm_password = "";
    error = null;
    success = false;
  }

  function handle_cancel(): void {
    on_close();
    reset_form();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="BindDialog__overlay" onclick={handle_cancel}>
    <div class="BindDialog__card" onclick={(e) => e.stopPropagation()}>
      <h2 class="BindDialog__title">🔗 绑定账号</h2>
      <p class="BindDialog__desc">
        将当前游客身份绑定到一个用户名和密码，您的所有数据（积分、徽章、笔记等）将被保留。
      </p>

      {#if success}
        <div class="BindDialog__success">
          <span class="BindDialog__success-icon">✅</span>
          <p class="BindDialog__success-text">账号绑定成功！</p>
        </div>
      {:else}
        <div class="BindDialog__form">
          <div class="BindDialog__field">
            <label class="BindDialog__label" for="bind-username">用户名</label>
            <Input
              id="bind-username"
              type="text"
              value={username}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                username = e.currentTarget.value;
              }}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Escape") handle_cancel();
              }}
              placeholder="设置用户名"
              class="w-full"
            />
          </div>

          <div class="BindDialog__field">
            <label class="BindDialog__label" for="bind-password">密码</label>
            <Input
              id="bind-password"
              type="password"
              value={password}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                password = e.currentTarget.value;
              }}
              placeholder="设置密码（至少4位）"
              class="w-full"
            />
          </div>

          <div class="BindDialog__field">
            <label class="BindDialog__label" for="bind-confirm-password">确认密码</label>
            <Input
              id="bind-confirm-password"
              type="password"
              value={confirm_password}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                confirm_password = e.currentTarget.value;
              }}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") void handle_bind();
                if (e.key === "Escape") handle_cancel();
              }}
              placeholder="再次输入密码"
              class="w-full"
            />
          </div>

          {#if error}
            <p class="BindDialog__error">{error}</p>
          {/if}

          <div class="BindDialog__actions">
            <Button variant="outline" onclick={handle_cancel}>取消</Button>
            <Button onclick={() => void handle_bind()} disabled={is_loading}>
              {is_loading ? "绑定中..." : "确认绑定"}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .BindDialog__overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .BindDialog__card {
    width: 100%;
    max-width: 24rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    background-color: var(--card);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  }

  .BindDialog__title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
  }

  .BindDialog__desc {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    line-height: 1.5;
  }

  .BindDialog__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .BindDialog__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .BindDialog__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .BindDialog__error {
    font-size: var(--text-sm);
    color: var(--destructive);
    font-weight: 500;
  }

  .BindDialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .BindDialog__success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) 0;
  }

  .BindDialog__success-icon {
    font-size: 2.5rem;
    line-height: 1;
  }

  .BindDialog__success-text {
    font-size: var(--text-sm);
    color: var(--interactive);
    font-weight: 600;
  }
</style>
