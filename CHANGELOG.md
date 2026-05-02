# Changelog

所有重要变更记录在此文件中。

---

## [2.0.2] - 2026-05-02

### 宠物系统 gender/bazi 集成 + NLP 按钮触发 + NLU tab

- **feat**: 宠物创建支持性别（gender）选择 + 八字命理（bazi）自动计算
  - `engine.rs`: `create_pet()` 调用 `bazi::determine_gender()`/`calculate_bazi()`，支持可选性别覆盖
  - `db.rs`: DDL 添加 `gender` 列 + `ALTER TABLE` 迁移兼容旧库
  - `types.rs`: `Pet`/`PetState`/`CreatePetArgs` 添加 `gender`/`bazi` 字段
  - 前端: 选蛋阶段添加性别三选一 + 详情面板显示八字命理卡片
- **feat**: NLP 面板改为按钮触发分析，已分析文件自动从缓存加载
- **feat**: 新增 NLU tab（内容摘要/概况/大纲/情感/内容理解/关键词/可读性）
- **feat**: 新增 `bazi.rs` 模块（246 行），实现八字计算算法
- **test**: 全部 Rust 测试适配新签名 + gender override 测试
- **chore**: 16 文件变更，+1,330 行 / -56 行

### 代码统计：otterly（基座） vs LeapGrowNotes（本项目）

基座项目：[ajkdrag/otterly](https://github.com/ajkdrag/otterly)

#### 按文件类型对比（源码部分）

| 文件类型 | otterly（基座） | LeapGrowNotes（本项目） | 增量 |
|---------|---------------|----------------------|------|
| TypeScript (.ts) | 322 文件 / 46,826 行 | 344 文件 / 49,038 行 | +22 文件 / +2,212 行 |
| Svelte (.svelte) | 135 文件 / 14,157 行 | 149 文件 / 21,650 行 | +14 文件 / +7,493 行 |
| Rust (.rs) 源码 | 33 文件 / 6,748 行 | 49 文件 / 8,748 行 | +16 文件 / +2,000 行 |
| Rust (.rs) 测试 | — | 6 文件 / 1,737 行 | +1,737 行 |
| CSS (.css) | 4 文件 / 2,193 行 | 4 文件 / 2,193 行 | 相同 |
| JS/MJS | 7 文件 / 651 行 | 8 文件 / 684 行 | +33 行 |
| Markdown (.md) | 6 文件 / 1,198 行 | 17 文件 / 6,428 行 | +5,230 行 |
| Shell (.sh) | 2 文件 / 83 行 | 2 文件 / 83 行 | 相同 |
| TOML | 1 文件 / 48 行 | 1 文件 / 50 行 | +2 行 |
| HTML | 1 文件 / 47 行 | 1 文件 / 47 行 | 相同 |

#### 汇总对比

| 指标 | otterly（基座） | LeapGrowNotes | 变化 |
|------|---------------|---------------|------|
| 纯源码（TS+Svelte+Rust+CSS+JS） | ~70,575 行 | ~84,050 行 | **+13,475 行 (+19%)** |
| 测试代码（TS+Rust） | 含在总量中 | 112 文件 / 23,809 行 | 大幅新增 |
| 设计文档 | ~1,198 行 | ~6,428 行 | +5,230 行 |

#### 结论

LeapGrowNotes 在 otterly 基座上**新增约 13,475 行源码（+19%）**，增量主要集中在：
- Svelte 组件（+7,493 行）：宠物系统、NLP 面板、统计仪表盘等新 UI
- Rust 后端（+3,737 行）：积分引擎、宠物引擎、用户系统、NLP 桥接
- TypeScript（+2,212 行）：Store/Service/Reactor 层扩展

同时大幅增加了设计文档（+5,230 行，20 份设计文档）和测试代码（112 文件 / 23,809 行）。

---

## [2.0.1] - 2026-05-01

### 文档整理与 NER ML 修复

- **fix**: 修复 NER ML 模块不可用问题（安装 modelscope + addict + datasets + torch 依赖）
- **chore**: 统一 `design/` 目录所有文件名为大写格式
- **chore**: 将散落在各目录的 .md 设计文档统一移入 `design/` 目录并按编号规则命名
  - `update/UPDATE_SYSTEM_DESIGN.md` → `design/12_UPDATE_SYSTEM_DESIGN.md`
  - `nlp_kernal/KCS_BluePrint.md` → `design/13_KCS_BLUEPRINT.md`
  - `nlp_kernal/NLP_FUNCTION_LIST.md` → `design/14_NLP_FUNCTION_LIST.md`
  - `nlp_kernal/deep_ner_blueprint.md` → `design/15_DEEP_NER_BLUEPRINT.md`
  - `nlp_kernal/ner/design_ner.md` → `design/16_NER_DESIGN.md`
  - `nlp_kernal/ner/intent.md` → `design/17_NER_INTENT.md`
  - `nlp_kernal/ner/knowledge_base.md` → `design/18_NER_KNOWLEDGE_BASE.md`
  - `nlp_kernal/thread_builder/thread.md` → `design/19_THREAD_BUILDER.md`
  - `nlp_kernal/thread_builder/RULES.md` → `design/20_THREAD_RULES.md`
- **docs**: 重写 README.md 反映 v2.0 完整功能状态（知识管理/游戏化/宠物/NLP/用户系统）
- **docs**: 更新 CHANGELOG.md 反映最新版本变更

---

## [2.0.0] - 2026-05-01

### 电子宠物系统 + NLP 增强

- **feat**: 完整电子宠物系统（选蛋/孵化/喂食/互动/进化/积分联动）
  - 5种宠物（墨灵/卷卷/码仔/思思/芽芽）+ 4阶段进化 + 50级等级
  - 喂食系统（5种知识食物）+ 互动系统（摸头/玩耍/对话）+ 心情系统
  - 宠物悬浮组件 + 详情面板 + 选蛋 UI
  - pet_sync reactor 积分联动（积分 → 宠物经验值）
  - 10个 Tauri 命令 + 33个单元测试
- **feat**: NLP 分析面板增强（词频/关键词/词汇丰富度/聚合统计）
- **feat**: BPE Token 分析（Token 可视化 + 压缩比 + 统计面板）
- **feat**: Python NLP 桥接（jieba 中文分词 + 情感分析 + 规则NER + ML NER + 文本分类）
- **feat**: NLP 模块面板（Rust/Python 模块状态 + 调用追踪）
- **feat**: Profile 成就徽章展示优化（已点亮 + 未来 3 个一排）
- **feat**: 点击任意徽章图标打开 `docs/badges.md` 说明文档
- **feat**: 登录页保留最近 5 个成功登录账号，快速选择
- **docs**: 20 份设计文档（蓝图/架构/积分/等级/徽章/宠物/NLP/LLM 等）

---

## [1.0.0] - 2026-05-01

### 用户系统 + 积分 + 统计

- **feat**: 多用户登录/注册/游客系统
- **feat**: 积分系统（SQLite + Rust engine + 前端集成）
- **feat**: 成长等级体系（30级，知识新生儿→院士）
- **feat**: 统计仪表盘（会话跟踪 + SVG 图表 + NLP 数据）
- **feat**: 升级动画（confetti 烟花 + 飘动积分）
- **feat**: 自动更新模块（版本检查 + 更新提示）
- **feat**: Git Autocommit（reactor 模式监听文件变更自动提交）
- **chore**: 新增 `nlp_bpe_analyze` Tauri 命令
- **chore**: tauri.conf.json 添加 Python.framework 打包配置

---

## [0.3.1] - 2026-04-30

### 基础版本

- 初始功能：Markdown 编辑器、文件管理、NLP 分析
- 积分系统、成长等级
- Git 版本控制集成
- 多用户支持（登录/注册/游客）
- 主题切换
- 全文搜索（FTS5）
- Python NLP 桥接（jieba/sentiment/NER/分类）

---

## [0.2.0] - 2026-04-28

- 用户系统：多用户切换、密码管理
- 积分系统：行为积分 + 等级体系
- 统计仪表盘：会话统计、图表可视化

---

## [0.1.0] - 2026-04-25

- 项目初始化
- 基于 Otterly 的 Tauri 2 + SvelteKit 框架
- Markdown 编辑器核心功能
- 本地文件存储
