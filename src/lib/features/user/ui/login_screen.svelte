<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";

  type Props = {
    on_login_guest: () => void;
    on_login_credentials: (
      username: string,
      password: string,
    ) => Promise<{ status: string; error?: string }>;
    on_register: (
      username: string,
      password: string,
    ) => Promise<{ status: string; error?: string }>;
  };

  let { on_login_guest, on_login_credentials, on_register }: Props = $props();

  let mode = $state<"login" | "register">("login");
  let username = $state("");
  let password = $state("");
  let confirm_password = $state("");
  let error = $state<string | null>(null);
  let is_loading = $state(false);

  async function handle_login(): Promise<void> {
    if (!username.trim() || !password) {
      error = "请输入用户名和密码";
      return;
    }

    error = null;
    is_loading = true;
    try {
      const result = await on_login_credentials(username.trim(), password);
      if (result.status === "failed") {
        error = result.error ?? "登录失败";
      }
    } finally {
      is_loading = false;
    }
  }

  async function handle_register(): Promise<void> {
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
      const result = await on_register(username.trim(), password);
      if (result.status === "failed") {
        error = result.error ?? "注册失败";
      }
    } finally {
      is_loading = false;
    }
  }

  function switch_mode(new_mode: "login" | "register"): void {
    mode = new_mode;
    error = null;
    username = "";
    password = "";
    confirm_password = "";
  }
</script>

<div class="LoginScreen">
  <div class="LoginScreen__card">
    <div class="LoginScreen__header">
      <span class="LoginScreen__logo">📝</span>
      <h1 class="LoginScreen__title">LeapGrowNotes</h1>
      <p class="LoginScreen__subtitle">24小时陪伴成长型知识笔记</p>
    </div>

    <div class="LoginScreen__tabs">
      <button
        type="button"
        class="LoginScreen__tab"
        class:LoginScreen__tab--active={mode === "login"}
        onclick={() => switch_mode("login")}
      >
        登录
      </button>
      <button
        type="button"
        class="LoginScreen__tab"
        class:LoginScreen__tab--active={mode === "register"}
        onclick={() => switch_mode("register")}
      >
        注册
      </button>
    </div>

    <div class="LoginScreen__form">
      <div class="LoginScreen__field">
        <label class="LoginScreen__label" for="login-username">用户名</label>
        <Input
          id="login-username"
          type="text"
          value={username}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            username = e.currentTarget.value;
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              if (mode === "login") void handle_login();
              else void handle_register();
            }
          }}
          placeholder="输入用户名"
          class="w-full"
        />
      </div>

      <div class="LoginScreen__field">
        <label class="LoginScreen__label" for="login-password">密码</label>
        <Input
          id="login-password"
          type="password"
          value={password}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            password = e.currentTarget.value;
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              if (mode === "login") void handle_login();
              else if (mode === "register" && confirm_password) void handle_register();
            }
          }}
          placeholder="输入密码"
          class="w-full"
        />
      </div>

      {#if mode === "register"}
        <div class="LoginScreen__field">
          <label class="LoginScreen__label" for="login-confirm-password">确认密码</label>
          <Input
            id="login-confirm-password"
            type="password"
            value={confirm_password}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
              confirm_password = e.currentTarget.value;
            }}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter") void handle_register();
            }}
            placeholder="再次输入密码"
            class="w-full"
          />
        </div>
      {/if}

      {#if error}
        <p class="LoginScreen__error">{error}</p>
      {/if}

      <Button
        class="w-full"
        onclick={() => {
          if (mode === "login") void handle_login();
          else void handle_register();
        }}
        disabled={is_loading}
      >
        {#if is_loading}
          处理中...
        {:else if mode === "login"}
          登录
        {:else}
          注册
        {/if}
      </Button>
    </div>

    <div class="LoginScreen__divider">
      <span class="LoginScreen__divider-text">或</span>
    </div>

    <Button
      variant="outline"
      class="w-full"
      onclick={on_login_guest}
      disabled={is_loading}
    >
      👤 以游客身份进入
    </Button>

    <p class="LoginScreen__guest-hint">
      游客身份可以正常使用全部功能，之后随时可以绑定账号
    </p>
  </div>
</div>

<style>
  .LoginScreen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--background);
    padding: var(--space-4);
  }

  .LoginScreen__card {
    width: 100%;
    max-width: 24rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-8);
    border-radius: var(--radius-lg);
    background-color: var(--card);
    border: 1px solid var(--border);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  }

  .LoginScreen__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .LoginScreen__logo {
    font-size: 3rem;
    line-height: 1;
  }

  .LoginScreen__title {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--foreground);
    letter-spacing: -0.02em;
  }

  .LoginScreen__subtitle {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .LoginScreen__tabs {
    display: flex;
    border-radius: var(--radius-md);
    background-color: var(--muted);
    padding: 2px;
  }

  .LoginScreen__tab {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-default);
  }

  .LoginScreen__tab:hover {
    color: var(--foreground);
  }

  .LoginScreen__tab--active {
    background-color: var(--background);
    color: var(--foreground);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .LoginScreen__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .LoginScreen__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .LoginScreen__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .LoginScreen__error {
    font-size: var(--text-sm);
    color: var(--destructive);
    font-weight: 500;
    text-align: center;
  }

  .LoginScreen__divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .LoginScreen__divider::before,
  .LoginScreen__divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background-color: var(--border);
  }

  .LoginScreen__divider-text {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .LoginScreen__guest-hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: center;
    line-height: 1.5;
  }
</style>
