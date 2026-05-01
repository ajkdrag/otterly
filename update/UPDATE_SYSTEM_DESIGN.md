# 🔄 LeapGrowNotes 自动更新模块设计规划

> **版本**: v1.0 Draft
> **日期**: 2026-05-01
> **目标**: 实现应用内检查更新、下载更新、安装更新的完整流程

---

## 1. 现状分析

### 1.1 已有基础设施

项目已集成 Tauri Updater 插件：

- **Cargo.toml**: `tauri-plugin-updater = "2"`
- **tauri.conf.json**: 已配置 updater 插件
  ```json
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...",
    "endpoints": [
      "https://codeup.aliyun.com/qijie/LeapGrowNotes/releases/latest/download/latest.json"
    ]
  }
  ```
- **前端依赖**: `@tauri-apps/plugin-updater` 已安装
- **签名**: 已配置公钥，但缺少私钥环境变量 `TAURI_SIGNING_PRIVATE_KEY`
- **构建脚本**: `scripts/release.sh`、`scripts/build_latest_json.mjs`、`scripts/update_release_version.mjs` 已存在

### 1.2 缺失部分

| 缺失项 | 说明 |
|--------|------|
| 前端 UI | 没有检查更新的界面组件 |
| 更新逻辑 | 没有前端调用 updater API 的代码 |
| 自动检查 | 没有定时检查更新的机制 |
| 更新通知 | 没有新版本提醒 |
| 发布流水线 | latest.json 生成和上传未自动化 |
| 签名流程 | 构建时缺少签名私钥配置 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                   前端 (Svelte)                   │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ UpdateButton │  │ UpdateDialog │  │ Reactor  │ │
│  │ (TabBar)     │  │ (下载进度)    │  │(自动检查)│ │
│  └──────┬──────┘  └──────┬───────┘  └────┬─────┘ │
│         │               │                │        │
│         └───────────────┼────────────────┘        │
│                         │                          │
│              ┌──────────▼──────────┐               │
│              │   UpdateService     │               │
│              │  (check/download/   │               │
│              │   install)          │               │
│              └──────────┬──────────┘               │
│                         │                          │
├─────────────────────────┼──────────────────────────┤
│                         │  Tauri Plugin API         │
│              ┌──────────▼──────────┐               │
│              │ @tauri-apps/        │               │
│              │ plugin-updater      │               │
│              └──────────┬──────────┘               │
│                         │                          │
├─────────────────────────┼──────────────────────────┤
│                         │  Rust Backend             │
│              ┌──────────▼──────────┐               │
│              │ tauri-plugin-updater│               │
│              │ (HTTP fetch +       │               │
│              │  signature verify + │               │
│              │  binary replace)    │               │
│              └─────────────────────┘               │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  latest.json        │
              │  (远程更新清单)       │
              │  hosted on GitHub / │
              │  Codeup Releases    │
              └─────────────────────┘
```

### 2.2 更新清单格式 (latest.json)

```json
{
  "version": "0.5.0",
  "notes": "新增电子宠物系统、BPE分析优化、徽章系统完善",
  "pub_date": "2026-05-02T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ...",
      "url": "https://github.com/JieGaoPrinceton/LeapGrowNotes/releases/download/v0.5.0/LeapGrowNotes.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../LeapGrowNotes_x86_64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../LeapGrowNotes_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../LeapGrowNotes_amd64.AppImage.tar.gz"
    }
  }
}
```

---

## 3. 前端模块设计

### 3.1 目录结构

```
src/lib/features/update/
├── index.ts                          # 模块导出
├── ui/
│   ├── update_button.svelte          # TabBar 中的更新按钮（有新版本时显示红点）
│   ├── update_dialog.svelte          # 更新对话框（版本信息、更新日志、下载进度）
│   └── update_settings.svelte        # 设置中的更新选项
├── application/
│   ├── update_service.ts             # 更新业务逻辑
│   └── update_actions.ts             # Action 注册
├── state/
│   └── update_store.svelte.ts        # 更新状态管理
└── types/
    └── update_types.ts               # TypeScript 类型
```

### 3.2 状态管理

```typescript
// update_store.svelte.ts
interface UpdateState {
  // 检查状态
  check_status: "idle" | "checking" | "available" | "up_to_date" | "error";
  last_checked_at: string | null;
  check_error: string | null;

  // 新版本信息
  available_version: string | null;
  release_notes: string | null;
  release_date: string | null;
  download_url: string | null;

  // 下载状态
  download_status: "idle" | "downloading" | "ready" | "installing" | "error";
  download_progress: number;  // 0~100
  download_error: string | null;

  // 设置
  auto_check_enabled: boolean;
  auto_check_interval_hours: number; // 默认 24
  check_on_startup: boolean;         // 默认 true
  skip_version: string | null;       // 跳过某个版本
}
```

### 3.3 UpdateService API

```typescript
class UpdateService {
  /** 检查是否有新版本 */
  async check_for_update(): Promise<UpdateCheckResult>;

  /** 下载更新包 */
  async download_update(on_progress?: (percent: number) => void): Promise<void>;

  /** 安装更新并重启 */
  async install_and_restart(): Promise<void>;

  /** 获取当前版本号 */
  get_current_version(): string;

  /** 跳过此版本 */
  skip_version(version: string): void;
}
```

### 3.4 Action IDs

```typescript
// action_ids.ts 中新增
update_check: "update.check",
update_download: "update.download",
update_install: "update.install",
update_skip: "update.skip_version",
update_open_dialog: "update.open_dialog",
update_close_dialog: "update.close_dialog",
```

---

## 4. UI 设计

### 4.1 更新按钮（TabBar 右侧）

```
正常状态:     (无显示)
有新版本:     🔔 · 红点标记
检查中:       ⏳ 旋转动画
```

### 4.2 更新对话框

```
┌──────────────────────────────────────┐
│  🔄 发现新版本                        │
│                                      │
│  当前版本: v0.4.0                     │
│  最新版本: v0.5.0                     │
│  发布日期: 2026-05-02                 │
│                                      │
│  ── 更新内容 ──                       │
│  • 新增电子宠物系统 🐾                 │
│  • BPE分析优化                        │
│  • 徽章系统完善                        │
│  • 登录体验优化                        │
│                                      │
│  ━━━━━━━━━━━━━━━━━━ 65%             │
│  正在下载... 12.3 MB / 19.0 MB       │
│                                      │
│  [跳过此版本]  [稍后提醒]  [立即更新]  │
└──────────────────────────────────────┘
```

### 4.3 更新设置（Settings → Misc）

```
更新设置
├── 🔄 自动检查更新          [开关]  默认开启
├── ⏰ 检查间隔              [24小时]
├── 🚀 启动时检查            [开关]  默认开启
└── 📋 当前版本              v0.4.0
     [手动检查更新]
```

---

## 5. 自动检查机制

### 5.1 检查时机

| 时机 | 触发条件 |
|------|---------|
| 启动检查 | App 启动后 5 秒（避免阻塞启动） |
| 定时检查 | 每 24 小时检查一次（可配置） |
| 手动检查 | 用户点击"检查更新"按钮 |
| 窗口焦点 | 窗口重新获得焦点时，若距上次检查 >6h |

### 5.2 Reactor 设计

```typescript
// src/lib/reactors/update_check.reactor.svelte.ts
// 负责：
// - 启动时延迟检查
// - 定时轮询
// - 焦点恢复检查
// - 结果通知（toast 提示）
```

---

## 6. 发布流水线

### 6.1 发布流程

```
1. 更新版本号
   pnpm version:bump  (或手动设定)
   ↓
2. 构建 release
   TAURI_SIGNING_PRIVATE_KEY=xxx pnpm tauri build
   ↓
3. 签名验证
   构建过程自动使用私钥签名
   ↓
4. 生成 latest.json
   node scripts/build_latest_json.mjs
   ↓
5. 上传到 GitHub Releases
   gh release create v0.5.0 \
     target/release/bundle/macos/*.tar.gz \
     target/release/bundle/macos/*.tar.gz.sig \
     latest.json
   ↓
6. (可选) 同步到 Codeup
   git push codeup --tags
```

### 6.2 签名配置

```bash
# 生成密钥对（首次）
pnpm tauri signer generate -w ~/.tauri/leapgrownotes.key

# 构建时设置环境变量
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/leapgrownotes.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# 公钥已配置在 tauri.conf.json 中
```

### 6.3 CI/CD（GitHub Actions）

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "LeapGrowNotes ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md for details"
```

---

## 7. 多端点支持

### 7.1 更新源配置

支持多个更新端点，按优先级尝试：

```json
{
  "endpoints": [
    "https://github.com/JieGaoPrinceton/LeapGrowNotes/releases/latest/download/latest.json",
    "https://codeup.aliyun.com/qijie/LeapGrowNotes/releases/latest/download/latest.json"
  ]
}
```

### 7.2 国内加速

- GitHub Releases 可能被墙，Codeup 作为备用
- 未来可添加 OSS/CDN 加速端点
- 应用内可让用户选择更新源

---

## 8. 安全设计

| 安全措施 | 说明 |
|---------|------|
| 签名验证 | 使用 minisign 公私钥对，确保更新包未被篡改 |
| HTTPS | 所有下载链接强制 HTTPS |
| 版本校验 | 只允许升级，不允许降级 |
| 完整性检查 | 下载后校验文件哈希 |
| 回滚机制 | 更新失败时保留旧版本 |

---

## 9. 开发路线图

### Phase 1：基础更新功能（MVP）— 预计 2 天

- [ ] 创建 `src/lib/features/update/` 目录结构
- [ ] 实现 UpdateStore 状态管理
- [ ] 实现 UpdateService（调用 @tauri-apps/plugin-updater）
- [ ] 注册 Action IDs
- [ ] 在设置中添加"手动检查更新"按钮
- [ ] 生成签名密钥对

### Phase 2：UI 与交互 — 预计 2 天

- [ ] 实现 UpdateDialog 对话框（版本对比、更新日志、下载进度）
- [ ] 在 TabBar 添加更新提示（红点/角标）
- [ ] 实现下载进度条
- [ ] 添加"跳过此版本"和"稍后提醒"选项

### Phase 3：自动检查 — 预计 1 天

- [ ] 实现 update_check.reactor（启动检查 + 定时轮询）
- [ ] 在设置中添加自动更新开关和间隔配置
- [ ] Toast 通知新版本

### Phase 4：发布自动化 — 预计 1 天

- [ ] 完善 `scripts/build_latest_json.mjs`
- [ ] 编写 GitHub Actions CI/CD
- [ ] 配置签名私钥到 GitHub Secrets
- [ ] 测试完整的发布→更新流程

---

## 10. 技术注意事项

### 10.1 Tauri Updater API 使用

```typescript
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// 检查更新
const update = await check();
if (update) {
  console.log(`New version: ${update.version}`);
  console.log(`Release notes: ${update.body}`);

  // 下载并安装
  let downloaded = 0;
  let contentLength = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        const percent = (downloaded / contentLength) * 100;
        break;
      case "Finished":
        break;
    }
  });

  // 重启应用
  await relaunch();
}
```

### 10.2 macOS 特殊处理

- DMG 中需要包含签名的 `.tar.gz` 和 `.sig` 文件
- 需要处理 macOS Gatekeeper（ad-hoc 签名可能受限）
- Python.framework 需要一并打包

### 10.3 版本号策略

- 使用语义版本号 `MAJOR.MINOR.PATCH`
- 更新检查基于版本号比较
- `package.json`、`tauri.conf.json`、`Cargo.toml` 三处同步

---

> 📌 **下一步行动**: 从 Phase 1 开始，先实现手动检查更新功能，验证 Tauri Updater 流程通畅。
