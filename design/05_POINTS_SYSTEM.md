# LeapGrowNotes 积分系统设计方案

> 通过游戏化机制激励知识学习行为
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-01  
> **实现状态**: ✅ 核心已实现（后端引擎 + 前端 UI + 升级动画）

---

## 实现状态总览

| 功能模块 | 状态 | 说明 |
| -------- | ---- | ---- |
| SQLite 积分存储 | ✅ 已实现 | `points_account` + `points_transactions` + `daily_actions` 表 |
| 积分引擎 (Rust) | ✅ 已实现 | `src-tauri/src/features/points/engine.rs` |
| 积分命令 (Tauri) | ✅ 已实现 | 4 个命令：award / get_account / get_transactions / get_achievements |
| 等级系统 | ✅ 已实现 | 30 级体系（知识新生儿→院士），前后端双重定义 |
| 连续天数追踪 | ✅ 已实现 | `streak_days` 自动计算 + 动态计时器 UI |
| 前端积分 badge | ✅ 已实现 | TabBar 右侧显示等级图标+称号+积分+连续天数 |
| 飘动积分动画 | ✅ 已实现 | FloatingPoints 组件，文件打开时 "+2 ✨" |
| 升级 confetti | ✅ 已实现 | canvas-confetti，根据等级调整粒子强度 |
| 积分统计面板 | ✅ 已实现 | Usage Statistics 中显示积分/等级/进度/每session积分 |
| 成就徽章系统 | 🔶 部分实现 | 数据结构已定义，检测逻辑待完善 |

---

## 1. 设计理念

将知识管理中的良好学习习惯转化为可量化的积分，通过**即时反馈**和**成就系统**激励用户持续学习。积分数据存储在本地 SQLite 中，与 vault 绑定。

---

## 2. 积分行为矩阵

### 2.1 日常行为积分 ✅ 已实现

| 行为                 | 积分 | 频率限制      | 说明             | 状态 |
| -------------------- | ---- | ------------- | ---------------- | ---- |
| 打开 App             | +5   | 每日1次       | 培养每日打开习惯 | ✅ `app_open` |
| 打开一个文件         | +2   | 每文件每日1次 | 鼓励阅读         | ✅ `file_open` |
| 阅读完成（滚动到底） | +10  | 每文件每日1次 | 深度阅读奖励     | ✅ `file_read_complete` |
| 创建新笔记           | +8   | 无限制        | 鼓励创作         | ✅ `note_create` |
| 编辑保存笔记         | +3   | 每文件每日1次 | 鼓励整理         | ✅ `note_save` |
| 使用全文搜索         | +1   | 每日5次上限   | 鼓励检索知识     | ✅ `search_query` |
| 添加 Wiki-link       | +5   | 无限制        | 鼓励知识关联     | ✅ `wiki_link_add` |
| 查看 NLP 分析        | +3   | 每文件每日1次 | 鼓励文本分析     | ✅ `nlp_analyze` |
| 连续使用 3 天        | +20  | 每周1次       | 连续学习奖励     | ✅ streak 自动计算 |
| 连续使用 7 天        | +50  | 每周1次       | 周度坚持奖励     | ✅ streak 自动计算 |

### 2.2 知识深度积分 🔶 部分实现

| 行为                   | 积分 | 说明         | 状态 |
| ---------------------- | ---- | ------------ | ---- |
| 知识库文件达到 100 个  | +100 | 里程碑奖励   | ❌ 待实现 |
| 知识库文件达到 500 个  | +300 | 里程碑奖励   | ❌ 待实现 |
| NLP 分析累计 50 个文件 | +50  | 深度分析奖励 | ❌ 待实现 |
| 总字数达到 10,000      | +80  | 写作里程碑   | ❌ 待实现 |
| 总字数达到 100,000     | +200 | 写作大师     | ❌ 待实现 |
| 创建 10 个 Wiki-links  | +30  | 知识网络奖励 | ❌ 待实现 |
| 单日打开 10 个文件     | +15  | 高效阅读日   | ❌ 待实现 |
| 单次会话超过 30 分钟   | +10  | 深度学习奖励 | ❌ 待实现 |

---

## 3. 等级系统 ✅ 已实现

> 等级系统已升级为 30 级成长体系，详见 [GROWTH_LEVELS.md](./GROWTH_LEVELS.md)

**当前实现**（前端 `growth_levels.ts` + Rust 后端 `engine.rs`）：

| 等级 | 称号          | 所需积分  | 图标   |
| ---- | ------------- | --------- | ------ |
| 0    | 知识新生儿    | 0         | 👶     |
| 1    | 好奇宝宝      | 20        | 🍼     |
| 2    | 涂鸦小画家    | 50        | 🎨     |
| ...  | ...           | ...       | ...    |
| 10   | 小学毕业生    | 1,700     | 🎓     |
| ...  | ...           | ...       | ...    |
| 19   | 学士          | 17,000    | 🎓     |
| ...  | ...           | ...       | ...    |
| 29   | 院士          | 500,000   | 👑     |

完整 30 级定义见 [GROWTH_LEVELS.md](./GROWTH_LEVELS.md)

---

## 4. 成就徽章 🔶 部分实现

> 数据结构已定义（`Badge` 类型在 `user_profile.ts` 中），后端 `achievements` 表已创建，检测逻辑待完善。

| 徽章 | 名称       | 解锁条件                       | 状态 |
| ---- | ---------- | ------------------------------ | ---- |
| 🌅   | 早起鸟     | 连续 5 天在早上 8 点前打开 App | ❌ 待实现 |
| 🦉   | 夜猫子     | 连续 5 天在晚上 10 点后使用    | ❌ 待实现 |
| 📖   | 阅读马拉松 | 单日阅读完成 20 个文件         | ❌ 待实现 |
| ✍️   | 创作狂人   | 单日创建 10 个笔记             | ❌ 待实现 |
| 🔗   | 知识网络师 | 创建 50 个 Wiki-links          | ❌ 待实现 |
| 🔥   | 连续 30 天 | 连续 30 天打开 App             | ❌ 待实现 |
| 📊   | 数据爱好者 | 查看 NLP 分析 100 次           | ❌ 待实现 |
| 🗂️   | 整理大师   | 知识库超过 1000 个文件         | ❌ 待实现 |
| 📝   | 十万字作者 | 总字数超过 100,000             | ❌ 待实现 |
| 🌍   | 多语言学者 | 知识库包含 3 种以上语言        | ❌ 待实现 |

---

## 5. 技术实现方案

### 5.1 数据存储 ✅ 已实现

```sql
-- 积分账户 ✅
CREATE TABLE IF NOT EXISTS points_account (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_points INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_active_date TEXT,
    created_at TEXT NOT NULL
);

-- 积分流水 ✅
CREATE TABLE IF NOT EXISTS points_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL
);

-- 已解锁成就 ✅ (表已创建，检测逻辑待完善)
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    unlocked_at TEXT NOT NULL
);

-- 每日行为计数（防重复）✅
CREATE TABLE IF NOT EXISTS daily_actions (
    date TEXT NOT NULL,
    action_type TEXT NOT NULL,
    file_path TEXT DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, action_type, file_path)
);
```

### 5.2 Rust 后端模块 ✅ 已实现

```
src-tauri/src/features/points/
├── mod.rs        ✅
├── types.rs      ✅  # PointsAccount, Transaction, Achievement
├── db.rs         ✅  # SQLite CRUD
├── engine.rs     ✅  # 积分计算引擎 + 等级判定
└── commands.rs   ✅  # Tauri commands
```

**Tauri 命令（4个）✅**：

- ✅ `points_award` — 记录行为并计算积分，返回 `{ level_up, new_level, new_title }`
- ✅ `points_get_account` — 获取积分账户（总分、等级、连续天数、等级称号/图标）
- ✅ `points_get_transactions` — 获取积分流水（分页）
- ✅ `points_get_achievements` — 获取已解锁成就

### 5.3 前端集成 ✅ 已实现

**积分显示位置：**

1. ✅ **TabBar badge**：等级图标 + 称号 + 积分 + 连续天数🔥
2. ✅ **统计仪表盘**：🏆 Knowledge Growth 区域（等级+进度条+连续天数计时器+每session积分）
3. ✅ **飘动积分动画**：获得积分时右下角飘动 "+2 ✨"（FloatingPoints 组件）
4. ✅ **升级动画**：等级提升时播放 confetti 烟花（canvas-confetti）
5. ✅ **用户资料面板**：等级+积分+进度条

**积分触发点 ✅：**

- ✅ App 启动 → `points_award("app_open")`（在 stats_dashboard 加载时触发）
- ✅ 打开文件 → `points_award("file_open", file_path)`（在 tab_bar 的 $effect 中触发）
- ✅ 滚动到底 → `points_award("file_read_complete", file_path)`（在 note_editor 中触发）
- ✅ 保存笔记 → `points_award("note_save", file_path)`
- ✅ 创建笔记 → `points_award("note_create")`
- ✅ NLP 分析 → `points_award("nlp_analyze", file_path)`

### 5.4 积分引擎核心逻辑 ✅ 已实现

```
用户行为 → 检查每日限制 → 计算积分 → 更新账户
                                    ↓
                              检查等级提升 → 触发升级事件（返回 level_up）
                                    ↓
                              前端收到 level_up → confetti 烟花 + 飘动积分
```

---

## 6. 开发优先级（更新版）

| 阶段    | 内容                                | 工时   | 状态 |
| ------- | ----------------------------------- | ------ | ---- |
| Phase 1 | SQLite 存储 + 积分引擎 + 基础命令   | 1 周   | ✅ 已完成 |
| Phase 2 | 前端集成（TabBar badge + 飘动动画 + 统计面板） | 1 周   | ✅ 已完成 |
| Phase 3 | 升级动画（confetti 烟花）           | 0.5 周 | ✅ 已完成 |
| Phase 4 | 连续天数追踪 + 动态计时器           | 0.5 周 | ✅ 已完成 |
| Phase 5 | 成就徽章系统完善                    | 1 周   | ❌ 待开发 |
| Phase 6 | 知识深度里程碑积分                  | 0.5 周 | ❌ 待开发 |

**已完成：3 周 | 剩余：1.5 周**

---

## 7. 用户体验原则

| 原则 | 说明 | 状态 |
| ---- | ---- | ---- |
| 无侵入 | 积分提示轻量，不打断工作流 | ✅ 飘动动画1.6秒自动消失 |
| 正向激励 | 只有加分没有扣分，避免负面情绪 | ✅ 所有行为只加积分 |
| 透明规则 | 所有积分规则在设置中可查看 | 🔶 部分（统计面板可查看积分流水） |
| 数据本地 | 积分数据存储在 vault 本地 SQLite | ✅ 完全本地 |
| 可选关闭 | 用户可在设置中关闭积分系统 | ❌ 待实现 |
