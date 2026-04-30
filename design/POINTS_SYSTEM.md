# LeapGrowNotes 积分系统设计方案

> 通过游戏化机制激励知识学习行为

---

## 1. 设计理念

将知识管理中的良好学习习惯转化为可量化的积分，通过**即时反馈**和**成就系统**激励用户持续学习。积分数据存储在本地 SQLite 中，与 vault 绑定。

---

## 2. 积分行为矩阵

### 2.1 日常行为积分

| 行为 | 积分 | 频率限制 | 说明 |
|------|------|----------|------|
| 打开 App | +5 | 每日1次 | 培养每日打开习惯 |
| 打开一个文件 | +2 | 每文件每日1次 | 鼓励阅读 |
| 阅读完成（滚动到底） | +10 | 每文件每日1次 | 深度阅读奖励 |
| 创建新笔记 | +8 | 无限制 | 鼓励创作 |
| 编辑保存笔记 | +3 | 每文件每日1次 | 鼓励整理 |
| 使用全文搜索 | +1 | 每日5次上限 | 鼓励检索知识 |
| 添加 Wiki-link | +5 | 无限制 | 鼓励知识关联 |
| 查看 NLP 分析 | +3 | 每文件每日1次 | 鼓励文本分析 |
| 连续使用 3 天 | +20 | 每周1次 | 连续学习奖励 |
| 连续使用 7 天 | +50 | 每周1次 | 周度坚持奖励 |

### 2.2 知识深度积分

| 行为 | 积分 | 说明 |
|------|------|------|
| 知识库文件达到 100 个 | +100 | 里程碑奖励 |
| 知识库文件达到 500 个 | +300 | 里程碑奖励 |
| NLP 分析累计 50 个文件 | +50 | 深度分析奖励 |
| 总字数达到 10,000 | +80 | 写作里程碑 |
| 总字数达到 100,000 | +200 | 写作大师 |
| 创建 10 个 Wiki-links | +30 | 知识网络奖励 |
| 单日打开 10 个文件 | +15 | 高效阅读日 |
| 单次会话超过 30 分钟 | +10 | 深度学习奖励 |

---

## 3. 等级系统

| 等级 | 称号 | 所需积分 | 图标 |
|------|------|----------|------|
| 1 | 📖 新手读者 | 0 | 书本 |
| 2 | 📝 笔记学徒 | 100 | 铅笔 |
| 3 | 🔍 知识探索者 | 300 | 放大镜 |
| 4 | 📚 勤奋学者 | 600 | 书架 |
| 5 | 🧠 知识构建者 | 1,000 | 大脑 |
| 6 | 🌟 学习达人 | 2,000 | 星星 |
| 7 | 💎 知识专家 | 4,000 | 钻石 |
| 8 | 🏆 知识大师 | 8,000 | 奖杯 |
| 9 | 👑 知识王者 | 15,000 | 王冠 |
| 10 | 🔥 传奇学者 | 30,000 | 火焰 |

---

## 4. 成就徽章

| 徽章 | 名称 | 解锁条件 |
|------|------|----------|
| 🌅 | 早起鸟 | 连续 5 天在早上 8 点前打开 App |
| 🦉 | 夜猫子 | 连续 5 天在晚上 10 点后使用 |
| 📖 | 阅读马拉松 | 单日阅读完成 20 个文件 |
| ✍️ | 创作狂人 | 单日创建 10 个笔记 |
| 🔗 | 知识网络师 | 创建 50 个 Wiki-links |
| 🔥 | 连续 30 天 | 连续 30 天打开 App |
| 📊 | 数据爱好者 | 查看 NLP 分析 100 次 |
| 🗂️ | 整理大师 | 知识库超过 1000 个文件 |
| 📝 | 十万字作者 | 总字数超过 100,000 |
| 🌍 | 多语言学者 | 知识库包含 3 种以上语言 |

---

## 5. 技术实现方案

### 5.1 数据存储

```sql
-- 积分账户
CREATE TABLE IF NOT EXISTS points_account (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_points INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_active_date TEXT,
    created_at TEXT NOT NULL
);

-- 积分流水
CREATE TABLE IF NOT EXISTS points_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL
);

-- 已解锁成就
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    unlocked_at TEXT NOT NULL
);

-- 每日行为计数（防重复）
CREATE TABLE IF NOT EXISTS daily_actions (
    date TEXT NOT NULL,
    action_type TEXT NOT NULL,
    file_path TEXT DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, action_type, file_path)
);
```

### 5.2 Rust 后端模块

```
src-tauri/src/features/points/
├── mod.rs
├── types.rs          # PointsAccount, Transaction, Achievement
├── db.rs             # SQLite CRUD
├── engine.rs         # 积分计算引擎 + 成就检测
└── commands.rs       # Tauri commands
```

**Tauri 命令：**
- `points_award` — 记录行为并计算积分
- `points_get_account` — 获取积分账户（总分、等级、连续天数）
- `points_get_transactions` — 获取积分流水（分页）
- `points_get_achievements` — 获取已解锁成就
- `points_check_achievements` — 检查并解锁新成就

### 5.3 前端集成

**积分显示位置：**
1. **状态栏**：显示当前等级图标 + 总积分
2. **统计覆盖层**：新增 "🏆 Points & Achievements" 区域
3. **即时提示**：获得积分时用 toast 通知（如 "+10 pts 🎉 阅读完成！"）
4. **升级动画**：等级提升时播放 confetti 烟花

**积分触发点：**
- App 启动 → `points_award("app_open")`
- 打开文件 → `points_award("file_open", file_path)`
- 滚动到底 → `points_award("file_read_complete", file_path)`
- 保存笔记 → `points_award("note_save", file_path)`
- 创建笔记 → `points_award("note_create")`
- NLP 分析 → `points_award("nlp_analyze", file_path)`
- 搜索 → `points_award("search_query")`

### 5.4 积分引擎核心逻辑

```
用户行为 → 检查每日限制 → 计算积分 → 更新账户
                                    ↓
                              检查成就条件 → 解锁新成就
                                    ↓
                              检查等级提升 → 触发升级事件
                                    ↓
                              返回结果（积分变化 + 新成就 + 升级）
```

---

## 6. 开发优先级

| 阶段 | 内容 | 工时 |
|------|------|------|
| Phase 1 | SQLite 存储 + 积分引擎 + 基础命令 | 1 周 |
| Phase 2 | 前端集成（状态栏 + toast + 覆盖层） | 1 周 |
| Phase 3 | 成就系统 + 升级动画 | 0.5 周 |
| Phase 4 | 连续天数追踪 + 里程碑 | 0.5 周 |

**总计：3 周**

---

## 7. 用户体验原则

1. **无侵入**：积分提示轻量，不打断工作流
2. **正向激励**：只有加分没有扣分，避免负面情绪
3. **透明规则**：所有积分规则在设置中可查看
4. **数据本地**：积分数据存储在 vault 本地 SQLite，不上传
5. **可选关闭**：用户可在设置中关闭积分系统
